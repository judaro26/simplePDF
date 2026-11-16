import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './editor.css';
import './editor-responsive.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const app = document.querySelector('#editor-app');
const fontkitRegisteredDocs = new WeakSet();
const toolHelp = {
  select: 'Click existing text to edit it in place. Use the formatting bar to style selected or newly added text.',
  text: 'Click the page to place the text from the inspector. This adds text; it does not directly rewrite existing PDF text.',
  highlight: 'Drag across an area to add a translucent highlight.',
  draw: 'Draw freehand on the page. Strokes are saved into the exported PDF.',
  signature: 'Draw your signature with a mouse, stylus, or touch input.',
  rect: 'Drag to add a stroked rectangle.',
  whiteout: 'Drag to cover content with a white box. This is visual-only, not secure redaction.',
  image: 'Click the page to place the selected image. Drag it to move; use the corner handle to resize.',
};
const state = { file: null, bytes: null, pdf: null, pageProxy: null, pageNumber: 1, pageCount: 0, mode: 'select', annotations: [], textItems: [], textStyles: {}, viewport: null, scale: 1, renderToken: 0, draft: null, selectedText: null, selectedImage: null, imageDrag: null, pendingImage: null, textStyle: { family: 'match', size: 18, bold: false, italic: false, underline: false, color: '#167c69', align: 'left' }, busy: false };

app.innerHTML = `
  <header class="editor-topbar">
    <a class="editor-brand" href="/"><span class="brand-mark">S</span> SimplexPDF <small>Editor</small></a>
    <span class="editor-doc-name" id="doc-name">No document loaded</span>
    <div class="editor-head-actions">
      <input type="file" id="pdf-input" accept="application/pdf,.pdf" hidden />
      <button class="editor-btn editor-options-toggle" id="options-toggle" aria-expanded="false">Options</button>
      <button class="editor-btn" id="open-pdf">Open PDF</button>
      <button class="editor-btn primary" id="save-pdf" disabled>Download PDF</button>
    </div>
  </header>
  <div class="editor-shell">
    <aside class="page-sidebar"><div class="side-heading">Pages <span id="page-count">—</span></div><div class="page-list" id="page-list"><div class="no-file">Open a PDF to see pages</div></div><div class="page-nav-controls"><button id="prev-page" disabled>← Prev</button><button id="next-page" disabled>Next →</button></div></aside>
    <main class="editor-main">
      <div class="editor-toolbar" aria-label="Editing tools">
        <button class="mode-btn active" data-mode="select" title="Select / view"><span>↖</span>Select</button>
        <button class="mode-btn" data-mode="text" title="Add text"><span>T</span>Text</button>
        <button class="mode-btn" data-mode="highlight" title="Highlight"><span>▰</span>Highlight</button>
        <button class="mode-btn" data-mode="draw" title="Freehand draw"><span>⌁</span>Draw</button>
        <button class="mode-btn" data-mode="signature" title="Draw a signature"><span>✍</span>Sign</button>
        <button class="mode-btn" id="insert-image" title="Insert an image"><span>▧</span>Images</button>
        <span class="toolbar-divider"></span>
        <button class="mode-btn" data-mode="rect" title="Rectangle"><span>□</span>Shape</button>
        <button class="mode-btn" data-mode="whiteout" title="Whiteout"><span>▱</span>Whiteout</button>
        <span class="toolbar-divider"></span>
        <button class="mode-btn" id="undo" title="Undo last item"><span>↶</span>Undo</button>
      </div>
      <div class="format-toolbar" aria-label="Text formatting">
        <select id="font-family" aria-label="Font family"><option value="match">Match original</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Times New Roman">Times New Roman</option><option value="Courier New">Courier New</option></select>
        <input id="font-size-control" type="number" min="6" max="96" value="18" aria-label="Font size" />
        <button id="format-bold" class="format-toggle" aria-label="Bold" aria-pressed="false"><b>B</b></button>
        <button id="format-italic" class="format-toggle" aria-label="Italic" aria-pressed="false"><i>I</i></button>
        <button id="format-underline" class="format-toggle" aria-label="Underline" aria-pressed="false"><u>U</u></button>
        <input id="format-color" type="color" value="#167c69" aria-label="Text color" />
        <select id="text-align" aria-label="Text alignment"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>
        <button id="finish-text-edit" class="finish-text-edit" hidden>Done</button>
        <input type="file" id="image-input" accept="image/jpeg,image/png,image/webp" hidden />
      </div>
      <section class="canvas-scroll" id="canvas-scroll">
        <div class="editor-placeholder" id="placeholder"><span class="placeholder-icon">▤</span><h1>Make your PDF your own.</h1><p>Click text to edit it in place, style your text, add images, highlights, freehand notes, shapes, or a signature. Your file stays in this browser.</p><button class="editor-btn primary" id="choose-file">Choose a PDF</button><small>PDF · up to 50 MB · no upload</small></div>
        <div class="page-wrap mode-select text-select-mode" id="page-wrap" hidden><canvas id="pdf-canvas"></canvas><canvas id="overlay-canvas"></canvas><div id="text-layer" class="text-layer"></div><div id="inline-text-editor" class="inline-text-editor" hidden><textarea id="inline-textarea" rows="1" wrap="off" spellcheck="false" aria-label="Edit selected PDF text"></textarea></div></div>
      </section>
      <div class="editor-status" id="editor-status" role="status">Open a PDF to begin. Files are processed locally in your browser.</div>
    </main>
    <aside class="inspector"><h2>Tool options</h2><div class="tool-description" id="tool-description">${toolHelp.select}</div>
      <div id="new-text-controls"><label for="text-content">Text to add</label><textarea id="text-content" placeholder="Enter text to place on the page">Type here</textarea>
      <div class="field-pair"><div><label for="font-size">Text size (pt)</label><input id="font-size" type="number" min="6" max="96" value="18" /></div><div><label for="ink-color">Color</label><input id="ink-color" type="color" value="#167c69" /></div></div>
      <label for="stroke-size">Stroke size</label><input id="stroke-size" type="number" min="1" max="18" value="3" /></div>
      <div id="replace-controls" hidden><div class="selected-text-label">Selected PDF text</div><div id="selected-original" class="selected-original"></div><label for="replacement-text">Text (you can also edit directly on the page)</label><textarea id="replacement-text" placeholder="Enter replacement text"></textarea><div class="match-note" id="match-note"></div><button class="editor-btn primary apply-replacement" id="apply-replacement">Apply / finish editing</button><button class="editor-btn cancel-replacement" id="cancel-replacement">Cancel</button></div>
      <div class="warning-box"><b>Whiteout is not redaction</b>It only covers the visible page. Underlying text and data may still be recoverable. Do not use it to remove confidential information.</div>
      <div class="warning-box"><b>Text replacement limitation</b>Replacement covers the visible text and adds a new overlay. The original embedded text may remain selectable or extractable, so this is not secure redaction or a true content-stream rewrite.</div>
    </aside>
    <aside class="ad-rail" aria-label="Advertisement" data-ad-provider="adsense" data-ad-slot="editor-skyscraper" data-ad-state="placeholder">
      <span class="ad-rail-label">ADVERTISEMENT</span>
      <div class="ad-rail-card"><span class="ad-rail-icon">AD</span><b>Sponsored space</b><p>A reserved placement for an advertiser.</p><small>AdSense is not active yet.</small></div>
    </aside>
  </div>`;

const $ = (selector) => document.querySelector(selector);
const input = $('#pdf-input');
const baseCanvas = $('#pdf-canvas');
const overlayCanvas = $('#overlay-canvas');
const pageWrap = $('#page-wrap');
const status = $('#editor-status');

function setStatus(message, kind = '') { status.textContent = message; status.className = `editor-status ${kind}`; }
function pageAnnotations(pageNumber = state.pageNumber) { return state.annotations[pageNumber - 1] || (state.annotations[pageNumber - 1] = []); }
function colorRgb(hex) { const n = Number.parseInt(hex.slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }

$('#open-pdf').addEventListener('click', () => input.click());
$('#choose-file').addEventListener('click', () => input.click());
$('#options-toggle').addEventListener('click', () => { const open = $('.inspector').classList.toggle('open'); $('#options-toggle').setAttribute('aria-expanded', String(open)); });
input.addEventListener('change', () => { if (input.files[0]) openPdf(input.files[0]); input.value = ''; });
$('#insert-image').addEventListener('click', () => { if (!state.pdf) { setStatus('Open a PDF before inserting an image.', 'error'); return; } $('#image-input').click(); });
$('#image-input').addEventListener('change', () => { if ($('#image-input').files[0]) loadImageForPlacement($('#image-input').files[0]); $('#image-input').value = ''; });
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('#undo').addEventListener('click', () => { const annotations = pageAnnotations(); if (annotations.length) { annotations.pop(); paintOverlay(); setStatus('Removed the latest item from this page.'); } });
$('#prev-page').addEventListener('click', () => goToPage(state.pageNumber - 1));
$('#next-page').addEventListener('click', () => goToPage(state.pageNumber + 1));
$('#save-pdf').addEventListener('click', exportPdf);
$('#apply-replacement').addEventListener('click', applyReplacement);
$('#cancel-replacement').addEventListener('click', () => clearTextSelection(true));
$('#replacement-text').addEventListener('input', () => { if (state.selectedText) { $('#inline-textarea').value = $('#replacement-text').value; updateInlineText(); } });
$('#text-layer').addEventListener('click', selectExistingText);
$('#inline-textarea').addEventListener('input', updateInlineText);
$('#inline-textarea').addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); clearTextSelection(true); } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); applyReplacement(); } });
$('#finish-text-edit').addEventListener('click', applyReplacement);
$('#font-family').addEventListener('change', () => updateTextStyle({ family: $('#font-family').value }));
$('#font-size-control').addEventListener('change', () => updateTextStyle({ size: Math.max(6, Math.min(96, Number($('#font-size-control').value) || 18)) }));
$('#font-size').addEventListener('change', () => updateTextStyle({ size: Math.max(6, Math.min(96, Number($('#font-size').value) || 18)) }));
$('#format-color').addEventListener('input', () => updateTextStyle({ color: $('#format-color').value }));
$('#ink-color').addEventListener('input', () => updateTextStyle({ color: $('#ink-color').value }));
$('#text-align').addEventListener('change', () => updateTextStyle({ align: $('#text-align').value }));
$('#format-bold').addEventListener('click', () => updateTextStyle({ bold: !state.textStyle.bold }));
$('#format-italic').addEventListener('click', () => updateTextStyle({ italic: !state.textStyle.italic }));
$('#format-underline').addEventListener('click', () => updateTextStyle({ underline: !state.textStyle.underline }));

function setMode(mode) {
  if (mode !== 'select' && state.selectedText) clearTextSelection();
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  pageWrap.classList.toggle('mode-select', mode === 'select');
  pageWrap.classList.toggle('text-select-mode', mode === 'select');
  $('#insert-image').classList.toggle('active', mode === 'image');
  $('#tool-description').textContent = toolHelp[mode];
}

async function loadImageForPlacement(file) {
  if (file.size > 20 * 1024 * 1024) { setStatus('Choose an image smaller than 20 MB.', 'error'); return; }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setStatus('Choose a JPG, PNG, or WebP image.', 'error'); return; }
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 40_000_000) { bitmap.close(); setStatus('This image is too large to edit safely in the browser.', 'error'); return; }
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, .92));
    if (!blob) throw new Error('The browser could not prepare that image.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (state.pendingImage?.bitmap) state.pendingImage.bitmap.close();
    state.pendingImage = { bitmap, bytes, mime, ratio: bitmap.width / bitmap.height, name: file.name };
    setMode('image'); setStatus('Image ready. Click where you want to place it, then drag to move or resize.');
  } catch (error) { setStatus(error.message || 'Could not open that image.', 'error'); }
}

function syncFormatControls(style = state.textStyle) {
  $('#font-family').value = style.family || 'match'; $('#font-size-control').value = String(style.size || 18);
  $('#format-color').value = style.color || '#167c69'; $('#text-align').value = style.align || 'left';
  $('#format-bold').setAttribute('aria-pressed', String(Boolean(style.bold)));
  $('#format-italic').setAttribute('aria-pressed', String(Boolean(style.italic)));
  $('#format-underline').setAttribute('aria-pressed', String(Boolean(style.underline)));
  $('#font-size').value = String(style.size || 18); $('#ink-color').value = style.color || '#167c69';
}

function updateInlineEditorStyle() {
  const selected = state.selectedText; if (!selected) return;
  const annotation = selected.annotation; const editor = $('#inline-text-editor'); const textarea = $('#inline-textarea');
  const rect = baseCanvas.getBoundingClientRect();
  editor.style.left = `${selected.x * rect.width}px`; editor.style.top = `${selected.y * rect.height}px`;
  editor.style.width = `${Math.max(100, annotation.w * rect.width)}px`; editor.style.height = `${Math.max(20, selected.h * rect.height)}px`;
  editor.style.backgroundColor = annotation.background || '#fff';
  const family = annotation.fontChoice && annotation.fontChoice !== 'match' ? annotation.fontChoice : annotation.fontFamily || 'Arial, sans-serif';
  textarea.style.fontFamily = family; textarea.style.fontSize = `${annotation.size * state.scale}px`;
  textarea.style.fontWeight = annotation.bold ? '700' : '400'; textarea.style.fontStyle = annotation.italic ? 'italic' : 'normal';
  textarea.style.textDecoration = annotation.underline ? 'underline' : 'none'; textarea.style.color = annotation.color;
  textarea.style.textAlign = annotation.align || 'left';
}

function updateTextStyle(patch) {
  state.textStyle = { ...state.textStyle, ...patch };
  if (state.selectedText) {
    const annotation = state.selectedText.annotation;
    if (Object.entries(patch).some(([key, value]) => annotation[key] !== value)) state.selectedText.styleDirty = true;
    Object.assign(annotation, state.textStyle, { fontChoice: state.textStyle.family, fontFamily: state.textStyle.family === 'match' ? state.selectedText.fontFamily : state.textStyle.family });
    state.selectedText.dirty = Boolean(state.selectedText.styleDirty || annotation.text !== state.selectedText.baselineText);
  }
  syncFormatControls();
  if (state.selectedText) { updateInlineEditorStyle(); paintOverlay(); }
  else if (state.mode === 'text') setStatus('Text style updated. Click the page to place text.');
}

function updateInlineText() {
  if (!state.selectedText) return;
  const selected = state.selectedText; const annotation = selected.annotation; const text = String($('#inline-textarea').value ?? '');
  annotation.text = text; $('#replacement-text').value = text;
  selected.dirty = Boolean(selected.styleDirty || text !== selected.baselineText);
  const rect = baseCanvas.getBoundingClientRect(); const ctx = overlayCanvas.getContext('2d');
  const family = annotation.fontChoice && annotation.fontChoice !== 'match' ? annotation.fontChoice : annotation.fontFamily || 'Arial, sans-serif';
  ctx.font = `${annotation.italic ? 'italic ' : ''}${annotation.bold ? '700 ' : ''}${annotation.size * state.scale}px ${family}`;
  const measured = ctx.measureText(text || ' ').width + 8;
  annotation.w = Math.min(1 - annotation.x, Math.max(annotation.baseW || annotation.w, measured / Math.max(1, rect.width)));
  selected.w = annotation.w;
  updateInlineEditorStyle(); paintOverlay();
}

function resizeInlineEditor() {
  if (state.selectedText) updateInlineEditorStyle();
}

async function openPdf(file) {
  if (file.size > 50 * 1024 * 1024) { setStatus('Choose a PDF under 50 MB.', 'error'); return; }
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setStatus('Choose a PDF file.', 'error'); return; }
  try {
    setStatus('Opening the PDF locally…');
    const bytes = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), standardFontDataUrl: new URL('/standard_fonts/', window.location.href).href });
    const pdf = await loadingTask.promise;
    state.file = file; state.bytes = bytes; state.pdf = pdf; state.pageNumber = 1; state.pageCount = pdf.numPages; state.annotations = Array.from({ length: pdf.numPages }, () => []);
    $('#doc-name').textContent = file.name; $('#doc-name').title = file.name; $('#page-count').textContent = String(pdf.numPages);
    $('#placeholder').hidden = true; $('#placeholder').style.display = 'none';
    pageWrap.hidden = false; pageWrap.style.display = 'block'; $('#save-pdf').disabled = false;
    makePageList(); await renderPage(); setStatus(`${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} ready. All editing is local to this browser.`);
    if (pdf.numPages > 100) setStatus('Large document: rendering one page at a time. Export may use substantial browser memory.');
  } catch (error) {
    state.file = null; state.bytes = null; state.pdf = null; $('#save-pdf').disabled = true;
    $('#placeholder').hidden = false; $('#placeholder').style.display = '';
    pageWrap.hidden = true; pageWrap.style.display = 'none';
    setStatus(`Could not open this PDF. It may be encrypted, damaged, or unsupported. ${error?.message || ''}`.slice(0, 240), 'error');
  }
}

function makePageList() {
  const list = $('#page-list'); list.innerHTML = '';
  for (let page = 1; page <= state.pageCount; page++) {
    const button = document.createElement('button'); button.className = `page-item${page === state.pageNumber ? ' active' : ''}`; button.textContent = `Page ${page}`; button.dataset.page = page;
    button.addEventListener('click', () => goToPage(page)); list.append(button);
  }
  updatePageControls();
}

function updatePageControls() {
  $('#prev-page').disabled = state.pageNumber <= 1;
  $('#next-page').disabled = state.pageNumber >= state.pageCount;
  document.querySelectorAll('.page-item').forEach((button) => button.classList.toggle('active', Number(button.dataset.page) === state.pageNumber));
}

async function goToPage(pageNumber) {
  if (!state.pdf || pageNumber < 1 || pageNumber > state.pageCount) return;
  state.pageNumber = pageNumber; updatePageControls(); await renderPage();
}

async function renderPage() {
  const token = ++state.renderToken;
  if (state.selectedText) clearTextSelection();
  const page = await state.pdf.getPage(state.pageNumber);
  state.pageProxy = page;
  state.selectedText = null;
  $('#replace-controls').hidden = true; $('#new-text-controls').hidden = false; $('#inline-text-editor').hidden = true; $('#finish-text-edit').hidden = true; state.selectedImage = null;
  const unitViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(240, $('#canvas-scroll').clientWidth - 54);
  state.scale = Math.min(1.65, availableWidth / unitViewport.width);
  const viewport = page.getViewport({ scale: state.scale }); state.viewport = viewport;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  for (const canvas of [baseCanvas, overlayCanvas]) {
    canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
  }
  pageWrap.style.width = `${viewport.width}px`; pageWrap.style.height = `${viewport.height}px`;
  const context = baseCanvas.getContext('2d', { alpha: false }); context.setTransform(ratio, 0, 0, ratio, 0, 0);
  try { await page.render({ canvasContext: context, viewport }).promise; } catch (error) { if (token === state.renderToken) setStatus(`Page render failed: ${error.message}`, 'error'); return; }
  if (token !== state.renderToken) return;
  const overlayContext = overlayCanvas.getContext('2d'); overlayContext.setTransform(ratio, 0, 0, ratio, 0, 0); paintOverlay();
  await renderTextLayer(page, viewport, token);
}

async function renderTextLayer(page, viewport, token) {
  const layer = $('#text-layer'); layer.replaceChildren(); state.textItems = []; state.textStyles = {};
  try {
    layer.style.setProperty('--scale-factor', String(viewport.scale));
    const textContent = await page.getTextContent();
    if (token !== state.renderToken) return;
    state.textItems = textContent.items.filter((item) => typeof item.str === 'string' && item.str.length > 0);
    state.textStyles = textContent.styles;
    const textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: layer, viewport });
    await textLayer.render();
    const spans = [...layer.querySelectorAll('span[role="presentation"]')].filter((span) => span.textContent);
    spans.forEach((span, index) => {
      if (index >= state.textItems.length) return;
      span.dataset.textIndex = String(index); span.classList.add('pdf-text-hit');
      span.title = 'Click to replace this text';
    });
  } catch (error) {
    layer.replaceChildren();
    setStatus(`Text selection unavailable on this page. You can still add annotations. ${error.message}`, 'error');
  }
}

function paintOverlay() {
  const ctx = overlayCanvas.getContext('2d'); const ratio = Math.min(2, window.devicePixelRatio || 1); const width = overlayCanvas.width / ratio; const height = overlayCanvas.height / ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const item of pageAnnotations()) paintItem(ctx, item, width, height, false);
  if (state.draft) paintItem(ctx, state.draft, width, height, true);
  if (state.selectedText && state.selectedText.pageNumber === state.pageNumber) {
    const selected = state.selectedText; ctx.strokeStyle = '#4285f4'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]); ctx.strokeRect(selected.x * width, selected.y * height, selected.w * width, selected.h * height); ctx.setLineDash([]);
  }
}

function paintItem(ctx, item, width, height, draft) {
  const x = item.x * width; const y = item.y * height; const w = item.w * width; const h = item.h * height; const color = item.color || '#167c69';
  if (item.type === 'text') {
    ctx.fillStyle = color; ctx.font = `${item.italic ? 'italic ' : ''}${item.bold ? '700 ' : ''}${item.size * state.scale}px ${item.fontFamily || 'Arial, sans-serif'}`; ctx.textBaseline = 'top';
    const lines = item.text.split('\n'); lines.forEach((text, index) => { const lineY = y + index * item.size * state.scale * 1.2; ctx.textAlign = item.align || 'left'; const lineX = item.align === 'center' ? x + w / 2 : item.align === 'right' ? x + w : x; ctx.fillText(text, lineX, lineY); if (item.underline) { const measure = ctx.measureText(text).width; const startX = item.align === 'center' ? lineX - measure / 2 : item.align === 'right' ? lineX - measure : lineX; ctx.fillRect(startX, lineY + item.size * state.scale, measure, Math.max(1, state.scale)); } });
  }
  else if (item.type === 'text-replacement') {
    ctx.fillStyle = item.background || '#fff'; ctx.fillRect(x, y, w, h);
    const fontSize = item.size * state.scale; const family = item.fontChoice && item.fontChoice !== 'match' ? item.fontChoice : item.fontFamily || 'Arial, sans-serif';
    const style = [item.italic ? 'italic' : '', item.bold ? '700' : '', `${fontSize}px`, family].filter(Boolean).join(' ');
    ctx.fillStyle = color; ctx.font = style; ctx.textBaseline = 'top'; ctx.textAlign = item.align || 'left';
    const text = String(item.text ?? ''); const measured = Math.max(1, ctx.measureText(text).width); const fit = Math.min(1, Math.max(.55, (w - 1) / measured));
    const textX = item.align === 'center' ? x + w / 2 : item.align === 'right' ? x + w : x;
    ctx.save(); ctx.translate(textX, y); ctx.scale(fit, 1); ctx.fillText(text, 0, 0); ctx.restore();
    if (item.underline) { const lineX = item.align === 'center' ? x + (w - measured * fit) / 2 : item.align === 'right' ? x + w - measured * fit : x; ctx.fillRect(lineX, y + fontSize, measured * fit, Math.max(1, state.scale)); }
  }
  else if (item.type === 'highlight') { ctx.fillStyle = `${color}55`; ctx.fillRect(x, y, w, h); }
  else if (item.type === 'whiteout') { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h); if (draft) { ctx.strokeStyle = '#909c96'; ctx.setLineDash([4, 3]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]); } }
  else if (item.type === 'rect') { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, (item.size || 2) * state.scale); ctx.strokeRect(x, y, w, h); }
  else if (item.type === 'draw' || item.type === 'signature') {
    if (!item.points?.length) return; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, (item.size || 2) * state.scale); ctx.beginPath();
    item.points.forEach((point, index) => { const px = point.x * width; const py = point.y * height; if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    if (item.points.length === 1) { const point = item.points[0]; ctx.moveTo(point.x * width, point.y * height); ctx.lineTo(point.x * width + .1, point.y * height + .1); } ctx.stroke();
  }
  else if (item.type === 'image' && item.bitmap) {
    ctx.drawImage(item.bitmap, x, y, w, h);
    if (state.selectedImage === item) { ctx.strokeStyle = '#258de0'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(x + w - 8, y + h - 8, 12, 12); ctx.strokeRect(x + w - 8, y + h - 8, 12, 12); }
  }
}

function pointFromEvent(event) {
  const rect = overlayCanvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
}

function sampleTextColor(span) {
  const spanRect = span.getBoundingClientRect(); const canvasRect = baseCanvas.getBoundingClientRect();
  const ratio = baseCanvas.width / Math.max(1, canvasRect.width);
  const left = Math.max(0, Math.floor((spanRect.left - canvasRect.left) * ratio));
  const top = Math.max(0, Math.floor((spanRect.top - canvasRect.top) * ratio));
  const right = Math.min(baseCanvas.width, Math.ceil((spanRect.right - canvasRect.left) * ratio));
  const bottom = Math.min(baseCanvas.height, Math.ceil((spanRect.bottom - canvasRect.top) * ratio));
  if (right <= left || bottom <= top) return '#172b2c';
  try {
    const pixels = baseCanvas.getContext('2d').getImageData(left, top, right - left, bottom - top).data; const counts = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
      const luminance = .2126 * red + .7152 * green + .0722 * blue;
      if (pixels[i + 3] > 200 && luminance < 215) { const key = `${red},${green},${blue}`; counts.set(key, (counts.get(key) || 0) + 1); }
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return best ? `#${best.split(',').map((value) => Number(value).toString(16).padStart(2, '0')).join('')}` : '#172b2c';
  } catch { return '#172b2c'; }
}

function sampleBackgroundColor(span) {
  const rect = span.getBoundingClientRect(); const canvasRect = baseCanvas.getBoundingClientRect();
  const ratio = baseCanvas.width / Math.max(1, canvasRect.width);
  const left = Math.max(0, Math.floor((rect.left - canvasRect.left) * ratio)); const right = Math.min(baseCanvas.width, Math.ceil((rect.right - canvasRect.left) * ratio));
  const top = Math.max(0, Math.floor((rect.top - canvasRect.top) * ratio)); const bottom = Math.min(baseCanvas.height, Math.ceil((rect.bottom - canvasRect.top) * ratio));
  const samples = [];
  for (let inset = 1; inset <= 3; inset++) {
    if (top - inset >= 0) samples.push([left, top - inset, Math.max(1, right - left), 1]);
    if (bottom + inset < baseCanvas.height) samples.push([left, bottom + inset, Math.max(1, right - left), 1]);
    if (left - inset >= 0) samples.push([left - inset, top, 1, Math.max(1, bottom - top)]);
    if (right + inset < baseCanvas.width) samples.push([right + inset, top, 1, Math.max(1, bottom - top)]);
  }
  try {
    const ctx = baseCanvas.getContext('2d'); const counts = new Map();
    for (const [x, y, width, height] of samples) {
      const pixels = ctx.getImageData(x, y, width, height).data;
      for (let i = 0; i < pixels.length; i += 4) {
        const [red, green, blue] = [pixels[i], pixels[i + 1], pixels[i + 2]];
        if (red > 170 && green > 170 && blue > 170) { const key = `${red},${green},${blue}`; counts.set(key, (counts.get(key) || 0) + 1); }
      }
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return best ? `#${best.split(',').map((value) => Number(value).toString(16).padStart(2, '0')).join('')}` : '#ffffff';
  } catch { return '#ffffff'; }
}

function getFontData(page, fontName) {
  try {
    if (!page.commonObjs.has(fontName)) return null;
    const data = page.commonObjs.get(fontName)?.data;
    if (data instanceof Uint8Array) return data.slice();
    if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  } catch { /* Font program is not exposed by PDF.js for this item. */ }
  return null;
}

function selectExistingText(event) {
  if (state.mode !== 'select') return;
  const span = event.target.closest('span[data-text-index]'); if (!span) return;
  const index = Number(span.dataset.textIndex); const item = state.textItems[index]; if (!item) return;
  const rect = span.getBoundingClientRect(); const canvasRect = baseCanvas.getBoundingClientRect();
  const padX = 1 / Math.max(1, canvasRect.width); const padY = 1 / Math.max(1, canvasRect.height);
  const style = state.textStyles[item.fontName] || {}; let embedded = null;
  try { if (state.pageProxy.commonObjs.has(item.fontName)) embedded = state.pageProxy.commonObjs.get(item.fontName); } catch { /* Fall back to the detected family name. */ }
  const fontLabel = `${embedded?.name || item.fontName || ''} ${style.fontFamily || ''}`.toLowerCase();
  const fontFamily = style.fontFamily || (fontLabel.includes('serif') ? 'serif' : 'Arial, sans-serif');
  const fontSize = Math.max(5, Math.min(96, Number(item.height) || Math.hypot(item.transform?.[0] || 0, item.transform?.[1] || 0) || 12));
  const color = sampleTextColor(span);
  const sourceX = Math.max(0, (rect.left - canvasRect.left) / canvasRect.width - padX);
  const sourceY = Math.max(0, (rect.top - canvasRect.top) / canvasRect.height - padY);
  const sourceW = Math.min(1, rect.width / canvasRect.width + padX * 2);
  const sourceH = Math.min(1, rect.height / canvasRect.height + padY * 2);
  const annotations = pageAnnotations();
  const previousAnnotation = annotations.find((annotation) => annotation.type === 'text-replacement' && annotation.sourceIndex === index);
  const previousSnapshot = previousAnnotation ? { ...previousAnnotation, text: previousAnnotation.text ?? item.str } : null;
  if (previousAnnotation && previousAnnotation.text == null) previousAnnotation.text = item.str;
  const replacement = previousAnnotation || {
    type: 'text-replacement', text: item.str,
    pageNumber: state.pageNumber, sourceIndex: index, original: item.str,
    x: sourceX, y: sourceY, w: sourceW, baseW: sourceW, h: sourceH,
    size: fontSize, color, background: sampleBackgroundColor(span), fontFamily, originalFontFamily: fontFamily,
    fontLabel: embedded?.name || embedded?.loadedName || item.fontName,
    bold: Boolean(embedded?.bold || /bold|black|heavy|demi/i.test(fontLabel)),
    originalBold: Boolean(embedded?.bold || /bold|black|heavy|demi/i.test(fontLabel)),
    italic: Boolean(embedded?.italic || /italic|oblique/i.test(fontLabel)),
    originalItalic: Boolean(embedded?.italic || /italic|oblique/i.test(fontLabel)), underline: false, align: 'left', fontChoice: 'match',
    fontData: getFontData(state.pageProxy, item.fontName), fontKey: item.fontName,
  };
  replacement.x = sourceX; replacement.y = sourceY; replacement.w = Math.max(sourceW, replacement.w); replacement.baseW = sourceW; replacement.h = sourceH;
  if (!previousAnnotation) annotations.push(replacement);
  state.selectedImage = null;
  const baselineText = replacement.text ?? item.str;
  state.selectedText = { ...replacement, pageNumber: state.pageNumber, sourceIndex: index, fontFamily, annotation: replacement, previousSnapshot, baselineText, dirty: false, styleDirty: false };
  state.textStyle = { family: replacement.fontChoice || 'match', size: replacement.size, bold: replacement.bold, italic: replacement.italic, underline: replacement.underline, color: replacement.color, align: replacement.align || 'left' };
  $('#selected-original').textContent = item.str;
  $('#replacement-text').value = baselineText;
  $('#match-note').textContent = `Detected about ${fontSize.toFixed(1)} pt · ${fontFamily}${state.selectedText.bold ? ' · bold' : ''}${state.selectedText.italic ? ' · italic' : ''} · color sampled from the page. A best-effort match will be used.`;
  $('#new-text-controls').hidden = true; $('#replace-controls').hidden = false;
  $('#inline-textarea').value = baselineText; $('#inline-text-editor').hidden = false; $('#finish-text-edit').hidden = false;
  syncFormatControls(state.textStyle); updateInlineEditorStyle(); paintOverlay();
  $('#inline-textarea').focus(); $('#inline-textarea').select(); setStatus('Edit this text directly on the page. Press Done or ⌘/Ctrl+Enter to finish.');
}

function clearTextSelection(cancel = false) {
  const selected = state.selectedText;
  if (selected && (cancel || !selected.dirty)) {
    const annotations = pageAnnotations(selected.pageNumber);
    if (selected.previousSnapshot) Object.assign(selected.annotation, selected.previousSnapshot);
    else { const index = annotations.indexOf(selected.annotation); if (index >= 0) annotations.splice(index, 1); }
  }
  state.selectedText = null; $('#inline-text-editor').hidden = true; $('#finish-text-edit').hidden = true;
  $('#replace-controls').hidden = true; $('#new-text-controls').hidden = false; paintOverlay();
}

function startInlineText(point) {
  if (state.selectedText) clearTextSelection();
  const rect = baseCanvas.getBoundingClientRect(); const style = state.textStyle;
  const face = style.family === 'match' ? 'Arial' : style.family;
  const annotation = {
    type: 'text', x: point.x, y: point.y, w: .08, baseW: .08,
    h: Math.min(1 - point.y, style.size * state.scale * 1.4 / Math.max(1, rect.height)),
    text: '', size: style.size, color: style.color, fontFamily: face, fontChoice: style.family,
    bold: style.bold, italic: style.italic, underline: style.underline, align: style.align, background: 'transparent',
  };
  pageAnnotations().push(annotation);
  state.selectedText = { pageNumber: state.pageNumber, sourceIndex: null, original: '', x: annotation.x, y: annotation.y, w: annotation.w, h: annotation.h, fontFamily: face, annotation, previousSnapshot: null, baselineText: '', dirty: false, styleDirty: false, isNew: true };
  $('#selected-original').textContent = 'New text'; $('#replacement-text').value = '';
  $('#match-note').textContent = 'Type directly on the page. Use the formatting bar to adjust the new text.';
  $('#new-text-controls').hidden = true; $('#replace-controls').hidden = false;
  $('#inline-textarea').value = ''; $('#inline-text-editor').hidden = false; $('#finish-text-edit').hidden = false;
  updateInlineEditorStyle(); paintOverlay(); $('#inline-textarea').focus();
  setStatus('Type directly on the page. Change the font, size, emphasis, color, or alignment above.');
}

function applyReplacement() {
  if (!state.selectedText) return;
  updateInlineText();
  if (!state.selectedText.annotation.text.trim()) { setStatus('Replacement text cannot be empty.', 'error'); return; }
  const isNew = state.selectedText.isNew; const changed = state.selectedText.dirty; clearTextSelection();
  setStatus(!changed ? 'No text changes to apply.' : isNew ? 'Text added. Download the PDF to save.' : 'Text edit applied. The original text remains in the PDF’s underlying text data.', 'success');
}

overlayCanvas.addEventListener('pointerdown', (event) => {
  if (!state.pdf) return;
  const point = pointFromEvent(event);
  if (state.mode === 'select') {
    if (state.selectedText) clearTextSelection();
    overlayCanvas.setPointerCapture(event.pointerId);
    const images = pageAnnotations().filter((annotation) => annotation.type === 'image');
    const selected = state.selectedImage;
    const handle = selected && point.x >= selected.x + selected.w - .025 && point.y >= selected.y + selected.h - .025 && point.x <= selected.x + selected.w + .015 && point.y <= selected.y + selected.h + .015;
    const image = handle ? selected : [...images].reverse().find((item) => point.x >= item.x && point.x <= item.x + item.w && point.y >= item.y && point.y <= item.y + item.h);
    if (image) { state.selectedImage = image; state.imageDrag = { item: image, start: point, original: { x: image.x, y: image.y, w: image.w, h: image.h }, resize: Boolean(handle) }; paintOverlay(); }
    else { state.selectedImage = null; paintOverlay(); }
    return;
  }
  overlayCanvas.setPointerCapture(event.pointerId);
  if (state.mode === 'image' && state.pendingImage) {
    const pending = state.pendingImage; const width = Math.min(.28, .65 * pending.ratio * state.viewport.height / state.viewport.width); const height = width * state.viewport.width / (pending.ratio * state.viewport.height);
    const image = { type: 'image', x: Math.min(point.x, 1 - width), y: Math.min(point.y, 1 - height), w: width, h: height, bitmap: pending.bitmap, bytes: pending.bytes, mime: pending.mime, ratio: pending.ratio, name: pending.name };
    pageAnnotations().push(image); state.selectedImage = image; state.pendingImage = null; setMode('select'); paintOverlay(); setStatus('Image added. Drag to move or use its corner handle to resize.'); return;
  }
  const color = state.textStyle.color || $('#ink-color').value; const size = Math.min(96, Math.max(1, Number($('#stroke-size').value) || 3));
  if (state.mode === 'text') {
    startInlineText(point); return;
  }
  if (state.mode === 'draw' || state.mode === 'signature') state.draft = { type: state.mode, x: point.x, y: point.y, w: 0, h: 0, points: [point], size: state.mode === 'signature' ? Math.max(2, size) : size, color: state.mode === 'signature' ? '#172b2c' : color };
  else state.draft = { type: state.mode, x: point.x, y: point.y, w: 0, h: 0, color, size };
});

overlayCanvas.addEventListener('pointermove', (event) => {
  if (state.imageDrag) {
    const point = pointFromEvent(event); const drag = state.imageDrag; const item = drag.item; const dx = point.x - drag.start.x; const dy = point.y - drag.start.y;
    if (drag.resize) {
      item.w = Math.max(.04, Math.min(1 - drag.original.x, drag.original.w + dx));
      item.h = Math.min(1 - drag.original.y, item.w * state.viewport.width / (item.ratio * state.viewport.height));
      item.w = item.h * item.ratio * state.viewport.height / state.viewport.width;
    } else { item.x = Math.max(0, Math.min(1 - item.w, drag.original.x + dx)); item.y = Math.max(0, Math.min(1 - item.h, drag.original.y + dy)); }
    paintOverlay(); return;
  }
  if (!state.draft) return; const point = pointFromEvent(event);
  if (state.draft.type === 'draw' || state.draft.type === 'signature') state.draft.points.push(point);
  else { state.draft.w = point.x - state.draft.x; state.draft.h = point.y - state.draft.y; }
  paintOverlay();
});

function finishPointer() {
  if (state.imageDrag) { state.imageDrag = null; setStatus('Image placement updated. Download the PDF to save.'); return; }
  if (!state.draft) return;
  if (state.draft.w < 0) { state.draft.x += state.draft.w; state.draft.w = Math.abs(state.draft.w); }
  if (state.draft.h < 0) { state.draft.y += state.draft.h; state.draft.h = Math.abs(state.draft.h); }
  if ((state.draft.type === 'draw' || state.draft.type === 'signature') ? state.draft.points.length : state.draft.w > .003 && state.draft.h > .003) pageAnnotations().push(state.draft);
  state.draft = null; paintOverlay(); setStatus('Edit added. Download the PDF to save your work.');
}
overlayCanvas.addEventListener('pointerup', finishPointer); overlayCanvas.addEventListener('pointercancel', finishPointer);

function hexParts(hex) { return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255); }

async function matchingPdfFont(pdf, item, fontCache) {
  const key = `${item.fontKey || item.fontFamily}:${item.bold}:${item.italic}`;
  if (fontCache.has(key)) return fontCache.get(key);
  if (item.fontData?.length && (!item.fontChoice || item.fontChoice === 'match') && item.bold === item.originalBold && item.italic === item.originalItalic) {
    try {
      const { default: fontkit } = await import('@pdf-lib/fontkit');
      if (!fontkitRegisteredDocs.has(pdf)) { pdf.registerFontkit(fontkit); fontkitRegisteredDocs.add(pdf); }
      const embedded = await pdf.embedFont(item.fontData, { subset: true }); fontCache.set(key, embedded); return embedded;
    }
    catch { /* Some PDF.js font programs are subsets that fontkit cannot re-embed. Use a close standard face. */ }
  }
  const family = (item.fontChoice && item.fontChoice !== 'match' ? item.fontChoice : `${item.fontLabel || ''} ${item.fontKey || ''} ${item.fontFamily || ''}`).toLowerCase();
  const base = /courier|mono/.test(family) ? 'Courier' : /times|serif|georgia/.test(family) ? 'TimesRoman' : 'Helvetica';
  const suffix = item.bold && item.italic ? (base === 'TimesRoman' ? 'BoldItalic' : 'BoldOblique') : item.bold ? 'Bold' : item.italic ? (base === 'TimesRoman' ? 'Italic' : 'Oblique') : '';
  const name = `${base}${suffix}`; const standard = StandardFonts[name] || StandardFonts.Helvetica;
  const font = await pdf.embedFont(standard); fontCache.set(key, font); return font;
}

async function exportPdf() {
  if (!state.bytes || state.busy) return;
  state.busy = true; $('#save-pdf').disabled = true; $('#save-pdf').textContent = 'Preparing…'; setStatus('Creating your edited PDF locally…');
  try {
    const pdf = await PDFDocument.load(state.bytes, { updateMetadata: false });
    const fontCache = new Map(); const imageCache = new Map();
    for (let index = 0; index < state.annotations.length; index++) {
      const items = state.annotations[index]; if (!items.length) continue;
      const page = pdf.getPage(index); const rotation = page.getRotation().angle % 360;
      if (rotation !== 0) throw new Error(`Page ${index + 1} has a rotated view. Rotate it upright before using this editor.`);
      const crop = page.getCropBox(); const pageW = crop.width; const pageH = crop.height;
      for (const item of items) {
        const [r, g, b] = hexParts(item.color || '#167c69'); const color = rgb(r, g, b);
        const x = crop.x + item.x * pageW; const yTop = crop.y + (1 - item.y) * pageH;
        if (item.type === 'text') {
          const font = await matchingPdfFont(pdf, item, fontCache); const textWidth = font.widthOfTextAtSize(item.text, item.size);
          const startX = item.align === 'center' ? x + Math.max(0, (item.w * pageW - textWidth) / 2) : item.align === 'right' ? x + Math.max(0, item.w * pageW - textWidth) : x;
          page.drawText(item.text, { x: startX, y: yTop - item.size, size: item.size, font, color, lineHeight: item.size * 1.2 });
          if (item.underline) page.drawLine({ start: { x: startX, y: yTop - item.size - 1 }, end: { x: startX + textWidth, y: yTop - item.size - 1 }, thickness: Math.max(.5, item.size / 18), color });
        } else if (item.type === 'text-replacement') {
          const width = item.w * pageW; const height = item.h * pageH; const y = crop.y + pageH - (item.y + item.h) * pageH;
          page.drawRectangle({ x, y, width, height, color: item.background ? colorRgb(item.background) : rgb(1, 1, 1), borderWidth: 0 });
          const text = String(item.text ?? ''); const font = await matchingPdfFont(pdf, item, fontCache); const padding = Math.min(1.5, width * .015);
          const availableWidth = Math.max(1, width - padding * 2); let fontSize = item.size;
          const naturalWidth = font.widthOfTextAtSize(text, fontSize);
          if (naturalWidth > availableWidth && naturalWidth > 0) fontSize = Math.max(4, fontSize * availableWidth / naturalWidth);
          const fitWidth = font.widthOfTextAtSize(text, fontSize); const textX = x + padding + (item.align === 'center' ? Math.max(0, (availableWidth - fitWidth) / 2) : item.align === 'right' ? Math.max(0, availableWidth - fitWidth) : 0);
          const textHeight = font.heightAtSize(fontSize); const baseline = y + Math.max(0, (height - textHeight) / 2 + fontSize * .1);
          page.drawText(text, { x: textX, y: baseline, size: fontSize, font, color });
          if (item.underline) page.drawLine({ start: { x: textX, y: baseline - 1 }, end: { x: textX + fitWidth, y: baseline - 1 }, thickness: Math.max(.5, fontSize / 18), color });
        } else if (item.type === 'image') {
          let embedded = imageCache.get(item.bytes);
          if (!embedded) { embedded = item.mime === 'image/jpeg' ? await pdf.embedJpg(item.bytes) : await pdf.embedPng(item.bytes); imageCache.set(item.bytes, embedded); }
          const width = item.w * pageW; const height = item.h * pageH; const y = crop.y + pageH - (item.y + item.h) * pageH;
          page.drawImage(embedded, { x, y, width, height });
        } else if (item.type === 'whiteout' || item.type === 'highlight' || item.type === 'rect') {
          const width = item.w * pageW; const height = item.h * pageH; const y = crop.y + pageH - (item.y + item.h) * pageH;
          if (item.type === 'whiteout') page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1), borderWidth: 0 });
          else if (item.type === 'highlight') page.drawRectangle({ x, y, width, height, color, opacity: .3, borderWidth: 0 });
          else page.drawRectangle({ x, y, width, height, borderColor: color, borderWidth: item.size || 2 });
        } else if (item.type === 'draw' || item.type === 'signature') {
          for (let p = 1; p < item.points.length; p++) {
            const a = item.points[p - 1]; const z = item.points[p];
            page.drawLine({ start: { x: crop.x + a.x * pageW, y: crop.y + (1 - a.y) * pageH }, end: { x: crop.x + z.x * pageW, y: crop.y + (1 - z.y) * pageH }, thickness: item.size || 2, color });
          }
        }
      }
    }
    const bytes = await pdf.save(); const blob = new Blob([bytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${state.file.name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_')}-simplexpdf-edited.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); setStatus('PDF downloaded. The original file was not changed.', 'success');
  } catch (error) { setStatus(error.message || 'Could not save the edited PDF.', 'error'); }
  finally { state.busy = false; $('#save-pdf').disabled = false; $('#save-pdf').textContent = 'Download PDF'; }
}

let resizeTimer;
window.addEventListener('resize', () => { if (!state.pdf) return; clearTimeout(resizeTimer); resizeTimer = setTimeout(async () => { await renderPage(); resizeInlineEditor(); }, 120); });
$('#canvas-scroll').addEventListener('dragover', (event) => { event.preventDefault(); $('#canvas-scroll').classList.add('editor-drop-active'); });
$('#canvas-scroll').addEventListener('dragleave', () => $('#canvas-scroll').classList.remove('editor-drop-active'));
$('#canvas-scroll').addEventListener('drop', (event) => { event.preventDefault(); $('#canvas-scroll').classList.remove('editor-drop-active'); const files = [...event.dataTransfer.files]; const pdf = files.find((item) => item.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf')); const image = files.find((item) => ['image/jpeg', 'image/png', 'image/webp'].includes(item.type)); if (pdf) openPdf(pdf); else if (image && state.pdf) loadImageForPlacement(image); });
