/* Each tile is one frame of the reference video's brush, with black made transparent. */
window.InkTransition = (() => {
 const layer = document.getElementById('ink-transition');
 const canvas = layer.querySelector('canvas');
 const brush = new Image();
 brush.src = canvas.dataset.atlas;
 const ready = typeof brush.decode==='function' ? Promise.race([
  brush.decode().then(() => true, () => false),
  new Promise(resolve=>setTimeout(()=>resolve(false),1800))
 ]) : Promise.resolve(false);
 const paper = '#f6f5ed';
 const marker = 'naiwa.transition';
 const reduce = matchMedia('(prefers-reduced-motion: reduce)');
 let busy = false;

 function paint(frame) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (frame <= 0) return;
  if (frame >= 24) {
   ctx.fillStyle = paper;
   ctx.fillRect(0, 0, w, h);
   return;
  }
  const sw = brush.naturalWidth / 5, sh = brush.naturalHeight / 5;
  const scale = Math.max(w / sw, h / sh);
  ctx.drawImage(brush, frame % 5 * sw, Math.floor(frame / 5) * sh, sw, sh,
   (w - sw * scale) / 2, (h - sh * scale) / 2, sw * scale, sh * scale);
 }
 function show(frame) {
  if (!layer.open) layer.showModal();
  const scale = Math.min(1, 1280 / Math.max(innerWidth, innerHeight));
  canvas.width = Math.max(1, Math.round(innerWidth * scale));
  canvas.height = Math.max(1, Math.round(innerHeight * scale));
  paint(frame);
 }
 function animate(cover) {
  const start = performance.now();
  return new Promise(resolve => {
   function tick(now) {
    const t = Math.min(1, (now - start) / (cover ? 610 : 430));
    paint(Math.round(24 * (cover ? t : 1 - t)));
    if (t < 1) requestAnimationFrame(tick);
    else resolve();
   }
   requestAnimationFrame(tick);
  });
 }
 function finish() {
  if (layer.open) layer.close();
  document.documentElement.classList.remove('ink-arriving');
  busy = false;
 }
 layer.addEventListener('cancel', e => e.preventDefault());
 window.addEventListener('pageshow', e => { if (e.persisted) finish(); });

 async function run(change, leaving = false) {
  if (busy) return;
  busy = true;
  let handedOff = false;
  try {
   const enabled = !reduce.matches && !!layer.showModal && await ready;
   if (enabled) {
    show(0);
    await animate(true);
    if (leaving) {
     try { sessionStorage.setItem(marker, String(Date.now())); } catch {}
    } else {
     // Keep the covered frame above dialogs opened by the new screen.
     layer.close();
     document.documentElement.classList.add('ink-arriving');
    }
   }
   await change();
   handedOff = leaving;
   if (enabled && !leaving) {
    show(24);
    document.documentElement.classList.remove('ink-arriving');
    await animate(false);
   }
  } finally {
   if (!handedOff) finish();
  }
 }
 async function arrive() {
  if (!document.documentElement.classList.contains('ink-arriving')) return;
  busy = true;
  try {
   if (!reduce.matches && layer.showModal && await ready) {
    show(24);
    document.documentElement.classList.remove('ink-arriving');
    await animate(false);
   }
  } finally { finish(); }
 }
 return { run, leave: change => run(change, true), arrive, get busy() { return busy; } };
})();
