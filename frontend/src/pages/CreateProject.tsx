import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';
import { colors } from '../config/colors';
import type { Role, User, ProjectType } from '../types';
import './CreateProject.css';

type Step = 'basic' | 'type' | 'details';

interface SelectedMember {
  user_id: string;
  role_id: string;
  user_email: string;
  role_name: string;
}

export function CreateProject() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>('basic');
  
  // Step 1: Basic Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Step 2: Project Type Selection
  const [projectType, setProjectType] = useState<ProjectType | null>(null);
  
  // Step 3: Type-specific Details
  // Type A (Simple)
  const [dailyHours, setDailyHours] = useState(8);
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);
  
  // Both Types: Project Managers (up to 2)
  const [projectManager1, setProjectManager1] = useState<string>('');
  const [projectManager2, setProjectManager2] = useState<string>('');
  
  // Data loading
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [usersForRole, setUsersForRole] = useState<User[]>([]);
  const [currentRoleId, setCurrentRoleId] = useState<string>('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Set default dates
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setDate(today.getDate() + 30);
    setStartDate(today.toISOString().split('T')[0]);
    setEndDate(nextMonth.toISOString().split('T')[0]);
    
    fetchRoles();
    fetchUsers();
    fetchManagers();
  }, []);

  const fetchRoles = async () => {
    try {
      const response = await api.get('/api/roles');
      setRoles(response.data.roles || []);
    } catch (err) {
      console.error('Error fetching roles:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get('/api/users');
      setUsers(response.data.users || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchManagers = async () => {
    try {
      const response = await api.get('/api/users/managers');
      setManagers(response.data.managers || []);
    } catch (err) {
      console.error('Error fetching managers:', err);
      // PM is optional, so don't show error
    }
  };

  const handleRoleSelect = async (roleId: string) => {
    setCurrentRoleId(roleId);
    setSelectedUserIds([]);
    setLoadingUsers(true);

    try {
      const response = await api.get(`/api/roles/${roleId}/users`);
      // Filter out already selected users
      const existingUserIds = selectedMembers.map(m => m.user_id);
      const availableUsers = (response.data.users || []).filter(
        (u: User) => !existingUserIds.includes(u.id)
      );
      setUsersForRole(availableUsers);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddMembers = () => {
    if (!currentRoleId || selectedUserIds.length === 0) return;

    const selectedRole = roles.find(r => r.id === currentRoleId);
    if (!selectedRole) return;

    const newMembers: SelectedMember[] = selectedUserIds.map(userId => {
      const user = usersForRole.find(u => u.id === userId);
      return {
        user_id: userId,
        role_id: currentRoleId,
        user_email: user?.email || '',
        role_name: selectedRole.name,
      };
    });

    setSelectedMembers([...selectedMembers, ...newMembers]);
    setCurrentRoleId('');
    setSelectedUserIds([]);
    setUsersForRole([]);
  };

  const handleRemoveMember = (userId: string) => {
    setSelectedMembers(selectedMembers.filter(m => m.user_id !== userId));
  };

  const validateStep = (step: Step): boolean => {
    setError(null);

    if (step === 'basic') {
      if (!title.trim()) {
        setError('Project title is required');
        return false;
      }
      if (!startDate || !endDate) {
        setError('Start date and end date are required');
        return false;
      }
      if (new Date(startDate) > new Date(endDate)) {
        setError('Start date must be before or equal to end date');
        return false;
      }
      return true;
    }

    if (step === 'type') {
      if (!projectType) {
        setError('Please select a project type');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (currentStep === 'basic' && validateStep('basic')) {
      setCurrentStep('type');
    } else if (currentStep === 'type' && validateStep('type')) {
      setCurrentStep('details');
    }
  };

  const handleBack = () => {
    if (currentStep === 'details') {
      setCurrentStep('type');
    } else if (currentStep === 'type') {
      setCurrentStep('basic');
    }
  };

  const handleCreate = async () => {
    if (!validateStep('details')) return;

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        project_type: projectType,
        project_manager_1_id: projectManager1 || null,
        project_manager_2_id: projectManager2 || null,
      };

      if (projectType === 'simple') {
        payload.daily_working_hours = dailyHours;
        if (selectedMembers.length > 0) {
          payload.members = selectedMembers.map(m => ({
            user_id: m.user_id,
            role_id: m.role_id,
          }));
        }
      }

      const response = await api.post('/api/projects', payload);

      if (response.data.success) {
        if (projectType === 'simple') {
          // Navigate back to projects list
          navigate('/projects');
        } else {
          // Navigate to planning sheet
          navigate(`/project/${response.data.project.id}/planning`);
        }
      } else {
        throw new Error(response.data.message || 'Failed to create project');
      }
    } catch (err: any) {
      console.error('❌ CREATE PROJECT ERROR:', err);
      console.error('Response data:', err.response?.data);
      
      const errorMessage = 
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to create project. Please check the console for details.';
      
      setError(errorMessage);
      
      // Also alert for immediate visibility during testing
      alert('Project creation failed: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderBasicDetails = () => (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '24px' }}>
        Project Basic Information
      </h2>

      <div className="form-group">
        <label htmlFor="project-title">Project Title *</label>
        <input
          id="project-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Website Redesign"
          disabled={loading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="project-description">Description</label>
        <textarea
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Project description..."
          rows={4}
          disabled={loading}
        />
      </div>

      <div className="form-grid-2">
        <div className="form-group">
          <label htmlFor="start-date">Start Date *</label>
          <input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="end-date">End Date *</label>
          <input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );

  const renderProjectTypeSelection = () => (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
        Select Project Type
      </h2>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
        Choose the type that best fits your project needs
      </p>

      <div className="project-type-cards">
        <div
          className={`project-type-card ${projectType === 'simple' ? 'selected' : ''}`}
          onClick={() => setProjectType('simple')}
        >
          <div className="project-type-card-icon">⚡</div>
          <div className="project-type-card-title">Type A: Simple Daily Working</div>
          <div className="project-type-card-description">
            For regular projects with daily time tracking. Set default working hours and assign team members right away.
          </div>
        </div>

        <div
          className={`project-type-card ${projectType === 'planned' ? 'selected' : ''}`}
          onClick={() => setProjectType('planned')}
        >
          <div className="project-type-card-icon">📊</div>
          <div className="project-type-card-title">Type B: Planned / Cost-Based</div>
          <div className="project-type-card-description">
            For projects requiring detailed planning. Create cost estimates, allocate hours weekly, and track profitability.
          </div>
        </div>
      </div>
    </div>
  );

  const renderTypeADetails = () => (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '24px' }}>
        Type A: Simple Daily Working Project
      </h2>

      <div className="form-group">
        <label htmlFor="daily-hours">Default Daily Working Hours</label>
        <div className="daily-hours-input">
          <input
            id="daily-hours"
            type="number"
            value={dailyHours}
            onChange={(e) => setDailyHours(parseInt(e.target.value) || 8)}
            min="1"
            max="24"
            disabled={loading}
          />
          <span style={{ fontSize: '16px', color: '#6b7280' }}>hours per day</span>
        </div>
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
          This will be the default when team members log their daily timesheet entries.
        </p>
      </div>

      {/* Project Managers */}
      <div className="form-group">
        <label>Assign Project Managers (Optional)</label>
        <div className="form-grid-2" style={{ marginTop: '12px' }}>
          <select
            value={projectManager1}
            onChange={(e) => setProjectManager1(e.target.value)}
            disabled={loading}
            style={{
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="">-- Primary PM --</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>

          <select
            value={projectManager2}
            onChange={(e) => setProjectManager2(e.target.value)}
            disabled={loading}
            style={{
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="">-- Secondary PM --</option>
            {users.filter(u => u.id !== projectManager1).map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Member Assignment (Optional) */}
      <div className="form-group">
        <label>Assign Team Members (Optional)</label>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
          You can assign members now or add them later from the project details page.
        </p>

        <select
          value={currentRoleId}
          onChange={(e) => handleRoleSelect(e.target.value)}
          disabled={loading || loadingUsers}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            marginBottom: '12px',
          }}
        >
          <option value="">-- Select a role --</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>

        {currentRoleId && (
          <>
            {loadingUsers ? (
              <div style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                Loading users...
              </div>
            ) : usersForRole.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: '#6b7280' }}>
                No available users with this role
              </div>
            ) : (
              <>
                <div style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  padding: '12px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  marginBottom: '12px',
                }}>
                  {usersForRole.map((user) => {
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
                          marginBottom: '8px',
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
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px', color: '#111827' }}>
                          {user.email}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleAddMembers}
                  disabled={loading || selectedUserIds.length === 0}
                  className="create-project-button create-project-button-primary"
                  style={{ width: '100%' }}
                >
                  Add {selectedUserIds.length > 0 ? selectedUserIds.length : ''} Selected User{selectedUserIds.length !== 1 ? 's' : ''}
                </button>
              </>
            )}
          </>
        )}

        {selectedMembers.length > 0 && (
          <div className="member-assignment-preview">
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
              Assigned Members ({selectedMembers.length})
            </div>
            <div className="member-preview-grid">
              {selectedMembers.map((member) => (
                <div key={`${member.user_id}-${member.role_id}`} className="member-preview-card">
                  <div className="member-preview-info">
                    <div className="member-preview-email">{member.user_email}</div>
                    <span className="member-preview-role">{member.role_name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.user_id)}
                    disabled={loading}
                    className="remove-member-button"
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
  );

  const renderTypeBDetails = () => (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '24px' }}>
        Type B: Planned / Cost-Based Project
      </h2>

      <div style={{
        padding: '16px',
        background: '#eff6ff',
        border: '1px solid #3b82f6',
        borderRadius: '8px',
        marginBottom: '24px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e40af', marginBottom: '8px' }}>
          📊 Next Step: Planning Sheet
        </div>
        <div style={{ fontSize: '14px', color: '#1e3a8a', lineHeight: '1.5' }}>
          After creating this project, you'll be taken to the planning sheet where you can:
          <ul style={{ marginTop: '8px', marginBottom: '0', paddingLeft: '20px' }}>
            <li>Allocate hours by role and week</li>
            <li>Set hourly rates and calculate costs</li>
            <li>Define customer pricing and track margins</li>
            <li>Assign team members after planning is complete</li>
          </ul>
        </div>
      </div>

      {/* Project Managers */}
      <div className="form-group">
        <label>Assign Project Managers (Optional)</label>
        <div className="form-grid-2" style={{ marginTop: '12px' }}>
          <select
            value={projectManager1}
            onChange={(e) => setProjectManager1(e.target.value)}
            disabled={loading}
            style={{
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="">None (Optional)</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.email}
              </option>
            ))}
          </select>

          <select
            value={projectManager2}
            onChange={(e) => setProjectManager2(e.target.value)}
            disabled={loading}
            style={{
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="">None (Optional)</option>
            {managers.filter(m => m.id !== projectManager1).map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.email}
              </option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
          Only users with MANAGER role can be assigned. Project managers can view planning, review submissions, and access reports.
        </p>
      </div>

      <div style={{
        padding: '16px',
        background: '#fef3c7',
        border: '1px solid #f59e0b',
        borderRadius: '8px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '4px' }}>
          ⚠️ Note
        </div>
        <div style={{ fontSize: '14px', color: '#78350f' }}>
          Team members cannot be assigned during creation for Type B projects. Complete the planning sheet first, then assign team members.
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 'basic':
        return renderBasicDetails();
      case 'type':
        return renderProjectTypeSelection();
      case 'details':
        return projectType === 'simple' ? renderTypeADetails() : renderTypeBDetails();
      default:
        return null;
    }
  };

  const getStepNumber = (step: Step): number => {
    const steps = ['basic', 'type', 'details'];
    return steps.indexOf(step) + 1;
  };

  const currentStepNumber = getStepNumber(currentStep);

  return (
    <div className="create-project-page">
      <div className="create-project-container">
        <div className="create-project-header">
          <h1>Create New Project</h1>
          <div className="step-indicator">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`step-dot ${
                  step < currentStepNumber ? 'completed' :
                  step === currentStepNumber ? 'active' : 'pending'
                }`}
              >
                {step < currentStepNumber ? '✓' : step}
              </div>
            ))}
          </div>
        </div>

        <div className="create-project-content">
          {error && <div className="error-message">{error}</div>}
          {renderStepContent()}
        </div>

        <div className="create-project-actions">
          <div>
            <button
              type="button"
              onClick={() => navigate('/projects')}
              disabled={loading}
              className="create-project-button create-project-button-secondary"
            >
              Cancel
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {currentStep !== 'basic' && (
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="create-project-button create-project-button-secondary"
              >
                Back
              </button>
            )}
            {currentStep !== 'details' ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={loading}
                className="create-project-button create-project-button-primary"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={loading}
                className="create-project-button create-project-button-primary"
              >
                {loading ? 'Creating...' : 
                 projectType === 'planned' ? 'Create & Open Planning' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

