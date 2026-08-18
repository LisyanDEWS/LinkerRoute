import React from 'react';
import { Plus, Settings, X, Globe } from 'lucide-react';
import { TabData } from '../types';

interface SidebarProps {
  isOpen: boolean;
  tabs: TabData[];
  activeTabId: string;
  compact: boolean;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  onNewTab: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  tabs,
  activeTabId,
  compact,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onOpenSettings,
}) => {
  return (
    <aside
      className={`flex flex-col border flex-shrink-0 transition-all duration-300 select-none z-30 overflow-hidden rounded-2xl md:rounded-3xl shadow-sm ${
        !isOpen
          ? 'w-0 border-0 opacity-0 pointer-events-none p-0'
          : compact
          ? 'w-56 opacity-100'
          : 'w-64 opacity-100'
      }`}
      style={{
        backgroundColor: 'var(--surface-dim)',
        borderColor: 'var(--outline-var)',
        boxShadow: 'var(--shadow-1)',
      }}
    >
      {/* Clean Minimal Brand Header */}
      <div className="p-3.5 md:p-4 flex items-center justify-between min-w-[210px]">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center border shadow-sm"
            style={{
              backgroundColor: 'var(--container-high)',
              borderColor: 'var(--outline)',
              color: 'var(--on-surface)',
            }}
          >
            <Globe className="w-4 h-4 opacity-80" />
          </div>
          <span className="font-black text-base md:text-lg tracking-tight" style={{ color: 'var(--on-surface)' }}>
            LinkerRoute
          </span>
        </div>
      </div>

      {/* Tabs List */}
      <div className="flex-1 overflow-y-auto px-3 py-1 flex flex-col gap-1.5 custom-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const letter = tab.title ? tab.title.charAt(0).toUpperCase() : 'N';

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group relative flex items-center gap-2.5 cursor-pointer transition-all duration-200 ${
                compact ? 'py-1.5 px-3 rounded-full text-xs' : 'py-2.5 px-3.5 rounded-full text-sm'
              } ${
                isActive
                  ? 'font-semibold shadow-sm border'
                  : 'hover:bg-opacity-80'
              }`}
              style={{
                backgroundColor: isActive ? 'var(--container-high)' : 'transparent',
                borderColor: isActive ? 'var(--outline)' : 'transparent',
                color: isActive ? 'var(--on-surface)' : 'var(--on-surface-var)',
              }}
            >
              {/* Active Pill Indicator */}
              {isActive && (
                <div 
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-4 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              )}

              {/* Favicon or Initial Icon (Fully Rounded) */}
              {tab.favicon ? (
                <img 
                  src={tab.favicon} 
                  alt="" 
                  className="w-5 h-5 rounded-full object-contain flex-shrink-0 ml-1 border"
                  style={{ borderColor: 'var(--outline-var)' }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : tab.isLoaded ? (
                <div 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ml-1 border"
                  style={{ 
                    backgroundColor: 'var(--container)',
                    borderColor: 'var(--outline)',
                    color: 'var(--on-surface)'
                  }}
                >
                  {letter}
                </div>
              ) : (
                <Globe className="w-4 h-4 opacity-60 flex-shrink-0 ml-1" />
              )}

              {/* Tab Title */}
              <span className="flex-1 truncate pr-1">
                {tab.title || 'New Tab'}
              </span>

              {/* Close Button */}
              <button
                onClick={(e) => onCloseTab(tab.id, e)}
                className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-80 hover:!opacity-100 hover:bg-zinc-700 hover:text-white transition-all duration-150"
                title="Close Tab"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* New Tab Button */}
      <div className="p-3">
        <button
          onClick={onNewTab}
          className="w-full py-2.5 px-4 rounded-full font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] border"
          style={{ 
            backgroundColor: 'var(--accent)',
            borderColor: 'var(--outline)',
            color: 'var(--on-accent)',
            boxShadow: 'var(--shadow-1)'
          }}
        >
          <Plus className="w-4 h-4" />
          <span>New Tab</span>
        </button>
      </div>

      {/* Footer controls */}
      <div 
        className="p-3 border-t flex items-center gap-2"
        style={{ borderColor: 'var(--outline-var)' }}
      >
        <button
          onClick={onOpenSettings}
          className="flex-1 py-2 px-3 rounded-full flex items-center justify-center gap-2 text-xs font-bold transition-all duration-150 hover:bg-opacity-80 border"
          style={{ 
            backgroundColor: 'var(--container)', 
            borderColor: 'var(--outline-var)',
            color: 'var(--on-surface-var)' 
          }}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
};
