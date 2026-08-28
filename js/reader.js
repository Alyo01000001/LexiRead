/* =============================================================
   LexiRead — Reader Engine, Zoom & Navigation Controller
   ============================================================= */

'use strict';

async function processDocument(file, ext, cropTop = 0, cropBottom = 0) {
    if (pipelineRunning) { showToast('Already processing a document…', 'warn'); return; }
    pipelineRunning = true;
    currentDocKey = file.name + '_' + (file.size || 0);
    currentDocKind = ext;
    try {
        showLoader(`Reading ${labelExt(ext)} file…`);
        let parsed;
        if      (ext === 'txt')  parsed = await parseTxt(file);
        else if (ext === 'pdf')  parsed = await parsePdf(file, cropTop, cropBottom);
        else                     parsed = await parseDocx(file);

        if (!parsed.docText || !parsed.docText.trim()) throw new Error('No readable text found in this document.');

        parsed = initDocument(parsed);
        showLoader('Rendering document…');
        if      (parsed.kind === 'txt')  renderTxt(parsed);
        else if (parsed.kind === 'pdf')  await renderPdf(parsed);
        else                             renderDocx(parsed);

        hideTooltip();
        checkAndShowResumeBanner(currentDocKey, parsed);

        showToast(
            getKey()
                ? `Loaded "${file.name}" — ${langName(currentSrc)} → ${langName(currentTgt)}`
                : `Loaded "${file.name}" — add an API Key to translate.`,
            getKey() ? 'success' : 'info'
        );
    } catch (err) {
        console.error('[LexiRead]', err);
        showToast(err.message || 'Failed to process the file.', 'error');
        showWelcomeState();
    } finally {
        pipelineRunning = false;
    }
}

function checkAndShowResumeBanner(docKey, parsed) {
    if (!resumeBanner) return;
    resumeBanner.classList.add('hidden');
    resumeBanner.classList.remove('flex');
    if (!docKey) return;
    try {
        const raw = localStorage.getItem('lexi.prog.' + docKey);
        if (!raw) return;
        const prog = JSON.parse(raw);
        if (prog && ((prog.page && prog.page > 1) || (prog.scrollTop && prog.scrollTop > 200))) {
            resumePageNum.textContent = prog.page ? `Page ${prog.page}` : `Saved Position`;
            resumeBanner.classList.remove('hidden');
            resumeBanner.classList.add('flex');
            
            resumeJumpBtn.onclick = () => {
                resumeBanner.classList.add('hidden');
                resumeBanner.classList.remove('flex');
                if (parsed.kind === 'pdf' && prog.page) {
                    const target = $(`pdf-page-${prog.page}`);
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (prog.scrollTop) {
                    window.scrollTo({ top: prog.scrollTop, behavior: 'smooth' });
                }
            };
            resumeDismissBtn.onclick = () => {
                resumeBanner.classList.add('hidden');
                resumeBanner.classList.remove('flex');
            };
        }
    } catch (_) {}
}

function saveCurrentProgress() {
    if (!currentDocKey) return;
    try {
        let pageNum = 1;
        if (currentDocKind === 'pdf' && navCurPage) {
            pageNum = Number(navCurPage.textContent) || 1;
        }
        const prog = {
            page: pageNum,
            scrollTop: window.scrollY,
            time: Date.now()
        };
        localStorage.setItem('lexi.prog.' + currentDocKey, JSON.stringify(prog));
    } catch (_) {}
}

function initDocument(parsed) {
    pipelineGen++;
    segments = buildSegments(parsed.docText);
    totalTokens = segments.reduce((s, x) => s + (x.endTok - x.startTok), 0);
    buildTokenSegMap();
    sentenceCache.clear();
    ondemandCache.clear();
    return parsed;
}

function showLoader(msg) {
    loaderText.textContent = msg;
    welcomeState.classList.add('hidden');
    reader.classList.add('hidden');
    loader.classList.remove('hidden');
    loader.classList.add('flex');
}
function showWelcomeState() {
    loader.classList.add('hidden'); loader.classList.remove('flex');
    reader.classList.add('hidden');
    welcomeState.classList.remove('hidden');
    dropZone.classList.remove('hidden');
    headerUploadBtn.classList.add('hidden'); headerUploadBtn.classList.remove('flex');
    leftControlWidget.classList.add('hidden'); leftControlWidget.classList.remove('flex');
    if (resumeBanner) { resumeBanner.classList.add('hidden'); resumeBanner.classList.remove('flex'); }
}
function showReaderState(mode = 'txt') {
    loader.classList.add('hidden'); loader.classList.remove('flex');
    welcomeState.classList.add('hidden');
    dropZone.classList.add('hidden');
    headerUploadBtn.classList.remove('hidden'); headerUploadBtn.classList.add('flex');
    leftControlWidget.classList.remove('hidden'); leftControlWidget.classList.add('flex');
    reader.classList.remove('hidden');
    
    // Show typography button for text documents
    if (mode === 'txt' || mode === 'docx') {
        typographyBtn.classList.remove('hidden');
        typographyBtn.classList.add('flex');
    } else {
        typographyBtn.classList.add('hidden');
        typographyBtn.classList.remove('flex');
    }
}

// 1. RENDERERS
function renderTxt(parsed) {
    currentParsedDoc = parsed;
    pdfNavSection.classList.add('hidden');
    pdfNavSection.classList.remove('flex');
    navOutlineBtn.classList.add('hidden');
    navOutlineBtn.classList.remove('flex');
    wordSpans = []; wordIndex = new Map();
    reader.className = 'reader-text txt-mode px-4 py-6 sm:px-10 sm:py-10';
    reader.innerHTML = '';
    for (const para of parsed.docText.replace(/\r\n?/g, '\n').split(/\n\s*\n+/)) {
        if (!para.trim()) continue;
        const p = document.createElement('p');
        p.className = 'mb-6';
        tokenizeStringInto(para, p);
        reader.appendChild(p);
    }
    applyCurrentZoom();
    finishRender();
}

function renderDocx(parsed) {
    currentParsedDoc = parsed;
    pdfNavSection.classList.add('hidden');
    pdfNavSection.classList.remove('flex');
    navOutlineBtn.classList.add('hidden');
    navOutlineBtn.classList.remove('flex');
    wordSpans = []; wordIndex = new Map();
    reader.className = 'docx-mode px-4 py-6 sm:px-10 sm:py-10';
    reader.innerHTML = '';
    const host = document.createElement('div');
    host.innerHTML = parsed.html;
    reader.appendChild(host);
    tokenizeInPlace(host);
    applyCurrentZoom();
    finishRender();
}

async function renderPdf(parsed) {
    currentParsedDoc = parsed;
    wordSpans = []; wordIndex = new Map();
    reader.className = 'pdf-mode px-2 py-6 sm:px-6 sm:py-10';
    reader.innerHTML = '';

    if (pdfPageObserver) {
        pdfPageObserver.disconnect();
        pdfPageObserver = null;
    }

    navCurPage.textContent = '1';
    navTotalPages.textContent = String(parsed.pageCount);
    pdfNavSection.classList.remove('hidden');
    pdfNavSection.classList.add('flex');

    const avail = Math.min(1000, Math.max(320, (reader.clientWidth || 900) - 24));
    const baseViewport = (parsed.pageViewports && parsed.pageViewports[0]) || (await parsed.pdf.getPage(1)).getViewport({ scale: 1 });
    const scale = Math.min(1.6, Math.max(0.5, avail / baseViewport.width));

    // Create lightweight page containers and tokenized textLayers
    for (let i = 1; i <= parsed.pageCount; i++) {
        if (i % 10 === 0 || i === parsed.pageCount) {
            loaderText.textContent = `Preparing page structure ${i} / ${parsed.pageCount}…`;
        }
        const page = await parsed.pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const tc = parsed.pagesText[i - 1] || (await page.getTextContent());

        const wrap = document.createElement('div');
        wrap.className = 'pdf-page';
        wrap.id = `pdf-page-${i}`;
        wrap.dataset.page = String(i);
        wrap.dataset.baseWidth = String(viewport.width);
        wrap.dataset.baseHeight = String(viewport.height);
        wrap.dataset.baseScale = String(viewport.scale);
        wrap.style.width  = (viewport.width * currentZoomRatio) + 'px';
        wrap.style.height = (viewport.height * currentZoomRatio) + 'px';

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas';
        canvas.style.width  = (viewport.width * currentZoomRatio) + 'px';
        canvas.style.height = (viewport.height * currentZoomRatio) + 'px';
        wrap.appendChild(canvas);

        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';
        textLayer.style.setProperty('--scale-factor', String(viewport.scale * currentZoomRatio));
        wrap.appendChild(textLayer);
        reader.appendChild(wrap);

        await renderPdfTextLayerOnly(textLayer, tc, viewport, parsed.cropTop || 0, parsed.cropBottom || 0);
    }

    // Virtualized Canvas IntersectionObserver
    pdfPageObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const wrap = entry.target;
            const pageNum = Number(wrap.dataset.page);
            if (entry.isIntersecting) {
                renderPdfCanvasOnly(wrap, pageNum, parsed.pdf, scale);
            } else {
                if (parsed.pageCount > 12) {
                    freePdfCanvas(wrap);
                }
            }
        }
    }, { root: null, rootMargin: '800px 0px', threshold: 0.01 });

    document.querySelectorAll('.pdf-page').forEach(w => pdfPageObserver.observe(w));

    if (parsed.outline && parsed.outline.length) {
        navOutlineBtn.classList.remove('hidden');
        navOutlineBtn.classList.add('flex');
        navOutlineBtn.onclick = () => {
            renderOutlineModal(parsed.outline, parsed.pdf);
            openModal(outlineModal);
        };
    } else {
        navOutlineBtn.classList.add('hidden');
        navOutlineBtn.classList.remove('flex');
    }

    finishRender();
}

async function renderPdfTextLayerOnly(textLayer, textContent, viewport, cropTop, cropBottom) {
    const textDivs = [];
    await pdfjsLib.renderTextLayer({
        textContentSource: textContent, container: textLayer, viewport, textDivs
    }).promise;

    const totalHeight = textLayer.clientHeight || textLayer.offsetHeight || (viewport.height * currentZoomRatio) || viewport.height;

    for (const div of textDivs) {
        const text = div.textContent;
        if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;

        const divTop = div.offsetTop || parseFloat(div.style.top) || 0;
        const divRatio = totalHeight > 0 ? (divTop / totalHeight) : (divTop / viewport.height);

        if (cropTop > 0 && divRatio < (cropTop - 0.005)) {
            div.classList.add('pdf-crop-excluded');
            continue;
        }
        if (cropBottom > 0 && divRatio > (1 - cropBottom + 0.005)) {
            div.classList.add('pdf-crop-excluded');
            continue;
        }

        tokenizeStringInto(text, {
            appendChild(frag) { div.textContent = ''; div.appendChild(frag); }
        });
    }
}

async function renderPdfCanvasOnly(wrap, pageNumber, pdf, baseScale) {
    if (wrap.dataset.rendered === 'true' || wrap.dataset.rendering === 'true') return;
    wrap.dataset.rendering = 'true';
    try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: baseScale });
        const canvas = wrap.querySelector('canvas');
        if (!canvas) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width  = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        await page.render({ canvasContext: ctx, viewport }).promise;
        wrap.dataset.rendered = 'true';
    } catch (e) {
        console.error('Error rendering page canvas:', e);
    } finally {
        delete wrap.dataset.rendering;
    }
}

function freePdfCanvas(wrap) {
    if (wrap.dataset.rendered !== 'true') return;
    const canvas = wrap.querySelector('canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 1;
        canvas.height = 1;
    }
    delete wrap.dataset.rendered;
}

// 2. OUTLINE / TABLE OF CONTENTS
async function resolveOutlineDestination(dest, pdf) {
    if (!dest) return 1;
    try {
        if (typeof dest === 'string') {
            const explicitDest = await pdf.getDestination(dest);
            return resolveOutlineDestination(explicitDest, pdf);
        }
        if (Array.isArray(dest) && dest[0]) {
            const pageRef = dest[0];
            if (typeof pageRef === 'object' && pageRef !== null) {
                const pageIndex = await pdf.getPageIndex(pageRef);
                return pageIndex + 1;
            }
            if (typeof pageRef === 'number') {
                return pageRef + 1;
            }
        }
        if (typeof dest === 'number') return dest + 1;
    } catch (_) {}
    return 1;
}

async function renderOutlineModal(outline, pdf) {
    outlineList.innerHTML = '';
    if (!outline || !outline.length) {
        outlineList.innerHTML = '<p class="text-center text-slate-500 py-6">No table of contents available for this PDF.</p>';
        return;
    }

    async function appendOutlineNodes(items, parentEl, depth = 0) {
        for (const it of items) {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-indigo-600/20 hover:text-indigo-300 cursor-pointer text-slate-200 transition group';
            row.style.paddingLeft = `${depth * 14 + 10}px`;

            const label = document.createElement('span');
            label.className = 'truncate text-xs font-medium';
            label.textContent = it.title || 'Untitled Chapter';
            row.appendChild(label);

            row.addEventListener('click', async () => {
                closeModal(outlineModal);
                const pageNum = await resolveOutlineDestination(it.dest, pdf);
                const target = $(`pdf-page-${pageNum}`);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });

            parentEl.appendChild(row);
            if (it.items && it.items.length) {
                await appendOutlineNodes(it.items, parentEl, depth + 1);
            }
        }
    }

    await appendOutlineNodes(outline, outlineList);
}

if (outlineClose) outlineClose.addEventListener('click', () => closeModal(outlineModal));
if (outlineModal) {
    const back = outlineModal.querySelector('.outlineBack');
    if (back) back.addEventListener('click', () => closeModal(outlineModal));
}

// 3. TYPOGRAPHY CUSTOMIZER
function applyTypography(font, lh) {
    if (font) {
        document.documentElement.style.setProperty('--reader-font', font);
        localStorage.setItem(TYPO_FONT_KEY, font);
    }
    if (lh) {
        if (reader) reader.style.lineHeight = lh;
        localStorage.setItem(TYPO_LH_KEY, lh);
    }
}

const savedFont = localStorage.getItem(TYPO_FONT_KEY);
const savedLh = localStorage.getItem(TYPO_LH_KEY);
if (savedFont) document.documentElement.style.setProperty('--reader-font', savedFont);
if (savedLh && reader) reader.style.lineHeight = savedLh;

if (typographyBtn) typographyBtn.addEventListener('click', () => openModal(typographyModal));
if (typographyClose) typographyClose.addEventListener('click', () => closeModal(typographyModal));
if (typographyModal) {
    const back = typographyModal.querySelector('.typographyBack');
    if (back) back.addEventListener('click', () => closeModal(typographyModal));
}

document.querySelectorAll('.font-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const f = btn.dataset.font;
        applyTypography(f, null);
        showToast(`Font updated: ${btn.textContent}`, 'info', 1600);
    });
});
document.querySelectorAll('.spacing-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const lh = btn.dataset.lh;
        applyTypography(null, lh);
        showToast(`Line spacing: ${btn.textContent}`, 'info', 1600);
    });
});

// 4. ZOOM & NAVIGATION CONTROLLER
function setZoom(val) {
    const clamped = Math.max(70, Math.min(180, val));
    currentZoomRatio = clamped / 100;
    zoomSlider.value = clamped;
    zoomLabel.textContent = clamped + '%';
    applyCurrentZoom();
}

function applyCurrentZoom() {
    if (reader.classList.contains('txt-mode') || reader.classList.contains('docx-mode')) {
        reader.style.fontSize = (1.2 * currentZoomRatio) + 'rem';
    }
    if (reader.classList.contains('pdf-mode')) {
        document.querySelectorAll('.pdf-page').forEach(pageWrap => {
            const baseW = Number(pageWrap.dataset.baseWidth);
            const baseH = Number(pageWrap.dataset.baseHeight);
            const baseScale = Number(pageWrap.dataset.baseScale);

            const targetW = baseW * currentZoomRatio;
            const targetH = baseH * currentZoomRatio;

            pageWrap.style.width = targetW + 'px';
            pageWrap.style.height = targetH + 'px';

            const canvas = pageWrap.querySelector('canvas');
            if (canvas) {
                canvas.style.width = targetW + 'px';
                canvas.style.height = targetH + 'px';
            }

            const textLayer = pageWrap.querySelector('.textLayer');
            if (textLayer) {
                textLayer.style.setProperty('--scale-factor', String(baseScale * currentZoomRatio));
            }
        });
    }
}

if (zoomSlider) zoomSlider.addEventListener('input', () => setZoom(Number(zoomSlider.value)));
if (zoomInBtn) zoomInBtn.addEventListener('click', () => setZoom(Number(zoomSlider.value) + 10));
if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setZoom(Number(zoomSlider.value) - 10));
if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => setZoom(100));

if (navPrevPage) {
    navPrevPage.addEventListener('click', () => {
        const cur = Number(navCurPage.textContent) || 1;
        if (cur > 1) {
            const target = $(`pdf-page-${cur - 1}`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

if (navNextPage) {
    navNextPage.addEventListener('click', () => {
        const cur = Number(navCurPage.textContent) || 1;
        const total = Number(navTotalPages.textContent) || 1;
        if (cur < total) {
            const target = $(`pdf-page-${cur + 1}`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
}

let scrollProgressTimer = null;
window.addEventListener('scroll', () => {
    if (!reader.classList.contains('pdf-mode') || !currentParsedDoc) return;
    const pages = document.querySelectorAll('.pdf-page');
    if (!pages.length) return;
    const midY = window.innerHeight * 0.35;
    let cur = 1;
    for (const p of pages) {
        const rect = p.getBoundingClientRect();
        if (rect.top <= midY && rect.bottom >= midY) {
            cur = Number(p.dataset.page);
            break;
        } else if (rect.top > midY) {
            break;
        }
    }
    navCurPage.textContent = String(cur);
    navPrevPage.disabled = (cur <= 1);
    navNextPage.disabled = (cur >= currentParsedDoc.pageCount);

    clearTimeout(scrollProgressTimer);
    scrollProgressTimer = setTimeout(saveCurrentProgress, 400);
}, { passive: true });

function finishRender() {
    showReaderState(currentParsedDoc ? currentParsedDoc.kind : 'txt');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
