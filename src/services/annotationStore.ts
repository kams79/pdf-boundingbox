import { create } from 'zustand';
import type { Annotation } from '../types';

interface AnnotationState {
    /** Map from pageNumber (1-based) to list of annotations */
    annotations: Map<number, Annotation[]>;
    addAnnotation: (annotation: Annotation) => void;
    removeAnnotation: (id: string, pageNumber: number) => void;
    clearPage: (pageNumber: number) => void;
    clearAll: () => void;
    getPageAnnotations: (pageNumber: number) => Annotation[];
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
    annotations: new Map(),

    addAnnotation: (annotation) =>
        set((state) => {
            const next = new Map(state.annotations);
            const existing = next.get(annotation.pageNumber) ?? [];
            next.set(annotation.pageNumber, [...existing, annotation]);
            return { annotations: next };
        }),

    removeAnnotation: (id, pageNumber) =>
        set((state) => {
            const next = new Map(state.annotations);
            const existing = next.get(pageNumber) ?? [];
            next.set(
                pageNumber,
                existing.filter((a) => a.id !== id)
            );
            return { annotations: next };
        }),

    clearPage: (pageNumber) =>
        set((state) => {
            const next = new Map(state.annotations);
            next.delete(pageNumber);
            return { annotations: next };
        }),

    clearAll: () => set({ annotations: new Map() }),

    getPageAnnotations: (pageNumber) => {
        return get().annotations.get(pageNumber) ?? [];
    },
}));
