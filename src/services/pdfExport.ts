import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { OCRResult } from '../types';

/**
 * Embed invisible (white, size-0) text at OCR bounding box positions
 * so the exported PDF becomes text-searchable.
 *
 * @param pdfBytes - Original PDF as Uint8Array or ArrayBuffer
 * @param ocrResults - Map of pageNumber → OCRResult
 * @returns Modified PDF bytes
 */
export async function embedOCRText(
    pdfBytes: Uint8Array | ArrayBuffer,
    ocrResults: Map<number, OCRResult>
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pages = pdfDoc.getPages();

    for (const [pageNumber, ocrResult] of ocrResults.entries()) {
        const pageIndex = pageNumber - 1;
        if (pageIndex < 0 || pageIndex >= pages.length) continue;

        const page = pages[pageIndex];
        const { height: pageHeight } = page.getSize();

        for (const word of ocrResult.words) {
            if (!word.text.trim()) continue;

            // Tesseract bbox is in image-space (top-left origin).
            // pdf-lib uses bottom-left origin, so we flip the y axis.
            const wordHeight = word.bbox.y1 - word.bbox.y0;
            const x = word.bbox.x0;
            // Convert top-left y to bottom-left y
            const y = pageHeight - word.bbox.y1;

            const fontSize = Math.max(wordHeight, 1);

            page.drawText(word.text, {
                x,
                y,
                size: fontSize,
                font,
                // Draw in white / fully transparent to keep it invisible
                color: rgb(1, 1, 1),
                opacity: 0,
            });
        }
    }

    return pdfDoc.save();
}

/**
 * Trigger a browser download of a PDF byte array.
 */
export function downloadPDF(bytes: Uint8Array, filename = 'annotated.pdf'): void {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
