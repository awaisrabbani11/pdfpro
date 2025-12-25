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

    // Get all files for user
    const result = await sql`
      SELECT id, name, type, size, blob_url, source, created_at
      FROM files
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    const files = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      size: row.size,
      blobUrl: row.blob_url,
      source: row.source,
      createdAt: row.created_at
    }));

    return res.status(200).json(files);
  } catch (error) {
    console.error('File list error:', error);
    return res.status(500).json({ error: 'Failed to fetch files' });
  }
}
