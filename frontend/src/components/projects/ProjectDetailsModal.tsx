import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '../../config/supabase';
import { colors } from '../../config/colors';
import type { ProjectWithMembers, ProjectMember, Role } from '../../types';
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

export function ProjectDetailsModal({
  isOpen,
  project,
  onClose,
  onUpdate,
}: ProjectDetailsModalProps) {
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
      fetchRoles();
    }
  }, [isOpen, project]);

  const fetchRoles = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('http://localhost:5000/api/roles', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch roles');
      }

      setRoles(data.roles || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch roles');
    }
  };

  const handleRoleSelect = async (roleId: string) => {
    setCurrentRoleId(roleId);
    setSelectedUserIds([]);
    setLoadingUsers(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(`http://localhost:5000/api/roles/${roleId}/users`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch users');
      }

      // Filter out users already in the project
      const existingUserIds = members.map(m => m.user_id);
      const availableUsers = (data.users || []).filter((u: { id: string }) => !existingUserIds.includes(u.id));
      
      setUsersForRole(availableUsers);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Get updated members list (without the removed one)
      const updatedMembers = members
        .filter(m => m.id !== memberId)
        .map(m => ({
          user_id: m.user_id,
          role_id: m.role_id,
        }));

      const response = await fetch(`http://localhost:5000/api/projects/${project.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          members: updatedMembers,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to remove member');
      }

      // Update local state
      setMembers(members.filter(m => m.id !== memberId));
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const saveProject = async () => {
    if (!project) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

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

      const response = await fetch(`http://localhost:5000/api/projects/${project.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          start_date: startDate,
          end_date: endDate,
          status,
          members: allMembers,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update project');
      }

      setIsEditMode(false);
      setNewMembers([]);
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to update project');
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
              <div className="members-grouped">
                <div className="members-group-title">Current Members</div>
                {Object.entries(membersByRole).map(([roleName, roleMembers]) => (
                  <div key={roleName} className="members-group">
                    <div className="members-group-title">{roleName}</div>
                    <div className="members-group-list">
                      {roleMembers.map((member) => (
                        <div key={member.id} className="member-item">
                          <span>{member.user?.email || 'Unknown'}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={loading || removingMemberId === member.id}
                            className="remove-member-link"
                          >
                            {removingMemberId === member.id ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {members.length === 0 && (
                  <div style={{ padding: '12px', color: colors.text.secondary }}>
                    No members assigned
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
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                            Select Users (multiple selection)
                          </label>
                          <select
                            multiple
                            value={selectedUserIds}
                            onChange={(e) => {
                              const values = Array.from(e.target.selectedOptions, option => option.value);
                              setSelectedUserIds(values);
                            }}
                            disabled={loading}
                            className="member-select"
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              border: `1px solid ${colors.border}`,
                              borderRadius: '4px',
                              fontSize: '14px',
                              background: colors.white,
                              minHeight: '120px',
                            }}
                          >
                            {usersForRole.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.email}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={handleAddNewMembers}
                          disabled={loading || selectedUserIds.length === 0}
                          style={{
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '4px',
                            background: colors.primary.main,
                            color: colors.white,
                            cursor: loading || selectedUserIds.length === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            opacity: loading || selectedUserIds.length === 0 ? 0.5 : 1,
                            marginTop: '8px',
                          }}
                        >
                          Add Selected Users
                        </button>
                      </>
                    )}
                  </>
                )}

                {/* New Members Preview */}
                {newMembers.length > 0 && (
                  <div className="members-preview" style={{ marginTop: '16px' }}>
                    <div className="members-preview-title">New Members to Add ({newMembers.length})</div>
                    <div className="members-preview-list">
                      {newMembers.map((member) => (
                        <div key={`${member.user_id}-${member.role_id}`} className="selected-member-tag">
                          <span>{member.user_email} - {member.role_name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveNewMember(member.user_id)}
                            className="remove-member-btn"
                            disabled={loading}
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
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 8px 0', color: colors.text.primary }}>{project.title}</h3>
              {project.description && (
                <p style={{ margin: '0 0 16px 0', color: colors.text.secondary }}>
                  {project.description}
                </p>
              )}
              <div style={{ display: 'flex', gap: '24px', marginBottom: '16px' }}>
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
              </div>
            </div>

            <div className="members-grouped">
              <h3 style={{ margin: '0 0 16px 0', color: colors.text.primary }}>
                Members ({members.length})
              </h3>
              {Object.entries(membersByRole).map(([roleName, roleMembers]) => (
                <div key={roleName} className="members-group">
                  <div className="members-group-title">{roleName}</div>
                  <div className="members-group-list">
                    {roleMembers.map((member) => (
                      <div key={member.id} className="member-item">
                        <span>{member.user?.email || 'Unknown'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {members.length === 0 && (
                <div style={{ padding: '12px', color: colors.text.secondary }}>
                  No members assigned to this project
                </div>
              )}
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
      </div>
    </div>
  );
}

