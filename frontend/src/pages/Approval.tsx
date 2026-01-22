import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import type { ProjectWithSubmittedTimesheets, ProjectApprovalData, ProjectApprovalRow } from '../types';
import { formatDate, calculateTotalHoursFromRows, calculateTotalAmount, calculateTotalQuote } from '../utils/approval';
import { formatDateIST } from '../utils/timezone';
import './Page.css';
import './Approval.css';

export function Approval() {
  const { profile } = useAuth();
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
    if (profile) {
      const hasAccess = 
        profile.role === 'SUPER_ADMIN' ||
        profile.roles.includes('ADMIN') ||
        profile.roles.includes('MANAGER');

      if (!hasAccess) {
        setError('You do not have permission to access this page');
        setLoading(false);
      }
    }
  }, [profile]);

  // Fetch projects with submitted timesheets
  useEffect(() => {
    if (profile && (profile.role === 'SUPER_ADMIN' || profile.roles.includes('ADMIN') || profile.roles.includes('MANAGER'))) {
      fetchProjects();
    }
  }, [profile]);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('http://localhost:5000/api/approval/projects', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch projects');
      }

      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectDetail = async (projectId: string) => {
    setLoadingDetail(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(`http://localhost:5000/api/approval/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch project details');
      }

      // Initialize edited rows with current values
      const initialEdited: { [userId: string]: { rate: number; quote_amount: number | null } } = {};
      for (const row of data.approval_rows || []) {
        initialEdited[row.user_id] = {
          rate: row.rate,
          quote_amount: row.quote_amount,
        };
      }
      setEditedRows(initialEdited);

      setSelectedProject(data);
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Prepare costing updates
      const costingUpdates = Object.entries(editedRows).map(([user_id, values]) => ({
        user_id,
        rate: values.rate,
        quote_amount: values.quote_amount,
      }));

      const response = await fetch(`http://localhost:5000/api/approval/projects/${selectedProject.project.id}/costing`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ costing_updates: costingUpdates }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save costing');
      }

      // Refresh project detail
      await fetchProjectDetail(selectedProject.project.id);
      
      alert('Costing saved successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to save costing');
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(`http://localhost:5000/api/approval/projects/${selectedProject.project.id}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to approve timesheets');
      }

      alert(`Successfully approved ${data.timesheets?.length || 0} timesheet(s)`);
      
      // Refresh projects list and close modal
      await fetchProjects();
      handleCloseModal();
    } catch (err: any) {
      setError(err.message || 'Failed to approve timesheets');
    } finally {
      setApproving(false);
    }
  };

  const handleExportExcel = async () => {
    if (!selectedProject) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `http://localhost:5000/api/approval/projects/${selectedProject.project.id}/export/excel`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to export Excel');
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `approval-${selectedProject.project.title}-${selectedProject.project.id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Failed to export Excel');
    }
  };

  const handleExportPDF = async () => {
    if (!selectedProject) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `http://localhost:5000/api/approval/projects/${selectedProject.project.id}/export/pdf`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to export PDF');
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `approval-${selectedProject.project.title}-${selectedProject.project.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Failed to export PDF');
    }
  };

  // Calculate totals
  const totalHours = selectedProject ? calculateTotalHoursFromRows(selectedProject.approval_rows) : 0;
  const totalAmount = selectedProject ? calculateTotalAmount(selectedProject.approval_rows) : 0;
  const totalQuote = selectedProject ? calculateTotalQuote(selectedProject.approval_rows) : 0;

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
                          {selectedProject.date_range.map((date) => (
                            <td key={date}>
                              {row.day_hours[date] ? row.day_hours[date].toFixed(2) : '0.00'}
                            </td>
                          ))}
                          <td>{row.total_hours.toFixed(2)}</td>
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
                disabled={loadingDetail || approving}
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
