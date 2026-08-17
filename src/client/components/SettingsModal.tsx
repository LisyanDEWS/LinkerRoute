import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Palette, LayoutGrid, Trash2, Plus, Server, Check, RefreshCw, ExternalLink, Search } from 'lucide-react';
import { ProxySettings, NodeStatus, QuickLink, SEARCH_ENGINES } from '../types';
import { PALETTES } from '../palettes';
import { clearAllBrowsingData } from '../proxyService';

interface SettingsModalProps {
  isOpen: boolean;
  settings: ProxySettings;
  onClose: () => void;
  onUpdateSettings: (newSettings: Partial<ProxySettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onUpdateSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'links' | 'node'>('general');
  const [nodeStatus, setNodeStatus] = useState<NodeStatus | null>(null);
  const [loadingNode, setLoadingNode] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [clearStatus, setClearStatus] = useState<string | null>(null);

  // Editable quick links
  const [editingLinks, setEditingLinks] = useState<QuickLink[]>(settings.quickLinks);

  useEffect(() => {
    setEditingLinks(settings.quickLinks);
  }, [settings.quickLinks]);

  const fetchNodeStatus = async () => {
    setLoadingNode(true);
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setNodeStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch node status', e);
    } finally {
      setLoadingNode(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'node') {
      fetchNodeStatus();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleAddLink = () => {
    const newLink: QuickLink = { letter: 'N', name: 'New Site', url: 'https://' };
    const updated = [...editingLinks, newLink];
    setEditingLinks(updated);
    onUpdateSettings({ quickLinks: updated });
  };

  const handleUpdateLink = (index: number, field: keyof QuickLink, val: string) => {
    const updated = [...editingLinks];
    updated[index] = { ...updated[index], [field]: val };
    setEditingLinks(updated);
    onUpdateSettings({ quickLinks: updated });
  };

  const handleRemoveLink = (index: number) => {
    const updated = editingLinks.filter((_, i) => i !== index);
    setEditingLinks(updated);
    onUpdateSettings({ quickLinks: updated });
  };

  const handleClearData = async () => {
    if (!window.confirm('Clear all browsing cookies, worker caches, and session data?')) return;
    setClearingData(true);
    try {
      const logs = await clearAllBrowsingData();
      setClearStatus(`Successfully cleared ${logs.length} data stores.`);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (e) {
      setClearStatus('Error clearing data');
    } finally {
      setClearingData(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn select-none">
      <div 
        className="w-full max-w-xl max-h-[85vh] rounded-[36px] border flex flex-col overflow-hidden shadow-2xl transition-all duration-200"
        style={{ 
          backgroundColor: 'var(--surface)', 
          borderColor: 'var(--outline)',
          boxShadow: 'var(--shadow-3)'
        }}
      >
        {/* Modal Header */}
        <div 
          className="p-6 md:p-7 pb-4 flex items-center justify-between border-b"
          style={{ borderColor: 'var(--outline-var)' }}
        >
          <div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight" style={{ color: 'var(--on-surface)' }}>
              Settings & Preferences
            </h2>
            <p className="text-xs font-medium opacity-70" style={{ color: 'var(--on-surface-var)' }}>
              Material 3 Expressive Customization & Search Options
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-150 hover:bg-opacity-80 active:scale-95"
            style={{ 
              backgroundColor: 'var(--surface-dim)', 
              borderColor: 'var(--outline-var)',
              color: 'var(--on-surface)' 
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Sub-navigation tabs (M3 Pills) */}
        <div className="px-6 pt-4 flex gap-2 border-b pb-3" style={{ borderColor: 'var(--outline-var)' }}>
          {[
            { id: 'general', label: 'Appearance & Search', icon: Palette },
            { id: 'links', label: 'Quick Links', icon: LayoutGrid },
            { id: 'node', label: 'Tunnel Node Status', icon: Server },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className="px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all duration-150 border"
                style={{
                  backgroundColor: isActive ? 'var(--accent)' : 'var(--container)',
                  borderColor: isActive ? 'var(--outline)' : 'var(--outline-var)',
                  color: isActive ? 'var(--on-accent)' : 'var(--on-surface-var)',
                  boxShadow: isActive ? 'var(--shadow-1)' : 'none'
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-7 space-y-6 custom-scrollbar">
          {activeTab === 'general' && (
            <div className="space-y-5">
              {/* Search Engine Selector */}
              <div 
                className="p-5 rounded-[28px] border"
                style={{ 
                  backgroundColor: 'var(--surface-dim)', 
                  borderColor: 'var(--outline-var)' 
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Search className="w-4 h-4 opacity-70" style={{ color: 'var(--on-surface)' }} />
                  <div className="text-sm font-bold" style={{ color: 'var(--on-surface)' }}>
                    Search Engine
                  </div>
                </div>
                <div className="text-xs mb-3.5 opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                  Select your search provider for direct search queries
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SEARCH_ENGINES.map((eng) => {
                    const isSelected = settings.searchEngine === eng.id;
                    return (
                      <button
                        key={eng.id}
                        onClick={() => onUpdateSettings({ searchEngine: eng.id })}
                        className="flex items-center gap-3 p-3 rounded-full border text-left transition-all duration-150 hover:scale-[1.01]"
                        style={{
                          backgroundColor: isSelected ? 'var(--container-high)' : 'var(--surface)',
                          borderColor: isSelected ? 'var(--outline)' : 'var(--outline-var)',
                          color: 'var(--on-surface)'
                        }}
                      >
                        <div 
                          className="w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                            borderColor: 'var(--outline)'
                          }}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black dark:bg-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate">{eng.name}</div>
                          <div className="text-[10px] opacity-70 truncate">{eng.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Theme Mode Card */}
              <div 
                className="p-5 rounded-[28px] border"
                style={{ 
                  backgroundColor: 'var(--surface-dim)', 
                  borderColor: 'var(--outline-var)' 
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--on-surface)' }}>
                      Color Scheme
                    </div>
                    <div className="text-xs opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                      Switch between Dark and Light Material 3 modes
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 p-1 rounded-full border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--outline)' }}>
                    <button
                      onClick={() => onUpdateSettings({ theme: 'dark' })}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all"
                      style={{
                        backgroundColor: settings.theme === 'dark' ? 'var(--accent)' : 'transparent',
                        color: settings.theme === 'dark' ? 'var(--on-accent)' : 'var(--on-surface-var)'
                      }}
                    >
                      <Moon className="w-3.5 h-3.5" /> Dark
                    </button>
                    <button
                      onClick={() => onUpdateSettings({ theme: 'light' })}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all"
                      style={{
                        backgroundColor: settings.theme === 'light' ? 'var(--accent)' : 'transparent',
                        color: settings.theme === 'light' ? 'var(--on-accent)' : 'var(--on-surface-var)'
                      }}
                    >
                      <Sun className="w-3.5 h-3.5" /> Light
                    </button>
                  </div>
                </div>
              </div>

              {/* M3 Color Palette Selector */}
              <div 
                className="p-5 rounded-[28px] border"
                style={{ 
                  backgroundColor: 'var(--surface-dim)', 
                  borderColor: 'var(--outline-var)' 
                }}
              >
                <div className="text-sm font-bold mb-1" style={{ color: 'var(--on-surface)' }}>
                  Monochrome Style Presets
                </div>
                <div className="text-xs mb-4 opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                  Choose a sleek monochrome contrast level
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {PALETTES.map((p) => {
                    const isSelected = settings.paletteId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => onUpdateSettings({ paletteId: p.id })}
                        className="flex items-center gap-2.5 p-3 rounded-full border text-left transition-all duration-150 hover:scale-[1.01]"
                        style={{
                          backgroundColor: isSelected ? 'var(--container-high)' : 'var(--surface)',
                          borderColor: isSelected ? 'var(--outline)' : 'var(--outline-var)',
                          boxShadow: isSelected ? 'var(--shadow-1)' : 'none'
                        }}
                      >
                        <div 
                          className="w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: p.primary, borderColor: 'var(--outline)' }}
                        >
                          {isSelected && <Check className="w-3 h-3 text-black dark:text-white" />}
                        </div>
                        <span className="text-xs font-bold truncate" style={{ color: 'var(--on-surface)' }}>
                          {p.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar Tab Density */}
              <div 
                className="p-5 rounded-[28px] border flex items-center justify-between"
                style={{ 
                  backgroundColor: 'var(--surface-dim)', 
                  borderColor: 'var(--outline-var)' 
                }}
              >
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--on-surface)' }}>
                    Compact Tabs Mode
                  </div>
                  <div className="text-xs opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                    Slim down tab pills in the left sidebar
                  </div>
                </div>

                <button
                  onClick={() => onUpdateSettings({ compactTabs: !settings.compactTabs })}
                  className="w-12 h-7 rounded-full transition-all duration-200 relative p-1 border"
                  style={{
                    backgroundColor: settings.compactTabs ? 'var(--accent)' : 'var(--container)',
                    borderColor: 'var(--outline)'
                  }}
                >
                  <div 
                    className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
                      settings.compactTabs ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Clear Browsing Data */}
              <div 
                className="p-5 rounded-[28px] border"
                style={{ 
                  backgroundColor: 'var(--surface-dim)', 
                  borderColor: 'var(--outline-var)' 
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--on-surface)' }}>
                      Clear Browsing Data
                    </div>
                    <div className="text-xs opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                      Wipes all proxied cookies, IndexedDB, worker caches, and sessions
                    </div>
                  </div>
                </div>

                {clearStatus && (
                  <div className="my-2 p-2.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold text-center">
                    {clearStatus}
                  </div>
                )}

                <button
                  onClick={handleClearData}
                  disabled={clearingData}
                  className="w-full mt-2 py-3 px-4 rounded-full border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{clearingData ? 'Clearing Storage...' : 'Flush Cookies & Browsing Data'}</span>
                </button>
              </div>

              {/* Credits & License */}
              <div className="flex justify-center gap-4 text-xs font-semibold pt-2" style={{ color: 'var(--on-surface-var)' }}>
                <a 
                  href="/credits.html" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="hover:underline flex items-center gap-1 opacity-80"
                  style={{ color: 'var(--on-surface)' }}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View Open Source Licenses
                </a>
              </div>
            </div>
          )}

          {activeTab === 'links' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                  Dashboard Speed Dial Links
                </span>
                <button
                  onClick={handleAddLink}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 border shadow-sm"
                  style={{ 
                    backgroundColor: 'var(--accent)', 
                    borderColor: 'var(--outline)',
                    color: 'var(--on-accent)' 
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Link
                </button>
              </div>

              <div className="space-y-2.5">
                {editingLinks.map((link, idx) => (
                  <div 
                    key={idx}
                    className="p-3.5 rounded-full border flex items-center gap-3"
                    style={{ 
                      backgroundColor: 'var(--surface-dim)', 
                      borderColor: 'var(--outline-var)' 
                    }}
                  >
                    {/* Letter avatar (Fully Rounded) */}
                    <input
                      type="text"
                      maxLength={2}
                      value={link.letter}
                      onChange={(e) => handleUpdateLink(idx, 'letter', e.target.value.toUpperCase())}
                      className="w-9 h-9 rounded-full font-black text-center text-xs shadow-sm outline-none border"
                      style={{ 
                        backgroundColor: 'var(--container-high)',
                        borderColor: 'var(--outline)',
                        color: 'var(--on-surface)'
                      }}
                      title="Icon Initial"
                    />

                    {/* Name */}
                    <input
                      type="text"
                      value={link.name}
                      onChange={(e) => handleUpdateLink(idx, 'name', e.target.value)}
                      placeholder="Title"
                      className="w-28 px-3.5 py-2 rounded-full text-xs font-bold border outline-none"
                      style={{ 
                        backgroundColor: 'var(--surface)', 
                        borderColor: 'var(--outline)',
                        color: 'var(--on-surface)' 
                      }}
                    />

                    {/* URL */}
                    <input
                      type="text"
                      value={link.url}
                      onChange={(e) => handleUpdateLink(idx, 'url', e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-3.5 py-2 rounded-full text-xs font-medium border outline-none font-mono"
                      style={{ 
                        backgroundColor: 'var(--surface)', 
                        borderColor: 'var(--outline)',
                        color: 'var(--on-surface)' 
                      }}
                    />

                    {/* Delete */}
                    <button
                      onClick={() => handleRemoveLink(idx)}
                      className="w-8 h-8 rounded-full flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-zinc-800 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'node' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                  Active Fastify & Wisp Node Status
                </span>
                <button
                  onClick={fetchNodeStatus}
                  disabled={loadingNode}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 border"
                  style={{ 
                    backgroundColor: 'var(--surface-dim)', 
                    borderColor: 'var(--outline)',
                    color: 'var(--on-surface)' 
                  }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingNode ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {nodeStatus ? (
                <div className="grid grid-cols-2 gap-3">
                  <div 
                    className="p-4 rounded-[28px] border"
                    style={{ backgroundColor: 'var(--surface-dim)', borderColor: 'var(--outline-var)' }}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                      Node Status
                    </div>
                    <div className="text-lg font-black flex items-center gap-1.5 mt-1" style={{ color: 'var(--on-surface)' }}>
                      <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 animate-pulse" />
                      {nodeStatus.status.toUpperCase()}
                    </div>
                  </div>

                  <div 
                    className="p-4 rounded-[28px] border"
                    style={{ backgroundColor: 'var(--surface-dim)', borderColor: 'var(--outline-var)' }}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                      Server Uptime
                    </div>
                    <div className="text-lg font-black mt-1" style={{ color: 'var(--on-surface)' }}>
                      {nodeStatus.uptime} ({Math.round(nodeStatus.uptime_seconds)}s)
                    </div>
                  </div>

                  <div 
                    className="p-4 rounded-[28px] border"
                    style={{ backgroundColor: 'var(--surface-dim)', borderColor: 'var(--outline-var)' }}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                      Active Connections
                    </div>
                    <div className="text-lg font-black mt-1" style={{ color: 'var(--on-surface)' }}>
                      {nodeStatus.active_connections}
                    </div>
                  </div>

                  <div 
                    className="p-4 rounded-[28px] border"
                    style={{ backgroundColor: 'var(--surface-dim)', borderColor: 'var(--outline-var)' }}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                      Heap Memory
                    </div>
                    <div className="text-lg font-black mt-1" style={{ color: 'var(--on-surface)' }}>
                      {nodeStatus.memory_mb} MB ({nodeStatus.memory_usage}%)
                    </div>
                  </div>

                  <div 
                    className="p-4 rounded-[28px] border col-span-2"
                    style={{ backgroundColor: 'var(--surface-dim)', borderColor: 'var(--outline-var)' }}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider mb-2 opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                      System Environment
                    </div>
                    <div className="text-xs font-mono space-y-1 opacity-80" style={{ color: 'var(--on-surface)' }}>
                      <div>Node.js Version: <span className="font-bold">{nodeStatus.node_version}</span></div>
                      <div>App Version: <span className="font-bold">{nodeStatus.version}</span></div>
                      <div>Platform / Arch: <span className="font-bold">{nodeStatus.platform} ({nodeStatus.arch})</span></div>
                      <div>Process PID: <span className="font-bold">{nodeStatus.pid}</span></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center rounded-[28px] border" style={{ backgroundColor: 'var(--surface-dim)', borderColor: 'var(--outline-var)' }}>
                  <div className="text-sm font-semibold opacity-70" style={{ color: 'var(--on-surface-var)' }}>
                    Connecting to local Node.js diagnostics endpoint...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div 
          className="p-4 px-6 border-t flex justify-end"
          style={{ borderColor: 'var(--outline-var)' }}
        >
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-full font-bold text-xs md:text-sm shadow-md transition-all duration-150 hover:scale-105 active:scale-95 border"
            style={{ 
              backgroundColor: 'var(--accent)', 
              borderColor: 'var(--outline)',
              color: 'var(--on-accent)' 
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
