//! beluga-core::geometry — 3D vector math and listener-relative coordinate conversion.
//! Port of `research/python/beluga/geometry.py`.
//!
//! Conventions (spec §8, §18):
//!   - Right-handed: +X right, +Y forward, +Z up.
//!   - World units: 1 unit = 1 meter.
//!   - Listener forward: +Y in local frame before rotation.
//!   - Azimuth: degrees clockwise from listener-forward, range (-180, 180].
//!   - Elevation: degrees above horizontal plane, range [-90, 90].

use serde::{Deserialize, Serialize};

/// 3D vector in meters within Beluga's coordinate frame.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Vector3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vector3 {
    pub const ZERO: Vector3 = Vector3 {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Vector3 { x, y, z }
    }

    pub fn add(&self, other: &Vector3) -> Vector3 {
        Vector3 {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }

    pub fn sub(&self, other: &Vector3) -> Vector3 {
        Vector3 {
            x: self.x - other.x,
            y: self.y - other.y,
            z: self.z - other.z,
        }
    }

    pub fn scale(&self, s: f64) -> Vector3 {
        Vector3 {
            x: self.x * s,
            y: self.y * s,
            z: self.z * s,
        }
    }

    pub fn dot(&self, other: &Vector3) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    pub fn cross(&self, other: &Vector3) -> Vector3 {
        Vector3 {
            x: self.y * other.z - self.z * other.y,
            y: self.z * other.x - self.x * other.z,
            z: self.x * other.y - self.y * other.x,
        }
    }

    pub fn norm(&self) -> f64 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    pub fn normalize(&self) -> Vector3 {
        let n = self.norm();
        if n < 1e-12 {
            Vector3::ZERO
        } else {
            self.scale(1.0 / n)
        }
    }
}

/// Listener/speaker orientation in degrees (yaw, pitch, roll).
///
/// yaw   = rotation around Z (vertical), clockwise from +Y forward
/// pitch = rotation around X (right), positive = looking up
/// roll  = rotation around Y (forward), positive = tilting right
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Orientation {
    pub yaw: f64,
    pub pitch: f64,
    pub roll: f64,
}

impl Default for Orientation {
    fn default() -> Self {
        Orientation {
            yaw: 0.0,
            pitch: 0.0,
            roll: 0.0,
        }
    }
}

/// Listener-relative spherical coordinates for a speaker or source.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Spherical {
    pub distance: f64,  // meters
    pub azimuth: f64,   // degrees, clockwise from forward, (-180, 180]
    pub elevation: f64, // degrees above horizontal, [-90, 90]
}

// ---------------------------------------------------------------------------
// Rotation helpers (private)
// ---------------------------------------------------------------------------

/// Rotate a vector around the Z axis (yaw). Clockwise from +Z down.
fn rot_z(vec: Vector3, angle_deg: f64) -> Vector3 {
    let a = angle_deg.to_radians();
    let cos_a = a.cos();
    let sin_a = a.sin();
    // x' = x*cos + y*sin
    // y' = -x*sin + y*cos
    Vector3 {
        x: vec.x * cos_a + vec.y * sin_a,
        y: -vec.x * sin_a + vec.y * cos_a,
        z: vec.z,
    }
}

/// Rotate a vector around the X axis (pitch).
fn rot_x(vec: Vector3, angle_deg: f64) -> Vector3 {
    let a = angle_deg.to_radians();
    let cos_a = a.cos();
    let sin_a = a.sin();
    // y' = y*cos - z*sin
    // z' = y*sin + z*cos
    Vector3 {
        x: vec.x,
        y: vec.y * cos_a - vec.z * sin_a,
        z: vec.y * sin_a + vec.z * cos_a,
    }
}

/// Rotate a vector around the Y axis (roll).
fn rot_y(vec: Vector3, angle_deg: f64) -> Vector3 {
    let a = angle_deg.to_radians();
    let cos_a = a.cos();
    let sin_a = a.sin();
    // x' = x*cos + z*sin
    // z' = -x*sin + z*cos
    Vector3 {
        x: vec.x * cos_a + vec.z * sin_a,
        y: vec.y,
        z: -vec.x * sin_a + vec.z * cos_a,
    }
}

/// Apply inverse of orientation rotation to vec (world -> local frame).
///
/// We rotate by the negated yaw/pitch/roll in reverse order so the listener's
/// forward direction maps to +Y.
fn apply_inverse_orientation(vec: Vector3, orient: Orientation) -> Vector3 {
    let v = rot_y(vec, -orient.roll);
    let v = rot_x(v, -orient.pitch);
    rot_z(v, -orient.yaw)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Convert a room-space position into listener-relative spherical coordinates.
///
/// Returns (Spherical, local_frame_vector).
///
/// Steps (spec §18):
///   1. rel = position - listener_position
///   2. Rotate rel by inverse listener orientation -> local frame vector.
///   3. distance = |v|
///   4. azimuth = atan2(v.x, v.y) in degrees, clockwise from forward (+Y)
///   5. elevation = atan2(v.z, sqrt(v.x^2 + v.y^2)) in degrees
pub fn to_listener_relative(
    position: Vector3,
    listener_position: Vector3,
    listener_orientation: Orientation,
) -> (Spherical, Vector3) {
    let rel = position.sub(&listener_position);
    let v = apply_inverse_orientation(rel, listener_orientation);

    let distance = v.norm();
    let xy = (v.x * v.x + v.y * v.y).sqrt();
    let azimuth = (v.x).atan2(v.y).to_degrees(); // clockwise from +Y

    let elevation = if xy > 1e-12 {
        (v.z).atan2(xy).to_degrees()
    } else if v.z > 0.0 {
        90.0
    } else {
        -90.0
    };

    // Normalize azimuth to (-180, 180]
    let azimuth = if azimuth > 180.0 {
        azimuth - 360.0
    } else if azimuth <= -180.0 {
        azimuth + 360.0
    } else {
        azimuth
    };

    (
        Spherical {
            distance,
            azimuth,
            elevation,
        },
        v,
    )
}

/// Convert an azimuth (degrees, clockwise from +Y forward) to a unit direction
/// vector on the horizontal plane (z=0).
pub fn azimuth_to_unit_vector(azimuth_deg: f64) -> Vector3 {
    let a = azimuth_deg.to_radians();
    Vector3 {
        x: a.sin(),
        y: a.cos(),
        z: 0.0,
    }
    .normalize()
}

// ---------------------------------------------------------------------------
// Tests — mirror research/python/tests/test_geometry.py
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vector3_basic_ops() {
        let a = Vector3::new(1.0, 2.0, 3.0);
        let b = Vector3::new(4.0, 5.0, 6.0);
        assert_eq!(a.add(&b), Vector3::new(5.0, 7.0, 9.0));
        assert_eq!(a.sub(&b), Vector3::new(-3.0, -3.0, -3.0));
        assert!((a.dot(&b) - 32.0).abs() < 1e-10);

        let c = a.cross(&b);
        assert!((c.x - (-3.0)).abs() < 1e-10);
        assert!((c.y - 6.0).abs() < 1e-10);
        assert!((c.z - (-3.0)).abs() < 1e-10);

        assert!((a.norm() - 14.0_f64.sqrt()).abs() < 1e-10);
        let n = a.normalize();
        assert!((n.norm() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn normalize_zero_vector() {
        let v = Vector3::ZERO;
        assert_eq!(v.normalize(), Vector3::ZERO);
    }

    #[test]
    fn listener_relative_front() {
        // Speaker directly in front (+Y) at 2m, listener at origin, no rotation.
        let sph = to_listener_relative(
            Vector3::new(0.0, 2.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
            Orientation::default(),
        );
        assert!((sph.0.distance - 2.0).abs() < 1e-9);
        assert!(sph.0.azimuth.abs() < 1e-9);
        assert!(sph.0.elevation.abs() < 1e-9);
    }

    #[test]
    fn listener_relative_left() {
        // Speaker to the left (-X) at 2m → azimuth = -90.
        let sph = to_listener_relative(
            Vector3::new(-2.0, 0.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
            Orientation::default(),
        );
        assert!((sph.0.azimuth - (-90.0)).abs() < 1e-9);
        assert!((sph.0.distance - 2.0).abs() < 1e-9);
    }

    #[test]
    fn listener_relative_right() {
        let sph = to_listener_relative(
            Vector3::new(2.0, 0.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
            Orientation::default(),
        );
        assert!((sph.0.azimuth - 90.0).abs() < 1e-9);
    }

    #[test]
    fn listener_relative_behind() {
        let sph = to_listener_relative(
            Vector3::new(0.0, -2.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
            Orientation::default(),
        );
        assert!(sph.0.azimuth.abs() > 179.999);
    }

    #[test]
    fn listener_relative_elevation() {
        // Speaker directly above: azimuth 0, elevation +90.
        let sph = to_listener_relative(
            Vector3::new(0.0, 0.0, 3.0),
            Vector3::new(0.0, 0.0, 0.0),
            Orientation::default(),
        );
        assert!((sph.0.elevation - 90.0).abs() < 1e-9);
        assert!((sph.0.azimuth).abs() < 1e-9);
    }

    #[test]
    fn listener_relative_elevation_below() {
        let sph = to_listener_relative(
            Vector3::new(0.0, 0.0, -3.0),
            Vector3::new(0.0, 0.0, 0.0),
            Orientation::default(),
        );
        assert!((sph.0.elevation - (-90.0)).abs() < 1e-9);
    }

    #[test]
    fn listener_yaw_rotation() {
        // Speaker at +X (90 deg azimuth). If listener yaws +90 (facing +X),
        // speaker should become azimuth 0.
        let orient = Orientation {
            yaw: 90.0,
            pitch: 0.0,
            roll: 0.0,
        };
        let sph = to_listener_relative(
            Vector3::new(2.0, 0.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
            orient,
        );
        assert!(sph.0.azimuth.abs() < 1e-9, "azimuth was {}", sph.0.azimuth);
    }

    #[test]
    fn listener_yaw_rotation_front() {
        // Speaker at +Y (directly ahead). Listener yaws +90 (CW).
        // Speaker should now be at azimuth -90 (listener's left).
        // Mirrors Python test_listener_yaw_90_speaker_still_forward_of_world.
        let orient = Orientation {
            yaw: 90.0,
            pitch: 0.0,
            roll: 0.0,
        };
        let sph = to_listener_relative(
            Vector3::new(0.0, 2.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
            orient,
        );
        assert!(
            (sph.0.azimuth - (-90.0)).abs() < 1e-9,
            "azimuth was {}",
            sph.0.azimuth
        );
    }

    #[test]
    fn azimuth_to_unit_vector_front() {
        let v = azimuth_to_unit_vector(0.0);
        assert!((v.y - 1.0).abs() < 1e-9);
        assert!(v.x.abs() < 1e-9);
        assert!(v.z.abs() < 1e-9);
    }

    #[test]
    fn azimuth_to_unit_vector_left() {
        let v = azimuth_to_unit_vector(-90.0);
        assert!((v.x - (-1.0)).abs() < 1e-9);
        assert!(v.y.abs() < 1e-9);
    }

    #[test]
    fn azimuth_to_unit_vector_normalization() {
        let v = azimuth_to_unit_vector(45.0);
        assert!((v.norm() - 1.0).abs() < 1e-9);
    }

    #[test]
    fn azimuth_wrapping() {
        // Verify to_listener_relative normalizes to (-180, 180]
        // after a large yaw rotation.
        let sph = to_listener_relative(
            Vector3::new(2.0, 0.0, 0.0),
            Vector3::new(0.0, 0.0, 0.0),
            Orientation {
                yaw: 170.0,
                pitch: 0.0,
                roll: 0.0,
            },
        );
        assert!(sph.0.azimuth > -180.0 && sph.0.azimuth <= 180.0);
    }
}
