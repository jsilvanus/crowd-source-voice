import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteOption, setDeleteOption] = useState('delete');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await api.get('/me/stats');
      setStats(response.data);
    } catch (err) {
      setError('Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setError('');

    try {
      if (deleteOption === 'anonymize') {
        await api.post('/me/anonymize');
      } else {
        await api.delete('/me');
      }

      await logout();
      navigate('/login');
    } catch (err) {
      setError(err.message || 'Failed to delete account');
      setDeleting(false);
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
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Manage your account</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h3 className="card-title">Account Information</h3>
        <div style={{ marginTop: '1rem' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Email:</strong> {user?.email}
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Role:</strong>{' '}
            <span className={`badge badge-${user?.role === 'admin' ? 'primary' : 'success'}`}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      {stats && (
        <div className="card mt-4">
          <h3 className="card-title">Your Contributions</h3>
          <div className="stats-grid mt-2">
            <div className="stat-card">
              <div className="stat-value">{stats.total_recordings || 0}</div>
              <div className="stat-label">Recordings</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.total_validations || 0}</div>
              <div className="stat-label">Validations</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.corpora_contributed || 0}</div>
              <div className="stat-label">Corpora</div>
            </div>
          </div>
        </div>
      )}

      <div className="card mt-4">
        <h3 className="card-title" style={{ color: 'var(--danger)' }}>Danger Zone</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Once you delete your account, there is no going back.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="btn btn-danger"
        >
          Delete Account
        </button>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Delete Account</h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="modal-close"
              >
                X
              </button>
            </div>

            <p style={{ marginBottom: '1rem' }}>
              Are you sure you want to delete your account? Choose what happens to your data:
            </p>

            <div className="form-group">
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                <input
                  type="radio"
                  name="deleteOption"
                  value="delete"
                  checked={deleteOption === 'delete'}
                  onChange={(e) => setDeleteOption(e.target.value)}
                  style={{ marginRight: '0.5rem' }}
                />
                <strong>Delete everything</strong>
                <div style={{ marginLeft: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Your account and all recordings will be permanently deleted
                </div>
              </label>

              <label style={{ display: 'block' }}>
                <input
                  type="radio"
                  name="deleteOption"
                  value="anonymize"
                  checked={deleteOption === 'anonymize'}
                  onChange={(e) => setDeleteOption(e.target.value)}
                  style={{ marginRight: '0.5rem' }}
                />
                <strong>Anonymize recordings</strong>
                <div style={{ marginLeft: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Your account will be deleted, but your recordings will be kept
                  anonymously for the training dataset
                </div>
              </label>
            </div>

            <div className="flex gap-2" style={{ marginTop: '1.5rem' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="btn btn-outline"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="btn btn-danger"
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
