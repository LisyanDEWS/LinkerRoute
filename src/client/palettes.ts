import { ColorPalette } from './types';

export const PALETTES: ColorPalette[] = [
  {
    id: 'monochrome',
    name: 'Monochrome Onyx',
    primary: '#e2e8f0',
    secondary: '#cbd5e1',
    tertiary: '#94a3b8',
    darkBg: '#09090b',
    lightBg: '#f8fafc',
  },
  {
    id: 'charcoal',
    name: 'Charcoal Dark',
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    tertiary: '#64748b',
    darkBg: '#0f0f11',
    lightBg: '#f1f5f9',
  },
  {
    id: 'silver',
    name: 'Silver Chrome',
    primary: '#ffffff',
    secondary: '#e2e8f0',
    tertiary: '#cbd5e1',
    darkBg: '#121214',
    lightBg: '#ffffff',
  },
  {
    id: 'graphite',
    name: 'Graphite Slate',
    primary: '#d1d5db',
    secondary: '#9ca3af',
    tertiary: '#6b7280',
    darkBg: '#0b0c0e',
    lightBg: '#f3f4f6',
  },
];

export function applyM3Theme(theme: 'dark' | 'light', paletteId: string) {
  const p = PALETTES.find(x => x.id === paletteId) || PALETTES[0];
  const root = document.documentElement;

  root.setAttribute('data-theme', theme);
  root.style.setProperty('--accent', p.primary);
  root.style.setProperty('--on-accent', theme === 'dark' ? '#09090b' : '#ffffff');
  root.style.setProperty('--accent-secondary', p.secondary);
  root.style.setProperty('--accent-tertiary', p.tertiary);

  if (theme === 'dark') {
    root.style.setProperty('--bg', p.darkBg || '#09090b');
    root.style.setProperty('--surface-dim', '#121215');
    root.style.setProperty('--surface', '#18181b');
    root.style.setProperty('--surface-bright', '#27272a');
    root.style.setProperty('--container', '#202024');
    root.style.setProperty('--container-high', '#2d2d32');
    root.style.setProperty('--card-bg', '#18181b');
    root.style.setProperty('--panel-bg', '#121215');
    root.style.setProperty('--on-surface', '#f8fafc');
    root.style.setProperty('--on-surface-var', '#a1a1aa');
    root.style.setProperty('--outline', '#3f3f46');
    root.style.setProperty('--outline-var', '#27272a');
    root.style.setProperty('--shadow-1', '0 2px 4px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)');
    root.style.setProperty('--shadow-2', '0 8px 24px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)');
    root.style.setProperty('--shadow-3', '0 20px 50px rgba(0,0,0,0.7), 0 8px 16px rgba(0,0,0,0.5)');
    root.style.backgroundColor = p.darkBg || '#09090b';
    root.style.color = '#f8fafc';
  } else {
    root.style.setProperty('--bg', p.lightBg || '#f8fafc');
    root.style.setProperty('--surface-dim', '#f1f5f9');
    root.style.setProperty('--surface', '#ffffff');
    root.style.setProperty('--surface-bright', '#ffffff');
    root.style.setProperty('--container', '#f1f5f9');
    root.style.setProperty('--container-high', '#e2e8f0');
    root.style.setProperty('--card-bg', '#ffffff');
    root.style.setProperty('--panel-bg', '#f8fafc');
    root.style.setProperty('--on-surface', '#09090b');
    root.style.setProperty('--on-surface-var', '#71717a');
    root.style.setProperty('--outline', '#e4e4e7');
    root.style.setProperty('--outline-var', '#f4f4f5');
    root.style.setProperty('--shadow-1', '0 2px 6px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)');
    root.style.setProperty('--shadow-2', '0 8px 20px rgba(0,0,0,0.07), 0 2px 6px rgba(0,0,0,0.04)');
    root.style.setProperty('--shadow-3', '0 16px 40px rgba(0,0,0,0.1), 0 6px 12px rgba(0,0,0,0.06)');
    root.style.backgroundColor = p.lightBg || '#f8fafc';
    root.style.color = '#09090b';
  }
}
