import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        editor: fileURLToPath(new URL('./editor.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
        terms: fileURLToPath(new URL('./terms.html', import.meta.url)),
        guideIndex: fileURLToPath(new URL('./guides/index.html', import.meta.url)),
        guideEditPdf: fileURLToPath(new URL('./guides/edit-pdf.html', import.meta.url)),
        guideMergePdfs: fileURLToPath(new URL('./guides/merge-pdfs.html', import.meta.url)),
        guideSplitOrganize: fileURLToPath(new URL('./guides/split-organize.html', import.meta.url)),
        guideImagesToPdf: fileURLToPath(new URL('./guides/images-to-pdf.html', import.meta.url)),
        guideWatermarks: fileURLToPath(new URL('./guides/watermarks-and-numbers.html', import.meta.url)),
        guidePrivacy: fileURLToPath(new URL('./guides/privacy-and-files.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/pdf-lib/')) return 'pdf-engine';
          if (id.includes('/node_modules/jszip/')) return 'zip-engine';
          if (id.includes('/node_modules/pdfjs-dist/')) return 'pdfjs-engine';
        },
      },
    },
  },
});
