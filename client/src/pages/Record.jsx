import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../utils/api';
import AudioRecorder, { AUDIO_CONSTRAINTS } from '../utils/audioRecorder';
import Waveform, { StaticWaveform } from '../components/Waveform';

export default function Record() {
  const { corpusId } = useParams();

  const [corpus, setCorpus] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioSamples, setAudioSamples] = useState(null);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  // Waveform data for live visualization
  const [waveformData, setWaveformData] = useState(null);

  const recorderRef = useRef(null);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    loadCorpusAndPrompt();
  }, [corpusId]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        cancelAnimationFrame(timerRef.current);
      }
    };
  }, []);

  const loadCorpusAndPrompt = async () => {
    setLoading(true);
    setError('');
    try {
      const [corpusRes, promptRes] = await Promise.all([
        api.get(`/corpus/${corpusId}`),
        api.get(`/prompt?corpus_id=${corpusId}`)
      ]);
      setCorpus(corpusRes.data);
      setPrompt(promptRes.data.prompt);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadNextPrompt = async () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioSamples(null);
    setDuration(0);
    setError('');
    setMessage('');
    setAnalysis(null);
    setWaveformData(null);

    try {
      const response = await api.get(`/prompt?corpus_id=${corpusId}`);
      setPrompt(response.data.prompt);
    } catch (err) {
      setError('Failed to load next prompt');
    }
  };

  const handleWaveformData = useCallback((data) => {
    setWaveformData(data);
  }, []);

  const startRecording = async () => {
    try {
      recorderRef.current = new AudioRecorder({
        onWaveformData: handleWaveformData
      });
      await recorderRef.current.start();

      startTimeRef.current = Date.now();
      setIsRecording(true);
      setError('');
      setAnalysis(null);

      // Update duration display
      const updateDuration = () => {
        if (recorderRef.current?.isRecording) {
          const elapsed = (Date.now() - startTimeRef.current) / 1000;
          setDuration(elapsed);

          // Warn if approaching max duration
          if (elapsed > AUDIO_CONSTRAINTS.MAX_DURATION - 5 && elapsed < AUDIO_CONSTRAINTS.MAX_DURATION) {
            // Will auto-stop at max
          }

          // Auto-stop at max duration
          if (elapsed >= AUDIO_CONSTRAINTS.MAX_DURATION) {
            stopRecording();
            return;
          }

          timerRef.current = requestAnimationFrame(updateDuration);
        }
      };
      updateDuration();

    } catch (err) {
      setError('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      cancelAnimationFrame(timerRef.current);
    }

    if (recorderRef.current?.isRecording) {
      const result = recorderRef.current.stop();
      setAudioBlob(result.blob);
      setAudioUrl(URL.createObjectURL(result.blob));
      setAudioSamples(result.samples);
      setDuration(result.duration);
      setAnalysis(result.analysis);
      setIsRecording(false);
      setWaveformData(null);

      console.log('Recording analysis:', result.analysis);
    }
  };

  const discardRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioSamples(null);
    setDuration(0);
    setAnalysis(null);
  };

  const submitRecording = async () => {
    if (!audioBlob || !prompt) return;

    // Check if recording is valid
    if (analysis && !analysis.isValid) {
      setError('Please fix the issues with your recording before submitting.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');
      formData.append('prompt_id', prompt.id);
      formData.append('duration', duration.toFixed(2));

      await api.upload('/recording', formData);

      setMessage('Recording submitted successfully!');

      // Load next prompt after a short delay
      setTimeout(loadNextPrompt, 1500);

    } catch (err) {
      setError(err.message || 'Failed to submit recording');
    } finally {
      setUploading(false);
    }
  };

  const skipPrompt = async () => {
    if (!prompt) return;

    try {
      await api.post(`/prompt/${prompt.id}/skip`);
      loadNextPrompt();
    } catch (err) {
      setError('Failed to skip prompt');
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/" className="btn btn-outline btn-sm mb-2">
          Back to Dashboard
        </Link>
        <h1 className="page-title">{corpus?.name || 'Recording'}</h1>
        <p className="page-subtitle">
          {corpus?.language} - {corpus?.type === 'music' ? 'Music notation' : 'Text'}
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {!prompt ? (
        <div className="card text-center">
          <h3>All done!</h3>
          <p>You have recorded all available prompts for this corpus.</p>
          <Link to="/" className="btn btn-primary mt-2">
            Back to Dashboard
          </Link>
        </div>
      ) : (
        <div className="card recorder">
          {/* Prompt Display */}
          <div className={`prompt-display ${corpus?.type === 'music' ? 'music' : ''}`}>
            {prompt.text}
          </div>

          {/* Waveform Visualization */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            {isRecording && waveformData && (
              <Waveform
                data={waveformData}
                width={500}
                height={80}
                isRecording={true}
                color="#ef4444"
              />
            )}
            {!isRecording && audioSamples && (
              <StaticWaveform
                samples={audioSamples}
                width={500}
                height={80}
              />
            )}
            {!isRecording && !audioSamples && (
              <div style={{
                width: 500,
                height: 80,
                background: '#f1f5f9',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8'
              }}>
                Click REC to start recording
              </div>
            )}
          </div>

          {/* Recording Controls */}
          <div className="mb-4">
            {!isRecording && !audioBlob && (
              <button
                onClick={startRecording}
                className="btn btn-primary btn-lg record-btn"
                title="Start Recording"
              >
                REC
              </button>
            )}

            {isRecording && (
              <>
                <button
                  onClick={stopRecording}
                  className="btn btn-danger btn-lg record-btn recording"
                  title="Stop Recording"
                >
                  STOP
                </button>
                <div style={{ marginTop: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {formatDuration(duration)}
                  {duration > AUDIO_CONSTRAINTS.MAX_DURATION - 5 && (
                    <span style={{ color: 'var(--warning)', fontSize: '0.875rem', marginLeft: '0.5rem' }}>
                      (max {AUDIO_CONSTRAINTS.MAX_DURATION}s)
                    </span>
                  )}
                </div>
              </>
            )}

            {audioBlob && !isRecording && (
              <div>
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  style={{ width: '100%', marginBottom: '1rem' }}
                />

                {/* Audio Analysis Results */}
                {analysis && (
                  <div style={{ marginBottom: '1rem' }}>
                    {/* Issues/Warnings */}
                    {analysis.issues.length > 0 && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        {analysis.issues.map((issue, idx) => (
                          <div
                            key={idx}
                            className={`alert ${['too_short', 'too_long', 'too_silent'].includes(issue.type) ? 'alert-error' : 'alert-info'}`}
                            style={{ marginBottom: '0.5rem', padding: '0.5rem 1rem' }}
                          >
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Stats */}
                    <div style={{
                      display: 'flex',
                      gap: '1rem',
                      justifyContent: 'center',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)'
                    }}>
                      <span>Duration: {formatDuration(duration)}</span>
                      <span>|</span>
                      <span>Silence: {Math.round(analysis.silenceRatio * 100)}%</span>
                      <span>|</span>
                      <span>Peak: {Math.round(analysis.peakAmplitude * 100)}%</span>
                      <span>|</span>
                      <span>WAV 16kHz</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-center gap-2">
                  <button
                    onClick={discardRecording}
                    className="btn btn-outline"
                    disabled={uploading}
                  >
                    Re-record
                  </button>
                  <button
                    onClick={submitRecording}
                    className="btn btn-success btn-lg"
                    disabled={uploading || (analysis && !analysis.isValid)}
                    title={analysis && !analysis.isValid ? 'Fix issues before submitting' : ''}
                  >
                    {uploading ? 'Submitting...' : 'Submit Recording'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Skip Button */}
          {!audioBlob && (
            <button
              onClick={skipPrompt}
              className="btn btn-outline btn-sm"
              disabled={isRecording}
            >
              Skip this prompt
            </button>
          )}
        </div>
      )}

      <div className="card mt-4">
        <h3 className="card-title">Recording Requirements</h3>
        <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
          <li>Duration: {AUDIO_CONSTRAINTS.MIN_DURATION}s - {AUDIO_CONSTRAINTS.MAX_DURATION}s</li>
          <li>Less than {Math.round(AUDIO_CONSTRAINTS.MAX_SILENCE_RATIO * 100)}% silence</li>
          <li>Speak clearly at a natural pace</li>
          <li>Find a quiet environment</li>
          {corpus?.type === 'music' && (
            <li>Sing or hum the melody as naturally as possible</li>
          )}
        </ul>
      </div>
    </div>
  );
}
