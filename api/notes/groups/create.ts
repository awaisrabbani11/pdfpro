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
    const { title, type } = req.body;

    if (!title || !type) {
      return res.status(400).json({ error: 'Title and type are required' });
    }

    if (type !== 'text' && type !== 'todo') {
      return res.status(400).json({ error: 'Type must be "text" or "todo"' });
    }

    // Create note group
    const result = await sql`
      INSERT INTO note_groups (user_id, title, type, position, created_at)
      VALUES (${userId}, ${title}, ${type}, 0, NOW())
      RETURNING id, title, type, created_at
    `;

    const group = result.rows[0];

    return res.status(201).json({
      id: group.id,
      title: group.title,
      type: group.type,
      items: []
    });
  } catch (error) {
    console.error('Note group create error:', error);
    return res.status(500).json({ error: 'Failed to create note group' });
  }
}
