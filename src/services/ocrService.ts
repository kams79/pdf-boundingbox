import { createWorker, Worker } from 'tesseract.js';
import type { OCRResult, OCRWord } from '../types';

let workerInstance: Worker | null = null;
let initPromise: Promise<Worker> | null = null;

/**
 * Initialize (and cache) the Tesseract.js worker.
 * Safe to call multiple times — only creates one worker.
 */
export async function initOCR(): Promise<Worker> {
    if (workerInstance) return workerInstance;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const worker = await createWorker('eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    console.debug(`[OCR] ${Math.round(m.progress * 100)}%`);
                }
            },
        });
        workerInstance = worker;
        return worker;
    })();

    return initPromise;
}

/**
 * Run OCR on a canvas element or ImageData and return structured OCRResult.
 * @param source - The rendered PDF page canvas
 * @param pageNumber - 1-based page index
 */
export async function recognizePage(
    source: HTMLCanvasElement | ImageData,
    pageNumber: number
): Promise<OCRResult> {
    const worker = await initOCR();

    const result = await worker.recognize(source as HTMLCanvasElement);

    const words: OCRWord[] = [];
    let wordIndex = 0;

    for (const block of result.data.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
            for (const line of para.lines ?? []) {
                for (const word of line.words ?? []) {
                    if (!word.text.trim()) continue;
                    words.push({
                        id: `${pageNumber}-${wordIndex++}`,
                        text: word.text,
                        confidence: word.confidence,
                        bbox: {
                            x0: word.bbox.x0,
                            y0: word.bbox.y0,
                            x1: word.bbox.x1,
                            y1: word.bbox.y1,
                        },
                    });
                }
            }
        }
    }

    return {
        pageNumber,
        words,
        fullText: result.data.text,
    };
}

/**
 * Terminate the shared Tesseract worker. Call on app unmount.
 */
export async function terminateOCR(): Promise<void> {
    if (workerInstance) {
        await workerInstance.terminate();
        workerInstance = null;
        initPromise = null;
    }
}
