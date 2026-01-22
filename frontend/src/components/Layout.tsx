import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  
  // Hide sidebar on signin and platform pages
  const hideSidebar = location.pathname === '/signin' || location.pathname === '/platform';

  if (hideSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="layout-content">
        {children}
      </main>
    </div>
  );
}

