"use strict";

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

let connection;
const tabs = {};
let activeTabId = null;

// ── Settings state ──
const SETTINGS_KEY = 'linkerru_proxy_settings';
let proxySettings = {
    compactTabs: false,
    quickLinks: [
        { letter: 'G', name: 'Google', url: 'https://google.com' },
        { letter: 'Y', name: 'YouTube', url: 'https://youtube.com' },
        { letter: 'T', name: 'Telegram', url: 'https://web.telegram.org' },
        { letter: 'H', name: 'GitHub', url: 'https://github.com' },
    ],
};

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            proxySettings = { ...proxySettings, ...parsed };
        }
    } catch (e) {}
    applySettings();
}

function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(proxySettings)); } catch (e) {}
}

function applySettings() {
    document.body.classList.toggle('compact-tabs', proxySettings.compactTabs);
    const compactCheckbox = document.getElementById('setting-compact');
    if (compactCheckbox) compactCheckbox.checked = proxySettings.compactTabs;
}

async function registerSW() {
    if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[Linkerr] SW registered');
    }
}

function search(input, template) {
    try { return new URL(input).toString(); }
    catch (e) {
        try {
            const url = new URL(`http://${input}`);
            if (url.hostname.includes(".")) return url.toString();
            throw e;
        } catch (e2) { return template.replace("%s", encodeURIComponent(input)); }
    }
}

/** Check if a URL change is a Google self-redirect (google.com → www.google.com, etc.) */
function isGoogleRedirect(fromUrl, toUrl) {
    try {
        const from = new URL(fromUrl);
        const to = new URL(toUrl);
        // Both must be google domains
        const isGoogle = (h) => h === 'google.com' || h === 'www.google.com' ||
            h.endsWith('.google.com') || h === 'google.ru' || h === 'www.google.ru';
        return isGoogle(from.hostname) && isGoogle(to.hostname);
    } catch (e) { return false; }
}

// Предотвращаем случайный выход из прокси при нажатии "Назад" в браузере
window.addEventListener('beforeunload', (e) => {
    if (Object.keys(tabs).length > 0) {
        e.preventDefault();
        return (e.returnValue = "Close Linkerr?");
    }
});

async function init() {
    try {
        await registerSW();
        connection = new BareMux.BareMuxConnection("/baremux/worker.js");
        const wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";
        await connection.setTransport("/libcurl/index.mjs", [{ wisp: wispUrl }]);
        
        // Check if URL is in the path (e.g., /proxy/https%3A%2F%2Fexample.com)
        const pathParts = window.location.pathname.split('/proxy/');
        if (pathParts.length > 1) {
            const encodedUrl = pathParts[1];
            try {
                const initialUrl = decodeURIComponent(encodedUrl);
                console.log('[Linkerr] Auto-loading URL from path:', initialUrl);
                
                // Wait for tab creation, then load the URL
                setTimeout(() => {
                    if (activeTabId) {
                        loadUrl(activeTabId, initialUrl);
                    }
                }, 100);
            } catch (e) {
                console.error('[Linkerr] Failed to decode URL:', e);
            }
        }
    } catch (err) {
        console.error("[Linkerr] Setup Failed:", err);
    }

    window.addEventListener('message', (event) => {
        const data = event.data;
        if (data && data.type === 'LINKERR_SYNC') {
            const tabId = Object.keys(tabs).find(id => {
                const ifr = document.getElementById('ifr-' + id);
                return ifr && ifr.contentWindow === event.source;
            });

            if (tabId) {
                const tab = tabs[tabId];
                let cleanUrl = data.url;

                // Decode the scramjet-encoded URL back to a clean https://... URL.
                // Scramjet nests its prefix on internal navigations. Some sites report
                // a raw nested URL like:
                //   http://localhost:8080/scramjet/http://localhost:8080/scramjet/https://github.com/
                // Others report percent-encoded variants:
                //   http://localhost:8080/scramjet/http%3A%2F%2Flocalhost%3A8080%2Fscramjet%2Fhttps%3A%2F%2Fgithub.com
                // We need to handle both: strip the proxy origin + /scramjet/ prefix
                // in a loop, interleaved with decodeURIComponent, until we get a clean
                // https://... URL with no /scramjet/ in it.
                try {
                    // Try the official scramjet codec first (most reliable)
                    if (scramjet && scramjet.codec && scramjet.codec.decode) {
                        const codecDecoded = scramjet.codec.decode(data.url);
                        if (codecDecoded && /^https?:\/\//i.test(codecDecoded) && !codecDecoded.includes('/scramjet/')) {
                            cleanUrl = codecDecoded;
                        }
                    }
                    // Fallback: manually strip + decode in a loop
                    if (cleanUrl.includes('/scramjet/') || cleanUrl.includes('localhost:8080')) {
                        let decoded = cleanUrl;
                        let prev;
                        let iterations = 0;
                        do {
                            prev = decoded;
                            // Strip one layer of "origin/scramjet/" prefix (handles both
                            // literal http://host/scramjet/ and encoded http%3A%2F%2Fhost%2Fscramjet%2F)
                            decoded = decoded.replace(/^https?:\/\/[^/]+\/scramjet\//i, '');
                            // Also strip encoded variant of the origin
                            decoded = decoded.replace(/^https?%3A%2F%2F[^/]+%2Fscramjet%2F/i, '');
                            // Decode one layer of percent-encoding
                            try { decoded = decodeURIComponent(decoded); } catch (e) { /* at decode limit */ }
                            iterations++;
                        } while (decoded !== prev && iterations < 15);
                        // If we ended up with something that looks like a real URL, use it
                        if (/^https?:\/\//i.test(decoded) && !decoded.includes('/scramjet/')) {
                            cleanUrl = decoded;
                        }
                    }
                } catch (e) {
                    console.warn("Decode failed, using raw data.url", e);
                }

                // History tracking — only push if this is a genuine new navigation
                // (not a back/forward movement we initiated, or a redirect from one)
                if (tab.navigatingInHistory) {
                    // Back/forward movement — keep flag alive for redirects
                    clearTimeout(tab._navHistoryTimer);
                    tab._navHistoryTimer = setTimeout(() => { tab.navigatingInHistory = false; }, 1500);
                } else if (tab.expectingRedirect && tab.lastUrl !== cleanUrl && isGoogleRedirect(tab.lastUrl, cleanUrl)) {
                    // Google-specific redirect (google.com → www.google.com, etc.)
                    // Replace current entry instead of pushing, so one back click works.
                    tab.historyStack[tab.historyIndex] = cleanUrl;
                    clearTimeout(tab._redirectTimer);
                    tab._redirectTimer = setTimeout(() => { tab.expectingRedirect = false; }, 1500);
                } else if (tab.lastUrl !== cleanUrl) {
                    // New navigation (link click, form submit, etc.) — push to history
                    if (!tab.historyStack) tab.historyStack = [];
                    tab.historyStack = tab.historyStack.slice(0, tab.historyIndex + 1);
                    tab.historyStack.push(cleanUrl);
                    tab.historyIndex = tab.historyStack.length - 1;
                }
                tab.lastUrl = cleanUrl;

                // Обновляем заголовок
                const nameEl = document.getElementById('name-' + tabId);
                if (nameEl && data.title) nameEl.innerText = data.title;

                // Ставим иконку (favicon)
                const iconEl = document.getElementById('icon-' + tabId);
                if (iconEl) {
                    // Extract the real hostname from the clean URL
                    let realHostname = '';
                    try { realHostname = new URL(cleanUrl).hostname; } catch (e) {}

                    if (data.favicon) {
                        // The favicon is now a data URL (base64) fetched from inside
                        // the scramjet iframe, so it works without COEP/SW routing issues.
                        if (iconEl.src !== data.favicon) {
                            iconEl.onerror = null;
                            iconEl.src = data.favicon;
                            iconEl.classList.remove('tab-icon-letter');
                        }
                    } else if (realHostname) {
                        // No favicon — show letter icon
                        if (!iconEl.dataset.triedFallback || iconEl.dataset.fallbackHost !== realHostname) {
                            iconEl.dataset.triedFallback = '1';
                            iconEl.dataset.fallbackHost = realHostname;
                            iconEl.removeAttribute('src');
                            iconEl.dataset.letter = realHostname.charAt(0).toUpperCase();
                            iconEl.classList.add('tab-icon-letter');
                        }
                    } else {
                        iconEl.src = "/newtab.svg";
                    }
                }

                // ОБНОВЛЯЕМ URL BAR + nav buttons (только если вкладка активна)
                if (activeTabId === tabId) {
                    document.title = (data.title || "Loading...") + " | LinkerRoute";
                    const addressInput = document.getElementById('proxy-address');
                    if (addressInput) addressInput.value = cleanUrl;
                    updateNavButtons();
                }
            }
        }
    });

    document.getElementById("proxy-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const address = document.getElementById("proxy-address").value;
        if (activeTabId) loadUrl(activeTabId, address);
    });

    loadSettings();
    createTab();
}

window.createTab = function() {
    const id = 'tab-' + Math.random().toString(36).substr(2, 5);
    const tabList = document.getElementById('tab-list');
    const tabBtn = document.createElement('div');
    tabBtn.className = 'tab'; tabBtn.id = 'btn-' + id;
    tabBtn.innerHTML = `
        <img class="tab-icon" id="icon-${id}" src="/newtab.svg">
        <span class="tab-name" id="name-${id}">New Tab</span>
        <span class="tab-close" onclick="event.stopPropagation(); closeTab('${id}')">×</span>
    `;
    tabBtn.onclick = () => switchTab(id);
    tabList.appendChild(tabBtn);

    const view = document.createElement('div');
    view.className = 'view'; view.id = 'view-' + id;
    const linksHtml = (proxySettings.quickLinks || []).map(l =>
        `<div class="q-link" onclick="loadUrl('${id}', '${l.url}')">
            <div class="q-link-icon">${l.letter}</div>
            <span class="q-link-name">${l.name}</span>
        </div>`
    ).join('');
    view.innerHTML = `<div class="dash" id="dash-${id}">
        <div class="dash-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <h1 class="dash-title">LinkerRoute</h1>
        <p class="dash-subtitle">Browse through the encrypted tunnel</p>
        <div class="q-grid">${linksHtml}</div>
    </div>`;
    document.getElementById('viewport').appendChild(view);
    
    // Инициализируем пустой стек
    tabs[id] = { id, isLoaded: false, lastUrl: '', historyStack: [], historyIndex: -1, navigatingInHistory: false };
    switchTab(id);
};

window.loadUrl = async function (id, input) {
    if (!input) return;
    let targetUrl = input;
    if (!/^https?:\/\//i.test(targetUrl) && !targetUrl.includes(' ')) targetUrl = 'https://' + targetUrl;
    const url = search(targetUrl, "https://www.google.com/search?q=%s");
    
    const tab = tabs[id];
    const dash = document.getElementById('dash-' + id);
    if (dash) dash.style.display = 'none';

    // Reset icon fallback state for the new page
    const iconEl = document.getElementById('icon-' + id);
    if (iconEl) {
        delete iconEl.dataset.triedFallback;
        iconEl.classList.remove('tab-icon-letter');
        iconEl.onerror = null;
    }

    // Show loading spinner
    const viewEl = document.getElementById('view-' + id);
    let loader = viewEl.querySelector('.loading-overlay');
    if (!loader) {
        loader = document.createElement('div');
        loader.className = 'loading-overlay';
        loader.innerHTML = '<div class="spinner"></div>';
        viewEl.appendChild(loader);
    }
    loader.style.display = 'flex';
    loader.style.opacity = '1';

    if (!tab.isLoaded) {
        const frameObj = scramjet.createFrame();
        frameObj.frame.id = 'ifr-' + id;
        frameObj.frame.style = "width:100%; height:100%; border:none;";
        frameObj.frame.addEventListener('load', () => {
            if (loader) { loader.style.opacity = '0'; setTimeout(() => { loader.style.display = 'none'; }, 200); }
        });
        document.getElementById('view-' + id).appendChild(frameObj.frame);
        tab.frameObj = frameObj;
        tab.isLoaded = true;
    }
    // Hide spinner after navigation starts (fallback if load event doesn't fire)
    setTimeout(() => {
        if (loader) { loader.style.opacity = '0'; setTimeout(() => { loader.style.display = 'none'; }, 200); }
    }, 8000);

    // Push to history only for genuine new navigations (not history re-entry)
    if (!tab.navigatingInHistory) {
        if (!tab.historyStack) tab.historyStack = [];
        tab.historyStack = tab.historyStack.slice(0, tab.historyIndex + 1);
        tab.historyStack.push(url);
        tab.historyIndex = tab.historyStack.length - 1;
    }
    tab.lastUrl = url;
    tab.navigatingInHistory = false;

    // Expect a possible redirect within 2s — if the URL changes, we'll replace
    // the current entry instead of pushing a new one (mimics browser behavior).
    tab.expectingRedirect = true;
    clearTimeout(tab._redirectTimer);
    tab._redirectTimer = setTimeout(() => { tab.expectingRedirect = false; }, 2000);

    tab.frameObj.go(url);
    updateNavButtons();
};

/** Update back/forward/reload button disabled states for the active tab. */
function updateNavButtons() {
    const tab = tabs[activeTabId];
    const backBtn = document.getElementById('nav-back');
    const fwdBtn = document.getElementById('nav-forward');
    const reloadBtn = document.getElementById('nav-reload');
    if (!tab) return;

    const hasHistory = tab.historyStack && tab.historyStack.length > 0;
    const onDash = !tab.isLoaded;

    // Back: enabled whenever a page is loaded (can go to previous page or dash).
    // Forward: enabled if there's forward history (works from dash too, if you
    // went back from the first page to the dashboard).
    if (backBtn) backBtn.disabled = onDash;
    if (fwdBtn) fwdBtn.disabled = !hasHistory || tab.historyIndex >= tab.historyStack.length - 1;
    if (reloadBtn) reloadBtn.disabled = onDash;
}

window.triggerNav = (action) => {
    const tab = tabs[activeTabId];
    if (!tab) return;

    if (action === 'back') {
        if (!tab.isLoaded) return;
        // At the first page — go back to dashboard
        if (tab.historyIndex <= 0) {
            goBackToDash(activeTabId);
            return;
        }
        tab.historyIndex--;
        tab.navigatingInHistory = true;
        tab.frameObj.go(tab.historyStack[tab.historyIndex]);
        updateNavButtons();
    } else if (action === 'forward') {
        if (!tab.historyStack || tab.historyIndex >= tab.historyStack.length - 1) return;
        // If we're on the dashboard (went back from first page), re-enter
        if (!tab.isLoaded) {
            tab.historyIndex++;
            tab.navigatingInHistory = true;
            // Reload the URL — this recreates the iframe via loadUrl
            loadUrl(activeTabId, tab.historyStack[tab.historyIndex]);
            return;
        }
        tab.historyIndex++;
        tab.navigatingInHistory = true;
        tab.frameObj.go(tab.historyStack[tab.historyIndex]);
        updateNavButtons();
    } else if (action === 'reload') {
        if (!tab.isLoaded || !tab.frameObj) return;
        // Re-navigate to current URL
        tab.frameObj.go(tab.historyStack[tab.historyIndex]);
    }
};

function goBackToDash(id) {
    const tab = tabs[id];
    const ifr = document.getElementById('ifr-' + id);
    const dash = document.getElementById('dash-' + id);
    const loader = document.querySelector(`#view-${id} .loading-overlay`);

    if (ifr) ifr.remove();
    if (loader) loader.remove();
    if (dash) dash.style.display = 'flex';

    // Preserve history so Forward can re-enter the last visited page.
    // Set historyIndex to -1 (before the first entry) so forward goes to index 0.
    tab.isLoaded = false;
    tab.lastUrl = "";
    tab.historyIndex = -1;
    tab.navigatingInHistory = false;
    document.getElementById('name-' + id).innerText = "New Tab";
    const dashIcon = document.getElementById('icon-' + id);
    if (dashIcon) {
        dashIcon.src = "/newtab.svg";
        delete dashIcon.dataset.triedFallback;
        dashIcon.classList.remove('tab-icon-letter');
        dashIcon.onerror = null;
    }
    document.getElementById('proxy-address').value = "";
    updateNavButtons();
}

window.switchTab = (id) => {
    activeTabId = id;
    document.querySelectorAll('.tab, .view').forEach(el => el.classList.remove('active'));
    document.getElementById('btn-' + id)?.classList.add('active');
    document.getElementById('view-' + id)?.classList.add('active');
    const tab = tabs[id];
    if (tab) {
        const addressInput = document.getElementById('proxy-address');
        if (addressInput) addressInput.value = tab.lastUrl || "";
        document.title = document.getElementById('name-' + id).innerText + " | LinkerRoute";
        updateNavButtons();
    }
};

window.closeTab = (id) => {
    document.getElementById('btn-' + id)?.remove();
    document.getElementById('view-' + id)?.remove();
    delete tabs[id];
    const keys = Object.keys(tabs);
    if (keys.length > 0) switchTab(keys[keys.length - 1]);
    else createTab();
};

// ── Settings modal ──
window.openSettings = function() {
    renderQuickLinkEditor();
    document.getElementById('settings-modal').classList.add('open');
};

window.closeSettings = function() {
    document.getElementById('settings-modal').classList.remove('open');
};

// Close on overlay click
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeSettings();
        });
    }
});

window.toggleCompactTabs = function() {
    proxySettings.compactTabs = document.getElementById('setting-compact').checked;
    applySettings();
    saveSettings();
};

// ── Quick links editor ──
function renderQuickLinkEditor() {
    const editor = document.getElementById('ql-editor');
    if (!editor) return;
    editor.innerHTML = '';
    proxySettings.quickLinks.forEach((link, i) => {
        const row = document.createElement('div');
        row.className = 'ql-row';
        row.innerHTML = `
            <button class="ql-letter" onclick="event.preventDefault()">${link.letter}</button>
            <input class="ql-input name" type="text" value="${link.name}" placeholder="Name" onchange="updateQuickLink(${i}, 'name', this.value)">
            <input class="ql-input url" type="text" value="${link.url}" placeholder="https://..." onchange="updateQuickLink(${i}, 'url', this.value)">
            <button class="ql-remove" onclick="removeQuickLink(${i})">×</button>
        `;
        // Click letter to edit it
        row.querySelector('.ql-letter').onclick = (e) => {
            e.preventDefault();
            const newLetter = prompt('Letter:', link.letter);
            if (newLetter && newLetter.length > 0) {
                link.letter = newLetter.charAt(0).toUpperCase();
                saveSettings();
                renderQuickLinkEditor();
            }
        };
        editor.appendChild(row);
    });
}

window.updateQuickLink = function(index, field, value) {
    if (proxySettings.quickLinks[index]) {
        proxySettings.quickLinks[index][field] = value;
        saveSettings();
    }
};

window.removeQuickLink = function(index) {
    proxySettings.quickLinks.splice(index, 1);
    saveSettings();
    renderQuickLinkEditor();
};

window.addQuickLink = function() {
    proxySettings.quickLinks.push({ letter: 'N', name: 'New', url: 'https://' });
    saveSettings();
    renderQuickLinkEditor();
};

// ── Clear browsing data ──
window.clearBrowsingData = async function() {
    if (!confirm('Clear all browsing data?\n\nThis will delete:\n- All cookies from proxied sites\n- Service worker cache\n- IndexedDB data\n- Local/session storage\n\nThis cannot be undone.')) return;

    const results = [];

    // 1. Clear service worker caches
    try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        results.push(`Caches: cleared ${cacheNames.length} cache(s)`);
    } catch (e) { results.push('Caches: failed'); }

    // 2. Clear IndexedDB databases (scramjet stores cookies here)
    try {
        if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            await Promise.all(dbs.map(db => {
                if (db.name) return new Promise(resolve => {
                    const req = indexedDB.deleteDatabase(db.name);
                    req.onsuccess = resolve;
                    req.onerror = resolve;
                    req.onblocked = resolve;
                });
            }));
            results.push(`IndexedDB: cleared ${dbs.length} database(s)`);
        } else {
            // Fallback: try common scramjet database names
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
    } catch (e) { results.push('IndexedDB: failed'); }

    // 3. Clear cookies for the proxy domain
    try {
        // Clear all cookies we can access
        document.cookie.split(';').forEach(c => {
            const eq = c.indexOf('=');
            const name = eq > -1 ? c.substr(0, eq).trim() : c.trim();
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
            // Also try with domain
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
        });
        results.push('Cookies: cleared');
    } catch (e) { results.push('Cookies: failed'); }

    // 4. Clear localStorage (preserve theme + settings)
    try {
        const themeBackup = localStorage.getItem('linkerru_proxy_theme');
        const settingsBackup = localStorage.getItem(SETTINGS_KEY);
        localStorage.clear();
        if (themeBackup) localStorage.setItem('linkerru_proxy_theme', themeBackup);
        if (settingsBackup) localStorage.setItem(SETTINGS_KEY, settingsBackup);
        results.push('localStorage: cleared');
    } catch (e) { results.push('localStorage: failed'); }

    // 5. Clear sessionStorage
    try { sessionStorage.clear(); results.push('sessionStorage: cleared'); }
    catch (e) { results.push('sessionStorage: failed'); }

    // 6. Unregister and re-register the service worker
    try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg => reg.unregister()));
        results.push(`Service Worker: unregistered ${regs.length} worker(s)`);
    } catch (e) { results.push('Service Worker: failed'); }

    alert('Browsing data cleared!\n\n' + results.join('\n') + '\n\nThe page will reload to reinitialize.');
    location.reload();
};

window.addEventListener('DOMContentLoaded', init);