import { useState, useEffect } from 'react';
import { supabase } from '../../config/supabase';
import { colors } from '../../config/colors';
import { RoleUserList } from './RoleUserList';
import './Roles.css';

interface Role {
  id: string;
  name: string;
  is_system: boolean;
  user_count: number;
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
  const [users, setUsers] = useState<User[]>([]);
  const [availableUsers, setAvailableUsers] = useState<OrganizationUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && role) {
      fetchUsers();
      fetchAvailableUsers();
    }
  }, [isOpen, role]);

  const fetchUsers = async () => {
    if (!role) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(`http://localhost:5000/api/roles/${role.id}/users`, {
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
      console.error('Error fetching users:', err);
      setError(err.message || 'Failed to fetch users');
    }
  };

  const fetchAvailableUsers = async () => {
    if (!role) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Get current user's organization
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile?.organization_id) return;

      // Get all users in organization
      const { data: orgUsers, error } = await supabase
        .from('users')
        .select('id, email')
        .eq('organization_id', profile.organization_id);

      if (error) throw error;

      // Get users already in this role
      const response = await fetch(`http://localhost:5000/api/roles/${role.id}/users`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const roleData = await response.json();
      const assignedUserIds = (roleData.users || []).map((u: User) => u.id);

      // Filter out users already assigned
      const available = (orgUsers || []).filter(
        (u) => !assignedUserIds.includes(u.id)
      );

      setAvailableUsers(available || []);
    } catch (err: any) {
      console.error('Error fetching available users:', err);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!role) return;

    setRemovingUserId(userId);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `http://localhost:5000/api/roles/${role.id}/users/${userId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to remove user');
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(`http://localhost:5000/api/roles/${role.id}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_ids: selectedUserIds }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to add users');
      }

      setSelectedUserIds([]);
      await fetchUsers();
      await fetchAvailableUsers();
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to add users');
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
          <div
            className="error-message"
            style={{
              padding: '12px',
              margin: '16px',
              background: colors.status.error + '20',
              color: colors.status.error,
              borderRadius: '4px',
            }}
          >
            {error}
          </div>
        )}

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
                users={users}
                onRemoveUser={handleRemoveUser}
                removingUserId={removingUserId}
                roleName={role.name}
                isSystemRole={role.is_system}
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

