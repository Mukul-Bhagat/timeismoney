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

function App() {
  const { user, profile, loading } = useAuth();

  // Memoize the redirect path to prevent infinite re-renders
  const defaultRedirectPath = useMemo(() => {
    // If no user, go to signin
    if (!user) return '/signin';
    
    // If user exists but no profile yet, still allow access (profile might be loading)
    // But redirect to signin if profile is explicitly null after loading
    if (profile === null && !loading) {
      // Profile fetch failed - user might not exist in users table
      // Allow them to stay on current page or redirect to signin
      return '/signin';
    }
    
    // If we have a profile, determine redirect based on role
    if (profile) {
      const isSuperAdmin = profile.role === 'SUPER_ADMIN' || (profile.roles && profile.roles.length > 0 && profile.roles.includes('SUPER_ADMIN'));
      return isSuperAdmin ? '/platform' : '/dashboard';
    }
    
    // Default: if user exists but profile is still loading, go to dashboard
    return '/dashboard';
  }, [user, profile, loading]); // Include loading in dependencies

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        gap: '16px'
      }}>
        <div>Loading...</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Initializing authentication...
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
          If this takes too long, check the browser console for errors
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route
          path="/signin"
          element={user ? <Navigate to={defaultRedirectPath} replace /> : <SignIn />}
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
