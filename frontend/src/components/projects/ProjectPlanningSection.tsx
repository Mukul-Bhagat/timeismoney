import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../config/api';
import { useCurrency } from '../../context/CurrencyContext';
import { ConfirmModal } from '../common/ConfirmModal';
import type {
  ProjectSetupData,
  Role,
  User,
  MarginStatus,
} from '../../types';
import '../../pages/ProjectSetup.css';

interface PlanningRow {
  tempId?: string;  // for new rows
  id?: string;     // existing allocation ID
  roleId?: string | null;
  userId?: string | null;
  weeklyHours: number[];  // array indexed by week number (0-indexed, so week 1 is index 0)
  rate?: number;  // Internal rate
  customerRate?: number;  // Customer rate per row
}

interface ProjectPlanningSectionProps {
  projectId: string;
  onUpdate?: () => void;
}

export function ProjectPlanningSection({ projectId, onUpdate }: ProjectPlanningSectionProps) {
  const { symbol, formatAmount } = useCurrency();

  // State
  const [setupData, setSetupData] = useState<ProjectSetupData | null>(null);
  const [planningRows, setPlanningRows] = useState<PlanningRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [soldCostPercentage, setSoldCostPercentage] = useState<number>(11);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [usersByRole, setUsersByRole] = useState<Record<string, User[]>>({});
  const [loadingUsersForRole, setLoadingUsersForRole] = useState<Record<string, boolean>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  
  // Modal States
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<{isOpen: boolean, rowId: string | null}>({isOpen: false, rowId: null});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch users for a specific role
  const fetchUsersForRole = async (roleId: string) => {
    if (!roleId) return;
    
    // Check if already cached or currently fetching
    let isCached = false;
    setUsersByRole(prev => {
      isCached = !!prev[roleId];
      return prev;
    });
    
    if (isCached || fetchingRef.current.has(roleId)) return;
    
    // Mark as fetching
    fetchingRef.current.add(roleId);
    setLoadingUsersForRole(prev => ({ ...prev, [roleId]: true }));
    
    try {
      const response = await api.get(`/api/roles/${roleId}/users`);
      const roleUsers = (response.data.users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        rate_per_hour: null, // Will be fetched separately if needed
      }));
      setUsersByRole(prev => ({ ...prev, [roleId]: roleUsers }));
    } catch (err: any) {
      console.error(`Error fetching users for role ${roleId}:`, err);
      setUsersByRole(prev => ({ ...prev, [roleId]: [] }));
    } finally {
      fetchingRef.current.delete(roleId);
      setLoadingUsersForRole(prev => {
        const updated = { ...prev };
        delete updated[roleId];
        return updated;
      });
    }
  };

  // Fetch initial data
  useEffect(() => {
    if (projectId) {
      fetchProjectSetup();
      fetchRoles();
    }
  }, [projectId]);

  // Fetch users for roles that are assigned in existing rows
  useEffect(() => {
    const uniqueRoleIds = [...new Set(planningRows.map(r => r.roleId).filter(Boolean))] as string[];
    uniqueRoleIds.forEach(roleId => {
      if (roleId) {
        // Check if already cached or fetching before calling
        const isCached = usersByRole[roleId];
        const isLoading = loadingUsersForRole[roleId] || fetchingRef.current.has(roleId);
        if (!isCached && !isLoading) {
          fetchUsersForRole(roleId);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningRows]); // Only depend on planningRows, check state directly (usersByRole/loadingUsersForRole checked in effect body)

  const fetchProjectSetup = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/project-setup/${projectId}`);
      const data: ProjectSetupData = response.data.data;
      
      setSetupData(data);
      
      // Convert allocations to planningRows format
      const totalWeeks = data.setup.total_weeks || 0;
      const rows: PlanningRow[] = (data.allocations || []).map(alloc => {
        const weeklyHoursArray = new Array(totalWeeks).fill(0);
        (alloc.weekly_hours || []).forEach(wh => {
          if (wh.week_number >= 1 && wh.week_number <= totalWeeks) {
            weeklyHoursArray[wh.week_number - 1] = wh.hours || 0;
          }
        });
        
        return {
          id: alloc.id,
          roleId: alloc.role_id || null,
          userId: alloc.user_id || null,
          weeklyHours: weeklyHoursArray,
          rate: alloc.hourly_rate || 0,
          customerRate: (alloc as any).customer_rate_per_hour || data.setup.customer_rate_per_hour || 0,
        };
      });
      
      setPlanningRows(rows);
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


  // Filter users by role (for "Add Row" dropdown - not really needed since rows filter their own users)
  const filterUsersByRole = (roleId: string) => {
    if (!roleId) {
      return;
    }
    // Just fetch users for this role - the filteredUsers state is not really used anymore
    // since each row filters its own users based on the selected role
    fetchUsersForRole(roleId);
  };

  // Calculate totals for a single row
  const calculateRowTotals = (row: PlanningRow): { totalHours: number; totalAmount: number; customerAmount: number } => {
    const totalHours = row.weeklyHours.reduce((sum, hours) => sum + (hours || 0), 0);
    const internalAmount = totalHours * (row.rate || 0);
    const customerAmount = totalHours * (row.customerRate || 0);
    
    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalAmount: Math.round(internalAmount * 100) / 100,
      customerAmount: Math.round(customerAmount * 100) / 100,
    };
  };

  // Calculate project-wide totals
  const calculateProjectTotals = useCallback(() => {
    const totalHours = planningRows.reduce((sum, row) => {
      const { totalHours } = calculateRowTotals(row);
      return sum + totalHours;
    }, 0);

    const totalInternalCost = planningRows.reduce((sum, row) => {
      const { totalAmount } = calculateRowTotals(row);
      return sum + totalAmount;
    }, 0);

    // Sum per-row customer amounts
    const totalCustomerAmount = planningRows.reduce((sum, row) => {
      const { customerAmount } = calculateRowTotals(row);
      return sum + customerAmount;
    }, 0);

    const grossMargin = totalCustomerAmount > 0 
      ? ((totalCustomerAmount - totalInternalCost) / totalCustomerAmount) * 100 
      : 0;
    const currentMargin = grossMargin - soldCostPercentage;

    let marginStatus: MarginStatus = 'green';
    if (currentMargin <= 5) {
      marginStatus = 'red';
    } else if (currentMargin <= 19) {
      marginStatus = 'yellow';
    }

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalCost: Math.round(totalInternalCost * 100) / 100,
      customerAmount: Math.round(totalCustomerAmount * 100) / 100,
      grossMargin: Math.round(grossMargin * 100) / 100,
      currentMargin: Math.round(currentMargin * 100) / 100,
      marginStatus,
    };
  }, [planningRows, soldCostPercentage]);

  // Add new allocation row (local state only - no API call)
  const handleAddRow = () => {
    if (!setupData) return;
    
    const totalWeeks = setupData.setup.total_weeks || 0;
    const newRow: PlanningRow = {
      tempId: `temp-${Date.now()}-${Math.random()}`,
      roleId: null,
      userId: null,
      weeklyHours: new Array(totalWeeks).fill(0),
      rate: 0,
      customerRate: setupData.setup.customer_rate_per_hour || 0,  // Use global as default
    };
    
    setPlanningRows([...planningRows, newRow]);
  };

  // Update allocation field (local state only - no API call)
  const handleUpdateAllocation = (rowId: string, field: 'roleId' | 'userId' | 'rate' | 'customerRate', value: any) => {
    setPlanningRows(planningRows.map(row => {
      const id = row.id || row.tempId;
      if (id !== rowId) return row;
      
      const updated = { ...row };
      if (field === 'roleId') {
        updated.roleId = value || null;
        // Clear user selection when role changes (user might not be in new role)
        if (value !== row.roleId) {
          updated.userId = null;
        }
        // Fetch users for this role
        if (value) {
          fetchUsersForRole(value);
        }
        // Auto-fill rate when role+user selected
        if (value && updated.userId) {
          autoFillRate(updated, value, updated.userId).catch(err => {
            console.error('Error auto-filling rate:', err);
          });
        }
      } else if (field === 'userId') {
        updated.userId = value || null;
        // Auto-fill rate when role+user selected
        if (value && updated.roleId) {
          autoFillRate(updated, updated.roleId, value).catch(err => {
            console.error('Error auto-filling rate:', err);
          });
        }
      } else if (field === 'rate') {
        updated.rate = parseFloat(value) || 0;
      } else if (field === 'customerRate') {
        updated.customerRate = parseFloat(value) || 0;
      }
      
      return updated;
    }));
    
    // Clear validation errors for this row
    setValidationErrors(prev => {
      const updated = { ...prev };
      delete updated[rowId];
      return updated;
    });
  };

  // Auto-fill rate based on user/role
  const autoFillRate = async (row: PlanningRow, roleId: string, userId: string) => {
    try {
      // Fetch user rate
      const userResponse = await api.get(`/api/users`);
      const user = userResponse.data.users?.find((u: User) => u.id === userId);
      
      if (user?.rate_per_hour) {
        setPlanningRows(prev => prev.map(r => {
          const id = r.id || r.tempId || '';
          const rowId = row.id || row.tempId || '';
          if (id && rowId && id === rowId) {
            return { ...r, rate: user.rate_per_hour };
          }
          return r;
        }));
        return;
      }
      
      // Fetch role default rate
      const roleResponse = await api.get(`/api/roles`);
      const role = roleResponse.data.roles?.find((r: Role) => r.id === roleId);
      
      if (role?.default_rate_per_hour) {
        setPlanningRows(prev => prev.map(r => {
          const id = r.id || r.tempId || '';
          const rowId = row.id || row.tempId || '';
          if (id && rowId && id === rowId) {
            return { ...r, rate: role.default_rate_per_hour };
          }
          return r;
        }));
      }
    } catch (err) {
      console.error('Error auto-filling rate:', err);
      // Silently fail - user can enter manually
    }
  };

  // Update weekly hours (local state only - no API call)
  const handleUpdateWeekHours = (rowId: string, weekNumber: number, hours: number) => {
    setPlanningRows(planningRows.map(row => {
      const id = row.id || row.tempId;
      if (id !== rowId) return row;
      
      const updated = { ...row };
      const weekIndex = weekNumber - 1; // Convert to 0-indexed
      if (weekIndex >= 0 && weekIndex < updated.weeklyHours.length) {
        updated.weeklyHours = [...updated.weeklyHours];
        updated.weeklyHours[weekIndex] = hours || 0;
      }
      
      return updated;
    }));
    
    // Clear validation errors for this row
    setValidationErrors(prev => {
      const updated = { ...prev };
      delete updated[rowId];
      return updated;
    });
  };

  // Delete allocation (local state only - will be saved on batch save)
  const handleDeleteAllocation = (rowId: string) => {
    setShowDeleteModal({ isOpen: true, rowId });
  };

  const handleConfirmDelete = () => {
    if (!showDeleteModal.rowId) return;
    
    setPlanningRows(planningRows.filter(row => {
      const id = row.id || row.tempId;
      return id !== showDeleteModal.rowId;
    }));
    
    // Clear validation errors for this row
    setValidationErrors(prev => {
      const updated = { ...prev };
      if (showDeleteModal.rowId) {
        delete updated[showDeleteModal.rowId];
      }
      return updated;
    });
    
    setShowDeleteModal({ isOpen: false, rowId: null });
  };

  // Save draft (batch save all rows)
  const handleSaveDraft = async () => {
    if (!projectId || !setupData) return;

    setSaving(true);
    setError(null);
    setValidationErrors({});
    
    try {
      const totalWeeks = setupData.setup.total_weeks || 0;
      
      // Convert planningRows to API format
      const rows = planningRows.map(row => {
        const weeklyHours = [];
        for (let i = 0; i < totalWeeks; i++) {
          if (row.weeklyHours[i] > 0) {
            weeklyHours.push({
              week_number: i + 1,
              hours: row.weeklyHours[i],
            });
          }
        }
        
        return {
          id: row.id || row.tempId,
          role_id: row.roleId || null,
          user_id: row.userId || null,
          hourly_rate: row.rate || 0,
          customer_rate_per_hour: row.customerRate || 0,
          weekly_hours: weeklyHours,
        };
      });
      
      await api.post(`/api/project-setup/${projectId}/save-draft`, {
        rows,
        sold_cost_percentage: soldCostPercentage,
      });

      // Refresh data to get updated IDs for temp rows
      await fetchProjectSetup();
      setSuccessMessage('Draft saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      console.error('Error saving draft:', err);
      const errorMessage = err.response?.data?.message || 'Failed to save draft';
      setError(errorMessage);
      // Error is already shown in the error state, no need for alert
    } finally {
      setSaving(false);
    }
  };

  // Finalize setup - open modal
  const handleFinalize = () => {
    if (!projectId || !setupData) return;
    setFinalizeError(null);
    setShowFinalizeModal(true);
  };

  // Confirm finalize - actually perform the action
  const handleConfirmFinalize = async () => {
    if (!projectId || !setupData) return;

    setSaving(true);
    setError(null);
    setValidationErrors({});
    setFinalizeError(null);
    
    try {
      // First save the draft
      const totalWeeks = setupData.setup.total_weeks || 0;
      
      const rows = planningRows.map(row => {
        const weeklyHours = [];
        for (let i = 0; i < totalWeeks; i++) {
          if (row.weeklyHours[i] > 0) {
            weeklyHours.push({
              week_number: i + 1,
              hours: row.weeklyHours[i],
            });
          }
        }
        
        return {
          id: row.id || row.tempId,
          role_id: row.roleId || null,
          user_id: row.userId || null,
          hourly_rate: row.rate || 0,
          customer_rate_per_hour: row.customerRate || 0,
          weekly_hours: weeklyHours,
        };
      });
      
      await api.post(`/api/project-setup/${projectId}/save-draft`, {
        rows,
        sold_cost_percentage: soldCostPercentage,
      });
      
      // Then finalize
      const finalizeResponse = await api.put(`/api/project-setup/${projectId}/finalize`);
      
      // Check for validation errors
      if (finalizeResponse.data.validation_errors) {
        const errors: Record<string, string[]> = {};
        finalizeResponse.data.validation_errors.forEach((err: any) => {
          const rowIndex = err.row_index - 1;
          if (rowIndex >= 0 && rowIndex < planningRows.length) {
            const row = planningRows[rowIndex];
            const rowId = row.id || row.tempId;
            if (rowId) {
              errors[rowId] = err.errors;
            }
          }
        });
        setValidationErrors(errors);
        setError('Validation failed. Please fix the errors below.');
        setFinalizeError('Validation failed. Please fix the errors shown in the table.');
        setSaving(false);
        // Keep modal open to show errors
        return;
      }
      
      // Success - close modal and show message
      setShowFinalizeModal(false);
      setSuccessMessage('Project setup finalized successfully! Reports are now available.');
      setTimeout(() => setSuccessMessage(null), 5000);
      if (onUpdate) onUpdate();
      // Refresh data
      await fetchProjectSetup();
    } catch (err: any) {
      console.error('Error finalizing setup:', err);
      
      // Handle validation errors
      if (err.response?.data?.validation_errors) {
        const errors: Record<string, string[]> = {};
        err.response.data.validation_errors.forEach((validationErr: any) => {
          const rowIndex = validationErr.row_index - 1;
          if (rowIndex >= 0 && rowIndex < planningRows.length) {
            const row = planningRows[rowIndex];
            const rowId = row.id || row.tempId || '';
            if (rowId) {
              errors[rowId] = validationErr.errors;
            }
          }
        });
        setValidationErrors(errors);
        setError('Validation failed. Please fix the errors below.');
        setFinalizeError('Validation failed. Please fix the errors shown in the table.');
        // Keep modal open to show errors
      } else {
        const errorMessage = err.response?.data?.message || 'Failed to finalize setup';
        setError(errorMessage);
        setFinalizeError(errorMessage);
        // Keep modal open to show errors
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">Loading project setup...</div>
    );
  }

  if (error || !setupData) {
    return (
      <div className="error-container">
        <div className="error-message">{error || 'Failed to load project setup'}</div>
      </div>
    );
  }

  const { project, setup } = setupData;
  const totals = calculateProjectTotals();
  const weekNumbers = Array.from({ length: setup.total_weeks }, (_, i) => i + 1);

  return (
    <div>
      {/* Success Message */}
      {successMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '16px 20px',
            backgroundColor: '#d1fae5',
            border: '1px solid #a7f3d0',
            borderLeft: '4px solid #059669',
            borderRadius: '8px',
            color: '#065f46',
            fontSize: '14px',
            fontWeight: '500',
            zIndex: 1001,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            maxWidth: '400px',
          }}
        >
          ✓ {successMessage}
        </div>
      )}

      {/* Header Info */}
      <div className="project-setup-header-info" style={{ marginBottom: '24px' }}>
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
          <span className="project-setup-header-info-value">
            {project.setup_status === 'ready' ? '🟢 Ready' : '🟡 Draft'}
          </span>
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
                <th className="sticky-col-right-2">Rate ({symbol}/hr)</th>
                <th className="sticky-col-right-3">Amount ({symbol})</th>
                <th className="sticky-col-right-4">Customer Rate ({symbol}/hr)</th>
                <th className="sticky-col-right-5">Customer Amount ({symbol})</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {planningRows.length === 0 ? (
                <tr>
                  <td colSpan={weekNumbers.length + 9} className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">Start Planning Your Project</div>
                    <div className="empty-state-text" style={{ marginBottom: '16px' }}>
                      This is the Admin Planning Timesheet. Fill out resource allocations, 
                      weekly hours, and rates to establish your project budget.
                    </div>
                    <div style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
                      <ul style={{ listStyle: 'none', padding: 0 }}>
                        <li style={{ marginBottom: '8px' }}>✓ Click "Add Role Row" below to add team members</li>
                        <li style={{ marginBottom: '8px' }}>✓ Enter weekly hour allocations for each resource</li>
                        <li style={{ marginBottom: '8px' }}>✓ Set hourly rates (auto-filled if configured)</li>
                        <li style={{ marginBottom: '8px' }}>✓ Define customer pricing and review margins</li>
                        <li style={{ marginBottom: '8px' }}>✓ Click "Finalize Setup" when complete</li>
                      </ul>
                    </div>
                  </td>
                </tr>
              ) : (
                planningRows.map(row => {
                  const rowId = row.id || row.tempId || '';
                  const { totalHours, totalAmount, customerAmount } = calculateRowTotals(row);
                  const rowErrors = validationErrors[rowId] || [];

                  return (
                    <tr key={rowId} style={rowErrors.length > 0 ? { backgroundColor: '#fef2f2' } : {}}>
                      <td className="sticky-col-left-1">
                        <select
                          className="project-setup-select"
                          value={row.roleId || ''}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleUpdateAllocation(rowId, 'roleId', e.target.value)}
                        >
                          <option value="">Select Role</option>
                          {roles.map(role => (
                            <option key={role.id} value={role.id}>{role.name}</option>
                          ))}
                        </select>
                        {rowErrors.some(e => e.includes('Role')) && (
                          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                            {rowErrors.find(e => e.includes('Role'))}
                          </div>
                        )}
                      </td>
                      <td className="sticky-col-left-2">
                        <select
                          className="project-setup-select"
                          value={row.userId || ''}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleUpdateAllocation(rowId, 'userId', e.target.value)}
                          disabled={!row.roleId}
                        >
                          <option value="">
                            {!row.roleId 
                              ? 'Select Role First' 
                              : loadingUsersForRole[row.roleId]
                                ? 'Loading users...'
                                : (usersByRole[row.roleId] || []).length === 0
                                  ? 'No users in this role'
                                  : 'Select User'}
                          </option>
                          {(row.roleId ? (usersByRole[row.roleId] || []) : []).map(u => (
                            <option key={u.id} value={u.id}>{u.email}</option>
                          ))}
                        </select>
                        {rowErrors.some(e => e.includes('User')) && (
                          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                            {rowErrors.find(e => e.includes('User'))}
                          </div>
                        )}
                      </td>
                      {weekNumbers.map(weekNum => {
                        const weekIndex = weekNum - 1;
                        const hours = row.weeklyHours[weekIndex] || 0;

                        return (
                          <td key={weekNum} className="week-column">
                            <input
                              type="number"
                              className={`week-input ${hours > 0 ? 'has-value' : ''}`}
                              value={hours || ''}
                              min="0"
                              max="168"
                              step="0.5"
                              placeholder="0"
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateWeekHours(
                                rowId,
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
                          value={row.rate || ''}
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateAllocation(
                            rowId,
                            'rate',
                            parseFloat(e.target.value) || 0
                          )}
                        />
                        {rowErrors.some(e => e.includes('rate')) && (
                          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                            {rowErrors.find(e => e.includes('rate'))}
                          </div>
                        )}
                      </td>
                      <td className="sticky-col-right-3 calculated-field calculated-field-amount">
                        {formatAmount(totalAmount)}
                      </td>
                      <td className="sticky-col-right-4">
                        <input
                          type="number"
                          className="rate-input"
                          value={row.customerRate || ''}
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateAllocation(
                            rowId,
                            'customerRate',
                            parseFloat(e.target.value) || 0
                          )}
                        />
                        {rowErrors.some(e => e.includes('customer rate')) && (
                          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px' }}>
                            {rowErrors.find(e => e.includes('customer rate'))}
                          </div>
                        )}
                      </td>
                      <td className="sticky-col-right-5 calculated-field calculated-field-amount">
                        {formatAmount(customerAmount)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          className="action-button"
                          onClick={() => handleDeleteAllocation(rowId)}
                          title="Remove allocation"
                          aria-label="Remove allocation"
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
            disabled={saving || !setupData}
          >
            ➕ Add Row
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
              <span className="summary-value">{formatAmount(totals.totalCost)}</span>
            </div>
          </div>

          {/* Customer Pricing */}
          <div className="summary-section">
            <div className="summary-section-title">Customer Pricing</div>
            <div className="summary-row">
              <span className="summary-label">Total Customer Amount</span>
              <span className="summary-value">{formatAmount(totals.customerAmount)}</span>
            </div>
            {totals.totalHours > 0 && (
              <div className="summary-row">
                <span className="summary-label">Average Rate</span>
                <span className="summary-value">
                  {formatAmount(totals.customerAmount / totals.totalHours)}/hr
                </span>
              </div>
            )}
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
            className="project-setup-button project-setup-button-primary"
            onClick={handleSaveDraft}
            disabled={saving}
          >
            {saving ? 'Saving...' : '💾 Save Draft'}
          </button>
          <button
            className="project-setup-button project-setup-button-success"
            onClick={handleFinalize}
            disabled={saving || planningRows.length === 0}
          >
            ✅ Finalize Setup
          </button>
        </div>
      </div>

      {/* Finalize Confirmation Modal */}
      <ConfirmModal
        isOpen={showFinalizeModal}
        title="Finalize Planning?"
        description="This will mark the planning as complete and enable reports. You can still edit the planning later if needed."
        confirmText="Finalize & Enable Reports"
        cancelText="Cancel"
        onConfirm={handleConfirmFinalize}
        onCancel={() => {
          setShowFinalizeModal(false);
          setFinalizeError(null);
        }}
        loading={saving}
        variant="danger"
        error={finalizeError}
        infoBox={
          <div>
            <h4>Summary</h4>
            <div className="confirm-info-row">
              <span className="confirm-info-label">Total Hours</span>
              <span className="confirm-info-value">{totals.totalHours.toFixed(2)} hrs</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">Total Internal Cost</span>
              <span className="confirm-info-value">{formatAmount(totals.totalCost)}</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">Customer Amount</span>
              <span className="confirm-info-value">{formatAmount(totals.customerAmount)}</span>
            </div>
            <div className="confirm-info-row">
              <span className="confirm-info-label">Current Margin</span>
              <span className="confirm-info-value">{totals.currentMargin.toFixed(2)}%</span>
            </div>
          </div>
        }
      />

      {/* Delete Allocation Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal.isOpen}
        title="Remove Allocation"
        description="Are you sure you want to remove this allocation? This action will be saved when you click 'Save Draft'."
        confirmText="Remove"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteModal({ isOpen: false, rowId: null })}
        loading={false}
        variant="warning"
      />
    </div>
  );
}

