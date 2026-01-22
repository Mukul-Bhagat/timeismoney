import { colors } from '../../config/colors';
import './Roles.css';

interface RoleCardProps {
  role: {
    id: string;
    name: string;
    is_system: boolean;
    user_count: number;
    created_at: string;
  };
  onClick: () => void;
}

export function RoleCard({ role, onClick }: RoleCardProps) {
  return (
    <div
      className="role-card"
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: '0 0 8px 0', color: colors.text.primary, fontSize: '18px' }}>
            {role.name}
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                background: role.is_system ? colors.primary.lighter : colors.surface,
                color: role.is_system ? colors.primary.darkest : colors.text.secondary,
              }}
            >
              {role.is_system ? 'System Role' : 'Custom Role'}
            </span>
          </div>
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
          {role.user_count} {role.user_count === 1 ? 'user' : 'users'}
        </div>
      </div>
    </div>
  );
}

