import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Home, Lock, Settings, Search, X, PanelLeft } from 'lucide-react';
import { TabData } from '../types';
import { SearchEnginePicker } from './SearchEnginePicker';

interface TopBarProps {
  activeTab: TabData | undefined;
  searchEngine: string;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSelectSearchEngine: (engineId: string) => void;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  searchEngine,
  isSidebarOpen,
  onToggleSidebar,
  onSelectSearchEngine,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onHome,
  onOpenSettings,
}) => {
  const [inputValue, setInputValue] = useState('');

  // Sync address bar input with active tab url
  useEffect(() => {
    if (activeTab) {
      setInputValue(activeTab.url || '');
    } else {
      setInputValue('');
    }
  }, [activeTab?.id, activeTab?.url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onNavigate(inputValue.trim());
    }
  };

  const canGoBack = activeTab?.isLoaded;
  const canGoForward = activeTab && activeTab.historyStack && activeTab.historyIndex < activeTab.historyStack.length - 1;
  const canReload = activeTab?.isLoaded;

  return (
    <header 
      className="flex items-center gap-2 md:gap-3 px-3.5 md:px-5 py-2 rounded-2xl md:rounded-full border shadow-sm z-20 transition-all duration-300 relative flex-shrink-0"
      style={{ 
        backgroundColor: 'var(--surface)', 
        borderColor: 'var(--outline-var)',
        boxShadow: 'var(--shadow-1)'
      }}
    >
      {/* Navigation History & Sidebar Toggle Controls */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Dedicated Sidebar Toggle Button */}
        <button
          onClick={onToggleSidebar}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 hover:bg-opacity-80 active:scale-95 border"
          style={{ 
            backgroundColor: isSidebarOpen ? 'var(--surface-dim)' : 'var(--container-high)', 
            borderColor: 'var(--outline-var)',
            color: 'var(--on-surface)' 
          }}
          title={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        {/* Vertical Divider for Clean Separation */}
        <div className="h-4 w-[1px] mx-1 opacity-40" style={{ backgroundColor: 'var(--outline-var)' }} />

        <button
          onClick={onBack}
          disabled={!canGoBack}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none hover:bg-opacity-80 active:scale-95"
          style={{ 
            backgroundColor: 'var(--surface-dim)', 
            color: 'var(--on-surface)' 
          }}
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <button
          onClick={onForward}
          disabled={!canGoForward}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none hover:bg-opacity-80 active:scale-95"
          style={{ 
            backgroundColor: 'var(--surface-dim)', 
            color: 'var(--on-surface)' 
          }}
          title="Forward"
        >
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onReload}
          disabled={!canReload}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none hover:bg-opacity-80 active:scale-95"
          style={{ 
            backgroundColor: 'var(--surface-dim)', 
            color: 'var(--on-surface)' 
          }}
          title="Reload"
        >
          <RotateCw className={`w-4 h-4 ${activeTab?.isLoading ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={onHome}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 hover:bg-opacity-80 active:scale-95"
          style={{ 
            backgroundColor: 'var(--surface-dim)', 
            color: 'var(--on-surface)' 
          }}
          title="Dashboard"
        >
          <Home className="w-4 h-4" />
        </button>
      </div>

      {/* Main Address / URL Bar - Expanded & Centered */}
      <form onSubmit={handleSubmit} className="flex-1 max-w-4xl min-w-0 mx-auto px-1">
        <div 
          className="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-200 focus-within:ring-2"
          style={{ 
            backgroundColor: 'var(--surface-dim)', 
            borderColor: 'var(--outline-var)' 
          }}
        >
          <Lock className="w-3.5 h-3.5 flex-shrink-0 opacity-60 ml-1" style={{ color: 'var(--on-surface-var)' }} />
          
          {/* Custom Search Engine Picker in Address Bar */}
          <SearchEnginePicker
            selectedId={searchEngine}
            onSelect={onSelectSearchEngine}
            compact={true}
          />

          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter web address or search query..."
            className="flex-1 bg-transparent border-none outline-none text-xs md:text-sm font-medium px-1 min-w-0"
            style={{ color: 'var(--on-surface)' }}
          />

          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue('')}
              className="p-1 rounded-full opacity-60 hover:opacity-100 hover:bg-opacity-20 flex-shrink-0"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="submit"
            className="px-3 py-1 rounded-full text-xs font-bold transition-all duration-150 hover:scale-105 active:scale-95 flex items-center gap-1 flex-shrink-0"
            style={{ 
              backgroundColor: 'var(--accent)', 
              color: 'var(--on-accent)' 
            }}
          >
            <Search className="w-3 h-3" />
            <span>Go</span>
          </button>
        </div>
      </form>

      {/* Quick Settings Icon */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 hover:bg-opacity-80 active:scale-95"
          style={{ 
            backgroundColor: 'var(--surface-dim)', 
            color: 'var(--on-surface)' 
          }}
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

