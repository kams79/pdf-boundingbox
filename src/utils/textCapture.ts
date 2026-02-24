import type { OCRBBox, OCRWord } from '../types';

interface CaptureResult {
    text: string;
    wordIds: string[];
}

/**
 * Extract only the characters from `words` that fall inside `box`.
 *
 * Algorithm per word:
 *   1. Skip words whose vertical midpoint is outside the box (not on the right row).
 *   2. If the word is fully inside horizontally → take the whole word text.
 *   3. If the word partially overlaps → slice characters proportionally,
 *      assuming uniform character spacing within the word.
 *
 * Results are sorted in natural reading order (top → bottom, left → right).
 */
export function captureTextInBox(words: OCRWord[], box: OCRBBox): CaptureResult {
    type Entry = { text: string; id: string; y0: number; x0: number };
    const captured: Entry[] = [];

    for (const word of words) {
        // ── Vertical containment: word's center row must be inside the box ──
        const cy = (word.bbox.y0 + word.bbox.y1) / 2;
        if (cy < box.y0 || cy > box.y1) continue;

        // ── Horizontal overlap ───────────────────────────────────────────────
        const overlapX0 = Math.max(word.bbox.x0, box.x0);
        const overlapX1 = Math.min(word.bbox.x1, box.x1);
        if (overlapX0 >= overlapX1) continue; // no horizontal intersection

        const wordW = word.bbox.x1 - word.bbox.x0;
        const n = word.text.length;
        if (n === 0) continue;

        let extracted: string;

        if (word.bbox.x0 >= box.x0 && word.bbox.x1 <= box.x1) {
            // Fully inside — keep entire word
            extracted = word.text;
        } else {
            // Partially inside — slice characters proportionally
            // (assuming uniform character width within the word)
            const startRatio = Math.max(0, (box.x0 - word.bbox.x0) / wordW);
            const endRatio = Math.min(1, (box.x1 - word.bbox.x0) / wordW);
            const startChar = Math.round(startRatio * n);
            const endChar = Math.round(endRatio * n);
            extracted = word.text.slice(startChar, endChar).trim();
        }

        if (extracted) {
            captured.push({ text: extracted, id: word.id, y0: word.bbox.y0, x0: overlapX0 });
        }
    }

    // Sort into reading order: top-to-bottom rows, then left-to-right
    const ROW_TOL = 0.008; // ~0.8% of page height = same line
    captured.sort((a, b) => {
        if (Math.abs(a.y0 - b.y0) > ROW_TOL) return a.y0 - b.y0;
        return a.x0 - b.x0;
    });

    return {
        text: captured.map((c) => c.text).join(' '),
        wordIds: captured.map((c) => c.id),
    };
}
