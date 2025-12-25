import { verifyToken, getTokenFromRequest, JWTPayload } from './jwt';

export interface AuthUser extends JWTPayload {
  userId: string;
  email: string;
  name: string;
}

// Middleware to verify authentication from request
export function authenticateRequest(req: Request): AuthUser | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  return payload as AuthUser;
}

// Helper to create auth error response
export function createAuthErrorResponse(message: string = 'Unauthorized'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Helper to create forbidden error response
export function createForbiddenResponse(message: string = 'Forbidden'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Helper to create server error response
export function createServerErrorResponse(message: string = 'Internal server error'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Helper to create success JSON response
export function createJsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
