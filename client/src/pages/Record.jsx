import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import AudioRecorder from '../utils/audioRecorder';

export default function Record() {
  const { corpusId } = useParams();
  const navigate = useNavigate();

  const [corpus, setCorpus] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);

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
    setDuration(0);
    setError('');
    setMessage('');

    try {
      const response = await api.get(`/prompt?corpus_id=${corpusId}`);
      setPrompt(response.data.prompt);
    } catch (err) {
      setError('Failed to load next prompt');
    }
  };

  const startRecording = async () => {
    try {
      recorderRef.current = new AudioRecorder();
      await recorderRef.current.start();

      startTimeRef.current = Date.now();
      setIsRecording(true);

      // Update duration display
      const updateDuration = () => {
        if (recorderRef.current?.isRecording) {
          setDuration((Date.now() - startTimeRef.current) / 1000);
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
      const { blob, duration: actualDuration, sampleRate } = recorderRef.current.stop();
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      setDuration(actualDuration);
      setIsRecording(false);

      console.log(`Recorded: ${actualDuration.toFixed(2)}s at ${sampleRate}Hz`);
    }
  };

  const discardRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
  };

  const submitRecording = async () => {
    if (!audioBlob || !prompt) return;

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
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Duration: {formatDuration(duration)} | Format: WAV 16kHz mono
                </div>

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
                    disabled={uploading}
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
        <h3 className="card-title">Tips for Recording</h3>
        <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
          <li>Find a quiet environment</li>
          <li>Speak clearly at a natural pace</li>
          <li>Keep a consistent distance from the microphone</li>
          <li>Listen to your recording before submitting</li>
          {corpus?.type === 'music' && (
            <li>Sing or hum the melody as naturally as possible</li>
          )}
        </ul>
      </div>
    </div>
  );
}
