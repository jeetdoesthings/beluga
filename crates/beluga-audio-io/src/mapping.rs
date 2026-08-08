//! beluga-audio-io::mapping — speaker-to-output-channel assignment.
//!
//! Maps virtual speakers to physical output channels. The user can reorder
//! via a wizard. For stereo, speaker 0 to left, speaker 1 to right.

use serde::{Deserialize, Serialize};

/// Maps virtual speakers to physical output channels of an audio device.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChannelMapping {
    /// Number of physical output channels on the device.
    pub n_output_channels: u32,
    /// For each virtual speaker index, which output channel (0-based).
    pub speaker_to_channel: Vec<usize>,
    /// Inverse map: for each output channel, which speaker index (if any).
    #[serde(default)]
    pub channel_to_speaker: Vec<Option<usize>>,
}

impl ChannelMapping {
    /// Auto-generate a mapping from N speakers to N output channels.
    ///
    /// Falls back to round-robin if more speakers than channels, or
    /// one-to-one if fewer.
    pub fn auto(n_speakers: usize, n_channels: u32) -> Self {
        let n_ch = n_channels as usize;
        let speaker_to_channel: Vec<usize> = (0..n_speakers).map(|i| i % n_ch).collect();

        // Build inverse map.
        let mut channel_to_speaker = vec![None; n_ch];
        for (si, ch) in speaker_to_channel.iter().enumerate() {
            if *ch < n_ch {
                // If multiple speakers map to same channel, last wins.
                channel_to_speaker[*ch] = Some(si);
            }
        }

        ChannelMapping {
            n_output_channels: n_channels,
            speaker_to_channel,
            channel_to_speaker,
        }
    }

    /// Number of virtual speakers in this mapping.
    pub fn n_speakers(&self) -> usize {
        self.speaker_to_channel.len()
    }

    /// Remap an interleaved multi-channel output buffer from "speaker-major"
    /// (one block per speaker) to "channel-major" (interleaved PCM).
    ///
    /// `speaker_data`: n_speakers blocks of `n_frames` samples each.
    /// `output`: must be `n_frames * n_output_channels` length.
    pub fn interleave(&self, speaker_data: &[&[f32]], n_frames: usize, output: &mut [f32]) {
        let n_ch = self.n_output_channels as usize;
        assert_eq!(output.len(), n_frames * n_ch);

        // Zero output first.
        for s in output.iter_mut() {
            *s = 0.0;
        }

        // For each speaker, write its data to the mapped channel.
        for (si, ch) in self.speaker_to_channel.iter().enumerate() {
            if si >= speaker_data.len() || *ch >= n_ch {
                continue;
            }
            let data = &speaker_data[si];
            for f in 0..n_frames.min(data.len()) {
                output[f * n_ch + ch] = data[f];
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_stereo() {
        let m = ChannelMapping::auto(2, 2);
        assert_eq!(m.n_speakers(), 2);
        assert_eq!(m.speaker_to_channel, vec![0, 1]);
        assert_eq!(m.channel_to_speaker, vec![Some(0), Some(1)]);
    }

    #[test]
    fn auto_more_speakers_than_channels() {
        let m = ChannelMapping::auto(4, 2);
        assert_eq!(m.speaker_to_channel, vec![0, 1, 0, 1]);
    }

    #[test]
    fn auto_fewer_speakers_than_channels() {
        let m = ChannelMapping::auto(2, 6);
        assert_eq!(m.speaker_to_channel, vec![0, 1]);
        assert_eq!(m.channel_to_speaker.len(), 6);
        assert_eq!(m.channel_to_speaker[0], Some(0));
        assert_eq!(m.channel_to_speaker[1], Some(1));
        assert_eq!(m.channel_to_speaker[2], None);
    }

    #[test]
    fn interleave_stereo() {
        let m = ChannelMapping::auto(2, 2);
        let ch0 = [1.0_f32, 2.0, 3.0];
        let ch1 = [10.0_f32, 20.0, 30.0];
        let mut output = vec![0.0_f32; 6];
        m.interleave(&[&ch0, &ch1], 3, &mut output);

        // Interleaved: ch0[0], ch1[0], ch0[1], ch1[1], ch0[2], ch1[2]
        assert!((output[0] - 1.0).abs() < 1e-6);
        assert!((output[1] - 10.0).abs() < 1e-6);
        assert!((output[2] - 2.0).abs() < 1e-6);
        assert!((output[3] - 20.0).abs() < 1e-6);
        assert!((output[4] - 3.0).abs() < 1e-6);
        assert!((output[5] - 30.0).abs() < 1e-6);
    }

    #[test]
    fn interleave_json_roundtrip() {
        let m = ChannelMapping::auto(5, 2);
        let json = serde_json::to_string(&m).unwrap();
        let restored: ChannelMapping = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.speaker_to_channel, m.speaker_to_channel);
        assert_eq!(restored.n_output_channels, m.n_output_channels);
    }
}
