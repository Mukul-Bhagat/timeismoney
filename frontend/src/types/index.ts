// Centralized type definitions
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

// Role interface for roles table
export interface Role {
  id: string;
  name: string;
  is_system: boolean;
  user_count: number;
  created_at: string;
}

// User role assignment interface
export interface UserRoleAssignment {
  id: string;
  email: string;
  assigned_at: string;
}

// User interface
export interface User {
  id: string;
  email: string;
  phone?: string;
  timezone: string;
  organization_id: string;
  created_at: string;
  roles?: string[];
  status?: string;
}

// Project status type
export type ProjectStatus = 'active' | 'completed';

// Project interface
export interface Project {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  created_at: string;
  member_count?: number;
}

// Project member interface
export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role_id: string;
  organization_id: string;
  assigned_at: string;
  user?: {
    id: string;
    email: string;
  };
  role?: {
    id: string;
    name: string;
  };
}

// Project with members interface
export interface ProjectWithMembers extends Project {
  members: ProjectMember[];
}

// Timesheet status type
export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED';

// Timesheet entry interface
export interface TimesheetEntry {
  id: string;
  timesheet_id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  hours: number;
  created_at: string;
  updated_at: string;
}

// Timesheet interface
export interface Timesheet {
  id: string;
  project_id: string;
  user_id: string;
  status: TimesheetStatus;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  entries?: TimesheetEntry[];
  project?: Project;
  role_name?: string; // Role name from project_members
}

// Project with timesheet interface
export interface ProjectWithTimesheet extends Project {
  timesheet?: Timesheet;
  role_name?: string; // Role name from project_members
}

// Project costing interface
export interface ProjectCosting {
  id: string;
  project_id: string;
  user_id: string;
  rate: number;
  amount: number;
  quote_amount: number | null;
  created_at: string;
  updated_at: string;
}

// Project approval row interface (for approval table)
export interface ProjectApprovalRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  timesheet_id: string | null;
  timesheet_status: TimesheetStatus | null;
  submitted_at: string | null;
  total_hours: number;
  rate: number;
  amount: number;
  quote_amount: number | null;
  day_hours: { [date: string]: number };
}

// Project approval data interface
export interface ProjectApprovalData {
  project: {
    id: string;
    title: string;
    description: string | null;
    start_date: string;
    end_date: string;
    status: ProjectStatus;
  };
  date_range: string[];
  approval_rows: ProjectApprovalRow[];
}

// Project with submitted timesheets interface
export interface ProjectWithSubmittedTimesheets extends Project {
  submitted_count: number;
}

