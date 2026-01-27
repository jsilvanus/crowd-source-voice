/**
 * Audio Recorder - Records audio at 16kHz mono and outputs WAV
 * With waveform visualization and audio analysis
 */

const TARGET_SAMPLE_RATE = 16000;
const MIN_DURATION = 0.5;  // seconds
const MAX_DURATION = 30;   // seconds
const SILENCE_THRESHOLD = 0.01;  // RMS threshold for silence
const MAX_SILENCE_RATIO = 0.7;   // Max 70% silence allowed

export class AudioRecorder {
  constructor(options = {}) {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.processorNode = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.onWaveformData = options.onWaveformData || null;
    this.waveformDataArray = null;
  }

  async start() {
    // Create AudioContext at target sample rate
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: TARGET_SAMPLE_RATE
    });

    // Get microphone stream
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    // Create source from microphone
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Create analyser for waveform visualization
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.waveformDataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

    // Create script processor for capturing audio data
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.audioChunks = [];

    this.processorNode.onaudioprocess = (e) => {
      if (this.isRecording) {
        const inputData = e.inputBuffer.getChannelData(0);
        this.audioChunks.push(new Float32Array(inputData));
      }
    };

    // Connect nodes: source -> analyser -> processor -> destination
    this.sourceNode.connect(this.analyserNode);
    this.analyserNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.isRecording = true;

    // Start waveform updates if callback provided
    if (this.onWaveformData) {
      this._updateWaveform();
    }
  }

  _updateWaveform() {
    if (!this.isRecording || !this.analyserNode) return;

    this.analyserNode.getByteTimeDomainData(this.waveformDataArray);

    if (this.onWaveformData) {
      // Convert to normalized values (-1 to 1)
      const normalized = new Float32Array(this.waveformDataArray.length);
      for (let i = 0; i < this.waveformDataArray.length; i++) {
        normalized[i] = (this.waveformDataArray[i] - 128) / 128;
      }
      this.onWaveformData(normalized);
    }

    requestAnimationFrame(() => this._updateWaveform());
  }

  stop() {
    this.isRecording = false;

    // Disconnect nodes
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    // Stop all tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Merge all audio chunks
    const totalLength = this.audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const mergedAudio = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.audioChunks) {
      mergedAudio.set(chunk, offset);
      offset += chunk.length;
    }

    // Get the actual sample rate used
    const sampleRate = this.audioContext?.sampleRate || TARGET_SAMPLE_RATE;

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Analyze audio
    const duration = mergedAudio.length / sampleRate;
    const analysis = this.analyzeAudio(mergedAudio, sampleRate);

    // Convert to WAV blob
    const wavBlob = this.encodeWAV(mergedAudio, sampleRate);

    this.audioChunks = [];

    return {
      blob: wavBlob,
      duration,
      sampleRate,
      analysis,
      samples: mergedAudio
    };
  }

  analyzeAudio(samples, sampleRate) {
    const duration = samples.length / sampleRate;

    // Calculate RMS (volume) for chunks of audio
    const chunkSize = Math.floor(sampleRate * 0.1); // 100ms chunks
    const numChunks = Math.floor(samples.length / chunkSize);
    let silentChunks = 0;
    let totalRms = 0;
    let peakAmplitude = 0;

    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      let sumSquares = 0;

      for (let j = start; j < end; j++) {
        const sample = samples[j];
        sumSquares += sample * sample;
        peakAmplitude = Math.max(peakAmplitude, Math.abs(sample));
      }

      const rms = Math.sqrt(sumSquares / chunkSize);
      totalRms += rms;

      if (rms < SILENCE_THRESHOLD) {
        silentChunks++;
      }
    }

    const avgRms = numChunks > 0 ? totalRms / numChunks : 0;
    const silenceRatio = numChunks > 0 ? silentChunks / numChunks : 1;

    // Validation
    const issues = [];

    if (duration < MIN_DURATION) {
      issues.push({
        type: 'too_short',
        message: `Recording too short (${duration.toFixed(1)}s). Minimum is ${MIN_DURATION}s.`
      });
    }

    if (duration > MAX_DURATION) {
      issues.push({
        type: 'too_long',
        message: `Recording too long (${duration.toFixed(1)}s). Maximum is ${MAX_DURATION}s.`
      });
    }

    if (silenceRatio > MAX_SILENCE_RATIO) {
      issues.push({
        type: 'too_silent',
        message: `Recording contains too much silence (${Math.round(silenceRatio * 100)}%). Please speak louder or check your microphone.`
      });
    }

    if (peakAmplitude < 0.05) {
      issues.push({
        type: 'too_quiet',
        message: 'Recording is very quiet. Please speak louder or move closer to the microphone.'
      });
    }

    if (peakAmplitude > 0.95) {
      issues.push({
        type: 'clipping',
        message: 'Audio may be clipping. Please speak softer or move away from the microphone.'
      });
    }

    return {
      duration,
      silenceRatio,
      avgRms,
      peakAmplitude,
      issues,
      isValid: issues.filter(i => ['too_short', 'too_long', 'too_silent'].includes(i.type)).length === 0
    };
  }

  encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

// Validation constants exported for use elsewhere
export const AUDIO_CONSTRAINTS = {
  MIN_DURATION,
  MAX_DURATION,
  SILENCE_THRESHOLD,
  MAX_SILENCE_RATIO
};

export default AudioRecorder;
