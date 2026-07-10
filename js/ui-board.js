import { loadSites as dbLoadSites, dbInsert, dbUpdate, dbDelete } from './db.js';
import { calc, todayMid, isoDate } from './schedule.js';
import { toast, showOverlay, wireModalDismiss } from './ui-modals.js';

let sites = [];
let editingId = null;
let dbOk = false;

const fmt = d => d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
const freqName = n => ({15:'2x/month',30:'Monthly',61:'Every 2 mo',91:'Quarterly',182:'2x/year',365:'Annual'}[n] || n+' days');

function setDbStatus(state, msg){
  const el = document.getElementById('storageStatus');
  el.className = 'storage-status ' + state;
  el.textContent = msg;
}
function dbFail(e){
  setDbStatus('bad','Save failed — retry when back online');
  toast('Database error: ' + (e.message || e));
}

export async function loadSites(){
  setDbStatus('busy','Loading...');
  try{
    sites = await dbLoadSites();
    dbOk = true;
    setDbStatus('ok','Synced to database');
  }catch(error){
    dbOk = false;
    setDbStatus('bad','Database error — check connection');
    toast('Could not load sites: ' + error.message);
  }
  render();
}

function accounts(){
  return [...new Set(sites.map(s => (s.account||'').trim()).filter(Boolean))].sort();
}

/* ---------- render ---------- */
export function render(){
  const board = document.getElementById('board');
  document.getElementById('todayLabel').innerHTML =
    todayMid().toLocaleDateString(undefined,{weekday:'long'}).toUpperCase() + '<br>' +
    todayMid().toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});

  const filterRow = document.getElementById('filterRow');
  const sel = document.getElementById('acctFilter');
  const accts = accounts();
  const current = sel.value || '';
  if (accts.length > 1){
    filterRow.style.display = '';
    sel.innerHTML = '<option value="">All accounts</option>' +
      accts.map(a => `<option value="${esc(a)}" ${a===current?'selected':''}>${esc(a)}</option>`).join('');
  } else {
    filterRow.style.display = 'none';
    sel.innerHTML = '<option value=""></option>';
  }
  const filter = accts.length > 1 ? sel.value : '';

  if (!sites.length){
    board.innerHTML = `<div class="empty">
      <h3>No sites yet</h3>
      <p>Add each site that needs service — its account, visit frequency, and last visit date. The board sorts your week for you from there.</p>
      <button class="btn-primary" onclick="openModal()">+ Add your first site</button>
    </div>`;
    setStats(0,0,0);
    document.getElementById('siteCount').textContent = '0 sites';
    return;
  }

  const visible = sites.filter(s => !filter || (s.account||'').trim() === filter);
  const enriched = visible.map(s => ({...s, ...calc(s)})).sort((a,b) => a.daysLeft - b.daysLeft);
  const overdue  = enriched.filter(s => s.daysLeft < 0);
  const week     = enriched.filter(s => s.daysLeft >= 0 && s.daysLeft <= 7);
  const upcoming = enriched.filter(s => s.daysLeft > 7);

  const all = sites.map(s => ({...s, ...calc(s)}));
  setStats(
    all.filter(s => s.daysLeft < 0).length,
    all.filter(s => s.daysLeft >= 0 && s.daysLeft <= 7).length,
    sites.filter(s => s.reportPending).length
  );
  const na = accounts().length;
  document.getElementById('siteCount').textContent =
    sites.length + ' site' + (sites.length===1?'':'s') + (na ? ' &middot; '.replace('&middot;','·') + na + ' account' + (na===1?'':'s') : '');

  let html = '';
  if (overdue.length)  html += groupHead('overdue','Overdue — go here first') + overdue.map(card).join('');
  if (week.length)     html += groupHead('week','Due this week') + week.map(card).join('');
  if (upcoming.length) html += groupHead('upcoming','On schedule') + upcoming.map(card).join('');
  if (!html) html = '<div class="empty"><p>No sites under this account filter.</p></div>';
  board.innerHTML = html;
}
function groupHead(cls,label){ return `<div class="group ${cls}"><h3>${label}</h3><div class="rule"></div></div>`; }
function card(s){
  const tone = s.daysLeft < 0 ? 't-bad' : (s.daysLeft <= 7 ? 't-warn' : 't-ok');
  const dueTxt = s.daysLeft < 0
    ? `<div class="due-num t-bad">${Math.abs(s.daysLeft)}d</div><div class="due-lbl">past due</div>`
    : s.daysLeft === 0
    ? `<div class="due-num t-warn">Today</div><div class="due-lbl">visit due</div>`
    : `<div class="due-num ${tone}">${s.daysLeft}d</div><div class="due-lbl">until due</div>`;
  const ticks = Array.from({length:21}, () => '<i></i>').join('');
  const fillPct = Math.round(Math.min(s.elapsed,1)*100);
  const sysChips = (s.systems||[]).map(x => `<span class="chip sys">${esc(x)}</span>`).join('');
  return `<div class="card ${s.daysLeft<0?'is-overdue':''}">
    <div class="card-top">
      <div>
        ${s.account ? `<div class="acct-eyebrow">${esc(s.account)}</div>` : ''}
        <div class="site-name">${esc(s.name)}</div>
        <div class="site-meta">
          <span class="chip">${freqName(s.freq)}</span>
          ${sysChips}
          <span class="chip">Last: ${fmt(new Date(s.lastVisit+'T00:00:00'))}</span>
          <span class="chip">Next: ${fmt(s.due)}</span>
        </div>
      </div>
      <div class="due-block">${dueTxt}</div>
    </div>
    <div class="gauge" aria-hidden="true">
      <div class="gauge-track">
        <div class="gauge-bar"><div class="gauge-fill" style="width:${fillPct}%"></div></div>
        <div class="gauge-ticks">${ticks}</div>
      </div>
      <div class="gauge-labels"><span>LAST VISIT</span><span>${fillPct}% OF INTERVAL</span><span>DUE</span></div>
    </div>
    ${s.notes ? `<div class="note">${esc(s.notes)}</div>` : ''}
    <div class="card-actions">
      <button class="btn-visit" onclick="logVisit('${s.id}')">&#10003; Log visit today</button>
      ${s.reportPending
        ? `<span class="report-flag">Report owed</span>
           <button class="btn-report" onclick="reportSent('${s.id}')">Report sent</button>` : ''}
      <span style="flex:1"></span>
      <button class="btn-small" onclick="editSite('${s.id}')">Edit</button>
      <button class="btn-small" onclick="removeSite('${s.id}')">Remove</button>
    </div>
  </div>`;
}
function setStats(o,w,r){
  document.getElementById('statOverdue').textContent = o;
  document.getElementById('statWeek').textContent = w;
  document.getElementById('statReports').textContent = r;
}

/* ---------- actions ---------- */
export async function logVisit(id){
  const s = sites.find(x => x.id === id); if(!s) return;
  const prev = { lastVisit: s.lastVisit, reportPending: s.reportPending };
  s.lastVisit = isoDate(todayMid());
  s.reportPending = true;
  render();
  try{ await dbUpdate(id, s); toast('Visit logged — report now owed for ' + s.name); }
  catch(e){ Object.assign(s, prev); render(); dbFail(e); }
}
export async function reportSent(id){
  const s = sites.find(x => x.id === id); if(!s) return;
  s.reportPending = false;
  render();
  try{ await dbUpdate(id, s); toast('Report cleared for ' + s.name); }
  catch(e){ s.reportPending = true; render(); dbFail(e); }
}
export async function removeSite(id){
  const s = sites.find(x => x.id === id); if(!s) return;
  if (!confirm('Remove ' + s.name + ' from the route board?')) return;
  const backup = sites.slice();
  sites = sites.filter(x => x.id !== id);
  render();
  try{ await dbDelete(id); }
  catch(e){ sites = backup; render(); dbFail(e); }
}

/* ---------- add/edit modal ---------- */
function fillAcctList(){
  document.getElementById('acctList').innerHTML =
    accounts().map(a => `<option value="${esc(a)}">`).join('');
}
export function openModal(){
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add site';
  document.getElementById('saveBtn').textContent = 'Add to sites';
  document.getElementById('fAccount').value = '';
  document.getElementById('fName').value = '';
  document.getElementById('fFreq').value = '30';
  document.getElementById('fNotes').value = '';
  document.getElementById('fLast').value = isoDate(todayMid());
  document.querySelectorAll('.sys-opt').forEach(b => b.classList.remove('on'));
  fillAcctList();
  showOverlay('overlay', true);
}
export function editSite(id){
  const s = sites.find(x => x.id === id); if(!s) return;
  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit site';
  document.getElementById('saveBtn').textContent = 'Save changes';
  document.getElementById('fAccount').value = s.account || '';
  document.getElementById('fName').value = s.name;
  document.getElementById('fFreq').value = s.freq;
  document.getElementById('fLast').value = s.lastVisit;
  document.getElementById('fNotes').value = s.notes || '';
  document.querySelectorAll('.sys-opt').forEach(b =>
    b.classList.toggle('on', (s.systems||[]).includes(b.dataset.sys)));
  fillAcctList();
  showOverlay('overlay', true);
}
export function closeModal(){ showOverlay('overlay', false); }

export async function saveSite(){
  const name = document.getElementById('fName').value.trim();
  const lastVisit = document.getElementById('fLast').value;
  if (!name){ toast('Give the site a name'); return; }
  if (!lastVisit){ toast('Set the last visit date'); return; }
  const data = {
    name,
    account: document.getElementById('fAccount').value.trim(),
    freq: parseInt(document.getElementById('fFreq').value, 10),
    lastVisit,
    notes: document.getElementById('fNotes').value.trim(),
    systems: [...document.querySelectorAll('.sys-opt.on')].map(b => b.dataset.sys)
  };
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  try{
    if (editingId){
      const s = sites.find(x => x.id === editingId);
      Object.assign(s, data);
      await dbUpdate(editingId, s);
    } else {
      const saved = await dbInsert({ ...data, reportPending:false });
      sites.push(saved);
    }
    render(); closeModal();
    toast(data.name + ' saved to database');
  }catch(e){ dbFail(e); }
  btn.disabled = false;
}

/* ---------- backup / restore ---------- */
export function openBackup(){
  if (!sites.length){ toast('Nothing to back up yet'); return; }
  document.getElementById('backupText').value = JSON.stringify(sites);
  showOverlay('backupOverlay', true);
}
export function closeBackup(){ showOverlay('backupOverlay', false); }
export function copyBackup(){
  const ta = document.getElementById('backupText');
  ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
  const done = () => toast('Backup code copied');
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(ta.value).then(done).catch(() => {
      try{ document.execCommand('copy'); done(); }
      catch(e){ toast('Select the text and copy it manually'); }
    });
  } else {
    try{ document.execCommand('copy'); done(); }
    catch(e){ toast('Select the text and copy it manually'); }
  }
}
export function openRestore(){
  document.getElementById('restoreText').value = '';
  showOverlay('restoreOverlay', true);
}
export function closeRestore(){ showOverlay('restoreOverlay', false); }
export async function doRestore(){
  const raw = document.getElementById('restoreText').value.trim();
  if (!raw){ toast('Paste a backup code first'); return; }
  let parsed;
  try{ parsed = JSON.parse(raw); }
  catch(e){ toast("That doesn't look like a backup code"); return; }
  if (!Array.isArray(parsed) || !parsed.every(s => s && s.name && s.lastVisit && s.freq)){
    toast("That doesn't look like a backup code"); return;
  }
  if (sites.length && !confirm('Replace your current ' + sites.length + ' site(s) with this backup?')) return;
  setDbStatus('busy','Restoring...');
  try{
    for (const s of sites) await dbDelete(s.id);
    const restored = [];
    for (const s of parsed){
      restored.push(await dbInsert({
        account: s.account || '', name: s.name, systems: s.systems || [],
        freq: s.freq, lastVisit: s.lastVisit, notes: s.notes || '',
        reportPending: !!s.reportPending
      }));
    }
    sites = restored;
    setDbStatus('ok','Synced to database');
    render(); closeRestore();
    toast('Restored ' + sites.length + ' site' + (sites.length===1?'':'s'));
  }catch(e){ dbFail(e); loadSites(); }
}

/* ---------- misc ---------- */
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.getElementById('sysPicker').addEventListener('click', e => {
  const b = e.target.closest('.sys-opt'); if(b) b.classList.toggle('on');
});
wireModalDismiss(['overlay','backupOverlay','restoreOverlay']);
