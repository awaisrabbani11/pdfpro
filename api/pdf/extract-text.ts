import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import jwt from 'jsonwebtoken';
import * as pdfjsLib from 'pdfjs-dist';

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
    const { fileId, pageNumbers } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID required' });
    }

    // Get file and verify ownership
    const fileResult = await sql`
      SELECT blob_url, type FROM files WHERE id = ${fileId} AND user_id = ${userId}
    `;

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = fileResult.rows[0];

    if (file.type !== 'application/pdf') {
      return res.status(400).json({ error: 'File is not a PDF' });
    }

    // Fetch PDF from blob URL
    const pdfResponse = await fetch(file.blob_url);
    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Extract text using pdfjs-dist
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    const numPages = pdf.numPages;

    const pages: { pageNumber: number; text: string }[] = [];
    const pagesToExtract = pageNumbers || Array.from({ length: numPages }, (_, i) => i + 1);

    for (const pageNum of pagesToExtract) {
      if (pageNum < 1 || pageNum > numPages) continue;

      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');

      pages.push({
        pageNumber: pageNum,
        text: pageText,
      });
    }

    const fullText = pages.map(p => p.text).join('\n\n');

    return res.status(200).json({
      text: fullText,
      pages,
    });
  } catch (error) {
    console.error('PDF text extraction error:', error);
    return res.status(500).json({ error: 'Failed to extract text from PDF' });
  }
}
