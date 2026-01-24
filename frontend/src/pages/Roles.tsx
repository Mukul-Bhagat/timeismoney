import { useState, useEffect } from 'react';
import api from '../config/api';
import { colors } from '../config/colors';
import { RoleCard } from '../components/roles/RoleCard';
import { CreateRoleModal } from '../components/roles/CreateRoleModal';
import { RoleDetailsModal } from '../components/roles/RoleDetailsModal';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';
import './Page.css';
import '../components/roles/Roles.css';

export function Roles() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/api/roles');
      setRoles(response.data.roles || []);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleClick = (role: Role) => {
    setSelectedRole(role);
    setIsDetailsModalOpen(true);
  };

  const handleCloseDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedRole(null);
  };

  // Check if user has ADMIN or SUPER_ADMIN role
  const canManageRoles =
    user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  if (!canManageRoles) {
    return (
      <div className="page">
        <h1 className="page-title">Roles</h1>
        <div className="page-content">
          <p style={{ color: colors.status.error }}>
            You do not have permission to access this page. ADMIN role required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="roles-container">
        <div className="roles-header">
          <div>
            <h1 className="page-title">Roles</h1>
            <p className="page-subtitle">Manage organization roles and user assignments</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              background: colors.primary.main,
              color: colors.white,
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>➕</span>
            Create Role
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '12px',
              marginBottom: '24px',
              background: colors.status.error + '20',
              color: colors.status.error,
              borderRadius: '4px',
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: colors.text.secondary }}>
            Loading roles...
          </div>
        ) : roles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: colors.text.secondary }}>
            No roles found. Create your first role to get started.
          </div>
        ) : (
          <div className="roles-list">
            {roles.map((role) => (
              <RoleCard key={role.id} role={role} onClick={() => handleRoleClick(role)} />
            ))}
          </div>
        )}
      </div>

      <CreateRoleModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchRoles}
      />

      <RoleDetailsModal
        isOpen={isDetailsModalOpen}
        role={selectedRole}
        onClose={handleCloseDetailsModal}
        onUpdate={fetchRoles}
      />
    </div>
  );
}
