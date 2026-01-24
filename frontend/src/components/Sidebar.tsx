import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPagesForRole } from '../config/routes';
import { colors } from '../config/colors';
import './Sidebar.css';

export function Sidebar() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  if (!user) {
    return null;
  }

  const allowedPages = getPagesForRole(user.role, [user.role]);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-logo">TimeIsMoney</h1>
      </div>

      <nav className="sidebar-nav">
        {allowedPages.map((page) => {
          const isActive = location.pathname === page.path;
          return (
            <Link
              key={page.path}
              to={page.path}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
            >
              <span className="sidebar-icon">{page.icon}</span>
              <span className="sidebar-label">{page.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-signout" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

