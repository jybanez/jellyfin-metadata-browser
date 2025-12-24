export function escapeHtml(input){
  const str = input == null ? "" : String(input);
  return str.replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[c]));
}

export function safeText(s){ return s == null ? "" : String(s); }

export function fmtRuntime(ticks) {
  if (!ticks) return "";
  const totalSec = Math.floor(ticks / 10_000_000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function pills(arr) {
  if (!arr || !arr.length) return "";
  return arr.slice(0, 12).map(x => `<span class="pill">${escapeHtml(String(x))}</span>`).join("");
}

export function trunc(s, n=16){
  const str = safeText(s);
  return str.length > n ? str.slice(0, n-1) + "…" : str;
}

export function getSeasonBadgeCount(season) {
  return (
    season?.ChildCount ??
    season?.RecursiveItemCount ??
    season?.UserData?.UnplayedItemCount ??
    null
  );
}
