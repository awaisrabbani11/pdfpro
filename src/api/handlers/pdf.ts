import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { put } from '@vercel/blob';
import jwt from 'jsonwebtoken';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

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

// POST /api/pdf/merge
export async function handleMerge(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
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
  } catch (error: any) {
    console.error('PDF merge error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to merge PDFs' });
  }
}

// POST /api/pdf/split
export async function handleSplit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
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
  } catch (error: any) {
    console.error('PDF split error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to split PDF' });
  }
}

// POST /api/pdf/extract-text
export async function handleExtractText(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
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
  } catch (error: any) {
    console.error('PDF text extraction error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to extract text from PDF' });
  }
}

// POST /api/pdf/convert
export async function handleConvert(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const userId = verifyAuth(req);
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
  } catch (error: any) {
    console.error('PDF conversion error:', error);
    if (error.message === 'Unauthorized') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(500).json({ error: 'Failed to convert file' });
  }
}
