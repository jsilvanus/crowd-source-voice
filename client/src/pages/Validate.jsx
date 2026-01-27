import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

export default function Validate() {
  const [recording, setRecording] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedScore, setSelectedScore] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState(null);

  const audioRef = useRef(null);

  useEffect(() => {
    loadRecording();
    loadStats();
  }, []);

  const loadRecording = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    setSelectedScore(null);

    try {
      const response = await api.get('/validation');
      setRecording(response.data.recording);
    } catch (err) {
      setError('Failed to load recording');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get('/validation/stats');
      setStats(response.data);
    } catch (err) {
      // Ignore stats errors
    }
  };

  const submitValidation = async () => {
    if (!recording || selectedScore === null) return;

    setSubmitting(true);
    setError('');

    try {
      await api.post('/validation', {
        recording_id: recording.id,
        score: selectedScore
      });

      setMessage('Validation submitted!');
      loadStats();

      // Load next recording after a short delay
      setTimeout(loadRecording, 1000);

    } catch (err) {
      setError(err.message || 'Failed to submit validation');
    } finally {
      setSubmitting(false);
    }
  };

  const skipRecording = () => {
    loadRecording();
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
        <h1 className="page-title">Validate Recordings</h1>
        <p className="page-subtitle">Listen to recordings and rate their quality</p>
      </div>

      {stats && (
        <div className="stats-grid mb-4">
          <div className="card stat-card">
            <div className="stat-value">{stats.total_recordings || 0}</div>
            <div className="stat-label">Total Recordings</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{stats.fully_validated || 0}</div>
            <div className="stat-label">Fully Validated</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{stats.accepted_recordings || 0}</div>
            <div className="stat-label">Accepted</div>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {!recording ? (
        <div className="card text-center">
          <h3>All done!</h3>
          <p>No more recordings available for validation.</p>
          <Link to="/" className="btn btn-primary mt-2">
            Back to Dashboard
          </Link>
        </div>
      ) : (
        <div className="card validation-card">
          {/* Corpus Info */}
          <div className="mb-2">
            <span className="badge badge-primary">{recording.corpus_name}</span>
            <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>
              {recording.language}
            </span>
          </div>

          {/* Prompt Display */}
          <div className={`prompt-display ${recording.prompt_type === 'music' ? 'music' : ''}`}>
            {recording.prompt_text}
          </div>

          {/* Audio Player */}
          <div className="mb-4">
            <audio
              ref={audioRef}
              src={recording.file_path}
              controls
              style={{ width: '100%' }}
            />
            {recording.duration && (
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Duration: {parseFloat(recording.duration).toFixed(1)}s
              </div>
            )}
          </div>

          {/* Score Selection */}
          <div className="mb-4">
            <h4 className="mb-2">Rate this recording:</h4>
            <div className="score-buttons">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  onClick={() => setSelectedScore(score)}
                  className={`btn btn-outline score-btn ${selectedScore === score ? 'selected' : ''}`}
                >
                  {score}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              <span>Poor</span>
              <span>Excellent</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-center gap-2">
            <button
              onClick={skipRecording}
              className="btn btn-outline"
              disabled={submitting}
            >
              Skip
            </button>
            <button
              onClick={submitValidation}
              className="btn btn-primary btn-lg"
              disabled={selectedScore === null || submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Score'}
            </button>
          </div>
        </div>
      )}

      <div className="card mt-4">
        <h3 className="card-title">Scoring Guidelines</h3>
        <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
          <li><strong>5 - Excellent:</strong> Clear, natural, matches the text perfectly</li>
          <li><strong>4 - Good:</strong> Minor issues but usable for training</li>
          <li><strong>3 - Acceptable:</strong> Some issues but understandable</li>
          <li><strong>2 - Poor:</strong> Significant issues, hard to understand</li>
          <li><strong>1 - Unusable:</strong> Wrong text, too much noise, or incomplete</li>
        </ul>
      </div>
    </div>
  );
}
