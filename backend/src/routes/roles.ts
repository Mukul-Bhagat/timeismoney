import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { verifyAuth, requireRole, AuthRequest } from '../middleware/auth';
import { getCurrentUTC } from '../utils/timezone';

const router = Router();

/**
 * Helper function to check if user has ADMIN role in organization
 */
async function userHasAdminRole(userId: string, organizationId: string): Promise<boolean> {
  // Get ADMIN role for organization
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

  // Check if user has this role
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
 * GET /api/roles
 * List all roles for user's organization
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
      // For SUPER_ADMIN, organization_id might be in query params for viewing specific org
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

    // Fetch roles with user counts
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('id, name, is_system, created_at')
      .eq('organization_id', organizationId)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });

    if (rolesError) {
      throw rolesError;
    }

    // Get user count for each role
    const rolesWithCounts = await Promise.all(
      (roles || []).map(async (role) => {
        const { count, error: countError } = await supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('role_id', role.id);

        if (countError) {
          console.error('Error counting users for role:', countError);
        }

        return {
          id: role.id,
          name: role.name,
          is_system: role.is_system,
          user_count: count || 0,
          created_at: role.created_at,
        };
      })
    );

    res.json({
      success: true,
      roles: rolesWithCounts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: error.message,
    });
  }
});

/**
 * POST /api/roles
 * Create new custom role
 */
router.post('/', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { name, organization_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Role name is required',
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

    // Check if role name already exists in organization
    const { data: existingRole } = await supabase
      .from('roles')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('name', name.trim())
      .single();

    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Role with this name already exists in this organization',
      });
    }

    // Create role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        is_system: false,
        created_at: getCurrentUTC().toISOString(),
      })
      .select()
      .single();

    if (roleError || !role) {
      throw roleError || new Error('Failed to create role');
    }

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      role: {
        id: role.id,
        name: role.name,
        is_system: role.is_system,
        user_count: 0,
        created_at: role.created_at,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to create role',
      error: error.message,
    });
  }
});

/**
 * GET /api/roles/:id
 * Get role details with user count
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

    // Fetch role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name, is_system, organization_id, created_at')
      .eq('id', id)
      .single();

    if (roleError || !role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    // Check permissions
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && !(await canManageOrganization(req.user.id, role.organization_id))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Get user count
    const { count, error: countError } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true })
      .eq('role_id', id);

    if (countError) {
      console.error('Error counting users:', countError);
    }

    res.json({
      success: true,
      role: {
        id: role.id,
        name: role.name,
        is_system: role.is_system,
        organization_id: role.organization_id,
        user_count: count || 0,
        created_at: role.created_at,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role',
      error: error.message,
    });
  }
});

/**
 * DELETE /api/roles/:id
 * Delete custom role (prevent system role deletion)
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

    // Fetch role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name, is_system, organization_id')
      .eq('id', id)
      .single();

    if (roleError || !role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    // Prevent deletion of system roles
    if (role.is_system) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete system roles (ADMIN, MANAGER, EMPLOYEE)',
      });
    }

    // Check permissions
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && !(await canManageOrganization(req.user.id, role.organization_id))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Delete role (cascade will delete user_roles)
    const { error: deleteError } = await supabase
      .from('roles')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    res.json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete role',
      error: error.message,
    });
  }
});

/**
 * GET /api/roles/:id/users
 * Get users in a role
 */
router.get('/:id/users', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;

    // Fetch role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name, organization_id')
      .eq('id', id)
      .single();

    if (roleError || !role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    // Check permissions
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && !(await canManageOrganization(req.user.id, role.organization_id))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Fetch users in this role
    const { data: userRoles, error: userRolesError } = await supabase
      .from('user_roles')
      .select(`
        id,
        user_id,
        created_at,
        users:user_id (
          id,
          email
        )
      `)
      .eq('role_id', id)
      .order('created_at', { ascending: false });

    if (userRolesError) {
      throw userRolesError;
    }

    // Transform data
    const users = (userRoles || []).map((ur: any) => ({
      id: ur.user_id,
      email: ur.users?.email || '',
      assigned_at: ur.created_at,
    }));

    res.json({
      success: true,
      users,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users in role',
      error: error.message,
    });
  }
});

/**
 * POST /api/roles/:id/users
 * Add users to role (bulk support)
 */
router.post('/:id/users', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;
    const { user_ids } = req.body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'user_ids array is required',
      });
    }

    // Fetch role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name, organization_id')
      .eq('id', id)
      .single();

    if (roleError || !role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    // Check permissions
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && !(await canManageOrganization(req.user.id, role.organization_id))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Verify all users belong to the same organization
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, organization_id')
      .in('id', user_ids);

    if (usersError) {
      throw usersError;
    }

    const invalidUsers = (users || []).filter(
      (u) => u.organization_id !== role.organization_id
    );

    if (invalidUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'All users must belong to the same organization as the role',
      });
    }

    // Check for existing assignments
    const { data: existingAssignments } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_id', id)
      .in('user_id', user_ids);

    const existingUserIds = (existingAssignments || []).map((ea) => ea.user_id);
    const newUserIds = user_ids.filter((uid: string) => !existingUserIds.includes(uid));

    if (newUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All selected users are already assigned to this role',
      });
    }

    // Create user_roles entries
    const userRolesToInsert = newUserIds.map((userId: string) => ({
      user_id: userId,
      role_id: id,
      organization_id: role.organization_id,
      created_at: getCurrentUTC().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('user_roles')
      .insert(userRolesToInsert);

    if (insertError) {
      throw insertError;
    }

    res.status(201).json({
      success: true,
      message: `Successfully assigned ${newUserIds.length} user(s) to role`,
      assigned_count: newUserIds.length,
      skipped_count: existingUserIds.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to add users to role',
      error: error.message,
    });
  }
});

/**
 * DELETE /api/roles/:id/users/:userId
 * Remove user from role (prevent removing last ADMIN)
 */
router.delete('/:id/users/:userId', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id, userId } = req.params;

    // Fetch role
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, name, organization_id, is_system')
      .eq('id', id)
      .single();

    if (roleError || !role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    // Check permissions
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && !(await canManageOrganization(req.user.id, role.organization_id))) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // If removing from ADMIN role, check if this is the last ADMIN
    if (role.name === 'ADMIN' && role.is_system) {
      const { count, error: countError } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('role_id', id);

      if (countError) {
        throw countError;
      }

      if ((count || 0) <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot remove the last ADMIN from the ADMIN role',
        });
      }
    }

    // Remove user from role
    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('role_id', id)
      .eq('user_id', userId);

    if (deleteError) {
      throw deleteError;
    }

    res.json({
      success: true,
      message: 'User removed from role successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove user from role',
      error: error.message,
    });
  }
});

export default router;

