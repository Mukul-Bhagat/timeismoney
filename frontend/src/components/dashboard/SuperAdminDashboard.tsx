import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { formatDateIST } from '../../utils/timezone';
import { colors } from '../../config/colors';
import './Dashboard.css';

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export function SuperAdminDashboard() {
  const [stats, setStats] = useState({
    totalOrganizations: 0,
    activeOrganizations: 0,
    totalUsers: 0,
  });
  const [recentOrganizations, setRecentOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Fetch organizations
      const orgResponse = await fetch('http://localhost:5000/api/organizations', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (orgResponse.ok) {
        const orgs = await orgResponse.json();
        setStats({
          totalOrganizations: orgs.length,
          activeOrganizations: orgs.length, // All are active for now
          totalUsers: 0, // TODO: Calculate from users table
        });
        setRecentOrganizations(orgs.slice(0, 5));
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Super Admin Dashboard</h1>
      <p className="dashboard-subtitle">Platform Overview</p>

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <div className="dashboard-card-label">Total Organizations</div>
          <div className="dashboard-card-value">{stats.totalOrganizations}</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-label">Active Organizations</div>
          <div className="dashboard-card-value">{stats.activeOrganizations}</div>
        </div>
        <div className="dashboard-card">
          <div className="dashboard-card-label">Total Users</div>
          <div className="dashboard-card-value">{stats.totalUsers}</div>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <h2>Recent Organizations</h2>
          <Link to="/platform" className="dashboard-link">
            View All →
          </Link>
        </div>
        <div className="dashboard-list">
          {recentOrganizations.length === 0 ? (
            <div className="dashboard-empty">No organizations yet</div>
          ) : (
            recentOrganizations.map((org) => (
              <div key={org.id} className="dashboard-list-item">
                <div>
                  <div className="dashboard-list-item-title">{org.name}</div>
                  <div className="dashboard-list-item-subtitle">
                    Created {formatDateIST(org.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

