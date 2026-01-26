import { useState, useEffect, useCallback } from 'react';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import type { Project, Timesheet, TimesheetEntry } from '../types';
import { formatDateIST } from '../utils/timezone';
import './Page.css';
import './Timesheet.css';

interface DateEntry {
  date: string; // YYYY-MM-DD
  hours: number;
}

interface ProjectTimesheetData {
  project: Project;
  roleName: string;
  timesheet: Timesheet | null;
  entries: Map<string, number>; // date -> hours
  dates: string[];
}

export function Timesheet() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [projects, setProjects] = useState<ProjectTimesheetData[]>([]);
  const [historyTimesheets, setHistoryTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // projectId being saved
  const [submitting, setSubmitting] = useState<string | null>(null); // projectId being submitted
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());

  // Generate dates array from start_date to end_date
  const generateDates = useCallback((startDate: string, endDate: string): string[] => {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }, []);

  // Fetch projects and timesheets
  useEffect(() => {
    if (activeTab === 'active') {
      fetchActiveTimesheets();
    } else {
      fetchHistory();
    }
  }, [activeTab, user]);

  const fetchActiveTimesheets = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch projects where user is a member
      const projectsResponse = await api.get('/api/timesheets/projects');
      const projectsList: Project[] = projectsResponse.data.projects || [];

      // Fetch all timesheets for user
      const timesheetsResponse = await api.get('/api/timesheets');
      const timesheets: Timesheet[] = timesheetsResponse.data.timesheets || [];

      // Combine projects with their timesheets
      const projectsWithTimesheets: ProjectTimesheetData[] = projectsList.map((project) => {
        const timesheet = timesheets.find((t) => t.project_id === project.id) || null;
        const roleName = (project as any).role_name || 'N/A';
        
        // Generate dates for this project
        const dates = generateDates(project.start_date, project.end_date);
        
        // Create entries map from timesheet entries
        const entries = new Map<string, number>();
        if (timesheet?.entries) {
          timesheet.entries.forEach((entry: TimesheetEntry) => {
            entries.set(entry.date, entry.hours);
          });
        }

        // Initialize empty entries for all dates if no timesheet exists
        dates.forEach((date) => {
          if (!entries.has(date)) {
            entries.set(date, 0);
          }
        });

        return {
          project,
          roleName,
          timesheet,
          entries,
          dates,
        };
      });

      setProjects(projectsWithTimesheets);
    } catch (err: any) {
      setError(err.message || 'Failed to load timesheets');
    } finally {
      setLoading(false);
    }
  };

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
      return `Total hours for ${date} exceeds 24 hours (${totalHours.toFixed(2)} hours)`;
    }

    return null;
  };

  // Update hours for a specific date in a project
  const updateHours = (projectId: string, date: string, hours: number) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.project.id === projectId) {
          const newEntries = new Map(p.entries);
          newEntries.set(date, hours);
          return { ...p, entries: newEntries };
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

  // Validate all entries for a project
  const validateProject = (projectData: ProjectTimesheetData): string[] => {
    const errors: string[] = [];

    projectData.dates.forEach((date) => {
      const hours = projectData.entries.get(date) || 0;

      // Validate cell hours
      if (!validateCellHours(hours)) {
        errors.push(`Hours for ${date} must be between 0 and 24`);
        return;
      }

      // Validate day hours across projects
      if (hours > 0) {
        const dayError = validateDayHours(date, projectData.project.id, hours);
        if (dayError) {
          errors.push(dayError);
        }
      }
    });

    return errors;
  };

  // Save draft
  const handleSaveDraft = async (projectData: ProjectTimesheetData) => {
    const errors = validateProject(projectData);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    setSaving(projectData.project.id);
    setError(null);

    try {
      // Convert entries map to array
      const entries: DateEntry[] = projectData.dates.map((date) => ({
        date,
        hours: projectData.entries.get(date) || 0,
      }));

      const response = await api.post('/api/timesheets', {
        project_id: projectData.project.id,
        entries,
      });

      // Update timesheet in state
      setProjects((prev) =>
        prev.map((p) => {
          if (p.project.id === projectData.project.id) {
            return { ...p, timesheet: response.data.timesheet };
          }
          return p;
        })
      );
    } catch (err: any) {
      setError(err.message || 'Failed to save timesheet');
    } finally {
      setSaving(null);
    }
  };

  // Submit timesheet
  const handleSubmit = async (projectData: ProjectTimesheetData) => {
    const errors = validateProject(projectData);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    if (!projectData.timesheet) {
      setError('Please save draft before submitting');
      return;
    }

    setSubmitting(projectData.project.id);
    setError(null);

    try {
      await api.post(`/api/timesheets/${projectData.timesheet.id}/submit`);

      // Refresh timesheets
      await fetchActiveTimesheets();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to submit timesheet');
    } finally {
      setSubmitting(null);
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

  // Group dates into weeks (for visual grouping)
  const groupDatesIntoWeeks = (dates: string[]): string[][] => {
    const weeks: string[][] = [];
    let currentWeek: string[] = [];

    dates.forEach((date, index) => {
      currentWeek.push(date);
      if (currentWeek.length === 7 || index === dates.length - 1) {
        weeks.push([...currentWeek]);
        currentWeek = [];
      }
    });

    return weeks;
  };

  // Format date for display (using IST timezone)
  const formatDate = (dateStr: string): string => {
    return formatDateIST(dateStr, 'MMM dd');
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
        <div className="timesheet-container">
          {projects.length === 0 ? (
            <div className="page-content">
              <p>No projects assigned. Contact your administrator to be assigned to a project.</p>
            </div>
          ) : (
            projects.map((projectData) => {
              const isDraft = !projectData.timesheet || projectData.timesheet.status === 'DRAFT';
              const isSubmitted = projectData.timesheet?.status === 'SUBMITTED';
              const isApproved = projectData.timesheet?.status === 'APPROVED';
              const isReadOnly = isSubmitted || isApproved;

              // Calculate total hours
              const totalHours = Array.from(projectData.entries.values()).reduce(
                (sum, hours) => sum + hours,
                0
              );

              // Group dates into weeks
              const weeks = groupDatesIntoWeeks(projectData.dates);

              return (
                <div key={projectData.project.id} className="timesheet-project-block">
                  <div className="timesheet-project-header">
                    <div>
                      <h3>{projectData.project.title}</h3>
                      <p className="timesheet-project-role">Role: {projectData.roleName}</p>
                      <p className="timesheet-project-status">
                        Status:{' '}
                        <span
                          className={`timesheet-status-badge ${
                            isDraft
                              ? 'draft'
                              : isSubmitted
                              ? 'submitted'
                              : isApproved
                              ? 'approved'
                              : ''
                          }`}
                        >
                          {projectData.timesheet?.status || 'DRAFT'}
                        </span>
                      </p>
                    </div>
                    <div className="timesheet-project-actions">
                      {isDraft && (
                        <>
                          <button
                            className="timesheet-btn timesheet-btn-secondary"
                            onClick={() => handleSaveDraft(projectData)}
                            disabled={saving === projectData.project.id}
                          >
                            {saving === projectData.project.id ? 'Saving...' : 'Save Draft'}
                          </button>
                          <button
                            className="timesheet-btn timesheet-btn-primary"
                            onClick={() => handleSubmit(projectData)}
                            disabled={submitting === projectData.project.id}
                          >
                            {submitting === projectData.project.id ? 'Submitting...' : 'Submit'}
                          </button>
                        </>
                      )}
                      {isApproved && (
                        <button
                          className="timesheet-btn timesheet-btn-primary"
                          onClick={() => handleExport(projectData.timesheet!)}
                        >
                          Export Excel
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="timesheet-table-container">
                    <table className="timesheet-table">
                      <thead>
                        <tr>
                          <th className="timesheet-sticky-col">Project</th>
                          <th className="timesheet-sticky-col">Role</th>
                          {weeks.map((week, weekIndex) => (
                            <th key={weekIndex} colSpan={week.length} className="timesheet-week-header">
                              Week {weekIndex + 1}
                            </th>
                          ))}
                          <th>Total</th>
                        </tr>
                        <tr>
                          <th className="timesheet-sticky-col"></th>
                          <th className="timesheet-sticky-col"></th>
                          {projectData.dates.map((date) => (
                            <th key={date} className="timesheet-date-header">
                              {formatDate(date)}
                            </th>
                          ))}
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="timesheet-sticky-col">{projectData.project.title}</td>
                          <td className="timesheet-sticky-col">{projectData.roleName}</td>
                          {projectData.dates.map((date) => {
                            const hours = projectData.entries.get(date) || 0;
                            const errorKey = `${projectData.project.id}-${date}`;
                            const hasError = validationErrors.has(errorKey);

                            return (
                              <td key={date} className="timesheet-cell">
                                {isReadOnly ? (
                                  <span className="timesheet-hours-readonly">{hours || 0}</span>
                                ) : (
                                  <input
                                    type="number"
                                    min="0"
                                    max="24"
                                    step="0.5"
                                    value={hours === 0 ? '' : hours}
                                    onChange={(e) => {
                                      const inputValue = e.target.value;
                                      
                                      // Allow empty string during typing
                                      if (inputValue === '') {
                                        // Clear validation error and set to 0
                                        setValidationErrors((prev) => {
                                          const newErrors = new Map(prev);
                                          newErrors.delete(errorKey);
                                          return newErrors;
                                        });
                                        updateHours(projectData.project.id, date, 0);
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
                                      // On blur, ensure we have a valid number or 0
                                      const inputValue = e.target.value;
                                      if (inputValue === '' || isNaN(parseFloat(inputValue))) {
                                        updateHours(projectData.project.id, date, 0);
                                      }
                                    }}
                                    className={`timesheet-hours-input ${hasError ? 'error' : ''}`}
                                    placeholder="0"
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
                          <td className="timesheet-total-cell">{totalHours.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
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
