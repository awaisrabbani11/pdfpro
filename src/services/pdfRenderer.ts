import * as pdfjsLib from 'pdfjs-dist';

// Set worker path to CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

/**
 * Render a specific page from PDF to canvas
 */
export async function renderPDFPage(
  pdfUrl: string,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): Promise<void> {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
  const page = await pdf.getPage(pageNumber);

  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas context not available');
  }

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;
}

/**
 * Get total number of pages in PDF
 */
export async function getPDFPageCount(pdfUrl: string): Promise<number> {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
  return pdf.numPages;
}

/**
 * Extract text from PDF
 */
export async function extractTextFromPDF(pdfUrl: string): Promise<string> {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
  const numPages = pdf.numPages;
  const textPages: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    textPages.push(pageText);
  }

  return textPages.join('\n\n');
}
