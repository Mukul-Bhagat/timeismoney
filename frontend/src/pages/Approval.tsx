import { useState, useEffect } from 'react';
import api from '../config/api';
import { useAuth } from '../context/AuthContext';
import type { ProjectWithSubmittedTimesheets, ProjectApprovalData, ProjectApprovalRow } from '../types';
import { formatDate, calculateTotalHoursFromRows, calculateTotalPlannedHours, getDifferenceColor } from '../utils/approval';
import { formatDateIST } from '../utils/timezone';
import './Page.css';
import './Approval.css';

export function Approval() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithSubmittedTimesheets[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectApprovalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editedRows, setEditedRows] = useState<{ [userId: string]: { rate: number; quote_amount: number | null } }>({});

  // Check if user has access (ADMIN or MANAGER)
  useEffect(() => {
    if (user) {
      const hasAccess = 
        user.role === 'SUPER_ADMIN' ||
        user.role === 'ADMIN' ||
        user.role === 'MANAGER';

      if (!hasAccess) {
        setError('You do not have permission to access this page');
        setLoading(false);
      }
    }
  }, [user]);

  // Fetch projects with submitted timesheets
  useEffect(() => {
    if (user && (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'MANAGER')) {
      fetchProjects();
    }
  }, [user]);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/api/approval/projects');

      if (response.data.success) {
        setProjects(response.data.projects || []);
      } else {
        throw new Error(response.data.message || 'Failed to fetch projects');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectDetail = async (projectId: string) => {
    setLoadingDetail(true);
    setError(null);

    try {
      const response = await api.get(`/api/approval/projects/${projectId}`);

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to fetch project details');
      }

      const data = response.data;

      // Initialize edited rows with current values
      const initialEdited: { [userId: string]: { rate: number; quote_amount: number | null } } = {};
      for (const row of data.approval_rows || []) {
        initialEdited[row.user_id] = {
          rate: row.rate,
          quote_amount: row.quote_amount,
        };
      }
      setEditedRows(initialEdited);

      setSelectedProject({
        project: data.project,
        date_range: data.date_range,
        approval_rows: data.approval_rows,
        submission_status: data.submission_status,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch project details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleProjectClick = (projectId: string) => {
    fetchProjectDetail(projectId);
  };

  const handleCloseModal = () => {
    setSelectedProject(null);
    setEditedRows({});
  };

  const handleRateChange = (userId: string, rate: number) => {
    setEditedRows(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        rate: parseFloat(rate.toString()) || 0,
      },
    }));
  };

  const handleQuoteChange = (userId: string, quoteAmount: number | null) => {
    setEditedRows(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        quote_amount: quoteAmount !== null && quoteAmount !== undefined ? parseFloat(quoteAmount.toString()) || null : null,
      },
    }));
  };

  const handleSaveCosting = async () => {
    if (!selectedProject) return;

    setSaving(true);
    setError(null);

    try {
      // Prepare costing updates
      const costingUpdates = Object.entries(editedRows).map(([user_id, values]) => ({
        user_id,
        rate: values.rate,
        quote_amount: values.quote_amount,
      }));

      const response = await api.put(`/api/approval/projects/${selectedProject.project.id}/costing`, {
        costing_updates: costingUpdates,
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to save costing');
      }

      // Refresh project detail
      await fetchProjectDetail(selectedProject.project.id);
      
      alert('Costing saved successfully');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save costing');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedProject) return;

    if (!confirm('Are you sure you want to approve all timesheets for this project? This action cannot be undone.')) {
      return;
    }

    setApproving(true);
    setError(null);

    try {
      const response = await api.post(`/api/approval/projects/${selectedProject.project.id}/approve`);

      if (!response.data.success) {
        // Check if it's a validation error (400) - show as info, not error
        if (response.status === 400 && response.data.pending_count !== undefined) {
          // This is a validation message, not an error
          setError(null); // Clear any previous errors
          // Show info message instead of error
          const pendingList = response.data.pending_users?.length > 0 
            ? `\n\nPending users: ${response.data.pending_users.join(', ')}`
            : '';
          alert(`${response.data.message}${pendingList}`);
          return; // Don't treat as error
        }
        throw new Error(response.data.message || 'Failed to approve timesheets');
      }

      alert(`Successfully approved ${response.data.timesheets?.length || 0} timesheet(s)`);
      
      // Refresh projects list and close modal
      await fetchProjects();
      handleCloseModal();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to approve timesheets');
    } finally {
      setApproving(false);
    }
  };

  const handleExportExcel = async () => {
    if (!selectedProject) return;

    try {
      const response = await api.get(
        `/api/approval/projects/${selectedProject.project.id}/export/excel`,
        {
          responseType: 'blob',
        }
      );

      if (response.status !== 200) {
        throw new Error('Failed to export Excel');
      }

      // Download file
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `approval-${selectedProject.project.title}-${selectedProject.project.id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to export Excel');
    }
  };

  const handleExportPDF = async () => {
    if (!selectedProject) return;

    try {
      const response = await api.get(
        `/api/approval/projects/${selectedProject.project.id}/export/pdf`,
        {
          responseType: 'blob',
        }
      );

      if (response.status !== 200) {
        throw new Error('Failed to export PDF');
      }

      // Download file
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `approval-${selectedProject.project.title}-${selectedProject.project.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to export PDF');
    }
  };

  // Calculate totals
  const totalHours = selectedProject ? calculateTotalHoursFromRows(selectedProject.approval_rows) : 0;
  const totalPlannedHours = selectedProject ? calculateTotalPlannedHours(selectedProject.approval_rows) : 0;
  const totalDifference = totalHours - totalPlannedHours;
  const totalDifferencePercentage = totalPlannedHours > 0 ? (totalDifference / totalPlannedHours) * 100 : 0;
  
  // Check if any row has planned data
  const hasPlannedData = selectedProject 
    ? selectedProject.approval_rows.some(row => row.planned_total_hours !== undefined)
    : false;

  // Calculate amounts with edited rates
  const getCalculatedAmount = (row: ProjectApprovalRow): number => {
    const edited = editedRows[row.user_id];
    const rate = edited ? edited.rate : row.rate;
    return row.total_hours * rate;
  };

  const getTotalAmountWithEdits = (): number => {
    if (!selectedProject) return 0;
    return selectedProject.approval_rows.reduce((sum, row) => sum + getCalculatedAmount(row), 0);
  };

  if (loading) {
    return (
      <div className="page">
        <h1 className="page-title">Approval</h1>
        <p className="page-subtitle">Review and approve timesheets</p>
        <div className="approval-loading">Loading projects...</div>
      </div>
    );
  }

  if (error && !selectedProject) {
    return (
      <div className="page">
        <h1 className="page-title">Approval</h1>
        <p className="page-subtitle">Review and approve timesheets</p>
        <div className="approval-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Approval</h1>
      <p className="page-subtitle">Review and approve timesheets</p>

      {error && <div className="approval-error">{error}</div>}

      {projects.length === 0 ? (
        <div className="approval-empty">
          <h3>No projects with submitted timesheets</h3>
          <p>Projects will appear here once employees submit their timesheets.</p>
        </div>
      ) : (
        <div className="approval-project-list">
          {projects.map((project) => (
            <div
              key={project.id}
              className="approval-project-card"
              onClick={() => handleProjectClick(project.id)}
            >
              <h3>{project.title}</h3>
              <p>{project.description || 'No description'}</p>
              <div className="approval-project-meta">
                <span className="approval-submitted-badge">
                  {project.submitted_count} submitted
                </span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {formatDateIST(project.start_date, 'MMM dd, yyyy')} - {formatDateIST(project.end_date, 'MMM dd, yyyy')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project Detail Modal */}
      {selectedProject && (
        <div className="approval-modal-overlay" onClick={handleCloseModal}>
          <div className="approval-modal" onClick={(e) => e.stopPropagation()}>
            <div className="approval-modal-header">
              <div>
                <h2>{selectedProject.project.title}</h2>
                <p>
                  {formatDateIST(selectedProject.project.start_date, 'MMM dd, yyyy')} - {formatDateIST(selectedProject.project.end_date, 'MMM dd, yyyy')}
                </p>
                {selectedProject.project.description && (
                  <p style={{ marginTop: '8px' }}>{selectedProject.project.description}</p>
                )}
              </div>
              <button className="approval-modal-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>

            <div className="approval-modal-content">
              {loadingDetail ? (
                <div className="approval-loading">Loading project details...</div>
              ) : (
                <>
                  {/* Submission Status Banner */}
                  {selectedProject.submission_status && (
                    <div
                      style={{
                        padding: '12px 16px',
                        marginBottom: '16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        backgroundColor: selectedProject.submission_status.all_submitted
                          ? '#d1fae5'
                          : '#fef3c7',
                        border: `1px solid ${selectedProject.submission_status.all_submitted ? '#10b981' : '#f59e0b'}`,
                        color: selectedProject.submission_status.all_submitted ? '#065f46' : '#92400e',
                      }}
                    >
                      {selectedProject.submission_status.all_submitted ? (
                        <div>
                          <strong>✓ All timesheets submitted</strong> ({selectedProject.submission_status.submitted_count} of {selectedProject.submission_status.total_members} members)
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            You can now approve this project.
                          </div>
                        </div>
                      ) : (
                        <div>
                          <strong>⚠ Approval not ready</strong>
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            {selectedProject.submission_status.pending_count} of {selectedProject.submission_status.total_members} member(s) still need to submit their timesheets.
                            {selectedProject.submission_status.pending_users.length > 0 && (
                              <div style={{ marginTop: '4px', fontWeight: '500' }}>
                                Pending: {selectedProject.submission_status.pending_users.join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="approval-table-container">
                  <table className="approval-table">
                    <thead>
                      <tr>
                        <th className="approval-sticky-col">Name</th>
                        <th className="approval-sticky-col">Role</th>
                        {selectedProject.date_range.map((date) => (
                          <th key={date} className="approval-date-header">
                            {formatDate(date)}
                          </th>
                        ))}
                        <th>Total Hours</th>
                        {hasPlannedData && <th>Planned Hours</th>}
                        {hasPlannedData && <th>Difference</th>}
                        <th>Rate</th>
                        <th>Amount</th>
                        <th>Quote Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProject.approval_rows.map((row) => (
                        <tr key={row.user_id}>
                          <td className="approval-sticky-col">{row.name}</td>
                          <td className="approval-sticky-col">{row.role}</td>
                          {selectedProject.date_range.map((date) => {
                            const actualHours = row.day_hours[date] || 0;
                            const plannedHours = row.planned_day_hours?.[date] || 0;
                            const showPlanned = hasPlannedData && plannedHours > 0;
                            
                            return (
                              <td key={date}>
                                {showPlanned ? (
                                  <div className="approval-hours-cell">
                                    <span className="approval-hours-actual">
                                      {actualHours.toFixed(2)}
                                    </span>
                                    <span className="approval-hours-planned">
                                      ({plannedHours.toFixed(2)} planned)
                                    </span>
                                  </div>
                                ) : (
                                  actualHours.toFixed(2)
                                )}
                              </td>
                            );
                          })}
                          <td>{row.total_hours.toFixed(2)}</td>
                          {hasPlannedData && (
                            <td>
                              {row.planned_total_hours !== undefined 
                                ? row.planned_total_hours.toFixed(2) 
                                : '-'}
                            </td>
                          )}
                          {hasPlannedData && (
                            <td>
                              {row.difference_hours !== undefined ? (
                                <div className={`approval-diff-cell ${getDifferenceColor(row.difference_percentage)}`}>
                                  <span className="approval-diff-value">
                                    {row.difference_hours >= 0 ? '+' : ''}{row.difference_hours.toFixed(2)}
                                  </span>
                                  {row.difference_percentage !== undefined && (
                                    <span className="approval-diff-percentage">
                                      {row.difference_percentage >= 0 ? '+' : ''}{row.difference_percentage.toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              ) : '-'}
                            </td>
                          )}
                          <td>
                            <input
                              type="number"
                              className="approval-input"
                              value={editedRows[row.user_id]?.rate ?? row.rate}
                              onChange={(e) => handleRateChange(row.user_id, parseFloat(e.target.value) || 0)}
                              min="0"
                              step="0.01"
                            />
                          </td>
                          <td>{getCalculatedAmount(row).toFixed(2)}</td>
                          <td>
                            <input
                              type="number"
                              className="approval-input"
                              value={editedRows[row.user_id]?.quote_amount ?? row.quote_amount ?? ''}
                              onChange={(e) => handleQuoteChange(row.user_id, e.target.value ? parseFloat(e.target.value) : null)}
                              min="0"
                              step="0.01"
                              placeholder="Optional"
                            />
                          </td>
                        </tr>
                      ))}
                      <tr className="approval-totals-row">
                        <td className="approval-sticky-col" colSpan={2}>
                          <strong>TOTALS</strong>
                        </td>
                        {selectedProject.date_range.map((date) => (
                          <td key={date}>
                            {selectedProject.approval_rows
                              .reduce((sum, row) => sum + (row.day_hours[date] || 0), 0)
                              .toFixed(2)}
                          </td>
                        ))}
                        <td><strong>{totalHours.toFixed(2)}</strong></td>
                        {hasPlannedData && (
                          <td>
                            <strong>{totalPlannedHours.toFixed(2)}</strong>
                          </td>
                        )}
                        {hasPlannedData && (
                          <td>
                            <div className={`approval-diff-cell ${getDifferenceColor(totalDifferencePercentage)}`}>
                              <span className="approval-diff-value">
                                <strong>{totalDifference >= 0 ? '+' : ''}{totalDifference.toFixed(2)}</strong>
                              </span>
                              <span className="approval-diff-percentage">
                                {totalDifferencePercentage >= 0 ? '+' : ''}{totalDifferencePercentage.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        )}
                        <td></td>
                        <td><strong>{getTotalAmountWithEdits().toFixed(2)}</strong></td>
                        <td>
                          <strong>
                            {selectedProject.approval_rows
                              .reduce((sum, row) => sum + ((editedRows[row.user_id]?.quote_amount ?? row.quote_amount) || 0), 0)
                              .toFixed(2)}
                          </strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </div>

            <div className="approval-modal-actions">
              <button
                className="approval-btn approval-btn-secondary"
                onClick={handleExportExcel}
                disabled={loadingDetail}
              >
                Download Excel
              </button>
              <button
                className="approval-btn approval-btn-secondary"
                onClick={handleExportPDF}
                disabled={loadingDetail}
              >
                Download PDF
              </button>
              <button
                className="approval-btn approval-btn-primary"
                onClick={handleSaveCosting}
                disabled={loadingDetail || saving}
              >
                {saving ? 'Saving...' : 'Save Costing'}
              </button>
              <button
                className="approval-btn approval-btn-success"
                onClick={handleApprove}
                disabled={
                  loadingDetail || 
                  approving || 
                  (selectedProject.submission_status && !selectedProject.submission_status.all_submitted)
                }
                title={
                  selectedProject.submission_status && !selectedProject.submission_status.all_submitted
                    ? `Cannot approve: ${selectedProject.submission_status.pending_count} member(s) still need to submit their timesheets`
                    : 'Approve all timesheets for this project'
                }
              >
                {approving ? 'Approving...' : 'Approve Project'}
              </button>
              <button
                className="approval-btn approval-btn-secondary"
                onClick={handleCloseModal}
                disabled={saving || approving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
