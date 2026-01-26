import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

export default function MyRecordings() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      const response = await api.get('/me/recordings');
      setRecordings(response.data);
    } catch (err) {
      setError('Failed to load recordings');
    } finally {
      setLoading(false);
    }
  };

  const deleteRecording = async (id) => {
    if (!confirm('Are you sure you want to delete this recording?')) {
      return;
    }

    setDeleting(id);
    try {
      await api.delete(`/recording/${id}`);
      setRecordings(recordings.filter(r => r.id !== id));
    } catch (err) {
      setError('Failed to delete recording');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        <h1 className="page-title">My Recordings</h1>
        <p className="page-subtitle">View and manage your recordings</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {recordings.length === 0 ? (
        <div className="card text-center">
          <h3>No recordings yet</h3>
          <p>Start contributing by recording some prompts!</p>
          <Link to="/" className="btn btn-primary mt-2">
            Browse Corpora
          </Link>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Corpus</th>
                <th>Prompt</th>
                <th>Duration</th>
                <th>Validations</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((recording) => (
                <tr key={recording.id}>
                  <td>
                    <span className="badge badge-primary">{recording.corpus_name}</span>
                  </td>
                  <td style={{ maxWidth: '300px' }}>
                    <div style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {recording.prompt_text}
                    </div>
                  </td>
                  <td>{recording.duration ? `${parseFloat(recording.duration).toFixed(1)}s` : '-'}</td>
                  <td>
                    <span className={`badge ${recording.validation_count >= 2 ? 'badge-success' : 'badge-warning'}`}>
                      {recording.validation_count || 0}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {formatDate(recording.created_at)}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <audio
                        src={recording.file_path}
                        controls
                        style={{ height: '30px', width: '150px' }}
                      />
                      <button
                        onClick={() => deleteRecording(recording.id)}
                        className="btn btn-danger btn-sm"
                        disabled={deleting === recording.id}
                      >
                        {deleting === recording.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card mt-4">
        <h3 className="card-title">About Quality Scores</h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          Other users validate recordings by giving them scores from 1-5.
          Recordings with an average score of 4 or above and at least 2 validations
          are included in the final training dataset.
        </p>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          <em>Note: Individual quality scores are not shown to prevent gaming the system.</em>
        </p>
      </div>
    </div>
  );
}
