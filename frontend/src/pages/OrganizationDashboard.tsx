import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { formatDateIST } from '../utils/timezone';
import './OrganizationDashboard.css';

interface Organization {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
}

export function OrganizationDashboard() {
  const { id } = useParams<{ id: string }>();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchOrganization(id);
    }
  }, [id]);

  const fetchOrganization = async (orgId: string) => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(`http://localhost:5000/api/organizations/${orgId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch organization');
      }

      const data = await response.json();
      setOrganization(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (profile?.role === 'SUPER_ADMIN' || profile?.roles.includes('SUPER_ADMIN')) {
      navigate('/platform');
    } else {
      navigate('/dashboard');
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-loading">Loading...</div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-error">
          {error || 'Organization not found'}
        </div>
        <button className="dashboard-back-button" onClick={handleBack}>
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <button className="dashboard-back-button" onClick={handleBack}>
            ← Back
          </button>
          <h1>{organization.name}</h1>
          <p>Organization Dashboard</p>
        </div>
        <button className="dashboard-signout" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-card">
          <h2>Organization Details</h2>
          <div className="dashboard-details">
            <div className="dashboard-detail-item">
              <span className="dashboard-detail-label">Name:</span>
              <span className="dashboard-detail-value">{organization.name}</span>
            </div>
            <div className="dashboard-detail-item">
              <span className="dashboard-detail-label">Timezone:</span>
              <span className="dashboard-detail-value">{organization.timezone}</span>
            </div>
            <div className="dashboard-detail-item">
              <span className="dashboard-detail-label">Created:</span>
              <span className="dashboard-detail-value">
                {formatDateIST(organization.created_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <h2>Coming Soon</h2>
          <p>More features will be available here soon.</p>
        </div>
      </div>
    </div>
  );
}

