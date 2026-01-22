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

    // Get projects where user is a member
    const { data: projectMembers, error: membersError } = await supabase
      .from('project_members')
      .select(`
        project_id,
        role:roles(name),
        project:projects(*)
      `)
      .eq('user_id', req.user.id);

    if (membersError) {
      throw membersError;
    }

    // Format projects with role names
    const projects = (projectMembers || [])
      .filter((pm: any) => pm.project !== null)
      .map((pm: any) => ({
        ...pm.project,
        role_name: pm.role?.name || 'N/A',
      }));

    res.json({
      success: true,
      projects: projects || [],
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
 * GET /api/timesheets
 * Get all timesheets for current user (with entries)
 */
router.get('/', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { data: timesheets, error } = await supabase
      .from('timesheets')
      .select(`
        *,
        entries:timesheet_entries(*)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      timesheets: timesheets || [],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timesheets',
      error: error.message,
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

    const { projectId } = req.params;

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
      const entriesToInsert = entries.map((entry: any) => ({
        timesheet_id: timesheetId,
        date: entry.date,
        hours: parseFloat(entry.hours) || 0,
        created_at: getCurrentUTC().toISOString(),
        updated_at: getCurrentUTC().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('timesheet_entries')
        .insert(entriesToInsert);

      if (insertError) {
        throw insertError;
      }
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
 */
router.post('/:id/submit', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;

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

    // Validate entries exist
    const { data: entries, error: entriesError } = await supabase
      .from('timesheet_entries')
      .select('*')
      .eq('timesheet_id', id);

    if (entriesError) {
      throw entriesError;
    }

    // Validate all entries
    for (const entry of entries || []) {
      if (!validateCellHours(parseFloat(entry.hours))) {
        return res.status(400).json({
          success: false,
          message: `Invalid hours value for date ${entry.date}`,
        });
      }

      const dayValidation = await validateDayHours(
        req.user.id,
        entry.date,
        timesheet.project_id,
        parseFloat(entry.hours),
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
 * GET /api/timesheets/history
 * Get approved timesheets (for history view)
 */
router.get('/history', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { data: timesheets, error } = await supabase
      .from('timesheets')
      .select(`
        *,
        entries:timesheet_entries(*),
        project:projects(*)
      `)
      .eq('user_id', req.user.id)
      .eq('status', 'APPROVED')
      .order('approved_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      timesheets: timesheets || [],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timesheet history',
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

    const roleName = projectMember?.role?.name || 'N/A';

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

