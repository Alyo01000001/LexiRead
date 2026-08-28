/* =============================================================
   LexiRead — Drag Selection, Gestures & Tooltip Engine
   ============================================================= */

'use strict';

const drag = { active:false, anchor:null, current:null, moved:false, pointer:'mouse' };
let activeEls = [], selectedEls = [], previousActiveEl = null;

function clearActive()   { activeEls.forEach(el => el.classList.remove('active')); activeEls = []; }
function clearSelected() { selectedEls.forEach(el => el.classList.remove('selected')); selectedEls = []; }

function highlightRange(target) {
    const a = wordIndex.get(drag.anchor), b = wordIndex.get(target);
    if (a === undefined || b === undefined) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    clearSelected();
    for (let i = lo; i <= hi; i++) { wordSpans[i].classList.add('selected'); selectedEls.push(wordSpans[i]); }
    drag.current = target;
    if (target !== drag.anchor) drag.moved = true;
}
function resetDrag() {
    drag.active = false; drag.anchor = null; drag.current = null; drag.moved = false;
    document.body.classList.remove('dragging');
}

// Middle-click (Mouse wheel click): translate and auto-bookmark immediately
reader.addEventListener('mousedown', e => {
    if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        const span = e.target.closest('.word');
        if (!span) return;
        const text = stripPunctuation(span.textContent);
        if (!text) return;
        clearActive(); clearSelected();
        span.classList.add('active');
        activeEls = [span];
        const rect = span.getBoundingClientRect();
        lastAnchor = { first: span, last: span };
        showWordTooltip(text, rect, span, true);
        return;
    }

    if (e.button !== 0) return;
    const span = e.target.closest('.word');
    if (!span) { hideTooltip(); return; }
    e.preventDefault();
    drag.active = true; drag.pointer = 'mouse';
    drag.anchor = span; drag.current = span; drag.moved = false;
    document.body.classList.add('dragging');
    previousActiveEl = activeEls[0] || null;
    clearActive(); clearSelected();
    highlightRange(span);
});

reader.addEventListener('auxclick', e => {
    if (e.button === 1) { e.preventDefault(); e.stopPropagation(); }
});

reader.addEventListener('mouseover', e => {
    if (!drag.active || drag.pointer !== 'mouse') return;
    const span = e.target.closest('.word');
    if (span && span !== drag.current) highlightRange(span);
});
window.addEventListener('mouseup', e => {
    if (!drag.active || drag.pointer !== 'mouse' || e.button !== 0) return;
    finalizeGesture();
});
reader.addEventListener('touchstart', e => {
    const t = e.touches[0];
    const span = document.elementFromPoint(t.clientX, t.clientY)?.closest?.('.word');
    if (!span) return;
    drag.active = true; drag.pointer = 'touch';
    drag.anchor = span; drag.current = span; drag.moved = false;
    previousActiveEl = activeEls[0] || null;
    clearActive(); clearSelected();
    highlightRange(span);
}, { passive: true });
reader.addEventListener('touchmove', e => {
    if (!drag.active || drag.pointer !== 'touch') return;
    e.preventDefault();
    const t = e.touches[0];
    const span = document.elementFromPoint(t.clientX, t.clientY)?.closest?.('.word');
    if (span && span !== drag.current) highlightRange(span);
}, { passive: false });
reader.addEventListener('touchend', e => {
    if (!drag.active || drag.pointer !== 'touch') return;
    e.preventDefault();
    finalizeGesture();
}, { passive: false });
window.addEventListener('touchcancel', () => {
    if (drag.active && drag.pointer === 'touch') { resetDrag(); clearSelected(); }
});

// Single click → strip surrounding punctuation.
function stripPunctuation(w) {
    return w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}
// Swipe → build clean phrase from selected token spans and join hyphenated line breaks.
function buildPhraseTextFromSpans(spans) {
    let result = '';
    for (let i = 0; i < spans.length; i++) {
        const text = spans[i].textContent;
        if (i === 0) {
            result = text;
        } else {
            const prev = spans[i - 1].textContent;
            if (/[-‐‑–]$/.test(prev)) {
                result = result.replace(/[-‐‑–]+$/, '') + text;
            } else {
                result += ' ' + text;
            }
        }
    }
    return result.trim();
}
function measureRange(first, last) {
    try {
        const r = document.createRange();
        r.setStartBefore(first); r.setEndAfter(last);
        return r.getBoundingClientRect();
    } catch (_) { return first.getBoundingClientRect(); }
}

function finalizeGesture() {
    const spans = selectedEls.slice();
    const wasPhrase = drag.moved && spans.length > 1;
    resetDrag();
    if (!spans.length) return;
    const first = spans[0], last = spans[spans.length - 1];
    if (!wasPhrase && previousActiveEl === first) { previousActiveEl = null; hideTooltip(); return; }
    previousActiveEl = null;

    clearActive();
    spans.forEach(el => el.classList.add('active'));
    activeEls = spans;

    const rect = measureRange(first, last);
    lastAnchor = { first, last };

    const text = wasPhrase ? buildPhraseTextFromSpans(spans) : stripPunctuation(first.textContent);
    if (!text) { clearActive(); clearSelected(); return; }
    showWordTooltip(text, rect, first);
}

// 2. TOOLTIP ENGINE & DISMISSAL
function setSaveIcon(state) {
    tooltipSave.textContent = state ? '★' : '☆';
    tooltipSave.className = 'rounded-md px-1.5 py-1 text-base leading-none hover:bg-slate-700 ' +
        (state ? 'text-amber-300' : 'text-slate-400 hover:text-amber-300');
    tooltipSave.disabled = false;
}

function showWordTooltip(displayText, rect, wordSpan, autoSave = false) {
    const src = currentSrc, tgt = currentTgt;
    const myGen = ++tooltipGen;
    tooltipData = null;
    tooltipSave.textContent = '☆';
    tooltipSave.disabled = true;
    tooltipBody.innerHTML =
        '<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent align-middle"></span>';
    positionTooltip(rect, 'above');

    let sentence = "";
    if (wordSpan) {
        const i = Number(wordSpan.dataset.i);
        const segIndex = tokenSegMap[i];
        if (segIndex >= 0) {
            const seg = segments[segIndex];
            sentence = seg.original;
        }
    }

    let query = displayText;
    if (query.length > MAX_ONDEMAND_CHARS) query = query.slice(0, MAX_ONDEMAND_CHARS);

    const cacheKey = `${query}|${src}|${tgt}|${sentence}`; 

    if (ondemandCache.has(cacheKey)) {
        const cached = ondemandCache.get(cacheKey);
        applyTranslation(cached, displayText, src, tgt, rect, autoSave);
        return;
    }

    withRetry(() => translateApi([query], src, tgt, sentence || null))
        .then(outs => {
            const out = outs[0];
            ondemandCache.set(cacheKey, out);

            if (myGen !== tooltipGen) return;
            applyTranslation(out, displayText, src, tgt, rect, autoSave);
        })
        .catch(err => {
            if (myGen !== tooltipGen) return;
            const tag = {
                quota:'⏳ Quota exceeded', auth:'🔑 API key required',
                network:'🔗 Network error', lang:'⚠ Unsupported pair', http:'⚠ API error', ratelimit: '⏳ Rate limit'
            }[err.kind] || '⚠ Error';
            tooltipBody.textContent = tag;
            tooltipSave.disabled = true;
            if (err.kind === 'quota' || err.kind === 'auth') {
                showToast(`${tag}. Please check your API key.`, 'error', 8000);
                keyBtn.classList.add('attention');
                setTimeout(() => keyBtn.classList.remove('attention'), 5200);
            } else showToast(`${tag}: ${err.message}`, 'error');
        });
}

function applyTranslation(translation, original, src, tgt, rect, autoSave = false) {
    tooltipBody.innerHTML = '';
    const wordDiv = document.createElement('div');
    wordDiv.textContent = translation;
    tooltipBody.appendChild(wordDiv);

    tooltipData = { original, translation, src, tgt };

    if (autoSave && !isSaved(original, translation)) {
        addSaved({
            id: genRandomId('w'),
            original: original,
            translation: translation,
            src: src,
            tgt: tgt,
            date: new Date().toISOString()
        });
        showToast(`🔖 Saved "${original}" → "${translation}"`, 'success', 2200);
    }

    setSaveIcon(isSaved(original, translation));
    positionTooltip(rect, 'above');
}

tooltipSave.addEventListener('click', e => {
    e.stopPropagation();
    if (!tooltipData) return;
    if (isSaved(tooltipData.original, tooltipData.translation)) {
        showToast('Already saved.', 'info');
        return;
    }
    addSaved({
        id: genRandomId('w'),
        original: tooltipData.original,
        translation: tooltipData.translation,
        src: tooltipData.src,
        tgt: tooltipData.tgt,
        date: new Date().toISOString()
    });
    setSaveIcon(true);
    showToast('Saved to your list.', 'success');
});

function positionTooltip(rect, prefer = 'above') {
    const sx = window.scrollX, sy = window.scrollY;
    tooltip.style.visibility = 'hidden';
    tooltip.classList.add('visible');
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let left = rect.left + sx + rect.width / 2 - tw / 2;
    left = Math.max(sx + 8, Math.min(left, sx + window.innerWidth - tw - 8));
    const roomAbove = rect.top > th + 16;
    const roomBelow = rect.bottom + th + 16 < window.innerHeight;
    let top, dir;
    if (prefer === 'above' && roomAbove) { top = rect.top + sy - th - 10; dir = 'above'; }
    else if (roomBelow)                  { top = rect.bottom + sy + 10;   dir = 'below'; }
    else                                 { top = Math.max(sy + 8, rect.top + sy - th - 10); dir = 'above'; }
    tooltip.classList.toggle('above', dir === 'above');
    tooltip.classList.toggle('below', dir === 'below');
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top  = `${Math.round(top)}px`;
    tooltip.style.visibility = 'visible';
}

function hideTooltip() {
    tooltip.classList.remove('visible');
    tooltipGen++;
    tooltipData = null;
    clearActive(); clearSelected();
    lastAnchor = null;
}

tooltipClose.addEventListener('mousedown', e => { e.stopPropagation(); hideTooltip(); });
tooltipClose.addEventListener('touchstart', e => { e.stopPropagation(); hideTooltip(); }, { passive: true });

document.addEventListener('mousedown', e => {
    if (tooltip.contains(e.target)) return;
    if (reader.contains(e.target))  return;
    if (keyModal.contains(e.target) || langModal.contains(e.target) || savedModal.contains(e.target) || outlineModal.contains(e.target) || typographyModal.contains(e.target)) return;
    hideTooltip();
});

let repositionTimer = null;
function scheduleReposition() {
    if (!lastAnchor || !tooltip.classList.contains('visible')) return;
    clearTimeout(repositionTimer);
    repositionTimer = setTimeout(() => {
        if (!lastAnchor.first.isConnected) { hideTooltip(); return; }
        positionTooltip(measureRange(lastAnchor.first, lastAnchor.last), 'above');
    }, 40);
}
window.addEventListener('scroll', scheduleReposition, { passive: true });
window.addEventListener('resize', scheduleReposition);
