const SERVER_A_URL = 'https://web.telegram.org/a/';
let scramjetInstance = null;
let activeFrame = null;

function isTrustworthyOrigin() {
    const host = location.hostname;
    return location.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1';
}

async function initProxy() {
    if (!isTrustworthyOrigin()) throw new Error("Service Worker requires HTTPS, localhost, or 127.0.0.1");
    
    if (typeof $scramjetLoadController === 'function') {
        const { ScramjetController } = $scramjetLoadController();
        scramjetInstance = new ScramjetController({
            prefix: '/scramjet/',
            files: { wasm: "/scram/scramjet.wasm.wasm", all: "/scram/scramjet.all.js" }
        });
        await scramjetInstance.init();
    }
    
    if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
    }
    
    if (typeof BareMux !== 'undefined') {
        const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        await connection.setTransport("/libcurl/index.mjs", [{ wisp: `${protocol}//${location.host}/wisp/` }]);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function launch() {
    const viewport = document.getElementById('viewport');
    const loading = document.getElementById('loading');
    
    try {
        await initProxy();
        
        if (scramjetInstance && typeof scramjetInstance.createFrame === 'function') {
            activeFrame = scramjetInstance.createFrame();
            const frame = activeFrame.frame;
            frame.style.cssText = "position: fixed; inset: 0; width: 100%; height: 100%; border: none; margin: 0; padding: 0;";
            frame.setAttribute('allow', 'camera; microphone; display-capture; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen');
            viewport.appendChild(frame);
            activeFrame.go(SERVER_A_URL);
        }
        
        loading.classList.add('hidden');
    } catch (error) {
        console.error("Error:", error);
        setTimeout(launch, 1000);
    }
}

window.addEventListener('DOMContentLoaded', launch);
