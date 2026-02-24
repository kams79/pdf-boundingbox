import React, { useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';
import type { AnnotationMode, PageDimensions, FreehandAnnotation, RectAnnotation } from '../types';
import { useAnnotationStore } from '../services/annotationStore';

interface DrawingLayerProps {
    pageNumber: number;
    mode: AnnotationMode;
    dimensions: PageDimensions;
    scale: number;
    color: string;
}

const DrawingLayer: React.FC<DrawingLayerProps> = ({
    pageNumber,
    mode,
    dimensions,
    scale,
    color,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const addAnnotation = useAnnotationStore((s) => s.addAnnotation);

    const width = dimensions.width * scale;
    const height = dimensions.height * scale;

    // Initialize Fabric.js canvas
    useEffect(() => {
        if (!canvasRef.current) return;
        const fc = new fabric.Canvas(canvasRef.current, {
            width,
            height,
            selection: false,
            isDrawingMode: false,
        });
        fabricRef.current = fc;

        return () => {
            fc.dispose();
            fabricRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Resize when scale or dimensions change
    useEffect(() => {
        const fc = fabricRef.current;
        if (!fc) return;
        fc.setWidth(width);
        fc.setHeight(height);
        fc.renderAll();
    }, [width, height]);

    // Set drawing mode based on annotation mode
    useEffect(() => {
        const fc = fabricRef.current;
        if (!fc) return;

        fc.isDrawingMode = mode === 'freehand';
        fc.selection = mode === 'none';

        if (mode === 'freehand' && fc.freeDrawingBrush) {
            fc.freeDrawingBrush.color = color;
            fc.freeDrawingBrush.width = 2;
        }
    }, [mode, color]);

    // Rectangle drawing via mouse events
    const rectRef = useRef<fabric.Rect | null>(null);
    const startPointRef = useRef<{ x: number; y: number } | null>(null);

    const onMouseDown = useCallback(
        (opt: fabric.IEvent<MouseEvent>) => {
            if (mode !== 'rectangle') return;
            const fc = fabricRef.current;
            if (!fc) return;
            const pointer = fc.getPointer(opt.e);
            startPointRef.current = { x: pointer.x, y: pointer.y };
            const rect = new fabric.Rect({
                left: pointer.x,
                top: pointer.y,
                width: 0,
                height: 0,
                fill: 'transparent',
                stroke: color,
                strokeWidth: 2,
                selectable: false,
            });
            fc.add(rect);
            rectRef.current = rect;
        },
        [mode, color]
    );

    const onMouseMove = useCallback(
        (opt: fabric.IEvent<MouseEvent>) => {
            if (mode !== 'rectangle' || !rectRef.current || !startPointRef.current) return;
            const fc = fabricRef.current;
            if (!fc) return;
            const pointer = fc.getPointer(opt.e);
            const rect = rectRef.current;
            rect.set({
                left: Math.min(pointer.x, startPointRef.current.x),
                top: Math.min(pointer.y, startPointRef.current.y),
                width: Math.abs(pointer.x - startPointRef.current.x),
                height: Math.abs(pointer.y - startPointRef.current.y),
            });
            fc.renderAll();
        },
        [mode]
    );

    const onMouseUp = useCallback(
        (opt: fabric.IEvent<MouseEvent>) => {
            if (mode !== 'rectangle' || !rectRef.current || !startPointRef.current) return;
            const fc = fabricRef.current;
            if (!fc) return;
            const pointer = fc.getPointer(opt.e);
            const annotation: RectAnnotation = {
                id: crypto.randomUUID(),
                pageNumber,
                type: 'rectangle',
                color,
                createdAt: Date.now(),
                bbox: {
                    x0: Math.min(pointer.x, startPointRef.current.x) / scale,
                    y0: Math.min(pointer.y, startPointRef.current.y) / scale,
                    x1: Math.max(pointer.x, startPointRef.current.x) / scale,
                    y1: Math.max(pointer.y, startPointRef.current.y) / scale,
                },
            };
            addAnnotation(annotation);
            rectRef.current = null;
            startPointRef.current = null;
        },
        [mode, pageNumber, color, scale, addAnnotation]
    );

    // Freehand path completed
    const onPathCreated = useCallback(
        (opt: { path: fabric.Path }) => {
            const annotation: FreehandAnnotation = {
                id: crypto.randomUUID(),
                pageNumber,
                type: 'freehand',
                color,
                createdAt: Date.now(),
                fabricJson: JSON.stringify(opt.path.toObject()),
            };
            addAnnotation(annotation);
        },
        [pageNumber, color, addAnnotation]
    );

    // Bind / unbind Fabric events
    useEffect(() => {
        const fc = fabricRef.current;
        if (!fc) return;
        fc.on('mouse:down', onMouseDown);
        fc.on('mouse:move', onMouseMove);
        fc.on('mouse:up', onMouseUp);
        fc.on('path:created', onPathCreated as (e: fabric.IEvent) => void);
        return () => {
            fc.off('mouse:down', onMouseDown);
            fc.off('mouse:move', onMouseMove);
            fc.off('mouse:up', onMouseUp);
            fc.off('path:created', onPathCreated as (e: fabric.IEvent) => void);
        };
    }, [onMouseDown, onMouseMove, onMouseUp, onPathCreated]);

    const isActive = mode === 'freehand' || mode === 'rectangle';

    return (
        <canvas
            ref={canvasRef}
            className="drawing-layer"
            style={{
                pointerEvents: isActive ? 'all' : 'none',
                cursor: mode === 'freehand' ? 'crosshair' : mode === 'rectangle' ? 'crosshair' : 'default',
            }}
        />
    );
};

export default DrawingLayer;
