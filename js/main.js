import { state } from "./state.js";
import { loginIfNeeded, ensureUserId, getViews } from "./api.js";
import { parseHash, installRouteSaver } from "./router.js";
import { renderHome, renderView, renderItem } from "./views.js";
import { saveCurrentViewState } from "./storage.js";

const elNav = document.getElementById("nav");
const elApp = document.getElementById("app");
const elStatus = document.getElementById("status");
const elQ = document.getElementById("q");
const btnRefresh = document.getElementById("btnRefresh");

function setStatus(text){ elStatus.textContent = text || ""; }

function showIndicator(show, text="Loading…") {
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
  if (view.Id === state.activeViewId) a.classList.add("active");
  return a;
}

async function route() {
  const r = parseHash();
  if (r.page === "view" && r.viewId) {
    await renderView({ viewId: r.viewId, elApp, elNav, elQ, showIndicator });
  } else if (r.page === "item" && r.itemId) {
    await renderItem({ itemId: r.itemId, elApp, showIndicator });
  } else {
    await renderHome(elApp);
  }
}

let searchDebounce = null;
function installSearch() {
  elQ.addEventListener("input", () => {
    const r = parseHash();
    if (r.page !== "view" || !r.viewId) return;
    const term = elQ.value.trim();
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      if (state.viewPaging.searchTerm === term) return;
      state.viewPaging.searchTerm = term;
      await renderView({ viewId: r.viewId, elApp, elNav, elQ, showIndicator });
      saveCurrentViewState();
    }, 300);
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

window.addEventListener("hashchange", () => route());

installRouteSaver();
installSearch();
bootstrap().catch(err => {
  elApp.innerHTML = `<div class="panel"><div class="pad err">${String(err?.message || err)}</div></div>`;
});
