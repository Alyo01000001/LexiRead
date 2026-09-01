/* =============================================================
   LexiRead — IndexedDB Storage Engine (Library & Translation Memory)
   Zero external dependencies, purely native browser IndexedDB
   ============================================================= */

'use strict';

const DB_NAME = 'LexiReadDB';
const DB_VERSION = 1;
const MAX_LIBRARY_BOOKS = 20;

const LexiDB = (() => {
    let dbInstance = null;

    function getDB() {
        if (dbInstance) return Promise.resolve(dbInstance);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = e => {
                const db = e.target.result;

                // 1. Documents Store
                if (!db.objectStoreNames.contains('documents')) {
                    const docStore = db.createObjectStore('documents', { keyPath: 'docKey' });
                    docStore.createIndex('lastReadAt', 'lastReadAt', { unique: false });
                }

                // 2. Translations Store (Translation Memory per document & sentence)
                if (!db.objectStoreNames.contains('translations')) {
                    const transStore = db.createObjectStore('translations', { keyPath: 'id' });
                    transStore.createIndex('lookupKey', 'lookupKey', { unique: true });
                    transStore.createIndex('docKey', 'docKey', { unique: false });
                }
            };

            req.onsuccess = e => {
                dbInstance = e.target.result;
                resolve(dbInstance);
            };

            req.onerror = e => {
                console.error('[LexiDB] Open database failed:', e);
                reject(e);
            };
        });
    }

    function createLookupKey(docKey, query, context, src, tgt) {
        const cleanQ = String(query || '').trim();
        const cleanC = String(context || '').trim();
        const s = String(src || '').toUpperCase();
        const t = String(tgt || '').toUpperCase();
        return `${docKey}___${s}_${t}___${cleanQ}___${cleanC}`;
    }

    return {
        // ========== 1. DOCUMENT OPERATIONS ==========

        async saveDocument(doc) {
            try {
                const db = await getDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(['documents'], 'readwrite');
                    const store = tx.objectStore('documents');

                    // Check existing to preserve creation/cover if needed
                    const getReq = store.get(doc.docKey);
                    getReq.onsuccess = () => {
                        const existing = getReq.result || {};
                        const merged = {
                            ...existing,
                            ...doc,
                            lastReadAt: Date.now()
                        };
                        store.put(merged);
                    };

                    tx.oncomplete = async () => {
                        await LexiDB.enforceCapacityLimit();
                        resolve(true);
                    };
                    tx.onerror = e => reject(e);
                });
            } catch (err) {
                console.error('[LexiDB] saveDocument error:', err);
                return false;
            }
        },

        async getDocument(docKey) {
            try {
                const db = await getDB();
                return new Promise(resolve => {
                    const tx = db.transaction(['documents'], 'readonly');
                    const store = tx.objectStore('documents');
                    const req = store.get(docKey);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                });
            } catch (_) {
                return null;
            }
        },

        async getAllDocuments() {
            try {
                const db = await getDB();
                return new Promise(resolve => {
                    const tx = db.transaction(['documents'], 'readonly');
                    const store = tx.objectStore('documents');
                    const index = store.index('lastReadAt');
                    const req = index.openCursor(null, 'prev'); // Latest first
                    const results = [];

                    req.onsuccess = e => {
                        const cursor = e.target.result;
                        if (cursor) {
                            results.push(cursor.value);
                            cursor.continue();
                        } else {
                            resolve(results);
                        }
                    };
                    req.onerror = () => resolve([]);
                });
            } catch (_) {
                return [];
            }
        },

        async updateDocumentProgress(docKey, page, scrollTop, totalPages) {
            if (!docKey) return;
            try {
                const db = await getDB();
                const tx = db.transaction(['documents'], 'readwrite');
                const store = tx.objectStore('documents');
                const req = store.get(docKey);

                req.onsuccess = () => {
                    const doc = req.result;
                    if (!doc) return;
                    doc.lastPage = page || doc.lastPage || 1;
                    doc.scrollTop = scrollTop || 0;
                    if (totalPages && totalPages > 0) {
                        doc.pageCount = totalPages;
                        doc.progressPercent = Math.min(100, Math.max(1, Math.round((page / totalPages) * 100)));
                    }
                    doc.lastReadAt = Date.now();
                    store.put(doc);
                };
            } catch (err) {
                console.error('[LexiDB] updateProgress error:', err);
            }
        },

        async updateDocumentCover(docKey, coverDataUrl) {
            if (!docKey || !coverDataUrl) return;
            try {
                const db = await getDB();
                const tx = db.transaction(['documents'], 'readwrite');
                const store = tx.objectStore('documents');
                const req = store.get(docKey);

                req.onsuccess = () => {
                    const doc = req.result;
                    if (doc) {
                        doc.coverData = coverDataUrl;
                        store.put(doc);
                    }
                };
            } catch (_) {}
        },

        async updateDocumentTitle(docKey, newTitle) {
            if (!docKey) return false;
            try {
                const db = await getDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(['documents'], 'readwrite');
                    const store = tx.objectStore('documents');
                    const req = store.get(docKey);

                    req.onsuccess = () => {
                        const doc = req.result;
                        if (!doc) { resolve(false); return; }
                        doc.customTitle = (newTitle || '').trim();
                        store.put(doc);
                    };
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = e => reject(e);
                });
            } catch (err) {
                console.error('[LexiDB] updateDocumentTitle error:', err);
                return false;
            }
        },

        async updateDocumentLanguages(docKey, srcLang, tgtLang) {
            if (!docKey) return false;
            try {
                const db = await getDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(['documents'], 'readwrite');
                    const store = tx.objectStore('documents');
                    const req = store.get(docKey);

                    req.onsuccess = () => {
                        const doc = req.result;
                        if (!doc) { resolve(false); return; }
                        if (srcLang) doc.srcLang = srcLang;
                        if (tgtLang) doc.tgtLang = tgtLang;
                        doc.lastReadAt = Date.now();
                        store.put(doc);
                    };
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = e => reject(e);
                });
            } catch (err) {
                console.error('[LexiDB] updateDocumentLanguages error:', err);
                return false;
            }
        },

        async resetDocumentProgress(docKey) {
            if (!docKey) return false;
            try {
                const db = await getDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(['documents'], 'readwrite');
                    const store = tx.objectStore('documents');
                    const req = store.get(docKey);

                    req.onsuccess = () => {
                        const doc = req.result;
                        if (!doc) { resolve(false); return; }
                        doc.lastPage = 1;
                        doc.scrollTop = 0;
                        doc.progressPercent = 1;
                        doc.lastReadAt = Date.now();
                        store.put(doc);
                    };
                    tx.oncomplete = () => {
                        try { localStorage.removeItem('lexi.prog.' + docKey); } catch (_) {}
                        resolve(true);
                    };
                    tx.onerror = e => reject(e);
                });
            } catch (err) {
                console.error('[LexiDB] resetDocumentProgress error:', err);
                return false;
            }
        },

        async deleteDocument(docKey) {
            try {
                const db = await getDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(['documents', 'translations'], 'readwrite');
                    const docStore = tx.objectStore('documents');
                    const transStore = tx.objectStore('translations');

                    // 1. Delete document record
                    docStore.delete(docKey);

                    // 2. Delete all translations associated with this document
                    const docIndex = transStore.index('docKey');
                    const req = docIndex.openCursor(IDBKeyRange.only(docKey));
                    req.onsuccess = e => {
                        const cursor = e.target.result;
                        if (cursor) {
                            cursor.delete();
                            cursor.continue();
                        }
                    };

                    tx.oncomplete = () => {
                        // Also clean localStorage progress key if any
                        localStorage.removeItem('lexi.prog.' + docKey);
                        resolve(true);
                    };
                    tx.onerror = e => reject(e);
                });
            } catch (err) {
                console.error('[LexiDB] deleteDocument error:', err);
                return false;
            }
        },

        async enforceCapacityLimit(maxCount = MAX_LIBRARY_BOOKS) {
            try {
                const docs = await LexiDB.getAllDocuments();
                if (docs.length > maxCount) {
                    const toDelete = docs.slice(maxCount);
                    for (const oldDoc of toDelete) {
                        await LexiDB.deleteDocument(oldDoc.docKey);
                    }
                }
            } catch (_) {}
        },

        // ========== 2. TRANSLATION MEMORY OPERATIONS ==========

        async getTranslation(docKey, query, context, src, tgt) {
            if (!docKey || !query) return null;
            try {
                const db = await getDB();
                const lookupKey = createLookupKey(docKey, query, context, src, tgt);
                return new Promise(resolve => {
                    const tx = db.transaction(['translations'], 'readonly');
                    const store = tx.objectStore('translations');
                    const index = store.index('lookupKey');
                    const req = index.get(lookupKey);

                    req.onsuccess = () => {
                        const res = req.result;
                        resolve(res ? res.translation : null);
                    };
                    req.onerror = () => resolve(null);
                });
            } catch (_) {
                return null;
            }
        },

        async saveTranslation(docKey, query, context, src, tgt, translation) {
            if (!docKey || !query || !translation) return;
            try {
                const db = await getDB();
                const lookupKey = createLookupKey(docKey, query, context, src, tgt);
                const id = 't_' + Math.abs(lookupKey.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0)).toString(36);

                const item = {
                    id,
                    docKey,
                    lookupKey,
                    query: String(query).trim(),
                    context: String(context || '').trim(),
                    src,
                    tgt,
                    translation,
                    createdAt: Date.now()
                };

                return new Promise(resolve => {
                    const tx = db.transaction(['translations'], 'readwrite');
                    const store = tx.objectStore('translations');
                    store.put(item);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                });
            } catch (err) {
                console.error('[LexiDB] saveTranslation error:', err);
            }
        }
    };
})();

// Attach to window
window.LexiDB = LexiDB;
