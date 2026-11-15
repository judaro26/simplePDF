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
