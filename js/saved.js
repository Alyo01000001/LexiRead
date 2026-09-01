/* =============================================================
   LexiRead — Saved Words & Cardlyo Sync Engine
   ============================================================= */

'use strict';

function loadSaved() {
    try {
        const a = JSON.parse(localStorage.getItem(SAVED_KEY));
        return Array.isArray(a) ? a : [];
    } catch (_) {
        return [];
    }
}

function persistSaved(arr) {
    localStorage.setItem(SAVED_KEY, JSON.stringify(arr));
    savedCount.textContent = String(arr.length);
}

function splitTranslations(trStr) {
    return String(trStr || '').split(' / ').map(s => s.trim()).filter(Boolean);
}

function isSaved(original, translation, src = null, tgt = null) {
    const arr = loadSaved();
    const existing = arr.find(i => {
        if (i.original !== original) return false;
        if (src && i.src && i.src !== src) return false;
        if (tgt && i.tgt && i.tgt !== tgt) return false;
        return true;
    });
    if (!existing) return false;
    if (!translation) return true;
    const trClean = String(translation).trim().toLowerCase();
    const existingMeanings = splitTranslations(existing.translation).map(s => s.toLowerCase());
    return existingMeanings.includes(trClean);
}

function addSaved(item) {
    const arr = loadSaved();
    const existing = arr.find(i => 
        i.original === item.original && 
        (!item.src || !i.src || i.src === item.src) && 
        (!item.tgt || !i.tgt || i.tgt === item.tgt)
    );
    
    if (existing) {
        const existingMeanings = splitTranslations(existing.translation);
        const newMeaning = String(item.translation || '').trim();
        const hasMeaning = existingMeanings.some(m => m.toLowerCase() === newMeaning.toLowerCase());
        
        if (hasMeaning) {
            return { success: false, updated: false, alreadySaved: true, fullTranslation: existing.translation };
        }
        
        existingMeanings.push(newMeaning);
        existing.translation = existingMeanings.join(' / ');
        existing.date = new Date().toISOString();
        persistSaved(arr);
        return { success: true, updated: true, fullTranslation: existing.translation };
    }
    
    arr.unshift(item);
    persistSaved(arr);
    return { success: true, updated: false, fullTranslation: item.translation };
}

function deleteSaved(id) {
    persistSaved(loadSaved().filter(i => i.id !== id));
    renderSavedList(savedSearchInput.value.trim());
}

function renderSavedList(filter = '') {
    const all = loadSaved();
    const f = filter.toLowerCase().trim();
    const arr = f ? all.filter(i => (i.original || '').toLowerCase().includes(f) || (i.translation || '').toLowerCase().includes(f)) : all;

    savedList.innerHTML = '';
    if (!all.length) {
        savedList.innerHTML =
            `<p class="py-10 text-center text-sm text-slate-500">${t('noSavedItems')}</p>`;
        return;
    }
    if (!arr.length && f) {
        savedList.innerHTML = `<p class="py-8 text-center text-xs text-slate-500">${t('noMatchingWords', { query: filter })}</p>`;
        return;
    }
    for (const item of arr) {
        const row = document.createElement('div');
        row.className = 'saved-item flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-800/50 p-3 transition';
        const info = document.createElement('div');
        info.className = 'min-w-0 flex-1';
        const orig = document.createElement('p');
        orig.className = 'break-words text-sm font-medium text-slate-100';
        orig.textContent = item.original;

        const trContainer = document.createElement('div');
        trContainer.className = 'mt-1 flex flex-wrap gap-1.5 items-center';
        const parts = splitTranslations(item.translation);
        if (parts.length > 1) {
            parts.forEach(part => {
                const chip = document.createElement('span');
                chip.className = 'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-500/15 text-indigo-200 border border-indigo-500/30';
                chip.textContent = part;
                trContainer.appendChild(chip);
            });
        } else {
            const tr = document.createElement('p');
            tr.className = 'break-words text-sm text-indigo-300 font-medium';
            tr.textContent = item.translation;
            trContainer.appendChild(tr);
        }

        const meta = document.createElement('p');
        meta.className = 'mt-1 text-[10px] uppercase tracking-wider text-slate-500';
        meta.textContent = `${langName(item.src)} → ${langName(item.tgt)}`;
        info.append(orig, trContainer, meta);
        const del = document.createElement('button');
        del.className = 'shrink-0 rounded-md border border-red-900/60 px-2 py-1 text-[11px] text-red-300 hover:bg-red-900/40 transition';
        del.textContent = t('deleteBtn');
        del.addEventListener('click', () => deleteSaved(item.id));
        row.append(info, del);
        savedList.appendChild(row);
    }
}

savedBtn.addEventListener('click', () => {
    savedSearchInput.value = '';
    renderSavedList();
    openModal(savedModal);
    setTimeout(() => savedSearchInput.focus(), 60);
});
savedClose.addEventListener('click', () => closeModal(savedModal));
if (savedModal) {
    const back = savedModal.querySelector('.savedBack');
    if (back) back.addEventListener('click', () => closeModal(savedModal));
}
savedClear.addEventListener('click', () => {
    if (!loadSaved().length) return;
    persistSaved([]);
    renderSavedList();
    showToast(t('allSavedDeleted'), 'info');
});

savedSearchInput.addEventListener('input', () => {
    renderSavedList(savedSearchInput.value.trim());
});

// Cardlyo Exporter & Payload Builders
function buildCardlyoPayload() {
    const arr = loadSaved();
    const syncId = genRandomId('sync');
    const now = Date.now();
    return {
        syncId: syncId,
        timestamp: now,
        stacks: [
            {
                id: genRandomId('stack'),
                title: "LexiRead Words",
                description: "Imported from LexiRead Reader",
                libraryId: null,
                cards: arr.map(i => ({
                    id: genRandomId('c'),
                    q: i.original,
                    a: i.translation
                })),
                correctBox: [],
                wrongBox: []
            }
        ],
        libraries: []
    };
}

function buildCardlyoText() {
    const arr = loadSaved();
    return arr.map(i => `${i.original}:${i.translation}`).join('\n');
}

savedSyncCardlyo.addEventListener('click', async () => {
    const arr = loadSaved();
    if (!arr.length) { showToast(t('noSavedToCopy'), 'warn'); return; }
    const textToCopy = buildCardlyoText();

    let copied = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
            copied = true;
        }
    } catch (_) {}

    if (!copied) {
        try {
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            copied = true;
        } catch (_) {}
    }

    // Silent broadcast payload if any active tab is listening
    try {
        const payload = buildCardlyoPayload();
        const bc = new BroadcastChannel('cardlyo_sync');
        bc.postMessage({
            type: 'IMPORT_DECK',
            payload: payload,
            syncId: payload.syncId,
            source: 'LexiRead',
            timestamp: payload.timestamp
        });
        bc.close();
    } catch (_) {}

    showToast(t('copiedToClipboard', { count: arr.length }), 'success', 3500);
});

savedExport.addEventListener('click', () => {
    const arr = loadSaved();
    if (!arr.length) { showToast(t('noSavedToCopy'), 'warn'); return; }
    
    const exportData = buildCardlyoPayload();

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lexiread-saved-words.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(t('exportedJson'), 'success');
});

function migrateExistingDuplicates() {
    try {
        const raw = localStorage.getItem(SAVED_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || !arr.length) return;

        let changed = false;
        const mergedMap = new Map();
        const orderedList = [];

        for (const item of arr) {
            if (!item || !item.original) continue;
            const key = `${item.original}___${item.src || ''}___${item.tgt || ''}`;
            
            if (mergedMap.has(key)) {
                changed = true;
                const existing = mergedMap.get(key);
                const existingMeanings = splitTranslations(existing.translation);
                const itemMeanings = splitTranslations(item.translation);
                
                for (const m of itemMeanings) {
                    if (!existingMeanings.some(em => em.toLowerCase() === m.toLowerCase())) {
                        existingMeanings.push(m);
                    }
                }
                existing.translation = existingMeanings.join(' / ');
                if (item.date && (!existing.date || item.date > existing.date)) {
                    existing.date = item.date;
                }
            } else {
                const meanings = splitTranslations(item.translation);
                const uniqueMeanings = [];
                for (const m of meanings) {
                    if (!uniqueMeanings.some(um => um.toLowerCase() === m.toLowerCase())) {
                        uniqueMeanings.push(m);
                    }
                }
                const cleanedTranslation = uniqueMeanings.join(' / ');
                if (cleanedTranslation !== item.translation) {
                    changed = true;
                    item.translation = cleanedTranslation;
                }
                
                mergedMap.set(key, item);
                orderedList.push(item);
            }
        }

        if (changed) {
            persistSaved(orderedList);
            console.log('[LexiRead] Duplicate saved words migrated successfully.');
        }
    } catch (e) {
        console.error('[LexiRead] Error migrating saved items:', e);
    }
}

// Automatically consolidate any duplicate words and initialize counter on load
migrateExistingDuplicates();
persistSaved(loadSaved());
