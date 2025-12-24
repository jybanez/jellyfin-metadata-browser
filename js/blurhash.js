import { escapeHtml } from "./utils.js";
import { isImageLoaded, markImageLoaded } from "./imageCache.js";

const _blurhashChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
const _blurhashDecodeMap = (() => {
  const map = new Int16Array(128).fill(-1);
  for (let i = 0; i < _blurhashChars.length; i++) map[_blurhashChars.charCodeAt(i)] = i;
  return map;
})();

function blurhashDecode83(str, start, end) {
  let value = 0;
  for (let i = start; i < end; i++) value = value * 83 + _blurhashDecodeMap[str.charCodeAt(i)];
  return value;
}
function sRGBToLinear(value) {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearTosRGB(value) {
  const v = Math.max(0, Math.min(1, value));
  return v <= 0.0031308 ? Math.round(v * 12.92 * 255 + 0.5) : Math.round((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5);
}
function signPow(val, exp) { return Math.sign(val) * Math.pow(Math.abs(val), exp); }
function decodeDC(value) {
  const r = value >> 16;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return [sRGBToLinear(r), sRGBToLinear(g), sRGBToLinear(b)];
}
function decodeAC(value, maximumValue) {
  const quantR = Math.floor(value / (19 * 19));
  const quantG = Math.floor(value / 19) % 19;
  const quantB = value % 19;
  const r = signPow((quantR - 9) / 9, 2.0) * maximumValue;
  const g = signPow((quantG - 9) / 9, 2.0) * maximumValue;
  const b = signPow((quantB - 9) / 9, 2.0) * maximumValue;
  return [r, g, b];
}

export function blurhashToDataURL(blurHash, width = 32, height = 32, punch = 1) {
  if (!blurHash || blurHash.length < 6) return null;

  const sizeFlag = blurhashDecode83(blurHash, 0, 1);
  const numY = Math.floor(sizeFlag / 9) + 1;
  const numX = (sizeFlag % 9) + 1;

  const quantMax = blurhashDecode83(blurHash, 1, 2);
  const maximumValue = (quantMax + 1) / 166 * punch;

  const colors = new Array(numX * numY);
  const dcValue = blurhashDecode83(blurHash, 2, 6);
  colors[0] = decodeDC(dcValue);

  let pos = 6;
  for (let i = 1; i < numX * numY; i++, pos += 2) {
    const acValue = blurhashDecode83(blurHash, pos, pos + 2);
    colors[i] = decodeAC(acValue, maximumValue);
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < numY; j++) {
        for (let i = 0; i < numX; i++) {
          const basis =
            Math.cos((Math.PI * x * i) / width) *
            Math.cos((Math.PI * y * j) / height);
          const color = colors[i + j * numX];
          r += color[0] * basis;
          g += color[1] * basis;
          b += color[2] * basis;
        }
      }
      const idx = 4 * (x + y * width);
      pixels[idx] = linearTosRGB(r);
      pixels[idx + 1] = linearTosRGB(g);
      pixels[idx + 2] = linearTosRGB(b);
      pixels[idx + 3] = 255;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

export function getJellyfinBlurHash(item, imageType = "Primary") {
  const hashes = item?.ImageBlurHashes?.[imageType];
  if (hashes) {
    const keys = Object.keys(hashes);
    if (keys.length) return hashes[keys[0]] || null;
  }
  if (imageType === "Primary") return item?.PrimaryBlurHash || null;
  return null;
}

export function renderImgWithBlurhash(item, {
  imageType = "Primary",
  url,
  alt = "",
  wrapStyle = "",
  blurW = 32,
  blurH = 48,
  imgClass = "",
  imgStyle = "",
} = {}) {
  const safeAlt = escapeHtml(alt);

  // If we've already loaded this exact URL before, skip blurhash placeholder.
  if (isImageLoaded(url)) {
    return `
      <span style="position:relative;display:block;${wrapStyle}">
        <img class="${imgClass} loaded" src="${url}" alt="${safeAlt}" loading="lazy"
             style="position:relative;${imgStyle}">
      </span>
    `;
  }

  const bh = getJellyfinBlurHash(item, imageType);
  const blur = bh ? blurhashToDataURL(bh, blurW, blurH, 1) : "";

  // Mark as loaded when the real image finishes.
  const onLoad = `
    this.classList.add('loaded');
    try { window.__jmMarkImageLoaded && window.__jmMarkImageLoaded(this.currentSrc || this.src); } catch(e) {}
  `.trim();

  return `
    <span style="position:relative;display:block;${wrapStyle}">
      ${blur ? `<img src="${blur}" alt="" aria-hidden="true"
                style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(12px);transform:scale(1.08);">` : ``}
      <img class="${imgClass}" src="${url}" alt="${safeAlt}" loading="lazy"
           onload="${escapeHtml(onLoad)}"
           style="position:relative;${imgStyle}">
    </span>
  `;
}

