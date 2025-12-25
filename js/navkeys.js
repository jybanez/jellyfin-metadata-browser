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
