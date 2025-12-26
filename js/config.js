export const CONFIG = {
  BASE_URL: "https://media.wizaya.online",
  API_KEY: "906f805ea8444afa9001156715149885",
  USERNAME: "",
  PASSWORD: "",
  USER_ID: "3d85e2b653b2492babbf2336cde2b834",
  CLIENT: {
    name: "JellyMeta",
    device: "Web",
    deviceId: localStorage.getItem("jm_device_id") || crypto.randomUUID(),
    version: "1.0.0"
  }
};

localStorage.setItem("jm_device_id", CONFIG.CLIENT.deviceId);

export const PAGE_SIZE = 20;
export const SS_PREFIX = "jm_viewstate_v2:";
export const SS_TARGET_MAX_CHARS = 4_000_000;
