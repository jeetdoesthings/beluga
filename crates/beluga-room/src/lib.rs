//! beluga-room — room geometry representation.
//!
//! Lightweight room model supporting rectangular rooms and loaded mesh bounds.
//! For 0.3 this is primarily for room dimension display and speaker clamping.

pub mod room;

pub use room::{BoundingBox3, RoomGeometry};
