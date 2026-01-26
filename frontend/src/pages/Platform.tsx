import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { API_BASE_URL } from '../config/api';
import { CreateOrganizationModal } from '../components/CreateOrganizationModal';
import { formatDateIST } from '../utils/timezone';
import './Platform.css';

interface Organization {
  id: string;
  name: string;
  admin_email: string;
  status: string;
  created_at: string;
}

export function Platform() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      navigate('/dashboard');
      return;
    }
    
    // Clear any existing safety timeout
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    
    // Safety timeout: if loading takes more than 8 seconds, show error
    // This will be cleared when fetchOrganizations completes
    safetyTimeoutRef.current = setTimeout(() => {
      setError(`Request is taking too long. The backend server may not be running. Please check ${API_BASE_URL}`);
      setLoading(false);
    }, 8000); // 8 second safety timeout

    fetchOrganizations();

    return () => {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    };
  }, [user, navigate]);

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get('/api/organizations');
      setOrganizations(Array.isArray(response.data) ? response.data : []);
      setError(null);
      
      // Clear safety timeout since fetch completed successfully
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load organizations';
      setError(errorMessage);
      setOrganizations([]);
      
      // Clear safety timeout since fetch completed (with error)
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
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
      await api.post('/api/organizations', data);

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

  // Always show the page - don't block on loading
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

      {error && (
        <div className="platform-error">
          <div style={{ marginBottom: '8px' }}>{error}</div>
          <button
            onClick={fetchOrganizations}
            style={{
              padding: '6px 12px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="platform-actions">
        <button
          className="platform-create-button"
          onClick={() => setIsModalOpen(true)}
        >
          Create Organization
        </button>
      </div>

      <div className="platform-grid">
        {loading && organizations.length === 0 && !error ? (
          <div className="platform-loading" style={{ gridColumn: '1 / -1' }}>
            <div>Loading organizations...</div>
            <div style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>
              If this takes too long, the backend server may not be running on {API_BASE_URL}
            </div>
          </div>
        ) : organizations.length === 0 ? (
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

