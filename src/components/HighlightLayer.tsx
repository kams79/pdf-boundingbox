import React, { useRef, useCallback, useState } from 'react';
import type { AnnotationMode, HighlightAnnotation, PageDimensions } from '../types';
import { useAnnotationStore } from '../services/annotationStore';

interface HighlightLayerProps {
    pageNumber: number;
    mode: AnnotationMode;
    /** Container reference to compute offset */
    containerDimensions: PageDimensions;
    scale: number;
    color: string;
}

interface SelectionState {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    text: string;
}

/**
 * Lightweight text highlight layer.
 * When in 'highlight' mode: captures mouse selection inside the PDF text layer
 * and stores it as a HighlightAnnotation.
 */
const HighlightLayer: React.FC<HighlightLayerProps> = ({
    pageNumber,
    mode,
    containerDimensions,
    scale,
    color,
}) => {
    const layerRef = useRef<HTMLDivElement>(null);
    const [pendingHighlight, setPendingHighlight] = useState<SelectionState | null>(null);
    const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
    const highlights = useAnnotationStore((s) =>
        (s.getPageAnnotations(pageNumber) as HighlightAnnotation[]).filter(
            (a) => a.type === 'highlight'
        )
    );

    const handleMouseUp = useCallback(() => {
        if (mode !== 'highlight') return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const text = selection.toString().trim();
        if (!text) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = layerRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        const highlight: SelectionState = {
            x0: (rect.left - containerRect.left) / scale,
            y0: (rect.top - containerRect.top) / scale,
            x1: (rect.right - containerRect.left) / scale,
            y1: (rect.bottom - containerRect.top) / scale,
            text,
        };

        setPendingHighlight(highlight);
        selection.removeAllRanges();
    }, [mode, scale]);

    const confirmHighlight = useCallback(() => {
        if (!pendingHighlight) return;
        const annotation: HighlightAnnotation = {
            id: crypto.randomUUID(),
            pageNumber,
            type: 'highlight',
            color,
            createdAt: Date.now(),
            text: pendingHighlight.text,
            bbox: {
                x0: pendingHighlight.x0,
                y0: pendingHighlight.y0,
                x1: pendingHighlight.x1,
                y1: pendingHighlight.y1,
            },
        };
        addAnnotation(annotation);
        setPendingHighlight(null);
    }, [pendingHighlight, pageNumber, color, addAnnotation]);

    return (
        <div
            ref={layerRef}
            className="highlight-layer"
            style={{
                width: containerDimensions.width * scale,
                height: containerDimensions.height * scale,
                pointerEvents: mode === 'highlight' ? 'all' : 'none',
            }}
            onMouseUp={handleMouseUp}
        >
            {/* Render saved highlights */}
            {highlights.map((h) => (
                <div
                    key={h.id}
                    className="highlight-annotation"
                    style={{
                        left: h.bbox.x0 * scale,
                        top: h.bbox.y0 * scale,
                        width: (h.bbox.x1 - h.bbox.x0) * scale,
                        height: (h.bbox.y1 - h.bbox.y0) * scale,
                        backgroundColor: h.color + '55',
                        borderBottom: `2px solid ${h.color}`,
                    }}
                    title={h.text}
                />
            ))}

            {/* Pending highlight confirmation */}
            {pendingHighlight && (
                <div
                    className="highlight-pending"
                    style={{
                        left: pendingHighlight.x0 * scale,
                        top: pendingHighlight.y0 * scale,
                        width: (pendingHighlight.x1 - pendingHighlight.x0) * scale,
                        height: (pendingHighlight.y1 - pendingHighlight.y0) * scale,
                    }}
                >
                    <button className="btn-confirm-highlight" onClick={confirmHighlight}>
                        Highlight
                    </button>
                </div>
            )}
        </div>
    );
};

export default HighlightLayer;
