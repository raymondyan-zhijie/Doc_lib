/* ============================================================
   utils.js — Pure utility functions (ES module, no circular deps)
   ============================================================ */

import { state } from './state.js';

// ======== HTML ESCAPE ========
export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ======== SIZE FORMAT ========
export function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

// ======== TOAST ========
export function showToast(msg, err) {
  const c = document.getElementById('toastContainer'), el = document.createElement('div');
  el.className = 'toast' + (err ? ' error' : '');
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out .2s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

// ======== RESOLVE ITEM ========
export function resolveItem(el) {
  let wp;
  if (typeof el === 'string') { wp = el; }
  else if (el && el.dataset) { wp = el.dataset.wp; }
  else { showToast('参数无效', true); return null; }
  const c = state.itemByPath.get(wp);
  if (!c) { showToast('文件记录不存在', true); return null; }
  return c;
}

// ======== THEME ========
export function toggleDarkMode() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
  document.getElementById('darkModeBtn').classList.toggle('active', !isDark);
  localStorage.setItem('doclib-theme', isDark ? 'light' : 'dark');
}

// ======== EXTRACT DIR ========
export async function initExtractDir() {
  try {
    const r = await fetch('/api/config');
    const cfg = await r.json();
    state._defaultExtractDir = cfg.default_extract_dir || '';
    state._platform = cfg.platform || 'Windows';
  } catch (e) { state._defaultExtractDir = ''; }
}

export function getExtractDir() {
  let v = localStorage.getItem(state.EXTRACT_DIR_KEY);
  if (!v || !v.trim()) {
    v = state._defaultExtractDir || 'extracted';
    if (v) localStorage.setItem(state.EXTRACT_DIR_KEY, v);
  }
  return v;
}

export function saveExtractDir(v) { localStorage.setItem(state.EXTRACT_DIR_KEY, v.trim()); }
