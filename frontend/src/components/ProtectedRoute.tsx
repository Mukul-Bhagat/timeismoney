import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccessPage } from '../config/routes';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/signin',
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to={redirectTo} replace />;
  }

  // Check access using route config if no explicit allowedRoles provided
  if (!allowedRoles) {
    // Check if user has any of the allowed roles
    const userRoles = profile.role === 'SUPER_ADMIN' ? ['SUPER_ADMIN'] : profile.roles;
    const hasAccess = canAccessPage(profile.role, location.pathname, profile.roles);
    
    if (!hasAccess) {
      // Redirect based on role
      if (profile.role === 'SUPER_ADMIN' || profile.roles.includes('SUPER_ADMIN')) {
        return <Navigate to="/platform" replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
  } else {
    // Use explicit allowedRoles if provided
    // Check if user has any of the allowed roles
    const userRoles = profile.role === 'SUPER_ADMIN' ? ['SUPER_ADMIN'] : profile.roles;
    const hasAccess = (profile.role && allowedRoles.includes(profile.role)) ||
      userRoles.some(role => allowedRoles.includes(role));
    
    if (!hasAccess) {
      // Redirect based on role
      if (profile.role === 'SUPER_ADMIN' || profile.roles.includes('SUPER_ADMIN')) {
        return <Navigate to="/platform" replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

