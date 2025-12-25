import type { VercelRequest, VercelResponse } from '@vercel/node';
import { del } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'File ID required' });
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

    // Get file and verify ownership
    const result = await sql`
      SELECT blob_url FROM files WHERE id = ${id} AND user_id = ${userId}
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];

    // Delete from Vercel Blob
    try {
      await del(file.blob_url, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
    } catch (blobError) {
      console.error('Blob deletion error:', blobError);
      // Continue even if blob deletion fails
    }

    // Delete from database
    await sql`
      DELETE FROM files WHERE id = ${id} AND user_id = ${userId}
    `;

    return res.status(204).send(null);
  } catch (error) {
    console.error('File delete error:', error);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
}
