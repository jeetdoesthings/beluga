//! beluga-audio-io — audio device enumeration, channel mapping, and real-time engine.
//!
//! Uses CPAL for cross-platform audio I/O. On macOS this uses CoreAudio natively.
//! The renderer is NOT coupled to CoreAudio directly — CPAL provides the abstraction.

pub mod device;
pub mod engine;
pub mod mapping;

pub use device::{AudioDevice, DeviceEnumerator};
pub use engine::{AudioEngine, SourcePosition, Telemetry};
pub use mapping::ChannelMapping;
