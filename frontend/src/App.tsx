import { Routes, Route, Navigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { SignIn } from './pages/SignIn';
import { Platform } from './pages/Platform';
import { Dashboard } from './pages/Dashboard';
import { Timesheet } from './pages/Timesheet';
import { Approval } from './pages/Approval';
import { Projects } from './pages/Projects';
import { ManageUsers } from './pages/ManageUsers';
import { Roles } from './pages/Roles';
import { Profile } from './pages/Profile';
import { OrganizationDashboard } from './pages/OrganizationDashboard';
import { ProjectSetup } from './pages/ProjectSetup';
import { CreateProject } from './pages/CreateProject';
import { ProjectPlanning } from './pages/ProjectPlanning';
import { jwtDecode } from 'jwt-decode';

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string | null;
  timezone: string;
  iat?: number;
  exp?: number;
}

function App() {
  const { user, loading, error: authError } = useAuth();

  // Helper to get user from token if state not ready
  const getCurrentUser = () => {
    if (user) return user;
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwtDecode<JWTPayload>(token);
        if (decoded.exp && decoded.exp * 1000 < Date.now()) {
          localStorage.removeItem('token');
          return null;
        }
        return {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role as any,
          organizationId: decoded.organizationId,
          timezone: decoded.timezone || 'Asia/Kolkata',
        };
      } catch {
        localStorage.removeItem('token');
        return null;
      }
    }
    return null;
  };

  // Memoize the redirect path to prevent infinite re-renders
  const defaultRedirectPath = useMemo(() => {
    const currentUser = getCurrentUser();
    // If no user, go to signin
    if (!currentUser) {
      return '/signin';
    }
    
    // Determine redirect based on role
    const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
    return isSuperAdmin ? '/platform' : '/dashboard';
  }, [user]);

  // Show loading screen only during initial load
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        gap: '16px',
        padding: '20px'
      }}>
        <div>Loading...</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Initializing authentication...
        </div>
        {authError && (
          <div style={{ 
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            maxWidth: '600px',
            width: '100%'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#dc2626', marginBottom: '8px' }}>
              ❌ Error
            </div>
            <div style={{ fontSize: '12px', color: '#991b1b', marginBottom: '12px' }}>
              {authError}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route
          path="/signin"
          element={getCurrentUser() ? <Navigate to={defaultRedirectPath} replace /> : <SignIn />}
        />
        <Route
          path="/platform"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
              <Platform />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheet"
          element={
            <ProtectedRoute>
              <Timesheet />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approval"
          element={
            <ProtectedRoute>
              <Approval />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <Projects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project-setup/:projectId"
          element={
            <ProtectedRoute>
              <ProjectSetup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-project"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
              <CreateProject />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:projectId/planning"
          element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']}>
              <ProjectPlanning />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manage-users"
          element={
            <ProtectedRoute>
              <ManageUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles"
          element={
            <ProtectedRoute>
              <Roles />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organization/:id"
          element={
            <ProtectedRoute>
              <OrganizationDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={defaultRedirectPath} replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
