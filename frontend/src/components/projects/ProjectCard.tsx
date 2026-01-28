import { colors } from '../../config/colors';
import { ProjectBrand } from '../common/ProjectBrand';
import './Projects.css';
import type { Project } from '../../types';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const truncateDescription = (description: string | null, maxLength: number = 100) => {
    if (!description) return '';
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength) + '...';
  };

  return (
    <div
      className="project-card"
      onClick={onClick}
      style={{
        padding: '16px',
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        background: colors.white,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = colors.primary.main;
        e.currentTarget.style.boxShadow = colors.shadow.md;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = colors.border;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div className="project-card-title">
        <ProjectBrand
          name={project.title}
          logoUrl={project.project_logo_url}
          size={48}
          onClick={onClick}
        />
      </div>
      
      {project.description && (
        <p className="project-card-description">
          {truncateDescription(project.description)}
        </p>
      )}

      <div className="project-card-meta">
        <div className="project-card-dates">
          {formatDate(project.start_date)} - {formatDate(project.end_date)}
        </div>
      </div>

      <div className="project-card-footer">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div
            className={`project-status-badge ${
              project.status === 'active' ? 'project-status-active' : 'project-status-completed'
            }`}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '500',
              background: project.status === 'active' ? '#d1fae5' : '#e0e7ff',
              color: project.status === 'active' ? '#065f46' : '#3730a3',
            }}
          >
            {project.status === 'active' ? 'Active' : 'Completed'}
          </div>
          
          {/* Project Type Badge */}
          {project.project_type && (
            <div
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                background: project.project_type === 'simple' ? '#dbeafe' : '#fce7f3',
                color: project.project_type === 'simple' ? '#1e40af' : '#9f1239',
              }}
              title={project.project_type === 'simple' ? 'Simple Daily Working Project' : 'Planned / Cost-Based Project'}
            >
              {project.project_type === 'simple' ? '⚡ Simple' : '📊 Planned'}
            </div>
          )}
          
          {/* Setup Status Badge (only for Type B projects) */}
          {project.project_type === 'planned' && (
            <div
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                background: project.setup_status === 'ready' ? '#d1fae5' : '#fef3c7',
                color: project.setup_status === 'ready' ? '#065f46' : '#92400e',
              }}
              title={project.setup_status === 'ready' ? 'Cost planning is complete' : 'Cost planning pending'}
            >
              {project.setup_status === 'ready' ? '🟢 Ready' : '🟡 Draft'}
            </div>
          )}
        </div>
        <div
          style={{
            padding: '6px 12px',
            borderRadius: '16px',
            background: colors.primary.main,
            color: colors.white,
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          {project.member_count || 0} {project.member_count === 1 ? 'member' : 'members'}
        </div>
      </div>
    </div>
  );
}

