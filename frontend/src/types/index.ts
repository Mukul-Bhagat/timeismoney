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
export type ProjectType = 'simple' | 'planned';

export interface Project {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  project_type: ProjectType; // NEW: Type of project (simple or planned)
  daily_working_hours: number; // NEW: Default daily hours for Type A projects
  project_manager_1_id: string | null; // NEW: Primary project manager
  project_manager_2_id: string | null; // NEW: Secondary project manager
  setup_status?: 'draft' | 'ready' | 'locked';
  project_manager_id?: string; // DEPRECATED: Keep for backward compatibility
  created_at: string;
  member_count?: number;
  project_manager?: {
    id: string;
    email: string;
  };
  project_manager_1?: { // NEW: Primary PM details
    id: string;
    email: string;
  };
  project_manager_2?: { // NEW: Secondary PM details
    id: string;
    email: string;
  };
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
  submission_status?: {
    total_members: number;
    submitted_count: number;
    pending_count: number;
    all_submitted: boolean;
    pending_users: string[];
  };
}

// Project with submitted timesheets interface
export interface ProjectWithSubmittedTimesheets extends Project {
  submitted_count: number;
}

// ============================================================================
// Project Setup / Cost Planning Types
// ============================================================================

// Margin status type
export type MarginStatus = 'green' | 'yellow' | 'red';

// Setup status type
export type SetupStatus = 'draft' | 'ready' | 'locked';

// Project setup header interface
export interface ProjectSetup {
  id: string;
  project_id: string;
  total_weeks: number;
  total_internal_hours: number;
  total_internal_cost: number;
  customer_rate_per_hour: number;
  total_customer_amount: number;
  gross_margin_percentage: number;
  sold_cost_percentage: number;
  current_margin_percentage: number;
  margin_status: MarginStatus;
  created_at: string;
  updated_at: string;
}

// Project role allocation (Excel row)
export interface ProjectRoleAllocation {
  id: string;
  project_id: string;
  role_id: string;
  user_id: string;
  hourly_rate: number;
  total_hours: number;
  total_amount: number;
  row_order: number;
  created_at: string;
  updated_at: string;
  role?: Role;
  user?: {
    id: string;
    email: string;
  };
  weekly_hours?: ProjectWeeklyHours[];
}

// Project weekly hours (Excel cell)
export interface ProjectWeeklyHours {
  id: string;
  allocation_id: string;
  week_number: number;
  hours: number;
  created_at: string;
  updated_at: string;
}

// Project phase (week label)
export interface ProjectPhase {
  id: string;
  project_id: string;
  phase_name: string;
  start_week: number;
  end_week: number;
  created_at: string;
}

// User hourly rate (auto-fill source)
export interface UserHourlyRate {
  id: string;
  user_id: string;
  role_id: string;
  organization_id: string;
  hourly_rate: number;
  effective_from: string;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
  };
  role?: Role;
}

// Complete project setup data (API response)
export interface ProjectSetupData {
  project: Project & {
    project_manager?: {
      id: string;
      email: string;
    };
    setup_status?: SetupStatus;
  };
  setup: ProjectSetup;
  allocations: ProjectRoleAllocation[];
  phases: ProjectPhase[];
}

// Extended project interface with setup fields
export interface ProjectWithSetup extends Project {
  project_manager_id?: string;
  setup_status?: SetupStatus;
  project_manager?: {
    id: string;
    email: string;
  };
}

