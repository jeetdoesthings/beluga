//! beluga-spatial — spatial scene representation, VBAP, and real-time rendering.
//! Ports of Python `scene.py`, `vbap.py`, and a real-time adaptation of `render.py`.

pub mod render;
pub mod scene;
pub mod vbap;

pub use render::RealTimeRenderer;
pub use scene::{AudioBuffer, SpatialObject, SpatialScene};
pub use vbap::{render_vbap_2d, render_vbap_2d_dirs, select_pair, solve_gains};
