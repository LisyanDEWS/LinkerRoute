import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TabData, ProxySettings, SEARCH_ENGINES } from './types';
import { PALETTES, applyM3Theme } from './palettes';
import {
  initProxyEngine,
  getScramjetInstance,
  searchUrl,
  cleanScramjetUrl,
  isGoogleRedirect,
} from './proxyService';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { TabViewport } from './components/TabViewport';
import { SettingsModal } from './components/SettingsModal';

const SETTINGS_KEY = 'linkerru_proxy_settings';

const DEFAULT_SETTINGS: ProxySettings = {
  compactTabs: false,
  theme: 'dark',
  paletteId: 'monochrome',
  searchEngine: 'duckduckgo',
  quickLinks: [
    { letter: 'G', name: 'Google', url: 'https://google.com' },
    { letter: 'Y', name: 'YouTube', url: 'https://youtube.com' },
    { letter: 'T', name: 'Telegram', url: 'https://web.telegram.org' },
    { letter: 'H', name: 'GitHub', url: 'https://github.com' },
  ],
};

function generateTabId(): string {
  return 'tab-' + Math.random().toString(36).substring(2, 8);
}

export const App: React.FC = () => {
  const [settings, setSettings] = useState<ProxySettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.searchEngine === 'yandex' || !SEARCH_ENGINES.some((e) => e.id === parsed.searchEngine)) {
          parsed.searchEngine = 'duckduckgo';
        }
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {}
    return DEFAULT_SETTINGS;
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [nodeOnline, setNodeOnline] = useState(false);

  // Tabs State
  const [tabs, setTabs] = useState<TabData[]>([
    {
      id: generateTabId(),
      title: 'New Tab',
      url: '',
      lastUrl: '',
      isLoaded: false,
      isLoading: false,
      favicon: null,
      historyStack: [],
      historyIndex: -1,
      navigatingInHistory: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);

  // Keep tabs ref for event listeners
  const tabsRef = useRef<TabData[]>(tabs);
  tabsRef.current = tabs;

  const activeTabIdRef = useRef<string>(activeTabId);
  activeTabIdRef.current = activeTabId;

  const settingsRef = useRef<ProxySettings>(settings);
  settingsRef.current = settings;

  // Apply Theme on change
  useEffect(() => {
    applyM3Theme(settings.theme, settings.paletteId);
  }, [settings.theme, settings.paletteId]);

  const updateSettings = (newPartial: Partial<ProxySettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newPartial };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // Node health check
  useEffect(() => {
    const checkNode = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) setNodeOnline(true);
        else setNodeOnline(false);
      } catch (e) {
        setNodeOnline(false);
      }
    };
    checkNode();
    const interval = setInterval(checkNode, 20000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Scramjet & BareMux & PostMessage listener
  useEffect(() => {
    initProxyEngine().then(() => {
      // Check if URL in path (e.g. /proxy/https%3A%2F%2Fexample.com)
      const pathParts = window.location.pathname.split('/proxy/');
      if (pathParts.length > 1 && pathParts[1]) {
        try {
          const initialUrl = decodeURIComponent(pathParts[1]);
          setTimeout(() => {
            if (activeTabIdRef.current) {
              loadUrlInTab(activeTabIdRef.current, initialUrl);
            }
          }, 300);
        } catch (e) {
          console.error('Failed to parse path proxy URL:', e);
        }
      }
    });

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'LINKERR_SYNC') {
        const currentTabs = tabsRef.current;
        const matchingTab = currentTabs.find((t) => {
          const ifr = document.getElementById('ifr-' + t.id) as HTMLIFrameElement;
          return ifr && ifr.contentWindow === event.source;
        });

        if (matchingTab) {
          const cleanUrl = cleanScramjetUrl(data.url);
          const tabId = matchingTab.id;

          setTabs((prev) =>
            prev.map((t) => {
              if (t.id !== tabId) return t;

              let newStack = t.historyStack ? [...t.historyStack] : [];
              let newIndex = t.historyIndex;

              if (t.navigatingInHistory) {
                // Keep history index
              } else if (
                t.expectingRedirect &&
                t.lastUrl !== cleanUrl &&
                isGoogleRedirect(t.lastUrl, cleanUrl)
              ) {
                if (newIndex >= 0) newStack[newIndex] = cleanUrl;
              } else if (t.lastUrl !== cleanUrl) {
                newStack = newStack.slice(0, newIndex + 1);
                newStack.push(cleanUrl);
                newIndex = newStack.length - 1;
              }

              return {
                ...t,
                url: cleanUrl,
                lastUrl: cleanUrl,
                title: data.title || t.title || 'Page',
                favicon: data.favicon || t.favicon,
                isLoading: false,
                historyStack: newStack,
                historyIndex: newIndex,
                navigatingInHistory: false,
                expectingRedirect: false,
              };
            })
          );

          if (activeTabIdRef.current === tabId && data.title) {
            document.title = `${data.title} | LinkerRoute`;
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Prevent accidental back exit when tabs are open
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (tabsRef.current.some((t) => t.isLoaded)) {
        e.preventDefault();
        return (e.returnValue = 'Close LinkerRoute?');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Tab operations
  const handleNewTab = useCallback(() => {
    const newId = generateTabId();
    const newTab: TabData = {
      id: newId,
      title: 'New Tab',
      url: '',
      lastUrl: '',
      isLoaded: false,
      isLoading: false,
      favicon: null,
      historyStack: [],
      historyIndex: -1,
      navigatingInHistory: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    document.title = 'New Tab | LinkerRoute';
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabId);
        if (remaining.length === 0) {
          const freshId = generateTabId();
          setActiveTabId(freshId);
          return [
            {
              id: freshId,
              title: 'New Tab',
              url: '',
              lastUrl: '',
              isLoaded: false,
              isLoading: false,
              favicon: null,
              historyStack: [],
              historyIndex: -1,
              navigatingInHistory: false,
            },
          ];
        } else if (activeTabIdRef.current === tabId) {
          const nextActive = remaining[remaining.length - 1].id;
          setActiveTabId(nextActive);
        }
        return remaining;
      });
    },
    []
  );

  const handleSelectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    const target = tabsRef.current.find((t) => t.id === tabId);
    if (target) {
      document.title = `${target.title || 'New Tab'} | LinkerRoute`;
    }
  }, []);

  // Navigation operations
  const loadUrlInTab = useCallback(async (tabId: string, inputUrl: string) => {
    if (!inputUrl) return;
    const currentSettings = settingsRef.current;
    const engine = SEARCH_ENGINES.find((e) => e.id === currentSettings.searchEngine) || SEARCH_ENGINES[0];
    const resolvedUrl = searchUrl(inputUrl, engine.template);

    // Ensure Scramjet proxy engine is initialized if needed
    let scramjet = getScramjetInstance();
    if (!scramjet) {
      try {
        scramjet = await initProxyEngine();
      } catch (e) {
        console.warn('[LinkerRoute] Async proxy init fallback:', e);
      }
    }

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;

        let frameObj = t.frameObj;
        if (!frameObj) {
          if (scramjet) {
            try {
              frameObj = scramjet.createFrame();
            } catch (e) {
              console.warn('[LinkerRoute] Scramjet createFrame failed:', e);
            }
          }
          if (!frameObj) {
            const fallbackIframe = document.createElement('iframe');
            fallbackIframe.setAttribute('allow', 'cross-origin-isolated; autoplay; clipboard-write; encrypted-media; picture-in-picture');
            fallbackIframe.setAttribute('sandbox', 'allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-top-navigation-by-user-activation');
            frameObj = {
              frame: fallbackIframe,
              go: (url: string) => {
                fallbackIframe.src = url;
              },
            };
          }
        }

        let newStack = t.historyStack ? [...t.historyStack] : [];
        let newIndex = t.historyIndex;
        if (!t.navigatingInHistory) {
          newStack = newStack.slice(0, newIndex + 1);
          newStack.push(resolvedUrl);
          newIndex = newStack.length - 1;
        }

        if (frameObj && typeof frameObj.go === 'function') {
          frameObj.go(resolvedUrl);
        }

        return {
          ...t,
          url: resolvedUrl,
          lastUrl: resolvedUrl,
          isLoaded: true,
          isLoading: true,
          frameObj,
          historyStack: newStack,
          historyIndex: newIndex,
          navigatingInHistory: false,
          expectingRedirect: true,
        };
      })
    );

    // Stop spinner fallback after 8 seconds
    setTimeout(() => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId && t.isLoading ? { ...t, isLoading: false } : t))
      );
    }, 8000);
  }, []);

  const handleBack = useCallback(() => {
    const current = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
    if (!current || !current.isLoaded) return;

    if (current.historyIndex <= 0) {
      // Return to Dashboard
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== current.id) return t;
          return {
            ...t,
            isLoaded: false,
            url: '',
            lastUrl: '',
            title: 'New Tab',
            favicon: null,
            historyIndex: -1,
            navigatingInHistory: false,
          };
        })
      );
      document.title = 'New Tab | LinkerRoute';
      return;
    }

    const prevIndex = current.historyIndex - 1;
    const targetUrl = current.historyStack[prevIndex];
    if (current.frameObj && targetUrl) {
      current.frameObj.go(targetUrl);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === current.id
            ? {
                ...t,
                url: targetUrl,
                lastUrl: targetUrl,
                historyIndex: prevIndex,
                navigatingInHistory: true,
                isLoading: true,
              }
            : t
        )
      );
    }
  }, []);

  const handleForward = useCallback(() => {
    const current = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
    if (!current || !current.historyStack || current.historyIndex >= current.historyStack.length - 1)
      return;

    const nextIndex = current.historyIndex + 1;
    const targetUrl = current.historyStack[nextIndex];

    if (!current.isLoaded) {
      loadUrlInTab(current.id, targetUrl);
      return;
    }

    if (current.frameObj && targetUrl) {
      current.frameObj.go(targetUrl);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === current.id
            ? {
                ...t,
                url: targetUrl,
                lastUrl: targetUrl,
                historyIndex: nextIndex,
                navigatingInHistory: true,
                isLoading: true,
              }
            : t
        )
      );
    }
  }, [loadUrlInTab]);

  const handleReload = useCallback(() => {
    const current = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
    if (!current || !current.isLoaded || !current.frameObj) return;

    const currentUrl = current.historyStack[current.historyIndex] || current.url;
    if (currentUrl) {
      current.frameObj.go(currentUrl);
      setTabs((prev) =>
        prev.map((t) => (t.id === current.id ? { ...t, isLoading: true } : t))
      );
    }
  }, []);

  const handleHome = useCallback(() => {
    const current = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
    if (!current) return;

    setTabs((prev) =>
      prev.map((t) =>
        t.id === current.id
          ? {
              ...t,
              isLoaded: false,
              url: '',
              lastUrl: '',
              title: 'New Tab',
              favicon: null,
              historyIndex: -1,
              navigatingInHistory: false,
            }
          : t
      )
    );
    document.title = 'New Tab | LinkerRoute';
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div 
      className="flex h-screen w-screen overflow-hidden font-sans p-2 md:p-3 gap-2 md:gap-3"
      style={{ 
        backgroundColor: 'var(--bg)', 
        color: 'var(--on-surface)' 
      }}
    >
      {/* Sidebar Navigation (Detached Rounded Card) */}
      <Sidebar
        isOpen={isSidebarOpen}
        tabs={tabs}
        activeTabId={activeTabId}
        compact={settings.compactTabs}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Browser Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative transition-all duration-300 min-w-0 gap-2 md:gap-3">
        {/* Floating Detached Top Navigation Bar */}
        <TopBar
          activeTab={activeTab}
          searchEngine={settings.searchEngine}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onSelectSearchEngine={(eng) => updateSettings({ searchEngine: eng })}
          onNavigate={(url) => loadUrlInTab(activeTabId, url)}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onHome={handleHome}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Tab Viewports Workspace (Detached Rounded Island) */}
        <div 
          className="flex-1 relative overflow-hidden rounded-2xl md:rounded-3xl border shadow-sm"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--outline-var)',
            boxShadow: 'var(--shadow-1)'
          }}
        >
          {tabs.map((tab) => (
            <TabViewport
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              quickLinks={settings.quickLinks}
              searchEngine={settings.searchEngine}
              onSelectSearchEngine={(eng) => updateSettings({ searchEngine: eng })}
              onNavigate={(url) => loadUrlInTab(tab.id, url)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onFrameCreated={(tabId, frameObj) => {
                setTabs((prev) =>
                  prev.map((t) => (t.id === tabId ? { ...t, frameObj } : t))
                );
              }}
              onLoadFinished={(tabId) => {
                setTabs((prev) =>
                  prev.map((t) => (t.id === tabId ? { ...t, isLoading: false } : t))
                );
              }}
            />
          ))}
        </div>
      </main>

      {/* Settings & Diagnostics Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={updateSettings}
      />
    </div>
  );
};
