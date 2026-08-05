# BELUGA

## Master Product & Engineering Specification

### Room-Aware, Hardware-Agnostic Spatial Audio Platform

**Product:** Beluga
**Initial Platform:** macOS
**Companion requirement:** None for MVP
**Room scanning:** Third-party iPhone/3D scanning applications initially
**Product category:** Spatial audio / acoustic DSP / room-aware playback
**Core architectural idea:** Software-defined speaker geometry

---

# 1. PRODUCT VISION

Beluga is a spatial audio platform that transforms arbitrary speaker arrangements into the best coherent spatial playback system that the available physical hardware can produce.

Traditional surround and immersive audio systems generally begin with a predefined playback layout.

Examples include:

* Stereo
* 5.1
* 7.1
* 5.1.2
* 7.1.4
* other standardized layouts

The user is expected to place speakers approximately according to that layout.

Beluga reverses the relationship.

Beluga begins with:

* the user's actual room
* the speakers the user actually owns
* where those speakers physically fit
* where the listener actually sits

Beluga then determines what spatial sound field that physical arrangement can reproduce.

The guiding principle is:

**Do not build the room around the audio system. Build the audio system around the room.**

---

# 2. CORE PRODUCT THESIS

Beluga investigates the following technical problem:

**Given N independently controllable loudspeakers at arbitrary positions, a listener at a known position and orientation, and optional acoustic measurements of the room, calculate in real time the loudspeaker signals that best approximate a desired spatial audio scene.**

Beluga's core abstraction is:

**Speaker = independently controllable acoustic actuator at a known 3D location.**

It is NOT:

**Speaker = predefined semantic channel.**

A speaker does not fundamentally need to be:

"Front Left"

"Rear Right"

"Top Front"

Instead, it may simply be:

Speaker 4

Position:
(x, y, z)

Relative to listener:

Azimuth: +47°
Elevation: +18°
Distance: 2.73 m

Beluga's renderer works from those physical properties.

---

# 3. PRODUCT POSITIONING

Beluga is NOT intended to be:

* a Dolby Atmos clone
* an Atmos decoder
* a new audio codec
* an AVR emulator
* an amplifier
* a streaming service
* a speaker manufacturer
* an AI music remixing application
* a replacement for DACs
* a replacement for amplifiers
* a way to violate physical acoustic limitations

Beluga IS:

**A room-aware spatial rendering and calibration layer between audio content and physical playback hardware.**

Conceptually:

AUDIO CONTENT

↓

BELUGA

↓

PHYSICAL AUDIO OUTPUTS

↓

SPEAKERS

---

# 4. HIGH-LEVEL SYSTEM MODEL

Beluga contains four conceptual layers.

## Layer A: Content

Possible inputs:

* Mono PCM
* Stereo PCM
* WAV
* FLAC
* multichannel PCM
* system audio
* games
* movies
* future object-based formats
* future licensed spatial formats

This layer answers:

**What audio exists, and where should it ideally exist?**

---

## Layer B: Spatial Scene

Beluga converts incoming audio into an internal hardware-independent representation.

Example:

SpatialObject {
audioSource
azimuth
elevation
distance
width
spread
gain
}

This means Beluga's renderer does not care whether a sound originated from:

* WAV
* stereo
* a game
* an object-audio file
* an Atmos adapter
* an AI estimator

Everything becomes a Beluga Spatial Scene.

---

## Layer C: Beluga Rendering

Beluga knows:

* speaker geometry
* listener geometry
* speaker capabilities
* acoustic calibration
* room information

It calculates the optimal signal for each physical speaker.

---

## Layer D: Physical Output

Beluga sends independent PCM streams to available endpoints.

Possible endpoints:

* CoreAudio channels
* USB audio interfaces
* multichannel DACs
* HDMI
* future network nodes
* future synchronized wireless speakers

---

# 5. COMPLETE USER EXPERIENCE

The mature Beluga workflow should be:

1. Install Beluga on Mac.
2. Create a room.
3. Import an existing 3D room scan OR enter dimensions manually.
4. Beluga renders the room.
5. User adds speakers.
6. User places each speaker inside the 3D room.
7. User specifies speaker orientation.
8. User places the listener.
9. User specifies listener orientation.
10. Beluga discovers available audio outputs.
11. User maps outputs to physical speakers.
12. Beluga tests each speaker.
13. Beluga optionally performs acoustic calibration.
14. Beluga analyzes spatial capabilities.
15. User selects audio.
16. User selects playback mode.
17. Audio begins.
18. Beluga renders the desired scene in real time.
19. User can optionally visualize spatial objects and active speakers.

The consumer should not need to understand DSP terminology.

---

# 6. ROOM ACQUISITION STRATEGY

Beluga will NOT initially require a dedicated iPhone application.

Instead, room geometry can enter Beluga through two methods.

## Method A: Manual Room Creation

User enters:

Length
Width
Height

Example:

Length: 5.2 m
Width: 4.3 m
Height: 2.8 m

Beluga generates a rectangular room.

This is required for MVP.

---

## Method B: Import Existing 3D Scan

User scans the room using an existing iPhone scanning application.

Potential applications include tools capable of exporting standard 3D models.

Preferred import format:

**GLB / glTF**

Secondary future formats:

* OBJ
* USDZ
* PLY
* FBX where practical

Preferred pipeline:

iPhone

↓

third-party room scanner

↓

GLB/glTF

↓

Beluga "Import Room"

↓

parse model

↓

normalize scale

↓

render in Three.js

The imported room becomes Beluga's 3D coordinate environment.

---

# 7. WHY BELUGA DOES NOT NEED ITS OWN IPHONE APP INITIALLY

Room scanning is not Beluga's core technology.

The core technology is:

* spatial rendering
* speaker geometry
* calibration
* sound-field approximation

Existing scanning applications already solve much of the 3D capture problem.

Therefore Beluga should avoid spending early development effort rebuilding:

* LiDAR scanning
* ARKit reconstruction
* mesh generation
* room segmentation
* photogrammetry

A dedicated Beluga Scan application should only be developed later if third-party scans cannot provide sufficiently accurate geometry or an acceptable user experience.

---

# 8. ROOM IMPORT PIPELINE

When importing a 3D scan:

1. Parse GLB/glTF.
2. Determine model units.
3. Convert to meters.
4. Determine coordinate orientation.
5. Normalize model transform.
6. Calculate bounding box.
7. Determine floor plane.
8. Allow user to correct orientation.
9. Allow user to define room origin if required.
10. Save normalized room model.

Internal world units:

**1 unit = 1 meter**

This convention must remain consistent throughout Beluga.

---

# 9. 3D ROOM VIEWER

Technology:

**Three.js**

Required camera controls:

* orbit
* pan
* zoom
* reset
* top view
* front view
* listener view

Room scan should initially be treated primarily as a static mesh.

Beluga objects exist separately from the imported mesh.

---

# 10. BELUGA SCENE OBJECTS

Beluga overlays interactive objects on top of the room mesh.

Initial scene objects:

* Speaker
* Listener
* Virtual Audio Source

Future:

* subwoofer
* microphone
* listening zone
* acoustic surfaces
* multiple listeners

The imported room mesh itself is NOT modified when speakers are added.

---

# 11. SPEAKER CREATION

User clicks:

**+ Add Speaker**

Beluga creates a speaker object.

Speaker schema:

Speaker {
id
name
category
position
orientation
outputBinding
calibrationProfile
enabled
}

Position:

Vector3(x, y, z)

Orientation:

Quaternion preferred internally.

UI may expose:

yaw
pitch
roll

---

# 12. SPEAKER PLACEMENT

Beluga provides three placement mechanisms.

## A. Surface Placement

User clicks a location on the room scan.

Three.js raycasting determines intersection with the mesh.

Speaker is placed at the intersection point.

Possible surfaces:

* floor
* wall
* shelf
* furniture
* ceiling

---

## B. Transform Gizmo

Selecting a speaker displays standard 3D transform controls.

Controls:

X movement
Y movement
Z movement
rotation

Similar to simplified Blender/Unity controls.

---

## C. Numeric Position

Advanced panel:

X: 1.42 m
Y: 1.15 m
Z: 3.08 m

Yaw: 34°
Pitch: -4°
Roll: 0°

This provides precise manual correction.

---

# 13. SPEAKER ORIENTATION

Speaker orientation matters.

Beluga should store a forward vector for every loudspeaker.

Example:

Speaker is physically located correctly but facing a wall.

That speaker should not be assumed equivalent to one aimed at the listener.

Initial renderer may use position only.

Later calibration and directivity modeling may incorporate orientation.

Orientation must therefore exist in the data model from the beginning.

---

# 14. SPEAKER TYPES

Initial categories:

* Generic
* Active
* Passive
* Bookshelf
* Floorstanding
* Ceiling
* Subwoofer
* Laptop
* Custom

Category initially exists primarily for UX.

Beluga must NOT infer detailed acoustic response merely from category.

Measured calibration data should eventually supersede generic assumptions.

---

# 15. LISTENER PLACEMENT

User clicks:

**+ Listener**

A listener object appears.

Representation:

* head
* chair
* simplified person

Listener schema:

Listener {
position
orientation
earHeight
}

User places the listener using:

* surface click
* drag
* transform controls
* numeric coordinates

---

# 16. LISTENER POSITION

The renderer ultimately cares about ear position.

If listener is placed on a chair/couch:

Beluga should allow:

Ear height: 1.10 m

The actual acoustic origin becomes approximately the center point between the listener's ears.

Future versions may model left and right ears independently.

---

# 17. LISTENER ORIENTATION

User rotates a directional arrow.

Example:

```
   FRONT
     ↑

     👤
```

Beluga stores the listener's forward direction.

This is essential.

Without orientation:

"front"

"rear"

"left"

"right"

are undefined.

---

# 18. LISTENER-RELATIVE COORDINATES

Room coordinates are converted into listener-relative coordinates.

For every speaker calculate:

relativePosition

distance

azimuth

elevation

Example:

Speaker #2:

Distance: 2.82 m
Azimuth: +47.4°
Elevation: +12.1°

These values are used heavily by the spatial renderer.

---

# 19. LISTENER VIEW

Beluga should provide:

**Listener View**

The Three.js camera moves to listener head position and adopts listener orientation.

Overlay speaker information:

S1
-42°
2.4 m

S2
+38°
2.7 m

S3
+151°
3.1 m

This becomes an important debugging and consumer visualization feature.

---

# 20. SPATIAL CAPABILITY VISUALIZATION

Beluga should calculate what directions the speaker arrangement can reproduce well.

Display a spherical or hemispherical heatmap.

Example:

Green:
high-confidence reproduction

Yellow:
approximate

Red:
poor/unavailable

Example configuration:

Four ear-level speakers.

Beluga reports:

Horizontal coverage: Excellent
Rear coverage: Good
Height reproduction: Unavailable

This prevents Beluga from pretending software can overcome missing geometry.

---

# 21. AUDIO DEVICE DISCOVERY

Initial platform:

macOS.

Use CoreAudio directly or through an appropriate Rust abstraction.

Discover:

* device name
* unique ID
* output channel count
* sample rates
* buffer size
* nominal latency
* device state

Example:

MacBook Air Speakers
2 channels

USB Audio Interface
8 channels

HDMI
8 channels

---

# 22. OUTPUT ENDPOINT ABSTRACTION

Create:

AudioEndpoint {
id
transport
deviceId
channelIndex
measuredLatency
enabled
}

Possible transport types:

LOCAL_AUDIO_CHANNEL

Future:

NETWORK_NODE

Future:

WIRELESS_ENDPOINT

This ensures the spatial renderer is independent from transport technology.

---

# 23. SPEAKER-OUTPUT MAPPING

The physical output channel must be mapped to the corresponding virtual speaker.

Wizard:

Beluga:

"Identify Speaker"

Output 1:

SHHHHHHH 🔊

User clicks the speaker that produced the sound.

Save:

channel_1 → speaker_4

Repeat.

Physical wiring order becomes irrelevant.

---

# 24. WHY MULTICHANNEL HARDWARE MAY STILL BE REQUIRED

Beluga cannot create physical audio outputs that do not exist.

A standard Mac stereo output provides:

Left
Right

A splitter duplicates channels.

It does NOT create additional independently controllable signals.

Therefore four ordinary analog active speakers require four independent outputs.

Possible solutions:

* USB multichannel interface
* multichannel DAC
* HDMI multichannel device
* future synchronized network outputs

Beluga replaces spatial processing intelligence.

It does NOT replace DACs or amplifiers.

---

# 25. ACTIVE SPEAKERS

Active speakers contain their own amplification.

Typical topology:

Mac

↓

Multichannel audio device

↓

Output 1 → Active Speaker 1
Output 2 → Active Speaker 2
Output 3 → Active Speaker 3
Output 4 → Active Speaker 4

Speakers do not necessarily connect to each other.

---

# 26. PASSIVE SPEAKERS

Passive speakers require amplification.

Topology:

Mac

↓

Multichannel DAC/interface

↓

Multichannel amplifier

↓

Passive speakers

Beluga controls digital audio before amplification.

---

# 27. WIRELESS SPEAKERS

Future only.

Potential architecture:

Beluga Host

↓

Wi-Fi / Ethernet

↓

Beluga Nodes

↓

Speaker

Requirements:

* shared clock
* playback timestamps
* jitter buffering
* drift compensation
* packet-loss management
* latency measurement

The critical requirement is inter-speaker synchronization.

---

# 28. BLUETOOTH

Generic Bluetooth speaker arrays are NOT an MVP target.

Problems:

* variable latency
* codec buffering
* separate clocks
* drift
* OS limitations
* synchronization

Beluga must never promise universal arbitrary Bluetooth speaker support.

---

# 29. SPATIAL SCENE MODEL

All content should eventually be represented internally as:

SpatialScene {
objects[]
beds[]
metadata
}

SpatialObject {
id
audio
azimuth
elevation
distance
width
spread
gain
}

This is Beluga's universal spatial representation.

---

# 30. CORE RENDER FUNCTION

Conceptually:

render(
spatialScene,
speakerGeometry,
listenerGeometry,
calibrationProfiles,
renderSettings
)

returns:

N-channel PCM audio.

This function represents the heart of Beluga.

---

# 31. FIRST SPATIAL ALGORITHM

Initial renderer:

**Vector Base Amplitude Panning (VBAP)**

For a desired source vector S and loudspeaker vectors L:

Approximate:

S ≈ g1L1 + g2L2 + ...

Solve speaker gains.

Normalize appropriately.

---

# 32. 2D VBAP

When speakers exist approximately on one horizontal plane:

Use speaker pairs.

Primary dimension:

azimuth.

Example:

Speaker A: -45°
Speaker B: +55°

Virtual source:

+20°

Beluga calculates gains for A/B.

Listener perceives a phantom source between them.

---

# 33. 3D VBAP

When meaningful height geometry exists:

Use speaker triplets.

Dimensions:

azimuth
elevation

Example:

Desired source:

Azimuth: +30°
Elevation: +45°

Beluga identifies the appropriate speaker triplet and calculates gains.

---

# 34. GAIN INTERPOLATION

Moving objects must never jump abruptly between speaker sets.

Use smooth interpolation.

Requirements:

* no audible clicks
* no sudden gain discontinuities
* stable perceived movement

Potential smoothing:

short linear ramp

or

appropriate exponential interpolation.

---

# 35. DISTANCE ALIGNMENT

Initially use geometry.

Speed of sound:

approximately 343 m/s.

Calculate direct propagation time:

distance / 343

Find appropriate reference delay.

Delay closer speakers so direct arrivals align at the listener.

Future measured impulse response timing supersedes geometric estimation.

---

# 36. LEVEL ALIGNMENT

Different speakers and distances produce different SPL.

Calibration determines relative level.

Store:

gainCorrectionDb

Prefer attenuation rather than extreme boost.

Maintain system headroom.

---

# 37. ACOUSTIC CALIBRATION

Calibration evolves through three stages.

## Geometry Calibration

Uses:

* speaker coordinates
* listener coordinates

Provides:

* distance compensation
* approximate delay

---

## Measured Calibration

Play known signal through each speaker.

Microphone at listener position records response.

Extract:

* arrival time
* SPL
* frequency response
* impulse response

---

## Advanced Calibration

Future:

* phase correction
* room-mode correction
* reflection analysis
* multi-point optimization

---

# 38. CALIBRATION MICROPHONE

Initial physical calibration can use:

* Mac microphone for experimentation
* external measurement microphone for serious testing

Future:

phone-assisted calibration.

Do not assume phone microphone measurements are laboratory-grade.

---

# 39. ROOM IMPULSE RESPONSE

For each speaker:

RIR_i(t)

represents:

speaker → room → microphone/listener

Use it to estimate:

* direct arrival
* early reflections
* decay
* frequency response
* relative latency

Calibration data becomes part of the speaker profile.

---

# 40. PER-SPEAKER DSP

SpeakerDSPProfile {
gain
delay
parametricEQ[]
FIR
}

Pipeline:

spatial renderer

↓

gain management

↓

speaker EQ

↓

delay

↓

optional FIR

↓

limiter

↓

output endpoint

All stages must be independently bypassable.

---

# 41. FREQUENCY CORRECTION

Initial:

Parametric EQ.

Future:

FIR filters.

Do not aggressively flatten every room feature.

Correction should have configurable limits.

Avoid huge boosts into nulls.

---

# 42. REAL-TIME AUDIO ENGINE

Production engine:

Rust.

Audio callback rules:

Never:

* access disk
* access network
* allocate memory unnecessarily
* invoke UI
* block
* acquire contested locks
* run heavy AI inference

Use preallocated buffers.

Target buffers:

128
256
512 samples

---

# 43. INTERNAL AUDIO FORMAT

Minimum:

32-bit floating point PCM.

Required sample rates:

44.1 kHz
48 kHz

Future:

96 kHz.

All internal routing should use a consistent sample format.

---

# 44. INPUT MODES

Development order:

1. Mono WAV
2. Multiple mono objects
3. Stereo WAV
4. FLAC
5. Multichannel PCM
6. System audio
7. Future object-based inputs
8. Future licensed formats

The renderer must not depend on any particular streaming service.

---

# 45. DIRECT OBJECT MODE

Used for testing.

User loads:

sound.wav

Then places a virtual audio sphere inside the 3D room.

Controls:

X/Y/Z

or:

Azimuth
Elevation
Distance

Dragging the virtual source changes speaker gains in real time.

This is Beluga's first major demo.

---

# 46. FAITHFUL STEREO MODE

Default consumer music mode.

Goal:

Preserve the original stereo mix.

Do NOT use AI to arbitrarily move instruments.

Conceptually create virtual:

Left reproduction point
Right reproduction point

Then use Beluga's physical speakers to synthesize those virtual directions.

Preserve:

* L/R balance
* stereo width
* dynamics
* phase relationships
* frequency balance
* relative levels

---

# 47. IMMERSIVE MODE

Optional.

UI:

Immersion

Faithful |------------| Spatial

Possible processing:

* Mid/Side analysis
* correlation
* ambience extraction
* controlled decorrelation
* surround ambience

Rules:

Direct components remain anchored.

Vocals must not randomly move.

Bass remains stable.

At 0%:

Output approaches Faithful Mode.

---

# 48. AI SPATIAL MODE

Future experimental feature.

Pipeline:

Stereo

↓

source separation

↓

vocals / drums / bass / instruments

↓

analyze original stereo characteristics

↓

estimate spatial properties

↓

create SpatialObjects

AI must preserve original left/right intent.

AI must NOT freely remix the song.

Confidence scores should determine how aggressively spatial inference is applied.

---

# 49. NATIVE SPATIAL CONTENT

Future.

If Beluga receives genuine spatial objects and metadata:

Spatial metadata

↓

Beluga Spatial Scene

↓

Beluga arbitrary-array renderer

This is theoretically ideal because Beluga receives creator-defined spatial intent.

Dolby integration, if ever pursued, requires appropriate technical and licensing arrangements.

Beluga must never claim unlicensed Dolby Atmos compatibility.

---

# 50. STREAMING SERVICES

Spotify and Apple Music are future integrations.

Do NOT assume they expose raw decoded audio or spatial object metadata to Beluga.

Possible future research:

* system audio capture
* virtual audio devices
* official APIs
* plugin architectures
* licensed integration

This problem is separate from the spatial renderer.

---

# 51. MACBOOK-ONLY MODE

Beluga must be capable of running with only built-in MacBook speakers.

Possible features:

* EQ
* stereo enhancement
* psychoacoustic virtualization

However:

Beluga must clearly communicate that physical 360° surround and height reproduction require appropriate speaker geometry.

---

# 52. SUBWOOFER SUPPORT

Treat separately from directional loudspeakers.

Bass management includes:

* crossover
* low-pass
* high-pass
* sub gain
* delay
* bass redirection

Default crossover may begin around 80 Hz but must be configurable.

---

# 53. SPATIAL CAPABILITY ENGINE

Given speaker directions, calculate:

* angular coverage
* maximum unsupported gaps
* height coverage
* rear coverage
* frontal coverage

Generate:

SpatialCapability {
horizontalScore
rearScore
heightScore
overallScore
unsupportedRegions[]
}

This can power the 3D heatmap.

---

# 54. SYSTEM CLASSIFICATION

Do not classify solely by speaker count.

Possible labels:

## Beluga Virtual

Laptop / highly constrained reproduction.

## Beluga Stereo

Two useful independent sources.

## Beluga Surround

Useful horizontal coverage.

## Beluga Spatial

Useful horizontal + elevation coverage.

Geometry determines classification.

---

# 55. DEBUG MODE

Developer overlay:

Speaker:

ID
XYZ
distance
azimuth
elevation
output endpoint

Renderer:

active pair/triplet
gain coefficients
source vector
CPU time

Audio:

sample rate
buffer size
underruns
peak
RMS
clipping
latency

Calibration:

measured delay
gain correction
EQ status

---

# 56. OFFLINE RENDERER

This MUST be built first.

Input:

* mono WAV
* N speaker coordinates
* listener position
* listener orientation
* virtual source position

Output:

speaker_1.wav
speaker_2.wav
speaker_3.wav
...

This requires no external speakers.

It allows development entirely on a MacBook.

---

# 57. SIMULATION MODE

Provide virtual layouts:

* stereo
* four arbitrary speakers
* four random speakers
* four + two height
* conventional 5-speaker geometry

Display calculated gains as the source moves.

Future:

binaural headphone preview.

---

# 58. REPOSITORY STRUCTURE

beluga/

apps/
desktop/

crates/
beluga-core/
beluga-spatial/
beluga-dsp/
beluga-audio-io/
beluga-calibration/
beluga-room/

packages/
ui/
shared-types/

research/
python/
notebooks/
experiments/

test-assets/
rooms/
audio/
impulse-responses/

docs/
product/
architecture/
dsp/
research/

---

# 59. DESKTOP STACK

Recommended:

Tauri
React
TypeScript
Three.js
Vite

Rust engine.

IPC connects UI to engine.

UI thread and audio thread remain separate.

---

# 60. CORE DATA MODEL

BelugaProject {
room
speakers[]
listeners[]
activeListener
audioEndpoints[]
calibrationProfiles[]
playbackSettings
}

Room {
dimensions
modelPath
modelTransform
}

Speaker {
id
name
position
orientation
endpoint
calibration
}

Listener {
position
orientation
earHeight
}

---

# 61. CONFIGURATION STORAGE

Store locally.

Human-readable configuration:

JSON.

Large calibration data:

separate binary files.

Room meshes:

referenced or copied into project directory.

Example:

MyRoom.beluga/

project.json

room.glb

calibration/

speaker_1.bin
speaker_2.bin

---

# 62. PROJECT FILE

Eventually Beluga should have its own project bundle.

Example:

Bedroom.beluga

Contains:

* room model
* speaker configuration
* listener
* endpoint mappings
* calibration
* preferences

This lets users maintain multiple rooms.

---

# 63. PRIVACY

Room scans are sensitive.

Default:

Room data stays local.

Audio stays local.

Calibration stays local.

Microphone recordings are discarded after processing unless explicitly saved.

Cloud synchronization must be opt-in.

---

# 64. CLOUD ARCHITECTURE

No cloud is required for playback.

Future backend may provide:

* accounts
* project backup
* device sync
* speaker profile database
* optional telemetry
* software update metadata
* ML model distribution

Never route ordinary real-time music playback through cloud infrastructure.

---

# 65. PERFORMANCE TARGETS

Audio:

Zero dropouts under supported configurations.

Zero audible clicks during source movement.

44.1/48 kHz reliable.

UI:

Target 60 FPS.

DSP:

Target <10% CPU on modern Apple Silicon for ordinary configurations.

Memory:

Avoid unnecessary audio-buffer copies.

---

# 66. LATENCY

Track:

input latency
processing latency
output latency
endpoint latency

For music:

inter-channel synchronization is more important than extremely low absolute latency.

For games/live applications:

both matter.

Developer mode displays estimated latency.

---

# 67. GAIN MANAGEMENT

Spatial summation can clip.

Maintain internal headroom.

Requirements:

* normalized VBAP gains
* global headroom
* peak monitoring
* final safety limiter

Never hard clip.

---

# 68. FAILURE HANDLING

Audio device removed:

pause safely and alert user.

Output mapping invalid:

disable playback until resolved.

Speaker disabled:

recalculate topology.

Calibration unavailable:

fall back to geometry.

Unsupported virtual direction:

approximate and expose reduced confidence.

Corrupt room scan:

offer manual room fallback.

Unsupported file:

clear error.

---

# 69. TESTING

Unit tests:

* coordinate conversion
* listener orientation transforms
* azimuth
* elevation
* distance
* VBAP pair selection
* VBAP triplet selection
* gain normalization
* interpolation
* delay calculations
* serialization

DSP regression tests:

known input → known output.

---

# 70. HUMAN LISTENING TEST

Ultimately localization must be validated perceptually.

Experiment:

Beluga generates random target angle.

Listener closes eyes.

Sound plays.

Listener reports perceived direction.

Record:

target azimuth
reported azimuth
absolute error

Repeat.

Compare:

uncalibrated
geometry calibrated
measured calibrated

This becomes evidence for Beluga's effectiveness.

---

# 71. QUALITY METRICS

Localization error.

Timing alignment error.

Frequency response deviation.

Stereo preservation.

CPU load.

Buffer underruns.

Audio dropouts.

Clipping events.

Spatial coverage.

---

# 72. BELUGA 0.1

**Goal: Prove the mathematics.**

Build:

Python research implementation.

Features:

* listener coordinate system
* arbitrary speakers
* mono WAV
* virtual source
* 2D VBAP
* offline per-speaker WAV export
* automated tests
* gain visualization

NO:

UI
room scans
Spotify
AI
Dolby
microphone calibration

---

# 73. BELUGA 0.2

**Goal: Build the visual world.**

Build:

* Tauri shell
* React
* Three.js
* manual rectangular room
* imported GLB room
* room normalization
* speaker placement
* listener placement
* speaker orientation
* listener orientation
* virtual source
* listener view
* real-time gain visualization

Audio may remain offline.

---

# 74. BELUGA 0.3

**Goal: Make sound physical.**

Build:

* Rust renderer
* CoreAudio/CPAL
* device enumeration
* multichannel output
* endpoint mapping wizard
* real-time VBAP
* smooth moving source
* debug telemetry

This is the first serious physical prototype.

---

# 75. BELUGA 0.4

**Goal: Geometry calibration.**

Build:

* distance calculations
* delay alignment
* manual level matching
* capability analysis
* coverage visualization

---

# 76. BELUGA 0.5

**Goal: Music playback.**

Build:

* WAV
* FLAC
* stereo pipeline
* Faithful Mode
* virtual stereo stage
* downmix validation

Now Beluga becomes useful for actual music rather than test tones.

---

# 77. BELUGA 0.6

**Goal: Measure reality.**

Build:

* microphone input
* calibration sweep
* impulse-response measurement
* arrival detection
* level matching
* frequency response
* basic parametric EQ correction

Measured calibration supersedes purely geometric assumptions.

---

# 78. BELUGA 0.7

**Goal: Consumer-quality setup.**

Build:

* polished room import
* setup wizard
* speaker wizard
* listener wizard
* output wizard
* calibration wizard
* capability score
* saved Beluga projects

---

# 79. BELUGA 0.8

**Goal: Immersive stereo.**

Research/build:

* Mid/Side
* correlation
* ambience extraction
* controlled surround expansion
* immersion slider
* mono/downmix safeguards

---

# 80. BELUGA 0.9+

Research:

* system audio capture
* virtual audio device
* Spotify compatibility
* Apple Music compatibility
* network speaker protocol
* synchronized nodes
* dedicated Beluga Scan iPhone app
* automatic speaker localization
* AI source separation
* AI spatial estimation
* head tracking
* multiple listeners
* object-based formats
* licensed spatial integrations

---

# 81. BELUGA SCAN FUTURE APP

Only build if needed.

Possible future flow:

Beluga Scan iPhone app

↓

ARKit / RoomPlan

↓

room geometry

↓

speaker positioning assistance

↓

listener positioning

↓

Mac via local network

Potential additional role:

microphone calibration companion.

But this is explicitly NOT required to validate Beluga.

---

# 82. FIRST MVP ACCEPTANCE CRITERIA

Beluga 0.1 is successful when:

* arbitrary speaker XYZ positions are accepted
* listener XYZ is accepted
* listener orientation is accepted
* source position is accepted
* listener-relative coordinates are correct
* 2D VBAP produces valid gains
* gains are normalized
* source movement produces smooth transitions
* per-speaker WAVs can be exported
* tests verify calculations

---

# 83. FIRST UI ACCEPTANCE CRITERIA

Beluga 0.2 is successful when:

* GLB room can be imported
* room appears correctly scaled
* speaker can be added
* speaker can be placed by clicking mesh
* speaker can be moved using gizmos
* coordinates can be edited numerically
* speaker orientation can be changed
* listener can be placed
* listener orientation can be changed
* listener view works
* virtual source can be dragged
* calculated speaker gains update visually

---

# 84. FIRST HARDWARE ACCEPTANCE CRITERIA

Using four independent speakers:

* non-standard speaker placement works
* outputs can be mapped
* test signal reaches correct speaker
* virtual source can be moved
* gains update continuously
* perceived source movement follows requested direction
* no clicks
* no dropouts
* stable output

This validates the core product hypothesis.

---

# 85. IMPORTANT ENGINEERING CONSTRAINTS

The coding agent MUST follow these rules.

1. Do not implement Dolby decoding.
2. Do not implement Spotify integration initially.
3. Do not build an iPhone app initially.
4. Do not build AI source separation initially.
5. Do not build network speakers initially.
6. Do not couple renderer to Three.js.
7. Do not couple renderer to CoreAudio.
8. Do not hardcode conventional speaker layouts.
9. Do not assign semantic roles based on speaker position.
10. Do not assume all speakers are identical.
11. Do not invent height reproduction when no height geometry exists.
12. Do not run DSP on the UI thread.
13. Do not block the audio callback.
14. Do not use room geometry as a substitute for measured calibration.
15. Do not optimize prematurely before mathematical correctness is validated.
16. Do not allow visual polish to delay renderer testing.

---

# 86. CORE SOFTWARE INTERFACES

Conceptual API:

RoomModel loadRoom(...)

SpeakerGeometry calculateSpeakerGeometry(
RoomModel,
Speaker[],
Listener
)

SpatialScene buildScene(
AudioInput,
PlaybackMode
)

RenderFrame renderSpatialFrame(
SpatialScene,
SpeakerGeometry,
CalibrationProfiles,
RenderSettings
)

AudioFrame[] applySpeakerDSP(
RenderFrame,
SpeakerDSPProfiles
)

routeAudio(
AudioFrame[],
AudioEndpoint[]
)

Each module must remain independently testable.

---

# 87. BELUGA'S CORE INTELLECTUAL ASSET

The valuable component is NOT the 3D room viewer.

It is NOT the room scanner.

It is NOT the music player.

It is NOT the audio interface.

It is NOT AI stem separation.

The central technology is:

**Given an intended spatial sound scene and an irregular calibrated loudspeaker array, determine the optimal real-time signals required to reproduce that scene as accurately as the physical system allows.**

Everything else exists to feed information into or receive output from that engine.

---

# 88. DOLBY RELATIONSHIP

Dolby Atmos can encode creator-defined spatial intent.

Beluga solves a different problem.

Conceptually:

Atmos:

**Where should this sound exist?**

Beluga:

**Given the actual speakers in this room, how closely can we make it exist there?**

Future licensed interoperability could therefore potentially be complementary rather than competitive.

Beluga must never describe itself as Dolby Atmos unless appropriately licensed/certified.

---

# 89. LONG-TERM IDEAL EXPERIENCE

The eventual user experience should be:

Open Beluga.

Click:

**Import Room Scan**

Select:

bedroom.glb

The room appears.

Click:

**Add Speaker**

Place each speaker where it physically exists.

Click:

**Set Listening Position**

Click couch.

Rotate arrow toward desk/TV.

Connect outputs.

Beluga identifies speakers.

Run calibration.

Beluga measures the system.

Beluga displays:

Horizontal Coverage: 94%

Rear Imaging: 87%

Height Coverage: 21%

Calibration: Excellent

Then:

**Play Music**

Beluga handles the rest.

The user should not need to think in terms of:

5.1

7.1

5.1.2

7.1.4

They simply have:

**their room + their speakers.**

---

# 90. FINAL PRODUCT STATEMENT

## Consumer

**Beluga turns the speakers you already own into one intelligent spatial audio system.**

## Technical

**Beluga is a room-aware spatial audio renderer designed for arbitrary loudspeaker geometries.**

## Research

**Beluga explores real-time spatial sound-field approximation across irregular loudspeaker arrays using listener-relative geometry, adaptive rendering and measured acoustic transfer functions.**

## Product Principle

**Your speakers don't adapt to a layout. Beluga adapts the layout to your speakers.**

🐋
