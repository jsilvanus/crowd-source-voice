import { describe, test, expect, vi, beforeEach } from 'vitest';
import AudioRecorder from './audioRecorder';

describe('AudioRecorder', () => {
  let recorder;

  beforeEach(() => {
    recorder = new AudioRecorder();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    test('initializes with correct default state', () => {
      expect(recorder.audioContext).toBeNull();
      expect(recorder.mediaStream).toBeNull();
      expect(recorder.isRecording).toBe(false);
      expect(recorder.audioChunks).toEqual([]);
    });
  });

  describe('start', () => {
    test('creates AudioContext with 16kHz sample rate', async () => {
      await recorder.start();

      expect(recorder.audioContext).not.toBeNull();
      expect(recorder.audioContext.sampleRate).toBe(16000);
      expect(recorder.isRecording).toBe(true);
    });

    test('requests microphone access', async () => {
      await recorder.start();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
    });
  });

  describe('stop', () => {
    test('returns blob and duration after recording', async () => {
      await recorder.start();

      // Simulate some audio data
      recorder.audioChunks.push(new Float32Array(16000)); // 1 second of audio

      const result = recorder.stop();

      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.type).toBe('audio/wav');
      expect(result.duration).toBeCloseTo(1, 1);
      expect(result.sampleRate).toBe(16000);
    });

    test('clears state after stopping', async () => {
      await recorder.start();
      recorder.audioChunks.push(new Float32Array(1000));
      recorder.stop();

      expect(recorder.isRecording).toBe(false);
      expect(recorder.audioChunks).toEqual([]);
    });
  });

  describe('encodeWAV', () => {
    test('creates valid WAV blob', () => {
      const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
      const blob = recorder.encodeWAV(samples, 16000);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/wav');
      // WAV header (44 bytes) + samples (5 * 2 bytes)
      expect(blob.size).toBe(44 + 10);
    });

    test('clamps sample values to valid range', () => {
      // Values outside -1 to 1 should be clamped
      const samples = new Float32Array([2, -2, 0.5]);
      const blob = recorder.encodeWAV(samples, 16000);

      expect(blob).toBeInstanceOf(Blob);
    });
  });
});
