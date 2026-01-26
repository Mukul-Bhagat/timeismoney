import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import './Profile.css';

export function Profile() {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string>('Loading...');

  // Fetch organization name
  useEffect(() => {
    const fetchOrgName = async () => {
      if (user?.organizationId) {
        const { data } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', user.organizationId)
          .single();
        if (data) {
          setOrganizationName(data.name);
        }
      } else {
        setOrganizationName('N/A');
      }
    };
    fetchOrgName();
  }, [user?.organizationId]);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      setSuccess('Password updated successfully');
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile">
      <h1 className="profile-title">Profile</h1>
      <p className="profile-subtitle">Your account information</p>

      <div className="profile-section">
        <h2>Account Information</h2>
        <div className="profile-info">
          <div className="profile-info-item">
            <label>Email</label>
            <div className="profile-info-value">{user?.email || 'N/A'}</div>
          </div>
          <div className="profile-info-item">
            <label>Role</label>
            <div className="profile-info-value">{user?.role || 'N/A'}</div>
          </div>
          <div className="profile-info-item">
            <label>Organization</label>
            <div className="profile-info-value">{organizationName}</div>
          </div>
          <div className="profile-info-item">
            <label>Timezone</label>
            <div className="profile-info-value">Asia/Kolkata (IST)</div>
          </div>
        </div>
      </div>

      <div className="profile-section">
        <h2>Change Password</h2>
        <form onSubmit={handleChangePassword} className="profile-form">
          {error && <div className="profile-error">{error}</div>}
          {success && <div className="profile-success">{success}</div>}

          <div className="profile-field">
            <label htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Enter new password"
              disabled={loading}
            />
          </div>

          <div className="profile-field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Confirm new password"
              disabled={loading}
            />
          </div>

          <button type="submit" className="profile-button" disabled={loading}>
            {loading ? 'Updating...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
