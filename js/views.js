import { state } from "./state.js";
import { PAGE_SIZE } from "./config.js";
import { escapeHtml, fmtRuntime, pills, trunc, getSeasonBadgeCount } from "./utils.js";
import { renderImgWithBlurhash } from "./blurhash.js";
import {
  imgUrl, fetchItemsInViewPage, getItem,
  getBoxSetChildren, getSeriesSeasons, getSeasonEpisodes
} from "./api.js";
import { saveCurrentViewState, restoreViewState } from "./storage.js";
import { setBreadcrumbs, clearBreadcrumbs } from "./breadcrumbs.js";

function hasPrimary(item) {
  return !!(item?.ImageTags && item.ImageTags.Primary);
}
function hasBackdrop(item) {
  return Array.isArray(item?.BackdropImageTags) && item.BackdropImageTags.length > 0;
}

function getRouteParams() {
  const h = location.hash.replace(/^#/,"");
  const qs = h.includes("?") ? h.split("?")[1] : "";
  return new URLSearchParams(qs);
}

/* ===========================
 * Virtual Grid (row-windowing)
 * =========================== */
const VIRT = {
  enabled: true,
  minCardWidth: 160,
  gap: 14,
  metaHeight: 62,     // tune if needed
  overscanRows: 3,
  cols: 1,
  rowHeight: 260,
  raf: 0,
  bound: false,
  lastSig: "",
};

function getGridWrapEl() {
  return document.getElementById("gridWrap");
}
function getSpacerTopEl() {
  return document.getElementById("spacerTop");
}
function getSpacerBottomEl() {
  return document.getElementById("spacerBottom");
}

function computeGridMetrics() {
  const wrap = getGridWrapEl();
  if (!wrap) return;

  const width = wrap.clientWidth || 1;
  const cols = Math.max(1, Math.floor((width + VIRT.gap) / (VIRT.minCardWidth + VIRT.gap)));
  VIRT.cols = cols;

  const cardW = (width - VIRT.gap * (cols - 1)) / cols;
  const posterH = cardW * (3 / 2); // aspect-ratio 2/3
  VIRT.rowHeight = Math.ceil(posterH + VIRT.metaHeight + 2); // + borders
}

function getVisibleRowRange(totalRows) {
  const wrap = getGridWrapEl();
  if (!wrap) return { startRow: 0, endRow: Math.min(totalRows, 1) };

  const scrollTop = window.scrollY || 0;
  const viewportH = window.innerHeight || 800;

  const rect = wrap.getBoundingClientRect();
  const wrapTop = rect.top + scrollTop;

  const relTop = Math.max(0, scrollTop - wrapTop);
  const relBottom = relTop + viewportH;

  const startRow = Math.max(0, Math.floor(relTop / VIRT.rowHeight) - VIRT.overscanRows);
  const endRow = Math.min(totalRows, Math.ceil(relBottom / VIRT.rowHeight) + VIRT.overscanRows);

  return { startRow, endRow };
}

function setSpacers(topPx, bottomPx) {
  const top = getSpacerTopEl();
  const bottom = getSpacerBottomEl();
  if (top) top.style.height = `${Math.max(0, Math.floor(topPx))}px`;
  if (bottom) bottom.style.height = `${Math.max(0, Math.floor(bottomPx))}px`;
}

function makeVirtSig(totalItems, cols, startRow, endRow) {
  return `${totalItems}|${cols}|${startRow}|${endRow}|${state.viewPaging.searchTerm || ""}`;
}

function bindVirtualEvents() {
  if (VIRT.bound) return;
  VIRT.bound = true;

  const onScrollOrResize = () => {
    // Avoid running during route transitions where the shell isn't present
    if (!getGridWrapEl()) return;

    if (VIRT.raf) return;
    VIRT.raf = requestAnimationFrame(() => {
      VIRT.raf = 0;
      renderViewGrid(state.activeViewName, false, true); // virt-only update
    });
  };

  window.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize);
}

/* ===========================
 * Shell
 * =========================== */
export function buildViewShell(elApp) {
  elApp.innerHTML = `
    <div class="crumbs" id="viewHeader"></div>

    <div id="gridWrap">
      <div id="spacerTop"></div>
      <div class="grid" id="grid"></div>
      <div id="spacerBottom"></div>
      <div id="sentinel" style="height:1px;"></div>
    </div>

    <div id="loadingMore" class="crumbs muted" style="margin-top:14px;"></div>
  `;
}

/* ===========================
 * Paging
 * =========================== */
export async function resetAndLoadFirstPage(viewId, setLoadIndicator) {
  state.viewPaging.items = [];
  state.viewPaging.startIndex = 0;
  state.viewPaging.total = 0;
  state.viewPaging.loading = false;
  state.viewPaging.done = false;

  if (state.viewPaging.observer) {
    state.viewPaging.observer.disconnect();
    state.viewPaging.observer = null;
  }
  state.viewPaging.sentinelAttached = false;

  await loadNextPage(viewId, setLoadIndicator, true);
}

export async function loadNextPage(viewId, setLoadIndicator, isFirst=false) {
  if (state.viewPaging.loading || state.viewPaging.done) return;
  state.viewPaging.loading = true;

  const indicator = typeof setLoadIndicator === "function" ? setLoadIndicator : () => {};
  if (!isFirst) indicator(true, "Loading more…");

  try {
    const { items, total } = await fetchItemsInViewPage(
      viewId,
      state.viewPaging.startIndex,
      PAGE_SIZE,
      state.viewPaging.searchTerm
    );

    if (isFirst) state.viewPaging.total = total;
    state.viewPaging.items.push(...items);
    state.viewPaging.startIndex += items.length;

    if (items.length === 0 || (state.viewPaging.total && state.viewPaging.startIndex >= state.viewPaging.total)) {
      state.viewPaging.done = true;
    }
  } finally {
    state.viewPaging.loading = false;
    if (!isFirst) indicator(false);
  }
}

/* ===========================
 * Grid render (virtualized)
 * =========================== */
function cardHtml(it) {
  const real = imgUrl(it.Id, "Primary", { maxHeight: 420 });
  const img = renderImgWithBlurhash(it, {
    imageType: "Primary",
    url: real,
    alt: it.Name || "",
    wrapStyle: "width:100%;aspect-ratio:2/3;overflow:hidden;background:#0e1522;",
    blurW: 32,
    blurH: 48,
    imgClass: "posterReal",
    imgStyle: "width:100%;height:100%;object-fit:cover;display:block;"
  });

  return `
    <a class="a card" href="#/item/${it.Id}">
      ${img}
      <div class="meta">
        <p class="title">${escapeHtml(it.Name || "(untitled)")}</p>
        <p class="sub">
          ${escapeHtml(it.Type)}
          ${it.ProductionYear ? " • " + it.ProductionYear : ""}
          ${it.RunTimeTicks ? " • " + fmtRuntime(it.RunTimeTicks) : ""}
        </p>
      </div>
    </a>
  `;
}

export function renderViewGrid(activeViewName, replaceAll = false, virtOnly = false) {
  const grid = document.getElementById("grid");
  const header = document.getElementById("viewHeader");
  const loadingMore = document.getElementById("loadingMore");
  const wrap = getGridWrapEl();
  if (!grid || !header || !loadingMore || !wrap) return;

  bindVirtualEvents();
  computeGridMetrics();

  const items = (state.viewPaging.items || []).filter(it => ["Movie","Series","BoxSet"].includes(it.Type));

  header.textContent =
    `${activeViewName} • Loaded ${state.viewPaging.items.length}` +
    (state.viewPaging.total ? ` / ${state.viewPaging.total}` : "") +
    (state.viewPaging.searchTerm ? ` • Search: "${state.viewPaging.searchTerm}"` : "");

  // Non-virtual fallback
  if (!VIRT.enabled) {
    if (replaceAll) grid.innerHTML = items.map(cardHtml).join("");
    else {
      const prevCount = grid.children.length;
      const newItems = items.slice(prevCount);
      grid.insertAdjacentHTML("beforeend", newItems.map(cardHtml).join(""));
    }

    if (state.viewPaging.loading) loadingMore.textContent = "Loading more…";
    else if (state.viewPaging.done) loadingMore.textContent = "End of library.";
    else loadingMore.textContent = "";
    return;
  }

  // Virtual by rows
  const totalItems = items.length;
  const totalRows = Math.max(1, Math.ceil(totalItems / VIRT.cols));

  const { startRow, endRow } = getVisibleRowRange(totalRows);

  const startIndex = startRow * VIRT.cols;
  const endIndex = Math.min(totalItems, endRow * VIRT.cols);

  // Update spacers first
  const topPx = startRow * VIRT.rowHeight;
  const bottomPx = (totalRows - endRow) * VIRT.rowHeight;
  setSpacers(topPx, bottomPx);

  const sig = makeVirtSig(totalItems, VIRT.cols, startRow, endRow);

  // CRITICAL FIX: if virt-only tick and nothing changed, exit immediately (prevents churn/jumps)
  if (virtOnly && sig === VIRT.lastSig) {
    return;
  }

  // On full re-render, invalidate signature so we always paint
  if (replaceAll) VIRT.lastSig = "";

  if (sig !== VIRT.lastSig) {
    VIRT.lastSig = sig;
    const slice = items.slice(startIndex, endIndex);
    grid.innerHTML = slice.map(cardHtml).join("");
  }

  if (state.viewPaging.loading) loadingMore.textContent = "Loading more…";
  else if (state.viewPaging.done) loadingMore.textContent = "End of library.";
  else loadingMore.textContent = "";
}

/* ===========================
 * Sentinel (infinite scroll)
 * =========================== */
export function ensureSentinel(viewId, setLoadIndicator) {
  if (state.viewPaging.sentinelAttached) return;

  const sentinel = document.getElementById("sentinel");
  if (!sentinel) return;

  const indicator = typeof setLoadIndicator === "function" ? setLoadIndicator : () => {};

  const io = new IntersectionObserver(async (entries) => {
    const hit = entries.some(e => e.isIntersecting);
    if (!hit) return;

    // Guard 1: don't re-enter while already loading
    if (state.viewPaging.loading) return;

    // Guard 2: only load when the user is near the end of the page
    const scrollY = window.scrollY || 0;
    const viewportH = window.innerHeight || 0;
    const docH = document.documentElement.scrollHeight || 0;
    if ((scrollY + viewportH) < (docH - 800)) return;

    await loadNextPage(viewId, indicator, false);
    renderViewGrid(state.activeViewName, false, false);
    saveCurrentViewState();
  }, {
    root: null,
    threshold: 0,
    rootMargin: "800px 0px 800px 0px"
  });

  io.observe(sentinel);
  state.viewPaging.observer = io;
  state.viewPaging.sentinelAttached = true;
}

export function reattachSentinel(viewId, setLoadIndicator) {
  if (state.viewPaging.observer) {
    state.viewPaging.observer.disconnect();
    state.viewPaging.observer = null;
  }
  state.viewPaging.sentinelAttached = false;
  ensureSentinel(viewId, setLoadIndicator);
}

/* ===========================
 * Routes
 * =========================== */
export async function renderView({ viewId, elApp, elNav, elQ, setLoadIndicator }) {
  const indicator = typeof setLoadIndicator === "function" ? setLoadIndicator : () => {};

  state.activeViewId = viewId;
  const view = state.views.find(v => v.Id === viewId);
  state.activeViewName = view?.Name || "Library";

  // Header breadcrumbs: just the library name
  setBreadcrumbs(`<span class="muted">${escapeHtml(state.activeViewName || "Library")}</span>`);

  [...elNav.querySelectorAll("a")].forEach(a =>
    a.classList.toggle("active", a.getAttribute("href") === `#/view/${viewId}`)
  );

  // Try restore
  const restored = await restoreViewState(viewId, {
    buildViewShell: () => buildViewShell(elApp),
    renderViewGrid: () => renderViewGrid(state.activeViewName, true, false),
    reattachSentinel: (id) => reattachSentinel(id, indicator),
    setLoadIndicator: indicator
  });

  if (restored?.ok) {
    elQ.value = state.viewPaging.searchTerm;
    // Ensure a paint after restore (and correct spacers)
    requestAnimationFrame(() => {
      renderViewGrid(state.activeViewName, true, false);
      window.scrollTo(0, restored.scrollY || 0);
    });
    return;
  }

  // Normal load
  elApp.innerHTML = `<div class="panel"><div class="pad muted">Loading items…</div></div>`;
  state.viewPaging.searchTerm = elQ.value.trim();

  await resetAndLoadFirstPage(viewId, indicator);

  buildViewShell(elApp);
  renderViewGrid(state.activeViewName, true, false);
  ensureSentinel(viewId, indicator);

  saveCurrentViewState();
}

export async function renderHome(elApp) {
  clearBreadcrumbs();
  elApp.innerHTML = `<div class="panel"><div class="pad muted">Select a library.</div></div>`;
}

export async function renderItem({ itemId, elApp, setLoadIndicator }) {
  const indicator = typeof setLoadIndicator === "function" ? setLoadIndicator : () => {};
  saveCurrentViewState();
  indicator(false);

  elApp.innerHTML = `<div class="panel"><div class="pad muted">Loading item…</div></div>`;

  // Route params (for breadcrumbs)
  const params = getRouteParams();
  const seriesIdFromRoute = params.get("seriesId") || "";
  const seasonIdFromRoute = params.get("seasonId") || "";
  const boxSetIdFromRoute = params.get("boxSetId") || "";

  const item = await getItem(itemId);

  // --- Breadcrumbs (header) ---
  let crumbsHtml = state.activeViewId
    ? `<a class="a muted" href="#/view/${escapeHtml(state.activeViewId)}">${escapeHtml(state.activeViewName || "Library")}</a>`
    : `<span class="muted">${escapeHtml(state.activeViewName || "Library")}</span>`;

  // TV path
  if ((item.Type === "Season" || item.Type === "Episode") && seriesIdFromRoute) {
    const series = await getItem(seriesIdFromRoute);
    crumbsHtml += ` <span class="muted"> → </span> <a class="a muted" href="#/item/${escapeHtml(series.Id)}">${escapeHtml(series.Name || "Series")}</a>`;
  }

  if (item.Type === "Episode") {
    const seasonId = seasonIdFromRoute || item.ParentId || "";
    if (seasonId) {
      const season = await getItem(seasonId);
      crumbsHtml += ` <span class="muted"> → </span> <a class="a muted" href="#/item/${escapeHtml(season.Id)}?seriesId=${encodeURIComponent(seriesIdFromRoute)}">${escapeHtml(season.Name || "Season")}</a>`;
    }
    crumbsHtml += ` <span class="muted"> → </span> ${escapeHtml(item.Name || "")}`;

  // Collections path
  } else if (item.Type === "Movie" && boxSetIdFromRoute) {
    const bs = await getItem(boxSetIdFromRoute);
    crumbsHtml += ` <span class="muted"> → </span> <a class="a muted" href="#/item/${escapeHtml(bs.Id)}">${escapeHtml(bs.Name || "Collection")}</a>`;
    crumbsHtml += ` <span class="muted"> → </span> ${escapeHtml(item.Name || "")}`;

  // Default
  } else {
    crumbsHtml += ` <span class="muted"> → </span> ${escapeHtml(item.Name || "")}`;
  }

  setBreadcrumbs(crumbsHtml);

  // --- Image selection: prefer Backdrop for Series/BoxSet header; fallback when missing ---
  const preferBackdropHeader = (item.Type === "Series" || item.Type === "BoxSet");

  const heroType = preferBackdropHeader
    ? (hasBackdrop(item) ? "Backdrop" : "Primary")
    : (hasBackdrop(item) ? "Backdrop" : "Primary");

  const posterType = hasPrimary(item)
    ? "Primary"
    : (hasBackdrop(item) ? "Backdrop" : "Primary");

  const heroRealUrl =
    heroType === "Backdrop"
      ? imgUrl(item.Id, "Backdrop", { maxWidth: 1280, maxHeight: 0 })
      : imgUrl(item.Id, "Primary", { maxWidth: 1280, maxHeight: 0 });

  const posterRealUrl =
    posterType === "Backdrop"
      ? imgUrl(item.Id, "Backdrop", { maxWidth: 720, maxHeight: 0 })
      : imgUrl(item.Id, "Primary", { maxHeight: 720 });

  const posterHtml = renderImgWithBlurhash(item, {
    imageType: posterType,
    url: posterRealUrl,
    alt: item.Name || "",
    wrapStyle: "width:100%;aspect-ratio:2/3;overflow:hidden;background:#0e1522;",
    blurW: 32,
    blurH: 48,
    imgClass: "posterReal",
    imgStyle: "width:100%;height:100%;object-fit:cover;display:block;"
  });

  const heroHtml = renderImgWithBlurhash(item, {
    imageType: heroType,
    url: heroRealUrl,
    alt: "",
    wrapStyle: "width:100%;aspect-ratio:16/9;overflow:hidden;background:#0e1522;",
    blurW: 64,
    blurH: 36,
    imgClass: "heroReal",
    imgStyle: "width:100%;height:100%;object-fit:cover;display:block;"
  });

  const people = (item.People || []).slice(0, 18);
  const cast = people.filter(p => p.Type === "Actor");
  const crew = people.filter(p => p.Type !== "Actor");

  const metaPairs = [
    ["Type", item.Type],
    ["Year", item.ProductionYear || ""],
    ["Premiere", item.PremiereDate ? new Date(item.PremiereDate).toLocaleDateString() : ""],
    ["Rating", item.OfficialRating || ""],
    ["Community Rating", item.CommunityRating != null ? String(item.CommunityRating) : ""],
    ["Runtime", item.RunTimeTicks ? fmtRuntime(item.RunTimeTicks) : ""],
    ["Studios", (item.Studios || []).map(s => s.Name).join(", ")],
  ].filter(([k,v]) => v);

  let childrenHtml = "";

  if (item.Type === "BoxSet") {
    const kids = await getBoxSetChildren(item.Id);
    const sorted = [
      ...kids.filter(k => k.Type === "Movie"),
      ...kids.filter(k => k.Type !== "Movie"),
    ];

    childrenHtml = `
      <div class="panel">
        <div class="pad">
          <div class="railTitle">Movies</div>
          <div class="rail">
            ${sorted.map(k => {
              const posterUrl = imgUrl(k.Id, "Primary", { maxHeight: 420 });
              const poster = renderImgWithBlurhash(k, {
                imageType: "Primary",
                url: posterUrl,
                alt: k.Name || "",
                wrapStyle: "width:100%;height:100%;",
                blurW: 32,
                blurH: 48,
                imgClass: "posterReal",
                imgStyle: "width:100%;height:100%;object-fit:cover;display:block;"
              });

              return `
                <a class="railItem" href="#/item/${k.Id}?boxSetId=${encodeURIComponent(item.Id)}">
                  <div class="railPoster">${poster}</div>
                  <div class="railName" title="${escapeHtml(k.Name||"")}">${escapeHtml(trunc(k.Name||"", 18))}</div>
                  ${k.ProductionYear ? `<div class="railYear">${escapeHtml(k.ProductionYear)}</div>` : `<div class="railYear">&nbsp;</div>`}
                </a>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  } else if (item.Type === "Series") {
    const seasons = await getSeriesSeasons(item.Id);
    childrenHtml = `
      <div class="panel">
        <div class="pad">
          <div class="seasonsTitle">Seasons</div>
          <div class="seasonsGrid">
            ${seasons.map(s => {
              const badge = getSeasonBadgeCount(s);
              const posterUrl = imgUrl(s.Id, "Primary", { maxHeight: 720 });
              const p = renderImgWithBlurhash(s, {
                imageType: "Primary",
                url: posterUrl,
                alt: s.Name || "",
                wrapStyle: "width:100%;height:100%;",
                blurW: 32,
                blurH: 48,
                imgClass: "posterReal",
                imgStyle: "width:100%;height:100%;object-fit:cover;display:block;"
              });

              return `
                <a class="seasonCard" href="#/item/${s.Id}?seriesId=${encodeURIComponent(item.Id)}">
                  <div class="seasonPosterWrap">
                    ${p}
                    ${badge != null ? `<div class="seasonBadge">${escapeHtml(badge)}</div>` : ``}
                  </div>
                  <div class="seasonLabel">${escapeHtml(s.Name || "")}</div>
                </a>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  } else if (item.Type === "Season") {
    if (seriesIdFromRoute) {
      const eps = await getSeasonEpisodes(seriesIdFromRoute, item.Id);

      childrenHtml = `
        <div class="panel">
          ${heroHtml}
          <div class="pad">
            <h3 style="margin:0 0 14px;">Episodes</h3>

            <div class="list">
              ${eps.map(e => {
                const imgType =
                  (e.ImageTags && e.ImageTags.Primary) ? "Primary" :
                  (e.BackdropImageTags?.length ? "Backdrop" : "Primary");

                const thumb = renderImgWithBlurhash(e, {
                  imageType: imgType,
                  url: imgUrl(e.Id, imgType, { maxWidth: 360 }),
                  alt: e.Name || "",
                  wrapStyle: "width:100%;height:100%;",
                  blurW: 48,
                  blurH: 27,
                  imgClass: "posterReal",
                  imgStyle: "width:100%;height:100%;object-fit:cover;display:block;"
                });

                return `
                  <a class="a episodeRow"
                    href="#/item/${e.Id}?seriesId=${encodeURIComponent(seriesIdFromRoute)}&seasonId=${encodeURIComponent(item.Id)}">

                    <div class="episodeThumb">
                      ${thumb}
                    </div>

                    <div class="episodeMeta">
                      <div class="episodeTitle">
                        ${escapeHtml(
                          e.IndexNumber != null
                            ? `Episode ${e.IndexNumber}: ${e.Name || ""}`
                            : e.Name || ""
                        )}
                      </div>

                      <div class="episodeSub">
                        ${e.RunTimeTicks ? fmtRuntime(e.RunTimeTicks) : ""}
                      </div>

                      ${e.Overview ? `
                        <div class="episodeOverview">
                          ${escapeHtml(e.Overview)}
                        </div>
                      ` : ""}
                    </div>
                  </a>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      `;
    }
  }

  elApp.innerHTML = `
    <div class="detail">
      <div class="panel">
        ${posterHtml}
        <div class="pad">
          ${pills(item.Genres || [])}
          ${item.Tags?.length ? `<div style="margin-top:6px">${pills(item.Tags)}</div>` : ""}
        </div>
      </div>

      <div class="panel">
        ${heroHtml}
        <div class="pad">
          <h2 style="margin:0 0 8px">${escapeHtml(item.Name || "")}</h2>
          ${item.Taglines?.length ? `<div class="muted" style="margin:0 0 10px">${escapeHtml(item.Taglines[0])}</div>` : ""}
          ${item.Overview ? `<div style="line-height:1.5; margin:0 0 14px">${escapeHtml(item.Overview)}</div>` : ""}

          <div class="kv" style="display:grid;grid-template-columns:160px 1fr;gap:10px 14px;">
            ${metaPairs.map(([k,v]) => `<div style="color:var(--muted);font-size:12px;">${escapeHtml(k)}</div><div style="font-size:12px;">${escapeHtml(v)}</div>`).join("")}
          </div>

          ${cast.length ? `
            <h3 style="margin:16px 0 8px">Cast</h3>
            <div class="muted" style="font-size:12px; line-height:1.6">${escapeHtml(cast.map(p => p.Name).join(", "))}</div>
          ` : ""}

          ${crew.length ? `
            <h3 style="margin:16px 0 8px">Crew</h3>
            <div class="muted" style="font-size:12px; line-height:1.6">${escapeHtml(crew.map(p => (p.Role ? `${p.Name} (${p.Role})` : p.Name)).join(", "))}</div>
          ` : ""}
        </div>
      </div>

      ${childrenHtml ? `<div style="grid-column: 1 / -1">${childrenHtml}</div>` : ""}
    </div>
  `;
}
