"use strict";

const SERVER_A_URL = 'https://web.telegram.org/a/';
let connection = null;
let scramjetInstance = null;
let activeFrameObj = null;
let isInitialized = false;

/**
 * Check if current origin is secure for Service Worker execution
 */
function isTrustworthyOrigin() {
    const host = location.hostname;
    return (
        location.protocol === 'https:' ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.localhost') ||
        window.isSecureContext === true
    );
}

/**
 * Display origin warning if accessed over insecure custom domain like http://zaj-server:3000
 */
function showUntrustedOriginNotice() {
    const warningEl = document.getElementById('untrusted-origin-warning');
    const spinner = document.getElementById('spinner-container');
    const titleEl = document.getElementById('loading-title');
    const detailEl = document.getElementById('loading-detail');

    if (spinner) spinner.style.display = 'none';
    if (titleEl) titleEl.innerText = 'Service Worker Restricted by Browser';
    if (detailEl) detailEl.innerText = `Current address: ${location.origin}`;

    if (warningEl) {
        warningEl.style.display = 'block';
        warningEl.innerHTML = `
            <div class="warning-card">
                <div class="warning-title">
                    <span class="material-symbols-rounded" style="font-size:18px;">warning</span>
                    Untrusted HTTP Origin Detected
                </div>
                <div class="warning-text">
                    Web browsers strictly restrict <strong>Service Workers</strong> on custom hostnames (<code>${location.hostname}</code>) without HTTPS.
                    <br><br>
                    To use the proxy, please access via <strong>localhost</strong> or enable HTTPS:
                </div>
                <a class="action-link" href="http://localhost:${location.port || '3000'}">Open http://localhost:${location.port || '3000'}</a>
            </div>
        `;
    }
}

/**
 * Robustly initialize Scramjet and BareMux
 */
async function initProxyEngine() {
    if (isInitialized) return scramjetInstance;

    if (!isTrustworthyOrigin()) {
        console.warn('[Telegram Launcher] Insecure origin detected:', location.origin);
        showUntrustedOriginNotice();
        throw new Error(`Insecure origin: Browser blocks Service Workers on http://${location.hostname}:${location.port}. Please use http://localhost:${location.port || '3000'} or https://`);
    }

    try {
        // 1. Initialize Scramjet controller first
        if (typeof $scramjetLoadController === 'function') {
            const { ScramjetController } = $scramjetLoadController();
            scramjetInstance = new ScramjetController({
                prefix: '/scramjet/',
                files: {
                    wasm: "/scram/scramjet.wasm.wasm",
                    all: "/scram/scramjet.all.js",
                    sync: "/scram/scramjet.sync.js",
                }
            });

            if (typeof scramjetInstance.init === 'function') {
                try {
                    await scramjetInstance.init();
                } catch (e) {
                    console.warn('[Telegram Launcher] scramjet.init notice:', e);
                }
            }
        }

        // 2. Register Service Worker and await full activation
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            if (reg.installing || reg.waiting) {
                await new Promise((resolve) => {
                    const sw = reg.installing || reg.waiting;
                    if (!sw) return resolve();
                    sw.addEventListener('statechange', () => {
                        if (sw.state === 'activated') resolve();
                    });
                });
            }
            await navigator.serviceWorker.ready;
            console.log('[Telegram Launcher] Service Worker active');
        }

        // 3. Connect BareMux worker
        if (typeof BareMux !== 'undefined' && BareMux.BareMuxConnection) {
            connection = new BareMux.BareMuxConnection("/baremux/worker.js");
            const protocol = location.protocol === "https:" ? "wss:" : "ws:";
            const host = location.host || "localhost:3000";
            const wispUrl = `${protocol}//${host}/wisp/`;

            await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
            console.log('[Telegram Launcher] BareMux connected to:', wispUrl);
        }

        isInitialized = true;
        return scramjetInstance;
    } catch (err) {
        console.error("[Telegram Launcher] Proxy initialization error:", err);
        throw err;
    }
}

/**
 * Launch full screen Telegram Web Server A
 */
async function launchServerA() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const viewport = document.getElementById('viewport');

    try {
        const scram = await initProxyEngine();

        // Clear existing viewport
        viewport.innerHTML = '';

        if (scram && typeof scram.createFrame === 'function') {
            activeFrameObj = scram.createFrame();
            const frame = activeFrameObj.frame;
            frame.id = 'telegram-fullscreen-frame';
            frame.style.cssText = "position: fixed; inset: 0; width: 100vw; height: 100vh; border: none; z-index: 10; margin: 0; padding: 0; background: #000000;";
            
            frame.setAttribute('allow', 'camera; microphone; display-capture; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen');
            frame.setAttribute('allowfullscreen', 'true');

            frame.addEventListener('load', () => {
                console.log('[Telegram Launcher] Telegram Web loaded');
                if (loadingOverlay) loadingOverlay.classList.remove('visible');
            });

            viewport.appendChild(frame);
            activeFrameObj.go(SERVER_A_URL);
        } else {
            const frame = document.createElement('iframe');
            frame.id = 'telegram-fullscreen-frame';
            frame.style.cssText = "position: fixed; inset: 0; width: 100vw; height: 100vh; border: none; z-index: 10; margin: 0; padding: 0; background: #000000;";
            frame.setAttribute('allow', 'camera; microphone; display-capture; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen');
            frame.setAttribute('allowfullscreen', 'true');

            frame.addEventListener('load', () => {
                if (loadingOverlay) loadingOverlay.classList.remove('visible');
            });

            viewport.appendChild(frame);
            frame.src = `/scramjet/${encodeURIComponent(SERVER_A_URL)}`;
        }

        setTimeout(() => {
            if (loadingOverlay && isTrustworthyOrigin()) {
                loadingOverlay.classList.remove('visible');
            }
        }, 3500);

    } catch (error) {
        console.error('[Telegram Launcher] Launch error:', error);
        if (!isTrustworthyOrigin()) {
            showUntrustedOriginNotice();
            return;
        }
        if (loadingOverlay) {
            const detailEl = loadingOverlay.querySelector('.loading-detail');
            if (detailEl) detailEl.innerText = 'Connecting to proxy...';
        }
        setTimeout(launchServerA, 2500);
    }
}

/**
 * Reload active frame
 */
window.reloadActiveFrame = function() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.classList.add('visible');
    }
    if (activeFrameObj && typeof activeFrameObj.go === 'function') {
        activeFrameObj.go(SERVER_A_URL);
    } else {
        launchServerA();
    }
    setTimeout(() => {
        if (loadingOverlay && isTrustworthyOrigin()) {
            loadingOverlay.classList.remove('visible');
        }
    }, 1800);
};

// Launch immediately
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', launchServerA);
} else {
    launchServerA();
}
