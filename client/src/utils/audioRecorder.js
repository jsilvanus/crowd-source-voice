/**
 * Audio Recorder - Records audio at 16kHz mono and outputs WAV
 */

const TARGET_SAMPLE_RATE = 16000;

export class AudioRecorder {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.onDataAvailable = null;
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

    // Create script processor for capturing audio data
    // Buffer size of 4096 is a good balance between latency and performance
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
    this.audioChunks = [];

    this.processorNode.onaudioprocess = (e) => {
      if (this.isRecording) {
        const inputData = e.inputBuffer.getChannelData(0);
        // Clone the data since the buffer is reused
        this.audioChunks.push(new Float32Array(inputData));
      }
    };

    // Connect the nodes
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.isRecording = true;
  }

  stop() {
    this.isRecording = false;

    // Disconnect nodes
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
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

    // Convert to WAV blob
    const wavBlob = this.encodeWAV(mergedAudio, sampleRate);
    const duration = mergedAudio.length / sampleRate;

    this.audioChunks = [];

    return { blob: wavBlob, duration, sampleRate };
  }

  encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true);  // AudioFormat (PCM)
    view.setUint16(22, 1, true);  // NumChannels (mono)
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true);  // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    this.writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // Convert float samples to 16-bit PCM
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

export default AudioRecorder;
