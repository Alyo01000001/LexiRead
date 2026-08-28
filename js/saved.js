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

function isSaved(original, translation) {
    return loadSaved().some(i => i.original === original && i.translation === translation);
}

function addSaved(item) {
    const arr = loadSaved();
    if (arr.some(i => i.original === item.original && i.translation === item.translation)) return false;
    arr.unshift(item);
    persistSaved(arr);
    return true;
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
            '<p class="py-10 text-center text-sm text-slate-500">No saved items yet.<br/>Tap the ☆ in a tooltip or Middle-Click any word to save it.</p>';
        return;
    }
    if (!arr.length && f) {
        savedList.innerHTML = `<p class="py-8 text-center text-xs text-slate-500">No saved words match "<strong>${filter}</strong>"</p>`;
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
        const tr = document.createElement('p');
        tr.className = 'mt-0.5 break-words text-sm text-indigo-300 font-medium';
        tr.textContent = item.translation;
        const meta = document.createElement('p');
        meta.className = 'mt-1 text-[10px] uppercase tracking-wider text-slate-500';
        meta.textContent = `${langName(item.src)} → ${langName(item.tgt)}`;
        info.append(orig, tr, meta);
        const del = document.createElement('button');
        del.className = 'shrink-0 rounded-md border border-red-900/60 px-2 py-1 text-[11px] text-red-300 hover:bg-red-900/40 transition';
        del.textContent = 'Delete';
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
    showToast('All saved items deleted.', 'info');
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
    if (!arr.length) { showToast('No saved words to copy.', 'warn'); return; }
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

    showToast(`📋 Copied ${arr.length} words (word:translation)! Paste in Cardlyo.`, 'success', 3500);
});

savedExport.addEventListener('click', () => {
    const arr = loadSaved();
    if (!arr.length) { showToast('Nothing to export yet.', 'warn'); return; }
    
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
    showToast('Exported to JSON (cards format).', 'success');
});

// Initialize saved counter on load
persistSaved(loadSaved());
