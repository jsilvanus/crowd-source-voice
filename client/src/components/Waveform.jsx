import { useRef, useEffect } from 'react';

/**
 * Waveform visualization component
 * Displays real-time audio waveform or static waveform from samples
 */
export default function Waveform({
  data,           // Float32Array of samples (-1 to 1)
  width = 600,
  height = 100,
  color = '#2563eb',
  backgroundColor = '#f1f5f9',
  isRecording = false
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size accounting for device pixel ratio
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    const centerY = height / 2;
    const samples = data.length;
    const step = Math.max(1, Math.floor(samples / width));

    for (let i = 0; i < width; i++) {
      const sampleIndex = Math.floor(i * samples / width);

      // Find min and max in this segment for better visualization
      let min = 1;
      let max = -1;
      for (let j = 0; j < step && sampleIndex + j < samples; j++) {
        const val = data[sampleIndex + j];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const yMin = centerY + min * centerY * 0.9;
      const yMax = centerY + max * centerY * 0.9;

      if (i === 0) {
        ctx.moveTo(i, yMin);
      }
      ctx.lineTo(i, yMin);
      ctx.lineTo(i, yMax);
    }

    ctx.stroke();

    // Draw center line
    ctx.beginPath();
    ctx.strokeStyle = isRecording ? '#ef4444' : '#94a3b8';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

  }, [data, width, height, color, backgroundColor, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: '8px',
        display: 'block'
      }}
    />
  );
}

/**
 * Static waveform from audio samples (for playback display)
 */
export function StaticWaveform({ samples, width = 600, height = 80 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !samples || samples.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, width, height);

    // Calculate bars
    const barWidth = 3;
    const gap = 1;
    const barCount = Math.floor(width / (barWidth + gap));
    const samplesPerBar = Math.floor(samples.length / barCount);

    ctx.fillStyle = '#2563eb';

    for (let i = 0; i < barCount; i++) {
      const start = i * samplesPerBar;
      let sum = 0;

      for (let j = 0; j < samplesPerBar && start + j < samples.length; j++) {
        sum += Math.abs(samples[start + j]);
      }

      const avg = sum / samplesPerBar;
      const barHeight = Math.max(2, avg * height * 0.9);
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      ctx.fillRect(x, y, barWidth, barHeight);
    }

  }, [samples, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: '8px',
        display: 'block'
      }}
    />
  );
}
