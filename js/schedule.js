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
