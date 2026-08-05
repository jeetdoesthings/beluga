"""
beluga.export — WAV file writer for per-speaker PCM (spec §56).

Uses `soundfile` (libsndfile) for robust 32-bit float WAV output.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

__all__ = ["export_speaker_wavs", "load_mono_wav"]


def export_speaker_wavs(
    per_speaker_pcm: dict[str, np.ndarray],
    sample_rate: int,
    output_dir: str | Path,
    speaker_names: dict[str, str] | None = None,
) -> list[str]:
    """Write per-speaker PCM to `speaker_<index>.wav files in output_dir.

    Args:
      per_speaker_pcm: dict mapping speaker_id -> float32 1-D PCM array.
      sample_rate: sample rate in Hz.
      output_dir: directory to write files into (created if missing).
      speaker_names: optional mapping speaker_id -> human-readable name
        used in the filename suffix.

    Returns:
      list of written file paths (sorted by speaker index order).
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    paths: list[str] = []
    for idx, (sp_id, pcm) in enumerate(per_speaker_pcm.items(), start=1):
        name = ""
        if speaker_names and sp_id in speaker_names:
            safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in speaker_names[sp_id])
            name = f"_{safe}"
        filename = out / f"speaker_{idx}{name}.wav"
        sf.write(str(filename), np.asarray(pcm, dtype=np.float32), sample_rate, subtype="FLOAT")
        paths.append(str(filename))

    return paths


def load_mono_wav(path: str | Path) -> tuple[np.ndarray, int]:
    """Load a WAV file and return (mono float32 samples, sample_rate).

    If the file is stereo or multichannel, it is averaged to mono.
    """
    data, sr = sf.read(str(path), dtype="float32", always_2d=False)
    if data.ndim == 2:
        data = data.mean(axis=1)
    return data.astype(np.float32, copy=False), sr