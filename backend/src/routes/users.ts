import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { verifyAuth, requireRole, AuthRequest } from '../middleware/auth';
import { getCurrentUTC } from '../utils/timezone';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const router = Router();

/**
 * Helper function to validate email format
 */
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Helper function to generate random 6-character password
 */
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Helper function to get EMPLOYEE role ID for an organization
 */
async function getEmployeeRoleId(organizationId: string): Promise<string | null> {
  const { data: employeeRole, error } = await supabase
    .from('roles')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('name', 'EMPLOYEE')
    .eq('is_system', true)
    .single();

  if (error || !employeeRole) {
    return null;
  }

  return employeeRole.id;
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
 * Helper function to get organization ID for the request
 * SUPER_ADMIN can specify organization_id in query/body, ADMIN uses their own
 */
async function getOrganizationId(req: AuthRequest, queryOrgId?: string): Promise<string | null> {
  if (!req.user) {
    return null;
  }

  const isSuper = await isSuperAdmin(req.user.id);
  
  if (isSuper) {
    // SUPER_ADMIN can specify organization_id
    return queryOrgId || req.user.organization_id || null;
  } else {
    // ADMIN can only use their own organization
    return req.user.organization_id || null;
  }
}

/**
 * POST /api/users
 * Create a single user with automatic EMPLOYEE role assignment
 */
router.post(
  '/',
  verifyAuth,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { email, phone, password, organization_id } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: email, password',
        });
      }

      // Validate email format
      if (!validateEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
        });
      }

      // Validate password length
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters',
        });
      }

      // Get organization ID
      const organizationId = await getOrganizationId(req, organization_id);
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required',
        });
      }

      // Check for duplicate email in organization
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id, email, organization_id')
        .eq('email', email)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (checkError) {
        throw checkError;
      }

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists in this organization',
        });
      }

      // Hash password with bcrypt
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Generate UUID for user
      const userId = randomUUID();

      // Create user in Supabase Auth (for migration compatibility - can be removed later)
      // This allows existing integrations to continue working during migration
      let authUserId = userId;
      try {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (!authError && authData?.user) {
          authUserId = authData.user.id;
        }
        // If Supabase Auth creation fails, continue with our own UUID
      } catch (error) {
        console.warn('Supabase Auth user creation failed, using generated UUID:', error);
        // Continue with generated UUID
      }

      // Insert user into users table with password_hash
      const { error: userError } = await supabase.from('users').insert({
        id: authUserId,
        email,
        phone: phone || null,
        role: null, // Org users don't have role in users table
        organization_id: organizationId,
        timezone: 'Asia/Kolkata', // Default timezone
        password_hash: passwordHash,
        created_at: getCurrentUTC().toISOString(),
        updated_at: getCurrentUTC().toISOString(),
      });

      if (userError) {
        // Rollback: delete auth user if profile creation fails
        if (authUserId !== userId) {
          try {
            await supabase.auth.admin.deleteUser(authUserId);
          } catch (error) {
            console.error('Failed to rollback auth user:', error);
          }
        }
        throw userError;
      }

      // Get EMPLOYEE role ID for organization
      const employeeRoleId = await getEmployeeRoleId(organizationId);
      if (!employeeRoleId) {
        // Rollback: delete auth user and user profile
        if (authUserId !== userId) {
          try {
            await supabase.auth.admin.deleteUser(authUserId);
          } catch (error) {
            console.error('Failed to rollback auth user:', error);
          }
        }
        await supabase.from('users').delete().eq('id', authUserId);
        return res.status(500).json({
          success: false,
          message: 'Failed to find EMPLOYEE role for organization',
        });
      }

      // Assign EMPLOYEE role to user
      const { error: userRoleError } = await supabase.from('user_roles').insert({
        user_id: authUserId,
        role_id: employeeRoleId,
        organization_id: organizationId,
        created_at: getCurrentUTC().toISOString(),
      });

      if (userRoleError) {
        // Rollback: delete auth user and user profile
        if (authUserId !== userId) {
          try {
            await supabase.auth.admin.deleteUser(authUserId);
          } catch (error) {
            console.error('Failed to rollback auth user:', error);
          }
        }
        await supabase.from('users').delete().eq('id', authUserId);
        throw userRoleError;
      }

      // Fetch created user with roles
      const { data: createdUser, error: fetchError } = await supabase
        .from('users')
        .select(`
          id,
          email,
          phone,
          timezone,
          organization_id,
          created_at,
          user_roles:user_roles (
            roles:role_id (
              name
            )
          )
        `)
        .eq('id', authUserId)
        .single();

      if (fetchError) {
        // User was created successfully, just return basic info
        return res.status(201).json({
          success: true,
          message: 'User created successfully',
          user: {
            id: authUserId,
            email,
            phone: phone || null,
            timezone: 'Asia/Kolkata',
            organization_id: organizationId,
          },
        });
      }

      // Transform roles
      const roles = (createdUser.user_roles as any[])?.map((ur: any) => ur.roles?.name).filter(Boolean) || [];

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: {
          id: createdUser.id,
          email: createdUser.email,
          phone: createdUser.phone,
          timezone: createdUser.timezone,
          organization_id: createdUser.organization_id,
          created_at: createdUser.created_at,
          roles,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to create user',
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/users/bulk
 * Bulk import users from CSV with automatic EMPLOYEE role assignment
 */
router.post(
  '/bulk',
  verifyAuth,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { csvData, passwordOption, sharedPassword, organization_id } = req.body;

      if (!csvData || !passwordOption) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: csvData, passwordOption',
        });
      }

      if (passwordOption === 'shared' && !sharedPassword) {
        return res.status(400).json({
          success: false,
          message: 'sharedPassword is required when passwordOption is "shared"',
        });
      }

      if (passwordOption === 'shared' && sharedPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Shared password must be at least 6 characters',
        });
      }

      // Get organization ID
      const organizationId = await getOrganizationId(req, organization_id);
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required',
        });
      }

      // Get EMPLOYEE role ID once
      const employeeRoleId = await getEmployeeRoleId(organizationId);
      if (!employeeRoleId) {
        return res.status(500).json({
          success: false,
          message: 'Failed to find EMPLOYEE role for organization',
        });
      }

      // Parse CSV
      const lines = csvData.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const emailIndex = headers.indexOf('email');
      const phoneIndex = headers.indexOf('phone');

      if (emailIndex === -1) {
        return res.status(400).json({
          success: false,
          message: 'CSV must contain an "email" column',
        });
      }

      const results = {
        created: 0,
        skipped: 0,
        failed: [] as Array<{ email: string; error: string }>,
      };

      // Process each row
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].trim();
        if (!row) continue;

        const values = row.split(',').map(v => v.trim());
        const email = values[emailIndex];
        const phone = phoneIndex >= 0 ? values[phoneIndex] : undefined;

        // Validate email
        if (!email || !validateEmail(email)) {
          results.failed.push({
            email: email || 'unknown',
            error: 'Invalid email format',
          });
          continue;
        }

        // Check if user already exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (existingUser) {
          results.skipped++;
          continue;
        }

        // Generate or use shared password
        const password = passwordOption === 'auto' ? generateRandomPassword() : sharedPassword;

        try {
          // Hash password with bcrypt
          const saltRounds = 10;
          const passwordHash = await bcrypt.hash(password, saltRounds);

          // Generate UUID for user
          const userId = randomUUID();

          // Create user in Supabase Auth (for migration compatibility)
          let authUserId = userId;
          try {
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
            });

            if (!authError && authData?.user) {
              authUserId = authData.user.id;
            }
          } catch (error) {
            console.warn('Supabase Auth user creation failed, using generated UUID:', error);
          }

          // Insert user into users table with password_hash
          const { error: userError } = await supabase.from('users').insert({
            id: authUserId,
            email,
            phone: phone || null,
            role: null,
            organization_id: organizationId,
            timezone: 'Asia/Kolkata',
            password_hash: passwordHash,
            created_at: getCurrentUTC().toISOString(),
            updated_at: getCurrentUTC().toISOString(),
          });

          if (userError) {
            // Rollback: delete auth user
            if (authUserId !== userId) {
              try {
                await supabase.auth.admin.deleteUser(authUserId);
              } catch (error) {
                console.error('Failed to rollback auth user:', error);
              }
            }
            results.failed.push({
              email,
              error: userError.message,
            });
            continue;
          }

          // Assign EMPLOYEE role
          const { error: userRoleError } = await supabase.from('user_roles').insert({
            user_id: authUserId,
            role_id: employeeRoleId,
            organization_id: organizationId,
            created_at: getCurrentUTC().toISOString(),
          });

          if (userRoleError) {
            // Rollback: delete auth user and user profile
            if (authUserId !== userId) {
              try {
                await supabase.auth.admin.deleteUser(authUserId);
              } catch (error) {
                console.error('Failed to rollback auth user:', error);
              }
            }
            await supabase.from('users').delete().eq('id', authUserId);
            results.failed.push({
              email,
              error: userRoleError.message,
            });
            continue;
          }

          results.created++;
        } catch (error: any) {
          results.failed.push({
            email,
            error: error.message || 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        message: 'Bulk import completed',
        summary: results,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to process bulk import',
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/users
 * List all users in the organization
 */
router.get(
  '/',
  verifyAuth,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      // Get organization ID
      const organizationId = await getOrganizationId(req, req.query.organization_id as string);
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required',
        });
      }

      // Fetch users with their roles
      const { data: users, error } = await supabase
        .from('users')
        .select(`
          id,
          email,
          phone,
          timezone,
          organization_id,
          rate_per_hour,
          created_at,
          user_roles:user_roles (
            roles:role_id (
              name
            )
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Transform users to include roles array
      const transformedUsers = (users || []).map((user: any) => {
        const roles = (user.user_roles || [])
          .map((ur: any) => ur.roles?.name)
          .filter(Boolean);

        return {
          id: user.id,
          email: user.email,
          phone: user.phone || null,
          timezone: user.timezone,
          organization_id: user.organization_id,
          rate_per_hour: user.rate_per_hour,
          created_at: user.created_at,
          roles,
          status: 'Active', // All users in the list are active (they exist in auth)
        };
      });

      res.json({
        success: true,
        users: transformedUsers,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/users/managers
 * Get all users with MANAGER role for PM selection
 */
router.get('/managers', verifyAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Get organization ID
    const isSuper = await isSuperAdmin(req.user.id);
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
    }

    // Get MANAGER role for organization
    const { data: managerRole, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('name', 'MANAGER')
      .eq('is_system', true)
      .single();

    if (roleError || !managerRole) {
      // No MANAGER role exists, return empty array
      return res.json({
        success: true,
        managers: [],
      });
    }

    // Get users with MANAGER role
    const { data: userRoles, error: userRolesError } = await supabase
      .from('user_roles')
      .select('user_id, users:user_id(id, email)')
      .eq('role_id', managerRole.id);

    if (userRolesError) {
      throw userRolesError;
    }

    const managers = userRoles?.map((ur: any) => ur.users).filter(Boolean) || [];

    res.json({
      success: true,
      managers,
    });
  } catch (error: any) {
    console.error('Error fetching managers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch managers',
      error: error.message,
    });
  }
});

/**
 * PUT /api/users/:id/rate
 * Update hourly rate for a user
 */
router.put('/:id/rate', verifyAuth, requireRole('SUPER_ADMIN', 'ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { id } = req.params;
    const { rate_per_hour } = req.body;

    // Validate input
    if (rate_per_hour !== undefined && (rate_per_hour < 0 || isNaN(rate_per_hour))) {
      return res.status(400).json({
        success: false,
        message: 'rate_per_hour must be a non-negative number',
      });
    }

    // Fetch user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, organization_id')
      .eq('id', id)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check permissions: SUPER_ADMIN or ADMIN of same organization
    const isSuper = await isSuperAdmin(req.user.id);
    if (!isSuper && req.user.organization_id !== user.organization_id) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    // Update rate (allow null to clear)
    const updateData: any = {};
    if (rate_per_hour === null || rate_per_hour === undefined) {
      updateData.rate_per_hour = null;
    } else {
      updateData.rate_per_hour = Number(rate_per_hour);
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, email, rate_per_hour')
      .single();

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'User rate updated successfully',
      user: updatedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to update user rate',
      error: error.message,
    });
  }
});

export default router;

