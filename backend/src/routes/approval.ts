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
async function fetchProjectApprovalData(projectId: string, userId: string): Promise<{ project: any; dateRange: string[]; approvalRows: any[] } | null> {
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

  // Generate date range
  const dateRange = generateDateRange(project.start_date, project.end_date);

  // Get all timesheets for this project
  const { data: timesheets, error: timesheetsError } = await supabase
    .from('timesheets')
    .select(`
      id,
      project_id,
      user_id,
      status,
      submitted_at,
      approved_at,
      entries:timesheet_entries (
        id,
        date,
        hours
      )
    `)
    .eq('project_id', projectId);

  if (timesheetsError) {
    throw timesheetsError;
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

  for (const member of members || []) {
    const user = (member as any).users;
    const role = (member as any).roles;
    const timesheet = (timesheets || []).find((t: any) => t.user_id === member.user_id);
    const costing = (costingData || []).find((c: any) => c.user_id === member.user_id);

    // Map day-wise hours
    const dayHours: { [date: string]: number } = {};
    let totalHours = 0;

    if (timesheet && timesheet.entries) {
      for (const entry of timesheet.entries) {
        dayHours[entry.date] = parseFloat(entry.hours || 0);
        totalHours += parseFloat(entry.hours || 0);
      }
    }

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
      rate: rate,
      amount: amount,
      quote_amount: quoteAmount,
      day_hours: dayHours,
    });
  }

  return {
    project,
    dateRange,
    approvalRows,
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

    const approvalData = await fetchProjectApprovalData(id, req.user.id);

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

    // Get all SUBMITTED timesheets for this project
    const { data: submittedTimesheets, error: timesheetsError } = await supabase
      .from('timesheets')
      .select('id')
      .eq('project_id', id)
      .eq('status', 'SUBMITTED');

    if (timesheetsError) {
      throw timesheetsError;
    }

    if (!submittedTimesheets || submittedTimesheets.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No submitted timesheets found for this project',
      });
    }

    const timesheetIds = submittedTimesheets.map(t => t.id);
    const now = getCurrentUTC().toISOString();

    // Update all timesheets to APPROVED
    const { data: updatedTimesheets, error: updateError } = await supabase
      .from('timesheets')
      .update({
        status: 'APPROVED',
        approved_at: now,
        approved_by: req.user.id,
        updated_at: now,
      })
      .in('id', timesheetIds)
      .select();

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: `Successfully approved ${updatedTimesheets?.length || 0} timesheet(s)`,
      timesheets: updatedTimesheets,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to approve timesheets',
      error: error.message,
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

    // Get project approval data
    const approvalData = await fetchProjectApprovalData(id, req.user.id);

    if (!approvalData) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or insufficient permissions',
      });
    }

    const { project, dateRange, approvalRows } = approvalData;

    // Generate Excel workbook
    const workbook = XLSX.utils.book_new();
    
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
        row.rate,
        row.amount,
        row.quote_amount || null,
      ];
      worksheetData.push(dataRow);
    }
    
    // Totals row
    const totalHours = approvalRows.reduce((sum: number, r: any) => sum + r.total_hours, 0);
    const totalAmount = approvalRows.reduce((sum: number, r: any) => sum + r.amount, 0);
    const totalQuote = approvalRows.reduce((sum: number, r: any) => sum + (r.quote_amount || 0), 0);
    const totalsRow = [
      'TOTALS',
      '',
      ...dateRange.map(() => ''),
      totalHours,
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

    // Get project approval data
    const approvalData = await fetchProjectApprovalData(id, req.user.id);

    if (!approvalData) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or insufficient permissions',
      });
    }

    const { project, dateRange, approvalRows } = approvalData;

    // Generate PDF using pdfkit
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
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
    
    // Table headers
    const tableTop = doc.y;
    const colWidths = [100, 80, 80, 80, 80, 100];
    const rowHeight = 25;
    
    // Header row
    doc.fontSize(10).fillColor('#ffffff').rect(50, tableTop, 500, rowHeight).fill('#2563eb');
    doc.text('Name', 55, tableTop + 8, { width: colWidths[0] - 10 });
    doc.text('Role', 55 + colWidths[0], tableTop + 8, { width: colWidths[1] - 10 });
    doc.text('Total Hours', 55 + colWidths[0] + colWidths[1], tableTop + 8, { width: colWidths[2] - 10 });
    doc.text('Rate', 55 + colWidths[0] + colWidths[1] + colWidths[2], tableTop + 8, { width: colWidths[3] - 10 });
    doc.text('Amount', 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], tableTop + 8, { width: colWidths[4] - 10 });
    doc.text('Quote', 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], tableTop + 8, { width: colWidths[5] - 10 });
    
    // Data rows
    let currentY = tableTop + rowHeight;
    doc.fillColor('#000000');
    
    for (const row of approvalRows) {
      if (currentY > 700) {
        // New page
        doc.addPage();
        currentY = 50;
      }
      
      doc.fontSize(9).rect(50, currentY, 500, rowHeight).stroke();
      doc.text(row.name, 55, currentY + 8, { width: colWidths[0] - 10 });
      doc.text(row.role, 55 + colWidths[0], currentY + 8, { width: colWidths[1] - 10 });
      doc.text(row.total_hours.toFixed(2), 55 + colWidths[0] + colWidths[1], currentY + 8, { width: colWidths[2] - 10 });
      doc.text(row.rate.toFixed(2), 55 + colWidths[0] + colWidths[1] + colWidths[2], currentY + 8, { width: colWidths[3] - 10 });
      doc.text(row.amount.toFixed(2), 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], currentY + 8, { width: colWidths[4] - 10 });
      doc.text(row.quote_amount ? row.quote_amount.toFixed(2) : '-', 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], currentY + 8, { width: colWidths[5] - 10 });
      
      currentY += rowHeight;
    }
    
    // Totals row
    const totalHours = approvalRows.reduce((sum: number, r: any) => sum + r.total_hours, 0);
    const totalAmount = approvalRows.reduce((sum: number, r: any) => sum + r.amount, 0);
    const totalQuote = approvalRows.reduce((sum: number, r: any) => sum + (r.quote_amount || 0), 0);
    
    if (currentY > 700) {
      doc.addPage();
      currentY = 50;
    }
    
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
    doc.rect(50, currentY, 500, rowHeight).fill('#f0f0f0').stroke();
    doc.text('TOTALS', 55, currentY + 8, { width: colWidths[0] + colWidths[1] - 10 });
    doc.text(totalHours.toFixed(2), 55 + colWidths[0] + colWidths[1], currentY + 8, { width: colWidths[2] - 10 });
    doc.text('', 55 + colWidths[0] + colWidths[1] + colWidths[2], currentY + 8, { width: colWidths[3] - 10 });
    doc.text(totalAmount.toFixed(2), 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], currentY + 8, { width: colWidths[4] - 10 });
    doc.text(totalQuote.toFixed(2), 55 + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], currentY + 8, { width: colWidths[5] - 10 });
    
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

