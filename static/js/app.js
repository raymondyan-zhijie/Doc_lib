/* ============================================================
   app.js — State, init, utility functions, theme, extract dir
   ============================================================ */

// ======== STATE ========
let allItems=[], filteredItems=[], weekOrder=[], yearOrder=[], monthOrder=[], itemByPath=new Map();
let selectedIds=new Set(), sortCols=[{col:'date',dir:'desc'}], searchQuery='';
let activeCats=new Set(['01','02','03','04','05']), activeSource='', activeExt='', showFavOnly=false;
let favoritesSet=new Set();
let activeDetailPath=null;
let token='';
let rafId;

const ROW_H=40, BUFFER=12;
const CAT_NAMES={'01':'重点报告','02':'国内券商','03':'投行报告','04':'小报告','05':'杂货'};
const CAT_COLORS={'01':'var(--cat01)','02':'var(--cat02)','03':'var(--cat03)','04':'var(--cat04)','05':'var(--cat05)'};
const MAX_UPLOAD_PER_FILE = 8 * 1024 * 1024 * 1024;

// ======== INIT ========
async function init(){
  try{
    initExtractDir();
    const [catalogResp, favResp, cfgResp] = await Promise.all([
      fetch('/api/catalog'),
      fetch('/api/favorites'),
      fetch('/api/config'),
    ]);
    allItems = await catalogResp.json();
    const favs = await favResp.json();
    const cfg = await cfgResp.json();
    token = cfg.token || '';
    favs.forEach(f => favoritesSet.add(f.work_path));

    allItems.forEach(c => { itemByPath.set(c.work_path, c); });
    const ws = new Set(allItems.map(c=>c.week));
    weekOrder = [...ws].sort((a,b)=>{
      const ma=a.match(/(\d+)年(\d+)月第(\d+)周/), mb=b.match(/(\d+)年(\d+)月第(\d+)周/);
      if(!ma||!mb) return a.localeCompare(b);
      return (ma[1]-mb[1])||(ma[2]-mb[2])||(ma[3]-mb[3]);
    });
    const yrs=new Set(), mons=new Set();
    weekOrder.forEach(w=>{const m=w.match(/(\d+)年/);if(m)yrs.add(m[1]);});
    weekOrder.forEach(w=>{const m=w.match(/(\d+)年(\d+)月/);if(m)mons.add(m[2]+'月');});
    yearOrder=[...yrs].sort();
    monthOrder=[...mons].sort((a,b)=>parseInt(a)-parseInt(b));
    buildSidebar(); applyFilters();
    document.getElementById('loading').style.display='none';
    document.getElementById('app').style.display='flex';
    // Init dark mode
    if(localStorage.getItem('doclib-theme')==='dark'){
      document.documentElement.dataset.theme='dark';
      document.getElementById('darkModeBtn').classList.add('active');
    }
  }catch(e){
    document.getElementById('loading').innerHTML='<div style="color:#d13438">加载失败: '+e.message+'<br>请确保 server.py 正在运行</div>';
  }
}

// ======== UTILS ========
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtSize(b){
  if(b<1024)return b+' B';
  if(b<1048576)return(b/1024).toFixed(1)+' KB';
  if(b<1073741824)return(b/1048576).toFixed(1)+' MB';
  return(b/1073741824).toFixed(2)+' GB';
}

function showToast(msg,err){
  const c=document.getElementById('toastContainer'),el=document.createElement('div');
  el.className='toast'+(err?' error':'');
  el.textContent=msg;
  c.appendChild(el);
  setTimeout(()=>{
    el.style.animation='toast-out .2s ease forwards';
    setTimeout(()=>el.remove(),300);
  },2800);
}

function resolveItem(el){
  let wp;
  if(typeof el==='string'){wp=el;}
  else if(el&&el.dataset){wp=el.dataset.wp;}
  else{showToast('参数无效',true);return null;}
  const c=itemByPath.get(wp);
  if(!c){showToast('文件记录不存在',true);return null;}
  return c;
}

// ======== THEME ========
function toggleDarkMode(){
  const isDark=document.documentElement.dataset.theme==='dark';
  document.documentElement.dataset.theme=isDark?'light':'dark';
  document.getElementById('darkModeBtn').classList.toggle('active',!isDark);
  localStorage.setItem('doclib-theme',isDark?'light':'dark');
}

// ======== EXTRACT DIR ========
const EXTRACT_DIR_KEY='doclib_extract_dir';
let _defaultExtractDir='';
let _platform='Windows';

async function initExtractDir(){
  try{
    const r=await fetch('/api/config');
    const cfg=await r.json();
    _defaultExtractDir=cfg.default_extract_dir||'';
    _platform=cfg.platform||'Windows';
  }catch(e){_defaultExtractDir='';}
}

function getExtractDir(){
  let v=localStorage.getItem(EXTRACT_DIR_KEY);
  if(!v||!v.trim()){
    v=_defaultExtractDir||'extracted';
    if(v) localStorage.setItem(EXTRACT_DIR_KEY,v);
  }
  return v;
}

function saveExtractDir(v){localStorage.setItem(EXTRACT_DIR_KEY,v.trim());}

// ======== FAV TOGGLE (used by dialogs too) ========
async function toggleFav(wp){
  const c=itemByPath.get(wp); if(!c)return;
  if(favoritesSet.has(wp)){
    favoritesSet.delete(wp);
    await fetch(`/api/favorites?work_path=${encodeURIComponent(wp)}`,{method:'DELETE',headers:{'X-DocLib-Token':token}});
  } else {
    favoritesSet.add(wp);
    await fetch('/api/favorites',{method:'POST',headers:{'Content-Type':'application/json','X-DocLib-Token':token},body:JSON.stringify({filename:c.filename,work_path:wp})});
  }
  renderTable();
}

function toggleFavFilter(){
  showFavOnly=!showFavOnly;
  document.getElementById('favFilterBtn').classList.toggle('active',showFavOnly);
  applyFilters();
}
