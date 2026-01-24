import { useState, useEffect } from 'react';
import api from '../../config/api';
import { colors } from '../../config/colors';

interface ProjectReportsSectionProps {
  projectId: string;
}

interface PlannedVsActualRow {
  user_email: string;
  role_name: string;
  planned_hours: number;
  actual_hours: number;
  variance: number;
  variance_percentage: number;
}

interface CostSummary {
  planned_cost: number;
  actual_cost: number;
  variance: number;
  variance_percentage: number;
  budget_status: 'under' | 'on_track' | 'over';
}

export function ProjectReportsSection({ projectId }: ProjectReportsSectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plannedVsActual, setPlannedVsActual] = useState<PlannedVsActualRow[]>([]);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetchReports();
    }
  }, [projectId]);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);

    try {
      const [plannedVsActualRes, costSummaryRes] = await Promise.all([
        api.get(`/api/project-setup/${projectId}/reports/planned-vs-actual`),
        api.get(`/api/project-setup/${projectId}/reports/cost-summary`),
      ]);

      setPlannedVsActual(plannedVsActualRes.data.data || []);
      setCostSummary(costSummaryRes.data.data || null);
    } catch (err: any) {
      console.error('Error fetching reports:', err);
      setError(err.response?.data?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type: 'planned' | 'actual' | 'variance') => {
    setExporting(true);
    try {
      const response = await api.get(
        `/api/project-setup/${projectId}/reports/export?type=${type}`,
        {
          responseType: 'blob',
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `project-${projectId}-${type}-report.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error exporting report:', err);
      alert(err.response?.data?.message || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: colors.text.secondary }}>
        Loading reports...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          style={{
            padding: '16px',
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: '8px',
            borderLeft: '4px solid #dc2626',
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Cost Summary */}
      {costSummary && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: colors.text.primary }}>
            Cost Summary
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}>
            <div style={{
              padding: '16px',
              background: '#f9fafb',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
            }}>
              <div style={{ fontSize: '12px', color: colors.text.secondary, marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>
                Planned Cost
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: colors.text.primary }}>
                ${costSummary.planned_cost.toFixed(2)}
              </div>
            </div>
            <div style={{
              padding: '16px',
              background: '#f9fafb',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
            }}>
              <div style={{ fontSize: '12px', color: colors.text.secondary, marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>
                Actual Cost
              </div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: colors.text.primary }}>
                ${costSummary.actual_cost.toFixed(2)}
              </div>
            </div>
            <div style={{
              padding: '16px',
              background: '#f9fafb',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
            }}>
              <div style={{ fontSize: '12px', color: colors.text.secondary, marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>
                Variance
              </div>
              <div style={{ 
                fontSize: '24px', 
                fontWeight: '700', 
                color: costSummary.variance > 0 ? '#dc2626' : costSummary.variance < 0 ? '#059669' : colors.text.primary 
              }}>
                ${Math.abs(costSummary.variance).toFixed(2)}
                <span style={{ fontSize: '14px', marginLeft: '4px' }}>
                  ({costSummary.variance > 0 ? '+' : ''}{costSummary.variance_percentage.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div style={{
              padding: '16px',
              background: costSummary.budget_status === 'over' ? '#fee2e2' : 
                         costSummary.budget_status === 'on_track' ? '#fef3c7' : '#d1fae5',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
            }}>
              <div style={{ fontSize: '12px', color: colors.text.secondary, marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase' }}>
                Budget Status
              </div>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: '700',
                color: costSummary.budget_status === 'over' ? '#991b1b' : 
                       costSummary.budget_status === 'on_track' ? '#92400e' : '#065f46'
              }}>
                {costSummary.budget_status === 'over' && '🔴 Over Budget'}
                {costSummary.budget_status === 'on_track' && '🟡 On Track'}
                {costSummary.budget_status === 'under' && '🟢 Under Budget'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Planned vs Actual Hours */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: colors.text.primary }}>
          Planned vs Actual Hours
        </h3>
        
        {plannedVsActual.length === 0 ? (
          <div style={{ 
            padding: '48px', 
            textAlign: 'center', 
            color: colors.text.secondary,
            background: '#f9fafb',
            borderRadius: '8px',
            border: `1px dashed ${colors.border}`,
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
            <div style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>No data available</div>
            <div style={{ fontSize: '14px' }}>Complete cost planning and log timesheet entries to see this report</div>
          </div>
        ) : (
          <div style={{ 
            border: `1px solid ${colors.border}`, 
            borderRadius: '8px', 
            overflow: 'hidden' 
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  <th style={{ 
                    padding: '12px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    color: colors.text.secondary,
                    textTransform: 'uppercase',
                    borderBottom: `2px solid ${colors.border}`,
                  }}>
                    User
                  </th>
                  <th style={{ 
                    padding: '12px', 
                    textAlign: 'left', 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    color: colors.text.secondary,
                    textTransform: 'uppercase',
                    borderBottom: `2px solid ${colors.border}`,
                  }}>
                    Role
                  </th>
                  <th style={{ 
                    padding: '12px', 
                    textAlign: 'right', 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    color: colors.text.secondary,
                    textTransform: 'uppercase',
                    borderBottom: `2px solid ${colors.border}`,
                  }}>
                    Planned Hours
                  </th>
                  <th style={{ 
                    padding: '12px', 
                    textAlign: 'right', 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    color: colors.text.secondary,
                    textTransform: 'uppercase',
                    borderBottom: `2px solid ${colors.border}`,
                  }}>
                    Actual Hours
                  </th>
                  <th style={{ 
                    padding: '12px', 
                    textAlign: 'right', 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    color: colors.text.secondary,
                    textTransform: 'uppercase',
                    borderBottom: `2px solid ${colors.border}`,
                  }}>
                    Variance
                  </th>
                  <th style={{ 
                    padding: '12px', 
                    textAlign: 'center', 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    color: colors.text.secondary,
                    textTransform: 'uppercase',
                    borderBottom: `2px solid ${colors.border}`,
                  }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {plannedVsActual.map((row, index) => (
                  <tr 
                    key={index}
                    style={{ 
                      borderBottom: index < plannedVsActual.length - 1 ? `1px solid ${colors.border}` : 'none',
                      background: index % 2 === 0 ? colors.white : '#f9fafb',
                    }}
                  >
                    <td style={{ padding: '12px', fontSize: '14px', color: colors.text.primary, fontWeight: '500' }}>
                      {row.user_email}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: colors.text.secondary }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: '#dbeafe',
                        color: '#1e40af',
                        fontSize: '12px',
                        fontWeight: '500',
                      }}>
                        {row.role_name}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: colors.text.primary, textAlign: 'right', fontWeight: '600' }}>
                      {row.planned_hours.toFixed(2)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: colors.text.primary, textAlign: 'right', fontWeight: '600' }}>
                      {row.actual_hours.toFixed(2)}
                    </td>
                    <td style={{ 
                      padding: '12px', 
                      fontSize: '14px', 
                      textAlign: 'right', 
                      fontWeight: '700',
                      color: row.variance > 0 ? '#059669' : row.variance < 0 ? '#dc2626' : colors.text.primary,
                    }}>
                      {row.variance > 0 ? '+' : ''}{row.variance.toFixed(2)}
                      <span style={{ fontSize: '12px', marginLeft: '4px' }}>
                        ({row.variance_percentage > 0 ? '+' : ''}{row.variance_percentage.toFixed(1)}%)
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        background: Math.abs(row.variance_percentage) <= 10 ? '#d1fae5' :
                                   Math.abs(row.variance_percentage) <= 25 ? '#fef3c7' : '#fee2e2',
                        color: Math.abs(row.variance_percentage) <= 10 ? '#065f46' :
                               Math.abs(row.variance_percentage) <= 25 ? '#92400e' : '#991b1b',
                      }}>
                        {Math.abs(row.variance_percentage) <= 10 ? '🟢 On Track' :
                         Math.abs(row.variance_percentage) <= 25 ? '🟡 Review' : '🔴 Alert'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Options */}
      <div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600', color: colors.text.primary }}>
          Export Reports
        </h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleExport('planned')}
            disabled={exporting}
            style={{
              padding: '10px 20px',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              background: colors.white,
              color: colors.text.primary,
              fontSize: '14px',
              fontWeight: '500',
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!exporting) {
                e.currentTarget.style.borderColor = colors.primary.main;
                e.currentTarget.style.background = '#eff6ff';
              }
            }}
            onMouseLeave={(e) => {
              if (!exporting) {
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.background = colors.white;
              }
            }}
          >
            📥 Export Planned Cost
          </button>
          <button
            onClick={() => handleExport('actual')}
            disabled={exporting}
            style={{
              padding: '10px 20px',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              background: colors.white,
              color: colors.text.primary,
              fontSize: '14px',
              fontWeight: '500',
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!exporting) {
                e.currentTarget.style.borderColor = colors.primary.main;
                e.currentTarget.style.background = '#eff6ff';
              }
            }}
            onMouseLeave={(e) => {
              if (!exporting) {
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.background = colors.white;
              }
            }}
          >
            📥 Export Actual Cost
          </button>
          <button
            onClick={() => handleExport('variance')}
            disabled={exporting}
            style={{
              padding: '10px 20px',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              background: colors.white,
              color: colors.text.primary,
              fontSize: '14px',
              fontWeight: '500',
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!exporting) {
                e.currentTarget.style.borderColor = colors.primary.main;
                e.currentTarget.style.background = '#eff6ff';
              }
            }}
            onMouseLeave={(e) => {
              if (!exporting) {
                e.currentTarget.style.borderColor = colors.border;
                e.currentTarget.style.background = colors.white;
              }
            }}
          >
            📥 Export Variance Report
          </button>
        </div>
      </div>
    </div>
  );
}

