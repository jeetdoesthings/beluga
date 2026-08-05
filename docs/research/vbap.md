# VBAP Math Notes (Beluga 0.1)

## Coordinate System

- **Frame:** right-handed: +X right, +Y forward, +Z up.
- **World units:** 1 unit = 1 meter (spec §8).
- **Listener forward:** +Y in listener-local frame (before rotation).
- **Azimuth:** degrees clockwise from listener-forward, range (-180, 180].
- **Elevation:** degrees above horizontal plane, range [-90, 90].

## Listener-Relative Conversion (spec §18)

For a speaker world position `P`, listener at position `L_p` with orientation (yaw, pitch, roll):

1. `rel = P - L_p`
2. Rotate `rel` by inverse listener orientation (reverse order: roll⁻¹, pitch⁻¹, yaw⁻¹) → local-frame vector `v`.
3. `distance = |v|`
4. `azimuth = atan2(v.x, v.y)` (degrees, clockwise from +Y forward)
5. `elevation = atan2(v.z, sqrt(v.x² + v.y²))` (degrees)

## 2D VBAP (spec §31–§33)

Given N loudspeaker unit direction vectors `L_1..L_N` on the horizontal plane and a target unit vector `S` (also horizontal):

### 1. Pair selection

Sort speakers by azimuth. Find the pair (i, j) such that the target azimuth lies between them going clockwise.

### 2. Gain solving (determinant method)

Given the enclosing pair `L_i, L_j`:

```
base = L_i × L_j                     (cross product, normal to spanned plane)
g1   = ((S × L_j) · base) / |base|²
g2   = ((L_i × S) · base) / |base|²
g_k  = 0  for all other speakers k
```

If any `g < 0`, clamp to 0 (non-negative gains only).

### 3. Normalization

Energy normalization:

```
g = g / sqrt(sum(g²))
```

so that `sqrt(g1² + g2²) = 1`.  This ensures constant energy as the source moves between speaker pairs.

## Gain Smoothing (spec §34)

Source movements should not produce audible clicks. Each block ramps linearly (or exponentially) from the previous gain to the newly computed target over `ramp_samples` (~128 samples ≈ 2.7ms at 48kHz).

## Delay Alignment (spec §35)

For each speaker:

```
delay_i = (max_distance - distance_i) / 343   [seconds]
```

Applied as a fractional-sample delay using linear interpolation. The farthest speaker has zero delay; closer speakers are delayed so direct arrivals align at the listener.

## Gain Management (spec §67)

- VBAP gains are energy-normalized (sum of squares = 1).
- A global headroom factor (default −1 dB ≈ 0.891) is applied.
- A soft limiter (tanh-based) prevents hard clipping as the final safety stage.

## Acceptance criteria (spec §82)

| Criterion | Test |
|-----------|------|
| Arbitrary speaker XYZ accepted | `test_speaker.py` |
| Listener XYZ + orientation accepted | `test_speaker.py` |
| Source position accepted | `test_scene.py` |
| Listener-relative coordinates correct | `test_geometry.py` |
| 2D VBAP produces valid normalized gains | `test_vbap.py` |
| Source movement smooth | `test_gain_smoothing.py` |
| Per-speaker WAVs exported | `test_render.py` |
| Tests verify calculations | full suite |