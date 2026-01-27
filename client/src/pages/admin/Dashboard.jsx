import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../contexts/I18nContext';
import api from '../../utils/api';

export default function AdminDashboard() {
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await api.get('/admin/stats');
      setStats(response.data);
    } catch (err) {
      setError(err.message || 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        <h1 className="page-title">{t('admin.dashboard.title')}</h1>
        <p className="page-subtitle">{t('admin.dashboard.subtitle')}</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <>
          {/* Main Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.totalUsers}</div>
              <div className="stat-label">{t('admin.dashboard.totalUsers')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalRecordings}</div>
              <div className="stat-label">{t('admin.dashboard.totalRecordings')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalValidations}</div>
              <div className="stat-label">{t('admin.dashboard.totalValidations')}</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalCorpora}</div>
              <div className="stat-label">{t('admin.dashboard.totalCorpora')}</div>
            </div>
          </div>

          {/* Disk Space */}
          {stats.diskSpace && (
            <div className="card mt-4">
              <h3 className="card-title">{t('admin.dashboard.storageUsed')}</h3>
              <div style={{ marginTop: '1rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem'
                }}>
                  <span>{formatBytes(stats.diskSpace.total - stats.diskSpace.available)} used</span>
                  <span>{formatBytes(stats.diskSpace.available)} free</span>
                </div>
                <div style={{
                  width: '100%',
                  height: 12,
                  backgroundColor: 'var(--border)',
                  borderRadius: 6,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${stats.diskSpace.percentUsed}%`,
                    height: '100%',
                    backgroundColor: stats.diskSpace.isLow ? 'var(--danger)' : 'var(--primary)',
                    borderRadius: 6,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                {stats.diskSpace.isLow && (
                  <div className="alert alert-error mt-2" style={{ padding: '0.5rem 1rem' }}>
                    Low disk space! Uploads will be blocked below {stats.diskSpace.minRequiredMB}MB.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Corpus Progress */}
          <div className="card mt-4">
            <h3 className="card-title">{t('admin.dashboard.corpusProgress')}</h3>
            {stats.corporaStats && stats.corporaStats.length > 0 ? (
              <table className="table mt-2">
                <thead>
                  <tr>
                    <th>{t('admin.corpora.name')}</th>
                    <th>{t('admin.corpora.language')}</th>
                    <th>{t('admin.dashboard.prompts')}</th>
                    <th>{t('admin.dashboard.recorded')}</th>
                    <th>{t('admin.dashboard.validated')}</th>
                    <th>{t('admin.dashboard.completion')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.corporaStats.map((corpus) => {
                    const completion = corpus.prompt_count > 0
                      ? Math.round((corpus.recording_count / corpus.prompt_count) * 100)
                      : 0;
                    return (
                      <tr key={corpus.id}>
                        <td>
                          <strong>{corpus.name}</strong>
                          <span className={`badge badge-${corpus.type === 'text' ? 'primary' : 'warning'} ml-1`} style={{ marginLeft: '0.5rem' }}>
                            {corpus.type}
                          </span>
                        </td>
                        <td>{corpus.language}</td>
                        <td>{corpus.prompt_count}</td>
                        <td>{corpus.recording_count}</td>
                        <td>{corpus.validated_count}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{
                              width: 80,
                              height: 8,
                              backgroundColor: 'var(--border)',
                              borderRadius: 4,
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${completion}%`,
                                height: '100%',
                                backgroundColor: 'var(--success)',
                                borderRadius: 4
                              }} />
                            </div>
                            <span style={{ fontSize: '0.875rem' }}>{completion}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>No corpora yet. <Link to="/admin/corpora">Create one</Link> to get started.</p>
            )}
          </div>

          {/* Recent Activity */}
          {stats.recentRecordings && stats.recentRecordings.length > 0 && (
            <div className="card mt-4">
              <h3 className="card-title">{t('admin.dashboard.recentActivity')}</h3>
              <table className="table mt-2">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Corpus</th>
                    <th>Duration</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentRecordings.map((recording) => (
                    <tr key={recording.id}>
                      <td>{recording.user_email || 'Anonymous'}</td>
                      <td>{recording.corpus_name}</td>
                      <td>{recording.duration?.toFixed(1)}s</td>
                      <td style={{ fontSize: '0.875rem' }}>
                        {new Date(recording.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
