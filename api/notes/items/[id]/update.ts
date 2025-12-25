import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
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

    // Parse body
    const { content, completed } = req.body;

    // Verify item's group belongs to user
    const itemCheck = await sql`
      SELECT ni.id
      FROM note_items ni
      JOIN note_groups ng ON ni.group_id = ng.id
      WHERE ni.id = ${id} AND ng.user_id = ${userId}
    `;

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Note item not found' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(content);
    }

    if (completed !== undefined) {
      updates.push(`completed = $${paramIndex++}`);
      values.push(completed);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const updateQuery = `
      UPDATE note_items
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, content, completed, created_at
    `;

    const result = await sql.query(updateQuery, values);
    const item = result.rows[0];

    return res.status(200).json({
      id: item.id,
      content: item.content,
      completed: item.completed,
      timestamp: item.created_at
    });
  } catch (error) {
    console.error('Note item update error:', error);
    return res.status(500).json({ error: 'Failed to update note item' });
  }
}
