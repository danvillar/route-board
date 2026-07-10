export function showOverlay(id, on){
  document.getElementById(id).classList.toggle('open', on);
}

export function wireModalDismiss(ids){
  ids.forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target.id === id) showOverlay(id, false);
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ids.forEach(id => showOverlay(id, false));
  });
}

let toastTimer;
export function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}
