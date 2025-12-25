import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
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

    // Parse body
    const { type, description } = req.body;

    if (!type || !description) {
      return res.status(400).json({ error: 'Type and description are required' });
    }

    // Create task
    const result = await sql`
      INSERT INTO tasks (user_id, type, description, created_at)
      VALUES (${userId}, ${type}, ${description}, NOW())
      RETURNING id, type, description, created_at
    `;

    const task = result.rows[0];

    return res.status(201).json({
      id: task.id,
      type: task.type,
      description: task.description,
      timestamp: task.created_at
    });
  } catch (error) {
    console.error('Task create error:', error);
    return res.status(500).json({ error: 'Failed to create task' });
  }
}
