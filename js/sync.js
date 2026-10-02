/* =============================================================
   LexiRead — Cloud Sync Engine (Dropbox)
   Background seamless synchronization for:
   - Reading progress & positions (sync_state.json)
   - Saved vocabulary & phrases (saved_vocabulary.json)
   - Auto-uploading newly opened books to (/Books/<file>)
   - Pulling & reading books across devices
   ============================================================= */

'use strict';

const SYNCED_BOOKS_STORAGE_KEY = 'lexi.syncedBooks';

const LexiSync = (() => {
    let isConnected = false;
    let accountInfo = null;
    let isSyncing = false;
    let hasAppKey = false;
    let syncDebounceTimer = null;
    let lastSyncTimestamp = 0;

    // Helper: get synced books set
    function getSyncedBooksSet() {
        try {
            const arr = JSON.parse(localStorage.getItem(SYNCED_BOOKS_STORAGE_KEY) || '[]');
            return new Set(Array.isArray(arr) ? arr : []);
        } catch (_) {
            return new Set();
        }
    }

    function recordBookAsSynced(bookKey) {
        if (!bookKey) return;
        const set = getSyncedBooksSet();
        set.add(bookKey);
        try {
            localStorage.setItem(SYNCED_BOOKS_STORAGE_KEY, JSON.stringify(Array.from(set)));
        } catch (_) {}
    }

    const DELETED_BOOKS_STORAGE_KEY = 'lexi.deletedBooks';

    function getDeletedBooksMap() {
        try {
            const obj = JSON.parse(localStorage.getItem(DELETED_BOOKS_STORAGE_KEY) || '{}');
            return (obj && typeof obj === 'object') ? obj : {};
        } catch (_) {
            return {};
        }
    }

    function saveDeletedBooksMap(map) {
        try {
            localStorage.setItem(DELETED_BOOKS_STORAGE_KEY, JSON.stringify(map));
        } catch (_) {}
    }

    function recordBookDeletion(fileName, docKey) {
        if (!fileName && !docKey) return;
        const map = getDeletedBooksMap();
        const now = Date.now();
        const item = {
            name: fileName || (docKey ? docKey.split('_')[0] : ''),
            docKey: docKey || '',
            deletedAt: now
        };
        if (fileName) map[fileName.toLowerCase()] = item;
        if (docKey) map[docKey] = item;
        saveDeletedBooksMap(map);

        // Remove from local synced set
        const set = getSyncedBooksSet();
        if (fileName) set.delete(fileName);
        if (docKey) set.delete(docKey);
        try {
            localStorage.setItem(SYNCED_BOOKS_STORAGE_KEY, JSON.stringify(Array.from(set)));
        } catch (_) {}
    }

    function clearBookDeletion(fileName, docKey) {
        const map = getDeletedBooksMap();
        let changed = false;
        if (fileName && map[fileName.toLowerCase()]) {
            delete map[fileName.toLowerCase()];
            changed = true;
        }
        if (docKey && map[docKey]) {
            delete map[docKey];
            changed = true;
        }
        if (changed) saveDeletedBooksMap(map);
    }

    async function deleteBookFromDropbox(fileName) {
        if (!isConnected || !fileName) return;
        try {
            const resp = await fetch('/api/dropbox/delete-book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: fileName })
            });
            const data = await resp.json();
            console.log(`[LexiSync] Delete from Dropbox (${fileName}):`, data);
        } catch (err) {
            console.warn(`[LexiSync] Failed to delete "${fileName}" from Dropbox:`, err);
        }
    }

    function updateUI(state = 'idle') {
        const headerBtn = $('headerCloudSyncBtn');
        const headerIcon = $('headerCloudIcon');
        const headerText = $('headerCloudText');

        const statusLabel = $('settingsCloudStatus');
        const connectSec = $('settingsCloudConnectSection');
        const connectedSec = $('settingsCloudConnectedSection');
        const accountSpan = $('settingsCloudAccount');
        const emailSpan = $('settingsCloudEmail');
        const lastSyncSpan = $('settingsCloudLastSync');

        if (!headerBtn) return;

        if (state === 'syncing') {
            if (headerIcon) {
                headerIcon.innerHTML = `<svg class="w-3.5 h-3.5 text-indigo-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
            }
            if (headerText) {
                headerText.textContent = typeof t === 'function' ? t('cloudSyncing') : 'Syncing…';
                headerText.className = 'hidden md:inline text-[11px] text-indigo-300 font-mono';
            }
            headerBtn.title = typeof t === 'function' ? t('cloudSyncing') : 'Syncing…';
            return;
        }

        if (isConnected) {
            if (headerIcon) {
                headerIcon.innerHTML = `<svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><polyline points="9 12 11 14 15 10"/></svg>`;
            }
            if (headerText) {
                headerText.textContent = 'Synced';
                headerText.className = 'hidden md:inline text-[11px] text-emerald-400 font-mono font-bold';
            }
            headerBtn.title = (typeof t === 'function' ? t('cloudSynced') : 'Synced with Dropbox') +
                (accountInfo ? ` (${accountInfo.name || accountInfo.email})` : '');

            if (statusLabel) {
                statusLabel.textContent = typeof t === 'function' ? t('cloudStatusConnected') : 'Connected';
                statusLabel.className = 'text-[11px] text-emerald-400 font-medium';
            }
            if (connectSec) connectSec.classList.add('hidden');
            if (connectedSec) connectedSec.classList.remove('hidden');

            if (accountSpan && accountInfo) {
                accountSpan.textContent = accountInfo.name || 'Dropbox User';
            }
            if (emailSpan && accountInfo) {
                emailSpan.textContent = accountInfo.email || '';
            }
            if (lastSyncSpan) {
                if (lastSyncTimestamp > 0) {
                    const d = new Date(lastSyncTimestamp);
                    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    lastSyncSpan.textContent = timeStr;
                } else {
                    lastSyncSpan.textContent = '';
                }
            }
        } else {
            if (headerIcon) {
                headerIcon.innerHTML = `<svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
            }
            if (headerText) {
                headerText.textContent = 'Sync';
                headerText.className = 'hidden md:inline text-[11px] text-slate-400 font-mono';
            }
            headerBtn.title = typeof t === 'function' ? t('cloudSyncTitle') : 'Cloud Sync (Dropbox)';

            if (statusLabel) {
                statusLabel.textContent = typeof t === 'function' ? t('cloudStatusDisconnected') : 'Disconnected';
                statusLabel.className = 'text-[11px] text-slate-400';
            }
            if (connectSec) connectSec.classList.remove('hidden');
            if (connectedSec) connectedSec.classList.add('hidden');
        }
    }

    async function checkStatus() {
        try {
            const resp = await fetch('/api/dropbox/status');
            if (!resp.ok) throw new Error('Status request failed');
            const data = await resp.json();
            isConnected = Boolean(data.connected);
            hasAppKey = Boolean(data.has_app_key);

            // 1. Remember and auto-fill App Key
            const savedLocalKey = localStorage.getItem('lexi.dropboxAppKey') || '';
            const appKeyInput = $('settingsCloudAppKeyInput');
            if (data.app_key) {
                try { localStorage.setItem('lexi.dropboxAppKey', data.app_key); } catch (_) {}
                if (appKeyInput && !appKeyInput.value) {
                    appKeyInput.value = data.app_key;
                }
            } else if (savedLocalKey) {
                if (appKeyInput && !appKeyInput.value) {
                    appKeyInput.value = savedLocalKey;
                }
                // Auto-sync locally remembered key to server if server doesn't have it
                if (!hasAppKey) {
                    fetch('/api/dropbox/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ app_key: savedLocalKey })
                    }).then(r => r.json()).then(d => {
                        if (d && d.success) hasAppKey = true;
                    }).catch(() => {});
                }
            }

            // 2. Populate Dropbox Redirect URI
            if (data.redirect_uri) {
                const redirectUriEl = $('settingsCloudRedirectUri');
                if (redirectUriEl) {
                    redirectUriEl.textContent = data.redirect_uri;
                }
            }

            if (isConnected) {
                accountInfo = {
                    email: data.email,
                    name: data.name,
                    mode: data.mode
                };
                updateUI('idle');
                // Silently pull updates from Dropbox on startup
                syncPull();
            } else {
                accountInfo = null;
                updateUI('idle');
            }
        } catch (e) {
            console.warn('[LexiSync] Status check error:', e);
            isConnected = false;
            updateUI('idle');
        }
    }

    async function connectWithToken(token) {
        const clean = (token || '').trim();
        if (!clean) {
            showToast(typeof t === 'function' ? t('cloudTokenPlaceholder') : 'Please enter a token', 'warn');
            return;
        }

        updateUI('syncing');
        try {
            const resp = await fetch('/api/dropbox/connect-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: clean })
            });
            const data = await resp.json();
            if (data.success) {
                isConnected = true;
                accountInfo = {
                    email: data.email,
                    name: data.name,
                    mode: 'token'
                };
                updateUI('idle');
                const tokenInput = $('settingsCloudTokenInput');
                if (tokenInput) tokenInput.value = '';
                showToast(typeof t === 'function' ? t('cloudConnectedToast', { name: data.name || data.email }) : 'Connected to Dropbox', 'success');
                // Trigger initial sync push & pull
                syncPushImmediate(true);
            } else {
                updateUI('idle');
                showToast(data.error || 'Dropbox connection failed', 'error');
            }
        } catch (e) {
            updateUI('idle');
            showToast(e.message || 'Connection error', 'error');
        }
    }

    async function disconnect() {
        try {
            await fetch('/api/dropbox/disconnect', { method: 'POST' });
        } catch (_) {}
        isConnected = false;
        accountInfo = null;
        updateUI('idle');
        showToast(typeof t === 'function' ? t('cloudDisconnectedToast') : 'Disconnected from Dropbox', 'info');
    }

    async function buildSyncPayload() {
        // 1. Gather all documents
        const docsMap = {};
        if (window.LexiDB) {
            try {
                const docs = await LexiDB.getAllDocuments();
                for (const doc of docs) {
                    if (!doc || !doc.docKey) continue;
                    docsMap[doc.docKey] = {
                        name: doc.name,
                        ext: doc.ext,
                        pageCount: doc.pageCount || 1,
                        lastPage: doc.lastPage || 1,
                        scrollTop: doc.scrollTop || 0,
                        progressPercent: doc.progressPercent || 1,
                        lastReadAt: doc.lastReadAt || Date.now(),
                        srcLang: doc.srcLang || '',
                        tgtLang: doc.tgtLang || '',
                        customTitle: doc.customTitle || ''
                    };
                }
            } catch (e) {
                console.error('[LexiSync] Error gathering documents:', e);
            }
        }

        // 2. Gather saved vocabulary
        let vocab = [];
        if (typeof loadSaved === 'function') {
            vocab = loadSaved();
        }

        return {
            syncState: {
                version: 2,
                lastSync: Date.now(),
                documents: docsMap,
                deletedDocuments: getDeletedBooksMap()
            },
            savedVocabulary: vocab
        };
    }

    async function applySyncStateChanges(remoteSyncState) {
        if (!remoteSyncState || !window.LexiDB) return false;
        let updatedAny = false;

        // 1. Merge remote tombstones into local storage
        const localDeleted = getDeletedBooksMap();
        if (remoteSyncState.deletedDocuments && typeof remoteSyncState.deletedDocuments === 'object') {
            for (const [k, item] of Object.entries(remoteSyncState.deletedDocuments)) {
                const itemTime = item?.deletedAt || 0;
                const locItem = localDeleted[k];
                const locTime = locItem?.deletedAt || 0;
                if (itemTime > locTime) {
                    localDeleted[k] = item;
                }
            }
            saveDeletedBooksMap(localDeleted);
        }

        // 2. Check local documents against tombstones
        try {
            const localDocs = await LexiDB.getAllDocuments();
            for (const doc of localDocs) {
                const delByName = localDeleted[(doc.name || '').toLowerCase()];
                const delByKey = localDeleted[doc.docKey];
                const delTime = Math.max(delByName?.deletedAt || 0, delByKey?.deletedAt || 0);

                if (delTime && delTime >= (doc.lastReadAt || 0)) {
                    console.log(`[LexiSync] Deleting local document "${doc.name}" due to remote deletion timestamp.`);
                    await LexiDB.deleteDocument(doc.docKey);
                    updatedAny = true;
                }
            }
        } catch (e) {
            console.warn('[LexiSync] Error verifying deleted documents:', e);
        }

        // 3. Update reading progress for surviving documents
        if (remoteSyncState.documents) {
            for (const [docKey, rem] of Object.entries(remoteSyncState.documents)) {
                const del = localDeleted[docKey] || localDeleted[(rem.name || '').toLowerCase()];
                if (del && del.deletedAt >= (rem.lastReadAt || 0)) continue;

                const loc = await LexiDB.getDocument(docKey);
                if (loc && (rem.lastReadAt || 0) > (loc.lastReadAt || 0)) {
                    await LexiDB.updateDocumentProgress(docKey, rem.lastPage, rem.scrollTop, rem.pageCount);
                    if (rem.customTitle && !loc.customTitle) {
                        await LexiDB.updateDocumentTitle(docKey, rem.customTitle);
                    }
                    updatedAny = true;
                }
            }
        }

        return updatedAny;
    }

    async function downloadAndImportBook(bookPath, bookName, docMeta = null) {
        if (!bookPath || !bookName || !window.LexiDB) return false;
        try {
            const resp = await fetch('/api/dropbox/download-book?path=' + encodeURIComponent(bookPath));
            if (!resp.ok) return false;
            const blob = await resp.blob();
            const ext = typeof normalizeExt === 'function' ? normalizeExt(bookName) : (bookName.split('.').pop() || '').toLowerCase();
            if (!['pdf', 'docx', 'txt'].includes(ext)) return false;

            const file = new File([blob], bookName, { type: blob.type || 'application/octet-stream' });
            const docKey = bookName + '_' + (blob.size || 0);

            let pageCount = docMeta?.pageCount || 1;
            let coverData = null;

            if (ext === 'pdf' && window.pdfjsLib) {
                try {
                    const buf = await blob.arrayBuffer();
                    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
                    pageCount = pdf.numPages || 1;
                    try {
                        const p1 = await pdf.getPage(1);
                        const vp = p1.getViewport({ scale: 0.3 });
                        const canvas = document.createElement('canvas');
                        canvas.width = vp.width;
                        canvas.height = vp.height;
                        const ctx = canvas.getContext('2d');
                        await p1.render({ canvasContext: ctx, viewport: vp }).promise;
                        coverData = canvas.toDataURL('image/jpeg', 0.7);
                    } catch (_) {}
                } catch (pe) {
                    console.warn('[LexiSync] PDF page count extraction warning:', pe);
                }
            }

            const newDoc = {
                docKey: docKey,
                name: bookName,
                size: blob.size || 0,
                ext: ext,
                blob: file,
                coverData: coverData,
                pageCount: pageCount,
                lastPage: docMeta?.lastPage || 1,
                scrollTop: docMeta?.scrollTop || 0,
                progressPercent: docMeta?.progressPercent || (pageCount > 1 ? Math.min(100, Math.max(1, Math.round(((docMeta?.lastPage || 1) / pageCount) * 100))) : 1),
                srcLang: docMeta?.srcLang || (typeof currentSrc !== 'undefined' ? currentSrc : 'en'),
                tgtLang: docMeta?.tgtLang || (typeof currentTgt !== 'undefined' ? currentTgt : 'tr'),
                customTitle: docMeta?.customTitle || '',
                lastReadAt: docMeta?.lastReadAt || Date.now()
            };

            await LexiDB.saveDocument(newDoc);
            recordBookAsSynced(docKey);
            recordBookAsSynced(bookName);
            console.log(`[LexiSync] Auto-imported book from Dropbox: ${bookName}`);
            return true;
        } catch (err) {
            console.warn(`[LexiSync] Error importing "${bookName}":`, err);
            return false;
        }
    }

    let isSyncingBooks = false;

    async function syncBooksWithDropbox(remoteSyncState) {
        if (!isConnected || isSyncingBooks || !window.LexiDB) return;
        isSyncingBooks = true;

        try {
            const remoteBooks = await fetchRemoteBooks();
            const localDeleted = getDeletedBooksMap();
            const localDocs = await LexiDB.getAllDocuments();
            const localDocsByName = new Map();
            for (const d of localDocs) {
                localDocsByName.set((d.name || '').toLowerCase(), d);
            }

            let importedAny = false;

            for (const rem of remoteBooks) {
                const remNameLower = (rem.name || '').toLowerCase();
                const remModifiedMs = rem.modified_ms || (rem.modified ? new Date(rem.modified).getTime() : 0);

                // Check tombstone
                const delItem = localDeleted[remNameLower];
                const delTime = delItem?.deletedAt || 0;

                if (delTime && delTime >= remModifiedMs) {
                    // Deletion was performed after upload -> delete from Dropbox!
                    console.log(`[LexiSync] Deleting "${rem.name}" from Dropbox (deletedAt ${delTime} >= mod ${remModifiedMs})`);
                    await deleteBookFromDropbox(rem.name);
                    continue;
                }

                // If file on Dropbox is newer than deletion, clear old tombstone
                if (delTime && remModifiedMs > delTime) {
                    clearBookDeletion(rem.name);
                }

                // If local app doesn't have this book, import it into app!
                if (!localDocsByName.has(remNameLower)) {
                    let docMeta = null;
                    const stateDocs = (remoteSyncState && remoteSyncState.documents) || {};
                    for (const [k, d] of Object.entries(stateDocs)) {
                        if ((d.name || '').toLowerCase() === remNameLower) {
                            docMeta = d;
                            break;
                        }
                    }
                    const ok = await downloadAndImportBook(rem.path, rem.name, docMeta);
                    if (ok) importedAny = true;
                }
            }

            if (importedAny && typeof renderLibrary === 'function') {
                renderLibrary();
            }
        } catch (err) {
            console.warn('[LexiSync] syncBooksWithDropbox error:', err);
        } finally {
            isSyncingBooks = false;
        }
    }

    async function syncPushImmediate(isUserInitiated = false) {
        if (!isConnected || isSyncing) return;
        isSyncing = true;
        updateUI('syncing');

        try {
            const payload = await buildSyncPayload();
            const resp = await fetch('/api/dropbox/sync-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();

            if (data.success) {
                lastSyncTimestamp = Date.now();

                // 1. Update local vocabulary if merged version returned
                if (Array.isArray(data.savedVocabulary) && typeof persistSaved === 'function') {
                    persistSaved(data.savedVocabulary);
                    const searchInput = $('savedSearchInput');
                    if (typeof renderSavedList === 'function' && searchInput) {
                        renderSavedList(searchInput.value.trim());
                    }
                }

                // 2. Update local documents & tombstone deletions
                if (data.syncState) {
                    await applySyncStateChanges(data.syncState);
                    // Background sync of books (delete / import)
                    syncBooksWithDropbox(data.syncState);
                }

                updateUI('idle');
                if (isUserInitiated) {
                    showToast(typeof t === 'function' ? t('cloudSynced') : 'Synced with Dropbox', 'success', 2500);
                }
            } else {
                updateUI('idle');
                if (isUserInitiated) {
                    showToast(data.error || 'Sync failed', 'error');
                }
            }
        } catch (err) {
            console.error('[LexiSync] Push error:', err);
            updateUI('idle');
            if (isUserInitiated) {
                showToast(typeof t === 'function' ? t('cloudSyncError', { error: err.message }) : err.message, 'error');
            }
        } finally {
            isSyncing = false;
        }
    }

    function triggerDebouncedSync(delay = 1500) {
        if (!isConnected) return;
        if (syncDebounceTimer) {
            clearTimeout(syncDebounceTimer);
        }
        syncDebounceTimer = setTimeout(() => {
            syncPushImmediate(false);
        }, delay);
    }

    async function syncPull() {
        if (!isConnected || isSyncing) return;
        try {
            const resp = await fetch('/api/dropbox/sync-pull');
            if (!resp.ok) return;
            const data = await resp.json();
            if (!data.success) return;

            let updatedAny = false;

            // Merge vocabulary
            if (Array.isArray(data.savedVocabulary) && data.savedVocabulary.length && typeof persistSaved === 'function') {
                const localVocab = typeof loadSaved === 'function' ? loadSaved() : [];
                // Combine and deduplicate
                const mergedMap = new Map();
                for (const item of [...data.savedVocabulary, ...localVocab]) {
                    if (!item || !item.original) continue;
                    const key = `${item.original}___${item.src || ''}___${item.tgt || ''}`;
                    if (!mergedMap.has(key)) {
                        mergedMap.set(key, item);
                    }
                }
                const mergedList = Array.from(mergedMap.values());
                if (mergedList.length !== localVocab.length) {
                    persistSaved(mergedList);
                    updatedAny = true;
                }
            }

            // Merge reading progress and sync tombstones
            if (data.syncState) {
                const changed = await applySyncStateChanges(data.syncState);
                if (changed) updatedAny = true;
                syncBooksWithDropbox(data.syncState);
            }

            lastSyncTimestamp = Date.now();
            updateUI('idle');

            if (updatedAny && typeof renderLibrary === 'function') {
                renderLibrary();
            }
        } catch (e) {
            console.warn('[LexiSync] Pull error:', e);
        }
    }

    async function handleNewDocumentOpened(file, docKey) {
        if (!isConnected || !file) return;
        const syncedBooks = getSyncedBooksSet();
        const bookIdentifier = docKey || (file.name + '_' + (file.size || 0));

        if (syncedBooks.has(bookIdentifier)) {
            // Already backed up to Dropbox previously; just sync reading state
            triggerDebouncedSync(800);
            return;
        }

        // Upload new file to Dropbox /Books/ in background
        try {
            console.log(`[LexiSync] Auto-uploading new book "${file.name}" to Dropbox...`);
            const resp = await fetch('/api/dropbox/upload-book', {
                method: 'POST',
                headers: {
                    'X-Dropbox-Book-Name': encodeURIComponent(file.name),
                    'Content-Type': 'application/octet-stream'
                },
                body: file
            });
            const data = await resp.json();
            if (data.success) {
                recordBookAsSynced(bookIdentifier);
                showToast(
                    typeof t === 'function' ? t('cloudBookUploaded', { name: file.name }) : `Uploaded "${file.name}" to Dropbox`,
                    'success',
                    3500
                );
                // Also push state immediately
                syncPushImmediate(false);
            }
        } catch (err) {
            console.warn('[LexiSync] Background book upload error:', err);
        }
    }

    async function fetchRemoteBooks() {
        if (!isConnected) return [];
        try {
            const resp = await fetch('/api/dropbox/list-books');
            if (!resp.ok) return [];
            const data = await resp.json();
            return data.success && Array.isArray(data.books) ? data.books : [];
        } catch (_) {
            return [];
        }
    }

    async function downloadAndOpenBook(bookPath, bookName) {
        if (!isConnected) return;
        showToast(
            typeof t === 'function' ? t('cloudSyncing') : 'Downloading book from Dropbox...',
            'info',
            5000
        );
        try {
            const resp = await fetch('/api/dropbox/download-book?path=' + encodeURIComponent(bookPath));
            if (!resp.ok) throw new Error('Download failed: ' + resp.statusText);
            const blob = await resp.blob();
            const file = new File([blob], bookName, { type: blob.type || 'application/octet-stream' });
            if (typeof handleIncomingFile === 'function') {
                handleIncomingFile(file);
                showToast(
                    typeof t === 'function' ? t('cloudBookDownloaded', { name: bookName }) : `Downloaded "${bookName}" from Dropbox`,
                    'success'
                );
            }
        } catch (err) {
            showToast(err.message || 'Failed to download book from Dropbox', 'error');
        }
    }

    function init() {
        const headerBtn = $('headerCloudSyncBtn');
        if (headerBtn) {
            headerBtn.addEventListener('click', () => {
                if (isConnected) {
                    syncPushImmediate(true);
                } else {
                    const settingsBtn = $('settingsBtn');
                    if (settingsBtn) settingsBtn.click();
                    setTimeout(() => {
                        const tokenInput = $('settingsCloudTokenInput');
                        if (tokenInput) tokenInput.focus();
                    }, 100);
                }
            });
        }

        const tokenSubmitBtn = $('settingsCloudTokenSubmit');
        const tokenInput = $('settingsCloudTokenInput');
        if (tokenSubmitBtn && tokenInput) {
            tokenSubmitBtn.addEventListener('click', () => {
                connectWithToken(tokenInput.value);
            });
            tokenInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    connectWithToken(tokenInput.value);
                }
            });
        }

        const disconnectBtn = $('settingsCloudDisconnectBtn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => {
                disconnect();
            });
        }

        const manualSyncBtn = $('settingsCloudManualSyncBtn');
        if (manualSyncBtn) {
            manualSyncBtn.addEventListener('click', () => {
                syncPushImmediate(true);
            });
        }

        // Intercept 1-click OAuth button if App Key is not configured yet
        const oauthBtn = $('settingsCloudOAuthBtn');
        if (oauthBtn) {
            oauthBtn.addEventListener('click', e => {
                if (!hasAppKey) {
                    e.preventDefault();
                    const details = $('settingsCloudAdvancedDetails');
                    if (details) details.open = true;
                    const keyInput = $('settingsCloudAppKeyInput');
                    if (keyInput) keyInput.focus();
                    showToast(
                        typeof t === 'function' ? t('cloudEnterAppKeyPrompt') : 'Please enter your Dropbox App Key or connect with a Token.',
                        'info',
                        4500
                    );
                }
            });
        }

        // Copy Redirect URI Button
        const copyUriBtn = $('settingsCloudCopyUriBtn');
        const redirectUriEl = $('settingsCloudRedirectUri');
        if (copyUriBtn && redirectUriEl) {
            copyUriBtn.addEventListener('click', async () => {
                const uriText = redirectUriEl.textContent.trim();
                try {
                    await navigator.clipboard.writeText(uriText);
                } catch (_) {
                    const ta = document.createElement('textarea');
                    ta.value = uriText;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                const oldText = copyUriBtn.textContent;
                copyUriBtn.textContent = typeof t === 'function' ? t('cloudCopied') : 'Kopyalandı';
                showToast(
                    typeof t === 'function' ? t('cloudRedirectUriCopied') : 'Redirect URI copied to clipboard!',
                    'success',
                    4500
                );
                setTimeout(() => {
                    copyUriBtn.textContent = oldText;
                }, 2000);
            });
        }

        // Save App Key from UI
        const saveAppKeyBtn = $('settingsCloudSaveAppKeyBtn');
        const appKeyInput = $('settingsCloudAppKeyInput');
        const appSecretInput = $('settingsCloudAppSecretInput');
        if (saveAppKeyBtn && appKeyInput) {
            // Immediate pre-fill from localStorage if available
            const cachedKey = localStorage.getItem('lexi.dropboxAppKey');
            if (cachedKey && !appKeyInput.value) {
                appKeyInput.value = cachedKey;
            }

            saveAppKeyBtn.addEventListener('click', async () => {
                const k = (appKeyInput.value || '').trim();
                const s = appSecretInput ? (appSecretInput.value || '').trim() : '';
                if (!k) {
                    showToast('App Key cannot be empty', 'warn');
                    return;
                }
                try {
                    const resp = await fetch('/api/dropbox/config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ app_key: k, app_secret: s })
                    });
                    const d = await resp.json();
                    if (d.success) {
                        hasAppKey = true;
                        try { localStorage.setItem('lexi.dropboxAppKey', k); } catch (_) {}
                        showToast(typeof t === 'function' ? t('cloudAppKeySavedToast') : 'App Key saved! You can now sign in with Dropbox.', 'success', 4500);
                    } else {
                        showToast(d.error || 'Failed to save App Key', 'error');
                    }
                } catch (err) {
                    showToast(err.message || 'Error saving config', 'error');
                }
            });
        }

        // Check initial status
        checkStatus();

        // Handle OAuth redirect return
        try {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('dropbox_connected') === '1') {
                setTimeout(() => {
                    showToast(typeof t === 'function' ? t('cloudConnectedToast', { name: 'Dropbox' }) : 'Connected to Dropbox!', 'success', 4000);
                }, 300);
                window.history.replaceState({}, document.title, window.location.pathname);
            } else if (urlParams.get('dropbox_error')) {
                const err = urlParams.get('dropbox_error');
                let msg;
                if (err === 'missing_app_key') {
                    msg = typeof t === 'function' ? t('cloudMissingAppKey') : 'Dropbox App Key is not configured on the server. Please check environment variables.';
                } else if (err.toLowerCase().includes('redirect_uri') || err.toLowerCase().includes('redirect uri')) {
                    msg = typeof t === 'function' ? t('cloudInvalidRedirectUri') : `Dropbox Redirect URI mismatch! Please check Dropbox Console: ${err}`;
                    // Open settings modal and advanced section automatically to guide the user
                    const details = $('settingsCloudAdvancedDetails');
                    if (details) details.open = true;
                    const settingsBtn = $('settingsBtn');
                    if (settingsBtn) settingsBtn.click();
                } else {
                    msg = typeof t === 'function' ? t('cloudSyncError', { error: err }) : `Dropbox error: ${err}`;
                }
                setTimeout(() => {
                    showToast(msg, 'error', 7000);
                }, 300);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (_) {}
    }

    return {
        init,
        checkStatus,
        connectWithToken,
        disconnect,
        syncPushImmediate,
        triggerImmediateSync: syncPushImmediate,
        triggerDebouncedSync,
        syncPull,
        handleNewDocumentOpened,
        fetchRemoteBooks,
        downloadAndOpenBook,
        downloadAndImportBook,
        recordBookDeletion,
        clearBookDeletion,
        getDeletedBooksMap,
        deleteBookFromDropbox,
        syncBooksWithDropbox,
        get isConnected() { return isConnected; }
    };
})();

// Attach to window
window.LexiSync = LexiSync;

// Auto-initialize when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LexiSync.init());
} else {
    LexiSync.init();
}
