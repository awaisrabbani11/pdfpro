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

// POST /api/tasks/create
export async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
    const { type, description } = req.body;

    if (!type || !description) {
      return res.status(400).json({ error: 'Type and description are required' });
    }

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
  } catch (error: any) {
    console.error('Task create error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to create task' });
  }
}

// GET /api/tasks/list
export async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

    const result = await sql`
      SELECT id, type, description, created_at
      FROM tasks
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    const tasks = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      description: row.description,
      timestamp: row.created_at
    }));

    return res.status(200).json({ tasks });
  } catch (error: any) {
    console.error('Tasks list error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to list tasks' });
  }
}
