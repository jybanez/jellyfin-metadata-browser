# Jellyfin Metadata Browser

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Status](https://img.shields.io/badge/status-stable-brightgreen)
![License](https://img.shields.io/badge/license-MIT-black)
![Built%20With](https://img.shields.io/badge/built%20with-vanilla%20JS%20%2B%20HTML%20%2B%20CSS-orange)

A fast, TV-friendly, **read-only** web UI for browsing Jellyfin libraries via the Jellyfin API.  
This project is focused on **presenting metadata** (movies, shows, seasons, episodes, and collections) with a smooth “10‑foot” experience—**no media playback**.

**Version:** 1.0.0

---

## Highlights

- **Library navigation** generated from your Jellyfin server’s libraries
- **Movies / TV Shows / Box Sets / Seasons / Episodes** metadata browsing
- **Infinite scrolling** with **background prefetch** for large libraries
- **Keyboard / TV-remote navigation** (D‑pad arrows + Enter/Select + Back)
- **Quick Jump (A–Z / 0–9)** for fast title lookup in large lists
- **BlurHash image placeholders** for smoother image loading
- **State preservation** (keeps scroll position and focus when moving between sections)
- **Responsive layouts** tuned for widescreen monitors/TVs

---

## What this project does not do

- No video/audio playback
- No Jellyfin admin features
- No write operations (read-only by design)

---

## Requirements

- A Jellyfin server (tested with Jellyfin 10.11.x)
- A Jellyfin API key associated with a user who can access the target libraries

---

## Getting started

### 1) Clone

```bash
git clone https://github.com/jybanez/jellyfin-metadata-browser.git
cd jellyfin-metadata-browser
```

### 2) Configure your Jellyfin server

Edit `js/config.js` and set:

```js
export const CONFIG = {
  BASE_URL: "https://your-jellyfin-server",
  API_KEY: "YOUR_API_KEY",
};
```

> The API key should belong to the Jellyfin user whose library views you want to browse.

### 3) Run locally

Because the app uses ES modules, serve it over HTTP:

```bash
# Python
python -m http.server 8080

# or Node
npx serve
```

Open:

```
http://localhost:8080
```

---

## Project structure

The app is split into a simple static layout plus modular JS:

```
|-- index.html
|-- css
|   |-- styles.css
|-- js
|   |-- api.js
|   |-- blurhash.js
|   |-- breadcrumbs.js
|   |-- config.js
|   |-- imageCache.js
|   |-- main.js
|   |-- navkeys.js
|   |-- router.js
|   |-- state.js
|   |-- storage.js
|   |-- utils.js
|   |-- views.js
```

---

## Deploy

### GitHub Pages (recommended for a static site)
1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set **Source** to the branch you want (e.g., `main`) and `/root`
4. Save, then open the Pages URL provided by GitHub

> If your Jellyfin server is on a different domain, ensure CORS is allowed on your server/proxy configuration.

---

## Tested environments

- Desktop: Chrome / Edge
- TV-style usage: keyboard / D‑pad navigation patterns
- Jellyfin: 10.11.x

---

## License

MIT

---

## Author

Jonathan Ybanez
