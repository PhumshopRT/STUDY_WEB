/**
 * 📚 StudyVault — Clean Production Studio Engine
 * - Airy Daylight Porcelain (Default) & Luminous Midnight Navy (Dark Mode)
 * - Fast Subject CRUD (Code + Title only) & Visible Delete + 6s Undo
 * - Subject-Locked Upload Flow (Links, HTML Games/Charts/Simulations, PDF/Image Slides)
 * - GoodNotes-style PDF Studio (Pen, Highlighter, Eraser, Undo/Redo, IndexedDB, Annotated PDF Export)
 */

document.addEventListener("DOMContentLoaded", () => {
  // App State
  let currentCategory = "ทั้งหมด";
  let selectedHomeSubjectId = "__ALL__";
  let homeViewMode = "subjects"; // 'subjects' (Step 1: Subjects) | 'feed' (all newest topics)
  let searchQuery = "";
  let activeSubjectId = null;
  let activeTopicId = null;
  let activeLinkId = null;
  let activeSlideId = null;
  let isSplitMode = false;
  let isSlideExpanded = false;
  let isSwappedSides = false;
  let splitLeftPct = 50;
  let currentImageSlideIdx = 0;
  let currentImageSlideUrls = [];
  let imageZoom = 1;
  let iframeTimeoutHandle = null;

  // Modal Modes
  let topicLinkMode = "html"; // 'html' | 'url' | 'none'
  let topicSlideMode = "pdf"; // 'pdf' | 'images' | 'url' | 'none'
  let lnkPairMode = "none";

  const blobUrlCache = new Map();
  const pdfThumbCache = new Map();

  // Storage Keys
  const LS_THEME = "studyvault_theme_v3";
  const LS_FAVORITES = "studyvault_favorites";
  const LS_CUSTOM_SUBJECTS = "studyvault_custom_subjects";
  const LS_DELETED_SUBJECTS = "studyvault_deleted_subjects";
  const LS_CUSTOM_TOPICS = "studyvault_custom_topics";
  const LS_DELETED_TOPICS = "studyvault_deleted_topics";
  const LS_TOPIC_OVERRIDES = "studyvault_topic_overrides";
  const LS_CUSTOM_LINKS = "studyvault_custom_links";
  const LS_DELETED_LINKS = "studyvault_deleted_links";
  const LS_LINK_OVERRIDES = "studyvault_link_overrides";
  const LS_CUSTOM_SLIDES = "studyvault_custom_slides";
  const LS_DELETED_SLIDES = "studyvault_deleted_slides";
  const LS_SLIDE_OVERRIDES = "studyvault_slide_overrides";
  const LS_SPLIT_PCT = "studyvault_split_pct";
  const LS_SWAP_SIDES = "studyvault_swap_sides";
  const LS_LOCKED_SUBJECT = "studyvault_locked_subject";

  const KNOWN_FRAME_RESTRICTED = [
    "chat.qwen.ai",
    "qwen.ai",
    "chatgpt.com",
    "claude.ai",
    "notion.so",
    "github.com"
  ];

  function isLikelyRestrictedUrl(url) {
    if (!url) return false;
    return KNOWN_FRAME_RESTRICTED.some(domain => url.includes(domain));
  }

  function loadJSON(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch {
      return fallback;
    }
  }

  let customSubjects = loadJSON(LS_CUSTOM_SUBJECTS, []);
  let deletedSubjectIds = new Set(loadJSON(LS_DELETED_SUBJECTS, []));
  let customTopicsMap = loadJSON(LS_CUSTOM_TOPICS, {});
  let deletedTopicIds = new Set(loadJSON(LS_DELETED_TOPICS, []));
  let topicOverrides = loadJSON(LS_TOPIC_OVERRIDES, {});
  let customLinksMap = loadJSON(LS_CUSTOM_LINKS, {});
  let deletedLinkIds = new Set(loadJSON(LS_DELETED_LINKS, []));
  let linkOverrides = loadJSON(LS_LINK_OVERRIDES, {});
  let customSlidesMap = loadJSON(LS_CUSTOM_SLIDES, {});
  let deletedSlideIds = new Set(loadJSON(LS_DELETED_SLIDES, []));
  let slideOverrides = loadJSON(LS_SLIDE_OVERRIDES, {});
  let favorites = new Set(loadJSON(LS_FAVORITES, []));

  splitLeftPct = loadJSON(LS_SPLIT_PCT, 50);
  isSwappedSides = loadJSON(LS_SWAP_SIDES, false);
  let lockedSubjectId = localStorage.getItem(LS_LOCKED_SUBJECT) || "";

  function getPendingSyncCount() {
    let count = customSubjects.length + deletedSubjectIds.size + deletedTopicIds.size +
      deletedLinkIds.size + deletedSlideIds.size +
      Object.keys(topicOverrides).length + Object.keys(linkOverrides).length + Object.keys(slideOverrides).length;
    Object.values(customTopicsMap).forEach(arr => { count += Array.isArray(arr) ? arr.length : 0; });
    Object.values(customLinksMap).forEach(arr => { count += Array.isArray(arr) ? arr.length : 0; });
    Object.values(customSlidesMap).forEach(arr => { count += Array.isArray(arr) ? arr.length : 0; });
    return count;
  }

  function saveState() {
    localStorage.setItem(LS_CUSTOM_SUBJECTS, JSON.stringify(customSubjects));
    localStorage.setItem(LS_DELETED_SUBJECTS, JSON.stringify([...deletedSubjectIds]));
    localStorage.setItem(LS_CUSTOM_TOPICS, JSON.stringify(customTopicsMap));
    localStorage.setItem(LS_DELETED_TOPICS, JSON.stringify([...deletedTopicIds]));
    localStorage.setItem(LS_TOPIC_OVERRIDES, JSON.stringify(topicOverrides));
    localStorage.setItem(LS_CUSTOM_LINKS, JSON.stringify(customLinksMap));
    localStorage.setItem(LS_DELETED_LINKS, JSON.stringify([...deletedLinkIds]));
    localStorage.setItem(LS_LINK_OVERRIDES, JSON.stringify(linkOverrides));
    localStorage.setItem(LS_CUSTOM_SLIDES, JSON.stringify(customSlidesMap));
    localStorage.setItem(LS_DELETED_SLIDES, JSON.stringify([...deletedSlideIds]));
    localStorage.setItem(LS_SLIDE_OVERRIDES, JSON.stringify(slideOverrides));
    localStorage.setItem(LS_FAVORITES, JSON.stringify([...favorites]));
    if (typeof syncAdminUI === "function" && typeof adminNavBtn !== "undefined" && adminNavBtn) {
      syncAdminUI();
    }
  }

  let sharedBaseSubjects = typeof SUBJECTS_DATA !== "undefined" ? SUBJECTS_DATA : [];

  function getItemSortTimestamp(item) {
    if (!item) return 0;
    if (typeof item.createdAt === "number" && item.createdAt > 0) return item.createdAt;
    const m = String(item.id || "").match(/(\d{10,})/);
    if (m) return Number(m[1]);
    const parsed = Date.parse(item.updatedAt || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function normalizeTopicMatchInfo(text) {
    const raw = String(text || "").toLowerCase();
    const chapMatch = raw.match(/^\s*0*(\d{1,3})(?=\s*[-._:)\]]|\s|$)|(?:บท(?:ที่)?|เรื่อง(?:ที่)?|chapter|chap|lec(?:ture)?|part|topic)\s*0*(\d{1,3})\b/i);
    const chapter = chapMatch ? Number(chapMatch[1] || chapMatch[2]) : null;
    const stop = new Set(["a", "an", "the", "and", "of", "in", "on", "to", "for", "with", "english", "thai", "slides", "slide", "pdf", "html", "summary", "interactive", "v1", "v2", "2020", "2021", "2022", "2023", "2024", "2025", "2026", "เรื่อง", "บท", "บทที่", "สไลด์", "สรุป", "เรื่องที่"]);
    const parts = raw
      .replace(/x[\s-]?ray/g, "xray")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .map(w => (/^\d+$/.test(w) ? String(Number(w)) : w))
      .filter(w => w.length >= 2 && !stop.has(w));
    return { chapter, tokens: new Set(parts) };
  }

  function pairLegacyLinksAndSlides(links, slides) {
    const usedSlideIds = new Set();
    const pairsByLinkId = new Map();

    for (const link of links) {
      if (link.pairedSlideId && !usedSlideIds.has(link.pairedSlideId)) {
        const sl = slides.find(x => x.id === link.pairedSlideId);
        if (sl) {
          pairsByLinkId.set(link.id, sl);
          usedSlideIds.add(sl.id);
        }
      }
    }

    const singlePairEligible = links.length === 1 && slides.length === 1;
    const candidates = [];
    for (const link of links) {
      if (pairsByLinkId.has(link.id) || link.unpairedAuto) continue;
      const lInfo = normalizeTopicMatchInfo(link.title);
      for (const sl of slides) {
        if (usedSlideIds.has(sl.id) || sl.unpairedAuto) continue;
        const sInfo = normalizeTopicMatchInfo(sl.title);
        if (lInfo.chapter !== null && sInfo.chapter !== null && lInfo.chapter !== sInfo.chapter) continue;

        let shared = 0;
        lInfo.tokens.forEach(t => { if (sInfo.tokens.has(t)) shared++; });
        const sameChap = lInfo.chapter !== null && lInfo.chapter === sInfo.chapter;
        const strongMatch = shared >= 2 || (shared >= 1 && sameChap) || singlePairEligible;
        if (strongMatch) {
          const score = shared * 10 + (sameChap ? 6 : 0) + (singlePairEligible ? 1 : 0);
          candidates.push({ linkId: link.id, slide: sl, score });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const cand of candidates) {
      if (pairsByLinkId.has(cand.linkId) || usedSlideIds.has(cand.slide.id)) continue;
      pairsByLinkId.set(cand.linkId, cand.slide);
      usedSlideIds.add(cand.slide.id);
    }

    const topics = [];
    links.forEach((link, idx) => {
      const sl = pairsByLinkId.get(link.id) || null;
      const lTs = getItemSortTimestamp(link) || (1000 - idx);
      const sTs = sl ? (getItemSortTimestamp(sl) || (1000 - idx)) : 0;
      const topId = `legtop-${link.id}`;
      topics.push({
        id: topId,
        title: link.title,
        subtitle: link.subtitle || "",
        updatedAt: link.updatedAt || sl?.updatedAt || "",
        createdAt: Math.max(lTs, sTs),
        link,
        slides: sl ? [sl] : [],
        isLegacy: true,
        _legacyLinkId: link.id,
        _legacySlideIds: sl ? [sl.id] : []
      });
    });

    slides.forEach((sl, idx) => {
      if (usedSlideIds.has(sl.id)) return;
      const sTs = getItemSortTimestamp(sl) || (1000 - idx);
      topics.push({
        id: `legtop-${sl.id}`,
        title: sl.title,
        subtitle: "",
        updatedAt: sl.updatedAt || "",
        createdAt: sTs,
        link: null,
        slides: [sl],
        isLegacy: true,
        _legacyLinkId: null,
        _legacySlideIds: [sl.id]
      });
    });

    return topics;
  }

  function getMergedSubjects() {
    const subMap = new Map();
    [...sharedBaseSubjects, ...customSubjects].forEach(s => {
      if (!deletedSubjectIds.has(s.id)) subMap.set(s.id, s);
    });
    const base = [...customSubjects.filter(s => !deletedSubjectIds.has(s.id)), ...sharedBaseSubjects.filter(s => !deletedSubjectIds.has(s.id) && !customSubjects.some(c => c.id === s.id))];

    return base.map(sub => {
      // Native Topics (from customTopicsMap + sub.topics, deduplicated by id)
      const nativeMap = new Map();
      const baseTopics = Array.isArray(sub.topics) ? sub.topics : [];
      const customTopics = Array.isArray(customTopicsMap[sub.id]) ? customTopicsMap[sub.id] : [];
      [...customTopics, ...baseTopics].forEach(t => {
        if (!t || deletedTopicIds.has(t.id) || nativeMap.has(t.id)) return;
        const ov = topicOverrides[t.id] || null;
        const mergedT = ov ? { ...t, ...ov } : { ...t };
        let cleanLink = mergedT.link && !deletedLinkIds.has(mergedT.link.id)
          ? (linkOverrides[mergedT.link.id] ? { ...mergedT.link, ...linkOverrides[mergedT.link.id] } : { ...mergedT.link })
          : null;
        const cleanSlides = (Array.isArray(mergedT.slides) ? mergedT.slides : [])
          .filter(sl => sl && !deletedSlideIds.has(sl.id))
          .map(sl => (slideOverrides[sl.id] ? { ...sl, ...slideOverrides[sl.id] } : { ...sl }));
        nativeMap.set(mergedT.id, { ...mergedT, link: cleanLink, slides: cleanSlides });
      });

      // Legacy Links & Slides (automatically organized into Topics while preserving IDs!)
      const extraLinks = customLinksMap[sub.id] || [];
      const baseLinks = Array.isArray(sub.links) ? sub.links : [];
      const mergedLegacyLinks = [...extraLinks, ...baseLinks]
        .filter(l => l && !deletedLinkIds.has(l.id))
        .map(l => (linkOverrides[l.id] ? { ...l, ...linkOverrides[l.id] } : l));

      const extraSlides = customSlidesMap[sub.id] || [];
      const baseSlides = Array.isArray(sub.slides) ? sub.slides : [];
      const mergedLegacySlides = [...extraSlides, ...baseSlides]
        .filter(sl => sl && !deletedSlideIds.has(sl.id))
        .map(sl => (slideOverrides[sl.id] ? { ...sl, ...slideOverrides[sl.id] } : sl));

      const legacyTopics = pairLegacyLinksAndSlides(mergedLegacyLinks, mergedLegacySlides)
        .filter(t => !deletedTopicIds.has(t.id) && !nativeMap.has(t.id))
        .map(t => (topicOverrides[t.id] ? { ...t, ...topicOverrides[t.id] } : t));

      const topics = [...nativeMap.values(), ...legacyTopics];
      const links = topics.map(t => t.link).filter(Boolean);
      const slides = topics.flatMap(t => t.slides || []);

      return { ...sub, topics, links, slides };
    });
  }

  let allSubjects = getMergedSubjects();

  // DOM References
  const htmlRoot = document.documentElement;
  const mainTopbar = document.getElementById("main-topbar");
  const mainFooter = document.getElementById("main-footer");
  const viewHome = document.getElementById("view-home");
  const viewSubject = document.getElementById("view-subject");
  const subjectsGrid = document.getElementById("subjects-grid");
  const categoryTabsRail = document.getElementById("category-tabs-rail");
  const categoryThumb = document.getElementById("category-thumb");
  const subjectTabsRail = document.getElementById("subject-tabs-rail");
  const selectedSubjectBanner = document.getElementById("selected-subject-banner");
  const homeViewModeGroup = document.getElementById("home-view-mode-group");
  const homeModeFeedBtn = document.getElementById("home-mode-feed");
  const homeModeSubjectsBtn = document.getElementById("home-mode-subjects");
  const searchInput = document.getElementById("search-input");
  const searchInputMobile = document.getElementById("search-input-mobile");

  const statSubjects = document.getElementById("stat-subjects");
  const statLinks = document.getElementById("stat-links");
  const statSlides = document.getElementById("stat-slides");
  const statFavorites = document.getElementById("stat-favorites");

  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeIcon = document.getElementById("theme-icon");
  const themeLabel = document.getElementById("theme-label");

  const wsIcon = document.getElementById("ws-subject-icon");
  const wsCode = document.getElementById("ws-subject-code");
  const wsCategory = document.getElementById("ws-subject-category");
  const wsTitle = document.getElementById("ws-subject-title");
  const wsTopicTitle = document.getElementById("ws-topic-title");
  const wsTopicSwitcher = document.getElementById("ws-topic-switcher");
  const wsStarBtn = document.getElementById("ws-star-btn");
  const wsDeleteSubjectBtn = document.getElementById("ws-delete-subject-btn");
  const wsSplitToggleBtn = document.getElementById("ws-split-toggle-btn");
  const wsSwapSidesBtn = document.getElementById("ws-swap-sides-btn");
  const wsSlidesBadge = document.getElementById("ws-slides-badge");
  const wsSidebar = document.getElementById("ws-sidebar");
  const wsLinksCount = document.getElementById("ws-links-count");
  const wsLinksList = document.getElementById("ws-links-list");
  const wsSlidesCount = document.getElementById("ws-slides-count");
  const wsSlidesList = document.getElementById("ws-slides-list");
  const wsDesc = document.getElementById("ws-subject-desc");

  const wsDualPanes = document.getElementById("ws-dual-panes");
  const wsWebPane = document.getElementById("ws-web-pane");
  const splitResizer = document.getElementById("split-resizer");
  const wsSlidePane = document.getElementById("ws-slide-pane");
  const splitLinkSelect = document.getElementById("split-link-select");

  const stageUrlText = document.getElementById("stage-url-text");
  const stageExternalBtn = document.getElementById("stage-external-btn");
  const stageRefreshBtn = document.getElementById("stage-refresh-btn");
  const stageFullscreenBtn = document.getElementById("stage-fullscreen-btn");
  const stageLoader = document.getElementById("stage-loader");
  const stageTimeoutBar = document.getElementById("stage-timeout-bar");
  const stageEmptyView = document.getElementById("stage-empty-view");
  const stageRestrictedView = document.getElementById("stage-restricted-view");
  const stageIframeWrapper = document.getElementById("stage-iframe-wrapper");
  const stageIframe = document.getElementById("stage-iframe");

  const restrictedAppIcon = document.getElementById("restricted-app-icon");
  const restrictedAppTitle = document.getElementById("restricted-app-title");
  const restrictedAppSubtitle = document.getElementById("restricted-app-subtitle");
  const restrictedLinkName = document.getElementById("restricted-link-name");
  const restrictedOpenBtn = document.getElementById("restricted-open-btn");

  const slideDeckSelect = document.getElementById("slide-deck-select");
  const slideDeleteBtn = document.getElementById("slide-delete-btn");
  const slideCloseBtn = document.getElementById("slide-close-btn");
  const slideDropZone = document.getElementById("slide-drop-zone");
  const slideEmptyView = document.getElementById("slide-empty-view");
  const slideIframe = document.getElementById("slide-iframe");
  const slidePdfViewer = document.getElementById("slide-pdf-viewer");
  const pdfPagesContainer = document.getElementById("pdf-pages-container");
  const pdfZoomLabel = document.getElementById("pdf-zoom-label");
  const pdfCurrPageEl = document.getElementById("pdf-curr-page");
  const pdfTotalPagesEl = document.getElementById("pdf-total-pages");
  const slideImageViewer = document.getElementById("slide-image-viewer");
  const slideActiveImg = document.getElementById("slide-active-img");
  const slideImgCounter = document.getElementById("slide-img-counter");
  const slideZoomLabel = document.getElementById("slide-zoom-label");

  const addSubjectModal = document.getElementById("add-subject-modal");
  const manageSubjectsList = document.getElementById("manage-subjects-list");
  const manageSubjectsCount = document.getElementById("manage-subjects-count");
  const topicModal = document.getElementById("topic-modal");
  const pairTopicModal = document.getElementById("pair-topic-modal");
  const toastEl = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-msg");
  const toastUndoBtn = document.getElementById("toast-undo-btn");
  const toastProgress = document.getElementById("toast-progress");

  // Admin Mode & GitHub Sync Controller
  const adminModal = document.getElementById("admin-modal");
  const adminNavBtn = document.getElementById("open-admin-btn");
  const adminNavIcon = document.getElementById("admin-nav-icon");
  const adminNavLabel = document.getElementById("admin-nav-label");

  function isAdminMode() {
    return typeof StudyVaultSync !== "undefined" && StudyVaultSync.isAdminEnabled();
  }

  function formatSyncTime(iso) {
    if (!iso) return "ยังไม่เคยซิงก์จากเครื่องนี้";
    try {
      return "ซิงก์ล่าสุด: " + new Date(iso).toLocaleString("th-TH");
    } catch {
      return "ซิงก์ล่าสุดแล้ว";
    }
  }

  let isSyncInFlight = false;

  function syncAdminUI() {
    const unlocked = isAdminMode();
    const cfg = typeof StudyVaultSync !== "undefined" ? StudyVaultSync.getConfig() : {};
    const pendingCount = getPendingSyncCount();
    const syncError = String(cfg.lastSyncError || "").trim();
    document.body.dataset.admin = unlocked ? "true" : "false";

    if (adminNavBtn && adminNavIcon && adminNavLabel) {
      if (unlocked) {
        if (isSyncInFlight) {
          adminNavBtn.className = "h-8 px-2.5 rounded-xl border border-sky-500/40 bg-sky-500/15 text-sky-300 flex items-center gap-1.5 transition-colors text-xs font-semibold whitespace-nowrap";
          adminNavIcon.className = "ph ph-arrows-clockwise text-sm text-sky-300 animate-spin";
          adminNavLabel.textContent = "กำลังซิงก์...";
        } else if (syncError) {
          adminNavBtn.className = "h-8 px-2.5 rounded-xl border border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 flex items-center gap-1.5 transition-colors text-xs font-semibold whitespace-nowrap";
          adminNavIcon.className = "ph ph-warning-circle text-sm text-rose-400";
          adminNavLabel.textContent = pendingCount > 0 ? `ซิงก์ไม่สำเร็จ (${pendingCount})` : "ซิงก์ติดขัด!";
        } else if (pendingCount > 0) {
          adminNavBtn.className = "h-8 px-2.5 rounded-xl border border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 flex items-center gap-1.5 transition-colors text-xs font-semibold whitespace-nowrap";
          adminNavIcon.className = "ph ph-cloud-arrow-up text-sm text-amber-400";
          adminNavLabel.textContent = `รอซิงก์ (${pendingCount})`;
        } else {
          adminNavBtn.className = "h-8 px-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-1.5 transition-colors text-xs font-semibold whitespace-nowrap";
          adminNavIcon.className = "ph ph-cloud-check text-sm text-emerald-400";
          adminNavLabel.textContent = "Admin Sync";
        }
      } else {
        adminNavBtn.className = "h-8 px-2.5 rounded-xl border border-[var(--line)] bg-[var(--s1)] hover:bg-[var(--s3)] text-[var(--tx2)] hover:text-[var(--tx)] flex items-center gap-1.5 transition-colors text-xs font-medium whitespace-nowrap";
        adminNavIcon.className = "ph ph-lock-key text-sm text-[var(--tx3)]";
        adminNavLabel.textContent = pendingCount > 0 ? `เจ้าของเว็บ (ค้างซิงก์ ${pendingCount})` : "เจ้าของเว็บ (Admin)";
      }
    }

    const titleEl = document.getElementById("admin-status-title");
    const badgeEl = document.getElementById("admin-sync-state-badge");
    const descEl = document.getElementById("admin-status-desc");
    const lastSyncEl = document.getElementById("admin-last-sync-text");
    const alertEl = document.getElementById("admin-sync-alert");
    if (titleEl && badgeEl && descEl) {
      if (unlocked) {
        titleEl.textContent = `🟢 เชื่อมต่อ ${cfg.owner}/${cfg.repo} (${cfg.branch}) แล้ว`;
        badgeEl.textContent = cfg.autoSync ? "Auto-Sync เปิดอยู่" : "Manual Sync";
        badgeEl.className = "text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold";
        descEl.textContent = `ทุกวิชา ลิงก์ โค้ด HTML และสไลด์ PDF ที่อัปโหลดสำเร็จแล้วจะซิงก์ให้ทุกเครื่องเห็นตรงกัน (ตอนนี้อยู่บนเว็บกลาง ${sharedBaseSubjects.length} วิชา — ลายมือโน้ตจะแยกเฉพาะเครื่องของแต่ละคน)`;
      } else {
        titleEl.textContent = "🔒 ยังไม่ได้ล็อกอินโหมดเจ้าของเว็บ";
        badgeEl.textContent = "Visitor Mode";
        badgeEl.className = "text-[10px] px-2 py-0.5 rounded-full bg-[var(--s3)] text-[var(--accent)] font-semibold";
        descEl.textContent = `ตอนนี้เว็บกลางมี ${sharedBaseSubjects.length} วิชา — ทุกคนเปิดอ่านและจดโน้ตส่วนตัวได้ แต่เฉพาะเจ้าของเว็บที่ใส่ GitHub Token เท่านั้นที่จะซิงก์ข้อมูลขึ้นเว็บกลางให้ทุกเครื่องเห็นได้`;
      }
    }
    if (alertEl) {
      if (syncError) {
        alertEl.className = "p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200 text-[11px] leading-relaxed font-medium";
        alertEl.innerHTML = `<div class="font-bold text-rose-300 mb-0.5">❌ ซิงก์ขึ้น GitHub ไม่สำเร็จ ข้อมูลจึงยังไม่ไปเครื่องอื่น:</div><div>${syncError}</div>`;
      } else if (pendingCount > 0) {
        alertEl.className = "p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-[11px] leading-relaxed font-medium";
        alertEl.textContent = unlocked
          ? `⚠️ มีข้อมูลในเครื่องนี้ ${pendingCount} รายการที่ยังไม่ได้อัปโหลดขึ้นเว็บกลาง (จึงยังไม่เห็นในเครื่องอื่น) — กดปุ่มอัปโหลดด้านล่างได้เลย`
          : `⚠️ มีข้อมูลที่สร้างไว้ในเครื่องนี้ ${pendingCount} รายการ (ยังอยู่เฉพาะเครื่องนี้) — ใส่ GitHub Token แล้วกดบันทึกเพื่อส่งขึ้นเว็บกลางให้เครื่องอื่นเห็นได้`;
      } else {
        alertEl.className = "hidden";
        alertEl.textContent = "";
      }
    }
    if (lastSyncEl) lastSyncEl.textContent = formatSyncTime(cfg.lastSyncAt);
  }

  window.openAdminModal = function() {
    if (typeof StudyVaultSync !== "undefined") {
      const cfg = StudyVaultSync.getConfig();
      const ownerIn = document.getElementById("admin-gh-owner");
      const repoIn = document.getElementById("admin-gh-repo");
      const branchIn = document.getElementById("admin-gh-branch");
      const tokenIn = document.getElementById("admin-gh-token");
      const autoIn = document.getElementById("admin-auto-sync");
      if (ownerIn) ownerIn.value = cfg.owner || "PhumshopRT";
      if (repoIn) repoIn.value = cfg.repo || "STUDY_WEB";
      if (branchIn) branchIn.value = cfg.branch || "main";
      if (tokenIn) tokenIn.value = cfg.token || "";
      if (autoIn) autoIn.checked = cfg.autoSync !== false;
    }
    syncAdminUI();
    adminModal?.classList.remove("hidden");
  };

  window.closeAdminModal = () => adminModal?.classList.add("hidden");

  window.toggleAdminTokenVisibility = function() {
    const inp = document.getElementById("admin-gh-token");
    const eye = document.getElementById("admin-token-eye");
    if (!inp || !eye) return;
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    eye.className = show ? "ph ph-eye-slash text-sm" : "ph ph-eye text-sm";
  };

  window.logoutAdminMode = function() {
    if (typeof StudyVaultSync !== "undefined") {
      StudyVaultSync.clearConfigToken();
      StudyVaultSync.saveConfig({ lastSyncError: "" });
    }
    const tokenIn = document.getElementById("admin-gh-token");
    if (tokenIn) tokenIn.value = "";
    syncAdminUI();
    if (activeSubjectId) openSubject(activeSubjectId, false);
    else renderSubjectsGrid();
    showToast("ออกจากโหมดเจ้าของเว็บแล้ว");
  };

  async function cacheLocalAssetsBeforeCleanup(subjectsList) {
    for (const sub of subjectsList) {
      for (const link of sub.links || []) {
        if (link.idbKey) {
          const blob = await StudyVaultDB.getBlob(link.idbKey).catch(() => null);
          if (blob instanceof Blob) await StudyVaultDB.setBlob("cached-link-" + link.id, blob).catch(() => {});
        }
      }
      for (const sl of sub.slides || []) {
        if (sl.idbKey) {
          const blob = await StudyVaultDB.getBlob(sl.idbKey).catch(() => null);
          if (blob) await StudyVaultDB.setBlob("cached-slide-" + sl.id, blob).catch(() => {});
        }
      }
    }
  }

  async function syncLibraryToGitHub(isAuto = false) {
    if (!isAdminMode() || typeof StudyVaultSync === "undefined") return false;
    const manualBtn = document.getElementById("admin-manual-sync-btn");
    const lastSyncEl = document.getElementById("admin-last-sync-text");
    if (manualBtn) manualBtn.disabled = true;
    isSyncInFlight = true;
    StudyVaultSync.saveConfig({ lastSyncError: "" });
    syncAdminUI();

    const updateStatus = msg => {
      if (adminNavLabel && msg.includes("กำลัง")) adminNavLabel.textContent = "กำลังซิงก์...";
      if (lastSyncEl) lastSyncEl.textContent = msg;
    };

    try {
      await cacheLocalAssetsBeforeCleanup(getMergedSubjects());
      const res = await StudyVaultSync.publishLibrary(() => getMergedSubjects(), updateStatus);
      sharedBaseSubjects = res.cleanSubjects;
      customSubjects = [];
      deletedSubjectIds.clear();
      customTopicsMap = {};
      deletedTopicIds.clear();
      topicOverrides = {};
      customLinksMap = {};
      deletedLinkIds.clear();
      linkOverrides = {};
      customSlidesMap = {};
      deletedSlideIds.clear();
      slideOverrides = {};
      isSyncInFlight = false;
      saveState();
      allSubjects = getMergedSubjects();
      syncAdminUI();
      if (activeSubjectId) {
        const sub = allSubjects.find(s => s.id === activeSubjectId);
        if (sub) {
          openSubject(activeSubjectId, false, { topicId: activeTopicId, slideId: activeSlideId, openSlides: isSplitMode });
        } else {
          navigateHome(true, "__ALL__");
        }
      } else {
        renderSubjectsGrid();
      }
      showToast("☁️ อัปโหลดขึ้นเว็บกลางแล้ว (รอ ~20–40 วิทุกคนจะเห็น)");
      return true;
    } catch (err) {
      console.error("GitHub Sync failed:", err);
      isSyncInFlight = false;
      StudyVaultSync.saveConfig({ lastSyncError: err.message || "ซิงก์ไม่สำเร็จ" });
      syncAdminUI();
      if (lastSyncEl) lastSyncEl.textContent = `ผิดพลาด: ${err.message}`;
      showToast(isAuto
        ? `บันทึกในเครื่องแล้ว (ซิงก์ขึ้น GitHub ไม่สำเร็จ — กดปุ่มแดงด้านบนเพื่อดูสาเหตุ: ${err.message})`
        : `ซิงก์ไม่สำเร็จ: ${err.message}`);
      return false;
    } finally {
      isSyncInFlight = false;
      if (manualBtn) manualBtn.disabled = false;
    }
  }

  function triggerAutoSyncIfEnabled() {
    if (!isAdminMode() || typeof StudyVaultSync === "undefined") return;
    if (StudyVaultSync.getConfig().autoSync) {
      syncLibraryToGitHub(true);
    }
  }

  window.manualPublishToGitHub = () => syncLibraryToGitHub(false);

  document.getElementById("admin-config-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (typeof StudyVaultSync === "undefined") return;
    const owner = document.getElementById("admin-gh-owner").value.trim();
    const repo = document.getElementById("admin-gh-repo").value.trim();
    const branch = document.getElementById("admin-gh-branch").value.trim() || "main";
    const token = document.getElementById("admin-gh-token").value.trim();
    const autoSync = Boolean(document.getElementById("admin-auto-sync").checked);

    const saveBtn = document.getElementById("admin-save-btn");
    if (!token) {
      showToast("กรุณากรอก GitHub Token");
      return;
    }
    if (saveBtn) saveBtn.disabled = true;
    try {
      await StudyVaultSync.verifyRepoAccess({ owner, repo, branch, token });
      StudyVaultSync.saveConfig({ owner, repo, branch, token, autoSync, verifiedAt: new Date().toISOString(), lastSyncError: "" });
      syncAdminUI();
      if (activeSubjectId) openSubject(activeSubjectId, false);
      else renderSubjectsGrid();
      showToast("ปลดล็อกโหมดเจ้าของเว็บสำเร็จ!");

      const hasPendingLocal = getPendingSyncCount() > 0;
      if (hasPendingLocal && autoSync) {
        await syncLibraryToGitHub(true);
      }
      closeAdminModal();
    } catch (err) {
      showToast(`ตรวจสอบ Token ไม่ผ่าน: ${err.message}`);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  function isEmbeddedHtmlLink(link) {
    return Boolean(link && (link.idbKey || link.repoPath || (link.url && String(link.url).startsWith("shared-assets/"))));
  }

  function getLinkExternalUrl(link) {
    if (!link) return "";
    if (link.externalUrl && String(link.externalUrl).trim()) return String(link.externalUrl).trim();
    const u = String(link.url || "").trim();
    if (u && !u.startsWith("shared-assets/") && !u.startsWith("blob:")) return u;
    return "";
  }

  function toHtmlSafeBlobUrl(blob, item) {
    const isHtml = isEmbeddedHtmlLink(item) || String(blob?.type || "").includes("html");
    const typed = (isHtml && !String(blob?.type || "").includes("html"))
      ? new Blob([blob], { type: "text/html; charset=utf-8" })
      : blob;
    return URL.createObjectURL(typed);
  }

  // Cached Blob Resolver (supports both local IDB blobs & shared GitHub assets)
  async function resolveResourceUrl(item) {
    if (!item) return "";
    if (item.idbKey) {
      if (blobUrlCache.has(item.idbKey)) return blobUrlCache.get(item.idbKey);
      try {
        const data = await StudyVaultDB.getBlob(item.idbKey);
        if (data instanceof Blob) {
          const url = toHtmlSafeBlobUrl(data, item);
          blobUrlCache.set(item.idbKey, url);
          return url;
        }
      } catch (e) {
        console.error("IDB load failed:", e);
      }
    }
    if (item.id) {
      const cacheKey = "cached-link-" + item.id;
      if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey);
      try {
        const cached = await StudyVaultDB.getBlob(cacheKey);
        if (cached instanceof Blob) {
          const url = toHtmlSafeBlobUrl(cached, item);
          blobUrlCache.set(cacheKey, url);
          return url;
        }
      } catch {}
    }
    return item.url || "";
  }

  async function resolveImageDeckUrls(slOrKey) {
    if (!slOrKey) return [];
    const idbKey = typeof slOrKey === "string" ? slOrKey : slOrKey.idbKey;
    const slideId = typeof slOrKey === "object" ? slOrKey.id : null;

    if (idbKey) {
      if (blobUrlCache.has(idbKey)) return blobUrlCache.get(idbKey);
      const blobs = await StudyVaultDB.getBlob(idbKey).catch(() => null);
      if (Array.isArray(blobs) && blobs.length > 0) {
        const urls = blobs.map(b => URL.createObjectURL(b));
        blobUrlCache.set(idbKey, urls);
        return urls;
      }
    }
    if (slideId) {
      const cKey = "cached-slide-" + slideId;
      if (blobUrlCache.has(cKey)) return blobUrlCache.get(cKey);
      const cached = await StudyVaultDB.getBlob(cKey).catch(() => null);
      if (Array.isArray(cached) && cached.length > 0) {
        const urls = cached.map(b => URL.createObjectURL(b));
        blobUrlCache.set(cKey, urls);
        return urls;
      }
    }
    if (typeof slOrKey === "object" && Array.isArray(slOrKey.urls) && slOrKey.urls.length > 0) {
      return slOrKey.urls;
    }
    return [];
  }

  const previewResizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const box = entry.target;
      const iframes = box.querySelectorAll(".preview-iframe-scale, .preview-iframe-half");
      iframes.forEach(iframe => {
        const baseW = iframe.classList.contains("preview-iframe-half") ? 880 : 1200;
        iframe.style.transform = `scale(${entry.contentRect.width / baseW})`;
      });
    }
  });

  // Toast + 6s Undo
  function showToast(message, undoHandler = null) {
    toastMsg.textContent = message;
    toastEl.classList.remove("hidden");

    if (undoHandler) {
      toastUndoBtn.classList.remove("hidden");
      toastUndoBtn.onclick = () => {
        undoHandler();
        toastEl.classList.add("hidden");
        clearTimeout(window._toastTimer);
      };
    } else {
      toastUndoBtn.classList.add("hidden");
      toastUndoBtn.onclick = null;
    }

    toastProgress.classList.remove("sv-drain-bar");
    void toastProgress.offsetWidth;
    toastProgress.classList.add("sv-drain-bar");

    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 6000);
  }

  // 1. Theme (Default: Obsidian Black Studio, Toggle -> Airy Daylight Porcelain)
  function applyThemeUI(isDark) {
    if (isDark) {
      htmlRoot.classList.add("dark");
      themeIcon.className = "ph ph-sun text-sm text-amber-300";
      if (themeLabel) themeLabel.textContent = "โหมดสว่าง";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#050507");
    } else {
      htmlRoot.classList.remove("dark");
      themeIcon.className = "ph ph-moon text-sm text-indigo-600";
      if (themeLabel) themeLabel.textContent = "โหมดมืด";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#f4f6fb");
    }
  }

  function initTheme() {
    const saved = localStorage.getItem(LS_THEME);
    applyThemeUI(saved !== "light");
  }

  themeToggleBtn.addEventListener("click", () => {
    const isDark = !htmlRoot.classList.contains("dark");
    applyThemeUI(isDark);
    localStorage.setItem(LS_THEME, isDark ? "dark" : "light");
  });

  // 2. Stats & Sliding Categories
  function updateStats() {
    statSubjects.textContent = String(allSubjects.length).padStart(2, "0");
    statLinks.textContent = String(allSubjects.reduce((s, x) => s + (x.topics?.length || 0), 0)).padStart(2, "0");
    statSlides.textContent = String(allSubjects.reduce((s, x) => s + (x.slides?.length || 0), 0)).padStart(2, "0");
    statFavorites.textContent = String(favorites.size).padStart(2, "0");
  }

  function updateScopeThumb() {
    const activeBtn = categoryTabsRail.querySelector('[data-active="true"]');
    if (!activeBtn) return;
    categoryThumb.style.setProperty("--thumb-x", `${activeBtn.offsetLeft}px`);
    categoryThumb.style.setProperty("--thumb-w", `${activeBtn.offsetWidth}px`);
    categoryThumb.setAttribute("data-ready", "true");
  }

  function renderCategories() {
    const categories = ["ทั้งหมด", "⭐ ติดดาว", ...new Set(allSubjects.map(s => s.category))];
    categoryTabsRail.querySelectorAll("button").forEach(b => b.remove());

    categories.forEach(cat => {
      let count = 0;
      if (cat === "ทั้งหมด") count = allSubjects.length;
      else if (cat === "⭐ ติดดาว") count = favorites.size;
      else count = allSubjects.filter(s => s.category === cat).length;

      const isActive = currentCategory === cat;
      const btn = document.createElement("button");
      btn.setAttribute("data-active", isActive ? "true" : "false");
      btn.className = `relative z-10 h-8 px-2.5 rounded-[10px] text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
        isActive ? "text-[var(--accent)] font-semibold" : "text-[var(--tx3)] hover:text-[var(--tx)]"
      }`;
      btn.innerHTML = `<span>${cat}</span><span class="tnum text-[10px] px-1.5 py-0.2 rounded-md ${isActive ? 'bg-[var(--accent-14)] text-[var(--accent)]' : 'bg-[var(--rail)] text-[var(--tx3)]'}">${count}</span>`;
      btn.addEventListener("click", () => selectCategory(cat));
      categoryTabsRail.appendChild(btn);
    });
    requestAnimationFrame(updateScopeThumb);
  }

  window.selectCategory = function(cat) {
    currentCategory = cat;
    selectedHomeSubjectId = "__ALL__";
    if (viewHome.classList.contains("hidden")) navigateHome();
    renderCategories();
    renderSubjectsGrid();
  };

  window.setHomeViewMode = function(mode) {
    homeViewMode = mode === "subjects" ? "subjects" : "feed";
    renderSubjectsGrid();
  };

  window.selectHomeSubject = function(subjectId) {
    selectedHomeSubjectId = subjectId || "__ALL__";
    renderSubjectsGrid();
  };

  function syncHomeViewModeUI() {
    if (!homeViewModeGroup || !homeModeFeedBtn || !homeModeSubjectsBtn) return;
    homeViewModeGroup.classList.toggle("hidden", selectedHomeSubjectId !== "__ALL__");
    const isFeed = homeViewMode === "feed";
    homeModeFeedBtn.className = isFeed
      ? "px-2.5 py-1 rounded-lg bg-[var(--accent)] text-white font-semibold flex items-center gap-1 transition whitespace-nowrap"
      : "px-2.5 py-1 rounded-lg text-[var(--tx2)] hover:text-[var(--tx)] font-medium flex items-center gap-1 transition whitespace-nowrap";
    homeModeSubjectsBtn.className = !isFeed
      ? "px-2.5 py-1 rounded-lg bg-[var(--accent)] text-white font-semibold flex items-center gap-1 transition whitespace-nowrap"
      : "px-2.5 py-1 rounded-lg text-[var(--tx2)] hover:text-[var(--tx)] font-medium flex items-center gap-1 transition whitespace-nowrap";
  }

  function extractSubjectTopics(sub) {
    return (sub.topics || []).map((t, idx) => {
      const link = t.link || null;
      const slides = Array.isArray(t.slides) ? t.slides : [];
      const firstSlide = slides[0] || null;
      const sortTs = Math.max(
        getItemSortTimestamp(t),
        getItemSortTimestamp(link),
        ...slides.map(sl => getItemSortTimestamp(sl)),
        1000 - idx
      );
      return {
        kind: link ? "topic" : "slide",
        sub,
        topic: t,
        link,
        slide: firstSlide,
        slides,
        item: link || firstSlide || t,
        paired: Boolean(link && slides.length > 0),
        sortTs
      };
    });
  }

  function promoteTopicToCustom(subId, topicId) {
    const sub = allSubjects.find(s => s.id === subId);
    if (!sub) return null;
    const topic = (sub.topics || []).find(t => t.id === topicId);
    if (!topic) return null;

    if (!customTopicsMap[subId]) customTopicsMap[subId] = [];
    const existingIdx = customTopicsMap[subId].findIndex(t => t.id === topicId);
    if (existingIdx !== -1) return customTopicsMap[subId][existingIdx];

    const newId = topic.isLegacy ? topicId.replace(/^legtop-/, "top-") : topic.id;
    const clone = {
      id: newId,
      title: topic.title,
      subtitle: topic.subtitle || "",
      updatedAt: topic.updatedAt || new Date().toISOString().split("T")[0],
      createdAt: topic.createdAt || Date.now(),
      link: topic.link ? { ...topic.link } : null,
      slides: (topic.slides || []).map(sl => ({ ...sl }))
    };

    if (topic.isLegacy) {
      if (topic._legacyLinkId) deletedLinkIds.add(topic._legacyLinkId);
      (topic._legacySlideIds || []).forEach(sid => deletedSlideIds.add(sid));
    }

    customTopicsMap[subId].unshift(clone);
    if (activeTopicId === topicId) activeTopicId = newId;
    return clone;
  }

  function patchRecordFields(kind, targetSubId, itemId, patch) {
    const isSlide = kind === "slide";
    const customMap = isSlide ? customSlidesMap : customLinksMap;
    const overrideMap = isSlide ? slideOverrides : linkOverrides;
    const customList = customMap[targetSubId] || [];
    const customIdx = customList.findIndex(x => x.id === itemId);
    if (customIdx !== -1) {
      customList[customIdx] = { ...customList[customIdx], ...patch };
    } else {
      overrideMap[itemId] = { ...(overrideMap[itemId] || {}), ...patch };
    }
  }

  function renderSubjectTabs(catSubjects) {
    if (!subjectTabsRail) return;
    if (selectedHomeSubjectId !== "__ALL__" && !catSubjects.some(s => s.id === selectedHomeSubjectId)) {
      selectedHomeSubjectId = "__ALL__";
    }

    const topicCounts = new Map(catSubjects.map(s => [s.id, extractSubjectTopics(s).length]));
    const totalItems = catSubjects.reduce((acc, s) => acc + (topicCounts.get(s.id) || 0), 0);
    const allActive = selectedHomeSubjectId === "__ALL__";

    const pills = [
      `<button onclick="selectHomeSubject('__ALL__')" data-subject-tab="__ALL__" class="h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 transition whitespace-nowrap ${
        allActive
          ? "sv-btn-primary shadow-md"
          : "sv-surface text-[var(--tx2)] hover:text-[var(--tx)] hover:bg-[var(--s3)]"
      }">
        <i class="ph ph-squares-four text-sm"></i>
        <span>ทุกวิชา</span>
        <span class="tnum text-[10px] px-1.5 py-0.2 rounded-md ${allActive ? "bg-white/20 text-white" : "bg-[var(--rail)] text-[var(--tx3)]"}">${totalItems}</span>
      </button>`
    ];

    for (const sub of catSubjects) {
      const isAct = selectedHomeSubjectId === sub.id;
      const itemCount = topicCounts.get(sub.id) || 0;
      pills.push(`
        <button onclick="selectHomeSubject('${sub.id}')" data-subject-tab="${sub.id}" class="h-9 px-3 rounded-xl text-xs font-medium flex items-center gap-2 flex-shrink-0 transition whitespace-nowrap ${
          isAct
            ? "sv-btn-primary font-semibold shadow-md"
            : "sv-surface text-[var(--tx2)] hover:text-[var(--tx)] hover:border-[var(--accent-32)]"
        }">
          <span class="w-5 h-5 rounded-md bg-gradient-to-br ${sub.accent || 'from-indigo-500 to-purple-500'} flex items-center justify-center text-white text-[11px] flex-shrink-0">${sub.icon || '📘'}</span>
          <span class="font-bold tnum ${isAct ? 'text-white' : 'text-[var(--accent)]'}">${sub.code}</span>
          <span class="truncate max-w-[130px]">${sub.title}</span>
          <span class="tnum text-[10px] px-1.5 rounded-md ${isAct ? "bg-white/20 text-white" : "bg-[var(--rail)] text-[var(--tx3)]"}">${itemCount}</span>
        </button>
      `);
    }

    subjectTabsRail.innerHTML = pills.join("");
    syncHomeViewModeUI();
  }

  function renderSelectedSubjectBanner(activeSub) {
    if (!selectedSubjectBanner) return;
    if (!activeSub || selectedHomeSubjectId === "__ALL__") {
      selectedSubjectBanner.classList.add("hidden");
      selectedSubjectBanner.innerHTML = "";
      return;
    }
    const isFav = favorites.has(activeSub.id);
    const topicsCount = extractSubjectTopics(activeSub).length;
    selectedSubjectBanner.classList.remove("hidden");
    selectedSubjectBanner.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${activeSub.accent || 'from-indigo-500 to-purple-500'} flex items-center justify-center text-white text-lg shadow-sm flex-shrink-0">
          ${activeSub.icon || '📘'}
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--accent-08)] text-[var(--accent)] border border-[var(--accent-32)] tnum">${activeSub.code}</span>
            <h2 class="font-bold text-sm sm:text-base text-[var(--tx)] truncate">${activeSub.title}</h2>
          </div>
          <p class="text-[11px] text-[var(--tx3)] tnum mt-0.5">${topicsCount} เรื่องในวิชานี้ • ${activeSub.slides.length} สไลด์เรียน (กดเข้าไปในแต่ละเรื่องเพื่อดูทั้งเว็บสรุป + สไลด์)</p>
        </div>
      </div>

      <div class="flex items-center gap-1.5 flex-wrap">
        <button onclick="selectHomeSubject('__ALL__')" class="h-8 px-3 rounded-xl border border-[var(--line)] bg-[var(--s1)] hover:bg-[var(--s3)] text-[var(--tx2)] hover:text-[var(--tx)] text-xs font-medium flex items-center gap-1 transition">
          <i class="ph ph-arrow-left text-xs"></i>
          <span>ดูทุกวิชา</span>
        </button>
        <button onclick="toggleFavorite('${activeSub.id}')" class="h-8 w-8 rounded-xl border border-[var(--line)] bg-[var(--s1)] hover:bg-[var(--s3)] flex items-center justify-center ${isFav ? 'text-amber-400' : 'text-[var(--tx3)] hover:text-amber-400'} transition" title="ติดดาว">
          <i class="ph ${isFav ? 'ph-star-fill' : 'ph-star'} text-sm"></i>
        </button>
        <button onclick="openTopicModal('${activeSub.id}')" class="admin-only sv-btn-primary h-8 px-3.5 rounded-xl text-xs flex items-center gap-1.5 transition">
          <i class="ph ph-plus-circle text-sm"></i>
          <span>+ เพิ่มเรื่องใหม่ในวิชานี้</span>
        </button>
        <button onclick="deleteSubject('${activeSub.id}')" class="admin-only h-8 px-2.5 rounded-xl border border-[var(--line)] bg-[var(--danger-bg)] text-[var(--danger)] hover:opacity-85 text-xs font-medium flex items-center gap-1 transition" title="ลบวิชานี้">
          <i class="ph ph-trash text-xs"></i>
          <span class="hidden md:inline">ลบวิชา</span>
        </button>
      </div>
    `;
  }

  let pdfThumbToken = 0;

  async function hydratePdfCardThumbnails(pdfEntries) {
    if (!window.pdfjsLib || pdfEntries.length === 0) return;
    const token = ++pdfThumbToken;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    for (const { item } of pdfEntries) {
      if (token !== pdfThumbToken) return;
      const slot = document.querySelector(`.pdf-thumb-slot[data-slide-id="${item.id}"]`);
      if (!slot || !slot.isConnected) continue;

      let thumbUrl = pdfThumbCache.get(item.id);
      if (!thumbUrl) {
        try {
          let blob = item.idbKey ? await StudyVaultDB.getBlob(item.idbKey).catch(() => null) : null;
          if (!blob) blob = await StudyVaultDB.getBlob("cached-slide-" + item.id).catch(() => null);
          if (!blob && item.url) {
            const resp = await fetch(item.url);
            if (resp.ok) {
              blob = await resp.blob();
              await StudyVaultDB.setBlob("cached-slide-" + item.id, blob).catch(() => {});
            }
          }
          if (!blob || token !== pdfThumbToken) continue;

          const buf = await blob.arrayBuffer();
          const doc = await pdfjsLib.getDocument({ data: buf }).promise;
          const page = await doc.getPage(1);
          const vp1 = page.getViewport({ scale: 1 });
          const scale = Math.min(1.4, 420 / Math.max(1, vp1.width));
          const vp = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(vp.width));
          canvas.height = Math.max(1, Math.floor(vp.height));
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
          thumbUrl = canvas.toDataURL("image/jpeg", 0.84);
          pdfThumbCache.set(item.id, thumbUrl);
          try { await doc.destroy(); } catch {}
        } catch {
          continue;
        }
      }

      if (token !== pdfThumbToken || !slot.isConnected || !thumbUrl) continue;
      slot.innerHTML = `<img src="${thumbUrl}" alt="${item.title}" class="w-full h-full object-contain bg-[var(--bg)]">`;
    }
  }

  function extractRemovedRecord(kind, targetSubId, itemId) {
    const isSlide = kind === "slide";
    const customMap = isSlide ? customSlidesMap : customLinksMap;
    const deletedSet = isSlide ? deletedSlideIds : deletedLinkIds;
    const customList = customMap[targetSubId] || [];
    const removedCustom = customList.find(x => x.id === itemId) || null;
    if (removedCustom) {
      customMap[targetSubId] = customList.filter(x => x.id !== itemId);
    } else {
      deletedSet.add(itemId);
    }
    return () => {
      if (removedCustom) {
        if (!customMap[targetSubId]) customMap[targetSubId] = [];
        customMap[targetSubId].unshift(removedCustom);
      } else {
        deletedSet.delete(itemId);
      }
    };
  }

  function deleteSubjectAsset(kind, itemId, overrideSubjectId = null, stayHome = false) {
    const targetSubId = overrideSubjectId || activeSubjectId;
    const sub = allSubjects.find(s => s.id === targetSubId);
    if (!sub) return;
    const isSlide = kind === "slide";
    const list = isSlide ? sub.slides : sub.links;
    const item = list.find(x => x.id === itemId);
    if (!item) return;

    const restoreFn = extractRemovedRecord(kind, targetSubId, itemId);

    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    if (stayHome || activeSubjectId !== targetSubId) {
      if (!viewHome.classList.contains("hidden")) renderSubjectsGrid();
    } else {
      openSubject(targetSubId, false);
    }

    const label = isSlide ? "ลบสไลด์" : "ลบลิงก์";
    showToast(`${label} "${item.title}" แล้ว`, () => {
      restoreFn();
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      if (activeSubjectId === targetSubId && viewHome.classList.contains("hidden")) {
        openSubject(targetSubId, false);
      } else if (!viewHome.classList.contains("hidden")) {
        renderSubjectsGrid();
      }
      triggerAutoSyncIfEnabled();
    });
    triggerAutoSyncIfEnabled();
  }

  function extractRemovedTopicState(subId, topicId) {
    const sub = allSubjects.find(s => s.id === subId);
    const topic = (sub?.topics || []).find(t => t.id === topicId);
    if (!topic) return null;

    const customList = customTopicsMap[subId] || [];
    const customIdx = customList.findIndex(t => t.id === topicId);
    let removedNative = null;
    const restoredLegacyFns = [];

    if (customIdx !== -1) {
      removedNative = customList[customIdx];
      customTopicsMap[subId] = customList.filter(t => t.id !== topicId);
    } else if (topic.isLegacy) {
      if (topic._legacyLinkId) restoredLegacyFns.push(extractRemovedRecord("link", subId, topic._legacyLinkId));
      (topic._legacySlideIds || []).forEach(sid => restoredLegacyFns.push(extractRemovedRecord("slide", subId, sid)));
    } else {
      deletedTopicIds.add(topicId);
    }

    return {
      title: topic.title,
      restore: () => {
        if (removedNative) {
          if (!customTopicsMap[subId]) customTopicsMap[subId] = [];
          customTopicsMap[subId].unshift(removedNative);
        } else if (topic.isLegacy) {
          restoredLegacyFns.forEach(fn => fn());
        } else {
          deletedTopicIds.delete(topicId);
        }
      }
    };
  }

  window.deleteTopic = function(subjectId, topicId, exitToSubject = false) {
    const removed = extractRemovedTopicState(subjectId, topicId);
    if (!removed) return;

    saveState();
    allSubjects = getMergedSubjects();
    updateStats();

    if (exitToSubject && activeSubjectId === subjectId) {
      activeTopicId = null;
      navigateHome(true);
    } else if (!viewHome.classList.contains("hidden")) {
      renderSubjectsGrid();
    } else if (activeSubjectId === subjectId) {
      openSubject(subjectId, false);
    }

    showToast(`ลบเรื่อง "${removed.title}" แล้ว`, () => {
      removed.restore();
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      if (!viewHome.classList.contains("hidden")) renderSubjectsGrid();
      else if (activeSubjectId === subjectId) openSubject(subjectId, false, { topicId });
      triggerAutoSyncIfEnabled();
    });
    triggerAutoSyncIfEnabled();
  };

  window.deleteActiveTopic = function() {
    if (activeSubjectId && activeTopicId) deleteTopic(activeSubjectId, activeTopicId, true);
  };

  window.deleteHomeTopic = function(subjectId, topicId) {
    deleteTopic(subjectId, topicId, false);
  };

  window.applyTopicPair = function(subjectId, linkId, slideId) {
    const sub = allSubjects.find(s => s.id === subjectId);
    if (!sub) return;
    const linkTopic = (sub.topics || []).find(t => t.link?.id === linkId);
    const slideTopic = (sub.topics || []).find(t => (t.slides || []).some(sl => sl.id === slideId));
    if (!linkTopic || !slideTopic || linkTopic.id === slideTopic.id) return;

    const promotedTarget = promoteTopicToCustom(subjectId, linkTopic.id);
    const targetSlide = (slideTopic.slides || []).find(sl => sl.id === slideId);
    if (!promotedTarget || !targetSlide) return;

    if (!Array.isArray(promotedTarget.slides)) promotedTarget.slides = [];
    promotedTarget.slides.push({ ...targetSlide });
    promotedTarget.createdAt = Date.now();
    promotedTarget.updatedAt = new Date().toISOString().split("T")[0];
    if (promotedTarget.link) {
      promotedTarget.link.pairedSlideId = targetSlide.id;
      promotedTarget.link.unpairedAuto = false;
    }

    // Remove the old standalone slide-only topic
    const remainingSlides = (slideTopic.slides || []).filter(sl => sl.id !== slideId);
    if (remainingSlides.length === 0 && !slideTopic.link) {
      extractRemovedTopicState(subjectId, slideTopic.id);
    } else {
      const promotedSrc = promoteTopicToCustom(subjectId, slideTopic.id);
      if (promotedSrc) promotedSrc.slides = remainingSlides;
    }

    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    closePairTopicModal();
    if (!viewHome.classList.contains("hidden")) renderSubjectsGrid();
    else if (activeSubjectId === subjectId) openSubject(subjectId, true, { topicId: promotedTarget.id, slideId: targetSlide.id, openSlides: true });
    showToast("รวมเข้าเป็นเรื่องเดียวกันแล้ว!");
    triggerAutoSyncIfEnabled();
  };

  window.closePairTopicModal = function() {
    pairTopicModal?.classList.add("hidden");
  };

  window.openPairTopicModal = function(sourceKind, subjectId, topicId) {
    const sub = allSubjects.find(s => s.id === subjectId);
    const srcTopic = (sub?.topics || []).find(t => t.id === topicId);
    if (!sub || !srcTopic || !pairTopicModal) return;

    const isSourceLink = sourceKind === "link";
    const sourceTitle = isSourceLink ? srcTopic.title : (srcTopic.slides?.[0]?.title || srcTopic.title);
    document.getElementById("pair-source-badge").textContent = `${sub.code} • ${srcTopic.title}`;
    document.getElementById("pair-source-title").textContent = sourceTitle;
    document.getElementById("pair-list-heading").textContent = isSourceLink
      ? "เลือกสไลด์ที่มีในวิชานี้เพื่อรวมเข้ามาอยู่ในเรื่องนี้:"
      : "เลือกเรื่องที่ต้องการนำสไลด์นี้ไปรวมเข้าด้วยกัน:";

    const candidateTopics = (sub.topics || []).filter(t => t.id !== topicId && (isSourceLink ? (t.slides || []).length > 0 : Boolean(t.link)));
    const listEl = document.getElementById("pair-existing-list");
    if (candidateTopics.length === 0) {
      listEl.innerHTML = `<div class="p-3 rounded-xl bg-[var(--rail)] border border-[var(--line)] text-[11px] text-[var(--tx3)] text-center">ยังไม่มีรายการอื่นให้รวม กดปุ่มด้านล่างเพื่อเพิ่มไฟล์เข้าเรื่องนี้โดยตรงได้เลย</div>`;
    } else {
      listEl.innerHTML = candidateTopics.map(cand => {
        const linkId = isSourceLink ? srcTopic.link.id : cand.link.id;
        const slideId = isSourceLink ? cand.slides[0].id : srcTopic.slides[0].id;
        return `
          <button type="button" onclick="applyTopicPair('${subjectId}', '${linkId}', '${slideId}')" class="w-full p-2.5 rounded-xl bg-[var(--s1)] hover:bg-[var(--s3)] border border-[var(--line)] hover:border-[var(--accent-32)] flex items-center justify-between gap-2 text-left transition">
            <div class="flex items-center gap-2.5 min-w-0">
              <i class="ph ${isSourceLink ? 'ph-file-pdf text-rose-400' : 'ph-code text-emerald-400'} text-base flex-shrink-0"></i>
              <div class="min-w-0">
                <p class="font-semibold text-xs text-[var(--tx)] truncate">${isSourceLink ? cand.slides[0].title : cand.title}</p>
                <p class="text-[10px] text-[var(--tx3)]">${cand.updatedAt || ""}</p>
              </div>
            </div>
            <span class="px-2 py-1 rounded-md bg-[var(--accent-08)] text-[var(--accent)] text-[10px] font-semibold flex-shrink-0">รวมเข้าเรื่องเดียวกัน</span>
          </button>
        `;
      }).join("");
    }

    const uploadBtn = document.getElementById("pair-upload-new-btn");
    uploadBtn.onclick = () => {
      closePairTopicModal();
      openTopicModal(subjectId, topicId, isSourceLink ? "slide" : "link");
    };

    pairTopicModal.classList.remove("hidden");
  };

  function renderPreviewPaneHtml(sub, paneKind, item, previewSrc, isHalf) {
    if (paneKind === "link") {
      if (previewSrc) {
        const cls = isHalf ? "preview-iframe-half" : "preview-iframe-scale";
        return `<iframe src="${previewSrc}" class="${cls}" loading="lazy" tabindex="-1" sandbox="allow-scripts allow-same-origin"></iframe>`;
      }
      return `
        <div class="w-full h-full p-3 flex flex-col items-center justify-center text-center bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10">
          <div class="${isHalf ? 'w-9 h-9 text-base mb-1.5' : 'w-12 h-12 text-xl mb-2.5'} rounded-2xl bg-gradient-to-br ${sub.accent || 'from-indigo-500 to-purple-500'} flex items-center justify-center text-white shadow-lg">
            ${sub.icon || '📘'}
          </div>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--s1)] border border-[var(--line)] text-[var(--accent)] mb-1 tnum">${sub.code}</span>
          <p class="text-[11px] font-semibold text-[var(--tx)] line-clamp-2 max-w-[200px]">${item.title}</p>
        </div>
      `;
    }

    if (item.type === "pdf") {
      const cachedThumb = pdfThumbCache.get(item.id);
      if (cachedThumb) {
        return `<img src="${cachedThumb}" alt="${item.title}" class="w-full h-full object-contain bg-[var(--bg)]">`;
      }
      return `
        <div class="pdf-thumb-slot w-full h-full p-3 flex flex-col items-center justify-center text-center bg-gradient-to-br from-rose-500/10 via-purple-500/5 to-indigo-500/10" data-slide-id="${item.id}" data-sub-id="${sub.id}">
          <div class="${isHalf ? 'w-9 h-9 text-base mb-1.5' : 'w-12 h-12 text-xl mb-2.5'} rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-lg">
            <i class="ph ph-file-pdf"></i>
          </div>
          <span class="text-[11px] font-bold text-[var(--tx)] line-clamp-2 max-w-[200px]">${item.title}</span>
          <span class="text-[10px] text-[var(--tx3)] mt-0.5">กำลังโหลดปกสไลด์...</span>
        </div>
      `;
    }

    if (item.type === "images" && previewSrc) {
      return `<img src="${previewSrc}" alt="${item.title}" class="w-full h-full object-cover">`;
    }

    return `
      <div class="w-full h-full p-3 flex flex-col items-center justify-center text-center bg-gradient-to-br from-rose-500/10 via-purple-500/5 to-indigo-500/10">
        <div class="${isHalf ? 'w-9 h-9 text-base mb-1.5' : 'w-12 h-12 text-xl mb-2.5'} rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-lg">
          <i class="ph ph-presentation-chart"></i>
        </div>
        <p class="text-[11px] font-semibold text-[var(--tx)] line-clamp-2 max-w-[200px]">${item.title}</p>
      </div>
    `;
  }

  function buildFeedItemCardHtml(entry, idx) {
    const { sub, topic, link, slide, slides, linkPreviewSrc, slidePreviewSrc, isNewest } = entry;
    const isPaired = Boolean(link && slide);
    const isSlideOnly = Boolean(!link && slide);
    const mainTitle = topic.title || (link ? link.title : slide.title);
    const slidesCount = slides ? slides.length : (slide ? 1 : 0);

    const clickAction = `openTopicStudio('${sub.id}', '${topic.id}')`;

    const linkBadge = link && isEmbeddedHtmlLink(link)
      ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"><i class="ph ph-code"></i><span>HTML ในตัว</span></span>`
      : link
        ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--accent-08)] text-[var(--accent)] border border-[var(--accent-32)] flex items-center gap-1"><i class="ph ph-link-simple"></i><span>${link.badge || 'เว็บสรุป'}</span></span>`
        : "";

    const slideBadge = slide
      ? (slide.type === "pdf"
        ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1"><i class="ph ph-file-pdf"></i><span>สไลด์${slidesCount > 1 ? ` (${slidesCount})` : ''}</span></span>`
        : slide.type === "images"
          ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center gap-1"><i class="ph ph-images"></i><span>รูปสไลด์</span></span>`
          : `<span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-pink-500/15 text-pink-400 border border-pink-500/30 flex items-center gap-1"><i class="ph ph-presentation-chart"></i><span>สไลด์เว็บ</span></span>`)
      : "";

    const previewBody = isPaired
      ? `
        <div class="grid grid-cols-2 divide-x divide-[var(--line)] w-full h-full">
          <div class="preview-scale-host relative w-full h-full overflow-hidden bg-[var(--bg)]">
            ${renderPreviewPaneHtml(sub, "link", link, linkPreviewSrc, true)}
            <span class="absolute bottom-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-semibold text-emerald-300 border border-white/10 backdrop-blur-sm">เว็บสรุป</span>
          </div>
          <div class="relative w-full h-full overflow-hidden bg-[var(--bg)]">
            ${renderPreviewPaneHtml(sub, "slide", slide, slidePreviewSrc, true)}
            <span class="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-semibold text-rose-300 border border-white/10 backdrop-blur-sm">สไลด์${slidesCount > 1 ? ` (${slidesCount})` : ''}</span>
          </div>
        </div>
      `
      : renderPreviewPaneHtml(sub, isSlideOnly ? "slide" : "link", isSlideOnly ? slide : link, isSlideOnly ? slidePreviewSrc : linkPreviewSrc, false);

    const cardExtUrl = getLinkExternalUrl(link);
    const barUrl = isPaired
      ? `${sub.code} • สรุป + สไลด์ (${slidesCount})`
      : isSlideOnly
        ? `${sub.code} • สไลด์ PDF`
        : (cardExtUrl ? cardExtUrl.replace(/^https?:\/\//, "").slice(0, 36) : (isEmbeddedHtmlLink(link) ? "interactive-html://in-app" : ""));
    const showNewTag = isNewest || idx === 0;
    const hoverLabel = isPaired ? "เปิดอ่านเรื่องนี้ (เว็บสรุป + สไลด์)" : "เปิดเข้าเรื่องนี้";
    const ctaLabel = isPaired ? "เข้าเรื่องนี้ (สรุป + สไลด์)" : "เข้าเรื่องนี้";

    const subtitleLine = isPaired
      ? `${sub.title} • ${slidesCount} สไลด์ (${slide.title})`
      : `${sub.title}${topic.subtitle ? ` • ${topic.subtitle}` : (link?.subtitle ? ` • ${link.subtitle}` : "")}`;

    const otherMergeExists = isSlideOnly
      ? (sub.topics || []).some(t => t.id !== topic.id && Boolean(t.link))
      : (!slide && (sub.topics || []).some(t => t.id !== topic.id && !t.link && (t.slides || []).length > 0));

    const quickFillBtn = otherMergeExists
      ? `<button onclick="event.stopPropagation(); openPairTopicModal('${isSlideOnly ? 'slide' : 'link'}', '${sub.id}', '${topic.id}')" class="admin-only h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)] bg-[var(--accent-08)] hover:bg-[var(--accent-14)] border border-[var(--accent-32)] transition" title="รวมรายการในวิชานี้เข้าเรื่องเดียวกัน"><i class="ph ph-git-merge text-xs"></i><span>รวมกับ${isSlideOnly ? 'สรุป' : 'สไลด์'}ที่มี</span></button>`
      : `<button onclick="event.stopPropagation(); openTopicModal('${sub.id}', '${topic.id}', '${!slide ? 'slide' : 'link'}')" class="admin-only h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-medium text-[var(--tx2)] bg-[var(--s2)] hover:bg-[var(--s3)] border border-[var(--line)] transition" title="แก้ไขเรื่อง / เพิ่มสไลด์ / แก้เว็บสรุป"><i class="ph ph-pencil-simple text-xs"></i><span>${!slide ? '+ เพิ่มสไลด์' : (isSlideOnly ? '+ ใส่สรุป' : 'แก้เรื่อง')}</span></button>`;

    return `
      <article onclick="${clickAction}" class="group cursor-pointer sv-surface rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[var(--accent-32)] flex flex-col justify-between">
        <div class="relative bg-[var(--rail)] border-b border-[var(--line)]">
          <div class="px-3.5 py-2 bg-[var(--s1)]/80 border-b border-[var(--line)] flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-400/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-amber-400/80"></span>
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-400/80"></span>
            </div>
            <div class="flex-1 mx-2 px-2.5 py-0.5 rounded-md bg-[var(--rail)] border border-[var(--line)] text-[10px] text-[var(--tx3)] truncate text-center tnum">
              ${barUrl}
            </div>
            ${showNewTag ? `<span class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">NEW</span>` : `<span class="text-[10px] text-[var(--tx3)] tnum">${topic.updatedAt || ""}</span>`}
          </div>

          <div class="card-preview-box ${isPaired ? '' : 'preview-scale-host'} relative w-full aspect-[16/10] overflow-hidden bg-[var(--bg)]">
            ${previewBody}
            <div class="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <span class="sv-btn-primary h-9 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-xl transform translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
                <span>${hoverLabel}</span>
                <i class="ph ph-arrow-right"></i>
              </span>
            </div>
          </div>
        </div>

        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-1.5 flex-wrap tnum">
                <button onclick="event.stopPropagation(); selectHomeSubject('${sub.id}')" class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--accent-08)] text-[var(--accent)] border border-[var(--accent-32)] hover:opacity-80 transition">
                  ${sub.code}
                </button>
                ${isPaired ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-r from-indigo-500/20 to-pink-500/20 text-purple-300 border border-purple-400/30 flex items-center gap-1"><i class="ph ph-split-horizontal"></i><span>สรุป + สไลด์</span></span>` : `${linkBadge}${slideBadge}`}
              </div>
              <div class="flex items-center gap-1">
                ${quickFillBtn}
                <button onclick="event.stopPropagation(); deleteHomeTopic('${sub.id}', '${topic.id}')" class="admin-only w-7 h-7 rounded-lg flex items-center justify-center text-[var(--danger)] bg-[var(--danger-bg)] hover:opacity-80 transition" title="ลบเรื่องนี้">
                  <i class="ph ph-trash text-xs"></i>
                </button>
              </div>
            </div>

            <h3 class="font-bold text-base text-[var(--tx)] group-hover:text-[var(--accent)] transition-colors leading-snug line-clamp-2">
              ${mainTitle}
            </h3>
            <p class="text-[11px] text-[var(--tx3)] line-clamp-1">${subtitleLine}</p>
          </div>

          <div class="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2 text-xs">
            <span class="text-[11px] text-[var(--tx3)] tnum">${topic.updatedAt || sub.lastUpdated || ""}</span>
            <div class="flex items-center gap-2">
              ${(isEmbeddedHtmlLink(link) && cardExtUrl) ? `
                <a href="${cardExtUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--accent-08)] hover:bg-[var(--accent-14)] border border-[var(--accent-32)] text-[10px] font-semibold text-[var(--accent)] transition" title="เปิดลิงก์ต้นฉบับ (${cardExtUrl})">
                  <i class="ph ph-arrow-square-out"></i>
                  <span>เปิดลิงก์</span>
                </a>
              ` : ""}
              <span class="font-semibold text-[var(--accent)] flex items-center gap-1">
                <span>${ctaLabel}</span>
                <i class="ph ph-caret-right"></i>
              </span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function buildSubjectCardHtml(sub, previewSrc) {
    const isFav = favorites.has(sub.id);
    const topics = sub.topics || [];
    const firstLink = sub.links[0];
    const primaryUrl = getLinkExternalUrl(firstLink) || (isEmbeddedHtmlLink(firstLink) ? "embedded-html://summary" : (firstLink?.url || ""));

    const topicsQuickTray = topics.length > 0 ? `
      <div class="pt-2.5 border-t border-[var(--line)] space-y-1.5" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between text-[11px]">
          <span class="font-semibold text-[var(--tx2)] flex items-center gap-1">
            <i class="ph ph-book-bookmark text-[var(--accent)]"></i>
            <span>เรื่องในวิชานี้ (${topics.length})</span>
          </span>
          <button onclick="openTopicModal('${sub.id}')" class="admin-only text-[10px] font-medium text-[var(--tx3)] hover:text-[var(--accent)] transition">+ เพิ่มเรื่อง</button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          ${topics.slice(0, 4).map(t => {
            const hasSlide = (t.slides || []).length > 0;
            return `
            <button onclick="openTopicStudio('${sub.id}', '${t.id}')" class="max-w-full px-2.5 py-1 rounded-lg bg-[var(--rail)] hover:bg-[var(--s3)] border border-[var(--line-2)] hover:border-[var(--accent-32)] text-[11px] font-medium text-[var(--tx)] hover:text-[var(--accent)] flex items-center gap-1.5 transition truncate" title="เข้าเรื่อง ${t.title}">
              <i class="ph ${hasSlide && t.link ? 'ph-split-horizontal text-purple-400' : hasSlide ? 'ph-file-pdf text-rose-400' : 'ph-code text-emerald-400'} text-xs flex-shrink-0"></i>
              <span class="truncate max-w-[170px]">${t.title}</span>
            </button>
          `;}).join("")}
          ${topics.length > 4 ? `<button onclick="selectHomeSubject('${sub.id}')" class="px-2 py-1 rounded-lg bg-[var(--s3)] text-[10px] font-semibold text-[var(--accent)]">+${topics.length - 4} เรื่อง</button>` : ""}
        </div>
      </div>
    ` : `
      <div class="admin-only pt-2.5 border-t border-[var(--line)] flex items-center justify-between gap-2" onclick="event.stopPropagation()">
        <span class="text-[11px] text-[var(--tx3)] flex items-center gap-1">
          <i class="ph ph-book-bookmark"></i>
          <span>ยังไม่มีเรื่องในวิชานี้</span>
        </span>
        <button onclick="openTopicModal('${sub.id}')" class="px-2.5 py-1 rounded-lg bg-[var(--accent-08)] hover:bg-[var(--accent-14)] border border-[var(--accent-32)] text-[11px] font-medium text-[var(--accent)] flex items-center gap-1 transition">
          <i class="ph ph-plus text-xs"></i>
          <span>เพิ่มเรื่องแรก</span>
        </button>
      </div>
    `;

    return `
    <article 
      onclick="selectHomeSubject('${sub.id}')"
      class="group cursor-pointer sv-surface rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-[var(--accent-32)] flex flex-col justify-between"
    >
      <div class="relative bg-[var(--rail)] border-b border-[var(--line)]">
        <div class="px-3.5 py-2 bg-[var(--s1)]/80 border-b border-[var(--line)] flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-rose-400/80"></span>
            <span class="w-2.5 h-2.5 rounded-full bg-amber-400/80"></span>
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400/80"></span>
          </div>
          <div class="flex-1 mx-2 px-2.5 py-0.5 rounded-md bg-[var(--rail)] border border-[var(--line)] text-[10px] text-[var(--tx3)] truncate text-center tnum">
            ${primaryUrl ? primaryUrl.replace(/^https?:\/\//, "").slice(0, 38) : `${sub.code} • ${topics.length} เรื่อง`}
          </div>
          <span class="inline-flex items-center gap-1 text-[10px] font-semibold ${previewSrc ? 'text-emerald-500' : 'text-[var(--accent)]'}">
            <span class="w-1.5 h-1.5 rounded-full ${previewSrc ? 'bg-emerald-500' : 'bg-[var(--accent)]'}"></span>
            <span>${previewSrc ? 'Live' : 'Ready'}</span>
          </span>
        </div>

        <div class="card-preview-box preview-scale-host relative w-full aspect-[16/10] overflow-hidden bg-[var(--bg)]">
          ${previewSrc ? `
            <iframe src="${previewSrc}" class="preview-iframe-scale" loading="lazy" tabindex="-1" sandbox="allow-scripts allow-same-origin"></iframe>
          ` : `
            <div class="w-full h-full p-5 flex flex-col items-center justify-center text-center bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10">
              <div class="w-14 h-14 rounded-2xl bg-gradient-to-br ${sub.accent || 'from-indigo-500 to-purple-500'} flex items-center justify-center text-white text-2xl shadow-lg mb-3">
                ${sub.icon || '📘'}
              </div>
              <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--s1)] border border-[var(--line)] text-[var(--accent)] mb-1.5 tnum">${sub.code}</span>
              <p class="text-xs font-semibold text-[var(--tx)] line-clamp-1 max-w-[240px]">${topics[0]?.title || sub.title}</p>
              <p class="text-[11px] text-[var(--tx3)] mt-1">คลิกเพื่อดูเรื่องต่างๆ ในวิชานี้</p>
            </div>
          `}

          <div class="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
            <span class="sv-btn-primary h-9 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-xl transform translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
              <span>ดูเรื่องในวิชานี้ (${topics.length})</span>
              <i class="ph ph-arrow-right"></i>
            </span>
          </div>
        </div>
      </div>

      <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
        <div class="space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 tnum">
              <span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[var(--accent-08)] text-[var(--accent)] border border-[var(--accent-32)]">
                ${sub.code}
              </span>
              <span class="text-[11px] text-[var(--tx3)]">${sub.category || 'ทั่วไป'}</span>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="event.stopPropagation(); toggleFavorite('${sub.id}')" class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--s3)] transition-colors ${isFav ? 'text-amber-400' : 'text-[var(--tx4)] hover:text-amber-400'}" title="ติดดาว">
                <i class="ph ${isFav ? 'ph-star-fill' : 'ph-star'} text-sm"></i>
              </button>
              <button onclick="event.stopPropagation(); deleteSubject('${sub.id}')" class="admin-only h-7 px-2 rounded-lg flex items-center gap-1 text-[11px] font-medium text-[var(--danger)] bg-[var(--danger-bg)] hover:opacity-80 transition-opacity" title="ลบวิชานี้">
                <i class="ph ph-trash text-xs"></i>
                <span>ลบ</span>
              </button>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${sub.accent || 'from-indigo-500 to-purple-500'} flex items-center justify-center text-white text-lg shadow-sm flex-shrink-0">
              ${sub.icon || '📘'}
            </div>
            <h3 class="font-bold text-base text-[var(--tx)] group-hover:text-[var(--accent)] transition-colors leading-snug line-clamp-2">
              ${sub.title}
            </h3>
          </div>
        </div>

        ${topicsQuickTray}

        <div class="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2 tnum">
          <div class="flex items-center gap-3 text-[11px] text-[var(--tx2)]">
            <span class="flex items-center gap-1"><i class="ph ph-book-open-text text-[var(--accent)]"></i> ${topics.length} เรื่อง</span>
            <span class="flex items-center gap-1"><i class="ph ph-presentation-chart text-pink-500"></i> ${sub.slides.length} สไลด์</span>
          </div>
          <span class="text-xs font-semibold text-[var(--accent)] flex items-center gap-0.5">
            <span>ดูเรื่องในวิชานี้</span><i class="ph ph-caret-right"></i>
          </span>
        </div>
      </div>
    </article>
    `;
  }

  // 3. Level 1: Subject Tabs + Topic/Slide Preview Cards Gallery
  async function renderSubjectsGrid() {
    previewResizeObserver.disconnect();
    pdfThumbToken++;

    const catSubjects = allSubjects.filter(sub => {
      if (currentCategory === "⭐ ติดดาว") return favorites.has(sub.id);
      if (currentCategory !== "ทั้งหมด") return sub.category === currentCategory;
      return true;
    });

    renderSubjectTabs(catSubjects);

    const selectedSub = selectedHomeSubjectId !== "__ALL__"
      ? catSubjects.find(s => s.id === selectedHomeSubjectId) || null
      : null;
    renderSelectedSubjectBanner(selectedSub);

    const q = searchQuery.toLowerCase().trim();
    const scopeSubjects = selectedSub ? [selectedSub] : catSubjects;

    if (catSubjects.length === 0) {
      subjectsGrid.innerHTML = `
        <div class="col-span-full sv-surface rounded-3xl py-16 px-6 text-center max-w-md mx-auto">
          <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[var(--s3)] border border-[var(--accent-32)] flex items-center justify-center text-2xl text-[var(--accent)]">
            <i class="ph ph-books"></i>
          </div>
          <p class="text-sm font-bold text-[var(--tx)]">ยังไม่มีรายวิชาในหมวดนี้</p>
          <p class="admin-only text-xs text-[var(--tx3)] mt-1 mb-4">เพิ่มรายวิชาใหม่ (ใส่แค่รหัสวิชากับชื่อวิชา) เพื่อเริ่มต้นจัดเก็บลิงก์และสไลด์</p>
          <p class="visitor-only text-xs text-[var(--tx3)] mt-1 mb-4">ยังไม่มีรายวิชาเผยแพร่อยู่ในขณะนี้ หากคุณเป็นเจ้าของเว็บสามารถล็อกอิน Admin เพื่อเพิ่มวิชาได้</p>
          <button onclick="document.getElementById('open-add-subject-btn').click()" class="admin-only sv-btn-primary h-9 px-4 rounded-xl text-xs">+ เพิ่มวิชาใหม่</button>
          <button onclick="openAdminModal()" class="visitor-only sv-btn-primary h-9 px-4 rounded-xl text-xs">🔑 เจ้าของเว็บ (Admin)</button>
        </div>
      `;
      return;
    }

    // Overview Subjects mode (when "__ALL__" is active and user switches to "การ์ดรายวิชา")
    if (!selectedSub && homeViewMode === "subjects") {
      const matchedSubs = scopeSubjects.filter(sub =>
        !q ||
        sub.title.toLowerCase().includes(q) ||
        sub.code.toLowerCase().includes(q) ||
        sub.links.some(l => l.title.toLowerCase().includes(q)) ||
        sub.slides.some(sl => sl.title.toLowerCase().includes(q))
      );
      if (matchedSubs.length === 0) {
        subjectsGrid.innerHTML = `<div class="col-span-full sv-surface rounded-3xl py-12 px-6 text-center text-xs text-[var(--tx3)]">ไม่พบวิชาที่ตรงกับ "${searchQuery}"</div>`;
        return;
      }
      const resolvedCards = await Promise.all(matchedSubs.map(async sub => {
        let previewSrc = null;
        const firstEmbeddable = sub.links.find(l => isEmbeddedHtmlLink(l) || (l.url && !l.frameRestricted && !isLikelyRestrictedUrl(l.url)));
        if (firstEmbeddable) previewSrc = await resolveResourceUrl(firstEmbeddable);
        return { sub, previewSrc };
      }));
      subjectsGrid.innerHTML = resolvedCards.map(({ sub, previewSrc }) => buildSubjectCardHtml(sub, previewSrc)).join("");
      document.querySelectorAll(".preview-scale-host").forEach(box => previewResizeObserver.observe(box));
      return;
    }

    // Topic & Slide Unified Feed Cards (summary + paired slide combined cleanly)
    const rawEntries = [];
    for (const sub of scopeSubjects) {
      const subTopics = extractSubjectTopics(sub);
      for (const entry of subTopics) {
        const match = !q ||
          sub.code.toLowerCase().includes(q) ||
          sub.title.toLowerCase().includes(q) ||
          (entry.link && (entry.link.title.toLowerCase().includes(q) || (entry.link.subtitle || "").toLowerCase().includes(q))) ||
          (entry.slide && entry.slide.title.toLowerCase().includes(q));
        if (match) rawEntries.push(entry);
      }
    }

    // Sort newest uploaded first ("อันไหนอัพใหม่ก็ขึ้นมาใหม่")
    rawEntries.sort((a, b) => b.sortTs - a.sortTs);

    const resolvedEntries = await Promise.all(rawEntries.map(async entry => {
      let linkPreviewSrc = null;
      let slidePreviewSrc = null;
      if (entry.link) {
        const l = entry.link;
        if (isEmbeddedHtmlLink(l) || (l.url && !l.frameRestricted && !isLikelyRestrictedUrl(l.url))) {
          linkPreviewSrc = await resolveResourceUrl(l);
        }
      }
      if (entry.slide && entry.slide.type === "images") {
        const urls = await resolveImageDeckUrls(entry.slide);
        if (urls.length > 0) slidePreviewSrc = urls[0];
      }
      const isNewest = Date.now() - entry.sortTs < 48 * 3600 * 1000;
      return { ...entry, linkPreviewSrc, slidePreviewSrc, isNewest };
    }));

    const parts = resolvedEntries.map((entry, idx) => buildFeedItemCardHtml(entry, idx));

    // Also handle Selected Empty Subject OR Empty Subjects below feed
    if (selectedSub && resolvedEntries.length === 0) {
      parts.push(`
        <div class="col-span-full sv-surface rounded-3xl py-14 px-6 text-center max-w-md mx-auto">
          <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br ${selectedSub.accent || 'from-indigo-500 to-purple-500'} flex items-center justify-center text-white text-xl shadow-lg">
            ${selectedSub.icon || '📘'}
          </div>
          <p class="text-sm font-bold text-[var(--tx)]">${selectedSub.code} — ${selectedSub.title}</p>
          <p class="text-xs text-[var(--tx3)] mt-1 mb-4">ยังไม่มีเรื่องในวิชานี้ — กดเพิ่มเรื่องเพื่อใส่เว็บสรุปและสไลด์ PDF เข้าไว้ด้วยกันได้เลย</p>
          <div class="admin-only flex items-center justify-center gap-2 flex-wrap">
            <button onclick="openTopicModal('${selectedSub.id}')" class="sv-btn-primary h-9 px-4 rounded-xl text-xs">+ เพิ่มเรื่องใหม่ในวิชานี้</button>
          </div>
        </div>
      `);
    } else if (!selectedSub) {
      const emptySubjects = scopeSubjects.filter(s => (s.topics || []).length === 0 && (!q || s.title.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)));
      if (emptySubjects.length > 0) {
        if (resolvedEntries.length > 0) {
          parts.push(`
            <div class="col-span-full pt-4 border-t border-[var(--line)] flex items-center justify-between">
              <span class="text-xs font-semibold text-[var(--tx3)]">รายวิชาที่ยังไม่มีเรื่อง (${emptySubjects.length} วิชา — กดเลือกเพื่อดูหรือเพิ่มข้อมูล)</span>
            </div>
          `);
        }
        emptySubjects.forEach(sub => parts.push(buildSubjectCardHtml(sub, null)));
      }
    }

    if (parts.length === 0) {
      subjectsGrid.innerHTML = `<div class="col-span-full sv-surface rounded-3xl py-12 px-6 text-center text-xs text-[var(--tx3)]">ไม่พบเรื่องหรือสไลด์ที่ตรงกับ "${searchQuery}"</div>`;
      return;
    }

    subjectsGrid.innerHTML = parts.join("");
    document.querySelectorAll(".preview-scale-host").forEach(box => previewResizeObserver.observe(box));

    const pdfThumbsToRender = resolvedEntries
      .filter(e => e.slide && e.slide.type === "pdf" && !pdfThumbCache.has(e.slide.id))
      .map(e => ({ item: e.slide }));
    if (pdfThumbsToRender.length > 0) {
      hydratePdfCardThumbnails(pdfThumbsToRender);
    }
  }

  // 4. Delete Subject + Manage Subjects List + Undo
  function renderManageSubjectsList() {
    if (!manageSubjectsList) return;
    manageSubjectsCount.textContent = `${allSubjects.length} วิชา`;

    if (allSubjects.length === 0) {
      manageSubjectsList.innerHTML = `<p class="text-center py-4 text-[var(--tx3)]">ยังไม่มีรายวิชาในคลัง</p>`;
      return;
    }

    manageSubjectsList.innerHTML = allSubjects.map(sub => `
      <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--rail)] border border-[var(--line)]">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-7 h-7 rounded-lg bg-gradient-to-br ${sub.accent || 'from-indigo-500 to-purple-500'} text-white flex items-center justify-center text-xs flex-shrink-0">
            ${sub.icon || '📘'}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-bold text-[var(--accent)] tnum">${sub.code}</span>
              <span class="text-xs font-semibold text-[var(--tx)] truncate">${sub.title}</span>
            </div>
            <span class="text-[10px] text-[var(--tx3)]">${(sub.topics || []).length} เรื่อง • ${sub.slides.length} สไลด์</span>
          </div>
        </div>
        <button onclick="deleteSubject('${sub.id}')" class="px-2.5 py-1 rounded-lg bg-[var(--danger-bg)] text-[var(--danger)] hover:opacity-80 font-medium text-[11px] flex items-center gap-1 flex-shrink-0 transition">
          <i class="ph ph-trash"></i>
          <span>ลบวิชา</span>
        </button>
      </div>
    `).join("");
  }

  window.deleteSubject = function(subjectId) {
    const sub = allSubjects.find(s => s.id === subjectId);
    if (!sub) return;

    const wasCustom = customSubjects.some(s => s.id === subjectId);
    let removedCustom = null;
    if (wasCustom) {
      removedCustom = customSubjects.find(s => s.id === subjectId);
      customSubjects = customSubjects.filter(s => s.id !== subjectId);
    } else {
      deletedSubjectIds.add(subjectId);
    }

    if (lockedSubjectId === subjectId) {
      lockedSubjectId = "";
      localStorage.removeItem(LS_LOCKED_SUBJECT);
    }

    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    renderCategories();
    renderManageSubjectsList();
    syncSubjectSelects();

    if (activeSubjectId === subjectId) navigateHome();
    else renderSubjectsGrid();

    showToast(`ลบวิชา "${sub.title}" แล้ว`, () => {
      if (wasCustom && removedCustom) customSubjects.unshift(removedCustom);
      else deletedSubjectIds.delete(subjectId);
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      renderCategories();
      renderManageSubjectsList();
      syncSubjectSelects();
      renderSubjectsGrid();
      triggerAutoSyncIfEnabled();
    });
    triggerAutoSyncIfEnabled();
  };

  // 5. Level 3: Topic Studio (Inside a Specific Topic: Summary Web + Slides Together)
  window.openTopicStudio = function(subjectId, topicId = null, options = {}) {
    openSubject(subjectId, true, { ...options, topicId });
  };

  window.openSubjectTopic = function(subjectId, topicOrLinkId = null, slideId = null) {
    openSubject(subjectId, true, { topicId: topicOrLinkId, linkId: topicOrLinkId, slideId });
  };

  window.openSubjectSlide = function(subjectId, slideId = null) {
    openSubject(subjectId, true, { openSlides: true, slideId });
  };

  window.openAddSlideModalForSubject = function(subjectId) {
    openTopicModal(subjectId, null, "slide");
  };

  function getActiveTopicRecord(sub, preferredTopicId = null) {
    const topics = sub?.topics || [];
    if (topics.length === 0) return null;
    const byId = preferredTopicId ? topics.find(t => t.id === preferredTopicId) : null;
    if (byId) return byId;
    const byActive = activeTopicId ? topics.find(t => t.id === activeTopicId) : null;
    return byActive || topics[0];
  }

  window.openSubject = function(subjectId, updateHash = true, options = {}) {
    const sub = allSubjects.find(s => s.id === subjectId);
    if (!sub) return;

    const topics = sub.topics || [];
    let topic = null;
    if (options.topicId) topic = topics.find(t => t.id === options.topicId) || null;
    if (!topic && options.linkId) topic = topics.find(t => t.link?.id === options.linkId) || null;
    if (!topic && options.slideId) topic = topics.find(t => (t.slides || []).some(sl => sl.id === options.slideId)) || null;
    if (!topic) topic = getActiveTopicRecord(sub);

    activeSubjectId = subjectId;
    selectedHomeSubjectId = subjectId;
    activeTopicId = topic ? topic.id : null;

    const topicSlides = topic ? (topic.slides || []) : [];
    if (options.openSlides !== undefined) {
      isSplitMode = Boolean(options.openSlides);
    } else {
      isSplitMode = topicSlides.length > 0 || isAdminMode();
    }
    isSlideExpanded = Boolean(options.expandSlides);

    if (updateHash) {
      window.location.hash = activeTopicId ? `subject/${subjectId}/topic/${activeTopicId}` : `subject/${subjectId}`;
    }

    wsIcon.className = `w-9 h-9 rounded-xl bg-gradient-to-br ${sub.accent || 'from-indigo-500 to-purple-500'} flex items-center justify-center text-white text-base shadow-sm flex-shrink-0`;
    wsIcon.innerHTML = sub.icon || "📘";
    wsCode.textContent = sub.code;
    wsCategory.textContent = sub.category || "ทั่วไป";
    wsTitle.textContent = sub.title;
    if (wsTopicTitle) wsTopicTitle.textContent = topic ? topic.title : "ยังไม่มีเรื่องในวิชานี้";
    wsDesc.textContent = topic?.subtitle || sub.description || `คลังสรุปและสไลด์เรียนวิชา ${sub.title}`;
    if (wsDeleteSubjectBtn) wsDeleteSubjectBtn.onclick = () => deleteSubject(subjectId);

    if (wsTopicSwitcher) {
      wsTopicSwitcher.innerHTML = topics.length
        ? topics.map((t, idx) => `<option value="${t.id}" ${t.id === activeTopicId ? "selected" : ""}>${String(idx + 1).padStart(2, "0")}. ${t.title}</option>`).join("")
        : `<option value="">ยังไม่มีเรื่อง</option>`;
      wsTopicSwitcher.classList.toggle("hidden", topics.length <= 1);
      wsTopicSwitcher.onchange = e => { if (e.target.value) openTopicStudio(subjectId, e.target.value); };
    }

    viewHome.classList.add("hidden");
    viewSubject.classList.remove("hidden");

    updateWorkspaceStar();
    renderWorkspaceLinks(sub, topic);
    renderWorkspaceSlides(sub, topic);
    applySplitModeLayout();

    if (topic?.link) {
      selectLink(topic.link.id);
    } else {
      activeLinkId = null;
      showEmptyLinkStage();
    }

    if (topicSlides.length > 0) {
      const requestedSlide = options.slideId && topicSlides.some(sl => sl.id === options.slideId) ? options.slideId : null;
      const keepSlide = !requestedSlide && topicSlides.some(sl => sl.id === activeSlideId) ? activeSlideId : null;
      selectSlide(requestedSlide || keepSlide || topicSlides[0].id, false);
    } else {
      activeSlideId = null;
      renderSlideEmpty();
    }

    if (options.openSlides && window.innerWidth < 1024) {
      requestAnimationFrame(() => wsSlidePane.scrollIntoView({ behavior: "smooth", block: "start" }));
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  window.navigateHome = function(updateHash = true, forceSubjectId = undefined) {
    if (forceSubjectId !== undefined) selectedHomeSubjectId = forceSubjectId || "__ALL__";
    activeSubjectId = null;
    activeTopicId = null;
    activeLinkId = null;
    activeSlideId = null;
    isSplitMode = false;
    isSlideExpanded = false;
    activePdfDoc = null;
    pdfBuildToken++;
    clearTimeout(iframeTimeoutHandle);
    clearInterval(iframePollHandle);
    iframeLoadToken++;
    stageIframe.removeAttribute("srcdoc");
    stageIframe.src = "about:blank";
    slideIframe.src = "about:blank";
    if (updateHash) history.pushState("", document.title, window.location.pathname + window.location.search);
    viewSubject.classList.add("hidden");
    viewHome.classList.remove("hidden");
    renderSubjectsGrid();
    requestAnimationFrame(updateScopeThumb);
  };

  function updateWorkspaceStar() {
    const isFav = favorites.has(activeSubjectId);
    wsStarBtn.innerHTML = `<i class="ph ${isFav ? 'ph-star-fill text-amber-400' : 'ph-star'} text-sm"></i>`;
  }
  wsStarBtn.addEventListener("click", () => {
    if (activeSubjectId) {
      toggleFavorite(activeSubjectId);
      updateWorkspaceStar();
    }
  });

  // 6. Topic Summary Links + Edit + Delete + Undo
  function renderWorkspaceLinks(sub, topic = null) {
    const activeTopic = topic || getActiveTopicRecord(sub);
    const links = activeTopic?.link ? [activeTopic.link] : [];
    wsLinksCount.textContent = String(links.length).padStart(2, "0");

    splitLinkSelect.innerHTML = (sub.topics || []).length
      ? (sub.topics || []).map((t, i) => `<option value="${t.id}" ${t.id === activeTopicId ? "selected" : ""}>${String(i + 1).padStart(2, "0")}. ${t.title}</option>`).join("")
      : `<option value="">ยังไม่มีเรื่อง</option>`;
    splitLinkSelect.onchange = e => { if (e.target.value) openTopicStudio(sub.id, e.target.value); };

    if (links.length === 0) {
      wsLinksList.innerHTML = `
        <div class="sv-rail p-4 rounded-xl text-center space-y-2">
          <p class="text-xs text-[var(--tx3)]">เรื่องนี้ยังไม่มีเว็บสรุป</p>
          <button onclick="editActiveTopic('link', true)" class="admin-only text-xs text-[var(--accent)] font-semibold hover:underline">+ เพิ่มโค้ด HTML / ลิงก์สรุป</button>
        </div>
      `;
      return;
    }

    wsLinksList.innerHTML = links.map((link, idx) => {
      const isSelected = link.id === activeLinkId;
      const num = String(idx + 1).padStart(2, "0");

      return `
        <div 
          onclick="selectLink('${link.id}')"
          class="group cursor-pointer p-3 rounded-xl border transition-all duration-200 flex items-start gap-2.5 ${
            isSelected
              ? "bg-[var(--accent-08)] border-[var(--accent-32)] shadow-sm"
              : "bg-[var(--s1)] border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[var(--s2)]"
          }"
        >
          <span class="tnum w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
            isSelected ? "bg-[var(--accent)] text-white" : "bg-[var(--rail)] text-[var(--tx3)]"
          }">${num}</span>

          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-1">
              <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--rail)] text-[var(--tx2)] border border-[var(--line)]">
                ${link.badge || link.type || "Web"}
              </span>
              <div class="flex items-center gap-0.5">
                <button onclick="event.stopPropagation(); editActiveTopic('link')" class="admin-only text-[var(--tx3)] hover:text-[var(--accent)] p-1 rounded transition-colors" title="แก้ไข / วางโค้ด HTML">
                  <i class="ph ph-pencil-simple text-xs"></i>
                </button>
                ${(getLinkExternalUrl(link) || link.url) ? `
                  <a href="${getLinkExternalUrl(link) || link.url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-[var(--tx3)] hover:text-[var(--accent)] p-1 transition-colors" title="${getLinkExternalUrl(link) ? 'เปิดลิงก์ต้นฉบับ' : 'เปิดแท็บใหม่'}">
                    <i class="ph ph-arrow-square-out text-xs"></i>
                  </a>
                ` : ''}
                <button onclick="event.stopPropagation(); deleteLink('${link.id}')" class="admin-only text-[var(--danger)] hover:opacity-80 p-1 rounded transition-opacity" title="ลบเว็บสรุปออกจากเรื่องนี้">
                  <i class="ph ph-trash text-xs"></i>
                </button>
              </div>
            </div>

            <h4 class="text-xs font-semibold ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--tx)]'} leading-snug">${link.title}</h4>
            ${link.subtitle ? `<p class="text-[11px] text-[var(--tx3)] mt-1 line-clamp-2">${link.subtitle}</p>` : ''}
          </div>
        </div>
      `;
    }).join("");
  }

  window.deleteLink = function(linkId, overrideSubjectId = null, stayHome = false) {
    const targetSubId = overrideSubjectId || activeSubjectId;
    const sub = allSubjects.find(s => s.id === targetSubId);
    const ownerTopic = (sub?.topics || []).find(t => t.link?.id === linkId);
    if (!sub || !ownerTopic) return;
    const promoted = promoteTopicToCustom(targetSubId, ownerTopic.id);
    if (!promoted) return;
    const removedLink = promoted.link;
    promoted.link = null;

    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    if (!viewHome.classList.contains("hidden") || stayHome) renderSubjectsGrid();
    else if (activeSubjectId === targetSubId) openSubject(targetSubId, false, { topicId: promoted.id });

    showToast(`ลบเว็บสรุป "${removedLink?.title || ''}" ออกจากเรื่องนี้แล้ว`, () => {
      promoted.link = removedLink;
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      if (!viewHome.classList.contains("hidden")) renderSubjectsGrid();
      else if (activeSubjectId === targetSubId) openSubject(targetSubId, false, { topicId: promoted.id });
      triggerAutoSyncIfEnabled();
    });
    triggerAutoSyncIfEnabled();
  };

  function showEmptyLinkStage() {
    clearTimeout(iframeTimeoutHandle);
    clearInterval(iframePollHandle);
    iframeLoadToken++;
    stageIframe.removeAttribute("srcdoc");
    stageIframe.src = "about:blank";
    stageLoader.classList.add("hidden");
    stageTimeoutBar.classList.add("hidden");
    stageRestrictedView.classList.add("hidden");
    stageIframeWrapper.classList.add("hidden");
    stageEmptyView.classList.remove("hidden");
    stageUrlText.textContent = "ไม่มีเว็บสรุป";
    stageExternalBtn.classList.add("hidden");
  }

  let iframeLoadToken = 0;
  let iframePollHandle = null;
  let lastStageUrl = "";
  let lastStageLink = null;

  // 7. Select Link + Smart Embedding
  window.selectLink = async function(linkId) {
    const sub = allSubjects.find(s => s.id === activeSubjectId);
    if (!sub) return;
    const link = sub.links.find(l => l.id === linkId);
    if (!link) return;

    activeLinkId = linkId;
    renderWorkspaceLinks(sub);
    stageEmptyView.classList.add("hidden");
    stageTimeoutBar.classList.add("hidden");
    stageExternalBtn.classList.remove("hidden");

    const resolvedUrl = await resolveResourceUrl(link);
    if (activeLinkId !== linkId) return;

    const extUrl = getLinkExternalUrl(link);
    const isHtml = isEmbeddedHtmlLink(link);
    stageUrlText.textContent = extUrl || (isHtml ? "embedded-html://summary" : resolvedUrl);
    stageExternalBtn.href = extUrl || resolvedUrl;
    const stageExternalLabel = document.getElementById("stage-external-label");
    if (stageExternalLabel) {
      stageExternalLabel.textContent = (isHtml && extUrl) ? "เปิดลิงก์ต้นฉบับ" : "เปิดเต็มจอ";
    }
    stageExternalBtn.title = (isHtml && extUrl) ? `เปิดลิงก์ต้นฉบับ (${extUrl})` : "เปิดเต็มจอในแท็บใหม่";

    const isRestricted = !isHtml && (link.frameRestricted || isLikelyRestrictedUrl(resolvedUrl));

    if (isRestricted) {
      clearTimeout(iframeTimeoutHandle);
      clearInterval(iframePollHandle);
      iframeLoadToken++;
      stageLoader.classList.add("hidden");
      stageIframeWrapper.classList.add("hidden");
      stageRestrictedView.classList.remove("hidden");

      restrictedAppIcon.className = `w-9 h-9 rounded-xl bg-gradient-to-br ${sub.accent || 'from-indigo-500 to-purple-500'} flex items-center justify-center text-white text-sm shadow-sm`;
      restrictedAppIcon.innerHTML = sub.icon || "📘";
      restrictedAppTitle.textContent = sub.code + " • " + sub.title;
      restrictedAppSubtitle.textContent = link.subtitle || "Web App";
      restrictedLinkName.textContent = link.title;
      restrictedOpenBtn.href = resolvedUrl;
    } else {
      loadStageIframe(resolvedUrl, link);
    }
  };

  async function tryFallbackHtmlSrcdoc(url, link, token) {
    if (token !== iframeLoadToken) return false;
    try {
      let htmlText = "";
      const keyCandidates = [link?.idbKey, link?.id ? ("cached-link-" + link.id) : ""].filter(Boolean);
      for (const k of keyCandidates) {
        const blob = await StudyVaultDB.getBlob(k).catch(() => null);
        if (blob instanceof Blob) {
          htmlText = await blob.text();
          if (htmlText && htmlText.trim().length > 20) break;
        }
      }
      if (!htmlText && link) {
        const rel = link.repoPath || (String(link.url || "").startsWith("shared-assets/") ? link.url : "");
        if (rel) {
          const cfg = typeof StudyVaultSync !== "undefined" ? StudyVaultSync.getConfig() : { owner: "PhumshopRT", repo: "STUDY_WEB", branch: "main" };
          const candidates = [rel, `https://raw.githubusercontent.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${encodeURIComponent(cfg.branch)}/${rel}?t=${Date.now()}`];
          for (const candidate of candidates) {
            try {
              const res = await fetch(candidate, { cache: "no-store" });
              if (res.ok) {
                const txt = await res.text();
                if (txt && txt.trim().length > 20) {
                  htmlText = txt;
                  break;
                }
              }
            } catch {}
          }
        }
      }
      if (token !== iframeLoadToken || !htmlText) return false;
      stageIframe.srcdoc = htmlText;
      stageLoader.classList.add("hidden");
      return true;
    } catch {
      return false;
    }
  }

  function loadStageIframe(url, link = null, forceReload = false) {
    const token = ++iframeLoadToken;
    lastStageUrl = url;
    lastStageLink = link;
    clearTimeout(iframeTimeoutHandle);
    clearInterval(iframePollHandle);

    stageRestrictedView.classList.add("hidden");
    stageEmptyView.classList.add("hidden");
    stageTimeoutBar.classList.add("hidden");
    stageIframeWrapper.classList.remove("hidden");
    stageLoader.classList.remove("hidden");

    const isExternalHttp = String(url || "").startsWith("http");
    const isEmbeddedHtml = isEmbeddedHtmlLink(link) || String(url || "").startsWith("blob:") || String(url || "").startsWith("shared-assets/");

    const finishLoading = () => {
      if (token !== iframeLoadToken) return;
      clearTimeout(iframeTimeoutHandle);
      clearInterval(iframePollHandle);
      stageLoader.classList.add("hidden");
    };

    stageIframe.onload = () => {
      if (token !== iframeLoadToken) return;
      try {
        const doc = stageIframe.contentDocument;
        if (doc && /page not found/i.test(doc.title || "") && isEmbeddedHtml) {
          clearInterval(iframePollHandle);
          tryFallbackHtmlSrcdoc(url, link, token);
          return;
        }
      } catch {}
      finishLoading();
    };

    stageIframe.onerror = () => {
      if (token !== iframeLoadToken) return;
      if (isEmbeddedHtml) tryFallbackHtmlSrcdoc(url, link, token);
      else finishLoading();
    };

    // Reveal immediately as soon as DOM becomes interactive (don't block UI on slow CDN stylesheets/fonts!)
    if (!isExternalHttp) {
      let ticks = 0;
      iframePollHandle = setInterval(() => {
        if (token !== iframeLoadToken) {
          clearInterval(iframePollHandle);
          return;
        }
        ticks++;
        try {
          const doc = stageIframe.contentDocument;
          if (doc && doc.location && doc.location.href !== "about:blank") {
            if (/page not found/i.test(doc.title || "") && isEmbeddedHtml) {
              clearInterval(iframePollHandle);
              tryFallbackHtmlSrcdoc(url, link, token);
              return;
            }
            if ((doc.readyState === "interactive" || doc.readyState === "complete") && doc.body && doc.body.children.length > 0) {
              finishLoading();
              return;
            }
          }
        } catch {}
        if (ticks >= 40) clearInterval(iframePollHandle);
      }, 60);
    }

    const assignSrc = () => {
      if (token !== iframeLoadToken) return;
      stageIframe.removeAttribute("srcdoc");
      stageIframe.src = url;
    };

    if (forceReload || stageIframe.src === url) {
      stageIframe.removeAttribute("srcdoc");
      stageIframe.src = "about:blank";
      requestAnimationFrame(() => requestAnimationFrame(assignSrc));
    } else {
      assignSrc();
    }

    iframeTimeoutHandle = setTimeout(async () => {
      if (token !== iframeLoadToken) return;
      clearInterval(iframePollHandle);
      if (isEmbeddedHtml) {
        let hasRenderedDom = false;
        try {
          const doc = stageIframe.contentDocument;
          hasRenderedDom = Boolean(doc && doc.location?.href !== "about:blank" && doc.body && doc.body.children.length > 0 && !/page not found/i.test(doc.title || ""));
        } catch {}
        if (!hasRenderedDom) {
          await tryFallbackHtmlSrcdoc(url, link, token);
        }
      }
      if (token !== iframeLoadToken) return;
      stageLoader.classList.add("hidden");
      if (isExternalHttp) stageTimeoutBar.classList.remove("hidden");
    }, isExternalHttp ? 6500 : 2500);
  }

  window.openDualDesktopWindows = function() {
    const sub = allSubjects.find(s => s.id === activeSubjectId);
    const link = sub?.links.find(l => l.id === activeLinkId);
    if (!link) return;

    const availW = window.screen.availWidth || 1280;
    const availH = window.screen.availHeight || 800;
    const halfW = Math.floor(availW / 2);

    const externalTarget = getLinkExternalUrl(link) || link.url;
    if (externalTarget) {
      window.open(
        externalTarget,
        "studyvault_external_web",
        `left=0,top=0,width=${halfW},height=${availH},resizable=yes,scrollbars=yes`
      );
    }
    if (!isSplitMode) toggleSplitMode(true);
    showToast("เปิดเว็บไว้ด้านซ้ายแล้ว ดูคู่กับสไลด์ฝั่งขวาได้เลย");
  };

  window.popoutSlideWindow = function() {
    if (!activeSubjectId) return;
    const availW = window.screen.availWidth || 1280;
    const availH = window.screen.availHeight || 800;
    const halfW = Math.floor(availW / 2);
    const popUrl = `${window.location.pathname}?slidePopout=1&subject=${encodeURIComponent(activeSubjectId)}&slide=${encodeURIComponent(activeSlideId || "")}`;
    window.open(
      popUrl,
      "studyvault_slide_window",
      `left=${halfW},top=0,width=${halfW},height=${availH},resizable=yes,scrollbars=yes`
    );
  };

  stageRefreshBtn.addEventListener("click", () => {
    if (!stageIframeWrapper.classList.contains("hidden") && lastStageUrl) {
      loadStageIframe(lastStageUrl, lastStageLink, true);
    }
  });

  window.setViewport = function(mode) {
    ["desktop", "tablet", "mobile"].forEach(m => {
      const btn = document.getElementById("vp-" + m);
      btn.className = m === mode
        ? "px-2 py-1 rounded-md bg-[var(--s3)] text-[var(--accent)] transition-colors"
        : "px-2 py-1 rounded-md text-[var(--tx3)] hover:text-[var(--tx)] transition-colors";
    });
    if (mode === "desktop") {
      stageIframeWrapper.style.width = "100%";
      stageIframeWrapper.style.borderRadius = "0px";
    } else if (mode === "tablet") {
      stageIframeWrapper.style.width = "768px";
      stageIframeWrapper.style.maxWidth = "100%";
      stageIframeWrapper.style.borderRadius = "14px";
    } else if (mode === "mobile") {
      stageIframeWrapper.style.width = "390px";
      stageIframeWrapper.style.maxWidth = "100%";
      stageIframeWrapper.style.borderRadius = "20px";
    }
  };

  stageFullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) wsWebPane.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  });

  window.copyActiveUrl = function() {
    const sub = allSubjects.find(s => s.id === activeSubjectId);
    const link = sub?.links.find(l => l.id === activeLinkId);
    const toCopy = getLinkExternalUrl(link) || stageUrlText.textContent;
    navigator.clipboard.writeText(toCopy).then(() => showToast("คัดลอกลิงก์เรียบร้อย"));
  };

  // =========================================================================
  // 8. SIDE-BY-SIDE SPLIT MODE + EXPAND SLIDE + SIDE SWAP + DRAG RESIZER
  // =========================================================================
  window.toggleSplitMode = function(forceState = null) {
    isSplitMode = forceState !== null ? forceState : !isSplitMode;
    if (!isSplitMode) isSlideExpanded = false;
    applySplitModeLayout();
  };

  window.toggleSlideExpand = function(forceState = null) {
    if (!isSplitMode) isSplitMode = true;
    isSlideExpanded = forceState !== null ? forceState : !isSlideExpanded;
    applySplitModeLayout();
  };

  window.swapSplitSides = function() {
    isSwappedSides = !isSwappedSides;
    localStorage.setItem(LS_SWAP_SIDES, JSON.stringify(isSwappedSides));
    applySplitModeLayout();
    showToast(isSwappedSides ? "สลับสไลด์มาฝั่งซ้ายแล้ว" : "สลับเว็บสรุปมาฝั่งซ้ายแล้ว");
  };

  function applySplitModeLayout() {
    const sub = allSubjects.find(s => s.id === activeSubjectId);
    const activeTopic = sub ? getActiveTopicRecord(sub) : null;
    wsSlidesBadge.textContent = activeTopic ? (activeTopic.slides || []).length : 0;
    const expandBtn = document.getElementById("slide-expand-btn");

    if (isSplitMode) {
      wsSplitToggleBtn.className = "sv-btn-primary h-8 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-all";
      wsSidebar.classList.add("hidden");
      splitLinkSelect.classList.remove("hidden");
      wsSlidePane.classList.remove("hidden");
      wsSlidePane.classList.add("flex");

      if (isSlideExpanded) {
        wsWebPane.classList.add("hidden");
        splitResizer.classList.add("hidden");
        wsSwapSidesBtn.classList.add("hidden");
        wsSwapSidesBtn.classList.remove("flex");
        wsSlidePane.style.order = "1";
        wsSlidePane.style.flex = "1 1 100%";
        if (expandBtn) {
          expandBtn.innerHTML = `<i class="ph ph-arrows-in-simple text-sm"></i><span class="hidden sm:inline">เทียบข้าง</span>`;
          expandBtn.className = "h-7 px-2 rounded-lg flex items-center gap-1 bg-[var(--accent)] text-white text-[11px] font-medium transition-colors";
        }
      } else {
        wsWebPane.classList.remove("hidden");
        splitResizer.classList.remove("hidden");
        wsSwapSidesBtn.classList.remove("hidden");
        wsSwapSidesBtn.classList.add("flex");

        wsWebPane.style.order = isSwappedSides ? "3" : "1";
        splitResizer.style.order = "2";
        wsSlidePane.style.order = isSwappedSides ? "1" : "3";

        const leftVal = Math.max(25, Math.min(75, splitLeftPct));
        if (isSwappedSides) {
          wsSlidePane.style.flex = `0 0 ${leftVal}%`;
          wsWebPane.style.flex = `1 1 ${100 - leftVal}%`;
        } else {
          wsWebPane.style.flex = `0 0 ${leftVal}%`;
          wsSlidePane.style.flex = `1 1 ${100 - leftVal}%`;
        }
        if (expandBtn) {
          expandBtn.innerHTML = `<i class="ph ph-arrows-out-simple text-sm"></i><span class="hidden sm:inline">เต็มจอ</span>`;
          expandBtn.className = "h-7 px-2 rounded-lg flex items-center gap-1 text-[var(--tx2)] hover:text-[var(--accent)] hover:bg-[var(--s3)] text-[11px] font-medium transition-colors";
        }
      }
    } else {
      isSlideExpanded = false;
      wsSplitToggleBtn.className = "sv-surface h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all text-[var(--tx)]";
      wsSwapSidesBtn.classList.add("hidden");
      wsSwapSidesBtn.classList.remove("flex");
      wsSidebar.classList.remove("hidden");
      splitLinkSelect.classList.add("hidden");
      splitResizer.classList.add("hidden");
      wsWebPane.classList.remove("hidden");
      wsSlidePane.classList.add("hidden");
      wsSlidePane.classList.remove("flex");

      wsWebPane.style.order = "1";
      wsWebPane.style.flex = "1 1 100%";
      if (expandBtn) {
        expandBtn.innerHTML = `<i class="ph ph-arrows-out-simple text-sm"></i><span class="hidden sm:inline">เต็มจอ</span>`;
        expandBtn.className = "h-7 px-2 rounded-lg flex items-center gap-1 text-[var(--tx2)] hover:text-[var(--accent)] hover:bg-[var(--s3)] text-[11px] font-medium transition-colors";
      }
    }
  }

  let isDraggingSplit = false;
  splitResizer.addEventListener("mousedown", () => {
    isDraggingSplit = true;
    splitResizer.classList.add("dragging");
    stageIframe.style.pointerEvents = "none";
    slideIframe.style.pointerEvents = "none";
    document.body.style.cursor = "col-resize";
  });

  window.addEventListener("mousemove", e => {
    if (!isDraggingSplit || !isSplitMode) return;
    const rect = wsDualPanes.getBoundingClientRect();
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    splitLeftPct = Math.max(25, Math.min(75, pct));
    if (isSwappedSides) {
      wsSlidePane.style.flex = `0 0 ${splitLeftPct}%`;
      wsWebPane.style.flex = `1 1 ${100 - splitLeftPct}%`;
    } else {
      wsWebPane.style.flex = `0 0 ${splitLeftPct}%`;
      wsSlidePane.style.flex = `1 1 ${100 - splitLeftPct}%`;
    }
  });

  window.addEventListener("mouseup", () => {
    if (!isDraggingSplit) return;
    isDraggingSplit = false;
    splitResizer.classList.remove("dragging");
    stageIframe.style.pointerEvents = "auto";
    slideIframe.style.pointerEvents = "auto";
    document.body.style.cursor = "";
    localStorage.setItem(LS_SPLIT_PCT, JSON.stringify(splitLeftPct));
  });

  // =========================================================================
  // 9. GOODNOTES-STYLE PDF STUDIO READER + ANNOTATIONS + SLIDES
  // =========================================================================
  function renderWorkspaceSlides(sub, topic = null) {
    const activeTopic = topic || getActiveTopicRecord(sub);
    const slides = activeTopic ? (activeTopic.slides || []) : (sub.slides || []);
    wsSlidesCount.textContent = String(slides.length).padStart(2, "0");
    wsSlidesBadge.textContent = slides.length;

    slideDeckSelect.innerHTML = slides.length
      ? slides.map(sl => `<option value="${sl.id}" ${sl.id === activeSlideId ? "selected" : ""}>${sl.title}</option>`).join("")
      : `<option value="">ยังไม่มีสไลด์</option>`;
    slideDeckSelect.onchange = e => { if (e.target.value) selectSlide(e.target.value, false); };

    if (slides.length === 0) {
      wsSlidesList.innerHTML = `<div class="sv-rail p-3 rounded-xl text-center"><p class="text-[11px] text-[var(--tx3)]">เรื่องนี้ยังไม่มีสไลด์</p></div>`;
      return;
    }

    wsSlidesList.innerHTML = slides.map(sl => {
      const isSelected = sl.id === activeSlideId && isSplitMode;
      const iconClass = sl.type === "pdf" ? "ph-file-pdf" : sl.type === "images" ? "ph-images" : "ph-presentation-chart";
      return `
        <div onclick="selectSlide('${sl.id}', true)" class="group cursor-pointer p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${isSelected ? "bg-[var(--accent-08)] border-[var(--accent-32)]" : "bg-[var(--s1)] border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[var(--s2)]"}">
          <div class="flex items-center gap-2 min-w-0">
            <i class="ph ${iconClass} text-sm ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--tx3)]'} flex-shrink-0"></i>
            <span class="text-xs font-medium text-[var(--tx)] truncate">${sl.title}</span>
          </div>
          <button onclick="event.stopPropagation(); deleteSlide('${sl.id}')" class="admin-only text-[var(--danger)] hover:opacity-80 p-1 transition" title="ลบสไลด์">
            <i class="ph ph-trash text-xs"></i>
          </button>
        </div>
      `;
    }).join("");
  }

  function renderSlideEmpty() {
    slideIframe.classList.add("hidden");
    slidePdfViewer.classList.add("hidden");
    slideImageViewer.classList.add("hidden");
    slideDeleteBtn.classList.add("hidden");
    slideEmptyView.classList.remove("hidden");
  }

  function normalizeSlideEmbedUrl(url) {
    if (url.includes("docs.google.com/presentation/d/")) {
      const match = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
      if (match) return `https://docs.google.com/presentation/d/${match[1]}/embed?start=false&loop=false`;
    }
    return url;
  }

  // GoodNotes PDF Engine
  let activePdfDoc = null;
  let activePdfBlob = null;
  let activePdfSlideId = null;
  let activePdfTitle = "slides";
  let pdfZoom = 1;
  let pdfCurrPage = 1;
  let pdfObserver = null;
  let lastPdfContainerW = 0;
  let pdfResizeTimer = null;
  let pdfScrollRaf = null;
  let pdfBuildToken = 0;
  let pdfIsPinching = false;

  const LS_TOUCH_DRAW = "studyvault_pdf_touch_draw";
  const LS_PEN_SIZE = "studyvault_pdf_pen_size_v2";
  const LS_HL_SIZE = "studyvault_pdf_hl_size";
  let pdfTouchDrawEnabled = loadJSON(LS_TOUCH_DRAW, false); // false = 1-finger scroll + Apple Pencil draw (GoodNotes style)
  let activeStrokeSession = null;

  let activePdfTool = "pan";
  let pdfPenColor = "#38bdf8";
  let pdfPenSize = Math.max(0.1, Math.min(10, Number(loadJSON(LS_PEN_SIZE, 0.5)) || 0.5));
  let pdfHighlightColor = "#facc15";
  let pdfHighlightSize = Math.max(4, Math.min(36, Number(loadJSON(LS_HL_SIZE, 18)) || 18));
  let pdfAnnotations = {};
  let pdfUndoStacks = {};
  let pdfRedoStacks = {};

  const pdfColorPicker = document.getElementById("pdf-color-picker");
  const pdfSizeSlider = document.getElementById("pdf-size-slider");
  const pdfSizeLabel = document.getElementById("pdf-size-label");
  const pdfSizeDot = document.getElementById("pdf-size-dot");
  const pdfPreset01 = document.getElementById("pdf-preset-01");
  const pdfPreset05 = document.getElementById("pdf-preset-05");
  const pdfTouchModeBtn = document.getElementById("pdf-touch-mode-btn");
  const pdfTouchModeIcon = document.getElementById("pdf-touch-mode-icon");
  const pdfTouchModeLabel = document.getElementById("pdf-touch-mode-label");

  function getActiveToolColor() {
    return activePdfTool === "highlighter" ? pdfHighlightColor : pdfPenColor;
  }
  function getActiveToolSize() {
    return activePdfTool === "highlighter" ? pdfHighlightSize : pdfPenSize;
  }

  function syncAnnotationControls() {
    const color = getActiveToolColor();
    const size = getActiveToolSize();
    const isHl = activePdfTool === "highlighter";
    if (pdfColorPicker) pdfColorPicker.value = color;
    if (pdfSizeSlider) {
      pdfSizeSlider.min = isHl ? "4" : "0.1";
      pdfSizeSlider.max = isHl ? "36" : "10";
      pdfSizeSlider.step = isHl ? "1" : "0.1";
      pdfSizeSlider.value = String(size);
    }
    if (pdfSizeLabel) {
      pdfSizeLabel.textContent = isHl ? `${Math.round(size)}px` : `${Number(size).toFixed(1)}px`;
    }
    if (pdfSizeDot) {
      const dotPx = isHl
        ? Math.max(4, Math.min(18, Math.round(size * 0.55)))
        : Math.max(2, Math.min(14, Math.round(size * 1.4 + 1.5)));
      pdfSizeDot.style.width = `${dotPx}px`;
      pdfSizeDot.style.height = `${dotPx}px`;
      pdfSizeDot.style.backgroundColor = color;
      pdfSizeDot.style.opacity = isHl ? "0.6" : "1";
    }
    if (pdfPreset01 && pdfPreset05) {
      pdfPreset01.classList.toggle("hidden", isHl);
      pdfPreset05.classList.toggle("hidden", isHl);
      const is01 = !isHl && Math.abs(Number(size) - 0.1) < 0.05;
      const is05 = !isHl && Math.abs(Number(size) - 0.5) < 0.05;
      pdfPreset01.className = is01
        ? "px-1.5 h-5 rounded border border-[var(--accent)] bg-[var(--accent)] text-white text-[10px] font-semibold transition"
        : "px-1.5 h-5 rounded border border-[var(--line)] bg-[var(--s1)] hover:border-[var(--accent)] text-[10px] font-medium text-[var(--tx2)] transition";
      pdfPreset05.className = is05
        ? "px-1.5 h-5 rounded border border-[var(--accent)] bg-[var(--accent)] text-white text-[10px] font-semibold transition"
        : "px-1.5 h-5 rounded border border-[var(--line)] bg-[var(--s1)] hover:border-[var(--accent)] text-[10px] font-medium text-[var(--tx2)] transition";
    }
  }

  window.setPdfToolSize = function(val) {
    const num = Number(val);
    if (Number.isNaN(num)) return;
    if (activePdfTool === "pan" || activePdfTool === "eraser") setPdfTool("pen");
    if (activePdfTool === "highlighter") {
      pdfHighlightSize = Math.max(4, Math.min(36, num));
      localStorage.setItem(LS_HL_SIZE, JSON.stringify(pdfHighlightSize));
    } else {
      pdfPenSize = Math.max(0.1, Math.min(10, Math.round(num * 10) / 10));
      localStorage.setItem(LS_PEN_SIZE, JSON.stringify(pdfPenSize));
    }
    syncAnnotationControls();
  };

  function applyInkTouchSettings(inkCanvas) {
    const isDrawing = activePdfTool !== "pan";
    inkCanvas.style.pointerEvents = isDrawing ? "auto" : "none";
    inkCanvas.style.touchAction = isDrawing ? (pdfTouchDrawEnabled ? "none" : "pan-x pan-y") : "auto";
    inkCanvas.style.cursor = activePdfTool === "eraser" ? "cell" : isDrawing ? "crosshair" : "default";
  }

  function syncTouchDrawModeUI() {
    if (!pdfTouchModeBtn) return;
    if (pdfTouchDrawEnabled) {
      pdfTouchModeBtn.className = "h-7 px-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 text-[11px] font-medium flex items-center gap-1 transition whitespace-nowrap";
      if (pdfTouchModeIcon) pdfTouchModeIcon.className = "ph ph-hand-pointing text-sm";
      if (pdfTouchModeLabel) pdfTouchModeLabel.textContent = "นิ้วเขียน";
    } else {
      pdfTouchModeBtn.className = "h-7 px-2 rounded-lg border border-[var(--accent-32)] bg-[var(--accent-08)] text-[var(--accent)] text-[11px] font-medium flex items-center gap-1 transition whitespace-nowrap";
      if (pdfTouchModeIcon) pdfTouchModeIcon.className = "ph ph-hand-swipe-right text-sm";
      if (pdfTouchModeLabel) pdfTouchModeLabel.textContent = "นิ้วเลื่อน";
    }
    pdfPagesContainer.querySelectorAll(".pdf-ink-canvas").forEach(applyInkTouchSettings);
  }

  window.toggleTouchDrawMode = function() {
    pdfTouchDrawEnabled = !pdfTouchDrawEnabled;
    localStorage.setItem(LS_TOUCH_DRAW, JSON.stringify(pdfTouchDrawEnabled));
    syncTouchDrawModeUI();
    showToast(pdfTouchDrawEnabled
      ? "โหมด ☝️ นิ้วเขียน: 1 นิ้วเขียนได้ • 2 นิ้วเลื่อนและซูม"
      : "โหมด ✋ นิ้วเลื่อน (GoodNotes): 1 นิ้วเลื่อน • Apple Pencil เขียน • 2 นิ้วซูม");
  };
  syncTouchDrawModeUI();

  window.setPdfTool = function(tool) {
    activePdfTool = tool;
    ["pan", "pen", "highlighter", "eraser"].forEach(t => {
      const btn = document.getElementById("pdf-tool-" + t);
      if (!btn) return;
      if (t === tool) {
        btn.className = "h-7 px-2 rounded-md bg-[var(--accent)] text-white font-semibold flex items-center gap-1 transition";
      } else {
        btn.className = "h-7 px-2 rounded-md text-[var(--tx3)] hover:text-[var(--tx)] flex items-center gap-1 transition";
      }
    });

    pdfPagesContainer.querySelectorAll(".pdf-ink-canvas").forEach(applyInkTouchSettings);
    syncAnnotationControls();
  };

  window.setPdfColor = function(hex) {
    if (activePdfTool === "pan" || activePdfTool === "eraser") setPdfTool("pen");
    if (activePdfTool === "highlighter") pdfHighlightColor = hex;
    else pdfPenColor = hex;
    syncAnnotationControls();
  };

  if (pdfColorPicker) pdfColorPicker.addEventListener("input", e => setPdfColor(e.target.value));
  if (pdfSizeSlider) {
    const onSliderSize = e => {
      const val = Number(e.target.value);
      if (activePdfTool === "highlighter") {
        pdfHighlightSize = val;
        localStorage.setItem(LS_HL_SIZE, JSON.stringify(val));
      } else {
        pdfPenSize = val;
        localStorage.setItem(LS_PEN_SIZE, JSON.stringify(val));
      }
      syncAnnotationControls();
    };
    pdfSizeSlider.addEventListener("input", onSliderSize);
    pdfSizeSlider.addEventListener("change", onSliderSize);
  }
  syncAnnotationControls();

  function cloneStrokes(arr) {
    return (arr || []).map(s => ({ ...s, points: s.points.map(p => ({ ...p })) }));
  }

  function pushPdfUndoSnapshot(pageKey) {
    if (!pdfUndoStacks[pageKey]) pdfUndoStacks[pageKey] = [];
    pdfUndoStacks[pageKey].push(cloneStrokes(pdfAnnotations[pageKey] || []));
    if (pdfUndoStacks[pageKey].length > 35) pdfUndoStacks[pageKey].shift();
    pdfRedoStacks[pageKey] = [];
  }

  async function savePdfAnnotations() {
    if (!activePdfSlideId) return;
    try {
      await StudyVaultDB.setBlob("annot-" + activePdfSlideId, pdfAnnotations);
    } catch (e) {
      console.error("Failed to save annotations:", e);
    }
  }

  function drawStrokeOnCtx(ctx, stroke, width, height) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = stroke.tool === "highlighter" ? 0.34 : 1;

    const lineW = Math.max(0.25, stroke.widthRatio * width);
    ctx.lineWidth = lineW;

    const pts = stroke.points;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x * width, pts[0].y * height, lineW / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x * width, pts[0].y * height);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = ((pts[i].x + pts[i + 1].x) / 2) * width;
      const my = ((pts[i].y + pts[i + 1].y) / 2) * height;
      ctx.quadraticCurveTo(pts[i].x * width, pts[i].y * height, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x * width, last.y * height);
    ctx.stroke();
    ctx.restore();
  }

  function redrawInkCanvas(inkCanvas, pageKey) {
    const ctx = inkCanvas.getContext("2d");
    const w = inkCanvas.width;
    const h = inkCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const list = pdfAnnotations[pageKey] || [];
    for (const stroke of list) drawStrokeOnCtx(ctx, stroke, w, h);
  }

  function redrawVisiblePageInk(pageNum) {
    const pageKey = String(pageNum);
    const slot = pdfPagesContainer.querySelector(`.pdf-page-slot[data-page-num="${pageKey}"]`);
    const ink = slot?.querySelector(".pdf-ink-canvas");
    if (ink) redrawInkCanvas(ink, pageKey);
  }

  function eraseStrokesNear(pageKey, pt) {
    const list = pdfAnnotations[pageKey];
    if (!list || list.length === 0) return false;
    const hitRadiusSq = 0.024 * 0.024;
    let changed = false;
    const kept = list.filter(stroke => {
      const hit = stroke.points.some(p => {
        const dx = p.x - pt.x;
        const dy = p.y - pt.y;
        return dx * dx + dy * dy <= hitRadiusSq;
      });
      if (hit) changed = true;
      return !hit;
    });
    if (changed) pdfAnnotations[pageKey] = kept;
    return changed;
  }

  function cancelActiveTouchStroke() {
    if (!activeStrokeSession) return;
    const sess = activeStrokeSession;
    activeStrokeSession = null;
    if (performance.now() - sess.startedAt > 280 && sess.strokeObj?.points?.length > 6) return;

    const arr = pdfAnnotations[sess.pageKey];
    if (Array.isArray(arr)) {
      const idx = arr.lastIndexOf(sess.strokeObj);
      if (idx !== -1) arr.splice(idx, 1);
    }
    const uStack = pdfUndoStacks[sess.pageKey];
    if (Array.isArray(uStack) && uStack.length > 0 && sess.undoSnapshotTaken) {
      uStack.pop();
    }
    if (sess.finishFn) sess.finishFn(true);
    if (sess.inkCanvas) redrawInkCanvas(sess.inkCanvas, sess.pageKey);
  }

  function bindInkEvents(inkCanvas, pageNum) {
    const pageKey = String(pageNum);
    let drawingStroke = null;
    let isPointerDown = false;
    let activePointerId = null;
    let eraserSnapshotTaken = false;
    let drawRaf = null;

    function getNormPt(e) {
      const rect = inkCanvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)))
      };
    }

    function scheduleRedraw() {
      if (drawRaf) return;
      drawRaf = requestAnimationFrame(() => {
        drawRaf = null;
        redrawInkCanvas(inkCanvas, pageKey);
      });
    }

    // Lock Apple Pencil stylus touches immediately so iOS Safari never hijacks them to scroll or Scribble
    inkCanvas.addEventListener("touchstart", e => {
      if (activePdfTool === "pan") return;
      const hasStylus = Array.from(e.touches).some(t => t.touchType === "stylus");
      if (hasStylus || (pdfTouchDrawEnabled && e.touches.length === 1)) {
        e.preventDefault();
      }
    }, { passive: false });

    inkCanvas.addEventListener("touchmove", e => {
      if (activePdfTool === "pan") return;
      const hasStylus = Array.from(e.touches).some(t => t.touchType === "stylus");
      if (hasStylus || (pdfTouchDrawEnabled && e.touches.length === 1 && !pdfIsPinching)) {
        e.preventDefault();
      }
    }, { passive: false });

    function finishStroke(canceled = false, e = null) {
      if (!isPointerDown) return;
      isPointerDown = false;
      drawingStroke = null;
      if (activeStrokeSession && activeStrokeSession.inkCanvas === inkCanvas) {
        activeStrokeSession = null;
      }
      if (e) {
        try { inkCanvas.releasePointerCapture(e.pointerId); } catch {}
      }
      activePointerId = null;
      if (!canceled) savePdfAnnotations();
    }

    inkCanvas.addEventListener("pointerdown", e => {
      if (activePdfTool === "pan" || pdfIsPinching) return;
      // GoodNotes mode: 1 finger scrolls seamlessly unless Finger Draw mode is explicitly enabled
      if (e.pointerType === "touch" && !pdfTouchDrawEnabled) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;

      e.preventDefault();
      try { inkCanvas.setPointerCapture(e.pointerId); } catch {}
      isPointerDown = true;
      activePointerId = e.pointerId;
      pdfCurrPage = pageNum;
      pdfCurrPageEl.textContent = String(pageNum).padStart(2, "0");

      const pt = getNormPt(e);

      if (activePdfTool === "eraser") {
        eraserSnapshotTaken = false;
        const listBefore = cloneStrokes(pdfAnnotations[pageKey] || []);
        if (eraseStrokesNear(pageKey, pt)) {
          if (!pdfUndoStacks[pageKey]) pdfUndoStacks[pageKey] = [];
          pdfUndoStacks[pageKey].push(listBefore);
          pdfRedoStacks[pageKey] = [];
          eraserSnapshotTaken = true;
          scheduleRedraw();
        }
        return;
      }

      pushPdfUndoSnapshot(pageKey);
      if (!pdfAnnotations[pageKey]) pdfAnnotations[pageKey] = [];
      drawingStroke = {
        tool: activePdfTool,
        color: getActiveToolColor(),
        widthRatio: getActiveToolSize() / 600,
        points: [pt]
      };
      pdfAnnotations[pageKey].push(drawingStroke);

      if (e.pointerType === "touch") {
        activeStrokeSession = {
          pageKey,
          strokeObj: drawingStroke,
          startedAt: performance.now(),
          inkCanvas,
          undoSnapshotTaken: true,
          finishFn: canceled => finishStroke(canceled)
        };
      } else {
        activeStrokeSession = null;
      }

      scheduleRedraw();
    });

    inkCanvas.addEventListener("pointermove", e => {
      if (!isPointerDown || e.pointerId !== activePointerId || activePdfTool === "pan" || pdfIsPinching) return;
      const pt = getNormPt(e);

      if (activePdfTool === "eraser") {
        const listBefore = !eraserSnapshotTaken ? cloneStrokes(pdfAnnotations[pageKey] || []) : null;
        if (eraseStrokesNear(pageKey, pt)) {
          if (!eraserSnapshotTaken && listBefore) {
            if (!pdfUndoStacks[pageKey]) pdfUndoStacks[pageKey] = [];
            pdfUndoStacks[pageKey].push(listBefore);
            pdfRedoStacks[pageKey] = [];
            eraserSnapshotTaken = true;
          }
          scheduleRedraw();
        }
        return;
      }

      if (!drawingStroke) return;
      const last = drawingStroke.points[drawingStroke.points.length - 1];
      const dx = pt.x - last.x;
      const dy = pt.y - last.y;
      if (dx * dx + dy * dy > 0.000004) {
        drawingStroke.points.push(pt);
        scheduleRedraw();
      }
    });

    inkCanvas.addEventListener("pointerup", e => {
      if (e.pointerId === activePointerId) finishStroke(false, e);
    });
    inkCanvas.addEventListener("pointercancel", e => {
      if (e.pointerId === activePointerId) finishStroke(false, e);
    });
  }

  window.undoPdfStroke = function() {
    if (!activePdfDoc) return;
    const key = String(pdfCurrPage);
    const stack = pdfUndoStacks[key];
    if (!stack || stack.length === 0) {
      showToast(`หน้า ${pdfCurrPage} ไม่มีรายการให้ย้อนกลับ`);
      return;
    }
    if (!pdfRedoStacks[key]) pdfRedoStacks[key] = [];
    pdfRedoStacks[key].push(cloneStrokes(pdfAnnotations[key] || []));
    pdfAnnotations[key] = stack.pop();
    redrawVisiblePageInk(pdfCurrPage);
    savePdfAnnotations();
  };

  window.redoPdfStroke = function() {
    if (!activePdfDoc) return;
    const key = String(pdfCurrPage);
    const rStack = pdfRedoStacks[key];
    if (!rStack || rStack.length === 0) return;
    if (!pdfUndoStacks[key]) pdfUndoStacks[key] = [];
    pdfUndoStacks[key].push(cloneStrokes(pdfAnnotations[key] || []));
    pdfAnnotations[key] = rStack.pop();
    redrawVisiblePageInk(pdfCurrPage);
    savePdfAnnotations();
  };

  window.clearPdfCurrentPage = function() {
    if (!activePdfDoc) return;
    const key = String(pdfCurrPage);
    const current = pdfAnnotations[key] || [];
    if (current.length === 0) return;
    pushPdfUndoSnapshot(key);
    pdfAnnotations[key] = [];
    redrawVisiblePageInk(pdfCurrPage);
    savePdfAnnotations();
    showToast(`ล้างเส้นในหน้า ${pdfCurrPage} แล้ว (กด ↩️ ย้อนกลับได้)`);
  };

  window.downloadOriginalPdf = function() {
    if (!activePdfBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(activePdfBlob);
    a.download = `${activePdfTitle || "slides"}.pdf`;
    a.click();
    showToast("กำลังดาวน์โหลดไฟล์ PDF ต้นฉบับ");
  };

  window.exportAnnotatedPdf = async function() {
    if (!activePdfBlob || !window.PDFLib) {
      downloadOriginalPdf();
      return;
    }
    const exportBtn = document.getElementById("pdf-export-btn");
    if (exportBtn) exportBtn.disabled = true;
    showToast("กำลังรวมลายมือและไฮไลท์ลงในไฟล์ PDF...");

    try {
      const pdfBytes = await activePdfBlob.arrayBuffer();
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
      const total = pdfDoc.getPageCount();

      for (let i = 1; i <= total; i++) {
        const strokes = pdfAnnotations[String(i)];
        if (!strokes || strokes.length === 0) continue;

        const pdfPage = pdfDoc.getPage(i - 1);
        const { width, height } = pdfPage.getSize();
        const scale = 2;

        const offCanvas = document.createElement("canvas");
        offCanvas.width = Math.max(1, Math.floor(width * scale));
        offCanvas.height = Math.max(1, Math.floor(height * scale));
        const ctx = offCanvas.getContext("2d");

        for (const stroke of strokes) drawStrokeOnCtx(ctx, stroke, offCanvas.width, offCanvas.height);

        const pngBlob = await new Promise(res => offCanvas.toBlob(res, "image/png"));
        const pngBytes = await pngBlob.arrayBuffer();
        const pngImage = await pdfDoc.embedPng(pngBytes);
        pdfPage.drawImage(pngImage, { x: 0, y: 0, width, height });
      }

      const outBytes = await pdfDoc.save();
      const outBlob = new Blob([outBytes], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(outBlob);
      a.download = `${activePdfTitle || "slides"}-annotated.pdf`;
      a.click();
      showToast("ดาวน์โหลด PDF พร้อมโน้ตเรียบร้อย!");
    } catch (err) {
      console.error("Annotated PDF export error:", err);
      showToast("ส่งออกไม่สำเร็จ กำลังโหลดต้นฉบับแทน");
      downloadOriginalPdf();
    } finally {
      if (exportBtn) exportBtn.disabled = false;
    }
  };

  const pdfResizeObserver = new ResizeObserver(() => {
    if (!activePdfDoc || slidePdfViewer.classList.contains("hidden") || pdfIsPinching) return;
    const w = pdfPagesContainer.clientWidth;
    if (w > 50 && Math.abs(w - lastPdfContainerW) > 16) {
      clearTimeout(pdfResizeTimer);
      pdfResizeTimer = setTimeout(() => {
        if (!pdfIsPinching && activePdfDoc) buildPdfPageSlots(true);
      }, 120);
    }
  });
  pdfResizeObserver.observe(pdfPagesContainer);

  function updatePdfPageCounterFromScroll() {
    if (!activePdfDoc) return;
    const slots = pdfPagesContainer.querySelectorAll(".pdf-page-slot");
    const threshold = pdfPagesContainer.scrollTop + 60;
    let current = 1;
    for (const slot of slots) {
      if (slot.offsetTop + slot.offsetHeight > threshold) {
        current = Number(slot.dataset.pageNum) || 1;
        break;
      }
    }
    pdfCurrPage = current;
    pdfCurrPageEl.textContent = String(current).padStart(2, "0");
  }

  pdfPagesContainer.addEventListener("scroll", () => {
    if (pdfScrollRaf) return;
    pdfScrollRaf = requestAnimationFrame(() => {
      pdfScrollRaf = null;
      updatePdfPageCounterFromScroll();
    });
  }, { passive: true });

  // iPad 2-Finger Pinch-to-Zoom & 2-Finger Pan + Trackpad Pinch Support
  let pinchState = null;
  let wheelZoomTimer = null;

  function getTouchPairMetrics(t1, t2) {
    return {
      dist: Math.max(1, Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)),
      midX: (t1.clientX + t2.clientX) / 2,
      midY: (t1.clientY + t2.clientY) / 2
    };
  }

  pdfPagesContainer.addEventListener("touchstart", e => {
    if (!activePdfDoc || slidePdfViewer.classList.contains("hidden")) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      cancelActiveTouchStroke();
      pdfIsPinching = true;
      const stage = document.getElementById("pdf-zoom-stage");
      const metrics = getTouchPairMetrics(e.touches[0], e.touches[1]);
      const rect = pdfPagesContainer.getBoundingClientRect();
      const localX = metrics.midX - rect.left;
      const localY = metrics.midY - rect.top;
      pinchState = {
        startDist: metrics.dist,
        startZoom: pdfZoom,
        targetZoom: pdfZoom,
        startScrollLeft: pdfPagesContainer.scrollLeft,
        startScrollTop: pdfPagesContainer.scrollTop,
        contentX: pdfPagesContainer.scrollLeft + localX,
        contentY: pdfPagesContainer.scrollTop + localY,
        lastLocalX: localX,
        lastLocalY: localY,
        stage
      };
    }
  }, { passive: false });

  pdfPagesContainer.addEventListener("touchmove", e => {
    if (!pdfIsPinching || !pinchState || e.touches.length !== 2) return;
    e.preventDefault();
    const metrics = getTouchPairMetrics(e.touches[0], e.touches[1]);
    const rect = pdfPagesContainer.getBoundingClientRect();
    const curLocalX = metrics.midX - rect.left;
    const curLocalY = metrics.midY - rect.top;
    const nextZoom = Math.max(0.6, Math.min(3.0, pinchState.startZoom * (metrics.dist / pinchState.startDist)));
    const scaleFactor = nextZoom / pinchState.startZoom;

    pinchState.targetZoom = nextZoom;
    pinchState.lastLocalX = curLocalX;
    pinchState.lastLocalY = curLocalY;

    if (pinchState.stage) {
      const tx = (pinchState.startScrollLeft + curLocalX) - pinchState.contentX * scaleFactor;
      const ty = (pinchState.startScrollTop + curLocalY) - pinchState.contentY * scaleFactor;
      pinchState.stage.style.transformOrigin = "0 0";
      pinchState.stage.style.willChange = "transform";
      pinchState.stage.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scaleFactor})`;
    }
    pdfZoomLabel.textContent = `${Math.round(nextZoom * 100)}%`;
  }, { passive: false });

  async function commitPinchGesture() {
    if (!pdfIsPinching || !pinchState) return;
    const state = pinchState;
    pinchState = null;
    pdfIsPinching = false;

    const scaleFactor = state.targetZoom / state.startZoom;
    if (state.stage) {
      state.stage.style.transform = "";
      state.stage.style.willChange = "";
    }

    if (Math.abs(state.targetZoom - state.startZoom) > 0.025) {
      const targetLeft = Math.max(0, state.contentX * scaleFactor - state.lastLocalX);
      const targetTop = Math.max(0, state.contentY * scaleFactor - state.lastLocalY);
      pdfZoom = state.targetZoom;
      await buildPdfPageSlots(true, { left: targetLeft, top: targetTop });
    } else {
      const panLeft = Math.max(0, state.contentX - state.lastLocalX);
      const panTop = Math.max(0, state.contentY - state.lastLocalY);
      pdfPagesContainer.scrollTo({ left: panLeft, top: panTop });
      pdfZoomLabel.textContent = `${Math.round(pdfZoom * 100)}%`;
    }
  }

  pdfPagesContainer.addEventListener("touchend", e => {
    if (pdfIsPinching && e.touches.length < 2) commitPinchGesture();
  }, { passive: true });
  pdfPagesContainer.addEventListener("touchcancel", e => {
    if (pdfIsPinching && e.touches.length < 2) commitPinchGesture();
  }, { passive: true });

  pdfPagesContainer.addEventListener("wheel", e => {
    if (!e.ctrlKey || !activePdfDoc || slidePdfViewer.classList.contains("hidden")) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    pdfZoom = Math.max(0.6, Math.min(3.0, pdfZoom + delta));
    pdfZoomLabel.textContent = `${Math.round(pdfZoom * 100)}%`;
    clearTimeout(wheelZoomTimer);
    wheelZoomTimer = setTimeout(() => buildPdfPageSlots(true), 80);
  }, { passive: false });

  async function renderPdfSlide(idbKey, fallbackUrl, slideId, slideTitle) {
    slideIframe.classList.add("hidden");
    slideImageViewer.classList.add("hidden");

    let blob = idbKey ? await StudyVaultDB.getBlob(idbKey).catch(() => null) : null;
    if (!blob && slideId) {
      blob = await StudyVaultDB.getBlob("cached-slide-" + slideId).catch(() => null);
    }
    if (!blob && fallbackUrl) {
      slidePdfViewer.classList.remove("hidden");
      setPdfTool(activePdfTool);
      pdfPagesContainer.innerHTML = `<div class="py-10 text-xs text-[var(--tx3)] text-center">กำลังดาวน์โหลดสไลด์ PDF...</div>`;
      try {
        const resp = await fetch(fallbackUrl);
        if (resp.ok) {
          blob = await resp.blob();
          if (slideId) await StudyVaultDB.setBlob("cached-slide-" + slideId, blob).catch(() => {});
        }
      } catch (e) {
        console.error("Shared PDF fetch failed:", e);
      }
    }
    if (!blob) {
      renderSlideEmpty();
      return;
    }

    pdfBuildToken++;
    activePdfBlob = blob;
    activePdfSlideId = slideId;
    activePdfTitle = slideTitle || "slides";
    pdfUndoStacks = {};
    pdfRedoStacks = {};

    try {
      const savedAnnot = await StudyVaultDB.getBlob("annot-" + slideId);
      pdfAnnotations = (savedAnnot && typeof savedAnnot === "object") ? savedAnnot : {};
    } catch {
      pdfAnnotations = {};
    }

    if (!window.pdfjsLib) {
      slidePdfViewer.classList.add("hidden");
      slideIframe.classList.remove("hidden");
      slideIframe.src = fallbackUrl || URL.createObjectURL(blob);
      return;
    }

    slidePdfViewer.classList.remove("hidden");
    setPdfTool(activePdfTool);
    pdfPagesContainer.innerHTML = `<div class="py-10 text-xs text-[var(--tx3)] text-center">กำลังเตรียมหน้า PDF...</div>`;

    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const buf = await blob.arrayBuffer();
      const loadedDoc = await pdfjsLib.getDocument({ data: buf }).promise;
      activePdfDoc = loadedDoc;
      pdfCurrPage = 1;
      pdfZoom = 1;
      lastPdfContainerW = 0;
      await buildPdfPageSlots(false);
    } catch (err) {
      console.error("PDF.js render error:", err);
      slidePdfViewer.classList.add("hidden");
      slideIframe.classList.remove("hidden");
      slideIframe.src = fallbackUrl || URL.createObjectURL(blob);
    }
  }

  async function buildPdfPageSlots(preservePage = false, customScrollTarget = null) {
    if (!activePdfDoc) return;
    const rawW = pdfPagesContainer.clientWidth;
    if (rawW < 50) return;

    const buildToken = ++pdfBuildToken;
    lastPdfContainerW = rawW;

    let anchorPage = preservePage ? pdfCurrPage : 1;
    let anchorFracY = 0;
    let anchorFracX = 0.5;
    if (preservePage && !customScrollTarget) {
      const prevSlot = pdfPagesContainer.querySelector(`.pdf-page-slot[data-page-num="${anchorPage}"]`);
      if (prevSlot) {
        const slotH = Math.max(1, prevSlot.offsetHeight);
        anchorFracY = Math.max(0, Math.min(1, (pdfPagesContainer.scrollTop - prevSlot.offsetTop + 12) / slotH));
        const slotW = Math.max(1, prevSlot.offsetWidth);
        if (pdfPagesContainer.scrollWidth > pdfPagesContainer.clientWidth) {
          anchorFracX = (pdfPagesContainer.scrollLeft + pdfPagesContainer.clientWidth / 2 - prevSlot.offsetLeft) / slotW;
        }
      }
    }

    const firstPage = await activePdfDoc.getPage(1);
    if (buildToken !== pdfBuildToken || !activePdfDoc) return;

    if (pdfObserver) pdfObserver.disconnect();

    const numPages = activePdfDoc.numPages;
    anchorPage = Math.max(1, Math.min(numPages, anchorPage));

    pdfTotalPagesEl.textContent = String(numPages).padStart(2, "0");
    pdfCurrPage = anchorPage;
    pdfCurrPageEl.textContent = String(anchorPage).padStart(2, "0");
    pdfZoomLabel.textContent = `${Math.round(pdfZoom * 100)}%`;

    const containerW = Math.max(260, rawW - 32);
    const firstVp = firstPage.getViewport({ scale: 1 });
    const defaultScale = (containerW / firstVp.width) * pdfZoom;
    const defaultVp = firstPage.getViewport({ scale: defaultScale });

    const stage = document.createElement("div");
    stage.id = "pdf-zoom-stage";
    stage.style.width = "fit-content";
    stage.style.minWidth = "100%";
    stage.style.display = "flex";
    stage.style.flexDirection = "column";
    stage.style.alignItems = "center";
    stage.style.gap = "12px";

    // Strictly synchronous ordered DOM creation 1..N prevents async race scrambling
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= numPages; i++) {
      const wrap = document.createElement("div");
      wrap.className = "pdf-page-slot relative rounded-xl overflow-hidden bg-white shadow-md border border-[var(--line)] flex-shrink-0";
      wrap.style.width = `${Math.floor(defaultVp.width)}px`;
      wrap.style.height = `${Math.floor(defaultVp.height)}px`;
      wrap.dataset.pageNum = String(i);
      wrap.dataset.rendered = "false";

      const badge = document.createElement("span");
      badge.className = "pdf-page-badge absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] tnum pointer-events-none z-20";
      badge.textContent = `${i}/${numPages}`;
      wrap.appendChild(badge);

      frag.appendChild(wrap);
    }

    stage.appendChild(frag);
    pdfPagesContainer.replaceChildren(stage);

    pdfObserver = new IntersectionObserver(entries => {
      if (buildToken !== pdfBuildToken) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const slot = entry.target;
          if (slot.dataset.rendered === "false") {
            renderSinglePdfCanvas(slot, Number(slot.dataset.pageNum), containerW, buildToken);
          }
        }
      }
    }, { root: pdfPagesContainer, rootMargin: "240px 0px", threshold: 0.05 });

    stage.querySelectorAll(".pdf-page-slot").forEach(el => pdfObserver.observe(el));

    if (customScrollTarget) {
      pdfPagesContainer.scrollLeft = customScrollTarget.left;
      pdfPagesContainer.scrollTop = customScrollTarget.top;
    } else if (preservePage) {
      const targetEl = stage.querySelector(`.pdf-page-slot[data-page-num="${anchorPage}"]`);
      if (targetEl) {
        pdfPagesContainer.scrollTop = Math.max(0, targetEl.offsetTop - 12 + targetEl.offsetHeight * anchorFracY);
        if (pdfPagesContainer.scrollWidth > pdfPagesContainer.clientWidth) {
          pdfPagesContainer.scrollLeft = Math.max(0, targetEl.offsetLeft + targetEl.offsetWidth * anchorFracX - pdfPagesContainer.clientWidth / 2);
        } else {
          pdfPagesContainer.scrollLeft = 0;
        }
      }
    } else {
      pdfPagesContainer.scrollTop = 0;
      pdfPagesContainer.scrollLeft = 0;
    }
  }

  async function renderSinglePdfCanvas(slot, pageNum, containerW, buildToken) {
    if (!activePdfDoc || buildToken !== pdfBuildToken || !slot.isConnected) return;
    if (slot.dataset.rendered === "true" || slot.dataset.rendered === "loading") return;
    slot.dataset.rendered = "loading";

    try {
      const page = await activePdfDoc.getPage(pageNum);
      if (!activePdfDoc || buildToken !== pdfBuildToken || !slot.isConnected) return;

      const baseVp = page.getViewport({ scale: 1 });
      const exactScale = (containerW / baseVp.width) * pdfZoom;
      const cssVp = page.getViewport({ scale: exactScale });
      slot.style.width = `${Math.floor(cssVp.width)}px`;
      slot.style.height = `${Math.floor(cssVp.height)}px`;

      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      let vp = page.getViewport({ scale: exactScale * dpr });
      while (vp.width * vp.height > 5_500_000 && dpr > 1) {
        dpr = Math.max(1, dpr * 0.8);
        vp = page.getViewport({ scale: exactScale * dpr });
      }

      const bgCanvas = document.createElement("canvas");
      bgCanvas.width = Math.max(1, Math.floor(vp.width));
      bgCanvas.height = Math.max(1, Math.floor(vp.height));
      bgCanvas.style.width = "100%";
      bgCanvas.style.height = "100%";
      bgCanvas.style.display = "block";
      bgCanvas.style.pointerEvents = "none";

      const inkCanvas = document.createElement("canvas");
      inkCanvas.className = "pdf-ink-canvas absolute inset-0 w-full h-full z-10";
      inkCanvas.width = bgCanvas.width;
      inkCanvas.height = bgCanvas.height;
      applyInkTouchSettings(inkCanvas);

      const ctx = bgCanvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (!activePdfDoc || buildToken !== pdfBuildToken || !slot.isConnected) return;

      slot.querySelectorAll("canvas").forEach(c => c.remove());
      slot.insertBefore(inkCanvas, slot.firstChild);
      slot.insertBefore(bgCanvas, inkCanvas);
      slot.dataset.rendered = "true";

      redrawInkCanvas(inkCanvas, String(pageNum));
      bindInkEvents(inkCanvas, pageNum);
    } catch (err) {
      if (slot.isConnected && buildToken === pdfBuildToken) {
        slot.dataset.rendered = "false";
      }
      console.error(`Failed to render PDF page ${pageNum}:`, err);
    }
  }

  window.zoomPdfSlide = async delta => {
    pdfZoom = Math.max(0.6, Math.min(3.0, pdfZoom + delta));
    await buildPdfPageSlots(true);
  };

  window.resetPdfZoom = async () => {
    if (Math.abs(pdfZoom - 1) < 0.01) return;
    pdfZoom = 1;
    await buildPdfPageSlots(true);
  };

  window.stepPdfPage = delta => {
    if (!activePdfDoc) return;
    const next = Math.max(1, Math.min(activePdfDoc.numPages, pdfCurrPage + delta));
    const target = pdfPagesContainer.querySelector(`.pdf-page-slot[data-page-num="${next}"]`);
    if (target) {
      pdfPagesContainer.scrollTo({ top: Math.max(0, target.offsetTop - 12), behavior: "smooth" });
      pdfCurrPage = next;
      pdfCurrPageEl.textContent = String(next).padStart(2, "0");
    }
  };

  window.selectSlide = async function(slideId, openSplit = true) {
    const sub = allSubjects.find(s => s.id === activeSubjectId);
    if (!sub) return;
    const sl = sub.slides.find(x => x.id === slideId);
    if (!sl) return;

    activeSlideId = slideId;
    const ownerTopic = getActiveTopicRecord(sub) || (sub.topics || []).find(t => (t.slides || []).some(x => x.id === slideId));
    if (ownerTopic) activeTopicId = ownerTopic.id;
    if (openSplit && !isSplitMode) toggleSplitMode(true);

    renderWorkspaceSlides(sub, ownerTopic);
    slideEmptyView.classList.add("hidden");
    slideDeleteBtn.classList.remove("hidden");

    if (sl.type === "images" && (sl.idbKey || (Array.isArray(sl.urls) && sl.urls.length > 0))) {
      slideIframe.classList.add("hidden");
      slidePdfViewer.classList.add("hidden");
      slideImageViewer.classList.remove("hidden");
      const urls = await resolveImageDeckUrls(sl);
      if (urls.length > 0) {
        currentImageSlideUrls = urls;
        currentImageSlideIdx = 0;
        imageZoom = 1;
        updateImageSlideView();
      } else {
        renderSlideEmpty();
      }
    } else if (sl.type === "pdf" && (sl.idbKey || sl.url)) {
      const fallbackUrl = await resolveResourceUrl(sl);
      await renderPdfSlide(sl.idbKey, fallbackUrl, sl.id, sl.title);
    } else {
      slidePdfViewer.classList.add("hidden");
      slideImageViewer.classList.add("hidden");
      slideIframe.classList.remove("hidden");
      slideIframe.src = normalizeSlideEmbedUrl(sl.url || "");
    }
  };

  function updateImageSlideView() {
    if (currentImageSlideUrls.length === 0) return;
    slideActiveImg.src = currentImageSlideUrls[currentImageSlideIdx];
    slideActiveImg.style.transform = `scale(${imageZoom})`;
    slideZoomLabel.textContent = `${Math.round(imageZoom * 100)}%`;
    slideImgCounter.textContent = `${String(currentImageSlideIdx + 1).padStart(2, "0")} / ${String(currentImageSlideUrls.length).padStart(2, "0")}`;
  }

  window.zoomImageSlide = delta => {
    imageZoom = Math.max(0.5, Math.min(2.5, imageZoom + delta));
    updateImageSlideView();
  };
  window.prevImageSlide = () => {
    if (!currentImageSlideUrls.length) return;
    currentImageSlideIdx = (currentImageSlideIdx - 1 + currentImageSlideUrls.length) % currentImageSlideUrls.length;
    updateImageSlideView();
  };
  window.nextImageSlide = () => {
    if (!currentImageSlideUrls.length) return;
    currentImageSlideIdx = (currentImageSlideIdx + 1) % currentImageSlideUrls.length;
    updateImageSlideView();
  };

  // Drag & Drop PDF or Images into Slide Pane (Admin only)
  ["dragenter", "dragover"].forEach(ev => {
    slideDropZone.addEventListener(ev, e => {
      e.preventDefault();
      if (isAdminMode()) slideDropZone.classList.add("drop-active");
    });
  });
  ["dragleave", "drop"].forEach(ev => {
    slideDropZone.addEventListener(ev, e => {
      e.preventDefault();
      slideDropZone.classList.remove("drop-active");
    });
  });
  function attachDroppedSlideToActiveTopic(sl) {
    const today = new Date().toISOString().split("T")[0];
    let promoted = activeTopicId ? promoteTopicToCustom(activeSubjectId, activeTopicId) : null;
    if (!promoted) {
      const newTop = {
        id: "top-" + Date.now(),
        title: sl.title,
        subtitle: "",
        updatedAt: today,
        createdAt: Date.now(),
        link: null,
        slides: [sl]
      };
      if (!customTopicsMap[activeSubjectId]) customTopicsMap[activeSubjectId] = [];
      customTopicsMap[activeSubjectId].unshift(newTop);
      promoted = newTop;
    } else {
      if (!Array.isArray(promoted.slides)) promoted.slides = [];
      promoted.slides.push(sl);
      promoted.updatedAt = today;
      promoted.createdAt = Date.now();
    }
    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    openSubject(activeSubjectId, false, { topicId: promoted.id, slideId: sl.id, openSlides: true });
  }

  slideDropZone.addEventListener("drop", async e => {
    if (!activeSubjectId) return;
    if (!isAdminMode()) {
      showToast("เฉพาะเจ้าของเว็บ (Admin) เท่านั้นที่เพิ่มสไลด์ขึ้นเว็บกลางได้");
      return;
    }
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    const pdf = files.find(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const imgs = files.filter(f => f.type.startsWith("image/"));

    if (pdf) {
      const key = "pdf-" + Date.now();
      await StudyVaultDB.setBlob(key, pdf);
      const sl = { id: "sl-" + Date.now(), title: pdf.name.replace(/\.pdf$/i, ""), type: "pdf", idbKey: key, updatedAt: new Date().toISOString().split("T")[0] };
      attachDroppedSlideToActiveTopic(sl);
      showToast(`เพิ่มสไลด์ PDF "${sl.title}" เข้าเรื่องนี้แล้ว`);
      triggerAutoSyncIfEnabled();
    } else if (imgs.length > 0) {
      const key = "imgs-" + Date.now();
      await StudyVaultDB.setBlob(key, imgs);
      const sl = { id: "sl-" + Date.now(), title: `สไลด์รูปภาพ (${imgs.length} หน้า)`, type: "images", idbKey: key, updatedAt: new Date().toISOString().split("T")[0] };
      attachDroppedSlideToActiveTopic(sl);
      showToast(`เพิ่มสไลด์รูปภาพ ${imgs.length} หน้าเข้าเรื่องนี้แล้ว`);
      triggerAutoSyncIfEnabled();
    }
  });

  window.deleteActiveSlide = () => { if (activeSlideId) deleteSlide(activeSlideId); };

  window.deleteSlide = function(slideId, overrideSubjectId = null, stayHome = false) {
    const targetSubId = overrideSubjectId || activeSubjectId;
    const sub = allSubjects.find(s => s.id === targetSubId);
    const ownerTopic = (sub?.topics || []).find(t => (t.slides || []).some(sl => sl.id === slideId));
    if (!sub || !ownerTopic) return;
    const targetSlide = (ownerTopic.slides || []).find(sl => sl.id === slideId);
    const promoted = promoteTopicToCustom(targetSubId, ownerTopic.id);
    if (!promoted || !targetSlide) return;

    const prevSlides = [...(promoted.slides || [])];
    promoted.slides = prevSlides.filter(sl => sl.id !== slideId);
    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    if (!viewHome.classList.contains("hidden") || stayHome) renderSubjectsGrid();
    else if (activeSubjectId === targetSubId) openSubject(targetSubId, false, { topicId: promoted.id });

    showToast(`ลบสไลด์ "${targetSlide.title}" ออกจากเรื่องนี้แล้ว`, () => {
      promoted.slides = prevSlides;
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      if (!viewHome.classList.contains("hidden")) renderSubjectsGrid();
      else if (activeSubjectId === targetSubId) openSubject(targetSubId, false, { topicId: promoted.id, slideId });
      triggerAutoSyncIfEnabled();
    });
    triggerAutoSyncIfEnabled();
  };

  // =========================================================================
  // 10. MODALS: SIMPLIFIED ADD/MANAGE SUBJECT & SUBJECT-LOCKED UPLOAD
  // =========================================================================
  const SUBJECT_ACCENTS = [
    "from-indigo-500 to-purple-500",
    "from-pink-500 to-rose-500",
    "from-sky-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-amber-500 to-orange-500"
  ];

  document.getElementById("open-add-subject-btn").addEventListener("click", () => {
    renderManageSubjectsList();
    addSubjectModal.classList.remove("hidden");
  });
  window.closeAddSubjectModal = () => addSubjectModal.classList.add("hidden");

  function createSubjectRecord({ code, title, category = "ทั่วไป", icon = "📘" }) {
    const today = new Date().toISOString().split("T")[0];
    const newSub = {
      id: "sub-" + Date.now(),
      code,
      title,
      category: category || "ทั่วไป",
      description: `คลังสรุปและสไลด์เรียนวิชา ${title}`,
      icon: icon || "📘",
      accent: SUBJECT_ACCENTS[allSubjects.length % SUBJECT_ACCENTS.length],
      lastUpdated: today,
      links: [],
      slides: []
    };
    customSubjects.unshift(newSub);
    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    renderCategories();
    renderManageSubjectsList();
    if (!viewHome.classList.contains("hidden")) renderSubjectsGrid();
    return newSub;
  }

  document.getElementById("add-subject-form").addEventListener("submit", e => {
    e.preventDefault();
    const code = document.getElementById("sub-code").value.trim();
    const title = document.getElementById("sub-title").value.trim();
    const category = document.getElementById("sub-category").value.trim() || "ทั่วไป";
    const icon = document.getElementById("sub-icon").value.trim() || "📘";
    const newSub = createSubjectRecord({ code, title, category, icon });
    syncSubjectSelects(newSub.id);
    e.target.reset();
    showToast(`เพิ่มวิชา "${code} — ${title}" แล้ว กดเพิ่มลิงก์หรือสไลด์ได้เลย`);
    triggerAutoSyncIfEnabled();
  });

  // Subject Lock + Inline Create Helpers for Unified Topic Modal
  const topSubjectSelect = document.getElementById("top-subject-select");
  const topLockBtn = document.getElementById("top-lock-btn");
  const inlineSubState = { top: false };

  function setInlineBoxUI(prefix, showInline) {
    const selectEl = document.getElementById(`${prefix}-subject-select`);
    const boxEl = document.getElementById(`${prefix}-inline-sub-box`);
    const toggleBtn = document.getElementById(`${prefix}-inline-toggle-btn`);
    const lockBtn = document.getElementById(`${prefix}-lock-btn`);
    const hasSubjects = allSubjects.length > 0;
    const isVisible = !hasSubjects || showInline;
    inlineSubState[prefix] = isVisible;

    if (selectEl) selectEl.classList.toggle("hidden", isVisible);
    if (boxEl) boxEl.classList.toggle("hidden", !isVisible);
    if (lockBtn) lockBtn.classList.toggle("hidden", isVisible);
    if (toggleBtn) {
      toggleBtn.classList.toggle("hidden", !hasSubjects);
      toggleBtn.textContent = isVisible ? "← เลือกจากวิชาที่มี" : "+ สร้างวิชาใหม่";
    }
  }

  window.toggleInlineSubjectBox = function(prefix = "top") {
    if (allSubjects.length === 0) return;
    setInlineBoxUI(prefix, !inlineSubState[prefix]);
  };

  function ensureTargetSubjectId(prefix, selectEl) {
    if (!inlineSubState[prefix] && selectEl?.value) {
      return selectEl.value;
    }
    const codeEl = document.getElementById(`${prefix}-inline-code`);
    const titleEl = document.getElementById(`${prefix}-inline-title`);
    const code = codeEl?.value.trim() || "";
    const title = titleEl?.value.trim() || "";
    if (!code || !title) {
      showToast("กรุณากรอกรหัสวิชาและชื่อวิชา");
      (code ? titleEl : codeEl)?.focus();
      return null;
    }
    const newSub = createSubjectRecord({ code, title });
    if (codeEl) codeEl.value = "";
    if (titleEl) titleEl.value = "";
    setInlineBoxUI(prefix, false);
    return newSub.id;
  }

  function syncSubjectSelects(preferredId = null) {
    const targetId = (lockedSubjectId && allSubjects.some(s => s.id === lockedSubjectId))
      ? lockedSubjectId
      : (preferredId || activeSubjectId || allSubjects[0]?.id || "");
    const isLocked = Boolean(lockedSubjectId && allSubjects.some(s => s.id === lockedSubjectId));

    const optionsHtml = allSubjects.map(s => `<option value="${s.id}" ${s.id === targetId ? "selected" : ""}>${s.code} — ${s.title}</option>`).join("");
    if (topSubjectSelect) {
      topSubjectSelect.innerHTML = optionsHtml;
      topSubjectSelect.value = targetId;
      topSubjectSelect.disabled = isLocked;
      topSubjectSelect.classList.toggle("opacity-75", isLocked);
    }

    if (topLockBtn) {
      if (isLocked) {
        topLockBtn.className = "px-2.5 py-0.5 rounded-md bg-[var(--accent)] text-white font-semibold text-[11px] flex items-center gap-1 transition";
        topLockBtn.innerHTML = `<i class="ph ph-lock"></i><span>ล็อควิชาไว้แล้ว</span>`;
      } else {
        topLockBtn.className = "px-2.5 py-0.5 rounded-md border border-[var(--line-2)] bg-[var(--s1)] text-[var(--tx2)] text-[11px] flex items-center gap-1 transition";
        topLockBtn.innerHTML = `<i class="ph ph-lock-open"></i><span>ล็อควิชานี้ไว้</span>`;
      }
    }

    setInlineBoxUI("top", false);
  }

  window.toggleSubjectLock = function() {
    if (lockedSubjectId) {
      lockedSubjectId = "";
      localStorage.removeItem(LS_LOCKED_SUBJECT);
      showToast("ปลดล็อครายวิชาแล้ว สามารถเลือกเปลี่ยนวิชาได้");
    } else {
      const currentVal = topSubjectSelect?.value || activeSubjectId || allSubjects[0]?.id || "";
      if (!currentVal) return;
      lockedSubjectId = currentVal;
      localStorage.setItem(LS_LOCKED_SUBJECT, lockedSubjectId);
      const sub = allSubjects.find(s => s.id === lockedSubjectId);
      showToast(`ล็อควิชา "${sub?.title || lockedSubjectId}" ไว้แล้ว`);
    }
    syncSubjectSelects();
  };

  function getPreferredTargetSubjectId(explicitId = null) {
    if (typeof explicitId === "string" && explicitId && explicitId !== "__ALL__") return explicitId;
    if (activeSubjectId) return activeSubjectId;
    if (selectedHomeSubjectId && selectedHomeSubjectId !== "__ALL__") return selectedHomeSubjectId;
    return allSubjects[0]?.id || "";
  }

  let modalExistingLinkRecord = null;
  let modalExistingSlidesList = [];
  let modalRemovedSlideIds = new Set();

  window.setTopicLinkMode = function(mode) {
    topicLinkMode = mode === "url" || mode === "none" ? mode : "html";
    ["html", "url", "none"].forEach(m => {
      const btn = document.getElementById("top-link-" + m);
      if (btn) {
        btn.className = m === topicLinkMode
          ? "px-2.5 py-0.5 rounded bg-[var(--accent)] text-white font-medium"
          : "px-2.5 py-0.5 rounded text-[var(--tx3)]";
      }
    });
    document.getElementById("top-link-html-group")?.classList.toggle("hidden", topicLinkMode !== "html");
    document.getElementById("top-link-url-group")?.classList.toggle("hidden", topicLinkMode === "none");
    const urlLabel = document.getElementById("top-url-label");
    if (urlLabel) {
      urlLabel.innerHTML = topicLinkMode === "url"
        ? `<i class="ph ph-link-simple text-sky-400"></i><span>ลิงก์เว็บสรุป URL (เปิดจากลิงก์โดยตรง)</span>`
        : `<i class="ph ph-link-simple text-sky-400"></i><span>ลิงก์เว็บต้นฉบับ (ไม่บังคับ — ใส่คู่กับโค้ดได้ เพื่อมีปุ่มกดไปลิงก์เพิ่มให้)</span>`;
    }
  };

  window.clearSavedTopicHtml = function() {
    if (!modalExistingLinkRecord) return;
    delete modalExistingLinkRecord.idbKey;
    delete modalExistingLinkRecord.repoPath;
    if (String(modalExistingLinkRecord.url || "").startsWith("shared-assets/")) {
      modalExistingLinkRecord.url = modalExistingLinkRecord.externalUrl || "";
    }
    document.getElementById("top-existing-link-badge")?.classList.add("hidden");
    const htmlCodeEl = document.getElementById("top-html-code");
    if (htmlCodeEl) htmlCodeEl.value = "";
    const htmlFileEl = document.getElementById("top-html-file");
    if (htmlFileEl) htmlFileEl.value = "";
    if (document.getElementById("top-url-input")?.value.trim()) {
      setTopicLinkMode("url");
    }
    showToast("ล้างโค้ด HTML เดิมออกจากฟอร์มแล้ว (กดบันทึกเพื่อยืนยัน)");
  };

  window.setTopicSlideMode = function(mode) {
    topicSlideMode = mode === "images" || mode === "url" || mode === "none" ? mode : "pdf";
    ["pdf", "images", "url", "none"].forEach(m => {
      const btn = document.getElementById("top-sl-" + m);
      if (btn) {
        btn.className = m === topicSlideMode
          ? "px-2 py-0.5 rounded bg-[var(--accent)] text-white font-medium"
          : "px-2 py-0.5 rounded text-[var(--tx3)]";
      }
    });
    document.getElementById("top-sl-title-row")?.classList.toggle("hidden", topicSlideMode === "none");
    document.getElementById("top-sl-pdf-group")?.classList.toggle("hidden", topicSlideMode !== "pdf");
    document.getElementById("top-sl-images-group")?.classList.toggle("hidden", topicSlideMode !== "images");
    document.getElementById("top-sl-url-group")?.classList.toggle("hidden", topicSlideMode !== "url");
  };

  function renderModalExistingSlidesChips() {
    const wrap = document.getElementById("top-existing-slides-wrap");
    const listEl = document.getElementById("top-existing-slides-list");
    if (!wrap || !listEl) return;
    const kept = modalExistingSlidesList.filter(sl => !modalRemovedSlideIds.has(sl.id));
    wrap.classList.toggle("hidden", kept.length === 0);
    listEl.innerHTML = kept.map(sl => `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--s1)] border border-[var(--line-2)] text-[11px] font-medium text-[var(--tx)]">
        <i class="ph ${sl.type === 'pdf' ? 'ph-file-pdf text-rose-400' : sl.type === 'images' ? 'ph-images text-sky-400' : 'ph-presentation-chart text-pink-400'}"></i>
        <span class="truncate max-w-[180px]">${sl.title}</span>
        <button type="button" onclick="removeTopicModalSlide('${sl.id}')" class="text-[var(--danger)] hover:opacity-75 font-bold ml-0.5" title="นำสไลด์นี้ออก">×</button>
      </span>
    `).join("");
  }

  window.removeTopicModalSlide = function(slideId) {
    modalRemovedSlideIds.add(slideId);
    renderModalExistingSlidesChips();
  };

  document.getElementById("top-html-file")?.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (file) {
      document.getElementById("top-html-code").value = await file.text();
      if (!document.getElementById("top-title").value.trim()) {
        document.getElementById("top-title").value = file.name.replace(/\.html?$/i, "");
      }
    }
  });

  document.getElementById("top-pdf-file")?.addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    const baseName = f.name.replace(/\.pdf$/i, "");
    const topSlideTitleEl = document.getElementById("top-slide-title");
    if (topSlideTitleEl && !topSlideTitleEl.value.trim()) topSlideTitleEl.value = baseName;
    const topTitleEl = document.getElementById("top-title");
    if (topTitleEl && !topTitleEl.value.trim()) topTitleEl.value = baseName;
  });

  window.openTopicModal = function(preferredSubId = null, editTopicId = null, focusSection = null) {
    if (!topicModal) return;
    document.getElementById("topic-form").reset();
    document.getElementById("top-edit-id").value = editTopicId || "";
    modalExistingLinkRecord = null;
    modalExistingSlidesList = [];
    modalRemovedSlideIds = new Set();

    const subId = getPreferredTargetSubjectId(preferredSubId);
    syncSubjectSelects(subId);

    const existingBadge = document.getElementById("top-existing-link-badge");
    const sub = allSubjects.find(s => s.id === subId);
    const editTopic = editTopicId && sub ? (sub.topics || []).find(t => t.id === editTopicId) : null;

    if (editTopic) {
      document.getElementById("top-modal-heading").textContent = `แก้ไขเรื่อง: ${editTopic.title}`;
      document.getElementById("top-title").value = editTopic.title || "";
      document.getElementById("top-subtitle").value = editTopic.subtitle || "";
      if (topSubjectSelect) topSubjectSelect.disabled = true;
      document.getElementById("top-inline-toggle-btn")?.classList.add("hidden");

      modalExistingLinkRecord = editTopic.link ? { ...editTopic.link } : null;
      modalExistingSlidesList = (editTopic.slides || []).map(sl => ({ ...sl }));
      document.getElementById("top-url-input").value = getLinkExternalUrl(modalExistingLinkRecord);

      const hasSavedHtml = isEmbeddedHtmlLink(modalExistingLinkRecord);
      existingBadge?.classList.toggle("hidden", !hasSavedHtml);
      if (modalExistingLinkRecord && !hasSavedHtml && modalExistingLinkRecord.url) {
        setTopicLinkMode(focusSection === "link" ? "html" : "url");
      } else {
        setTopicLinkMode("html");
      }

      renderModalExistingSlidesChips();
      setTopicSlideMode(focusSection === "slide" || modalExistingSlidesList.length === 0 ? "pdf" : "none");
      document.getElementById("top-submit-btn").innerHTML = `<i class="ph ph-check-circle text-sm"></i><span>บันทึกการอัปเดตเรื่องนี้</span>`;
    } else {
      document.getElementById("top-modal-heading").textContent = "เพิ่มเรื่องใหม่ (เว็บสรุป + สไลด์ในเรื่องเดียว)";
      existingBadge?.classList.add("hidden");
      renderModalExistingSlidesChips();
      setTopicLinkMode("html");
      setTopicSlideMode("pdf");
      document.getElementById("top-submit-btn").innerHTML = `<i class="ph ph-check-circle text-sm"></i><span>บันทึกเรื่องนี้และเปิดอ่าน (เว็บสรุป + สไลด์)</span>`;
    }

    topicModal.classList.remove("hidden");
    requestAnimationFrame(() => {
      if (focusSection === "slide") {
        document.getElementById("top-slide-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (focusSection === "link") {
        document.getElementById("top-link-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (!editTopic) {
        document.getElementById("top-title")?.focus();
      }
    });
  };

  window.closeTopicModal = function() {
    topicModal?.classList.add("hidden");
  };

  window.editActiveTopic = function(focusSection = null) {
    if (!activeSubjectId) return;
    openTopicModal(activeSubjectId, activeTopicId, focusSection);
  };

  // Backwards-compatible aliases
  window.openQuickSlideUpload = () => openTopicModal();
  window.openAddLinkModal = (preferredId = null) => openTopicModal(preferredId, null, "link");
  window.openAddSlideModal = (preferredId = null) => openTopicModal(preferredId, activeTopicId || null, "slide");

  document.getElementById("topic-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const editTopicId = document.getElementById("top-edit-id").value;
    const title = document.getElementById("top-title").value.trim();
    const subtitle = document.getElementById("top-subtitle").value.trim();
    const today = new Date().toISOString().split("T")[0];
    if (!title) {
      showToast("กรุณากรอกชื่อเรื่อง");
      document.getElementById("top-title")?.focus();
      return;
    }

    const targetSubId = editTopicId ? activeSubjectId : ensureTargetSubjectId("top", topSubjectSelect);
    if (!targetSubId) return;

    // 1. Prepare Summary Link (optional — supports HTML code, URL, or BOTH together)
    let nextLink = null;
    const htmlCode = document.getElementById("top-html-code").value.trim();
    const urlVal = document.getElementById("top-url-input").value.trim();

    if (topicLinkMode === "html") {
      if (htmlCode) {
        const idbKey = "html-" + Date.now();
        await StudyVaultDB.setBlob(idbKey, new Blob([htmlCode], { type: "text/html" }));
        nextLink = {
          id: modalExistingLinkRecord?.id || ("lnk-" + Date.now()),
          title,
          subtitle,
          type: "Embedded HTML",
          url: "",
          repoPath: "",
          idbKey,
          badge: "HTML ในตัว",
          frameRestricted: false,
          updatedAt: today
        };
        if (urlVal) nextLink.externalUrl = urlVal;
      } else if (isEmbeddedHtmlLink(modalExistingLinkRecord)) {
        nextLink = { ...modalExistingLinkRecord, title, subtitle, updatedAt: today };
        if (urlVal) nextLink.externalUrl = urlVal;
        else delete nextLink.externalUrl;
      } else if (urlVal) {
        nextLink = {
          id: modalExistingLinkRecord?.id || ("lnk-" + Date.now()),
          title,
          subtitle,
          type: "Web App",
          url: urlVal,
          repoPath: "",
          badge: "Web App",
          frameRestricted: isLikelyRestrictedUrl(urlVal),
          updatedAt: today
        };
      }
    } else if (topicLinkMode === "url" && urlVal) {
      nextLink = {
        id: modalExistingLinkRecord?.id || ("lnk-" + Date.now()),
        title,
        subtitle,
        type: "Web App",
        url: urlVal,
        repoPath: "",
        badge: "Web App",
        frameRestricted: isLikelyRestrictedUrl(urlVal),
        updatedAt: today
      };
    }

    // 2. Prepare New Slide to Attach (optional)
    const keptExistingSlides = modalExistingSlidesList.filter(sl => !modalRemovedSlideIds.has(sl.id));
    let addedSlide = null;
    const slideTitleInput = document.getElementById("top-slide-title")?.value.trim() || "";

    if (topicSlideMode === "pdf") {
      const pdfFile = document.getElementById("top-pdf-file")?.files[0];
      if (pdfFile) {
        const slId = "sl-" + (Date.now() + 1);
        const key = "pdf-" + (Date.now() + 1);
        await StudyVaultDB.setBlob(key, pdfFile);
        addedSlide = {
          id: slId,
          title: slideTitleInput || pdfFile.name.replace(/\.pdf$/i, "") || title,
          type: "pdf",
          idbKey: key,
          updatedAt: today
        };
      }
    } else if (topicSlideMode === "images") {
      const imgFiles = Array.from(document.getElementById("top-img-files")?.files || []);
      if (imgFiles.length > 0) {
        const slId = "sl-" + (Date.now() + 1);
        const key = "imgs-" + (Date.now() + 1);
        await StudyVaultDB.setBlob(key, imgFiles);
        addedSlide = {
          id: slId,
          title: slideTitleInput || `${title} (รูปสไลด์ ${imgFiles.length} หน้า)`,
          type: "images",
          idbKey: key,
          updatedAt: today
        };
      }
    } else if (topicSlideMode === "url") {
      const slUrl = document.getElementById("top-slide-url-input")?.value.trim() || "";
      if (slUrl) {
        addedSlide = {
          id: "sl-" + (Date.now() + 1),
          title: slideTitleInput || title,
          type: "url",
          url: slUrl,
          updatedAt: today
        };
      }
    }

    const finalSlides = addedSlide ? [...keptExistingSlides, addedSlide] : keptExistingSlides;
    let savedTopicId = null;

    if (editTopicId) {
      const promoted = promoteTopicToCustom(targetSubId, editTopicId);
      if (promoted) {
        promoted.title = title;
        promoted.subtitle = subtitle;
        promoted.updatedAt = today;
        promoted.createdAt = Date.now();
        promoted.link = nextLink;
        promoted.slides = finalSlides;
        savedTopicId = promoted.id;
      }
    }

    if (!savedTopicId) {
      const newTopic = {
        id: "top-" + Date.now(),
        title,
        subtitle,
        updatedAt: today,
        createdAt: Date.now(),
        link: nextLink,
        slides: finalSlides
      };
      if (!customTopicsMap[targetSubId]) customTopicsMap[targetSubId] = [];
      customTopicsMap[targetSubId].unshift(newTopic);
      savedTopicId = newTopic.id;
    }

    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    closeTopicModal();
    openTopicStudio(targetSubId, savedTopicId, addedSlide ? { slideId: addedSlide.id, openSlides: true } : {});
    const hasBoth = Boolean(nextLink && finalSlides.length > 0);
    showToast(hasBoth ? `บันทึกเรื่อง "${title}" พร้อมเว็บสรุป + สไลด์แล้ว!` : `บันทึกเรื่อง "${title}" เรียบร้อย`);
    triggerAutoSyncIfEnabled();
  });

  // =========================================================================
  // 11. BACKUP EXPORT / IMPORT / RESET & SHORTCUTS
  // =========================================================================
  window.exportBackupJSON = function() {
    const payload = {
      exportedAt: new Date().toISOString(),
      customSubjects,
      deletedSubjectIds: [...deletedSubjectIds],
      customTopicsMap,
      deletedTopicIds: [...deletedTopicIds],
      topicOverrides,
      customLinksMap,
      deletedLinkIds: [...deletedLinkIds],
      linkOverrides,
      customSlidesMap,
      deletedSlideIds: [...deletedSlideIds],
      slideOverrides,
      favorites: [...favorites]
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `studyvault-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    showToast("ส่งออกไฟล์สำรองข้อมูลเรียบร้อย");
  };

  document.getElementById("import-backup-input").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      customSubjects = data.customSubjects || [];
      deletedSubjectIds = new Set(data.deletedSubjectIds || []);
      customTopicsMap = data.customTopicsMap || {};
      deletedTopicIds = new Set(data.deletedTopicIds || []);
      topicOverrides = data.topicOverrides || {};
      customLinksMap = data.customLinksMap || {};
      deletedLinkIds = new Set(data.deletedLinkIds || []);
      linkOverrides = data.linkOverrides || {};
      customSlidesMap = data.customSlidesMap || {};
      deletedSlideIds = new Set(data.deletedSlideIds || []);
      slideOverrides = data.slideOverrides || {};
      favorites = new Set(data.favorites || []);
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      renderCategories();
      navigateHome();
      showToast("นำเข้าข้อมูลสำรองสำเร็จ");
    } catch {
      showToast("ไฟล์สำรองข้อมูลไม่ถูกต้อง");
    }
    e.target.value = "";
  });

  window.toggleFavorite = function(id) {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    saveState();
    updateStats();
    renderCategories();
    if (!viewHome.classList.contains("hidden")) renderSubjectsGrid();
  };

  function handleSearch(val) {
    searchQuery = val;
    searchInput.value = val;
    searchInputMobile.value = val;
    if (!viewHome.classList.contains("hidden")) renderSubjectsGrid();
    else if (val.trim().length > 0) navigateHome();
  }
  searchInput.addEventListener("input", e => handleSearch(e.target.value));
  searchInputMobile.addEventListener("input", e => handleSearch(e.target.value));

  window.addEventListener("keydown", e => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      searchInput.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !slidePdfViewer.classList.contains("hidden") && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      if (e.shiftKey) redoPdfStroke();
      else undoPdfStroke();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !slidePdfViewer.classList.contains("hidden") && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      redoPdfStroke();
    }
    if (e.key === "Escape") {
      closeAddSubjectModal();
      closeTopicModal();
      closePairTopicModal();
      closeAdminModal();
    }
  });

  window.resetToDefaultData = async function() {
    if (confirm("ต้องการล้างข้อมูลและโน้ตที่เก็บเฉพาะในเครื่องนี้ เพื่อกลับไปรับข้อมูลล่าสุดจากเว็บกลางหรือไม่?")) {
      [LS_CUSTOM_SUBJECTS, LS_DELETED_SUBJECTS, LS_CUSTOM_TOPICS, LS_DELETED_TOPICS, LS_TOPIC_OVERRIDES, LS_CUSTOM_LINKS, LS_DELETED_LINKS, LS_LINK_OVERRIDES, LS_CUSTOM_SLIDES, LS_DELETED_SLIDES, LS_SLIDE_OVERRIDES, LS_FAVORITES, LS_LOCKED_SUBJECT].forEach(k => localStorage.removeItem(k));
      await StudyVaultDB.clearAll().catch(() => {});
      blobUrlCache.clear();
      customSubjects = []; deletedSubjectIds.clear();
      customTopicsMap = {}; deletedTopicIds.clear(); topicOverrides = {};
      customLinksMap = {}; deletedLinkIds.clear(); linkOverrides = {};
      customSlidesMap = {}; deletedSlideIds.clear(); slideOverrides = {}; favorites.clear();
      lockedSubjectId = "";
      allSubjects = getMergedSubjects();
      updateStats(); renderCategories(); navigateHome(true, "__ALL__");
      showToast("รีเซ็ตข้อมูลในเครื่องเรียบร้อย");
    }
  };

  function routeByHash(hash) {
    const mTopic = hash.match(/^#subject\/([^/]+)\/topic\/([^/]+)$/);
    if (mTopic) {
      const [, subId, topId] = mTopic;
      if (allSubjects.some(s => s.id === subId)) {
        openTopicStudio(subId, topId, {});
        return true;
      }
      return false;
    }
    if (hash.startsWith("#subject/")) {
      const id = hash.replace("#subject/", "");
      if (allSubjects.some(s => s.id === id)) {
        selectedHomeSubjectId = id;
        navigateHome(false);
        return true;
      }
      return false;
    }
    navigateHome(false);
    return true;
  }

  window.addEventListener("hashchange", () => {
    const hash = window.location.hash;
    if (hash && !routeByHash(hash)) navigateHome(true, "__ALL__");
    else if (!hash) navigateHome(false);
  });
  window.addEventListener("resize", () => requestAnimationFrame(updateScopeThumb));

  // Initialize (Sync UI first, then load shared library from GitHub / shared-library.json)
  initTheme();
  syncAdminUI();

  async function bootstrapApp() {
    if (typeof StudyVaultSync !== "undefined") {
      try {
        sharedBaseSubjects = await StudyVaultSync.loadSharedSubjects();
      } catch (e) {
        console.warn("Using embedded fallback SUBJECTS_DATA:", e);
      }
    }

    allSubjects = getMergedSubjects();
    updateStats();
    renderCategories();
    syncAdminUI();

    const params = new URLSearchParams(window.location.search);
    if (params.get("slidePopout") === "1") {
      const subId = params.get("subject");
      const slId = params.get("slide");
      if (subId && allSubjects.some(s => s.id === subId)) {
        mainTopbar.classList.add("hidden");
        mainFooter.classList.add("hidden");
        openSubject(subId, false, { slideId: slId, openSlides: true });
        wsSidebar.classList.add("hidden");
        wsWebPane.classList.add("hidden");
        splitResizer.classList.add("hidden");
        wsSlidePane.classList.remove("hidden");
        wsSlidePane.classList.add("flex");
        wsSlidePane.style.flex = "1 1 100%";
        slideCloseBtn.classList.add("hidden");
        if (slId) selectSlide(slId, false);
        return;
      }
    }

    const initialHash = window.location.hash;
    if (initialHash) {
      if (routeByHash(initialHash)) return;
      history.replaceState("", document.title, window.location.pathname + window.location.search);
    }
    renderSubjectsGrid();

    if (isAdminMode() && typeof StudyVaultSync !== "undefined") {
      const cfg = StudyVaultSync.getConfig();
      if (cfg.autoSync && getPendingSyncCount() > 0 && !cfg.lastSyncError) {
        setTimeout(() => syncLibraryToGitHub(true), 350);
      }
    }
  }

  bootstrapApp();
});
