import { useState, useEffect } from 'react';
import './Dashboard.css';

export function EmployeeDashboard() {
  const [stats, setStats] = useState({
    assignedProjects: 0,
    timesheetsPendingSubmission: 0,
    approvedHoursThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch real data from API
    setTimeout(() => {
      setStats({
        assignedProjects: 3,
        timesheetsPendingSubmission: 2,
        approvedHoursThisMonth: 160,
      });
      setLoading(false);
    }, 500);
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Employee Dashboard</h1>
      <p className="dashboard-subtitle">Personal Productivity</p>

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <div className="dashboard-card-label">Assigned Projects</div>
          <div className="dashboard-card-value">{stats.assignedProjects}</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-label">Timesheets Pending Submission</div>
          <div className="dashboard-card-value">{stats.timesheetsPendingSubmission}</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-label">Approved Hours (This Month)</div>
          <div className="dashboard-card-value">{stats.approvedHoursThisMonth}</div>
        </div>
      </div>

      <div className="dashboard-section">
        <h2>My Projects</h2>
        <div className="dashboard-list">
          <div className="dashboard-empty">No projects assigned</div>
        </div>
      </div>

      <div className="dashboard-section">
        <h2>My Recent Timesheets</h2>
        <div className="dashboard-list">
          <div className="dashboard-empty">No timesheets yet</div>
        </div>
      </div>
    </div>
  );
}

