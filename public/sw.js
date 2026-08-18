importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const injectCode = `<script>
(function() {
    const getFaviconUrl = () => {
        // Collect all favicon <link> elements and pick the highest-resolution one.
        // Sites like Telegram declare multiple sizes (16x16, 32x32, 192x192) —
        // without checking sizes we'd grab the first (lowest quality) one.
        const links = document.querySelectorAll(
            'link[rel="icon"], link[rel="shortcut icon"], ' +
            'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
        );
        let best = null;
        let bestSize = 0;
        for (const link of links) {
            if (!link.href) continue;
            let size = 0;
            if (link.sizes && link.sizes.length > 0) {
                // Parse sizes like "16x16", "192x192", "any"
                for (const s of link.sizes) {
                    if (s === 'any') { size = 999; break; }
                    const m = s.match(/^(\\d+)x\\d+$/);
                    if (m) size = Math.max(size, parseInt(m[1], 10));
                }
            }
            // apple-touch-icon is typically 180x180 — give it a boost if no sizes attr
            if (size === 0 && /apple-touch-icon/.test(link.rel)) size = 180;
            if (size > bestSize) { bestSize = size; best = link.href; }
            // If no size info yet, take the first one as a fallback
            if (!best) { best = link.href; }
        }
        return best;
    };

    // Fetch the favicon and convert to a data URL so the parent can use it
    // without COEP issues or needing the SW to route out-of-iframe requests.
    // The fetch must go through the scramjet proxy prefix (/scramjet/) so the
    // SW intercepts it and adds CORP headers — otherwise COEP blocks the
    // cross-origin response.
    let lastFaviconUrl = null;
    const fetchFaviconAsDataUrl = async (url) => {
        if (!url || url === lastFaviconUrl) return;
        lastFaviconUrl = url;
        try {
            // Wrap the URL through the scramjet proxy prefix.
            // Use $scramjet$wrap if available, otherwise construct manually.
            let fetchUrl = url;
            if (typeof $scramjet$wrap === 'function') {
                fetchUrl = $scramjet$wrap(url);
            } else if (!url.includes('/scramjet/')) {
                fetchUrl = '/scramjet/' + encodeURIComponent(url);
            }
            const res = await fetch(fetchUrl);
            if (!res.ok) return null;
            const blob = await res.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch (e) { return null; }
    };

    const notifyParent = (faviconData) => {
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'LINKERR_SYNC',
                title: document.title || window.location.hostname,
                url: window.location.href,
                favicon: faviconData || null
            }, '*');
        }
    };

    const syncWithFavicon = async () => {
        const favUrl = getFaviconUrl();
        if (favUrl) {
            const dataUrl = await fetchFaviconAsDataUrl(favUrl);
            notifyParent(dataUrl);
        } else {
            notifyParent(null);
        }
    };

    const spoofTheme = () => {
        if (window.matchMedia) {
            window.matchMedia = (query) => ({
                matches: query === '(prefers-color-scheme: dark)',
                media: query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => true
            });
        }
        if (document.documentElement) document.documentElement.style.colorScheme = 'dark';
    };

    spoofTheme();
    // Send initial sync immediately (without favicon, to update title/url fast)
    notifyParent(null);
    // Then fetch favicon and send a second sync with the data URL
    syncWithFavicon();

    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        setTimeout(syncWithFavicon, 150);
    };

    window.addEventListener('load', syncWithFavicon);
    window.addEventListener('popstate', syncWithFavicon);

    const titleTag = document.querySelector('title');
    if (titleTag) new MutationObserver(() => notifyParent(null)).observe(titleTag, { childList: true, characterData: true });

    // Re-check favicon after load (links may be added dynamically)
    window.addEventListener('load', () => setTimeout(syncWithFavicon, 500));
})();
</script>`;

async function handleRequest(event) {
    await scramjet.loadConfig();

    if (scramjet.route(event)) {
        try {
            const response = await scramjet.fetch(event);
            const contentType = response.headers.get("content-type") || "";
            const newHeaders = new Headers(response.headers);
            
            newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
            newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
            newHeaders.delete("content-security-policy");

            if (contentType.includes("text/html")) {
                let body = await response.text();
                const headMatch = body.match(/<head[^>]*>/i);
                body = headMatch 
                    ? body.replace(headMatch[0], headMatch[0] + injectCode)
                    : body.replace(/<html[^>]*>/i, (m) => m + injectCode);
                
                newHeaders.delete("content-length");
                return new Response(body, { status: response.status, headers: newHeaders });
            }

            return new Response(response.body, { status: response.status, headers: newHeaders });

        } catch (err) {
            const fallRes = await fetch(event.request.clone());
            const fallHeaders = new Headers(fallRes.headers);
            fallHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
            fallHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
            fallHeaders.delete("content-security-policy");
            
            return new Response(fallRes.body, { status: fallRes.status, headers: fallHeaders });
        }
    }
    
    return fetch(event.request);
}

self.addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));