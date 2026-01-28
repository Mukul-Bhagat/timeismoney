import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPagesForRole } from '../config/routes';
import { AppBrand } from './common/AppBrand';
import './Sidebar.css';

const APP_LOGO_URL = 'https://hixsfzxeglblylasnnfq.supabase.co/storage/v1/object/public/project-logos/project_logo.png';

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
        <AppBrand logoUrl={APP_LOGO_URL} size={120} />
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

