import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const VERCEL_URL = process.env.VERCEL_URL || 'http://localhost:5173';
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth credentials not configured');
    }

    // Exchange code for tokens
    const redirectUri = `${VERCEL_URL.startsWith('http') ? VERCEL_URL : `https://${VERCEL_URL}`}/api/auth/google/callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens = await tokenResponse.json();
    const { access_token } = tokens;

    // Fetch user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info');
    }

    const userInfo = await userInfoResponse.json();
    const { email, name, picture } = userInfo;

    // Check if user exists in database
    const existingUser = await sql`
      SELECT id, email, name, avatar_url FROM users WHERE email = ${email}
    `;

    let userId: string;

    if (existingUser.rows.length > 0) {
      // Update last login
      userId = existingUser.rows[0].id;
      await sql`
        UPDATE users SET last_login_at = NOW() WHERE id = ${userId}
      `;
    } else {
      // Create new user
      const newUser = await sql`
        INSERT INTO users (email, name, avatar_url, created_at, last_login_at)
        VALUES (${email}, ${name}, ${picture}, NOW(), NOW())
        RETURNING id
      `;
      userId = newUser.rows[0].id;
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId, email, name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // For popup window authentication, return HTML that posts message to parent
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Success</title></head>
        <body>
          <script>
            window.opener.postMessage({
              type: 'pdfpro_auth_success',
              token: '${token}',
              user: {
                id: '${userId}',
                email: '${email}',
                name: '${name}',
                avatarUrl: '${picture || ''}'
              }
            }, '*');
            window.close();
          </script>
          <p>Authentication successful! This window should close automatically.</p>
          <p>If not, you can close it manually.</p>
        </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  } catch (error) {
    console.error('OAuth callback error:', error);

    // Error page for popup
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <script>
            window.opener.postMessage({
              type: 'pdfpro_auth_error',
              error: 'Authentication failed'
            }, '*');
            setTimeout(() => window.close(), 2000);
          </script>
          <p>Authentication failed. This window will close shortly.</p>
        </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    return res.status(500).send(errorHtml);
  }
}
