import { PDFDocument } from 'pdf-lib';

/**
 * Merge multiple PDF files into one
 */
export async function mergePDFs(files: File[]): Promise<Blob> {
  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach(page => mergedPdf.addPage(page));
  }

  const pdfBytes = await mergedPdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Split PDF into multiple files based on page ranges
 */
export async function splitPDF(
  file: File,
  pageRanges: { start: number; end: number }[]
): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const results: Blob[] = [];

  for (const range of pageRanges) {
    const newPdf = await PDFDocument.create();
    const pageIndices = Array.from(
      { length: range.end - range.start + 1 },
      (_, i) => range.start + i - 1
    );
    const pages = await newPdf.copyPages(sourcePdf, pageIndices);
    pages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    results.push(new Blob([pdfBytes], { type: 'application/pdf' }));
  }

  return results;
}

/**
 * Extract specific pages from a PDF
 */
export async function extractPages(file: File, pageNumbers: number[]): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const newPdf = await PDFDocument.create();

  const pages = await newPdf.copyPages(
    sourcePdf,
    pageNumbers.map(n => n - 1)
  );
  pages.forEach(page => newPdf.addPage(page));

  const pdfBytes = await newPdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Insert an image into a PDF at specified position
 */
export async function insertImageToPDF(
  file: File,
  imageFile: File,
  pageNumber: number,
  x: number,
  y: number
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);

  const imageBytes = await imageFile.arrayBuffer();
  const image =
    imageFile.type === 'image/png'
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

  const page = pdfDoc.getPage(pageNumber - 1);
  page.drawImage(image, {
    x,
    y,
    width: image.width,
    height: image.height,
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Add text to a PDF at specified position
 */
export async function addTextToPDF(
  file: File,
  text: string,
  pageNumber: number,
  x: number,
  y: number,
  options?: { size?: number; color?: string }
): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);

  const page = pdfDoc.getPage(pageNumber - 1);
  const { size = 12 } = options || {};

  page.drawText(text, {
    x,
    y,
    size,
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Get page count from PDF
 */
export async function getPDFPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await PDFDocument.load(arrayBuffer);
  return pdf.getPageCount();
}
