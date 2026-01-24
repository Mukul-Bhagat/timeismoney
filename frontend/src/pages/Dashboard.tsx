import { useAuth } from '../context/AuthContext';
import { SuperAdminDashboard } from '../components/dashboard/SuperAdminDashboard';
import { AdminDashboard } from '../components/dashboard/AdminDashboard';
import { ManagerDashboard } from '../components/dashboard/ManagerDashboard';
import { EmployeeDashboard } from '../components/dashboard/EmployeeDashboard';

export function Dashboard() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Please sign in</div>;
  }

  // Render role-specific dashboard based on user.role
  if (user.role === 'SUPER_ADMIN') {
    return <SuperAdminDashboard />;
  } else if (user.role === 'ADMIN') {
    return <AdminDashboard />;
  } else if (user.role === 'MANAGER') {
    return <ManagerDashboard />;
  } else if (user.role === 'EMPLOYEE') {
    return <EmployeeDashboard />;
  } else {
    return <div>Unknown role: {user.role}</div>;
  }
}

