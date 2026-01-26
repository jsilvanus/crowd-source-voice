import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

export default function Dashboard() {
  const [corpora, setCorpora] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [corporaRes, statsRes] = await Promise.all([
        api.get('/corpus'),
        api.get('/me/stats')
      ]);
      setCorpora(corporaRes.data);
      setStats(statsRes.data);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
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
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Choose a corpus to start recording</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <div className="stats-grid mb-4">
          <div className="card stat-card">
            <div className="stat-value">{stats.total_recordings || 0}</div>
            <div className="stat-label">Your Recordings</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{stats.total_validations || 0}</div>
            <div className="stat-label">Validations Made</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{stats.corpora_contributed || 0}</div>
            <div className="stat-label">Corpora Contributed</div>
          </div>
        </div>
      )}

      <h2 className="mb-2">Available Corpora</h2>

      {corpora.length === 0 ? (
        <div className="card text-center">
          <p>No corpora available yet. Check back later.</p>
        </div>
      ) : (
        <div className="grid grid-3">
          {corpora.map((corpus) => (
            <div key={corpus.id} className="card">
              <div className="card-header">
                <h3 className="card-title">{corpus.name}</h3>
                <span className={`badge badge-${corpus.type === 'text' ? 'primary' : 'warning'}`}>
                  {corpus.type}
                </span>
              </div>

              {corpus.description && (
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  {corpus.description}
                </p>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <span className="badge badge-success">{corpus.language}</span>
              </div>

              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                <div>{corpus.prompt_count || 0} prompts</div>
                <div>{corpus.recording_count || 0} recordings</div>
                <div>{corpus.validated_count || 0} validated</div>
              </div>

              <Link to={`/record/${corpus.id}`} className="btn btn-primary" style={{ width: '100%' }}>
                Start Recording
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="card mt-4">
        <h3 className="card-title mb-2">Help Validate Recordings</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Listen to recordings from other contributors and rate their quality.
          This helps ensure high-quality training data.
        </p>
        <Link to="/validate" className="btn btn-secondary">
          Start Validating
        </Link>
      </div>
    </div>
  );
}
