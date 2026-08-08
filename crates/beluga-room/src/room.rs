//! beluga-room::room — room geometry (rectangular + mesh bounds).
//! Port of Python `beluga/speaker.py` Room model, extended for mesh bounds.

use serde::{Deserialize, Serialize};

/// An axis-aligned bounding box in room space.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BoundingBox3 {
    pub min: Vector3Like,
    pub max: Vector3Like,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Vector3Like {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vector3Like {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Vector3Like { x, y, z }
    }
}

impl Default for BoundingBox3 {
    fn default() -> Self {
        BoundingBox3 {
            min: Vector3Like::new(0.0, 0.0, 0.0),
            max: Vector3Like::new(0.0, 0.0, 0.0),
        }
    }
}

impl BoundingBox3 {
    pub fn new(min: Vector3Like, max: Vector3Like) -> Self {
        BoundingBox3 { min, max }
    }

    pub fn dims(&self) -> Vector3Like {
        Vector3Like::new(
            self.max.x - self.min.x,
            self.max.y - self.min.y,
            self.max.z - self.min.z,
        )
    }
}

/// Room geometry: rectangular dimensions plus optional mesh bounds (for GLB rooms).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RoomGeometry {
    /// Length along Y (meters).
    pub length: f64,
    /// Width along X (meters).
    pub width: f64,
    /// Height along Z (meters).
    pub height: f64,
    /// Optional bounding box for imported GLB rooms.
    pub model_bounds: Option<BoundingBox3>,
    /// Optional user-provided name.
    pub name: String,
}

impl RoomGeometry {
    pub fn new(name: &str, length: f64, width: f64, height: f64) -> Self {
        RoomGeometry {
            name: name.to_string(),
            length,
            width,
            height,
            model_bounds: None,
        }
    }

    pub fn with_bounds(
        name: &str,
        length: f64,
        width: f64,
        height: f64,
        bounds: BoundingBox3,
    ) -> Self {
        RoomGeometry {
            name: name.to_string(),
            length,
            width,
            height,
            model_bounds: Some(bounds),
        }
    }

    /// Returns the effective bounding box: use model_bounds if present,
    /// otherwise derive from rectangular dimensions.
    pub fn bounds(&self) -> BoundingBox3 {
        if let Some(b) = &self.model_bounds {
            return b.clone();
        }
        // Rectangular room centered at origin: X=[-width/2, width/2],
        // Y=[-length/2, length/2], Z=[0, height]
        BoundingBox3::new(
            Vector3Like::new(-self.width / 2.0, -self.length / 2.0, 0.0),
            Vector3Like::new(self.width / 2.0, self.length / 2.0, self.height),
        )
    }

    /// Volume in cubic meters.
    pub fn volume(&self) -> f64 {
        self.length * self.width * self.height
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rectangular_room_bounds() {
        let room = RoomGeometry::new("Test", 6.0, 5.0, 2.8);
        let b = room.bounds();
        assert!((b.min.x - (-2.5)).abs() < 1e-9);
        assert!((b.max.x - 2.5).abs() < 1e-9);
        assert!((b.min.y - (-3.0)).abs() < 1e-9);
        assert!((b.max.y - 3.0).abs() < 1e-9);
        assert!((b.min.z - 0.0).abs() < 1e-9);
        assert!((b.max.z - 2.8).abs() < 1e-9);
    }

    #[test]
    fn volume() {
        let room = RoomGeometry::new("Test", 6.0, 5.0, 2.8);
        assert!((room.volume() - 84.0).abs() < 1e-9);
    }

    #[test]
    fn model_bounds_override() {
        let bounds = BoundingBox3::new(
            Vector3Like::new(-1.0, -1.0, 0.0),
            Vector3Like::new(1.0, 1.0, 2.0),
        );
        let room = RoomGeometry::with_bounds("GLB", 10.0, 10.0, 10.0, bounds);
        let b = room.bounds();
        assert!((b.min.x - (-1.0)).abs() < 1e-9);
        assert!((b.max.z - 2.0).abs() < 1e-9);
    }

    #[test]
    fn json_roundtrip() {
        let room = RoomGeometry::new("Living", 6.0, 5.0, 2.8);
        let json = serde_json::to_string(&room).unwrap();
        let restored: RoomGeometry = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.name, "Living");
        assert!((restored.length - 6.0).abs() < 1e-9);
    }
}
