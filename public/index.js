"use strict";

// Initialize Scramjet controller
const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
    prefix: '/scramjet/',
    files: {
        wasm: "/scram/scramjet.wasm.wasm",
        all: "/scram/scramjet.all.js",
        sync: "/scram/scramjet.sync.js",
    }
});

scramjet.init();

const SERVER_A_URL = 'https://web.telegram.org/a/';
let connection = null;
let activeFrameObj = null;

/**
 * Register Service Worker for proxy interception
 */
async function registerSW() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            console.log('[Telegram Launcher] SW registered');
        } catch (err) {
            console.warn('[Telegram Launcher] SW registration failed:', err);
        }
    }
}

/**
 * Initialize BareMux Transport
 */
async function initBareMux() {
    try {
        await registerSW();
        connection = new BareMux.BareMuxConnection("/baremux/worker.js");
        const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
        await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
        console.log('[Telegram Launcher] BareMux transport initialized with wisp endpoint:', wispUrl);
    } catch (err) {
        console.error("[Telegram Launcher] BareMux setup error:", err);
    }
}

/**
 * Launch full screen Telegram Web Server A immediately
 */
async function launchServerA() {
    const loadingOverlay = document.getElementById('loading-overlay');
    const viewport = document.getElementById('viewport');

    try {
        await initBareMux();

        // Clear any previous frame
        viewport.innerHTML = '';

        // Create Scramjet Frame
        activeFrameObj = scramjet.createFrame();
        const frame = activeFrameObj.frame;
        frame.id = 'telegram-fullscreen-frame';
        frame.style.cssText = "position: fixed; inset: 0; width: 100vw; height: 100vh; border: none; z-index: 10; margin: 0; padding: 0; background: #000000;";
        
        // Grant full permissions for messaging, calls, media, and clipboard
        frame.setAttribute('allow', 'camera; microphone; display-capture; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen');
        frame.setAttribute('allowfullscreen', 'true');

        frame.addEventListener('load', () => {
            console.log('[Telegram Launcher] Server A frame loaded');
            if (loadingOverlay) {
                loadingOverlay.classList.remove('visible');
            }
        });

        viewport.appendChild(frame);

        // Navigate directly to Server A (Telegram Web A)
        activeFrameObj.go(SERVER_A_URL);

        // Fallback: hide loading overlay
        setTimeout(() => {
            if (loadingOverlay) {
                loadingOverlay.classList.remove('visible');
            }
        }, 3000);

    } catch (error) {
        console.error('[Telegram Launcher] Launch failed:', error);
        if (loadingOverlay) {
            const detailEl = loadingOverlay.querySelector('.loading-detail');
            if (detailEl) detailEl.innerText = 'Connection error. Retrying...';
        }
        setTimeout(launchServerA, 2000);
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
    if (activeFrameObj) {
        activeFrameObj.go(SERVER_A_URL);
    } else {
        launchServerA();
    }
    setTimeout(() => {
        if (loadingOverlay) loadingOverlay.classList.remove('visible');
    }, 1800);
};

// Launch immediately when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    launchServerA();
});
