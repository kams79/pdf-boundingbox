import { create } from 'zustand';
import type { FieldAnnotation, OCRBBox, OCRWord } from '../types';

/** Palette of distinct colors cycled for new fields */
const FIELD_COLORS = [
    '#6c63ff', '#e74c3c', '#2ecc71', '#f39c12',
    '#1abc9c', '#e91e63', '#3498db', '#ff5722',
    '#9b59b6', '#00bcd4',
];

/** Merge multiple [0,1]-normalized bboxes into one encompassing bbox */
export function mergeBBoxes(bboxes: OCRBBox[]): OCRBBox {
    return {
        x0: Math.min(...bboxes.map((b) => b.x0)),
        y0: Math.min(...bboxes.map((b) => b.y0)),
        x1: Math.max(...bboxes.map((b) => b.x1)),
        y1: Math.max(...bboxes.map((b) => b.y1)),
    };
}

interface FieldState {
    fields: Map<number, FieldAnnotation[]>;
    colorIndex: number;

    /** Create a field from selected OCR words */
    addField: (pageNumber: number, label: string, words: OCRWord[]) => FieldAnnotation;
    /** Create a field from a freely-drawn bounding box, with optional captured text */
    addFieldRect: (pageNumber: number, label: string, bbox: OCRBBox, value?: string, wordIds?: string[]) => FieldAnnotation;
    removeField: (id: string, pageNumber: number) => void;
    updateLabel: (id: string, pageNumber: number, label: string) => void;
    clearPage: (pageNumber: number) => void;
    clearAll: () => void;
    getPageFields: (pageNumber: number) => FieldAnnotation[];
}

function storeField(
    set: (fn: (s: FieldState) => Partial<FieldState>) => void,
    _get: () => FieldState,
    field: FieldAnnotation
): FieldAnnotation {
    set((s) => {
        const next = new Map(s.fields);
        const existing = next.get(field.pageNumber) ?? [];
        next.set(field.pageNumber, [...existing, field]);
        return { fields: next, colorIndex: s.colorIndex + 1 };
    });
    return field;
}

export const useFieldStore = create<FieldState>((set, get) => ({
    fields: new Map(),
    colorIndex: 0,

    addField: (pageNumber, label, words) => {
        const color = FIELD_COLORS[get().colorIndex % FIELD_COLORS.length];
        const field: FieldAnnotation = {
            id: crypto.randomUUID(),
            pageNumber,
            label,
            value: words.map((w) => w.text).join(' '),
            bbox: mergeBBoxes(words.map((w) => w.bbox)),
            wordIds: words.map((w) => w.id),
            color,
            createdAt: Date.now(),
        };
        return storeField(set, get, field);
    },

    addFieldRect: (pageNumber, label, bbox, value = '', wordIds = []) => {
        const color = FIELD_COLORS[get().colorIndex % FIELD_COLORS.length];
        const field: FieldAnnotation = {
            id: crypto.randomUUID(),
            pageNumber,
            label,
            value,
            bbox,
            wordIds,
            color,
            createdAt: Date.now(),
        };
        return storeField(set, get, field);
    },

    removeField: (id, pageNumber) =>
        set((s) => {
            const next = new Map(s.fields);
            next.set(pageNumber, (next.get(pageNumber) ?? []).filter((f) => f.id !== id));
            return { fields: next };
        }),

    updateLabel: (id, pageNumber, label) =>
        set((s) => {
            const next = new Map(s.fields);
            next.set(
                pageNumber,
                (next.get(pageNumber) ?? []).map((f) => (f.id === id ? { ...f, label } : f))
            );
            return { fields: next };
        }),

    clearPage: (pageNumber) =>
        set((s) => {
            const next = new Map(s.fields);
            next.delete(pageNumber);
            return { fields: next };
        }),

    clearAll: () => set({ fields: new Map(), colorIndex: 0 }),

    getPageFields: (pageNumber) => get().fields.get(pageNumber) ?? [],
}));
