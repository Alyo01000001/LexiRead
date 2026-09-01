/* =============================================================
   LexiRead — Main Application Entry Point & Global Controllers
   ============================================================= */

'use strict';

let pendingFile = null;
let pendingExt = '';

// 1. FILE UPLOAD & GLOBAL DRAG/DROP LISTENERS
if (welcomeState) {
    welcomeState.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, label')) return;
        fileInput.click();
    });
}

// Global window drag-and-drop (Desktop)
let dragCounter = 0;

window.addEventListener('dragenter', e => {
    e.preventDefault();
    if (!e.dataTransfer || !e.dataTransfer.types || !Array.from(e.dataTransfer.types).includes('Files')) return;
    dragCounter++;
    if (globalDragOverlay) {
        globalDragOverlay.classList.remove('hidden');
        globalDragOverlay.classList.add('flex');
    }
});

window.addEventListener('dragover', e => {
    e.preventDefault();
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
    }
});

window.addEventListener('dragleave', e => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        if (globalDragOverlay) {
            globalDragOverlay.classList.add('hidden');
            globalDragOverlay.classList.remove('flex');
        }
    }
});

window.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    if (globalDragOverlay) {
        globalDragOverlay.classList.add('hidden');
        globalDragOverlay.classList.remove('flex');
    }
    const f = e.dataTransfer?.files?.[0];
    if (f) handleIncomingFile(f);
});

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
    logoBtn.addEventListener('click', () => {
        if (reader && !reader.classList.contains('hidden')) {
            showWelcomeState();
        } else {
            location.reload();
        }
    });
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
            hideTooltip();
            if (window.LexiDB && currentDocKey) {
                LexiDB.updateDocumentLanguages(currentDocKey, currentSrc, currentTgt);
            }
            if (currentParsedDoc) {
                currentParsedDoc.srcLang = currentSrc;
                currentParsedDoc.tgtLang = currentTgt;
            }
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
        const activeModals = [
            bookRenameModal, bookActionModal, settingsModal, mobileMoreSheet,
            savedModal, keyModal, langModal, outlineModal, typographyModal
        ];
        for (const m of activeModals) {
            if (m && !m.classList.contains('hidden')) {
                if (m === langModal) pendingFile = null;
                closeModal(m);
                return true;
            }
        }

        // 3. If Zen mode is active -> exit Zen mode
        if (document.documentElement.classList.contains('zen-mode')) {
            document.documentElement.classList.remove('zen-mode');
            return true;
        }

        // 4. If translation tooltip is visible -> dismiss it
        if (typeof tooltip !== 'undefined' && tooltip && tooltip.classList.contains('visible')) {
            if (typeof hideTooltip === 'function') hideTooltip();
            return true;
        }

        // 5. If a document is currently open in reader -> return to welcome/home screen
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

// 4. KEYBOARD SHORTCUTS (J / K / T / Z / Escape)
document.addEventListener('keydown', e => {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

    if (e.key === 'Escape') {
        handleHierarchicalBack();
        return;
    }

    if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        toggleZenMode();
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
        const cur = localStorage.getItem(THEME_KEY) || 'dark';
        const next = cur === 'dark' ? 'light' : (cur === 'light' ? 'sepia' : 'dark');
        applyTheme(next);
        updateSettingsModalUI();
        return;
    }
});

// 5. THEME CONTROLLER (3-Way Theme Cycle: Dark / Light / Sepia)
function applyTheme(theme) {
    document.documentElement.classList.remove('dark', 'light', 'sepia');
    document.documentElement.classList.add(theme);
    localStorage.setItem(THEME_KEY, theme);
}

const initialTheme = localStorage.getItem(THEME_KEY) || 'dark';
applyTheme(initialTheme);

// 6. UNIFIED SETTINGS CONTROLLER
function updateSettingsModalUI() {
    const curTheme = localStorage.getItem(THEME_KEY) || 'dark';
    const curLang = getAppLanguage();
    const curProvider = getProvider();
    const hasKey = !!getKey();

    document.querySelectorAll('.theme-choice-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === curTheme);
    });

    document.querySelectorAll('.app-lang-choice-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === curLang);
    });

    if (settingsKeyStatus) {
        settingsKeyStatus.textContent = `${curProvider === 'deepl' ? 'DeepL' : 'Gemini'} (${hasKey ? 'Active' : 'Not Set'})`;
        settingsKeyStatus.className = `text-[11px] ${hasKey ? 'text-emerald-400' : 'text-amber-400'}`;
    }
}

function openSettingsModal() {
    updateSettingsModalUI();
    openModal(settingsModal);
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openSettingsModal();
    });
}
if (settingsClose) {
    settingsClose.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        closeModal(settingsModal);
    });
}
if (settingsModal) {
    const back = settingsModal.querySelector('.settingsBack');
    if (back) {
        back.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            closeModal(settingsModal);
        });
    }
}

document.querySelectorAll('.theme-choice-btn').forEach(btn => {
    btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        applyTheme(btn.dataset.theme);
        updateSettingsModalUI();
    });
});

document.querySelectorAll('.app-lang-choice-btn').forEach(btn => {
    btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        setAppLanguage(btn.dataset.lang);
        updateSettingsModalUI();
    });
});

if (settingsOpenKeyBtn) {
    settingsOpenKeyBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        closeModal(settingsModal);
        setTab(getProvider());
        openModal(keyModal);
        setTimeout(() => keyInput.focus(), 60);
    });
}

// 7. APPLICATION STARTUP & INITIAL LOCALIZATION
applyLocalization();
updateKeyUI();
persistSaved(loadSaved());
showWelcomeState();
if (typeof renderLibrary === 'function') {
    renderLibrary();
}
if (!getKey()) {
    setTimeout(() => {
        setTab(getProvider());
        openModal(keyModal);
        setTimeout(() => keyInput.focus(), 60);
    }, 400);
}
