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
