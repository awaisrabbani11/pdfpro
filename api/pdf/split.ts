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
    const { fileId, ranges } = req.body;

    if (!fileId || !ranges || !Array.isArray(ranges)) {
      return res.status(400).json({ error: 'File ID and ranges required' });
    }

    // Get file and verify ownership
    const fileResult = await sql`
      SELECT name, blob_url, type FROM files WHERE id = ${fileId} AND user_id = ${userId}
    `;

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = fileResult.rows[0];

    if (file.type !== 'application/pdf') {
      return res.status(400).json({ error: 'File is not a PDF' });
    }

    // Load PDF
    const pdfResponse = await fetch(file.blob_url);
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const sourcePdf = await PDFDocument.load(pdfBuffer);

    const results: any[] = [];

    // Split into ranges
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const { start, end } = range;

      const newPdf = await PDFDocument.create();
      const pageIndices = Array.from(
        { length: end - start + 1 },
        (_, j) => start + j - 1
      );
      const pages = await newPdf.copyPages(sourcePdf, pageIndices);
      pages.forEach(page => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();

      // Upload to blob
      const fileName = `${file.name.replace('.pdf', '')}-part${i + 1}.pdf`;
      const blob = await put(fileName, pdfBytes, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      // Save to database
      const result = await sql`
        INSERT INTO files (user_id, name, type, size, blob_url, source, created_at, updated_at)
        VALUES (${userId}, ${fileName}, 'application/pdf', ${pdfBytes.length}, ${blob.url}, 'split', NOW(), NOW())
        RETURNING id, name, blob_url
      `;

      results.push({
        fileId: result.rows[0].id,
        blobUrl: result.rows[0].blob_url,
        name: result.rows[0].name,
      });
    }

    return res.status(200).json(results);
  } catch (error) {
    console.error('PDF split error:', error);
    return res.status(500).json({ error: 'Failed to split PDF' });
  }
}
