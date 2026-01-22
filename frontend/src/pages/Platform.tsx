import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../config/supabase';
import { CreateOrganizationModal } from '../components/CreateOrganizationModal';
import { formatDateIST } from '../utils/timezone';
import { colors } from '../config/colors';
import './Platform.css';

interface Organization {
  id: string;
  name: string;
  admin_email: string;
  status: string;
  created_at: string;
}

export function Platform() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (profile?.role !== 'SUPER_ADMIN') {
      navigate('/dashboard');
      return;
    }

    fetchOrganizations();
  }, [profile, navigate]);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('http://localhost:5000/api/organizations', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch organizations');
      }

      const data = await response.json();
      setOrganizations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async (data: {
    name: string;
    adminEmail: string;
    adminPassword: string;
    timezone: string;
  }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('http://localhost:5000/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create organization');
      }

      // Refresh organizations list
      await fetchOrganizations();
    } catch (err: any) {
      throw err;
    }
  };

  const handleCardClick = (orgId: string) => {
    navigate(`/organization/${orgId}`);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (loading && organizations.length === 0) {
    return (
      <div className="platform-container">
        <div className="platform-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="platform-container">
      <div className="platform-header">
        <div>
          <h1>Super Admin Platform</h1>
          <p>Manage organizations</p>
        </div>
        <button className="platform-signout" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>

      {error && <div className="platform-error">{error}</div>}

      <div className="platform-actions">
        <button
          className="platform-create-button"
          onClick={() => setIsModalOpen(true)}
        >
          Create Organization
        </button>
      </div>

      <div className="platform-grid">
        {organizations.length === 0 ? (
          <div className="platform-empty">
            <p>No organizations yet. Create your first organization to get started.</p>
          </div>
        ) : (
          organizations.map((org) => (
            <div
              key={org.id}
              className="platform-card"
              onClick={() => handleCardClick(org.id)}
            >
              <h3 className="platform-card-title">{org.name}</h3>
              <div className="platform-card-details">
                <div className="platform-card-item">
                  <span className="platform-card-label">Admin Email:</span>
                  <span className="platform-card-value">{org.admin_email}</span>
                </div>
                <div className="platform-card-item">
                  <span className="platform-card-label">Status:</span>
                  <span className="platform-card-value">{org.status}</span>
                </div>
                <div className="platform-card-item">
                  <span className="platform-card-label">Created:</span>
                  <span className="platform-card-value">
                    {formatDateIST(org.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <CreateOrganizationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateOrganization}
      />
    </div>
  );
}

