// ─── OCR Types ───────────────────────────────────────────────────────────────

export interface OCRBBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface OCRWord {
    id: string; // stable id, e.g. `${pageNumber}-${index}`
    text: string;
    confidence: number;
    bbox: OCRBBox;
}

export interface OCRResult {
    pageNumber: number;
    words: OCRWord[];
    fullText: string;
}

// ─── Page Dimensions ─────────────────────────────────────────────────────────

export interface PageDimensions {
    width: number;
    height: number;
}

// ─── Annotation Types ────────────────────────────────────────────────────────

export type AnnotationMode = 'none' | 'highlight' | 'rectangle' | 'freehand' | 'comment' | 'field';

export interface AnnotationBase {
    id: string;
    pageNumber: number;
    createdAt: number;
    color: string;
}

export interface RectAnnotation extends AnnotationBase {
    type: 'rectangle';
    bbox: OCRBBox;
}

export interface HighlightAnnotation extends AnnotationBase {
    type: 'highlight';
    text: string;
    bbox: OCRBBox;
}

export interface FreehandAnnotation extends AnnotationBase {
    type: 'freehand';
    /** Fabric.js serialized path JSON */
    fabricJson: string;
}

export interface CommentAnnotation extends AnnotationBase {
    type: 'comment';
    text: string;
    position: { x: number; y: number };
}

export type Annotation =
    | RectAnnotation
    | HighlightAnnotation
    | FreehandAnnotation
    | CommentAnnotation;

// ─── Field Annotation ────────────────────────────────────────────────────────

/**
 * A labeled field annotation — created by selecting one or more OCR/embedded
 * text words and giving the selection a field name (e.g. "Invoice Number").
 */
export interface FieldAnnotation {
    id: string;
    pageNumber: number;
    /** User-supplied field label, e.g. "Invoice Number", "Date" */
    label: string;
    /** Concatenated text content of all selected words */
    value: string;
    /** Combined bounding box of all selected words (normalized [0,1]) */
    bbox: OCRBBox;
    /** IDs of the individual OCR words that make up this field */
    wordIds: string[];
    color: string;
    createdAt: number;
}

// ─── App State ───────────────────────────────────────────────────────────────

export interface AppState {
    currentPage: number;
    numPages: number;
    scale: number;
    mode: AnnotationMode;
    isOCRRunning: boolean;
    ocrResults: Map<number, OCRResult>;
}
