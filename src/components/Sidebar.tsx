import React, { useState } from 'react';
import type { OCRResult, Annotation, FieldAnnotation } from '../types';
import { useAnnotationStore } from '../services/annotationStore';
import { useFieldStore } from '../services/fieldStore';

interface SidebarProps {
    currentPage: number;
    ocrResult: OCRResult | null;
    isOCRRunning: boolean;
}

type SidebarTab = 'ocr-text' | 'ocr-words' | 'annotations' | 'fields';

const Sidebar: React.FC<SidebarProps> = ({ currentPage, ocrResult, isOCRRunning }) => {
    const [activeTab, setActiveTab] = useState<SidebarTab>('ocr-text');

    const allAnnotations = useAnnotationStore((s) => s.annotations);
    const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);
    const getPageFields = useFieldStore((s) => s.getPageFields);
    const removeField = useFieldStore((s) => s.removeField);
    const updateLabel = useFieldStore((s) => s.updateLabel);

    const pageAnnotations: Annotation[] = allAnnotations.get(currentPage) ?? [];
    const pageFields: FieldAnnotation[] = getPageFields(currentPage);

    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
    const [editingLabel, setEditingLabel] = useState('');

    const confidenceLabel = (conf: number) => {
        if (conf >= 80) return 'high';
        if (conf >= 50) return 'medium';
        return 'low';
    };

    const startEditLabel = (field: FieldAnnotation) => {
        setEditingFieldId(field.id);
        setEditingLabel(field.label);
    };

    const saveLabel = (fieldId: string) => {
        if (editingLabel.trim()) updateLabel(fieldId, currentPage, editingLabel.trim());
        setEditingFieldId(null);
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-tabs">
                <button
                    className={`tab-btn ${activeTab === 'ocr-text' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ocr-text')}
                >
                    OCR Text
                </button>
                <button
                    className={`tab-btn ${activeTab === 'ocr-words' ? 'active' : ''}`}
                    onClick={() => setActiveTab('ocr-words')}
                >
                    Words
                    {ocrResult && <span className="tab-badge">{ocrResult.words.length}</span>}
                </button>
                <button
                    className={`tab-btn ${activeTab === 'fields' ? 'active' : ''}`}
                    onClick={() => setActiveTab('fields')}
                >
                    Fields
                    {pageFields.length > 0 && <span className="tab-badge">{pageFields.length}</span>}
                </button>
                <button
                    className={`tab-btn ${activeTab === 'annotations' ? 'active' : ''}`}
                    onClick={() => setActiveTab('annotations')}
                >
                    Markup
                    {pageAnnotations.length > 0 && <span className="tab-badge">{pageAnnotations.length}</span>}
                </button>
            </div>

            <div className="sidebar-content">
                {/* ── OCR Full Text ── */}
                {activeTab === 'ocr-text' && (
                    <div className="ocr-text-panel">
                        {isOCRRunning && (
                            <div className="ocr-running">
                                <span className="spinner" />
                                Running OCR on page {currentPage}…
                            </div>
                        )}
                        {!isOCRRunning && ocrResult ? (
                            <>
                                <p className="panel-meta">
                                    {ocrResult.words.length} words found on page {currentPage}
                                </p>
                                <pre className="ocr-text">{ocrResult.fullText || '(no text detected)'}</pre>
                            </>
                        ) : (
                            !isOCRRunning && (
                                <div className="empty-panel">
                                    <p>No OCR results yet.</p>
                                    <p>Click <strong>Run OCR</strong> in the toolbar.</p>
                                </div>
                            )
                        )}
                    </div>
                )}

                {/* ── Word List ── */}
                {activeTab === 'ocr-words' && (
                    <div className="ocr-words-panel">
                        {ocrResult && ocrResult.words.length > 0 ? (
                            <ul className="word-list">
                                {ocrResult.words.map((word) => (
                                    <li key={word.id} className="word-item">
                                        <span className="word-text">{word.text}</span>
                                        <span className={`word-confidence conf-${confidenceLabel(word.confidence)}`}>
                                            {Math.round(word.confidence)}%
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="empty-panel">
                                <p>Run OCR to see word list.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Fields Tab ── */}
                {activeTab === 'fields' && (
                    <div className="fields-panel">
                        {pageFields.length > 0 ? (
                            <>
                                <p className="panel-meta">{pageFields.length} field{pageFields.length !== 1 ? 's' : ''} on page {currentPage}</p>
                                <ul className="field-list">
                                    {pageFields.map((field) => (
                                        <li key={field.id} className="field-item">
                                            <div className="field-item-header">
                                                <span
                                                    className="field-color-dot"
                                                    style={{ backgroundColor: field.color }}
                                                />
                                                {editingFieldId === field.id ? (
                                                    <input
                                                        className="field-label-edit"
                                                        value={editingLabel}
                                                        onChange={(e) => setEditingLabel(e.target.value)}
                                                        onBlur={() => saveLabel(field.id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveLabel(field.id);
                                                            if (e.key === 'Escape') setEditingFieldId(null);
                                                        }}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span
                                                        className="field-label"
                                                        onClick={() => startEditLabel(field)}
                                                        title="Click to rename"
                                                    >
                                                        {field.label}
                                                    </span>
                                                )}
                                                <button
                                                    className="btn-remove-field"
                                                    onClick={() => removeField(field.id, currentPage)}
                                                    title="Remove field"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            <p className="field-value">"{field.value}"</p>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <div className="empty-panel">
                                <p>No fields annotated yet.</p>
                                <p>Switch to <strong>🏷 Field</strong> mode, click words to select, then label them.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Annotations ── */}
                {activeTab === 'annotations' && (
                    <div className="annotations-panel">
                        {pageAnnotations.length > 0 ? (
                            <ul className="annotation-list">
                                {pageAnnotations.map((ann) => (
                                    <li key={ann.id} className="annotation-item">
                                        <div className="ann-header">
                                            <span className="ann-color-dot" style={{ backgroundColor: ann.color }} />
                                            <span className="ann-type">{ann.type}</span>
                                            <button
                                                className="btn-remove-ann"
                                                onClick={() => removeAnnotation(ann.id, currentPage)}
                                                title="Remove"
                                            >
                                                ×
                                            </button>
                                        </div>
                                        {'text' in ann && ann.text && <p className="ann-text">"{ann.text}"</p>}
                                        {'bbox' in ann && (
                                            <p className="ann-bbox">
                                                ({Math.round(ann.bbox.x0)}, {Math.round(ann.bbox.y0)}) →
                                                ({Math.round(ann.bbox.x1)}, {Math.round(ann.bbox.y1)})
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="empty-panel">
                                <p>No markup annotations on this page.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
