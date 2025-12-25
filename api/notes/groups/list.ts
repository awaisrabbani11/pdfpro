import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
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

    // Get all note groups
    const groupsResult = await sql`
      SELECT id, title, type, position, created_at
      FROM note_groups
      WHERE user_id = ${userId}
      ORDER BY position ASC, created_at ASC
    `;

    // Get all items for these groups
    const groups = await Promise.all(
      groupsResult.rows.map(async (group) => {
        const itemsResult = await sql`
          SELECT id, content, completed, position, created_at
          FROM note_items
          WHERE group_id = ${group.id}
          ORDER BY position ASC, created_at ASC
        `;

        return {
          id: group.id,
          title: group.title,
          type: group.type,
          items: itemsResult.rows.map(item => ({
            id: item.id,
            content: item.content,
            completed: item.completed,
            timestamp: item.created_at
          }))
        };
      })
    );

    return res.status(200).json(groups);
  } catch (error) {
    console.error('Note groups list error:', error);
    return res.status(500).json({ error: 'Failed to fetch note groups' });
  }
}
