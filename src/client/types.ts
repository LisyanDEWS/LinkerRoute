export interface QuickLink {
  letter: string;
  name: string;
  url: string;
}

export interface TabData {
  id: string;
  title: string;
  url: string;
  lastUrl: string;
  isLoaded: boolean;
  isLoading: boolean;
  favicon: string | null;
  historyStack: string[];
  historyIndex: number;
  navigatingInHistory: boolean;
  expectingRedirect?: boolean;
  frameObj?: any;
}

export interface ProxySettings {
  compactTabs: boolean;
  theme: 'dark' | 'light';
  paletteId: string;
  searchEngine: string;
  quickLinks: QuickLink[];
}

export interface SearchEngine {
  id: string;
  name: string;
  template: string;
  description: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'duckduckgo', name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s', description: 'Privacy-focused search' },
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q=%s', description: 'Standard Web Search' },
  { id: 'bing', name: 'Microsoft Bing', template: 'https://www.bing.com/search?q=%s', description: 'Microsoft AI Search' },
  { id: 'startpage', name: 'Startpage', template: 'https://www.startpage.com/sp/search?query=%s', description: 'No tracking or IP logging' },
  { id: 'brave', name: 'Brave Search', template: 'https://search.brave.com/search?q=%s', description: 'Independent & private' },
];

export interface NodeStatus {
  status: string;
  uptime: string;
  uptime_seconds: number;
  active_connections: number;
  memory_usage: number;
  memory_mb: number;
  cpu_usage: number;
  version: string;
  node_version: string;
  pid: number;
  platform: string;
  arch: string;
}

export interface ColorPalette {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  tertiary: string;
  darkBg?: string;
  lightBg?: string;
}
