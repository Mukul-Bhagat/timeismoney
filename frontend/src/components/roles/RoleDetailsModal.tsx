import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import { colors } from '../../config/colors';
import { RoleUserList } from './RoleUserList';
import './Roles.css';

interface Role {
  id: string;
  name: string;
  is_system: boolean;
  user_count: number;
  default_rate_per_hour?: number | null;
  created_at: string;
}

interface User {
  id: string;
  email: string;
  assigned_at: string;
}

interface OrganizationUser {
  id: string;
  email: string;
}

interface RoleDetailsModalProps {
  isOpen: boolean;
  role: Role | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function RoleDetailsModal({
  isOpen,
  role,
  onClose,
  onUpdate,
}: RoleDetailsModalProps) {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [availableUsers, setAvailableUsers] = useState<OrganizationUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defaultRate, setDefaultRate] = useState<number | null>(null);
  const [savingRate, setSavingRate] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && role) {
      fetchUsers();
      fetchAvailableUsers();
      fetchRoleDetails();
      fetchAllUsers();
    }
  }, [isOpen, role]);
  
  const fetchRoleDetails = async () => {
    if (!role) return;
    
    try {
      const response = await api.get(`/api/roles/${role.id}`);
      if (response.data.success) {
        setDefaultRate(response.data.role.default_rate_per_hour || null);
      }
    } catch (err) {
      console.error('Error fetching role details:', err);
    }
  };
  
  const fetchAllUsers = async () => {
    try {
      const response = await api.get('/api/users');
      if (response.data.success) {
        setAllUsers(response.data.users || []);
      }
    } catch (err) {
      console.error('Error fetching all users:', err);
    }
  };
  
  const handleSaveDefaultRate = async () => {
    if (!role) return;
    
    setSavingRate(true);
    try {
      await api.put(`/api/roles/${role.id}/rate`, {
        default_rate_per_hour: defaultRate || null,
      });
      alert('Default rate saved successfully!');
      onUpdate();
    } catch (err: any) {
      console.error('Error saving rate:', err);
      alert(err.response?.data?.message || 'Failed to save rate');
    } finally {
      setSavingRate(false);
    }
  };

  const fetchUsers = async () => {
    if (!role) return;

    setError(null);
    try {
      // Check if token exists
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Session expired. Please login again.');
        setTimeout(() => navigate('/signin'), 2000);
        return;
      }

      const response = await api.get(`/api/roles/${role.id}/users`);

      if (response.data.success) {
        setUsers(response.data.users || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch users');
      }
    } catch (err: any) {
      console.error('Error fetching users:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch users';
      
      // Check if it's an auth error
      if (err.response?.status === 401) {
        setError('Session expired. Redirecting to login...');
        setTimeout(() => navigate('/signin'), 2000);
      } else {
        setError(errorMessage);
      }
    }
  };

  const fetchAvailableUsers = async () => {
    if (!role) return;

    try {
      // Check if token exists
      const token = localStorage.getItem('token');
      if (!token) {
        return;
      }

      // Get all users from the organization
      const usersResponse = await api.get('/api/users');
      const allUsers = usersResponse.data.users || [];

      // Get users already in this role
      const roleUsersResponse = await api.get(`/api/roles/${role.id}/users`);
      const assignedUserIds = (roleUsersResponse.data.users || []).map((u: User) => u.id);

      // Filter out users already assigned
      const available = allUsers.filter(
        (u: OrganizationUser) => !assignedUserIds.includes(u.id)
      );

      setAvailableUsers(available);
    } catch (err: any) {
      console.error('Error fetching available users:', err);
      // Don't show error for this - it's not critical
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!role) return;

    setRemovingUserId(userId);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Session expired. Please login again.');
        setTimeout(() => navigate('/signin'), 2000);
        return;
      }

      const response = await api.delete(`/api/roles/${role.id}/users/${userId}`);

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to remove user');
      }

      await fetchUsers();
      await fetchAvailableUsers();
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to remove user');
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleAddUsers = async () => {
    if (!role || selectedUserIds.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Session expired. Please login again.');
        setTimeout(() => navigate('/signin'), 2000);
        return;
      }

      const response = await api.post(`/api/roles/${role.id}/users`, {
        user_ids: selectedUserIds,
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to add users');
      }

      setSelectedUserIds([]);
      await fetchUsers();
      await fetchAvailableUsers();
      onUpdate();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to add users';
      setError(errorMessage);
      
      if (err.response?.status === 401) {
        setTimeout(() => navigate('/signin'), 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !role) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content-large"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Role Details: {role.name}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Default Rate Section */}
        <div style={{ padding: '16px', borderBottom: `1px solid ${colors.border}` }}>
          <h3 style={{ margin: '0 0 12px 0', color: colors.text.primary, fontSize: '16px' }}>
            Default Hourly Rate
          </h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={defaultRate || ''}
              onChange={(e) => setDefaultRate(e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="Enter default rate"
              style={{
                padding: '8px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '14px',
                width: '200px',
              }}
            />
            <button
              onClick={handleSaveDefaultRate}
              disabled={savingRate}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: savingRate ? colors.border : colors.primary.main,
                color: colors.white,
                cursor: savingRate ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              {savingRate ? 'Saving...' : 'Save Rate'}
            </button>
          </div>
          <div style={{ fontSize: '12px', color: colors.text.secondary, marginTop: '8px' }}>
            Used if employee rate is not defined
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '16px' }}>
          {/* Section A: Users in this role */}
          <div>
            <h3 style={{ margin: '0 0 16px 0', color: colors.text.primary }}>
              Users in this Role ({users.length})
            </h3>
            <div
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              <RoleUserList
                users={users.map(u => {
                  const fullUser = allUsers.find((au: any) => au.id === u.id);
                  return {
                    ...u,
                    rate_per_hour: fullUser?.rate_per_hour || null,
                  };
                })}
                onRemoveUser={handleRemoveUser}
                removingUserId={removingUserId}
                roleName={role.name}
                isSystemRole={role.is_system}
                defaultRate={defaultRate}
              />
            </div>
          </div>

          {/* Section B: Add users to role */}
          <div>
            <h3 style={{ margin: '0 0 16px 0', color: colors.text.primary }}>
              Add Users to Role
            </h3>
            {availableUsers.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: colors.text.secondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                }}
              >
                All users are already assigned to this role
              </div>
            ) : (
              <>
                <div
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    marginBottom: '16px',
                  }}
                >
                  {availableUsers.map((user) => (
                    <label
                      key={user.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px',
                        borderBottom: `1px solid ${colors.border}`,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUserIds([...selectedUserIds, user.id]);
                          } else {
                            setSelectedUserIds(selectedUserIds.filter((id) => id !== user.id));
                          }
                        }}
                        style={{ marginRight: '12px' }}
                      />
                      <span style={{ color: colors.text.primary }}>{user.email}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleAddUsers}
                  disabled={loading || selectedUserIds.length === 0}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: 'none',
                    borderRadius: '4px',
                    background:
                      loading || selectedUserIds.length === 0
                        ? colors.border
                        : colors.primary.main,
                    color: colors.white,
                    cursor:
                      loading || selectedUserIds.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                  }}
                >
                  {loading
                    ? 'Adding...'
                    : `Add ${selectedUserIds.length} ${selectedUserIds.length === 1 ? 'User' : 'Users'}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

