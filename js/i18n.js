/* =============================================================
   LexiRead — Internationalization & Localization (i18n) Engine
   English (en) & Turkish (tr) Full Support
   ============================================================= */

'use strict';

const APP_LANG_KEY = 'lexi.appLang';

const I18N = {
    en: {
        // App / Brand
        appTitle: "LexiRead — Reader & Translator",
        logoReloadTitle: "Reload & Return Home",

        // Header
        openDocument: "Open Document",
        openDocShort: "Open",
        savedWords: "Saved Words",
        savedShort: "Saved",
        apiKey: "API Key",
        toggleThemeDark: "Switch to Dark Theme",
        toggleThemeLight: "Switch to Light Theme",
        toggleThemeSepia: "Switch to Sepia Theme",
        toggleThemeGeneral: "Toggle Theme (Dark / Light / Sepia)",
        appLangBtnTitle: "Dili Değiştir / Change Language (TR / EN)",

        // Left Controls
        zoomIn: "Zoom In (+)",
        zoomOut: "Zoom Out (−)",
        zoomReset: "Reset Zoom (100%)",
        changeLangBtn: "Change Translation Languages",
        typography: "Typography & Layout",
        tableOfContents: "Table of Contents / Chapters",
        prevPage: "Previous Page (K / ▲)",
        nextPage: "Next Page (J / ▼)",

        // Welcome & Hero Card
        dropTitle: "Drop a document here, or tap to choose a file",
        dropSubtitle: "Supports .pdf, .txt, .docx documents",
        dropTitleCompact: "Drop a new file here, or browse (.pdf, .txt, .docx)",
        welcomeHeading: "Welcome to the Reader.",
        welcomeSub: "Please upload a file to begin...",
        welcomeBadge: "Runs entirely in your browser",
        welcomeHeroTitle: "Read & Expand Your Vocabulary",
        welcomeHeroDesc: "Read PDF, DOCX, and TXT documents with instant sentence-aware translation and persistent vocabulary memory.",
        chooseDocumentBtn: "Choose Document",
        orDragDesktop: "or drag & drop a file into the window",
        dropHereTitle: "Drop your document here",
        openNewDocument: "Open Document",
        privacyBadge: "100% Offline & Private • Runs in your browser",

        // Library (Kitaplık)
        myLibrary: "My Library",
        libraryCount: "{count} books",
        openFromDisk: "Open File",
        noBooksInLibrary: "Your library is empty. Upload a document to start reading!",
        deleteBookConfirm: "Remove \"{name}\" from your library?",
        bookDeleted: "Document removed from library.",
        pagesCount: "{count} pages",
        readProgress: "{percent}% read",
        pageProgress: "Page {cur} / {total}",
        lastReadJustNow: "Just now",
        lastReadAgo: "{time} ago",
        resumeBook: "Read",
        bookActionsTitle: "Book Options",
        renameTitle: "Rename Display Title",
        renameTitlePrompt: "Enter a custom display title:",
        titleUpdated: "Title updated.",
        resetProgress: "Reset Reading Progress",
        progressResetConfirm: "Reset reading progress back to the beginning?",
        progressResetSuccess: "Reading progress reset to start.",
        deleteBookAction: "Delete from Library",
        libraryNavBtn: "Library",
        uploadFabTitle: "Open Document",
        renameSaveBtn: "Save",
        renameCancelBtn: "Cancel",

        // Resume reading banner
        resumeText: "You were on",
        resumeSavedPos: "Saved Position",
        resumeBtn: "Resume",

        // Loader messages
        loaderWorking: "Working…",
        loaderValidating: "Validating {ext}…",
        loaderReadingLayer: "Reading text layer — page {cur} / {total}",
        loaderPrepPages: "Preparing page structure {cur} / {total}…",
        loaderRendering: "Rendering document…",
        loaderReadingFile: "Reading {ext} file…",

        // Tooltip & Words
        saveBookmark: "Save to Saved Words & Phrases",
        savedSuccess: "Saved to your list.",
        alreadySaved: "Already saved.",
        savedWordToast: "🔖 Saved \"{orig}\" → \"{tr}\"",
        savedMeaningAdded: "🔖 Added new meaning for \"{orig}\": \"{tr}\"",
        allSavedDeleted: "All saved items deleted.",
        noSavedToCopy: "No saved words to copy.",
        copiedToClipboard: "📋 Copied {count} words (word:translation)! Paste in Cardlyo.",
        exportedJson: "Exported to JSON (cards format).",
        noSavedItems: "No saved items yet.<br/>Tap the ☆ in a tooltip or Middle-Click any word to save it.",
        noMatchingWords: "No saved words match \"<strong>{query}</strong>\"",
        deleteBtn: "Delete",

        // Tooltip Statuses & Errors
        statusQuota: "⏳ Quota exceeded",
        statusAuth: "🔑 API key required",
        statusNetwork: "🔗 Network error",
        statusLang: "⚠ Unsupported pair",
        statusApiError: "⚠ API error",
        statusRateLimit: "⏳ Rate limit",
        statusError: "⚠ Error",
        keyAttentionToast: "{tag}. Please check your API key.",
        noApiKeyToast: "No API key set — tap \"API Key\" to add one.",
        unsupportedFileToast: "Unsupported file type \".{ext}\" — use .txt, .pdf or .docx",
        limitErrorMsg: "Error: Maximum 20 pages or ~40,000 characters allowed.",
        noReadableTextMsg: "No readable text found in this document.",
        alreadyProcessingMsg: "Already processing a document…",
        loadedWithKey: "Loaded \"{name}\" — {src} → {tgt}",
        loadedNoKey: "Loaded \"{name}\" — add an API Key to translate.",

        // API Key Modal
        apiKeyModalTitle: "🔑 Translation API Key",
        activeProvider: "Active: {provider}",
        tabGemini: "Google Gemini",
        tabDeepl: "DeepL API",
        geminiDesc: "Directly uses <strong class=\"text-indigo-300\">Gemini 3.5 Flash-Lite</strong> (low-latency mode). Get a free API key from <a href=\"https://aistudio.google.com/app/apikey\" target=\"_blank\" rel=\"noreferrer\" class=\"text-indigo-400 underline\">Google AI Studio</a>.",
        deeplDesc: "Supports Free &amp; Pro keys. Get a key from <a href=\"https://www.deepl.com/pro#developer\" target=\"_blank\" rel=\"noreferrer\" class=\"text-indigo-400 underline\">DeepL Free / Pro API</a>.",
        keyPlaceholderGemini: "e.g. AIzaSyB...",
        keyPlaceholderDeepl: "e.g. abcd1234...:fx",
        keyHintEmpty: "Please paste a non-empty API key.",
        keysCachedLocally: "Keys are cached locally",
        closeBtn: "Close",
        saveActivateBtn: "Save & Activate",
        keySavedToast: "{prov} API key saved & activated.",

        // Language Modal
        langModalTitle: "🌐 Select Source and Target Language",
        langFrom: "From",
        langTo: "To",
        langSwapTitle: "Swap",
        langHintSame: "Source and target must be different.",
        cancelBtn: "Cancel",
        confirmBtn: "Confirm",

        // PDF Crop Modal
        pdfCropTitle: "✂️ PDF Reading Area & Margins",
        pdfCropDesc: "Drag the top and bottom red exclusion lines directly on the page to exclude headers and footers.",
        excludeHeaderBadge: "Exclude Header:",
        excludeFooterBadge: "Exclude Footer:",
        cropTip: "💡 <strong class=\"text-slate-300\">Tip:</strong> Drag the red badges up and down over the preview",
        noCropBtn: "No Crop (0%)",
        applyOpenBtn: "Apply & Open Document",
        backBtn: "Back",
        cancelTitle: "Cancel",
        langUpdatedToast: "Translation languages updated: {src} → {tgt}",

        // Outline Modal
        outlineTitle: "📑 Table of Contents",
        noOutlineMsg: "No table of contents available for this PDF.",
        untitledChapter: "Untitled Chapter",

        // Typography & Appearance Modal
        typographyTitle: "🔤 Appearance & Layout",
        guiScaleLabel: "Interface Scale (GUI Size)",
        guiScale85: "Compact (85%)",
        guiScale100: "Default (100%)",
        guiScale115: "Large (115%)",
        guiScale130: "Extra Large (130%)",
        guiScaleUpdatedToast: "Interface scale: {scale}%",
        guiScaleSubtitle: "GUI Scale, Fonts & Spacing",
        fontFamilyLabel: "Font Family (TXT / DOCX)",
        fontSerif: "Serif (Georgia)",
        fontSans: "Sans (Modern)",
        fontMono: "Monospace",
        fontDyslexic: "Dyslexic Friendly",
        lineSpacingLabel: "Line Spacing (TXT / DOCX)",
        spacingCompact: "Compact",
        spacingDefault: "Default",
        spacingRelaxed: "Relaxed",
        fontUpdatedToast: "Font updated: {font}",
        spacingUpdatedToast: "Line spacing: {spacing}",

        // Settings & Quick Menu
        settingsTitle: "⚙️ Settings & Preferences",
        themeLabel: "Theme",
        themeDark: "Dark",
        themeLight: "Light",
        themeSepia: "Sepia",
        appLangLabel: "Interface Language",
        configureBtn: "Configure",
        customizeBtn: "Customize",
        quickMenu: "Quick Menu",
        zenMode: "Zen Focus Mode",
        zenModeTitle: "Zen Focus Mode (Z)",
        zenActive: "Zen Mode Active",
        exitZenTitle: "Exit Zen Mode (Z / Esc)",
        moreMenuTitle: "More Options",

        // Saved Words Modal
        savedModalTitle: "🔖 Saved Words & Phrases",
        searchSavedPlaceholder: "Search saved words or translations...",
        deleteAllBtn: "Delete all",
        copyCardlyoBtn: "Copy for Cardlyo",
        exportJsonBtn: "Export JSON",

        // Languages
        lang_en: "English",
        lang_tr: "Turkish",
        lang_es: "Spanish",
        lang_fr: "French",
        lang_de: "German",
        lang_it: "Italian",
        lang_pt: "Portuguese",
        lang_nl: "Dutch",
        lang_sv: "Swedish",
        lang_pl: "Polish",
        lang_da: "Danish",
        lang_fi: "Finnish",
        lang_hu: "Hungarian",
        lang_ro: "Romanian",
        lang_el: "Greek",
        lang_cs: "Czech",
        lang_lt: "Lithuanian",
        lang_lv: "Latvian",
        lang_bg: "Bulgarian",
        lang_uk: "Ukrainian",
        lang_ru: "Russian",
        lang_ja: "Japanese",
        lang_ko: "Korean",
        lang_zh: "Chinese"
    },

    tr: {
        // App / Brand
        appTitle: "LexiRead — Okuyucu & Çevirmen",
        logoReloadTitle: "Yenile & Ana Sayfaya Dön",

        // Header
        openDocument: "Belge Aç",
        openDocShort: "Aç",
        savedWords: "Kayıtlı Kelimeler",
        savedShort: "Kayıtlı",
        apiKey: "API Anahtarı",
        toggleThemeDark: "Koyu Temaya Geç",
        toggleThemeLight: "Açık Temaya Geç",
        toggleThemeSepia: "Sepya Temaya Geç",
        toggleThemeGeneral: "Temayı Değiştir (Koyu / Açık / Sepya)",
        appLangBtnTitle: "Dili Değiştir / Change Language (TR / EN)",

        // Left Controls
        zoomIn: "Yakınlaştır (+)",
        zoomOut: "Uzaklaştır (−)",
        zoomReset: "Yakınlaştırmayı Sıfırla (%100)",
        changeLangBtn: "Çeviri Dillerini Değiştir",
        typography: "Tipografi & Düzen",
        tableOfContents: "İçindekiler / Bölümler",
        prevPage: "Önceki Sayfa (K / ▲)",
        nextPage: "Sonraki Sayfa (J / ▼)",

        // Welcome & Hero Card
        dropTitle: "Bir belgeyi buraya bırakın veya dosya seçmek için dokunun",
        dropSubtitle: ".pdf, .txt, .docx formatlarını destekler",
        dropTitleCompact: "Yeni bir dosya bırakın veya seçin (.pdf, .txt, .docx)",
        welcomeHeading: "Okuyucuya Hoş Geldiniz.",
        welcomeSub: "Başlamak için lütfen bir dosya yükleyin...",
        welcomeBadge: "Tamamen tarayıcınızda çalışır",
        welcomeHeroTitle: "Okuyun & Kelime Dağarcığınızı Geliştirin",
        welcomeHeroDesc: "PDF, DOCX ve TXT belgelerinizi okurken anında çeviri yapın, kelimeleri hafızanıza kaydedin.",
        chooseDocumentBtn: "Belge Seç",
        orDragDesktop: "veya dosyayı pencereye sürükleyin",
        dropHereTitle: "Belgenizi buraya bırakın",
        openNewDocument: "Yeni Belge Aç",
        privacyBadge: "Tamamen Cihazınızda Çalışır • Gizli ve Güvenli",

        // Library (Kitaplık)
        myLibrary: "Kitaplığım",
        libraryCount: "{count} kitap",
        openFromDisk: "Dosya Aç",
        noBooksInLibrary: "Kitaplığınız henüz boş. Okumaya başlamak için bir belge yükleyin!",
        deleteBookConfirm: "\"{name}\" kitaplıktan kaldırılsın mı?",
        bookDeleted: "Belge kitaplıktan kaldırıldı.",
        pagesCount: "{count} sayfa",
        readProgress: "%{percent} okundu",
        pageProgress: "Sayfa {cur} / {total}",
        lastReadJustNow: "Az önce",
        lastReadAgo: "{time} önce",
        resumeBook: "Oku",
        bookActionsTitle: "Kitap İşlemleri",
        renameTitle: "Görünür Başlığı Değiştir",
        renameTitlePrompt: "Bu kitap için yeni bir görünür başlık girin:",
        titleUpdated: "Başlık güncellendi.",
        resetProgress: "Okuma İlerlemesini Sıfırla",
        progressResetConfirm: "Okuma ilerlemesi başa sarılsın mı?",
        progressResetSuccess: "Okuma ilerlemesi sıfırlandı.",
        deleteBookAction: "Kitaplıktan Sil",
        libraryNavBtn: "Kitaplık",
        uploadFabTitle: "Yeni Belge Aç",
        renameSaveBtn: "Kaydet",
        renameCancelBtn: "İptal",

        // Resume reading banner
        resumeText: "Kaldığınız yer:",
        resumeSavedPos: "Kaydedilen Konum",
        resumeBtn: "Devam Et",

        // Loader messages
        loaderWorking: "Çalışıyor…",
        loaderValidating: "{ext} dosyası doğrulanıyor…",
        loaderReadingLayer: "Metin katmanı okunuyor — sayfa {cur} / {total}",
        loaderPrepPages: "Sayfa yapısı hazırlanıyor {cur} / {total}…",
        loaderRendering: "Belge işleniyor…",
        loaderReadingFile: "{ext} dosyası okunuyor…",

        // Tooltip & Words
        saveBookmark: "Kayıtlı Kelimelere & İfadelere Kaydet",
        savedSuccess: "Listenize kaydedildi.",
        alreadySaved: "Zaten kaydedilmiş.",
        savedWordToast: "🔖 \"{orig}\" → \"{tr}\" kaydedildi",
        savedMeaningAdded: "🔖 \"{orig}\" için yeni anlam eklendi: \"{tr}\"",
        allSavedDeleted: "Tüm kayıtlı ögeler silindi.",
        noSavedToCopy: "Kopyalanacak kayıtlı kelime yok.",
        copiedToClipboard: "📋 {count} kelime (kelime:çeviri) kopyalandı! Cardlyo'ya yapıştırın.",
        exportedJson: "JSON formatında dışa aktarıldı.",
        noSavedItems: "Henüz kayıtlı öge yok.<br/>Kaydetmek için kutucuktaki ☆ simgesine tıklayın veya herhangi bir kelimeye fare tekerleğiyle tıklayın.",
        noMatchingWords: "\"<strong>{query}</strong>\" ile eşleşen kayıtlı kelime bulunamadı",
        deleteBtn: "Sil",

        // Tooltip Statuses & Errors
        statusQuota: "⏳ Kota aşıldı",
        statusAuth: "🔑 API anahtarı gerekli",
        statusNetwork: "🔗 Ağ bağlantı hatası",
        statusLang: "⚠ Desteklenmeyen dil çifti",
        statusApiError: "⚠ API hatası",
        statusRateLimit: "⏳ İstek limiti",
        statusError: "⚠ Hata",
        keyAttentionToast: "{tag}. Lütfen API anahtarınızı kontrol edin.",
        noApiKeyToast: "API anahtarı ayarlanmadı — eklemek için \"API Anahtarı\"na tıklayın.",
        unsupportedFileToast: "Desteklenmeyen dosya türü \".{ext}\" — .txt, .pdf veya .docx kullanın",
        limitErrorMsg: "Hata: Maksimum 20 sayfa veya ~40.000 karakter desteklenir.",
        noReadableTextMsg: "Bu belgede okunabilir metin bulunamadı.",
        alreadyProcessingMsg: "Zaten bir belge işleniyor…",
        loadedWithKey: "\"{name}\" yüklendi — {src} → {tgt}",
        loadedNoKey: "\"{name}\" yüklendi — çeviri yapmak için API Anahtarı ekleyin.",

        // API Key Modal
        apiKeyModalTitle: "🔑 Çeviri API Anahtarı",
        activeProvider: "Aktif: {provider}",
        tabGemini: "Google Gemini",
        tabDeepl: "DeepL API",
        geminiDesc: "Doğrudan <strong class=\"text-indigo-300\">Gemini 3.5 Flash-Lite</strong> (düşük gecikmeli mod) kullanır. Ücretsiz API anahtarınızı <a href=\"https://aistudio.google.com/app/apikey\" target=\"_blank\" rel=\"noreferrer\" class=\"text-indigo-400 underline\">Google AI Studio</a>'dan alabilirsiniz.",
        deeplDesc: "Ücretsiz (Free) ve Pro anahtarları destekler. Anahtarınızı <a href=\"https://www.deepl.com/pro#developer\" target=\"_blank\" rel=\"noreferrer\" class=\"text-indigo-400 underline\">DeepL Free / Pro API</a>'den alabilirsiniz.",
        keyPlaceholderGemini: "örn. AIzaSyB...",
        keyPlaceholderDeepl: "örn. abcd1234...:fx",
        keyHintEmpty: "Lütfen geçerli bir API anahtarı girin.",
        keysCachedLocally: "Anahtarlar tarayıcınızda saklanır",
        closeBtn: "Kapat",
        saveActivateBtn: "Kaydet & Etkinleştir",
        keySavedToast: "{prov} API anahtarı kaydedildi ve etkinleştirildi.",

        // Language Modal
        langModalTitle: "🌐 Kaynak ve Hedef Dili Seçin",
        langFrom: "Kaynak",
        langTo: "Hedef",
        langSwapTitle: "Dilleri Değiştir",
        langHintSame: "Kaynak ve hedef diller birbirinden farklı olmalıdır.",
        cancelBtn: "İptal",
        confirmBtn: "Onayla",

        // PDF Crop Modal
        pdfCropTitle: "✂️ PDF Okuma Alanı & Kenar Boşlukları",
        pdfCropDesc: "Üst bilgi (header) ve alt bilgileri (footer) dışlamak için kırmızı çizgileri doğrudan sayfa üzerinde yukarı/aşağı sürükleyin.",
        excludeHeaderBadge: "Üst Bilgiyi Dışla:",
        excludeFooterBadge: "Alt Bilgiyi Dışla:",
        cropTip: "💡 <strong class=\"text-slate-300\">İpucu:</strong> Önizleme üzerindeki kırmızı etiketleri yukarı/aşağı sürükleyin",
        noCropBtn: "Kırpma Yok (%0)",
        applyOpenBtn: "Uygula & Belgeyi Aç",
        backBtn: "Geri",
        cancelTitle: "İptal",
        langUpdatedToast: "Çeviri dilleri güncellendi: {src} → {tgt}",

        // Outline Modal
        outlineTitle: "📑 İçindekiler Tablosu",
        noOutlineMsg: "Bu PDF için içindekiler tablosu bulunamadı.",
        untitledChapter: "Başlıksız Bölüm",

        // Typography & Appearance Modal
        typographyTitle: "🔤 Görünüm & Düzen",
        guiScaleLabel: "Arayüz Boyutu (GUI Ölçeği)",
        guiScale85: "Küçük (%85)",
        guiScale100: "Standart (%100)",
        guiScale115: "Büyük (%115)",
        guiScale130: "Ekstra Büyük (%130)",
        guiScaleUpdatedToast: "Arayüz boyutu: %{scale}",
        guiScaleSubtitle: "Arayüz Boyutu, Yazı Tipi & Boşluklar",
        fontFamilyLabel: "Yazı Tipi Ailesi (TXT / DOCX)",
        fontSerif: "Serif (Georgia)",
        fontSans: "Sans (Modern)",
        fontMono: "Sabit Genişlikli (Mono)",
        fontDyslexic: "Disleksi Dostu",
        lineSpacingLabel: "Satır Aralığı (TXT / DOCX)",
        spacingCompact: "Sıkı",
        spacingDefault: "Varsayılan",
        spacingRelaxed: "Geniş",
        fontUpdatedToast: "Yazı tipi güncellendi: {font}",
        spacingUpdatedToast: "Satır aralığı: {spacing}",

        // Settings & Quick Menu
        settingsTitle: "⚙️ Ayarlar & Tercihler",
        themeLabel: "Tema",
        themeDark: "Karanlık",
        themeLight: "Aydınlık",
        themeSepia: "Sepya",
        appLangLabel: "Arayüz Dili",
        configureBtn: "Yapılandır",
        customizeBtn: "Özelleştir",
        quickMenu: "Hızlı Menü",
        zenMode: "Zen Odak Modu",
        zenModeTitle: "Zen Odak Modu (Z)",
        zenActive: "Zen Modu Aktif",
        exitZenTitle: "Zen Modundan Çık (Z / Esc)",
        moreMenuTitle: "Daha Fazla Seçenek",

        // Saved Words Modal
        savedModalTitle: "🔖 Kayıtlı Kelimeler & İfadeler",
        searchSavedPlaceholder: "Kayıtlı kelimelerde veya çevirilerde ara...",
        deleteAllBtn: "Tümünü sil",
        copyCardlyoBtn: "Cardlyo için Kopyala",
        exportJsonBtn: "JSON Dışa Aktar",

        // Languages
        lang_en: "İngilizce",
        lang_tr: "Türkçe",
        lang_es: "İspanyolca",
        lang_fr: "Fransızca",
        lang_de: "Almanca",
        lang_it: "İtalyanca",
        lang_pt: "Portekizce",
        lang_nl: "Felemenkçe",
        lang_sv: "İsveççe",
        lang_pl: "Lehçe",
        lang_da: "Danca",
        lang_fi: "Fince",
        lang_hu: "Macarca",
        lang_ro: "Romence",
        lang_el: "Yunanca",
        lang_cs: "Çekçe",
        lang_lt: "Litvanca",
        lang_lv: "Letonca",
        lang_bg: "Bulgarca",
        lang_uk: "Ukraynaca",
        lang_ru: "Rusça",
        lang_ja: "Japonca",
        lang_ko: "Korece",
        lang_zh: "Çince"
    }
};

let currentAppLang = (() => {
    const saved = localStorage.getItem(APP_LANG_KEY);
    if (saved === 'en' || saved === 'tr') return saved;
    return (navigator.language && navigator.language.startsWith('tr')) ? 'tr' : 'en';
})();

function t(key, params = {}) {
    const dict = I18N[currentAppLang] || I18N.en;
    let str = dict[key] || I18N.en[key] || key;
    for (const [k, v] of Object.entries(params)) {
        str = str.replaceAll(`{${k}}`, v);
    }
    return str;
}

function getLocalizedLangName(code) {
    const key = `lang_${code}`;
    const dict = I18N[currentAppLang] || I18N.en;
    return dict[key] || I18N.en[key] || code;
}

function getAppLanguage() {
    return currentAppLang || 'en';
}

function setAppLanguage(lang) {
    if (lang !== 'en' && lang !== 'tr') return;
    currentAppLang = lang;
    localStorage.setItem(APP_LANG_KEY, lang);
    document.documentElement.lang = lang;
    applyLocalization();
}

function toggleAppLanguage() {
    setAppLanguage(currentAppLang === 'tr' ? 'en' : 'tr');
}

function applyLocalization() {
    document.title = t('appTitle');

    // Update all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.innerHTML = t(key);
    });

    // Update all elements with data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.title = t(key);
    });

    // Update all elements with data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.placeholder = t(key);
    });

    // Update app language button text & title
    const appLangBtn = $('appLangBtn');
    const appLangLabel = $('appLangLabel');
    if (appLangLabel) {
        appLangLabel.textContent = currentAppLang === 'tr' ? 'TR' : 'EN';
    }
    if (appLangBtn) {
        appLangBtn.title = t('appLangBtnTitle');
    }

    // Refresh translation language dropdowns (From / To)
    if (typeof langSrc !== 'undefined' && langSrc && typeof langTgt !== 'undefined' && langTgt) {
        const curSrc = langSrc.value || currentSrc;
        const curTgt = langTgt.value || currentTgt;
        
        [langSrc, langTgt].forEach(sel => {
            sel.innerHTML = LANGS.map(l => `<option value="${l.code}">${getLocalizedLangName(l.code)}</option>`).join('');
        });

        langSrc.value = curSrc;
        langTgt.value = curTgt;
    }

    // Update active provider badge in keyModal
    if (typeof updateKeyUI === 'function') {
        updateKeyUI();
    }

    // Update Crop preview text if modal exists
    if (typeof updateCropOverlays === 'function') {
        updateCropOverlays();
    }

    // Re-render saved list if open
    if (typeof renderSavedList === 'function' && typeof savedSearchInput !== 'undefined') {
        renderSavedList(savedSearchInput.value.trim());
    }

    // Re-render library cards if library is visible
    if (typeof renderLibrary === 'function' && typeof librarySection !== 'undefined' && librarySection && !librarySection.classList.contains('hidden')) {
        renderLibrary();
    }
}
