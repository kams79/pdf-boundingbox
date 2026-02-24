# PDF BoundingBox

A browser-based PDF viewer with OCR, automatic text detection, and field annotation. Built with React, TypeScript, and Vite.

---

## Features

- **PDF Rendering** — Open any PDF via file dialog or drag-and-drop
- **OCR** — Run Tesseract.js OCR on scanned pages; bounding boxes overlay each word
- **Auto-detect digitized PDFs** — Pre-digitized PDFs show bounding boxes instantly (no OCR needed)
- **Field Annotation** — Two ways to label a field:
  - **Click words** to select (Shift+click for multi-select) → label the selection
  - **Draw a rectangle** → captures only characters inside the box with proportional slicing
- **Fields Sidebar** — View, rename, and delete labeled fields per page
- **Export** — Download a searchable PDF with embedded OCR text

---

## Tech Stack

| Package | Purpose |
|---|---|
| [react-pdf](https://github.com/wojtekmaj/react-pdf) | PDF rendering |
| [tesseract.js](https://tesseract.projectnaptha.com/) | Browser OCR |
| [pdf-lib](https://pdf-lib.js.org/) | PDF export with embedded text |
| [zustand](https://zustand-demo.pmnd.rs/) | State management |
| Vite + React + TypeScript | Build toolchain |

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Usage

1. **Open a PDF** — click **Open PDF** or drag a file onto the viewer
2. **Scanned PDF** — click **🔍 Run OCR**; word bounding boxes appear automatically
3. **Digitized PDF** — bounding boxes appear instantly with a **✅ Pre-digitized** badge
4. **Annotate fields** — switch to **🏷 Field** mode:
   - *Click a word* to select → shift+click to add more → **Label as Field**
   - *Click and drag* on any area → type a field name → **Save**
5. **View fields** — open the **Fields** tab in the sidebar to rename or remove
6. **Export** — click **Export PDF** to download a searchable PDF

---

## Deployment (Vercel)

This project is optimized for deployment on **Vercel**:

1. **Push your code** to a GitHub/GitLab/Bitbucket repository.
2. **Import the project** in the [Vercel Dashboard](https://vercel.com/new).
3. **Framework Preset**: Vercel will automatically detect **Vite**.
4. **Build Settings**:
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. **Click Deploy**.

> [!NOTE]
> The PDF worker and Tesseract OCR scripts are loaded from CDNs, so they will work out-of-the-box on Vercel without additional static asset configuration.

---

## Project Structure

```
src/
├── components/
│   ├── PDFViewer.tsx          # react-pdf wrapper
│   ├── BoundingBoxOverlay.tsx # word/field overlays + draw-rect
│   ├── Toolbar.tsx            # menu bar
│   └── Sidebar.tsx            # OCR text, words, fields tabs
├── services/
│   ├── ocrService.ts          # Tesseract.js OCR pipeline
│   ├── pdfTextExtractor.ts    # Embedded text auto-extraction
│   ├── fieldStore.ts          # Zustand field annotation store
│   ├── annotationStore.ts     # Zustand markup store
│   └── pdfExport.ts           # pdf-lib export
├── utils/
│   └── textCapture.ts         # Character-level text extraction in bbox
└── types/index.ts             # Shared TypeScript interfaces
```

---

## License

MIT
