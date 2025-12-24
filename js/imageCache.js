const MEM = new Set(); // fast per-tab cache

const SS_KEY = "jm_imgcache_v1";
const SS_MAX = 3000;   // cap entries to avoid bloating storage

function ssLoad() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function ssSave(set) {
  try {
    const arr = Array.from(set);
    // keep only the most recent SS_MAX
    const trimmed = arr.length > SS_MAX ? arr.slice(arr.length - SS_MAX) : arr;
    sessionStorage.setItem(SS_KEY, JSON.stringify(trimmed));
  } catch {}
}

// initialize from sessionStorage once
for (const u of ssLoad()) MEM.add(u);

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => ssSave(MEM), 400);
}

export function isImageLoaded(url) {
  return MEM.has(url);
}

export function markImageLoaded(url) {
  if (!url) return;
  if (!MEM.has(url)) {
    MEM.add(url);
    scheduleSave();
  }
}
