// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use beluga_audio_io::{
    AudioDevice, AudioEngine, ChannelMapping, DeviceEnumerator, SourcePosition, Telemetry,
};
use beluga_core::{BelugaProject, Listener, Orientation, Room, Speaker, Vector3};

// ── Wrapper to make AudioEngine usable as Tauri state ────────────────────────
// cpal::Stream is not Send on macOS (it embeds a Box<dyn FnMut()> without
// a Send bound). Our audio callback only touches Sync/Atomic state via Arc,
// and the stream is created/dropped inside locked AudioEngine methods, so
// this unsafe impl is sound: the stream handle is never dereferenced from a
// different thread while the callback is running.
struct StateEngine(AudioEngine);
unsafe impl Send for StateEngine {}
unsafe impl Sync for StateEngine {}

#[tauri::command]
fn save_project(path: String, json: String) -> Result<(), String> {
    fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_project(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_default_project_dir() -> Result<String, String> {
    let dir = dirs_project_dir().unwrap_or_else(|| PathBuf::from("."));
    Ok(dir.to_string_lossy().to_string())
}

fn dirs_project_dir() -> Option<PathBuf> {
    dirs::document_dir().map(|d| d.join("Beluga"))
}

mod dirs {
    use std::path::PathBuf;
    pub fn document_dir() -> Option<PathBuf> {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Documents"))
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Audio commands
// ────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn enumerate_audio_devices() -> Result<Vec<AudioDevice>, String> {
    Ok(DeviceEnumerator::enumerate_outputs())
}

#[tauri::command(rename_all = "snake_case")]
fn start_playback(
    state: tauri::State<'_, Mutex<Option<StateEngine>>>,
    project_json: String,
    device_id: String,
    channel_mapping: Vec<usize>,
) -> Result<String, String> {
    // Parse project JSON into a BelugaProject.
    let raw: serde_json::Value =
        serde_json::from_str(&project_json).map_err(|e| format!("Project parse error: {}", e))?;

    let project = json_to_project(&raw)?;

    let n_speakers = project.speakers.len().max(1);

    // Open the requested CPAL device.
    let device = AudioEngine::open_device(&device_id)?;

    // Query device's actual channel count (not speaker count).
    let n_channels = AudioEngine::device_channels(&device)?.max(2);

    // Build channel mapping (speaker → output channel).
    let mapping = if channel_mapping.is_empty() {
        ChannelMapping::auto(n_speakers, n_channels as u32)
    } else {
        ChannelMapping {
            n_output_channels: n_channels as u32,
            speaker_to_channel: channel_mapping,
            channel_to_speaker: vec![],
        }
    };

    let mut engine = AudioEngine::new(&project, device, mapping)?;

    // Generate a test tone (440 Hz sine, 3 seconds) so there's audio to play.
    let sample_rate = engine.sample_rate();
    let tone_samples = (sample_rate as usize * 3).max(1);
    let mut tone = vec![0.0f32; tone_samples];
    let freq = 440.0f64;
    for (i, sample) in tone.iter_mut().enumerate() {
        *sample =
            (2.0 * std::f64::consts::PI * freq * i as f64 / sample_rate as f64).sin() as f32 * 0.3;
    }
    engine.load_source(&tone, sample_rate);
    eprintln!(
        "[beluga] Loaded test tone: {} samples at {} Hz, {}",
        tone_samples,
        sample_rate,
        engine.n_speakers()
    );

    engine.start()?;
    eprintln!(
        "[beluga] Audio stream started on device ({} channels)",
        engine.n_channels()
    );

    let mut guard = state.lock().unwrap();
    *guard = Some(StateEngine(engine));

    Ok("started".to_string())
}

#[tauri::command]
fn stop_playback(state: tauri::State<'_, Mutex<Option<StateEngine>>>) -> Result<(), String> {
    let mut guard = state.lock().unwrap();
    if let Some(mut engine) = guard.take() {
        engine.0.stop();
    }
    Ok(())
}

#[tauri::command]
fn set_source_position(
    state: tauri::State<'_, Mutex<Option<StateEngine>>>,
    azimuth: f64,
    elevation: f64,
    distance: f64,
) -> Result<(), String> {
    let guard = state.lock().unwrap();
    if let Some(engine) = guard.as_ref() {
        engine.0.set_source_position(SourcePosition {
            azimuth,
            elevation,
            distance,
        })?;
    }
    Ok(())
}

#[tauri::command]
fn get_telemetry(state: tauri::State<'_, Mutex<Option<StateEngine>>>) -> Result<Telemetry, String> {
    let guard = state.lock().unwrap();
    if let Some(engine) = guard.as_ref() {
        Ok(engine.0.telemetry())
    } else {
        Ok(Telemetry {
            speaker_gains: vec![],
            playhead_samples: 0,
            playing: false,
            source_len: 0,
            sample_rate: 48000,
            n_channels: 0,
            elapsed_ms: 0,
        })
    }
}

#[tauri::command]
fn set_playing(
    state: tauri::State<'_, Mutex<Option<StateEngine>>>,
    playing: bool,
) -> Result<(), String> {
    let guard = state.lock().unwrap();
    if let Some(engine) = guard.as_ref() {
        engine.0.set_playing(playing);
    }
    Ok(())
}

// ────────────────────────────────────────────────────────────────────────────
// Project JSON conversion helpers
// ────────────────────────────────────────────────────────────────────────────

fn json_to_project(json: &serde_json::Value) -> Result<BelugaProject, String> {
    let name = json["name"].as_str().unwrap_or("Project").to_string();
    let mut project = BelugaProject::new(&name);

    if let Some(room_json) = json.get("room") {
        project.room = room_from_json(room_json)?;
    }

    if let Some(listeners) = json.get("listeners").and_then(|v| v.as_array()) {
        for l in listeners {
            project.listeners.push(listener_from_json(l)?);
        }
    }
    if let Some(id) = json["activeListenerId"].as_str() {
        project.active_listener_id = Some(id.to_string());
    }
    // Also accept snake_case fallback
    if project.active_listener_id.is_none() {
        if let Some(id) = json["active_listener_id"].as_str() {
            project.active_listener_id = Some(id.to_string());
        }
    }

    if let Some(speakers) = json.get("speakers").and_then(|v| v.as_array()) {
        for s in speakers {
            project.speakers.push(speaker_from_json(s)?);
        }
    }

    Ok(project)
}

fn room_from_json(json: &serde_json::Value) -> Result<Room, String> {
    let name = json["name"].as_str().unwrap_or("Room");
    Ok(Room::new(
        name,
        json["length"].as_f64().unwrap_or(6.0),
        json["width"].as_f64().unwrap_or(5.0),
        json["height"].as_f64().unwrap_or(2.8),
    ))
}

fn listener_from_json(json: &serde_json::Value) -> Result<Listener, String> {
    let id = json["id"].as_str().unwrap_or("L1");
    let name = json["name"].as_str().unwrap_or("Listener");
    let pos = Vector3::new(
        json["position"]["x"].as_f64().unwrap_or(0.0),
        json["position"]["y"].as_f64().unwrap_or(0.0),
        json["position"]["z"].as_f64().unwrap_or(1.1),
    );
    let mut listener = Listener::new(id, name, pos);
    // Parse orientation (camelCase from frontend).
    if let Some(orient) = json.get("orientation") {
        listener.orientation = Orientation {
            yaw: orient["yaw"].as_f64().unwrap_or(0.0),
            pitch: orient["pitch"].as_f64().unwrap_or(0.0),
            roll: orient["roll"].as_f64().unwrap_or(0.0),
        };
    }
    // Parse ear height (frontend uses camelCase `earHeight`, Rust uses `ear_height`).
    if let Some(eh) = json["earHeight"]
        .as_f64()
        .or_else(|| json["ear_height"].as_f64())
    {
        listener.ear_height = eh;
    }
    Ok(listener)
}

fn speaker_from_json(json: &serde_json::Value) -> Result<Speaker, String> {
    let id = json["id"].as_str().unwrap_or("S1");
    let name = json["name"].as_str().unwrap_or("Speaker");
    let model = json["model"].as_str().unwrap_or("Generic");
    let mut speaker = Speaker::new(
        id,
        name,
        model,
        Vector3::new(
            json["position"]["x"].as_f64().unwrap_or(0.0),
            json["position"]["y"].as_f64().unwrap_or(0.0),
            json["position"]["z"].as_f64().unwrap_or(0.0),
        ),
    );
    if let Some(orient) = json.get("orientation") {
        speaker.orientation = Orientation {
            yaw: orient["yaw"].as_f64().unwrap_or(0.0),
            pitch: orient["pitch"].as_f64().unwrap_or(0.0),
            roll: orient["roll"].as_f64().unwrap_or(0.0),
        };
    }
    if let Some(enabled) = json["enabled"].as_bool() {
        speaker.enabled = enabled;
    }
    Ok(speaker)
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(None::<StateEngine>))
        .invoke_handler(tauri::generate_handler![
            save_project,
            load_project,
            get_default_project_dir,
            enumerate_audio_devices,
            start_playback,
            stop_playback,
            set_source_position,
            get_telemetry,
            set_playing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
