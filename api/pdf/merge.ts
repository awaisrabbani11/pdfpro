import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { put } from '@vercel/blob';
import jwt from 'jsonwebtoken';
import { PDFDocument } from 'pdf-lib';

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
    const { fileIds } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 file IDs required' });
    }

    // Get files and verify ownership
    const filesResult = await sql`
      SELECT id, name, blob_url, type
      FROM files
      WHERE id = ANY(${fileIds}) AND user_id = ${userId}
      ORDER BY array_position(${fileIds}, id)
    `;

    if (filesResult.rows.length !== fileIds.length) {
      return res.status(404).json({ error: 'Some files not found' });
    }

    const files = filesResult.rows;

    // Verify all are PDFs
    if (files.some(f => f.type !== 'application/pdf')) {
      return res.status(400).json({ error: 'All files must be PDFs' });
    }

    // Merge PDFs
    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const pdfResponse = await fetch(file.blob_url);
      const pdfBuffer = await pdfResponse.arrayBuffer();
      const pdf = await PDFDocument.load(pdfBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();

    // Upload merged PDF to blob
    const fileName = `merged-${Date.now()}.pdf`;
    const blob = await put(fileName, mergedBytes, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    // Save to database
    const result = await sql`
      INSERT INTO files (user_id, name, type, size, blob_url, source, created_at, updated_at)
      VALUES (${userId}, ${fileName}, 'application/pdf', ${mergedBytes.length}, ${blob.url}, 'merge', NOW(), NOW())
      RETURNING id, name, blob_url
    `;

    const newFile = result.rows[0];

    return res.status(200).json({
      fileId: newFile.id,
      blobUrl: newFile.blob_url,
      name: newFile.name,
    });
  } catch (error) {
    console.error('PDF merge error:', error);
    return res.status(500).json({ error: 'Failed to merge PDFs' });
  }
}
