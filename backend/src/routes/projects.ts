import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { verifyAuth, requireRole, AuthRequest } from '../middleware/auth';
import { getCurrentUTC } from '../utils/timezone';

const router = Router();

/**
 * Helper function to check if user has ADMIN role in organization
 */
async function userHasAdminRole(userId: string, organizationId: string): Promise<boolean> {
  const { data: adminRole, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('name', 'ADMIN')
    .eq('is_system', true)
    .single();

  if (roleError || !adminRole) {
    return false;
  }

  const { data: userRole, error: userRoleError } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role_id', adminRole.id)
    .single();

  return !userRoleError && !!userRole;
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
 * Helper function to check if user can manage organization
 */
async function canManageOrganization(userId: string, organizationId: string): Promise<boolean> {
  const isSuper = await isSuperAdmin(userId);
  if (isSuper) {
    return true;
  }

  return await userHasAdminRole(userId, organizationId);
}

/**
 * Helper function to get organization ID for the request
 */
async function getOrganizationId(req: AuthRequest, queryOrgId?: string): Promise<string | null> {
  if (!req.user) {
    return null;
  }

  const isSuper = await isSuperAdmin(req.user.id);
  
  if (isSuper) {
    return queryOrgId || req.user.organization_id || null;
  } else {
    return req.user.organization_id || null;
  }
}

/**
 * GET /api/projects
 * List all projects for user's organization
 */
router.get('/', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Check if user has ADMIN or SUPER_ADMIN role
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && !(await userHasAdminRole(req.user.id, req.user.organization_id || ''))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. ADMIN role required.',
      });
    }

    // Get organization ID
    let organizationId: string;
    if (isSuper) {
      organizationId = (req.query.organization_id as string) || req.user.organization_id || '';
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'organization_id required for SUPER_ADMIN',
        });
      }
    } else {
      organizationId = req.user.organization_id || '';
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'User must belong to an organization',
        });
      }
    }

    // Fetch projects with member counts
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, organization_id, title, description, start_date, end_date, status, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (projectsError) {
      throw projectsError;
    }

    // Get member count for each project
    const projectsWithCounts = await Promise.all(
      (projects || []).map(async (project) => {
        const { count, error: countError } = await supabase
          .from('project_members')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project.id);

        if (countError) {
          console.error('Error counting members for project:', countError);
        }

        return {
          ...project,
          member_count: count || 0,
        };
      })
    );

    res.json({
      success: true,
      projects: projectsWithCounts,
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
 * GET /api/projects/:id
 * Get project details with members
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

    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check permissions
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && !(await userHasAdminRole(req.user.id, project.organization_id))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Fetch project members with user and role details
    const { data: members, error: membersError } = await supabase
      .from('project_members')
      .select(`
        id,
        project_id,
        user_id,
        role_id,
        organization_id,
        assigned_at,
        users:user_id (
          id,
          email
        ),
        roles:role_id (
          id,
          name
        )
      `)
      .eq('project_id', id);

    if (membersError) {
      throw membersError;
    }

    // Format members data
    const formattedMembers = (members || []).map((member: any) => ({
      id: member.id,
      project_id: member.project_id,
      user_id: member.user_id,
      role_id: member.role_id,
      organization_id: member.organization_id,
      assigned_at: member.assigned_at,
      user: {
        id: member.users?.id,
        email: member.users?.email,
      },
      role: {
        id: member.roles?.id,
        name: member.roles?.name,
      },
    }));

    res.json({
      success: true,
      project: {
        ...project,
        members: formattedMembers,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project',
      error: error.message,
    });
  }
});

/**
 * POST /api/projects
 * Create project with members (transactional)
 */
router.post('/', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { title, description, start_date, end_date, status = 'active', members, organization_id } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Project title is required',
      });
    }

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before or equal to end date',
      });
    }

    // Validate members
    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one project member is required',
      });
    }

    // Get organization ID
    let organizationId: string;
    const isSuper = await isSuperAdmin(req.user.id);
    
    if (isSuper) {
      organizationId = organization_id || req.user.organization_id || '';
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'organization_id required for SUPER_ADMIN',
        });
      }
    } else {
      organizationId = req.user.organization_id || '';
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'User must belong to an organization',
        });
      }
    }

    // Check permissions
    if (!(await canManageOrganization(req.user.id, organizationId))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. ADMIN role required.',
      });
    }

    // Validate all members belong to the same organization
    for (const member of members) {
      if (!member.user_id || !member.role_id) {
        return res.status(400).json({
          success: false,
          message: 'Each member must have user_id and role_id',
        });
      }

      // Verify user belongs to organization
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', member.user_id)
        .single();

      if (userError || !user || user.organization_id !== organizationId) {
        return res.status(400).json({
          success: false,
          message: `User ${member.user_id} does not belong to this organization`,
        });
      }

      // Verify role belongs to organization
      const { data: role, error: roleError } = await supabase
        .from('roles')
        .select('organization_id')
        .eq('id', member.role_id)
        .single();

      if (roleError || !role || role.organization_id !== organizationId) {
        return res.status(400).json({
          success: false,
          message: `Role ${member.role_id} does not belong to this organization`,
        });
      }
    }

    // Create project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        organization_id: organizationId,
        title: title.trim(),
        description: description?.trim() || null,
        start_date: start_date,
        end_date: end_date,
        status: status,
        created_at: getCurrentUTC().toISOString(),
      })
      .select()
      .single();

    if (projectError || !project) {
      throw projectError || new Error('Failed to create project');
    }

    // Insert project members
    const memberInserts = members.map((member: any) => ({
      project_id: project.id,
      user_id: member.user_id,
      role_id: member.role_id,
      organization_id: organizationId,
      assigned_at: getCurrentUTC().toISOString(),
    }));

    const { data: insertedMembers, error: membersError } = await supabase
      .from('project_members')
      .insert(memberInserts)
      .select();

    if (membersError || !insertedMembers) {
      // Rollback: Delete the project if member insertion fails
      await supabase.from('projects').delete().eq('id', project.id);
      
      throw membersError || new Error('Failed to assign project members');
    }

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: {
        ...project,
        member_count: insertedMembers.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to create project',
      error: error.message,
    });
  }
});

/**
 * PUT /api/projects/:id
 * Update project and members
 */
router.put('/:id', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;
    const { title, description, start_date, end_date, status, members } = req.body;

    // Fetch existing project
    const { data: existingProject, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingProject) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check permissions
    if (!(await canManageOrganization(req.user.id, existingProject.organization_id))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. ADMIN role required.',
      });
    }

    // Build update object
    const updateData: any = {};

    if (title !== undefined) {
      if (!title || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Project title cannot be empty',
        });
      }
      updateData.title = title.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (start_date !== undefined) {
      updateData.start_date = start_date;
    }

    if (end_date !== undefined) {
      updateData.end_date = end_date;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    // Validate dates if both are provided
    if (updateData.start_date && updateData.end_date) {
      const startDate = new Date(updateData.start_date);
      const endDate = new Date(updateData.end_date);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format',
        });
      }

      if (startDate > endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date must be before or equal to end date',
        });
      }
    }

    // Update project if there are changes
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }
    }

    // Update members if provided
    if (members !== undefined) {
      if (!Array.isArray(members)) {
        return res.status(400).json({
          success: false,
          message: 'Members must be an array',
        });
      }

      // Validate all members belong to the same organization
      for (const member of members) {
        if (!member.user_id || !member.role_id) {
          return res.status(400).json({
            success: false,
            message: 'Each member must have user_id and role_id',
          });
        }

        // Verify user belongs to organization
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', member.user_id)
          .single();

        if (userError || !user || user.organization_id !== existingProject.organization_id) {
          return res.status(400).json({
            success: false,
            message: `User ${member.user_id} does not belong to this organization`,
          });
        }

        // Verify role belongs to organization
        const { data: role, error: roleError } = await supabase
          .from('roles')
          .select('organization_id')
          .eq('id', member.role_id)
          .single();

        if (roleError || !role || role.organization_id !== existingProject.organization_id) {
          return res.status(400).json({
            success: false,
            message: `Role ${member.role_id} does not belong to this organization`,
          });
        }
      }

      // Delete all existing members
      const { error: deleteError } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', id);

      if (deleteError) {
        throw deleteError;
      }

      // Insert new members
      if (members.length > 0) {
        const memberInserts = members.map((member: any) => ({
          project_id: id,
          user_id: member.user_id,
          role_id: member.role_id,
          organization_id: existingProject.organization_id,
          assigned_at: getCurrentUTC().toISOString(),
        }));

        const { error: insertError } = await supabase
          .from('project_members')
          .insert(memberInserts);

        if (insertError) {
          throw insertError;
        }
      }
    }

    // Fetch updated project
    const { data: updatedProject, error: fetchUpdatedError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchUpdatedError || !updatedProject) {
      throw fetchUpdatedError || new Error('Failed to fetch updated project');
    }

    res.json({
      success: true,
      message: 'Project updated successfully',
      project: updatedProject,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to update project',
      error: error.message,
    });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete project (cascades to project_members)
 */
router.delete('/:id', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;

    // Fetch project
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check permissions
    if (!(await canManageOrganization(req.user.id, project.organization_id))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. ADMIN role required.',
      });
    }

    // Delete project (cascades to project_members via foreign key)
    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete project',
      error: error.message,
    });
  }
});

export default router;

