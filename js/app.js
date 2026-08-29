/* =============================================================
   LexiRead — Main Application Entry Point & Global Controllers
   ============================================================= */

'use strict';

let pendingFile = null;
let pendingExt = '';

// 1. FILE UPLOAD & DRAG/DROP LISTENERS
if (dropZone) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });

    ['dragover','dragenter'].forEach(ev => dropZone.addEventListener(ev, e => {
        e.preventDefault(); dropZone.classList.add('border-indigo-500','text-indigo-300');
    }));
    ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => {
        e.preventDefault(); dropZone.classList.remove('border-indigo-500','text-indigo-300');
    }));
    dropZone.addEventListener('drop', e => {
        const f = e.dataTransfer?.files?.[0];
        if (f) handleIncomingFile(f);
    });
}

if (fileInput) {
    fileInput.addEventListener('change', e => {
        const f = e.target.files[0];
        e.target.value = '';                 // allow re-selecting the same file
        if (f) handleIncomingFile(f);
    });
}

if (headerUploadBtn) {
    headerUploadBtn.addEventListener('click', () => fileInput.click());
}
if (logoBtn) {
    logoBtn.addEventListener('click', () => location.reload());
}

/** Step 1: validate limits BEFORE asking for languages or rendering. */
async function handleIncomingFile(file) {
    const ext = normalizeExt(file.name);
    if (!['txt','pdf','docx'].includes(ext)) {
        showToast(t('unsupportedFileToast', { ext }), 'error');
        return;
    }
    const hadDoc = wordSpans.length > 0 && !reader.classList.contains('hidden');
    showLoader(t('loaderValidating', { ext: labelExt(ext) }));
    try {
        await validateFileLimits(file, ext);
    } catch (err) {
        showToast(err.message || t('limitErrorMsg'), 'error');
        hadDoc ? showReaderState() : showWelcomeState();
        return;
    }
    hadDoc ? showReaderState() : showWelcomeState();

    // Step 2: language modal, pre-filled from localStorage (UX memory).
    pendingFile = file; pendingExt = ext;
    langFileName.textContent = file.name;
    langSrc.value = currentSrc;
    langTgt.value = currentTgt;
    langHint.classList.add('hidden');
    openModal(langModal);
}

// 2. LANGUAGE MODAL HANDLERS
if (langChangeBtn) {
    langChangeBtn.addEventListener('click', () => {
        pendingFile = null;
        pendingExt = '';
        langFileName.textContent = currentParsedDoc ? (currentDocKey ? currentDocKey.split('_')[0] : '') : '';
        langSrc.value = currentSrc;
        langTgt.value = currentTgt;
        langHint.classList.add('hidden');
        openModal(langModal);
    });
}

if (langSwap) {
    langSwap.addEventListener('click', () => {
        const a = langSrc.value; langSrc.value = langTgt.value; langTgt.value = a;
    });
}
if (langCancel) {
    langCancel.addEventListener('click', () => { pendingFile = null; closeModal(langModal); });
}
if (langModal) {
    const back = langModal.querySelector('.langBack');
    if (back) back.addEventListener('click', () => { pendingFile = null; closeModal(langModal); });
}

// Step 3: on Confirm parse and render (or update languages on the fly).
if (langConfirm) {
    langConfirm.addEventListener('click', () => {
        if (langSrc.value === langTgt.value) { 
            langHint.textContent = t('langHintSame');
            langHint.classList.remove('hidden'); 
            return; 
        }
        currentSrc = langSrc.value;
        currentTgt = langTgt.value;
        localStorage.setItem(SRC_KEY, currentSrc);
        localStorage.setItem(TGT_KEY, currentTgt);
        ondemandCache.clear();
        closeModal(langModal);

        const f = pendingFile, ext = pendingExt;
        pendingFile = null;
        pendingExt = '';

        if (f) {
            if (ext === 'pdf') {
                openPdfCropModal(f);
            } else {
                processDocument(f, ext);
            }
        } else {
            showToast(t('langUpdatedToast', { src: langName(currentSrc), tgt: langName(currentTgt) }), 'success');
        }
    });
}

// 3. HIERARCHICAL SYSTEM & DEVICE BACK NAVIGATION
let lastBackActionTime = 0;

function handleHierarchicalBack() {
    const now = Date.now();
    if (now - lastBackActionTime < 280) {
        return false;
    }
    lastBackActionTime = now;
    isPoppingNavState = true;

    try {
        // 1. If PDF Crop Modal is open -> return to language modal if file exists, else close
        if (typeof pdfCropModal !== 'undefined' && pdfCropModal && !pdfCropModal.classList.contains('hidden')) {
            if (typeof cropBackBtn !== 'undefined' && cropBackBtn) {
                cropBackBtn.click();
            } else {
                closeModal(pdfCropModal);
            }
            return true;
        }

        // 2. If any other modal is open -> close it
        const activeModals = [savedModal, keyModal, langModal, outlineModal, typographyModal];
        for (const m of activeModals) {
            if (m && !m.classList.contains('hidden')) {
                if (m === langModal) pendingFile = null;
                closeModal(m);
                return true;
            }
        }

        // 3. If translation tooltip is visible -> dismiss it
        if (typeof tooltip !== 'undefined' && tooltip && tooltip.classList.contains('visible')) {
            if (typeof hideTooltip === 'function') hideTooltip();
            return true;
        }

        // 4. If a document is currently open in reader -> return to welcome/home screen
        if (typeof reader !== 'undefined' && reader && !reader.classList.contains('hidden')) {
            if (typeof showWelcomeState === 'function') {
                showWelcomeState();
                return true;
            }
        }

        return false;
    } finally {
        setTimeout(() => { isPoppingNavState = false; }, 50);
    }
}

// Intercept OS & Browser Native Back Events (Android System Back Gesture / iOS Safari Back Swipe / Browser Back Button)
window.addEventListener('popstate', () => {
    handleHierarchicalBack();
});

// Intercept Desktop Mouse Back Button (Mouse 4 / Button 3)
window.addEventListener('auxclick', e => {
    if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        handleHierarchicalBack();
    }
});
window.addEventListener('mouseup', e => {
    if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        handleHierarchicalBack();
    }
});

// 4. KEYBOARD SHORTCUTS (J / K / T / Escape)
document.addEventListener('keydown', e => {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

    if (e.key === 'Escape') {
        handleHierarchicalBack();
        return;
    }

    if (e.key === 'j' || e.key === 'J' || e.key === 'PageDown') {
        e.preventDefault();
        if (reader.classList.contains('pdf-mode')) {
            navNextPage.click();
        } else {
            window.scrollBy({ top: window.innerHeight * 0.7, behavior: 'smooth' });
        }
        return;
    }

    if (e.key === 'k' || e.key === 'K' || e.key === 'PageUp') {
        e.preventDefault();
        if (reader.classList.contains('pdf-mode')) {
            navPrevPage.click();
        } else {
            window.scrollBy({ top: -window.innerHeight * 0.7, behavior: 'smooth' });
        }
        return;
    }

    if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        themeToggleBtn.click();
        return;
    }
});

// 4. THEME CONTROLLER (3-Way Theme Cycle: Dark / Light / Sepia)
function applyTheme(theme) {
    document.documentElement.classList.remove('dark', 'light', 'sepia');
    document.documentElement.classList.add(theme);
    if (theme === 'light') {
        themeIcon.textContent = '📜';
        themeToggleBtn.title = t('toggleThemeSepia');
    } else if (theme === 'sepia') {
        themeIcon.textContent = '🌙';
        themeToggleBtn.title = t('toggleThemeDark');
    } else {
        themeIcon.textContent = '☀️';
        themeToggleBtn.title = t('toggleThemeLight');
    }
    localStorage.setItem(THEME_KEY, theme);
}

const initialTheme = localStorage.getItem(THEME_KEY) || 'dark';
applyTheme(initialTheme);

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const cur = localStorage.getItem(THEME_KEY) || 'dark';
        const next = cur === 'dark' ? 'light' : (cur === 'light' ? 'sepia' : 'dark');
        applyTheme(next);
    });
}

// 5. APPLICATION STARTUP & INITIAL LOCALIZATION
if (appLangToggleBtn) {
    appLangToggleBtn.addEventListener('click', toggleAppLanguage);
}

applyLocalization();
updateKeyUI();
persistSaved(loadSaved());
showWelcomeState();
if (!getKey()) {
    setTimeout(() => {
        setTab(getProvider());
        openModal(keyModal);
        setTimeout(() => keyInput.focus(), 60);
    }, 400);
}
