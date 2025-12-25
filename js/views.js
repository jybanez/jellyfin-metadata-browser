// views.js
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
import { setVirtMetrics, focusInitialInView } from "./navkeys.js";

function hasPrimary(item) {
  return !!(item?.ImageTags && item.ImageTags.Primary);
}
function hasBackdrop(item) {
  return Array.isArray(item?.BackdropImageTags) && item.BackdropImageTags.length > 0;
}
function hasImageTag(item, key) {
  return !!(item?.ImageTags && item.ImageTags[key]);
}

function getRouteParams() {
  const h = location.hash.replace(/^#/, "");
  const qs = h.includes("?") ? h.split("?")[1] : "";
  return new URLSearchParams(qs);
}

function computeGridMetrics() {
  const grid = document.getElementById("grid");
  if (!grid) return { cols: 1, rowHeight: 300 };

  const cards = Array.from(grid.querySelectorAll(".card[data-idx]"));
  if (cards.length === 0) return { cols: 1, rowHeight: 300 };

  const top0 = cards[0].offsetTop;
  let cols = 0;
  for (const c of cards) {
    if (Math.abs(c.offsetTop - top0) <= 2) cols++;
    else break;
  }
  cols = Math.max(1, cols);

  const secondRow = cards.find(c => c.offsetTop > top0 + 2);
  const rowHeight = secondRow ? Math.max(180, secondRow.offsetTop - top0) : 300;

  return { cols, rowHeight };
}

export function buildViewShell(elApp) {
  elApp.innerHTML = `
    <div class="crumbs" id="viewHeader"></div>
    <div class="grid" id="grid"></div>
    <div id="loadingMore" class="crumbs muted" style="margin-top:14px;"></div>
    <div id="sentinel" style="height:1px;"></div>
  `;
}

export async function loadNextPage(viewId, setLoadIndicator, isFirst = false) {
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

    if (
      items.length === 0 ||
      (state.viewPaging.total && state.viewPaging.startIndex >= state.viewPaging.total)
    ) {
      state.viewPaging.done = true;
    }
  } finally {
    state.viewPaging.loading = false;
    if (!isFirst) indicator(false);
  }
}

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

function cardHtml(it, idx) {
  const poster = renderImgWithBlurhash(it, {
    imageType: "Primary",
    url: imgUrl(it.Id, "Primary", { maxHeight: 420 }),
    alt: it.Name || "",
    wrapStyle: "width:100%;aspect-ratio:2/3;",
    imgClass: "posterReal",
    imgStyle: "width:100%;height:100%;object-fit:cover;"
  });

  return `
    <a class="a card"
       data-k="card"
       data-idx="${idx}"
       tabindex="-1"
       href="#/item/${it.Id}">
      ${poster}
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

export function renderViewGrid(activeViewName, replaceAll = false) {
  const grid = document.getElementById("grid");
  const header = document.getElementById("viewHeader");
  const loadingMore = document.getElementById("loadingMore");
  if (!grid || !header || !loadingMore) return;

  const items = (state.viewPaging.items || []).filter(it => ["Movie", "Series", "BoxSet"].includes(it.Type));

  header.textContent =
    `${activeViewName} • Loaded ${state.viewPaging.items.length}` +
    (state.viewPaging.total ? ` / ${state.viewPaging.total}` : "") +
    (state.viewPaging.searchTerm ? ` • Search: "${state.viewPaging.searchTerm}"` : "");

  if (replaceAll) {
    grid.innerHTML = items.map((it, i) => cardHtml(it, i)).join("");
  } else {
    const prevCount = grid.children.length;
    if (prevCount === 0) grid.innerHTML = items.map((it, i) => cardHtml(it, i)).join("");
    else {
      const newItems = items.slice(prevCount);
      grid.insertAdjacentHTML("beforeend", newItems.map((it, i) => cardHtml(it, prevCount + i)).join(""));
    }
  }

  const { cols, rowHeight } = computeGridMetrics();
  setVirtMetrics({ enabled: true, cols, rowHeight });

  if (state.viewPaging.loading) loadingMore.textContent = "Loading more…";
  else if (state.viewPaging.done) loadingMore.textContent = "End of library.";
  else loadingMore.textContent = "";
}

export function ensureSentinel(viewId, setLoadIndicator) {
  if (state.viewPaging.sentinelAttached) return;

  const sentinel = document.getElementById("sentinel");
  if (!sentinel) return;

  const indicator = typeof setLoadIndicator === "function" ? setLoadIndicator : () => {};

  const io = new IntersectionObserver(async (entries) => {
    const hit = entries.some(e => e.isIntersecting);
    if (!hit) return;

    await loadNextPage(viewId, indicator, false);
    renderViewGrid(state.activeViewName, false);
    saveCurrentViewState();
  }, { root: null, threshold: 0.1 });

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

// Install keyboard-triggered paging hook with correct indicator closure
function installKeyboardPagingHook(indicator) {
  window.__jmLoadNextPage = async () => {
    if (state.viewPaging.loading || state.viewPaging.done) return;

    const viewId = state.activeViewId;
    if (!viewId) return;

    await loadNextPage(viewId, indicator, false);
    renderViewGrid(state.activeViewName, false);
    saveCurrentViewState();
  };
}

export async function renderView({ viewId, elApp, elNav, elQ, setLoadIndicator }) {
  const indicator = typeof setLoadIndicator === "function" ? setLoadIndicator : () => {};

  state.activeViewId = viewId;
  const view = state.views.find(v => v.Id === viewId);
  state.activeViewName = view?.Name || "Library";

  [...elNav.querySelectorAll("a")].forEach(a =>
    a.classList.toggle("active", a.getAttribute("href") === `#/view/${viewId}`)
  );

  clearBreadcrumbs();

  const restored = await restoreViewState(viewId, {
    buildViewShell: () => buildViewShell(elApp),
    renderViewGrid: () => renderViewGrid(state.activeViewName, true),
    reattachSentinel: (id) => reattachSentinel(id, indicator),
    setLoadIndicator: indicator
  });

  // Always install hook for this view
  installKeyboardPagingHook(indicator);

  if (restored?.ok) {
    elQ.value = state.viewPaging.searchTerm || "";
    requestAnimationFrame(() => window.scrollTo(0, restored.scrollY || 0));
    requestAnimationFrame(() => focusInitialInView(viewId));
    return;
  }

  elApp.innerHTML = `<div class="panel"><div class="pad muted">Loading items…</div></div>`;
  state.viewPaging.searchTerm = elQ.value.trim();

  await resetAndLoadFirstPage(viewId, indicator);
  buildViewShell(elApp);
  renderViewGrid(state.activeViewName, true);
  ensureSentinel(viewId, indicator);

  saveCurrentViewState();
  requestAnimationFrame(() => focusInitialInView(viewId));
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

  const params = getRouteParams();
  const seriesIdFromRoute = params.get("seriesId") || "";
  const seasonIdFromRoute = params.get("seasonId") || "";
  const boxSetIdFromRoute = params.get("boxSetId") || "";

  const item = await getItem(itemId);

  // Breadcrumbs
  let crumbsHtml = state.activeViewId
    ? `<a class="a muted" href="#/view/${escapeHtml(state.activeViewId)}">${escapeHtml(state.activeViewName || "Library")}</a>`
    : `<span class="muted">${escapeHtml(state.activeViewName || "Library")}</span>`;

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
  } else if (item.Type === "Movie" && boxSetIdFromRoute) {
    const bs = await getItem(boxSetIdFromRoute);
    crumbsHtml += ` <span class="muted"> → </span> <a class="a muted" href="#/item/${escapeHtml(bs.Id)}">${escapeHtml(bs.Name || "Collection")}</a>`;
    crumbsHtml += ` <span class="muted"> → </span> ${escapeHtml(item.Name || "")}`;
  } else {
    crumbsHtml += ` <span class="muted"> → </span> ${escapeHtml(item.Name || "")}`;
  }

  setBreadcrumbs(crumbsHtml);

  // Images
  const preferBackdropHeader = (item.Type === "Series" || item.Type === "BoxSet");
  const heroType = preferBackdropHeader ? (hasBackdrop(item) ? "Backdrop" : "Primary") : (hasBackdrop(item) ? "Backdrop" : "Primary");
  const posterType = hasPrimary(item) ? "Primary" : (hasBackdrop(item) ? "Backdrop" : "Primary");

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

  const hasLogo = hasImageTag(item, "Logo");
  const logoHtml = hasLogo
    ? renderImgWithBlurhash(item, {
        imageType: "Logo",
        url: imgUrl(item.Id, "Logo", { maxWidth: 900, maxHeight: 0 }),
        alt: item.Name || "",
        wrapStyle: "width:100%;height:100%;",
        blurW: 64,
        blurH: 24,
        imgClass: "heroReal",
        imgStyle: "width:100%;height:100%;object-fit:contain;display:block;"
      })
    : "";

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
  ].filter(([k, v]) => v);

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
            ${sorted.map((k, idxRail) => {
              const poster = renderImgWithBlurhash(k, {
                imageType: "Primary",
                url: imgUrl(k.Id, "Primary", { maxHeight: 420 }),
                alt: k.Name || "",
                wrapStyle: "width:100%;height:100%;",
                blurW: 32,
                blurH: 48,
                imgClass: "posterReal",
                imgStyle: "width:100%;height:100%;object-fit:cover;display:block;"
              });

              return `
                <a class="railItem"
                   data-k="rail"
                   data-idx="${idxRail}"
                   tabindex="-1"
                   href="#/item/${k.Id}?boxSetId=${encodeURIComponent(item.Id)}">
                  <div class="railPoster">${poster}</div>
                  <div class="railName" title="${escapeHtml(k.Name || "")}">${escapeHtml(trunc(k.Name || "", 18))}</div>
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
            ${seasons.map((s, i) => {
              const badge = getSeasonBadgeCount(s);
              const p = renderImgWithBlurhash(s, {
                imageType: "Primary",
                url: imgUrl(s.Id, "Primary", { maxHeight: 720 }),
                alt: s.Name || "",
                wrapStyle: "width:100%;height:100%;",
                blurW: 32,
                blurH: 48,
                imgClass: "posterReal",
                imgStyle: "width:100%;height:100%;object-fit:cover;display:block;"
              });

              return `
                <a class="seasonCard"
                    data-k="season"
                    data-idx="${i}"
                    tabindex="-1"
                    href="#/item/${s.Id}?seriesId=${encodeURIComponent(item.Id)}">
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
      //${heroHtml}
      childrenHtml = `
        <div class="panel">
          
          <div class="pad">
            <h3 style="margin:0 0 14px;">Episodes</h3>

            <div class="list">
              ${eps.map((e, idxEp) => {
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
                     data-k="ep"
                     data-idx="${idxEp}"
                     tabindex="-1"
                     href="#/item/${e.Id}?seriesId=${encodeURIComponent(seriesIdFromRoute)}&seasonId=${encodeURIComponent(item.Id)}">
                    <div class="episodeThumb">${thumb}</div>

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
    <div class="detailHero">
      <div class="heroBg">
        ${heroHtml}
      </div>

      <div class="heroContent">
        <div class="heroPoster">
          ${posterHtml}
          <div class="pad">
            ${pills(item.Genres || [])}
            ${item.Tags?.length ? `<div style="margin-top:6px">${pills(item.Tags)}</div>` : ""}
          </div>
        </div>

        <div class="heroText">
          ${hasLogo ? `<div class="heroLogo">${logoHtml}</div>` : ""}
          <h2>${escapeHtml(item.Name || "")}</h2>

          ${item.Taglines?.length ? `<div class="tagline">${escapeHtml(item.Taglines[0])}</div>` : ""}

          ${item.Overview ? `<div class="overview">${escapeHtml(item.Overview)}</div>` : ""}

          <div class="heroMeta">
            ${metaPairs.map(([k, v]) =>
              `<div style="color:var(--muted);font-size:12px;">${escapeHtml(k)}</div>
               <div style="font-size:12px;">${escapeHtml(v)}</div>`
            ).join("")}
          </div>

          ${cast.length ? `
            <h3 style="margin:14px 0 6px">Cast</h3>
            <div class="muted" style="font-size:12px; line-height:1.6">
              ${escapeHtml(cast.map(p => p.Name).join(", "))}
            </div>
          ` : ""}

          ${crew.length ? `
            <h3 style="margin:14px 0 6px">Crew</h3>
            <div class="muted" style="font-size:12px; line-height:1.6">
              ${escapeHtml(crew.map(p => (p.Role ? `${p.Name} (${p.Role})` : p.Name)).join(", "))}
            </div>
          ` : ""}
        </div>
      </div>
    </div>

    ${childrenHtml ? `<div>${childrenHtml}</div>` : ""}
  `;
}

// Keep virt metrics synced on resize
let __jmResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(__jmResizeTimer);
  __jmResizeTimer = setTimeout(() => {
    const { cols, rowHeight } = computeGridMetrics();
    setVirtMetrics({ enabled: true, cols, rowHeight });
  }, 120);
});
