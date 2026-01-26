import { useState, useEffect, type FormEvent, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import api from '../config/api';
import { colors } from '../config/colors';
import type { User } from '../types';
import './Page.css';
import './ManageUsers.css';

export function ManageUsers() {
  const { user } = useAuth();
  const { symbol } = useCurrency();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRateUserId, setEditingRateUserId] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<number | null>(null);
  const [savingRate, setSavingRate] = useState(false);
  
  // Single user creation form state
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  
  // CSV import state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [passwordOption, setPasswordOption] = useState<'auto' | 'shared'>('auto');
  const [sharedPassword, setSharedPassword] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    created: number;
    skipped: number;
    failed: Array<{ email: string; error: string }>;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check access - only SUPER_ADMIN and ADMIN can access
    if (user) {
      const hasAccess = 
        user.role === 'SUPER_ADMIN' || 
        user.role === 'ADMIN';
      
      if (!hasAccess) {
        navigate('/dashboard');
        return;
      }
    }

    fetchUsers();
  }, [user, navigate]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/api/users');
      setUsers(response.data.users || []);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    try {
      await api.post('/api/users', {
        email,
        phone: phone || undefined,
        password,
      });

      // Reset form
      setEmail('');
      setPhone('');
      setPassword('');
      
      // Refresh users list
      await fetchUsers();
    } catch (err: any) {
      setCreateError(err.response?.data?.message || err.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setImportError(null);
      setImportSummary(null);
    }
  };

  const handleBulkImport = async () => {
    if (!csvFile) {
      setImportError('Please select a CSV file');
      return;
    }

    if (passwordOption === 'shared' && (!sharedPassword || sharedPassword.length < 6)) {
      setImportError('Shared password must be at least 6 characters');
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportSummary(null);

    try {
      // Read CSV file
      const text = await csvFile.text();
      
      const response = await api.post('/api/users/bulk', {
        csvData: text,
        passwordOption,
        sharedPassword: passwordOption === 'shared' ? sharedPassword : undefined,
      });

      setImportSummary(response.data.summary);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setCsvFile(null);
      setSharedPassword('');
      
      // Refresh users list
      await fetchUsers();
    } catch (err: any) {
      setImportError(err.response?.data?.message || err.message || 'Failed to import users');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Manage Users</h1>
      <p className="page-subtitle">Create and manage organization users</p>
      
      {error && (
        <div className="manage-users-error" style={{ color: colors.status.error }}>
          {error}
        </div>
      )}

      <div className="manage-users-container">
        {/* Left Panel - User Creation */}
        <div className="manage-users-left">
          <div className="manage-users-section">
            <h2 className="manage-users-section-title">Create User</h2>
            
            <form onSubmit={handleCreateUser} className="manage-users-form">
              {createError && (
                <div className="manage-users-form-error" style={{ color: colors.status.error }}>
                  {createError}
                </div>
              )}

              <div className="manage-users-field">
                <label htmlFor="email">Email *</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="user@example.com"
                  disabled={creating}
                />
              </div>

              <div className="manage-users-field">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1234567890"
                  disabled={creating}
                />
              </div>

              <div className="manage-users-field">
                <label htmlFor="password">Temporary Password *</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                  disabled={creating}
                />
              </div>

              <button
                type="submit"
                className="manage-users-button"
                disabled={creating}
                style={{
                  backgroundColor: colors.primary.main,
                  color: colors.white,
                }}
              >
                {creating ? 'Creating...' : 'Create User'}
              </button>
            </form>
          </div>

          {/* CSV Import Section */}
          <div className="manage-users-section">
            <h2 className="manage-users-section-title">Bulk Import (CSV)</h2>
            
            <div className="manage-users-import">
              {importError && (
                <div className="manage-users-form-error" style={{ color: colors.status.error }}>
                  {importError}
                </div>
              )}

              <div className="manage-users-field">
                <label htmlFor="csv-file">CSV File *</label>
                <input
                  ref={fileInputRef}
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={importing}
                />
                <small style={{ color: colors.text.secondary }}>
                  CSV must contain "email" column. "phone" column is optional.
                </small>
              </div>

              <div className="manage-users-field">
                <label>Password Option</label>
                <div className="manage-users-radio-group">
                  <label className="manage-users-radio">
                    <input
                      type="radio"
                      value="auto"
                      checked={passwordOption === 'auto'}
                      onChange={(e) => setPasswordOption(e.target.value as 'auto' | 'shared')}
                      disabled={importing}
                    />
                    <span>Auto-generate random password</span>
                  </label>
                  <label className="manage-users-radio">
                    <input
                      type="radio"
                      value="shared"
                      checked={passwordOption === 'shared'}
                      onChange={(e) => setPasswordOption(e.target.value as 'auto' | 'shared')}
                      disabled={importing}
                    />
                    <span>Use shared password</span>
                  </label>
                </div>
              </div>

              {passwordOption === 'shared' && (
                <div className="manage-users-field">
                  <label htmlFor="shared-password">Shared Password *</label>
                  <input
                    id="shared-password"
                    type="password"
                    value={sharedPassword}
                    onChange={(e) => setSharedPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    disabled={importing}
                  />
                </div>
              )}

              <button
                type="button"
                className="manage-users-button"
                onClick={handleBulkImport}
                disabled={importing || !csvFile}
                style={{
                  backgroundColor: colors.primary.main,
                  color: colors.white,
                }}
              >
                {importing ? 'Importing...' : 'Import Users'}
              </button>

              {importSummary && (
                <div className="manage-users-summary">
                  <h3>Import Summary</h3>
                  <div className="manage-users-summary-item">
                    <span style={{ color: colors.status.success }}>Created: {importSummary.created}</span>
                  </div>
                  <div className="manage-users-summary-item">
                    <span style={{ color: colors.status.warning }}>Skipped: {importSummary.skipped}</span>
                  </div>
                  <div className="manage-users-summary-item">
                    <span style={{ color: colors.status.error }}>Failed: {importSummary.failed.length}</span>
                  </div>
                  {importSummary.failed.length > 0 && (
                    <div className="manage-users-failed-list">
                      <strong>Failed Users:</strong>
                      <ul>
                        {importSummary.failed.map((item, idx) => (
                          <li key={idx}>
                            {item.email}: {item.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Users List */}
        <div className="manage-users-right">
          <div className="manage-users-section">
            <h2 className="manage-users-section-title">Users List</h2>
            
            {loading ? (
              <div className="manage-users-loading">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="manage-users-empty">
                <p>No users found. Create your first user to get started.</p>
              </div>
            ) : (
              <div className="manage-users-table-container">
                <table className="manage-users-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Hourly Rate</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((userItem) => (
                      <tr key={userItem.id}>
                        <td>{userItem.email}</td>
                        <td>{userItem.phone || '-'}</td>
                        <td>
                          {editingRateUserId === userItem.id ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editingRate || ''}
                                onChange={(e) => setEditingRate(e.target.value ? parseFloat(e.target.value) : null)}
                                style={{
                                  width: '100px',
                                  padding: '4px 8px',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '4px',
                                  fontSize: '14px',
                                }}
                                autoFocus
                              />
                              <button
                                onClick={async () => {
                                  setSavingRate(true);
                                  try {
                                    await api.put(`/api/users/${userItem.id}/rate`, {
                                      rate_per_hour: editingRate,
                                    });
                                    setUsers(users.map(u => 
                                      u.id === userItem.id ? { ...u, rate_per_hour: editingRate } : u
                                    ));
                                    setEditingRateUserId(null);
                                    setEditingRate(null);
                                  } catch (err: any) {
                                    alert(err.response?.data?.message || 'Failed to save rate');
                                  } finally {
                                    setSavingRate(false);
                                  }
                                }}
                                disabled={savingRate}
                                style={{
                                  padding: '4px 8px',
                                  border: 'none',
                                  borderRadius: '4px',
                                  background: colors.primary.main,
                                  color: colors.white,
                                  cursor: savingRate ? 'not-allowed' : 'pointer',
                                  fontSize: '12px',
                                }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingRateUserId(null);
                                  setEditingRate(null);
                                }}
                                style={{
                                  padding: '4px 8px',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '4px',
                                  background: colors.white,
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ color: colors.text.primary }}>
                                {userItem.rate_per_hour 
                                  ? `${symbol}${userItem.rate_per_hour.toFixed(2)}/hr` 
                                  : 'Not set'}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingRateUserId(userItem.id);
                                  setEditingRate(userItem.rate_per_hour || null);
                                }}
                                style={{
                                  padding: '2px 6px',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '4px',
                                  background: colors.white,
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  color: colors.text.secondary,
                                }}
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            className="manage-users-status"
                            style={{
                              color: colors.status.success,
                            }}
                          >
                            {userItem.status || 'Active'}
                          </span>
                        </td>
                        <td>
                          <div className="manage-users-actions">
                            <span style={{ color: colors.text.secondary }}>
                              Menu (coming soon)
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
