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

        // Warmup delay: Gives Cloudflare Tunnels time to fully establish the Wisp WebSocket
        // before libcurl starts sending heavy Telegram traffic.
        await new Promise(resolve => setTimeout(resolve, 800));
    }
}

async function launch(retryCount = 0) {
    const viewport = document.getElementById('viewport');
    const loading = document.getElementById('loading');
    
    try {
        if (retryCount === 0) {
            await initProxy();
        }
        
        if (scramjetInstance && typeof scramjetInstance.createFrame === 'function') {
            if (!activeFrame) {
                activeFrame = scramjetInstance.createFrame();
                const frame = activeFrame.frame;
                frame.style.cssText = "position: fixed; inset: 0; width: 100%; height: 100%; border: none; margin: 0; padding: 0;";
                frame.setAttribute('allow', 'camera; microphone; display-capture; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen');
                viewport.appendChild(frame);
            }
            
            // Soft retry logic: if it fails, we try calling .go() again without full page reload
            activeFrame.go(SERVER_A_URL);
        }
        
        loading.classList.add('hidden');
    } catch (error) {
        console.error("Launch Error:", error);
        if (retryCount < 3) {
            console.log(`Retrying softly... (${retryCount + 1}/3)`);
            setTimeout(() => launch(retryCount + 1), 1500);
        } else {
            loading.innerHTML = `<div style="text-align:center">Connection Failed.<br><button onclick="location.reload()" style="margin-top:10px;padding:8px 16px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer">Reload Page</button></div>`;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => launch(0));
