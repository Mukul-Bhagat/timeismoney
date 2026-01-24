import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccessPage } from '../config/routes';
import type { UserRole } from '../types';
import { jwtDecode } from 'jwt-decode';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  redirectTo?: string;
}

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string | null;
  timezone: string;
  iat?: number;
  exp?: number;
}

export function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/signin',
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // If still loading, show loading screen
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

  // If no user in state, check localStorage token (handles race condition after login)
  let currentUser = user;
  if (!currentUser) {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwtDecode<JWTPayload>(token);
        // Check if token is expired
        if (decoded.exp && decoded.exp * 1000 < Date.now()) {
          localStorage.removeItem('token');
        } else {
          // Create user object from token
          currentUser = {
            id: decoded.userId,
            email: decoded.email,
            role: decoded.role as UserRole,
            organizationId: decoded.organizationId,
            timezone: decoded.timezone || 'Asia/Kolkata',
          };
        }
      } catch (error) {
        // Invalid token, remove it
        localStorage.removeItem('token');
      }
    }
  }

  // If still no user, redirect to signin
  if (!currentUser) {
    return <Navigate to={redirectTo} replace />;
  }

  // Check access using route config if no explicit allowedRoles provided
  if (!allowedRoles) {
    const hasAccess = canAccessPage(currentUser.role, location.pathname, [currentUser.role]);
    
    if (!hasAccess) {
      // Redirect based on role
      if (currentUser.role === 'SUPER_ADMIN') {
        return <Navigate to="/platform" replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
  } else {
    // Use explicit allowedRoles if provided
    const hasAccess = allowedRoles.includes(currentUser.role);
    
    if (!hasAccess) {
      // Redirect based on role
      if (currentUser.role === 'SUPER_ADMIN') {
        return <Navigate to="/platform" replace />;
      }
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

