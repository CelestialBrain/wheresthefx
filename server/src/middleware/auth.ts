/**
 * Auth Middleware — JWT verification for Express
 *
 * Provides two middleware functions:
 * - `authenticate`: Required auth — returns 401 if no valid token
 * - `optionalAuth`: Optional auth — attaches user if token present, continues if not
 *
 * ## How It Works
 *
 * 1. Client sends `Authorization: Bearer <token>` header
 * 2. Middleware extracts and verifies the JWT using JWT_SECRET
 * 3. If valid, attaches `req.user` with `{ userId, email, username }`
 * 4. If invalid/missing: `authenticate` returns 401, `optionalAuth` continues
 *
 * ## Usage
 * ```ts
 * // Protected route
 * router.get('/me', authenticate, (req, res) => {
 *   res.json(req.user);
 * });
 *
 * // Optional auth (e.g., to show "saved" badge if logged in)
 * router.get('/events', optionalAuth, (req, res) => {
 *   const userId = req.user?.userId; // may be undefined
 * });
 * ```
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/** Shape of the decoded JWT payload attached to req.user */
export interface AuthPayload {
  userId: number;
  email: string;
  username: string;
}

// Extend Express Request to include the user property
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

/**
 * Required authentication middleware.
 * Returns 401 if no valid Bearer token is present.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Optional authentication middleware.
 * Attaches user info if a valid token is present, but doesn't reject
 * the request if there's no token. Useful for endpoints that show
 * different data to logged-in vs anonymous users.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
      req.user = payload;
    } catch {
      // Invalid token — just continue without user
    }
  }

  next();
}

/**
 * Generate a JWT token for a user.
 * Used during login and registration.
 *
 * @param payload - User data to encode in the token
 * @returns Signed JWT string (expires in 7 days)
 */
export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
