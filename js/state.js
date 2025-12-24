import { CONFIG } from "./config.js";

export const state = {
  token: localStorage.getItem("jm_token") || "",
  userId: localStorage.getItem("jm_user_id") || CONFIG.USER_ID || "",
  views: [],
  activeViewId: "",
  activeViewName: "",
  cache: new Map(),
  viewStateCache: new Map(), // full in-memory per view
  viewPaging: {
    items: [],
    startIndex: 0,
    total: 0,
    loading: false,
    done: false,
    sentinelAttached: false,
    observer: null,
    searchTerm: ""
  }
};
