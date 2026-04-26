/* ============================================================
   app.js — Entry point, init, application wiring (ES module)
   ============================================================ */

import { state } from './state.js';
import { esc, fmtSize, showToast, resolveItem, toggleDarkMode, initExtractDir, getExtractDir, saveExtractDir } from './utils.js';
import { buildSidebar, buildYearNav, buildMonthNav, buildCatNav, buildExtNav,
         toggleYearNav, toggleMonthNav, toggleCatNav,
         rebuildSidebarCascade, monthSelAll, monthSelNone,
         clearMonthFilter, clearYearFilter, clearSearch, clearSourceFilter,
         clearExtFilter, clearCatChip, applyFilters, applySort,
         yearSelectAll, yearSelectFirst,
         updateSourceNav } from './filters.js';
import { renderTable, onScroll, initColumnResize, toggleSel, updateSelection, updateStatusBar } from './table.js';
import { previewFile, extractFile, confirmDelete, showDeleteDialog, closeDeleteDialog,
         confirmDeleteAction, batchRecycle, showDetail, closeDetail, openFile,
         showBatchDialog, setBatchDir, closeBatchDialog, startBatchExtract,
         showHistory, closeHistory, showStats, closeStats,
         toggleExtractDir, openExtractDir, closeAllPanels } from './dialogs.js';
import { showUploadDialog, closeUploadDialog, handleFileDrop, handleFileSelect,
         addUploadFiles, removeUploadFile, refreshUploadQueue, startUpload } from './upload.js';

// ======== window.DL dispatch — makes module functions visible to inline onclick handlers ========
window.DL = {
  // utils
  esc, fmtSize, showToast, resolveItem, toggleDarkMode, getExtractDir, saveExtractDir,
  // filters
  buildSidebar, toggleYearNav, toggleMonthNav, toggleCatNav,
  rebuildSidebarCascade, monthSelAll, monthSelNone,
  clearMonthFilter, clearYearFilter, clearSearch, clearSourceFilter,
  clearExtFilter, clearCatChip, applyFilters,
  yearSelectAll, yearSelectFirst,
  // table
  renderTable, onScroll, initColumnResize, toggleSel, updateSelection,
  // dialogs
  previewFile, extractFile, confirmDelete, showDeleteDialog, closeDeleteDialog,
  confirmDeleteAction, batchRecycle, showDetail, closeDetail, openFile,
  showBatchDialog, setBatchDir, closeBatchDialog, startBatchExtract,
  showHistory, closeHistory, showStats, closeStats,
  toggleExtractDir, openExtractDir, closeAllPanels,
  // upload
  showUploadDialog, closeUploadDialog, handleFileDrop, handleFileSelect,
  removeUploadFile, startUpload,
  // app
  init, toggleFav, toggleFavFilter, clearSel, showRecycleStatus,
};

// ======== FAV TOGGLE (needs renderTable from table.js) ========
export async function toggleFav(wp) {
  const c = state.itemByPath.get(wp); if (!c) return;
  if (state.favoritesSet.has(wp)) {
    state.favoritesSet.delete(wp);
    await fetch('/api/favorites?work_path=' + encodeURIComponent(wp), { method: 'DELETE', headers: { 'X-DocLib-Token': state.token } });
  } else {
    state.favoritesSet.add(wp);
    await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DocLib-Token': state.token }, body: JSON.stringify({ filename: c.filename, work_path: wp }) });
  }
  renderTable();
}

export function toggleFavFilter() {
  state.showFavOnly = !state.showFavOnly;
  document.getElementById('favFilterBtn').classList.toggle('active', state.showFavOnly);
  applyFilters();
}

export function clearSel() {
  state.selectedIds.clear();
  updateSelection();
  renderTable();
}

export function showRecycleStatus() {
  showToast('回收站位于: work/.recycle_bin/ （可手动恢复文件）');
}

// ======== INIT ========
export async function init() {
  try {
    initExtractDir();
    const [catalogResp, favResp, cfgResp] = await Promise.all([
      fetch('/api/catalog'),
      fetch('/api/favorites'),
      fetch('/api/config'),
    ]);
    state.allItems = await catalogResp.json();
    const favs = await favResp.json();
    const cfg = await cfgResp.json();
    state.token = cfg.token || '';
    favs.forEach(f => state.favoritesSet.add(f.work_path));

    state.allItems.forEach(c => { state.itemByPath.set(c.work_path, c); });
    const ws = new Set(state.allItems.map(c => c.week));
    state.weekOrder = [...ws].sort((a, b) => {
      const ma = a.match(/(\d+)年(\d+)月第(\d+)周/), mb = b.match(/(\d+)年(\d+)月第(\d+)周/);
      if (!ma || !mb) return a.localeCompare(b);
      return (ma[1] - mb[1]) || (ma[2] - mb[2]) || (ma[3] - mb[3]);
    });
    const yrs = new Set(), mons = new Set();
    state.weekOrder.forEach(w => { const m = w.match(/(\d+)年/); if (m) yrs.add(m[1]); });
    state.weekOrder.forEach(w => { const m = w.match(/(\d+)年(\d+)月/); if (m) mons.add(m[2] + '月'); });
    state.yearOrder = [...yrs].sort();
    state.monthOrder = [...mons].sort((a, b) => parseInt(a) - parseInt(b));
    state.sidebarYearChecked = new Set(state.yearOrder);
    state.sidebarCatChecked = new Set(['01', '02', '03', '04', '05']);
    buildSidebar(); applyFilters();
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    if (localStorage.getItem('doclib-theme') === 'dark') {
      document.documentElement.dataset.theme = 'dark';
      document.getElementById('darkModeBtn').classList.add('active');
    }
  } catch (e) {
    document.getElementById('loading').innerHTML = '<div style="color:#d13438">加载失败: ' + e.message + '<br>请确保 server.py 正在运行</div>';
  }
}

// ======== BOOTSTRAP ========
document.addEventListener('DOMContentLoaded', () => {
  init();

  const tableBody = document.getElementById('tableBody');
  const tableHeader = document.getElementById('tableHeader');
  tableBody.addEventListener('scroll', () => {
    tableHeader.scrollLeft = tableBody.scrollLeft;
    onScroll();
  });

  let st;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(st);
    st = setTimeout(() => { state.searchQuery = e.target.value.trim(); applyFilters(); }, 300);
  });

  document.getElementById('sourceSel').addEventListener('change', e => { state.activeSource = e.target.value; applyFilters(); });
  document.getElementById('extNav').addEventListener('change', e => { state.activeExt = e.target.value; applyFilters(); });

  document.querySelectorAll('#tableHeader .col[data-sort]').forEach(col => {
    col.addEventListener('click', e => {
      const key = col.dataset.sort, shift = e.shiftKey;
      if (shift) {
        const existing = state.sortCols.findIndex(s => s.col === key);
        if (existing >= 0) { state.sortCols[existing].dir = state.sortCols[existing].dir === 'asc' ? 'desc' : 'asc'; }
        else { state.sortCols.push({ col: key, dir: key === 'date' || key === 'size' ? 'desc' : 'asc' }); }
      } else {
        const existing = state.sortCols.find(s => s.col === key);
        if (existing) { state.sortCols = [{ col: key, dir: existing.dir === 'asc' ? 'desc' : 'asc' }]; }
        else { state.sortCols = [{ col: key, dir: key === 'date' || key === 'size' ? 'desc' : 'asc' }]; }
      }
      applyFilters();
    });
  });

  document.getElementById('selectAll').addEventListener('change', e => {
    if (e.target.checked) state.filteredItems.forEach(c => state.selectedIds.add(c.work_path));
    else state.selectedIds.clear();
    updateSelection(); renderTable();
  });

  document.getElementById('batchBtn').addEventListener('click', showBatchDialog);
  document.getElementById('batchDelBtn').addEventListener('click', batchRecycle);
  document.getElementById('batchStartBtn').addEventListener('click', startBatchExtract);
  document.getElementById('batchCancelBtn').addEventListener('click', closeBatchDialog);

  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.getElementById('detailOverlay').addEventListener('click', closeDetail);
  document.getElementById('statsClose').addEventListener('click', closeStats);
  document.getElementById('statsOverlay').addEventListener('click', closeStats);
  document.getElementById('historyClose').addEventListener('click', closeHistory);
  document.getElementById('historyOverlay').addEventListener('click', closeHistory);

  document.getElementById('uploadStartBtn').addEventListener('click', startUpload);
  document.getElementById('uploadCancelBtn').addEventListener('click', closeUploadDialog);
  document.getElementById('uploadDialog').addEventListener('click', function (e) { if (e.target === this) closeUploadDialog(); });

  const extInput = document.getElementById('extractDirInput');
  extInput.value = getExtractDir();
  extInput.addEventListener('change', () => saveExtractDir(extInput.value));
  extInput.addEventListener('blur', () => saveExtractDir(extInput.value));

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllPanels(); });

  initColumnResize();
  window.addEventListener('resize', () => renderTable());
});
