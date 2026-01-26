import { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';

export default function AdminCorpora() {
  const [corpora, setCorpora] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Create corpus modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    language: '',
    type: 'text',
    description: ''
  });
  const [creating, setCreating] = useState(false);

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCorpusId, setUploadCorpusId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadCorpora();
  }, []);

  const loadCorpora = async () => {
    try {
      const response = await api.get('/corpus');
      setCorpora(response.data);
    } catch (err) {
      setError('Failed to load corpora');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCorpus = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      await api.post('/corpus', createForm);
      setMessage('Corpus created successfully!');
      setShowCreateModal(false);
      setCreateForm({ name: '', language: '', type: 'text', description: '' });
      loadCorpora();
    } catch (err) {
      setError(err.message || 'Failed to create corpus');
    } finally {
      setCreating(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileInputRef.current?.files[0];
    if (!file || !uploadCorpusId) return;

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.upload(`/corpus/${uploadCorpusId}/upload`, formData);
      setMessage(`Upload successful! Created ${response.data.promptsCreated} prompts.`);
      setShowUploadModal(false);
      setUploadCorpusId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadCorpora();
    } catch (err) {
      setError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteCorpus = async (id, name) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This will also delete all prompts and recordings.`)) {
      return;
    }

    try {
      await api.delete(`/corpus/${id}`);
      setMessage('Corpus deleted successfully');
      loadCorpora();
    } catch (err) {
      setError('Failed to delete corpus');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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
      <div className="page-header flex flex-between items-center">
        <div>
          <h1 className="page-title">Corpora Management</h1>
          <p className="page-subtitle">Create and manage text and music corpora</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          Create Corpus
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {corpora.length === 0 ? (
        <div className="card text-center">
          <h3>No corpora yet</h3>
          <p>Create your first corpus to get started.</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Language</th>
                <th>Prompts</th>
                <th>Recordings</th>
                <th>Validated</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {corpora.map((corpus) => (
                <tr key={corpus.id}>
                  <td>
                    <strong>{corpus.name}</strong>
                    {corpus.description && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {corpus.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${corpus.type === 'text' ? 'primary' : 'warning'}`}>
                      {corpus.type}
                    </span>
                  </td>
                  <td>{corpus.language}</td>
                  <td>{corpus.prompt_count || 0}</td>
                  <td>{corpus.recording_count || 0}</td>
                  <td>{corpus.validated_count || 0}</td>
                  <td style={{ fontSize: '0.875rem' }}>{formatDate(corpus.created_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setUploadCorpusId(corpus.id);
                          setShowUploadModal(true);
                        }}
                        className="btn btn-outline btn-sm"
                      >
                        Upload
                      </button>
                      <button
                        onClick={() => handleDeleteCorpus(corpus.id, corpus.name)}
                        className="btn btn-danger btn-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Corpus Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Corpus</h3>
              <button onClick={() => setShowCreateModal(false)} className="modal-close">X</button>
            </div>

            <form onSubmit={handleCreateCorpus}>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                  placeholder="e.g., Bible, Hymnal, Kirkkokäsikirja"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Language *</label>
                <input
                  type="text"
                  className="form-input"
                  value={createForm.language}
                  onChange={(e) => setCreateForm({ ...createForm, language: e.target.value })}
                  required
                  placeholder="e.g., Finnish, English"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Type *</label>
                <select
                  className="form-input"
                  value={createForm.type}
                  onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })}
                >
                  <option value="text">Text (spoken words)</option>
                  <option value="music">Music (ABC notation)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  rows={3}
                  placeholder="Optional description of the corpus"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-outline"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Corpus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Upload Corpus File</h3>
              <button onClick={() => setShowUploadModal(false)} className="modal-close">X</button>
            </div>

            <form onSubmit={handleUpload}>
              <div className="form-group">
                <label className="form-label">File *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="form-input"
                  accept=".txt,.json,.csv,.abc"
                  required
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  Supported formats: .txt, .json, .csv, .abc
                </div>
              </div>

              <div className="alert alert-info">
                <strong>Text corpora:</strong> Will be split by sentences (10-15 words max).<br />
                <strong>Music corpora:</strong> Will be split by ABC tune headers (X:).
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="btn btn-outline"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload & Process'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
