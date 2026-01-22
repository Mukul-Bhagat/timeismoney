import { useAuth } from '../context/AuthContext';
import { SuperAdminDashboard } from '../components/dashboard/SuperAdminDashboard';
import { AdminDashboard } from '../components/dashboard/AdminDashboard';
import { ManagerDashboard } from '../components/dashboard/ManagerDashboard';
import { EmployeeDashboard } from '../components/dashboard/EmployeeDashboard';

export function Dashboard() {
  const { profile } = useAuth();

  if (!profile) {
    return <div>Loading...</div>;
  }

  // Render role-specific dashboard
  // Check roles array for org users, or role for SUPER_ADMIN
  const userRoles = profile.role === 'SUPER_ADMIN' ? ['SUPER_ADMIN'] : profile.roles;
  
  if (userRoles.includes('SUPER_ADMIN')) {
    return <SuperAdminDashboard />;
  } else if (userRoles.includes('ADMIN')) {
    return <AdminDashboard />;
  } else if (userRoles.includes('MANAGER')) {
    return <ManagerDashboard />;
  } else if (userRoles.includes('EMPLOYEE')) {
    return <EmployeeDashboard />;
  } else {
    return <div>Unknown role</div>;
  }
}

