---
applyTo: "**"
---

# Project Overview

This workspace is a React + TypeScript application for viewing, annotating, and digitizing PDF documents using OCR.

The app must support:

- Rendering multi-page PDFs in the browser.
- Overlaying interactive annotation layers (highlights, boxes, drawings).
- Running OCR on scanned/image PDFs to extract text and bounding box coordinates.
- Visualizing OCR results as overlays on top of the PDF pages.
- Optionally exporting an annotated, searchable PDF with embedded text.

Use modern React (function components + hooks), strict TypeScript, and a clean separation of concerns.

# Tech Stack And Libraries

Preferred stack:

- React 18+, TypeScript, Vite.
- PDF rendering:
  - `react-pdf` (wrapping `pdfjs-dist`) for rendering pages, plus text and annotation layers.
- OCR (browser-side):
  - `tesseract.js` for client-side OCR in the browser via WebAssembly.
- PDF export:
  - `pdf-lib` for embedding OCR text and annotations into PDF files.
- Annotation / drawing:
  - `react-pdf-highlighter-plus` for text/area highlights on top of PDFs.
  - `fabric.js` for advanced drawing and shapes when needed.

When suggesting additional libraries, prefer mature, well-maintained, widely used ones.

# High-Level Architecture

Use a layered rendering model per PDF page:

1. **Canvas layer**  
   - PDF page rendered to `<canvas>` via PDF.js / `react-pdf`.

2. **Text layer**  
   - Transparent HTML `<span>` elements matching PDF text positions for selection/search.

3. **Annotation / overlay layer**  
   - Custom React components for:
     - OCR bounding boxes (word/line/region).
     - User annotations (highlights, rectangles, freehand drawings, comments).

4. **OCR processing layer**  
   - Background worker pipeline that:
     - Takes a rendered page canvas or image.
     - Runs Tesseract.js.
     - Returns recognized text and bounding boxes with coordinates and confidence.

Keep these responsibilities separated by components and service modules.

# File And Module Structure

Target structure:

- `src/components/`
  - `PDFViewer.tsx`          – core PDF rendering (Document/Page, navigation, scaling).
  - `BoundingBoxOverlay.tsx` – draws OCR bounding boxes over the PDF page.
  - `DrawingLayer.tsx`       – freehand/shape annotations (via Fabric.js or similar).
  - `HighlightLayer.tsx`     – text highlights and comments (e.g., using react-pdf-highlighter-plus).
  - `Toolbar.tsx`            – page navigation, zoom, and mode controls.
  - `Sidebar.tsx`            – OCR text view, selected word details, annotation list.
- `src/services/`
  - `ocrService.ts`          – Tesseract.js OCR utilities.
  - `pdfExport.ts`           – `pdf-lib` helpers for writing OCR text/annotations to PDF.
  - `annotationStore.ts`     – annotation data model and CRUD helpers.
- `src/types/`
  - `index.ts`               – shared TypeScript interfaces (OCR, annotations, etc.).
- `src/App.tsx`              – main composition (viewer + overlays + sidebar).
- `src/main.tsx`             – entry.

When generating new code, place it in the correct folder and keep each module focused.

# TypeScript And Coding Standards

- Use strict TypeScript (`strict: true`).
- Prefer explicit interfaces and types for:
  - OCR structures.
  - Annotation types.
  - Component props and events.
- Avoid `any` except for thin adapters to external libraries.
- Use function components + hooks only (no class components).

General guidelines:

- Prefer `const` where possible.
- Use descriptive names for components, hooks, and helpers.
- Extract subcomponents when a file grows too large.

# OCR Data Model

Use Tesseract.js to extract text and bounding boxes from the rendered page image.

Canonical types:

```ts
export interface OCRBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OCRWord {
  id: string; // stable id, e.g., `${pageNumber}-${index}`
  text: string;
  confidence: number;
  bbox: OCRBBox;
}

export interface OCRResult {
  pageNumber: number;
  words: OCRWord[];
  fullText: string;
}
```
Preferred OCR helper style:

```ts
import Tesseract from "tesseract.js";
import type { OCRResult, OCRWord } from "../types";

export async function runOCROnImageDataUrl(
  dataUrl: string,
  pageNumber: number,
  lang = "eng"
): Promise<OCRResult> {
  const { data } = await Tesseract.recognize(dataUrl, lang, { logger: () => {} });

  const words: OCRWord[] = data.words.map((w, idx) => ({
    id: `${pageNumber}-${idx}`,
    text: w.text,
    confidence: w.confidence,
    bbox: w.bbox, // x0, y0, x1, y1 in image pixels
  }));

  return {
    pageNumber,
    words,
    fullText: data.text,
  };
}
```

Assume bbox coordinates are pixel coordinates in the same space as the input image/canvas.

## Coordinate Systems
The code must make coordinate spaces explicit and use helper functions to transform between them.

### Canvas coordinates
- Origin at top-left (0, 0).
- X grows to the right, Y grows downward.
- Dimensions should match the rendered page size.

### Tesseract.js coordinates
- bbox.x0, bbox.y0, bbox.x1, bbox.y1 are pixel coordinates relative to the input image/canvas.
- Same origin and axis directions as the canvas.

### PDF.js / react-pdf coordinates
- PDF’s internal coordinate system uses bottom-left origin.
- PDF.js uses a viewport to map PDF coordinates to canvas coordinates:
  - page.getViewport({ scale }) returns a viewport with a transform matrix.

- Prefer using viewport transforms instead of manually guessing flips/scales.

When generating code that works with PDF.js directly, prefer:

- page.getViewport({ scale }) and its transform matrix.

- Explicit comments on what space inputs/outputs are in.

### Coordinate Transform Helpers
Centralize coordinate conversion in small, pure helper functions.

Normalization helpers:

```ts
import type { OCRBBox } from "../types";

export function normalizeBBox(
  bbox: OCRBBox,
  imgWidth: number,
  imgHeight: number
) {
  const width = imgWidth || 1;
  const height = imgHeight || 1;

  return {
    x0: bbox.x0 / width,
    y0: bbox.y0 / height,
    x1: bbox.x1 / width,
    y1: bbox.y1 / height,
  };
}

export function denormalizeBBox(
  n: { x0: number; y0: number; x1: number; y1: number },
  canvasWidth: number,
  canvasHeight: number
): OCRBBox {
  return {
    x0: n.x0 * canvasWidth,
    y0: n.y0 * canvasHeight,
    x1: n.x1 * canvasWidth,
    y1: n.y1 * canvasHeight,
  };
}
```

For PDF.js-specific transforms, Copilot should:

- Generate helper signatures like pdfToCanvasCoords or canvasToPdfCoords.
- Use viewport transform where possible (instead of magic numbers).
- Clearly document input/output coordinate spaces.

## Production-Quality Overlay UX
The overlay should prioritize readability and low visual noise:

- Draw boxes with borders + light translucent fill.
- No full text rendered inside the boxes by default.

- Use a detail panel (sidebar) to show the selected word’s text and metadata.

- Use hover/selected visual states to highlight which box is active.

### BoundingBoxOverlay component

```tsx
// src/components/BoundingBoxOverlay.tsx
import React from "react";
import type { OCRWord } from "../types";

export interface BoundingBoxOverlayProps {
  words: OCRWord[];
  canvasWidth: number;
  canvasHeight: number;
  selectedWordId: string | null;
  onWordClick?: (word: OCRWord) => void;
}

export const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({
  words,
  canvasWidth,
  canvasHeight,
  selectedWordId,
  onWordClick,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        pointerEvents: "none",
      }}
    >
      {words.map((word) => {
        const { x0, y0, x1, y1 } = word.bbox;
        const isSelected = word.id === selectedWordId;

        return (
          <div
            key={word.id}
            title={word.text} // small hover preview
            onClick={(e) => {
              e.stopPropagation();
              onWordClick?.(word);
            }}
            style={{
              position: "absolute",
              left: x0,
              top: y0,
              width: x1 - x0,
              height: y1 - y0,
              border: isSelected
                ? "2px solid rgba(37, 99, 235, 1)"
                : "1px solid rgba(59, 130, 246, 0.8)",
              backgroundColor: isSelected
                ? "rgba(59, 130, 246, 0.25)"
                : "rgba(59, 130, 246, 0.15)",
              borderRadius: 2,
              boxSizing: "border-box",
              cursor: "pointer",
              pointerEvents: "auto",
              transition: "border-color 0.1s ease, background-color 0.1s ease",
            }}
          />
        );
      })}
    </div>
  );
};
```

## Sidebar UX For OCR Text
The sidebar shows details of the selected OCR word and the page-level text.

```tsx 
// src/components/Sidebar.tsx
import React from "react";
import type { OCRResult, OCRWord } from "../types";

export interface SidebarProps {
  ocrResult: OCRResult | null;
  selectedWord: OCRWord | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  ocrResult,
  selectedWord,
}) => {
  return (
    <aside
      style={{
        width: 300,
        borderLeft: "1px solid #e5e7eb",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        backgroundColor: "#f9fafb",
      }}
    >
      <section>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Selected OCR Word
        </h3>

        {selectedWord ? (
          <>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "#6b7280",
                marginBottom: 4,
              }}
            >
              Text
            </label>
            <input
              type="text"
              readOnly
              value={selectedWord.text}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 13,
                borderRadius: 4,
                border: "1px solid #d1d5db",
                backgroundColor: "#f9fafb",
              }}
            />

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 8,
                fontSize: 12,
                color: "#4b5563",
              }}
            >
              <span>
                Confidence:{" "}
                <strong>{selectedWord.confidence.toFixed(1)}%</strong>
              </span>
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: "#9ca3af",
                lineHeight: 1.4,
              }}
            >
              <div>
                x0: {selectedWord.bbox.x0.toFixed(1)}, y0:{" "}
                {selectedWord.bbox.y0.toFixed(1)}
              </div>
              <div>
                x1: {selectedWord.bbox.x1.toFixed(1)}, y1:{" "}
                {selectedWord.bbox.y1.toFixed(1)}
              </div>
            </div>
          </>
        ) : (
          <p
            style={{
              fontSize: 12,
              color: "#9ca3af",
            }}
          >
            Click a box on the PDF to inspect its OCR text.
          </p>
        )}
      </section>

      <section style={{ flex: 1, minHeight: 0 }}>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Page OCR Text
        </h3>
        <textarea
          readOnly
          value={ocrResult?.fullText ?? ""}
          placeholder="Run OCR to see extracted text for this page."
          style={{
            width: "100%",
            height: "100%",
            minHeight: 140,
            resize: "none",
            padding: 8,
            fontSize: 12,
            lineHeight: 1.4,
            borderRadius: 4,
            border: "1px solid #d1d5db",
            backgroundColor: "#ffffff",
          }}
        />
      </section>
    </aside>
  );
};
```

## App Wiring Example
Minimal wiring between viewer, overlay, and sidebar:

```tsx
// src/App.tsx (excerpt)
import React, { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { OCRResult, OCRWord } from "./types";
import { BoundingBoxOverlay } from "./components/BoundingBoxOverlay";
import { Sidebar } from "./components/Sidebar";
import { runOCROnImageDataUrl } from "./services/ocrService";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PAGE_SCALE = 1.5;

export const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [selectedWord, setSelectedWord] = useState<OCRWord | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDocumentLoad = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handlePageRenderSuccess = useCallback(() => {
    const canvas = document.querySelector(
      ".react-pdf__Page__canvas"
    ) as HTMLCanvasElement | null;

    if (canvas) {
      setCanvasSize({ w: canvas.width, h: canvas.height });
    }
  }, []);

  const handleRunOCR = useCallback(async () => {
    const canvas = document.querySelector(
      ".react-pdf__Page__canvas"
    ) as HTMLCanvasElement | null;

    if (!canvas) return;

    setIsProcessing(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const result = await runOCROnImageDataUrl(dataUrl, currentPage);
      setOcrResult(result);
      setSelectedWord(null);
    } finally {
      setIsProcessing(false);
    }
  }, [currentPage]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Main viewer area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Toolbar */}
        <header
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files?. ?? null)}
          />
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            Prev
          </button>
          <span style={{ fontSize: 13 }}>
            Page {currentPage} / {numPages || "–"}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={!numPages || currentPage >= numPages}
          >
            Next
          </button>
          <button
            style={{ marginLeft: "auto" }}
            onClick={handleRunOCR}
            disabled={!file || isProcessing}
          >
            {isProcessing ? "Running OCR…" : "Run OCR"}
          </button>
        </header>

        {/* PDF + overlay */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: 16,
            position: "relative",
          }}
        >
          {file && (
            <Document file={file} onLoadSuccess={handleDocumentLoad}>
              <div
                style={{
                  position: "relative",
                  display: "inline-block",
                }}
              >
                <Page
                  pageNumber={currentPage}
                  scale={PAGE_SCALE}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  onRenderSuccess={handlePageRenderSuccess}
                />

                {ocrResult &&
                  ocrResult.pageNumber === currentPage && (
                    <BoundingBoxOverlay
                      words={ocrResult.words}
                      canvasWidth={canvasSize.w}
                      canvasHeight={canvasSize.h}
                      selectedWordId={selectedWord?.id ?? null}
                      onWordClick={setSelectedWord}
                    />
                  )}
              </div>
            </Document>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar ocrResult={ocrResult} selectedWord={selectedWord} />
    </div>
  );
};
```

