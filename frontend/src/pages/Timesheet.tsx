import { useState, useEffect, useCallback } from 'react';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import { ProjectBrand } from '../components/common/ProjectBrand';
import type { Timesheet, TimesheetEntry } from '../types';
import { formatDateIST } from '../utils/timezone';
import './Page.css';
import './Timesheet.css';

interface DateEntry {
  date: string; // YYYY-MM-DD
  hours: number;
}

interface MonthProjectData {
  id: string;
  title: string;
  role_name: string;
  start_date: string;
  end_date: string;
  timesheet: {
    id: string;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'RESUBMITTED';
    submitted_at: string | null;
    approved_at: string | null;
    approved_by: string | null;
    entries: { date: string; hours: number }[];
  } | null;
}

interface ProjectTimesheetData {
  project: {
    id: string;
    title: string;
    role_name: string;
    start_date: string;
    end_date: string;
  };
  roleName: string;
  timesheet: Timesheet | null;
  entries: Map<string, number | undefined>; // date -> hours (undefined for empty)
  hasUnsavedChanges: boolean;
  isEditing: boolean; // Track if timesheet is in edit mode
}

export function Timesheet() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    // Initialize to current month (YYYY-MM)
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [projects, setProjects] = useState<ProjectTimesheetData[]>([]);
  const [monthDates, setMonthDates] = useState<string[]>([]);
  const [historyTimesheets, setHistoryTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());

  // Generate all dates in a month
  const generateMonthDates = useCallback((month: string): string[] => {
    const [year, monthNum] = month.split('-').map(Number);
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0);
    const dates: string[] = [];
    const current = new Date(firstDay);

    while (current <= lastDay) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }, []);

  // Check if a date is within project duration
  const isDateInProjectRange = useCallback((date: string, startDate: string, endDate: string): boolean => {
    const dateObj = new Date(date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    return dateObj >= start && dateObj <= end;
  }, []);

  // Check if a date is in the future (after today)
  const isDateInFuture = useCallback((date: string): boolean => {
    const dateObj = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dateObj.setHours(0, 0, 0, 0);
    return dateObj > today;
  }, []);

  // Fetch month data
  const fetchMonthData = useCallback(async (month: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/api/timesheets/month?month=${month}`);
      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || 'Failed to load month data');
      }

      const monthProjects: MonthProjectData[] = data.projects || [];
      const dates = generateMonthDates(month);
      setMonthDates(dates);

      // Transform to ProjectTimesheetData
      const projectsData: ProjectTimesheetData[] = monthProjects.map((proj) => {
        const entries = new Map<string, number | undefined>();
        
        // Initialize entries from timesheet (only entries with hours > 0)
        if (proj.timesheet?.entries) {
          proj.timesheet.entries.forEach((entry) => {
            if (entry.hours > 0) {
              entries.set(entry.date, entry.hours);
            }
          });
        }

        // Don't initialize empty dates - keep them undefined
        // This allows empty cells to stay empty

        const isResubmitted = proj.timesheet?.status === 'RESUBMITTED';
        const isDraft = !proj.timesheet || proj.timesheet.status === 'DRAFT';
        const isRejected = proj.timesheet?.status === 'REJECTED';

        return {
          project: {
            id: proj.id,
            title: proj.title,
            role_name: proj.role_name,
            start_date: proj.start_date,
            end_date: proj.end_date,
          },
          roleName: proj.role_name,
          timesheet: proj.timesheet ? {
            id: proj.timesheet.id,
            project_id: proj.id,
            user_id: user?.id || '',
            status: proj.timesheet.status,
            submitted_at: proj.timesheet.submitted_at,
            approved_at: proj.timesheet.approved_at,
            approved_by: proj.timesheet.approved_by,
            created_at: '',
            updated_at: '',
            entries: proj.timesheet.entries.map(e => ({
              id: '',
              timesheet_id: proj.timesheet!.id,
              date: e.date,
              hours: e.hours,
              created_at: '',
              updated_at: '',
            })),
          } : null,
          entries,
          hasUnsavedChanges: false,
          isEditing: isDraft || isRejected || isResubmitted, // Editable if draft, rejected, or resubmitted
        };
      });

      setProjects(projectsData);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load timesheet data');
    } finally {
      setLoading(false);
    }
  }, [user, generateMonthDates, isDateInProjectRange]);

  // Fetch history
  const fetchHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/api/timesheets/history');
      setHistoryTimesheets(response.data.timesheets || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when tab or month changes
  useEffect(() => {
    if (activeTab === 'active') {
      fetchMonthData(currentMonth);
    } else {
      fetchHistory();
    }
  }, [activeTab, currentMonth, fetchMonthData]);

  // Navigate to previous month
  const goToPreviousMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const newDate = new Date(year, month - 2, 1);
    const newMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
    setCurrentMonth(newMonth);
  };

  // Navigate to next month
  const goToNextMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    const newDate = new Date(year, month, 1);
    const newMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
    setCurrentMonth(newMonth);
  };

  // Format month for display
  const formatMonthDisplay = (month: string): string => {
    const [year, monthNum] = month.split('-').map(Number);
    const date = new Date(year, monthNum - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Format date for display
  const formatDate = (dateStr: string): string => {
    return formatDateIST(dateStr, 'MMM dd');
  };

  // Format day name
  const formatDayName = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  // Validate hours per cell (0-24)
  const validateCellHours = (hours: number): boolean => {
    return hours >= 0 && hours <= 24;
  };

  // Validate total hours per day across all projects
  const validateDayHours = (date: string, projectId: string, hours: number): string | null => {
    let totalHours = hours;

    // Sum hours for this date across all projects
    projects.forEach((p) => {
      if (p.project.id !== projectId) {
        const existingHours = p.entries.get(date) || 0;
        totalHours += existingHours;
      }
    });

    if (totalHours > 24) {
      return `Total hours for ${formatDate(date)} exceeds 24 hours (${totalHours.toFixed(2)} hours)`;
    }

    return null;
  };

  // Update hours for a specific date in a project
  const updateHours = (projectId: string, date: string, hours: number | undefined) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.project.id === projectId) {
          const newEntries = new Map(p.entries);
          // Set to undefined if hours is 0 or empty, otherwise set the value
          if (hours === 0 || hours === undefined || isNaN(hours)) {
            newEntries.delete(date); // Remove entry to keep it empty
          } else {
            newEntries.set(date, hours);
          }
          return { ...p, entries: newEntries, hasUnsavedChanges: true };
        }
        return p;
      })
    );

    // Clear validation error for this cell
    const errorKey = `${projectId}-${date}`;
    setValidationErrors((prev) => {
      const newErrors = new Map(prev);
      newErrors.delete(errorKey);
      return newErrors;
    });
  };

  // Validate all projects
  const validateAllProjects = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    projects.forEach((projectData) => {
      monthDates.forEach((date) => {
        const hours = projectData.entries.get(date);

        // Only validate if date is within project range and has hours defined
        if (isDateInProjectRange(date, projectData.project.start_date, projectData.project.end_date) && hours !== undefined) {
          // Validate cell hours
          if (!validateCellHours(hours)) {
            errors.push(`${projectData.project.title}: Hours for ${formatDate(date)} must be between 0 and 24`);
            return;
          }

          // Validate day hours across projects
          if (hours > 0) {
            const dayError = validateDayHours(date, projectData.project.id, hours);
            if (dayError) {
              errors.push(`${projectData.project.title}: ${dayError}`);
            }
          }
        }
      });
    });

    return { valid: errors.length === 0, errors };
  };

  // Save draft for all projects
  const handleSaveDraft = async () => {
    const validation = validateAllProjects();
    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Save each project with changes
      const projectsToSave = projects.filter((p) => p.hasUnsavedChanges || !p.timesheet);

      for (const projectData of projectsToSave) {
        // Collect entries for dates within project range, only including entries with hours > 0
        const entries: DateEntry[] = monthDates
          .filter((date) => isDateInProjectRange(date, projectData.project.start_date, projectData.project.end_date))
          .map((date) => {
            const hours = projectData.entries.get(date);
            return { date, hours: hours || 0 };
          })
          .filter((entry) => entry.hours > 0); // Only include entries with hours > 0

        // Check if we're saving future dates on a SUBMITTED/APPROVED timesheet
        const isSubmittedOrApproved = projectData.timesheet?.status === 'SUBMITTED' || projectData.timesheet?.status === 'APPROVED';
        const hasFutureDates = entries.some((entry) => isDateInFuture(entry.date));
        
        if (isSubmittedOrApproved && hasFutureDates) {
          // Backend will auto-unlock the timesheet (change to RESUBMITTED)
          // This allows saving future dates even when timesheet is SUBMITTED/APPROVED
          console.log(`[Save Draft] Saving future dates on ${projectData.timesheet?.status} timesheet - will auto-unlock`);
        }

        const response = await api.post('/api/timesheets', {
          project_id: projectData.project.id,
          entries,
          month: currentMonth,
        });

        // If timesheet was auto-unlocked, update local state
        if (isSubmittedOrApproved && hasFutureDates && response.data.timesheet?.status === 'RESUBMITTED') {
          setProjects((prev) =>
            prev.map((p) => {
              if (p.project.id === projectData.project.id && p.timesheet?.id === response.data.timesheet.id) {
                return {
                  ...p,
                  isEditing: true,
                  timesheet: {
                    ...p.timesheet,
                    status: 'RESUBMITTED',
                  },
                };
              }
              return p;
            })
          );
        }
      }

      // Refresh data
      await fetchMonthData(currentMonth);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save timesheet');
    } finally {
      setSaving(false);
    }
  };

  // Submit all projects
  const handleSubmit = async () => {
    const validation = validateAllProjects();
    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Save and submit each project
      for (const projectData of projects) {
        // Collect entries for dates within project range, only including entries with hours > 0
        const entries: DateEntry[] = monthDates
          .filter((date) => isDateInProjectRange(date, projectData.project.start_date, projectData.project.end_date))
          .map((date) => {
            const hours = projectData.entries.get(date);
            return { date, hours: hours || 0 };
          })
          .filter((entry) => entry.hours > 0); // Only include entries with hours > 0

        let timesheetId: string;

        if (!projectData.timesheet) {
          // Create timesheet first
          const createResponse = await api.post('/api/timesheets', {
            project_id: projectData.project.id,
            entries,
            month: currentMonth,
          });

          if (!createResponse.data.success || !createResponse.data.timesheet) {
            throw new Error('Failed to create timesheet');
          }

          timesheetId = createResponse.data.timesheet.id;
        } else {
          timesheetId = projectData.timesheet.id;

          // Update timesheet if it's editable (DRAFT, REJECTED, or RESUBMITTED)
          const editableStatuses = ['DRAFT', 'REJECTED', 'RESUBMITTED'];
          if (projectData.timesheet.status && editableStatuses.includes(projectData.timesheet.status)) {
            await api.post('/api/timesheets', {
              project_id: projectData.project.id,
              entries,
              month: currentMonth,
            });
          }
        }

        // Submit timesheet if it's in DRAFT or RESUBMITTED status
        if (!projectData.timesheet || projectData.timesheet.status === 'DRAFT' || projectData.timesheet.status === 'RESUBMITTED') {
          await api.post(`/api/timesheets/${timesheetId}/submit`, {
            entries,
          });
        }
      }

      // Refresh data
      await fetchMonthData(currentMonth);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit timesheet');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle edit timesheet
  const handleEditTimesheet = async (timesheetId: string, projectId: string) => {
    try {
      console.log(`[Edit Timesheet] Attempting to unlock timesheet ${timesheetId} for project ${projectId}`);
      const response = await api.post(`/api/timesheets/${timesheetId}/edit`);

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to unlock timesheet for editing');
      }

      console.log(`[Edit Timesheet] Successfully unlocked timesheet ${timesheetId}, new status: ${response.data.timesheet?.status}`);

      // Update project state to enable editing
      setProjects((prev) =>
        prev.map((p) => {
          if (p.project.id === projectId && p.timesheet?.id === timesheetId) {
            return {
              ...p,
              isEditing: true,
              timesheet: response.data.timesheet ? {
                ...p.timesheet,
                status: response.data.timesheet.status,
              } : p.timesheet,
            };
          }
          return p;
        })
      );

      // Refresh data to ensure we have the latest timesheet state
      await fetchMonthData(currentMonth);
    } catch (err: any) {
      console.error('[Edit Timesheet] Frontend error:', err);
      console.error('  Response data:', err.response?.data);
      console.error('  Error message:', err.message);
      
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to unlock timesheet for editing';
      setError(errorMessage);
    }
  };

  // Export timesheet
  const handleExport = async (timesheet: Timesheet) => {
    try {
      const response = await api.get(
        `/api/timesheets/${timesheet.id}/export`,
        { responseType: 'blob' }
      );

      // Download file
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timesheet-${timesheet.id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to export timesheet');
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Timesheet</h1>
        <div className="page-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Timesheet</h1>
      <p className="page-subtitle">Manage your time entries</p>

      {/* Tabs */}
      <div className="timesheet-tabs">
        <button
          className={`timesheet-tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Active Timesheets
        </button>
        <button
          className={`timesheet-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      {error && (
        <div className="timesheet-error" style={{ marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {activeTab === 'active' ? (
        <div className="timesheet-month-container">
          {/* Month Navigation */}
          <div className="timesheet-month-navigation">
            <button
              className="timesheet-month-nav-btn"
              onClick={goToPreviousMonth}
              aria-label="Previous month"
            >
              ◀ Previous Month
            </button>
            <h2 className="timesheet-month-display">{formatMonthDisplay(currentMonth)}</h2>
            <button
              className="timesheet-month-nav-btn"
              onClick={goToNextMonth}
              aria-label="Next month"
            >
              Next Month ▶
            </button>
          </div>

          {/* Action Buttons */}
          {projects.length > 0 && (
            <div className="timesheet-month-actions">
              <button
                className="timesheet-btn timesheet-btn-secondary"
                onClick={handleSaveDraft}
                disabled={saving || submitting}
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                className="timesheet-btn timesheet-btn-primary"
                onClick={handleSubmit}
                disabled={saving || submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Timesheet'}
              </button>
            </div>
          )}

          {/* Grid Table */}
          {projects.length === 0 ? (
            <div className="page-content">
              <p>No projects assigned. Contact your administrator to be assigned to a project.</p>
            </div>
          ) : (
            <div className="timesheet-grid-container">
              <table className="timesheet-grid-table">
                <thead>
                  <tr>
                    <th className="timesheet-grid-sticky-col timesheet-grid-project-col">Project</th>
                    <th className="timesheet-grid-sticky-col timesheet-grid-role-col">Role</th>
                    {monthDates.map((date) => (
                      <th key={date} className="timesheet-grid-date-header">
                        <div className="timesheet-grid-date-name">{formatDayName(date)}</div>
                        <div className="timesheet-grid-date-number">{formatDate(date)}</div>
                      </th>
                    ))}
                    <th className="timesheet-grid-total-col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((projectData) => {
                    const isDraft = !projectData.timesheet || projectData.timesheet.status === 'DRAFT';
                    const isSubmitted = projectData.timesheet?.status === 'SUBMITTED';
                    const isApproved = projectData.timesheet?.status === 'APPROVED';
                    const isRejected = projectData.timesheet?.status === 'REJECTED';
                    const isResubmitted = projectData.timesheet?.status === 'RESUBMITTED';
                    // Note: Read-only logic is now date-based, determined per cell below

                    // Calculate total hours (only count defined values)
                    const totalHours = Array.from(projectData.entries.values()).reduce(
                      (sum, hours) => sum + (hours !== undefined ? hours : 0),
                      0
                    );

                    return (
                      <tr key={projectData.project.id}>
                        <td className="timesheet-grid-sticky-col timesheet-grid-project-col">
                          <div className="timesheet-grid-project-name">
                            <ProjectBrand
                              name={projectData.project.title}
                              logoUrl={projectData.project.project_logo_url}
                              size={32}
                            />
                          </div>
                          {projectData.timesheet && (
                            <div className="timesheet-grid-project-status">
                              <span
                                className={`timesheet-status-badge ${
                                  isDraft
                                    ? 'draft'
                                    : isSubmitted
                                    ? 'submitted'
                                    : isApproved
                                    ? 'approved'
                                    : isRejected
                                    ? 'rejected'
                                    : isResubmitted
                                    ? 'resubmitted'
                                    : ''
                                }`}
                              >
                                {projectData.timesheet.status}
                              </span>
                              {(isSubmitted || isApproved) && !projectData.isEditing && (
                                <button
                                  className="timesheet-btn timesheet-btn-secondary"
                                  style={{ marginTop: '8px', fontSize: '11px', padding: '4px 8px' }}
                                  onClick={() => handleEditTimesheet(projectData.timesheet!.id, projectData.project.id)}
                                >
                                  Edit Timesheet
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="timesheet-grid-sticky-col timesheet-grid-role-col">
                          {projectData.roleName}
                        </td>
                        {monthDates.map((date) => {
                          const hours = projectData.entries.get(date);
                          const errorKey = `${projectData.project.id}-${date}`;
                          const hasError = validationErrors.has(errorKey);
                          const isInRange = isDateInProjectRange(
                            date,
                            projectData.project.start_date,
                            projectData.project.end_date
                          );

                          // Date-based read-only logic:
                          // - Future dates are always editable (even when SUBMITTED/APPROVED)
                          // - Past dates are read-only when SUBMITTED/APPROVED AND not in edit mode
                          // - Otherwise editable
                          const dateIsFuture = isDateInFuture(date);
                          const dateIsPast = !dateIsFuture;
                          const shouldBeReadOnly = 
                            dateIsPast && 
                            (isSubmitted || isApproved) && 
                            !projectData.isEditing;

                          return (
                            <td
                              key={date}
                              className={`timesheet-grid-cell ${!isInRange ? 'timesheet-grid-cell-disabled' : ''}`}
                              title={!isInRange ? 'Outside project duration' : ''}
                            >
                              {shouldBeReadOnly ? (
                                <span className="timesheet-hours-readonly">{hours !== undefined ? hours : ''}</span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  value={hours !== undefined ? hours : ''}
                                  disabled={!isInRange}
                                  onChange={(e) => {
                                    const inputValue = e.target.value;

                                    // Allow empty string during typing
                                    if (inputValue === '') {
                                      setValidationErrors((prev) => {
                                        const newErrors = new Map(prev);
                                        newErrors.delete(errorKey);
                                        return newErrors;
                                      });
                                      updateHours(projectData.project.id, date, undefined);
                                      return;
                                    }

                                    const numValue = parseFloat(inputValue);

                                    // Only process if it's a valid number
                                    if (!isNaN(numValue)) {
                                      if (validateCellHours(numValue)) {
                                        const dayError = validateDayHours(
                                          date,
                                          projectData.project.id,
                                          numValue
                                        );
                                        if (dayError) {
                                          setValidationErrors((prev) => {
                                            const newErrors = new Map(prev);
                                            newErrors.set(errorKey, dayError);
                                            return newErrors;
                                          });
                                        } else {
                                          // Clear error and update hours
                                          setValidationErrors((prev) => {
                                            const newErrors = new Map(prev);
                                            newErrors.delete(errorKey);
                                            return newErrors;
                                          });
                                          updateHours(projectData.project.id, date, numValue);
                                        }
                                      } else {
                                        setValidationErrors((prev) => {
                                          const newErrors = new Map(prev);
                                          newErrors.set(errorKey, 'Hours must be between 0 and 24');
                                          return newErrors;
                                        });
                                      }
                                    }
                                  }}
                                  onBlur={(e) => {
                                    // On blur, if empty, keep it empty (don't default to 0)
                                    const inputValue = e.target.value;
                                    if (inputValue === '' || isNaN(parseFloat(inputValue))) {
                                      updateHours(projectData.project.id, date, undefined);
                                    }
                                  }}
                                  className={`timesheet-hours-input ${hasError ? 'error' : ''} ${!isInRange ? 'timesheet-hours-input-disabled' : ''}`}
                                  placeholder=""
                                />
                              )}
                              {hasError && (
                                <div className="timesheet-cell-error">
                                  {validationErrors.get(errorKey)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="timesheet-grid-total-cell">{totalHours.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="timesheet-history">
          {historyTimesheets.length === 0 ? (
            <div className="page-content">
              <p>No approved timesheets in history.</p>
            </div>
          ) : (
            historyTimesheets.map((timesheet) => {
              const project = (timesheet as any).project;
              const entries = timesheet.entries || [];
              const totalHours = entries.reduce(
                (sum: number, e: TimesheetEntry) => sum + (e.hours || 0),
                0
              );

              return (
                <div key={timesheet.id} className="timesheet-history-item">
                  <div className="timesheet-history-header">
                    <div>
                      <h3>{project?.title || 'Unknown Project'}</h3>
                      <p>
                        Approved: {timesheet.approved_at ? formatDateIST(timesheet.approved_at, 'MMM dd, yyyy') : 'N/A'}
                      </p>
                      <p>Total Hours: {totalHours.toFixed(2)}</p>
                    </div>
                    <button
                      className="timesheet-btn timesheet-btn-primary"
                      onClick={() => handleExport(timesheet)}
                    >
                      Export Excel
                    </button>
                  </div>
                  <div className="timesheet-history-entries">
                    <table className="timesheet-history-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries
                          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                          .map((entry) => (
                            <tr key={entry.id}>
                              <td>{formatDateIST(entry.date, 'MMM dd, yyyy')}</td>
                              <td>{entry.hours}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
