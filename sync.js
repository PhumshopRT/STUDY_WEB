/**
 * StudyVault Shared Library Loader & Owner GitHub Sync Engine
 * - Visitors automatically load shared-library.json + shared-assets/* cleanly (unannotated slides)
 * - Owner stores a scoped GitHub Token strictly in localStorage (never committed to repo)
 * - Mutations commit atomically via GitHub Git Data API (Blobs + Tree + Commit + Ref)
 */

const StudyVaultSync = (() => {
  const LS_ADMIN_CFG = "studyvault_github_admin_cfg_v1";
  const DEFAULT_OWNER = "PhumshopRT";
  const DEFAULT_REPO = "STUDY_WEB";
  const DEFAULT_BRANCH = "main";
  const MAX_GITHUB_FILE_BYTES = 35 * 1024 * 1024; // ~35MB safe limit for GitHub REST git blobs (<100MB payload ceiling)

  let publishInFlight = null;
  let dirtyAfterCurrent = false;

  function getConfig() {
    try {
      const raw = localStorage.getItem(LS_ADMIN_CFG);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        owner: parsed.owner || DEFAULT_OWNER,
        repo: parsed.repo || DEFAULT_REPO,
        branch: parsed.branch || DEFAULT_BRANCH,
        token: parsed.token || "",
        autoSync: parsed.autoSync !== false,
        lastSyncAt: parsed.lastSyncAt || "",
        verifiedAt: parsed.verifiedAt || "",
        lastSyncError: parsed.lastSyncError || ""
      };
    } catch {
      return {
        owner: DEFAULT_OWNER,
        repo: DEFAULT_REPO,
        branch: DEFAULT_BRANCH,
        token: "",
        autoSync: true,
        lastSyncAt: "",
        verifiedAt: "",
        lastSyncError: ""
      };
    }
  }

  function saveConfig(patch) {
    const next = { ...getConfig(), ...patch };
    localStorage.setItem(LS_ADMIN_CFG, JSON.stringify(next));
    return next;
  }

  function clearConfigToken() {
    const cfg = getConfig();
    cfg.token = "";
    localStorage.setItem(LS_ADMIN_CFG, JSON.stringify(cfg));
    return cfg;
  }

  function isAdminEnabled() {
    return Boolean(getConfig().token.trim());
  }

  function ghHeaders(token, extra = {}) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...extra
    };
  }

  function translateGitHubError(status, fallbackMsg) {
    const raw = String(fallbackMsg || "");
    if (status === 401 || /bad credentials/i.test(raw)) {
      return "GitHub Token ไม่ถูกต้องหรือหมดอายุ (401) — กรุณาวาง Token ใหม่แล้วกดบันทึก";
    }
    if (status === 403 || /resource not accessible|insufficient|forbidden/i.test(raw)) {
      return "Token ไม่มีสิทธิ์เขียนไฟล์ (403) — ตอนสร้าง Token ต้องตั้ง Repository access = STUDY_WEB และ Permissions → Contents = Read and write";
    }
    return raw || `GitHub HTTP ${status}`;
  }

  async function verifyRepoAccess(cfg) {
    const token = (cfg.token || "").trim();
    if (!token) throw new Error("กรุณากรอก GitHub Token");
    const owner = (cfg.owner || DEFAULT_OWNER).trim();
    const repo = (cfg.repo || DEFAULT_REPO).trim();
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: ghHeaders(token),
      cache: "no-store"
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(translateGitHubError(res.status, body.message));
    }
    const oauthScopes = res.headers?.get ? res.headers.get("X-OAuth-Scopes") : null;
    if (oauthScopes !== null) {
      const scopes = oauthScopes.split(",").map(s => s.trim()).filter(Boolean);
      if (!scopes.includes("repo") && !scopes.includes("public_repo")) {
        throw new Error("Classic Token นี้ยังไม่ได้ติ๊กสิทธิ์ repo (ไม่สามารถบันทึกไฟล์ขึ้นเว็บได้)");
      }
    }
    const repoInfo = await res.json();
    if (repoInfo.permissions && repoInfo.permissions.push === false) {
      throw new Error("Token นี้ไม่มีสิทธิ์เขียน (Contents: Read and write) ใน Repo นี้");
    }
    return repoInfo;
  }

  async function loadSharedSubjects() {
    const cfg = getConfig();
    const recentlySynced = cfg.lastSyncAt && (Date.now() - Date.parse(cfg.lastSyncAt) < 600000);
    // Only query GitHub API when user verified a real token (either synced recently or unlocked via verifyRepoAccess)
    if (cfg.token && (recentlySynced || cfg.verifiedAt) && typeof fetch === "function") {
      try {
        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/shared-library.json?ref=${encodeURIComponent(cfg.branch)}&t=${Date.now()}`;
        const res = await fetch(apiUrl, {
          headers: ghHeaders(cfg.token, { Accept: "application/vnd.github.raw" }),
          cache: "no-store"
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.subjects)) return json.subjects;
        }
      } catch {
        // Fallback to static Pages JSON below
      }
    }

    try {
      const res = await fetch(`shared-library.json?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.subjects)) return json.subjects;
      }
    } catch {
      // Offline or file:// origin fallback
    }

    return typeof SUBJECTS_DATA !== "undefined" ? SUBJECTS_DATA : [];
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma !== -1 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("อ่านไฟล์ไม่สำเร็จ"));
      reader.readAsDataURL(blob);
    });
  }

  function sanitizeExtFromBlob(blob, fallbackExt) {
    const type = (blob?.type || "").toLowerCase();
    const name = (blob?.name || "").toLowerCase();
    if (name.includes(".")) {
      const ext = name.split(".").pop().replace(/[^a-z0-9]/g, "");
      if (ext) return ext;
    }
    if (type.includes("png")) return "png";
    if (type.includes("webp")) return "webp";
    if (type.includes("gif")) return "gif";
    if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
    if (type.includes("pdf")) return "pdf";
    if (type.includes("html")) return "html";
    return fallbackExt;
  }

  async function createGitBlob(owner, repo, token, content, encoding = "base64") {
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`, {
      method: "POST",
      headers: ghHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ content, encoding })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(translateGitHubError(res.status, err.message || `สร้าง Git Blob ไม่สำเร็จ (${res.status})`));
    }
    const data = await res.json();
    return data.sha;
  }

  async function runAtomicPublish(getSubjectsSnapshot, onStatus = () => {}) {
    const cfg = getConfig();
    if (!cfg.token) throw new Error("ยังไม่ได้ใส่ GitHub Token");
    const { owner, repo, branch, token } = cfg;

    onStatus("กำลังเชื่อมต่อ GitHub...");
    const refRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`, {
      headers: ghHeaders(token),
      cache: "no-store"
    });
    if (!refRes.ok) throw new Error(`ไม่พบ Branch ${branch} (${refRes.status})`);
    const refData = await refRes.json();
    const headSha = refData.object.sha;

    const commitRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${headSha}`, {
      headers: ghHeaders(token),
      cache: "no-store"
    });
    if (!commitRes.ok) throw new Error(`อ่าน Commit ล่าสุดไม่สำเร็จ (${commitRes.status})`);
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // Fetch existing repo tree paths so unchanged shared-assets aren't re-uploaded and deleted assets are cleaned up
    const treeListRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${baseTreeSha}?recursive=1`, {
      headers: ghHeaders(token),
      cache: "no-store"
    });
    const existingSharedAssets = new Set();
    if (treeListRes.ok) {
      const treeList = await treeListRes.json();
      for (const item of treeList.tree || []) {
        if (item.type === "blob" && item.path.startsWith("shared-assets/")) {
          existingSharedAssets.add(item.path);
        }
      }
    }

    const subjectsSnapshot = getSubjectsSnapshot();
    const treeEntries = [];
    const referencedAssets = new Set();
    const cleanSubjects = [];
    const assetLinksApplied = []; // Track repoPath patches back to caller

    async function publishLinkRecord(sub, link, onStatus) {
      const cleanLink = {
        id: link.id,
        title: link.title,
        subtitle: link.subtitle || "",
        type: link.type || "Web App",
        url: link.url || "",
        badge: link.badge || "Web App",
        frameRestricted: Boolean(link.frameRestricted),
        updatedAt: link.updatedAt || new Date().toISOString().split("T")[0]
      };
      if (link.externalUrl) cleanLink.externalUrl = link.externalUrl;
      if (link.pairedSlideId) cleanLink.pairedSlideId = link.pairedSlideId;
      if (link.unpairedAuto) cleanLink.unpairedAuto = true;

      if (link.repoPath) {
        cleanLink.repoPath = link.repoPath;
        cleanLink.url = link.repoPath;
        referencedAssets.add(link.repoPath);
      }

      if (link.idbKey && (!link.repoPath || !existingSharedAssets.has(link.repoPath))) {
        const blob = await StudyVaultDB.getBlob(link.idbKey);
        if (blob instanceof Blob) {
          if (blob.size > MAX_GITHUB_FILE_BYTES) {
            throw new Error(`ไฟล์ HTML "${link.title}" ขนาด ${(blob.size / (1024 * 1024)).toFixed(1)}MB ใหญ่เกินขีดจำกัด 35MB`);
          }
          onStatus(`กำลังอัปโหลด HTML "${link.title}"...`);
          const path = link.repoPath || `shared-assets/links/${link.id}.html`;
          const b64 = await blobToBase64(blob);
          const blobSha = await createGitBlob(owner, repo, token, b64, "base64");
          treeEntries.push({ path, mode: "100644", type: "blob", sha: blobSha });
          cleanLink.repoPath = path;
          cleanLink.url = path;
          cleanLink.type = "Embedded HTML";
          cleanLink.frameRestricted = false;
          referencedAssets.add(path);
          assetLinksApplied.push({ kind: "link", subId: sub.id, id: link.id, patch: { repoPath: path, url: path } });
        }
      }
      return cleanLink;
    }

    async function publishSlideRecord(sub, sl, onStatus) {
      const cleanSlide = {
        id: sl.id,
        title: sl.title,
        type: sl.type,
        updatedAt: sl.updatedAt || new Date().toISOString().split("T")[0]
      };
      if (sl.unpairedAuto) cleanSlide.unpairedAuto = true;
      if (sl.url) cleanSlide.url = sl.url;
      if (Array.isArray(sl.urls)) cleanSlide.urls = [...sl.urls];
      if (sl.repoPath) {
        cleanSlide.repoPath = sl.repoPath;
        cleanSlide.url = sl.repoPath;
        referencedAssets.add(sl.repoPath);
      }
      if (Array.isArray(sl.repoPaths)) {
        cleanSlide.repoPaths = [...sl.repoPaths];
        cleanSlide.urls = [...sl.repoPaths];
        sl.repoPaths.forEach(p => referencedAssets.add(p));
      }

      if (sl.type === "pdf" && sl.idbKey && (!sl.repoPath || !existingSharedAssets.has(sl.repoPath))) {
        const blob = await StudyVaultDB.getBlob(sl.idbKey);
        if (blob instanceof Blob) {
          if (blob.size > MAX_GITHUB_FILE_BYTES) {
            throw new Error(`ไฟล์ PDF "${sl.title}" ขนาด ${(blob.size / (1024 * 1024)).toFixed(1)}MB ใหญ่เกินขีดจำกัด 35MB ของ GitHub API`);
          }
          onStatus(`กำลังอัปโหลดสไลด์ PDF "${sl.title}" (${(blob.size / (1024 * 1024)).toFixed(1)} MB)...`);
          const path = sl.repoPath || `shared-assets/slides/${sl.id}.pdf`;
          const b64 = await blobToBase64(blob);
          const blobSha = await createGitBlob(owner, repo, token, b64, "base64");
          treeEntries.push({ path, mode: "100644", type: "blob", sha: blobSha });
          cleanSlide.repoPath = path;
          cleanSlide.url = path;
          referencedAssets.add(path);
          assetLinksApplied.push({ kind: "slide", subId: sub.id, id: sl.id, patch: { repoPath: path, url: path } });
        }
      } else if (sl.type === "images" && sl.idbKey) {
        const blobs = await StudyVaultDB.getBlob(sl.idbKey);
        if (Array.isArray(blobs) && blobs.length > 0) {
          const uploadedPaths = [];
          for (let idx = 0; idx < blobs.length; idx++) {
            const imgBlob = blobs[idx];
            if (!(imgBlob instanceof Blob)) continue;
            if (imgBlob.size > MAX_GITHUB_FILE_BYTES) {
              throw new Error(`รูปสไลด์แผ่นที่ ${idx + 1} ใน "${sl.title}" ใหญ่เกิน 24MB`);
            }
            const ext = sanitizeExtFromBlob(imgBlob, "png");
            const path = (sl.repoPaths && sl.repoPaths[idx]) || `shared-assets/slides/${sl.id}-${idx + 1}.${ext}`;
            if (!existingSharedAssets.has(path)) {
              onStatus(`กำลังอัปโหลดสไลด์ "${sl.title}" (${idx + 1}/${blobs.length})...`);
              const b64 = await blobToBase64(imgBlob);
              const blobSha = await createGitBlob(owner, repo, token, b64, "base64");
              treeEntries.push({ path, mode: "100644", type: "blob", sha: blobSha });
            }
            uploadedPaths.push(path);
            referencedAssets.add(path);
          }
          if (uploadedPaths.length > 0) {
            cleanSlide.repoPaths = uploadedPaths;
            cleanSlide.urls = uploadedPaths;
            assetLinksApplied.push({ kind: "slide", subId: sub.id, id: sl.id, patch: { repoPaths: uploadedPaths, urls: uploadedPaths } });
          }
        }
      }
      return cleanSlide;
    }

    for (const sub of subjectsSnapshot) {
      const cleanTopics = [];
      if (Array.isArray(sub.topics) && sub.topics.length > 0) {
        for (const topic of sub.topics) {
          const cleanLink = topic.link ? await publishLinkRecord(sub, topic.link, onStatus) : null;
          const cleanTopicSlides = [];
          for (const sl of topic.slides || []) {
            cleanTopicSlides.push(await publishSlideRecord(sub, sl, onStatus));
          }
          cleanTopics.push({
            id: topic.id,
            title: topic.title,
            subtitle: topic.subtitle || "",
            updatedAt: topic.updatedAt || new Date().toISOString().split("T")[0],
            createdAt: topic.createdAt || Date.now(),
            link: cleanLink,
            slides: cleanTopicSlides
          });
        }
      } else {
        for (const link of sub.links || []) {
          const cleanLink = await publishLinkRecord(sub, link, onStatus);
          cleanTopics.push({
            id: "top-" + cleanLink.id,
            title: cleanLink.title,
            subtitle: cleanLink.subtitle || "",
            updatedAt: cleanLink.updatedAt,
            link: cleanLink,
            slides: []
          });
        }
        for (const sl of sub.slides || []) {
          const cleanSlide = await publishSlideRecord(sub, sl, onStatus);
          cleanTopics.push({
            id: "top-" + cleanSlide.id,
            title: cleanSlide.title,
            subtitle: "",
            updatedAt: cleanSlide.updatedAt,
            link: null,
            slides: [cleanSlide]
          });
        }
      }

      cleanSubjects.push({
        id: sub.id,
        code: sub.code,
        title: sub.title,
        category: sub.category || "ทั่วไป",
        description: sub.description || `คลังสรุปและสไลด์เรียนวิชา ${sub.title}`,
        icon: sub.icon || "📘",
        accent: sub.accent || "from-indigo-500 to-purple-500",
        lastUpdated: sub.lastUpdated || new Date().toISOString().split("T")[0],
        topics: cleanTopics
      });
    }

    // Remove orphaned shared-assets files from tree so deleted PDFs/HTMLs don't bloat repo
    for (const oldPath of existingSharedAssets) {
      if (!referencedAssets.has(oldPath)) {
        treeEntries.push({ path: oldPath, mode: "100644", type: "blob", sha: null });
      }
    }

    onStatus("กำลังบันทึกข้อมูลคลังกลาง...");
    const libraryJson = JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      subjects: cleanSubjects
    }, null, 2) + "\n";

    const jsonBlobSha = await createGitBlob(owner, repo, token, b64EncodeUtf8(libraryJson), "base64");
    treeEntries.push({ path: "shared-library.json", mode: "100644", type: "blob", sha: jsonBlobSha });

    const newTreeRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`, {
      method: "POST",
      headers: ghHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
    });
    if (!newTreeRes.ok) {
      const err = await newTreeRes.json().catch(() => ({}));
      throw new Error(translateGitHubError(newTreeRes.status, err.message || `อัปเดต Git Tree ไม่สำเร็จ (${newTreeRes.status})`));
    }
    const newTreeData = await newTreeRes.json();

    const newCommitRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`, {
      method: "POST",
      headers: ghHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        message: `chore(content): sync shared study library (${cleanSubjects.length} subjects)`,
        tree: newTreeData.sha,
        parents: [headSha]
      })
    });
    if (!newCommitRes.ok) {
      const err = await newCommitRes.json().catch(() => ({}));
      throw new Error(translateGitHubError(newCommitRes.status, err.message || `สร้าง Commit ไม่สำเร็จ (${newCommitRes.status})`));
    }
    const newCommitData = await newCommitRes.json();

    const patchRefRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      headers: ghHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ sha: newCommitData.sha })
    });
    if (!patchRefRes.ok) {
      const err = await patchRefRes.json().catch(() => ({}));
      throw new Error(translateGitHubError(patchRefRes.status, err.message || `อัปเดต Branch ไม่สำเร็จ (${patchRefRes.status})`));
    }

    const nowIso = new Date().toISOString();
    saveConfig({ lastSyncAt: nowIso, verifiedAt: nowIso, lastSyncError: "" });
    onStatus("ซิงก์สำเร็จ");
    return {
      commitSha: newCommitData.sha,
      syncedAt: nowIso,
      cleanSubjects,
      assetLinksApplied
    };
  }

  function b64EncodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function publishLibrary(getSubjectsSnapshot, onStatus = () => {}) {
    if (publishInFlight) {
      dirtyAfterCurrent = true;
      return publishInFlight;
    }
    publishInFlight = (async () => {
      try {
        let result = await runAtomicPublish(getSubjectsSnapshot, onStatus);
        while (dirtyAfterCurrent) {
          dirtyAfterCurrent = false;
          result = await runAtomicPublish(getSubjectsSnapshot, onStatus);
        }
        return result;
      } finally {
        publishInFlight = null;
      }
    })();
    return publishInFlight;
  }

  return {
    getConfig,
    saveConfig,
    clearConfigToken,
    isAdminEnabled,
    verifyRepoAccess,
    loadSharedSubjects,
    publishLibrary
  };
})();
