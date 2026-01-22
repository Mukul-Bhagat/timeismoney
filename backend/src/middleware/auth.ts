import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string | null; // Only for SUPER_ADMIN, null for org users
    roles: string[]; // Organization roles from user_roles table
    organization_id: string | null;
  };
}

/**
 * Middleware to verify JWT token and extract user information
 */
export async function verifyAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Fetch user profile from users table
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, email, role, organization_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({
        success: false,
        message: 'User profile not found',
      });
    }

    // For SUPER_ADMIN, use role from users table
    // For org users, fetch roles from user_roles table
    let roles: string[] = [];
    if (profile.role === 'SUPER_ADMIN') {
      roles = ['SUPER_ADMIN'];
    } else if (profile.organization_id) {
      // Fetch organization roles from user_roles table
      const { data: userRoles, error: userRolesError } = await supabase
        .from('user_roles')
        .select(`
          roles:role_id (
            name
          )
        `)
        .eq('user_id', profile.id)
        .eq('organization_id', profile.organization_id);

      if (!userRolesError && userRoles) {
        roles = (userRoles as any[])
          .map((ur: any) => ur.roles?.name)
          .filter((name): name is string => !!name);
      }
    }

    // Attach user info to request
    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role, // Keep for backward compatibility, null for org users
      roles, // Array of role names
      organization_id: profile.organization_id,
    };

    next();
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message,
    });
  }
}

/**
 * Middleware to check if user has required role
 * Works with both SUPER_ADMIN (from users.role) and org roles (from user_roles)
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Check if user has any of the allowed roles
    const hasRole = 
      (req.user.role && allowedRoles.includes(req.user.role)) ||
      req.user.roles.some(role => allowedRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    next();
  };
}

