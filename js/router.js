import { state } from "./state.js";
import { saveCurrentViewState, updateScrollInStorage } from "./storage.js";

export function parseHash() {
  const h = location.hash.replace(/^#/,"");
  const [path, qs] = h.split("?");
  const parts = (path || "").split("/").filter(Boolean);
  const params = new URLSearchParams(qs || "");

  if (parts.length === 0) return { page: "home", params };
  if (parts[0] === "view") return { page: "view", viewId: parts[1] || "", params };
  if (parts[0] === "item") return { page: "item", itemId: parts[1] || "", params };
  return { page: "home", params };
}

export function installRouteSaver() {
  let lastRoute = null;

  window.addEventListener("hashchange", () => {
    const next = parseHash();
    if (lastRoute?.page === "view" && !(next.page === "view" && next.viewId === lastRoute.viewId)) {
      saveCurrentViewState();
    }
    lastRoute = next;
  });

  // Scroll persistence
  let t = null;
  window.addEventListener("scroll", () => {
    const r = parseHash();
    if (r.page !== "view" || !r.viewId) return;
    clearTimeout(t);
    t = setTimeout(() => updateScrollInStorage(r.viewId, window.scrollY || 0), 200);
  });
}
