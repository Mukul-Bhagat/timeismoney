import { useState, useEffect, FormEvent } from 'react';
import { supabase } from '../../config/supabase';
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

      setUsersForRole(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Format members for API
      const members = selectedMembers.map(m => ({
        user_id: m.user_id,
        role_id: m.role_id,
      }));

      const response = await fetch('http://localhost:5000/api/projects', {
        method: 'POST',
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
          members,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create project');
      }

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
      setError(err.message || 'Failed to create project');
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
                        <div style={{ fontSize: '12px', color: colors.text.secondary, marginTop: '4px' }}>
                          Hold Ctrl/Cmd to select multiple users
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddMembers}
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
                        }}
                      >
                        Add Selected Users
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Selected Members Preview */}
            {selectedMembers.length > 0 && (
              <div className="members-preview">
                <div className="members-preview-title">Selected Members ({selectedMembers.length})</div>
                <div className="members-preview-list">
                  {selectedMembers.map((member) => (
                    <div key={`${member.user_id}-${member.role_id}`} className="selected-member-tag">
                      <span>{member.user_email} - {member.role_name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.user_id)}
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

