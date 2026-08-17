import React, { useRef, useEffect } from 'react';
import { TabData, QuickLink } from '../types';
import { Dashboard } from './Dashboard';

interface TabViewportProps {
  tab: TabData;
  isActive: boolean;
  quickLinks: QuickLink[];
  searchEngine: string;
  onSelectSearchEngine: (engineId: string) => void;
  onNavigate: (url: string) => void;
  onOpenSettings: () => void;
  onFrameCreated: (tabId: string, frameObj: any) => void;
  onLoadFinished: (tabId: string) => void;
}

export const TabViewport: React.FC<TabViewportProps> = ({
  tab,
  isActive,
  quickLinks,
  searchEngine,
  onSelectSearchEngine,
  onNavigate,
  onOpenSettings,
  onFrameCreated,
  onLoadFinished,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Mount iframe when tab.frameObj is assigned
  useEffect(() => {
    if (tab.frameObj?.frame && containerRef.current) {
      if (!containerRef.current.contains(tab.frameObj.frame)) {
        const frame = tab.frameObj.frame;
        frame.id = 'ifr-' + tab.id;
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.border = 'none';
        
        frame.onload = () => {
          onLoadFinished(tab.id);
        };

        containerRef.current.appendChild(frame);
      }
    }
  }, [tab.frameObj, tab.id]);

  return (
    <div 
      className={`w-full h-full relative overflow-hidden ${isActive ? 'block' : 'hidden'}`}
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* If not loaded, show React Dashboard */}
      {!tab.isLoaded && (
        <Dashboard
          quickLinks={quickLinks}
          searchEngine={searchEngine}
          onSelectSearchEngine={onSelectSearchEngine}
          onNavigate={onNavigate}
          onOpenSettings={onOpenSettings}
        />
      )}

      {/* Frame Container for Scramjet proxy iframe */}
      <div 
        ref={containerRef}
        className={`w-full h-full ${tab.isLoaded ? 'block' : 'hidden'}`}
      />

      {/* Loading Spinner Overlay */}
      {tab.isLoading && (
        <div 
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs transition-opacity duration-200 pointer-events-none"
        >
          <div 
            className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mb-3 shadow-lg"
            style={{ 
              borderColor: 'var(--outline)',
              borderTopColor: 'var(--accent)'
            }}
          />
          <span className="text-xs font-bold px-3 py-1 rounded-full border shadow-sm" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--outline-var)', color: 'var(--on-surface)' }}>
            Routing through tunnel...
          </span>
        </div>
      )}
    </div>
  );
};
