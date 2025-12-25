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
      return res.status(400).json({ error: 'Layer ID required' });
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
    const { name, visible, locked, data } = req.body;

    // Verify layer belongs to user
    const layerCheck = await sql`
      SELECT id FROM canvas_layers WHERE id = ${id} AND user_id = ${userId}
    `;

    if (layerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Layer not found' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (visible !== undefined) {
      updates.push(`visible = $${paramIndex++}`);
      values.push(visible);
    }

    if (locked !== undefined) {
      updates.push(`locked = $${paramIndex++}`);
      values.push(locked);
    }

    if (data !== undefined) {
      updates.push(`data = $${paramIndex++}`);
      values.push(JSON.stringify(data));
    }

    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) { // Only updated_at
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const updateQuery = `
      UPDATE canvas_layers
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, visible, locked, data, position
    `;

    const result = await sql.query(updateQuery, values);
    const layer = result.rows[0];

    return res.status(200).json({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      data: layer.data,
      position: layer.position
    });
  } catch (error) {
    console.error('Canvas layer update error:', error);
    return res.status(500).json({ error: 'Failed to update layer' });
  }
}
