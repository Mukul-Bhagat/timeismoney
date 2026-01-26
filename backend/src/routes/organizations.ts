import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { verifyAuth, requireRole, AuthRequest } from '../middleware/auth';
import { getCurrentUTC } from '../utils/timezone';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const router = Router();

/**
 * GET /api/organizations
 * List all organizations (Super Admin only)
 */
router.get(
  '/',
  verifyAuth,
  requireRole('SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      // Get all organizations
      const { data: organizations, error } = await supabase
        .from('organizations')
        .select('id, name, timezone, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Get admin users for each organization (from user_roles table)
      const transformed = await Promise.all(
        (organizations || []).map(async (org) => {
          // Get ADMIN role for this organization
          const { data: adminRole } = await supabase
            .from('roles')
            .select('id')
            .eq('organization_id', org.id)
            .eq('name', 'ADMIN')
            .eq('is_system', true)
            .single();

          let adminEmail = 'N/A';
          if (adminRole) {
            // Get first user with ADMIN role
            const { data: adminUserRole } = await supabase
              .from('user_roles')
              .select(`
                users:user_id (
                  email
                )
              `)
              .eq('role_id', adminRole.id)
              .limit(1)
              .maybeSingle();

            if (adminUserRole && (adminUserRole as any).users) {
              adminEmail = (adminUserRole as any).users.email;
            }
          }

          return {
            id: org.id,
            name: org.name,
            admin_email: adminEmail,
            status: 'Active', // Default status for now
            created_at: org.created_at,
          };
        })
      );

      res.json(transformed);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch organizations',
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/organizations
 * Create a new organization with admin user (Super Admin only)
 */
router.post(
  '/',
  verifyAuth,
  requireRole('SUPER_ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, adminEmail, adminPassword, timezone = 'Asia/Kolkata' } = req.body;

      if (!name || !adminEmail || !adminPassword) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: name, adminEmail, adminPassword',
        });
      }

      // Validate password length
      if (adminPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters',
        });
      }

      // Check if admin email already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', adminEmail)
        .single();

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Admin email already exists',
        });
      }

      // Create organization first
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name,
          timezone,
          currency_code: 'INR',
          currency_symbol: '₹',
          created_at: getCurrentUTC().toISOString(),
          updated_at: getCurrentUTC().toISOString(),
        })
        .select()
        .single();

      if (orgError || !organization) {
        throw orgError || new Error('Failed to create organization');
      }

      // Hash password with bcrypt
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

      // Generate UUID for user
      const userId = randomUUID();

      // Create admin user in Supabase Auth (for migration compatibility)
      let authUserId = userId;
      try {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: adminEmail,
          password: adminPassword,
          email_confirm: true,
        });

        if (!authError && authData?.user) {
          authUserId = authData.user.id as `${string}-${string}-${string}-${string}-${string}`;
        }
      } catch (error) {
        console.warn('Supabase Auth user creation failed, using generated UUID:', error);
      }

      // Create user profile in users table with password_hash
      // Note: role is set to null for org users (only SUPER_ADMIN has role set)
      const { error: userError } = await supabase.from('users').insert({
        id: authUserId,
        email: adminEmail,
        role: null, // Org users don't have role in users table anymore
        organization_id: organization.id,
        password_hash: passwordHash,
        timezone: timezone,
        created_at: getCurrentUTC().toISOString(),
        updated_at: getCurrentUTC().toISOString(),
      });

      if (userError) {
        // Rollback: delete auth user and organization
        if (authUserId !== userId) {
          try {
            await supabase.auth.admin.deleteUser(authUserId);
          } catch (error) {
            console.error('Failed to rollback auth user:', error);
          }
        }
        await supabase.from('organizations').delete().eq('id', organization.id);
        throw userError;
      }

      // System roles are auto-created by trigger, now assign admin user to ADMIN role
      // Get the ADMIN role for this organization
      const { data: adminRole, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('name', 'ADMIN')
        .eq('is_system', true)
        .single();

      if (roleError || !adminRole) {
        // Rollback: delete auth user and organization
        if (authUserId !== userId) {
          try {
            await supabase.auth.admin.deleteUser(authUserId);
          } catch (error) {
            console.error('Failed to rollback auth user:', error);
          }
        }
        await supabase.from('users').delete().eq('id', authUserId);
        await supabase.from('organizations').delete().eq('id', organization.id);
        throw roleError || new Error('Failed to find ADMIN role for organization');
      }

      // Assign admin user to ADMIN role
      const { error: userRoleError } = await supabase.from('user_roles').insert({
        user_id: authUserId,
        role_id: adminRole.id,
        organization_id: organization.id,
        created_at: getCurrentUTC().toISOString(),
      });

      if (userRoleError) {
        // Rollback: delete auth user and organization
        if (authUserId !== userId) {
          try {
            await supabase.auth.admin.deleteUser(authUserId);
          } catch (error) {
            console.error('Failed to rollback auth user:', error);
          }
        }
        await supabase.from('users').delete().eq('id', authUserId);
        await supabase.from('organizations').delete().eq('id', organization.id);
        throw userRoleError;
      }

      res.status(201).json({
        success: true,
        message: 'Organization created successfully',
        organization: {
          id: organization.id,
          name: organization.name,
          timezone: organization.timezone,
          created_at: organization.created_at,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to create organization',
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/organizations/:id
 * Get organization details
 */
router.get(
  '/:id',
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Super admin can access any organization
      // Others can only access their own organization
      const { data: organization, error } = await supabase
        .from('organizations')
        .select('id, name, timezone, currency_code, currency_symbol, created_at, updated_at')
        .eq('id', id)
        .single();

      if (error || !organization) {
        return res.status(404).json({
          success: false,
          message: 'Organization not found',
        });
      }

      // Check access: Super admin or user belongs to this organization
      if (req.user?.role !== 'SUPER_ADMIN' && req.user?.organization_id !== id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      res.json(organization);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch organization',
        error: error.message,
      });
    }
  }
);

/**
 * PUT /api/organizations/:id/currency
 * Update organization currency (SUPER_ADMIN or ADMIN for their org)
 */
router.put(
  '/:id/currency',
  verifyAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const { id } = req.params;
      const { currency_code, currency_symbol } = req.body;

      // Validate input
      if (!currency_code || !currency_symbol) {
        return res.status(400).json({
          success: false,
          message: 'currency_code and currency_symbol are required',
        });
      }

      // Validate currency code (allowed list)
      const allowedCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY'];
      if (!allowedCurrencies.includes(currency_code.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: `Invalid currency code. Allowed: ${allowedCurrencies.join(', ')}`,
        });
      }

      // Get organization
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', id)
        .single();

      if (orgError || !organization) {
        return res.status(404).json({
          success: false,
          message: 'Organization not found',
        });
      }

      // Check permissions: SUPER_ADMIN or ADMIN of this organization
      const isSuper = req.user.role === 'SUPER_ADMIN';
      if (!isSuper && req.user.organization_id !== id) {
        // Check if user has ADMIN role in this organization
        const { data: adminRole } = await supabase
          .from('roles')
          .select('id')
          .eq('organization_id', id)
          .eq('name', 'ADMIN')
          .eq('is_system', true)
          .single();

        if (adminRole) {
          const { data: userRole } = await supabase
            .from('user_roles')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('role_id', adminRole.id)
            .single();

          if (!userRole) {
            return res.status(403).json({
              success: false,
              message: 'Insufficient permissions. SUPER_ADMIN or ADMIN role required.',
            });
          }
        } else {
          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions. SUPER_ADMIN or ADMIN role required.',
          });
        }
      }

      // Update currency
      const { data: updatedOrg, error: updateError } = await supabase
        .from('organizations')
        .update({
          currency_code: currency_code.toUpperCase(),
          currency_symbol: currency_symbol,
          updated_at: getCurrentUTC().toISOString(),
        })
        .eq('id', id)
        .select('id, name, currency_code, currency_symbol')
        .single();

      if (updateError) {
        throw updateError;
      }

      res.json({
        success: true,
        message: 'Currency updated successfully',
        organization: updatedOrg,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to update currency',
        error: error.message,
      });
    }
  }
);

export default router;

