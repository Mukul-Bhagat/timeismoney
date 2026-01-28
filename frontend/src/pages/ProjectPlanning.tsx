import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../config/api';
import { ProjectBrand } from '../components/common/ProjectBrand';
import { ProjectPlanningSection } from '../components/projects/ProjectPlanningSection';
import './ProjectPlanning.css';

export function ProjectPlanning() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  const fetchProject = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/projects/${projectId}`);
      if (response.data.success) {
        setProject(response.data.project);
      } else {
        throw new Error(response.data.message || 'Failed to fetch project');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch project');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = () => {
    // Refresh project data after finalization
    fetchProject();
  };

  if (loading) {
    return (
      <div className="project-planning-page">
        <div className="planning-loading">
          <div className="planning-loading-spinner"></div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Loading project...</div>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="project-planning-page">
        <div className="planning-header">
          <div className="planning-header-left">
            <button
              className="planning-back-button"
              onClick={() => navigate('/projects')}
            >
              ← Back to Projects
            </button>
          </div>
        </div>
        <div className="planning-sheet-container">
          <div className="planning-error">
            {error || 'Project not found'}
          </div>
        </div>
      </div>
    );
  }

  // Calculate project duration
  const startDate = new Date(project.start_date);
  const endDate = new Date(project.end_date);
  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const durationWeeks = Math.ceil(durationDays / 7);

  return (
    <div className="project-planning-page">
      <div className="planning-header">
        <div className="planning-header-left">
          <button
            className="planning-back-button"
            onClick={() => navigate('/projects')}
          >
            ← Back to Projects
          </button>
          <div>
            <h1>
              Cost Planning:{' '}
              <ProjectBrand
                name={project.title}
                logoUrl={project.project_logo_url}
                size={48}
              />
            </h1>
            {project.setup_status && (
              <span
                className={`planning-status-badge ${
                  project.setup_status !== 'ready' ? 'planning-status-draft' : 'planning-status-ready'
                }`}
              >
                {project.setup_status !== 'ready' ? '🟡 Draft' : '🟢 Planning Complete'}
              </span>
            )}
          </div>
        </div>
        
        <div className="planning-header-info">
          <div className="planning-header-info-item">
            <span className="planning-header-info-label">Duration:</span>
            <span>{durationWeeks} weeks ({durationDays} days)</span>
          </div>
          <div className="planning-header-info-item">
            <span className="planning-header-info-label">Start:</span>
            <span>{new Date(project.start_date).toLocaleDateString()}</span>
          </div>
          <div className="planning-header-info-item">
            <span className="planning-header-info-label">End:</span>
            <span>{new Date(project.end_date).toLocaleDateString()}</span>
          </div>
          {project.project_manager_1 && (
            <div className="planning-header-info-item">
              <span className="planning-header-info-label">PM:</span>
              <span>{project.project_manager_1.email}</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="planning-sheet-container">
        <ProjectPlanningSection projectId={projectId!} onUpdate={handleUpdate} />
      </div>
    </div>
  );
}

