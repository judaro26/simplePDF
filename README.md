# ClearPDF

A privacy-first, static PDF tools starter intended for Netlify. Supported file operations run in the visitor's browser; there is no server-side file processing, account system, database, analytics, or ad-network integration in this version.

## Run locally

```sh
npm install
npm run dev
```

Build the deployable site with `npm run build`. Netlify is configured to publish `dist/` using `npm run build`.

## Supported tools

- Merge PDFs (up to 10 files, 50 MB each)
- Split into single-page PDFs by selected page numbers/ranges
- Extract selected pages
- Delete selected pages
- Rotate every page
- Convert JPG, PNG and WebP images to PDF
- Add a text watermark
- Add page numbers
- Edit title, author and subject metadata
- Add text, highlights, freehand marks, rectangles, and a drawn signature in the PDF Editor

The editor saves these additions as new PDF content and does not alter text already embedded in the document. Whiteout is a visual overlay, not secure redaction; original content may remain recoverable. Rotated pages and encrypted PDFs are not supported by the editor. OCR, compression, PDF-to-Office conversion, encryption and form filling are not implemented. This is not a complete replacement for every Sejda feature.

## Privacy and monetization notes

- The app does not send selected file bytes to a server. Files are held in memory for the current browser session and generated downloads are created locally.
- No analytics, cookie banner, account system, serverless upload function, or ad network is configured.
- The ad area is a placeholder. Before adding an ad vendor, review what it collects (including IP address, device identifiers and browsing activity), update the privacy notice and consent controls as legally required, and verify the vendor's behavior.
- Netlify, DNS providers, and other infrastructure providers may process request metadata such as IP addresses. Browser-only document processing does not mean the hosting site collects no data whatsoever.
- Do not market this as legally risk-free or promise immunity from lawsuits. Have qualified counsel review terms, privacy disclosures, intellectual-property issues, security headers, and applicable laws before launch.

## Important limitations

This is an early MVP. The PDF library may reject encrypted, malformed, very large, or unusual PDFs. Processing uses browser memory and is not appropriate to promise for every file or device. Test with representative documents and current browsers before public launch.
