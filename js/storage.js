import { SS_PREFIX, SS_TARGET_MAX_CHARS } from "./config.js";
import { state } from "./state.js";
import { fetchItemsByIds } from "./api.js";

function ssKey(viewId){ return SS_PREFIX + viewId; }
function ssWrite(viewId, obj){
  try { sessionStorage.setItem(ssKey(viewId), JSON.stringify(obj)); }
  catch (e) {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SS_PREFIX)) sessionStorage.removeItem(k);
      }
      sessionStorage.setItem(ssKey(viewId), JSON.stringify(obj));
    } catch (_) {}
  }
}
function ssRead(viewId){
  try {
    const raw = sessionStorage.getItem(ssKey(viewId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function extractPrimaryBlurHash(it){
  const m = it?.ImageBlurHashes?.Primary;
  if (!m) return it?.PrimaryBlurHash || null;
  const ks = Object.keys(m);
  return ks.length ? (m[ks[0]] || null) : null;
}
function compactItemForList(it){
  return {
    Id: it.Id,
    Name: it.Name,
    Type: it.Type,
    ProductionYear: it.ProductionYear ?? null,
    RunTimeTicks: it.RunTimeTicks ?? null,
    PrimaryBlurHash: extractPrimaryBlurHash(it),
  };
}

export function saveCurrentViewState() {
  const viewId = state.activeViewId || "";
  if (!viewId) return;

  // in-memory full
  state.viewStateCache.set(viewId, {
    kind: "memory",
    viewId,
    scrollY: window.scrollY || 0,
    searchTerm: state.viewPaging.searchTerm || "",
    startIndex: state.viewPaging.startIndex || 0,
    total: state.viewPaging.total || 0,
    done: !!state.viewPaging.done,
    items: [...(state.viewPaging.items || [])],
  });

  const ids = (state.viewPaging.items || []).map(x => x.Id);

  let payload = {
    kind: "compact",
    ts: Date.now(),
    viewId,
    scrollY: window.scrollY || 0,
    searchTerm: state.viewPaging.searchTerm || "",
    startIndex: state.viewPaging.startIndex || 0,
    total: state.viewPaging.total || 0,
    done: !!state.viewPaging.done,
    items: (state.viewPaging.items || []).map(compactItemForList),
  };

  let json = "";
  try { json = JSON.stringify(payload); } catch { json = ""; }

  if (!json || json.length > SS_TARGET_MAX_CHARS) {
    payload = {
      kind: "ids",
      ts: Date.now(),
      viewId,
      scrollY: window.scrollY || 0,
      searchTerm: state.viewPaging.searchTerm || "",
      startIndex: state.viewPaging.startIndex || 0,
      total: state.viewPaging.total || 0,
      done: !!state.viewPaging.done,
      ids
    };
  }

  ssWrite(viewId, payload);
}

export async function restoreViewState(viewId, { buildViewShell, renderViewGrid, reattachSentinel, setLoadIndicator }){
  const mem = state.viewStateCache.get(viewId);
  if (mem?.kind === "memory") {
    state.viewPaging.items = [...(mem.items || [])];
    state.viewPaging.startIndex = mem.startIndex || state.viewPaging.items.length || 0;
    state.viewPaging.total = mem.total || 0;
    state.viewPaging.done = !!mem.done;
    state.viewPaging.loading = false;
    state.viewPaging.searchTerm = mem.searchTerm || "";
    return { ok:true, kind:"memory", scrollY: mem.scrollY || 0 };
  }

  const ss = ssRead(viewId);
  if (!ss) return { ok:false };

  state.viewPaging.loading = false;
  state.viewPaging.searchTerm = ss.searchTerm || "";
  state.viewPaging.startIndex = ss.startIndex || 0;
  state.viewPaging.total = ss.total || 0;
  state.viewPaging.done = !!ss.done;

  buildViewShell();

  if (ss.kind === "compact") {
    state.viewPaging.items = ss.items || [];
    renderViewGrid(true);
    reattachSentinel(viewId);
    return { ok:true, kind:"compact", scrollY: ss.scrollY || 0 };
  }

  if (ss.kind === "ids") {
    state.viewPaging.items = [];
    renderViewGrid(true);
    reattachSentinel(viewId);

    const ids = ss.ids || [];
    const BATCH = 200;

    setLoadIndicator(true, "Restoring list…");
    try {
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const hydrated = await fetchItemsByIds(chunk);
        state.viewPaging.items.push(...hydrated);
        renderViewGrid(true);
      }
    } finally {
      setLoadIndicator(false);
    }

    return { ok:true, kind:"ids", scrollY: ss.scrollY || 0 };
  }

  return { ok:false };
}

export function updateScrollInStorage(viewId, y){
  const mem = state.viewStateCache.get(viewId);
  if (mem?.kind === "memory") mem.scrollY = y;

  const ss = ssRead(viewId);
  if (ss) {
    ss.scrollY = y;
    ssWrite(viewId, ss);
  }
}
