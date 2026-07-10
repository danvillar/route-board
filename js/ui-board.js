import {
  loadSites as dbLoadSites, dbInsert, dbUpdate, dbDelete,
  fetchServiceTypes, insertServiceTypes,
  fetchSiteServices, insertSiteService, updateSiteService, deleteSiteService,
  insertActivityLog
} from './db.js';
import { calc, todayMid, isoDate, daysUntil, proposeNextDue } from './schedule.js';
import { toast, showOverlay, wireModalDismiss } from './ui-modals.js';

const SERVICE_VISIT_NAME = 'Service visit';
const DEFAULT_SERVICE_TYPES = [
  { name: 'Service visit', kind: 'scheduled', defaultIntervalDays: 30 },
  { name: 'Legionella test', kind: 'scheduled', defaultIntervalDays: null },
  { name: 'Hyperchlorination', kind: 'scheduled', defaultIntervalDays: null },
  { name: 'Glycol test', kind: 'scheduled', defaultIntervalDays: null },
  { name: 'Boiler inspection', kind: 'scheduled', defaultIntervalDays: null },
  { name: 'Chiller inspection', kind: 'scheduled', defaultIntervalDays: null },
  { name: 'Dip slide read', kind: 'scheduled', defaultIntervalDays: 2 },
  { name: 'Corrosion coupon', kind: 'scheduled', defaultIntervalDays: null },
  { name: 'Phone call', kind: 'activity', defaultIntervalDays: null },
  { name: 'Install', kind: 'activity', defaultIntervalDays: null },
  { name: 'Delivery', kind: 'activity', defaultIntervalDays: null }
];
const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let sites = [];
let serviceTypes = [];
let siteServices = [];
let editingId = null;
let editingServiceId = null;
let servicesSiteId = null;
let loggingServiceId = null;
let dbOk = false;

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
    serviceTypes = await fetchServiceTypes();
    if (!serviceTypes.length) serviceTypes = await insertServiceTypes(DEFAULT_SERVICE_TYPES);
    siteServices = await fetchSiteServices();
    await migrateLegacyVisits();
    dbOk = true;
    setDbStatus('ok','Synced to database');
  }catch(error){
    dbOk = false;
    setDbStatus('bad','Database error — check connection');
    toast('Could not load sites: ' + error.message);
  }
  render();
}

async function migrateLegacyVisits(){
  const visitType = serviceTypes.find(t => t.name === SERVICE_VISIT_NAME);
  if (!visitType) return;
  const covered = new Set(siteServices.filter(s => s.serviceTypeId === visitType.id).map(s => s.siteId));
  for (const site of sites){
    if (covered.has(site.id) || !site.lastVisit || !site.freq) continue;
    await ensureServiceVisit(site, site.freq, site.lastVisit);
  }
}

async function ensureServiceVisit(site, freq, lastVisit){
  const visitType = serviceTypes.find(t => t.name === SERVICE_VISIT_NAME);
  if (!visitType) return;
  const created = await insertSiteService({
    siteId: site.id, serviceTypeId: visitType.id, cadenceMode: 'interval',
    intervalDays: freq, lastDone: lastVisit,
    nextDue: isoDate(calc({ freq, lastVisit }).due), active: true
  });
  siteServices.push(created);
}

function siteById(id){ return sites.find(s => s.id === id); }
function serviceTypeById(id){ return serviceTypes.find(t => t.id === id); }
function accounts(){
  return [...new Set(sites.map(s => (s.account||'').trim()).filter(Boolean))].sort();
}
function cities(){
  return [...new Set(sites.map(s => (s.city||'').trim()).filter(Boolean))].sort();
}
function cadenceLabel(svc){
  if (svc.cadenceMode === 'interval') return 'Every ' + (svc.intervalDays || '?') + ' days';
  if (svc.cadenceMode === 'months'){
    const names = (svc.months||[]).slice().sort((a,b)=>a-b).map(m => MONTH_NAMES[m]);
    return names.length ? names.join(', ') : 'Months';
  }
  return 'Manual';
}

/* ---------- render ---------- */
export function render(){
  const board = document.getElementById('board');
  document.getElementById('todayLabel').innerHTML =
    todayMid().toLocaleDateString(undefined,{weekday:'long'}).toUpperCase() + '<br>' +
    todayMid().toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});

  const filterRow = document.getElementById('filterRow');
  const sel = document.getElementById('acctFilter');
  const citySel = document.getElementById('cityFilter');
  const accts = accounts();
  const cityList = cities();
  const current = sel.value || '';
  const currentCity = citySel.value || '';
  if (accts.length > 1){
    sel.style.display = '';
    sel.innerHTML = '<option value="">All accounts</option>' +
      accts.map(a => `<option value="${esc(a)}" ${a===current?'selected':''}>${esc(a)}</option>`).join('');
  } else {
    sel.style.display = 'none';
    sel.innerHTML = '<option value=""></option>';
  }
  if (cityList.length > 1){
    citySel.style.display = '';
    citySel.innerHTML = '<option value="">All cities</option>' +
      cityList.map(c => `<option value="${esc(c)}" ${c===currentCity?'selected':''}>${esc(c)}</option>`).join('');
  } else {
    citySel.style.display = 'none';
    citySel.innerHTML = '<option value=""></option>';
  }
  filterRow.style.display = (accts.length > 1 || cityList.length > 1) ? '' : 'none';
  const filter = accts.length > 1 ? sel.value : '';
  const cityFilter = cityList.length > 1 ? citySel.value : '';

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

  const filteredSiteIds = new Set(sites.filter(s =>
    (!filter || (s.account||'').trim() === filter) &&
    (!cityFilter || (s.city||'').trim() === cityFilter)
  ).map(s => s.id));

  const visible = siteServices
    .filter(svc => filteredSiteIds.has(svc.siteId))
    .map(svc => ({ ...svc, site: siteById(svc.siteId), serviceType: serviceTypeById(svc.serviceTypeId), daysLeft: daysUntil(svc.nextDue) }))
    .filter(svc => svc.site && svc.serviceType);

  const sorted = visible.slice().sort((a,b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  const overdue  = sorted.filter(s => s.daysLeft != null && s.daysLeft < 0);
  const week     = sorted.filter(s => s.daysLeft != null && s.daysLeft >= 0 && s.daysLeft <= 7);
  const upcoming = sorted.filter(s => s.daysLeft == null || s.daysLeft > 7);

  setStats(
    siteServices.filter(s => { const d = daysUntil(s.nextDue); return d != null && d < 0; }).length,
    siteServices.filter(s => { const d = daysUntil(s.nextDue); return d != null && d >= 0 && d <= 7; }).length,
    sites.filter(s => s.reportPending).length
  );
  const na = accounts().length;
  document.getElementById('siteCount').textContent =
    sites.length + ' site' + (sites.length===1?'':'s') + (na ? ' · ' + na + ' account' + (na===1?'':'s') : '');

  let html = '';
  if (overdue.length)  html += groupHead('overdue','Overdue — go here first') + renderGroups(overdue);
  if (week.length)     html += groupHead('week','Due this week') + renderGroups(week);
  if (upcoming.length) html += groupHead('upcoming','On schedule') + renderGroups(upcoming);
  if (!html) html = '<div class="empty"><p>No services under this filter.</p></div>';
  board.innerHTML = html;
}
function groupHead(cls,label){ return `<div class="group ${cls}"><h3>${label}</h3><div class="rule"></div></div>`; }

function renderGroups(list){
  const groups = [];
  for (const svc of list){
    const last = groups[groups.length - 1];
    if (last && last.site.id === svc.site.id) last.services.push(svc);
    else groups.push({ site: svc.site, services: [svc] });
  }
  return groups.map(siteCard).join('');
}
function siteCard(group){
  const site = group.site;
  const anyOverdue = group.services.some(s => s.daysLeft != null && s.daysLeft < 0);
  const sysChips = (site.systems||[]).map(x => `<span class="chip sys">${esc(x)}</span>`).join('');
  return `<div class="card ${anyOverdue?'is-overdue':''}">
    <div class="card-top">
      <div>
        ${site.account ? `<div class="acct-eyebrow">${esc(site.account)}</div>` : ''}
        <div class="site-name">${esc(site.name)}</div>
        <div class="site-meta">
          ${site.city ? `<span class="chip">${esc(site.city)}</span>` : ''}
          ${sysChips}
        </div>
      </div>
      <button class="btn-small" onclick="openServices('${site.id}')">Services</button>
    </div>
    ${site.notes ? `<div class="note">${esc(site.notes)}</div>` : ''}
    ${group.services.map(svcRow).join('')}
    <div class="card-actions">
      <span style="flex:1"></span>
      <button class="btn-small" onclick="editSite('${site.id}')">Edit site</button>
      <button class="btn-small" onclick="removeSite('${site.id}')">Remove site</button>
    </div>
  </div>`;
}
function svcRow(svc){
  const d = svc.daysLeft;
  const tone = d == null ? 't-ok' : d < 0 ? 't-bad' : (d <= 7 ? 't-warn' : 't-ok');
  const dueTxt = d == null
    ? `<div class="due-num t-ok">—</div><div class="due-lbl">no date set</div>`
    : d < 0
    ? `<div class="due-num t-bad">${Math.abs(d)}d</div><div class="due-lbl">past due</div>`
    : d === 0
    ? `<div class="due-num t-warn">Today</div><div class="due-lbl">due</div>`
    : `<div class="due-num ${tone}">${d}d</div><div class="due-lbl">until due</div>`;
  const isVisit = svc.serviceType.name === SERVICE_VISIT_NAME;
  return `<div class="svc-row">
    <div class="svc-info">
      <div class="svc-name">${esc(svc.serviceType.name)}</div>
      <div class="svc-cadence">${esc(cadenceLabel(svc))}</div>
    </div>
    <div class="svc-due">${dueTxt}</div>
    <div class="svc-actions">
      <button class="btn-visit" onclick="logService('${svc.id}')">&#10003; Log</button>
      ${isVisit && svc.site.reportPending
        ? `<span class="report-flag">Report owed</span>
           <button class="btn-report" onclick="reportSent('${svc.site.id}')">Report sent</button>` : ''}
    </div>
  </div>`;
}
function setStats(o,w,r){
  document.getElementById('statOverdue').textContent = o;
  document.getElementById('statWeek').textContent = w;
  document.getElementById('statReports').textContent = r;
}

/* ---------- site-level actions ---------- */
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
  const backupSites = sites.slice();
  const backupServices = siteServices.slice();
  sites = sites.filter(x => x.id !== id);
  siteServices = siteServices.filter(x => x.siteId !== id);
  render();
  try{ await dbDelete(id); }
  catch(e){ sites = backupSites; siteServices = backupServices; render(); dbFail(e); }
}

/* ---------- add/edit site modal ---------- */
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
  document.getElementById('fCity').value = '';
  document.getElementById('fAddress').value = '';
  document.getElementById('fFreq').value = '30';
  document.getElementById('fNotes').value = '';
  document.getElementById('fLast').value = isoDate(todayMid());
  document.querySelectorAll('.sys-opt').forEach(b => b.classList.remove('on'));
  document.getElementById('freqRow').classList.remove('hidden');
  document.getElementById('freqEditNote').classList.add('hidden');
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
  document.getElementById('fCity').value = s.city || '';
  document.getElementById('fAddress').value = s.address || '';
  document.getElementById('fNotes').value = s.notes || '';
  document.querySelectorAll('.sys-opt').forEach(b =>
    b.classList.toggle('on', (s.systems||[]).includes(b.dataset.sys)));
  document.getElementById('freqRow').classList.add('hidden');
  document.getElementById('freqEditNote').classList.remove('hidden');
  fillAcctList();
  showOverlay('overlay', true);
}
export function closeModal(){ showOverlay('overlay', false); }

export async function saveSite(){
  const name = document.getElementById('fName').value.trim();
  if (!name){ toast('Give the site a name'); return; }
  const data = {
    name,
    account: document.getElementById('fAccount').value.trim(),
    city: document.getElementById('fCity').value.trim(),
    address: document.getElementById('fAddress').value.trim(),
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
      const freq = parseInt(document.getElementById('fFreq').value, 10);
      const lastVisit = document.getElementById('fLast').value;
      if (!lastVisit){ toast('Set the last visit date'); btn.disabled = false; return; }
      const saved = await dbInsert({ ...data, freq, lastVisit, reportPending:false });
      sites.push(saved);
      await ensureServiceVisit(saved, freq, lastVisit);
    }
    render(); closeModal();
    toast(data.name + ' saved to database');
  }catch(e){ dbFail(e); }
  btn.disabled = false;
}

/* ---------- manage a site's scheduled services ---------- */
export function openServices(siteId){
  const site = siteById(siteId); if(!site) return;
  servicesSiteId = siteId;
  document.getElementById('servicesTitle').textContent = site.name + ' — services';
  renderServiceList();
  resetServiceForm();
  showOverlay('servicesOverlay', true);
}
export function closeServices(){
  showOverlay('servicesOverlay', false);
  servicesSiteId = null;
}
function renderServiceList(){
  const list = siteServices.filter(s => s.siteId === servicesSiteId);
  const el = document.getElementById('serviceList');
  if (!list.length){
    el.innerHTML = '<p class="sub">No services yet — add one below.</p>';
    return;
  }
  el.innerHTML = list.map(svc => {
    const type = serviceTypeById(svc.serviceTypeId);
    return `<div class="service-item">
      <div>
        <div class="svc-name">${esc(type ? type.name : 'Unknown')}</div>
        <div class="meta">${esc(cadenceLabel(svc))} &middot; next due ${svc.nextDue ? esc(svc.nextDue) : 'not set'}</div>
      </div>
      <div class="svc-actions">
        <button class="btn-small" onclick="editService('${svc.id}')">Edit</button>
        <button class="btn-small" onclick="removeService('${svc.id}')">Remove</button>
      </div>
    </div>`;
  }).join('');
}
function updateCadenceFieldVisibility(){
  const mode = document.getElementById('svcCadenceMode').value;
  document.getElementById('svcIntervalField').classList.toggle('hidden', mode !== 'interval');
  document.getElementById('svcMonthsField').classList.toggle('hidden', mode !== 'months');
}
function resetServiceForm(){
  editingServiceId = null;
  document.getElementById('svcSaveBtn').textContent = 'Add service';
  document.getElementById('svcCancelBtn').classList.add('hidden');
  document.getElementById('svcTypeSelect').innerHTML = serviceTypes
    .filter(t => t.kind === 'scheduled')
    .map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  document.getElementById('svcCadenceMode').value = 'interval';
  document.getElementById('svcIntervalDays').value = 30;
  document.querySelectorAll('#monthPicker .sys-opt').forEach(b => b.classList.remove('on'));
  document.getElementById('svcNextDue').value = proposeNextDue('interval', 30, [], isoDate(todayMid()));
  updateCadenceFieldVisibility();
}
export function editService(id){
  const svc = siteServices.find(s => s.id === id); if(!svc) return;
  editingServiceId = id;
  document.getElementById('svcSaveBtn').textContent = 'Save changes';
  document.getElementById('svcCancelBtn').classList.remove('hidden');
  document.getElementById('svcTypeSelect').innerHTML = serviceTypes
    .filter(t => t.kind === 'scheduled')
    .map(t => `<option value="${t.id}" ${t.id===svc.serviceTypeId?'selected':''}>${esc(t.name)}</option>`).join('');
  document.getElementById('svcCadenceMode').value = svc.cadenceMode;
  document.getElementById('svcIntervalDays').value = svc.intervalDays || 30;
  document.querySelectorAll('#monthPicker .sys-opt').forEach(b =>
    b.classList.toggle('on', (svc.months||[]).includes(parseInt(b.dataset.month,10))));
  document.getElementById('svcNextDue').value = svc.nextDue || '';
  updateCadenceFieldVisibility();
}
export function cancelServiceEdit(){ resetServiceForm(); }

export async function saveService(){
  const serviceTypeId = document.getElementById('svcTypeSelect').value;
  const cadenceMode = document.getElementById('svcCadenceMode').value;
  const intervalDays = parseInt(document.getElementById('svcIntervalDays').value, 10);
  const months = [...document.querySelectorAll('#monthPicker .sys-opt.on')].map(b => parseInt(b.dataset.month,10));
  const nextDue = document.getElementById('svcNextDue').value;
  if (!serviceTypeId){ toast('Pick a service type'); return; }
  if (cadenceMode === 'interval' && !intervalDays){ toast('Set an interval in days'); return; }
  if (cadenceMode === 'months' && !months.length){ toast('Pick at least one month'); return; }
  if (!nextDue){ toast('Set the next due date'); return; }
  const data = { siteId: servicesSiteId, serviceTypeId, cadenceMode, intervalDays, months, nextDue, active: true };
  const btn = document.getElementById('svcSaveBtn');
  btn.disabled = true;
  try{
    if (editingServiceId){
      const existing = siteServices.find(s => s.id === editingServiceId);
      await updateSiteService(editingServiceId, { ...existing, ...data });
      Object.assign(existing, data);
    } else {
      const created = await insertSiteService(data);
      siteServices.push(created);
    }
    render(); renderServiceList(); resetServiceForm();
    toast('Service saved');
  }catch(e){ dbFail(e); }
  btn.disabled = false;
}
export async function removeService(id){
  const svc = siteServices.find(s => s.id === id); if(!svc) return;
  const type = serviceTypeById(svc.serviceTypeId);
  if (!confirm('Remove ' + (type ? type.name : 'this service') + ' from this site?')) return;
  const backup = siteServices.slice();
  siteServices = siteServices.filter(s => s.id !== id);
  render(); renderServiceList();
  try{ await deleteSiteService(id); }
  catch(e){ siteServices = backup; render(); renderServiceList(); dbFail(e); }
}

/* ---------- log a service visit ---------- */
export function logService(id){
  const svc = siteServices.find(s => s.id === id); if(!svc) return;
  loggingServiceId = id;
  const type = serviceTypeById(svc.serviceTypeId);
  document.getElementById('logTitle').textContent = 'Log ' + (type ? type.name : 'service');
  document.getElementById('logDate').value = isoDate(todayMid());
  document.getElementById('logNotes').value = '';
  document.getElementById('logNextDue').value = proposeNextDue(svc.cadenceMode, svc.intervalDays, svc.months, isoDate(todayMid()));
  showOverlay('logOverlay', true);
}
export function closeLog(){ showOverlay('logOverlay', false); loggingServiceId = null; }
export async function saveLog(){
  const svc = siteServices.find(s => s.id === loggingServiceId); if(!svc) return;
  const doneOn = document.getElementById('logDate').value;
  const notes = document.getElementById('logNotes').value.trim();
  const nextDue = document.getElementById('logNextDue').value;
  if (!doneOn){ toast('Set the date'); return; }
  const type = serviceTypeById(svc.serviceTypeId);
  const prev = { lastDone: svc.lastDone, nextDue: svc.nextDue };
  svc.lastDone = doneOn;
  svc.nextDue = nextDue || svc.nextDue;
  render();
  try{
    await updateSiteService(svc.id, svc);
    await insertActivityLog({ siteId: svc.siteId, siteServiceId: svc.id, label: type ? type.name : 'Service', doneOn, notes, nextDueSet: svc.nextDue });
    if (type && type.name === SERVICE_VISIT_NAME){
      const site = siteById(svc.siteId);
      if (site){ site.reportPending = true; await dbUpdate(site.id, site); }
    }
    closeLog();
    toast('Logged ' + (type ? type.name : 'service'));
  }catch(e){
    Object.assign(svc, prev);
    render();
    dbFail(e);
  }
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
    siteServices = [];
    for (const s of parsed){
      const saved = await dbInsert({
        account: s.account || '', name: s.name,
        city: s.city || '', address: s.address || '',
        systems: s.systems || [],
        freq: s.freq, lastVisit: s.lastVisit, notes: s.notes || '',
        reportPending: !!s.reportPending
      });
      restored.push(saved);
      await ensureServiceVisit(saved, s.freq, s.lastVisit);
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
document.getElementById('monthPicker').addEventListener('click', e => {
  const b = e.target.closest('.sys-opt'); if(b) b.classList.toggle('on');
});
document.getElementById('svcCadenceMode').addEventListener('change', updateCadenceFieldVisibility);
wireModalDismiss(['overlay','backupOverlay','restoreOverlay','servicesOverlay','logOverlay']);
