import { sb } from './config.js';

function rowToSite(r){
  return {
    id: r.id, account: r.account || '', name: r.name,
    city: r.city || '', address: r.address || '',
    systems: r.systems || [], freq: r.freq,
    lastVisit: r.last_visit, notes: r.notes || '',
    reportPending: !!r.report_pending
  };
}
function siteToRow(s){
  return {
    account: s.account || '', name: s.name,
    city: s.city || '', address: s.address || '',
    systems: s.systems || [],
    freq: s.freq, last_visit: s.lastVisit, notes: s.notes || '',
    report_pending: !!s.reportPending
  };
}

export async function loadSites(){
  const { data, error } = await sb.from('sites').select('*').order('last_visit');
  if (error) throw error;
  return data.map(rowToSite);
}
export async function dbInsert(site){
  const { data, error } = await sb.from('sites').insert(siteToRow(site)).select().single();
  if (error) throw error;
  return rowToSite(data);
}
export async function dbUpdate(id, site){
  const { error } = await sb.from('sites').update(siteToRow(site)).eq('id', id);
  if (error) throw error;
}
export async function dbDelete(id){
  const { error } = await sb.from('sites').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- service types ---------- */
function rowToServiceType(r){
  return { id: r.id, name: r.name, kind: r.kind, defaultIntervalDays: r.default_interval_days };
}
export async function fetchServiceTypes(){
  const { data, error } = await sb.from('service_types').select('*').order('kind').order('name');
  if (error) throw error;
  return data.map(rowToServiceType);
}
export async function insertServiceTypes(types){
  const rows = types.map(t => ({
    name: t.name, kind: t.kind, default_interval_days: t.defaultIntervalDays ?? null
  }));
  const { data, error } = await sb.from('service_types').insert(rows).select();
  if (error) throw error;
  return data.map(rowToServiceType);
}

/* ---------- site services (scheduled cadence) ---------- */
function rowToSiteService(r){
  return {
    id: r.id, siteId: r.site_id, serviceTypeId: r.service_type_id,
    cadenceMode: r.cadence_mode, intervalDays: r.interval_days,
    months: r.months || [], nextDue: r.next_due, lastDone: r.last_done,
    active: r.active
  };
}
function siteServiceToRow(s){
  return {
    site_id: s.siteId, service_type_id: s.serviceTypeId,
    cadence_mode: s.cadenceMode,
    interval_days: s.cadenceMode === 'interval' ? (s.intervalDays || null) : null,
    months: s.cadenceMode === 'months' && s.months && s.months.length ? s.months : null,
    next_due: s.nextDue || null, last_done: s.lastDone || null,
    active: s.active !== false
  };
}
export async function fetchSiteServices(){
  const { data, error } = await sb.from('site_services').select('*').eq('active', true);
  if (error) throw error;
  return data.map(rowToSiteService);
}
export async function insertSiteService(svc){
  const { data, error } = await sb.from('site_services').insert(siteServiceToRow(svc)).select().single();
  if (error) throw error;
  return rowToSiteService(data);
}
export async function updateSiteService(id, svc){
  const { error } = await sb.from('site_services').update(siteServiceToRow(svc)).eq('id', id);
  if (error) throw error;
}
export async function deleteSiteService(id){
  const { error } = await sb.from('site_services').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- activity log ---------- */
export async function insertActivityLog({ siteId, siteServiceId, label, doneOn, notes, nextDueSet }){
  const { error } = await sb.from('activity_log').insert({
    site_id: siteId, site_service_id: siteServiceId || null, label,
    done_on: doneOn, notes: notes || '', next_due_set: nextDueSet || null
  });
  if (error) throw error;
}
