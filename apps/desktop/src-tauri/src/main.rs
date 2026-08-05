// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectData {
    pub json: String,
}

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

// Minimal dirs replacement to avoid extra dependency
mod dirs {
    use std::path::PathBuf;
    pub fn document_dir() -> Option<PathBuf> {
        std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join("Documents"))
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_project, load_project, get_default_project_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}