import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { verifyAuth, AuthRequest } from '../middleware/auth';
import { getCurrentUTC } from '../utils/timezone';
import * as XLSX from 'xlsx';

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
 * Helper function to check if user is assigned to project
 */
async function isUserAssignedToProject(userId: string, projectId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  return !error && !!data;
}

/**
 * Helper function to validate hours per cell (0-24)
 */
function validateCellHours(hours: number): boolean {
  return hours >= 0 && hours <= 24;
}

/**
 * Helper function to validate total hours per day across all projects
 */
async function validateDayHours(
  userId: string,
  date: string,
  projectId: string,
  hours: number,
  excludeTimesheetId?: string
): Promise<{ valid: boolean; total: number; message?: string }> {
  // Get all timesheets for user
  let query = supabase
    .from('timesheets')
    .select('id')
    .eq('user_id', userId);

  if (excludeTimesheetId) {
    query = query.neq('id', excludeTimesheetId);
  }

  const { data: timesheets, error: timesheetsError } = await query;

  if (timesheetsError || !timesheets) {
    return { valid: false, total: 0, message: 'Failed to validate day hours' };
  }

  const timesheetIds = timesheets.map((t: any) => t.id);

  if (timesheetIds.length === 0) {
    return { valid: true, total: hours };
  }

  // Get all entries for this date across all timesheets
  const { data: entries, error: entriesError } = await supabase
    .from('timesheet_entries')
    .select('timesheet_id, hours')
    .in('timesheet_id', timesheetIds)
    .eq('date', date);

  if (entriesError) {
    return { valid: false, total: 0, message: 'Failed to validate day hours' };
  }

  // Calculate total hours for this date
  // We already excluded the timesheet from the query, so we just sum all entries
  let totalHours = 0;
  if (entries) {
    totalHours = entries.reduce((sum: number, entry: any) => {
      return sum + parseFloat(entry.hours || 0);
    }, 0);
  }

  // Add the new hours (this replaces the old value since we excluded the timesheet)
  totalHours += hours;

  if (totalHours > 24) {
    return {
      valid: false,
      total: totalHours,
      message: `Total hours for ${date} exceeds 24 hours (${totalHours.toFixed(2)} hours)`,
    };
  }

  return { valid: true, total: totalHours };
}

/**
 * GET /api/timesheets/projects
 * Get projects where user is a member (for timesheet page)
 */
router.get('/projects', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    console.log('Fetching projects for user:', req.user.id);

    // Step 1: Get project_members for this user
    const { data: projectMembers, error: membersError } = await supabase
      .from('project_members')
      .select('project_id, role_id, user_id')
      .eq('user_id', req.user.id);

    if (membersError) {
      console.error('Error fetching project_members:', membersError);
      throw membersError;
    }

    console.log('Found project_members:', projectMembers?.length || 0);

    if (!projectMembers || projectMembers.length === 0) {
      // No projects assigned - return empty array (not an error)
      return res.json({
        success: true,
        projects: [],
      });
    }

    // Step 2: Get unique project IDs
    const projectIds = [...new Set(projectMembers.map((pm: any) => pm.project_id))];
    console.log('Project IDs:', projectIds);

    // Step 3: Fetch projects
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .in('id', projectIds);

    if (projectsError) {
      console.error('Error fetching projects:', projectsError);
      throw projectsError;
    }

    console.log('Found projects:', projects?.length || 0);

    // Step 4: Get role names for each project member
    const roleIds = [...new Set(projectMembers.map((pm: any) => pm.role_id))];
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('id, name')
      .in('id', roleIds);

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
      // Don't throw - just continue without role names
    }

    // Create a map of role_id -> role_name
    const roleMap = new Map();
    if (roles) {
      roles.forEach((role: any) => {
        roleMap.set(role.id, role.name);
      });
    }

    // Step 5: Combine projects with role names
    const projectsWithRoles = (projects || []).map((project: any) => {
      // Find the project member entry for this project
      const memberEntry = projectMembers.find((pm: any) => pm.project_id === project.id);
      const roleName = memberEntry ? (roleMap.get(memberEntry.role_id) || 'N/A') : 'N/A';

      return {
        ...project,
        role_name: roleName,
      };
    });

    console.log('Returning projects with roles:', projectsWithRoles.length);

    res.json({
      success: true,
      projects: projectsWithRoles,
    });
  } catch (error: any) {
    console.error('Error in /api/timesheets/projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
      error: error.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/timesheets
 * Get all timesheets for current user (with entries)
 */
router.get('/', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      console.error('GET /api/timesheets: No user in request');
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    console.log('GET /api/timesheets: Fetching timesheets for user:', req.user.id);

    // First get timesheets - using service role key should bypass RLS
    // Try a simple query first to test connection
    console.log('GET /api/timesheets: Testing database connection...');
    const { data: testData, error: testError } = await supabase
      .from('timesheets')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('GET /api/timesheets: Database connection test failed:', testError);
      console.error('Error code:', testError.code);
      console.error('Error message:', testError.message);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed',
        error: testError.message || 'Cannot connect to timesheets table',
        code: testError.code,
      });
    }
    
    console.log('GET /api/timesheets: Database connection OK, querying timesheets for user...');
    
    const { data: timesheets, error: timesheetsError } = await supabase
      .from('timesheets')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (timesheetsError) {
      console.error('GET /api/timesheets: Error fetching timesheets:', timesheetsError);
      console.error('Error code:', timesheetsError.code);
      console.error('Error message:', timesheetsError.message);
      console.error('Error details:', JSON.stringify(timesheetsError, null, 2));
      console.error('Error hint:', timesheetsError.hint);
      
      // Check if it's an RLS error
      if (timesheetsError.message?.includes('RLS') || timesheetsError.message?.includes('policy') || timesheetsError.code === '42501') {
        console.error('GET /api/timesheets: RLS policy error detected - service role key may not be configured correctly');
        return res.status(500).json({
          success: false,
          message: 'Database access denied. Check RLS policies and service role key configuration.',
          error: timesheetsError.message,
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch timesheets from database',
        error: timesheetsError.message || 'Database query failed',
        code: timesheetsError.code,
      });
    }

    console.log('GET /api/timesheets: Found timesheets:', timesheets?.length || 0);

    // If no timesheets, return empty array (this is not an error)
    if (!timesheets || timesheets.length === 0) {
      console.log('GET /api/timesheets: No timesheets found, returning empty array');
      return res.json({
        success: true,
        timesheets: [],
      });
    }

    // Get entries for all timesheets
    const timesheetIds = timesheets.map((t: any) => t.id).filter((id: any) => id != null);
    
    if (timesheetIds.length === 0) {
      console.log('GET /api/timesheets: No valid timesheet IDs, returning timesheets without entries');
      return res.json({
        success: true,
        timesheets: timesheets.map((t: any) => ({ ...t, entries: [] })),
      });
    }

    console.log('GET /api/timesheets: Fetching entries for', timesheetIds.length, 'timesheets');
    
    const { data: entries, error: entriesError } = await supabase
      .from('timesheet_entries')
      .select('*')
      .in('timesheet_id', timesheetIds);

    if (entriesError) {
      console.error('GET /api/timesheets: Error fetching timesheet entries:', entriesError);
      console.error('Error details:', JSON.stringify(entriesError, null, 2));
      // Don't throw - return timesheets without entries rather than failing completely
      return res.json({
        success: true,
        timesheets: timesheets.map((t: any) => ({ ...t, entries: [] })),
      });
    }

    console.log('GET /api/timesheets: Found entries:', entries?.length || 0);

    // Group entries by timesheet_id
    const entriesMap = new Map<string, any[]>();
    if (entries && Array.isArray(entries)) {
      entries.forEach((entry: any) => {
        if (entry && entry.timesheet_id) {
          if (!entriesMap.has(entry.timesheet_id)) {
            entriesMap.set(entry.timesheet_id, []);
          }
          entriesMap.get(entry.timesheet_id)!.push(entry);
        }
      });
    }

    // Combine timesheets with entries
    const timesheetsWithEntries = timesheets.map((timesheet: any) => {
      try {
        return {
          ...timesheet,
          entries: entriesMap.get(timesheet.id) || [],
        };
      } catch (err) {
        console.error('Error processing timesheet:', timesheet.id, err);
        return {
          ...timesheet,
          entries: [],
        };
      }
    });

    console.log('GET /api/timesheets: Returning', timesheetsWithEntries.length, 'timesheets');
    
    res.json({
      success: true,
      timesheets: timesheetsWithEntries,
    });
  } catch (error: any) {
    console.error('GET /api/timesheets: Unexpected error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timesheets',
      error: error?.message || 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/timesheets/history
 * Get approved timesheets (for history view)
 * MUST be defined BEFORE /:id route to avoid route conflicts
 */
router.get('/history', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    console.log('Fetching timesheet history for user:', req.user.id);

    // Get approved timesheets
    const { data: timesheets, error: timesheetsError } = await supabase
      .from('timesheets')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'APPROVED')
      .order('approved_at', { ascending: false });

    if (timesheetsError) {
      console.error('Error fetching approved timesheets:', timesheetsError);
      throw timesheetsError;
    }

    console.log('Found approved timesheets:', timesheets?.length || 0);

    if (!timesheets || timesheets.length === 0) {
      return res.json({
        success: true,
        timesheets: [],
      });
    }

    // Get entries for all timesheets
    const timesheetIds = timesheets.map((t: any) => t.id);
    const { data: entries, error: entriesError } = await supabase
      .from('timesheet_entries')
      .select('*')
      .in('timesheet_id', timesheetIds);

    if (entriesError) {
      console.error('Error fetching timesheet entries:', entriesError);
      // Don't throw - return timesheets without entries
    }

    // Get projects for all timesheets
    const projectIds = [...new Set(timesheets.map((t: any) => t.project_id))];
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .in('id', projectIds);

    if (projectsError) {
      console.error('Error fetching projects:', projectsError);
      // Don't throw - return timesheets without project details
    }

    // Group entries by timesheet_id
    const entriesMap = new Map();
    if (entries) {
      entries.forEach((entry: any) => {
        if (!entriesMap.has(entry.timesheet_id)) {
          entriesMap.set(entry.timesheet_id, []);
        }
        entriesMap.get(entry.timesheet_id).push(entry);
      });
    }

    // Create project map
    const projectMap = new Map();
    if (projects) {
      projects.forEach((project: any) => {
        projectMap.set(project.id, project);
      });
    }

    // Combine timesheets with entries and projects
    const timesheetsWithData = timesheets.map((timesheet: any) => ({
      ...timesheet,
      entries: entriesMap.get(timesheet.id) || [],
      project: projectMap.get(timesheet.project_id) || null,
    }));

    res.json({
      success: true,
      timesheets: timesheetsWithData,
    });
  } catch (error: any) {
    console.error('Error in /api/timesheets/history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timesheet history',
      error: error.message || 'Unknown error',
    });
  }
});

/**
 * GET /api/timesheets/:id
 * Get specific timesheet with entries
 */
router.get('/:id', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;

    const { data: timesheet, error } = await supabase
      .from('timesheets')
      .select(`
        *,
        entries:timesheet_entries(*),
        project:projects(*)
      `)
      .eq('id', id)
      .single();

    if (error || !timesheet) {
      return res.status(404).json({
        success: false,
        message: 'Timesheet not found',
      });
    }

    // Check if user can access this timesheet
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && timesheet.user_id !== req.user.id) {
      // Check if user is in same organization
      const { data: project } = await supabase
        .from('projects')
        .select('organization_id')
        .eq('id', timesheet.project_id)
        .single();

      if (project) {
        const { data: user } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', req.user.id)
          .single();

        if (!user || user.organization_id !== project.organization_id) {
          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions',
          });
        }
      } else {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
        });
      }
    }

    res.json({
      success: true,
      timesheet,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timesheet',
      error: error.message,
    });
  }
});

/**
 * GET /api/timesheets/project/:projectId
 * Get timesheet for specific project
 */
router.get('/project/:projectId', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;

    // Check if user is assigned to project
    const isAssigned = await isUserAssignedToProject(req.user.id, projectId);
    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this project',
      });
    }

    const { data: timesheet, error } = await supabase
      .from('timesheets')
      .select(`
        *,
        entries:timesheet_entries(*)
      `)
      .eq('project_id', projectId)
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "not found" error
      throw error;
    }

    res.json({
      success: true,
      timesheet: timesheet || null,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timesheet',
      error: error.message,
    });
  }
});

/**
 * POST /api/timesheets
 * Create or update draft timesheet
 */
router.post('/', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { project_id, entries } = req.body;

    if (!project_id) {
      return res.status(400).json({
        success: false,
        message: 'project_id is required',
      });
    }

    if (!Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        message: 'entries must be an array',
      });
    }

    // Check if user is assigned to project
    const isAssigned = await isUserAssignedToProject(req.user.id, project_id);
    if (!isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this project',
      });
    }

    // Get project to validate date range
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('start_date, end_date')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Validate entries
    const validationErrors: string[] = [];
    const projectStartDate = new Date(project.start_date);
    const projectEndDate = new Date(project.end_date);

    for (const entry of entries) {
      // Validate cell hours
      if (!validateCellHours(entry.hours)) {
        validationErrors.push(`Hours for ${entry.date} must be between 0 and 24`);
        continue;
      }

      // Validate date is within project range
      const entryDate = new Date(entry.date);
      if (entryDate < projectStartDate || entryDate > projectEndDate) {
        validationErrors.push(`Date ${entry.date} is outside project date range`);
        continue;
      }

      // Validate day hours (will check after we get existing timesheet)
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors,
      });
    }

    // Get or create timesheet
    const { data: existingTimesheet, error: fetchError } = await supabase
      .from('timesheets')
      .select('id, status')
      .eq('project_id', project_id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    let timesheetId: string;

    if (existingTimesheet) {
      // Check if timesheet is in DRAFT status
      if (existingTimesheet.status !== 'DRAFT') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update timesheet that is not in DRAFT status',
        });
      }

      timesheetId = existingTimesheet.id;

      // Update timesheet updated_at
      await supabase
        .from('timesheets')
        .update({ updated_at: getCurrentUTC().toISOString() })
        .eq('id', timesheetId);
    } else {
      // Create new timesheet
      const { data: newTimesheet, error: createError } = await supabase
        .from('timesheets')
        .insert({
          project_id,
          user_id: req.user.id,
          status: 'DRAFT',
          created_at: getCurrentUTC().toISOString(),
          updated_at: getCurrentUTC().toISOString(),
        })
        .select('id')
        .single();

      if (createError || !newTimesheet) {
        throw createError || new Error('Failed to create timesheet');
      }

      timesheetId = newTimesheet.id;
    }

    // Validate day hours across all projects
    for (const entry of entries) {
      const dayValidation = await validateDayHours(
        req.user.id,
        entry.date,
        project_id,
        entry.hours,
        timesheetId
      );

      if (!dayValidation.valid) {
        return res.status(400).json({
          success: false,
          message: dayValidation.message || 'Validation failed',
          errors: [dayValidation.message || 'Total hours per day cannot exceed 24'],
        });
      }
    }

    // Delete existing entries
    await supabase.from('timesheet_entries').delete().eq('timesheet_id', timesheetId);

    // Insert new entries
    if (entries.length > 0) {
      const entriesToInsert = entries.map((entry: any) => {
        // Normalize date to YYYY-MM-DD format (remove time component if present)
        const normalizedDate = entry.date ? entry.date.split('T')[0] : entry.date;
        const hours = parseFloat(entry.hours) || 0;
        
        console.log(`[Timesheet Save] Entry: date=${entry.date} -> normalized=${normalizedDate}, hours=${hours}`);
        
        return {
          timesheet_id: timesheetId,
          date: normalizedDate,
          hours: hours,
          created_at: getCurrentUTC().toISOString(),
          updated_at: getCurrentUTC().toISOString(),
        };
      });

      console.log(`[Timesheet Save] Inserting ${entriesToInsert.length} entries for timesheet ${timesheetId}`);
      
      // Log entries with hours > 0 for debugging
      const entriesWithHours = entriesToInsert.filter(e => e.hours > 0);
      if (entriesWithHours.length > 0) {
        console.log(`[Timesheet Save] ${entriesWithHours.length} entries with hours > 0:`, 
          entriesWithHours.slice(0, 5).map(e => `${e.date}: ${e.hours}h`));
      } else {
        console.log(`[Timesheet Save] WARNING: All entries have 0 hours!`);
      }
      
      const { data: insertedEntries, error: insertError } = await supabase
        .from('timesheet_entries')
        .insert(entriesToInsert)
        .select();

      if (insertError) {
        console.error('[Timesheet Save] Error inserting entries:', insertError);
        throw insertError;
      }
      
      console.log(`[Timesheet Save] Successfully inserted ${insertedEntries?.length || 0} entries`);
      
      // Verify inserted entries
      if (insertedEntries && insertedEntries.length > 0) {
        const verifiedWithHours = insertedEntries.filter((e: any) => parseFloat(e.hours) > 0);
        console.log(`[Timesheet Save] Verified: ${verifiedWithHours.length} entries with hours > 0 in database`);
      }
    } else {
      console.log(`[Timesheet Save] No entries to insert for timesheet ${timesheetId}`);
    }

    // Fetch updated timesheet with entries
    const { data: updatedTimesheet, error: fetchUpdatedError } = await supabase
      .from('timesheets')
      .select(`
        *,
        entries:timesheet_entries(*)
      `)
      .eq('id', timesheetId)
      .single();

    if (fetchUpdatedError) {
      throw fetchUpdatedError;
    }

    res.json({
      success: true,
      message: 'Timesheet saved successfully',
      timesheet: updatedTimesheet,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to save timesheet',
      error: error.message,
    });
  }
});

/**
 * POST /api/timesheets/:id/submit
 * Submit timesheet (changes status to SUBMITTED)
 * Optionally accepts entries in request body to save them before submitting
 */
router.post('/:id/submit', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { entries: entriesFromBody } = req.body; // Optional entries from request body

    // Get timesheet
    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheets')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !timesheet) {
      return res.status(404).json({
        success: false,
        message: 'Timesheet not found',
      });
    }

    // Check if user owns this timesheet
    if (timesheet.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only submit your own timesheets',
      });
    }

    // Check if timesheet is in DRAFT status
    if (timesheet.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: `Cannot submit timesheet with status ${timesheet.status}`,
      });
    }

    // If entries are provided in request body, save them first
    if (entriesFromBody && Array.isArray(entriesFromBody) && entriesFromBody.length > 0) {
      console.log(`[Timesheet Submit] Saving ${entriesFromBody.length} entries before submission`);
      
      // Get project to validate date range
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('start_date, end_date')
        .eq('id', timesheet.project_id)
        .single();

      if (projectError || !project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found',
        });
      }

      // Validate entries
      const projectStartDate = new Date(project.start_date);
      const projectEndDate = new Date(project.end_date);

      for (const entry of entriesFromBody) {
        // Validate cell hours
        if (!validateCellHours(parseFloat(entry.hours || 0))) {
          return res.status(400).json({
            success: false,
            message: `Invalid hours value for date ${entry.date}. Hours must be between 0 and 24.`,
          });
        }

        // Validate date is within project range
        const entryDate = new Date(entry.date);
        if (entryDate < projectStartDate || entryDate > projectEndDate) {
          return res.status(400).json({
            success: false,
            message: `Date ${entry.date} is outside project date range`,
          });
        }
      }

      // Validate day hours across all projects
      for (const entry of entriesFromBody) {
        const dayValidation = await validateDayHours(
          req.user.id,
          entry.date,
          timesheet.project_id,
          parseFloat(entry.hours || 0),
          id
        );

        if (!dayValidation.valid) {
          return res.status(400).json({
            success: false,
            message: dayValidation.message || 'Validation failed',
          });
        }
      }

      // Delete existing entries
      await supabase.from('timesheet_entries').delete().eq('timesheet_id', id);

      // Insert new entries
      const entriesToInsert = entriesFromBody.map((entry: any) => {
        // Normalize date to YYYY-MM-DD format (remove time component if present)
        const normalizedDate = entry.date ? entry.date.split('T')[0] : entry.date;
        const hours = parseFloat(entry.hours || 0);
        
        console.log(`[Timesheet Submit] Entry: date=${entry.date} -> normalized=${normalizedDate}, hours=${hours}`);
        
        return {
          timesheet_id: id,
          date: normalizedDate,
          hours: hours,
          created_at: getCurrentUTC().toISOString(),
          updated_at: getCurrentUTC().toISOString(),
        };
      });

      console.log(`[Timesheet Submit] Inserting ${entriesToInsert.length} entries for timesheet ${id}`);
      
      const { data: insertedEntries, error: insertError } = await supabase
        .from('timesheet_entries')
        .insert(entriesToInsert)
        .select();

      if (insertError) {
        console.error('[Timesheet Submit] Error inserting entries:', insertError);
        throw insertError;
      }
      
      console.log(`[Timesheet Submit] Successfully inserted ${insertedEntries?.length || 0} entries`);
      
      // Verify inserted entries
      if (insertedEntries && insertedEntries.length > 0) {
        const verifiedWithHours = insertedEntries.filter((e: any) => parseFloat(e.hours) > 0);
        console.log(`[Timesheet Submit] Verified: ${verifiedWithHours.length} entries with hours > 0 in database`);
      }
    }

    // Get entries from database (either existing or just saved)
    const { data: entries, error: entriesError } = await supabase
      .from('timesheet_entries')
      .select('*')
      .eq('timesheet_id', id);

    if (entriesError) {
      throw entriesError;
    }

    // Validate that entries exist
    if (!entries || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot submit timesheet without entries. Please add hours before submitting.',
      });
    }

    // Validate all entries
    for (const entry of entries) {
      if (!validateCellHours(parseFloat(entry.hours || 0))) {
        return res.status(400).json({
          success: false,
          message: `Invalid hours value for date ${entry.date}`,
        });
      }

      const dayValidation = await validateDayHours(
        req.user.id,
        entry.date,
        timesheet.project_id,
        parseFloat(entry.hours || 0),
        id
      );

      if (!dayValidation.valid) {
        return res.status(400).json({
          success: false,
          message: dayValidation.message || 'Validation failed',
        });
      }
    }

    // Update timesheet status
    const { data: updatedTimesheet, error: updateError } = await supabase
      .from('timesheets')
      .update({
        status: 'SUBMITTED',
        submitted_at: getCurrentUTC().toISOString(),
        updated_at: getCurrentUTC().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        entries:timesheet_entries(*)
      `)
      .single();

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'Timesheet submitted successfully',
      timesheet: updatedTimesheet,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to submit timesheet',
      error: error.message,
    });
  }
});

/**
 * GET /api/timesheets/:id/export
 * Generate Excel export (for approved timesheets)
 * Returns CSV format (can be upgraded to Excel later)
 */
router.get('/:id/export', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;

    // Get timesheet with entries and project
    const { data: timesheet, error: fetchError } = await supabase
      .from('timesheets')
      .select(`
        *,
        entries:timesheet_entries(*),
        project:projects(*),
        user:users(email)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !timesheet) {
      return res.status(404).json({
        success: false,
        message: 'Timesheet not found',
      });
    }

    // Check if timesheet is approved
    if (timesheet.status !== 'APPROVED') {
      return res.status(400).json({
        success: false,
        message: 'Only approved timesheets can be exported',
      });
    }

    // Check if user can access this timesheet
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && timesheet.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Get user's role in project
    const { data: projectMember } = await supabase
      .from('project_members')
      .select(`
        role:roles(name)
      `)
      .eq('project_id', timesheet.project_id)
      .eq('user_id', timesheet.user_id)
      .single();

    const role = projectMember?.role as any;
    const roleName = (Array.isArray(role) ? role[0]?.name : role?.name) || 'N/A';

    // Sort entries by date
    const entries = (timesheet.entries || []).sort((a: any, b: any) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // Generate Excel workbook
    const workbook = XLSX.utils.book_new();
    
    // Prepare data for Excel
    const userName = timesheet.user?.email || 'N/A';
    const totalHours = entries.reduce((sum: number, e: any) => sum + parseFloat(e.hours || 0), 0);
    
    // Create worksheet data
    const worksheetData: any[][] = [];
    
    // Header row
    const headers = ['Name', 'Role', ...entries.map((e: any) => e.date), 'Total'];
    worksheetData.push(headers);
    
    // Data row
    const dataRow = [
      userName,
      roleName,
      ...entries.map((e: any) => parseFloat(e.hours || 0)),
      totalHours,
    ];
    worksheetData.push(dataRow);
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    const colWidths = [
      { wch: 20 }, // Name
      { wch: 15 }, // Role
      ...entries.map(() => ({ wch: 12 })), // Date columns
      { wch: 12 }, // Total
    ];
    worksheet['!cols'] = colWidths;
    
    // Add worksheet to workbook
    const sheetName = (timesheet.project?.title || 'Timesheet').substring(0, 31); // Excel sheet name limit
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${timesheet.project?.title || 'export'}-${id}.xlsx"`);
    res.send(excelBuffer);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to export timesheet',
      error: error.message,
    });
  }
});

export default router;

