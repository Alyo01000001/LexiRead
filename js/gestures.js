/* =============================================================
   LexiRead — Drag Selection, Gestures & Tooltip Engine
   ============================================================= */

'use strict';

const drag = { active:false, anchor:null, current:null, moved:false, pointer:'mouse' };
let activeEls = [], selectedEls = [], previousActiveEl = null;
let lastTouchTime = 0;

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
    reader.classList.remove('is-dragging');
}

// Middle-click (Mouse wheel click): translate and auto-bookmark immediately
reader.addEventListener('mousedown', e => {
    // Ignore synthetic mouse events dispatched by mobile touch taps
    if (Date.now() - lastTouchTime < 700) return;

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
    reader.classList.add('is-dragging');
    previousActiveEl = activeEls[0] || null;
    clearActive(); clearSelected();
    highlightRange(span);
});

reader.addEventListener('auxclick', e => {
    if (e.button === 1) { e.preventDefault(); e.stopPropagation(); }
});

reader.addEventListener('mouseover', e => {
    if (Date.now() - lastTouchTime < 700) return;
    if (!drag.active || drag.pointer !== 'mouse') return;
    const span = e.target.closest('.word');
    if (span && span !== drag.current) highlightRange(span);
});
window.addEventListener('mouseup', e => {
    if (Date.now() - lastTouchTime < 700) return;
    if (!drag.active || drag.pointer !== 'mouse' || e.button !== 0) return;
    finalizeGesture();
});
let isAutoScrolling = false;

function findWordNearPoint(clientX, clientY, maxRadius = 16) {
    if (typeof clientX !== 'number' || typeof clientY !== 'number') return null;

    // 1. Direct hit check (fastest path O(1))
    const direct = document.elementFromPoint(clientX, clientY)?.closest?.('.word');
    if (direct) return direct;

    // 2. Proximity radial search around (clientX, clientY)
    // Priority: horizontal offsets (catching taps between words or just outside margin),
    // then vertical and diagonal offsets.
    const offsets = [
        [-8, 0], [8, 0], [-14, 0], [14, 0],
        [0, -7], [0, 7], [0, -12], [0, 12],
        [-8, -6], [8, -6], [-8, 6], [8, 6]
    ];

    const maxSq = maxRadius * maxRadius;
    let bestCandidate = null;
    let minDistanceSq = Infinity;

    for (let i = 0; i < offsets.length; i++) {
        const px = clientX + offsets[i][0];
        const py = clientY + offsets[i][1];
        const candidate = document.elementFromPoint(px, py)?.closest?.('.word');
        if (candidate) {
            const rect = candidate.getBoundingClientRect();
            const nearestX = Math.max(rect.left, Math.min(clientX, rect.right));
            const nearestY = Math.max(rect.top, Math.min(clientY, rect.bottom));
            const distSq = (clientX - nearestX) ** 2 + (clientY - nearestY) ** 2;
            if (distSq <= maxSq && distSq < minDistanceSq) {
                minDistanceSq = distSq;
                bestCandidate = candidate;
            }
        }
    }
    return bestCandidate;
}

function triggerWordTranslation(span) {
    if (!span) return;
    const text = stripPunctuation(span.textContent);
    if (!text) return;

    clearActive();
    clearSelected();
    span.classList.add('active');
    activeEls = [span];

    if (navigator.vibrate) {
        try { navigator.vibrate(12); } catch (_) {}
    }

    const rect = span.getBoundingClientRect();
    lastAnchor = { first: span, last: span };

    // Auto-scroll on mobile if the tapped word would be occluded by the bottom sheet
    if (isMobile()) {
        const bottomThreshold = window.innerHeight - 155;
        if (rect.bottom > bottomThreshold) {
            const neededScroll = Math.min(150, Math.ceil(rect.bottom - bottomThreshold + 25));
            if (neededScroll > 0) {
                isAutoScrolling = true;
                window.scrollBy({ top: neededScroll, behavior: 'smooth' });
                setTimeout(() => { isAutoScrolling = false; }, 450);
            }
        }
    }

    showWordTooltip(text, rect, span);
}

const touchState = {
    startX: 0,
    startY: 0,
    startTime: 0,
    targetWord: null,
    isScrolling: false,
    isDoubleTap: false,
    hasDragged: false,
    lastTapTime: 0,
    lastTapWord: null,
    lastTapX: 0,
    lastTapY: 0
};

// Two-Finger Pinch-to-Zoom Engine
const pinchState = {
    active: false,
    initialDistance: 0,
    initialZoom: 100,
    lastZoom: 100,
    focalPoint: null,
    rafId: null,
    cooldownUntil: 0
};

function getTouchDistance(touches) {
    if (!touches || touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

const touchSurface = (typeof readerShell !== 'undefined' && readerShell) ? readerShell : reader;

touchSurface.addEventListener('touchstart', e => {
    lastTouchTime = Date.now();

    // If in pinch cooldown period, ignore single touch to prevent accidental word selection
    if (Date.now() < pinchState.cooldownUntil) {
        touchState.isDoubleTap = false;
        touchState.hasDragged = false;
        touchState.isScrolling = false;
        touchState.targetWord = null;
        touchState.lastTapWord = null;
        touchState.lastTapTime = 0;
        return;
    }

    // 2-finger pinch gesture detected
    if (e.touches.length === 2) {
        touchState.isDoubleTap = false;
        touchState.hasDragged = false;
        touchState.isScrolling = false;
        touchState.targetWord = null;
        touchState.lastTapWord = null;
        touchState.lastTapTime = 0;
        resetDrag();
        clearActive();
        clearSelected();

        pinchState.active = true;
        pinchState.initialDistance = getTouchDistance(e.touches);
        pinchState.initialZoom = Math.round(currentZoomRatio * 100);
        pinchState.lastZoom = pinchState.initialZoom;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        pinchState.focalPoint = { x: midX, y: midY };
        return;
    }

    if (e.touches.length > 2) {
        touchState.isDoubleTap = false;
        touchState.hasDragged = false;
        touchState.isScrolling = false;
        resetDrag();
        pinchState.active = false;
        return;
    }

    const t = e.touches[0];
    const now = Date.now();
    const dt = now - touchState.lastTapTime;
    const dx = t.clientX - touchState.lastTapX;
    const dy = t.clientY - touchState.lastTapY;

    touchState.startX = t.clientX;
    touchState.startY = t.clientY;
    touchState.startTime = now;
    touchState.isScrolling = false;
    touchState.hasDragged = false;

    // Check if this touch is the second tap of a double tap (for multi-word phrase drag)
    if (dt < 320 && (dx * dx + dy * dy < 400) && touchState.lastTapWord) {
        touchState.isDoubleTap = true;
        const span = findWordNearPoint(t.clientX, t.clientY) || touchState.lastTapWord;
        touchState.targetWord = span;
        drag.active = true;
        drag.pointer = 'touch';
        drag.anchor = span;
        drag.current = span;
        drag.moved = false;
        previousActiveEl = activeEls[0] || null;
        clearActive();
        clearSelected();
        highlightRange(span);
        if (navigator.vibrate) {
            try { navigator.vibrate(12); } catch (_) {}
        }
    } else {
        // Single tap sequence: do NOT query DOM or call hideTooltip here
        // to keep touchstart completely unblocked (<0.1ms execution)
        touchState.isDoubleTap = false;
        touchState.targetWord = null;
    }
}, { passive: true });

touchSurface.addEventListener('touchmove', e => {
    lastTouchTime = Date.now();

    // 1. Two-finger pinch-to-zoom centered on touch midpoint
    if (pinchState.active && e.touches.length === 2) {
        e.preventDefault(); // Stop native browser full-page viewport zoom
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        pinchState.focalPoint = { x: midX, y: midY };

        const currentDistance = getTouchDistance(e.touches);
        if (pinchState.initialDistance > 10) {
            const scale = currentDistance / pinchState.initialDistance;
            const targetZoom = Math.round(pinchState.initialZoom * scale);
            const clamped = Math.max(70, Math.min(250, targetZoom));

            // Prevent virtual zoom accumulation beyond limits (eliminate hysteresis/deadband)
            if (targetZoom >= 250 && currentDistance > 10) {
                pinchState.initialDistance = currentDistance;
                pinchState.initialZoom = 250;
            } else if (targetZoom <= 70 && currentDistance > 10) {
                pinchState.initialDistance = currentDistance;
                pinchState.initialZoom = 70;
            }

            if (clamped !== pinchState.lastZoom) {
                pinchState.lastZoom = clamped;
                if (!pinchState.rafId) {
                    pinchState.rafId = requestAnimationFrame(() => {
                        pinchState.rafId = null;
                        if (typeof setZoom === 'function') {
                            setZoom(pinchState.lastZoom, pinchState.focalPoint);
                        }
                    });
                }
            }
        }
        return;
    }

    if (pinchState.active) {
        e.preventDefault();
        return;
    }

    const t = e.touches[0];

    // Single touch path (Reading / Scrolling)
    if (!touchState.isDoubleTap) {
        if (!touchState.isScrolling) {
            const dx = t.clientX - touchState.startX;
            const dy = t.clientY - touchState.startY;
            // Squared distance threshold (8px): 8*8 = 64
            if (dx * dx + dy * dy > 64) {
                touchState.isScrolling = true;
                touchState.lastTapWord = null;
                // Auto-dismiss open translation card as user starts reading/scrolling
                if (tooltip.classList.contains('visible')) {
                    hideTooltip();
                }
            }
        }
        // ZERO preventDefault() -> silky smooth 100% native compositor scroll
        return;
    }

    // Double-tap phrase drag in progress:
    const dx = t.clientX - touchState.startX;
    const dy = t.clientY - touchState.startY;
    if (dx * dx + dy * dy > 36) { // > 6px
        touchState.hasDragged = true;
        e.preventDefault(); // Only prevent scroll when actively selecting a phrase
        reader.classList.add('is-dragging');
        const span = document.elementFromPoint(t.clientX, t.clientY)?.closest?.('.word');
        if (span && span !== drag.current) {
            highlightRange(span);
        }
    }
}, { passive: false });

touchSurface.addEventListener('touchend', e => {
    lastTouchTime = Date.now();

    // 1. Two-finger pinch gesture ended
    if (pinchState.active) {
        if (e.touches.length < 2) {
            pinchState.active = false;
            pinchState.cooldownUntil = Date.now() + 350;
            if (pinchState.rafId) {
                cancelAnimationFrame(pinchState.rafId);
                pinchState.rafId = null;
            }
            if (typeof setZoom === 'function') {
                setZoom(pinchState.lastZoom, pinchState.focalPoint);
            }
        }
        touchState.isDoubleTap = false;
        touchState.hasDragged = false;
        touchState.isScrolling = false;
        touchState.targetWord = null;
        touchState.lastTapWord = null;
        touchState.lastTapTime = 0;
        return;
    }

    if (Date.now() < pinchState.cooldownUntil) {
        touchState.isDoubleTap = false;
        touchState.hasDragged = false;
        touchState.isScrolling = false;
        touchState.targetWord = null;
        touchState.lastTapWord = null;
        touchState.lastTapTime = 0;
        return;
    }

    // 2. Double-tap phrase drag selection finalized
    if (touchState.isDoubleTap && touchState.hasDragged && drag.active) {
        e.preventDefault();
        finalizeGesture();
        touchState.isDoubleTap = false;
        touchState.hasDragged = false;
        touchState.targetWord = null;
        touchState.lastTapWord = null;
        touchState.lastTapTime = 0;
        return;
    }

    // 3. Double-tap single word translation (quick double tap without dragging)
    if (touchState.isDoubleTap && !touchState.hasDragged) {
        e.preventDefault();
        const span = touchState.targetWord || findWordNearPoint(touchState.startX, touchState.startY);
        touchState.isDoubleTap = false;
        touchState.targetWord = null;
        touchState.lastTapWord = null;
        touchState.lastTapTime = 0;
        if (span) {
            triggerWordTranslation(span);
        }
        return;
    }

    // 4. Single tap handling
    if (!touchState.isDoubleTap) {
        if (touchState.isScrolling) {
            // User was scrolling, not tapping! Do not translate.
            touchState.isScrolling = false;
            touchState.targetWord = null;
            touchState.lastTapWord = null;
            return;
        }

        const duration = Date.now() - touchState.startTime;
        const t = e.changedTouches ? e.changedTouches[0] : null;
        const endX = t ? t.clientX : touchState.startX;
        const endY = t ? t.clientY : touchState.startY;
        const moveDistSq = (endX - touchState.startX) ** 2 + (endY - touchState.startY) ** 2;

        // Clean quick tap: duration < 380ms and moved <= 8px
        if (duration < 380 && moveDistSq <= 64) {
            const span = findWordNearPoint(endX, endY);
            if (span) {
                touchState.lastTapTime = Date.now();
                touchState.lastTapWord = span;
                touchState.lastTapX = endX;
                touchState.lastTapY = endY;
                triggerWordTranslation(span);
            } else {
                // Tapped on empty page background / margins
                touchState.lastTapWord = null;
                touchState.lastTapTime = 0;
                hideTooltip();
            }
        }
    }
}, { passive: false });

window.addEventListener('touchcancel', () => {
    lastTouchTime = Date.now();
    pinchState.active = false;
    if (pinchState.rafId) {
        cancelAnimationFrame(pinchState.rafId);
        pinchState.rafId = null;
    }
    touchState.isDoubleTap = false;
    touchState.hasDragged = false;
    touchState.isScrolling = false;
    touchState.targetWord = null;
    touchState.lastTapWord = null;
    resetDrag();
    clearSelected();
});

// =============================================================
// LAPTOP TOUCHPAD & TRACKPAD PINCH-TO-ZOOM ENGINE
// =============================================================
let touchpadZoomAccumulator = null;
let touchpadRafId = null;
let touchpadTimeout = null;
let touchpadFocalPoint = null;

function isModalActive() {
    const modals = [
        typeof settingsModal !== 'undefined' ? settingsModal : null,
        typeof langModal !== 'undefined' ? langModal : null,
        typeof keyModal !== 'undefined' ? keyModal : null,
        typeof savedModal !== 'undefined' ? savedModal : null,
        typeof outlineModal !== 'undefined' ? outlineModal : null,
        typeof typographyModal !== 'undefined' ? typographyModal : null,
        typeof pdfCropModal !== 'undefined' ? pdfCropModal : null,
        typeof bookActionModal !== 'undefined' ? bookActionModal : null,
        typeof bookRenameModal !== 'undefined' ? bookRenameModal : null
    ];
    return modals.some(m => m && !m.classList.contains('hidden'));
}

function handleWheelZoom(e) {
    // Laptop trackpads trigger wheel events with ctrlKey = true when pinched
    if (!e.ctrlKey) return;
    if (!readerShell || readerShell.classList.contains('hidden')) return;
    if (isModalActive()) return;

    // Prevent default browser viewport/page zoom
    e.preventDefault();

    if (touchpadZoomAccumulator === null) {
        touchpadZoomAccumulator = Math.round(currentZoomRatio * 100);
    }

    touchpadFocalPoint = { x: e.clientX, y: e.clientY };

    // Clamp delta to prevent huge jumps from high-speed mouse wheels
    const clampedDelta = Math.max(-25, Math.min(25, e.deltaY));
    // Negative deltaY means zooming in (pinch outward), positive means zooming out (pinch inward)
    touchpadZoomAccumulator -= clampedDelta * 0.4;
    touchpadZoomAccumulator = Math.max(70, Math.min(250, touchpadZoomAccumulator));

    const targetZoom = Math.round(touchpadZoomAccumulator);

    if (!touchpadRafId) {
        touchpadRafId = requestAnimationFrame(() => {
            touchpadRafId = null;
            if (typeof setZoom === 'function') {
                setZoom(targetZoom, touchpadFocalPoint);
            }
        });
    }

    clearTimeout(touchpadTimeout);
    touchpadTimeout = setTimeout(() => {
        touchpadZoomAccumulator = null;
        touchpadFocalPoint = null;
    }, 200);
}

// Window wheel listener with passive: false to allow e.preventDefault()
window.addEventListener('wheel', handleWheelZoom, { passive: false });

// Safari on macOS Trackpad Gesture Support (gesturestart / gesturechange / gestureend)
let gestureInitialZoom = 100;

window.addEventListener('gesturestart', e => {
    if (!readerShell || readerShell.classList.contains('hidden')) return;
    if (isModalActive()) return;
    e.preventDefault();
    gestureInitialZoom = Math.round(currentZoomRatio * 100);
});

window.addEventListener('gesturechange', e => {
    if (!readerShell || readerShell.classList.contains('hidden')) return;
    if (isModalActive()) return;
    e.preventDefault();
    const rawZoom = gestureInitialZoom * e.scale;
    const targetZoom = Math.round(Math.max(70, Math.min(250, rawZoom)));

    if (rawZoom >= 250 && e.scale > 0) {
        gestureInitialZoom = 250 / e.scale;
    } else if (rawZoom <= 70 && e.scale > 0) {
        gestureInitialZoom = 70 / e.scale;
    }

    const focalPoint = { x: e.clientX, y: e.clientY };
    if (typeof setZoom === 'function') {
        setZoom(targetZoom, focalPoint);
    }
});

window.addEventListener('gestureend', e => {
    if (!readerShell || readerShell.classList.contains('hidden')) return;
    e.preventDefault();
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
    tooltipSave.innerHTML = state
        ? `<svg class="w-4 h-4 text-amber-400 fill-amber-400 transition-all duration-200" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
        : `<svg class="w-4 h-4 text-slate-400 fill-none group-hover:text-amber-400 transition-all duration-200" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    tooltipSave.className = 'w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer ' +
        (state ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-white/[0.06] hover:bg-white/10 text-slate-400 hover:text-amber-400');
    tooltipSave.disabled = false;
}

function showWordTooltip(displayText, rect, wordSpan, autoSave = false) {
    const src = currentSrc, tgt = currentTgt;
    const myGen = ++tooltipGen;
    tooltipData = null;
    tooltipSave.innerHTML = `<svg class="w-4 h-4 text-slate-400 fill-none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    tooltipSave.className = 'w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.06] text-slate-400 transition-all duration-200';
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

    const fetchAndApplyTranslation = () => {
        if (myGen !== tooltipGen) return;
        withRetry(() => translateApi([query], src, tgt, sentence || null))
            .then(outs => {
                const out = outs[0];
                ondemandCache.set(cacheKey, out);
                if (window.LexiDB && currentDocKey) {
                    LexiDB.saveTranslation(currentDocKey, query, sentence, src, tgt, out);
                }

                if (myGen !== tooltipGen) return;
                applyTranslation(out, displayText, src, tgt, rect, autoSave);
            })
            .catch(err => {
                if (myGen !== tooltipGen) return;
                const tag = {
                    quota: t('statusQuota'),
                    auth: t('statusAuth'),
                    network: t('statusNetwork'),
                    lang: t('statusLang'),
                    http: t('statusApiError'),
                    ratelimit: t('statusRateLimit')
                }[err.kind] || t('statusError');
                tooltipBody.textContent = tag;
                tooltipSave.disabled = true;
                if (err.kind === 'quota' || err.kind === 'auth') {
                    showToast(t('keyAttentionToast', { tag }), 'error', 8000);
                    const btnToPulse = (typeof settingsBtn !== 'undefined' && settingsBtn) ? settingsBtn : (typeof keyBtn !== 'undefined' ? keyBtn : null);
                    if (btnToPulse) btnToPulse.classList.add('attention');
                    setTimeout(() => { if (btnToPulse) btnToPulse.classList.remove('attention'); }, 5200);
                } else showToast(`${tag}: ${err.message}`, 'error');
            });
    };

    // Check IndexedDB persistent translation memory before calling API
    if (window.LexiDB && currentDocKey) {
        LexiDB.getTranslation(currentDocKey, query, sentence, src, tgt)
            .then(persisted => {
                if (myGen !== tooltipGen) return;
                if (persisted) {
                    ondemandCache.set(cacheKey, persisted);
                    applyTranslation(persisted, displayText, src, tgt, rect, autoSave);
                } else {
                    fetchAndApplyTranslation();
                }
            })
            .catch(() => fetchAndApplyTranslation());
    } else {
        fetchAndApplyTranslation();
    }
}

function applyTranslation(translation, original, src, tgt, rect, autoSave = false) {
    tooltipBody.innerHTML = '';
    const wordDiv = document.createElement('div');
    wordDiv.textContent = translation;
    tooltipBody.appendChild(wordDiv);

    tooltipData = { original, translation, src, tgt };

    if (autoSave && !isSaved(original, translation, src, tgt)) {
        const res = addSaved({
            id: genRandomId('w'),
            original: original,
            translation: translation,
            src: src,
            tgt: tgt,
            date: new Date().toISOString()
        });
        if (res && res.updated) {
            showToast(t('savedMeaningAdded', { orig: original, tr: res.fullTranslation }), 'success', 2600);
        } else {
            showToast(t('savedWordToast', { orig: original, tr: translation }), 'success', 2200);
        }
    }

    setSaveIcon(isSaved(original, translation, src, tgt));
    positionTooltip(rect, 'above');
}

tooltipSave.addEventListener('click', e => {
    e.stopPropagation();
    if (!tooltipData) return;
    if (isSaved(tooltipData.original, tooltipData.translation, tooltipData.src, tooltipData.tgt)) {
        showToast(t('alreadySaved'), 'info');
        return;
    }
    const res = addSaved({
        id: genRandomId('w'),
        original: tooltipData.original,
        translation: tooltipData.translation,
        src: tooltipData.src,
        tgt: tooltipData.tgt,
        date: new Date().toISOString()
    });
    setSaveIcon(true);
    if (res && res.updated) {
        showToast(t('savedMeaningAdded', { orig: tooltipData.original, tr: res.fullTranslation }), 'success', 2600);
    } else {
        showToast(t('savedSuccess'), 'success');
    }
});

function positionTooltip(rect, prefer = 'above') {
    if (isMobile()) {
        tooltip.classList.remove('above', 'below');
        tooltip.style.left = '';
        tooltip.style.top = '';
        tooltip.style.visibility = 'visible';
        tooltip.classList.add('visible');
        return;
    }
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

function handleTooltipClose(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    hideTooltip();
}

tooltipClose.addEventListener('click', handleTooltipClose);
tooltipClose.addEventListener('touchend', handleTooltipClose);
tooltipClose.addEventListener('mousedown', handleTooltipClose);

tooltipSave.addEventListener('click', e => e.stopPropagation());
tooltipSave.addEventListener('touchend', e => e.stopPropagation());
tooltipSave.addEventListener('mousedown', e => e.stopPropagation());

document.addEventListener('mousedown', e => {
    if (tooltip.contains(e.target)) return;
    if (reader.contains(e.target))  return;
    if (keyModal?.contains(e.target) || langModal?.contains(e.target) || savedModal?.contains(e.target) || outlineModal?.contains(e.target) || typographyModal?.contains(e.target) || pdfCropModal?.contains(e.target) || settingsModal?.contains(e.target) || mobileMoreSheet?.contains(e.target)) return;
    hideTooltip();
});
document.addEventListener('touchstart', e => {
    if (tooltip.contains(e.target)) return;
    if (reader.contains(e.target))  return;
    if (bottomMobileBar?.contains(e.target)) return;
    if (keyModal?.contains(e.target) || langModal?.contains(e.target) || savedModal?.contains(e.target) || outlineModal?.contains(e.target) || typographyModal?.contains(e.target) || pdfCropModal?.contains(e.target) || settingsModal?.contains(e.target) || mobileMoreSheet?.contains(e.target)) return;
    hideTooltip();
}, { passive: true });

let repositionTimer = null;
function scheduleReposition() {
    if (!lastAnchor || !tooltip.classList.contains('visible')) return;
    if (isMobile()) {
        if (!isAutoScrolling) {
            hideTooltip();
        }
        return;
    }
    clearTimeout(repositionTimer);
    repositionTimer = setTimeout(() => {
        if (!lastAnchor.first.isConnected) { hideTooltip(); return; }
        positionTooltip(measureRange(lastAnchor.first, lastAnchor.last), 'above');
    }, 40);
}
window.addEventListener('scroll', scheduleReposition, { passive: true });
window.addEventListener('resize', scheduleReposition);
