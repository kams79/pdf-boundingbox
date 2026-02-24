import type { OCRResult, OCRWord } from '../types';

/**
 * Minimal interface for pdf.js TextItem — avoids importing the full pdfjs-dist
 * types which can conflict with the version bundled by react-pdf.
 */
interface PdfTextItem {
    str: string;
    /** 6-element transform matrix [a, b, c, d, tx, ty] in PDF user space */
    transform: number[];
    /** Width of the text span in PDF user space units */
    width: number;
    /** Height of the text span in PDF user space units */
    height: number;
}

interface PdfPageProxy {
    /** [x0, y0, x1, y1] in PDF user space units */
    view: number[];
    getTextContent(): Promise<{ items: unknown[] }>;
}

/**
 * Attempt to extract embedded text from a pdf.js page proxy.
 *
 * Returns an `OCRResult` if the page contains an embedded text layer,
 * or `null` if the page is a scanned/image-only PDF that needs OCR.
 *
 * Coordinates are normalized to [0, 1] relative to the page dimensions,
 * matching the format used by the Tesseract OCR results so the overlay
 * works identically for both sources.
 */
export async function extractPageText(
    page: PdfPageProxy,
    pageNumber: number
): Promise<OCRResult | null> {
    const textContent = await page.getTextContent();

    // Filter to actual text items that have non-empty content
    const textItems = textContent.items.filter(
        (item): item is PdfTextItem =>
            typeof item === 'object' &&
            item !== null &&
            'str' in item &&
            typeof (item as PdfTextItem).str === 'string' &&
            (item as PdfTextItem).str.trim().length > 0
    );

    if (textItems.length === 0) {
        return null; // Scanned / image-only PDF — fall back to Tesseract OCR
    }

    // Page dimensions in PDF user space (most PDFs have view[0]=view[1]=0)
    const pageLeft = page.view[0];
    const pageBottom = page.view[1];
    const pageWidth = page.view[2] - pageLeft;
    const pageHeight = page.view[3] - pageBottom;

    const words: OCRWord[] = [];
    let index = 0;

    for (const item of textItems) {
        const text = item.str.trim();
        if (!text) continue;

        // PDF transform matrix: [a, b, c, d, tx, ty]
        // tx, ty = position in PDF user space (origin: bottom-left)
        const tx = item.transform[4] - pageLeft;
        const ty = item.transform[5] - pageBottom;
        const itemWidth = Math.abs(item.width);
        // Height: use item.height if available and sensible, else derive from font size
        const fontSizeApprox = Math.hypot(item.transform[0], item.transform[1]);
        const itemHeight = item.height > 0 ? item.height : fontSizeApprox;

        // Convert PDF coordinates (bottom-left origin, Y up)
        // to normalized screen coordinates (top-left origin, Y down)
        const x0 = tx / pageWidth;
        const y0 = 1 - (ty + itemHeight) / pageHeight;
        const x1 = (tx + itemWidth) / pageWidth;
        const y1 = 1 - ty / pageHeight;

        words.push({
            id: `${pageNumber}-emb-${index++}`,
            text,
            confidence: 100, // Embedded text = 100% confidence
            bbox: {
                x0: Math.max(0, Math.min(1, x0)),
                y0: Math.max(0, Math.min(1, y0)),
                x1: Math.max(0, Math.min(1, x1)),
                y1: Math.max(0, Math.min(1, y1)),
            },
        });
    }

    if (words.length === 0) return null;

    return {
        pageNumber,
        words,
        fullText: textItems.map((i) => i.str).join(' '),
    };
}
