import { useState, useEffect, FormEvent } from 'react';
import api from '../../config/api';
import { colors } from '../../config/colors';
import type { Role } from '../../types';
import './Projects.css';
import '../roles/Roles.css';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SelectedMember {
  user_id: string;
  role_id: string;
  user_email: string;
  role_name: string;
}

interface MemberAssignmentGroup {
  role_id: string;
  role_name: string;
  selected_user_ids: string[];
}

export function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'active' | 'completed'>('active');
  const [roles, setRoles] = useState<Role[]>([]);
  const [memberGroups, setMemberGroups] = useState<MemberAssignmentGroup[]>([]);
  const [currentRoleId, setCurrentRoleId] = useState<string>('');
  const [usersForRole, setUsersForRole] = useState<Array<{ id: string; email: string }>>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchRoles();
      // Set default dates (today and 30 days from now)
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setDate(today.getDate() + 30);
      setStartDate(today.toISOString().split('T')[0]);
      setEndDate(nextMonth.toISOString().split('T')[0]);
    }
  }, [isOpen]);

  const fetchRoles = async () => {
    try {
      const response = await api.get('/api/roles');

      if (response.data.success) {
        setRoles(response.data.roles || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch roles');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch roles');
    }
  };

  const handleRoleSelect = async (roleId: string) => {
    setCurrentRoleId(roleId);
    setSelectedUserIds([]);
    setLoadingUsers(true);

    try {
      const response = await api.get(`/api/roles/${roleId}/users`);

      if (response.data.success) {
        setUsersForRole(response.data.users || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch users');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddMembers = () => {
    if (!currentRoleId || selectedUserIds.length === 0) {
      return;
    }

    const selectedRole = roles.find(r => r.id === currentRoleId);
    if (!selectedRole) return;

    // Get user emails for selected users
    const newMembers: SelectedMember[] = selectedUserIds.map(userId => {
      const user = usersForRole.find(u => u.id === userId);
      return {
        user_id: userId,
        role_id: currentRoleId,
        user_email: user?.email || '',
        role_name: selectedRole.name,
      };
    });

    // Add to selected members (avoid duplicates)
    const existingUserIds = selectedMembers.map(m => m.user_id);
    const uniqueNewMembers = newMembers.filter(m => !existingUserIds.includes(m.user_id));
    
    setSelectedMembers([...selectedMembers, ...uniqueNewMembers]);
    setCurrentRoleId('');
    setSelectedUserIds([]);
    setUsersForRole([]);
  };

  const handleRemoveMember = (userId: string) => {
    setSelectedMembers(selectedMembers.filter(m => m.user_id !== userId));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim()) {
      setError('Project title is required');
      return;
    }

    if (!startDate || !endDate) {
      setError('Start date and end date are required');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date must be before or equal to end date');
      return;
    }

    if (selectedMembers.length === 0) {
      setError('At least one project member is required');
      return;
    }

    setLoading(true);

    try {
      // Format members for API
      const members = selectedMembers.map(m => ({
        user_id: m.user_id,
        role_id: m.role_id,
      }));

      console.log('Creating project with members:', members);
      console.log('Selected members:', selectedMembers);

      const response = await api.post('/api/projects', {
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate,
        end_date: endDate,
        status,
        members,
      });

      if (!response.data.success) {
        console.error('Project creation failed:', response.data);
        throw new Error(response.data.message || response.data.error || 'Failed to create project');
      }

      console.log('Project created successfully:', response.data);

      // Reset form
      setTitle('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setStatus('active');
      setSelectedMembers([]);
      setCurrentRoleId('');
      setSelectedUserIds([]);
      setUsersForRole([]);
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setTitle('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setStatus('active');
      setSelectedMembers([]);
      setCurrentRoleId('');
      setSelectedUserIds([]);
      setUsersForRole([]);
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Project</h2>
          <button className="modal-close" onClick={handleClose} disabled={loading}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <div className="form-group">
            <label htmlFor="project-title">Project Title *</label>
            <input
              id="project-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Website Redesign"
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="project-description">Description</label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Project description..."
              rows={3}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="start-date">Start Date *</label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="end-date">End Date *</label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="project-status">Status</label>
            <select
              id="project-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'completed')}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '14px',
                background: colors.white,
              }}
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Member Assignment Section */}
          <div className="member-assignment-section">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: colors.text.primary }}>
              Assign Members
            </h3>

            <div className="member-assignment-group">
              <div className="member-assignment-header">
                <div>
                  <label htmlFor="select-role" style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                    Select Role
                  </label>
                  <select
                    id="select-role"
                    value={currentRoleId}
                    onChange={(e) => handleRoleSelect(e.target.value)}
                    disabled={loading || loadingUsers}
                    className="member-select"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      fontSize: '14px',
                      background: colors.white,
                    }}
                  >
                    <option value="">-- Select a role --</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {currentRoleId && (
                <>
                  {loadingUsers ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: colors.text.secondary }}>
                      Loading users...
                    </div>
                  ) : usersForRole.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: colors.text.secondary }}>
                      No users found with this role
                    </div>
                  ) : (
                    <>
                      <div className="member-select-container">
                        <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
                          Select Users ({selectedUserIds.length} selected)
                        </label>
                        <div 
                          style={{
                            border: `1px solid ${colors.border}`,
                            borderRadius: '8px',
                            padding: '12px',
                            background: colors.white,
                            maxHeight: '200px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          {usersForRole.map((user) => {
                            const selectedRole = roles.find(r => r.id === currentRoleId);
                            const isSelected = selectedUserIds.includes(user.id);
                            return (
                              <label
                                key={user.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  padding: '10px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                                  border: `1px solid ${isSelected ? '#2563eb' : '#e2e8f0'}`,
                                  transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.backgroundColor = '#f8fafc';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedUserIds([...selectedUserIds, user.id]);
                                    } else {
                                      setSelectedUserIds(selectedUserIds.filter(id => id !== user.id));
                                    }
                                  }}
                                  disabled={loading}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    cursor: 'pointer',
                                  }}
                                />
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <span style={{ 
                                    fontSize: '14px', 
                                    fontWeight: '500', 
                                    color: colors.text.primary 
                                  }}>
                                    {user.email}
                                  </span>
                                  <span style={{ 
                                    fontSize: '12px', 
                                    color: colors.text.secondary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}>
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      background: '#dbeafe',
                                      color: '#1e40af',
                                      fontSize: '11px',
                                      fontWeight: '500',
                                    }}>
                                      {selectedRole?.name || 'N/A'}
                                    </span>
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddMembers}
                        disabled={loading || selectedUserIds.length === 0}
                        style={{
                          padding: '10px 20px',
                          border: 'none',
                          borderRadius: '6px',
                          background: colors.primary.main,
                          color: colors.white,
                          cursor: loading || selectedUserIds.length === 0 ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                          fontWeight: '500',
                          opacity: loading || selectedUserIds.length === 0 ? 0.5 : 1,
                          transition: 'all 0.2s',
                          width: '100%',
                        }}
                        onMouseEnter={(e) => {
                          if (!loading && selectedUserIds.length > 0) {
                            e.currentTarget.style.background = '#1d4ed8';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!loading && selectedUserIds.length > 0) {
                            e.currentTarget.style.background = colors.primary.main;
                          }
                        }}
                      >
                        {selectedUserIds.length > 0 
                          ? `Add ${selectedUserIds.length} Selected User${selectedUserIds.length > 1 ? 's' : ''}`
                          : 'Add Selected Users'}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Selected Members Preview */}
            {selectedMembers.length > 0 && (
              <div className="members-preview" style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${colors.border}` }}>
                <div className="members-preview-title" style={{ 
                  fontSize: '16px', 
                  fontWeight: '600', 
                  color: colors.text.primary,
                  marginBottom: '16px',
                }}>
                  Assigned Members ({selectedMembers.length})
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '12px',
                }}>
                  {selectedMembers.map((member) => (
                    <div 
                      key={`${member.user_id}-${member.role_id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: colors.white,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '8px',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#2563eb';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(37, 99, 235, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = colors.border;
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ 
                          fontSize: '14px', 
                          fontWeight: '500', 
                          color: colors.text.primary 
                        }}>
                          {member.user_email}
                        </span>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: '#dbeafe',
                          color: '#1e40af',
                          fontSize: '12px',
                          fontWeight: '500',
                          width: 'fit-content',
                        }}>
                          {member.role_name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.user_id)}
                        disabled={loading}
                        style={{
                          background: '#fee2e2',
                          border: 'none',
                          borderRadius: '4px',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          color: '#dc2626',
                          fontSize: '16px',
                          lineHeight: '1',
                          transition: 'all 0.2s',
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          if (!loading) {
                            e.currentTarget.style.background = '#fecaca';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!loading) {
                            e.currentTarget.style.background = '#fee2e2';
                          }
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="error-message" style={{ marginTop: '12px' }}>
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              style={{
                padding: '8px 16px',
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                background: colors.white,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || selectedMembers.length === 0}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: colors.primary.main,
                color: colors.white,
                cursor: loading || !title.trim() || selectedMembers.length === 0 ? 'not-allowed' : 'pointer',
                opacity: loading || !title.trim() || selectedMembers.length === 0 ? 0.5 : 1,
              }}
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

