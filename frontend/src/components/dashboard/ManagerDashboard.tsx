import { useState, useEffect } from 'react';
import './Dashboard.css';

export function ManagerDashboard() {
  const [stats, setStats] = useState({
    projectsAssigned: 0,
    pendingApprovals: 0,
    approvedThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch real data from API
    setTimeout(() => {
      setStats({
        projectsAssigned: 5,
        pendingApprovals: 12,
        approvedThisMonth: 28,
      });
      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Manager Dashboard</h1>
      <p className="dashboard-subtitle">Approval Overview</p>

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <div className="dashboard-card-label">Projects Assigned</div>
          <div className="dashboard-card-value">{stats.projectsAssigned}</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-label">Pending Approvals</div>
          <div className="dashboard-card-value">{stats.pendingApprovals}</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-label">Approved This Month</div>
          <div className="dashboard-card-value">{stats.approvedThisMonth}</div>
        </div>
      </div>

      <div className="dashboard-section">
        <h2>Timesheets Awaiting Approval</h2>
        <div className="dashboard-list">
          <div className="dashboard-empty">No timesheets awaiting approval</div>
        </div>
      </div>
    </div>
  );
}

