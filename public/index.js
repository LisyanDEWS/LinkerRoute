"use strict";

const SERVER_A_URL = 'https://web.telegram.org/a/';
let connection = null;
let scramjetInstance = null;
let activeFrameObj = null;
let isInitialized = false;

/**
 * Robustly initialize Scramjet and BareMux for localhost / production
 */
async function initProxyEngine() {
    if (isInitialized) return scramjetInstance;

    try {
        // 1. Register Service Worker first and await full activation
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

        // 2. Initialize BareMux connection & transport
        connection = new BareMux.BareMuxConnection("/baremux/worker.js");
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const host = location.host || "localhost:3000";
        const wispUrl = `${protocol}//${host}/wisp/`;

        await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
        console.log('[Telegram Launcher] Transport set with endpoint:', wispUrl);

        // 3. Initialize Scramjet controller with complete bundle & config
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

            // Initialize DB configuration
            if (typeof scramjetInstance.init === 'function') {
                try {
                    await scramjetInstance.init();
                } catch (e) {
                    console.warn('[Telegram Launcher] scramjetInstance.init notice:', e);
                }
            }
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
            // Using Scramjet frame controller
            activeFrameObj = scram.createFrame();
            const frame = activeFrameObj.frame;
            frame.id = 'telegram-fullscreen-frame';
            frame.style.cssText = "position: fixed; inset: 0; width: 100vw; height: 100vh; border: none; z-index: 10; margin: 0; padding: 0; background: #000000;";
            
            frame.setAttribute('allow', 'camera; microphone; display-capture; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen');
            frame.setAttribute('allowfullscreen', 'true');

            frame.addEventListener('load', () => {
                console.log('[Telegram Launcher] Telegram Web frame loaded');
                if (loadingOverlay) loadingOverlay.classList.remove('visible');
            });

            viewport.appendChild(frame);
            activeFrameObj.go(SERVER_A_URL);
        } else {
            // Fallback direct URL encoded proxy frame if controller loader is in bundle mode
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

        // Fallback: hide loading overlay
        setTimeout(() => {
            if (loadingOverlay) {
                loadingOverlay.classList.remove('visible');
            }
        }, 3500);

    } catch (error) {
        console.error('[Telegram Launcher] Launch error:', error);
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
        if (loadingOverlay) loadingOverlay.classList.remove('visible');
    }, 1800);
};

// Launch immediately
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', launchServerA);
} else {
    launchServerA();
}
