import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../config/api';
import type { ProjectWithSetup } from '../types';
import './Page.css';
import '../components/projects/Projects.css';

/**
 * Cost Planning List Page
 * Shows all projects with their setup status and quick access to cost planning
 */
export function CostPlanningList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/api/projects');
      setProjects(response.data.projects || []);
    } catch (err: any) {
      console.error('Error fetching projects:', err);
      setError(err.response?.data?.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const getSetupStatusBadge = (status?: string) => {
    const statusMap = {
      draft: { color: '#fef3c7', text: '#92400e', label: 'Draft' },
      ready: { color: '#d1fae5', text: '#065f46', label: 'Planning Complete' },
      locked: { color: '#e0e7ff', text: '#3730a3', label: 'Locked' },
    };

    const statusStyle = statusMap[status as keyof typeof statusMap] || statusMap.draft;

    return (
      <div
        style={{
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '600',
          background: statusStyle.color,
          color: statusStyle.text,
          display: 'inline-block',
        }}
      >
        {statusStyle.label}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '18px', color: '#6b7280' }}>Loading projects...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div style={{ textAlign: 'center', padding: '48px', color: '#dc2626' }}>
          <div style={{ fontSize: '18px', marginBottom: '16px' }}>{error}</div>
          <button
            onClick={fetchProjects}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">💰 Cost Planning</h1>
        <p style={{ color: '#6b7280', marginTop: '8px' }}>
          Plan and manage project costs with weekly granularity
        </p>
      </div>

      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <div style={{ fontSize: '18px', color: '#374151', fontWeight: '600', marginBottom: '8px' }}>
            No projects found
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            Create a project first to start cost planning
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/project-setup/${project.id}`)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>
                    {project.title}
                  </h3>
                  {getSetupStatusBadge(project.setup_status)}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {new Date(project.start_date).toLocaleDateString()} -{' '}
                  {new Date(project.end_date).toLocaleDateString()}
                </div>
                {project.description && (
                  <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
                    {project.description.length > 100
                      ? project.description.substring(0, 100) + '...'
                      : project.description}
                  </div>
                )}
              </div>
              <div>
                <button
                  style={{
                    padding: '10px 20px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/project-setup/${project.id}`);
                  }}
                >
                  {project.setup_status === 'draft' ? 'Start Planning' : 'View Setup'} →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

