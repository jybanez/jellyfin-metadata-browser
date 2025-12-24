import { CONFIG, PAGE_SIZE } from "./config.js";
import { state } from "./state.js";

function getTokenForHeaders() {
  const k = (CONFIG.API_KEY || "").trim();
  if (k) return k;
  return (state.token || "").trim();
}

function authHeader() {
  const token = getTokenForHeaders();
  return token ? { "X-Emby-Token": token } : {};
}

function embyAuthorizationHeader() {
  const c = CONFIG.CLIENT;
  const token = getTokenForHeaders();

  const value =
    `MediaBrowser ` +
    `Client="${c.name}", ` +
    `Device="${c.device}", ` +
    `DeviceId="${c.deviceId}", ` +
    `Version="${c.version}"` +
    (token ? `, Token="${encodeURIComponent(token)}"` : "");

  return {
    "X-Emby-Authorization": value,
    "Authorization": value,
  };
}

export async function jfFetch(path, { method="GET", body=null, headers={} } = {}) {
  const url = CONFIG.BASE_URL.replace(/\/+$/,"") + path;
  const h = {
    "Accept": "application/json",
    ...(body ? {"Content-Type":"application/json"} : {}),
    ...embyAuthorizationHeader(),
    ...authHeader(),
    ...headers
  };

  const res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : null });
  if (!res.ok) {
    const text = await res.text().catch(()=> "");
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${url}\n${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.blob();
}

export function imgUrl(itemId, type="Primary", {maxHeight=420, maxWidth=0} = {}) {
  const base = CONFIG.BASE_URL.replace(/\/+$/,"");
  const params = new URLSearchParams();
  if (maxHeight) params.set("maxHeight", String(maxHeight));
  if (maxWidth) params.set("maxWidth", String(maxWidth));
  const token = getTokenForHeaders();
  if (token) params.set("api_key", token);
  return `${base}/Items/${itemId}/Images/${type}?${params.toString()}`;
}

export async function loginIfNeeded() {
  if ((CONFIG.API_KEY || "").trim()) return;
  if (state.token) return;
  if (!CONFIG.USERNAME || !CONFIG.PASSWORD) throw new Error("No API_KEY or USERNAME/PASSWORD provided in CONFIG.");

  const data = await jfFetch("/Users/AuthenticateByName", {
    method: "POST",
    body: { Username: CONFIG.USERNAME, Pw: CONFIG.PASSWORD },
  });

  if (!data?.AccessToken || !data?.User?.Id) throw new Error("Login response missing token or user id.");
  state.token = data.AccessToken;
  state.userId = data.User.Id;
  localStorage.setItem("jm_token", state.token);
  localStorage.setItem("jm_user_id", state.userId);
}

export async function ensureUserId() {
  if ((CONFIG.USER_ID || "").trim()) {
    state.userId = CONFIG.USER_ID.trim();
    localStorage.setItem("jm_user_id", state.userId);
    return;
  }
  if (state.userId) return;

  try {
    const me = await jfFetch("/Users/Me");
    if (me?.Id) {
      state.userId = me.Id;
      localStorage.setItem("jm_user_id", state.userId);
      return;
    }
  } catch (_) {}

  const users = await jfFetch("/Users");
  if (!Array.isArray(users) || users.length === 0) throw new Error("Could not resolve a UserId. Set CONFIG.USER_ID.");
  const picked = users.find(u => u?.Policy?.IsDisabled === false) || users[0];
  if (!picked?.Id) throw new Error("User list did not contain an Id. Set CONFIG.USER_ID manually.");
  state.userId = picked.Id;
  localStorage.setItem("jm_user_id", state.userId);
}

export async function getViews() {
  const key = "views";
  if (state.cache.has(key)) return state.cache.get(key);
  const data = await jfFetch(`/Users/${state.userId}/Views`);
  const items = data?.Items || [];
  state.cache.set(key, items);
  return items;
}

export async function fetchItemsByIds(ids) {
  if (!ids?.length) return [];
  const fields = ["PrimaryImageAspectRatio","ProductionYear","RunTimeTicks","ImageBlurHashes"].join(",");
  const qs = new URLSearchParams();
  qs.set("Ids", ids.join(","));
  qs.set("Fields", fields);
  const data = await jfFetch(`/Users/${state.userId}/Items?${qs.toString()}`);
  return data?.Items || [];
}

export async function fetchItemsInViewPage(viewId, startIndex, limit, searchTerm = "") {
  const fields = [
    "PrimaryImageAspectRatio","Overview","Genres","CommunityRating","CriticRating",
    "OfficialRating","PremiereDate","ProductionYear","RunTimeTicks","People",
    "Studios","Taglines","Tags","ProviderIds",
    "ImageBlurHashes"
  ].join(",");

  const view = state.views.find(v => v.Id === viewId);
  const viewCollectionType = (view?.CollectionType || "").toLowerCase();

  let includeTypes = ["Movie","Series","BoxSet"];
  let recursive = true;

  if (viewCollectionType === "boxsets") {
    includeTypes = ["BoxSet"];
    recursive = true;
  }

  const qs = new URLSearchParams();
  qs.set("ParentId", viewId);
  qs.set("Recursive", recursive ? "true" : "false");
  qs.set("IncludeItemTypes", includeTypes.join(","));
  qs.set("Fields", fields);
  qs.set("SortBy", "SortName,ProductionYear");
  qs.set("SortOrder", "Ascending");
  qs.set("StartIndex", String(startIndex));
  qs.set("Limit", String(limit));
  qs.set("EnableTotalRecordCount", "true");
  if (searchTerm && searchTerm.trim()) qs.set("SearchTerm", searchTerm.trim());

  let data = await jfFetch(`/Users/${state.userId}/Items?${qs.toString()}`);

  if (viewCollectionType === "boxsets" && startIndex === 0 && (data?.Items?.length || 0) === 0) {
    const qs2 = new URLSearchParams();
    qs2.set("Recursive", "true");
    qs2.set("IncludeItemTypes", "BoxSet");
    qs2.set("Fields", fields);
    qs2.set("SortBy", "SortName,ProductionYear");
    qs2.set("SortOrder", "Ascending");
    qs2.set("StartIndex", String(startIndex));
    qs2.set("Limit", String(limit));
    qs2.set("EnableTotalRecordCount", "true");
    if (searchTerm && searchTerm.trim()) qs2.set("SearchTerm", searchTerm.trim());
    data = await jfFetch(`/Users/${state.userId}/Items?${qs2.toString()}`);
  }

  return {
    items: data?.Items || [],
    total: data?.TotalRecordCount ?? 0
  };
}

export async function getItem(itemId) {
  const key = `item:${itemId}`;
  if (state.cache.has(key)) return state.cache.get(key);

  // Added ImageTags + BackdropImageTags so we can detect missing Primary/Backdrop and choose fallbacks.
  const fields = [
    "PrimaryImageAspectRatio","Overview","Genres","CommunityRating","CriticRating",
    "OfficialRating","PremiereDate","ProductionYear","RunTimeTicks","People",
    "Studios","Taglines","Tags","ProviderIds","RemoteTrailers","LocalTrailerCount",
    "ImageBlurHashes",
    "ImageTags","BackdropImageTags"
  ].join(",");

  const data = await jfFetch(`/Users/${state.userId}/Items/${encodeURIComponent(itemId)}?Fields=${encodeURIComponent(fields)}`);
  state.cache.set(key, data);
  return data;
}

export async function getBoxSetChildren(boxSetId) {
  const key = `boxset:${boxSetId}:children`;
  if (state.cache.has(key)) return state.cache.get(key);

  const fields = ["PrimaryImageAspectRatio","ProductionYear","RunTimeTicks","ImageBlurHashes"].join(",");
  const qs = new URLSearchParams();
  qs.set("ParentId", boxSetId);
  qs.set("Recursive", "true");
  qs.set("Fields", fields);
  qs.set("SortBy", "SortName,ProductionYear");
  qs.set("SortOrder", "Ascending");
  qs.set("Limit", "2000");

  const data = await jfFetch(`/Users/${state.userId}/Items?${qs.toString()}`);
  const items = data?.Items || [];
  state.cache.set(key, items);
  return items;
}

export async function getSeriesSeasons(seriesId) {
  const key = `series:${seriesId}:seasons`;
  if (state.cache.has(key)) return state.cache.get(key);

  const fields = ["PrimaryImageAspectRatio","ImageBlurHashes","ChildCount","RecursiveItemCount"].join(",");
  const data = await jfFetch(
    `/Shows/${encodeURIComponent(seriesId)}/Seasons` +
    `?UserId=${encodeURIComponent(state.userId)}` +
    `&Fields=${encodeURIComponent(fields)}`
  );

  const items = data?.Items || [];
  state.cache.set(key, items);
  return items;
}

export async function getSeasonEpisodes(seriesId, seasonId) {
  const key = `season:${seasonId}:episodes`;
  if (state.cache.has(key)) return state.cache.get(key);

  const fields = ["PrimaryImageAspectRatio","RunTimeTicks","ImageBlurHashes"].join(",");
  const data = await jfFetch(
    `/Shows/${encodeURIComponent(seriesId)}/Episodes` +
    `?UserId=${encodeURIComponent(state.userId)}` +
    `&SeasonId=${encodeURIComponent(seasonId)}` +
    `&Fields=${encodeURIComponent(fields)}` +
    `&Limit=2000`
  );

  const items = data?.Items || [];
  state.cache.set(key, items);
  return items;
}
