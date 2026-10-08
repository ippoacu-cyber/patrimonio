// Guarda la app (no tus datos) para que abra rápido y sin conexión.
const C='patrimonio-v6';
const SHELL=['./','index.html','app.js','config.js','manifest.webmanifest','lib/msal-browser.min.js','lib/xlsx.full.min.js','lib/chart.umd.min.js','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','icons/favicon-32.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if (e.request.method!=='GET' || u.origin!==location.origin) return; // Graph y login nunca se guardan
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)));
});
