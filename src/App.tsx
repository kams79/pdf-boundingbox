import React, { useState, useCallback, useRef, useEffect } from 'react';
import PDFViewer from './components/PDFViewer';
import BoundingBoxOverlay from './components/BoundingBoxOverlay';
import DrawingLayer from './components/DrawingLayer';
import HighlightLayer from './components/HighlightLayer';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import { recognizePage, terminateOCR } from './services/ocrService';
import { embedOCRText, downloadPDF } from './services/pdfExport';
import { extractPageText } from './services/pdfTextExtractor';
import { useFieldStore } from './services/fieldStore';
import type { AnnotationMode, OCRResult, PageDimensions } from './types';
import './index.css';

const SCALE_STEP = 0.2;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;

function App() {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [numPages, setNumPages] = useState(0);
    const [scale, setScale] = useState(1.2);
    const [mode, setMode] = useState<AnnotationMode>('none');
    const [annotationColor, setAnnotationColor] = useState('#e74c3c');
    const [showBBoxes, setShowBBoxes] = useState(true);
    const [isOCRRunning, setIsOCRRunning] = useState(false);
    const [ocrResults, setOcrResults] = useState<Map<number, OCRResult>>(new Map());
    const [pageDimensions, setPageDimensions] = useState<PageDimensions>({ width: 0, height: 0 });
    /** CSS display dimensions of the rendered PDF canvas — used to size the overlay container. */
    const [canvasCSSSize, setCanvasCSSSize] = useState<PageDimensions>({ width: 0, height: 0 });
    /** Tracks which pages have embedded text (already digitized) */
    const [digitizedPages, setDigitizedPages] = useState<Set<number>>(new Set());

    const lastCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDraggingRef = useRef(false);

    // Cleanup OCR worker on unmount
    useEffect(() => {
        return () => {
            terminateOCR();
        };
    }, []);

    // ── File Handling ──────────────────────────────────────────────────────────

    const handleOpenFile = useCallback(async (file: File) => {
        setPdfFile(file);
        setCurrentPage(1);
        setNumPages(0);
        setOcrResults(new Map());
        setDigitizedPages(new Set());
        // Read bytes for export later
        const bytes = new Uint8Array(await file.arrayBuffer());
        setPdfBytes(bytes);
    }, []);

    // ── Drag and Drop ──────────────────────────────────────────────────────────

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            isDraggingRef.current = false;
            const file = e.dataTransfer.files[0];
            if (file?.type === 'application/pdf') {
                handleOpenFile(file);
            }
        },
        [handleOpenFile]
    );

    // ── Page Navigation ────────────────────────────────────────────────────────

    const handleDocumentLoad = useCallback((n: number) => {
        setNumPages(n);
        setCurrentPage(1);
    }, []);

    const handlePageLoadSuccess = useCallback((dims: PageDimensions) => {
        setPageDimensions(dims);
    }, []);

    const prevPage = useCallback(
        () => setCurrentPage((p) => Math.max(1, p - 1)),
        []
    );
    const nextPage = useCallback(
        () => setCurrentPage((p) => Math.min(numPages, p + 1)),
        [numPages]
    );

    // ── Zoom ───────────────────────────────────────────────────────────────────

    const zoomIn = useCallback(
        () => setScale((s) => Math.min(MAX_SCALE, parseFloat((s + SCALE_STEP).toFixed(1)))),
        []
    );
    const zoomOut = useCallback(
        () => setScale((s) => Math.max(MIN_SCALE, parseFloat((s - SCALE_STEP).toFixed(1)))),
        []
    );
    const zoomReset = useCallback(() => setScale(1.2), []);

    // Handle ctrl+wheel zoom
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        if (e.deltaY < 0) setScale((s) => Math.min(MAX_SCALE, parseFloat((s + SCALE_STEP).toFixed(1))));
        else setScale((s) => Math.max(MIN_SCALE, parseFloat((s - SCALE_STEP).toFixed(1))));
    }, []);

    // ── OCR ────────────────────────────────────────────────────────────────────

    const handlePageRender = useCallback((canvas: HTMLCanvasElement, _pageNumber: number) => {
        lastCanvasRef.current = canvas;
        // offsetWidth/Height gives the actual CSS display size (excludes DPR, unaffected by physical pixels)
        setCanvasCSSSize({ width: canvas.offsetWidth, height: canvas.offsetHeight });
    }, []);

    /**
     * Called when pdf.js loads a page — checks for embedded text layer.
     * If the PDF is already digitized, auto-populates bboxes (no OCR needed).
     */
    const handlePageProxy = useCallback(async (proxy: unknown, pageNumber: number) => {
        // Skip if we already have results for this page
        if (ocrResults.has(pageNumber)) return;
        try {
            const result = await extractPageText(
                proxy as Parameters<typeof extractPageText>[0],
                pageNumber
            );
            if (result) {
                // PDF has embedded text — use it directly
                setOcrResults((prev) => {
                    const next = new Map(prev);
                    next.set(pageNumber, result);
                    return next;
                });
                setDigitizedPages((prev) => new Set([...prev, pageNumber]));
            }
        } catch (err) {
            // Silently ignore — user can still run OCR manually
            console.debug('[PDF] Embedded text extraction failed:', err);
        }
    }, [ocrResults]);

    const runOCR = useCallback(async () => {
        const canvas = lastCanvasRef.current;
        if (!canvas) return;
        setIsOCRRunning(true);
        try {
            const result = await recognizePage(canvas, currentPage);
            // Normalize bbox values to [0, 1] relative to the physical canvas size.
            // This makes BoundingBoxOverlay zoom-invariant and DPR-independent
            // (canvas.width/height include devicePixelRatio, so dividing cancels it out).
            const cw = canvas.width;
            const ch = canvas.height;
            const normalized = {
                ...result,
                words: result.words.map((w) => ({
                    ...w,
                    bbox: {
                        x0: w.bbox.x0 / cw,
                        y0: w.bbox.y0 / ch,
                        x1: w.bbox.x1 / cw,
                        y1: w.bbox.y1 / ch,
                    },
                })),
            };
            setOcrResults((prev) => {
                const next = new Map(prev);
                next.set(currentPage, normalized);
                return next;
            });
        } catch (err) {
            console.error('OCR failed', err);
        } finally {
            setIsOCRRunning(false);
        }
    }, [currentPage]);

    // ── Export ─────────────────────────────────────────────────────────────────

    const handleExport = useCallback(async () => {
        if (!pdfBytes) return;
        try {
            const exported = await embedOCRText(pdfBytes, ocrResults);
            downloadPDF(exported, pdfFile?.name?.replace('.pdf', '_ocr.pdf') ?? 'export.pdf');
        } catch (err) {
            console.error('Export failed', err);
        }
    }, [pdfBytes, ocrResults, pdfFile]);

    // ──────────────────────────────────────────────────────────────────────────

    const currentOCR = ocrResults.get(currentPage) ?? null;
    const isCurrentPageDigitized = digitizedPages.has(currentPage);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const currentFields = useFieldStore((s) => s.getPageFields(currentPage));

    return (
        <div
            className="app"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onWheel={handleWheel}
        >
            <Toolbar
                currentPage={currentPage}
                numPages={numPages}
                scale={scale}
                mode={mode}
                annotationColor={annotationColor}
                showBBoxes={showBBoxes}
                isOCRRunning={isOCRRunning}
                isDigitized={isCurrentPageDigitized}
                onPrevPage={prevPage}
                onNextPage={nextPage}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                onZoomReset={zoomReset}
                onModeChange={setMode}
                onColorChange={setAnnotationColor}
                onToggleBBoxes={() => setShowBBoxes((v) => !v)}
                onRunOCR={runOCR}
                onExportPDF={handleExport}
                onOpenFile={handleOpenFile}
            />

            <div className="workspace">
                <main className="viewer-area">
                    <div
                        className="page-container"
                        style={canvasCSSSize.width > 0 ? {
                            width: canvasCSSSize.width,
                            height: canvasCSSSize.height,
                        } : undefined}
                    >
                        {/* Layer 1: PDF canvas + text layer */}
                        <PDFViewer
                            file={pdfFile}
                            currentPage={currentPage}
                            numPages={numPages}
                            scale={scale}
                            onDocumentLoadSuccess={handleDocumentLoad}
                            onPageLoadSuccess={handlePageLoadSuccess}
                            onPageProxy={handlePageProxy}
                            onPageRender={handlePageRender}
                        />

                        {/* Layer 2: OCR Bounding Box overlay — words have normalized [0-1] bboxes */}
                        {showBBoxes && (currentOCR || currentFields.length > 0) && (
                            <BoundingBoxOverlay
                                words={currentOCR?.words ?? []}
                                pageNumber={currentPage}
                                mode={mode}
                                fieldAnnotations={currentFields}
                            />
                        )}

                        {/* Layer 3: Text Highlight layer */}
                        <HighlightLayer
                            pageNumber={currentPage}
                            mode={mode}
                            containerDimensions={pageDimensions}
                            scale={scale}
                            color={annotationColor}
                        />

                        {/* Layer 4: Drawing layer (Fabric.js) */}
                        {pageDimensions.width > 0 && (
                            <DrawingLayer
                                pageNumber={currentPage}
                                mode={mode}
                                dimensions={pageDimensions}
                                scale={scale}
                                color={annotationColor}
                            />
                        )}
                    </div>
                </main>

                {/* Sidebar */}
                <Sidebar
                    currentPage={currentPage}
                    ocrResult={currentOCR}
                    isOCRRunning={isOCRRunning}
                />
            </div>
        </div>
    );
}

export default App;
