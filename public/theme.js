"use strict";

/**
 * theme.js — LinkerRu M3 Expressive theme bridge for the Scramjet proxy.
 *
 * The proxy runs inside an iframe in SpaceProxyApp. The parent app broadcasts
 * `{ type: 'LINKER_CONFIG', theme, palette, ... }` via postMessage. This script
 * listens for that message and applies the same CSS variables that App.tsx
 * sets on its own :root, so the proxy UI matches the active theme + palette.
 *
 * If no message is received (standalone access), it falls back to a dark
 * monochrome default that matches the main app's default palette.
 */

const DEFAULT_PALETTE = {
  id: 'monochrome',
  nameRu: 'Монохром',
  nameEn: 'Monochrome',
  primary: '#6b6b70',
  secondary: '#8b8b90',
  tertiary: '#a0a0a5',
  lightBg: '#f4f4f5',
  darkBg: '#0e0e11',
};

const DEFAULT_THEME = 'dark';

/** Apply the full M3 token set to :root, mirroring App.tsx lines 668-744. */
function applyTheme(theme, palette) {
  const root = document.documentElement;
  const p = palette || DEFAULT_PALETTE;
  const t = theme || DEFAULT_THEME;

  root.setAttribute('data-theme', t);

  // Accent
  root.style.setProperty('--accent', p.primary);
  root.style.setProperty('--on-accent', '#ffffff');
  root.style.setProperty('--accent-secondary', p.secondary);
  root.style.setProperty('--accent-tertiary', p.tertiary);

  if (t === 'dark') {
    // BASE
    root.style.setProperty('--bg', '#08080a');
    root.style.setProperty('--surface-dim', '#0e0e11');
    // SURFACES
    root.style.setProperty('--surface', '#151518');
    root.style.setProperty('--surface-bright', '#1e1e22');
    root.style.setProperty('--container', '#1a1a1e');
    root.style.setProperty('--container-high', '#26262c');
    root.style.setProperty('--card-bg', `color-mix(in srgb, #151518 78%, ${p.primary} 22%)`);
    root.style.setProperty('--panel-bg', `color-mix(in srgb, #151518 86%, ${p.primary} 14%)`);
    // CONTENT
    root.style.setProperty('--on-surface', '#fafafa');
    root.style.setProperty('--on-surface-var', '#b4b4c0');
    root.style.setProperty('--outline', '#34343a');
    root.style.setProperty('--outline-var', '#44444c');
    root.style.setProperty('--icon-tint', `color-mix(in srgb, #151518 60%, ${p.primary} 40%)`);
    // ELEVATION
    root.style.setProperty('--shadow-1', '0 1px 2px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.35)');
    root.style.setProperty('--shadow-2', '0 6px 16px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.35)');
    root.style.setProperty('--shadow-3', '0 16px 40px rgba(0,0,0,0.6), 0 6px 12px rgba(0,0,0,0.4)');
  } else {
    // BASE
    root.style.setProperty('--bg', '#fafafa');
    root.style.setProperty('--surface-dim', '#f4f4f5');
    // SURFACES
    root.style.setProperty('--surface', '#ffffff');
    root.style.setProperty('--surface-bright', '#ffffff');
    root.style.setProperty('--container', '#f4f4f5');
    root.style.setProperty('--container-high', '#e4e4e7');
    root.style.setProperty('--card-bg', `color-mix(in srgb, #ffffff 70%, ${p.primary} 30%)`);
    root.style.setProperty('--panel-bg', `color-mix(in srgb, #ffffff 80%, ${p.primary} 20%)`);
    // CONTENT
    root.style.setProperty('--on-surface', '#09090b');
    root.style.setProperty('--on-surface-var', '#52525b');
    root.style.setProperty('--outline', '#d4d4d8');
    root.style.setProperty('--outline-var', '#e4e4e7');
    root.style.setProperty('--icon-tint', `color-mix(in srgb, #ffffff 70%, ${p.primary} 30%)`);
    // ELEVATION
    root.style.setProperty('--shadow-1', '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)');
    root.style.setProperty('--shadow-2', '0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)');
    root.style.setProperty('--shadow-3', '0 12px 32px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.05)');
  }

  root.style.backgroundColor = t === 'dark' ? '#09090b' : '#fafafa';
  root.style.color = t === 'dark' ? '#fafafa' : '#09090b';
}

// Apply default theme immediately so there's no flash before the parent message arrives.
applyTheme(DEFAULT_THEME, DEFAULT_PALETTE);

// ── Theme source priority ──
// 1. URL query params (when opened via about:blank popup with ?theme=...&primary=...)
// 2. postMessage from parent iframe (LINKER_CONFIG / LINKER_CONFIG_RESPONSE)
// 3. localStorage fallback (last received theme, for direct browser access)
// 4. DEFAULT_THEME / DEFAULT_PALETTE

const STORAGE_KEY = 'linkerru_proxy_theme';

/** Save the last received theme config so direct browser access can use it. */
function saveTheme(theme, palette) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, palette }));
  } catch (e) { /* ignore */ }
}

/** Load saved theme from localStorage (for direct browser access). */
function loadSavedTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.theme && parsed.palette) return parsed;
    }
  } catch (e) { /* ignore */ }
  return null;
}

/** Read theme from URL query params (passed by about:blank popup). */
function readThemeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('theme');
  const primary = params.get('primary');
  if (t && primary) {
    return {
      theme: t,
      palette: {
        id: 'url',
        nameRu: 'URL',
        nameEn: 'URL',
        primary: primary,
        secondary: params.get('secondary') || primary,
        tertiary: params.get('tertiary') || primary,
        lightBg: '',
        darkBg: '',
      },
    };
  }
  return null;
}

// Try URL params first (about:blank popup case)
const urlTheme = readThemeFromUrl();
if (urlTheme) {
  applyTheme(urlTheme.theme, urlTheme.palette);
  saveTheme(urlTheme.theme, urlTheme.palette);
} else {
  // Try localStorage fallback (direct browser access)
  const saved = loadSavedTheme();
  if (saved) applyTheme(saved.theme, saved.palette);
}

// Listen for theme updates from the parent LinkerRu app.
window.addEventListener('message', (event) => {
  const data = event.data;
  if (data && (data.type === 'LINKER_CONFIG' || data.type === 'LINKER_CONFIG_RESPONSE')) {
    applyTheme(data.theme, data.palette);
    saveTheme(data.theme, data.palette);
  }
});

// Also listen for the custom event (in case the proxy is opened in the same window).
window.addEventListener('linker-theme-change', (event) => {
  const detail = event.detail;
  if (detail && detail.type === 'LINKER_CONFIG') {
    applyTheme(detail.theme, detail.palette);
    saveTheme(detail.theme, detail.palette);
  }
});

// Request the current theme from the parent app on load.
// The parent's useEffect only fires on theme *change*, so without this
// request the proxy would stay on the default theme until the user
// changes the theme in settings.
function requestTheme() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'LINKER_CONFIG_REQUEST' }, '*');
    }
  } catch (e) { /* cross-origin, ignore */ }
}

requestTheme();
// Retry once after a delay in case the parent wasn't ready yet.
setTimeout(requestTheme, 500);

