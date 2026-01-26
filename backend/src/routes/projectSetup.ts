import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { verifyAuth, requireRole, AuthRequest } from '../middleware/auth';
import { getCurrentUTC } from '../utils/timezone';
import {
  calculateWeeks,
  calculateAllocationTotals,
  updateAllocationTotals,
  updateProjectSetupTotals,
  validateProjectSetup,
  getDefaultHourlyRate,
  calculateMargins,
} from '../utils/projectSetupCalculations';

const router = Router();

/**
 * Helper function to check if user has ADMIN or MANAGER role in organization
 */
async function userHasAdminOrManagerRole(userId: string, organizationId: string): Promise<boolean> {
  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('role_id, roles:role_id(name, organization_id)')
    .eq('user_id', userId);

  if (error || !roles) {
    return false;
  }

  return roles.some((ur: any) => 
    ur.roles?.organization_id === organizationId &&
    (ur.roles?.name === 'ADMIN' || ur.roles?.name === 'MANAGER')
  );
}

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
 * Helper function to check if user can manage project
 */
async function canManageProject(userId: string, projectId: string): Promise<boolean> {
  const isSuper = await isSuperAdmin(userId);
  if (isSuper) {
    return true;
  }

  // Get project organization
  const { data: project, error } = await supabase
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    return false;
  }

  return await userHasAdminOrManagerRole(userId, project.organization_id);
}

/**
 * GET /api/project-setup/:projectId
 * Fetch complete setup data with all allocations and weekly hours
 */
router.get('/:projectId', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Get project with organization currency
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        *,
        project_manager:project_manager_id(id, email),
        organization:organization_id(id, currency_code, currency_symbol)
      `)
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Get or create project setup
    let { data: setup, error: setupError } = await supabase
      .from('project_setups')
      .select('*')
      .eq('project_id', projectId)
      .single();

    // If setup doesn't exist, create it automatically
    if (setupError && setupError.code === 'PGRST116') {
      const totalWeeks = calculateWeeks(project.start_date, project.end_date);
      
      const { data: newSetup, error: createError } = await supabase
        .from('project_setups')
        .insert({
          project_id: projectId,
          total_weeks: totalWeeks,
          total_internal_hours: 0,
          total_internal_cost: 0,
          customer_rate_per_hour: 0,
          total_customer_amount: 0,
          gross_margin_percentage: 0,
          sold_cost_percentage: 11.00,
          current_margin_percentage: 0,
          margin_status: 'red',
        })
        .select()
        .single();

      if (createError || !newSetup) {
        throw createError || new Error('Failed to create project setup');
      }

      setup = newSetup;
      console.log('Auto-created project_setups record for project:', projectId);
    } else if (setupError) {
      throw setupError;
    }

    // Get allocations with related data
    const { data: allocations, error: allocError } = await supabase
      .from('project_role_allocations')
      .select(`
        *,
        user:user_id(id, email),
        role:role_id(id, name),
        weekly_hours:project_weekly_hours(*)
      `)
      .eq('project_id', projectId)
      .order('row_order', { ascending: true });

    if (allocError) {
      throw allocError;
    }

    // Get phases
    const { data: phases, error: phasesError } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('start_week', { ascending: true });

    if (phasesError) {
      throw phasesError;
    }

    // Extract currency from organization
    const currency = {
      code: (project as any).organization?.currency_code || 'INR',
      symbol: (project as any).organization?.currency_symbol || '₹',
    };

    res.json({
      success: true,
      data: {
        project,
        setup,
        allocations: allocations || [],
        phases: phases || [],
        currency,
      },
    });
  } catch (error: any) {
    console.error('Error fetching project setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project setup',
      error: error.message,
    });
  }
});

/**
 * POST /api/project-setup/:projectId
 * Create or initialize setup for a project
 */
router.post('/:projectId', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('start_date, end_date')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Calculate weeks
    const totalWeeks = calculateWeeks(project.start_date, project.end_date);

    // Create project setup
    const { data: setup, error: setupError } = await supabase
      .from('project_setups')
      .insert({
        project_id: projectId,
        total_weeks: totalWeeks,
      })
      .select()
      .single();

    if (setupError) {
      if (setupError.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Project setup already exists',
        });
      }
      throw setupError;
    }

    res.status(201).json({
      success: true,
      message: 'Project setup created successfully',
      data: setup,
    });
  } catch (error: any) {
    console.error('Error creating project setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create project setup',
      error: error.message,
    });
  }
});

/**
 * PUT /api/project-setup/:projectId/header
 * Update customer pricing and margin calculations
 */
router.put('/:projectId/header', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    const { customer_rate_per_hour, sold_cost_percentage } = req.body;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Validate input
    if (customer_rate_per_hour !== undefined && customer_rate_per_hour < 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer rate must be positive',
      });
    }

    if (sold_cost_percentage !== undefined && (sold_cost_percentage < 0 || sold_cost_percentage > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Sold cost percentage must be between 0 and 100',
      });
    }

    // Update header
    const updateData: any = {};
    if (customer_rate_per_hour !== undefined) {
      updateData.customer_rate_per_hour = customer_rate_per_hour;
    }
    if (sold_cost_percentage !== undefined) {
      updateData.sold_cost_percentage = sold_cost_percentage;
    }

    const { error: updateError } = await supabase
      .from('project_setups')
      .update(updateData)
      .eq('project_id', projectId);

    if (updateError) {
      throw updateError;
    }

    // Recalculate totals and margins
    await updateProjectSetupTotals(projectId);

    // Get updated setup
    const { data: setup, error: fetchError } = await supabase
      .from('project_setups')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (fetchError || !setup) {
      throw fetchError || new Error('Failed to fetch updated setup');
    }

    res.json({
      success: true,
      message: 'Project setup updated successfully',
      data: setup,
    });
  } catch (error: any) {
    console.error('Error updating project setup header:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update project setup',
      error: error.message,
    });
  }
});

/**
 * POST /api/project-setup/:projectId/save-draft
 * Batch save all planning rows (lenient validation - allows empty rows)
 */
router.post('/:projectId/save-draft', verifyAuth, async (req: AuthRequest, res: Response) => {
  const { projectId: projectIdParam } = req.params;
  const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
  
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }
    const { rows, sold_cost_percentage } = req.body;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Validate input format
    if (!Array.isArray(rows)) {
      return res.status(400).json({
        success: false,
        message: 'rows must be an array',
      });
    }

    // Get project to verify organization
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Update header if sold_cost_percentage provided (customer_rate_per_hour is now per-row)
    if (sold_cost_percentage !== undefined) {
      if (sold_cost_percentage < 0 || sold_cost_percentage > 100) {
        return res.status(400).json({
          success: false,
          message: 'Sold cost percentage must be between 0 and 100',
        });
      }

      const { error: headerError } = await supabase
        .from('project_setups')
        .update({ sold_cost_percentage })
        .eq('project_id', projectId);

      if (headerError) {
        throw headerError;
      }
    }

    // Process rows in transaction
    // Get existing allocations to determine which to update vs create
    const { data: existingAllocations } = await supabase
      .from('project_role_allocations')
      .select('id, row_order')
      .eq('project_id', projectId);

    const existingIds = new Set((existingAllocations || []).map(a => a.id));
    const maxOrder = existingAllocations && existingAllocations.length > 0
      ? Math.max(...existingAllocations.map(a => a.row_order || 0))
      : 0;

    // Fetch default customer rate from project_setups once (for fallback)
    const { data: setup } = await supabase
      .from('project_setups')
      .select('customer_rate_per_hour')
      .eq('project_id', projectId)
      .single();
    const defaultCustomerRate = setup?.customer_rate_per_hour || 0;

    // Separate rows into updates and creates
    const toUpdate: any[] = [];
    const toCreate: any[] = [];
    let nextOrder = maxOrder + 1;
    let newAllocations: any[] | null = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowId = row.id || row.tempId;

      // Validate row format (lenient - allow nulls)
      if (typeof rowId !== 'string' && rowId !== undefined) {
        continue; // Skip invalid rows
      }

      const weeklyHours = Array.isArray(row.weekly_hours) ? row.weekly_hours : [];

      // Use row's customer_rate_per_hour or fallback to default
      const customerRate = row.customer_rate_per_hour !== undefined && row.customer_rate_per_hour !== null
        ? row.customer_rate_per_hour
        : defaultCustomerRate;

      if (rowId && existingIds.has(rowId)) {
        // Update existing allocation
        toUpdate.push({
          id: rowId,
          role_id: row.role_id || null,
          user_id: row.user_id || null,
          hourly_rate: row.hourly_rate || 0,
          customer_rate_per_hour: customerRate || 0,
          weekly_hours: weeklyHours,
        });
      } else {
        // Create new allocation
        toCreate.push({
          role_id: row.role_id || null,
          user_id: row.user_id || null,
          hourly_rate: row.hourly_rate || 0,
          customer_rate_per_hour: customerRate || 0,
          weekly_hours: weeklyHours,
          row_order: nextOrder++,
        });
      }
    }

    // Delete allocations not in the rows array
    const rowIds = rows
      .map(r => r.id || r.tempId)
      .filter(id => id && existingIds.has(id));
    
    if (rowIds.length < existingIds.size) {
      const idsToDelete = Array.from(existingIds).filter(id => !rowIds.includes(id));
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('project_role_allocations')
          .delete()
          .eq('project_id', projectId)
          .in('id', idsToDelete);

        if (deleteError) {
          throw deleteError;
        }
      }
    }

    // Create new allocations
    if (toCreate.length > 0) {
      // Build insert object
      const allocationsToInsert = toCreate.map(c => ({
        project_id: projectId,
        role_id: c.role_id,
        user_id: c.user_id,
        hourly_rate: c.hourly_rate,
        customer_rate_per_hour: c.customer_rate_per_hour || 0,
        row_order: c.row_order,
      }));

      const { data: insertedAllocations, error: createError } = await supabase
        .from('project_role_allocations')
        .insert(allocationsToInsert)
        .select('id, row_order');
      
      newAllocations = insertedAllocations;

      if (createError) {
        // Check if error is about missing column (migration not run)
        if (createError.message && (
          createError.message.includes('customer_rate_per_hour') ||
          (createError.message.includes('column') && createError.message.includes('does not exist'))
        )) {
          throw new Error('Database migration not run. Please run migration_add_customer_rate_per_row.sql in Supabase SQL Editor first. See MIGRATION_INSTRUCTIONS.md for details.');
        }
        throw createError;
      }

      // Add weekly hours for new allocations
      for (let i = 0; i < (newAllocations?.length || 0); i++) {
        const allocation = newAllocations![i];
        const weeklyHours = toCreate[i].weekly_hours;
        
        if (weeklyHours && weeklyHours.length > 0) {
          const hoursToInsert = weeklyHours
            .filter((wh: any) => wh.week_number && wh.hours > 0)
            .map((wh: any) => ({
              allocation_id: allocation.id,
              week_number: wh.week_number,
              hours: wh.hours,
            }));

          if (hoursToInsert.length > 0) {
            const { error: hoursError } = await supabase
              .from('project_weekly_hours')
              .insert(hoursToInsert);

            if (hoursError) {
              console.error('Error inserting weekly hours:', hoursError);
            }
          }
        }
      }
    }

    // Update existing allocations
    for (const update of toUpdate) {
      // Build update object
      const updateData: any = {
        role_id: update.role_id,
        user_id: update.user_id,
        hourly_rate: update.hourly_rate,
        customer_rate_per_hour: update.customer_rate_per_hour || 0,
      };

      const { error: updateError } = await supabase
        .from('project_role_allocations')
        .update(updateData)
        .eq('id', update.id)
        .eq('project_id', projectId);

      if (updateError) {
        // Check if error is about missing column (migration not run)
        if (updateError.message && (
          updateError.message.includes('customer_rate_per_hour') ||
          updateError.message.includes('column') && updateError.message.includes('does not exist')
        )) {
          throw new Error('Database migration not run. Please run migration_add_customer_rate_per_row.sql in Supabase SQL Editor first. See MIGRATION_INSTRUCTIONS.md for details.');
        }
        throw updateError;
      }

      // Update weekly hours
      if (update.weekly_hours && update.weekly_hours.length > 0) {
        // Delete existing hours
        await supabase
          .from('project_weekly_hours')
          .delete()
          .eq('allocation_id', update.id);

        // Insert new hours
        const hoursToInsert = update.weekly_hours
          .filter((wh: any) => wh.week_number && wh.hours > 0)
          .map((wh: any) => ({
            allocation_id: update.id,
            week_number: wh.week_number,
            hours: wh.hours,
          }));

        if (hoursToInsert.length > 0) {
          const { error: hoursError } = await supabase
            .from('project_weekly_hours')
            .insert(hoursToInsert);

          if (hoursError) {
            console.error('Error updating weekly hours:', hoursError);
          }
        }
      }
    }

    // Recalculate all totals with error handling
    for (const update of toUpdate) {
      try {
        // Only recalculate if the allocation has a user/role/rate and some hours
        const hasData = update.role_id && update.user_id && update.hourly_rate > 0 && 
                       update.weekly_hours && update.weekly_hours.length > 0;
        
        if (hasData) {
          const result = await updateAllocationTotals(update.id);
          if (!result) {
            console.warn(`Failed to update totals for allocation ${update.id} in project ${projectId}`);
          }
        } else {
          // If no data, set totals to 0
          await supabase.from('project_role_allocations').update({ total_hours: 0, total_amount: 0 }).eq('id', update.id);
        }
      } catch (error: any) {
        console.error(`Error recalculating totals for allocation ${update.id} in project ${projectId}:`, error.message, error.stack);
        // Continue processing other allocations even if one fails
      }
    }
    
    // Recalculate totals for newly created allocations using the IDs from insert
    if (toCreate.length > 0 && newAllocations && newAllocations.length > 0) {
      for (const alloc of newAllocations) {
        try {
          // Only recalculate if the allocation has a user/role/rate and some hours
          const createIndex = newAllocations.findIndex(a => a.id === alloc.id);
          if (createIndex >= 0 && createIndex < toCreate.length) {
            const createData = toCreate[createIndex];
            const hasData = createData.role_id && createData.user_id && createData.hourly_rate > 0 && 
                           createData.weekly_hours && createData.weekly_hours.length > 0;
            
            if (hasData) {
              const result = await updateAllocationTotals(alloc.id);
              if (!result) {
                console.warn(`Failed to update totals for new allocation ${alloc.id} in project ${projectId}`);
              }
            } else {
              // If no data, set totals to 0
              await supabase.from('project_role_allocations').update({ total_hours: 0, total_amount: 0 }).eq('id', alloc.id);
            }
          }
        } catch (error: any) {
          console.error(`Error recalculating totals for new allocation ${alloc.id} in project ${projectId}:`, error.message, error.stack);
          // Continue processing other allocations even if one fails
        }
      }
    }

    // Update project totals with error handling
    try {
      const result = await updateProjectSetupTotals(projectId);
      if (!result) {
        console.warn(`Failed to update project totals for project ${projectId}`);
      }
    } catch (error: any) {
      console.error(`Error updating project totals for project ${projectId}:`, error);
      // Don't fail the entire save operation if totals update fails
    }

    // Always set status to draft on save (even if previously 'ready')
    // This ensures any changes after finalization revert to draft
    const { error: statusError } = await supabase
      .from('projects')
      .update({ setup_status: 'draft' })
      .eq('id', projectId);

    if (statusError) {
      console.error(`Error updating project status to draft for project ${projectId}:`, statusError);
      // Don't fail the entire save operation if status update fails
    }

    res.json({
      success: true,
      message: 'Draft saved successfully',
    });
  } catch (error: any) {
    console.error(`Error saving draft for project ${projectId}:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to save draft',
      error: error.message || 'Unknown error occurred',
      ...(process.env.NODE_ENV === 'development' && {
        details: error.details,
        hint: error.hint,
      }),
    });
  }
});

/**
 * POST /api/project-setup/:projectId/allocations
 * Add a new role+user row
 */
router.post('/:projectId/allocations', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    const { role_id, user_id, hourly_rate } = req.body;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Allow null role_id and user_id for draft allocations
    // Validation will happen on finalize

    // Get project to verify organization
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Get max row_order
    const { data: maxOrder } = await supabase
      .from('project_role_allocations')
      .select('row_order')
      .eq('project_id', projectId)
      .order('row_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.row_order || 0) + 1;

    // Determine hourly rate (use provided or fetch default)
    let finalRate = hourly_rate || 0;
    
    // Only fetch default rate if role and user are provided
    if ((!finalRate || finalRate === 0) && user_id && role_id) {
      const defaultRate = await getDefaultHourlyRate(user_id, role_id, project.organization_id);
      finalRate = defaultRate || 0;
    }

    // Create allocation (allow null role_id and user_id for draft)
    const { data: allocation, error: allocError } = await supabase
      .from('project_role_allocations')
      .insert({
        project_id: projectId,
        role_id: role_id || null,  // Explicitly allow null
        user_id: user_id || null,  // Explicitly allow null
        hourly_rate: finalRate || 0,
        row_order: nextOrder,
      })
      .select(`
        *,
        user:user_id(id, email),
        role:role_id(id, name)
      `)
      .single();

    if (allocError) {
      if (allocError.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'User already assigned to this project',
        });
      }
      throw allocError;
    }

    // Handle null relationships gracefully for empty rows
    if (allocation) {
      allocation.user = allocation.user || null;
      allocation.role = allocation.role || null;
    }

    res.status(201).json({
      success: true,
      message: 'Allocation created successfully',
      data: allocation,
    });
  } catch (error: any) {
    console.error('Error creating allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create allocation',
      error: error.message,
    });
  }
});

/**
 * PUT /api/project-setup/:projectId/allocations/:allocationId
 * Update role, user, or hourly rate for a row
 */
router.put('/:projectId/allocations/:allocationId', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam, allocationId: allocationIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    const allocationId = Array.isArray(allocationIdParam) ? allocationIdParam[0] : allocationIdParam;
    const { role_id, user_id, hourly_rate } = req.body;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Build update object
    const updateData: any = {};
    if (role_id !== undefined) updateData.role_id = role_id;
    if (user_id !== undefined) updateData.user_id = user_id;
    if (hourly_rate !== undefined) updateData.hourly_rate = hourly_rate;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    // Update allocation
    const { error: updateError } = await supabase
      .from('project_role_allocations')
      .update(updateData)
      .eq('id', allocationId)
      .eq('project_id', projectId);

    if (updateError) {
      throw updateError;
    }

    // Recalculate totals
    await updateAllocationTotals(allocationId);
    await updateProjectSetupTotals(projectId);

    // Get updated allocation
    const { data: allocation, error: fetchError } = await supabase
      .from('project_role_allocations')
      .select(`
        *,
        user:user_id(id, email),
        role:role_id(id, name),
        weekly_hours:project_weekly_hours(*)
      `)
      .eq('id', allocationId)
      .single();

    if (fetchError || !allocation) {
      throw fetchError || new Error('Failed to fetch updated allocation');
    }

    res.json({
      success: true,
      message: 'Allocation updated successfully',
      data: allocation,
    });
  } catch (error: any) {
    console.error('Error updating allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update allocation',
      error: error.message,
    });
  }
});

/**
 * DELETE /api/project-setup/:projectId/allocations/:allocationId
 * Remove allocation row and cascade delete weekly hours
 */
router.delete('/:projectId/allocations/:allocationId', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam, allocationId: allocationIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    const allocationId = Array.isArray(allocationIdParam) ? allocationIdParam[0] : allocationIdParam;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Delete allocation (cascade will delete weekly hours)
    const { error: deleteError } = await supabase
      .from('project_role_allocations')
      .delete()
      .eq('id', allocationId)
      .eq('project_id', projectId);

    if (deleteError) {
      throw deleteError;
    }

    // Recalculate project totals
    await updateProjectSetupTotals(projectId);

    res.json({
      success: true,
      message: 'Allocation deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting allocation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete allocation',
      error: error.message,
    });
  }
});

/**
 * PUT /api/project-setup/:projectId/allocations/:allocationId/weeks
 * Bulk update weekly hours for one allocation
 */
router.put('/:projectId/allocations/:allocationId/weeks', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam, allocationId: allocationIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    const allocationId = Array.isArray(allocationIdParam) ? allocationIdParam[0] : allocationIdParam;
    const { weeks } = req.body; // Array of { week_number, hours }

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Validate input
    if (!Array.isArray(weeks)) {
      return res.status(400).json({
        success: false,
        message: 'Weeks must be an array',
      });
    }

    // Verify allocation belongs to project
    const { data: allocation, error: allocError } = await supabase
      .from('project_role_allocations')
      .select('id')
      .eq('id', allocationId)
      .eq('project_id', projectId)
      .single();

    if (allocError || !allocation) {
      return res.status(404).json({
        success: false,
        message: 'Allocation not found',
      });
    }

    // Upsert weekly hours
    const upsertData = weeks.map((week: any) => ({
      allocation_id: allocationId,
      week_number: week.week_number,
      hours: week.hours || 0,
    }));

    const { error: upsertError } = await supabase
      .from('project_weekly_hours')
      .upsert(upsertData, {
        onConflict: 'allocation_id,week_number',
      });

    if (upsertError) {
      throw upsertError;
    }

    // Recalculate totals
    await updateAllocationTotals(allocationId);
    await updateProjectSetupTotals(projectId);

    // Get updated weekly hours
    const { data: updatedWeeks, error: fetchError } = await supabase
      .from('project_weekly_hours')
      .select('*')
      .eq('allocation_id', allocationId)
      .order('week_number', { ascending: true });

    if (fetchError) {
      throw fetchError;
    }

    res.json({
      success: true,
      message: 'Weekly hours updated successfully',
      data: updatedWeeks,
    });
  } catch (error: any) {
    console.error('Error updating weekly hours:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update weekly hours',
      error: error.message,
    });
  }
});

/**
 * POST /api/project-setup/:projectId/finalize
 * Validate and finalize project setup
 */
router.post('/:projectId/finalize', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Validate setup
    const validation = await validateProjectSetup(projectId);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors,
      });
    }

    // Update project setup_status
    const { error: updateError } = await supabase
      .from('projects')
      .update({ setup_status: 'ready' })
      .eq('id', projectId);

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'Project setup finalized successfully',
    });
  } catch (error: any) {
    console.error('Error finalizing project setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to finalize project setup',
      error: error.message,
    });
  }
});

/**
 * GET /api/user-hourly-rates
 * List rates for organization (filtered by role/user if needed)
 */
router.get('/rates/hourly', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { organization_id, role_id, user_id } = req.query;

    // Build query
    let query = supabase
      .from('user_hourly_rates')
      .select(`
        *,
        user:user_id(id, email),
        role:role_id(id, name)
      `);

    // Filter by organization
    const orgId = organization_id as string || req.user.organization_id;
    if (orgId) {
      query = query.eq('organization_id', orgId);
    }

    // Filter by role if provided
    if (role_id) {
      query = query.eq('role_id', role_id);
    }

    // Filter by user if provided
    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data: rates, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: rates || [],
    });
  } catch (error: any) {
    console.error('Error fetching hourly rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hourly rates',
      error: error.message,
    });
  }
});

/**
 * PUT /api/user-hourly-rates
 * Bulk upsert rates for users
 */
router.put('/rates/hourly', verifyAuth, requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { rates } = req.body; // Array of { user_id, role_id, organization_id, hourly_rate }

    if (!Array.isArray(rates)) {
      return res.status(400).json({
        success: false,
        message: 'Rates must be an array',
      });
    }

    // Validate and upsert rates
    const upsertData = rates.map((rate: any) => ({
      user_id: rate.user_id,
      role_id: rate.role_id,
      organization_id: rate.organization_id,
      hourly_rate: rate.hourly_rate,
      effective_from: rate.effective_from || new Date().toISOString().split('T')[0],
    }));

    const { data, error } = await supabase
      .from('user_hourly_rates')
      .upsert(upsertData, {
        onConflict: 'user_id,role_id,organization_id',
      })
      .select();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Hourly rates updated successfully',
      data: data || [],
    });
  } catch (error: any) {
    console.error('Error updating hourly rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update hourly rates',
      error: error.message,
    });
  }
});

/**
 * GET /api/project-setup/:projectId/reports/planned-vs-actual
 * Get planned vs actual hours comparison
 */
router.get('/:projectId/reports/planned-vs-actual', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Check if project is finalized
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('setup_status')
      .eq('id', projectId)
      .single();

    // If project not finalized, return empty data
    if (projectError || !project || project.setup_status !== 'ready') {
      return res.json({
        success: true,
        data: [],
        message: 'Planning not finalized. Complete planning to view reports.',
      });
    }

    // Get planned hours from project_weekly_hours
    const { data: plannedData, error: plannedError } = await supabase
      .from('project_weekly_hours')
      .select(`
        hours,
        allocation:allocation_id(
          user_id,
          role_id,
          user:user_id(email),
          role:role_id(name),
          hourly_rate
        )
      `)
      .eq('allocation.project_role_allocations.project_setup_id', projectId);

    // If error fetching planned data, return empty instead of crashing
    if (plannedError) {
      console.error('Error fetching planned data:', plannedError);
      return res.json({
        success: true,
        data: [],
        message: 'No planning data available',
      });
    }

    // Get actual hours from timesheet_entries
    const { data: actualData, error: actualError } = await supabase
      .from('timesheet_entries')
      .select(`
        hours,
        user:user_id(email),
        role:role_id(name)
      `)
      .eq('project_id', projectId);

    // Actual data error is not critical - just means no timesheets yet
    if (actualError) {
      console.error('Error fetching actual data:', actualError);
    }

    // Aggregate data by user and role
    const aggregated: Record<string, any> = {};

    // Process planned hours
    if (plannedData) {
      plannedData.forEach((entry: any) => {
        const allocation = entry.allocation;
        if (!allocation || !allocation.user) return;

        const key = `${allocation.user.email}-${allocation.role?.name || 'Unknown'}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            user_email: allocation.user.email,
            role_name: allocation.role?.name || 'Unknown',
            planned_hours: 0,
            actual_hours: 0,
            hourly_rate: allocation.hourly_rate || 0,
          };
        }
        aggregated[key].planned_hours += entry.hours || 0;
      });
    }

    // Process actual hours
    if (actualData) {
      actualData.forEach((entry: any) => {
        if (!entry.user) return;

        const key = `${entry.user.email}-${entry.role?.name || 'Unknown'}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            user_email: entry.user.email,
            role_name: entry.role?.name || 'Unknown',
            planned_hours: 0,
            actual_hours: 0,
            hourly_rate: 0,
          };
        }
        aggregated[key].actual_hours += entry.hours || 0;
      });
    }

    // Calculate variance
    const result = Object.values(aggregated).map((row: any) => {
      const variance = row.actual_hours - row.planned_hours;
      const variance_percentage = row.planned_hours > 0
        ? (variance / row.planned_hours) * 100
        : 0;

      return {
        user_email: row.user_email,
        role_name: row.role_name,
        planned_hours: Number(row.planned_hours.toFixed(2)),
        actual_hours: Number(row.actual_hours.toFixed(2)),
        variance: Number(variance.toFixed(2)),
        variance_percentage: Number(variance_percentage.toFixed(2)),
      };
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error fetching planned vs actual report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch planned vs actual report',
      error: error.message,
    });
  }
});

/**
 * GET /api/project-setup/:projectId/reports/cost-summary
 * Get cost summary with planned vs actual comparison
 */
router.get('/:projectId/reports/cost-summary', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Check if project is finalized
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('setup_status')
      .eq('id', projectId)
      .single();

    // If project not finalized, return empty data
    if (projectError || !project || project.setup_status !== 'ready') {
      return res.json({
        success: true,
        data: {
          planned_cost: 0,
          actual_cost: 0,
          variance: 0,
          variance_percentage: 0,
          budget_status: 'on_track' as const,
        },
        message: 'Planning not finalized. Complete planning to view cost summary.',
      });
    }

    // Get planned cost from project_setups
    const { data: setup, error: setupError } = await supabase
      .from('project_setups')
      .select('total_internal_cost')
      .eq('project_id', projectId)
      .single();

    const planned_cost = setup?.total_internal_cost || 0;

    // Get actual cost from project_costing (may not exist yet)
    const { data: costing, error: costingError } = await supabase
      .from('project_costing')
      .select('total_cost_internal')
      .eq('project_id', projectId)
      .single();

    // If no costing data yet, that's okay - just means no timesheets logged
    const actual_cost = costing?.total_cost_internal || 0;

    // Calculate variance
    const variance = actual_cost - planned_cost;
    const variance_percentage = planned_cost > 0
      ? (variance / planned_cost) * 100
      : 0;

    // Determine budget status
    let budget_status: 'under' | 'on_track' | 'over' = 'on_track';
    if (variance_percentage > 10) {
      budget_status = 'over';
    } else if (variance_percentage < -10) {
      budget_status = 'under';
    }

    res.json({
      success: true,
      data: {
        planned_cost: Number(planned_cost.toFixed(2)),
        actual_cost: Number(actual_cost.toFixed(2)),
        variance: Number(variance.toFixed(2)),
        variance_percentage: Number(variance_percentage.toFixed(2)),
        budget_status,
      },
    });
  } catch (error: any) {
    console.error('Error fetching cost summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cost summary',
      error: error.message,
    });
  }
});

/**
 * GET /api/project-setup/:projectId/reports/export
 * Export report as CSV
 * Query params: type = 'planned' | 'actual' | 'variance'
 */
router.get('/:projectId/reports/export', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { projectId: projectIdParam } = req.params;
    const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
    const { type } = req.query;

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Get project details
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .single();

    if (projectError) {
      throw projectError;
    }

    let csvContent = '';

    if (type === 'planned') {
      // Export planned cost breakdown
      const { data: allocations, error } = await supabase
        .from('project_role_allocations')
        .select(`
          *,
          user:user_id(email),
          role:role_id(name),
          weekly_hours:project_weekly_hours(hours)
        `)
        .eq('project_setup.project_id', projectId);

      if (error) throw error;

      csvContent = 'User,Role,Hourly Rate,Total Hours,Total Cost\n';
      
      allocations?.forEach((alloc: any) => {
        const totalHours = alloc.weekly_hours?.reduce((sum: number, w: any) => sum + (w.hours || 0), 0) || 0;
        const totalCost = totalHours * (alloc.hourly_rate || 0);
        csvContent += `"${alloc.user?.email || 'TBD'}","${alloc.role?.name || 'Unknown'}",${alloc.hourly_rate},${totalHours},${totalCost}\n`;
      });

    } else if (type === 'actual') {
      // Export actual cost from timesheet
      const { data: entries, error } = await supabase
        .from('timesheet_entries')
        .select(`
          hours,
          user:user_id(email),
          role:role_id(name)
        `)
        .eq('project_id', projectId);

      if (error) throw error;

      // Aggregate by user and role
      const aggregated: Record<string, any> = {};
      entries?.forEach((entry: any) => {
        const key = `${entry.user?.email}-${entry.role?.name}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            user: entry.user?.email || 'Unknown',
            role: entry.role?.name || 'Unknown',
            hours: 0,
          };
        }
        aggregated[key].hours += entry.hours || 0;
      });

      csvContent = 'User,Role,Actual Hours\n';
      Object.values(aggregated).forEach((row: any) => {
        csvContent += `"${row.user}","${row.role}",${row.hours}\n`;
      });

    } else if (type === 'variance') {
      // Export variance report (planned vs actual)
      // Reuse the logic from planned-vs-actual endpoint
      const { data: plannedData } = await supabase
        .from('project_weekly_hours')
        .select(`
          hours,
          allocation:allocation_id(
            user:user_id(email),
            role:role_id(name),
            hourly_rate
          )
        `)
        .eq('allocation.project_role_allocations.project_setup_id', projectId);

      const { data: actualData } = await supabase
        .from('timesheet_entries')
        .select(`
          hours,
          user:user_id(email),
          role:role_id(name)
        `)
        .eq('project_id', projectId);

      const aggregated: Record<string, any> = {};

      plannedData?.forEach((entry: any) => {
        const allocation = entry.allocation;
        if (!allocation?.user) return;
        const key = `${allocation.user.email}-${allocation.role?.name}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            user: allocation.user.email,
            role: allocation.role?.name || 'Unknown',
            planned: 0,
            actual: 0,
            rate: allocation.hourly_rate || 0,
          };
        }
        aggregated[key].planned += entry.hours || 0;
      });

      actualData?.forEach((entry: any) => {
        if (!entry.user) return;
        const key = `${entry.user.email}-${entry.role?.name}`;
        if (!aggregated[key]) {
          aggregated[key] = {
            user: entry.user.email,
            role: entry.role?.name || 'Unknown',
            planned: 0,
            actual: 0,
            rate: 0,
          };
        }
        aggregated[key].actual += entry.hours || 0;
      });

      csvContent = 'User,Role,Planned Hours,Actual Hours,Variance,Variance %,Planned Cost,Actual Cost,Cost Variance\n';
      Object.values(aggregated).forEach((row: any) => {
        const variance = row.actual - row.planned;
        const variancePercent = row.planned > 0 ? (variance / row.planned) * 100 : 0;
        const plannedCost = row.planned * row.rate;
        const actualCost = row.actual * row.rate;
        const costVariance = actualCost - plannedCost;
        
        csvContent += `"${row.user}","${row.role}",${row.planned.toFixed(2)},${row.actual.toFixed(2)},${variance.toFixed(2)},${variancePercent.toFixed(2)},${plannedCost.toFixed(2)},${actualCost.toFixed(2)},${costVariance.toFixed(2)}\n`;
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid export type. Must be: planned, actual, or variance',
      });
    }

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="project-${project.title}-${type}-report.csv"`);
    res.send(csvContent);

  } catch (error: any) {
    console.error('Error exporting report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export report',
      error: error.message,
    });
  }
});

/**
 * PUT /api/project-setup/:projectId/finalize
 * Finalize planning with validation
 */
router.put('/:projectId/finalize', verifyAuth, async (req: AuthRequest, res: Response) => {
  const { projectId: projectIdParam } = req.params;
  const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;
  
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Check permissions
    if (!(await canManageProject(req.user.id, projectId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Fetch setup separately
    const { data: setup, error: setupError } = await supabase
      .from('project_setups')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (setupError || !setup) {
      return res.status(404).json({
        success: false,
        message: 'Project setup not found',
      });
    }

    // Fetch allocations separately (project_setups and project_role_allocations are not directly related)
    const { data: allocations, error: allocError } = await supabase
      .from('project_role_allocations')
      .select('*')
      .eq('project_id', projectId)
      .order('row_order', { ascending: true });

    if (allocError) {
      throw allocError;
    }

    // Attach allocations to setup object for compatibility with existing validation code
    setup.allocations = allocations || [];

    // Validation: At least one allocation exists
    if (!setup.allocations || setup.allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot finalize: Add at least one resource allocation',
      });
    }

    // Validation: Each allocation must be complete with detailed errors
    const validationErrors: Array<{ row_index: number; errors: string[] }> = [];
    
    for (let i = 0; i < setup.allocations.length; i++) {
      const allocation = setup.allocations[i];
      const rowErrors: string[] = [];

      if (!allocation.role_id) {
        rowErrors.push('Role is required');
      }
      if (!allocation.user_id) {
        rowErrors.push('User is required');
      }
      if (!allocation.hourly_rate || allocation.hourly_rate <= 0) {
        rowErrors.push('Hourly rate must be greater than 0');
      }

      // Check if allocation has at least one week with hours > 0
      const { data: weeklyHours } = await supabase
        .from('project_weekly_hours')
        .select('hours')
        .eq('allocation_id', allocation.id);

      const totalHours = (weeklyHours || []).reduce((sum, wh) => sum + Number(wh.hours || 0), 0);
      if (totalHours <= 0) {
        rowErrors.push('At least one week must have hours greater than 0');
      } else {
        // If hours > 0, customer rate must be > 0
        if (!allocation.customer_rate_per_hour || allocation.customer_rate_per_hour <= 0) {
          rowErrors.push('Customer rate must be greater than 0 when hours are allocated');
        }
      }

      if (rowErrors.length > 0) {
        validationErrors.push({
          row_index: i + 1,
          errors: rowErrors,
        });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. Please fix the errors below.',
        validation_errors: validationErrors,
      });
    }

    // Note: Customer rate validation is now per-row (checked above)
    // Global customer_rate_per_hour in project_setups is kept for backward compatibility and as default for new rows

    // Get project to get organization_id
    const { data: project, error: projectFetchError } = await supabase
      .from('projects')
      .select('organization_id, project_type')
      .eq('id', projectId)
      .single();

    if (projectFetchError || !project) {
      throw projectFetchError || new Error('Project not found');
    }

    // For Type B (planned) projects: Create project_members and timesheets from allocations
    if (project.project_type === 'planned') {
      // Get all validated allocations (they have user_id and role_id)
      // Use setup.allocations which we already fetched above
      const validatedAllocations = (setup.allocations || []).filter(
        (alloc: any) => alloc.user_id && alloc.role_id
      );

      if (validatedAllocations.length > 0) {
        // Create project_members for all users in allocations
        const memberInserts = validatedAllocations.map((alloc: any) => ({
          project_id: projectId,
          user_id: alloc.user_id,
          role_id: alloc.role_id,
          organization_id: project.organization_id,
        }));

        // Use upsert to avoid duplicates if members already exist
        const { error: membersError } = await supabase
          .from('project_members')
          .upsert(memberInserts, {
            onConflict: 'project_id,user_id',
            ignoreDuplicates: false,
          });

        if (membersError) {
          console.error('Error creating project members:', membersError);
          throw new Error(`Failed to create project members: ${membersError.message}`);
        }

        // Create timesheets for all users (one per user per project)
        const timesheetInserts = validatedAllocations.map((alloc: any) => ({
          project_id: projectId,
          user_id: alloc.user_id,
          status: 'DRAFT',
        }));

        // Use upsert to avoid duplicates
        const { error: timesheetsError } = await supabase
          .from('timesheets')
          .upsert(timesheetInserts, {
            onConflict: 'project_id,user_id',
            ignoreDuplicates: false,
          });

        if (timesheetsError) {
          console.error('Error creating timesheets:', timesheetsError);
          // Don't fail finalization if timesheet creation fails - log and continue
          console.warn('Continuing finalization despite timesheet creation errors');
        }
      }
    }

    // Update project status to finalized (setup_status is in projects table, not project_setups)
    const { error: updateError } = await supabase
      .from('projects')
      .update({ 
        setup_status: 'ready',
      })
      .eq('id', projectId);

    if (updateError) {
      throw updateError;
    }

    res.json({ 
      success: true, 
      message: 'Planning finalized successfully',
    });
  } catch (error: any) {
    console.error(`Error finalizing planning for project ${projectId}:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to finalize planning',
      error: error.message || 'Unknown error occurred',
      ...(process.env.NODE_ENV === 'development' && {
        details: error.details,
        hint: error.hint,
      }),
    });
  }
});

export default router;

