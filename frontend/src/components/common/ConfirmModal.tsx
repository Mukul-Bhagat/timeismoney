import { useEffect, type ReactNode } from 'react';
import { colors } from '../../config/colors';
import './ConfirmModal.css';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  variant?: 'info' | 'warning' | 'danger';
  infoBox?: ReactNode;
  error?: string | null;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  variant = 'warning',
  infoBox,
  error,
}: ConfirmModalProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (loading) return;
    await onConfirm();
  };

  const handleOverlayClick = () => {
    if (!loading) {
      onCancel();
    }
  };

  // Get variant-specific button color
  const getVariantColor = () => {
    switch (variant) {
      case 'danger':
        return colors.status.error;
      case 'warning':
        return colors.status.warning;
      case 'info':
        return colors.primary.main;
      default:
        return colors.status.warning;
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content confirm-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            className="modal-close"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="confirm-modal-body">
          <p className="confirm-modal-description">{description}</p>

          {infoBox && (
            <div className="confirm-info-box">
              {infoBox}
            </div>
          )}

          {error && (
            <div className="error-message" style={{ marginTop: '16px' }}>
              {error}
            </div>
          )}
        </div>

        <div className="confirm-modal-actions">
          <button
            type="button"
            className="confirm-modal-button confirm-modal-button-cancel"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="confirm-modal-button confirm-modal-button-confirm"
            onClick={handleConfirm}
            disabled={loading}
            style={{
              backgroundColor: loading ? colors.border : getVariantColor(),
              color: colors.white,
            }}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

