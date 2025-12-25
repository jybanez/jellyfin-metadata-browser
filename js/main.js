import { state } from "./state.js";
import { loginIfNeeded, ensureUserId, getViews } from "./api.js";
import { parseHash, installRouteSaver } from "./router.js";
import { renderHome, renderView, renderItem } from "./views.js";
import { saveCurrentViewState, clearViewState } from "./storage.js";
import { markImageLoaded } from "./imageCache.js";
import { initNavKeys } from "./navkeys.js";

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => initNavKeys(), { once: true });
} else {
  initNavKeys();
}



window.__jmMarkImageLoaded = markImageLoaded;


const elNav = document.getElementById("nav");
const elApp = document.getElementById("app");
const elStatus = document.getElementById("status");
const elQ = document.getElementById("q");
const btnRefresh = document.getElementById("btnRefresh");

function setStatus(text){ elStatus.textContent = text || ""; }

// Renamed to avoid accidental name mismatches.
function setLoadIndicator(show, text="Loading…") {
  const el = document.getElementById("loadIndicator");
  const t = document.getElementById("loadIndicatorText");
  if (!el || !t) return;
  t.textContent = text;
  el.classList.toggle("show", !!show);
}

function navLink(view) {
  const a = document.createElement("a");
  a.href = `#/view/${view.Id}`;
  a.textContent = view.Name;

  a.dataset.k = "nav";        // 🔑 identify as nav item
  a.tabIndex = 0;             // ensure focusable (safe)

  if (view.Id === state.activeViewId) a.classList.add("active");
  return a;
}


async function route() {
  const r = parseHash();
  if (r.page === "view" && r.viewId) {
    await renderView({ viewId: r.viewId, elApp, elNav, elQ, setLoadIndicator });
  } else if (r.page === "item" && r.itemId) {
    await renderItem({ itemId: r.itemId, elApp, setLoadIndicator });
  } else {
    await renderHome(elApp);
  }
}

let searchDebounce = null;
function installSearch() {
  elQ.addEventListener("input", () => {
    const r = parseHash();
    if (r.page !== "view" || !r.viewId) return;

    const term = elQ.value; // keep raw value, don't trim while typing
    clearTimeout(searchDebounce);

    searchDebounce = setTimeout(async () => {
      const normalized = term.trim();

      // If nothing changed, do nothing
      if (state.viewPaging.searchTerm === normalized) return;

      // Save current state (optional), then force a fresh load for this view
      saveCurrentViewState();
      clearViewState(r.viewId);

      // Set desired term and re-render view (this will fetch from server)
      state.viewPaging.searchTerm = normalized;
      await renderView({ viewId: r.viewId, elApp, elNav, elQ, setLoadIndicator });

      // Persist the new searched state
      saveCurrentViewState();
    }, 350);
  });
}


async function bootstrap() {
  setStatus("Connecting…");
  elApp.innerHTML = `<div class="panel"><div class="pad muted">Initializing…</div></div>`;

  await loginIfNeeded();
  await ensureUserId();

  state.views = await getViews();

  elNav.innerHTML = "";
  state.views.forEach(v => elNav.appendChild(navLink(v)));

  setStatus("Ready.");

  if (!location.hash || parseHash().page === "home") {
    const first = state.views[0];
    if (first) location.hash = `#/view/${first.Id}`;
    else await renderHome(elApp);
  } else {
    await route();
  }
}

btnRefresh.addEventListener("click", async () => {
  saveCurrentViewState();
  state.cache.clear();
  if (state.viewPaging.observer) { state.viewPaging.observer.disconnect(); state.viewPaging.observer = null; }
  state.viewPaging.sentinelAttached = false;
  await bootstrap();
});

elNav.addEventListener("click", () => {
  const r = parseHash();
  if (r.page === "view") saveCurrentViewState();
});

window.addEventListener("hashchange", route);
window.addEventListener("popstate", route);

installRouteSaver();
installSearch();
bootstrap().catch(err => {
  elApp.innerHTML = `<div class="panel"><div class="pad err">${String(err?.message || err)}</div></div>`;
});
