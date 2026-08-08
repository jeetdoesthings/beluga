//! beluga-dsp — DSP primitives: gain smoothing, fractional delay, gain management.
//! Ports of Python `gain_smoothing.py`, `delay_alignment.py`, `gain_management.py`.

pub mod delay_alignment;
pub mod gain_management;
pub mod gain_smoothing;

pub use delay_alignment::{compute_delays, FractionalDelay};
pub use gain_management::{apply_headroom, process_output, soft_limit};
pub use gain_smoothing::{apply_smoothed_gain_per_sample, smooth_gains, Interp, SmoothingConfig};

/// Speed of sound in m/s (spec §35). Used by delay alignment.
pub const SPEED_OF_SOUND: f64 = 343.0;
