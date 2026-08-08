//! Beluga core — 3D vector math and data models for speakers, listeners, projects.
//! Port of Python `beluga/geometry.py` and `beluga/speaker.py`.
//! Conventions (spec §8, §11, §15, §18):
//!   Right-handed: +X right, +Y forward, +Z up. 1 unit = 1 meter.

pub mod geometry;
pub mod speaker;

pub use geometry::{azimuth_to_unit_vector, to_listener_relative, Orientation, Spherical, Vector3};
pub use speaker::{BelugaProject, Listener, Room, Speaker, SPEAKER_CATEGORIES};
