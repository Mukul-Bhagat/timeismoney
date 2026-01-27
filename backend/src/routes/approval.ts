import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { verifyAuth, requireRole, AuthRequest } from '../middleware/auth';
import { getCurrentUTC } from '../utils/timezone';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';

const router = Router();

/**
 * Helper function to check if user is SUPER_ADMIN
 */
async function isSuperAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.role === 'SUPER_ADMIN';
}

/**
 * Helper function to check if user has ADMIN or MANAGER role in organization
 */
async function userHasAdminOrManagerRole(userId: string, organizationId: string): Promise<boolean> {
  const { data: roles, error: roleError } = await supabase
    .from('roles')
    .select('id, name')
    .eq('organization_id', organizationId)
    .in('name', ['ADMIN', 'MANAGER']);

  if (roleError || !roles || roles.length === 0) {
    return false;
  }

  const roleIds = roles.map(r => r.id);

  const { data: userRoles, error: userRoleError } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .in('role_id', roleIds)
    .limit(1);

  return !userRoleError && !!userRoles && userRoles.length > 0;
}

/**
 * Helper function to extract name from email (before @)
 */
function getNameFromEmail(email: string): string {
  return email.split('@')[0];
}

/**
 * Helper function to generate date range array
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Helper function to calculate week number from project start date
 * Week 1 starts from the project start date
 */
function getWeekNumber(date: Date, projectStartDate: Date): number {
  // Normalize dates to start of day to avoid timezone issues
  const dateNormalized = new Date(date);
  dateNormalized.setHours(0, 0, 0, 0);
  const startNormalized = new Date(projectStartDate);
  startNormalized.setHours(0, 0, 0, 0);
  
  const diffTime = dateNormalized.getTime() - startNormalized.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Week 1 includes days 0-6, Week 2 includes days 7-13, etc.
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Check if a date is a weekday (Monday-Friday)
 */
function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Monday = 1, Friday = 5
}

/**
 * Helper function to calculate planned hours for a user from project setup
 */
async function calculatePlannedHoursForUser(
  userId: string,
  projectId: string,
  projectStartDate: string,
  dateRange: string[]
): Promise<{ plannedDayHours: { [date: string]: number }; plannedTotalHours: number }> {
  const plannedDayHours: { [date: string]: number } = {};
  let plannedTotalHours = 0;

  try {
    console.log(`[Planned Hours] Starting calculation for user ${userId}, project ${projectId}`);
    
    // Check if project has project_setup (Type B projects)
    const { data: projectSetup, error: setupError } = await supabase
      .from('project_setups')
      .select('id')
      .eq('project_id', projectId)
      .single();

    if (setupError || !projectSetup) {
      console.log(`[Planned Hours] No project setup found for project ${projectId}:`, setupError?.message || 'No setup record');
      return { plannedDayHours, plannedTotalHours };
    }

    console.log(`[Planned Hours] ✓ Found project setup ${projectSetup.id} for project ${projectId}`);

    // Get allocation for this user
    const { data: allocation, error: allocError } = await supabase
      .from('project_role_allocations')
      .select('id')
      .eq('project_setup_id', projectSetup.id)
      .eq('user_id', userId)
      .single();

    if (allocError || !allocation) {
      console.log(`[Planned Hours] No allocation found for user ${userId} in project ${projectId}:`, allocError?.message || 'No allocation record');
      return { plannedDayHours, plannedTotalHours };
    }

    console.log(`[Planned Hours] ✓ Found allocation ${allocation.id} for user ${userId}`);

    // Get weekly hours for this allocation
    const { data: weeklyHours, error: weeklyError } = await supabase
      .from('project_weekly_hours')
      .select('week_number, hours')
      .eq('allocation_id', allocation.id)
      .order('week_number', { ascending: true });

    if (weeklyError || !weeklyHours || weeklyHours.length === 0) {
      console.log(`[Planned Hours] No weekly hours found for allocation ${allocation.id}:`, weeklyError?.message || 'No weekly hours records');
      return { plannedDayHours, plannedTotalHours };
    }

    console.log(`[Planned Hours] ✓ Found ${weeklyHours.length} weekly hour entries for allocation ${allocation.id}`);

    // Create a map of week number to hours
    const weekHoursMap: { [weekNumber: number]: number } = {};
    for (const wh of weeklyHours) {
      const hours = parseFloat(wh.hours || 0);
      weekHoursMap[wh.week_number] = hours;
      console.log(`[Planned Hours] Week ${wh.week_number}: ${hours} hours`);
    }
    
    const totalWeeklyHours = Object.values(weekHoursMap).reduce((sum, h) => sum + h, 0);
    console.log(`[Planned Hours] Total weekly hours across all weeks: ${totalWeeklyHours.toFixed(2)}`);

    // Calculate planned hours per day
    // Parse start date and normalize to avoid timezone issues
    const startDate = new Date(projectStartDate + 'T00:00:00');
    startDate.setHours(0, 0, 0, 0);
    console.log(`[Planned Hours] Project start date: ${projectStartDate}, normalized: ${startDate.toISOString().split('T')[0]}`);
    console.log(`[Planned Hours] Date range: ${dateRange.length} dates from ${dateRange[0]} to ${dateRange[dateRange.length - 1]}`);
    
    // Count weekdays per week for accurate distribution
    const weekWeekdayCount: { [weekNumber: number]: number } = {};
    
    // First pass: count weekdays per week in the date range
    for (const dateStr of dateRange) {
      const date = new Date(dateStr + 'T00:00:00');
      date.setHours(0, 0, 0, 0);
      const weekNumber = getWeekNumber(date, startDate);
      
      if (isWeekday(date)) {
        weekWeekdayCount[weekNumber] = (weekWeekdayCount[weekNumber] || 0) + 1;
      }
    }
    
    console.log(`[Planned Hours] Weekday counts per week:`, weekWeekdayCount);
    
    // Second pass: distribute weekly hours to weekdays only
    let datesWithPlannedHours = 0;
    for (const dateStr of dateRange) {
      const date = new Date(dateStr + 'T00:00:00');
      date.setHours(0, 0, 0, 0);
      const weekNumber = getWeekNumber(date, startDate);
      const weeklyHours = weekHoursMap[weekNumber] || 0;
      
      if (weeklyHours > 0 && isWeekday(date)) {
        // Distribute weekly hours evenly across weekdays in that week
        const weekdayCount = weekWeekdayCount[weekNumber] || 1; // Avoid division by zero
        const dailyHours = weeklyHours / weekdayCount;
        
        plannedDayHours[dateStr] = dailyHours;
        plannedTotalHours += dailyHours;
        datesWithPlannedHours++;
      } else {
        // Weekend or no planned hours for this week
        plannedDayHours[dateStr] = 0;
      }
    }

    console.log(`[Planned Hours] ✓ Calculated ${plannedTotalHours.toFixed(2)} total planned hours for user ${userId}`);
    console.log(`[Planned Hours] Dates with planned hours: ${datesWithPlannedHours} out of ${dateRange.length}`);
    if (datesWithPlannedHours > 0) {
      const sampleDates = Object.entries(plannedDayHours).filter(([_, h]) => h > 0).slice(0, 3);
      console.log(`[Planned Hours] Sample planned day hours:`, sampleDates);
    }
  } catch (error) {
    console.error('[Planned Hours] Error calculating planned hours:', error);
    // Return empty planned hours on error
  }

  return { plannedDayHours, plannedTotalHours };
}

/**
 * GET /api/approval/projects
 * Get projects that have at least one SUBMITTED timesheet
 * Access: ADMIN, MANAGER only
 */
router.get('/projects', verifyAuth, requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const isSuper = await isSuperAdmin(req.user.id);
    let organizationId: string | null = null;

    if (!isSuper) {
      // Get user's organization
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', req.user.id)
        .single();

      if (userError || !userData || !userData.organization_id) {
        return res.status(403).json({
          success: false,
          message: 'User organization not found',
        });
      }

      organizationId = userData.organization_id;
    }

    // Get projects with submitted timesheets
    let projectsQuery = supabase
      .from('projects')
      .select(`
        id,
        organization_id,
        title,
        description,
        start_date,
        end_date,
        status,
        created_at
      `);

    if (!isSuper && organizationId) {
      projectsQuery = projectsQuery.eq('organization_id', organizationId);
    }

    const { data: projects, error: projectsError } = await projectsQuery;

    if (projectsError) {
      throw projectsError;
    }

    // For each project, check if it has submitted timesheets
    const projectsWithSubmitted: any[] = [];

    for (const project of projects || []) {
      const { data: submittedTimesheets, error: timesheetsError } = await supabase
        .from('timesheets')
        .select('id')
        .eq('project_id', project.id)
        .eq('status', 'SUBMITTED');

      if (!timesheetsError && submittedTimesheets && submittedTimesheets.length > 0) {
        projectsWithSubmitted.push({
          ...project,
          submitted_count: submittedTimesheets.length,
        });
      }
    }

    res.json({
      success: true,
      projects: projectsWithSubmitted,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
      error: error.message,
    });
  }
});

/**
 * Helper function to fetch project approval data
 */
async function fetchProjectApprovalData(projectId: string, userId: string): Promise<{ project: any; dateRange: string[]; approvalRows: any[]; submissionStatus: any } | null> {
  // Get project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    return null;
  }

  // Check permissions
  const isSuper = await isSuperAdmin(userId);
  if (!isSuper) {
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (!userData || userData.organization_id !== project.organization_id) {
      return null;
    }
  }

  // Get all project members
  const { data: members, error: membersError } = await supabase
    .from('project_members')
    .select(`
      id,
      project_id,
      user_id,
      role_id,
      users:user_id (
        id,
        email
      ),
      roles:role_id (
        id,
        name
      )
    `)
    .eq('project_id', projectId);

  if (membersError) {
    throw membersError;
  }

  // Generate date range and normalize dates to YYYY-MM-DD format
  const dateRange = generateDateRange(project.start_date, project.end_date).map(d => d.split('T')[0]);

  // Get all timesheets for this project
  const { data: timesheets, error: timesheetsError } = await supabase
    .from('timesheets')
    .select('id, project_id, user_id, status, submitted_at, approved_at')
    .eq('project_id', projectId);

  if (timesheetsError) {
    throw timesheetsError;
  }

  // Get all timesheet entries separately (more reliable than nested query)
  const timesheetIds = (timesheets || []).map((t: any) => t.id);
  const entriesMap = new Map<string, any[]>();

  console.log(`[Approval] Fetching entries for ${timesheetIds.length} timesheets:`, timesheetIds);

  if (timesheetIds.length > 0) {
    const { data: entries, error: entriesError } = await supabase
      .from('timesheet_entries')
      .select('timesheet_id, date, hours')
      .in('timesheet_id', timesheetIds)
      .order('date', { ascending: true });

    if (entriesError) {
      console.error('[Approval] Error fetching timesheet entries:', entriesError);
    } else if (entries) {
      console.log(`[Approval] Fetched ${entries.length} timesheet entries for ${timesheetIds.length} timesheets`);
      
      // Log sample entries for debugging
      if (entries.length > 0) {
        console.log('[Approval] Sample entries:', entries.slice(0, 5).map((e: any) => ({
          timesheet_id: e.timesheet_id,
          date: e.date,
          hours: e.hours,
          hours_type: typeof e.hours
        })));
        
        // Count entries with hours > 0
        const entriesWithHours = entries.filter((e: any) => parseFloat(e.hours || 0) > 0);
        console.log(`[Approval] Entries with hours > 0: ${entriesWithHours.length} out of ${entries.length}`);
      }
      
      // Group entries by timesheet_id
      entries.forEach((entry: any) => {
        // Normalize date to ensure consistency
        const normalizedDate = entry.date ? entry.date.split('T')[0] : entry.date;
        const hours = parseFloat(entry.hours || 0);
        const normalizedEntry = { ...entry, date: normalizedDate, hours: hours };
        
        if (!entriesMap.has(entry.timesheet_id)) {
          entriesMap.set(entry.timesheet_id, []);
        }
        entriesMap.get(entry.timesheet_id)!.push(normalizedEntry);
      });
      
      // Log grouped entries
      entriesMap.forEach((entryList, timesheetId) => {
        console.log(`[Approval] Timesheet ${timesheetId}: ${entryList.length} entries`);
      });
    } else {
      console.log('[Approval] No entries found for any timesheets');
    }
  } else {
    console.log('[Approval] No timesheets found for project');
  }

  // Get existing costing data
  const { data: costingData, error: costingError } = await supabase
    .from('project_costing')
    .select('*')
    .eq('project_id', projectId);

  if (costingError) {
    throw costingError;
  }

  // Build approval data rows
  const approvalRows: any[] = [];
  let submittedCount = 0;
  let pendingCount = 0;
  const pendingUsers: string[] = [];

  for (const member of members || []) {
    const user = (member as any).users;
    const role = (member as any).roles;
    const timesheet = (timesheets || []).find((t: any) => t.user_id === member.user_id);
    const costing = (costingData || []).find((c: any) => c.user_id === member.user_id);

    // Track submission status for approval
    // SUBMITTED: ready for approval
    // APPROVED: already approved, counts as submitted (doesn't need to submit again)
    // DRAFT or no timesheet: needs to be submitted (pending)
    if (timesheet?.status === 'SUBMITTED' || timesheet?.status === 'APPROVED') {
      submittedCount++;
    } else {
      // No timesheet or status is DRAFT - needs to be submitted
      pendingCount++;
      pendingUsers.push(user?.email || 'Unknown');
    }

    // Map day-wise hours from entries
    const dayHours: { [date: string]: number } = {};
    let totalHours = 0;

    // Initialize all dates in dateRange with 0
    for (const date of dateRange) {
      dayHours[date] = 0;
    }

    if (timesheet) {
      const entries = entriesMap.get(timesheet.id) || [];
      console.log(`[Approval] User ${member.user_id} (${user?.email}): Found ${entries.length} entries for timesheet ${timesheet.id} (status: ${timesheet.status})`);
      
      if (entries.length === 0) {
        console.warn(`[Approval] WARNING: Timesheet ${timesheet.id} has status ${timesheet.status} but NO entries found!`);
      }
      
      // Log dateRange for comparison
      console.log(`[Approval] DateRange for project: ${dateRange.length} dates, first: ${dateRange[0]}, last: ${dateRange[dateRange.length - 1]}`);
      
      for (const entry of entries) {
        // Entry date is already normalized in entriesMap
        const normalizedDate = entry.date;
        // Ensure hours is a number - handle string, number, or null/undefined
        let hours = 0;
        if (entry.hours !== null && entry.hours !== undefined) {
          hours = typeof entry.hours === 'string' ? parseFloat(entry.hours) : Number(entry.hours);
          if (isNaN(hours)) {
            console.warn(`[Approval] Invalid hours value for entry: ${JSON.stringify(entry)}`);
            hours = 0;
          }
        }
        
        if (normalizedDate && dateRange.includes(normalizedDate)) {
          dayHours[normalizedDate] = hours;
          totalHours += hours;
          if (hours > 0) {
            console.log(`[Approval] ✓ Mapped entry: date=${normalizedDate}, hours=${hours}`);
          }
        } else {
          console.warn(`[Approval] ✗ Entry date mismatch: entry.date=${entry.date}, normalized=${normalizedDate}, in dateRange=${dateRange.includes(normalizedDate)}`);
          // Try to find closest match
          const matchingDate = dateRange.find(d => d === normalizedDate || d.split('T')[0] === normalizedDate);
          if (matchingDate) {
            dayHours[matchingDate] = hours;
            totalHours += hours;
            if (hours > 0) {
              console.log(`[Approval] ✓ Found matching date: ${matchingDate}, mapped hours=${hours}`);
            }
          }
        }
      }
      
      if (entries.length > 0) {
        console.log(`[Approval] User ${member.user_id}: Total hours = ${totalHours.toFixed(2)}, mapped ${Object.keys(dayHours).filter(d => dayHours[d] > 0).length} dates with hours > 0`);
      } else {
        console.log(`[Approval] User ${member.user_id}: No entries found for timesheet ${timesheet.id}`);
      }
    } else {
      console.log(`[Approval] User ${member.user_id}: No timesheet found`);
    }

    // Calculate planned hours (only if project has setup data)
    const { plannedDayHours, plannedTotalHours } = await calculatePlannedHoursForUser(
      member.user_id,
      projectId,
      project.start_date,
      dateRange
    );

    // Calculate difference
    const differenceHours = totalHours - plannedTotalHours;
    const differencePercentage = plannedTotalHours > 0 
      ? (differenceHours / plannedTotalHours) * 100 
      : 0;

    // Calculate amount from costing or default
    const rate = costing ? parseFloat(costing.rate || 0) : 0;
    const amount = totalHours * rate;
    const quoteAmount = costing ? parseFloat(costing.quote_amount || 0) : null;

    approvalRows.push({
      user_id: member.user_id,
      name: getNameFromEmail(user?.email || ''),
      email: user?.email || '',
      role: role?.name || 'N/A',
      timesheet_id: timesheet?.id || null,
      timesheet_status: timesheet?.status || null,
      submitted_at: timesheet?.submitted_at || null,
      total_hours: totalHours,
      planned_total_hours: plannedTotalHours > 0 ? plannedTotalHours : undefined,
      planned_day_hours: Object.keys(plannedDayHours).length > 0 ? plannedDayHours : undefined,
      difference_hours: plannedTotalHours > 0 ? differenceHours : undefined,
      difference_percentage: plannedTotalHours > 0 ? differencePercentage : undefined,
      rate: rate,
      amount: amount,
      quote_amount: quoteAmount,
      day_hours: dayHours,
    });
  }

  const totalMembers = (members || []).length;
  const allSubmitted = submittedCount === totalMembers && totalMembers > 0;

  // Summary logging
  console.log(`[Approval] ===== SUMMARY for project ${projectId} =====`);
  console.log(`[Approval] Total members: ${totalMembers}`);
  console.log(`[Approval] Submitted: ${submittedCount}, Pending: ${pendingCount}`);
  console.log(`[Approval] Approval rows: ${approvalRows.length}`);
  approvalRows.forEach((row: any) => {
    const hasEntries = row.total_hours > 0;
    const hasPlanned = row.planned_total_hours !== undefined && row.planned_total_hours > 0;
    console.log(`[Approval] - ${row.name} (${row.email}): ${row.total_hours.toFixed(2)}h actual${hasPlanned ? `, ${row.planned_total_hours.toFixed(2)}h planned` : ', no planned'}`);
  });
  console.log(`[Approval] ===========================================`);

  return {
    project,
    dateRange,
    approvalRows,
    submissionStatus: {
      total_members: totalMembers,
      submitted_count: submittedCount,
      pending_count: pendingCount,
      all_submitted: allSubmitted,
      pending_users: pendingUsers,
    },
  };
}

/**
 * GET /api/approval/projects/:id
 * Get project approval data with all members, timesheets, and day-wise hours
 * Access: ADMIN, MANAGER only
 */
router.get('/projects/:id', verifyAuth, requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;
    const projectId = Array.isArray(id) ? id[0] : id;

    const approvalData = await fetchProjectApprovalData(projectId, req.user.id);

    if (!approvalData) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or insufficient permissions',
      });
    }

    res.json({
      success: true,
      project: {
        id: approvalData.project.id,
        title: approvalData.project.title,
        description: approvalData.project.description,
        start_date: approvalData.project.start_date,
        end_date: approvalData.project.end_date,
        status: approvalData.project.status,
      },
      date_range: approvalData.dateRange,
      approval_rows: approvalData.approvalRows,
      submission_status: approvalData.submissionStatus,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project approval data',
      error: error.message,
    });
  }
});

/**
 * PUT /api/approval/projects/:id/costing
 * Update rate and quote_amount for users in a project
 * Access: ADMIN, MANAGER only
 */
router.put('/projects/:id/costing', verifyAuth, requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;
    const { costing_updates } = req.body; // Array of { user_id, rate, quote_amount? }

    if (!Array.isArray(costing_updates)) {
      return res.status(400).json({
        success: false,
        message: 'costing_updates must be an array',
      });
    }

    // Get project to verify permissions
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper) {
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', req.user.id)
        .single();

      if (!userData || userData.organization_id !== project.organization_id) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
        });
      }
    }

    // Get timesheets to calculate total hours
    const { data: timesheets, error: timesheetsError } = await supabase
      .from('timesheets')
      .select(`
        id,
        user_id,
        entries:timesheet_entries (
          hours
        )
      `)
      .eq('project_id', id);

    if (timesheetsError) {
      throw timesheetsError;
    }

    // Process each costing update
    const results = [];

    for (const update of costing_updates) {
      const { user_id, rate, quote_amount } = update;

      // Calculate total hours for this user
      const timesheet = (timesheets || []).find((t: any) => t.user_id === user_id);
      let totalHours = 0;

      if (timesheet && timesheet.entries) {
        totalHours = timesheet.entries.reduce((sum: number, e: any) => sum + parseFloat(e.hours || 0), 0);
      }

      // Calculate amount
      const amount = totalHours * parseFloat(rate || 0);

      // Upsert costing record
      const { data: costing, error: costingError } = await supabase
        .from('project_costing')
        .upsert({
          project_id: id,
          user_id: user_id,
          rate: parseFloat(rate || 0),
          amount: amount,
          quote_amount: quote_amount !== undefined && quote_amount !== null ? parseFloat(quote_amount) : null,
          updated_at: getCurrentUTC().toISOString(),
        }, {
          onConflict: 'project_id,user_id',
        })
        .select()
        .single();

      if (costingError) {
        results.push({ user_id, success: false, error: costingError.message });
      } else {
        results.push({ user_id, success: true, costing });
      }
    }

    res.json({
      success: true,
      message: 'Costing updated successfully',
      results,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to update costing',
      error: error.message,
    });
  }
});

/**
 * POST /api/approval/projects/:id/approve
 * Approve all SUBMITTED timesheets for the project
 * Access: ADMIN, MANAGER only
 */
router.post('/projects/:id/approve', verifyAuth, requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;

    // Get project to verify permissions
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper) {
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', req.user.id)
        .single();

      if (!userData || userData.organization_id !== project.organization_id) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
        });
      }
    }

    // Get all project members (all users assigned to this project)
    const { data: projectMembers, error: membersError } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', id);

    if (membersError) {
      throw membersError;
    }

    if (!projectMembers || projectMembers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No members assigned to this project',
      });
    }

    const totalMembers = projectMembers.length;
    const memberUserIds = projectMembers.map((pm: any) => pm.user_id);

    // Get all timesheets for this project (SUBMITTED and APPROVED)
    const { data: allTimesheets, error: timesheetsError } = await supabase
      .from('timesheets')
      .select('id, user_id, status')
      .eq('project_id', id)
      .in('status', ['SUBMITTED', 'APPROVED']);

    if (timesheetsError) {
      throw timesheetsError;
    }

    // Separate SUBMITTED (need approval) and APPROVED (already approved)
    const submittedTimesheets = (allTimesheets || []).filter((t: any) => t.status === 'SUBMITTED');
    const approvedTimesheets = (allTimesheets || []).filter((t: any) => t.status === 'APPROVED');
    
    // Users who have either SUBMITTED or APPROVED timesheets
    const completedUserIds = (allTimesheets || []).map((t: any) => t.user_id);
    const pendingUserIds = memberUserIds.filter((userId: string) => !completedUserIds.includes(userId));

    // Check if ALL members have submitted (either SUBMITTED or APPROVED)
    if (pendingUserIds.length > 0) {
      // Get user emails for pending users
      const { data: pendingUsers, error: usersError } = await supabase
        .from('users')
        .select('id, email')
        .in('id', pendingUserIds);

      const pendingEmails = pendingUsers?.map((u: any) => u.email) || [];

      return res.status(400).json({
        success: false,
        message: `Cannot approve: Not all project members have submitted their timesheets. ${pendingUserIds.length} of ${totalMembers} member(s) still need to submit.`,
        total_members: totalMembers,
        submitted_count: submittedTimesheets.length,
        approved_count: approvedTimesheets.length,
        pending_count: pendingUserIds.length,
        pending_users: pendingEmails,
      });
    }

    // If no SUBMITTED timesheets to approve (all are already APPROVED)
    if (submittedTimesheets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All timesheets for this project have already been approved.',
        total_members: totalMembers,
        submitted_count: 0,
        approved_count: approvedTimesheets.length,
        pending_count: 0,
      });
    }

    const timesheetIds = submittedTimesheets.map(t => t.id);
    const now = getCurrentUTC().toISOString();

    // Log detailed information before update
    console.log(`[Approval] ===== STARTING APPROVAL PROCESS =====`);
    console.log(`[Approval] Project ID: ${id}`);
    console.log(`[Approval] Approving user ID: ${req.user.id}`);
    console.log(`[Approval] Timesheet IDs to approve: ${JSON.stringify(timesheetIds)}`);
    console.log(`[Approval] Number of timesheets: ${timesheetIds.length}`);
    console.log(`[Approval] Approval timestamp: ${now}`);

    // Verify timesheets exist and are in SUBMITTED status before updating
    if (timesheetIds.length === 0) {
      console.error('[Approval] No timesheet IDs to approve');
      return res.status(400).json({
        success: false,
        message: 'No timesheets to approve',
      });
    }

    // Check each timesheet exists and is SUBMITTED
    const { data: verifyTimesheets, error: verifyError } = await supabase
      .from('timesheets')
      .select('id, status, user_id')
      .in('id', timesheetIds);

    if (verifyError) {
      console.error('[Approval] Error verifying timesheets:', verifyError);
      throw verifyError;
    }

    if (!verifyTimesheets || verifyTimesheets.length !== timesheetIds.length) {
      console.error(`[Approval] Timesheet count mismatch. Expected: ${timesheetIds.length}, Found: ${verifyTimesheets?.length || 0}`);
      const foundIds = verifyTimesheets?.map((t: any) => t.id) || [];
      const missingIds = timesheetIds.filter(id => !foundIds.includes(id));
      console.error(`[Approval] Missing timesheet IDs: ${JSON.stringify(missingIds)}`);
    }

    // Verify all are SUBMITTED
    const nonSubmitted = verifyTimesheets?.filter((t: any) => t.status !== 'SUBMITTED') || [];
    if (nonSubmitted.length > 0) {
      console.error(`[Approval] Found ${nonSubmitted.length} timesheet(s) not in SUBMITTED status:`, nonSubmitted);
      return res.status(400).json({
        success: false,
        message: `Cannot approve: ${nonSubmitted.length} timesheet(s) are not in SUBMITTED status`,
        invalid_timesheets: nonSubmitted.map((t: any) => ({ id: t.id, status: t.status })),
      });
    }

    console.log(`[Approval] All ${timesheetIds.length} timesheet(s) verified as SUBMITTED. Proceeding with update...`);

    // Update all timesheets to APPROVED
    console.log(`[Approval] Executing update query...`);
    const updateData = {
      status: 'APPROVED',
      approved_at: now,
      approved_by: req.user.id,
      updated_at: now,
    };
    console.log(`[Approval] Update data:`, JSON.stringify(updateData, null, 2));

    const { data: updatedTimesheets, error: updateError } = await supabase
      .from('timesheets')
      .update(updateData)
      .in('id', timesheetIds)
      .select();

    if (updateError) {
      console.error('[Approval] ===== UPDATE ERROR =====');
      console.error('[Approval] Error code:', updateError.code);
      console.error('[Approval] Error message:', updateError.message);
      console.error('[Approval] Error details:', JSON.stringify(updateError, null, 2));
      console.error('[Approval] Error hint:', updateError.hint);
      console.error('[Approval] =========================');
      
      // Check if it's a column error
      if (updateError.message?.includes('column') || updateError.message?.includes('approved_by') || updateError.code === 'PGRST204') {
        return res.status(500).json({
          success: false,
          message: 'Database schema error: approved_by column does not exist. Please run database/migration_add_approved_by.sql in your Supabase SQL Editor.',
          error: updateError.message,
          code: updateError.code,
        });
      }
      
      throw updateError;
    }

    if (!updatedTimesheets || updatedTimesheets.length === 0) {
      console.error('[Approval] Update returned no rows. This might indicate RLS policy blocking the update.');
      return res.status(500).json({
        success: false,
        message: 'Update operation returned no rows. This may indicate a permissions issue or RLS policy conflict.',
        error: 'No timesheets were updated',
      });
    }

    console.log(`[Approval] ===== APPROVAL SUCCESS =====`);
    console.log(`[Approval] Successfully approved ${updatedTimesheets.length} timesheet(s)`);
    updatedTimesheets.forEach((t: any) => {
      console.log(`[Approval] ✓ Timesheet ${t.id} approved for user ${t.user_id}`);
      console.log(`[Approval]   - Status: ${t.status}`);
      console.log(`[Approval]   - Approved at: ${t.approved_at}`);
      console.log(`[Approval]   - Approved by: ${t.approved_by}`);
    });
    console.log(`[Approval] ============================`);

    res.json({
      success: true,
      message: `Successfully approved ${updatedTimesheets?.length || 0} timesheet(s)`,
      timesheets: updatedTimesheets,
    });
  } catch (error: any) {
    console.error('[Approval] ===== UNEXPECTED ERROR =====');
    console.error('[Approval] Error type:', error?.constructor?.name);
    console.error('[Approval] Error message:', error?.message);
    console.error('[Approval] Error stack:', error?.stack);
    if (error?.code) {
      console.error('[Approval] Error code:', error.code);
    }
    if (error?.details) {
      console.error('[Approval] Error details:', error.details);
    }
    if (error?.hint) {
      console.error('[Approval] Error hint:', error.hint);
    }
    console.error('[Approval] Full error object:', JSON.stringify(error, null, 2));
    console.error('[Approval] ============================');

    res.status(500).json({
      success: false,
      message: 'Failed to approve timesheets',
      error: error?.message || 'Unknown error occurred',
      code: error?.code,
      details: error?.details,
    });
  }
});

/**
 * GET /api/approval/projects/:id/export/excel
 * Generate Excel file with project approval table
 * Access: ADMIN, MANAGER only
 */
router.get('/projects/:id/export/excel', verifyAuth, requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;
    const projectId = Array.isArray(id) ? id[0] : id;

    // Get project approval data
    const approvalData = await fetchProjectApprovalData(projectId, req.user.id);

    if (!approvalData) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or insufficient permissions',
      });
    }

    const { project, dateRange, approvalRows } = approvalData;

    // Generate Excel workbook
    const workbook = XLSX.utils.book_new();
    
    // Check if any row has planned hours data
    const hasPlannedData = approvalRows.some((r: any) => r.planned_total_hours !== undefined);
    
    // Prepare worksheet data
    const worksheetData: any[][] = [];
    
    // Header row
    const headers = [
      'Name',
      'Role',
      ...dateRange.map((d: string) => {
        const date = new Date(d);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      'Total Hours',
      ...(hasPlannedData ? ['Planned Hours', 'Difference', 'Difference %'] : []),
      'Rate',
      'Amount',
      'Quote Amount',
    ];
    worksheetData.push(headers);
    
    // Data rows
    for (const row of approvalRows) {
      const dataRow = [
        row.name,
        row.role,
        ...dateRange.map((date: string) => row.day_hours[date] || 0),
        row.total_hours,
        ...(hasPlannedData ? [
          row.planned_total_hours || 0,
          row.difference_hours !== undefined ? row.difference_hours : '',
          row.difference_percentage !== undefined ? `${row.difference_percentage.toFixed(2)}%` : '',
        ] : []),
        row.rate,
        row.amount,
        row.quote_amount || null,
      ];
      worksheetData.push(dataRow);
    }
    
    // Totals row
    const totalHours = approvalRows.reduce((sum: number, r: any) => sum + r.total_hours, 0);
    const totalPlannedHours = hasPlannedData 
      ? approvalRows.reduce((sum: number, r: any) => sum + (r.planned_total_hours || 0), 0)
      : 0;
    const totalDifference = hasPlannedData ? totalHours - totalPlannedHours : 0;
    const totalDifferencePercentage = hasPlannedData && totalPlannedHours > 0
      ? (totalDifference / totalPlannedHours) * 100
      : 0;
    const totalAmount = approvalRows.reduce((sum: number, r: any) => sum + r.amount, 0);
    const totalQuote = approvalRows.reduce((sum: number, r: any) => sum + (r.quote_amount || 0), 0);
    const totalsRow = [
      'TOTALS',
      '',
      ...dateRange.map(() => ''),
      totalHours,
      ...(hasPlannedData ? [
        totalPlannedHours,
        totalDifference,
        `${totalDifferencePercentage.toFixed(2)}%`,
      ] : []),
      '',
      totalAmount,
      totalQuote,
    ];
    worksheetData.push(totalsRow);
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    const colWidths = [
      { wch: 20 }, // Name
      { wch: 15 }, // Role
      ...dateRange.map(() => ({ wch: 12 })), // Date columns
      { wch: 12 }, // Total Hours
      ...(hasPlannedData ? [
        { wch: 14 }, // Planned Hours
        { wch: 12 }, // Difference
        { wch: 14 }, // Difference %
      ] : []),
      { wch: 12 }, // Rate
      { wch: 12 }, // Amount
      { wch: 12 }, // Quote Amount
    ];
    worksheet['!cols'] = colWidths;
    
    // Add worksheet to workbook
    const sheetName = project.title.substring(0, 31); // Excel sheet name limit
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="approval-${project.title}-${id}.xlsx"`);
    res.send(excelBuffer);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to export approval data',
      error: error.message,
    });
  }
});

/**
 * GET /api/approval/projects/:id/export/pdf
 * Generate PDF report with project approval data
 * Access: ADMIN, MANAGER only
 */
router.get('/projects/:id/export/pdf', verifyAuth, requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;
    const projectId = Array.isArray(id) ? id[0] : id;

    // Get project approval data
    const approvalData = await fetchProjectApprovalData(projectId, req.user.id);

    if (!approvalData) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or insufficient permissions',
      });
    }

    const { project, dateRange, approvalRows } = approvalData;

    // Check if any row has planned hours data
    const hasPlannedData = approvalRows.some((r: any) => r.planned_total_hours !== undefined);

    // Generate PDF using pdfkit
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="approval-${project.title}-${id}.pdf"`);
      res.send(pdfBuffer);
    });
    
    // Title
    doc.fontSize(20).fillColor('#2563eb').text(`Approval Report: ${project.title}`, { align: 'center' });
    doc.moveDown();
    
    // Project period
    doc.fontSize(12).fillColor('#000000').text(
      `Project Period: ${new Date(project.start_date).toLocaleDateString()} - ${new Date(project.end_date).toLocaleDateString()}`,
      { align: 'center' }
    );
    doc.moveDown(2);
    
    // Table headers - adjust column widths based on whether planned data exists
    const tableTop = doc.y;
    const baseColWidths = [100, 80, 80]; // Name, Role, Total Hours
    const plannedColWidths = hasPlannedData ? [80, 80, 80] : []; // Planned Hours, Difference, Difference %
    const finalColWidths = [80, 80, 100]; // Rate, Amount, Quote
    const colWidths = [...baseColWidths, ...plannedColWidths, ...finalColWidths];
    const totalTableWidth = colWidths.reduce((sum, w) => sum + w, 0);
    const rowHeight = 25;
    
    // Header row
    doc.fontSize(9).fillColor('#ffffff').rect(50, tableTop, totalTableWidth, rowHeight).fill('#2563eb');
    let xPos = 55;
    doc.text('Name', xPos, tableTop + 8, { width: colWidths[0] - 10 });
    xPos += colWidths[0];
    doc.text('Role', xPos, tableTop + 8, { width: colWidths[1] - 10 });
    xPos += colWidths[1];
    doc.text('Total Hours', xPos, tableTop + 8, { width: colWidths[2] - 10 });
    xPos += colWidths[2];
    
    if (hasPlannedData) {
      doc.text('Planned', xPos, tableTop + 8, { width: colWidths[3] - 10 });
      xPos += colWidths[3];
      doc.text('Difference', xPos, tableTop + 8, { width: colWidths[4] - 10 });
      xPos += colWidths[4];
      doc.text('Diff %', xPos, tableTop + 8, { width: colWidths[5] - 10 });
      xPos += colWidths[5];
    }
    
    doc.text('Rate', xPos, tableTop + 8, { width: colWidths[hasPlannedData ? 6 : 3] - 10 });
    xPos += colWidths[hasPlannedData ? 6 : 3];
    doc.text('Amount', xPos, tableTop + 8, { width: colWidths[hasPlannedData ? 7 : 4] - 10 });
    xPos += colWidths[hasPlannedData ? 7 : 4];
    doc.text('Quote', xPos, tableTop + 8, { width: colWidths[hasPlannedData ? 8 : 5] - 10 });
    
    // Data rows
    let currentY = tableTop + rowHeight;
    doc.fillColor('#000000');
    
    for (const row of approvalRows) {
      if (currentY > 500) {
        // New page
        doc.addPage();
        currentY = 50;
        // Redraw header on new page
        doc.fontSize(9).fillColor('#ffffff').rect(50, currentY, totalTableWidth, rowHeight).fill('#2563eb');
        let headerX = 55;
        doc.text('Name', headerX, currentY + 8, { width: colWidths[0] - 10 });
        headerX += colWidths[0];
        doc.text('Role', headerX, currentY + 8, { width: colWidths[1] - 10 });
        headerX += colWidths[1];
        doc.text('Total Hours', headerX, currentY + 8, { width: colWidths[2] - 10 });
        headerX += colWidths[2];
        if (hasPlannedData) {
          doc.text('Planned', headerX, currentY + 8, { width: colWidths[3] - 10 });
          headerX += colWidths[3];
          doc.text('Difference', headerX, currentY + 8, { width: colWidths[4] - 10 });
          headerX += colWidths[4];
          doc.text('Diff %', headerX, currentY + 8, { width: colWidths[5] - 10 });
          headerX += colWidths[5];
        }
        doc.text('Rate', headerX, currentY + 8, { width: colWidths[hasPlannedData ? 6 : 3] - 10 });
        headerX += colWidths[hasPlannedData ? 6 : 3];
        doc.text('Amount', headerX, currentY + 8, { width: colWidths[hasPlannedData ? 7 : 4] - 10 });
        headerX += colWidths[hasPlannedData ? 7 : 4];
        doc.text('Quote', headerX, currentY + 8, { width: colWidths[hasPlannedData ? 8 : 5] - 10 });
        currentY += rowHeight;
        doc.fillColor('#000000');
      }
      
      doc.fontSize(9).rect(50, currentY, totalTableWidth, rowHeight).stroke();
      let xPos = 55;
      doc.text(row.name, xPos, currentY + 8, { width: colWidths[0] - 10 });
      xPos += colWidths[0];
      doc.text(row.role, xPos, currentY + 8, { width: colWidths[1] - 10 });
      xPos += colWidths[1];
      doc.text(row.total_hours.toFixed(2), xPos, currentY + 8, { width: colWidths[2] - 10 });
      xPos += colWidths[2];
      
      if (hasPlannedData) {
        const plannedHours = row.planned_total_hours !== undefined ? row.planned_total_hours.toFixed(2) : '-';
        doc.text(plannedHours, xPos, currentY + 8, { width: colWidths[3] - 10 });
        xPos += colWidths[3];
        const diffHours = row.difference_hours !== undefined ? row.difference_hours.toFixed(2) : '-';
        doc.text(diffHours, xPos, currentY + 8, { width: colWidths[4] - 10 });
        xPos += colWidths[4];
        const diffPct = row.difference_percentage !== undefined ? `${row.difference_percentage.toFixed(1)}%` : '-';
        doc.text(diffPct, xPos, currentY + 8, { width: colWidths[5] - 10 });
        xPos += colWidths[5];
      }
      
      doc.text(row.rate.toFixed(2), xPos, currentY + 8, { width: colWidths[hasPlannedData ? 6 : 3] - 10 });
      xPos += colWidths[hasPlannedData ? 6 : 3];
      doc.text(row.amount.toFixed(2), xPos, currentY + 8, { width: colWidths[hasPlannedData ? 7 : 4] - 10 });
      xPos += colWidths[hasPlannedData ? 7 : 4];
      doc.text(row.quote_amount ? row.quote_amount.toFixed(2) : '-', xPos, currentY + 8, { width: colWidths[hasPlannedData ? 8 : 5] - 10 });
      
      currentY += rowHeight;
    }
    
    // Totals row
    const totalHours = approvalRows.reduce((sum: number, r: any) => sum + r.total_hours, 0);
    const totalPlannedHours = hasPlannedData 
      ? approvalRows.reduce((sum: number, r: any) => sum + (r.planned_total_hours || 0), 0)
      : 0;
    const totalDifference = hasPlannedData ? totalHours - totalPlannedHours : 0;
    const totalDifferencePercentage = hasPlannedData && totalPlannedHours > 0
      ? (totalDifference / totalPlannedHours) * 100
      : 0;
    const totalAmount = approvalRows.reduce((sum: number, r: any) => sum + r.amount, 0);
    const totalQuote = approvalRows.reduce((sum: number, r: any) => sum + (r.quote_amount || 0), 0);
    
    if (currentY > 500) {
      doc.addPage();
      currentY = 50;
    }
    
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
    doc.rect(50, currentY, totalTableWidth, rowHeight).fill('#f0f0f0').stroke();
    let totalsX = 55;
    doc.text('TOTALS', totalsX, currentY + 8, { width: colWidths[0] + colWidths[1] - 10 });
    totalsX += colWidths[0] + colWidths[1];
    doc.text(totalHours.toFixed(2), totalsX, currentY + 8, { width: colWidths[2] - 10 });
    totalsX += colWidths[2];
    
    if (hasPlannedData) {
      doc.text(totalPlannedHours.toFixed(2), totalsX, currentY + 8, { width: colWidths[3] - 10 });
      totalsX += colWidths[3];
      doc.text(totalDifference.toFixed(2), totalsX, currentY + 8, { width: colWidths[4] - 10 });
      totalsX += colWidths[4];
      doc.text(`${totalDifferencePercentage.toFixed(1)}%`, totalsX, currentY + 8, { width: colWidths[5] - 10 });
      totalsX += colWidths[5];
    }
    
    doc.text('', totalsX, currentY + 8, { width: colWidths[hasPlannedData ? 6 : 3] - 10 }); // Rate column empty
    totalsX += colWidths[hasPlannedData ? 6 : 3];
    doc.text(totalAmount.toFixed(2), totalsX, currentY + 8, { width: colWidths[hasPlannedData ? 7 : 4] - 10 });
    totalsX += colWidths[hasPlannedData ? 7 : 4];
    doc.text(totalQuote.toFixed(2), totalsX, currentY + 8, { width: colWidths[hasPlannedData ? 8 : 5] - 10 });
    
    doc.end();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to export PDF',
      error: error.message,
    });
  }
});

export default router;

