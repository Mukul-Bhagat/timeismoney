import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { colors } from '../config/colors';
import { ProjectCard } from '../components/projects/ProjectCard';
import { CreateProjectModal } from '../components/projects/CreateProjectModal';
import { ProjectDetailsModal } from '../components/projects/ProjectDetailsModal';
import { useAuth } from '../context/AuthContext';
import type { Project, ProjectWithMembers } from '../types';
import './Page.css';
import '../components/projects/Projects.css';

export function Projects() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectWithMembers | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch('http://localhost:5000/api/projects', {
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

  const handleProjectClick = async (project: Project) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      const response = await fetch(`http://localhost:5000/api/projects/${project.id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch project details');
      }

      setSelectedProject(data.project);
      setIsDetailsModalOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch project details');
    }
  };

  const handleCloseDetailsModal = () => {
    setIsDetailsModalOpen(false);
    setSelectedProject(null);
  };

  // Check if user has ADMIN or SUPER_ADMIN role
  const canManageProjects =
    profile?.role === 'SUPER_ADMIN' || profile?.roles.includes('ADMIN');

  if (!canManageProjects) {
    return (
      <div className="page">
        <h1 className="page-title">Projects</h1>
        <div className="page-content">
          <p style={{ color: colors.status.error }}>
            You do not have permission to access this page. ADMIN role required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="projects-container">
        <div className="projects-header">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">Manage organization projects and member assignments</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '6px',
              background: colors.primary.main,
              color: colors.white,
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>➕</span>
            Create Project
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '12px',
              marginBottom: '24px',
              background: colors.status.error + '20',
              color: colors.status.error,
              borderRadius: '4px',
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: colors.text.secondary }}>
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: colors.text.secondary }}>
            No projects found. Create your first project to get started.
          </div>
        ) : (
          <div className="projects-list">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => handleProjectClick(project)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchProjects}
      />

      <ProjectDetailsModal
        isOpen={isDetailsModalOpen}
        project={selectedProject}
        onClose={handleCloseDetailsModal}
        onUpdate={fetchProjects}
      />
    </div>
  );
}
