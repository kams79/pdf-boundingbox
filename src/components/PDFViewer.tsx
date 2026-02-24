import React, { useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import type { PageDimensions } from '../types';

// Configure PDF.js worker — must resolve from the same pdfjs-dist version
// that react-pdf bundles (4.8.69). Using a direct CDN URL avoids any
// local package resolution issues across build tools.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
    file: File | string | null;
    currentPage: number;
    numPages: number;
    scale: number;
    onDocumentLoadSuccess: (numPages: number) => void;
    onPageLoadSuccess: (dimensions: PageDimensions) => void;
    /** Called with the raw pdf.js page proxy — used for embedded text extraction */
    onPageProxy: (proxy: unknown, pageNumber: number) => void;
    /** Called after a page is rendered — passes the page canvas for OCR */
    onPageRender: (canvas: HTMLCanvasElement, pageNumber: number) => void;
}

const PDFViewer: React.FC<PDFViewerProps> = ({
    file,
    currentPage,
    scale,
    onDocumentLoadSuccess,
    onPageLoadSuccess,
    onPageProxy,
    onPageRender,
}) => {
    const pageWrapperRef = useRef<HTMLDivElement>(null);

    const handleDocumentLoad = useCallback(
        ({ numPages }: { numPages: number }) => {
            onDocumentLoadSuccess(numPages);
        },
        [onDocumentLoadSuccess]
    );

    const handlePageLoad = useCallback(
        (page: { width: number; height: number }) => {
            onPageLoadSuccess({ width: page.width, height: page.height });
            // Forward the full proxy object so the parent can call getTextContent()
            onPageProxy(page, currentPage);
        },
        [onPageLoadSuccess, onPageProxy, currentPage]
    );

    const handleRenderSuccess = useCallback(() => {
        // After react-pdf renders, grab the canvas from the DOM
        const wrapper = pageWrapperRef.current;
        if (!wrapper) return;
        const canvas = wrapper.querySelector('canvas');
        if (canvas) {
            onPageRender(canvas, currentPage);
        }
    }, [currentPage, onPageRender]);

    if (!file) {
        return (
            <div className="pdf-viewer-empty">
                <div className="empty-state">
                    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z"
                            stroke="currentColor"
                            strokeWidth="2"
                        />
                        <path d="M40 4V16H52" stroke="currentColor" strokeWidth="2" />
                        <path d="M22 32H42M22 40H36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <p>Drop a PDF here or use the open button</p>
                </div>
            </div>
        );
    }

    return (
        <div className="pdf-viewer" ref={pageWrapperRef}>
            <Document
                file={file}
                onLoadSuccess={handleDocumentLoad}
                loading={<div className="pdf-loading">Loading PDF…</div>}
                error={<div className="pdf-error">Failed to load PDF.</div>}
            >
                <Page
                    pageNumber={currentPage}
                    scale={scale}
                    onLoadSuccess={handlePageLoad}
                    onRenderSuccess={handleRenderSuccess}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                />
            </Document>
        </div>
    );
};

export default PDFViewer;
