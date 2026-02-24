import React, { useRef } from 'react';
import type { AnnotationMode } from '../types';

interface ToolbarProps {
    currentPage: number;
    numPages: number;
    scale: number;
    mode: AnnotationMode;
    annotationColor: string;
    showBBoxes: boolean;
    isOCRRunning: boolean;
    /** True when the current page has embedded text (already digitized) */
    isDigitized: boolean;
    onPrevPage: () => void;
    onNextPage: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    onModeChange: (mode: AnnotationMode) => void;
    onColorChange: (color: string) => void;
    onToggleBBoxes: () => void;
    onRunOCR: () => void;
    onExportPDF: () => void;
    onOpenFile: (file: File) => void;
}

const MODES: { mode: AnnotationMode; label: string; icon: string }[] = [
    { mode: 'field', label: 'Field', icon: '🏷' },
];

const Toolbar: React.FC<ToolbarProps> = ({
    currentPage,
    numPages,
    scale,
    mode,
    annotationColor,
    showBBoxes,
    isOCRRunning,
    isDigitized,
    onPrevPage,
    onNextPage,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onModeChange,
    onColorChange,
    onToggleBBoxes,
    onRunOCR,
    onExportPDF,
    onOpenFile,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onOpenFile(file);
        e.target.value = '';
    };

    return (
        <header className="toolbar">
            {/* Open file */}
            <div className="toolbar-group">
                <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                    📂 Open PDF
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
            </div>

            <div className="toolbar-divider" />

            {/* Page navigation */}
            <div className="toolbar-group">
                <button className="btn btn-icon" onClick={onPrevPage} disabled={currentPage <= 1}>
                    ‹
                </button>
                <span className="toolbar-label">
                    {numPages > 0 ? `${currentPage} / ${numPages}` : '—'}
                </span>
                <button className="btn btn-icon" onClick={onNextPage} disabled={currentPage >= numPages}>
                    ›
                </button>
            </div>

            <div className="toolbar-divider" />

            {/* Zoom */}
            <div className="toolbar-group">
                <button className="btn btn-icon" onClick={onZoomOut}>−</button>
                <button className="btn btn-zoom" onClick={onZoomReset} title="Reset zoom">
                    {Math.round(scale * 100)}%
                </button>
                <button className="btn btn-icon" onClick={onZoomIn}>+</button>
            </div>

            <div className="toolbar-divider" />

            {/* Annotation modes */}
            <div className="toolbar-group">
                {MODES.map(({ mode: m, label, icon }) => (
                    <button
                        key={m}
                        className={`btn btn-mode ${mode === m ? 'active' : ''}`}
                        onClick={() => onModeChange(m)}
                        title={label}
                    >
                        <span className="mode-icon">{icon}</span>
                        <span className="mode-label">{label}</span>
                    </button>
                ))}
            </div>

            <div className="toolbar-divider" />

            {/* Color picker */}
            <div className="toolbar-group">
                <label className="toolbar-label" htmlFor="annotation-color">Color</label>
                <input
                    id="annotation-color"
                    type="color"
                    value={annotationColor}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="color-picker"
                    title="Annotation color"
                />
            </div>

            <div className="toolbar-divider" />

            {/* OCR controls */}
            <div className="toolbar-group">
                {isDigitized && (
                    <span className="badge-digitized" title="This page has embedded text — bounding boxes are from the PDF itself">
                        ✅ Pre-digitized
                    </span>
                )}
                <button
                    className={`btn ${showBBoxes ? 'btn-bbox-on' : 'btn-bbox-off'}`}
                    onClick={onToggleBBoxes}
                    title="Toggle bounding boxes"
                >
                    {showBBoxes ? '🔲 Hide Boxes' : '🔳 Show Boxes'}
                </button>
                <button
                    className="btn btn-ocr"
                    onClick={onRunOCR}
                    disabled={isOCRRunning || numPages === 0 || isDigitized}
                    title={isDigitized ? 'Page already has embedded text' : 'Run Tesseract OCR on this page'}
                >
                    {isOCRRunning ? '⏳ Running OCR…' : isDigitized ? '✓ Already Digitized' : '🔍 Run OCR'}
                </button>
            </div>

            <div className="toolbar-divider" />

            {/* Export */}
            <div className="toolbar-group">
                <button
                    className="btn btn-export"
                    onClick={onExportPDF}
                    disabled={numPages === 0}
                    title="Export searchable PDF"
                >
                    ⬇ Export PDF
                </button>
            </div>
        </header>
    );
};

export default Toolbar;
