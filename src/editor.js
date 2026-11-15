import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './editor.css';
import './editor-responsive.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const app = document.querySelector('#editor-app');
const toolHelp = {
  select: 'Choose a PDF and select a tool. Export applies your additions to a new copy.',
  text: 'Click the page to place the text from the inspector. This adds text; it does not directly rewrite existing PDF text.',
  highlight: 'Drag across an area to add a translucent highlight.',
  draw: 'Draw freehand on the page. Strokes are saved into the exported PDF.',
  signature: 'Draw your signature with a mouse, stylus, or touch input.',
  rect: 'Drag to add a stroked rectangle.',
  whiteout: 'Drag to cover content with a white box. This is visual-only, not secure redaction.',
};
const state = { file: null, bytes: null, pdf: null, pageNumber: 1, pageCount: 0, mode: 'select', annotations: [], viewport: null, scale: 1, renderToken: 0, draft: null, busy: false };

app.innerHTML = `
  <header class="editor-topbar">
    <a class="editor-brand" href="/"><span class="brand-mark">C</span> ClearPDF <small>Editor</small></a>
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
        <span class="toolbar-divider"></span>
        <button class="mode-btn" data-mode="rect" title="Rectangle"><span>□</span>Shape</button>
        <button class="mode-btn" data-mode="whiteout" title="Whiteout"><span>▱</span>Whiteout</button>
        <span class="toolbar-divider"></span>
        <button class="mode-btn" id="undo" title="Undo last item"><span>↶</span>Undo</button>
      </div>
      <section class="canvas-scroll" id="canvas-scroll">
        <div class="editor-placeholder" id="placeholder"><span class="placeholder-icon">▤</span><h1>Make your PDF your own.</h1><p>Add text, highlights, freehand notes, shapes, or a drawn signature. Your file stays in this browser.</p><button class="editor-btn primary" id="choose-file">Choose a PDF</button><small>PDF · up to 50 MB · no upload</small></div>
        <div class="page-wrap mode-select" id="page-wrap" hidden><canvas id="pdf-canvas"></canvas><canvas id="overlay-canvas"></canvas></div>
      </section>
      <div class="editor-status" id="editor-status" role="status">Open a PDF to begin. Files are processed locally in your browser.</div>
    </main>
    <aside class="inspector"><h2>Tool options</h2><div class="tool-description" id="tool-description">${toolHelp.select}</div>
      <label for="text-content">Text to add</label><textarea id="text-content" placeholder="Enter text to place on the page">Type here</textarea>
      <div class="field-pair"><div><label for="font-size">Text size (pt)</label><input id="font-size" type="number" min="6" max="96" value="18" /></div><div><label for="stroke-size">Color</label><input id="ink-color" type="color" value="#167c69" /></div></div>
      <label for="stroke-size">Stroke size</label><input id="stroke-size" type="number" min="1" max="18" value="3" />
      <div class="warning-box"><b>Whiteout is not redaction</b>It only covers the visible page. Underlying text and data may still be recoverable. Do not use it to remove confidential information.</div>
      <div class="warning-box"><b>Editing limitations</b>This editor adds overlays; it does not modify text already embedded in a PDF. Existing content remains underneath whiteout boxes.</div>
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
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('#undo').addEventListener('click', () => { const annotations = pageAnnotations(); if (annotations.length) { annotations.pop(); paintOverlay(); setStatus('Removed the latest item from this page.'); } });
$('#prev-page').addEventListener('click', () => goToPage(state.pageNumber - 1));
$('#next-page').addEventListener('click', () => goToPage(state.pageNumber + 1));
$('#save-pdf').addEventListener('click', exportPdf);

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  pageWrap.classList.toggle('mode-select', mode === 'select');
  $('#tool-description').textContent = toolHelp[mode];
}

async function openPdf(file) {
  if (file.size > 50 * 1024 * 1024) { setStatus('Choose a PDF under 50 MB.', 'error'); return; }
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setStatus('Choose a PDF file.', 'error'); return; }
  try {
    setStatus('Opening the PDF locally…');
    const bytes = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
    const pdf = await loadingTask.promise;
    state.file = file; state.bytes = bytes; state.pdf = pdf; state.pageNumber = 1; state.pageCount = pdf.numPages; state.annotations = Array.from({ length: pdf.numPages }, () => []);
    $('#doc-name').textContent = file.name; $('#doc-name').title = file.name; $('#page-count').textContent = String(pdf.numPages);
    $('#placeholder').hidden = true; pageWrap.hidden = false; $('#save-pdf').disabled = false;
    makePageList(); await renderPage(); setStatus(`${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} ready. All editing is local to this browser.`);
    if (pdf.numPages > 100) setStatus('Large document: rendering one page at a time. Export may use substantial browser memory.');
  } catch (error) {
    state.file = null; state.bytes = null; state.pdf = null; $('#save-pdf').disabled = true;
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
  const page = await state.pdf.getPage(state.pageNumber);
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
}

function paintOverlay() {
  const ctx = overlayCanvas.getContext('2d'); const ratio = Math.min(2, window.devicePixelRatio || 1); const width = overlayCanvas.width / ratio; const height = overlayCanvas.height / ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const item of pageAnnotations()) paintItem(ctx, item, width, height, false);
  if (state.draft) paintItem(ctx, state.draft, width, height, true);
}

function paintItem(ctx, item, width, height, draft) {
  const x = item.x * width; const y = item.y * height; const w = item.w * width; const h = item.h * height; const color = item.color || '#167c69';
  if (item.type === 'text') { ctx.fillStyle = color; ctx.font = `${item.size * state.scale}px Arial, sans-serif`; ctx.textBaseline = 'top'; for (const [line, text] of item.text.split('\n').entries()) ctx.fillText(text, x, y + line * item.size * state.scale * 1.2); }
  else if (item.type === 'highlight') { ctx.fillStyle = `${color}55`; ctx.fillRect(x, y, w, h); }
  else if (item.type === 'whiteout') { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h); if (draft) { ctx.strokeStyle = '#909c96'; ctx.setLineDash([4, 3]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]); } }
  else if (item.type === 'rect') { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, (item.size || 2) * state.scale); ctx.strokeRect(x, y, w, h); }
  else if (item.type === 'draw' || item.type === 'signature') {
    if (!item.points?.length) return; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, (item.size || 2) * state.scale); ctx.beginPath();
    item.points.forEach((point, index) => { const px = point.x * width; const py = point.y * height; if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    if (item.points.length === 1) { const point = item.points[0]; ctx.moveTo(point.x * width, point.y * height); ctx.lineTo(point.x * width + .1, point.y * height + .1); } ctx.stroke();
  }
}

function pointFromEvent(event) {
  const rect = overlayCanvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
}

overlayCanvas.addEventListener('pointerdown', (event) => {
  if (!state.pdf || state.mode === 'select') return;
  const point = pointFromEvent(event); overlayCanvas.setPointerCapture(event.pointerId);
  const color = $('#ink-color').value; const size = Math.min(96, Math.max(1, Number($('#stroke-size').value) || 3));
  if (state.mode === 'text') {
    const text = $('#text-content').value.trim(); if (!text) { setStatus('Enter text in the Tool options panel first.', 'error'); return; }
    const fontSize = Math.min(96, Math.max(6, Number($('#font-size').value) || 18)); pageAnnotations().push({ type: 'text', x: point.x, y: point.y, w: 0, h: 0, text, size: fontSize, color }); paintOverlay(); setStatus('Text added. Download the PDF to save your edits.'); return;
  }
  if (state.mode === 'draw' || state.mode === 'signature') state.draft = { type: state.mode, x: point.x, y: point.y, w: 0, h: 0, points: [point], size: state.mode === 'signature' ? Math.max(2, size) : size, color: state.mode === 'signature' ? '#172b2c' : color };
  else state.draft = { type: state.mode, x: point.x, y: point.y, w: 0, h: 0, color, size };
});

overlayCanvas.addEventListener('pointermove', (event) => {
  if (!state.draft) return; const point = pointFromEvent(event);
  if (state.draft.type === 'draw' || state.draft.type === 'signature') state.draft.points.push(point);
  else { state.draft.w = point.x - state.draft.x; state.draft.h = point.y - state.draft.y; }
  paintOverlay();
});

function finishPointer() {
  if (!state.draft) return;
  if (state.draft.w < 0) { state.draft.x += state.draft.w; state.draft.w = Math.abs(state.draft.w); }
  if (state.draft.h < 0) { state.draft.y += state.draft.h; state.draft.h = Math.abs(state.draft.h); }
  if ((state.draft.type === 'draw' || state.draft.type === 'signature') ? state.draft.points.length : state.draft.w > .003 && state.draft.h > .003) pageAnnotations().push(state.draft);
  state.draft = null; paintOverlay(); setStatus('Edit added. Download the PDF to save your work.');
}
overlayCanvas.addEventListener('pointerup', finishPointer); overlayCanvas.addEventListener('pointercancel', finishPointer);

function hexParts(hex) { return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255); }

async function exportPdf() {
  if (!state.bytes || state.busy) return;
  state.busy = true; $('#save-pdf').disabled = true; $('#save-pdf').textContent = 'Preparing…'; setStatus('Creating your edited PDF locally…');
  try {
    const pdf = await PDFDocument.load(state.bytes, { updateMetadata: false }); const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let index = 0; index < state.annotations.length; index++) {
      const items = state.annotations[index]; if (!items.length) continue;
      const page = pdf.getPage(index); const rotation = page.getRotation().angle % 360;
      if (rotation !== 0) throw new Error(`Page ${index + 1} has a rotated view. Rotate it upright before using this editor.`);
      const crop = page.getCropBox(); const pageW = crop.width; const pageH = crop.height;
      for (const item of items) {
        const [r, g, b] = hexParts(item.color || '#167c69'); const color = rgb(r, g, b);
        const x = crop.x + item.x * pageW; const yTop = crop.y + (1 - item.y) * pageH;
        if (item.type === 'text') {
          page.drawText(item.text, { x, y: yTop - item.size, size: item.size, font, color, lineHeight: item.size * 1.2 });
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
    link.href = url; link.download = `${state.file.name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_')}-edited.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); setStatus('PDF downloaded. The original file was not changed.', 'success');
  } catch (error) { setStatus(error.message || 'Could not save the edited PDF.', 'error'); }
  finally { state.busy = false; $('#save-pdf').disabled = false; $('#save-pdf').textContent = 'Download PDF'; }
}

let resizeTimer;
window.addEventListener('resize', () => { if (!state.pdf) return; clearTimeout(resizeTimer); resizeTimer = setTimeout(renderPage, 120); });
$('#canvas-scroll').addEventListener('dragover', (event) => { event.preventDefault(); $('#canvas-scroll').classList.add('editor-drop-active'); });
$('#canvas-scroll').addEventListener('dragleave', () => $('#canvas-scroll').classList.remove('editor-drop-active'));
$('#canvas-scroll').addEventListener('drop', (event) => { event.preventDefault(); $('#canvas-scroll').classList.remove('editor-drop-active'); const file = [...event.dataTransfer.files].find((item) => item.type === 'application/pdf' || item.name.toLowerCase().endsWith('.pdf')); if (file) openPdf(file); });
