import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = decoded.userId;

    // Get last 100 tasks
    const result = await sql`
      SELECT id, type, description, created_at
      FROM tasks
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const tasks = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      description: row.description,
      timestamp: row.created_at
    }));

    return res.status(200).json(tasks);
  } catch (error) {
    console.error('Tasks list error:', error);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
}
