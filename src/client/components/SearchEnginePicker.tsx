import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Zap } from 'lucide-react';
import { SEARCH_ENGINES, SearchEngine } from '../types';

interface SearchEnginePickerProps {
  selectedId: string;
  onSelect: (engineId: string) => void;
  compact?: boolean;
}

export const SearchEnginePicker: React.FC<SearchEnginePickerProps> = ({
  selectedId,
  onSelect,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentEngine = SEARCH_ENGINES.find((e) => e.id === selectedId) || SEARCH_ENGINES[0];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative flex-shrink-0" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 rounded-full border transition-all duration-150 active:scale-95 ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
        } font-bold`}
        style={{
          backgroundColor: 'var(--container-high)',
          borderColor: 'var(--outline-var)',
          color: 'var(--on-surface)',
        }}
        title="Choose Search Engine"
      >
        <Zap className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} opacity-70`} />
        <span className="truncate max-w-[90px] sm:max-w-[120px]">{currentEngine.name}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} opacity-70`} />
      </button>

      {/* Styled M3 Popover Panel */}
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-2 w-56 sm:w-64 rounded-[22px] border shadow-2xl z-50 p-1.5 animate-fadeIn backdrop-blur-xl"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--outline)',
            boxShadow: 'var(--shadow-3)',
          }}
        >
          <div className="px-3 py-1.5 text-[10px] font-extrabold tracking-wider uppercase opacity-60 border-b mb-1" style={{ borderColor: 'var(--outline-var)', color: 'var(--on-surface-var)' }}>
            Search Engines
          </div>
          <div className="space-y-0.5">
            {SEARCH_ENGINES.map((engine) => {
              const isSelected = engine.id === selectedId;
              return (
                <button
                  key={engine.id}
                  type="button"
                  onClick={() => {
                    onSelect(engine.id);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-2xl text-left transition-colors duration-150 group"
                  style={{
                    backgroundColor: isSelected ? 'var(--container-high)' : 'transparent',
                    color: 'var(--on-surface)',
                  }}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="text-xs font-bold truncate group-hover:opacity-100">{engine.name}</div>
                    <div className="text-[10px] opacity-60 truncate">{engine.description}</div>
                  </div>
                  {isSelected && (
                    <div 
                      className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 border"
                      style={{ backgroundColor: 'var(--accent)', borderColor: 'var(--outline)', color: 'var(--on-accent)' }}
                    >
                      <Check className="w-2.5 h-2.5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
