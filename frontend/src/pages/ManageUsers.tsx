import { useState, useEffect, FormEvent, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { colors } from '../config/colors';
import type { User } from '../types';
import './Page.css';
import './ManageUsers.css';

export function ManageUsers() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
    if (profile) {
      const hasAccess = 
        profile.role === 'SUPER_ADMIN' || 
        profile.roles.includes('ADMIN');
      
      if (!hasAccess) {
        navigate('/dashboard');
        return;
      }
    }

    fetchUsers();
  }, [profile, navigate]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('http://localhost:5000/api/users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch users');
      }

      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('http://localhost:5000/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email,
          phone: phone || undefined,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create user');
      }

      // Reset form
      setEmail('');
      setPhone('');
      setPassword('');
      
      // Refresh users list
      await fetchUsers();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create user');
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
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('http://localhost:5000/api/users/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          csvData: text,
          passwordOption,
          sharedPassword: passwordOption === 'shared' ? sharedPassword : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to import users');
      }

      setImportSummary(data.summary);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setCsvFile(null);
      setSharedPassword('');
      
      // Refresh users list
      await fetchUsers();
    } catch (err: any) {
      setImportError(err.message || 'Failed to import users');
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
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.email}</td>
                        <td>{user.phone || '-'}</td>
                        <td>
                          <span
                            className="manage-users-status"
                            style={{
                              color: colors.status.success,
                            }}
                          >
                            {user.status || 'Active'}
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
