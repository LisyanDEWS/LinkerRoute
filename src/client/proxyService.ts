declare global {
  interface Window {
    $scramjetLoadController?: any;
    BareMux?: any;
  }
}

let scramjetInstance: any = null;
let bareMuxConn: any = null;

export function searchUrl(input: string, template = "https://duckduckgo.com/?q=%s"): string {
  if (!input) return "";
  const target = input.trim();
  
  // 1. If user typed full URL (http:// or https://)
  if (/^https?:\/\//i.test(target)) {
    return target;
  }

  // 2. If user typed domain without protocol (e.g. google.com, example.org/path, localhost:3000)
  // Must not contain spaces and must look like a valid hostname with top-level domain or port
  if (!target.includes(' ') && /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(target)) {
    return 'https://' + target;
  }

  // 3. Otherwise treat as a search query with the selected search engine
  return template.replace("%s", encodeURIComponent(target));
}

export function isGoogleRedirect(fromUrl: string, toUrl: string): boolean {
  try {
    const from = new URL(fromUrl);
    const to = new URL(toUrl);
    const isGoogle = (h: string) =>
      h === 'google.com' || h === 'www.google.com' ||
      h.endsWith('.google.com') || h === 'google.ru' || h === 'www.google.ru';
    return isGoogle(from.hostname) && isGoogle(to.hostname);
  } catch (e) {
    return false;
  }
}

export function cleanScramjetUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  let cleanUrl = rawUrl;

  try {
    if (scramjetInstance?.codec?.decode) {
      const codecDecoded = scramjetInstance.codec.decode(rawUrl);
      if (codecDecoded && /^https?:\/\//i.test(codecDecoded) && !codecDecoded.includes('/scramjet/')) {
        return codecDecoded;
      }
    }
  } catch (e) {}

  if (cleanUrl.includes('/scramjet/') || cleanUrl.includes('localhost:')) {
    let decoded = cleanUrl;
    let prev = '';
    let iterations = 0;
    do {
      prev = decoded;
      decoded = decoded.replace(/^https?:\/\/[^/]+\/scramjet\//i, '');
      decoded = decoded.replace(/^https?%3A%2F%2F[^/]+%2Fscramjet%2F/i, '');
      try {
        decoded = decodeURIComponent(decoded);
      } catch (e) {
        break;
      }
      iterations++;
    } while (decoded !== prev && iterations < 15);

    if (/^https?:\/\//i.test(decoded) && !decoded.includes('/scramjet/')) {
      cleanUrl = decoded;
    }
  }
  return cleanUrl;
}

export async function initProxyEngine(): Promise<any> {
  if (scramjetInstance) return scramjetInstance;

  try {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[LinkerRoute] SW registered');
    }

    // Defensive checks for scramjet loader and controller
    if (typeof window.$scramjetLoadController !== 'undefined' && window.$scramjetLoadController) {
      try {
        // The loader might be a function or an object. Support both.
        const loaderResult = (typeof window.$scramjetLoadController === 'function')
          ? window.$scramjetLoadController()
          : window.$scramjetLoadController;

        // loaderResult may be a Promise (async loader). Await if needed.
        const resolved = loaderResult instanceof Promise ? await loaderResult : loaderResult;

        if (resolved && resolved.ScramjetController) {
          const { ScramjetController } = resolved;
          try {
            scramjetInstance = new ScramjetController({
              prefix: '/scramjet/',
              files: {
                wasm: "/scram/scramjet.wasm.wasm",
                all: "/scram/scramjet.all.js",
                sync: "/scram/scramjet.sync.js",
              }
            });

            if (typeof scramjetInstance.init === 'function') {
              // Protect the init call so library internal failures don't crash the app
              try {
                await scramjetInstance.init();
              } catch (initErr) {
                console.error('[LinkerRoute] scramjetInstance.init() failed:', initErr);
                // fallback to null so the rest of the proxy continues working
                scramjetInstance = null;
              }
            } else {
              console.warn('[LinkerRoute] ScramjetController exists but has no init() method');
              scramjetInstance = null;
            }
          } catch (ctorErr) {
            console.error('[LinkerRoute] constructing ScramjetController failed:', ctorErr);
            scramjetInstance = null;
          }
        } else {
          console.warn('[LinkerRoute] $scramjetLoadController resolved but did not provide ScramjetController:', resolved);
        }
      } catch (loaderErr) {
        console.error('[LinkerRoute] Error while invoking $scramjetLoadController():', loaderErr);
      }
    } else {
      console.info('[LinkerRoute] $scramjetLoadController not available in this environment');
    }

    if (window.BareMux) {
      try {
        bareMuxConn = new window.BareMux.BareMuxConnection("/baremux/worker.js");
        const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
        await bareMuxConn.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
        console.log('[LinkerRoute] BareMux transport initialized');
      } catch (bmErr) {
        console.error('[LinkerRoute] BareMux initialization failed:', bmErr);
        bareMuxConn = null;
      }
    }

    return scramjetInstance;
  } catch (err) {
    console.error("[LinkerRoute] Proxy init error:", err);
    return null;
  }
}

export function getScramjetInstance() {
  return scramjetInstance;
}

export async function clearAllBrowsingData(): Promise<string[]> {
  const results: string[] = [];

  // 1. Clear service worker caches
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    results.push(`Caches: cleared ${cacheNames.length} cache(s)`);
  } catch (e) {
    results.push('Caches: failed');
  }

  // 2. Clear IndexedDB databases
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map(db => {
        if (db.name) return new Promise(resolve => {
          const req = indexedDB.deleteDatabase(db.name!);
          req.onsuccess = resolve;
          req.onerror = resolve;
          req.onblocked = resolve;
        });
      }));
      results.push(`IndexedDB: cleared ${dbs.length} database(s)`);
    } else {
      const commonNames = ['scramjet', 'scramjet-cookies', 'bare-mux', 'wisp'];
      for (const name of commonNames) {
        await new Promise(resolve => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = resolve;
          req.onerror = resolve;
          req.onblocked = resolve;
        });
      }
      results.push('IndexedDB: cleared known databases');
    }
  } catch (e) {
    results.push('IndexedDB: failed');
  }

  // 3. Clear cookies for proxy domain
  try {
    document.cookie.split(';').forEach(c => {
      const eq = c.indexOf('=');
      const name = eq > -1 ? c.substr(0, eq).trim() : c.trim();
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
    });
    results.push('Cookies: cleared');
  } catch (e) {
    results.push('Cookies: failed');
  }

  // 4. Clear storage except settings
  try {
    const settingsBackup = localStorage.getItem('linkerru_proxy_settings');
    const themeBackup = localStorage.getItem('linkerru_proxy_theme');
    localStorage.clear();
    if (settingsBackup) localStorage.setItem('linkerru_proxy_settings', settingsBackup);
    if (themeBackup) localStorage.setItem('linkerru_proxy_theme', themeBackup);
    sessionStorage.clear();
    results.push('Storage: cleared');
  } catch (e) {
    results.push('Storage: failed');
  }

  // 5. Unregister service workers
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(reg => reg.unregister()));
    results.push(`Service Worker: unregistered ${regs.length} worker(s)`);
  } catch (e) {
    results.push('Service Worker: failed');
  }

  return results;
}
