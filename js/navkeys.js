// navkeys.js
import { state } from "./state.js";

/* ===============================
   Key sets (TV / keyboard safe)
================================ */
const BACK_KEYS  = new Set(["Escape", "Backspace", "BrowserBack", "GoBack"]);
const ENTER_KEYS = new Set(["Enter", " ", "Spacebar", "NumpadEnter", "Select"]);
const LEFT_KEYS  = new Set(["ArrowLeft",  "Left"]);
const RIGHT_KEYS = new Set(["ArrowRight", "Right"]);
const UP_KEYS    = new Set(["ArrowUp",    "Up"]);
const DOWN_KEYS  = new Set(["ArrowDown",  "Down"]);

/* ===============================
   Quick Jump config/state
================================ */
const QJ_RESET_MS = 700;   // idle time to reset buffer
const QJ_SHOW_MS  = 650;   // overlay show time
const QJ_MAX_LEN  = 32;

let _qjBuf = "";
let _qjLastAt = 0;
let _qjHideTimer = null;
let _qjExecTimer = null;

/* ===============================
   Utilities
================================ */
function ensureNavState() {
  // Prevent: Cannot set properties of undefined (setting '<viewId>')
  if (!state.navFocus) state.navFocus = Object.create(null);

  // Optional: remember last focus inside item sub-lists (rail/ep/season)
  if (!state.itemFocus) state.itemFocus = Object.create(null);
}

function isTypingContext(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

function getRoute() {
  const h = location.hash.replace(/^#/, "");
  const [path] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "view") return { page: "view", viewId: parts[1] || "" };
  if (parts[0] === "item") return { page: "item", itemId: parts[1] || "" };
  return { page: "home" };
}

/* ===============================
   Quick Jump helpers
================================ */
function isQuickJumpChar(e) {
  // only plain alphanumerics; ignore modifiers
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  if (typeof e.key !== "string") return false;
  if (e.key.length !== 1) return false;
  return /^[a-zA-Z0-9]$/.test(e.key);
}

function qjOverlayEl() {
  let el = document.getElementById("jmQuickJump");
  if (!el) {
    el = document.createElement("div");
    el.id = "jmQuickJump";
    el.style.cssText = [
      "position:fixed",
      "left:50%",
      "top:92px",
      "transform:translateX(-50%)",
      "padding:10px 14px",
      //"border-radius:999px",
      //"background:rgba(14,21,34,.92)",
      //"border:1px solid rgba(255,255,255,.14)",
      //"color:#e6edf3",
      //"font:600 14px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif",
      "z-index:99999",
      "backdrop-filter:blur(10px)",
      "display:none",
      "max-width:min(520px, 90vw)",
      "white-space:nowrap",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(el);
  }
  return el;
}

function showQuickJumpOverlay(text) {
  const el = qjOverlayEl();
  el.textContent = text;
  el.style.display = "block";

  clearTimeout(_qjHideTimer);
  _qjHideTimer = setTimeout(() => {
    el.style.display = "none";
  }, QJ_SHOW_MS);
}

function resetQuickJumpBufferIfIdle() {
  const now = Date.now();
  if (now - _qjLastAt > QJ_RESET_MS) _qjBuf = "";
  _qjLastAt = now;
}

function appendQuickJumpChar(ch) {
  resetQuickJumpBufferIfIdle();
  _qjBuf = (_qjBuf + ch).slice(0, QJ_MAX_LEN);
  showQuickJumpOverlay(_qjBuf.toUpperCase());
  return _qjBuf;
}

function normalizeName(s) {
  return (s || "").trim().toLowerCase();
}

function getElName(el) {
  if (!el) return "";
  // Best practice: set data-name in your templates (optional, but most accurate)
  const dn = el.getAttribute("data-name") || el.getAttribute("data-title") || el.getAttribute("aria-label");
  if (dn) return dn;

  // Try common inner title nodes
  const t =
    el.querySelector?.(".title")?.textContent ||
    el.querySelector?.(".seasonLabel")?.textContent ||
    el.querySelector?.(".railName")?.textContent ||
    el.querySelector?.(".episodeTitle")?.textContent;

  if (t) return t;

  // Fallback: first line of textContent
  const raw = (el.textContent || "").split("\n")[0];
  return raw || "";
}

function findMatchIndex(els, prefix, startIdx) {
  const p = normalizeName(prefix);
  if (!p) return -1;

  const n = els.length;
  if (!n) return -1;

  const start = Math.max(0, Math.min(startIdx || 0, n - 1));

  // forward search then wrap
  for (let i = start; i < n; i++) {
    if (normalizeName(getElName(els[i])).startsWith(p)) return i;
  }
  for (let i = 0; i < start; i++) {
    if (normalizeName(getElName(els[i])).startsWith(p)) return i;
  }
  return -1;
}

/**
 * Determine the current "jump scope":
 * - If nav focused: nav links
 * - Else if focused within a zone (season/ep/rail/card): that zone
 * - Else: based on route (view -> grid; item -> season/ep/rail priority)
 */
function getQuickJumpScope(r) {
  // If nav is focused, scope = nav
  const nav = getFocusedNav();
  if (nav) {
    const links = getNavLinks();
    return { scope: "nav", els: links, getIndex: () => links.indexOf(nav), focusAt: (i) => focusNav(i) };
  }

  // If focused inside one of our zones, scope that zone
  const seasonEl = getZoneEl("season");
  if (seasonEl) {
    const els = getZoneEls("season");
    return { scope: "season", els, getIndex: () => Number(seasonEl.dataset.idx) || 0, focusAt: (i) => focusZone("season", i, r.itemId) };
  }

  const epEl = getZoneEl("ep");
  if (epEl) {
    const els = getZoneEls("ep");
    return { scope: "ep", els, getIndex: () => Number(epEl.dataset.idx) || 0, focusAt: (i) => focusZone("ep", i, r.itemId) };
  }

  const railEl = getZoneEl("rail");
  if (railEl) {
    const els = getZoneEls("rail");
    return { scope: "rail", els, getIndex: () => Number(railEl.dataset.idx) || 0, focusAt: (i) => focusZone("rail", i, r.itemId) };
  }

  const focusedCard = getFocusedGridEl();
  if (focusedCard && r.page === "view") {
    const els = getGridEls();
    return { scope: "grid", els, getIndex: () => Number(focusedCard.dataset.idx) || 0, focusAt: (i) => focusGrid(i, r.viewId) };
  }

  // No focused element: route-based
  if (r.page === "item" && r.itemId) {
    const seasonEls = getZoneEls("season");
    if (seasonEls.length) return { scope: "season", els: seasonEls, getIndex: () => 0, focusAt: (i) => focusZone("season", i, r.itemId) };

    const epEls = getZoneEls("ep");
    if (epEls.length) return { scope: "ep", els: epEls, getIndex: () => 0, focusAt: (i) => focusZone("ep", i, r.itemId) };

    const railEls = getZoneEls("rail");
    if (railEls.length) return { scope: "rail", els: railEls, getIndex: () => 0, focusAt: (i) => focusZone("rail", i, r.itemId) };
  }

  if (r.page === "view" && r.viewId) {
    const els = getGridEls();
    return { scope: "grid", els, getIndex: () => (state.navFocus?.[r.viewId] || 0), focusAt: (i) => focusGrid(i, r.viewId) };
  }

  // fallback: nav
  const links = getNavLinks();
  return { scope: "nav", els: links, getIndex: () => 0, focusAt: (i) => focusNav(i) };
}

function executeQuickJump(r) {
  const prefix = _qjBuf;
  if (!prefix) return;

  const scope = getQuickJumpScope(r);
  const els = scope.els || [];
  if (!els.length) return;

  const start = (scope.getIndex?.() ?? 0) + 1; // "next match" behavior
  const hit = findMatchIndex(els, prefix, start);
  if (hit >= 0) scope.focusAt(hit);
}

/* ===============================
   NAV ZONE
================================ */
function getNavLinks() {
  return Array.from(document.querySelectorAll('#nav a[data-k="nav"]'));
}

function getFocusedNav() {
  return document.activeElement?.closest?.('#nav a[data-k="nav"]') || null;
}

function focusNav(idx) {
  const links = getNavLinks();
  if (!links.length) return;
  const clamped = Math.max(0, Math.min(idx, links.length - 1));
  links[clamped].focus();
}

/**
 * Focus the nav item that matches the CURRENT active view.
 * Falls back to the first nav link if not found.
 */
function focusActiveViewNav() {
  const links = getNavLinks();
  if (!links.length) return;

  const activeId = state.activeViewId || "";
  if (activeId) {
    const target = links.find(a => a.getAttribute("href") === `#/view/${activeId}`);
    if (target) { target.focus(); return; }
  }
  // fallback
  links[0].focus();
}

/* ===============================
   ZONE HELPERS (season / ep / rail)
================================ */
function getZoneEl(k) {
  return document.activeElement?.closest?.(`[data-k="${k}"][data-idx]`) || null;
}

function getZoneEls(k) {
  return Array.from(document.querySelectorAll(`[data-k="${k}"][data-idx]`));
}

/**
 * Compute "columns" for a grid-like zone by counting elements
 * that share the same top offset as the first item.
 * Works well for Seasons; safe fallback to 1.
 */
function getZoneCols(k) {
  const els = getZoneEls(k);
  if (!els.length) return 1;

  const firstTop = els[0].offsetTop;
  let cols = 0;
  for (const el of els) {
    if (el.offsetTop !== firstTop) break;
    cols++;
  }
  return Math.max(1, cols || 1);
}

function focusZone(k, idx, itemId = "") {
  const els = getZoneEls(k);
  if (!els.length) return;

  const max = els.length - 1;
  const clamped = Math.max(0, Math.min(idx, max));
  const target = els.find(e => Number(e.dataset.idx) === clamped) || els[clamped];
  if (!target) return;

  target.focus();
  target.scrollIntoView({ block: "nearest", inline: "nearest" });

  // remember per item page
  if (itemId) {
    ensureNavState();
    state.itemFocus[itemId] = state.itemFocus[itemId] || {};
    state.itemFocus[itemId][k] = clamped;
  }
}

function openFocusedLink() {
  const a = document.activeElement?.closest?.("a[href]");
  if (a) location.hash = a.getAttribute("href");
}

/* ===============================
   GRID HELPERS (library view)
================================ */
function getGridEls() {
  return Array.from(document.querySelectorAll(".card[data-idx]"));
}

function getFocusedGridEl() {
  return document.activeElement?.closest?.(".card[data-idx]") || null;
}

function getCols() {
  return state.viewPaging?.virt?.cols || 1;
}

function focusGrid(idx, viewId) {
  ensureNavState();

  const els = getGridEls();
  if (!els.length) return;

  const max = els.length - 1;
  const clamped = Math.max(0, Math.min(idx, max));
  const el = els.find(e => Number(e.dataset.idx) === clamped) || els[clamped];
  if (!el) return;

  el.focus();
  el.scrollIntoView({ block: "nearest", inline: "nearest" });

  state.navFocus[viewId] = clamped;
}

/* ===============================
   INITIAL FOCUS (view/item)
================================ */
export function focusInitialInView(viewId) {
  ensureNavState();
  const idx = state.navFocus?.[viewId] || 0;

  requestAnimationFrame(() => {
    focusGrid(idx, viewId);

    // keyboard-driven infinite loading
    const itemsLoaded = state.viewPaging.items?.length || 0;
    const nearEnd = idx >= itemsLoaded - 8;

    if (
      nearEnd &&
      !state.viewPaging.loading &&
      !state.viewPaging.done &&
      typeof window.__jmLoadNextPage === "function"
    ) {
      window.__jmLoadNextPage();
    }
  });
}

function focusInitialInItem(itemId) {
  ensureNavState();

  const saved = state.itemFocus?.[itemId] || {};
  const seasonEls = getZoneEls("season");
  const epEls = getZoneEls("ep");
  const railEls = getZoneEls("rail");

  // Prefer seasons first if present (Series page), else episodes, else rail
  if (seasonEls.length) {
    focusZone("season", Number.isFinite(saved.season) ? saved.season : 0, itemId);
    return true;
  }
  if (epEls.length) {
    focusZone("ep", Number.isFinite(saved.ep) ? saved.ep : 0, itemId);
    return true;
  }
  if (railEls.length) {
    focusZone("rail", Number.isFinite(saved.rail) ? saved.rail : 0, itemId);
    return true;
  }
  return false;
}

/* ===============================
   INIT
================================ */
export function initNavKeys() {
  if (window.__jmNavKeysInit) return;
  window.__jmNavKeysInit = true;

  ensureNavState();

  document.addEventListener(
    "keydown",
    async (e) => {
      if (isTypingContext(document.activeElement)) return;

      const r = getRoute();

      // ---- QUICK JUMP (new) ----
      if (isQuickJumpChar(e)) {
        e.preventDefault();

        appendQuickJumpChar(e.key);

        // debounce execution so a burst of typing doesn't do many DOM scans
        clearTimeout(_qjExecTimer);
        _qjExecTimer = setTimeout(() => {
          try { executeQuickJump(r); } catch (_) {}
        }, 90);

        return;
      }

      // Global Back handling on item pages (even when nothing focusable is focused)
      if (r.page === "item" && BACK_KEYS.has(e.key)) {
        e.preventDefault();
        history.back();
        return;
      }

      /* ---------- NAV ---------- */
      const nav = getFocusedNav();
      if (nav) {
        const links = getNavLinks();
        const idx = links.indexOf(nav);

        if (LEFT_KEYS.has(e.key))  { e.preventDefault(); focusNav(idx - 1); return; }
        if (RIGHT_KEYS.has(e.key)) { e.preventDefault(); focusNav(idx + 1); return; }

        if (DOWN_KEYS.has(e.key)) {
          e.preventDefault();
          if (r.page === "view" && r.viewId) focusInitialInView(r.viewId);
          else if (r.page === "item" && r.itemId) focusInitialInItem(r.itemId);
          return;
        }

        if (ENTER_KEYS.has(e.key)) {
          e.preventDefault();
          location.hash = nav.getAttribute("href");
          return;
        }
        return;
      }

      /* ---------- ITEM PAGE: SEASONS (Series page) ---------- */
      const seasonEl = getZoneEl("season");
      if (seasonEl) {
        const idx = Number(seasonEl.dataset.idx) || 0;
        const cols = getZoneCols("season");

        if (LEFT_KEYS.has(e.key))  { e.preventDefault(); focusZone("season", idx - 1, r.itemId); return; }
        if (RIGHT_KEYS.has(e.key)) { e.preventDefault(); focusZone("season", idx + 1, r.itemId); return; }

        if (UP_KEYS.has(e.key)) {
          e.preventDefault();
          if (idx < cols) { focusActiveViewNav(); return; }
          focusZone("season", idx - cols, r.itemId);
          return;
        }

        if (DOWN_KEYS.has(e.key)) {
          e.preventDefault();
          focusZone("season", idx + cols, r.itemId);
          return;
        }

        if (ENTER_KEYS.has(e.key)) {
          e.preventDefault();
          openFocusedLink();
          return;
        }
        return;
      }

      /* ---------- ITEM PAGE: EPISODES ---------- */
      if (r.page === "item" && r.itemId) {
        const ep = getZoneEl("ep");
        if (ep) {
          const idx = Number(ep.dataset.idx) || 0;

          if (UP_KEYS.has(e.key)) {
            e.preventDefault();
            if (idx <= 0) {
              // If at top of episodes, go to active nav
              focusActiveViewNav();
              return;
            }
            focusZone("ep", idx - 1, r.itemId);
            return;
          }

          if (DOWN_KEYS.has(e.key)) { e.preventDefault(); focusZone("ep", idx + 1, r.itemId); return; }
          if (ENTER_KEYS.has(e.key)) { e.preventDefault(); openFocusedLink(); return; }
          return;
        }

        /* ---------- ITEM PAGE: RAIL (collection movies) ---------- */
        const rail = getZoneEl("rail");
        if (rail) {
          const idx = Number(rail.dataset.idx) || 0;

          if (LEFT_KEYS.has(e.key))  { e.preventDefault(); focusZone("rail", idx - 1, r.itemId); return; }
          if (RIGHT_KEYS.has(e.key)) { e.preventDefault(); focusZone("rail", idx + 1, r.itemId); return; }

          if (UP_KEYS.has(e.key)) {
            // Rail is a single-row zone; UP should go to active nav
            e.preventDefault();
            focusActiveViewNav();
            return;
          }

          if (DOWN_KEYS.has(e.key)) {
            // If episodes exist below (rare), allow jumping down
            e.preventDefault();
            const epEls = getZoneEls("ep");
            if (epEls.length) focusZone("ep", 0, r.itemId);
            return;
          }

          if (ENTER_KEYS.has(e.key)) { e.preventDefault(); openFocusedLink(); return; }
          return;
        }

        // If we're on an item page and nothing is focused in season/ep/rail, allow arrows to enter them
        if (LEFT_KEYS.has(e.key) || RIGHT_KEYS.has(e.key) || UP_KEYS.has(e.key) || DOWN_KEYS.has(e.key)) {
          const did = focusInitialInItem(r.itemId);
          if (did) { e.preventDefault(); return; }
        }
      }

      /* ---------- GRID (library view) ---------- */
      if (r.page === "view" && r.viewId) {
        const focused = getFocusedGridEl();
        let idx = focused ? Number(focused.dataset.idx) : (state.navFocus?.[r.viewId] || 0);
        const cols = getCols();

        if (LEFT_KEYS.has(e.key)) idx--;
        else if (RIGHT_KEYS.has(e.key)) idx++;
        else if (UP_KEYS.has(e.key)) {
          if (idx < cols) {
            e.preventDefault();
            focusActiveViewNav(); // focus current view in nav (not first)
            return;
          }
          idx -= cols;
        } else if (DOWN_KEYS.has(e.key)) idx += cols;
        else if (ENTER_KEYS.has(e.key)) { e.preventDefault(); openFocusedLink(); return; }
        else return;

        e.preventDefault();
        focusGrid(idx, r.viewId);

        // keyboard-driven infinite loading
        const itemsLoaded = state.viewPaging.items?.length || 0;
        const nearEnd = idx >= itemsLoaded - 8;

        if (
          nearEnd &&
          !state.viewPaging.loading &&
          !state.viewPaging.done &&
          typeof window.__jmLoadNextPage === "function"
        ) {
          window.__jmLoadNextPage();
        }
      }
    },
    { passive: false }
  );
}

/* ===============================
   EXPORTED HELPERS
================================ */
export function setVirtMetrics({ enabled, cols, rowHeight }) {
  state.viewPaging ??= {};
  state.viewPaging.virt = {
    enabled: !!enabled,
    cols: cols || 1,
    rowHeight: rowHeight || 260
  };
}
