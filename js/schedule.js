export const DAY = 86400000;

export function todayMid(){ const d = new Date(); d.setHours(0,0,0,0); return d; }

export function isoDate(d){
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

export function calc(s){
  const last = new Date(s.lastVisit + 'T00:00:00');
  const due = new Date(last.getTime() + s.freq * DAY);
  const daysLeft = Math.round((due - todayMid()) / DAY);
  const elapsed = Math.min(Math.max((s.freq - daysLeft) / s.freq, 0), 1);
  return { due, daysLeft, elapsed };
}

/* site_services.next_due is always authoritative for board urgency. */
export function daysUntil(dateStr){
  if (!dateStr) return null;
  return Math.round((new Date(dateStr + 'T00:00:00') - todayMid()) / DAY);
}

/* Propose the next next_due when logging a service. interval: done_on + N days.
   months: the next occurrence after done_on (day defaults to the 1st). manual: no proposal. */
export function proposeNextDue(cadenceMode, intervalDays, months, doneOn){
  const done = new Date(doneOn + 'T00:00:00');
  if (cadenceMode === 'interval' && intervalDays){
    return isoDate(new Date(done.getTime() + intervalDays * DAY));
  }
  if (cadenceMode === 'months' && months && months.length){
    const sorted = [...months].sort((a,b) => a-b);
    const y = done.getFullYear(), m = done.getMonth() + 1;
    let nextMonth = sorted.find(mo => mo > m);
    let nextYear = y;
    if (nextMonth === undefined){ nextMonth = sorted[0]; nextYear = y + 1; }
    return nextYear + '-' + String(nextMonth).padStart(2,'0') + '-01';
  }
  return '';
}
