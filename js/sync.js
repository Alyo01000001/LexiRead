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
                headerIcon.textContent = '🔄';
                headerIcon.classList.add('animate-spin');
            }
            if (headerText) {
                headerText.textContent = typeof t === 'function' ? t('cloudSyncing') : 'Syncing…';
                headerText.className = 'hidden md:inline text-[11px] text-indigo-300 font-mono';
            }
            headerBtn.title = typeof t === 'function' ? t('cloudSyncing') : 'Syncing…';
            return;
        }

        if (headerIcon) {
            headerIcon.classList.remove('animate-spin');
        }

        if (isConnected) {
            if (headerIcon) headerIcon.textContent = '☁️';
            if (headerText) {
                headerText.textContent = '✓';
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
            if (headerIcon) headerIcon.textContent = '☁️';
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
                version: 1,
                lastSync: Date.now(),
                documents: docsMap
            },
            savedVocabulary: vocab
        };
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

                // 2. Update local documents reading progress if remote had newer progress
                if (data.syncState && data.syncState.documents && window.LexiDB) {
                    for (const [docKey, remoteDoc] of Object.entries(data.syncState.documents)) {
                        const localDoc = await LexiDB.getDocument(docKey);
                        if (localDoc && remoteDoc.lastReadAt > (localDoc.lastReadAt || 0)) {
                            await LexiDB.updateDocumentProgress(
                                docKey,
                                remoteDoc.lastPage,
                                remoteDoc.scrollTop,
                                remoteDoc.pageCount
                            );
                            if (remoteDoc.customTitle && !localDoc.customTitle) {
                                await LexiDB.updateDocumentTitle(docKey, remoteDoc.customTitle);
                            }
                        }
                    }
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

            // Merge reading progress
            if (data.syncState && data.syncState.documents && window.LexiDB) {
                for (const [docKey, rem] of Object.entries(data.syncState.documents)) {
                    const loc = await LexiDB.getDocument(docKey);
                    if (loc && rem.lastReadAt > (loc.lastReadAt || 0)) {
                        await LexiDB.updateDocumentProgress(docKey, rem.lastPage, rem.scrollTop, rem.pageCount);
                        updatedAny = true;
                    }
                }
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
                copyUriBtn.textContent = typeof t === 'function' ? t('cloudCopied') : '✓ Kopyalandı';
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
