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
    const { groupId, content } = req.body;

    if (!groupId || !content) {
      return res.status(400).json({ error: 'Group ID and content are required' });
    }

    // Verify group belongs to user
    const groupCheck = await sql`
      SELECT id FROM note_groups WHERE id = ${groupId} AND user_id = ${userId}
    `;

    if (groupCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create note item
    const result = await sql`
      INSERT INTO note_items (group_id, content, completed, position, created_at)
      VALUES (${groupId}, ${content}, FALSE, 0, NOW())
      RETURNING id, content, completed, created_at
    `;

    const item = result.rows[0];

    return res.status(201).json({
      id: item.id,
      content: item.content,
      completed: item.completed,
      timestamp: item.created_at
    });
  } catch (error) {
    console.error('Note item create error:', error);
    return res.status(500).json({ error: 'Failed to create note item' });
  }
}
