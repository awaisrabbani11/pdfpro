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

// POST /api/notes/groups/create
export async function handleCreateGroup(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
    const { title, category } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await sql`
      INSERT INTO note_groups (user_id, title, category, created_at)
      VALUES (${userId}, ${title}, ${category || 'general'}, NOW())
      RETURNING id, title, category, created_at
    `;

    const group = result.rows[0];

    return res.status(201).json({
      id: group.id,
      title: group.title,
      category: group.category,
      timestamp: group.created_at
    });
  } catch (error: any) {
    console.error('Note group create error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to create note group' });
  }
}

// GET /api/notes/groups/list
export async function handleListGroups(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

    const result = await sql`
      SELECT id, title, category, created_at
      FROM note_groups
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    const groups = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      category: row.category,
      timestamp: row.created_at
    }));

    return res.status(200).json({ groups });
  } catch (error: any) {
    console.error('Note groups list error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to list note groups' });
  }
}

// DELETE /api/notes/groups/:id/delete
export async function handleDeleteGroup(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

    const result = await sql`
      DELETE FROM note_groups WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note group not found' });
    }

    return res.status(200).json({ message: 'Note group deleted successfully' });
  } catch (error: any) {
    console.error('Note group delete error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to delete note group' });
  }
}

// POST /api/notes/items/create
export async function handleCreateItem(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
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
  } catch (error: any) {
    console.error('Note item create error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to create note item' });
  }
}

// PUT /api/notes/items/:id/update
export async function handleUpdateItem(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
    const { content, completed } = req.body;

    // Verify item belongs to user's group
    const itemCheck = await sql`
      SELECT ni.id
      FROM note_items ni
      JOIN note_groups ng ON ni.group_id = ng.id
      WHERE ni.id = ${id} AND ng.user_id = ${userId}
    `;

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Note item not found' });
    }

    // Build update dynamically
    if (content === undefined && completed === undefined) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    let result;
    if (content !== undefined && completed !== undefined) {
      result = await sql`
        UPDATE note_items
        SET content = ${content}, completed = ${completed}
        WHERE id = ${id}
        RETURNING id, content, completed, created_at
      `;
    } else if (content !== undefined) {
      result = await sql`
        UPDATE note_items
        SET content = ${content}
        WHERE id = ${id}
        RETURNING id, content, completed, created_at
      `;
    } else {
      result = await sql`
        UPDATE note_items
        SET completed = ${completed}
        WHERE id = ${id}
        RETURNING id, content, completed, created_at
      `;
    }

    const item = result.rows[0];

    return res.status(200).json({
      id: item.id,
      content: item.content,
      completed: item.completed,
      timestamp: item.created_at
    });
  } catch (error: any) {
    console.error('Note item update error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to update note item' });
  }
}

// DELETE /api/notes/items/:id/delete
export async function handleDeleteItem(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

    // Verify item belongs to user's group
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

    return res.status(200).json({ message: 'Note item deleted successfully' });
  } catch (error: any) {
    console.error('Note item delete error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to delete note item' });
  }
}
