"use strict";

// Initialize Scramjet controller with explicit config
const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
    prefix: '/scramjet/',
    files: {
        wasm: "/scram/scramjet.wasm.wasm",
        all: "/scram/scramjet.all.js",
        sync: "/scram/scramjet.sync.js",
    }
});

const SERVER_A_URL = 'https://web.telegram.org/a/';
let connection = null;
let activeFrameObj = null;
let isInitialized = false;

/**
 * Initialize BareMux and Proxy controller reliably
 */
async function initProxyEngine() {
    if (isInitialized) return;

    try {
        // 1. Initialize Scramjet controller first to ensure IndexedDB and config tables exist
        await scramjet.init();

        // 2. Register Service Worker and wait until ready
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
            console.log('[Telegram Launcher] Service Worker active and ready');
        }

        // 3. Connect BareMux worker
        connection = new BareMux.BareMuxConnection("/baremux/worker.js");
        
        // Derive wisp websocket URL (supports localhost, 127.0.0.1, custom port, https/http)
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const host = location.host || "localhost:3000";
        const wispUrl = `${protocol}//${host}/wisp/`;

        await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
        console.log('[Telegram Launcher] Transport connected to:', wispUrl);

        isInitialized = true;
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
        await initProxyEngine();

        // Clear existing iframe
        viewport.innerHTML = '';

        // Create Scramjet Frame
        activeFrameObj = scramjet.createFrame();
        const frame = activeFrameObj.frame;
        frame.id = 'telegram-fullscreen-frame';
        frame.style.cssText = "position: fixed; inset: 0; width: 100vw; height: 100vh; border: none; z-index: 10; margin: 0; padding: 0; background: #000000;";
        
        // Grant permissions for camera, mic, notifications, clipboard
        frame.setAttribute('allow', 'camera; microphone; display-capture; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen');
        frame.setAttribute('allowfullscreen', 'true');

        frame.addEventListener('load', () => {
            console.log('[Telegram Launcher] Telegram Web loaded');
            if (loadingOverlay) {
                loadingOverlay.classList.remove('visible');
            }
        });

        viewport.appendChild(frame);

        // Navigate to Telegram Web A
        activeFrameObj.go(SERVER_A_URL);

        // Fallback: dismiss loading overlay
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
        // Retry after short delay
        setTimeout(launchServerA, 2000);
    }
}

/**
 * Reload active Telegram frame
 */
window.reloadActiveFrame = function() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.classList.add('visible');
    }
    if (activeFrameObj) {
        activeFrameObj.go(SERVER_A_URL);
    } else {
        launchServerA();
    }
    setTimeout(() => {
        if (loadingOverlay) loadingOverlay.classList.remove('visible');
    }, 1800);
};

// Launch immediately on DOM ready
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', launchServerA);
} else {
    launchServerA();
}
