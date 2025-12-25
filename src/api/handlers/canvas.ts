import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function verifyAuth(req: VercelRequest): string {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.substring(7);
  const decoded = jwt.verify(token, JWT_SECRET) as any;
  return decoded.userId;
}

// POST /api/canvas/layers/create
export async function handleCreateLayer(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
    const { name, type, content, position, zIndex } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const result = await sql`
      INSERT INTO canvas_layers (user_id, name, type, content, position, z_index, visible, created_at)
      VALUES (${userId}, ${name}, ${type}, ${content || '{}'}, ${position || 0}, ${zIndex || 0}, TRUE, NOW())
      RETURNING id, name, type, content, position, z_index, visible, created_at
    `;

    const layer = result.rows[0];

    return res.status(201).json({
      id: layer.id,
      name: layer.name,
      type: layer.type,
      content: layer.content,
      position: layer.position,
      zIndex: layer.z_index,
      visible: layer.visible,
      timestamp: layer.created_at
    });
  } catch (error: any) {
    console.error('Canvas layer create error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to create canvas layer' });
  }
}

// GET /api/canvas/layers/list
export async function handleListLayers(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

    const result = await sql`
      SELECT id, name, type, content, position, z_index, visible, created_at
      FROM canvas_layers
      WHERE user_id = ${userId}
      ORDER BY z_index ASC, created_at ASC
    `;

    const layers = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      content: row.content,
      position: row.position,
      zIndex: row.z_index,
      visible: row.visible,
      timestamp: row.created_at
    }));

    return res.status(200).json({ layers });
  } catch (error: any) {
    console.error('Canvas layers list error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to list canvas layers' });
  }
}

// PUT /api/canvas/layers/:id/update
export async function handleUpdateLayer(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
    const { name, content, position, zIndex, visible } = req.body;

    // Verify layer belongs to user
    const layerCheck = await sql`
      SELECT id FROM canvas_layers WHERE id = ${id} AND user_id = ${userId}
    `;

    if (layerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Canvas layer not found' });
    }

    // Build update based on provided fields
    if (!name && !content && position === undefined && zIndex === undefined && visible === undefined) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    // Fetch current values first
    const current = await sql`SELECT name, content, position, z_index, visible FROM canvas_layers WHERE id = ${id}`;
    const currentLayer = current.rows[0];

    // Use provided values or fallback to current
    const finalName = name !== undefined ? name : currentLayer.name;
    const finalContent = content !== undefined ? content : currentLayer.content;
    const finalPosition = position !== undefined ? position : currentLayer.position;
    const finalZIndex = zIndex !== undefined ? zIndex : currentLayer.z_index;
    const finalVisible = visible !== undefined ? visible : currentLayer.visible;

    const result = await sql`
      UPDATE canvas_layers
      SET name = ${finalName}, content = ${finalContent}, position = ${finalPosition}, z_index = ${finalZIndex}, visible = ${finalVisible}
      WHERE id = ${id}
      RETURNING id, name, type, content, position, z_index, visible, created_at
    `;

    const layer = result.rows[0];

    return res.status(200).json({
      id: layer.id,
      name: layer.name,
      type: layer.type,
      content: layer.content,
      position: layer.position,
      zIndex: layer.z_index,
      visible: layer.visible,
      timestamp: layer.created_at
    });
  } catch (error: any) {
    console.error('Canvas layer update error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to update canvas layer' });
  }
}

// DELETE /api/canvas/layers/:id/delete
export async function handleDeleteLayer(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

    const result = await sql`
      DELETE FROM canvas_layers WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Canvas layer not found' });
    }

    return res.status(200).json({ message: 'Canvas layer deleted successfully' });
  } catch (error: any) {
    console.error('Canvas layer delete error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to delete canvas layer' });
  }
}
