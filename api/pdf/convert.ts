import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { put } from '@vercel/blob';
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
    const { fileId, targetFormat } = req.body;

    if (!fileId || !targetFormat) {
      return res.status(400).json({ error: 'File ID and target format required' });
    }

    const validFormats = ['pdf', 'docx', 'xlsx', 'pptx'];
    if (!validFormats.includes(targetFormat)) {
      return res.status(400).json({ error: 'Invalid target format' });
    }

    // Get file and verify ownership
    const fileResult = await sql`
      SELECT name, blob_url, type FROM files WHERE id = ${fileId} AND user_id = ${userId}
    `;

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = fileResult.rows[0];

    // Check if LibreOffice service is configured
    const LIBRE_OFFICE_SERVICE_URL = process.env.LIBRE_OFFICE_SERVICE_URL;

    if (!LIBRE_OFFICE_SERVICE_URL) {
      return res.status(503).json({
        error: 'Document conversion service not configured',
        message: 'Please set up LibreOffice conversion microservice',
      });
    }

    // Fetch file from blob
    const fileResponse = await fetch(file.blob_url);
    const fileBuffer = await fileResponse.arrayBuffer();

    // Call LibreOffice conversion service
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), file.name);
    if (targetFormat) {
      formData.append('format', targetFormat);
    }

    const endpoint =
      file.type === 'application/pdf'
        ? `${LIBRE_OFFICE_SERVICE_URL}/convert/from-pdf`
        : `${LIBRE_OFFICE_SERVICE_URL}/convert/to-pdf`;

    const conversionResponse = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    if (!conversionResponse.ok) {
      throw new Error('Conversion service failed');
    }

    const convertedBuffer = await conversionResponse.arrayBuffer();

    // Upload converted file to blob
    const newFileName = file.name.replace(/\.[^.]+$/, `.${targetFormat}`);
    const blob = await put(newFileName, convertedBuffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // Determine MIME type
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };

    // Save to database
    const result = await sql`
      INSERT INTO files (user_id, name, type, size, blob_url, source, created_at, updated_at)
      VALUES (
        ${userId},
        ${newFileName},
        ${mimeTypes[targetFormat]},
        ${convertedBuffer.byteLength},
        ${blob.url},
        'convert',
        NOW(),
        NOW()
      )
      RETURNING id, name, blob_url
    `;

    const newFile = result.rows[0];

    return res.status(200).json({
      fileId: newFile.id,
      blobUrl: newFile.blob_url,
      name: newFile.name,
    });
  } catch (error) {
    console.error('PDF conversion error:', error);
    return res.status(500).json({ error: 'Failed to convert file' });
  }
}
