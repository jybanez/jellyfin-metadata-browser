# Jellyfin Metadata Browser

A **fast, TV-friendly, read-only web interface** for browsing Jellyfin libraries using the Jellyfin API.  
This project focuses on **metadata presentation only** — no media playback — making it ideal for kiosks, TVs, dashboards, or external catalog browsing.

**Version:** 1.0.0  
**Status:** Stable

---

## ✨ Features

### 📚 Library Browsing
- Movies, TV Shows, Box Sets, Seasons, Episodes
- Dynamic navigation based on Jellyfin libraries
- Infinite scrolling with **background prefetch** (no loading stalls)

### 🎮 Keyboard & TV-Remote Navigation
- Full arrow-key navigation (Up / Down / Left / Right)
- Enter / Select to open items
- Escape / Back to return
- Works across:
  - Main navigation
  - Library grids
  - Seasons
  - Episodes
  - Collection movie rails

### 🔤 Quick Jump (A–Z / 0–9)
- Type letters or numbers to instantly jump to titles
- Works in large libraries (thousands of items)
- Netflix-style UX
- Visual overlay feedback

### 🖼️ Image Handling
- BlurHash placeholders for smooth image loading
- Automatically skipped for already-loaded images
- Proper layering (does not interfere with transparent logos)
- Smart fallback between Logo / Primary / Backdrop

### 🧠 Smart State Handling
- Preserves scroll position and focus per library
- Browser Back button supported
- Keyboard Back / Escape supported
- No unnecessary reloading

### 📺 TV & Large-Screen Friendly
- Responsive layouts for widescreen displays
- Optimized spacing for 10-foot UI
- Clean, minimal visual design

---

## 🚫 What This Is *Not*

- ❌ No video or audio playback
- ❌ No user management
- ❌ No write operations to Jellyfin

This is a **read-only metadata browser** by design.

---

## 🛠️ Tech Stack

- Vanilla **HTML / CSS / JavaScript**
- Jellyfin REST API
- No frameworks
- No build step
- No backend required

Runs entirely in the browser.

---

## Demo Site : https://jybanez.github.io/jellyfin-metadata-browser

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/jybanez/jellyfin-metadata-browser.git
cd jellyfin-metadata-browser
```

### 2. Configure Jellyfin connection

Edit your configuration (usually in `config.js` or `index.html`):

```js
const CONFIG = {
  BASE_URL: "https://your-jellyfin-server",
  API_KEY: "YOUR_API_KEY",
  USER_ID: "DEFAULT_USER_ID" <optional>
};
```

> 🔑 The API key must belong to a Jellyfin user with access to the desired libraries.

### 3. Serve the files
Because this uses ES modules, serve via HTTP:

```bash
# Python
python -m http.server 8080

# or Node
npx serve
```

Then open:
```
http://localhost:8080
```

---

## 📂 Project Structure (Simplified)

```
/
├── index.html        # App shell
├── styles.css        # Themes and layout
├── main.js           # App bootstrap / router
├── views.js          # Rendering logic
├── navkeys.js        # Keyboard & TV navigation
├── api.js            # Jellyfin API layer
├── state.js          # Shared application state
└── utils.js          # Helpers (formatting, blurhash, etc.)
```

---

## 🧪 Tested With

- Jellyfin 10.9+
- Chrome / Edge
- Android TV browser
- Desktop + keyboard
- TV remote / D-pad style input

---

## 📌 Versioning

This project follows **Semantic Versioning**:

- **1.0.0** – First stable public release  
  - Feature complete
  - Keyboard/TV navigation solid
  - Background prefetch implemented

---

## 📄 License

MIT License  
You are free to use, modify, and distribute this project.

---

## 🙌 Acknowledgements

- Jellyfin Project & Community
- BlurHash specification
- Inspiration from modern streaming UIs

---

## 💡 Roadmap Ideas

- Continue Watching / Recently Added rails
- Alphabet side index (TV-style)
- Theme switcher
- IndexedDB metadata cache
- Artwork color sampling for dynamic theming

---

## 🧑‍💻 Author

Created and maintained by **Jonathan Ybanez**

If you find this useful or build something on top of it, a star ⭐ on GitHub is appreciated.
