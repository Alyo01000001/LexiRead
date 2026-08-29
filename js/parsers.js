/* =============================================================
   LexiRead — Document Parsers & Segmentation Engine
   ============================================================= */

'use strict';

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}\p{M}''’\-]*/gu;
const countTokens = t => (String(t).match(new RegExp(WORD_RE.source, 'gu')) || []).length;

// 1. SEGMENTATION (Sentence Chunks for Context)
function buildSegments(docText) {
    const clean = String(docText).replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const chunks = splitSentences(clean).filter(s => s.trim().length > 0);
    
    const segs = [];
    let tok = 0;
    for (const c of chunks) {
        const n = countTokens(c);
        segs.push({ original: c, translated: null, status: 'idle', startTok: tok, endTok: tok + n });
        tok += n;
    }
    return segs;
}

function splitSentences(text) {
    const parts = [];
    let last = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
            let j = i + 1;
            while (j < text.length && /["'”’)\]]/.test(text[j])) j++;
            if (j >= text.length || /\s/.test(text[j])) {
                const seg = text.slice(last, j).trim();
                if (seg) parts.push(seg);
                last = j; i = j - 1;
            }
        }
    }
    const tail = text.slice(last).trim();
    if (tail) parts.push(tail);
    return parts.length ? parts : [text];
}

function hardSplit(s) {
    const out = [];
    let rest = s;
    while (rest.length > API_MAX_CHUNK) {
        let cut = rest.lastIndexOf(' ', API_MAX_CHUNK);
        if (cut < API_MAX_CHUNK * 0.5) cut = API_MAX_CHUNK;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out;
}

function buildTokenSegMap() {
    tokenSegMap = new Array(totalTokens).fill(-1);
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        for (let t = s.startTok; t < s.endTok; t++) tokenSegMap[t] = i;
    }
}

// 2. TOKENIZATION HELPERS
function makeWordSpan(text) {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = text;              // EXACT case, never mutated
    span.dataset.i = String(wordSpans.length);
    wordIndex.set(span, wordSpans.length);
    wordSpans.push(span);
    return span;
}

function tokenizeStringInto(text, parent) {
    const frag = document.createDocumentFragment();
    WORD_RE.lastIndex = 0;
    let last = 0, m;
    while ((m = WORD_RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        frag.appendChild(makeWordSpan(m[0]));
        last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    parent.appendChild(frag);
}

const SKIP_TAGS = new Set(['SCRIPT','STYLE','CODE','PRE','TEXTAREA']);
function tokenizeInPlace(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
            let p = node.parentNode;
            while (p && p !== root) {
                if (SKIP_TAGS.has(p.nodeName)) return NodeFilter.FILTER_REJECT;
                p = p.parentNode;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    const nodes = [];
    let n; while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
        if (!/[\p{L}\p{N}]/u.test(node.nodeValue)) continue;
        tokenizeStringInto(node.nodeValue, {
            appendChild(frag) { node.parentNode.replaceChild(frag, node); }
        });
    }
}

// 3. PARSERS (TXT, DOCX, PDF)
function readTxtString(file) {
    if (file.__txt != null) return Promise.resolve(file.__txt);
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('Could not read the TXT file.'));
        r.readAsText(file, 'UTF-8');
    });
}

async function parseTxt(file) {
    return { kind: 'txt', docText: await readTxtString(file) };
}

const DOCX_STYLE_MAP = [
    "p[style-name='Title'] => h1.title:fresh",
    "p[style-name='Subtitle'] => h2.subtitle:fresh",
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    "p[style-name='Heading 4'] => h4:fresh",
    "p[style-name='Quote'] => blockquote:fresh",
    "r[style-name='Strong'] => strong"
].join('\n');

async function parseDocx(file) {
    const buf = file.__docxBuf || await file.arrayBuffer();
    const [htmlRes, rawRes] = await Promise.all([
        mammoth.convertToHtml({ arrayBuffer: buf.slice(0) }, { styleMap: DOCX_STYLE_MAP }),
        file.__docxRaw != null ? Promise.resolve({ value: file.__docxRaw })
                               : mammoth.extractRawText({ arrayBuffer: buf.slice(0) })
    ]);
    return { kind: 'docx', docText: rawRes.value, html: htmlRes.value };
}

async function parsePdf(file, cropTop = 0, cropBottom = 0) {
    let pdf = file.__pdf;
    if (!pdf) {
        const buf = await file.arrayBuffer();
        pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    }
    const pageCount = pdf.numPages, pagesText = [], pageViewports = [];
    for (let i = 1; i <= pageCount; i++) {
        if (i % 5 === 0 || i === pageCount) {
            loaderText.textContent = t('loaderReadingLayer', { cur: i, total: pageCount });
        }
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
        pageViewports.push(viewport);
        const tc = await page.getTextContent();

        const validItems = tc.items.filter(it => {
            if (!it.str || !it.transform) return false;
            const itemY = viewport.height - it.transform[5];
            const ratio = itemY / viewport.height;
            if (cropTop > 0 && ratio < (cropTop - 0.005)) return false;
            if (cropBottom > 0 && ratio > (1 - cropBottom + 0.005)) return false;
            return true;
        });
        tc.__filteredItems = validItems;
        pagesText.push(tc);
    }
    
    let outline = null;
    try { outline = await pdf.getOutline(); } catch (_) {}

    // Casing preserved: item.str is used exactly as pdf.js reports it.
    const docText = pagesText.map(tc => (tc.__filteredItems || tc.items).map(it => it.str || '').join(' ')).join('\n');
    return { kind: 'pdf', docText, pdf, pagesText, pageViewports, pageCount, cropTop, cropBottom, outline };
}

/** Document validator */
async function validateFileLimits(file, ext) {
    if (ext === 'txt') {
        const text = await readTxtString(file);
        file.__txt = text;
        return;
    }
    if (ext === 'pdf') {
        if (!window.pdfjsLib) throw new Error('pdf.js failed to load — check your connection.');
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        file.__pdf = pdf;
        return;
    }
    if (ext === 'docx') {
        if (!window.mammoth) throw new Error('mammoth.js failed to load — check your connection.');
        const buf = await file.arrayBuffer();
        file.__docxBuf = buf;
        const raw = await mammoth.extractRawText({ arrayBuffer: buf.slice(0) });
        file.__docxRaw = raw.value || '';
        return;
    }
}

// 4. PDF CROP / EXCLUSION MODAL LOGIC
let currentCropFile = null;
let cropPdfDoc = null;
let cropCurrentPageNum = 1;
let cropTotalPageCount = 1;
let currentTopPct = 7;
let currentBottomPct = 7;

let isDraggingCropTop = false;
let isDraggingCropBottom = false;

async function openPdfCropModal(file) {
    currentCropFile = file;
    try {
        if (!file.__pdf) {
            const buf = await file.arrayBuffer();
            file.__pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        }
        cropPdfDoc = file.__pdf;
        cropTotalPageCount = cropPdfDoc.numPages;
        cropCurrentPageNum = 1;
        
        const savedTop = localStorage.getItem(CROP_TOP_KEY);
        const savedBtm = localStorage.getItem(CROP_BTM_KEY);
        currentTopPct = (savedTop !== null && !isNaN(Number(savedTop))) ? Number(savedTop) : 7;
        currentBottomPct = (savedBtm !== null && !isNaN(Number(savedBtm))) ? Number(savedBtm) : 7;
        updateCropOverlays();
        
        await renderCropPreviewPage(cropCurrentPageNum);
        openModal(pdfCropModal);
    } catch (e) {
        console.error('Failed to open PDF crop preview:', e);
        processDocument(file, 'pdf', 0, 0);
    }
}

async function renderCropPreviewPage(pageNum) {
    if (!cropPdfDoc) return;
    cropPageIndicator.textContent = `${pageNum} / ${cropTotalPageCount}`;
    cropPrevPage.disabled = (pageNum <= 1);
    cropNextPage.disabled = (pageNum >= cropTotalPageCount);

    try {
        const page = await cropPdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const maxH = Math.min(window.innerHeight * 0.60, 540);
        const scale = maxH / viewport.height;
        const scaledViewport = page.getViewport({ scale });

        cropCanvas.width = Math.floor(scaledViewport.width);
        cropCanvas.height = Math.floor(scaledViewport.height);
        cropPreviewContainer.style.width = Math.floor(scaledViewport.width) + 'px';
        cropPreviewContainer.style.height = Math.floor(scaledViewport.height) + 'px';

        const ctx = cropCanvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
        updateCropOverlays();
    } catch (err) {
        console.error('Error rendering preview page:', err);
    }
}

function updateCropOverlays() {
    cropTopVal.textContent = Math.round(currentTopPct) + '%';
    cropBottomVal.textContent = Math.round(currentBottomPct) + '%';
    cropTopOverlay.style.height = currentTopPct + '%';
    cropBottomOverlay.style.height = currentBottomPct + '%';
    cropTopOverlay.style.display = currentTopPct > 0 ? 'flex' : 'none';
    cropBottomOverlay.style.display = currentBottomPct > 0 ? 'flex' : 'none';
}

function onPointerDownTop(e) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingCropTop = true;
    document.body.style.cursor = 'ns-resize';
}
function onPointerDownBottom(e) {
    e.preventDefault();
    e.stopPropagation();
    isDraggingCropBottom = true;
    document.body.style.cursor = 'ns-resize';
}

if (cropTopHandle) {
    cropTopHandle.addEventListener('mousedown', onPointerDownTop);
    cropTopHandle.addEventListener('touchstart', onPointerDownTop, { passive: false });
}
if (cropBottomHandle) {
    cropBottomHandle.addEventListener('mousedown', onPointerDownBottom);
    cropBottomHandle.addEventListener('touchstart', onPointerDownBottom, { passive: false });
}

function onPointerMove(e) {
    if (!isDraggingCropTop && !isDraggingCropBottom) return;
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = cropPreviewContainer.getBoundingClientRect();
    if (rect.height <= 0) return;

    if (isDraggingCropTop) {
        const y = clientY - rect.top;
        let pct = (y / rect.height) * 100;
        pct = Math.max(0, Math.min(35, Math.min(pct, 100 - currentBottomPct - 5)));
        currentTopPct = pct;
        updateCropOverlays();
    } else if (isDraggingCropBottom) {
        const y = rect.bottom - clientY;
        let pct = (y / rect.height) * 100;
        pct = Math.max(0, Math.min(35, Math.min(pct, 100 - currentTopPct - 5)));
        currentBottomPct = pct;
        updateCropOverlays();
    }
}

function onPointerUp() {
    if (isDraggingCropTop || isDraggingCropBottom) {
        isDraggingCropTop = false;
        isDraggingCropBottom = false;
        document.body.style.cursor = '';
        localStorage.setItem(CROP_TOP_KEY, String(Math.round(currentTopPct)));
        localStorage.setItem(CROP_BTM_KEY, String(Math.round(currentBottomPct)));
    }
}

window.addEventListener('mousemove', onPointerMove);
window.addEventListener('touchmove', onPointerMove, { passive: false });
window.addEventListener('mouseup', onPointerUp);
window.addEventListener('touchend', onPointerUp);

if (cropPrevPage) {
    cropPrevPage.addEventListener('click', () => {
        if (cropCurrentPageNum > 1) {
            cropCurrentPageNum--;
            renderCropPreviewPage(cropCurrentPageNum);
        }
    });
}
if (cropNextPage) {
    cropNextPage.addEventListener('click', () => {
        if (cropCurrentPageNum < cropTotalPageCount) {
            cropCurrentPageNum++;
            renderCropPreviewPage(cropCurrentPageNum);
        }
    });
}

if (cropBackBtn) {
    cropBackBtn.addEventListener('click', () => {
        closeModal(pdfCropModal);
        const f = currentCropFile;
        if (f) {
            pendingFile = f;
            pendingExt = 'pdf';
            langFileName.textContent = f.name;
            langSrc.value = currentSrc;
            langTgt.value = currentTgt;
            langHint.classList.add('hidden');
            openModal(langModal);
        }
    });
}

if (cropCloseBtn) {
    cropCloseBtn.addEventListener('click', () => {
        closeModal(pdfCropModal);
        currentCropFile = null;
        pendingFile = null;
        const hadDoc = wordSpans.length > 0 && !reader.classList.contains('hidden');
        if (!hadDoc) showWelcomeState();
    });
}

if (cropConfirmBtn) {
    cropConfirmBtn.addEventListener('click', () => {
        const topRatio = currentTopPct / 100;
        const btmRatio = currentBottomPct / 100;
        localStorage.setItem(CROP_TOP_KEY, String(Math.round(currentTopPct)));
        localStorage.setItem(CROP_BTM_KEY, String(Math.round(currentBottomPct)));
        closeModal(pdfCropModal);
        const f = currentCropFile;
        currentCropFile = null;
        pendingFile = null;
        if (f) processDocument(f, 'pdf', topRatio, btmRatio);
    });
}

if (cropSkipBtn) {
    cropSkipBtn.addEventListener('click', () => {
        closeModal(pdfCropModal);
        const f = currentCropFile;
        currentCropFile = null;
        pendingFile = null;
        if (f) processDocument(f, 'pdf', 0, 0);
    });
}

if (pdfCropModal) {
    const back = pdfCropModal.querySelector('.cropBack');
    if (back) {
        back.addEventListener('click', () => {
            closeModal(pdfCropModal);
            currentCropFile = null;
            pendingFile = null;
            const hadDoc = wordSpans.length > 0 && !reader.classList.contains('hidden');
            if (!hadDoc) showWelcomeState();
        });
    }
}
