import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import { colors } from '../../config/colors';
import type { ProjectWithMembers, ProjectMember, Role } from '../../types';
import { ProjectPlanningSection } from './ProjectPlanningSection';
import { ProjectReportsSection } from './ProjectReportsSection';
import './Projects.css';
import '../roles/Roles.css';

interface ProjectDetailsModalProps {
  isOpen: boolean;
  project: ProjectWithMembers | null;
  onClose: () => void;
  onUpdate: () => void;
}

interface SelectedMember {
  user_id: string;
  role_id: string;
  user_email: string;
  role_name: string;
}

type TabType = 'overview' | 'members' | 'planning' | 'reports';

export function ProjectDetailsModal({
  isOpen,
  project,
  onClose,
  onUpdate,
}: ProjectDetailsModalProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isEditMode, setIsEditMode] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'active' | 'completed'>('active');
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [currentRoleId, setCurrentRoleId] = useState<string>('');
  const [usersForRole, setUsersForRole] = useState<Array<{ id: string; email: string }>>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [newMembers, setNewMembers] = useState<SelectedMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && project) {
      setTitle(project.title);
      setDescription(project.description || '');
      setStartDate(project.start_date.split('T')[0]);
      setEndDate(project.end_date.split('T')[0]);
      setStatus(project.status);
      setMembers(project.members || []);
      setIsEditMode(false);
      setNewMembers([]);
      setActiveTab('overview');
      fetchRoles();
    }
  }, [isOpen, project]);

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
        // Filter out users already in the project
        const existingUserIds = members.map(m => m.user_id);
        const availableUsers = (response.data.users || []).filter((u: { id: string }) => !existingUserIds.includes(u.id));
        
        setUsersForRole(availableUsers);
      } else {
        throw new Error(response.data.message || 'Failed to fetch users');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddNewMembers = () => {
    if (!currentRoleId || selectedUserIds.length === 0) {
      return;
    }

    const selectedRole = roles.find(r => r.id === currentRoleId);
    if (!selectedRole) return;

    const newMembersToAdd: SelectedMember[] = selectedUserIds.map(userId => {
      const user = usersForRole.find(u => u.id === userId);
      return {
        user_id: userId,
        role_id: currentRoleId,
        user_email: user?.email || '',
        role_name: selectedRole.name,
      };
    });

    setNewMembers([...newMembers, ...newMembersToAdd]);
    setCurrentRoleId('');
    setSelectedUserIds([]);
    setUsersForRole([]);
  };

  const handleRemoveNewMember = (userId: string) => {
    setNewMembers(newMembers.filter(m => m.user_id !== userId));
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!project) return;

    setRemovingMemberId(memberId);
    setError(null);

    try {
      const memberToRemove = members.find(m => m.id === memberId);
      if (!memberToRemove) return;

      // If in edit mode, just remove from local state (will save on submit)
      if (isEditMode) {
        setMembers(members.filter(m => m.id !== memberId));
        setRemovingMemberId(null);
        return;
      }

      // If in view mode, update immediately via API
      // Get updated members list (without the removed one)
      const updatedMembers = members
        .filter(m => m.id !== memberId)
        .map(m => ({
          user_id: m.user_id,
          role_id: m.role_id,
        }));

      const response = await api.put(`/api/projects/${project.id}`, {
        members: updatedMembers,
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to remove member');
      }

      // Update local state
      setMembers(members.filter(m => m.id !== memberId));
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to remove member');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const saveProject = async () => {
    if (!project) return;

    setLoading(true);
    setError(null);

    try {
      // Combine existing members (minus removed ones) with new members
      const allMembers = [
        ...members.map(m => ({
          user_id: m.user_id,
          role_id: m.role_id,
        })),
        ...newMembers.map(m => ({
          user_id: m.user_id,
          role_id: m.role_id,
        })),
      ];

      const response = await api.put(`/api/projects/${project.id}`, {
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate,
        end_date: endDate,
        status,
        members: allMembers,
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to update project');
      }

      setIsEditMode(false);
      setNewMembers([]);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to update project');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await saveProject();
  };

  const handleClose = () => {
    if (!loading) {
      setIsEditMode(false);
      setNewMembers([]);
      setCurrentRoleId('');
      setSelectedUserIds([]);
      setUsersForRole([]);
      setError(null);
      onClose();
    }
  };

  if (!isOpen || !project) return null;

  // Group members by role
  const membersByRole = members.reduce((acc, member) => {
    const roleName = member.role?.name || 'Unknown';
    if (!acc[roleName]) {
      acc[roleName] = [];
    }
    acc[roleName].push(member);
    return acc;
  }, {} as Record<string, ProjectMember[]>);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content modal-content-large"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{isEditMode ? 'Edit Project' : 'Project Details'}</h2>
          <button className="modal-close" onClick={handleClose} disabled={loading}>
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

        {isEditMode ? (
          <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
            <div className="form-group">
              <label htmlFor="edit-title">Project Title *</label>
              <input
                id="edit-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
              <label htmlFor="edit-description">Description</label>
              <textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                <label htmlFor="edit-start-date">Start Date *</label>
                <input
                  id="edit-start-date"
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
                <label htmlFor="edit-end-date">End Date *</label>
                <input
                  id="edit-end-date"
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
              <label htmlFor="edit-status">Status</label>
              <select
                id="edit-status"
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

            {/* Members Management */}
            <div className="member-assignment-section">
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: colors.text.primary }}>
                Manage Members
              </h3>

              {/* Current Members */}
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: colors.text.primary,
                  marginBottom: '16px',
                }}>
                  Current Members ({members.length})
                </div>
                {Object.entries(membersByRole).map(([roleName, roleMembers]) => (
                  <div key={roleName} style={{ marginBottom: '20px' }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: colors.text.primary,
                      marginBottom: '12px',
                      paddingBottom: '8px',
                      borderBottom: `1px solid ${colors.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: '#dbeafe',
                        color: '#1e40af',
                        fontSize: '11px',
                        fontWeight: '600',
                      }}>
                        {roleName}
                      </span>
                      <span style={{ fontSize: '11px', color: colors.text.secondary }}>
                        ({roleMembers.length})
                      </span>
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '12px',
                    }}>
                      {roleMembers.map((member) => (
                        <div 
                          key={member.id}
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
                              {member.user?.email || 'Unknown'}
                            </span>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: '#f1f5f9',
                              color: '#475569',
                              fontSize: '11px',
                              fontWeight: '500',
                              width: 'fit-content',
                            }}>
                              {roleName}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={loading || removingMemberId === member.id}
                            style={{
                              background: '#fee2e2',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 10px',
                              cursor: loading || removingMemberId === member.id ? 'not-allowed' : 'pointer',
                              color: '#dc2626',
                              fontSize: '12px',
                              fontWeight: '500',
                              transition: 'all 0.2s',
                              flexShrink: 0,
                            }}
                            onMouseEnter={(e) => {
                              if (!loading && removingMemberId !== member.id) {
                                e.currentTarget.style.background = '#fecaca';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!loading && removingMemberId !== member.id) {
                                e.currentTarget.style.background = '#fee2e2';
                              }
                            }}
                          >
                            {removingMemberId === member.id ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {members.length === 0 && (
                  <div style={{ 
                    padding: '24px', 
                    textAlign: 'center',
                    color: colors.text.secondary,
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: `1px dashed ${colors.border}`,
                  }}>
                    <div style={{ fontSize: '14px', marginBottom: '4px' }}>No members assigned</div>
                    <div style={{ fontSize: '12px' }}>Add members to this project below</div>
                  </div>
                )}
              </div>

              {/* Add New Members */}
              <div className="member-assignment-group" style={{ marginTop: '16px' }}>
                <div className="member-assignment-header">
                  <div style={{ width: '100%' }}>
                    <label htmlFor="edit-select-role" style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                      Add Members by Role
                    </label>
                    <select
                      id="edit-select-role"
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
                        No available users with this role
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
                          onClick={handleAddNewMembers}
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
                            marginTop: '12px',
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

                {/* New Members Preview */}
                {newMembers.length > 0 && (
                  <div style={{ 
                    marginTop: '24px', 
                    paddingTop: '24px', 
                    borderTop: `1px solid ${colors.border}` 
                  }}>
                    <div style={{ 
                      fontSize: '16px', 
                      fontWeight: '600', 
                      color: colors.text.primary,
                      marginBottom: '16px',
                    }}>
                      New Members to Add ({newMembers.length})
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '12px',
                    }}>
                      {newMembers.map((member) => (
                        <div 
                          key={`${member.user_id}-${member.role_id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            background: '#eff6ff',
                            border: `1px solid #93c5fd`,
                            borderRadius: '8px',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#2563eb';
                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(37, 99, 235, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#93c5fd';
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
                            onClick={() => handleRemoveNewMember(member.user_id)}
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
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setIsEditMode(false);
                  setNewMembers([]);
                  setCurrentRoleId('');
                  setSelectedUserIds([]);
                  setUsersForRole([]);
                  // Reset form
                  if (project) {
                    setTitle(project.title);
                    setDescription(project.description || '');
                    setStartDate(project.start_date.split('T')[0]);
                    setEndDate(project.end_date.split('T')[0]);
                    setStatus(project.status);
                    setMembers(project.members || []);
                  }
                }}
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
                disabled={loading || !title.trim()}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  background: colors.primary.main,
                  color: colors.white,
                  cursor: loading || !title.trim() ? 'not-allowed' : 'pointer',
                  opacity: loading || !title.trim() ? 0.5 : 1,
                }}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            {/* Tab Navigation */}
            <div style={{
              display: 'flex',
              borderBottom: `2px solid ${colors.border}`,
              background: '#f9fafb',
              paddingLeft: '20px',
            }}>
              {[
                { id: 'overview' as TabType, label: 'Overview', icon: '📋' },
                { id: 'members' as TabType, label: 'Members', icon: '👥' },
                { id: 'planning' as TabType, label: 'Cost Planning', icon: '💰' },
                { id: 'reports' as TabType, label: 'Reports', icon: '📊' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '12px 24px',
                    border: 'none',
                    background: activeTab === tab.id ? colors.white : 'transparent',
                    color: activeTab === tab.id ? colors.primary.main : colors.text.secondary,
                    fontWeight: activeTab === tab.id ? '600' : '500',
                    fontSize: '14px',
                    cursor: 'pointer',
                    borderBottom: activeTab === tab.id ? `3px solid ${colors.primary.main}` : '3px solid transparent',
                    marginBottom: '-2px',
                    transition: 'all 0.2s',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ padding: '20px', maxHeight: 'calc(80vh - 150px)', overflowY: 'auto' }}>
              {activeTab === 'overview' && (
                <div>
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: colors.text.primary }}>{project.title}</h3>
                    {project.description && (
                      <p style={{ margin: '0 0 16px 0', color: colors.text.secondary }}>
                        {project.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', flexWrap: 'wrap' }}>
                      <div>
                        <strong style={{ color: colors.text.secondary }}>Start Date:</strong>{' '}
                        <span style={{ color: colors.text.primary }}>{formatDate(project.start_date)}</span>
                      </div>
                      <div>
                        <strong style={{ color: colors.text.secondary }}>End Date:</strong>{' '}
                        <span style={{ color: colors.text.primary }}>{formatDate(project.end_date)}</span>
                      </div>
                      <div>
                        <strong style={{ color: colors.text.secondary }}>Status:</strong>{' '}
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                            background: project.status === 'active' ? '#d1fae5' : '#e0e7ff',
                            color: project.status === 'active' ? '#065f46' : '#3730a3',
                          }}
                        >
                          {project.status === 'active' ? 'Active' : 'Completed'}
                        </span>
                      </div>
                      <div>
                        <strong style={{ color: colors.text.secondary }}>Planning Status:</strong>{' '}
                        <span
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                            background: project.setup_status === 'setup_done' ? '#d1fae5' : '#fef3c7',
                            color: project.setup_status === 'setup_done' ? '#065f46' : '#92400e',
                          }}
                        >
                          {project.setup_status === 'setup_done' ? '🟢 Ready' : '🟡 Draft'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      onClick={handleClose}
                      style={{
                        padding: '8px 16px',
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        background: colors.white,
                        cursor: 'pointer',
                      }}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditMode(true)}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '4px',
                        background: colors.primary.main,
                        color: colors.white,
                        cursor: 'pointer',
                      }}
                    >
                      Edit Project
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'members' && (
                <div className="members-grouped">
                  <h3 style={{ margin: '0 0 20px 0', color: colors.text.primary, fontSize: '18px', fontWeight: '600' }}>
                    Project Members ({members.length})
                  </h3>
                  {Object.entries(membersByRole).map(([roleName, roleMembers]) => (
                    <div key={roleName} style={{ marginBottom: '24px' }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: colors.text.primary,
                        marginBottom: '12px',
                        paddingBottom: '8px',
                        borderBottom: `2px solid ${colors.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: '#dbeafe',
                          color: '#1e40af',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}>
                          {roleName}
                        </span>
                        <span style={{ fontSize: '12px', color: colors.text.secondary }}>
                          ({roleMembers.length} {roleMembers.length === 1 ? 'member' : 'members'})
                        </span>
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '12px',
                      }}>
                        {roleMembers.map((member) => (
                          <div 
                            key={member.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '14px 16px',
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
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <span style={{ 
                                fontSize: '14px', 
                                fontWeight: '500', 
                                color: colors.text.primary 
                              }}>
                                {member.user?.email || 'Unknown'}
                              </span>
                              <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: '#f1f5f9',
                                color: '#475569',
                                fontSize: '11px',
                                fontWeight: '500',
                                width: 'fit-content',
                              }}>
                                {roleName}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <div style={{ 
                      padding: '24px', 
                      textAlign: 'center',
                      color: colors.text.secondary,
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: `1px dashed ${colors.border}`,
                    }}>
                      <div style={{ fontSize: '14px', marginBottom: '4px' }}>No members assigned</div>
                      <div style={{ fontSize: '12px' }}>Add members to this project to get started</div>
                    </div>
                  )}

                  <div className="modal-actions" style={{ marginTop: '24px' }}>
                    <button
                      type="button"
                      onClick={() => setIsEditMode(true)}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '4px',
                        background: colors.primary.main,
                        color: colors.white,
                        cursor: 'pointer',
                      }}
                    >
                      Manage Members
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'planning' && (
                <ProjectPlanningSection 
                  projectId={project.id} 
                  onUpdate={() => {
                    onUpdate();
                    // Refresh project data to update setup_status badge
                  }}
                />
              )}

              {activeTab === 'reports' && (
                <ProjectReportsSection projectId={project.id} />
              )}
            </div>

            {activeTab !== 'overview' && activeTab !== 'reports' && (
              <div style={{ 
                padding: '16px 20px', 
                borderTop: `1px solid ${colors.border}`,
                display: 'flex',
                justifyContent: 'flex-end',
              }}>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    padding: '8px 16px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '4px',
                    background: colors.white,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

