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
    const { name, data } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Layer name is required' });
    }

    // Create layer
    const result = await sql`
      INSERT INTO canvas_layers (user_id, name, visible, locked, data, position, created_at, updated_at)
      VALUES (${userId}, ${name}, TRUE, FALSE, ${JSON.stringify(data || {})}, 0, NOW(), NOW())
      RETURNING id, name, visible, locked, data, position
    `;

    const layer = result.rows[0];

    return res.status(201).json({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      data: layer.data,
      position: layer.position
    });
  } catch (error) {
    console.error('Canvas layer create error:', error);
    return res.status(500).json({ error: 'Failed to create layer' });
  }
}
