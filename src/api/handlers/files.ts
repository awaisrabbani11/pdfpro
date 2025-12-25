import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, del } from '@vercel/blob';
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

// POST /api/files/upload
export async function handleUpload(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

    // Read request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const data = Buffer.concat(chunks).toString();
    const body = JSON.parse(data);

    const { fileName, fileType, fileData, fileSize } = body;

    if (!fileName || !fileType || !fileData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Convert base64 to buffer
    const base64Data = fileData.split(',')[1] || fileData;
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to Vercel Blob
    const blob = await put(fileName, buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // Save metadata to database
    const result = await sql`
      INSERT INTO files (user_id, name, type, size, blob_url, source, created_at, updated_at)
      VALUES (${userId}, ${fileName}, ${fileType}, ${fileSize || buffer.length}, ${blob.url}, 'upload', NOW(), NOW())
      RETURNING id, user_id, name, type, size, blob_url, source, created_at
    `;

    const file = result.rows[0];

    return res.status(201).json({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      blobUrl: file.blob_url,
      source: file.source,
      createdAt: file.created_at
    });
  } catch (error: any) {
    console.error('File upload error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to upload file' });
  }
}

// GET /api/files/list
export async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

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

    return res.status(200).json({ files });
  } catch (error: any) {
    console.error('File list error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to list files' });
  }
}

// GET /api/files/:id/download
export async function handleDownload(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

    const result = await sql`
      SELECT blob_url, name, type
      FROM files
      WHERE id = ${id} AND user_id = ${userId}
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    return res.status(200).json({
      blobUrl: file.blob_url,
      name: file.name,
      type: file.type
    });
  } catch (error: any) {
    console.error('File download error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to download file' });
  }
}

// DELETE /api/files/:id/delete
export async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);

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
    }

    // Delete from database
    await sql`DELETE FROM files WHERE id = ${id}`;

    return res.status(200).json({ message: 'File deleted successfully' });
  } catch (error: any) {
    console.error('File delete error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to delete file' });
  }
}
