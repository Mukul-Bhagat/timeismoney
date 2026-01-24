import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string | null;
  timezone: string;
  iat?: number;
  exp?: number;
}

/**
 * POST /api/auth/login
 * Login with email and password, returns JWT token
 */
router.post('/login', async (req, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, role, organization_id, timezone, password_hash')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if user has password_hash (new JWT auth)
    if (!user.password_hash) {
      // User doesn't have password_hash - they need to reset password or have admin set it
      return res.status(401).json({
        success: false,
        message: 'Password not set. Please contact administrator to set your password.',
      });
    }

    // Verify password with bcrypt
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Determine primary role
    let primaryRole: string;
    if (user.role === 'SUPER_ADMIN') {
      primaryRole = 'SUPER_ADMIN';
    } else if (user.organization_id) {
      // Fetch roles from user_roles table
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select(`
          roles:role_id (
            name
          )
        `)
        .eq('user_id', user.id)
        .eq('organization_id', user.organization_id);

      if (!rolesError && userRoles && userRoles.length > 0) {
        const roles = (userRoles as any[])
          .map((ur: any) => ur.roles?.name)
          .filter((name): name is string => !!name);
        
        // Priority: ADMIN > MANAGER > EMPLOYEE
        if (roles.includes('ADMIN')) {
          primaryRole = 'ADMIN';
        } else if (roles.includes('MANAGER')) {
          primaryRole = 'MANAGER';
        } else if (roles.includes('EMPLOYEE')) {
          primaryRole = 'EMPLOYEE';
        } else {
          primaryRole = roles[0] || 'EMPLOYEE';
        }
      } else {
        // No roles found, default to EMPLOYEE
        primaryRole = 'EMPLOYEE';
      }
    } else {
      // No organization and not SUPER_ADMIN, default to EMPLOYEE
      primaryRole = 'EMPLOYEE';
    }

    // Create JWT payload
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
      });
    }

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: primaryRole,
      organizationId: user.organization_id,
      timezone: user.timezone || 'Asia/Kolkata',
    };

    // Sign JWT with 24h expiry
    const token = jwt.sign(payload, jwtSecret, {
      expiresIn: '24h',
    });

    // Return token and user info
    console.log('Login successful for:', email, 'Role:', primaryRole);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: primaryRole,
        organizationId: user.organization_id,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

export default router;

