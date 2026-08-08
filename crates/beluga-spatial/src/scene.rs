//! beluga-spatial::scene — Beluga's universal spatial scene representation (spec §29).
//! Port of `research/python/beluga/scene.py`.
//!
//! A SpatialScene is the hardware-independent internal representation that the
//! renderer consumes. Any input (mono WAV, stereo, future object-audio) is
//! converted into a SpatialScene before rendering.

use std::sync::Arc;

/// A mono PCM audio buffer (32-bit float samples).
#[derive(Clone, Debug)]
pub struct AudioBuffer {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
}

impl AudioBuffer {
    pub fn new(samples: Vec<f32>, sample_rate: u32) -> Self {
        AudioBuffer {
            samples,
            sample_rate,
        }
    }

    pub fn duration(&self) -> f64 {
        if self.sample_rate == 0 {
            0.0
        } else {
            self.samples.len() as f64 / self.sample_rate as f64
        }
    }

    /// Flatten multi-channel to mono by averaging.
    pub fn from_multichannel(interleaved: &[f32], n_channels: u32, sample_rate: u32) -> Self {
        let samples: Vec<f32> = if n_channels <= 1 {
            interleaved.to_vec()
        } else {
            interleaved
                .chunks(n_channels as usize)
                .map(|frame| frame.iter().sum::<f32>() / n_channels as f32)
                .collect()
        };
        AudioBuffer {
            samples,
            sample_rate,
        }
    }
}

/// Type alias for a trajectory function: t (seconds) -> (azimuth, elevation, distance).
pub type TrajectoryFn = Arc<dyn Fn(f64) -> (f64, f64, f64) + Send + Sync>;

/// A single virtual spatial audio source (spec §29).
///
/// For static objects, azimuth/elevation/distance are used directly.
/// If `trajectory` is set, it overrides the static fields for a given time t.
#[derive(Clone)]
pub struct SpatialObject {
    pub id: String,
    pub audio: AudioBuffer,
    pub azimuth: f64,                     // degrees, listener-relative
    pub elevation: f64,                   // degrees
    pub distance: f64,                    // meters
    pub width: f64,                       // 0..1 spatial width (future)
    pub spread: f64,                      // 0..1 spread (future)
    pub gain: f32,                        // linear gain
    pub trajectory: Option<TrajectoryFn>, // callable(t_seconds) -> (az, el, dist)
}

impl SpatialObject {
    pub fn new(id: &str, audio: AudioBuffer) -> Self {
        SpatialObject {
            id: id.to_string(),
            audio,
            azimuth: 0.0,
            elevation: 0.0,
            distance: 2.0,
            width: 0.0,
            spread: 0.0,
            gain: 1.0,
            trajectory: None,
        }
    }

    /// Return (azimuth, elevation, distance) at time t (seconds).
    pub fn position_at(&self, t: f64) -> (f64, f64, f64) {
        if let Some(traj) = &self.trajectory {
            traj(t)
        } else {
            (self.azimuth, self.elevation, self.distance)
        }
    }
}

/// A Beluga Spatial Scene (spec §29): objects + beds + metadata.
///
/// For 0.1/0.3 we only populate `objects`. `beds` (channel-based beds) arrive later.
#[derive(Clone, Default)]
pub struct SpatialScene {
    pub objects: Vec<SpatialObject>,
    pub beds: Vec<Arc<dyn std::any::Any + Send + Sync>>,
    pub metadata: Vec<(String, String)>,
}

impl std::fmt::Debug for SpatialScene {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SpatialScene")
            .field("objects", &self.objects.len())
            .field("beds", &self.beds.len())
            .field("metadata", &self.metadata.len())
            .finish()
    }
}

impl SpatialScene {
    pub fn new() -> Self {
        SpatialScene {
            objects: Vec::new(),
            beds: Vec::new(),
            metadata: Vec::new(),
        }
    }

    pub fn add_object(&mut self, obj: SpatialObject) {
        self.objects.push(obj);
    }
}
