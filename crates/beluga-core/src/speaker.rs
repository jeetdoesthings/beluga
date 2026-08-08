//! beluga-core::speaker — Data models for speakers, listeners, rooms, projects.
//! Port of `research/python/beluga/speaker.py`.
//! Spec references: §6 (Room), §11 (Speaker), §14 (categories), §15 (Listener),
//! §17 (ear height), §60 (BelugaProject), §61 (config storage).

use serde::{Deserialize, Serialize};

use crate::geometry::{Orientation, Vector3};

/// Default speaker categories (spec §14).
pub const SPEAKER_CATEGORIES: &[&str] = &[
    "Generic",
    "Active",
    "Passive",
    "Bookshelf",
    "Floorstanding",
    "Ceiling",
    "Subwoofer",
    "Laptop",
    "Monitor",
    "Custom",
];

/// Rectangular room model (spec §6, §60).
///
/// For 0.1 we support manual rectangular rooms only;
/// imported mesh support arrives in 0.2+.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Room {
    pub name: String,
    pub length: f64, // meters, along Y
    pub width: f64,  // meters, along X
    pub height: f64, // meters, along Z
}

impl Default for Room {
    fn default() -> Self {
        Room {
            name: String::new(),
            length: 5.0,
            width: 4.0,
            height: 2.8,
        }
    }
}

impl Room {
    pub fn new(name: &str, length: f64, width: f64, height: f64) -> Self {
        Room {
            name: name.to_string(),
            length,
            width,
            height,
        }
    }
}

/// A single independently controllable loudspeaker (spec §11).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Speaker {
    pub id: String,
    pub name: String,
    pub category: String,         // "Generic", "Bookshelf", "Floorstanding", ...
    pub position: Vector3,        // room-space meters
    pub orientation: Orientation, // yaw/pitch/roll degrees
    pub enabled: bool,
}

impl Speaker {
    pub fn new(id: &str, name: &str, category: &str, position: Vector3) -> Self {
        Speaker {
            id: id.to_string(),
            name: name.to_string(),
            category: category.to_string(),
            position,
            orientation: Orientation::default(),
            enabled: true,
        }
    }
}

/// A listener position and orientation (spec §15–§17).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Listener {
    pub id: String,
    pub name: String,
    pub position: Vector3,
    pub orientation: Orientation,
    pub ear_height: f64, // meters
}

impl Listener {
    pub fn new(id: &str, name: &str, position: Vector3) -> Self {
        Listener {
            id: id.to_string(),
            name: name.to_string(),
            position,
            orientation: Orientation::default(),
            ear_height: 1.10,
        }
    }
}

/// A Beluga project bundle (spec §60-§62).
///
/// Stores room, speakers, listeners, and active listener.
/// JSON format matches the Python to_dict/from_dict:
///   position as [x, y, z], orientation as {yaw, pitch, roll}.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BelugaProject {
    pub name: String,
    pub room: Room,
    pub speakers: Vec<Speaker>,
    pub listeners: Vec<Listener>,
    pub active_listener_id: Option<String>,
}

impl BelugaProject {
    pub fn new(name: &str) -> Self {
        BelugaProject {
            name: name.to_string(),
            room: Room::default(),
            speakers: Vec::new(),
            listeners: Vec::new(),
            active_listener_id: None,
        }
    }

    /// Returns the active listener, or the first one if none is active.
    pub fn active_listener(&self) -> Option<&Listener> {
        if self.listeners.is_empty() {
            return None;
        }
        if let Some(id) = &self.active_listener_id {
            for l in &self.listeners {
                if &l.id == id {
                    return Some(l);
                }
            }
        }
        self.listeners.first()
    }

    /// Returns the active listener index into `self.listeners`.
    pub fn active_listener_index(&self) -> Option<usize> {
        if self.listeners.is_empty() {
            return None;
        }
        if let Some(id) = &self.active_listener_id {
            for (i, l) in self.listeners.iter().enumerate() {
                if &l.id == id {
                    return Some(i);
                }
            }
        }
        Some(0)
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("project serializes to JSON")
    }

    pub fn from_json(s: &str) -> Result<Self, String> {
        serde_json::from_str(s).map_err(|e| e.to_string())
    }
}

impl Default for BelugaProject {
    fn default() -> Self {
        BelugaProject::new("Untitled")
    }
}

// ---------------------------------------------------------------------------
// Tests — mirror research/python/tests/test_speaker.py
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn room_default() {
        let r = Room::default();
        assert_eq!(r.length, 5.0);
        assert_eq!(r.width, 4.0);
        assert_eq!(r.height, 2.8);
    }

    #[test]
    fn json_roundtrip() {
        let mut proj = BelugaProject::new("Test Room");
        proj.speakers.push(Speaker::new(
            "spk-1",
            "Left",
            "Bookshelf",
            Vector3::new(-1.0, 2.0, 0.0),
        ));
        proj.speakers.push(Speaker::new(
            "spk-2",
            "Right",
            "Bookshelf",
            Vector3::new(1.0, 2.0, 0.0),
        ));
        let listener = Listener::new("list-1", "Main", Vector3::new(0.0, 0.0, 1.1));
        proj.listeners.push(listener.clone());
        proj.active_listener_id = Some("list-1".to_string());

        let json = proj.to_json();
        let restored = BelugaProject::from_json(&json).unwrap();
        assert_eq!(restored.name, "Test Room");
        assert_eq!(restored.speakers.len(), 2);
        assert_eq!(restored.speakers[0].name, "Left");
        assert!((restored.speakers[0].position.x - (-1.0)).abs() < 1e-9);
        assert_eq!(restored.listeners.len(), 1);
        assert_eq!(restored.active_listener_id, Some("list-1".to_string()));
        assert!((restored.active_listener().unwrap().position.z - 1.1).abs() < 1e-9);
    }

    #[test]
    fn active_listener_first_when_no_id() {
        let mut proj = BelugaProject::new("Test");
        proj.listeners
            .push(Listener::new("l1", "A", Vector3::new(0.0, 0.0, 1.0)));
        proj.listeners
            .push(Listener::new("l2", "B", Vector3::new(0.0, 0.0, 2.0)));
        assert_eq!(proj.active_listener().unwrap().id, "l1");
    }

    #[test]
    fn active_listener_by_id() {
        let mut proj = BelugaProject::new("Test");
        proj.listeners
            .push(Listener::new("l1", "A", Vector3::new(0.0, 0.0, 1.0)));
        proj.listeners
            .push(Listener::new("l2", "B", Vector3::new(0.0, 0.0, 2.0)));
        proj.active_listener_id = Some("l2".to_string());
        assert_eq!(proj.active_listener().unwrap().id, "l2");
    }

    #[test]
    fn speaker_default_orientation() {
        let s = Speaker::new("s1", "Test", "Generic", Vector3::new(0.0, 0.0, 0.0));
        assert_eq!(s.orientation, Orientation::default());
        assert!(s.enabled);
    }
}
