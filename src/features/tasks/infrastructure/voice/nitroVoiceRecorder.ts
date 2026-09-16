import { PermissionsAndroid, Platform } from 'react-native';
import Sound, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  OutputFormatAndroidType,
  type RecordBackType,
} from 'react-native-nitro-sound';

import {
  MicrophoneDeniedError,
  type MicPermission,
  type RecordedAudio,
  type VoiceRecorder,
} from '../../application/ports/VoiceCapture';

/**
 * The microphone, for the sheet that listens.
 *
 * One channel of AAC at the rate the phone's own microphone runs at, 64 kbps
 * — about 480 KB for the full minute, which is nothing to upload and is what
 * a transcriber can actually read. Speech models resample to 16 kHz
 * themselves, but recording at 16 kHz does not save the step: it throws the
 * detail away first. Measured against the deployed endpoint, a note encoded
 * at 16 kHz on the default bitrate came back as nonsense ("pega al lazo
 * manta") where the same words at this setting came back word for word.
 *
 * The file goes to the recorder's own cache directory, so a note somebody
 * abandoned is the operating system's to clean up.
 */

/** Metering arrives about this often, which is what makes the rings breathe
 * rather than step. */
const METERING_SECONDS = 0.03;

/**
 * The range a phone microphone actually uses, measured on a Galaxy M53: a
 * quiet room reads about -63 dB and ordinary speech peaks around -39, never
 * anywhere near the 0 dB top of the scale. Mapped against that 0, every bar
 * of the trail came out at its minimum height and the waveform looked dead.
 */
const QUIET_DB = -60;
const LOUD_DB = -25;

const AUDIO = {
  // iOS
  AVFormatIDKeyIOS: 'aac',
  AVNumberOfChannelsKeyIOS: 1,
  AVSampleRateKeyIOS: 44100,
  AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
  AVModeIOS: 'spokenAudio',
  // Android
  AudioSourceAndroid: AudioSourceAndroidType.VOICE_RECOGNITION,
  OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
  AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
  // Both
  AudioChannels: 1,
  AudioSamplingRate: 44100,
  AudioEncodingBitRate: 64000,
} as const;

/** Decibels as the 0–1 the rings and the trace are drawn from. */
function loudness(metering: number | undefined): number {
  if (metering == null || Number.isNaN(metering)) return 0;

  return Math.max(0, Math.min(1, (metering - QUIET_DB) / (LOUD_DB - QUIET_DB)));
}

let position = 0;

export const nitroVoiceRecorder: VoiceRecorder = {
  available: true,

  async requestPermission(): Promise<MicPermission> {
    // iOS has no ask of its own here: the system prompt comes up when
    // recording starts, and a refusal arrives as a failure to start, which
    // `start` turns into the same "denied" the sheet reads.
    if (Platform.OS !== 'android') return 'granted';

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );

    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';

    return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      ? 'blocked'
      : 'denied';
  },

  async start(onLevel) {
    position = 0;
    Sound.setSubscriptionDuration(METERING_SECONDS);
    Sound.addRecordBackListener((meta: RecordBackType) => {
      position = meta.currentPosition;
      onLevel(loudness(meta.currentMetering));
    });

    try {
      await Sound.startRecorder(undefined, AUDIO, true);
    } catch (error) {
      Sound.removeRecordBackListener();
      // The only way starting fails on a phone that has a microphone is that
      // the microphone was refused, and the sheet has words for that one.
      throw new MicrophoneDeniedError(String(error));
    }
  },

  async stop(): Promise<RecordedAudio> {
    const uri = await Sound.stopRecorder();

    Sound.removeRecordBackListener();

    return { audioId: uri, uri, durationMs: position };
  },

  async discard() {
    // The recording lives in the cache directory the recorder chose; the
    // system reclaims it. Nothing here writes where it would have to clean up.
  },
};
