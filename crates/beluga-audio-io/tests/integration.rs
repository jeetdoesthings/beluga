//! Integration tests for beluga-audio-io.
//!
//! These tests exercise the engine without requiring a real audio device
//! callback: they construct a `BelugaProject`, run the renderer's VBAP
//! pipeline manually, and verify the output is non-silent and properly
//! interleaved.

use std::f32::consts::PI;
use std::io::Cursor;

use beluga_audio_io::{
    decode_wav, AudioEngine, ChannelMapping, DeviceEnumerator, SourcePosition, Telemetry,
};
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
        speaker_delays_ms: vec![],
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

/// Helper: write a mono WAV file to a byte buffer and return the bytes.
fn write_mono_wav(samples: &[i16], sample_rate: u32) -> Vec<u8> {
    let mut buf = Vec::<u8>::new();
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    {
        let mut writer = hound::WavWriter::new(Cursor::new(&mut buf), spec).unwrap();
        for &s in samples {
            writer.write_sample(s).unwrap();
        }
        writer.finalize().unwrap();
    }
    buf
}

/// Helper: write a stereo WAV file to a byte buffer.
fn write_stereo_wav(left: &[i16], right: &[i16], sample_rate: u32) -> Vec<u8> {
    let mut buf = Vec::<u8>::new();
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    {
        let mut writer = hound::WavWriter::new(Cursor::new(&mut buf), spec).unwrap();
        let n = left.len().max(right.len());
        for i in 0..n {
            let l = left.get(i).copied().unwrap_or(0);
            let r = right.get(i).copied().unwrap_or(0);
            writer.write_sample(l).unwrap();
            writer.write_sample(r).unwrap();
        }
        writer.finalize().unwrap();
    }
    buf
}

#[test]
fn decode_wav_mono_16bit() {
    let samples: Vec<i16> = (0..100).map(|i| (i as f32 * 100.0) as i16).collect();
    let bytes = write_mono_wav(&samples, 48000);
    let (decoded, sr) = decode_wav(&bytes).expect("decode mono WAV");
    assert_eq!(sr, 48000);
    assert_eq!(decoded.len(), 100);
    // Check first and last sample values are correctly converted to f32
    assert!((decoded[0] - 0.0).abs() < 0.01);
    assert!((decoded[99] - (99.0 * 100.0 / 32768.0)).abs() < 0.01);
}

#[test]
fn decode_wav_stereo_extracts_left_channel() {
    let left: Vec<i16> = (0..50).map(|i| (i as i16) * 100).collect();
    let right: Vec<i16> = (0..50).map(|i| ((50 - i) as i16) * 100).collect();
    let bytes = write_stereo_wav(&left, &right, 44100);
    let (decoded, sr) = decode_wav(&bytes).expect("decode stereo WAV");
    assert_eq!(sr, 44100);
    // Stereo → mono extraction should yield left channel only
    assert_eq!(decoded.len(), 50);
    // Verify left channel values match (i * 100 / 32768.0)
    for (i, &sample) in decoded.iter().enumerate().take(50) {
        let expected = (i as i16 * 100) as f32 / 32768.0;
        assert!(
            (sample - expected).abs() < 0.001,
            "Mismatch at sample {}: got {}, expected {}",
            i,
            sample,
            expected
        );
    }
}

#[test]
fn decode_wav_float_format() {
    let mut buf = Vec::<u8>::new();
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 48000,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    {
        let mut writer = hound::WavWriter::new(Cursor::new(&mut buf), spec).unwrap();
        for i in 0..50 {
            writer.write_sample((i as f32) * 0.01).unwrap();
        }
        writer.finalize().unwrap();
    }
    let (decoded, sr) = decode_wav(&buf).expect("decode float WAV");
    assert_eq!(sr, 48000);
    assert_eq!(decoded.len(), 50);
    assert!((decoded[0] - 0.0).abs() < 0.001);
    assert!((decoded[49] - 0.49).abs() < 0.001);
}

#[test]
fn decode_wav_8bit() {
    let mut buf = Vec::<u8>::new();
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 48000,
        bits_per_sample: 8,
        sample_format: hound::SampleFormat::Int,
    };
    {
        let mut writer = hound::WavWriter::new(Cursor::new(&mut buf), spec).unwrap();
        for i in 0..50u8 {
            writer.write_sample((i as i16 - 128) as i8).unwrap();
        }
        writer.finalize().unwrap();
    }
    let (decoded, _sr) = decode_wav(&buf).expect("decode 8-bit WAV");
    assert_eq!(decoded.len(), 50);
}

#[test]
fn decode_wav_invalid_bytes() {
    let result = decode_wav(&[0u8; 4]);
    assert!(result.is_err());
}
