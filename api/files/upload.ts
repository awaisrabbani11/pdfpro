import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for file uploads
  },
};

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

    // Parse multipart form data
    // Note: For production, use a library like 'formidable' or 'busboy' for proper multipart parsing
    // For now, we'll use a simple approach assuming the file is sent as base64 in JSON

    let body: any;
    try {
      // Read the request body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks).toString();
      body = JSON.parse(data);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

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
  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({ error: 'Failed to upload file' });
  }
}
