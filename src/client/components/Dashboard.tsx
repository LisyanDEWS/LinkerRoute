import React, { useState } from 'react';
import { Globe, ArrowRight, Plus } from 'lucide-react';
import { QuickLink } from '../types';
import { SearchEnginePicker } from './SearchEnginePicker';

interface DashboardProps {
  quickLinks: QuickLink[];
  searchEngine: string;
  onSelectSearchEngine: (engineId: string) => void;
  onNavigate: (url: string) => void;
  onOpenSettings: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  quickLinks,
  searchEngine,
  onSelectSearchEngine,
  onNavigate,
  onOpenSettings,
}) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onNavigate(query.trim());
    }
  };

  const displayedLinks = quickLinks.slice(0, 4);

  return (
    <div className="h-full w-full overflow-y-auto flex flex-col items-center justify-center p-6 md:p-12 relative select-none">
      <div className="relative z-10 flex flex-col items-center max-w-3xl w-full text-center">
        {/* Expressive M3 Monochrome Logo */}
        <div 
          className="w-20 h-20 rounded-full flex items-center justify-center shadow-md mb-6 border transition-all duration-300 hover:scale-105"
          style={{ 
            backgroundColor: 'var(--container-high)',
            borderColor: 'var(--outline)',
            color: 'var(--on-surface)'
          }}
        >
          <Globe className="w-10 h-10 opacity-90" />
        </div>

        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-8" style={{ color: 'var(--on-surface)' }}>
          LinkerRoute
        </h1>

        {/* Spacious Search / URL Bar with Compact Custom Search Engine Picker */}
        <div className="w-full max-w-2xl mb-10">
          <form onSubmit={handleSubmit} className="w-full">
            <div 
              className="flex items-center gap-3 px-4 py-3 rounded-full border shadow-sm transition-all duration-200 focus-within:ring-2"
              style={{ 
                backgroundColor: 'var(--surface)', 
                borderColor: 'var(--outline)',
                boxShadow: 'var(--shadow-2)',
              }}
            >
              {/* Custom Search Engine Dropdown */}
              <SearchEnginePicker
                selectedId={searchEngine}
                onSelect={onSelectSearchEngine}
              />

              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search or enter web address..."
                className="flex-1 bg-transparent border-none outline-none text-sm md:text-base font-medium px-1"
                style={{ color: 'var(--on-surface)' }}
                autoFocus
              />

              <button
                type="submit"
                disabled={!query.trim()}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:hover:scale-100 hover:scale-105 active:scale-95 flex-shrink-0"
                style={{ 
                  backgroundColor: 'var(--accent)', 
                  color: 'var(--on-accent)',
                  boxShadow: 'var(--shadow-1)'
                }}
                title="Go"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>

        {/* Quick Links Row */}
        <div className="w-full max-w-2xl">
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-70" style={{ color: 'var(--on-surface-var)' }}>
              Quick Launch
            </span>
            <button
              onClick={onOpenSettings}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-all duration-150 hover:bg-opacity-80 active:scale-95"
              style={{ 
                backgroundColor: 'var(--container)', 
                borderColor: 'var(--outline)',
                color: 'var(--on-surface)' 
              }}
            >
              <Plus className="w-3.5 h-3.5 opacity-80" />
              <span>Add Link</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 w-full">
            {displayedLinks.map((link, idx) => (
              <button
                key={idx}
                onClick={() => onNavigate(link.url)}
                className="flex flex-col items-center justify-center p-4 md:p-5 rounded-[28px] border transition-all duration-200 group hover:-translate-y-1 hover:shadow-md"
                style={{ 
                  backgroundColor: 'var(--surface)', 
                  borderColor: 'var(--outline-var)',
                  boxShadow: 'var(--shadow-1)'
                }}
              >
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg mb-2.5 shadow-sm transition-transform duration-200 group-hover:scale-110 border"
                  style={{ 
                    backgroundColor: 'var(--container-high)',
                    borderColor: 'var(--outline)',
                    color: 'var(--on-surface)'
                  }}
                >
                  {link.letter}
                </div>
                <span className="text-xs md:text-sm font-bold truncate max-w-[110px]" style={{ color: 'var(--on-surface)' }}>
                  {link.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

