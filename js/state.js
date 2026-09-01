/* =============================================================
   LexiRead — State, Constants & Global DOM Helpers
   ============================================================= */

'use strict';

// 1. CONFIG & STORAGE KEYS
const DEEPL_ENDPOINT       = '/translate';
const KEY_STORAGE_KEY      = 'lexi.deeplKey';
const SAVED_KEY            = 'lexi.savedItems';
const SRC_KEY              = 'lexi.src';
const TGT_KEY              = 'lexi.tgt';
const PROVIDER_KEY         = 'lexi.apiProvider';
const THEME_KEY            = 'lexi.theme';
const TYPO_FONT_KEY        = 'lexi.fontFamily';
const TYPO_LH_KEY          = 'lexi.lineHeight';
const CROP_TOP_KEY         = 'lexi.cropTop';
const CROP_BTM_KEY         = 'lexi.cropBottom';

const BG_INTERVAL_MS       = 350;
const API_RETRIES          = 2;
const API_MAX_CHUNK        = 480;
const MAX_ONDEMAND_CHARS   = 480;
const OBSERVER_ROOT_MARGIN = '800px';

const MAX_PDF_DOCX_PAGES   = 20;
const MAX_TXT_CHARS        = 40000;
const MAX_TXT_WORDS        = 6000;
const LIMIT_ERROR_MSG      = 'Error: Maximum 20 pages or ~40,000 characters allowed.';

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// 2. SUPPORTED LANGUAGES
const LANGS = [
    {code:'en',name:'English'},{code:'es',name:'Spanish'},{code:'fr',name:'French'},
    {code:'de',name:'German'},{code:'it',name:'Italian'},{code:'pt',name:'Portuguese'},
    {code:'nl',name:'Dutch'},{code:'sv',name:'Swedish'},{code:'pl',name:'Polish'},
    {code:'da',name:'Danish'},{code:'fi',name:'Finnish'},{code:'hu',name:'Hungarian'},
    {code:'ro',name:'Romanian'},{code:'el',name:'Greek'},{code:'cs',name:'Czech'},
    {code:'lt',name:'Lithuanian'},{code:'lv',name:'Latvian'},{code:'bg',name:'Bulgarian'},
    {code:'tr',name:'Turkish'},{code:'uk',name:'Ukrainian'},{code:'ru',name:'Russian'},
    {code:'ja',name:'Japanese'},{code:'ko',name:'Korean'},{code:'zh',name:'Chinese'}
];
const LANG_BY_CODE = Object.fromEntries(LANGS.map(l => [l.code, l]));
const langName = c => (typeof getLocalizedLangName === 'function' ? getLocalizedLangName(c) : (LANG_BY_CODE[c] ? LANG_BY_CODE[c].name : c));
const srcCode = c => String(c).toUpperCase();
const tgtCode = c => ({ en:'EN-US', pt:'PT-PT' }[c] || String(c).toUpperCase());

let currentSrc = LANGS.some(l => l.code === localStorage.getItem(SRC_KEY)) ? localStorage.getItem(SRC_KEY) : 'es';
let currentTgt = LANGS.some(l => l.code === localStorage.getItem(TGT_KEY)) ? localStorage.getItem(TGT_KEY) : 'en';

// 3. DOM SHORTCUTS & ELEMENT BINDINGS
const $ = id => document.getElementById(id);

const fileInput           = $('fileInput');
const dropZone            = $('dropZone') || $('welcomeState');
const librarySection      = $('librarySection');
const libraryGrid         = $('libraryGrid');
const libraryCountBadge   = $('libraryCountBadge');
const libraryUploadBtn    = $('libraryUploadBtn');
const welcomeChooseFileBtn= $('welcomeChooseFileBtn');
const mobileUploadFab     = $('mobileUploadFab');
const globalDragOverlay   = $('globalDragOverlay');
const loader              = $('loader');
const loaderText          = $('loaderText');
const welcomeState        = $('welcomeState');
const readerShell         = $('readerShell');
const reader              = $('reader');
const keyBtn              = $('keyBtn');
const keyDot              = $('keyDot');
const headerDocBadge      = $('headerDocBadge');
const zenModeBtn          = $('zenModeBtn');
const zenExitBar          = $('zenExitBar');
const zenExitBtn          = $('zenExitBtn');

const savedBtn            = $('savedBtn');
const savedCount          = $('savedCount');
const tooltip             = $('tooltip');
const tooltipBody         = $('tooltipBody');
const tooltipSave         = $('tooltipSave');
const tooltipClose        = $('tooltipClose');
const toastHost           = $('toastHost');
const logoBtn             = $('logoBtn');
const headerUploadBtn     = $('headerUploadBtn');
const leftControlWidget   = $('leftControlWidget');

const settingsBtn         = $('settingsBtn');
const settingsModal       = $('settingsModal');
const settingsClose       = $('settingsClose');
const settingsKeyStatus   = $('settingsKeyStatus');
const settingsOpenKeyBtn  = $('settingsOpenKeyBtn');
const settingsOpenTypoBtn = $('settingsOpenTypoBtn');

const zoomInBtn           = $('zoomInBtn');
const zoomOutBtn          = $('zoomOutBtn');
const zoomSlider          = $('zoomSlider');
const zoomResetBtn        = $('zoomResetBtn');
const zoomLabel           = $('zoomLabel');

const pdfNavSection       = $('pdfNavSection');
const navPrevPage         = $('navPrevPage');
const navNextPage         = $('navNextPage');
const navCurPage          = $('navCurPage');
const navTotalPages       = $('navTotalPages');

const keyModal            = $('keyModal');
const keyInput            = $('keyInput');
const keyHint             = $('keyHint');
const keySaveBtn          = $('keySave');
const keyCancelBtn        = $('keyCancel');
const keyCloseBtn         = $('keyCloseBtn');
const tabGemini           = $('tabGemini');
const tabDeepl            = $('tabDeepl');
const geminiDescBlock     = $('geminiDescBlock');
const deeplDescBlock      = $('deeplDescBlock');
const activeProviderBadge = $('activeProviderBadge');

const langModal           = $('langModal');
const langSrc             = $('langSrc');
const langTgt             = $('langTgt');
const langSwap            = $('langSwap');
const langConfirm         = $('langConfirm');
const langCancel          = $('langCancel');
const langFileName        = $('langFileName');
const langHint            = $('langHint');

const savedModal          = $('savedModal');
const savedList           = $('savedList');
const savedClose          = $('savedClose');
const savedExport         = $('savedExport');
const savedClear          = $('savedClear');
const savedSearchInput    = $('savedSearchInput');
const savedSyncCardlyo    = $('savedSyncCardlyo');

const navOutlineBtn       = $('navOutlineBtn');
const outlineModal        = $('outlineModal');
const outlineClose        = $('outlineClose');
const outlineList         = $('outlineList');

const langChangeBtn       = $('langChangeBtn');
const typographyBtn       = $('typographyBtn');
const typographyModal     = $('typographyModal');
const typographyClose     = $('typographyClose');

// Mobile Bottom Reading & Action Bar Elements
const bottomMobileBar      = $('bottomMobileBar');
const mobilePdfNav         = $('mobilePdfNav');
const mobileNavPrevPage    = $('mobileNavPrevPage');
const mobileNavNextPage    = $('mobileNavNextPage');
const mobileNavCurPage     = $('mobileNavCurPage');
const mobileNavTotalPages  = $('mobileNavTotalPages');

const mobileZoomOutBtn     = $('mobileZoomOutBtn');
const mobileZoomResetBtn   = $('mobileZoomResetBtn');
const mobileZoomLabel      = $('mobileZoomLabel');
const mobileZoomInBtn      = $('mobileZoomInBtn');

const mobileLibraryBtn    = $('mobileLibraryBtn');
const mobileLangChangeBtn  = $('mobileLangChangeBtn');
const mobileMoreBtn        = $('mobileMoreBtn');
const mobileMoreSheet      = $('mobileMoreSheet');
const mobileMoreClose      = $('mobileMoreClose');
const moreTypoBtn          = $('moreTypoBtn');
const moreOutlineBtn       = $('moreOutlineBtn');
const moreZenBtn           = $('moreZenBtn');
const mobileDocUploadBtn   = $('mobileDocUploadBtn');

const bookActionModal      = $('bookActionModal');
const bookActionDocName    = $('bookActionDocName');
const bookActionClose      = $('bookActionClose');
const bookActionRenameBtn  = $('bookActionRenameBtn');
const bookActionResetBtn   = $('bookActionResetBtn');
const bookActionDeleteBtn  = $('bookActionDeleteBtn');

const bookRenameModal      = $('bookRenameModal');
const bookRenameCloseBtn   = $('bookRenameCloseBtn');
const bookRenameInput      = $('bookRenameInput');
const bookRenameCancelBtn  = $('bookRenameCancelBtn');
const bookRenameSaveBtn    = $('bookRenameSaveBtn');

function isMobile() {
    return window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth < 1024);
}

const resumeBanner        = $('resumeBanner');
const resumePageNum       = $('resumePageNum');
const resumeJumpBtn       = $('resumeJumpBtn');
const resumeDismissBtn    = $('resumeDismissBtn');

const pdfCropModal        = $('pdfCropModal');
const cropPreviewContainer= $('cropPreviewContainer');
const cropCanvas          = $('cropCanvas');
const cropTopOverlay      = $('cropTopOverlay');
const cropBottomOverlay   = $('cropBottomOverlay');
const cropTopHandle       = $('cropTopHandle');
const cropBottomHandle    = $('cropBottomHandle');
const cropTopVal          = $('cropTopVal');
const cropBottomVal       = $('cropBottomVal');
const cropPrevPage        = $('cropPrevPage');
const cropNextPage        = $('cropNextPage');
const cropPageIndicator   = $('cropPageIndicator');
const cropConfirmBtn      = $('cropConfirmBtn');
const cropSkipBtn         = $('cropSkipBtn');
const cropBackBtn         = $('cropBackBtn');
const cropCloseBtn        = $('cropCloseBtn');

// Initialize Language Dropdowns
[langSrc, langTgt].forEach(sel => {
    if (sel) sel.innerHTML = LANGS.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
});

// 4. UTILITIES & HELPERS
function showToast(message, type = 'error', lifeMs) {
    const palette = {
        error:   'bg-red-900/95 border-red-500 text-red-50',
        warn:    'bg-amber-900/95 border-amber-500 text-amber-50',
        info:    'bg-indigo-900/95 border-indigo-500 text-indigo-50',
        success: 'bg-emerald-900/95 border-emerald-500 text-emerald-50'
    };
    const el = document.createElement('div');
    el.className = `toast rounded-md border px-4 py-2.5 text-sm shadow-xl ${palette[type] || palette.info}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    toastHost.appendChild(el);
    const life = lifeMs != null ? lifeMs : (type === 'error' ? 6500 : 3400);
    setTimeout(() => {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'translateY(-6px)';
        setTimeout(() => el.remove(), 320);
    }, life);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const mkErr = (msg, kind) => Object.assign(new Error(msg), { kind });

const getProvider = () => localStorage.getItem(PROVIDER_KEY) || 'gemini';
const getProviderKey = (provider) => {
    let k = (localStorage.getItem('lexi.key.' + provider) || '').trim();
    if (!k && provider === 'deepl') {
        k = (localStorage.getItem('lexi.deeplKey') || '').trim();
    }
    return k;
};
const setProviderKey = (provider, val) => {
    const clean = (val || '').trim();
    localStorage.setItem('lexi.key.' + provider, clean);
    if (provider === 'deepl') {
        localStorage.setItem('lexi.deeplKey', clean);
    }
};
const getKey = () => getProviderKey(getProvider());

const normalizeExt = name => {
    const parts = String(name || '').split('.');
    const ext = parts.length > 1 ? parts.pop() : '';
    return ext.replace(/[^a-zA-Z0-9]/g, '').toLocaleLowerCase('en-US');
};
const EXT_LABELS = { txt:'TXT', pdf:'PDF', docx:'DOCX' };
const labelExt = e => EXT_LABELS[e] || e;

let navHistoryDepth = 0;
let isPoppingNavState = false;

function pushNavState(type = 'view') {
    if (isPoppingNavState) return;
    try {
        history.pushState({ lexiread: true, type, depth: ++navHistoryDepth }, '');
    } catch (_) {}
}

function openModal(m) {
    if (!m) return;
    if (m.classList.contains('hidden') || m.style.display === 'none') {
        pushNavState('modal');
    }
    m.classList.remove('hidden');
    m.classList.add('flex');
    m.style.display = 'flex';
}
function closeModal(m) {
    if (!m) return;
    m.classList.add('hidden');
    m.classList.remove('flex');
    m.style.display = 'none';
}

window.openModal = openModal;
window.closeModal = closeModal;

function genRandomId(prefix = 'id') {
    return prefix + '_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// 5. RUNTIME STATE
let currentZoomRatio = 1.0;
let currentParsedDoc = null;
let currentDocKey = null;
let currentDocKind = null;
let pdfPageObserver = null;

let segments = [], tokenSegMap = [];
const contextMap = new Map();
let wordSpans = [], wordIndex = new Map(), totalTokens = 0;
let pipelineGen = 0, pipelineRunning = false;
let sentenceCache = new Map();
let ondemandCache = new Map();

let tooltipGen = 0;
let tooltipData = null;
let lastAnchor = null;
