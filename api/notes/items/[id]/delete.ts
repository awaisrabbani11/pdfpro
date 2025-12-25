import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Item ID required' });
    }

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

    // Verify item's group belongs to user and delete
    const result = await sql`
      DELETE FROM note_items
      WHERE id = ${id}
      AND group_id IN (
        SELECT id FROM note_groups WHERE user_id = ${userId}
      )
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note item not found' });
    }

    return res.status(204).send(null);
  } catch (error) {
    console.error('Note item delete error:', error);
    return res.status(500).json({ error: 'Failed to delete note item' });
  }
}
