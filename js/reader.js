/* =============================================================
   LexiRead — Reader Engine, Zoom & Navigation Controller
   ============================================================= */

'use strict';

async function processDocument(file, ext, cropTop = 0, cropBottom = 0, isResume = false, resumePage = null, resumeScrollTop = null) {
    if (pipelineRunning) { showToast(t('alreadyProcessingMsg'), 'warn'); return; }
    pipelineRunning = true;
    currentDocKey = file.name + '_' + (file.size || 0);
    currentDocKind = ext;
    try {
        showLoader(t('loaderReadingFile', { ext: labelExt(ext) }));
        let parsed;
        if      (ext === 'txt')  parsed = await parseTxt(file);
        else if (ext === 'pdf')  parsed = await parsePdf(file, cropTop, cropBottom);
        else                     parsed = await parseDocx(file);

        if (!parsed.docText || !parsed.docText.trim()) throw new Error(t('noReadableTextMsg'));

        parsed = initDocument(parsed);
        if (file.__customTitle) {
            parsed.customTitle = file.__customTitle;
        }
        showLoader(t('loaderRendering'));
        if      (parsed.kind === 'txt')  renderTxt(parsed);
        else if (parsed.kind === 'pdf')  await renderPdf(parsed);
        else                             renderDocx(parsed);

        hideTooltip();

        // Save to LexiDB Library
        if (window.LexiDB) {
            const pageNum = resumePage || 1;
            const pagesTotal = parsed.pageCount || 1;
            LexiDB.saveDocument({
                docKey: currentDocKey,
                name: file.name,
                size: file.size || 0,
                ext: ext,
                blob: file,
                pageCount: pagesTotal,
                lastPage: pageNum,
                scrollTop: resumeScrollTop || 0,
                progressPercent: Math.min(100, Math.max(1, Math.round((pageNum / pagesTotal) * 100))),
                srcLang: currentSrc,
                tgtLang: currentTgt,
                cropTop: cropTop || 0,
                cropBottom: cropBottom || 0,
                customTitle: parsed.customTitle || ''
            });
        }

        if (window.LexiSync) {
            LexiSync.handleNewDocumentOpened(file, currentDocKey);
        }

        if (isResume && (resumePage || resumeScrollTop)) {
            setTimeout(() => {
                if (parsed.kind === 'pdf' && resumePage && resumePage > 1) {
                    const target = $(`pdf-page-${resumePage}`);
                    if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
                } else if (resumeScrollTop && resumeScrollTop > 50) {
                    window.scrollTo({ top: resumeScrollTop, behavior: 'instant' });
                }
            }, 100);
        } else {
            checkAndShowResumeBanner(currentDocKey, parsed);
        }

        showToast(
            getKey()
                ? t('loadedWithKey', { name: file.name, src: langName(currentSrc), tgt: langName(currentTgt) })
                : t('loadedNoKey', { name: file.name }),
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
            resumePageNum.textContent = prog.page ? `Page ${prog.page}` : t('resumeSavedPos');
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
        let totalPages = 1;
        if (currentDocKind === 'pdf' && navCurPage) {
            pageNum = Number(navCurPage.textContent) || 1;
            totalPages = currentParsedDoc?.pageCount || Number(navTotalPages?.textContent) || 1;
        } else if (currentParsedDoc) {
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPct = maxScroll > 0 ? Math.min(100, Math.round((window.scrollY / maxScroll) * 100)) : 100;
            totalPages = 100;
            pageNum = Math.max(1, scrollPct);
        }
        const prog = {
            page: pageNum,
            scrollTop: window.scrollY,
            time: Date.now()
        };
        localStorage.setItem('lexi.prog.' + currentDocKey, JSON.stringify(prog));

        if (window.LexiDB) {
            LexiDB.updateDocumentProgress(currentDocKey, pageNum, window.scrollY, totalPages);
        }
        if (window.LexiSync) {
            LexiSync.triggerDebouncedSync();
        }
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
    if (librarySection) librarySection.classList.add('hidden');
    if (readerShell) readerShell.classList.remove('hidden');
    if (mobileUploadFab) {
        mobileUploadFab.classList.add('hidden');
        mobileUploadFab.classList.remove('flex');
    }
    loader.classList.remove('hidden');
    loader.classList.add('flex');
}
function showWelcomeState() {
    if (mainContainer) mainContainer.classList.remove('pdf-layout-active');
    loader.classList.add('hidden'); loader.classList.remove('flex');
    reader.classList.add('hidden');
    reader.classList.remove('pdf-mode', 'txt-mode', 'docx-mode');
    reader.innerHTML = '';
    wordSpans = [];
    wordIndex = new Map();
    currentParsedDoc = null;
    currentDocKey = null;
    currentDocKind = null;
    if (pdfPageObserver) {
        pdfPageObserver.disconnect();
        pdfPageObserver = null;
    }
    if (readerShell) readerShell.classList.add('hidden');
    if (dropZone) dropZone.classList.add('hidden');
    document.documentElement.classList.remove('zen-mode');
    headerUploadBtn.classList.add('hidden'); headerUploadBtn.classList.remove('flex', 'md:flex');
    leftControlWidget.classList.add('hidden'); leftControlWidget.classList.remove('flex');
    pdfNavSection.classList.add('hidden'); pdfNavSection.classList.remove('flex');
    navOutlineBtn.classList.add('hidden'); navOutlineBtn.classList.remove('flex');
    if (bottomMobileBar) { bottomMobileBar.classList.add('hidden'); bottomMobileBar.classList.remove('flex'); }
    if (mobilePdfNav) { mobilePdfNav.classList.add('hidden'); mobilePdfNav.classList.remove('flex'); }
    if (mobileOutlineBtn) { mobileOutlineBtn.classList.add('hidden'); }
    if (mobileTypoBtn) { mobileTypoBtn.classList.add('hidden'); }
    if (resumeBanner) { resumeBanner.classList.add('hidden'); resumeBanner.classList.remove('flex'); }
    hideTooltip();
    if (typeof renderLibrary === 'function') {
        renderLibrary();
    }
}
function showReaderState(mode = 'txt') {
    loader.classList.add('hidden'); loader.classList.remove('flex');
    welcomeState.classList.add('hidden');
    dropZone.classList.add('hidden');
    if (librarySection) librarySection.classList.add('hidden');
    if (readerShell) readerShell.classList.remove('hidden');
    if (mobileUploadFab) {
        mobileUploadFab.classList.add('hidden');
        mobileUploadFab.classList.remove('flex');
    }
    
    // Only show headerUploadBtn on desktop (>=768px)
    if (window.innerWidth >= 768) {
        headerUploadBtn.classList.remove('hidden');
        headerUploadBtn.classList.add('flex');
    } else {
        headerUploadBtn.classList.add('hidden');
        headerUploadBtn.classList.remove('flex', 'md:flex');
    }

    leftControlWidget.classList.remove('hidden'); leftControlWidget.classList.add('flex');
    if (bottomMobileBar) { bottomMobileBar.classList.remove('hidden'); bottomMobileBar.classList.add('flex'); }
    if (reader.classList.contains('hidden')) {
        pushNavState('reader');
    }
    reader.classList.remove('hidden');
    
    // Always show typography & appearance button in reader mode
    typographyBtn.classList.remove('hidden');
    typographyBtn.classList.add('flex');

    const docSettings = $('typographyDocSettings');
    if (docSettings) {
        docSettings.style.display = (mode === 'txt' || mode === 'docx') ? 'block' : 'none';
    }
}

// 1. RENDERERS
function renderTxt(parsed) {
    if (mainContainer) mainContainer.classList.remove('pdf-layout-active');
    currentParsedDoc = parsed;
    pdfNavSection.classList.add('hidden');
    pdfNavSection.classList.remove('flex');
    if (mobilePdfNav) { mobilePdfNav.classList.add('hidden'); mobilePdfNav.classList.remove('flex'); }
    navOutlineBtn.classList.add('hidden');
    navOutlineBtn.classList.remove('flex');
    if (mobileOutlineBtn) { mobileOutlineBtn.classList.add('hidden'); }
    if (mobileTypoBtn) {
        mobileTypoBtn.classList.remove('hidden');
        mobileTypoBtn.classList.add('flex');
    }
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
    if (mainContainer) mainContainer.classList.remove('pdf-layout-active');
    currentParsedDoc = parsed;
    pdfNavSection.classList.add('hidden');
    pdfNavSection.classList.remove('flex');
    if (mobilePdfNav) { mobilePdfNav.classList.add('hidden'); mobilePdfNav.classList.remove('flex'); }
    navOutlineBtn.classList.add('hidden');
    navOutlineBtn.classList.remove('flex');
    if (mobileOutlineBtn) { mobileOutlineBtn.classList.add('hidden'); }
    if (mobileTypoBtn) {
        mobileTypoBtn.classList.remove('hidden');
        mobileTypoBtn.classList.add('flex');
    }
    wordSpans = []; wordIndex = new Map();
    reader.className = 'reader-text docx-mode px-4 py-6 sm:px-10 sm:py-10';
    reader.innerHTML = '';
    const host = document.createElement('div');
    host.innerHTML = parsed.html;
    reader.appendChild(host);
    tokenizeInPlace(host);
    applyCurrentZoom();
    finishRender();
}

async function renderPdf(parsed) {
    if (mainContainer) mainContainer.classList.add('pdf-layout-active');
    currentParsedDoc = parsed;
    wordSpans = []; wordIndex = new Map();
    reader.className = 'pdf-mode px-2 py-6 sm:px-6 sm:py-10';
    reader.innerHTML = '';
    pdfNavSection.classList.remove('hidden');
    pdfNavSection.classList.add('flex');
    if (mobilePdfNav) { mobilePdfNav.classList.remove('hidden'); mobilePdfNav.classList.add('flex'); }
    navCurPage.textContent = '1';
    navTotalPages.textContent = String(parsed.pageCount);
    if (mobileNavCurPage) mobileNavCurPage.textContent = '1';
    if (mobileNavTotalPages) mobileNavTotalPages.textContent = String(parsed.pageCount);

    if (pdfPageObserver) {
        pdfPageObserver.disconnect();
        pdfPageObserver = null;
    }

    navCurPage.textContent = '1';
    navTotalPages.textContent = String(parsed.pageCount);
    pdfNavSection.classList.remove('hidden');
    pdfNavSection.classList.add('flex');

    const screenW = window.innerWidth || document.documentElement.clientWidth || 390;
    const maxDocW = isMobile() ? (screenW - 16) : 920;
    const avail = Math.min(1000, Math.max(260, maxDocW));
    const baseViewport = (parsed.pageViewports && parsed.pageViewports[0]) || (await parsed.pdf.getPage(1)).getViewport({ scale: 1 });
    const scale = Math.min(1.8, Math.max(0.35, avail / baseViewport.width));

    // Create lightweight page containers and tokenized textLayers
    for (let i = 1; i <= parsed.pageCount; i++) {
        if (i % 10 === 0 || i === parsed.pageCount) {
            loaderText.textContent = t('loaderPrepPages', { cur: i, total: parsed.pageCount });
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

    if (mobileTypoBtn) { mobileTypoBtn.classList.add('hidden'); }

    if (parsed.outline && parsed.outline.length) {
        navOutlineBtn.classList.remove('hidden');
        navOutlineBtn.classList.add('flex');
        if (mobileOutlineBtn) {
            mobileOutlineBtn.classList.remove('hidden');
            mobileOutlineBtn.classList.add('flex');
        }
        const openOutline = () => {
            renderOutlineModal(parsed.outline, parsed.pdf);
            openModal(outlineModal);
        };
        navOutlineBtn.onclick = openOutline;
    } else {
        navOutlineBtn.classList.add('hidden');
        navOutlineBtn.classList.remove('flex');
        if (mobileOutlineBtn) mobileOutlineBtn.classList.add('hidden');
    }

    if (window.LexiDB && parsed.pdf) {
        generatePdfThumbnail(parsed.pdf, currentDocKey);
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
        outlineList.innerHTML = `<p class="text-center text-slate-500 py-6">${t('noOutlineMsg')}</p>`;
        return;
    }

    async function appendOutlineNodes(items, parentEl, depth = 0) {
        for (const it of items) {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between py-2 px-3 rounded-xl hover:bg-white/[0.06] hover:text-indigo-300 cursor-pointer text-slate-200 transition active:scale-[0.99] group border border-transparent hover:border-white/5';
            row.style.paddingLeft = `${depth * 14 + 12}px`;

            const label = document.createElement('span');
            label.className = 'truncate text-xs font-medium';
            label.textContent = it.title || t('untitledChapter');
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
        if (reader) reader.style.setProperty('--reader-font', font);
        localStorage.setItem(TYPO_FONT_KEY, font);
        document.querySelectorAll('.font-choice-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.font === font);
        });
    }
    if (lh) {
        if (reader) reader.style.lineHeight = lh;
        localStorage.setItem(TYPO_LH_KEY, lh);
        document.querySelectorAll('.spacing-choice-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.lh === lh);
        });
    }
}

const savedFont = localStorage.getItem(TYPO_FONT_KEY) || "Georgia, 'Iowan Old Style', serif";
const savedLh = localStorage.getItem(TYPO_LH_KEY) || "1.95";
applyTypography(savedFont, savedLh);

const GUI_SCALE_KEY = 'lexiread_gui_scale';
function applyGuiScale(scale, notify = false) {
    const s = String(scale || '100');
    document.documentElement.setAttribute('data-gui-scale', s);
    localStorage.setItem(GUI_SCALE_KEY, s);
    document.querySelectorAll('.gui-scale-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.scale === s);
    });
    if (notify) {
        showToast(t('guiScaleUpdatedToast', { scale: s }), 'info', 1600);
    }
}

const initialScale = localStorage.getItem(GUI_SCALE_KEY) || '100';
applyGuiScale(initialScale, false);

document.querySelectorAll('.gui-scale-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        applyGuiScale(btn.dataset.scale, true);
    });
});

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
        showToast(t('fontUpdatedToast', { font: btn.textContent }), 'info', 1600);
    });
});
document.querySelectorAll('.spacing-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const lh = btn.dataset.lh;
        applyTypography(null, lh);
        showToast(t('spacingUpdatedToast', { spacing: btn.textContent }), 'info', 1600);
    });
});

// 4. ZOOM & NAVIGATION CONTROLLER
function setZoom(val, focalPoint = null) {
    const clamped = Math.max(70, Math.min(250, val));
    currentZoomRatio = clamped / 100;
    if (zoomSlider) zoomSlider.value = clamped;
    if (zoomLabel) zoomLabel.textContent = clamped + '%';
    if (mobileZoomLabel) mobileZoomLabel.textContent = clamped + '%';
    applyCurrentZoom(focalPoint);
}

function applyCurrentZoom(focalPoint = null) {
    const targetX = (focalPoint && typeof focalPoint.x === 'number') ? focalPoint.x : (window.innerWidth / 2);
    const targetY = (focalPoint && typeof focalPoint.y === 'number') ? focalPoint.y : (window.innerHeight * 0.40);

    if (reader.classList.contains('txt-mode') || reader.classList.contains('docx-mode')) {
        const oldReaderRect = reader.getBoundingClientRect();
        const offsetYRatio = (targetY - oldReaderRect.top) / (oldReaderRect.height || 1);
        const offsetXRatio = (targetX - oldReaderRect.left) / (oldReaderRect.width || 1);

        reader.style.fontSize = (1.2 * currentZoomRatio) + 'rem';

        const newReaderRect = reader.getBoundingClientRect();
        const newReaderAbsTop = window.scrollY + newReaderRect.top;
        const desiredScrollTop = newReaderAbsTop + (newReaderRect.height * offsetYRatio) - targetY;
        window.scrollTo({ top: Math.max(0, desiredScrollTop), behavior: 'instant' });

        if (readerShell && readerShell.scrollWidth > readerShell.clientWidth) {
            const shellRect = readerShell.getBoundingClientRect();
            const currentScrollLeft = readerShell.scrollLeft;
            const readerLeftInShell = (newReaderRect.left - shellRect.left) + currentScrollLeft;
            const desiredScrollLeft = readerLeftInShell + (newReaderRect.width * offsetXRatio) - (targetX - shellRect.left);
            readerShell.scrollLeft = Math.max(0, desiredScrollLeft);
        }
    }

    if (reader.classList.contains('pdf-mode')) {
        const pages = document.querySelectorAll('.pdf-page');
        if (!pages.length) return;

        // 1. Capture the active reading anchor under the focal point before resizing
        let anchorPage = null;
        let anchorOffsetYRatio = 0;
        let anchorOffsetXRatio = 0;

        for (const p of pages) {
            const rect = p.getBoundingClientRect();
            if (rect.top <= targetY && rect.bottom >= targetY) {
                anchorPage = p;
                anchorOffsetYRatio = (targetY - rect.top) / (rect.height || 1);
                anchorOffsetXRatio = (targetX - rect.left) / (rect.width || 1);
                break;
            }
        }

        // Fallback: pick the closest page if focal point is outside all pages
        if (!anchorPage) {
            let closestDist = Infinity;
            for (const p of pages) {
                const rect = p.getBoundingClientRect();
                const distY = Math.abs((rect.top + rect.bottom) / 2 - targetY);
                if (distY < closestDist) {
                    closestDist = distY;
                    anchorPage = p;
                    anchorOffsetYRatio = Math.max(0, Math.min(1, (targetY - rect.top) / (rect.height || 1)));
                    anchorOffsetXRatio = Math.max(0, Math.min(1, (targetX - rect.left) / (rect.width || 1)));
                }
            }
        }

        // 2. Adjust rendered widths & heights
        pages.forEach(p => {
            const baseW = Number(p.dataset.baseWidth);
            const baseH = Number(p.dataset.baseHeight);
            const baseScale = Number(p.dataset.baseScale);
            if (baseW && baseH) {
                const targetW = `${baseW * currentZoomRatio}px`;
                const targetH = `${baseH * currentZoomRatio}px`;
                p.style.width = targetW;
                p.style.height = targetH;
                const canvas = p.querySelector('canvas');
                if (canvas) {
                    canvas.style.width = targetW;
                    canvas.style.height = targetH;
                }
                const textLayer = p.querySelector('.textLayer');
                if (textLayer && baseScale) {
                    textLayer.style.setProperty('--scale-factor', String(baseScale * currentZoomRatio));
                }
            }
        });

        // 3. Restore exact reading position relative to anchor under focal point
        if (anchorPage) {
            const newAnchorRect = anchorPage.getBoundingClientRect();
            const newAnchorAbsTop = window.scrollY + newAnchorRect.top;
            const targetScrollTop = newAnchorAbsTop + (newAnchorRect.height * anchorOffsetYRatio) - targetY;
            window.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'instant' });

            if (readerShell && readerShell.scrollWidth > readerShell.clientWidth) {
                const shellRect = readerShell.getBoundingClientRect();
                const currentScrollLeft = readerShell.scrollLeft;
                const pageLeftInShell = (newAnchorRect.left - shellRect.left) + currentScrollLeft;
                const desiredScrollLeft = pageLeftInShell + (newAnchorRect.width * anchorOffsetXRatio) - (targetX - shellRect.left);
                readerShell.scrollLeft = Math.max(0, desiredScrollLeft);
            }
        }
    }
}

function attachTap(el, handler) {
    if (!el) return;
    el.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        handler(e);
    });
}

if (zoomSlider) zoomSlider.addEventListener('input', () => setZoom(Number(zoomSlider.value)));

attachTap(zoomInBtn, () => setZoom(Math.round(currentZoomRatio * 100) + 10));
attachTap(zoomOutBtn, () => setZoom(Math.round(currentZoomRatio * 100) - 10));
attachTap(zoomResetBtn, () => setZoom(100));

attachTap(mobileZoomInBtn, () => setZoom(Math.round(currentZoomRatio * 100) + 10));
attachTap(mobileZoomOutBtn, () => setZoom(Math.round(currentZoomRatio * 100) - 10));
attachTap(mobileZoomResetBtn, () => setZoom(100));

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

attachTap(mobileLangChangeBtn, () => {
    pendingFile = null;
    pendingExt = '';
    langFileName.textContent = currentParsedDoc ? (currentDocKey ? currentDocKey.split('_')[0] : '') : '';
    langSrc.value = currentSrc;
    langTgt.value = currentTgt;
    langHint.classList.add('hidden');
    openModal(langModal);
});

if (mobileOutlineBtn) {
    attachTap(mobileOutlineBtn, () => {
        if (currentParsedDoc?.outline) {
            renderOutlineModal(currentParsedDoc.outline, currentParsedDoc.pdf);
            openModal(outlineModal);
        }
    });
}

if (mobileTypoBtn) {
    attachTap(mobileTypoBtn, () => {
        openModal(typographyModal);
    });
}

if (mobileUploadFab) {
    mobileUploadFab.addEventListener('click', () => {
        fileInput.click();
    });
}

if (libraryUploadBtn) {
    libraryUploadBtn.addEventListener('click', () => {
        fileInput.click();
    });
}

if (welcomeChooseFileBtn) {
    welcomeChooseFileBtn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
}

// Zen Focus Reading Mode
function toggleZenMode() {
    setZenMode(!document.documentElement.classList.contains('zen-mode'));
}
function setZenMode(active) {
    document.documentElement.classList.toggle('zen-mode', active);
    if (active) {
        showToast(t('zenActive'), 'info', 1400);
    }
}

if (zenModeBtn) zenModeBtn.addEventListener('click', toggleZenMode);
if (zenExitBtn) zenExitBtn.addEventListener('click', () => setZenMode(false));

let lastScrollY = window.scrollY;
let scrollTicking = false;
let scrollProgressTimer = null;

window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const headerEl = document.querySelector('header');

    if (headerEl) {
        if (currentScrollY <= 45) {
            headerEl.classList.remove('header-hidden');
        } else if (currentScrollY > lastScrollY + 8 && currentScrollY > 70) {
            // Scrolling down -> smoothly hide header to maximize reading area
            headerEl.classList.add('header-hidden');
        } else if (currentScrollY < lastScrollY - 6) {
            // Scrolling up -> instantly reveal header
            headerEl.classList.remove('header-hidden');
        }
    }
    lastScrollY = currentScrollY;

    if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(() => {
            scrollTicking = false;
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
            if (navCurPage && navCurPage.textContent !== String(cur)) {
                navCurPage.textContent = String(cur);
                if (mobileNavCurPage) mobileNavCurPage.textContent = String(cur);
                if (navPrevPage) navPrevPage.disabled = (cur <= 1);
                if (mobileNavPrevPage) mobileNavPrevPage.disabled = (cur <= 1);
                if (navNextPage) navNextPage.disabled = (cur >= currentParsedDoc.pageCount);
                if (mobileNavNextPage) mobileNavNextPage.disabled = (cur >= currentParsedDoc.pageCount);
            }
        });
    }

    clearTimeout(scrollProgressTimer);
    scrollProgressTimer = setTimeout(saveCurrentProgress, 400);
}, { passive: true });

function finishRender() {
    showReaderState(currentParsedDoc ? currentParsedDoc.kind : 'txt');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 5. LIBRARY & THUMBNAIL ENGINES
async function generatePdfThumbnail(pdf, docKey) {
    if (!pdf || !docKey) return;
    try {
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const coverDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        if (window.LexiDB) {
            await LexiDB.updateDocumentCover(docKey, coverDataUrl);
        }
    } catch (e) {
        console.warn('[LexiRead] Could not generate cover thumbnail:', e);
    }
}

async function renderLibrary() {
    if (!librarySection || !libraryGrid || !window.LexiDB) return;
    try {
        const docs = await LexiDB.getAllDocuments();
        let remoteBooks = [];
        if (window.LexiSync && LexiSync.isConnected) {
            try {
                remoteBooks = await LexiSync.fetchRemoteBooks();
            } catch (_) {}
        }

        const localNames = new Set((docs || []).map(d => (d.name || '').toLowerCase()));
        const unDownloadedRemoteBooks = remoteBooks.filter(r => !localNames.has((r.name || '').toLowerCase()));

        const totalLibraryCount = (docs ? docs.length : 0) + unDownloadedRemoteBooks.length;
        if (!totalLibraryCount) {
            librarySection.classList.add('hidden');
            if (welcomeState) welcomeState.classList.remove('hidden');
            if (readerShell && reader.classList.contains('hidden')) readerShell.classList.add('hidden');
            if (mobileUploadFab) {
                mobileUploadFab.classList.add('hidden');
                mobileUploadFab.classList.remove('flex');
            }
            return;
        }

        // Library has books -> show library and hide welcomeState & readerShell
        librarySection.classList.remove('hidden');
        if (welcomeState) welcomeState.classList.add('hidden');
        if (readerShell && reader.classList.contains('hidden')) readerShell.classList.add('hidden');
        if (mobileUploadFab) {
            mobileUploadFab.classList.remove('hidden');
            mobileUploadFab.classList.add('flex');
        }
        if (libraryCountBadge) {
            libraryCountBadge.textContent = t('libraryCount', { count: totalLibraryCount });
        }

        libraryGrid.innerHTML = '';
        for (const doc of (docs || [])) {
            const card = document.createElement('div');
            card.className = 'library-card group relative p-1 rounded-2xl sm:rounded-3xl border border-white/10 bg-white/[0.03] hover:border-indigo-500/50 hover:bg-white/[0.06] transition-all duration-300 shadow-[0_15px_35px_-10px_rgba(0,0,0,0.6)] hover:shadow-[0_20px_45px_-10px_rgba(99,102,241,0.25)] hover:-translate-y-0.5 cursor-pointer select-none';
            card.dataset.dockey = doc.docKey;

            const displayName = doc.customTitle || doc.name;

            // Thumbnail / Cover
            let coverHtml = '';
            if (doc.ext === 'pdf' && doc.coverData) {
                coverHtml = `
                    <div class="w-13 h-18 sm:w-15 sm:h-21 shrink-0 rounded-xl overflow-hidden border border-white/10 bg-slate-950 shadow-md flex items-center justify-center">
                        <img src="${doc.coverData}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                    </div>`;
            } else {
                const badgeColor = doc.ext === 'pdf' ? 'bg-red-500/20 text-red-400 border-red-500/30' : (doc.ext === 'docx' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30');
                const svgIcon = doc.ext === 'pdf' 
                    ? '<svg class="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>'
                    : (doc.ext === 'docx' 
                        ? '<svg class="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>'
                        : '<svg class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>');
                coverHtml = `
                    <div class="w-13 h-18 sm:w-15 sm:h-21 shrink-0 rounded-xl border border-white/10 bg-slate-950/80 flex flex-col items-center justify-center gap-1.5 shadow-md">
                        ${svgIcon}
                        <span class="text-[9px] font-mono uppercase font-bold px-2 py-0.2 rounded-full border ${badgeColor}">${doc.ext}</span>
                    </div>`;
            }

            const pct = doc.progressPercent || 1;
            const pageStr = doc.ext === 'pdf' 
                ? t('pageProgress', { cur: doc.lastPage || 1, total: doc.pageCount || 1 })
                : (pct > 1 ? `${pct}%` : t('pageProgress', { cur: 1, total: 1 }));

            const src = (doc.srcLang || 'EN').toUpperCase();
            const tgt = (doc.tgtLang || 'TR').toUpperCase();

            card.innerHTML = `
                <div class="rounded-[calc(1rem-2px)] sm:rounded-[calc(1.5rem-2px)] bg-slate-900/90 p-3 sm:p-3.5 flex items-center gap-3.5 border border-white/[0.04] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] h-full w-full">
                    ${coverHtml}
                    <div class="min-w-0 flex-1 flex flex-col justify-between py-0.5 h-full">
                        <div>
                            <div class="flex items-start justify-between gap-1.5">
                                <h3 class="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition" title="${displayName}">
                                    ${displayName}
                                </h3>
                                <button class="lib-action-btn text-slate-400 hover:text-white p-1 -mr-1 -mt-1 transition rounded-full hover:bg-white/10 active:scale-90 shrink-0" title="Options">
                                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                                </button>
                            </div>
                            <div class="flex items-center gap-2 mt-1.5">
                                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-indigo-300 font-medium border border-white/10 shadow-sm">
                                    ${src} → ${tgt}
                                </span>
                                <span class="text-[10px] text-slate-400 font-medium">
                                    ${pageStr}
                                </span>
                            </div>
                        </div>
                        <div class="mt-3">
                            <div class="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden border border-white/[0.04]">
                                <div class="bg-gradient-to-r from-indigo-500 to-violet-400 h-1.5 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.5)]" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Click card to open
            card.addEventListener('click', (e) => {
                if (e.target.closest('.lib-action-btn')) return;
                openFromLibrary(doc.docKey);
            });

            // 3-dots action button
            const actionBtn = card.querySelector('.lib-action-btn');
            if (actionBtn) {
                actionBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openBookActionSheet(doc);
                });
            }

            libraryGrid.appendChild(card);
        }

        // Render remote books available in Dropbox but not downloaded locally
        for (const rem of unDownloadedRemoteBooks) {
            const remCard = document.createElement('div');
            remCard.className = 'library-card group relative p-1 rounded-2xl sm:rounded-3xl border border-indigo-500/30 bg-indigo-500/[0.03] hover:border-indigo-400 hover:bg-indigo-500/[0.07] transition-all duration-300 shadow-lg cursor-pointer select-none';
            const remExt = (rem.name.split('.').pop() || '').toLowerCase();
            const badgeColor = remExt === 'pdf' ? 'bg-red-500/20 text-red-400 border-red-500/30' : (remExt === 'docx' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30');

            remCard.innerHTML = `
                <div class="rounded-[calc(1rem-2px)] sm:rounded-[calc(1.5rem-2px)] bg-slate-900/80 p-3 sm:p-3.5 flex items-center gap-3.5 border border-white/[0.04] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] h-full w-full">
                    <div class="w-13 h-18 sm:w-15 sm:h-21 shrink-0 rounded-xl border border-dashed border-indigo-500/40 bg-indigo-950/30 flex flex-col items-center justify-center gap-1.5 shadow-md">
                        <svg class="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                        <span class="text-[9px] font-mono uppercase font-bold px-2 py-0.2 rounded-full border ${badgeColor}">${remExt}</span>
                    </div>
                    <div class="min-w-0 flex-1 flex flex-col justify-between py-0.5 h-full">
                        <div>
                            <div class="flex items-start justify-between gap-1.5">
                                <h3 class="text-xs sm:text-sm font-semibold text-slate-100 truncate group-hover:text-indigo-300 transition" title="${rem.name}">
                                    ${rem.name}
                                </h3>
                                <span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 font-mono shrink-0">
                                    <svg class="w-3 h-3 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                                    <span>Dropbox</span>
                                </span>
                            </div>
                            <div class="flex items-center gap-2 mt-1.5">
                                <span class="text-[10px] text-slate-400">${typeof t === 'function' ? t('cloudAvailableOnDropbox') : 'Available on Dropbox'}</span>
                            </div>
                        </div>
                        <div class="mt-3">
                            <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-400 group-hover:text-indigo-300">
                                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                                <span>${typeof t === 'function' ? t('cloudDownloadAndRead') : 'Download & Read'}</span>
                            </span>
                        </div>
                    </div>
                </div>
            `;
            remCard.addEventListener('click', () => {
                if (window.LexiSync) {
                    LexiSync.downloadAndOpenBook(rem.path, rem.name);
                }
            });
            libraryGrid.appendChild(remCard);
        }
    } catch (e) {
        console.error('[LexiRead] renderLibrary error:', e);
    }
}
window.renderLibrary = renderLibrary;

let currentActionDoc = null;

function openBookActionSheet(doc) {
    if (!bookActionModal || !doc) return;
    currentActionDoc = doc;
    if (bookActionDocName) {
        bookActionDocName.textContent = doc.customTitle || doc.name;
    }
    openModal(bookActionModal);
}

if (bookActionClose) {
    attachTap(bookActionClose, () => closeModal(bookActionModal));
}

if (bookActionRenameBtn) {
    attachTap(bookActionRenameBtn, () => {
        closeModal(bookActionModal);
        if (!currentActionDoc || !bookRenameModal) return;
        if (bookRenameInput) {
            bookRenameInput.value = currentActionDoc.customTitle || currentActionDoc.name;
        }
        openModal(bookRenameModal);
        setTimeout(() => { if (bookRenameInput) bookRenameInput.focus(); }, 120);
    });
}

if (bookRenameCloseBtn) {
    attachTap(bookRenameCloseBtn, () => closeModal(bookRenameModal));
}
if (bookRenameCancelBtn) {
    attachTap(bookRenameCancelBtn, () => closeModal(bookRenameModal));
}

if (bookRenameSaveBtn) {
    attachTap(bookRenameSaveBtn, async () => {
        if (!currentActionDoc || !bookRenameInput) return;
        const newTitle = bookRenameInput.value.trim();
        if (newTitle) {
            await LexiDB.updateDocumentTitle(currentActionDoc.docKey, newTitle);
            showToast(t('titleUpdated'), 'success', 2200);
            closeModal(bookRenameModal);
            renderLibrary();
        }
    });
}

if (bookRenameInput) {
    bookRenameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (bookRenameSaveBtn) bookRenameSaveBtn.click();
        } else if (e.key === 'Escape') {
            closeModal(bookRenameModal);
        }
    });
}

if (bookActionResetBtn) {
    attachTap(bookActionResetBtn, async () => {
        if (!currentActionDoc) return;
        closeModal(bookActionModal);
        const conf = confirm(t('progressResetConfirm'));
        if (conf) {
            await LexiDB.resetDocumentProgress(currentActionDoc.docKey);
            showToast(t('progressResetSuccess'), 'info', 2200);
            renderLibrary();
        }
    });
}

if (bookActionDeleteBtn) {
    attachTap(bookActionDeleteBtn, async () => {
        if (!currentActionDoc) return;
        closeModal(bookActionModal);
        const name = currentActionDoc.customTitle || currentActionDoc.name;
        const conf = confirm(t('deleteBookConfirm', { name }));
        if (conf) {
            await LexiDB.deleteDocument(currentActionDoc.docKey);
            showToast(t('bookDeleted'), 'info', 2200);
            renderLibrary();
        }
    });
}

async function openFromLibrary(docKey) {
    if (pipelineRunning) return;
    if (!window.LexiDB) return;
    try {
        showLoader(t('loaderWorking'));
        const doc = await LexiDB.getDocument(docKey);
        if (!doc || !doc.blob) {
            showToast('Document not found in library.', 'error');
            showWelcomeState();
            return;
        }

        // Reconstruct File object from Blob
        const file = new File([doc.blob], doc.name, { type: doc.blob.type || 'application/octet-stream' });
        file.__pdf = null;
        file.__docxBuf = null;
        file.__txt = null;
        file.__customTitle = doc.customTitle || '';

        // Restore saved language pair
        if (doc.srcLang && LANGS.some(l => l.code === doc.srcLang)) {
            currentSrc = doc.srcLang;
            localStorage.setItem(SRC_KEY, currentSrc);
        }
        if (doc.tgtLang && LANGS.some(l => l.code === doc.tgtLang)) {
            currentTgt = doc.tgtLang;
            localStorage.setItem(TGT_KEY, currentTgt);
        }
        applyLocalization();

        // Open document directly without prompting for languages or crop
        await processDocument(file, doc.ext, doc.cropTop || 0, doc.cropBottom || 0, true, doc.lastPage, doc.scrollTop);
    } catch (err) {
        console.error('[LexiRead] openFromLibrary error:', err);
        showToast('Failed to open document: ' + err.message, 'error');
        showWelcomeState();
    }
}
window.openFromLibrary = openFromLibrary;
