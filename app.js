/**
 * 📚 StudyVault — OpenHiggsfield Studio Edition (Hardened & Full-Featured)
 * - Cached IndexedDB Blob URLs (zero flicker / zero leaks)
 * - Full Add / Edit / Delete / 6s Undo for Subjects, Links, Slides
 * - Link Upgrade flow: convert any SAMEORIGIN link to embedded HTML right in place
 * - Side-by-Side Split View with Draggable Resizer, Side Swap, Drag-and-Drop Slides, Popout Dual Window
 * - JSON Backup Export / Import
 */

document.addEventListener("DOMContentLoaded", () => {
  // App State
  let currentCategory = "ทั้งหมด";
  let searchQuery = "";
  let activeSubjectId = null;
  let activeLinkId = null;
  let activeSlideId = null;
  let isSplitMode = false;
  let isSwappedSides = false;
  let splitLeftPct = 50;
  let currentImageSlideIdx = 0;
  let currentImageSlideUrls = [];
  let imageZoom = 1;
  let iframeTimeoutHandle = null;

  // Modal Modes
  let subSourceMode = "url";
  let lnkSourceMode = "url";
  let slideTypeMode = "pdf";

  // Cached Blob URLs (idbKey -> objectUrl) to avoid redundant createObjectURL calls
  const blobUrlCache = new Map();

  // Storage Keys
  const LS_THEME = "studyvault_theme";
  const LS_FAVORITES = "studyvault_favorites";
  const LS_CUSTOM_SUBJECTS = "studyvault_custom_subjects";
  const LS_DELETED_SUBJECTS = "studyvault_deleted_subjects";
  const LS_CUSTOM_LINKS = "studyvault_custom_links";
  const LS_DELETED_LINKS = "studyvault_deleted_links";
  const LS_LINK_OVERRIDES = "studyvault_link_overrides";
  const LS_CUSTOM_SLIDES = "studyvault_custom_slides";
  const LS_DELETED_SLIDES = "studyvault_deleted_slides";
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
  let customLinksMap = loadJSON(LS_CUSTOM_LINKS, {});
  let deletedLinkIds = new Set(loadJSON(LS_DELETED_LINKS, []));
  let linkOverrides = loadJSON(LS_LINK_OVERRIDES, {}); // linkId -> updated link fields
  let customSlidesMap = loadJSON(LS_CUSTOM_SLIDES, {});
  let deletedSlideIds = new Set(loadJSON(LS_DELETED_SLIDES, []));
  let favorites = new Set(loadJSON(LS_FAVORITES, []));

  splitLeftPct = loadJSON(LS_SPLIT_PCT, 50);
  isSwappedSides = loadJSON(LS_SWAP_SIDES, false);
  let lockedSubjectId = localStorage.getItem(LS_LOCKED_SUBJECT) || "";

  function saveState() {
    localStorage.setItem(LS_CUSTOM_SUBJECTS, JSON.stringify(customSubjects));
    localStorage.setItem(LS_DELETED_SUBJECTS, JSON.stringify([...deletedSubjectIds]));
    localStorage.setItem(LS_CUSTOM_LINKS, JSON.stringify(customLinksMap));
    localStorage.setItem(LS_DELETED_LINKS, JSON.stringify([...deletedLinkIds]));
    localStorage.setItem(LS_LINK_OVERRIDES, JSON.stringify(linkOverrides));
    localStorage.setItem(LS_CUSTOM_SLIDES, JSON.stringify(customSlidesMap));
    localStorage.setItem(LS_DELETED_SLIDES, JSON.stringify([...deletedSlideIds]));
    localStorage.setItem(LS_FAVORITES, JSON.stringify([...favorites]));
  }

  function getMergedSubjects() {
    const base = [...customSubjects, ...SUBJECTS_DATA].filter(s => !deletedSubjectIds.has(s.id));
    return base.map(sub => {
      const extraLinks = customLinksMap[sub.id] || [];
      const baseLinks = Array.isArray(sub.links) ? sub.links : [];
      const mergedLinks = [...extraLinks, ...baseLinks]
        .filter(l => !deletedLinkIds.has(l.id))
        .map(l => (linkOverrides[l.id] ? { ...l, ...linkOverrides[l.id] } : l));

      const extraSlides = customSlidesMap[sub.id] || [];
      const baseSlides = Array.isArray(sub.slides) ? sub.slides : [];
      const mergedSlides = [...extraSlides, ...baseSlides].filter(sl => !deletedSlideIds.has(sl.id));

      return { ...sub, links: mergedLinks, slides: mergedSlides };
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
  const searchInput = document.getElementById("search-input");
  const searchInputMobile = document.getElementById("search-input-mobile");

  const statSubjects = document.getElementById("stat-subjects");
  const statLinks = document.getElementById("stat-links");
  const statSlides = document.getElementById("stat-slides");
  const statFavorites = document.getElementById("stat-favorites");

  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const themeIcon = document.getElementById("theme-icon");

  const wsIcon = document.getElementById("ws-subject-icon");
  const wsCode = document.getElementById("ws-subject-code");
  const wsCategory = document.getElementById("ws-subject-category");
  const wsTitle = document.getElementById("ws-subject-title");
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
  const wsTags = document.getElementById("ws-subject-tags");

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
  const restrictedFallbackBtn = document.getElementById("restricted-fallback-btn");

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
  const addLinkModal = document.getElementById("add-link-modal");
  const addSlideModal = document.getElementById("add-slide-modal");
  const toastEl = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-msg");
  const toastUndoBtn = document.getElementById("toast-undo-btn");
  const toastProgress = document.getElementById("toast-progress");

  // Cached Blob Resolver
  async function resolveResourceUrl(item) {
    if (!item) return "";
    if (item.idbKey) {
      if (blobUrlCache.has(item.idbKey)) return blobUrlCache.get(item.idbKey);
      try {
        const data = await StudyVaultDB.getBlob(item.idbKey);
        if (data instanceof Blob) {
          const url = URL.createObjectURL(data);
          blobUrlCache.set(item.idbKey, url);
          return url;
        }
      } catch (e) {
        console.error("IDB load failed:", e);
      }
    }
    return item.url || "";
  }

  async function resolveImageDeckUrls(idbKey) {
    if (blobUrlCache.has(idbKey)) return blobUrlCache.get(idbKey);
    const blobs = await StudyVaultDB.getBlob(idbKey);
    if (Array.isArray(blobs) && blobs.length > 0) {
      const urls = blobs.map(b => URL.createObjectURL(b));
      blobUrlCache.set(idbKey, urls);
      return urls;
    }
    return [];
  }

  const previewResizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const box = entry.target;
      const iframe = box.querySelector(".preview-iframe-scale");
      if (iframe) {
        iframe.style.transform = `scale(${entry.contentRect.width / 1200})`;
      }
    }
  });

  // Toast + Undo
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

    toastProgress.classList.remove("ohf-drain-bar");
    void toastProgress.offsetWidth;
    toastProgress.classList.add("ohf-drain-bar");

    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 6000);
  }

  // 1. Theme
  function initTheme() {
    const saved = localStorage.getItem(LS_THEME);
    if (saved === "light") {
      htmlRoot.classList.remove("dark");
      themeIcon.className = "ph ph-moon";
    } else {
      htmlRoot.classList.add("dark");
      themeIcon.className = "ph ph-sun";
    }
  }

  themeToggleBtn.addEventListener("click", () => {
    const isDark = htmlRoot.classList.toggle("dark");
    themeIcon.className = isDark ? "ph ph-sun" : "ph ph-moon";
    localStorage.setItem(LS_THEME, isDark ? "dark" : "light");
  });

  // 2. Stats & Categories
  function updateStats() {
    statSubjects.textContent = String(allSubjects.length).padStart(2, "0");
    statLinks.textContent = String(allSubjects.reduce((s, x) => s + x.links.length, 0)).padStart(2, "0");
    statSlides.textContent = String(allSubjects.reduce((s, x) => s + x.slides.length, 0)).padStart(2, "0");
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
        isActive ? "text-[var(--tx)]" : "text-[var(--tx3)] hover:text-[var(--tx2)]"
      }`;
      btn.innerHTML = `<span>${cat}</span><span class="tnum text-[10px] ${isActive ? 'text-[var(--accent)] font-semibold' : 'text-[var(--tx4)]'}">${count}</span>`;
      btn.addEventListener("click", () => selectCategory(cat));
      categoryTabsRail.appendChild(btn);
    });
    requestAnimationFrame(updateScopeThumb);
  }

  window.selectCategory = function(cat) {
    currentCategory = cat;
    if (viewHome.classList.contains("hidden")) navigateHome();
    renderCategories();
    renderSubjectsGrid();
  };

  // 3. Level 1: Subject Cards Grid
  async function renderSubjectsGrid() {
    previewResizeObserver.disconnect();

    const filtered = allSubjects.filter(sub => {
      let matchCat = true;
      if (currentCategory === "⭐ ติดดาว") matchCat = favorites.has(sub.id);
      else if (currentCategory !== "ทั้งหมด") matchCat = sub.category === currentCategory;

      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q ||
        sub.title.toLowerCase().includes(q) ||
        sub.code.toLowerCase().includes(q) ||
        sub.description.toLowerCase().includes(q) ||
        (sub.tags || []).some(t => t.toLowerCase().includes(q)) ||
        sub.links.some(l => l.title.toLowerCase().includes(q));

      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      subjectsGrid.innerHTML = `
        <div class="col-span-full ohf-surface rounded-2xl py-16 px-6 text-center max-w-md mx-auto">
          <div class="w-11 h-11 mx-auto mb-3 rounded-xl bg-[var(--s2)] border border-[var(--line-2)] flex items-center justify-center text-xl text-[var(--tx3)]">
            <i class="ph ph-magnifying-glass"></i>
          </div>
          <p class="text-sm font-semibold text-[var(--tx)]">ไม่พบรายวิชาที่ค้นหา</p>
          <p class="text-xs text-[var(--tx3)] mt-1 mb-4">เพิ่มวิชาใหม่ได้เลย หรือล้างคำค้นหา</p>
          <button onclick="document.getElementById('open-add-subject-btn').click()" class="ohf-btn-primary h-8 px-4 rounded-lg text-xs">+ เพิ่มวิชาใหม่</button>
        </div>
      `;
      return;
    }

    const resolvedCards = await Promise.all(filtered.map(async sub => {
      let previewSrc = null;
      // Prefer first embeddable link (including upgraded HTML link!), else fallback previewUrl
      const firstEmbeddable = sub.links.find(l => l.idbKey || (!l.frameRestricted && !isLikelyRestrictedUrl(l.url)));
      if (firstEmbeddable) {
        previewSrc = await resolveResourceUrl(firstEmbeddable);
      } else if (sub.previewIdbKey) {
        previewSrc = await resolveResourceUrl({ idbKey: sub.previewIdbKey });
      } else if (sub.previewUrl) {
        previewSrc = sub.previewUrl;
      }
      return { sub, previewSrc };
    }));

    subjectsGrid.innerHTML = resolvedCards.map(({ sub, previewSrc }) => {
      const isFav = favorites.has(sub.id);
      const primaryUrl = sub.links[0]?.idbKey ? "embedded-html://summary" : (sub.links[0]?.url || "ยังไม่มีลิงก์");

      return `
      <article 
        onclick="openSubject('${sub.id}')"
        class="group cursor-pointer ohf-surface rounded-2xl overflow-hidden transition-all duration-300 hover:border-[var(--line-2)] ${sub.isFeatured ? 'ring-1 ring-[var(--accent-32)]' : ''} flex flex-col justify-between"
      >
        <div class="relative bg-[var(--rail)] border-b border-[var(--line)]">
          <div class="px-3 py-2 bg-[var(--rail)] border-b border-[var(--line)] flex items-center justify-between gap-2">
            <div class="flex items-center gap-1 opacity-55">
              <span class="w-2 h-2 rounded-full bg-[var(--tx4)]"></span>
              <span class="w-2 h-2 rounded-full bg-[var(--tx4)]"></span>
              <span class="w-2 h-2 rounded-full bg-[var(--tx4)]"></span>
            </div>
            <div class="flex-1 mx-2 px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[10px] text-[var(--tx3)] truncate text-center tnum">
              ${primaryUrl.replace(/^https?:\/\//, "").slice(0, 38)}
            </div>
            <span class="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--tx2)]">
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
              <span>Live</span>
            </span>
          </div>

          <div class="card-preview-box relative w-full aspect-[16/10] overflow-hidden bg-[var(--bg)]">
            ${previewSrc ? `
              <iframe src="${previewSrc}" class="preview-iframe-scale" loading="lazy" tabindex="-1" sandbox="allow-scripts allow-same-origin"></iframe>
            ` : `
              <div class="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[var(--s1)]">
                <div class="w-11 h-11 rounded-xl bg-[var(--s3)] border border-[var(--line-2)] flex items-center justify-center text-xl mb-2">${sub.icon || '📘'}</div>
                <p class="text-xs font-semibold text-[var(--tx)]">${sub.title}</p>
                <p class="text-[11px] text-[var(--tx3)] mt-1">คลิกเพื่อดูลิงก์ในวิชานี้</p>
              </div>
            `}
            <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center p-3.5" style="background: linear-gradient(to top, rgba(10,10,11,0.82) 0%, rgba(10,10,11,0.18) 55%, transparent 100%);">
              <span class="ohf-btn-primary h-8 px-3.5 rounded-lg text-xs flex items-center gap-1.5 shadow-lg">
                <span>เข้าสู่วิชา (${sub.links.length} ลิงก์ • ${sub.slides.length} สไลด์)</span>
                <i class="ph ph-arrow-right"></i>
              </span>
            </div>
          </div>
        </div>

        <div class="p-4 flex-1 flex flex-col justify-between gap-3">
          <div class="space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 tnum">
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${sub.isFeatured ? 'bg-[var(--accent-08)] text-[var(--accent)] border border-[var(--accent-32)]' : 'bg-[var(--s3)] text-[var(--tx2)] border border-[var(--line)]'}">
                  ${sub.code}
                </span>
                <span class="text-[11px] text-[var(--tx3)]">${sub.category}</span>
              </div>
              <div class="flex items-center gap-0.5">
                <button onclick="event.stopPropagation(); toggleFavorite('${sub.id}')" class="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--s3)] transition-colors ${isFav ? 'text-[var(--accent)]' : 'text-[var(--tx4)] hover:text-[var(--tx2)]'}" title="ติดดาว">
                  <i class="ph ${isFav ? 'ph-star-fill' : 'ph-star'} text-sm"></i>
                </button>
                <button onclick="event.stopPropagation(); deleteSubject('${sub.id}')" class="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--tx4)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] opacity-60 group-hover:opacity-100 transition-all" title="ลบวิชานี้">
                  <i class="ph ph-trash text-sm"></i>
                </button>
              </div>
            </div>

            <div class="flex items-start gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-[var(--s2)] border border-[var(--line-2)] flex items-center justify-center text-[var(--tx)] text-base flex-shrink-0">
                ${sub.icon || '📘'}
              </div>
              <div>
                ${sub.isFeatured ? `<span class="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--accent)] mb-0.5"><span class="w-1 h-1 rounded-full bg-[var(--accent)]"></span> วิชาเด่น</span>` : ''}
                <h3 class="font-semibold text-sm text-[var(--tx)] group-hover:text-[var(--accent)] transition-colors leading-snug">${sub.title}</h3>
              </div>
            </div>

            <p class="text-xs text-[var(--tx3)] leading-relaxed line-clamp-2">${sub.description}</p>
          </div>

          <div class="pt-3 border-t border-[var(--line)] flex items-center justify-between gap-2 tnum">
            <div class="flex items-center gap-3 text-[11px] text-[var(--tx2)]">
              <span class="flex items-center gap-1"><i class="ph ph-link-simple text-[var(--accent)]"></i> ${String(sub.links.length).padStart(2, "0")} ลิงก์</span>
              <span class="flex items-center gap-1"><i class="ph ph-presentation-chart text-[var(--tx3)]"></i> ${String(sub.slides.length).padStart(2, "0")} สไลด์</span>
            </div>
            <span class="text-[11px] font-medium text-[var(--tx3)] group-hover:text-[var(--tx)] flex items-center gap-1">
              <span>เปิดดู</span><i class="ph ph-caret-right"></i>
            </span>
          </div>
        </div>
      </article>
      `;
    }).join("");

    document.querySelectorAll(".card-preview-box").forEach(box => previewResizeObserver.observe(box));
  }

  // 4. Delete Subject + Undo
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

    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    renderCategories();
    if (activeSubjectId === subjectId) navigateHome();
    else renderSubjectsGrid();

    showToast(`ลบวิชา "${sub.title}" แล้ว`, () => {
      if (wasCustom && removedCustom) customSubjects.unshift(removedCustom);
      else deletedSubjectIds.delete(subjectId);
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      renderCategories();
      renderSubjectsGrid();
    });
  };

  // 5. Level 2: Subject Workspace
  window.openSubject = function(subjectId, updateHash = true) {
    const sub = allSubjects.find(s => s.id === subjectId);
    if (!sub) return;

    activeSubjectId = subjectId;
    if (updateHash) window.location.hash = `subject/${subjectId}`;

    wsIcon.innerHTML = sub.icon || "📘";
    wsCode.textContent = sub.code;
    wsCategory.textContent = sub.category;
    wsTitle.textContent = sub.title;
    wsDesc.textContent = sub.description;
    wsTags.innerHTML = (sub.tags || []).map(t => `<span class="text-[10px] px-2 py-0.5 rounded bg-[var(--s2)] text-[var(--tx2)] border border-[var(--line)]">#${t}</span>`).join("");
    wsDeleteSubjectBtn.onclick = () => deleteSubject(subjectId);

    updateWorkspaceStar();
    renderWorkspaceLinks(sub);
    renderWorkspaceSlides(sub);
    applySplitModeLayout();

    if (sub.links.length > 0) {
      const keepExisting = sub.links.some(l => l.id === activeLinkId);
      selectLink(keepExisting ? activeLinkId : sub.links[0].id);
    } else {
      showEmptyLinkStage();
    }

    if (sub.slides.length > 0) {
      const keepSlide = sub.slides.some(sl => sl.id === activeSlideId);
      selectSlide(keepSlide ? activeSlideId : sub.slides[0].id, false);
    } else {
      renderSlideEmpty();
    }

    viewHome.classList.add("hidden");
    viewSubject.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.navigateHome = function(updateHash = true) {
    activeSubjectId = null;
    activeLinkId = null;
    activeSlideId = null;
    isSplitMode = false;
    clearTimeout(iframeTimeoutHandle);
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
    wsStarBtn.innerHTML = `<i class="ph ${isFav ? 'ph-star-fill text-[var(--accent)]' : 'ph-star'} text-base"></i>`;
  }
  wsStarBtn.addEventListener("click", () => {
    if (activeSubjectId) {
      toggleFavorite(activeSubjectId);
      updateWorkspaceStar();
    }
  });

  // 6. Workspace Links + Edit + Delete + Undo
  function renderWorkspaceLinks(sub) {
    wsLinksCount.textContent = String(sub.links.length).padStart(2, "0");

    splitLinkSelect.innerHTML = sub.links.map((l, i) =>
      `<option value="${l.id}" ${l.id === activeLinkId ? "selected" : ""}>${String(i + 1).padStart(2, "0")}. ${l.title}</option>`
    ).join("");
    splitLinkSelect.onchange = e => selectLink(e.target.value);

    if (sub.links.length === 0) {
      wsLinksList.innerHTML = `
        <div class="ohf-rail p-4 rounded-xl text-center space-y-2">
          <p class="text-xs text-[var(--tx3)]">ยังไม่มีลิงก์บทเรียน</p>
          <button onclick="openAddLinkModal()" class="text-xs text-[var(--accent)] font-medium hover:underline">+ เพิ่มลิงก์แรก</button>
        </div>
      `;
      return;
    }

    wsLinksList.innerHTML = sub.links.map((link, idx) => {
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
          <span class="tnum w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
            isSelected ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--s3)] text-[var(--tx3)]"
          }">${num}</span>

          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-1">
              <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--s2)] text-[var(--tx2)] border border-[var(--line)]">
                ${link.badge || link.type || "สรุป"}
              </span>
              <div class="flex items-center gap-0.5">
                <button onclick="event.stopPropagation(); openEditLinkModal('${link.id}')" class="text-[var(--tx4)] hover:text-[var(--accent)] p-1 rounded opacity-60 group-hover:opacity-100 transition-all" title="แก้ไข / วางโค้ด HTML">
                  <i class="ph ph-pencil-simple text-xs"></i>
                </button>
                ${link.url ? `
                  <a href="${link.url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="text-[var(--tx3)] hover:text-[var(--accent)] p-1 transition-colors" title="เปิดแท็บใหม่">
                    <i class="ph ph-arrow-square-out text-xs"></i>
                  </a>
                ` : ''}
                <button onclick="event.stopPropagation(); deleteLink('${link.id}')" class="text-[var(--tx4)] hover:text-[var(--danger)] p-1 rounded opacity-60 group-hover:opacity-100 transition-all" title="ลบลิงก์นี้">
                  <i class="ph ph-trash text-xs"></i>
                </button>
              </div>
            </div>

            <h4 class="text-xs font-semibold ${isSelected ? 'text-[var(--tx)]' : 'text-[var(--tx2)] group-hover:text-[var(--tx)]'} leading-snug">${link.title}</h4>
            ${link.subtitle ? `<p class="text-[11px] text-[var(--tx3)] mt-1 line-clamp-2">${link.subtitle}</p>` : ''}
          </div>
        </div>
      `;
    }).join("");
  }

  window.deleteLink = function(linkId) {
    const sub = allSubjects.find(s => s.id === activeSubjectId);
    if (!sub) return;
    const link = sub.links.find(l => l.id === linkId);
    if (!link) return;

    const customList = customLinksMap[activeSubjectId] || [];
    const wasCustom = customList.some(l => l.id === linkId);
    let removedCustom = null;
    if (wasCustom) {
      removedCustom = customList.find(l => l.id === linkId);
      customLinksMap[activeSubjectId] = customList.filter(l => l.id !== linkId);
    } else {
      deletedLinkIds.add(linkId);
    }

    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    openSubject(activeSubjectId, false);

    showToast(`ลบลิงก์ "${link.title}" แล้ว`, () => {
      if (wasCustom && removedCustom) {
        if (!customLinksMap[activeSubjectId]) customLinksMap[activeSubjectId] = [];
        customLinksMap[activeSubjectId].unshift(removedCustom);
      } else {
        deletedLinkIds.delete(linkId);
      }
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      if (activeSubjectId) openSubject(activeSubjectId, false);
    });
  };

  function showEmptyLinkStage() {
    clearTimeout(iframeTimeoutHandle);
    stageLoader.classList.add("hidden");
    stageTimeoutBar.classList.add("hidden");
    stageRestrictedView.classList.add("hidden");
    stageIframeWrapper.classList.add("hidden");
    stageEmptyView.classList.remove("hidden");
    stageUrlText.textContent = "ไม่มีลิงก์";
    stageExternalBtn.classList.add("hidden");
  }

  // 7. Select Link + Smart Embedding & Timeout Guard
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
    stageUrlText.textContent = link.idbKey ? "embedded-html://summary" : resolvedUrl;
    stageExternalBtn.href = resolvedUrl;

    const isRestricted = !link.idbKey && (link.frameRestricted || isLikelyRestrictedUrl(resolvedUrl));

    if (isRestricted) {
      clearTimeout(iframeTimeoutHandle);
      stageLoader.classList.add("hidden");
      stageIframeWrapper.classList.add("hidden");
      stageRestrictedView.classList.remove("hidden");

      restrictedAppIcon.innerHTML = sub.icon || "📘";
      restrictedAppTitle.textContent = sub.code + " • " + sub.title;
      restrictedAppSubtitle.textContent = link.subtitle || "Web Dev Deploy";
      restrictedLinkName.textContent = link.title;
      restrictedOpenBtn.href = resolvedUrl;

      if (link.localPreviewFallback) {
        restrictedFallbackBtn.classList.remove("hidden");
        restrictedFallbackBtn.onclick = () => loadStageIframe(link.localPreviewFallback);
      } else {
        restrictedFallbackBtn.classList.add("hidden");
      }
    } else {
      loadStageIframe(resolvedUrl);
    }
  };

  function loadStageIframe(url) {
    clearTimeout(iframeTimeoutHandle);
    stageRestrictedView.classList.add("hidden");
    stageEmptyView.classList.add("hidden");
    stageTimeoutBar.classList.add("hidden");
    stageIframeWrapper.classList.remove("hidden");
    stageLoader.classList.remove("hidden");
    stageIframe.src = url;

    stageIframe.onload = () => {
      clearTimeout(iframeTimeoutHandle);
      stageLoader.classList.add("hidden");
    };

    // Timeout guard if external site stalls or silently fails to render in frame
    iframeTimeoutHandle = setTimeout(() => {
      stageLoader.classList.add("hidden");
      if (url.startsWith("http")) {
        stageTimeoutBar.classList.remove("hidden");
      }
    }, 6500);
  }

  // Dual Desktop Side-by-Side Window Launcher (External Web Left + StudyVault Slides Right)
  window.openDualDesktopWindows = function() {
    const sub = allSubjects.find(s => s.id === activeSubjectId);
    const link = sub?.links.find(l => l.id === activeLinkId);
    if (!link) return;

    const targetUrl = link.url;
    const availW = window.screen.availWidth || 1280;
    const availH = window.screen.availHeight || 800;
    const halfW = Math.floor(availW / 2);

    if (targetUrl) {
      window.open(
        targetUrl,
        "studyvault_external_web",
        `left=0,top=0,width=${halfW},height=${availH},resizable=yes,scrollbars=yes`
      );
    }
    // Switch current StudyVault window into Split or Slide Popout focus
    if (!isSplitMode) toggleSplitMode(true);
    showToast("เปิดเว็บไว้ด้านซ้ายแล้ว — จัดหน้าต่างนี้ไว้ครึ่งขวาเพื่อดูสไลด์คู่กันได้เลย");
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
    if (!stageIframeWrapper.classList.contains("hidden")) {
      loadStageIframe(stageIframe.src);
    }
  });

  window.setViewport = function(mode) {
    ["desktop", "tablet", "mobile"].forEach(m => {
      const btn = document.getElementById("vp-" + m);
      btn.className = m === mode
        ? "px-2 py-1 rounded-md bg-[var(--s3)] text-[var(--tx)] transition-colors"
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
    navigator.clipboard.writeText(stageUrlText.textContent).then(() => showToast("คัดลอกลิงก์เรียบร้อย"));
  };

  // =========================================================================
  // 8. SIDE-BY-SIDE SPLIT MODE + SIDE SWAP + DRAG RESIZER
  // =========================================================================
  window.toggleSplitMode = function(forceState = null) {
    isSplitMode = forceState !== null ? forceState : !isSplitMode;
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
    wsSlidesBadge.textContent = sub ? sub.slides.length : 0;

    if (isSplitMode) {
      wsSplitToggleBtn.className = "ohf-btn-primary h-8 px-3 rounded-xl text-xs flex items-center gap-1.5 transition-all";
      wsSwapSidesBtn.classList.remove("hidden");
      wsSwapSidesBtn.classList.add("flex");
      wsSidebar.classList.add("hidden");
      splitLinkSelect.classList.remove("hidden");
      splitResizer.classList.remove("hidden");
      wsSlidePane.classList.remove("hidden");
      wsSlidePane.classList.add("flex");

      // Order panes according to swap setting
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
    } else {
      wsSplitToggleBtn.className = "ohf-surface h-8 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all text-[var(--tx)]";
      wsSwapSidesBtn.classList.add("hidden");
      wsSwapSidesBtn.classList.remove("flex");
      wsSidebar.classList.remove("hidden");
      splitLinkSelect.classList.add("hidden");
      splitResizer.classList.add("hidden");
      wsSlidePane.classList.add("hidden");
      wsSlidePane.classList.remove("flex");

      wsWebPane.style.order = "1";
      wsWebPane.style.flex = "1 1 100%";
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
  // 9. LECTURE SLIDE READER + DRAG & DROP + ZOOM
  // =========================================================================
  function renderWorkspaceSlides(sub) {
    wsSlidesCount.textContent = String(sub.slides.length).padStart(2, "0");
    wsSlidesBadge.textContent = sub.slides.length;

    slideDeckSelect.innerHTML = sub.slides.length
      ? sub.slides.map(sl => `<option value="${sl.id}" ${sl.id === activeSlideId ? "selected" : ""}>${sl.title}</option>`).join("")
      : `<option value="">ยังไม่มีสไลด์</option>`;
    slideDeckSelect.onchange = e => { if (e.target.value) selectSlide(e.target.value, false); };

    if (sub.slides.length === 0) {
      wsSlidesList.innerHTML = `<div class="ohf-rail p-3 rounded-xl text-center"><p class="text-[11px] text-[var(--tx3)]">แนบ PDF, รูปภาพ หรือ Google Slides เพื่ออ่านเทียบข้างๆ</p></div>`;
      return;
    }

    wsSlidesList.innerHTML = sub.slides.map(sl => {
      const isSelected = sl.id === activeSlideId && isSplitMode;
      const iconClass = sl.type === "pdf" ? "ph-file-pdf" : sl.type === "images" ? "ph-images" : "ph-presentation-chart";
      return `
        <div onclick="selectSlide('${sl.id}', true)" class="group cursor-pointer p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${isSelected ? "bg-[var(--accent-08)] border-[var(--accent-32)]" : "bg-[var(--s1)] border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[var(--s2)]"}">
          <div class="flex items-center gap-2 min-w-0">
            <i class="ph ${iconClass} text-sm ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--tx3)]'} flex-shrink-0"></i>
            <span class="text-xs font-medium text-[var(--tx)] truncate">${sl.title}</span>
          </div>
          <button onclick="event.stopPropagation(); deleteSlide('${sl.id}')" class="text-[var(--tx4)] hover:text-[var(--danger)] p-1 opacity-60 group-hover:opacity-100 transition" title="ลบสไลด์">
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

  // PDF.js + GoodNotes Annotation Studio Engine
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

  // GoodNotes Pen / Highlighter / Eraser State
  let activePdfTool = "pan"; // "pan" | "pen" | "highlighter" | "eraser"
  let pdfPenColor = "#38bdf8";
  let pdfPenSize = 4;
  let pdfHighlightColor = "#facc15";
  let pdfHighlightSize = 18;
  let pdfAnnotations = {}; // pageNumStr -> Stroke[]
  let pdfUndoStacks = {};  // pageNumStr -> Stroke[][]
  let pdfRedoStacks = {};  // pageNumStr -> Stroke[][]

  const pdfColorPicker = document.getElementById("pdf-color-picker");
  const pdfSizeSlider = document.getElementById("pdf-size-slider");
  const pdfSizeLabel = document.getElementById("pdf-size-label");
  const pdfSizeDot = document.getElementById("pdf-size-dot");

  function getActiveToolColor() {
    return activePdfTool === "highlighter" ? pdfHighlightColor : pdfPenColor;
  }
  function getActiveToolSize() {
    return activePdfTool === "highlighter" ? pdfHighlightSize : pdfPenSize;
  }

  function syncAnnotationControls() {
    const color = getActiveToolColor();
    const size = getActiveToolSize();
    if (pdfColorPicker) pdfColorPicker.value = color;
    if (pdfSizeSlider) pdfSizeSlider.value = String(size);
    if (pdfSizeLabel) pdfSizeLabel.textContent = `${size}px`;
    if (pdfSizeDot) {
      const dotPx = Math.max(4, Math.min(18, Math.round(size * 0.6)));
      pdfSizeDot.style.width = `${dotPx}px`;
      pdfSizeDot.style.height = `${dotPx}px`;
      pdfSizeDot.style.backgroundColor = color;
      pdfSizeDot.style.opacity = activePdfTool === "highlighter" ? "0.6" : "1";
    }
  }

  window.setPdfTool = function(tool) {
    activePdfTool = tool;
    ["pan", "pen", "highlighter", "eraser"].forEach(t => {
      const btn = document.getElementById("pdf-tool-" + t);
      if (!btn) return;
      if (t === tool) {
        btn.className = "h-7 px-2 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] font-semibold flex items-center gap-1 transition";
      } else {
        btn.className = "h-7 px-2 rounded-md text-[var(--tx3)] hover:text-[var(--tx)] flex items-center gap-1 transition";
      }
    });

    const isDrawing = tool !== "pan";
    pdfPagesContainer.querySelectorAll(".pdf-ink-canvas").forEach(c => {
      c.style.pointerEvents = isDrawing ? "auto" : "none";
      c.style.touchAction = isDrawing ? "none" : "auto";
      c.style.cursor = tool === "eraser" ? "cell" : isDrawing ? "crosshair" : "default";
    });
    syncAnnotationControls();
  };

  window.setPdfColor = function(hex) {
    if (activePdfTool === "pan" || activePdfTool === "eraser") {
      setPdfTool("pen");
    }
    if (activePdfTool === "highlighter") pdfHighlightColor = hex;
    else pdfPenColor = hex;
    syncAnnotationControls();
  };

  if (pdfColorPicker) {
    pdfColorPicker.addEventListener("input", e => setPdfColor(e.target.value));
  }
  if (pdfSizeSlider) {
    pdfSizeSlider.addEventListener("input", e => {
      const val = Number(e.target.value);
      if (activePdfTool === "highlighter") pdfHighlightSize = val;
      else pdfPenSize = val;
      syncAnnotationControls();
    });
  }

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

    const lineW = Math.max(1, stroke.widthRatio * width);
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
    for (const stroke of list) {
      drawStrokeOnCtx(ctx, stroke, w, h);
    }
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

  function bindInkEvents(inkCanvas, pageNum) {
    const pageKey = String(pageNum);
    let drawingStroke = null;
    let isPointerDown = false;
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

    inkCanvas.addEventListener("pointerdown", e => {
      if (activePdfTool === "pan") return;
      e.preventDefault();
      inkCanvas.setPointerCapture(e.pointerId);
      isPointerDown = true;
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
      scheduleRedraw();
    });

    inkCanvas.addEventListener("pointermove", e => {
      if (!isPointerDown || activePdfTool === "pan") return;
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

    function finishStroke(e) {
      if (!isPointerDown) return;
      isPointerDown = false;
      drawingStroke = null;
      try { inkCanvas.releasePointerCapture(e.pointerId); } catch {}
      savePdfAnnotations();
    }

    inkCanvas.addEventListener("pointerup", finishStroke);
    inkCanvas.addEventListener("pointercancel", finishStroke);
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
        const scale = 2; // HiDPI 2x overlay canvas

        const offCanvas = document.createElement("canvas");
        offCanvas.width = Math.max(1, Math.floor(width * scale));
        offCanvas.height = Math.max(1, Math.floor(height * scale));
        const ctx = offCanvas.getContext("2d");

        for (const stroke of strokes) {
          drawStrokeOnCtx(ctx, stroke, offCanvas.width, offCanvas.height);
        }

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
    if (!activePdfDoc || slidePdfViewer.classList.contains("hidden")) return;
    const w = pdfPagesContainer.clientWidth;
    if (w > 50 && Math.abs(w - lastPdfContainerW) > 12) {
      clearTimeout(pdfResizeTimer);
      pdfResizeTimer = setTimeout(() => buildPdfPageSlots(true), 100);
    }
  });
  pdfResizeObserver.observe(pdfPagesContainer);

  function updatePdfPageCounterFromScroll() {
    if (!activePdfDoc) return;
    const slots = pdfPagesContainer.querySelectorAll(".pdf-page-slot");
    const threshold = pdfPagesContainer.scrollTop + 48;
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

  async function renderPdfSlide(idbKey, fallbackUrl, slideId, slideTitle) {
    slideIframe.classList.add("hidden");
    slideImageViewer.classList.add("hidden");

    const blob = await StudyVaultDB.getBlob(idbKey);
    if (!blob) {
      renderSlideEmpty();
      return;
    }

    activePdfBlob = blob;
    activePdfSlideId = slideId;
    activePdfTitle = slideTitle || "slides";
    pdfUndoStacks = {};
    pdfRedoStacks = {};

    // Load saved GoodNotes annotations for this slide
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
    pdfPagesContainer.innerHTML = `<div class="py-10 text-xs text-[var(--tx3)]">กำลังเตรียมหน้า PDF...</div>`;

    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const buf = await blob.arrayBuffer();
      activePdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
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

  async function buildPdfPageSlots(preservePage = false) {
    if (!activePdfDoc) return;
    const rawW = pdfPagesContainer.clientWidth;
    if (rawW < 50) return;

    lastPdfContainerW = rawW;
    const targetRestorePage = preservePage ? pdfCurrPage : 1;

    if (pdfObserver) pdfObserver.disconnect();
    pdfPagesContainer.innerHTML = "";

    const numPages = activePdfDoc.numPages;
    pdfTotalPagesEl.textContent = String(numPages).padStart(2, "0");
    pdfCurrPageEl.textContent = String(targetRestorePage).padStart(2, "0");
    pdfZoomLabel.textContent = `${Math.round(pdfZoom * 100)}%`;

    const containerW = Math.max(260, rawW - 32);
    const firstPage = await activePdfDoc.getPage(1);
    const firstVp = firstPage.getViewport({ scale: 1 });

    for (let i = 1; i <= numPages; i++) {
      const page = i <= 15 ? await activePdfDoc.getPage(i) : null;
      const baseVp = page ? page.getViewport({ scale: 1 }) : firstVp;
      const fitScale = (containerW / baseVp.width) * pdfZoom;
      const vp = page ? page.getViewport({ scale: fitScale }) : { width: baseVp.width * fitScale, height: baseVp.height * fitScale };

      const wrap = document.createElement("div");
      wrap.className = "pdf-page-slot relative rounded-lg overflow-hidden bg-white shadow-lg border border-[var(--line)] flex-shrink-0";
      wrap.style.width = `${Math.floor(vp.width)}px`;
      wrap.style.height = `${Math.floor(vp.height)}px`;
      wrap.dataset.pageNum = String(i);
      wrap.dataset.rendered = "false";

      const badge = document.createElement("span");
      badge.className = "absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] tnum pointer-events-none z-20";
      badge.textContent = `${i}/${numPages}`;
      wrap.appendChild(badge);

      pdfPagesContainer.appendChild(wrap);
    }

    pdfObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const slot = entry.target;
          if (slot.dataset.rendered === "false") {
            renderSinglePdfCanvas(slot, Number(slot.dataset.pageNum), containerW);
          }
        }
      }
    }, { root: pdfPagesContainer, rootMargin: "200px 0px", threshold: 0.05 });

    pdfPagesContainer.querySelectorAll(".pdf-page-slot").forEach(el => pdfObserver.observe(el));

    if (preservePage && targetRestorePage > 1) {
      const targetEl = pdfPagesContainer.querySelector(`.pdf-page-slot[data-page-num="${targetRestorePage}"]`);
      if (targetEl) pdfPagesContainer.scrollTop = Math.max(0, targetEl.offsetTop - 12);
    } else {
      pdfPagesContainer.scrollTop = 0;
    }
  }

  async function renderSinglePdfCanvas(slot, pageNum, containerW) {
    if (!activePdfDoc || slot.dataset.rendered === "true") return;
    slot.dataset.rendered = "true";
    const page = await activePdfDoc.getPage(pageNum);
    const baseVp = page.getViewport({ scale: 1 });
    const exactScale = (containerW / baseVp.width) * pdfZoom;
    const cssVp = page.getViewport({ scale: exactScale });
    slot.style.width = `${Math.floor(cssVp.width)}px`;
    slot.style.height = `${Math.floor(cssVp.height)}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale: exactScale * dpr });

    const bgCanvas = document.createElement("canvas");
    bgCanvas.width = Math.floor(vp.width);
    bgCanvas.height = Math.floor(vp.height);
    bgCanvas.style.width = "100%";
    bgCanvas.style.height = "100%";
    bgCanvas.style.display = "block";
    bgCanvas.style.pointerEvents = "none";

    // Transparent GoodNotes Ink Layer
    const inkCanvas = document.createElement("canvas");
    inkCanvas.className = "pdf-ink-canvas absolute inset-0 w-full h-full z-10";
    inkCanvas.width = Math.floor(vp.width);
    inkCanvas.height = Math.floor(vp.height);
    const isDrawing = activePdfTool !== "pan";
    inkCanvas.style.pointerEvents = isDrawing ? "auto" : "none";
    inkCanvas.style.touchAction = isDrawing ? "none" : "auto";
    inkCanvas.style.cursor = activePdfTool === "eraser" ? "cell" : isDrawing ? "crosshair" : "default";

    slot.insertBefore(inkCanvas, slot.firstChild);
    slot.insertBefore(bgCanvas, inkCanvas);

    const ctx = bgCanvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    redrawInkCanvas(inkCanvas, String(pageNum));
    bindInkEvents(inkCanvas, pageNum);
  }

  window.zoomPdfSlide = async delta => {
    pdfZoom = Math.max(0.6, Math.min(2.2, pdfZoom + delta));
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
    if (openSplit && !isSplitMode) toggleSplitMode(true);

    renderWorkspaceSlides(sub);
    slideEmptyView.classList.add("hidden");
    slideDeleteBtn.classList.remove("hidden");

    if (sl.type === "images" && sl.idbKey) {
      slideIframe.classList.add("hidden");
      slidePdfViewer.classList.add("hidden");
      slideImageViewer.classList.remove("hidden");
      const urls = await resolveImageDeckUrls(sl.idbKey);
      if (urls.length > 0) {
        currentImageSlideUrls = urls;
        currentImageSlideIdx = 0;
        imageZoom = 1;
        updateImageSlideView();
      } else {
        renderSlideEmpty();
      }
    } else if (sl.type === "pdf" && sl.idbKey) {
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

  // Drag & Drop PDF or Image Slides straight onto the Slide Pane
  ["dragenter", "dragover"].forEach(ev => {
    slideDropZone.addEventListener(ev, e => {
      e.preventDefault();
      slideDropZone.classList.add("drop-active");
    });
  });
  ["dragleave", "drop"].forEach(ev => {
    slideDropZone.addEventListener(ev, e => {
      e.preventDefault();
      slideDropZone.classList.remove("drop-active");
    });
  });
  slideDropZone.addEventListener("drop", async e => {
    if (!activeSubjectId) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    const pdf = files.find(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    const imgs = files.filter(f => f.type.startsWith("image/"));

    if (pdf) {
      const key = "pdf-" + Date.now();
      await StudyVaultDB.setBlob(key, pdf);
      const sl = { id: "sl-" + Date.now(), title: pdf.name.replace(/\.pdf$/i, ""), type: "pdf", idbKey: key, updatedAt: new Date().toISOString().split("T")[0] };
      if (!customSlidesMap[activeSubjectId]) customSlidesMap[activeSubjectId] = [];
      customSlidesMap[activeSubjectId].unshift(sl);
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      openSubject(activeSubjectId, false);
      selectSlide(sl.id, true);
      showToast(`เพิ่มสไลด์ PDF "${sl.title}" สำเร็จ`);
    } else if (imgs.length > 0) {
      const key = "imgs-" + Date.now();
      await StudyVaultDB.setBlob(key, imgs);
      const sl = { id: "sl-" + Date.now(), title: `สไลด์รูปภาพ (${imgs.length} หน้า)`, type: "images", idbKey: key, updatedAt: new Date().toISOString().split("T")[0] };
      if (!customSlidesMap[activeSubjectId]) customSlidesMap[activeSubjectId] = [];
      customSlidesMap[activeSubjectId].unshift(sl);
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      openSubject(activeSubjectId, false);
      selectSlide(sl.id, true);
      showToast(`เพิ่มสไลด์รูปภาพ ${imgs.length} หน้าสำเร็จ`);
    }
  });

  window.deleteActiveSlide = () => { if (activeSlideId) deleteSlide(activeSlideId); };

  window.deleteSlide = function(slideId) {
    const sub = allSubjects.find(s => s.id === activeSubjectId);
    if (!sub) return;
    const sl = sub.slides.find(x => x.id === slideId);
    if (!sl) return;

    const customList = customSlidesMap[activeSubjectId] || [];
    const wasCustom = customList.some(x => x.id === slideId);
    let removedCustom = null;
    if (wasCustom) {
      removedCustom = customList.find(x => x.id === slideId);
      customSlidesMap[activeSubjectId] = customList.filter(x => x.id !== slideId);
    } else {
      deletedSlideIds.add(slideId);
    }

    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    openSubject(activeSubjectId, false);

    showToast(`ลบสไลด์ "${sl.title}" แล้ว`, () => {
      if (wasCustom && removedCustom) {
        if (!customSlidesMap[activeSubjectId]) customSlidesMap[activeSubjectId] = [];
        customSlidesMap[activeSubjectId].unshift(removedCustom);
      } else {
        deletedSlideIds.delete(slideId);
      }
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      if (activeSubjectId) openSubject(activeSubjectId, false);
    });
  };

  // =========================================================================
  // 10. MODALS: ADD SUBJECT, ADD/EDIT LINK (WITH HTML UPGRADE), ADD SLIDE
  // =========================================================================
  window.setSubSourceMode = function(mode) {
    subSourceMode = mode;
    document.getElementById("sub-mode-url").className = mode === "url" ? "px-2 py-0.5 rounded bg-[var(--s3)] text-[var(--tx)] text-[11px]" : "px-2 py-0.5 rounded text-[var(--tx3)] text-[11px]";
    document.getElementById("sub-mode-html").className = mode === "html" ? "px-2 py-0.5 rounded bg-[var(--s3)] text-[var(--tx)] text-[11px]" : "px-2 py-0.5 rounded text-[var(--tx3)] text-[11px]";
    document.getElementById("sub-url-group").classList.toggle("hidden", mode !== "url");
    document.getElementById("sub-html-group").classList.toggle("hidden", mode !== "html");
  };

  window.setLnkSourceMode = function(mode) {
    lnkSourceMode = mode;
    document.getElementById("lnk-mode-url").className = mode === "url" ? "px-2 py-0.5 rounded bg-[var(--s3)] text-[var(--tx)] text-[11px]" : "px-2 py-0.5 rounded text-[var(--tx3)] text-[11px]";
    document.getElementById("lnk-mode-html").className = mode === "html" ? "px-2 py-0.5 rounded bg-[var(--s3)] text-[var(--tx)] text-[11px]" : "px-2 py-0.5 rounded text-[var(--tx3)] text-[11px]";
    document.getElementById("lnk-url-group").classList.toggle("hidden", mode !== "url");
    document.getElementById("lnk-html-group").classList.toggle("hidden", mode !== "html");
  };

  document.getElementById("sub-html-file").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (file) document.getElementById("sub-html-code").value = await file.text();
  });
  document.getElementById("lnk-html-file").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (file) document.getElementById("lnk-html-code").value = await file.text();
  });

  document.getElementById("open-add-subject-btn").addEventListener("click", () => {
    addSubjectModal.classList.remove("hidden");
    document.getElementById("sub-code-box").classList.add("hidden");
  });
  window.closeAddSubjectModal = () => addSubjectModal.classList.add("hidden");

  document.getElementById("add-subject-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = document.getElementById("sub-code").value.trim();
    const title = document.getElementById("sub-title").value.trim();
    const category = document.getElementById("sub-category").value.trim();
    const icon = document.getElementById("sub-icon").value.trim() || "📘";
    const linkTitle = document.getElementById("sub-link-title").value.trim();
    const desc = document.getElementById("sub-desc").value.trim();
    const today = new Date().toISOString().split("T")[0];
    const id = "sub-" + Date.now();
    const linkId = "lnk-" + Date.now();

    let url = "", idbKey = null, previewUrl = "", previewIdbKey = null;

    if (subSourceMode === "html") {
      const htmlCode = document.getElementById("sub-html-code").value.trim();
      if (!htmlCode) { showToast("กรุณาเลือกไฟล์ HTML หรือวางโค้ดเว็บก่อนบันทึก"); return; }
      idbKey = "html-" + Date.now();
      await StudyVaultDB.setBlob(idbKey, new Blob([htmlCode], { type: "text/html" }));
      previewIdbKey = idbKey;
    } else {
      url = document.getElementById("sub-link-url").value.trim();
      if (!url) { showToast("กรุณากรอกลิงก์ URL เว็บสรุป"); return; }
      previewUrl = isLikelyRestrictedUrl(url) ? "" : url;
    }

    const newSub = {
      id, code, title, category,
      description: desc || `คลังสรุปและบทเรียนวิชา ${title}`,
      tags: [category, code],
      icon, previewUrl, previewIdbKey, lastUpdated: today,
      links: [{
        id: linkId, title: linkTitle, subtitle: "ลิงก์สรุปบทเรียน",
        type: idbKey ? "Embedded HTML" : "Web Dev",
        url, idbKey,
        badge: idbKey ? "HTML ในตัว" : "ใหม่",
        frameRestricted: !idbKey && isLikelyRestrictedUrl(url),
        updatedAt: today
      }],
      slides: []
    };

    customSubjects.unshift(newSub);
    saveState();
    allSubjects = getMergedSubjects();
    updateStats();
    renderCategories();
    navigateHome();
    closeAddSubjectModal();
    e.target.reset();
    showToast(`เพิ่มวิชา "${title}" พร้อมหน้าพรีวิวแล้ว`);
  });

  document.getElementById("sub-copy-btn").addEventListener("click", () => {
    const obj = {
      id: "sub-" + Date.now(),
      code: document.getElementById("sub-code").value.trim(),
      title: document.getElementById("sub-title").value.trim(),
      category: document.getElementById("sub-category").value.trim(),
      description: document.getElementById("sub-desc").value.trim(),
      icon: document.getElementById("sub-icon").value.trim() || "📘",
      previewUrl: document.getElementById("sub-link-url").value.trim(),
      lastUpdated: new Date().toISOString().split("T")[0],
      links: [{ id: "lnk-" + Date.now(), title: document.getElementById("sub-link-title").value.trim(), url: document.getElementById("sub-link-url").value.trim(), type: "Web Dev", badge: "ใหม่" }],
      slides: []
    };
    const formatted = JSON.stringify(obj, null, 2);
    document.getElementById("sub-code-box").classList.remove("hidden");
    document.getElementById("sub-code-pre").textContent = formatted;
    navigator.clipboard.writeText(formatted + ",").then(() => showToast("คัดลอกโค้ดสำหรับ data.js แล้ว"));
  });

  // Subject Selector + Lock Management (Shared across Add Link & Add Slide modals)
  const lnkSubjectSelect = document.getElementById("lnk-subject-select");
  const slSubjectSelect = document.getElementById("sl-subject-select");
  const lnkLockBtn = document.getElementById("lnk-lock-btn");
  const slLockBtn = document.getElementById("sl-lock-btn");

  function syncSubjectSelects(preferredId = null) {
    const targetId = (lockedSubjectId && allSubjects.some(s => s.id === lockedSubjectId))
      ? lockedSubjectId
      : (preferredId || activeSubjectId || allSubjects[0]?.id || "");
    const isLocked = Boolean(lockedSubjectId && allSubjects.some(s => s.id === lockedSubjectId));

    const optionsHtml = allSubjects.map(s => `<option value="${s.id}" ${s.id === targetId ? "selected" : ""}>${s.code} — ${s.title}</option>`).join("");
    [lnkSubjectSelect, slSubjectSelect].forEach(sel => {
      if (!sel) return;
      sel.innerHTML = optionsHtml;
      sel.value = targetId;
      sel.disabled = isLocked;
      sel.classList.toggle("opacity-75", isLocked);
    });

    [lnkLockBtn, slLockBtn].forEach(btn => {
      if (!btn) return;
      if (isLocked) {
        btn.className = "px-2 py-0.5 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] font-semibold text-[11px] flex items-center gap-1 transition";
        btn.innerHTML = `<i class="ph ph-lock"></i><span>ล็อควิชาไว้แล้ว</span>`;
      } else {
        btn.className = "px-2 py-0.5 rounded-md border border-[var(--line-2)] bg-[var(--s2)] text-[var(--tx2)] text-[11px] flex items-center gap-1 transition";
        btn.innerHTML = `<i class="ph ph-lock-open"></i><span>ล็อควิชานี้ไว้</span>`;
      }
    });
  }

  window.toggleSubjectLock = function() {
    if (lockedSubjectId) {
      lockedSubjectId = "";
      localStorage.removeItem(LS_LOCKED_SUBJECT);
      showToast("ปลดล็อครายวิชาแล้ว สามารถเลือกเปลี่ยนวิชาได้");
    } else {
      const currentVal = (!addLinkModal.classList.contains("hidden") ? lnkSubjectSelect?.value : slSubjectSelect?.value) || activeSubjectId || allSubjects[0]?.id || "";
      lockedSubjectId = currentVal;
      localStorage.setItem(LS_LOCKED_SUBJECT, lockedSubjectId);
      const sub = allSubjects.find(s => s.id === lockedSubjectId);
      showToast(`ล็อควิชา "${sub?.title || lockedSubjectId}" ไว้แล้ว`);
    }
    syncSubjectSelects();
  };

  window.openQuickSlideUpload = () => {
    if (allSubjects.length === 0) {
      showToast("กรุณาสร้างรายวิชาก่อนเพิ่มสื่อ");
      document.getElementById("open-add-subject-btn").click();
      return;
    }
    openAddSlideModal();
  };

  // Add / Edit Link Modal
  window.openAddLinkModal = () => {
    document.getElementById("lnk-edit-id").value = "";
    document.getElementById("lnk-modal-heading").textContent = "เพิ่มลิงก์บทเรียนเข้าวิชา";
    document.getElementById("add-link-form").reset();
    setLnkSourceMode("url");
    document.getElementById("lnk-code-box").classList.add("hidden");
    syncSubjectSelects(activeSubjectId);
    addLinkModal.classList.remove("hidden");
  };

  window.openEditLinkModal = (linkId, preferHtml = false) => {
    const sub = allSubjects.find(s => s.id === activeSubjectId);
    const link = sub?.links.find(l => l.id === linkId);
    if (!link) return;

    document.getElementById("lnk-edit-id").value = link.id;
    document.getElementById("lnk-modal-heading").textContent = preferHtml ? "วางโค้ด HTML เพื่อฝังเว็บเต็มๆ ข้างสไลด์" : "แก้ไขลิงก์บทเรียน";
    syncSubjectSelects(activeSubjectId);
    if (lnkSubjectSelect) lnkSubjectSelect.disabled = true;
    document.getElementById("lnk-title").value = link.title || "";
    document.getElementById("lnk-subtitle").value = link.subtitle || "";
    document.getElementById("lnk-url").value = link.url || "";
    document.getElementById("lnk-type").value = link.type || "Web Summary";
    document.getElementById("lnk-badge").value = link.badge || "ใหม่";
    document.getElementById("lnk-html-code").value = "";
    setLnkSourceMode(preferHtml || link.idbKey ? "html" : "url");
    document.getElementById("lnk-code-box").classList.add("hidden");
    addLinkModal.classList.remove("hidden");
  };

  window.editActiveLink = (preferHtml = false) => {
    if (activeLinkId) openEditLinkModal(activeLinkId, preferHtml);
  };

  document.getElementById("open-add-link-btn").addEventListener("click", openAddLinkModal);
  window.closeAddLinkModal = () => addLinkModal.classList.add("hidden");

  document.getElementById("add-link-form").addEventListener("submit", async e => {
    e.preventDefault();
    const editId = document.getElementById("lnk-edit-id").value;
    const targetSubId = editId ? activeSubjectId : (lnkSubjectSelect?.value || activeSubjectId || allSubjects[0]?.id);
    if (!targetSubId) return;

    const title = document.getElementById("lnk-title").value.trim();
    const subtitle = document.getElementById("lnk-subtitle").value.trim();
    const type = document.getElementById("lnk-type").value.trim() || "Web Summary";
    const badge = document.getElementById("lnk-badge").value.trim() || "ใหม่";
    const today = new Date().toISOString().split("T")[0];

    let url = document.getElementById("lnk-url").value.trim();
    let idbKey = null;

    if (lnkSourceMode === "html") {
      const htmlCode = document.getElementById("lnk-html-code").value.trim();
      if (!htmlCode) { showToast("กรุณาเลือกไฟล์ HTML หรือวางโค้ดก่อน"); return; }
      idbKey = "html-" + Date.now();
      await StudyVaultDB.setBlob(idbKey, new Blob([htmlCode], { type: "text/html" }));
    } else if (!url) {
      showToast("กรุณากรอกลิงก์ URL");
      return;
    }

    if (editId) {
      const patch = {
        title, subtitle,
        type: idbKey ? "Embedded HTML" : type,
        url, idbKey,
        badge: idbKey ? "HTML ในตัว" : badge,
        frameRestricted: !idbKey && isLikelyRestrictedUrl(url),
        updatedAt: today
      };

      const customList = customLinksMap[targetSubId] || [];
      const customIdx = customList.findIndex(l => l.id === editId);
      if (customIdx !== -1) {
        customList[customIdx] = { ...customList[customIdx], ...patch };
      } else {
        linkOverrides[editId] = patch;
      }
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      closeAddLinkModal();
      openSubject(targetSubId, false);
      selectLink(editId);
      showToast(idbKey ? "ฝังโค้ด HTML สำเร็จ! แสดงผลในกรอบเต็มๆ แล้ว" : "บันทึกการแก้ไขเรียบร้อย");
    } else {
      const newLink = {
        id: "lnk-" + Date.now(),
        title, subtitle,
        type: idbKey ? "Embedded HTML" : type,
        url, idbKey,
        badge: idbKey ? "HTML ในตัว" : badge,
        frameRestricted: !idbKey && isLikelyRestrictedUrl(url),
        updatedAt: today
      };
      if (!customLinksMap[targetSubId]) customLinksMap[targetSubId] = [];
      customLinksMap[targetSubId].unshift(newLink);
      saveState();
      allSubjects = getMergedSubjects();
      updateStats();
      closeAddLinkModal();
      openSubject(targetSubId, true);
      selectLink(newLink.id);
      showToast(`เพิ่มลิงก์ "${title}" เข้าวิชาเรียบร้อย`);
    }
  });

  document.getElementById("lnk-copy-btn").addEventListener("click", () => {
    const obj = {
      id: "lnk-" + Date.now(),
      title: document.getElementById("lnk-title").value.trim(),
      subtitle: document.getElementById("lnk-subtitle").value.trim(),
      type: document.getElementById("lnk-type").value.trim(),
      url: document.getElementById("lnk-url").value.trim(),
      badge: document.getElementById("lnk-badge").value.trim(),
      updatedAt: new Date().toISOString().split("T")[0]
    };
    const formatted = JSON.stringify(obj, null, 2);
    document.getElementById("lnk-code-box").classList.remove("hidden");
    document.getElementById("lnk-code-pre").textContent = formatted;
    navigator.clipboard.writeText(formatted + ",").then(() => showToast("คัดลอกโค้ดลิงก์แล้ว"));
  });

  // Add Slide Modal (With Subject Lock!)
  window.openAddSlideModal = () => {
    syncSubjectSelects(activeSubjectId);
    addSlideModal.classList.remove("hidden");
  };
  document.getElementById("open-add-slide-btn").addEventListener("click", openAddSlideModal);
  window.closeAddSlideModal = () => addSlideModal.classList.add("hidden");

  window.setSlideTypeTab = function(mode) {
    slideTypeMode = mode;
    ["pdf", "images", "url"].forEach(m => {
      document.getElementById("sl-tab-" + m).className = m === mode
        ? "py-1.5 rounded-lg bg-[var(--s3)] text-[var(--tx)] font-medium transition"
        : "py-1.5 rounded-lg text-[var(--tx3)] font-medium transition";
      document.getElementById("sl-panel-" + m).classList.toggle("hidden", m !== mode);
    });
  };

  document.getElementById("sl-pdf-file").addEventListener("change", e => {
    const f = e.target.files[0];
    if (f && !document.getElementById("sl-title").value) {
      document.getElementById("sl-title").value = f.name.replace(/\.pdf$/i, "");
    }
  });

  document.getElementById("add-slide-form").addEventListener("submit", async e => {
    e.preventDefault();
    const targetSubId = slSubjectSelect?.value || activeSubjectId || allSubjects[0]?.id;
    if (!targetSubId) return;

    const title = document.getElementById("sl-title").value.trim();
    const id = "sl-" + Date.now();
    let newSlide = { id, title, type: slideTypeMode, updatedAt: new Date().toISOString().split("T")[0] };

    if (slideTypeMode === "pdf") {
      const file = document.getElementById("sl-pdf-file").files[0];
      if (!file) { showToast("กรุณาเลือกไฟล์ PDF ก่อนบันทึก"); return; }
      const key = "pdf-" + Date.now();
      await StudyVaultDB.setBlob(key, file);
      newSlide.idbKey = key;
    } else if (slideTypeMode === "images") {
      const files = Array.from(document.getElementById("sl-img-files").files);
      if (files.length === 0) { showToast("กรุณาเลือกรูปภาพอย่างน้อย 1 รูป"); return; }
      const key = "imgs-" + Date.now();
      await StudyVaultDB.setBlob(key, files);
      newSlide.idbKey = key;
    } else {
      const url = document.getElementById("sl-url-input").value.trim();
      if (!url) { showToast("กรุณากรอกลิงก์สไลด์"); return; }
      newSlide.url = url;
    }

    if (!customSlidesMap[targetSubId]) customSlidesMap[targetSubId] = [];
    customSlidesMap[targetSubId].unshift(newSlide);
    saveState();

    allSubjects = getMergedSubjects();
    updateStats();
    closeAddSlideModal();
    e.target.reset();
    openSubject(targetSubId, true);
    selectSlide(newSlide.id, true);
    showToast(`เพิ่มสไลด์ "${title}" และเปิดเทียบข้างๆ แล้ว`);
  });

  // =========================================================================
  // 11. BACKUP EXPORT / IMPORT / RESET & SHORTCUTS
  // =========================================================================
  window.exportBackupJSON = function() {
    const payload = {
      exportedAt: new Date().toISOString(),
      customSubjects,
      deletedSubjectIds: [...deletedSubjectIds],
      customLinksMap,
      deletedLinkIds: [...deletedLinkIds],
      linkOverrides,
      customSlidesMap,
      deletedSlideIds: [...deletedSlideIds],
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
      customLinksMap = data.customLinksMap || {};
      deletedLinkIds = new Set(data.deletedLinkIds || []);
      linkOverrides = data.linkOverrides || {};
      customSlidesMap = data.customSlidesMap || {};
      deletedSlideIds = new Set(data.deletedSlideIds || []);
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
      closeAddLinkModal();
      closeAddSlideModal();
    }
  });

  window.resetToDefaultData = async function() {
    if (confirm("ต้องการล้างวิชา ลิงก์ และสไลด์ที่เพิ่มเอง แล้วรีเซ็ตเป็นค่าเริ่มต้นหรือไม่?")) {
      [LS_CUSTOM_SUBJECTS, LS_DELETED_SUBJECTS, LS_CUSTOM_LINKS, LS_DELETED_LINKS, LS_LINK_OVERRIDES, LS_CUSTOM_SLIDES, LS_DELETED_SLIDES, LS_FAVORITES].forEach(k => localStorage.removeItem(k));
      await StudyVaultDB.clearAll().catch(() => {});
      blobUrlCache.clear();
      customSubjects = []; deletedSubjectIds.clear();
      customLinksMap = {}; deletedLinkIds.clear(); linkOverrides = {};
      customSlidesMap = {}; deletedSlideIds.clear(); favorites.clear();
      allSubjects = getMergedSubjects();
      updateStats(); renderCategories(); navigateHome();
      showToast("รีเซ็ตข้อมูลทั้งหมดเรียบร้อย");
    }
  };

  window.addEventListener("hashchange", () => {
    const hash = window.location.hash;
    if (hash.startsWith("#subject/")) {
      const id = hash.replace("#subject/", "");
      if (allSubjects.some(s => s.id === id)) openSubject(id, false);
    } else {
      navigateHome(false);
    }
  });
  window.addEventListener("resize", () => requestAnimationFrame(updateScopeThumb));

  // Initialize
  initTheme();
  updateStats();
  renderCategories();

  // Check Popout Slide Mode (?slidePopout=1&subject=...&slide=...)
  const params = new URLSearchParams(window.location.search);
  if (params.get("slidePopout") === "1") {
    const subId = params.get("subject");
    const slId = params.get("slide");
    if (subId && allSubjects.some(s => s.id === subId)) {
      mainTopbar.classList.add("hidden");
      mainFooter.classList.add("hidden");
      openSubject(subId, false);
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
  if (initialHash.startsWith("#subject/")) {
    const id = initialHash.replace("#subject/", "");
    if (allSubjects.some(s => s.id === id)) {
      openSubject(id, false);
      return;
    }
  }
  renderSubjectsGrid();
});
