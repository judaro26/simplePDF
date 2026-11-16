# SimplexPDF

A privacy-first, static PDF tools site for SimplexPDF, intended for Netlify. Supported file operations run in the visitor's browser; there is no server-side file processing, account system, database, analytics, or ad-network integration in this version.

## Run locally

```sh
npm install
npm run dev
```

Build the deployable site with `npm run build`. Netlify is configured to publish `dist/` using `npm run build`.

## Guides and disclosures

Original walkthroughs live under `guides/` and are published at `/guides/`. `privacy.html` and `terms.html` are product-specific draft disclosures. Complete the operator name/address, contact, effective date, hosting-provider details, children/audience statement, and jurisdiction with qualified counsel before public launch.

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
- Fill standard interactive AcroForm text fields, checkboxes, dropdowns, option lists, and radio groups; optionally flatten the output
- Click a text run and edit directly on the page, with font family, size, bold, italic, underline, color, and alignment controls; insert, move, and resize JPG/PNG/WebP images; add highlights, freehand marks, rectangles, and a drawn signature

Text editing covers the selected text visually and adds replacement text. It does not rewrite the original PDF text stream: the original wording may remain selectable or extractable, so this is not secure redaction or a confidentiality tool. Embedded fonts are reused when they can be safely re-embedded; otherwise a close standard font is used. Font, color, and spacing matches are therefore best-effort. Images are embedded locally and can be positioned/resized. Form filling supports standard AcroForm fields; XFA, scanned/printed forms, and cryptographic digital signatures are not supported. Rotated pages and encrypted PDFs are not supported by the editor. OCR, compression, PDF-to-Office conversion, encryption, and creating new fillable form fields are not implemented. This is not a complete replacement for every Sejda feature.

## Privacy and monetization notes

- The app does not send selected file bytes to a server. Files are held in memory for the current browser session and generated downloads are created locally.
- No analytics, account system, serverless upload function, or active ad units are configured. The AdSense site-verification script is loaded; the labeled ad placements remain placeholders and no ads/revenue are active yet.
- Activating ad serving requires account/site approval, ad-unit IDs, a verified domain, and any consent-management disclosures or controls required for your audience. Review what Google and any CMP collect, update the Privacy Notice, and verify live requests before serving ads. Never encourage users to click ads.
- Netlify, DNS providers, and other infrastructure providers may process request metadata such as IP addresses. Browser-only document processing does not mean the hosting site collects no data whatsoever.
- Do not market this as legally risk-free or promise immunity from lawsuits. Have qualified counsel review terms, privacy disclosures, intellectual-property issues, security headers, and applicable laws before launch.

## Important limitations

This is an early MVP. The PDF library may reject encrypted, malformed, very large, or unusual PDFs. Processing uses browser memory and is not appropriate to promise for every file or device. Test with representative documents and current browsers before public launch.
