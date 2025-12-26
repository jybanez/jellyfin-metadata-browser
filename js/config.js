export const CONFIG = {
  BASE_URL: "",
  API_KEY: "",
  USERNAME: "",
  PASSWORD: "",
  USER_ID: "",
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
