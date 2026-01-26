import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../config/colors';
import './Projects.css';
import '../roles/Roles.css';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      // Close modal and navigate to create page
      onClose();
      navigate('/create-project');
    }
  }, [isOpen, onClose, navigate]);

  // Return null - the redirect happens in useEffect
  return null;
}

