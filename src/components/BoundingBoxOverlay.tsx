import React, { useState, useCallback, useRef } from 'react';
import type { OCRWord, AnnotationMode, FieldAnnotation, OCRBBox } from '../types';
import { useFieldStore } from '../services/fieldStore';
import { captureTextInBox } from '../utils/textCapture';

interface BoundingBoxOverlayProps {
    words: OCRWord[];
    pageNumber: number;
    mode: AnnotationMode;
    fieldAnnotations: FieldAnnotation[];
}

interface TooltipState { word: OCRWord; x: number; y: number; }
interface Point { x: number; y: number; }
interface LabelPopupState { x: number; y: number; }
interface DragState { start: Point; current: Point; }

const confidenceColor = (c: number) =>
    c >= 80 ? 'rgba(72,199,142,.25)' : c >= 50 ? 'rgba(255,193,7,.25)' : 'rgba(249,65,68,.25)';
const confidenceBorder = (c: number) =>
    c >= 80 ? 'rgba(72,199,142,.8)' : c >= 50 ? 'rgba(255,193,7,.8)' : 'rgba(249,65,68,.8)';

/** Min drag size in normalized units before we treat it as a drawn rect */
const MIN_RECT = 0.01;

const BoundingBoxOverlay: React.FC<BoundingBoxOverlayProps> = ({
    words, pageNumber, mode, fieldAnnotations,
}) => {
    const overlayRef = useRef<HTMLDivElement>(null);
    /** Stores words touched by the drawn rect (for wordIds in the field) */
    const pendingWordsRef = useRef<OCRWord[]>([]);
    /** Stores the precisely-sliced text from captureTextInBox */
    const capturedTextRef = useRef<string>('');

    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [labelPopup, setLabelPopup] = useState<LabelPopupState | null>(null);
    const [labelInput, setLabelInput] = useState('');

    // Drag-to-draw rectangle state
    const [dragState, setDragState] = useState<DragState | null>(null);
    /** bbox of a completed drag, waiting for the user to type a label */
    const [pendingRect, setPendingRect] = useState<OCRBBox | null>(null);

    const addField = useFieldStore((s) => s.addField);
    const addFieldRect = useFieldStore((s) => s.addFieldRect);
    const removeField = useFieldStore((s) => s.removeField);

    // wordId → which field contains it (for coloring)
    const wordFieldMap: Record<string, FieldAnnotation> = {};
    for (const fa of fieldAnnotations)
        for (const wid of fa.wordIds) wordFieldMap[wid] = fa;

    const isFieldMode = mode === 'field';

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Convert a mouse event to normalized [0,1] coords relative to the overlay */
    const toNorm = useCallback((e: React.MouseEvent | MouseEvent): Point => {
        const rect = overlayRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return {
            x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
        };
    }, []);

    // ── Word-click selection ───────────────────────────────────────────────────

    const handleWordClick = useCallback((e: React.MouseEvent, word: OCRWord) => {
        if (!isFieldMode) return;
        e.stopPropagation();
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (e.shiftKey) {
                if (next.has(word.id)) next.delete(word.id);
                else next.add(word.id);
            } else if (next.has(word.id) && next.size === 1) {
                next.delete(word.id);
            } else {
                next.clear();
                next.add(word.id);
            }
            return next;
        });
        setLabelPopup(null);
    }, [isFieldMode]);

    // ── Drag-to-draw rect ─────────────────────────────────────────────────────

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!isFieldMode) return;
        // Only on the overlay background itself (not child elements)
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        const pt = toNorm(e);
        setDragState({ start: pt, current: pt });
        setSelectedIds(new Set());
        setLabelPopup(null);
        setPendingRect(null);
    }, [isFieldMode, toNorm]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!dragState) return;
        setDragState((prev) => prev ? { ...prev, current: toNorm(e) } : null);
    }, [dragState, toNorm]);

    const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!dragState) return;
        const end = toNorm(e);
        const bbox: OCRBBox = {
            x0: Math.min(dragState.start.x, end.x),
            y0: Math.min(dragState.start.y, end.y),
            x1: Math.max(dragState.start.x, end.x),
            y1: Math.max(dragState.start.y, end.y),
        };
        setDragState(null);

        // Ignore tiny accidental drags (they're just background clicks)
        if ((bbox.x1 - bbox.x0) < MIN_RECT || (bbox.y1 - bbox.y0) < MIN_RECT) {
            setSelectedIds(new Set());
            setLabelPopup(null);
            return;
        }

        // ── Capture characters that fall inside the drawn rect ───────────────
        const { text: capturedText, wordIds: capturedIds } = captureTextInBox(words, bbox);
        pendingWordsRef.current = words.filter((w) => capturedIds.includes(w.id));
        capturedTextRef.current = capturedText;
        setPendingRect(bbox);

        // Show label popup near the mouse
        const overlayRect = overlayRef.current?.getBoundingClientRect();
        setLabelInput('');
        setLabelPopup({
            x: e.clientX - (overlayRect?.left ?? 0),
            y: e.clientY - (overlayRect?.top ?? 0),
        });
    }, [dragState, toNorm, words]);

    // ── Label popup: "Annotate" button (word selection flow) ──────────────────

    const openPopupForSelection = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const overlayRect = overlayRef.current?.getBoundingClientRect();
        setLabelInput('');
        setLabelPopup({ x: e.clientX - (overlayRect?.left ?? 0), y: e.clientY - (overlayRect?.top ?? 0) });
    }, []);

    // ── Save field ─────────────────────────────────────────────────────────────

    const handleSaveField = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        const label = labelInput.trim();
        if (!label) return;

        if (pendingRect) {
            // Rect-drawn field — use precisely sliced text
            const captured = pendingWordsRef.current;
            addFieldRect(
                pageNumber,
                label,
                pendingRect,
                capturedTextRef.current,
                captured.map((w) => w.id)
            );
            pendingWordsRef.current = [];
            capturedTextRef.current = '';
            setPendingRect(null);
        } else if (selectedIds.size > 0) {
            const selectedWords = words.filter((w) => selectedIds.has(w.id));
            addField(pageNumber, label, selectedWords);
            setSelectedIds(new Set());
        }
        setLabelPopup(null);
        setLabelInput('');
    }, [labelInput, pendingRect, selectedIds, words, addField, addFieldRect, pageNumber]);

    const cancelPopup = useCallback(() => {
        setLabelPopup(null);
        setPendingRect(null);
        setSelectedIds(new Set());
    }, []);

    // ── Derived ────────────────────────────────────────────────────────────────

    const selectedWords = words.filter((w) => selectedIds.has(w.id));
    const hasWordSelection = selectedWords.length > 0 && !pendingRect;

    // Drag preview computed values
    let previewStyle: React.CSSProperties | null = null;
    if (dragState) {
        const x0 = Math.min(dragState.start.x, dragState.current.x);
        const y0 = Math.min(dragState.start.y, dragState.current.y);
        const w = Math.abs(dragState.current.x - dragState.start.x);
        const h = Math.abs(dragState.current.y - dragState.start.y);
        previewStyle = {
            left: `${x0 * 100}%`,
            top: `${y0 * 100}%`,
            width: `${w * 100}%`,
            height: `${h * 100}%`,
        };
    }

    return (
        <div
            ref={overlayRef}
            className="bounding-box-overlay"
            data-field-mode={isFieldMode ? 'true' : undefined}
            style={isFieldMode ? { cursor: dragState ? 'crosshair' : 'crosshair', pointerEvents: 'all' } : undefined}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* ── OCR word boxes ────────────────────────────────────────────── */}
            {words.map((word) => {
                const isSelected = selectedIds.has(word.id);
                const fieldForWord = wordFieldMap[word.id];
                return (
                    <div
                        key={word.id}
                        className={`bbox-word${isSelected ? ' bbox-selected' : ''}${fieldForWord ? ' bbox-labeled' : ''}`}
                        style={{
                            left: `${word.bbox.x0 * 100}%`,
                            top: `${word.bbox.y0 * 100}%`,
                            width: `${(word.bbox.x1 - word.bbox.x0) * 100}%`,
                            height: `${(word.bbox.y1 - word.bbox.y0) * 100}%`,
                            backgroundColor: isSelected
                                ? 'rgba(108,99,255,.3)'
                                : fieldForWord ? fieldForWord.color + '22'
                                    : confidenceColor(word.confidence),
                            borderColor: isSelected
                                ? '#6c63ff'
                                : fieldForWord ? fieldForWord.color
                                    : confidenceBorder(word.confidence),
                            cursor: isFieldMode ? 'pointer' : 'default',
                            zIndex: isSelected ? 25 : fieldForWord ? 22 : 10,
                            pointerEvents: 'all',
                        }}
                        onClick={(e) => handleWordClick(e, word)}
                        onMouseEnter={(e) => !isFieldMode && setTooltip({ word, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                    />
                );
            })}

            {/* ── Saved field bounding boxes ───────────────────────────────── */}
            {fieldAnnotations.map((fa) => (
                <div
                    key={fa.id}
                    className="field-label-box"
                    style={{
                        left: `${fa.bbox.x0 * 100}%`,
                        top: `${fa.bbox.y0 * 100}%`,
                        width: `${(fa.bbox.x1 - fa.bbox.x0) * 100}%`,
                        height: `${(fa.bbox.y1 - fa.bbox.y0) * 100}%`,
                        borderColor: fa.color,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <span className="field-label-tag" style={{ background: fa.color }}>{fa.label}</span>
                    {isFieldMode && (
                        <button
                            className="field-delete-btn"
                            onClick={(e) => { e.stopPropagation(); removeField(fa.id, pageNumber); }}
                            title="Remove field"
                        >×</button>
                    )}
                </div>
            ))}

            {/* ── Drag-to-draw preview ─────────────────────────────────────── */}
            {previewStyle && (
                <div className="field-draw-preview" style={previewStyle} />
            )}

            {/* ── "Label as Field" action bar (word selection) ─────────────── */}
            {isFieldMode && hasWordSelection && !labelPopup && (
                <div className="field-selection-bar" onClick={(e) => e.stopPropagation()}>
                    <span className="selection-count">
                        {selectedWords.length} word{selectedWords.length !== 1 ? 's' : ''} selected
                    </span>
                    <button className="btn-annotate-field" onClick={openPopupForSelection}>
                        Label as Field
                    </button>
                    <button className="btn-clear-selection" onClick={() => setSelectedIds(new Set())}>✕</button>
                </div>
            )}

            {/* ── Label input popup ─────────────────────────────────────────── */}
            {labelPopup && (
                <form
                    className="field-label-popup"
                    style={{ left: labelPopup.x, top: labelPopup.y }}
                    onSubmit={handleSaveField}
                    onClick={(e) => e.stopPropagation()}
                >
                    <label className="popup-label">
                        {pendingRect ? 'Field name (drawn rect)' : 'Field name'}
                    </label>
                    <input
                        className="popup-input"
                        type="text"
                        placeholder="e.g. Invoice Number"
                        value={labelInput}
                        onChange={(e) => setLabelInput(e.target.value)}
                        autoFocus
                    />
                    {selectedWords.length > 0 && (
                        <div className="popup-preview">"{selectedWords.map((w) => w.text).join(' ')}"</div>
                    )}
                    <div className="popup-actions">
                        <button type="submit" className="btn-save-field" disabled={!labelInput.trim()}>
                            Save
                        </button>
                        <button type="button" className="btn-cancel-field" onClick={cancelPopup}>
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* ── Hover tooltip (non-field mode) ───────────────────────────── */}
            {tooltip && !isFieldMode && (
                <div className="bbox-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y + 12, position: 'fixed' }}>
                    <span className="tooltip-text">"{tooltip.word.text}"</span>
                    <span className="tooltip-confidence" style={{ color: confidenceBorder(tooltip.word.confidence) }}>
                        {Math.round(tooltip.word.confidence)}% confidence
                    </span>
                </div>
            )}
        </div>
    );
};

export default BoundingBoxOverlay;
