//! beluga-audio-io::device — audio device enumeration via CPAL.
//!
//! Spec §42: enumerate output devices, query capabilities, select default.

use cpal::traits::DeviceTrait;
use cpal::traits::HostTrait;
use serde::{Deserialize, Serialize};

use crate::engine::AudioEngine;

/// A physical audio output device.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub max_channels: u32,
    pub default_sample_rate: f64,
    pub n_channels: u32, // actual channel count from default_output_config
}

/// What Beluga can do with a given channel count.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeviceCapabilities {
    pub n_channels: u32,
    pub can_stereo: bool,
    pub can_surround: bool,
    pub can_spatial: bool,
    pub recommended_layout: &'static str,
}

impl DeviceCapabilities {
    pub fn from_channels(n_channels: u32) -> Self {
        match n_channels {
            0 => DeviceCapabilities {
                n_channels,
                can_stereo: false,
                can_surround: false,
                can_spatial: false,
                recommended_layout: "None",
            },
            1 => DeviceCapabilities {
                n_channels,
                can_stereo: false,
                can_surround: false,
                can_spatial: false,
                recommended_layout: "Mono",
            },
            2 => DeviceCapabilities {
                n_channels,
                can_stereo: true,
                can_surround: false,
                can_spatial: true,
                recommended_layout: "Stereo 2.0",
            },
            4 => DeviceCapabilities {
                n_channels,
                can_stereo: true,
                can_surround: true,
                can_spatial: true,
                recommended_layout: "Surround 4.0",
            },
            6 => DeviceCapabilities {
                n_channels,
                can_stereo: true,
                can_surround: true,
                can_spatial: true,
                recommended_layout: "Surround 5.1",
            },
            8 => DeviceCapabilities {
                n_channels,
                can_stereo: true,
                can_surround: true,
                can_spatial: true,
                recommended_layout: "Surround 7.1",
            },
            _ if n_channels >= 8 => DeviceCapabilities {
                n_channels,
                can_stereo: true,
                can_surround: true,
                can_spatial: true,
                recommended_layout: "Spatial",
            },
            _ => DeviceCapabilities {
                n_channels,
                can_stereo: true,
                can_surround: false,
                can_spatial: false,
                recommended_layout: "Stereo 2.0",
            },
        }
    }
}

/// Device enumeration helper.
pub struct DeviceEnumerator;

impl DeviceEnumerator {
    /// Enumerate all available output devices.
    ///
    /// Always includes a "Default Output" entry first, which maps to the
    /// system default device. This ensures devices that CPAL fails to
    /// enumerate individually (common with Bluetooth / USB-C headphones
    /// on macOS) are still selectable via the system default.
    pub fn enumerate_outputs() -> Vec<AudioDevice> {
        let host = cpal::default_host();

        let default_device = host.default_output_device();
        let default_name = default_device.as_ref().and_then(|d| d.name().ok());

        let mut devices = Vec::new();

        // Always include "Default Output" as the first entry.
        // `open_device` already handles id == "default" by falling back
        // to host.default_output_device().
        devices.push(AudioDevice {
            id: "default".to_string(),
            name: "Default Output".to_string(),
            is_default: true,
            max_channels: 2,
            default_sample_rate: 48000.0,
            n_channels: 2,
        });

        if let Ok(devices_iter) = host.output_devices() {
            for dev in devices_iter {
                // Robustly retrieve the device name — fall back to a
                // numbered placeholder if name() errors so the device
                // is never silently dropped.
                let name = dev
                    .name()
                    .unwrap_or_else(|_| format!("Device #{}", devices.len()));

                let is_default = default_name.as_ref().map(|d| d == &name).unwrap_or(false);

                // Cache the default_output_config to avoid calling it twice.
                let (max_channels, default_sample_rate) =
                    dev.default_output_config().map_or((2, 48000.0), |c| {
                        (c.channels() as u32, c.sample_rate().0 as f64)
                    });

                devices.push(AudioDevice {
                    id: name.clone(),
                    name,
                    is_default,
                    max_channels,
                    default_sample_rate,
                    n_channels: max_channels, // actual channels = max from default config
                });
            }
        }

        devices
    }

    /// Get the default output device.
    pub fn default_output() -> Option<AudioDevice> {
        let host = cpal::default_host();
        let dev = host.default_output_device()?;
        let name = dev.name().ok()?;
        let config = dev.default_output_config().ok()?;

        Some(AudioDevice {
            id: name.clone(),
            name,
            is_default: true,
            max_channels: config.channels() as u32,
            default_sample_rate: config.sample_rate().0 as f64,
            n_channels: config.channels() as u32,
        })
    }

    /// Find a device by id (name).
    pub fn find(id: &str) -> Result<AudioDevice, String> {
        Self::enumerate_outputs()
            .into_iter()
            .find(|d| d.id == id)
            .ok_or_else(|| format!("Device '{}' not found", id))
    }

    /// Play a 440 Hz test tone on a single output channel for ~1.5 seconds.
    /// All other channels remain silent. Blocking call.
    pub fn play_channel_test_tone(device_id: &str, channel: u32) -> Result<(), String> {
        use cpal::traits::StreamTrait;

        let device = AudioEngine::open_device(device_id)?;
        let config = device
            .default_output_config()
            .map_err(|e| format!("Device config error: {}", e))?;
        let sample_rate = config.sample_rate().0;
        let n_channels = config.channels() as usize;
        let n_frames = (sample_rate as usize * 3 / 2).max(1); // 1.5 seconds

        let ch = channel as usize;
        if ch >= n_channels {
            return Err(format!(
                "Channel {} not available on device with {} channels",
                ch, n_channels
            ));
        }

        let mut interleaved = vec![0.0f32; n_frames * n_channels];
        let freq = 440.0f64;
        let amp = 0.3f32;
        for i in 0..n_frames {
            let t = (2.0 * std::f64::consts::PI * freq * i as f64 / sample_rate as f64).sin()
                as f32
                * amp;
            interleaved[i * n_channels + ch] = t;
        }

        let stream_config = cpal::StreamConfig {
            channels: config.channels(),
            sample_rate: config.sample_rate(),
            buffer_size: cpal::BufferSize::Default,
        };

        let source = std::sync::Arc::new(interleaved);
        let playhead = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let total = source.len();

        let src = std::sync::Arc::clone(&source);
        let ph = std::sync::Arc::clone(&playhead);
        let err_fn = |err: cpal::StreamError| {
            eprintln!("[beluga-audio-io] test tone stream error: {}", err);
        };

        let stream = device
            .build_output_stream::<f32, _, _>(
                &stream_config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    let idx = ph.load(std::sync::atomic::Ordering::Relaxed);
                    if idx >= total {
                        for s in data.iter_mut() {
                            *s = 0.0;
                        }
                        return;
                    }
                    let end = (idx + data.len()).min(total);
                    data[..end - idx].copy_from_slice(&src[idx..end]);
                    ph.store(end, std::sync::atomic::Ordering::Relaxed);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build test tone stream: {}", e))?;

        stream
            .play()
            .map_err(|e| format!("Failed to play test tone: {}", e))?;

        eprintln!(
            "[beluga-audio-io] Playing channel {} test tone on {} ({}ch, {}Hz)",
            ch,
            device.name().unwrap_or_else(|_| "unknown".into()),
            n_channels,
            sample_rate
        );

        std::thread::sleep(std::time::Duration::from_millis(1700));
        drop(stream);
        Ok(())
    }

    /// Play a swept sine (20Hz-20kHz, 5 seconds) on a single output channel.
    /// Used for measurement and calibration. All other channels remain silent.
    /// Blocking call.
    pub fn play_swept_sine(device_id: &str, channel: u32) -> Result<(), String> {
        use cpal::traits::StreamTrait;

        let device = AudioEngine::open_device(device_id)?;
        let config = device
            .default_output_config()
            .map_err(|e| format!("Device config error: {}", e))?;
        let sample_rate = config.sample_rate().0;
        let n_channels = config.channels() as usize;
        let duration_sec = 5.0;
        let n_frames = (sample_rate as f64 * duration_sec).ceil() as usize;

        let ch = channel as usize;
        if ch >= n_channels {
            return Err(format!(
                "Channel {} not available on device with {} channels",
                ch, n_channels
            ));
        }

        let mut interleaved = vec![0.0f32; n_frames * n_channels];
        let f_start = 20.0f64;
        let f_end = 20000.0f64;
        let amp = 0.5f32;
        // Exponential frequency sweep
        let k = (f_end / f_start).ln();
        for i in 0..n_frames {
            let t = i as f64 / sample_rate as f64;
            let freq = f_start * (k * t / duration_sec).exp();
            let phase = 2.0 * std::f64::consts::PI * freq * t;
            let sample = phase.sin() as f32 * amp;
            interleaved[i * n_channels + ch] = sample;
        }

        let stream_config = cpal::StreamConfig {
            channels: config.channels(),
            sample_rate: config.sample_rate(),
            buffer_size: cpal::BufferSize::Default,
        };

        let source = std::sync::Arc::new(interleaved);
        let playhead = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let total = source.len();

        let src = std::sync::Arc::clone(&source);
        let ph = std::sync::Arc::clone(&playhead);
        let err_fn = |err: cpal::StreamError| {
            eprintln!("[beluga-audio-io] swept sine stream error: {}", err);
        };

        let stream = device
            .build_output_stream::<f32, _, _>(
                &stream_config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    let idx = ph.load(std::sync::atomic::Ordering::Relaxed);
                    if idx >= total {
                        for s in data.iter_mut() {
                            *s = 0.0;
                        }
                        return;
                    }
                    let end = (idx + data.len()).min(total);
                    data[..end - idx].copy_from_slice(&src[idx..end]);
                    ph.store(end, std::sync::atomic::Ordering::Relaxed);
                },
                err_fn,
                None,
            )
            .map_err(|e| format!("Failed to build swept sine stream: {}", e))?;

        stream
            .play()
            .map_err(|e| format!("Failed to play swept sine: {}", e))?;

        eprintln!(
            "[beluga-audio-io] Playing swept sine on channel {} ({}, {}ch, {}Hz)",
            ch,
            device.name().unwrap_or_else(|_| "unknown".into()),
            n_channels,
            sample_rate
        );

        std::thread::sleep(std::time::Duration::from_millis(
            (duration_sec * 1000.0 + 200.0) as u64,
        ));
        drop(stream);
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_output_returns_something_or_silently_passes() {
        // In CI without audio hardware, this may return None.
        // We just verify it doesn't panic.
        let _ = DeviceEnumerator::default_output();
    }

    #[test]
    fn find_missing_device() {
        let result = DeviceEnumerator::find("nonexistent-device-12345");
        assert!(result.is_err());
    }
}
