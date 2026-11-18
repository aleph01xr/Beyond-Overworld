import type { NextFunction, Request, Response } from 'express';
import type { IdentityProviderKind } from '../../../shared/types/domain.ts';
import type { AuthService, AuthSession } from './authService.ts';

export interface AdminAuthorizedSubject {
  accountId: string;
  username: string;
  isAdmin: boolean;
  provider: IdentityProviderKind;
}

export interface AdminAuthCheckResult {
  ok: boolean;
  code?: 'AUTH_REQUIRED' | 'ADMIN_FORBIDDEN';
  message?: string;
}

/**
 * Authoritative server-side administrator predicate.
 * Never grants admin rights based on username or client-submitted flags.
 */
export function isServerAdmin(
  subject: Pick<AdminAuthorizedSubject, 'isAdmin'> | null | undefined
): boolean {
  return subject?.isAdmin === true;
}

/**
 * Reusable server-side guard for Overworld admin actions (HTTP or WebSocket commands).
 */
export function assertServerAdmin(
  subject: Pick<AdminAuthorizedSubject, 'accountId' | 'username' | 'isAdmin'> | null | undefined,
  actionLabel = 'administrator action'
): AdminAuthCheckResult {
  if (!subject) {
    return {
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required.',
    };
  }
  if (!isServerAdmin(subject)) {
    return {
      ok: false,
      code: 'ADMIN_FORBIDDEN',
      message: `Administrator privileges required for ${actionLabel}.`,
    };
  }
  return { ok: true };
}

export interface AdminRequest extends Request {
  adminSession?: AuthSession;
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/**
 * Express middleware enforcing server-side admin verification against AuthService sessions.
 * Ignores any client-supplied `isAdmin` or `accountId` fields in headers, query, or body.
 */
export function requireAdminSession(authService: AuthService) {
  return (req: AdminRequest, res: Response, next: NextFunction): void => {
    const token = extractBearer(req);
    const session = token ? authService.validateSessionToken(token) : null;

    const check = assertServerAdmin(session, 'admin route access');
    if (!check.ok || !session) {
      const status = check.code === 'AUTH_REQUIRED' ? 401 : 403;
      res.status(status).json({ error: check.message, code: check.code });
      return;
    }

    req.adminSession = session;
    next();
  };
}
