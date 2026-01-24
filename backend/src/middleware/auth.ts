import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string | null; // Only for SUPER_ADMIN, null for org users
    roles: string[]; // Organization roles from user_roles table (for backward compatibility)
    organization_id: string | null;
    userId?: string; // JWT payload userId
    organizationId?: string | null; // JWT payload organizationId
    timezone?: string; // JWT payload timezone
  };
}

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

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
      });
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired',
        });
      } else if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Token verification failed',
      });
    }

    // Attach user info to request from JWT payload
    // Keep backward compatibility with existing interface
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : null, // Keep for backward compatibility
      roles: [decoded.role], // Array for backward compatibility
      organization_id: decoded.organizationId,
      organizationId: decoded.organizationId,
      timezone: decoded.timezone,
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
 * Works with JWT role from token payload
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
    // JWT payload role is the source of truth
    const userRole = req.user.role || (req.user.roles && req.user.roles[0]) || null;
    const hasRole = userRole && allowedRoles.includes(userRole);

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
    }

    next();
  };
}

