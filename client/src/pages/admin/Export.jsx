import { useState, useEffect } from 'react';
import api from '../../utils/api';

export default function AdminExport() {
  const [corpora, setCorpora] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [exporting, setExporting] = useState(null);
  const [flaggedRecordings, setFlaggedRecordings] = useState([]);
  const [showFlagged, setShowFlagged] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [corporaRes, statsRes, flaggedRes] = await Promise.all([
        api.get('/corpus'),
        api.get('/export/stats'),
        api.get('/validation/flagged')
      ]);
      setCorpora(corporaRes.data);
      setStats(statsRes.data);
      setFlaggedRecordings(flaggedRes.data);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (corpusId, format, includeAll = false) => {
    setExporting(corpusId);
    setError('');

    try {
      const url = `/export?corpus_id=${corpusId}&format=${format}&include_all=${includeAll}`;

      if (format === 'csv') {
        const response = await api.get(url);
        // Create download link
        const blob = new Blob([response.data], { type: 'text/csv' });
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `corpus-${corpusId}-dataset.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        setMessage('CSV exported successfully!');
      } else {
        const response = await api.get(url);
        // Create download link for JSON
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `corpus-${corpusId}-dataset.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
        setMessage('JSON exported successfully!');
      }
    } catch (err) {
      setError(err.message || 'Failed to export');
    } finally {
      setExporting(null);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
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
        <h1 className="page-title">Dataset Export</h1>
        <p className="page-subtitle">Export validated recordings for model training</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {/* Export Stats */}
      <div className="card">
        <h3 className="card-title mb-2">Export Statistics</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Corpus</th>
              <th>Type</th>
              <th>Total Recordings</th>
              <th>Exportable</th>
              <th>Duration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => (
              <tr key={stat.corpus_id}>
                <td><strong>{stat.corpus_name}</strong></td>
                <td>
                  <span className={`badge badge-${stat.type === 'text' ? 'primary' : 'warning'}`}>
                    {stat.type}
                  </span>
                </td>
                <td>{stat.total_recordings || 0}</td>
                <td>
                  <span className="badge badge-success">
                    {stat.exportable_recordings || 0}
                  </span>
                </td>
                <td>{formatDuration(stat.total_duration_seconds)}</td>
                <td>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleExport(stat.corpus_id, 'csv')}
                      className="btn btn-primary btn-sm"
                      disabled={exporting === stat.corpus_id || !stat.exportable_recordings}
                    >
                      {exporting === stat.corpus_id ? '...' : 'CSV'}
                    </button>
                    <button
                      onClick={() => handleExport(stat.corpus_id, 'json')}
                      className="btn btn-outline btn-sm"
                      disabled={exporting === stat.corpus_id || !stat.exportable_recordings}
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => handleExport(stat.corpus_id, 'csv', true)}
                      className="btn btn-secondary btn-sm"
                      disabled={exporting === stat.corpus_id || !stat.total_recordings}
                      title="Export all recordings including non-validated"
                    >
                      All
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export Format Info */}
      <div className="card mt-4">
        <h3 className="card-title">Export Formats</h3>
        <div className="grid grid-2 mt-2">
          <div>
            <h4>CSV (Whisper-compatible)</h4>
            <pre style={{
              background: 'var(--background)',
              padding: '1rem',
              borderRadius: 'var(--radius)',
              fontSize: '0.875rem',
              overflow: 'auto'
            }}>
{`file,text
0001.wav,"Sample text here"
0002.wav,"Another sample"`}
            </pre>
          </div>
          <div>
            <h4>JSON</h4>
            <pre style={{
              background: 'var(--background)',
              padding: '1rem',
              borderRadius: 'var(--radius)',
              fontSize: '0.875rem',
              overflow: 'auto'
            }}>
{`{
  "corpus": {...},
  "recordings": [
    {"file": "0001.wav", "text": "..."}
  ]
}`}
            </pre>
          </div>
        </div>
      </div>

      {/* Flagged Recordings */}
      <div className="card mt-4">
        <div className="card-header">
          <h3 className="card-title">Flagged Recordings ({flaggedRecordings.length})</h3>
          <button
            onClick={() => setShowFlagged(!showFlagged)}
            className="btn btn-outline btn-sm"
          >
            {showFlagged ? 'Hide' : 'Show'}
          </button>
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>
          Recordings with low scores or high score variance that need admin review.
        </p>

        {showFlagged && flaggedRecordings.length > 0 && (
          <table className="table mt-2">
            <thead>
              <tr>
                <th>Corpus</th>
                <th>Prompt</th>
                <th>Avg Score</th>
                <th>Validations</th>
                <th>Variance</th>
                <th>Audio</th>
              </tr>
            </thead>
            <tbody>
              {flaggedRecordings.slice(0, 20).map((rec) => (
                <tr key={rec.id}>
                  <td>{rec.corpus_name}</td>
                  <td style={{ maxWidth: '200px' }}>
                    <div style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {rec.prompt_text}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${rec.avg_score >= 4 ? 'badge-success' : 'badge-danger'}`}>
                      {parseFloat(rec.avg_score).toFixed(1)}
                    </span>
                  </td>
                  <td>{rec.validation_count}</td>
                  <td>{rec.score_variance}</td>
                  <td>
                    <audio src={rec.file_path} controls style={{ height: '30px', width: '150px' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Quality Requirements */}
      <div className="card mt-4">
        <h3 className="card-title">Quality Requirements for Export</h3>
        <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
          <li>Minimum 2 validations from different users</li>
          <li>Average quality score of 4.0 or higher</li>
          <li>Recordings with high score variance are flagged for review</li>
        </ul>
      </div>
    </div>
  );
}
