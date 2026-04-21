import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/environment';
import { UnauthorizedError, JwtPayload } from '../types';
import { logger } from '../config/logger';

/**
 * Verify JWT token from Authorization header or cookie
 */
export function authenticateToken(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    // Get token from header or cookie
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new UnauthorizedError('Missing authentication token');
    }

    // Verify token
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // Attach user to request
    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Token has expired'));
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError('Invalid token'));
    }

    next(error);
  }
}

/**
 * Check if user has required role
 */
export function requireRole(role: 'consultant' | 'super_admin') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (req.user.role !== role && req.user.role !== 'super_admin') {
      return next(new UnauthorizedError(`Role '${role}' required`));
    }

    next();
  };
}

/**
 * Generate JWT token
 */
export function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'iss'>): string {
  return jwt.sign(
    {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + env.JWT_EXPIRY,
      iss: 'diazlara-api',
    },
    env.JWT_SECRET
  );
}

/**
 * Verify token (non-middleware version)
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (error) {
    logger.error('Token verification failed:', error);
    return null;
  }
}
