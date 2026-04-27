/* ============================================================
   state.js — Shared application state (ES module, mutable object)
   ============================================================ */

export const state = {
  // Catalog data
  allItems: [],
  filteredItems: [],
  itemByPath: new Map(),
  weekOrder: [],
  yearOrder: [],
  monthOrder: [],

  // Selection & sort
  selectedIds: new Set(),
  sortCols: [{ col: 'date', dir: 'desc' }],

  // Filter state
  searchQuery: '',
  activeSource: '',
  activeExt: '',
  showFavOnly: false,

  // Favorites
  favoritesSet: new Set(),

  // Detail panel
  activeDetailPath: null,

  // Auth token
  token: '',

  // Virtual scroll
  rafId: null,
  ROW_H: 40,
  BUFFER: 12,

  // Constants
  CAT_NAMES: { '01': '重点报告', '02': '国内券商', '03': '投行报告', '04': '小报告', '05': '杂货' },
  CAT_COLORS: { '01': 'var(--cat01)', '02': 'var(--cat02)', '03': 'var(--cat03)', '04': 'var(--cat04)', '05': 'var(--cat05)' },
  MAX_UPLOAD_PER_FILE: 8 * 1024 * 1024 * 1024,
  EXTRACT_DIR_KEY: 'doclib_extract_dir',

  // Platform
  _defaultExtractDir: '',
  _platform: 'Windows',

  // Sidebar filter state
  sidebarYearChecked: new Set(),
  sidebarMonthChecked: new Set(),
  sidebarWeekChecked: new Set(),
  sidebarCatChecked: new Set(['01', '02', '03', '04', '05']),

  // Internal flags
  _deleteUseBatch: false,

  // Upload queue
  uploadFiles: [],
};
