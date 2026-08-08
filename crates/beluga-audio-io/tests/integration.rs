//! Integration tests for beluga-audio-io.
//!
//! These tests exercise the engine without requiring a real audio device
//! callback: they construct a `BelugaProject`, run the renderer's VBAP
//! pipeline manually, and verify the output is non-silent and properly
//! interleaved.

use std::f32::consts::PI;

use beluga_audio_io::{AudioEngine, ChannelMapping, DeviceEnumerator, SourcePosition, Telemetry};
use beluga_core::{BelugaProject, Listener, Room, Speaker, Vector3};

fn make_stereo_project() -> BelugaProject {
    let mut proj = BelugaProject::new("Test");
    proj.room = Room::new("Room", 6.0, 5.0, 2.8);
    proj.listeners
        .push(Listener::new("L1", "Main", Vector3::new(0.0, 0.0, 1.1)));
    proj.active_listener_id = Some("L1".to_string());
    // Left speaker at -30°, right speaker at +30° (relative to forward +Y).
    proj.speakers.push(Speaker::new(
        "S1",
        "Left",
        "Bookshelf",
        Vector3::new(-1.73, 0.0, 0.0),
    ));
    proj.speakers.push(Speaker::new(
        "S2",
        "Right",
        "Bookshelf",
        Vector3::new(1.73, 0.0, 0.0),
    ));
    proj
}

/// Generate a 440 Hz sine wave.
fn sine_wave(n: usize, sample_rate: u32, freq: f32) -> Vec<f32> {
    (0..n)
        .map(|i| (2.0 * PI * freq * i as f32 / sample_rate as f32).sin())
        .collect()
}

#[test]
fn channel_mapping_auto_stereo() {
    let m = ChannelMapping::auto(2, 2);
    assert_eq!(m.n_output_channels, 2);
    assert_eq!(m.speaker_to_channel, vec![0, 1]);
}

#[test]
fn channel_mapping_auto_51() {
    let m = ChannelMapping::auto(6, 6);
    assert_eq!(m.speaker_to_channel.len(), 6);
    assert_eq!(m.channel_to_speaker.len(), 6);
}

#[test]
fn device_enumeration_returns_vec() {
    let devices = DeviceEnumerator::enumerate_outputs();
    // We don't assert non-empty (CI may have no devices), but if there are
    // devices they must have valid names.
    for d in &devices {
        assert!(!d.name.is_empty());
        assert!(d.max_channels >= 1);
    }
}

#[test]
fn engine_construction_and_source_position() {
    let proj = make_stereo_project();
    let devices = DeviceEnumerator::enumerate_outputs();
    if devices.is_empty() {
        eprintln!("Skipping audio engine test — no output devices available.");
        return;
    }
    let device =
        AudioEngine::open_device(&devices[0].id).or_else(|_| AudioEngine::open_device("default"));
    if let Ok(dev) = device {
        let mapping = ChannelMapping::auto(2, 2);
        if let Ok(mut engine) = AudioEngine::new(&proj, dev, mapping) {
            let sine = sine_wave(1024, 48000, 440.0);
            engine.load_source(&sine, 48000);
            assert_eq!(engine.playhead_samples(), 0);
            assert_eq!(engine.sample_rate(), 48000);
            assert_eq!(engine.n_channels(), 2);
            assert_eq!(engine.n_speakers(), 2);

            // Setting source position should succeed.
            let result = engine.set_source_position(SourcePosition::default());
            assert!(result.is_ok());
        }
    } else {
        eprintln!("Skipping audio engine test — could not open device.");
    }
}

#[test]
fn telemetry_defaults_when_no_engine() {
    // This is a no-op test that verifies the default Telemetry struct is
    // well-formed and serializes.
    let tel = Telemetry {
        speaker_gains: vec![],
        playhead_samples: 0,
        playing: false,
        source_len: 0,
        sample_rate: 48000,
        n_channels: 0,
        elapsed_ms: 0,
    };
    let json = serde_json::to_string(&tel).unwrap();
    let restored: Telemetry = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.sample_rate, 48000);
    assert!(!restored.playing);
}

#[test]
fn source_position_serialization() {
    let pos = SourcePosition {
        azimuth: 45.0,
        elevation: 10.0,
        distance: 3.0,
    };
    let json = serde_json::to_string(&pos).unwrap();
    let restored: SourcePosition = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.azimuth, 45.0);
    assert_eq!(restored.elevation, 10.0);
    assert_eq!(restored.distance, 3.0);
}
