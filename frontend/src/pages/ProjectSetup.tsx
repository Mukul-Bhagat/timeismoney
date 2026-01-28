import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../config/api';
import { ProjectBrand } from '../components/common/ProjectBrand';
import type {
  ProjectSetupData,
  ProjectRoleAllocation,
  Role,
  User,
  MarginStatus,
} from '../types';
import './Page.css';
import './ProjectSetup.css';

export function ProjectSetup() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // State
  const [setupData, setSetupData] = useState<ProjectSetupData | null>(null);
  const [allocations, setAllocations] = useState<ProjectRoleAllocation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [customerRate, setCustomerRate] = useState<number>(0);
  const [soldCostPercentage, setSoldCostPercentage] = useState<number>(11);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');

  // Fetch initial data
  useEffect(() => {
    if (projectId) {
      fetchProjectSetup();
      fetchRoles();
      fetchUsers();
    }
  }, [projectId]);

  const fetchProjectSetup = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/project-setup/${projectId}`);
      const data: ProjectSetupData = response.data.data;
      
      setSetupData(data);
      setAllocations(data.allocations || []);
      setCustomerRate(data.setup.customer_rate_per_hour || 0);
      setSoldCostPercentage(data.setup.sold_cost_percentage || 11);
    } catch (err: any) {
      console.error('Error fetching project setup:', err);
      setError(err.response?.data?.message || 'Failed to load project setup');
    } finally {
      setLoading(false);
    }
  };

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

  // Filter users by role
  const filterUsersByRole = useCallback(
    (_roleId: string) => {
      // This function is kept for compatibility but doesn't need to do anything
      // since users are fetched per role in the actual implementation
    },
    []
  );

  // Calculate totals for a single allocation
  const calculateAllocationTotals = (allocation: ProjectRoleAllocation): { totalHours: number; totalAmount: number } => {
    const weeklyHours = allocation.weekly_hours || [];
    const totalHours = weeklyHours.reduce((sum: number, week: any) => sum + (week.hours || 0), 0);
    const totalAmount = totalHours * (allocation.hourly_rate || 0);
    
    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  };

  // Calculate project-wide totals
  const calculateProjectTotals = useCallback(() => {
    const totalHours = allocations.reduce((sum, alloc) => {
      const { totalHours } = calculateAllocationTotals(alloc);
      return sum + totalHours;
    }, 0);

    const totalCost = allocations.reduce((sum, alloc) => {
      const { totalAmount } = calculateAllocationTotals(alloc);
      return sum + totalAmount;
    }, 0);

    const customerAmount = totalHours * customerRate;
    const grossMargin = customerAmount > 0 ? ((customerAmount - totalCost) / customerAmount) * 100 : 0;
    const currentMargin = grossMargin - soldCostPercentage;

    let marginStatus: MarginStatus = 'green';
    if (currentMargin <= 5) {
      marginStatus = 'red';
    } else if (currentMargin <= 19) {
      marginStatus = 'yellow';
    }

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      customerAmount: Math.round(customerAmount * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      currentMargin: Math.round(currentMargin * 100) / 100,
      marginStatus,
    };
  }, [allocations, customerRate, soldCostPercentage]);

  // Add new allocation row
  const handleAddRow = async () => {
    if (!selectedRole || !projectId) return;

    setSaving(true);
    try {
      const response = await api.post(`/api/project-setup/${projectId}/allocations`, {
        role_id: selectedRole,
        user_id: null, // Will be filled in later
        hourly_rate: 0,
      });

      const newAllocation = response.data.data;
      setAllocations([...allocations, newAllocation]);
      setSelectedRole('');
    } catch (err: any) {
      console.error('Error adding allocation:', err);
      alert(err.response?.data?.message || 'Failed to add allocation');
    } finally {
      setSaving(false);
    }
  };

  // Update allocation field
  const handleUpdateAllocation = async (allocationId: string, field: string, value: any) => {
    if (!projectId) return;

    try {
      await api.put(`/api/project-setup/${projectId}/allocations/${allocationId}`, {
        [field]: value,
      });

      // Update local state
      setAllocations(allocations.map(alloc => 
        alloc.id === allocationId ? { ...alloc, [field]: value } : alloc
      ));
    } catch (err: any) {
      console.error('Error updating allocation:', err);
      alert(err.response?.data?.message || 'Failed to update allocation');
    }
  };

  // Update weekly hours
  const handleUpdateWeekHours = async (allocationId: string, weekNumber: number, hours: number) => {
    if (!projectId) return;

    // Update local state immediately
    setAllocations(allocations.map(alloc => {
      if (alloc.id !== allocationId) return alloc;

      const weeklyHours = alloc.weekly_hours || [];
      const existingWeek = weeklyHours.find((w: any) => w.week_number === weekNumber);

      if (existingWeek) {
        return {
          ...alloc,
          weekly_hours: weeklyHours.map((w: any) =>
            w.week_number === weekNumber ? { ...w, hours } : w
          ),
        };
      } else {
        return {
          ...alloc,
          weekly_hours: [
            ...weeklyHours,
            {
              id: `temp-${Date.now()}`,
              allocation_id: allocationId,
              week_number: weekNumber,
              hours,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        };
      }
    }));

    // Debounce the API call (in production, use a proper debounce)
    // For now, we'll just call immediately
    try {
      const alloc = allocations.find(a => a.id === allocationId);
      if (!alloc) return;

      const weeklyHours = alloc.weekly_hours || [];
      const updatedWeeks = weeklyHours.map((w: any) =>
        w.week_number === weekNumber ? { week_number: weekNumber, hours } : { week_number: w.week_number, hours: w.hours }
      );

      // Add the new week if it doesn't exist
      if (!weeklyHours.find((w: any) => w.week_number === weekNumber)) {
        updatedWeeks.push({ week_number: weekNumber, hours });
      }

      await api.put(`/api/project-setup/${projectId}/allocations/${allocationId}/weeks`, {
        weeks: updatedWeeks,
      });
    } catch (err: any) {
      console.error('Error updating week hours:', err);
    }
  };

  // Delete allocation
  const handleDeleteAllocation = async (allocationId: string) => {
    if (!projectId) return;
    if (!confirm('Are you sure you want to remove this allocation?')) return;

    setSaving(true);
    try {
      await api.delete(`/api/project-setup/${projectId}/allocations/${allocationId}`);
      setAllocations(allocations.filter(alloc => alloc.id !== allocationId));
    } catch (err: any) {
      console.error('Error deleting allocation:', err);
      alert(err.response?.data?.message || 'Failed to delete allocation');
    } finally {
      setSaving(false);
    }
  };

  // Save draft
  const handleSaveDraft = async () => {
    if (!projectId) return;

    setSaving(true);
    try {
      await api.put(`/api/project-setup/${projectId}/header`, {
        customer_rate_per_hour: customerRate,
        sold_cost_percentage: soldCostPercentage,
      });

      alert('Draft saved successfully!');
    } catch (err: any) {
      console.error('Error saving draft:', err);
      alert(err.response?.data?.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  // Finalize setup
  const handleFinalize = async () => {
    if (!projectId) return;
    if (!confirm('Are you sure you want to finalize this setup? This will lock the project setup.')) return;

    setSaving(true);
    try {
      await api.post(`/api/project-setup/${projectId}/finalize`);
      alert('Project setup finalized successfully!');
      navigate('/projects');
    } catch (err: any) {
      console.error('Error finalizing setup:', err);
      alert(err.response?.data?.message || 'Failed to finalize setup');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">Loading project setup...</div>
      </div>
    );
  }

  if (error || !setupData) {
    return (
      <div className="page-container">
        <div className="error-container">
          <div className="error-message">{error || 'Failed to load project setup'}</div>
          <button onClick={() => navigate('/projects')} className="project-setup-button project-setup-button-secondary">
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const { project, setup } = setupData;
  const totals = calculateProjectTotals();
  const weekNumbers = Array.from({ length: setup.total_weeks }, (_, i) => i + 1);

  return (
    <div className="project-setup-container">
      {/* Header Card */}
      <div className="project-setup-header">
        <h1 className="project-setup-header-title">
          Project Cost Planning:{' '}
          <ProjectBrand
            name={project.title}
            logoUrl={project.project_logo_url}
            size={48}
          />
        </h1>
        <div className="project-setup-header-info">
          <div className="project-setup-header-info-item">
            <span className="project-setup-header-info-label">Project Period</span>
            <span className="project-setup-header-info-value">
              {new Date(project.start_date).toLocaleDateString()} - {new Date(project.end_date).toLocaleDateString()}
            </span>
          </div>
          <div className="project-setup-header-info-item">
            <span className="project-setup-header-info-label">Duration</span>
            <span className="project-setup-header-info-value">{setup.total_weeks} weeks</span>
          </div>
          {project.project_manager && (
            <div className="project-setup-header-info-item">
              <span className="project-setup-header-info-label">Project Manager</span>
              <span className="project-setup-header-info-value">{project.project_manager.email}</span>
            </div>
          )}
          <div className="project-setup-header-info-item">
            <span className="project-setup-header-info-label">Setup Status</span>
            <span className="project-setup-header-info-value">{project.setup_status || 'draft'}</span>
          </div>
        </div>
      </div>

      {/* Excel-like Table */}
      <div className="project-setup-table-container">
        <h2 className="project-setup-table-title">Resource Allocation & Hours</h2>
        
        <div className="project-setup-table-wrapper">
          <table className="project-setup-table">
            <thead>
              <tr>
                <th className="sticky-col-left-1">Role</th>
                <th className="sticky-col-left-2">Name</th>
                {weekNumbers.map(weekNum => (
                  <th key={weekNum} className="week-column-header">
                    Week {weekNum}
                  </th>
                ))}
                <th className="sticky-col-right-1">Total Hours</th>
                <th className="sticky-col-right-2">Rate ($/hr)</th>
                <th className="sticky-col-right-3">Amount ($)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allocations.length === 0 ? (
                <tr>
                  <td colSpan={weekNumbers.length + 7} className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">No allocations yet</div>
                    <div className="empty-state-text">Select a role below to add your first allocation</div>
                  </td>
                </tr>
              ) : (
                allocations.map(allocation => {
                  const { totalHours, totalAmount } = calculateAllocationTotals(allocation);
                  const weeklyHours = allocation.weekly_hours || [];

                  return (
                    <tr key={allocation.id}>
                      <td className="sticky-col-left-1">
                        <select
                          className="project-setup-select"
                          value={allocation.role_id}
                          onChange={(e) => handleUpdateAllocation(allocation.id, 'role_id', e.target.value)}
                        >
                          <option value="">Select Role</option>
                          {roles.map(role => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="sticky-col-left-2">
                        <select
                          className="project-setup-select"
                          value={allocation.user_id || ''}
                          onChange={(e) => handleUpdateAllocation(allocation.id, 'user_id', e.target.value)}
                        >
                          <option value="">Select User</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.email}</option>
                          ))}
                        </select>
                      </td>
                      {weekNumbers.map(weekNum => {
                        const weekData = weeklyHours.find((w: any) => w.week_number === weekNum);
                        const hours = weekData?.hours || 0;

                        return (
                          <td key={weekNum}>
                            <input
                              type="number"
                              className={`week-input ${hours > 0 ? 'has-value' : ''}`}
                              value={hours || ''}
                              min="0"
                              max="168"
                              step="0.5"
                              placeholder="0"
                              onChange={(e) => handleUpdateWeekHours(
                                allocation.id,
                                weekNum,
                                parseFloat(e.target.value) || 0
                              )}
                            />
                          </td>
                        );
                      })}
                      <td className="sticky-col-right-1 calculated-field calculated-field-hours">
                        {totalHours.toFixed(2)}
                      </td>
                      <td className="sticky-col-right-2">
                        <input
                          type="number"
                          className="rate-input"
                          value={allocation.hourly_rate || ''}
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          onChange={(e) => handleUpdateAllocation(
                            allocation.id,
                            'hourly_rate',
                            parseFloat(e.target.value) || 0
                          )}
                        />
                      </td>
                      <td className="sticky-col-right-3 calculated-field calculated-field-amount">
                        ${totalAmount.toFixed(2)}
                      </td>
                      <td>
                        <button
                          className="action-button"
                          onClick={() => handleDeleteAllocation(allocation.id)}
                          title="Remove allocation"
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Add Row Button */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select
            className="project-setup-select"
            style={{ width: '200px' }}
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              filterUsersByRole(e.target.value);
            }}
          >
            <option value="">Select Role to Add</option>
            {roles.map(role => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <button
            className="add-row-button"
            onClick={handleAddRow}
            disabled={!selectedRole || saving}
          >
            ➕ Add Role Row
          </button>
        </div>
      </div>

      {/* Summary Section */}
      <div className="project-setup-summary">
        <h2 className="project-setup-summary-title">Cost Summary & Margin Analysis</h2>
        
        <div className="project-setup-summary-grid">
          {/* Internal Cost */}
          <div className="summary-section">
            <div className="summary-section-title">Internal Cost</div>
            <div className="summary-row">
              <span className="summary-label">Total Hours</span>
              <span className="summary-value">{totals.totalHours.toFixed(2)} hrs</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Total Cost</span>
              <span className="summary-value">${totals.totalCost.toFixed(2)}</span>
            </div>
          </div>

          {/* Customer Pricing */}
          <div className="summary-section">
            <div className="summary-section-title">Customer Pricing</div>
            <div className="summary-row">
              <span className="summary-label">Rate per Hour</span>
              <input
                type="number"
                className="summary-input"
                value={customerRate || ''}
                min="0"
                step="0.01"
                placeholder="0.00"
                onChange={(e) => setCustomerRate(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="summary-row">
              <span className="summary-label">Customer Amount</span>
              <span className="summary-value">${totals.customerAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Margin Analysis */}
          <div className="summary-section">
            <div className="summary-section-title">Margin Analysis</div>
            <div className="summary-row">
              <span className="summary-label">Gross Margin</span>
              <span className="summary-value">{totals.grossMargin.toFixed(2)}%</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Sold Cost</span>
              <input
                type="number"
                className="summary-input"
                value={soldCostPercentage || ''}
                min="0"
                max="100"
                step="0.1"
                placeholder="11.0"
                onChange={(e) => setSoldCostPercentage(parseFloat(e.target.value) || 11)}
                style={{ width: '100px' }}
              />
            </div>
            <div className="summary-row">
              <span className="summary-label">Current Margin</span>
              <span className="summary-value">{totals.currentMargin.toFixed(2)}%</span>
            </div>
            <div className="summary-row" style={{ marginTop: '12px' }}>
              <div className="margin-status-container">
                <div className={`margin-status-badge ${totals.marginStatus}`}>
                  {totals.marginStatus === 'green' && '🟢 Healthy'}
                  {totals.marginStatus === 'yellow' && '🟡 Warning'}
                  {totals.marginStatus === 'red' && '🔴 Critical'}
                </div>
                <span className="margin-status-text">
                  {totals.marginStatus === 'green' && 'Project margin is healthy'}
                  {totals.marginStatus === 'yellow' && 'Review pricing recommended'}
                  {totals.marginStatus === 'red' && 'Project at risk - adjust pricing'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="project-setup-actions">
          <button
            className="project-setup-button project-setup-button-secondary"
            onClick={() => navigate('/projects')}
          >
            Cancel
          </button>
          <button
            className="project-setup-button project-setup-button-primary"
            onClick={handleSaveDraft}
            disabled={saving}
          >
            {saving ? 'Saving...' : '💾 Save Draft'}
          </button>
          <button
            className="project-setup-button project-setup-button-success"
            onClick={handleFinalize}
            disabled={saving || allocations.length === 0}
          >
            ✅ Finalize Setup
          </button>
        </div>
      </div>
    </div>
  );
}

