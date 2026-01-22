import { colors } from '../../config/colors';
import './Roles.css';

interface User {
  id: string;
  email: string;
  assigned_at: string;
}

interface RoleUserListProps {
  users: User[];
  onRemoveUser: (userId: string) => void;
  removingUserId: string | null;
  roleName: string;
  isSystemRole: boolean;
}

export function RoleUserList({
  users,
  onRemoveUser,
  removingUserId,
  roleName,
  isSystemRole,
}: RoleUserListProps) {
  if (users.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: colors.text.secondary }}>
        No users assigned to this role
      </div>
    );
  }

  return (
    <div className="role-user-list">
      {users.map((user) => {
        const isRemoving = removingUserId === user.id;
        const canRemove = !(roleName === 'ADMIN' && isSystemRole && users.length === 1);

        return (
          <div
            key={user.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px',
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <div>
              <div style={{ color: colors.text.primary, fontWeight: '500' }}>
                {user.email}
              </div>
              <div style={{ color: colors.text.secondary, fontSize: '12px', marginTop: '4px' }}>
                Assigned {new Date(user.assigned_at).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={() => onRemoveUser(user.id)}
              disabled={isRemoving || !canRemove}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '4px',
                background: canRemove ? colors.status.error : colors.border,
                color: canRemove ? colors.white : colors.text.secondary,
                cursor: isRemoving || !canRemove ? 'not-allowed' : 'pointer',
                fontSize: '12px',
              }}
              title={
                !canRemove
                  ? 'Cannot remove the last ADMIN from ADMIN role'
                  : 'Remove user from role'
              }
            >
              {isRemoving ? 'Removing...' : 'Remove'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

