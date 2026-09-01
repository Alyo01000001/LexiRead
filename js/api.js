/* =============================================================
   LexiRead — Translation API Engine (Gemini & DeepL)
   ============================================================= */

'use strict';

async function translateApi(texts, source, target, context = null) {
    const key = getKey();
    if (!key) throw mkErr(t('noApiKeyToast'), 'auth');
    const provider = getProvider();
    const textArr = Array.isArray(texts) ? texts : [texts];

    if (provider === 'gemini') {
        const promptStr = textArr.map((t, i) => `[${i}] ${t}`).join('\n');
        const userContent = (context ? `Context sentence: "${context}"\n\n` : '') + `Texts to translate:\n${promptStr}`;
        
        const body = {
            systemInstruction: {
                parts: [{
                    text: `You are a fast, concise translator from ${source} to ${target}. Translate the provided texts accurately keeping the context in mind. Output ONLY a valid JSON array of translated strings in the exact same order.`
                }]
            },
            contents: [{ parts: [{ text: userContent }] }],
            generationConfig: { 
                response_mime_type: "application/json",
                temperature: 0,
                thinkingConfig: {
                    thinking_level: "LOW"
                }
            }
        };

        let resp;
        try {
            resp = await fetch('/translate/gemini', {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer ' + key, 
                    'Content-Type': 'application/json',
                    'X-Gemini-Model': 'gemini-3.5-flash-lite'
                },
                body: JSON.stringify(body)
            });
        } catch (_) { throw mkErr('Network error — check your connection.', 'network'); }

        let data = null;
        try { data = await resp.json(); } catch (_) {}
        
        if (resp.status === 429) throw mkErr('Too many requests.', 'ratelimit');
        if (resp.status === 401 || resp.status === 403) throw mkErr('Invalid API key or quota exceeded.', 'auth');
        if (!resp.ok) throw mkErr(`Translation failed (HTTP ${resp.status}).`, 'http');
        
        try {
            const outText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
            const outs = JSON.parse(outText);
            return Array.isArray(texts) ? outs : outs[0];
        } catch (e) {
            throw mkErr('Failed to parse Gemini response.', 'api');
        }
    } else {
        // DeepL
        const body = {
            text: textArr,
            source_lang: srcCode(source),
            target_lang: tgtCode(target)
        };
        if (context) body.context = context;

        let resp;
        try {
            resp = await fetch('/translate/deepl', {
                method: 'POST',
                headers: { 'Authorization': 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch (_) { throw mkErr('Network error — check your connection.', 'network'); }

        let data = null, msg = '';
        try { data = await resp.json(); msg = String(data?.message || data?.error || '').trim(); } catch (_) {}

        if (resp.status === 429) throw mkErr(msg || 'Too many requests.', 'ratelimit');
        if (resp.status === 456 || resp.status === 403) throw mkErr(msg || 'DeepL API Quota exceeded.', 'quota');
        if (resp.status === 401) throw mkErr(msg || 'Invalid DeepL API key.', 'auth');
        if (resp.status === 400) throw mkErr(msg || 'Unsupported language pair or bad request.', 'lang');
        if (resp.status === 413) throw mkErr(msg || 'Text too long for one request.', 'http');
        if (!resp.ok)            throw mkErr(msg || `Translation failed (HTTP ${resp.status}).`, 'http');

        if (!data?.translations) throw mkErr('Empty translation returned.', 'api');
        
        const outs = data.translations.map(t => t.text);
        return Array.isArray(texts) ? outs : outs[0];
    }
}

async function withRetry(fn, retries = API_RETRIES) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (['quota', 'auth', 'lang'].includes(err.kind)) throw err;
            if (attempt < retries) await sleep(400 * Math.pow(2, attempt));
        }
    }
    throw lastErr;
}

// Key Modal Tab Switcher & UI
let currentModalTab = 'gemini';

function setTab(tab) {
    currentModalTab = tab;
    if (tab === 'gemini') {
        tabGemini.className = 'flex-1 pb-2.5 text-center text-xs font-semibold sm:text-sm transition border-b-2 border-indigo-500 text-indigo-400';
        tabDeepl.className = 'flex-1 pb-2.5 text-center text-xs font-semibold sm:text-sm transition border-b-2 border-transparent text-slate-400 hover:text-slate-200';
        geminiDescBlock.classList.remove('hidden');
        deeplDescBlock.classList.add('hidden');
        keyInput.placeholder = t('keyPlaceholderGemini');
    } else {
        tabDeepl.className = 'flex-1 pb-2.5 text-center text-xs font-semibold sm:text-sm transition border-b-2 border-indigo-500 text-indigo-400';
        tabGemini.className = 'flex-1 pb-2.5 text-center text-xs font-semibold sm:text-sm transition border-b-2 border-transparent text-slate-400 hover:text-slate-200';
        deeplDescBlock.classList.remove('hidden');
        geminiDescBlock.classList.add('hidden');
        keyInput.placeholder = t('keyPlaceholderDeepl');
    }
    keyInput.value = getProviderKey(tab);
    keyHint.classList.add('hidden');
}

tabGemini.addEventListener('click', () => {
    if (keyInput.value.trim()) setProviderKey(currentModalTab, keyInput.value.trim());
    setTab('gemini');
});
tabDeepl.addEventListener('click', () => {
    if (keyInput.value.trim()) setProviderKey(currentModalTab, keyInput.value.trim());
    setTab('deepl');
});

function updateKeyUI() {
    const prov = getProvider();
    const has = !!getKey();
    if (typeof keyDot !== 'undefined' && keyDot) {
        keyDot.className = 'h-2 w-2 rounded-full ' + (has ? 'bg-emerald-400' : 'bg-amber-400');
    }
    if (typeof keyBtn !== 'undefined' && keyBtn) {
        keyBtn.title = has ? `${prov === 'gemini' ? 'Gemini' : 'DeepL'} API active — click to change` : t('noApiKeyToast');
    }
    if (typeof activeProviderBadge !== 'undefined' && activeProviderBadge) {
        activeProviderBadge.textContent = t('activeProvider', { provider: prov === 'gemini' ? 'Gemini' : 'DeepL' });
    }
    if (typeof settingsKeyStatus !== 'undefined' && settingsKeyStatus) {
        settingsKeyStatus.textContent = `${prov === 'gemini' ? 'Gemini' : 'DeepL'} (${has ? 'Active' : 'Not Set'})`;
        settingsKeyStatus.className = `text-[11px] ${has ? 'text-emerald-400' : 'text-amber-400'}`;
    }
}

if (typeof keyBtn !== 'undefined' && keyBtn) {
    keyBtn.addEventListener('click', () => {
        setTab(getProvider());
        updateKeyUI();
        keyHint.classList.add('hidden');
        openModal(keyModal);
        setTimeout(() => keyInput.focus(), 60);
    });
}

function closeKeyModal(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    closeModal(keyModal);
}
window.closeKeyModal = closeKeyModal;

function saveKeyModal(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    saveKey();
}
window.saveKeyModal = saveKeyModal;

if (keyCloseBtn) {
    keyCloseBtn.addEventListener('click', closeKeyModal);
}

if (keyCancelBtn) {
    keyCancelBtn.addEventListener('click', closeKeyModal);
}

if (keyModal) {
    const keyBack = keyModal.querySelector('.keyBack');
    if (keyBack) {
        keyBack.addEventListener('click', closeKeyModal);
    }
}

if (keyInput) {
    keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveKey(); });
}

function saveKey() {
    try {
        const inputEl = document.getElementById('keyInput') || keyInput;
        const v = inputEl ? inputEl.value.trim() : '';
        const prov = currentModalTab || getProvider() || 'gemini';

        if (!v) { 
            // Allow removing API key if user empties the input and clicks Save
            setProviderKey(prov, '');
            if (typeof updateKeyUI === 'function') updateKeyUI();
            if (typeof updateSettingsModalUI === 'function') updateSettingsModalUI();
            closeModal(keyModal);
            showToast(t('keyHintEmpty') || 'API key removed', 'info');
            return; 
        }

        setProviderKey(prov, v);
        localStorage.setItem(PROVIDER_KEY, prov);
        if (typeof updateKeyUI === 'function') updateKeyUI();
        if (typeof updateSettingsModalUI === 'function') updateSettingsModalUI();
        closeModal(keyModal);
        showToast(t('keySavedToast', { prov: prov === 'gemini' ? 'Gemini' : 'DeepL' }), 'success');
    } catch (err) {
        console.error('saveKey error:', err);
        closeModal(keyModal);
        showToast('Key saved', 'success');
    }
}

if (keySaveBtn) {
    keySaveBtn.addEventListener('click', saveKeyModal);
}
