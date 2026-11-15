import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import './style.css';
import './panel.css';

const tools = [
  { id: 'editor', title: 'PDF Editor', description: 'Add text, highlights, drawings, and a signature.', icon: '✎', category: 'Edit', ready: true, editor: true },
  { id: 'merge', title: 'Merge PDFs', description: 'Combine documents in the order you choose.', icon: '▤', category: 'Organize', ready: true, multi: true },
  { id: 'split', title: 'Split PDF', description: 'Save selected page ranges as separate PDFs.', icon: '⫽', category: 'Organize', ready: true },
  { id: 'extract', title: 'Extract pages', description: 'Create a new PDF from selected pages.', icon: '↗', category: 'Organize', ready: true },
  { id: 'delete', title: 'Delete pages', description: 'Remove pages you don’t need.', icon: '⌫', category: 'Organize', ready: true },
  { id: 'rotate', title: 'Rotate pages', description: 'Rotate every page by 90°, 180° or 270°.', icon: '⟳', category: 'Organize', ready: true },
  { id: 'image-pdf', title: 'Images to PDF', description: 'Turn JPG, PNG or WebP images into a PDF.', icon: '▧', category: 'Convert', ready: true, images: true, multi: true },
  { id: 'watermark', title: 'Add watermark', description: 'Stamp text across every page.', icon: '◈', category: 'Edit', ready: true },
  { id: 'number', title: 'Page numbers', description: 'Add a page number to each page.', icon: '№', category: 'Edit', ready: true },
  { id: 'metadata', title: 'Edit metadata', description: 'Update title, author and document details.', icon: '✎', category: 'Edit', ready: true },
  { id: 'compress', title: 'Compress PDF', description: 'Reduce file size while preserving quality.', icon: '⇲', category: 'Optimize', ready: false },
  { id: 'ocr', title: 'OCR a scan', description: 'Make scanned pages searchable.', icon: '⌕', category: 'Convert', ready: false },
  { id: 'pdf-word', title: 'PDF to Word', description: 'Convert PDF content to an editable document.', icon: 'W', category: 'Convert', ready: false },
  { id: 'protect', title: 'Protect PDF', description: 'Encrypt a PDF with a password.', icon: '♙', category: 'Security', ready: false },
  { id: 'sign', title: 'Fill & sign', description: 'Fill forms and add a signature.', icon: '✍', category: 'Edit', ready: false },
];

const state = { tool: 'merge', files: [], busy: false, query: '' };
const app = document.querySelector('#app');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function selectedTool() { return tools.find((tool) => tool.id === state.tool); }
function fmtBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

function render() {
  const chosen = selectedTool();
  const filter = state.query.trim().toLowerCase();
  const visibleTools = tools.filter((tool) => `${tool.title} ${tool.category} ${tool.description}`.toLowerCase().includes(filter));
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#home" aria-label="ClearPDF home"><span class="brand-mark">C</span><span>clear<span class="brand-accent">pdf</span></span></a>
      <nav class="topnav" aria-label="Main navigation"><a href="#tools">All tools</a><a href="#privacy">Privacy</a><a class="nav-cta" href="#workspace">Open a tool <span>↗</span></a></nav>
      <button class="mobile-menu" aria-label="Open tools" id="mobile-menu">☰</button>
    </header>

    <main id="home">
      <section class="hero wrap">
        <div class="hero-copy">
          <div class="eyebrow"><span class="eyebrow-dot"></span> PRIVATE BY DESIGN · FREE TO USE</div>
          <h1>Your PDFs.<br /><span>Still yours.</span></h1>
          <p class="hero-lede">Simple PDF tools that work right in your browser. Your files stay on your device—not on our servers.</p>
          <div class="hero-actions"><a class="button button-primary" href="#workspace">Choose a PDF tool <span>→</span></a><div class="trust-note"><span class="lock-icon">▣</span><span><b>No upload.</b><br />Processing happens locally.</span></div></div>
          <div class="hero-proof"><span class="proof-check">✓</span> No account needed <i></i> Files stay in your browser <i></i> No ad scripts by default</div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <div class="paper-shadow"></div><div class="paper"><div class="paper-top"><span class="paper-badge">PDF</span><span class="paper-dots">•••</span></div><div class="paper-title-line"></div><div class="paper-sub-line"></div><div class="paper-rule"></div><div class="paper-row"><span></span><span></span></div><div class="paper-row short"><span></span><span></span></div><div class="paper-row"><span></span><span></span></div><div class="paper-chart"><b></b><b></b><b></b><b></b><b></b><b></b></div><div class="paper-row"><span></span><span></span></div><div class="paper-row short"><span></span><span></span></div><div class="paper-footer">DOCUMENT PREVIEW</div></div>
          <div class="float-card float-card-top"><span class="float-icon violet">✦</span><span><b>100% local</b><small>on your device</small></span></div><div class="float-card float-card-bottom"><span class="float-icon green">✓</span><span><b>File stays yours</b><small>no upload needed</small></span></div>
          <div class="spark spark-a">✳</div><div class="spark spark-b">✦</div>
        </div>
      </section>

      <section class="ad-wrap wrap" aria-label="Advertisement"><div class="ad-slot"><span class="ad-label">ADVERTISEMENT</span><span class="ad-copy">A quiet space for a privacy-respecting sponsor.</span><span class="ad-tag">Ad spot</span></div></section>

      <section class="workspace wrap" id="workspace">
        <div class="section-head"><div><div class="eyebrow">THE PDF TOOLKIT</div><h2>What do you need to do?</h2><p>Choose a tool. Supported processing stays in this browser tab.</p></div><div class="search-box"><span>⌕</span><input id="tool-search" type="search" placeholder="Find a tool" value="${escapeHtml(state.query)}" aria-label="Find a tool" /></div></div>
        <div class="tool-layout">
          <div class="tool-list" id="tool-list">${visibleTools.map((tool) => `<button class="tool-card ${tool.id === state.tool ? 'active' : ''} ${tool.ready ? '' : 'not-ready'}" data-tool="${tool.id}"><span class="tool-icon">${tool.icon}</span><span class="tool-text"><b>${escapeHtml(tool.title)}</b><small>${escapeHtml(tool.description)}</small></span>${tool.ready ? '<span class="tool-arrow">↗</span>' : '<span class="soon-tag">Soon</span>'}</button>`).join('')}</div>
          <section class="tool-panel" aria-live="polite" id="tool-panel">
            <div class="panel-top"><div><div class="panel-category">${chosen.category.toUpperCase()} TOOL</div><h3>${escapeHtml(chosen.title)}</h3><p>${escapeHtml(chosen.description)}</p></div><span class="panel-shield">▣</span></div>
            ${chosen.ready ? renderForm(chosen) : `<div class="coming-soon"><span class="soon-illustration">✦</span><b>On the roadmap</b><p>We’re expanding the toolkit. This feature isn’t available in this early version.</p></div>`}
          </section>
        </div>
      </section>

      <section class="privacy-section" id="privacy"><div class="wrap privacy-grid"><div><div class="eyebrow">A DIFFERENT KIND OF PDF TOOL</div><h2>Privacy isn’t a setting.<br /><span>It’s the starting point.</span></h2><p>Most online PDF tools upload files to a server for processing. ClearPDF is designed to handle supported tasks locally in your browser instead.</p><a class="text-link" href="#privacy-details">How we handle your files <span>→</span></a></div><div class="privacy-points" id="privacy-details"><article><span class="point-icon">⌑</span><div><b>Your file stays on your device</b><p>Supported operations run in your browser. The app does not send document contents to a ClearPDF backend.</p></div></article><article><span class="point-icon">⟲</span><div><b>No file archive</b><p>This app creates no account or server-side document history. Reloading clears the working session. Your browser and hosting provider may retain ordinary local or request data.</p></div></article><article><span class="point-icon">◎</span><div><b>Ads are separate</b><p>No ad or analytics scripts are active in this version. Hosting providers may log connection metadata. A future ad provider may collect device or usage data.</p></div></article></div></div></section>
      <section class="more-section wrap"><div class="more-copy"><div class="eyebrow">MORE TO COME</div><h2>Useful tools.<br />No unnecessary extras.</h2><p>OCR, conversion, compression and advanced editing need additional engines. We’ll only add them when they can meet the same clear privacy standard.</p></div><div class="more-chips"><span>PDF to Word</span><span>OCR scans</span><span>Compress PDF</span><span>Fill & sign</span><span>Password protect</span><span>PDF to images</span><span>Crop pages</span><span>PDF to Excel</span></div></section>
    </main>
    <footer class="footer"><div class="wrap footer-inner"><a class="brand" href="#home"><span class="brand-mark">C</span><span>clear<span class="brand-accent">pdf</span></span></a><span>PDF tools that keep your documents on your device.</span><div><a href="privacy.html">Privacy notice</a><a href="terms.html">Terms</a></div></div><div class="wrap footer-small">© ${new Date().getFullYear()} ClearPDF. Independent project; not affiliated with Sejda. This website is provided “as is” and is not legal, financial or professional advice.</div></footer>
  `;
  bindEvents();
}

function renderForm(tool) {
  if (tool.editor) return `<div class="editor-launch"><span class="editor-launch-icon">✎</span><b>Open the browser-based editor</b><p>Add text and markups, draw shapes or a signature, and download a new copy. Your file stays on your device.</p><a class="button button-primary editor-launch-button" href="/editor.html">Open PDF editor <span>→</span></a><small>Existing text editing and secure redaction are not supported by this editor yet.</small></div>`;
  const accepts = tool.images ? 'image/jpeg,image/png,image/webp' : 'application/pdf,.pdf';
  const multiple = tool.multi ? 'multiple' : '';
  const files = state.files.map((file, index) => `<div class="file-row"><span class="file-type">${tool.images ? 'IMG' : 'PDF'}</span><span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}<small>${fmtBytes(file.size)}</small></span>${tool.multi ? `<button class="move-file" data-move="${index}" aria-label="Move file up" ${index === 0 ? 'disabled' : ''}>↑</button>` : ''}<button class="remove-file" data-remove="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button></div>`).join('');
  return `<div class="drop-zone ${state.files.length ? 'has-files' : ''}" id="drop-zone"><input id="file-input" type="file" accept="${accepts}" ${multiple} hidden /><div class="upload-icon">↑</div><b>${state.files.length ? 'Add another file' : tool.images ? 'Drop your images here' : 'Drop your PDF here'}</b><span>or <button class="browse-button" id="browse">browse files</button></span><small>${tool.images ? 'JPG, PNG or WebP · up to 50 MB per file' : `PDF · up to 50 MB${tool.multi ? ' per file' : ''}`}</small></div>
  ${files ? `<div class="file-list">${files}</div>` : ''}
  ${state.files.length && tool.ready ? renderOptions(tool) : ''}
  <div class="panel-footer"><div class="footer-meta">${state.files.length ? '<button class="clear-session" id="clear-session">Clear files</button>' : ''}<div class="local-note"><span>▣</span> Files processed in this browser</div></div><button class="button button-primary run-button" id="run-tool" ${state.files.length ? '' : 'disabled'}>${state.busy ? '<span class="spinner"></span> Working…' : `${actionLabel(tool)} <span>→</span>`}</button></div><div class="status-line" id="status-line" role="status"></div>`;
}

function renderOptions(tool) {
  switch (tool.id) {
    case 'split': return `<label class="field-label" for="page-ranges">Page ranges <span>Use commas between ranges, e.g. 1-3, 5</span></label><input class="text-field" id="page-ranges" placeholder="1-3, 5" />`;
    case 'extract': return `<label class="field-label" for="page-ranges">Pages to extract <span>Use commas between ranges, e.g. 1-3, 5</span></label><input class="text-field" id="page-ranges" placeholder="1-3, 5" />`;
    case 'delete': return `<label class="field-label" for="page-ranges">Pages to remove <span>Use commas between ranges, e.g. 2, 4-6</span></label><input class="text-field" id="page-ranges" placeholder="2, 4-6" />`;
    case 'rotate': return `<label class="field-label" for="rotation">Rotate pages <span>Applies to every page</span></label><select class="text-field" id="rotation"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">270° clockwise</option><option value="-90">90° counterclockwise</option></select>`;
    case 'watermark': return `<label class="field-label" for="watermark-text">Watermark text</label><input class="text-field" id="watermark-text" maxlength="80" placeholder="CONFIDENTIAL" />`;
    case 'number': return `<label class="field-label" for="number-format">Number format <span>Use {n} for the page number</span></label><input class="text-field" id="number-format" maxlength="40" value="{n}" />`;
    case 'metadata': return `<div class="metadata-fields"><label class="field-label">Title<input class="text-field" id="meta-title" placeholder="Document title" /></label><label class="field-label">Author<input class="text-field" id="meta-author" placeholder="Author name" /></label><label class="field-label">Subject<input class="text-field" id="meta-subject" placeholder="Subject" /></label></div>`;
    default: return '';
  }
}

function actionLabel(tool) {
  return ({ editor: 'Open PDF editor', merge: 'Merge PDFs', split: 'Split PDF', extract: 'Extract pages', delete: 'Save updated PDF', rotate: 'Rotate PDF', 'image-pdf': 'Create PDF', watermark: 'Add watermark', number: 'Add page numbers', metadata: 'Save metadata' })[tool.id] || 'Continue';
}

function bindEvents() {
  document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
    const next = tools.find((tool) => tool.id === button.dataset.tool);
    if (!next.ready) return;
    state.tool = next.id; state.files = []; render();
  }));
  document.querySelector('#tool-search')?.addEventListener('input', (event) => {
    const caret = event.target.selectionStart; state.query = event.target.value; render();
    const field = document.querySelector('#tool-search'); field?.focus(); field?.setSelectionRange(caret, caret);
  });
  document.querySelector('#mobile-menu')?.addEventListener('click', () => document.querySelector('#workspace').scrollIntoView({ behavior: 'smooth' }));
  const fileInput = document.querySelector('#file-input');
  document.querySelector('#browse')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (event) => addFiles([...event.target.files]));
  const dropZone = document.querySelector('#drop-zone');
  dropZone?.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('dragging'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone?.addEventListener('drop', (event) => { event.preventDefault(); dropZone.classList.remove('dragging'); addFiles([...event.dataTransfer.files]); });
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => { state.files.splice(Number(button.dataset.remove), 1); render(); }));
  document.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => { const i = Number(button.dataset.move); [state.files[i - 1], state.files[i]] = [state.files[i], state.files[i - 1]]; render(); }));
  document.querySelector('#clear-session')?.addEventListener('click', () => { state.files = []; render(); });
  document.querySelector('#run-tool')?.addEventListener('click', runTool);
}

function addFiles(files) {
  const tool = selectedTool();
  const ok = files.filter((file) => (tool.images ? /^image\/(jpeg|png|webp)$/.test(file.type) : file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) && file.size <= 50 * 1024 * 1024);
  const oversized = files.some((file) => file.size > 50 * 1024 * 1024);
  if (!tool.multi) state.files = [];
  state.files = [...state.files, ...ok].slice(0, tool.multi ? 10 : 1);
  render();
  const message = oversized ? 'Files must be 50 MB or smaller.' : ok.length < files.length ? `Some files were skipped. Choose ${tool.images ? 'JPG, PNG or WebP' : 'PDF'} files.` : '';
  if (message) setStatus(message, 'error');
}

function setStatus(message, type = '') {
  const line = document.querySelector('#status-line');
  if (line) { line.textContent = message; line.className = `status-line ${type}`; }
}

function parsePages(value, count) {
  const pages = new Set();
  for (const chunk of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    const match = chunk.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Enter pages as numbers or ranges, like 1-3, 5.');
    const start = Number(match[1]); const end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > count) throw new Error(`Page ranges must be between 1 and ${count}.`);
    for (let n = start; n <= end; n++) pages.add(n - 1);
  }
  if (!pages.size) throw new Error('Enter at least one page or range.');
  return [...pages].sort((a, b) => a - b);
}

async function loadPdf(file) {
  return PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false, ignoreEncryption: false });
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
async function savePdf(doc, sourceName) {
  const bytes = await doc.save();
  const base = sourceName.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  triggerDownload(new Blob([bytes], { type: 'application/pdf' }), `${base}-clearpdf.pdf`);
}

async function runTool() {
  const tool = selectedTool();
  if (!state.files.length || state.busy) return;
  state.busy = true; render(); setStatus('Working locally in your browser. Keep this tab open…');
  try {
    if (tool.id === 'merge') await mergePdfs();
    else if (tool.id === 'image-pdf') await imagesToPdf();
    else if (tool.id === 'split') await splitPdf();
    else await editSinglePdf(tool.id);
    setStatus('Done. Your download should start automatically.', 'success');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not process this file. Try another PDF.', 'error');
  } finally { state.busy = false; document.querySelector('#run-tool')?.removeAttribute('disabled'); const button = document.querySelector('#run-tool'); if (button) button.innerHTML = `${actionLabel(tool)} <span>→</span>`; }
}

async function mergePdfs() {
  if (state.files.length < 2) throw new Error('Choose at least two PDFs to merge.');
  const output = await PDFDocument.create();
  for (const file of state.files) {
    const doc = await loadPdf(file);
    const pages = await output.copyPages(doc, doc.getPageIndices()); pages.forEach((page) => output.addPage(page));
  }
  await savePdf(output, 'merged');
}

async function imagesToPdf() {
  const output = await PDFDocument.create();
  for (const file of state.files) {
    const bytes = await file.arrayBuffer(); let image;
    if (file.type === 'image/jpeg') image = await output.embedJpg(bytes);
    else if (file.type === 'image/png') image = await output.embedPng(bytes);
    else {
      const bitmap = await createImageBitmap(file); const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0); const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      image = await output.embedJpg(await blob.arrayBuffer()); bitmap.close();
    }
    const page = output.addPage([image.width, image.height]); page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  await savePdf(output, 'images');
}

async function splitPdf() {
  const source = await loadPdf(state.files[0]); const indices = parsePages(document.querySelector('#page-ranges').value, source.getPageCount());
  const archive = new JSZip();
  for (const index of indices) {
    const output = await PDFDocument.create(); output.addPage((await output.copyPages(source, [index]))[0]);
    archive.file(`page-${index + 1}.pdf`, await output.save());
  }
  const blob = await archive.generateAsync({ type: 'blob' });
  const base = state.files[0].name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_');
  triggerDownload(blob, `${base}-split.zip`);
}

async function editSinglePdf(id) {
  const doc = await loadPdf(state.files[0]); const count = doc.getPageCount();
  if (id === 'extract') {
    const indices = parsePages(document.querySelector('#page-ranges').value, count); const output = await PDFDocument.create();
    (await output.copyPages(doc, indices)).forEach((page) => output.addPage(page)); await savePdf(output, state.files[0].name); return;
  }
  if (id === 'delete') {
    const remove = new Set(parsePages(document.querySelector('#page-ranges').value, count));
    if (remove.size === count) throw new Error('At least one page must remain in the document.');
    [...remove].sort((a, b) => b - a).forEach((index) => doc.removePage(index));
  } else if (id === 'rotate') {
    const amount = Number(document.querySelector('#rotation').value);
    doc.getPages().forEach((page) => page.setRotation(degrees((page.getRotation().angle + amount + 360) % 360)));
  } else if (id === 'watermark') {
    const text = document.querySelector('#watermark-text').value.trim(); if (!text) throw new Error('Enter text for your watermark.');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const page of doc.getPages()) { const { width, height } = page.getSize(); const size = Math.min(width, height) / 10; page.drawText(text, { x: width * 0.12, y: height * 0.45, size, font, color: rgb(0.42, 0.48, 0.52), opacity: 0.24, rotate: degrees(-35), maxWidth: width * 0.78 }); }
  } else if (id === 'number') {
    const format = document.querySelector('#number-format').value || '{n}'; const font = await doc.embedFont(StandardFonts.Helvetica); const pages = doc.getPages();
    pages.forEach((page, index) => { const { width } = page.getSize(); const text = format.replaceAll('{n}', String(index + 1)); page.drawText(text, { x: width - 48, y: 20, size: 10, font, color: rgb(0.36, 0.42, 0.46) }); });
  } else if (id === 'metadata') {
    const title = document.querySelector('#meta-title').value.trim(); const author = document.querySelector('#meta-author').value.trim(); const subject = document.querySelector('#meta-subject').value.trim();
    if (!title && !author && !subject) throw new Error('Enter at least one metadata field to update.');
    if (title) doc.setTitle(title); if (author) doc.setAuthor(author); if (subject) doc.setSubject(subject);
  }
  await savePdf(doc, state.files[0].name);
}

render();
