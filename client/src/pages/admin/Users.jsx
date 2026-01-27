import { useState, useEffect } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';

export default function AdminUsers() {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (userId, currentRole, email) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const confirmMessage = newRole === 'admin'
      ? t('admin.users.confirmMakeAdmin', { email })
      : t('admin.users.confirmRemoveAdmin', { email });

    if (!confirm(confirmMessage)) return;

    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setMessage(`User ${email} is now ${newRole === 'admin' ? 'an admin' : 'a regular user'}.`);
      loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to update user role');
    }
  };

  const handleDeleteUser = async (userId, email) => {
    if (!confirm(t('admin.users.confirmDeleteUser', { email }))) return;

    try {
      await api.delete(`/admin/users/${userId}`);
      setMessage(`User ${email} has been deleted.`);
      loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(search.toLowerCase())
  );

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
        <h1 className="page-title">{t('admin.users.title')}</h1>
        <p className="page-subtitle">{t('admin.users.subtitle')}</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder={t('admin.users.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 300 }}
          />
        </div>

        {filteredUsers.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('admin.users.noUsers')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('admin.users.user')}</th>
                <th>{t('admin.users.role')}</th>
                <th>{t('admin.users.recordings')}</th>
                <th>{t('admin.users.validations')}</th>
                <th>{t('admin.users.joined')}</th>
                <th>{t('admin.users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.email}</strong>
                    {user.id === currentUser?.id && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                        (you)
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${user.role === 'admin' ? 'primary' : 'success'}`}>
                      {user.role === 'admin' ? t('admin.users.userAdmin') : t('admin.users.userRegular')}
                    </span>
                  </td>
                  <td>{user.recording_count || 0}</td>
                  <td>{user.validation_count || 0}</td>
                  <td style={{ fontSize: '0.875rem' }}>{formatDate(user.created_at)}</td>
                  <td>
                    {user.id !== currentUser?.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleToggleAdmin(user.id, user.role, user.email)}
                          className="btn btn-outline btn-sm"
                        >
                          {user.role === 'admin' ? t('admin.users.removeAdmin') : t('admin.users.makeAdmin')}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.email)}
                          className="btn btn-danger btn-sm"
                        >
                          {t('admin.users.deleteUser')}
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </div>
      </div>
    </div>
  );
}
