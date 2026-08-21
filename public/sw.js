importScripts("/scram/scramjet.all.js");

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const injectCode = `<script>
(function() {
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
})();
</script>`;

let configLoaded = false;
async function safeLoadConfig() {
    try {
        await scramjet.loadConfig();
        configLoaded = true;
    } catch (e) {
        // Fallback gracefully if IndexedDB object store is not yet initialized
        console.warn("[SW] scramjet.loadConfig deferred:", e);
    }
}

async function handleRequest(event) {
    if (!configLoaded) {
        await safeLoadConfig();
    }

    try {
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
    } catch (err) {
        console.warn("[SW] Routing error:", err);
    }
    
    return fetch(event.request);
}

self.addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
