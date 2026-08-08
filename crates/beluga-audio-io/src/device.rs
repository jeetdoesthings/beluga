//! beluga-audio-io::device — audio device enumeration via CPAL.
//!
//! Spec §42: enumerate output devices, query capabilities, select default.

use cpal::traits::DeviceTrait;
use cpal::traits::HostTrait;
use serde::{Deserialize, Serialize};

/// A physical audio output device.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub max_channels: u32,
    pub default_sample_rate: f64,
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
        })
    }

    /// Find a device by id (name).
    pub fn find(id: &str) -> Result<AudioDevice, String> {
        Self::enumerate_outputs()
            .into_iter()
            .find(|d| d.id == id)
            .ok_or_else(|| format!("Device '{}' not found", id))
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
