(() => {
'use strict';
const S = {prod:{}, debts:{}, cfg:{ipc:4.9, ipcRef:'IPC', avisos:[]}, db:null, col:null, dl:null, mode:'cargando'};
const CATS = ['Inversión','Efectivo invertido','Efectivo'];
const CATVAR = {'Inversión':'--inv','Efectivo invertido':'--ei','Efectivo':'--ef'};
const TIPOS = ['Fondo','ETF','Acción','CFD','Cripto','Metal','Monetario','Seguro','Cuenta remunerada','Depósito','Cuenta corriente','Otro'];
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const eur = (n, d=0) => (n==null||isNaN(n)) ? '—' : new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
const pct = (n, d=1) => (n==null||!isFinite(n)) ? '—' : new Intl.NumberFormat('es-ES',{style:'percent',minimumFractionDigits:d,maximumFractionDigits:d,signDisplay:'exceptZero'}).format(n);
const today = () => new Date().toISOString().slice(0,10);
const D = s => new Date(s+'T12:00:00');
const days = (a,b) => (D(b)-D(a))/864e5;
const uid = () => Math.random().toString(36).slice(2,10);
const fdate = s => s ? D(s).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const sdate = s => s ? D(s).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '—';
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),2600)}

/* ---------- calculations ---------- */
function xirr(cfs){
  cfs = cfs.filter(c=>c.v && c.f).sort((a,b)=>a.f<b.f?-1:1);
  if (cfs.length<2 || !cfs.some(c=>c.v>0) || !cfs.some(c=>c.v<0)) return null;
  const t0 = cfs[0].f; const t = cfs.map(c=>days(t0,c.f)/365);
  if (t[t.length-1] < 1) return null;
  const f = r => cfs.reduce((s,c,i)=>s+c.v/Math.pow(1+r,t[i]),0);
  let lo=-0.99, hi=5, flo=f(lo), fhi=f(hi);
  if (flo*fhi>0) return null;
  for (let i=0;i<200;i++){const m=(lo+hi)/2, fm=f(m); if (Math.abs(fm)<1e-6) return m; if (flo*fm<0){hi=m;fhi=fm}else{lo=m;flo=fm}}
  return (lo+hi)/2;
}
function lastVal(p){ return (p.vals||[]).length ? p.vals[p.vals.length-1] : null }
function value(p){ if (p.estado==='cerrado') return 0; const v=lastVal(p); if (v) return v.v; return netIn(p) }
function netIn(p){ return (p.movs||[]).reduce((s,m)=>s+(m.tipo==='entrada'?m.imp:m.tipo==='salida'?-m.imp:0),0) }
function stats(p){
  const ent=(p.movs||[]).filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.imp,0);
  const sal=(p.movs||[]).filter(m=>m.tipo==='salida').reduce((s,m)=>s+m.imp,0);
  const v=value(p), lv=lastVal(p);
  const gan = (p.movs||[]).length ? v+sal-ent : null;
  const cfs=(p.movs||[]).filter(m=>m.imp).map(m=>({f:m.f,v:m.tipo==='entrada'?-m.imp:m.imp}));
  if (p.estado!=='cerrado' && v>0) cfs.push({f: lv? (lv.f>today()?lv.f:today()) : today(), v});
  const isE=x=>x&&(x==='Estimado'||x==='Dudoso'); const est=(p.movs||[]).some(m=>isE(m.fia)) || (p.vals||[]).some(x=>isE(x.fia));
  return {ent,sal,neto:ent-sal,v,gan,pct: ent>0&&gan!=null ? gan/ent : null, xirr: xirr(cfs), lv, est,
    coste: p.costePct!=null && p.estado!=='cerrado' ? v*p.costePct/100 : null,
    stale: lv && p.estado!=='cerrado' && v>0 ? days(lv.f,today()) : null};
}
function loanAt(d, date){
  const r=(+d.tin||0)/1200, n=+d.n||0, at=date||today(); const first=D(d.primerPago);
  let bal=+d.capital||0, cuota=+d.cuota||0, balAt=bal, cuotaAt=cuota, k=0, fut=0, fin=d.primerPago, rest=0;
  const ex=(d.extras||[]).slice().sort((a,b)=>a.f<b.f?-1:1); let ei=0;
  for (let i=0;i<n+600 && bal>0.005;i++){
    const pd=new Date(first); pd.setMonth(pd.getMonth()+i); const pds=pd.toISOString().slice(0,10);
    while (ei<ex.length && ex[ei].f<pds){ bal=Math.max(0,bal-ex[ei].imp); if (ex[ei].modo==='cuota'){ const m=Math.max(1,n-i); cuota=r?bal*r/(1-Math.pow(1+r,-m)):bal/m } if (ex[ei].f<=at){ balAt=bal; cuotaAt=cuota } ei++ }
    if (bal<=0.005) break;
    const it=bal*r; const pr=i>=n-1?bal:Math.min(bal,cuota-it); bal=Math.max(0,bal-pr); fin=pds;
    if (pds<=at){ k++; balAt=bal; cuotaAt=cuota } else { fut+=it; rest++ }
  }
  return {k, bal:balAt, restantes:rest, intereses:fut, fin, pctAmort: d.capital?1-balAt/d.capital:0, cuota:balAt>0.005?cuotaAt:0};
}
function lastUpdate(){ let m=null; for (const p of Object.values(S.prod)) for (const v of p.vals||[]) if(!m||v.f>m) m=v.f; return m }

/* monthly series */
function valueAt(p, date){
  if (p.apertura && date < p.apertura) return 0;
  const vs=p.vals||[];
  const F = d => (p.movs||[]).filter(m=>m.f<=d).reduce((s,m)=>s+(m.tipo==='entrada'?m.imp:m.tipo==='salida'?-m.imp:0),0);
  if (!vs.length) return Math.max(0, F(date));
  if (date < vs[0].f){
    const st=p.apertura||date; const w=Math.max(0,days(st,date))/Math.max(1,days(st,vs[0].f));
    return Math.max(0, F(date) + (vs[0].v - F(vs[0].f))*w);
  }
  let i=vs.length-1; while (i>0 && vs[i].f>date) i--;
  const a=vs[i];
  if (i===vs.length-1) return (p.estado==='cerrado' && a.v===0) ? 0 : Math.max(0, a.v + F(date) - F(a.f));
  const b=vs[i+1]; const w=days(a.f,date)/Math.max(1,days(a.f,b.f));
  return Math.max(0, a.v + (F(date)-F(a.f)) + (b.v - a.v - (F(b.f)-F(a.f)))*w);
}
/* ---------- storage: OneDrive (Microsoft Graph) ---------- */
const CFG = window.APP_CONFIG || {};
const SCOPES = ['User.Read','Files.ReadWrite.AppFolder'];
const FILE = encodeURIComponent(CFG.fileName || 'patrimonio.xlsx');
const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/' + FILE;
let MSAL=null, ACCOUNT=null, ETAG=null, dirty=false, saving=false, saveTimer=null, lastSync=null;
function setStatus(txt, ok){ const st=$('#status'); st.classList.toggle('ok',!!ok); st.querySelector('span').textContent=txt; const m=$('#mstatus'); if(m) m.textContent=txt }
async function token(){
  try { return (await MSAL.acquireTokenSilent({scopes:SCOPES, account:ACCOUNT})).accessToken }
  catch(e){
    dlog('Token silencioso falló: '+(e.errorCode||'')+' '+String(e.message||'').slice(0,100));
    if (loopCount(false)>2){ clearMsal(); showGate('El inicio de sesión se repite sin terminar ('+(e.errorCode||e.message||'error')+'). Cierra la app del todo y vuelve a abrirla desde Safari o Chrome.'); throw e }
    await MSAL.acquireTokenRedirect({scopes:SCOPES, account:ACCOUNT}); throw e
  }
}
async function graph(path, opts={}){
  const t=await token();
  return fetch(GRAPH+path, Object.assign({}, opts, {headers:Object.assign({Authorization:'Bearer '+t}, opts.headers||{})}));
}
async function pull(){
  setStatus('Leyendo OneDrive…');
  let meta; try{ meta=await graph('') }catch(e){ dlog('Lectura de OneDrive falló: '+String(e.message||e).slice(0,100)); throw e }
  dlog('OneDrive respondió: HTTP '+meta.status);
  if (meta.status===404){ S.mode='nuevo'; ETAG=null; setStatus('No hay Excel todavía en OneDrive'); render(); return }
  if (!meta.ok) throw new Error('graph_'+meta.status);
  const j=await meta.json(); ETAG=j.eTag;
  const dlu=j['@microsoft.graph.downloadUrl'];
  let r;
  try{ r = dlu ? await fetch(dlu,{cache:'no-store'}) : await graph(':/content') }
  catch(e){ dlog('Descarga del Excel falló ('+(dlu?'enlace directo':'Graph')+'): '+String(e.message||e).slice(0,100)); throw new Error('descarga_excel: '+(e.message||e)) }
  if(!r.ok){ dlog('Descarga del Excel: HTTP '+r.status); throw new Error('graph_'+r.status) }
  const st=stateFromWorkbook(await r.arrayBuffer());
  S.prod=st.prod; S.debts=st.debts; S.cfg=st.cfg; S.log=st.log||[]; S.mode='db'; dirty=false; lastSync=new Date();
  setStatus('Sincronizado '+lastSync.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}), true); render();
}
async function push(force=false){
  if (saving){ dirty=true; return }
  saving=true; dirty=false; setStatus('Guardando en OneDrive…');
  try{
    const headers={'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
    if (ETAG && !force) headers['If-Match']=ETAG;
    const r=await graph(':/content',{method:'PUT',headers,body:new Blob([workbookFromState()])});
    if (r.status===412){ saving=false; return conflict() }
    if (r.status===423){ saving=false; dirty=true; setStatus('El Excel está abierto en otro sitio; reintento en 30 s'); clearTimeout(saveTimer); saveTimer=setTimeout(()=>push(),30000); return }
    if (!r.ok) throw new Error('graph_'+r.status);
    const j=await r.json(); ETAG=j.eTag; lastSync=new Date(); S.mode='db';
    setStatus('Guardado '+lastSync.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}), true);
  }catch(e){ dirty=true; setStatus('No se ha podido guardar; reintento en 30 s'); clearTimeout(saveTimer); saveTimer=setTimeout(()=>push(),30000) }
  saving=false; if (dirty) schedule();
}
function schedule(){ dirty=true; clearTimeout(saveTimer); saveTimer=setTimeout(()=>push(),1200) }
async function conflict(){
  const keep=confirm('El Excel de OneDrive ha cambiado desde otro dispositivo.\n\nAceptar: sobrescribirlo con tus cambios de ahora.\nCancelar: descartar tus cambios y cargar la versión de OneDrive.');
  if (keep) return push(true);
  await pull(); toast('Cargada la versión de OneDrive');
}
async function persist(){ schedule() }
async function remove(){ schedule() }
async function load(){
  try{
    if (!CFG.clientId || String(CFG.clientId).startsWith('PEGA')){ showGate('Falta configurar la app: pega tu identificador de aplicación en config.js.'); return }
    const idleMs=(CFG.idleMinutes||15)*60000;
    let last=0; try{ last=+localStorage.getItem('pat_last')||0 }catch(e){}
    const volviendoDeLogin=/[#?&](code|error)=/.test(location.href);
    const modo=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone?'app instalada':'navegador';
    dlog('Inicio · '+modo+' · '+(volviendoDeLogin?'vuelve de Microsoft':'apertura normal')+(/error=/.test(location.href)?' · error='+decodeURIComponent((location.href.match(/error_description=([^&]*)/)||[])[1]||'').slice(0,120):''));
    if (last && Date.now()-last>idleMs && !volviendoDeLogin) clearMsal();
    MSAL=new msal.PublicClientApplication({auth:{clientId:CFG.clientId,authority:'https://login.microsoftonline.com/consumers',redirectUri:location.origin+location.pathname.replace(/index\.html$/,''),navigateToLoginRequestUrl:false},
      cache:{cacheLocation:'localStorage',temporaryCacheLocation:'localStorage',storeAuthStateInCookie:true}});
    await MSAL.initialize();
    let res=null;
    try{ res=await MSAL.handleRedirectPromise() }
    catch(e){ dlog('Fallo al procesar la respuesta: '+(e.errorCode||'')+' '+String(e.message||'').slice(0,120)); showGate('Microsoft no ha completado el inicio de sesión ('+(e.errorCode||e.message)+'). Pulsa Entrar de nuevo.'); return }
    dlog('Respuesta: '+(res?'recibida':'ninguna')+' · cuentas guardadas: '+MSAL.getAllAccounts().length);
    if (volviendoDeLogin){ try{ history.replaceState(null,'',location.pathname) }catch(e){} }
    ACCOUNT=res?.account || MSAL.getAllAccounts()[0] || null;
    if (!ACCOUNT){ showGate(); return }
    touch(); hideGate(); $('#who').textContent=ACCOUNT.username||'';
    await pull();
    loopCount(true);
    fetchIPC();
  }catch(e){ dlog('Error general: '+(e.errorCode||'')+' '+String(e.message||'').slice(0,120)); showGate('No se ha podido conectar con OneDrive ('+(e.errorCode||e.message||'error')+'). Vuelve a intentarlo.') }
}
function dlog(m){ try{ const a=JSON.parse(localStorage.getItem('pat_log')||'[]'); a.push(new Date().toLocaleTimeString('es-ES')+' '+m); localStorage.setItem('pat_log',JSON.stringify(a.slice(-20))) }catch(e){} }
function showLog(){ let a=[]; try{ a=JSON.parse(localStorage.getItem('pat_log')||'[]') }catch(e){} const el=document.getElementById('gatelog'); if(el) el.textContent=a.join('\n') }
function clearMsal(){ try{ Object.keys(localStorage).filter(k=>k!=='pat_loop'&&k!=='pat_last'&&/msal|login\.windows|microsoftonline|^[0-9a-f]{8}-/i.test(k)).forEach(k=>localStorage.removeItem(k)) }catch(e){} try{ sessionStorage.clear() }catch(e){} }
function touch(){ try{ localStorage.setItem('pat_last',String(Date.now())) }catch(e){} }
function loopCount(reset){ try{ if(reset){ localStorage.removeItem('pat_loop'); return 0 } const o=JSON.parse(localStorage.getItem('pat_loop')||'{"n":0,"t":0}'); const n=(Date.now()-o.t<180000?o.n:0)+1; localStorage.setItem('pat_loop',JSON.stringify({n,t:Date.now()})); return n }catch(e){ return 0 } }
function showGate(msg){ setTimeout(showLog,0); $('#gate').hidden=false; $('.app').hidden=true; $('#gatemsg').textContent=msg||'' }
function hideGate(){ $('#gate').hidden=true; $('.app').hidden=false }
function login(){ dlog('Pulsado Entrar'); if (loopCount(false)>3){ clearMsal(); loopCount(true); showGate('Se ha intentado entrar varias veces sin éxito. Cierra la app del todo y ábrela desde Safari o Chrome.'); return } MSAL.loginRedirect({scopes:SCOPES, prompt:'select_account'}) }
async function logout(){ const a=ACCOUNT; S.prod={}; S.debts={}; try{localStorage.removeItem('pat_last')}catch(e){} clearMsal(); await MSAL.logoutRedirect({account:a, postLogoutRedirectUri:location.origin+location.pathname.replace(/index\.html$/,'')}) }
let idle=null; function bumpIdle(){ if (ACCOUNT) touch(); clearTimeout(idle); idle=setTimeout(()=>{ if(!dirty){ S.prod={}; S.debts={}; clearMsal(); location.reload() } }, (CFG.idleMinutes||15)*60000) }
['click','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,bumpIdle,{passive:true})); bumpIdle();
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && ACCOUNT && !dirty && !saving && lastSync && (Date.now()-lastSync)>60000) pull().catch(()=>{}) });
window.addEventListener('beforeunload',e=>{ if(dirty||saving){ e.preventDefault(); e.returnValue='' } });
function pendingPeriodic(){
  const out=[]; const now=today();
  for (const p of Object.values(S.prod)){ const pr=p.periodica; if(!pr||p.estado==='cerrado'||!pr.hasta) continue;
    let d=D(pr.hasta); const step=()=>{ if(pr.frecuencia==='diaria') d.setDate(d.getDate()+1); else if(pr.frecuencia==='semanal') d.setDate(d.getDate()+7); else d.setMonth(d.getMonth()+1) };
    step(); let guard=0;
    while (d.toISOString().slice(0,10)<=now && guard++<800){ out.push({pid:p.id,f:d.toISOString().slice(0,10),imp:pr.importe}); step() } }
  return out;
}
function addMov(p, m){ p.movs=p.movs||[]; p.movs.push(m); p.movs.sort((a,b)=>a.f<b.f?-1:1) }
function bindForms(){
  const fv=$('#fval'); if (fv) fv.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fv); const fecha=f.get('fecha'); let n=0;
    for (const [k,v] of f.entries()){ if(!k.startsWith('v_')||v==='') continue; const p=S.prod[k.slice(2)]; const _o=lastVal(p)?.v; logChange('Actualizar valor','producto',p.id,p.nombre,`${_o!=null?eur(_o,2)+' → ':''}${eur(+v,2)}`,{f:fecha,antes:_o??'',despues:+v}); p.vals=(p.vals||[]).filter(x=>x.f!==fecha); p.vals.push({f:fecha,v:+v,fia:'Dato',fu:'Actualización manual'}); p.vals.sort((a,b)=>a.f<b.f?-1:1); await persist('p',p); n++ }
    actMode=null; render(); toast(n?`${n} valores guardados`:'No has cambiado ningún valor') };
  const fm=$('#fmov'); if (fm) fm.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fm); const p=S.prod[f.get('pid')]; const tipo=f.get('tipo'); const imp=+f.get('imp'); const precio=+f.get('precio')||null; const orig=f.get('orig');
    const ext = orig==='ext' ? (tipo==='entrada'?imp:-imp) : 0;
    addMov(p,{f:f.get('f'),tipo,imp,ext,cls:orig==='ext'?(tipo==='entrada'?'Dinero nuevo':'Retirada'):'Interno',fia:'Dato',mov:tipo==='entrada'?'Aportación':'Retirada',precio,uds:precio?imp/precio:null,nota:f.get('nota')||''});
    logChange(orig==='ext'?(tipo==='entrada'?'Aportación de dinero nuevo':'Retirada a cuenta corriente'):'Traspaso','producto',p.id,p.nombre,orig==='ext'?(f.get('nota')||''):(tipo==='entrada'?S.prod[orig].nombre+' → '+p.nombre:p.nombre+' → '+S.prod[orig].nombre),{f:f.get('f'),importe:tipo==='entrada'?imp:-imp});
    await persist('p',p);
    if (orig!=='ext' && S.prod[orig] && orig!==p.id){ const o=S.prod[orig]; addMov(o,{f:f.get('f'),tipo:tipo==='entrada'?'salida':'entrada',imp,ext:0,cls:'Interno',fia:'Dato',mov:tipo==='entrada'?`Hacia ${p.nombre}`:`Desde ${p.nombre}`,nota:''}); await persist('p',o) }
    actMode=null; render(); toast('Movimiento guardado') };
  const fn=$('#fnew'); if (fn) fn.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fn); const tipo=f.get('tipo'); const imp=+f.get('imp'); const precio=+f.get('precio')||null; const orig=f.get('orig'); const fecha=f.get('f');
    const p={id:uid(),nombre:f.get('nombre'),entidad:f.get('entidad'),tipo,categoria:catOf(tipo),traspasable:tipo==='Fondo',estado:'activo',costePct:f.get('coste')?+f.get('coste'):null,isin:f.get('isin')||'',nota:'',apertura:fecha,
      periodica: f.get('pimp')?{importe:+f.get('pimp'),frecuencia:f.get('pfreq'),hasta:fecha}:null,movs:[],vals:[{f:fecha,v:imp,fia:'Dato',fu:'Importe de apertura'}]};
    addMov(p,{f:fecha,tipo:'entrada',imp,ext:orig==='ext'?imp:0,cls:orig==='ext'?'Dinero nuevo':'Interno',fia:'Dato',mov:'Apertura',precio,uds:precio?imp/precio:null,nota:''});
    S.prod[p.id]=p; logChange('Nuevo producto','producto',p.id,p.nombre,`${tipo} en ${p.entidad}${orig!=='ext'&&S.prod[orig]?' · desde '+S.prod[orig].nombre:''}`,{f:fecha,importe:imp}); await persist('p',p);
    if (orig!=='ext' && S.prod[orig]){ const o=S.prod[orig]; addMov(o,{f:fecha,tipo:'salida',imp,ext:0,cls:'Interno',fia:'Dato',mov:`Hacia ${p.nombre}`,nota:''}); await persist('p',o) }
    actMode=null; render(); toast('Inversión creada') };
  const fc=$('#fclose'); if (fc) fc.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fc); const p=S.prod[f.get('pid')]; const imp=+f.get('imp'); const dest=f.get('dest'); const fecha=f.get('f');
    addMov(p,{f:fecha,tipo:'salida',imp,ext:dest==='ext'?-imp:0,cls:dest==='ext'?'Retirada':'Interno',fia:'Dato',mov:'Venta',nota:''});
    if (f.get('total')){ p.estado='cerrado'; p.cierre=fecha; p.vals=(p.vals||[]).filter(x=>x.f!==fecha); p.vals.push({f:fecha,v:0,fia:'Dato',fu:'Cierre'}); p.vals.sort((a,b)=>a.f<b.f?-1:1) }
    logChange(f.get('total')?'Cierre del producto':'Venta parcial','producto',p.id,p.nombre,dest==='ext'?'A cuenta corriente':'→ '+S.prod[dest].nombre,{f:fecha,importe:-imp});
    await persist('p',p);
    if (dest!=='ext' && S.prod[dest]){ const o=S.prod[dest]; addMov(o,{f:fecha,tipo:'entrada',imp,ext:0,cls:'Interno',fia:'Dato',mov:`Desde ${p.nombre}`,nota:''}); await persist('p',o) }
    actMode=null; render(); toast('Venta registrada') };
  const gp=$('#genper'); if (gp) gp.onclick=async()=>{ const pend=pendingPeriodic(); const by={};
    pend.forEach(x=>{ (by[x.pid]=by[x.pid]||[]).push(x) });
    for (const [pid,xs] of Object.entries(by)){ const p=S.prod[pid]; xs.forEach(x=>addMov(p,{f:x.f,tipo:'entrada',imp:x.imp,ext:x.imp,cls:'Dinero nuevo',fia:'Periódica',mov:'Aportación periódica',nota:''})); p.periodica.hasta=xs[xs.length-1].f; logChange('Aportaciones periódicas','producto',p.id,p.nombre,`${xs.length} aportaciones registradas`,{f:xs[xs.length-1].f,importe:xs.reduce((s,x)=>s+x.imp,0)}); await persist('p',p) }
    actMode=null; render(); toast(`${pend.length} aportaciones registradas`) };
}
/* ================== INTERFAZ (estilo app bancaria) ================== */
const CATCOL = {'Inversión':'--inv','Efectivo invertido':'--ei','Efectivo':'--ef'};
const ICON = {
  home:'<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  list:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l7 4.5"/></svg>',
  plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  chart:'<svg viewBox="0 0 24 24"><path d="M4 19h16M6 15l4-5 4 3 5-7"/></svg>',
  more:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  refresh:'<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
  down:'<svg viewBox="0 0 24 24"><path d="M12 4v13M6 11l6 6 6-6M5 20h14"/></svg>',
  up:'<svg viewBox="0 0 24 24"><path d="M12 20V7M6 13l6-6 6 6M5 4h14"/></svg>',
  repeat:'<svg viewBox="0 0 24 24"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg>',
  back:'<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  info:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg>',
  chev:'<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>'
};
const AVCOL=['#0666EB','#7B4DFF','#E8467C','#00A36C','#F08A24','#0BA5C9','#5B6B80','#C2410C','#1E3A8A','#191C1F','#2BB3A0','#B45309'];
const ENTCOL={};
function avatar(name, big){ const n=String(name||'?'); let h=0; for(const ch of n) h=(h*31+ch.charCodeAt(0))>>>0;
  const w=n.replace(/\(.*?\)/g,'').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]/g,'').split(/\s+/).filter(Boolean);
  const ini=(w.length>1?w[0][0]+w[1][0]:(w[0]||'?').slice(0,2)).toUpperCase();
  return `<span class="av${big?' big':''}" style="background:${ENTCOL[n]||AVCOL[h%AVCOL.length]}" aria-hidden="true">${esc(ini)}</span>` }

/* ---------- explicaciones: cada cifra es pulsable ---------- */
let XP=[];
function xi(key, ctx){ XP.push({key,ctx:ctx||{}}); return ` data-xi="${XP.length-1}" role="button" tabindex="0"` }
const pctTxt = n => n==null||!isFinite(n) ? '—' : pct(n).replace('+','');
const FIA = {'Dato':'sale de un documento oficial (extracto, certificado o informe del banco).','Dato tuyo':'lo apuntaste tú en tus Excel; no hay un documento que lo confirme.','Estimado':'es una reconstrucción aproximada: no había un documento con la cifra exacta.','Dudoso':'tiene alguna contradicción o le falta un dato clave; tómalo con cautela.','Periódica':'lo registró la app automáticamente por tu aportación periódica.'};
const CATTXT = {
  'Inversión':'Dinero puesto en cosas que suben y bajan de precio: fondos, ETF, acciones, cripto, metales o seguros de inversión. A largo plazo suele ganar más que una cuenta, pero puede perder valor.',
  'Efectivo invertido':'Dinero en cuentas remuneradas y depósitos. No baja de valor y te paga un interés, pero normalmente gana menos de lo que suben los precios.',
  'Efectivo':'Dinero en cuentas corrientes normales que no pagan nada. Es útil para el día a día, pero cada año compra un poco menos por culpa de la inflación.'};
function explain(key,c){
  const _r3=explain3(key,c); if(_r3) return _r3;
  const _r2=explain2(key,c); if(_r2) return _r2;
  if (key==='log') return {t:c.accion,v:c.importe!==''&&c.importe!=null?eur(+c.importe,2):'',what:`${esc(c.nombre||'')}${c.detalle?': '+esc(c.detalle):''}`,you:`Registrado el <b>${fdt(c.ts)}</b>${c.fecha_efecto?`, con fecha de efecto ${fdate(c.fecha_efecto)}`:''}.<br>Usuario: ${esc(c.usuario||'—')}<br>Dispositivo: ${esc(c.dispositivo||'—')}<br>Origen: ${esc(c.origen||'App')}${c.antes!==''&&c.antes!=null?`<br>Antes: ${typeof c.antes==='number'?eur(c.antes,2):esc(c.antes)}`:''}${c.despues!==''&&c.despues!=null?` · Después: ${typeof c.despues==='number'?eur(c.despues,2):esc(c.despues)}`:''}`,tip:'La bitácora guarda cada cambio que haces en la app, en la hoja "Bitacora" de tu Excel. Sirve para saber qué cambió, cuándo y desde qué dispositivo.'};
  const T=(t,v,what,you,tip)=>({t,v,what,you,tip});
  switch(key){
    case 'neto': return T('Patrimonio neto',eur(c.neto),'Es lo que te quedaría si hoy vendieras todo y pagaras todas tus deudas. Se suma todo lo que tienes y se resta lo que debes.',`Tienes ${eur(c.activos)} y debes ${eur(c.deuda)}.<br><b>${eur(c.activos)} − ${eur(c.deuda)} = ${eur(c.neto)}</b>`,'Usa el último valor que metiste de cada producto. Si alguno lleva tiempo sin actualizar, esta cifra puede no ser exacta.');
    case 'gan_total': return T('Ganancia acumulada',eur(c.gan),'Lo que ha crecido tu dinero por encima de lo que pusiste de tu bolsillo. Si metiste 100 € y ahora tienes 120 €, has ganado 20 €.',`Lo que vale hoy lo invertido: ${eur(c.tv)}.<br>Lo que pusiste de tu bolsillo (menos lo que sacaste): ${eur(c.ext)}.<br><b>${eur(c.tv)} − ${eur(c.ext)} = ${eur(c.gan)}</b>`,'Es antes de impuestos e incluye importes estimados, así que es aproximada.');
    case 'xirr_total': return T('Rentabilidad anual',pct(c.x),'Cuánto ha crecido tu dinero de media cada año, teniendo en cuenta cuándo metiste cada euro. Un euro que metiste el mes pasado no ha tenido tiempo de crecer, y esta cifra lo tiene en cuenta. Es la forma más justa de medir lo que has ganado tú. En inglés se llama XIRR.',`Tu dinero ha crecido de media un <b>${pctTxt(c.x)} al año</b>. Para no perder poder de compra tiene que crecer al menos lo que suben los precios (ahora, un ${String(S.cfg.ipc).replace('.',',')} % al año).`,'Incluye el dinero en cuentas remuneradas, que rinde poco y baja la media. Que la "ganancia acumulada" sea alta y esta cifra baja es normal: esa no tiene en cuenta el tiempo.');
    case 'ext_total': return T('Aportado neto',eur(c.ext),'El dinero que ha salido de tus cuentas corrientes hacia tus inversiones y ahorros, menos el que has sacado de vuelta. Mover dinero de un producto a otro no cuenta, porque no es dinero nuevo.',`En total has puesto de tu bolsillo, en neto, <b>${eur(c.ext)}</b>.`,'Una parte de esta cifra está reconstruida (aportaciones antiguas sin documento, por ejemplo).');
    case 'deuda': return T('Deuda pendiente',eur(c.deuda),'Lo que todavía tienes que devolver de tus préstamos. Baja un poco cada mes con cada cuota.',`Debes <b>${eur(c.deuda)}</b> entre ${c.n} préstamo${c.n===1?'':'s'} y pagas ${eur(c.cuota,2)} al mes.`,'Se calcula con el cuadro de amortización del contrato, no con un extracto del banco.');
    case 'cat': return T(c.cat,eur(c.v),CATTXT[c.cat],`Tienes <b>${eur(c.v)}</b> aquí: el ${pctTxt(c.share)} de todo lo que tienes.`,c.cat==='Efectivo'?`Con los precios subiendo un ${String(S.cfg.ipc).replace('.',',')} % al año, este dinero pierde unos ${eur(c.v*S.cfg.ipc/100)} de poder de compra cada año.`:c.cat==='Efectivo invertido'?'Las cuentas y depósitos están protegidos hasta 100.000 € por persona y banco por el fondo de garantía de depósitos.':'');
    case 'entidad': return T(c.e,eur(c.v),'Lo que tienes en este banco o bróker, sumando todos sus productos.',`<b>${eur(c.v)}</b>, el ${pctTxt(c.share)} de lo que tienes, en ${c.n} producto${c.n===1?'':'s'}: ${esc(c.names)}.`,'Las cuentas y depósitos están protegidos hasta 100.000 € por persona y banco. Los fondos, ETF y acciones son tuyos aunque el banco quiebre: están a tu nombre, separados de los del banco.');
    case 'year_new': return T('Dinero nuevo este año',eur(c.v),'Lo que has metido de tu bolsillo este año, menos lo que has sacado.',`En ${c.y} llevas <b>${eur(c.v)}</b> en neto.`,'');
    case 'gan_y': return T(`Ganancia de ${c.y}`,eur(c.gan),'Cuánto ha crecido tu dinero en el año sin contar lo que metiste. Si empezaste con 100, metiste 10 y acabaste con 115, la ganancia es 5.',`Empezaste con ${eur(c.V0)}, metiste ${eur(c.ext)} y ${c.parcial?'hoy tienes':'acabaste con'} ${eur(c.V)}.<br><b>${eur(c.V)} − ${eur(c.V0)} − ${eur(c.ext)} = ${eur(c.gan)}</b>`,'Es aproximada: entre las fechas en que hay valores reales, la app los estima.');
    case 'r_y': return T(`Rentabilidad de ${c.y}`,pct(c.r),'La ganancia del año dividida entre el dinero que tenías invertido de media. Lo que metiste a mitad de año cuenta solo la mitad.',`En ${c.y}${c.parcial?' (hasta hoy)':''} tu dinero creció un <b>${pctTxt(c.r)}</b>. Los precios subieron un ${c.inf}.`,c.r!=null&&parseFloat(String(c.inf).replace(',','.'))/100>c.r?'Ese año tu dinero creció menos que los precios: perdiste poder de compra.':'');
    case 'v0_y': return T(`Valor al empezar ${c.y}`,eur(c.v),'Lo que valían todas tus inversiones y ahorros el 1 de enero de ese año.',`<b>${eur(c.v)}</b>`,'Valores intermedios aproximados.');
    case 'v1_y': return T(`Valor al ${c.parcial?'día de hoy':'acabar '+c.y}`,eur(c.v),'Lo que valían todas tus inversiones y ahorros al final del año.',`<b>${eur(c.v)}</b>`,'Valores intermedios aproximados.');
    case 'ext_y': return T(`Dinero nuevo en ${c.y}`,eur(c.v),'Lo que metiste de tu bolsillo ese año menos lo que sacaste. Los traspasos entre productos no cuentan.',`<b>${eur(c.v)}</b>`,'');
    case 'inf': return T('Inflación',c.v,'Cuánto suben los precios en un año. Con un 5 %, lo que hoy cuesta 100 € costará unos 105 € dentro de un año. Tu dinero tiene que crecer al menos eso para no perder poder de compra.',`Dato de referencia: <b>${c.v}</b>${c.src?' ('+esc(c.src)+')':''}.`,'');
    case 'chart': return T('Evolución de tu dinero','','La zona azul es lo que valían tus inversiones cada mes y la morada, tu efectivo invertido. La línea discontinua es lo que habías puesto de tu bolsillo. Si la zona de color está por encima de la línea, vas ganando.','Toca el gráfico para ver los valores de cada mes.','Entre fechas con valores reales, la app traza una línea recta: los meses intermedios son aproximados.');
    case 'aviso': return T('Aviso','',esc(c.t),'Los avisos los puedes cambiar o borrar en Más › Ajustes.','');
    case 'sync': return T('Sincronización','','Tus datos viven en un Excel de tu OneDrive. Cada cambio que haces se guarda allí en un segundo.',`Estado: <b>${esc(c.s)}</b>.`,'Si tienes el Excel abierto en el ordenador, OneDrive lo bloquea y la app reintenta cada 30 segundos.');
    case 'p_valor': return T('Valor actual',eur(c.v,2),'Lo que vale hoy este producto, según el último dato que metiste.',`<b>${eur(c.v,2)}</b> a fecha ${fdate(c.f)}.`,c.stale>60?`Lleva ${Math.round(c.stale)} días sin actualizar: puede estar desfasado.`:'');
    case 'p_neto': return T('Aportado neto',eur(c.neto,2),'Lo que has metido en este producto menos lo que has sacado.',`Metiste ${eur(c.ent,2)} y sacaste ${eur(c.sal,2)}.<br><b>${eur(c.ent,2)} − ${eur(c.sal,2)} = ${eur(c.neto,2)}</b>`,'');
    case 'p_gan': return T('Ganancia',eur(c.gan,2),'Lo que has ganado (o perdido) con este producto: lo que vale más lo que ya sacaste, menos lo que metiste.',`<b>${eur(c.v,2)} + ${eur(c.sal,2)} − ${eur(c.ent,2)} = ${eur(c.gan,2)}</b>`,'Es antes de impuestos. Al vender con ganancia, Hacienda se queda entre el 19 % y el 30 % de esa ganancia.');
    case 'p_pct': return T('Rentabilidad simple',pct(c.pct),'La ganancia dividida entre lo que metiste. No tiene en cuenta el tiempo: un +10 % en un mes no es lo mismo que un +10 % en cinco años.',`<b>${eur(c.gan,2)} ÷ ${eur(c.ent,2)} = ${pctTxt(c.pct)}</b>`,'');
    case 'p_xirr': return T('Rentabilidad anual',pct(c.x),'Cuánto ha crecido de media cada año el dinero que metiste en este producto, teniendo en cuenta cuándo lo metiste (XIRR).',c.x==null?'Todavía no se calcula: hace falta más de un año de historia. Con periodos cortos, pasarla a anual exagera el resultado.':`De media, <b>${pctTxt(c.x)} al año</b>.`,'');
    case 'p_coste': return T('Coste anual',c.c==null?'—':eur(c.c),'Lo que te cobra este producto cada año por gestionarlo. No lo ves como un cargo: se descuenta poco a poco del valor.',c.c==null?'No tenemos el coste de este producto. Puedes añadirlo en "Editar".':`${String(c.pctc).replace('.',',')} % de ${eur(c.v)} ≈ <b>${eur(c.c)} al año</b>.`,'Un 1 % al año parece poco, pero en 20 años se come alrededor de una quinta parte de lo que habrías ganado.');
    case 'p_upd': return T('Última actualización',fdate(c.f),'La fecha del último valor que metiste para este producto.',c.stale!=null?`Hace ${Math.round(c.stale)} días.`:'Sin valores.','Conviene actualizarlo al menos una vez al mes.');
    case 'p_tras': return T(c.t?'Traspasable':'No traspasable','',c.t?'Es un fondo de inversión: puedes pasar el dinero a otro fondo sin pagar impuestos. Solo pagas cuando lo sacas a tu cuenta.':'Al venderlo pagas impuestos por la ganancia, aunque lo reinviertas en otra cosa. Esto pasa con ETF, acciones, cripto, metales y seguros.','','');
    case 'p_est': return T('Estimado','','Algunos importes de este producto están reconstruidos porque no había un documento con la cifra exacta. Son aproximados y se irán corrigiendo cuando haya documentos.','Los movimientos aproximados llevan el símbolo ≈.','');
    case 'mov': return T(c.mov||'Movimiento',(c.tipo==='salida'?'−':'+')+eur(c.imp,2),c.cls==='Dinero nuevo'?'Dinero que salió de tu cuenta corriente hacia este producto.':c.cls==='Retirada'?'Dinero que sacaste de este producto hacia tu cuenta corriente.':'Dinero que vino de otro de tus productos o fue a otro. No es dinero nuevo: solo cambia de sitio.',`${fdate(c.f)}${c.aprox?' (fecha aproximada)':''}. ${c.nota?esc(c.nota)+'. ':''}Este dato ${FIA[c.fia]||'no tiene fuente indicada.'}`,'');
    case 'val': return T('Valoración',eur(c.v,2),'Una "foto" del valor del producto en una fecha. Con estas fotos la app dibuja la evolución y calcula la rentabilidad.',`${fdate(c.f)}. ${c.fu?'Fuente: '+esc(c.fu)+'. ':''}Este dato ${FIA[c.fia]||'no tiene fuente indicada.'}`,'');
    case 'c_ent': return T('Aportado',eur(c.v),'Todo el dinero que metiste en este producto mientras estuvo abierto.',`<b>${eur(c.v)}</b>`,'');
    case 'c_rec': return T('Recuperado',eur(c.v),'Todo el dinero que sacaste de este producto, incluida la venta final.',`<b>${eur(c.v)}</b>`,'');
    case 'c_fin': return T('Fecha de cierre',fdate(c.f),'Cuándo vendiste o cerraste este producto.','','');
    case 'l_bal': return T('Capital pendiente',eur(c.L.bal,2),'Lo que te queda por devolver del préstamo, sin contar los intereses futuros.',`<b>${eur(c.L.bal,2)}</b> de los ${eur(c.d.capital)} que te prestaron.`,'Calculado con el cuadro de amortización a fecha de hoy.');
    case 'l_amort': return T('Ya devuelto',pctTxt(c.L.pctAmort),'Qué parte del dinero prestado ya has devuelto.',`Has devuelto el <b>${pctTxt(c.L.pctAmort)}</b> del préstamo.`,'');
    case 'l_cuota': return T('Cuota mensual',eur(c.d.cuota,2),'Lo que pagas cada mes. Una parte son intereses y el resto devuelve el préstamo. Al principio casi todo son intereses; al final, casi todo es devolución.',`<b>${eur(c.d.cuota,2)} al mes</b>.`,'');
    case 'l_rest': return T('Cuotas restantes',String(c.L.restantes),'Cuántos pagos mensuales te faltan.',`Te quedan <b>${c.L.restantes} cuotas</b>, hasta ${fdate(c.L.fin)}.`,'');
    case 'l_int': return T('Intereses por pagar',eur(c.L.intereses,2),'Lo que pagarás de más, por encima de lo que te prestaron, si no adelantas nada.',`${c.L.restantes} cuotas × ${eur(c.d.cuota,2)} − ${eur(c.L.bal,2)} pendientes = <b>${eur(c.L.intereses,2)}</b>`,'Si devuelves antes, te ahorras parte de estos intereses, aunque el banco puede cobrar una pequeña comisión por hacerlo.');
    case 'l_fin': return T('Última cuota',fdate(c.L.fin),'El mes en que terminas de pagar el préstamo.','','');
    case 'l_tin': return T('TIN',String(c.d.tin).replace('.',',')+' %','El tipo de interés del préstamo, sin comisiones. La TAE incluye también las comisiones y es la que sirve para comparar préstamos.',`<b>${String(c.d.tin).replace('.',',')} % anual</b>.${c.d.nota?' '+esc(c.d.nota):''}`,'');
    case 'cuota_total': return T('Cuota mensual total',eur(c.v,2),'Lo que pagas al mes sumando todos tus préstamos.',`<b>${eur(c.v,2)}</b> al mes.`,'');
    default: return T('Dato','','','','');
  }
}
function openExplain(i){
  const x=XP[+i]; if(!x) return; const e=explain(x.key,x.ctx); const sh=$('#sheet');
  sh.innerHTML=`<div class="grab"></div><div class="sh-b">
    <div class="sh-t">${esc(e.t)}</div>${e.v?`<div class="sh-v num">${e.v}</div>`:''}
    ${e.what?`<div class="sh-k">Qué es</div><p>${e.what}</p>`:''}
    ${e.you?`<div class="sh-k">En tu caso</div><p>${e.you}</p>`:''}
    ${e.tip?`<div class="sh-tip">${ICON.info}<span>${e.tip}</span></div>`:''}
    <button class="btn wide" data-close>Entendido</button></div>`;
  openSheet(sh);
}
function openSheet(sh){ if(!sh.open) sh.showModal(); sh.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>sh.close()); sh.onclick=e=>{ if(e.target===sh) sh.close() } }
document.addEventListener('click',e=>{
  const x=e.target.closest('[data-xi]'); if (x){ e.stopPropagation(); e.preventDefault(); openExplain(x.dataset.xi); return }
  const p=e.target.closest('[data-pid]'); if (p){ openProduct(p.dataset.pid); return }
  const g=e.target.closest('[data-go]'); if (g){ if(g.dataset.mode!==undefined) actMode=g.dataset.mode||null; go(g.dataset.go); return }
},true);
document.addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-xi],[data-pid]')){ e.preventDefault(); e.target.click() } });

/* ---------- navegación ---------- */
let TAB='inicio';
const TITLES={inicio:'Inicio',activos:'Activos',anadir:'Añadir',analisis:'Análisis',historico:'Histórico',mas:'Más'};
function go(t){ TAB=t; document.querySelectorAll('.tb').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  document.querySelectorAll('main section').forEach(s=>s.hidden=s.id!==t); $('#ttl').textContent=TITLES[t];
  if (t==='anadir') renderAct(); if (t==='historico') renderHist(); if (t==='analisis') renderAnalisis(); if (t==='inicio') setTimeout(()=>drawDonuts($('#inicio')),0); $('main').scrollTop=0 }
document.querySelectorAll('.tb').forEach(b=>b.onclick=()=>{ if(b.dataset.tab==='anadir') actMode=null; go(b.dataset.tab) });

/* ---------- render ---------- */
function render(){

  const lu=lastUpdate(); $('#asof').textContent = lu ? 'Datos a '+fdate(lu) : 'Sin datos';
  renderInicio(); renderActivos(); renderHist(); renderAct(); renderMas(); renderAnalisis();
}
function noData(){
  if (S.mode==='nuevo') return `<div class="card empty"><b>Tu OneDrive todavía no tiene el Excel de la app.</b><p>Ve a <b>Más › Importar un Excel</b> y elige <b>patrimonio_datos_iniciales.xlsx</b>. Se guardará en OneDrive y desde entonces será tu archivo de trabajo.</p><button class="btn" data-go="mas">Ir a Más</button></div>`;
  if (S.mode==='cargando') return `<div class="card empty">Cargando tus datos…</div>`;
  return `<div class="card empty"><b>Todavía no hay datos.</b><p>Importa tu Excel en Más o añade tu primera inversión.</p></div>`;
}
function signed(n,d=0){ return n==null?'—':(n>0?'+':'')+eur(n,d) }
let posFilter='activas';
function renderActivos(){
  const el=$('#activos'); if (!Object.keys(S.prod).length){ el.innerHTML=noData(); return }
  const fl={activas:p=>p.estado!=='cerrado'&&(value(p)>0||p.categoria!=='Efectivo'),'Inversión':p=>p.estado!=='cerrado'&&p.categoria==='Inversión','Efectivo invertido':p=>p.estado!=='cerrado'&&p.categoria==='Efectivo invertido','Efectivo':p=>p.estado!=='cerrado'&&p.categoria==='Efectivo',cerradas:p=>p.estado==='cerrado'};
  const closed=posFilter==='cerradas';
  const list=Object.values(S.prod).filter(fl[posFilter]).map(p=>({p,s:stats(p)})).sort((a,b)=>closed?(b.p.cierre||'').localeCompare(a.p.cierre||''):b.s.v-a.s.v);
  const T={v:0,neto:0,gan:0}; list.forEach(({s})=>{T.v+=s.v;T.neto+=s.neto;T.gan+=s.gan||0});
  const chips=[['activas','Todos'],['Inversión','Inversión'],['Efectivo invertido','Efectivo invertido'],['Efectivo','Efectivo'],['cerradas','Cerrados']];
  el.innerHTML=`<div class="chips">${chips.map(([k,l])=>`<button class="chip" data-f="${k}" aria-pressed="${posFilter===k}">${l}</button>`).join('')}</div>
  ${closed?'':`<div class="card"><div class="tiles three">
    <div class="tile"${xi('p_valor',{v:T.v,f:today()})}><span>Valor</span><b class="num">${eur(T.v)}</b></div>
    <div class="tile"${xi('p_neto',{neto:T.neto,ent:T.neto,sal:0})}><span>Aportado</span><b class="num">${eur(T.neto)}</b></div>
    <div class="tile"${xi('p_gan',{gan:T.gan,v:T.v,sal:0,ent:T.v-T.gan})}><span>Ganancia</span><b class="num ${T.gan>=0?'pos':'neg'}">${signed(T.gan)}</b></div></div></div>`}
  <div class="card list">${list.map(({p,s})=>`<div class="row tap" data-pid="${esc(p.id)}">${avatar(p.entidad)}
    <span class="row-m"><b>${esc(p.nombre)}</b><small>${s.est?`<em${xi('p_est',{})}>≈ estimado</em> · `:''}${esc(p.entidad)} · ${esc(p.tipo)}</small></span>
    <span class="row-r">${closed?`<b class="num"${xi('c_fin',{f:p.cierre})}>${sdate(p.cierre)}</b><small class="num ${s.gan>=0?'pos':'neg'}"${xi('p_gan',{gan:s.gan,v:0,sal:s.sal,ent:s.ent})}>${signed(s.gan)}</small>`
      :`<b class="num"${xi('p_valor',{v:s.v,f:s.lv?.f,stale:s.stale})}>${eur(s.v)}</b>${s.gan!=null&&p.categoria!=='Efectivo'?`<small class="num ${s.gan>=0?'pos':'neg'}"${xi('p_pct',{pct:s.pct,gan:s.gan,ent:s.ent})}>${signed(s.gan)} · ${pct(s.pct)}</small>`:''}`}</span></div>`).join('')||'<div class="empty">Nada en este grupo.</div>'}</div>`;
  el.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{posFilter=b.dataset.f;renderActivos()});
}

let chart=null;
/* ---------- Añadir ---------- */
let actMode=null;
function prodOptions(filter=p=>p.estado!=='cerrado', sel=''){ return Object.values(S.prod).filter(filter).sort((a,b)=>(a.entidad+a.nombre).localeCompare(b.entidad+b.nombre)).map(p=>`<option value="${esc(p.id)}" ${p.id===sel?'selected':''}>${esc(p.entidad)} — ${esc(p.nombre)}</option>`).join('') }
function catOf(tipo){ return tipo==='Cuenta remunerada'||tipo==='Depósito' ? 'Efectivo invertido' : tipo==='Cuenta corriente' ? 'Efectivo' : 'Inversión' }
/* ---------- ficha de producto ---------- */
let pchart=null;
/* ---------- Más: deudas, datos y ajustes ---------- */
let LOGALL=false;
function renderMas(){
  const el=$('#mas'); const ds=Object.values(S.debts);
  const tot=ds.reduce((s,d)=>s+loanAt(d).bal,0), cuota=ds.reduce((s,d)=>s+loanAt(d).cuota,0);
  const st=$('#status span')?.textContent||'';
  el.innerHTML=`<h2 class="h2">Deudas</h2>
  <div class="card"><div class="tiles">
    <div class="tile"${xi('deuda',{deuda:tot,n:ds.filter(d=>loanAt(d).bal>0).length,cuota})}><span>Pendiente</span><b class="num neg">${eur(tot)}</b></div>
    <div class="tile"${xi('cuota_total',{v:cuota})}><span>Cuota al mes</span><b class="num">${eur(cuota,2)}</b></div></div></div>
  ${ds.map(d=>{const L=loanAt(d);return `<div class="card"><div class="loan-h">${avatar(d.entidad)}<span class="row-m"><b>${esc(d.nombre)}</b><small>${esc(d.entidad)} · <span${xi('l_tin',{d})}>TIN ${String(d.tin).replace('.',',')} %</span></small></span><button class="del" data-deld="${esc(d.id)}" aria-label="Borrar préstamo">×</button></div>
    <div class="prog"${xi('l_amort',{L,d})}><i style="width:${L.pctAmort*100}%"></i></div>
    <div class="tiles three">
      <div class="tile"${xi('l_bal',{L,d})}><span>Pendiente</span><b class="num">${eur(L.bal)}</b></div>
      <div class="tile"${xi('l_cuota',{L,d:Object.assign({},d,{cuota:L.cuota})})}><span>Cuota</span><b class="num">${eur(L.cuota,2)}</b></div>
      <div class="tile"${xi('l_rest',{L,d})}><span>Quedan</span><b class="num">${L.restantes}</b></div>
      <div class="tile"${xi('l_int',{L,d})}><span>Intereses</span><b class="num">${eur(L.intereses)}</b></div>
      <div class="tile"${xi('l_amort',{L,d})}><span>Devuelto</span><b class="num">${pctTxt(L.pctAmort)}</b></div>
      <div class="tile"${xi('l_fin',{L,d})}><span>Fin</span><b class="num">${sdate(L.fin)}</b></div></div>
    <div class="btns"><button class="btn ghost" data-debt="amort" data-did="${esc(d.id)}">Amortizar</button><button class="btn ghost" data-debt="edit" data-did="${esc(d.id)}">Editar</button></div></div>`}).join('')}
  <details class="card edit"><summary>Añadir préstamo</summary>
    <form id="fdebt"><label class="fl">Nombre<input name="nombre" required placeholder="Préstamo coche"></label><label class="fl">Entidad<input name="entidad" required></label>
    <label class="fl">Capital inicial (€)<input name="capital" type="number" inputmode="decimal" step="0.01" required></label><label class="fl">TIN (%)<input name="tin" type="number" inputmode="decimal" step="0.001" required></label>
    <label class="fl">Cuota (€)<input name="cuota" type="number" inputmode="decimal" step="0.01" required></label><label class="fl">Primera cuota<input name="primerPago" type="date" required></label>
    <label class="fl">Número de cuotas<input name="n" type="number" inputmode="numeric" required></label><button class="btn wide">Añadir préstamo</button></form></details>

  <h2 class="h2">Bitácora de cambios</h2>
  <div class="card">${logRows((S.log||[]).slice(LOGALL?0:-12))}${(S.log||[]).length>12?`<button class="btn ghost wide" id="logall" style="margin-top:10px">${LOGALL?'Ver menos':'Ver los '+S.log.length+' cambios'}</button>`:''}</div>
  <h2 class="h2">Tus datos</h2>
  <div class="card">
    <div class="row"${xi('sync',{s:st})}><span class="row-m"><b>OneDrive</b><small>${esc(st)}</small></span></div>
    <div class="row"><span class="row-m"><b>Cuenta</b><small id="who">${esc(ACCOUNT?.username||'—')}</small></span></div>
    <div class="row"><span class="row-m"><b>Archivo</b><small>OneDrive › Aplicaciones › ${esc(CFG.fileName||'patrimonio.xlsx')}</small></span></div>
    <div class="btns"><button class="btn" id="reload">Recargar</button><button class="btn ghost" id="exp">Descargar copia</button></div>
  </div>
  <div class="card"><div class="card-h">Importar un Excel</div><p class="hint">Sustituye todo por el contenido del archivo y lo guarda en OneDrive.</p><label class="btn ghost wide" style="cursor:pointer">Elegir archivo<input type="file" id="imp" accept=".xlsx" hidden></label><p class="hint" id="impmsg"></p></div>
  <div class="card"><div class="card-h">Importar actualización</div><p class="hint">Añade cuentas o productos nuevos, completa datos (interés, riesgo, puntos a vigilar…) y divide productos (p. ej. un fondo en sus subfondos) sin borrar nada de lo que ya tienes.</p><label class="btn ghost wide" style="cursor:pointer">Elegir archivo<input type="file" id="impu" accept=".xlsx" hidden></label><p class="hint" id="impumsg"></p></div>
  <div class="card"><div class="card-h">Importar clasificación</div><p class="hint">Añade riesgo, regiones, sectores, monedas y costes a tus productos desde un Excel, sin tocar movimientos ni valores.</p><label class="btn ghost wide" style="cursor:pointer">Elegir archivo<input type="file" id="impc" accept=".xlsx" hidden></label><p class="hint" id="impcmsg"></p></div>
  <details class="card edit"><summary>Ajustes</summary><form id="fcfg"><label class="fl">Inflación de referencia (%)<input type="number" inputmode="decimal" step="0.1" name="ipc" value="${S.cfg.ipc}"></label><label class="fl">Pérdidas de años anteriores pendientes de compensar (€)<input type="number" inputmode="decimal" step="0.01" name="perd" value="${S.cfg.perdidas??''}"></label><label class="fl">S&amp;P 500 en lo que va de año (%)<input type="number" inputmode="decimal" step="0.01" name="sp" value="${S.cfg.sp500??''}"></label><label class="fl">Fuente y fecha del dato del S&amp;P 500<input name="spref" value="${esc(S.cfg.sp500ref||'')}"></label><label class="fl">Avisos (uno por línea)<textarea name="avisos" rows="5">${esc((S.cfg.avisos||[]).join('\n'))}</textarea></label><button class="btn wide">Guardar ajustes</button></form></details>
  <button class="btn wide danger" id="out">Cerrar sesión</button>`;
  el.querySelectorAll('[data-deld]').forEach(b=>b.onclick=async()=>{ if(!confirm('¿Borrar este préstamo?'))return; logChange('Borrar préstamo','deuda',b.dataset.deld,S.debts[b.dataset.deld]?.nombre||''); delete S.debts[b.dataset.deld]; await remove('d',b.dataset.deld); render(); toast('Préstamo borrado') });
  $('#fdebt').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const d={id:uid(),nombre:f.get('nombre'),entidad:f.get('entidad'),capital:+f.get('capital'),tin:+f.get('tin'),cuota:+f.get('cuota'),primerPago:f.get('primerPago'),n:+f.get('n')};S.debts[d.id]=d; logChange('Nuevo préstamo','deuda',d.id,d.nombre,`${eur(d.capital)} · TIN ${d.tin} %`,{importe:d.capital}); await persist('d',d);render();toast('Préstamo añadido')};
  $('#reload').onclick=()=>{ if(dirty&&!confirm('Hay cambios sin guardar. ¿Recargar igualmente?'))return; pull().catch(()=>toast('No se ha podido leer OneDrive')) };
  $('#exp').onclick=()=>{ const u=URL.createObjectURL(new Blob([workbookFromState()])); const a=document.createElement('a'); a.href=u; a.download=`patrimonio_${today()}.xlsx`; a.click(); setTimeout(()=>URL.revokeObjectURL(u),5000) };
  $('#out').onclick=logout;
  const _la=$('#logall'); if(_la) _la.onclick=()=>{ LOGALL=!LOGALL; renderMas() };
  $('#impc').onchange=async ev=>{ const file=ev.target.files[0]; if(!file) return; const msg=$('#impcmsg');
    try{ const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}); const ws=wb.Sheets['Clasificación']||wb.Sheets['Clasificacion']||wb.Sheets['Productos']; const R=XLSX.utils.sheet_to_json(ws,{defval:''});
      let n=0; for (const r of R){ const p=S.prod[String(r.id)]; if(!p) continue; n++;
        if (r.riesgo!=='') p.riesgo=+r.riesgo; ['clase','gestion','liquidez','regiones','sectores','divisas'].forEach(k=>{ if(r[k]!=='') p[k]=String(r[k]) });
        if (r.coste_pct!==''&&r.coste_pct!=null) p.costePct=+String(r.coste_pct).replace(',','.') }
      if(!n){ msg.textContent='El archivo no contiene productos que coincidan con los tuyos.'; return }
      logChange('Importar clasificación','datos','',file.name,`${n} productos actualizados`,{origen:'Importación'});
      render(); await push(); toast(`Clasificación añadida a ${n} productos`); msg.textContent=`Actualizados ${n} productos.`;
    }catch(e){ msg.textContent='No se ha podido leer el archivo.' } ev.target.value='' };
  $('#impu').onchange=async ev=>{ const file=ev.target.files[0]; if(!file) return; const msg=$('#impumsg');
    try{ const r=await importUpdate(file); render(); await push(); const m2=$('#impumsg'); if(m2) m2.textContent=`${r.nuevos} nuevos · ${r.act} completados · ${r.div} divididos.`; toast('Actualización importada y guardada') }
    catch(e){ msg.textContent='No se ha podido leer el archivo.' } ev.target.value='' };
  $('#imp').onchange=async ev=>{ const file=ev.target.files[0]; if(!file) return; const msg=$('#impmsg');
    try{ const st=stateFromWorkbook(await file.arrayBuffer());
      if(!confirm(`Se sustituirán tus datos por ${Object.keys(st.prod).length} productos. ¿Continuar?`)) return;
      S.prod=st.prod; S.debts=st.debts; S.cfg=st.cfg; S.log=(st.log&&st.log.length?st.log:S.log)||[]; logChange('Importar Excel completo','datos','',file.name,`${Object.keys(st.prod).length} productos`,{origen:'Importación'}); render(); await push(true); toast('Datos importados y guardados en OneDrive');
    }catch(e){ msg.textContent='No se ha podido leer el archivo. Usa un Excel exportado desde la app.' } ev.target.value='' };
  $('#fcfg').onsubmit=e=>{e.preventDefault(); const f=new FormData(e.target); S.cfg.ipc=+f.get('ipc'); S.cfg.perdidas=f.get('perd')===''?null:+f.get('perd'); S.cfg.sp500=f.get('sp')===''?null:+f.get('sp'); S.cfg.sp500ref=String(f.get('spref')||'').trim(); S.cfg.avisos=String(f.get('avisos')).split('\n').map(s=>s.trim()).filter(Boolean); logChange('Cambiar ajustes','ajustes','','',`Inflación ${S.cfg.ipc} % · ${S.cfg.avisos.length} avisos`); schedule(); render(); toast('Ajustes guardados')};
}


/* ================== PERFIL DE CADA PRODUCTO (riesgo, regiones, sectores…) ================== */
// Los datos concretos de cada producto viven en tu Excel (columnas riesgo, clase, gestion, liquidez, regiones, sectores, divisas).
// Aquí solo hay valores genéricos por tipo de producto para cuando falta el dato.
function parseMix(s){ if(!s) return null; if(typeof s==='object') return s; const o={}; String(s).split(/[;|]/).forEach(x=>{ const [k,v]=x.split(':'); if(k&&v!==undefined&&!isNaN(+String(v).replace(',','.'))) o[k.trim()]=+String(v).replace(',','.') }); return Object.keys(o).length?o:null }
function mixStr(o){ return o?Object.entries(o).map(([k,v])=>`${k}:${v}`).join(';'):'' }
function defProfile(p){
  const t=p.tipo;
  if (['Cuenta remunerada','Depósito','Cuenta corriente'].includes(t)) return {riesgo:1,clase:'Liquidez',gestion:'Sin gestión',liquidez:t==='Depósito'?'Bloqueado o con penalización':'Inmediata',reg:{'España':100},sec:{'Liquidez':100},div:{'EUR':100}};
  if (t==='Monetario') return {riesgo:1,clase:'Liquidez',gestion:'Activa',liquidez:'Inmediata',reg:{'Europa':100},sec:{'Liquidez':100},div:{'EUR':100}};
  if (t==='Cripto') return {riesgo:7,clase:'Cripto',gestion:'Sin gestión',liquidez:'Inmediata',reg:{'Global':100},sec:{'Cripto':100},div:{'USD':100}};
  if (t==='Metal') return {riesgo:5,clase:'Metales',gestion:'Sin gestión',liquidez:'Inmediata',reg:{'Global':100},sec:{'Metales preciosos':100},div:{'USD':100}};
  if (t==='Seguro') return {riesgo:null,clase:'Renta variable',gestion:'Activa',liquidez:'Bloqueado o con penalización',reg:null,sec:null,div:null};
  if (t==='Fondo') return {riesgo:null,clase:'Renta variable',gestion:null,liquidez:'Unos días',reg:null,sec:null,div:null};
  return {riesgo:null,clase:'Renta variable',gestion:null,liquidez:'Unos días',reg:null,sec:null,div:null};
}
function profile(p){ const d=defProfile(p); return {
  riesgo: p.riesgo!=null&&p.riesgo!==''?+p.riesgo:d.riesgo, clase:p.clase||d.clase, gestion:p.gestion||d.gestion||'Sin datos', liquidez:p.liquidez||d.liquidez,
  reg:parseMix(p.regiones)||d.reg, sec:parseMix(p.sectores)||d.sec, div:parseMix(p.divisas)||d.div,
  propio: !!(p.riesgo||p.regiones||p.sectores) } }
function activeProds(){ return Object.values(S.prod).filter(p=>p.estado!=='cerrado'&&value(p)>0) }
function exposure(dim){ // dim: reg | sec | div | riesgo | clase | gestion | liquidez | entidad | tipo
  const out={}, who={}; let tot=0;
  for (const p of activeProds()){ const v=value(p); tot+=v; const pr=profile(p);
    let mix; if (['reg','sec','div'].includes(dim)) mix=pr[dim]||{'Sin clasificar':100};
    else if (dim==='riesgo') mix={[pr.riesgo?String(pr.riesgo):'Sin dato']:100};
    else if (dim==='entidad') mix={[p.entidad]:100}; else if (dim==='tipo') mix={[p.tipo]:100}; else mix={[pr[dim]||'Sin dato']:100};
    const sum=Object.values(mix).reduce((a,b)=>a+b,0)||100;
    for (const [k,w] of Object.entries(mix)){ const x=v*w/sum; out[k]=(out[k]||0)+x; (who[k]=who[k]||[]).push([p.nombre,x]) } }
  return Object.entries(out).map(([k,v])=>({k,v,share:tot?v/tot:0,who:(who[k]||[]).sort((a,b)=>b[1]-a[1])})).sort((a,b)=>b.v-a.v);
}
function kpis(){
  const t=totals(); const act=activeProds(); const inv=act.reduce((s,p)=>s+value(p),0)||1;
  let coste=0, costeBase=0, sinCoste=[]; const costes=[];
  let rS=0,rW=0, liq=0, fx=0, rv=0, act_g=0, idx_g=0;
  for (const p of act){ const v=value(p), pr=profile(p);
    if (p.costePct!=null){ coste+=v*p.costePct/100; costeBase+=v; costes.push([p.nombre,v*p.costePct/100,p.costePct]) } else if (p.categoria==='Inversión') sinCoste.push(p.nombre);
    if (pr.riesgo){ rS+=pr.riesgo*v; rW+=v }
    if (pr.liquidez==='Inmediata'||pr.liquidez==='Unos días') liq+=v;
    if (pr.div){ const s=Object.values(pr.div).reduce((a,b)=>a+b,0)||100; fx+=v*(s-(pr.div.EUR||0))/s }
    if (pr.clase==='Renta variable') rv+=v;
    if (pr.gestion==='Activa') act_g+=v; if (pr.gestion==='Indexada') idx_g+=v; }
  const ents=exposure('entidad'); const prods=act.map(p=>[p.nombre,value(p)]).sort((a,b)=>b[1]-a[1]);
  let ext=0, extE=0; for (const p of Object.values(S.prod)) for (const m of p.movs||[]) if (m.ext>0){ ext+=m.ext; if (m.fia==='Estimado'||m.fia==='Dudoso') extE+=m.ext }
  const infl=[3.1,8.4,3.5,2.8,2.7,S.cfg.ipc]; const yrs=t.x!=null?infl:[]; const iAvg=Math.pow(infl.reduce((a,b)=>a*(1+b/100),1),1/infl.length)-1;
  return {t,inv,coste,costeBase,costes:costes.sort((a,b)=>b[1]-a[1]),sinCoste,riesgo:rW?rS/rW:null,riesgoCob:rW/inv,liq,fx,rv,act_g,idx_g,ents,prods,est:ext?extE/ext:0,n:act.length,nEnt:ents.length,iAvg,real:t.x!=null?(1+t.x)/(1+iAvg)-1:null,dr:t.activos?t.deuda/t.activos:0};
}
const RLAB=r=>r==null?'sin dato':r<=2?'muy prudente':r<=3.5?'prudente':r<=4.5?'equilibrado':r<=5.5?'dinámico':'agresivo';
const DIMTXT={
  reg:['Región','En qué parte del mundo están las empresas en las que invierte tu dinero. Repartirlo entre varias zonas reduce el golpe si a un país le va mal.'],
  sec:['Sector','A qué se dedican las empresas en las que invierte tu dinero. Si todo está en un mismo sector, una mala racha de ese sector te afecta de lleno.'],
  div:['Moneda','En qué moneda están los activos. Si inviertes en empresas de EE. UU., tu dinero sube o baja también según lo que haga el dólar frente al euro.'],
  riesgo:['Nivel de riesgo','Los productos se puntúan del 1 al 7 según cuánto puede subir o bajar su valor. 1 es casi como una cuenta; 7, como la cripto, puede moverse un 50 % en meses.'],
  clase:['Clase de activo','El tipo de cosa en la que está el dinero: bolsa (acciones), liquidez (cuentas y monetarios), cripto o metales. Es lo que más determina cuánto puede subir o caer tu patrimonio.'],
  gestion:['Tipo de gestión','Activa: un gestor elige qué comprar para intentar ganar al mercado; suele costar 1,5–2 % al año. Indexada: copia un índice entero y cuesta 0,1–0,4 %. A largo plazo, la mayoría de fondos activos no consigue batir a los indexados.'],
  liquidez:['Liquidez','Lo rápido que podrías tener ese dinero en tu cuenta. "Inmediata": en el día. "Unos días": fondos, que tardan 2–5 días. "Bloqueado o con penalización": sacarlo antes de tiempo te cuesta dinero.'],
  entidad:['Banco','Cuánto de tu dinero está en cada banco o bróker.'],
  tipo:['Tipo de producto','Qué clase de producto es cada inversión: fondo, ETF, acción, cripto, cuenta…']};
const NAMETXT={
  'EE. UU.':'Empresas estadounidenses. Son más de la mitad del valor de todas las bolsas del mundo.','Europa':'Empresas europeas (Reino Unido, Francia, Alemania, Suiza…).','Emergentes':'Países en desarrollo como China, India, Taiwán, Corea o Brasil. Pueden crecer más, pero son más inestables.','Japón y Asia desarrollada':'Japón, Australia, Hong Kong, Singapur…','España':'Cuentas y depósitos en bancos españoles o en euros.','Global':'Activos que no dependen de un país concreto.','Sin clasificar':'Productos de los que no tenemos el desglose.',
  'Tecnología':'Empresas como Apple, Microsoft o Nvidia: programas, chips y aparatos.','Salud':'Farmacéuticas, hospitales y equipos médicos.','Industria':'Fábricas, maquinaria, transporte, construcción y defensa.','Financiero':'Bancos, aseguradoras y gestoras.','Consumo':'Lo que compra la gente: comida, ropa, coches, tiendas, ocio.','Comunicaciones':'Telefónicas, redes sociales, buscadores y medios (Google, Meta, Netflix…).','Energía':'Petróleo, gas y renovables.','Materiales':'Minería, química, acero.','Inmobiliario':'Empresas dueñas de edificios y centros comerciales.','Servicios públicos':'Luz, agua y gas.','Liquidez':'Dinero en cuentas, depósitos y monetarios: no invierte en empresas.','Cripto':'Monedas digitales como bitcoin. Muy volátiles.','Metales preciosos':'Oro y plata.',
  'EUR':'Euros: tu moneda. Sin riesgo de cambio.','USD':'Dólares: si el dólar baja frente al euro, esta parte pierde valor.','GBP':'Libras esterlinas.','Otras':'Otras monedas (won coreano, yuan, yen…).',
  'Renta variable':'Acciones de empresas, directamente o mediante fondos y ETF. Lo que más puede subir a largo plazo, y lo que más cae en una crisis.','Metales':'Oro y plata.','Activa':'Un gestor elige las inversiones.','Indexada':'Copia un índice entero de forma automática.','Sin gestión':'Cuentas, cripto o metales: nadie los gestiona.',
  'Inmediata':'Disponible en el día.','Unos días':'Tarda 2–5 días en llegar a tu cuenta.','Bloqueado o con penalización':'Sacarlo antes de tiempo te cuesta dinero o no se puede.',
  '1':'Casi sin riesgo: cuentas y monetarios.','2':'Riesgo muy bajo: renta fija a corto plazo.','3':'Riesgo bajo.','4':'Riesgo medio: fondos mixtos.','5':'Riesgo medio-alto: bolsa global diversificada.','6':'Riesgo alto: bolsa de un país o sector concreto.','7':'Riesgo muy alto: cripto o acciones sueltas muy volátiles.'};
function explain2(key,c){
  const T=(t,v,what,you,tip)=>({t,v,what,you,tip});
  const whoTxt=w=>w&&w.length?'Viene de: '+w.slice(0,5).map(([n,x])=>`${esc(n)} (${eur(x)})`).join(', ')+(w.length>5?` y ${w.length-5} más`:'')+'.':'';
  switch(key){
    case 'dim': { const [dn,dt]=DIMTXT[c.dim]||['','']; return T(`${dn}: ${c.k}`,eur(c.v),(NAMETXT[c.k]?NAMETXT[c.k]+' ':'')+dt,`<b>${eur(c.v)}</b>, el ${pctTxt(c.share)} de lo que tienes. ${whoTxt(c.who)}`,c.dim==='reg'||c.dim==='sec'?'El reparto de los fondos es aproximado: está tomado de sus fichas y cambia con el tiempo.':'') }
    case 'k_coste': return T('Coste anual total',eur(c.coste),'Lo que te cobran entre todos tus productos cada año por gestionarlos. No lo ves como un cargo: se descuenta poco a poco del valor.',`Unos <b>${eur(c.coste)} al año</b>, un ${pctTxt(c.costeBase?c.coste/c.costeBase:0)} de lo que tiene coste conocido. Los más caros: ${c.costes.slice(0,3).map(([n,x,p])=>`${esc(n)} (${eur(x)}, ${String(p).replace('.',',')} %)`).join(', ')}.`,c.sinCoste.length?`Sin dato de coste: ${esc(c.sinCoste.join(', '))}. Puedes añadirlo en la ficha de cada producto.`:'');
    case 'k_riesgo': return T('Riesgo medio',c.riesgo==null?'—':c.riesgo.toFixed(1).replace('.',',')+' / 7','Los productos se puntúan del 1 (casi sin riesgo, como una cuenta) al 7 (puede subir o bajar muchísimo, como la cripto). Esta es la media de los tuyos, pesando más los que tienen más dinero.',c.riesgo==null?'No hay datos de riesgo.':`Tu media es <b>${c.riesgo.toFixed(1).replace('.',',')} sobre 7</b>: perfil <b>${RLAB(c.riesgo)}</b>. Calculado sobre el ${pctTxt(c.riesgoCob)} de tu dinero (el resto no tiene dato).`,'La escala es el indicador de riesgo oficial de los folletos de los fondos.');
    case 'k_rv': return T('Dinero en bolsa',pctTxt(c.rv/c.inv),'Qué parte de tu dinero está en acciones de empresas (directamente o a través de fondos y ETF). Es lo que más sube a largo plazo y lo que más cae en una crisis: en 2008 y en 2020 la bolsa llegó a caer entre un 30 % y un 50 %.',`<b>${eur(c.rv)}</b>. Si la bolsa cayera un 30 %, esta parte perdería temporalmente unos <b>${eur(c.rv*0.3)}</b>.`,'Las caídas de la bolsa suelen recuperarse con los años; el problema es tener que vender en mitad de una caída.');
    case 'k_liq': return T('Disponible en pocos días',pctTxt(c.liq/c.inv),'Dinero que podrías tener en tu cuenta en unos días sin penalizaciones: cuentas, monetarios, fondos, ETF, acciones y cripto.',`<b>${eur(c.liq)}</b> de ${eur(c.inv)}.`,'Que puedas sacarlo no significa que sea buen momento: vender bolsa en una caída convierte una pérdida temporal en real.');
    case 'k_ent': return T('Banco con más dinero',pctTxt(c.ents[0]?.share),'Qué parte de tu patrimonio está en un solo banco o bróker. Tus fondos y acciones son tuyos aunque el banco quiebre; el efectivo está protegido hasta 100.000 € por banco.',c.ents[0]?`<b>${esc(c.ents[0].k)}</b>: ${eur(c.ents[0].v)}, el ${pctTxt(c.ents[0].share)}.`:'','');
    case 'k_prod': return T('Producto más grande',pctTxt(c.prods[0]?c.prods[0][1]/c.inv:0),'Qué parte de tu dinero está en un solo producto. Cuanto más grande, más depende tu resultado de que a ese producto le vaya bien.',c.prods[0]?`<b>${esc(c.prods[0][0])}</b>: ${eur(c.prods[0][1])}.`:'',c.prods[0]&&c.prods[0][1]/c.inv>0.25?'Más de un 25 % en un solo producto se considera una concentración alta.':'');
    case 'k_n': return T('Productos activos',String(c.n),'Cuántos productos distintos tienes abiertos. Más productos no siempre es más diversificación: varios fondos pueden tener dentro las mismas empresas.',`<b>${c.n} productos</b> en ${c.nEnt} bancos o brókeres.`,'Muchos productos pequeños hacen más difícil seguirlos y suelen repetir empresas.');
    case 'k_est': return T('Datos estimados',pctTxt(c.est),'Qué parte del dinero que has aportado está reconstruida sin un documento que la confirme. Cuanto más baja, más fiables son las rentabilidades.',`El <b>${pctTxt(c.est)}</b> de lo aportado es estimado.`,'Bajará a medida que subas extractos y certificados.');
    case 'k_fx': return T('En otras monedas',pctTxt(c.fx/c.inv),'Qué parte de tu dinero está en activos de otra moneda (dólar, libra, won…). Si el dólar baja frente al euro, esa parte pierde valor aunque las empresas no cambien.',`<b>${eur(c.fx)}</b>.`,'Algunos fondos "cubren" la divisa para evitar este efecto; aquí se cuentan como tales cuando lo sabemos.');
    case 'k_gest': return T('Gestión activa',pctTxt(c.act_g/c.inv),DIMTXT.gestion[1],`Activa: <b>${eur(c.act_g)}</b> (${pctTxt(c.act_g/c.inv)}). Indexada: <b>${eur(c.idx_g)}</b> (${pctTxt(c.idx_g/c.inv)}).`,'');
    case 'k_dr': return T('Deuda sobre patrimonio',pctTxt(c.dr),'Cuánto debes comparado con todo lo que tienes. Por debajo de un 30 % se considera cómodo.',`Debes ${eur(c.t.deuda)} y tienes ${eur(c.t.activos)}: <b>${pctTxt(c.dr)}</b>.`,'');
    case 'k_real': return T('Rentabilidad real',pct(c.real),'Tu rentabilidad anual menos lo que han subido los precios. Es lo que de verdad ha crecido tu poder de compra.',`Has ganado un ${pctTxt(c.t.x)} al año y los precios han subido de media un ${pctTxt(c.iAvg)} al año desde que empezaste: <b>${pct(c.real)}</b> de ganancia real al año.`,c.real<0?'Tu dinero ha crecido menos que los precios: has perdido poder de compra, sobre todo por el efectivo y los productos con costes altos.':'');
    case 'bank_p': return T(c.n,eur(c.v,2),'Un producto de este banco. "Invertido" es lo que has metido menos lo que has sacado; la rentabilidad compara lo que vale ahora con eso.',`Invertido: ${eur(c.neto,2)} · Vale: ${eur(c.v,2)} · Ganancia: <b>${signed(c.gan,2)} (${pct(c.pct)})</b>.`,'Toca el nombre para abrir la ficha completa.');
    case 'p_riesgo': return T('Nivel de riesgo',c.r?c.r+' / 7':'—',DIMTXT.riesgo[1],c.r?`Este producto tiene un <b>${c.r}</b>: ${NAMETXT[String(c.r)]||''}`:'No tenemos el dato. Lo encontrarás en el folleto del producto (el "indicador de riesgo", del 1 al 7).',c.propio?'':'Valor genérico según el tipo de producto.');
    case 'p_gest': return T('Gestión',c.g,DIMTXT.gestion[1],'','');
    case 'p_liq': return T('Liquidez',c.l,DIMTXT.liquidez[1],NAMETXT[c.l]||'','');
  }
  return null;
}
function hbars(dim,rows,col){ const max=Math.max(...rows.map(r=>r.share),0.0001);
  return rows.map(r=>`<div class="hbar"${xi('dim',{dim,k:r.k,v:r.v,share:r.share,who:r.who})}><span class="hb-l">${esc(r.k)}</span><span class="hb-t"><i style="width:${r.share/max*100}%;background:${col||'var(--accent)'}"></i></span><span class="hb-v num">${pctTxt(r.share)}</span></div>`).join('') }
const PAL=['#0666EB','#8B5CF6','#E8467C','#00A36C','#F5A524','#0BA5C9','#5B6B80','#C2410C','#1E3A8A','#B45309','#2BB3A0','#A3ABB8'];
const DOUGH={};
function donut(id,dim,rows){
  const reg=rows.map(r=>xi('dim',{dim,k:r.k,v:r.v,share:r.share,who:r.who}));
  DOUGH[id]={rows,reg};
  return `<div class="donut"><div class="dn-c"><canvas id="${id}" aria-label="Gráfico circular"></canvas></div><div class="dn-l">${rows.map((r,i)=>`<div class="dn-r"${reg[i]}><i style="background:${PAL[i%PAL.length]}"></i><span>${esc(r.k)}</span><b class="num">${pctTxt(r.share)}</b></div>`).join('')}</div></div>` }
const CHARTS={};
function drawDonuts(scope){
  if (!window.Chart) return;
  scope.querySelectorAll('.dn-c canvas').forEach(cv=>{ const d=DOUGH[cv.id]; if(!d||cv.offsetParent===null) return;
    if (CHARTS[cv.id]) CHARTS[cv.id].destroy();
    CHARTS[cv.id]=new Chart(cv,{type:'doughnut',data:{labels:d.rows.map(r=>r.k),datasets:[{data:d.rows.map(r=>r.v),backgroundColor:d.rows.map((r,i)=>PAL[i%PAL.length]),borderColor:css('--surface'),borderWidth:2}]},
      options:{cutout:'64%',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${eur(c.parsed)}`}}},
        onClick:(e,els)=>{ if(els[0]){ const m=d.reg[els[0].index].match(/data-xi="(\d+)"/); if(m) openExplain(m[1]) } }}}) });
}
let pieMode='entidad';
function inicioCharts(){
  const modes=[['entidad','Bancos'],['tipo','Tipo de activo'],['clase','Clase'],['riesgo','Riesgo']];
  return `<div class="card"><div class="card-h">Reparto de tu dinero</div><div class="chips in">${modes.map(([k,l])=>`<button class="chip" data-pie="${k}" aria-pressed="${pieMode===k}">${l}</button>`).join('')}</div>${donut('pie_inicio',pieMode,exposure(pieMode))}</div>`;
}
function bankAccordion(t){
  const tot=t.activos||1; const ents=Object.entries(t.ent).sort((a,b)=>b[1]-a[1]);
  return `<div class="card"><div class="card-h">Por banco <small>toca un banco para ver sus productos</small></div>${ents.map(([e,v])=>{
    const ps=Object.values(S.prod).filter(p=>p.entidad===e&&p.estado!=='cerrado'&&value(p)>0).map(p=>({p,s:stats(p)})).sort((a,b)=>b.s.v-a.s.v);
    const neto=ps.reduce((a,x)=>a+(x.p.categoria!=='Inversión'?x.s.v:x.s.neto),0); const g=v-neto;
    const open=OPENB.has(e);
    return `<div class="acc${open?' open':''}"><div class="row tap" data-acc="${esc(e)}">${avatar(e)}<span class="row-m"><b>${esc(e)}</b><small>${ps.length} producto${ps.length===1?'':'s'} · <span class="${g>=0?'pos':'neg'}"${xi('gan_total',{gan:g,tv:v,ext:neto})}>${signed(g)}</span></small></span><span class="row-r num"${xi('entidad',{e,v,share:v/tot,n:ps.length,names:ps.map(x=>x.p.nombre).join(', ')})}>${eur(v)}</span><span class="chev acc-c">${ICON.chev}</span></div>
      <div class="acc-b">${ps.map(({p,s})=>`<div class="sub"><span class="row-m tapname" data-pid="${esc(p.id)}"><b>${esc(p.nombre)}</b><small>${esc(p.tipo)}</small></span>
        ${p.categoria!=='Inversión'?`<span class="sub-c"${xi('p_valor',{v:s.v,f:s.lv?.f,stale:s.stale})}><small>Saldo</small><b class="num">${eur(s.v)}</b></span>
        <span class="sub-c"${xi('tae',{tae:+p.tae||0,v:s.v})}><small>Interés</small><b class="num">${String(+p.tae||0).replace('.',',')} %</b></span>`
        :`<span class="sub-c"${xi('p_neto',{neto:s.neto,ent:s.ent,sal:s.sal})}><small>Invertido</small><b class="num">${eur(s.neto)}</b></span>
        <span class="sub-c"${xi('bank_p',{n:p.nombre,v:s.v,neto:s.neto,gan:s.gan,pct:s.pct})}><small>Rentab.</small><b class="num ${(s.gan||0)>=0?'pos':'neg'}">${pct(s.pct)}</b></span>`}</div>`).join('')}</div></div>` }).join('')}</div>`;
}
const OPENB=new Set();
document.addEventListener('click',e=>{
  if (e.target.closest('[data-xi]')||e.target.closest('[data-pid]')) return;
  const a=e.target.closest('[data-acc]'); if (a){ const k=a.dataset.acc; OPENB.has(k)?OPENB.delete(k):OPENB.add(k); a.parentElement.classList.toggle('open'); return }
  const pb=e.target.closest('[data-pie]'); if (pb){ pieMode=pb.dataset.pie; renderInicio(); return }
});

function renderAnalisis(){
  const el=$('#analisis'); if (!Object.keys(S.prod).length){ el.innerHTML=noData(); return }
  const k=kpis(); const tile=(key,lab,val,cls='')=>`<div class="tile"${xi(key,k)}><span>${lab}</span><b class="num ${cls}">${val}</b></div>`;
  const prodR=activeProds().filter(p=>p.categoria==='Inversión').map(p=>({p,s:stats(p)})).filter(x=>x.s.pct!=null).sort((a,b)=>b.s.pct-a.s.pct);
  const maxR=Math.max(...prodR.map(x=>Math.abs(x.s.pct)),0.0001);
  const maxC=Math.max(...k.costes.map(x=>x[1]),1);
  el.innerHTML=`<p class="tapnote">${ICON.info} Toca cualquier indicador para ver qué significa</p>
  <div class="card"><div class="card-h">Indicadores clave</div><div class="tiles">
    ${tile('xirr_total','Rentabilidad anual',pct(k.t.x))}
    ${tile('k_real','Rentabilidad real',pct(k.real),k.real<0?'neg':'pos')}
    <div class="tile"${xi('gan_total',{gan:k.t.gan,tv:k.t.tv,ext:k.t.ext})}><span>Ganancia total</span><b class="num ${k.t.gan>=0?'pos':'neg'}">${signed(k.t.gan)}</b></div>
    ${tile('k_coste','Coste al año',eur(k.coste))}
    ${tile('k_riesgo','Riesgo medio',k.riesgo==null?'—':k.riesgo.toFixed(1).replace('.',',')+' / 7')}
    ${tile('k_rv','En bolsa',pctTxt(k.rv/k.inv))}
    ${tile('k_liq','Disponible pronto',pctTxt(k.liq/k.inv))}
    ${tile('k_fx','En otras monedas',pctTxt(k.fx/k.inv))}
    ${tile('k_gest','Gestión activa',pctTxt(k.act_g/k.inv))}
    ${tile('k_ent','Mayor banco',pctTxt(k.ents[0]?.share))}
    ${tile('k_prod','Mayor producto',pctTxt(k.prods[0]?k.prods[0][1]/k.inv:0),k.prods[0]&&k.prods[0][1]/k.inv>0.25?'neg':'')}
    ${tile('k_dr','Deuda / patrimonio',pctTxt(k.dr))}
    ${tile('k_n','Productos activos',String(k.n))}
    ${tile('k_est','Datos estimados',pctTxt(k.est))}
  </div></div>
  <div class="card"><div class="card-h">Exposición al riesgo</div>
    <div class="riskscale">${[1,2,3,4,5,6,7].map(n=>{const r=exposure('riesgo').find(x=>x.k===String(n));return `<div class="rs${r?' on':''}"${xi('dim',{dim:'riesgo',k:String(n),v:r?.v||0,share:r?.share||0,who:r?.who||[]})}><i style="height:${Math.max(6,(r?.share||0)*100)}%"></i><span>${n}</span></div>`}).join('')}</div>
    <p class="hint">1 = casi sin riesgo · 7 = riesgo muy alto. Altura = parte de tu dinero.</p>
    ${hbars('clase',exposure('clase'),'var(--ei)')}</div>
  <div class="card"><div class="card-h">Sectores</div>${hbars('sec',exposure('sec'))}</div>
  <div class="card"><div class="card-h">Regiones</div>${donut('pie_reg','reg',exposure('reg'))}</div>
  <div class="card"><div class="card-h">Monedas</div>${hbars('div',exposure('div'),'#0BA5C9')}</div>
  <div class="card"><div class="card-h">Tipo de gestión</div>${hbars('gestion',exposure('gestion'),'#F5A524')}</div>
  <div class="card"><div class="card-h">Liquidez</div>${hbars('liquidez',exposure('liquidez'),'#00A36C')}</div>
  <div class="card"><div class="card-h">Rentabilidad de cada inversión <small>desde que la abriste</small></div>${prodR.map(({p,s})=>`<div class="hbar"${xi('bank_p',{n:p.nombre,v:s.v,neto:s.neto,gan:s.gan,pct:s.pct})}><span class="hb-l">${esc(p.nombre)}</span><span class="hb-t ctr"><i style="width:${Math.abs(s.pct)/maxR*50}%;${s.pct>=0?'left:50%':'right:50%'};background:${s.pct>=0?'var(--pos)':'var(--neg)'}"></i></span><span class="hb-v num ${s.pct>=0?'pos':'neg'}">${pct(s.pct)}</span></div>`).join('')}</div>
  <div class="card"><div class="card-h">Lo que te cuesta cada producto al año</div>${k.costes.map(([n,x,pc])=>`<div class="hbar"${xi('k_coste',k)}><span class="hb-l">${esc(n)}</span><span class="hb-t"><i style="width:${x/maxC*100}%;background:var(--neg)"></i></span><span class="hb-v num">${eur(x)}</span></div>`).join('')}
    ${k.sinCoste.length?`<p class="hint">Sin dato de coste: ${esc(k.sinCoste.join(', '))}.</p>`:''}</div>`;
  if (TAB==='analisis') drawDonuts(el);
}


/* ================== BITÁCORA DE CAMBIOS ================== */
function devName(){ const u=navigator.userAgent||''; const os=/iPhone/.test(u)?'iPhone':/iPad/.test(u)?'iPad':/Android/.test(u)?'Android':/Macintosh/.test(u)?'Mac':/Windows/.test(u)?'Windows':'Otro';
  const b=/Edg/.test(u)?'Edge':/CriOS|Chrome/.test(u)?'Chrome':/FxiOS|Firefox/.test(u)?'Firefox':/Safari/.test(u)?'Safari':'Navegador';
  let app=''; try{ app=(matchMedia('(display-mode: standalone)').matches||navigator.standalone)?' (app instalada)':'' }catch(e){} return `${os} · ${b}${app}` }
function logChange(accion, objeto, id, nombre, detalle, x={}){
  S.log=S.log||[];
  S.log.push({id:uid(), ts:new Date().toISOString(), accion, objeto, objeto_id:id||'', nombre:nombre||'', detalle:detalle||'', fecha_efecto:x.f||'', importe:x.importe??'', antes:x.antes??'', despues:x.despues??'', origen:x.origen||'App', usuario:ACCOUNT?.username||'', dispositivo:devName()});
}
const fdt = s => { try{ return new Date(s).toLocaleString('es-ES',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) }catch(e){ return s } };
function logRows(list){ return list.slice().reverse().map(l=>`<div class="row"${xi('log',l)}><span class="row-m"><b class="wrap">${esc(l.accion)}${l.nombre?' · '+esc(l.nombre):''}</b><small>${fdt(l.ts)} · ${esc(l.dispositivo||'')}</small></span>${l.importe!==''&&l.importe!=null?`<span class="row-r num">${eur(+l.importe,2)}</span>`:''}</div>`).join('')||'<div class="empty">Todavía no hay cambios registrados.</div>' }

/* ================== ACCIONES DIRECTAS SOBRE CADA PRODUCTO ================== */
function otherOpts(p){ return Object.values(S.prod).filter(o=>o.id!==p.id&&o.estado!=='cerrado').sort((a,b)=>(a.entidad+a.nombre).localeCompare(b.entidad+b.nombre)).map(o=>`<option value="${esc(o.id)}">${esc(o.entidad)} — ${esc(o.nombre)}</option>`).join('') }
function adjustValue(p,f,delta,src){
  const lv=lastVal(p);
  if (lv && f<lv.f) return false;
  const base=lv?lv.v:netIn(p)-delta;
  p.vals=(p.vals||[]).filter(x=>x.f!==f); p.vals.push({f,v:Math.max(0,Math.round((base+delta)*100)/100),fia:'Dato',fu:src}); p.vals.sort((a,b)=>a.f<b.f?-1:1); return true;
}
document.addEventListener('click',e=>{ const a=e.target.closest('[data-act]'); if(a){ openAction(a.dataset.act,a.dataset.aid) } });

/* ================== DEUDAS: editar y amortizar ================== */
function openDebt(kind,id){
  const d=S.debts[id]; if(!d) return; const sh=$('#sheet'); const L=loanAt(d);
  let body='';
  if (kind==='edit') body=`<label class="fl">Nombre<input name="nombre" value="${esc(d.nombre)}" required></label><label class="fl">Entidad<input name="entidad" value="${esc(d.entidad)}" required></label>
    <label class="fl">Capital inicial (€)<input name="capital" type="number" inputmode="decimal" step="0.01" value="${d.capital}" required></label><label class="fl">TIN (%)<input name="tin" type="number" inputmode="decimal" step="0.001" value="${d.tin}" required></label>
    <label class="fl">Cuota inicial (€)<input name="cuota" type="number" inputmode="decimal" step="0.01" value="${d.cuota}" required></label><label class="fl">Primera cuota<input name="primerPago" type="date" value="${d.primerPago}" required></label>
    <label class="fl">Número de cuotas<input name="n" type="number" inputmode="numeric" value="${d.n}" required></label><label class="fl">Nota<input name="nota" value="${esc(d.nota||'')}"></label>`;
  if (kind==='amort') body=`<p class="hint">Pendiente hoy: <b>${eur(L.bal,2)}</b>. Amortizar es devolver parte del préstamo antes de tiempo.</p>
    <label class="fl">Importe (€)<input name="imp" type="number" inputmode="decimal" step="0.01" required></label><label class="fl">Fecha<input name="f" type="date" value="${today()}" required></label>
    <div class="seg2"><label><input type="radio" name="modo" value="plazo" checked><span>Acortar plazo</span></label><label><input type="radio" name="modo" value="cuota"><span>Bajar cuota</span></label></div>
    <p class="hint">Acortar plazo: pagas lo mismo cada mes y terminas antes (ahorras más intereses). Bajar cuota: terminas en la misma fecha pagando menos al mes.</p>
    <label class="fl">Comisión pagada (€, opcional)<input name="com" type="number" inputmode="decimal" step="0.01"></label>`;
  sh.innerHTML=`<div class="grab"></div><div class="sh-b"><div class="sh-t">${esc(d.nombre)}</div><div class="sh-v" style="font-size:26px">${kind==='edit'?'Editar préstamo':'Amortizar'}</div><form id="fdeb">${body}<button class="btn wide">Guardar</button><button type="button" class="btn ghost wide" data-close>Cancelar</button></form>
    ${(d.extras||[]).length?`<div class="sublab">Amortizaciones registradas</div>${d.extras.map((x,i)=>`<div class="row"><span class="row-m"><b>${eur(x.imp,2)}</b><small>${fdate(x.f)} · ${x.modo==='cuota'?'bajar cuota':'acortar plazo'}</small></span><button class="del" data-dex="${i}">×</button></div>`).join('')}`:''}</div>`;
  openSheet(sh);
  sh.querySelectorAll('[data-dex]').forEach(b=>b.onclick=()=>{ if(!confirm('¿Borrar esta amortización?'))return; const x=d.extras.splice(+b.dataset.dex,1)[0]; logChange('Borrar amortización','deuda',d.id,d.nombre,`${eur(x.imp,2)} del ${fdate(x.f)}`,{f:x.f,importe:x.imp}); schedule(); sh.close(); render(); toast('Amortización borrada') });
  $('#fdeb',sh).onsubmit=e=>{ e.preventDefault(); const f=new FormData(e.target);
    if (kind==='edit'){ const before=`${eur(d.capital)} · TIN ${d.tin} % · ${eur(d.cuota,2)} · ${d.n} cuotas`;
      Object.assign(d,{nombre:f.get('nombre'),entidad:f.get('entidad'),capital:+f.get('capital'),tin:+f.get('tin'),cuota:+f.get('cuota'),primerPago:f.get('primerPago'),n:+f.get('n'),nota:f.get('nota')});
      logChange('Editar préstamo','deuda',d.id,d.nombre,`${before} → ${eur(d.capital)} · TIN ${d.tin} % · ${eur(d.cuota,2)} · ${d.n} cuotas`,{antes:before}) }
    else { const before=loanAt(d).bal; d.extras=d.extras||[]; d.extras.push({f:f.get('f'),imp:+f.get('imp'),modo:f.get('modo'),com:+f.get('com')||0}); d.extras.sort((a,b)=>a.f<b.f?-1:1);
      logChange('Amortización anticipada','deuda',d.id,d.nombre,`${f.get('modo')==='cuota'?'Bajar cuota':'Acortar plazo'}${+f.get('com')?' · comisión '+eur(+f.get('com'),2):''}`,{f:f.get('f'),importe:+f.get('imp'),antes:Math.round(before*100)/100,despues:Math.round(loanAt(d).bal*100)/100}) }
    schedule(); sh.close(); render(); toast('Préstamo actualizado') };
}
document.addEventListener('click',e=>{ const a=e.target.closest('[data-debt]'); if(a){ openDebt(a.dataset.debt,a.dataset.did) } });


/* ================== V3: perímetro de inversión, efectivo, impuestos, documentos ================== */
const isInv = p => p.categoria==='Inversión';
const isCash = p => !isInv(p);
function totals(){
  const by={'Inversión':0,'Efectivo invertido':0,'Efectivo':0}, ent={};
  let vInv=0, aport=0; const cf=[];
  for (const p of Object.values(S.prod)){
    const v=value(p); by[p.categoria]=(by[p.categoria]||0)+v;
    if (v) ent[p.entidad]=(ent[p.entidad]||0)+v;
    if (isInv(p)){ vInv+=v; for (const m of p.movs||[]){ if(!m.imp) continue;
      if (m.tipo==='entrada'){ aport+=m.imp; cf.push({f:m.f,v:-m.imp}) } else if (m.tipo==='salida'){ aport-=m.imp; cf.push({f:m.f,v:m.imp}) } } }
  }
  const deuda=Object.values(S.debts).reduce((s,d)=>s+loanAt(d).bal,0);
  const activos=by['Inversión']+by['Efectivo invertido']+by['Efectivo'];
  const x=xirr(cf.concat([{f:today(),v:vInv}]));
  return {by, ent, activos, deuda, neto:activos-deuda, ext:aport, gan:vInv-aport, x, tv:vInv, cash:by['Efectivo']+by['Efectivo invertido']};
}
function invFlow(m){ return m.tipo==='entrada'?m.imp:m.tipo==='salida'?-m.imp:0 }
function series(){
  const starts=Object.values(S.prod).map(p=>p.apertura||(p.vals&&p.vals[0]?.f)).filter(Boolean).sort();
  if (!starts.length) return null;
  const s=D(starts[0]); const out=[]; const now=today(); const ps=Object.values(S.prod);
  let d=new Date(s.getFullYear(), s.getMonth()+1, 0);
  while (true){
    const iso=d.toISOString().slice(0,10) > now ? now : d.toISOString().slice(0,10);
    const row={f:iso,'Inversión':0,'Efectivo invertido':0,ext:0,rN:0,rD:0};
    for (const p of ps){ const v=valueAt(p,iso);
      if (isInv(p)){ row['Inversión']+=v; for (const m of p.movs||[]) if (m.f<=iso) row.ext+=invFlow(m) } else row['Efectivo invertido']+=v;
      const r=profile(p).riesgo; if (r && v>0){ row.rN+=r*v; row.rD+=v } }
    out.push(row);
    if (iso===now) break;
    d=new Date(d.getFullYear(), d.getMonth()+2, 0);
  }
  return out;
}
const SP500={2021:39.07,2022:-13.30,2023:21.54,2024:32.62,2025:3.96};
function annual(ser){
  const ys=[...new Set(ser.map(r=>r.f.slice(0,4)))]; const CY=String(new Date().getFullYear());
  const res=[]; let prevV=0;
  for (const y of ys){
    const rows=ser.filter(r=>r.f.startsWith(y)); const last=rows[rows.length-1]; const V=last['Inversión'];
    const flows=[]; for (const p of Object.values(S.prod)) if (isInv(p)) for (const m of p.movs||[]) if (m.f.startsWith(y) && invFlow(m)) flows.push(m);
    const ext=flows.reduce((s,m)=>s+invFlow(m),0);
    const end=last.f, start=`${y}-01-01`; const T=Math.max(1,days(start,end));
    const W=flows.reduce((s,m)=>s+invFlow(m)*Math.max(0,days(m.f,end))/T,0);
    const gan=V-prevV-ext; const base=prevV+W;
    const rk=rows.filter(r=>r.rD>0).map(r=>r.rN/r.rD); const riesgo=rk.length?rk.reduce((a,b)=>a+b,0)/rk.length:null;
    const sp = y===CY ? (S.cfg.sp500!=null&&S.cfg.sp500!==''?+S.cfg.sp500:null) : (SP500[y]!=null?SP500[y]:null);
    res.push({y, V0:prevV, ext, V, gan, r: base>100? gan/base : null, parcial:y===CY, riesgo, sp: sp==null?null:sp/100, cashEnd:last['Efectivo invertido']});
    prevV=V;
  }
  return res;
}
/* --- inflación del día (INE) --- */
async function fetchIPC(){
  const series=['IPC251852','IPC290750','IPC251856'];
  for (const sid of series){
    try{ const r=await fetch(`https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/${sid}?nult=1`,{cache:'no-store'}); if(!r.ok) continue; const j=await r.json();
      const nom=String(j.Nombre||''); if(!/variaci[oó]n anual/i.test(nom) || !/general/i.test(nom) || !/nacional/i.test(nom)) continue;
      const dd=(j.Data||[])[0]; if(!dd||dd.Valor==null) continue;
      const fecha=dd.Fecha?new Date(dd.Fecha):null; const mes=fecha?fecha.toLocaleDateString('es-ES',{month:'long',year:'numeric'}):'';
      S.cfg.ipc=Math.round(+dd.Valor*10)/10; S.cfg.ipcRef=`IPC ${mes}, INE (consultado ${new Date().toLocaleDateString('es-ES')})`; S.ipcLive=true; render(); return true;
    }catch(e){ }
  }
  S.ipcLive=false; return false;
}
/* --- impuestos si vendes hoy (base del ahorro, España) --- */
function taxOn(g){ if(!(g>0)) return 0; const B=[[6000,.19],[50000,.21],[200000,.23],[300000,.27],[Infinity,.30]]; let t=0,prev=0; for (const [lim,r] of B){ if(g>prev){ t+=(Math.min(g,lim)-prev)*r; prev=lim } } return t }
function liquidation(){
  const rows=Object.values(S.prod).filter(p=>isInv(p)&&p.estado!=='cerrado'&&value(p)>0).map(p=>{ const s=stats(p); const g=s.v-s.neto; return {p,v:s.v,base:s.neto,g,taxAlone:taxOn(g)} }).sort((a,b)=>b.g-a.g);
  const G=rows.reduce((a,r)=>a+r.g,0); const pend=+S.cfg.perdidas||0; const net=Math.max(0,G-pend); const tax=taxOn(net);
  const pos=rows.filter(r=>r.g>0).reduce((a,r)=>a+r.g,0); rows.forEach(r=>r.taxShare=r.g>0&&pos?tax*r.g/pos:0);
  return {rows,G,pend,net,tax,V:rows.reduce((a,r)=>a+r.v,0)};
}
/* --- efectivo --- */
function cashProds(){ return Object.values(S.prod).filter(p=>isCash(p)&&p.estado!=='cerrado').sort((a,b)=>(a.entidad+a.nombre).localeCompare(b.entidad+b.nombre)) }
function cashAt(p,d){ let v=0; for (const x of p.vals||[]) if (x.f<=d) v=x.v; return v }
function cashSeries(list){ const ds=[...new Set(list.flatMap(p=>(p.vals||[]).map(v=>v.f)))].sort(); if(!ds.includes(today())) ds.push(today()); return ds.map(d=>({f:d,v:list.reduce((s,p)=>s+cashAt(p,d),0)})) }
let charts3={};
function lineChart(id,pts,color,step){ if(!window.Chart) return; const cv=document.getElementById(id); if(!cv) return; if(charts3[id]) charts3[id].destroy();
  const mut=css('--muted'), line=css('--line');
  charts3[id]=new Chart(cv,{type:'line',data:{labels:pts.map(p=>p.f),datasets:[{data:pts.map(p=>p.v),borderColor:color,backgroundColor:color+'26',fill:'origin',pointRadius:pts.length<30?3:0,pointBackgroundColor:color,tension:step?0:.3,stepped:step?'before':false,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      scales:{x:{ticks:{color:mut,maxTicksLimit:4,maxRotation:0,callback(v){return D(this.getLabelForValue(v)).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'})}},grid:{display:false},border:{display:false}},
        y:{position:'right',ticks:{color:mut,maxTicksLimit:4,callback:v=>new Intl.NumberFormat('es-ES',{notation:'compact'}).format(v)+' €'},grid:{color:line},border:{display:false}}},
      plugins:{legend:{display:false},tooltip:{callbacks:{title:i=>fdate(i[0].label),label:c=>eur(c.parsed.y,2)}}}}}) }
function openCash(){
  const dlg=$('#dlg'); const list=cashProds(); const tot=list.reduce((s,p)=>s+value(p),0);
  const ef=list.filter(p=>p.categoria==='Efectivo').reduce((s,p)=>s+value(p),0), ei=tot-ef; const ipc=S.cfg.ipc;
  const yearLoss=list.reduce((s,p)=>s+value(p)*((+p.tae||0)-ipc)/100,0);
  dlg.innerHTML=`<div class="pd-top"><button class="iconbtn" data-close aria-label="Cerrar">${ICON.back}</button><span></span></div>
  <div class="pd"><div class="pd-n">Efectivo</div><div class="pd-s">Todas tus cuentas</div>
    <div class="pd-v num"${xi('cash_total',{tot,ef,ei,n:list.length})}>${eur(tot,2)}</div>
    <button class="btn wide" data-saldos>Actualizar saldos</button>
    <div class="card"><div class="card-h">Evolución del efectivo</div><div class="chartbox sm"><canvas id="cashchart"></canvas></div></div>
    <div class="card"><div class="tiles">
      <div class="tile"${xi('cat',{cat:'Efectivo',v:ef,share:tot?ef/tot:0})}><span>Cuentas corrientes</span><b class="num">${eur(ef)}</b></div>
      <div class="tile"${xi('cat',{cat:'Efectivo invertido',v:ei,share:tot?ei/tot:0})}><span>Cuentas remuneradas</span><b class="num">${eur(ei)}</b></div>
      <div class="tile"${xi('ipc_now',{})}><span>Inflación hoy</span><b class="num">${String(ipc).replace('.',',')} %</b></div>
      <div class="tile"${xi('cash_real',{v:yearLoss,tot})}><span>Poder de compra al año</span><b class="num ${yearLoss>=0?'pos':'neg'}">${signed(yearLoss)}</b></div>
    </div></div>
    <div class="card list">${list.map(p=>{ const lv=lastVal(p); return `<div class="row tap" data-pid="${esc(p.id)}">${avatar(p.entidad)}<span class="row-m"><b>${esc(p.nombre)}</b><small>${p.tae?`${String(p.tae).replace('.',',')} % · `:''}${lv?'actualizado '+sdate(lv.f):'<em>sin saldo: actualízalo</em>'}</small></span><span class="row-r num"${xi('p_valor',{v:value(p),f:lv?.f,stale:lv?days(lv.f,today()):null})}>${eur(value(p),2)}</span></div>` }).join('')}</div>
  </div>`;
  openSheet(dlg); dlg.scrollTop=0;
  lineChart('cashchart',cashSeries(list),css('--ei'),true);
}
function openSaldos(){
  const sh=$('#sheet'); const list=cashProds();
  sh.innerHTML=`<div class="grab"></div><div class="sh-b"><div class="sh-t">Efectivo</div><div class="sh-v" style="font-size:26px">Actualizar saldos</div>
    <form id="fsal"><label class="fl">Fecha<input type="date" name="f" value="${today()}" required></label>
    <div class="vlist">${list.map(p=>{const lv=lastVal(p);return `<label class="vrow">${avatar(p.entidad)}<span class="row-m"><b>${esc(p.nombre)}</b><small>Antes: ${lv?eur(lv.v,2)+' · '+sdate(lv.f):'sin dato'}</small></span><input type="number" inputmode="decimal" step="0.01" name="s_${esc(p.id)}" placeholder="Saldo €" aria-label="Saldo de ${esc(p.nombre)}"></label>`}).join('')}</div>
    <p class="hint">Rellena solo las cuentas que hayan cambiado. Cada cambio queda en la bitácora.</p>
    <button class="btn wide">Guardar saldos</button><button type="button" class="btn ghost wide" data-close>Cancelar</button></form></div>`;
  openSheet(sh);
  $('#fsal',sh).onsubmit=e=>{ e.preventDefault(); const f=new FormData(e.target); const fe=f.get('f'); let n=0;
    for (const [k,v] of f.entries()){ if(!k.startsWith('s_')||v==='') continue; const p=S.prod[k.slice(2)]; const old=lastVal(p)?.v;
      p.vals=(p.vals||[]).filter(x=>x.f!==fe); p.vals.push({f:fe,v:+v,fia:'Dato',fu:'Saldo actualizado'}); p.vals.sort((a,b)=>a.f<b.f?-1:1);
      logChange('Actualizar saldo','efectivo',p.id,p.nombre,`${old!=null?eur(old,2)+' → ':''}${eur(+v,2)}${old!=null?` (${signed(+v-old,2)})`:''}`,{f:fe,antes:old??'',despues:+v}); n++ }
    sh.close(); if(n){ schedule(); render(); if($('#dlg').open) openCash() } toast(n?`${n} saldos actualizados`:'No has cambiado ningún saldo') };
}
document.addEventListener('click',e=>{ if(e.target.closest('[data-xi]')) return; if (e.target.closest('[data-saldos]')) openSaldos(); else if (e.target.closest('[data-cash]')) openCash() });

/* --- acciones sobre inversiones: valor actual, aportado, retirado, traspasado, cerrado --- */
function cashOpts(){ return cashProds().map(o=>`<option value="${esc(o.id)}">${esc(o.entidad)} — ${esc(o.nombre)}</option>`).join('') }
function invOpts(p){ return Object.values(S.prod).filter(o=>o.id!==p.id&&isInv(o)&&o.estado!=='cerrado').sort((a,b)=>(a.entidad+a.nombre).localeCompare(b.entidad+b.nombre)).map(o=>`<option value="${esc(o.id)}">${esc(o.entidad)} — ${esc(o.nombre)}</option>`).join('') }
function openAction(kind,id){
  const p=S.prod[id]; if(!p) return; const sh=$('#sheet'); const cash=isCash(p); const lv=lastVal(p); const fund=p.traspasable;
  const T=cash?'Actualizar saldo':{valor:'Valor actual',aportar:'Aportado',retirar:'Retirado',traspaso:'Traspasado',cerrar:'Cerrado'}[kind];
  if (cash) kind='valor';
  const fecha=`<label class="fl">Fecha<input type="date" name="f" value="${today()}" required></label>`;
  const nota=`<label class="fl">Nota (opcional)<input name="nota"></label>`;
  const noCash=!cashProds().length?'<p class="hint">Primero crea tus cuentas de efectivo.</p>':'';
  let body='';
  if (kind==='valor') body=`<p class="hint">${cash?'Mira el saldo en la app del banco y escríbelo aquí.':'Mira lo que vale hoy en la app del banco o bróker. Si ha subido o bajado, aquí se refleja.'}</p>
    <label class="fl">${cash?'Saldo':'Valor'} actual (€)<input type="number" inputmode="decimal" step="0.01" name="v" required placeholder="${lv?eur(lv.v,2):''}"></label>${fecha}`;
  if (kind==='aportar') body=`${noCash}<label class="fl">Importe aportado (€)<input type="number" inputmode="decimal" step="0.01" name="imp" required></label>${fecha}
    <label class="fl">¿De qué cuenta sale?<select name="cta" required>${cashOpts()}</select></label>
    <label class="fl">Precio de compra (opcional)<input type="number" inputmode="decimal" step="0.000001" name="precio"></label>
    <label class="check"><input type="checkbox" name="adjc" checked> Restarlo del saldo de esa cuenta</label>
    <label class="check"><input type="checkbox" name="adj" checked> Sumarlo al valor de la inversión</label>${nota}`;
  if (kind==='retirar') body=`${noCash}<label class="fl">Importe retirado (€)<input type="number" inputmode="decimal" step="0.01" name="imp" required></label>${fecha}
    <label class="fl">¿A qué cuenta va?<select name="cta" required>${cashOpts()}</select></label>
    <label class="check"><input type="checkbox" name="adjc" checked> Sumarlo al saldo de esa cuenta</label>
    <label class="check"><input type="checkbox" name="adj" checked> Restarlo del valor de la inversión</label>
    ${!fund?'<p class="hint">Ojo: al retirar de este producto, Hacienda cobra impuestos sobre la parte de ganancia.</p>':''}${nota}`;
  if (kind==='traspaso') body=`<div class="seg2"><label><input type="radio" name="dir" value="out" checked><span>De aquí a otra</span></label><label><input type="radio" name="dir" value="in"><span>De otra a aquí</span></label></div>
    <label class="fl">La otra inversión<select name="otro" required>${invOpts(p)}</select></label>
    <label class="fl">Importe (€)<input type="number" inputmode="decimal" step="0.01" name="imp" required></label>${fecha}
    <label class="check"><input type="checkbox" name="adj" checked> Ajustar el valor de las dos inversiones</label>
    <p class="hint">Un traspaso mueve dinero entre dos inversiones: no es dinero nuevo. ${fund?'Entre fondos de inversión no paga impuestos.':'Si no son fondos, cuenta como venta y compra, y la venta tributa.'}</p>${nota}`;
  if (kind==='cerrar') body=`${noCash}<label class="fl">Importe cobrado (€)<input type="number" inputmode="decimal" step="0.01" name="imp" required value="${lv?lv.v:''}"></label>${fecha}
    <label class="fl">¿A qué cuenta va el dinero?<select name="cta" required>${cashOpts()}</select></label>
    <label class="check"><input type="checkbox" name="adjc" checked> Sumarlo al saldo de esa cuenta</label>
    <label class="check"><input type="checkbox" name="total" checked> Cerrar del todo (desaparece de tus inversiones activas)</label>${nota}`;
  sh.innerHTML=`<div class="grab"></div><div class="sh-b"><div class="sh-t">${esc(p.nombre)}</div><div class="sh-v" style="font-size:26px">${T}</div><form id="fact">${body}<button class="btn wide">Guardar</button><button type="button" class="btn ghost wide" data-close>Cancelar</button></form></div>`;
  openSheet(sh);
  $('#fact',sh).onsubmit=e=>{ e.preventDefault(); const f=new FormData(e.target); const fe=f.get('f'); const nt=f.get('nota')||''; const imp=+f.get('imp')||0; let msg='Guardado'; let warn=false;
    if (kind==='valor'){ const v=+f.get('v'); const old=lv?.v; p.vals=(p.vals||[]).filter(x=>x.f!==fe); p.vals.push({f:fe,v,fia:'Dato',fu:cash?'Saldo actualizado':'Actualización manual'}); p.vals.sort((a,b)=>a.f<b.f?-1:1);
      logChange(T,cash?'efectivo':'producto',p.id,p.nombre,`${old!=null?eur(old,2)+' → ':''}${eur(v,2)}${old!=null?` (${signed(v-old,2)})`:''}`,{f:fe,antes:old??'',despues:v}); msg=cash?'Saldo actualizado':'Valor actualizado' }
    if (kind==='aportar'||kind==='retirar'||kind==='cerrar'){ const inn=kind==='aportar'; const c=S.prod[f.get('cta')]; if(!c){ toast('Elige una cuenta de efectivo'); return }
      const precio=+f.get('precio')||null;
      addMov(p,{f:fe,tipo:inn?'entrada':'salida',imp,ext:inn?imp:-imp,cls:inn?'Dinero nuevo':'Retirada',fia:'Dato',mov:inn?`Aportado desde ${c.nombre}`:(kind==='cerrar'?`Cerrado · cobro a ${c.nombre}`:`Retirado a ${c.nombre}`),precio,uds:precio?imp/precio:null,nota:nt});
      addMov(c,{f:fe,tipo:inn?'salida':'entrada',imp,ext:0,cls:'Interno',fia:'Dato',mov:inn?`Aportado a ${p.nombre}`:`Retirado de ${p.nombre}`,nota:nt});
      if (f.get('adjc') && !adjustValue(c,fe,inn?-imp:imp,inn?'Calculado: saldo − aportación':'Calculado: saldo + retirada')) warn=true;
      const antes=lv?.v;
      if (kind==='cerrar' && f.get('total')){ p.estado='cerrado'; p.cierre=fe; p.vals=(p.vals||[]).filter(x=>x.f!==fe); p.vals.push({f:fe,v:0,fia:'Dato',fu:'Cierre'}); p.vals.sort((a,b)=>a.f<b.f?-1:1) }
      else if (f.get('adj')||kind==='cerrar'){ if(!adjustValue(p,fe,inn?imp:-imp,inn?'Calculado: valor + aportación':'Calculado: valor − retirada')) warn=true }
      logChange(T,'producto',p.id,p.nombre,`${inn?'Desde':'A'} ${c.nombre}${nt?' · '+nt:''}`,{f:fe,importe:inn?imp:-imp,antes:antes??'',despues:kind==='cerrar'&&f.get('total')?0:''});
      msg=inn?'Aportación guardada':kind==='cerrar'?'Inversión cerrada':'Retirada guardada' }
    if (kind==='traspaso'){ const q=S.prod[f.get('otro')]; if(!q){ toast('Elige la otra inversión'); return } const out=f.get('dir')==='out'; const [from,to]=out?[p,q]:[q,p];
      addMov(from,{f:fe,tipo:'salida',imp,ext:0,cls:'Interno',fia:'Dato',mov:`Traspasado a ${to.nombre}`,nota:nt}); addMov(to,{f:fe,tipo:'entrada',imp,ext:0,cls:'Interno',fia:'Dato',mov:`Traspasado desde ${from.nombre}`,nota:nt});
      if (f.get('adj')){ if(!adjustValue(from,fe,-imp,'Calculado por traspaso')) warn=true; if(!adjustValue(to,fe,imp,'Calculado por traspaso')) warn=true }
      logChange('Traspasado','traspaso',p.id,p.nombre,`${from.nombre} → ${to.nombre}${nt?' · '+nt:''}`,{f:fe,importe:imp}); msg='Traspaso guardado' }
    schedule(); sh.close(); render(); openProduct(p.id); toast(warn?msg+'. Algún valor no se ajustó: hay una valoración posterior a esa fecha':msg);
  };
}
function actionBar(p){ if (p.estado==='cerrado') return '';
  if (isCash(p)) return `<button class="btn wide" data-act="valor" data-aid="${esc(p.id)}" style="margin:6px 0 14px">Actualizar saldo</button>`;
  const x='<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const b=[['valor',ICON.refresh,'Valor actual'],['aportar',ICON.down,'Aportado'],['retirar',ICON.up,'Retirado'],['traspaso',ICON.repeat,'Traspasado'],['cerrar',x,'Cerrado']];
  return `<div class="actions pact">${b.map(([k,ic,l])=>`<button class="act" data-act="${k}" data-aid="${esc(p.id)}"><span>${ic}</span>${l}</button>`).join('')}</div>` }

/* --- documentos PDF por producto (OneDrive › Aplicaciones › Patrimonio › docs) --- */
const DOCROOT='https://graph.microsoft.com/v1.0/me/drive/special/approot:/docs/';
async function gfetch(url,opts={}){ const t=await token(); return fetch(url,Object.assign({},opts,{headers:Object.assign({Authorization:'Bearer '+t},opts.headers||{})})) }
async function listDocs(pid){ const r=await gfetch(`${DOCROOT}${encodeURIComponent(pid)}:/children?select=id,name,size,lastModifiedDateTime,@microsoft.graph.downloadUrl`); if(r.status===404) return []; if(!r.ok) throw new Error('docs_'+r.status); return (await r.json()).value||[] }
async function uploadDoc(pid,file){
  const path=`${DOCROOT}${encodeURIComponent(pid)}/${encodeURIComponent(file.name)}`;
  if (file.size<=4*1024*1024){ const r=await gfetch(path+':/content',{method:'PUT',headers:{'Content-Type':file.type||'application/pdf'},body:file}); if(!r.ok) throw new Error('up_'+r.status); return }
  const s=await gfetch(path+':/createUploadSession',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item:{'@microsoft.graph.conflictBehavior':'replace'}})}); if(!s.ok) throw new Error('ses_'+s.status);
  const {uploadUrl}=await s.json(); const CH=320*1024*10;
  for (let o=0;o<file.size;o+=CH){ const end=Math.min(file.size,o+CH); const r=await fetch(uploadUrl,{method:'PUT',headers:{'Content-Range':`bytes ${o}-${end-1}/${file.size}`},body:file.slice(o,end)}); if(!r.ok&&r.status!==202) throw new Error('chunk_'+r.status) }
}
let pdfjsReady=null;
function loadPdfJs(){ if(window.pdfjsLib) return Promise.resolve(); if(pdfjsReady) return pdfjsReady; pdfjsReady=new Promise((ok,ko)=>{ const s=document.createElement('script'); s.src='lib/pdf.min.js'; s.onload=()=>{ window.pdfjsLib.GlobalWorkerOptions.workerSrc='lib/pdf.worker.min.js'; ok() }; s.onerror=ko; document.head.appendChild(s) }); return pdfjsReady }
const KW=[['Comisiones y costes',/comisi[oó]n|gastos de|coste|tarifa|mantenimiento|suscripci[oó]n/i],['Penalizaciones, rescate y cancelación',/penaliz|rescate|cancelaci[oó]n|reembolso anticipado|amortizaci[oó]n anticipada|desistimiento|resoluci[oó]n/i],
  ['Plazos, vencimiento y preavisos',/vencimiento|plazo|duraci[oó]n|preaviso|permanencia|renovaci[oó]n|prórroga|prorroga/i],['Intereses, bonus y rentabilidad',/\bTAE\b|\bTIN\b|inter[eé]s|remuneraci[oó]n|bonificaci[oó]n|bonus|fidelidad/i],
  ['Garantías y protección',/garant[ií]a|fondo de garant|protecci[oó]n de dep/i],['Fiscalidad',/fiscal|tribut|impuesto|retenci[oó]n|IRPF/i],['Riesgos',/riesgo|p[eé]rdidas?|tipo de cambio|divisa|volatilidad/i],
  ['Mínimos y condiciones',/m[ií]nim[oa]|requisito|obligaci[oó]n|l[ií]mite|importe m[aá]ximo/i]];
async function scanPdf(file){
  await loadPdfJs(); const doc=await window.pdfjsLib.getDocument({data:await file.arrayBuffer(),isEvalSupported:false}).promise; let txt='';
  for (let i=1;i<=Math.min(doc.numPages,40);i++){ const pg=await doc.getPage(i); const c=await pg.getTextContent(); txt+=' '+c.items.map(x=>x.str).join(' ') }
  const sents=txt.replace(/\s+/g,' ').split(/(?<=[.;:])\s+(?=[A-ZÁÉÍÓÚÑ0-9•\-(])/).map(s=>s.trim()).filter(s=>s.length>=40&&s.length<=320);
  const out=[]; const seen=new Set();
  for (const [cat,re] of KW){ const hits=sents.filter(s=>re.test(s)).map(s=>({s,score:(/\d/.test(s)?2:0)+(/%|€|euros/i.test(s)?2:0)-(s.length>220?1:0)})).sort((a,b)=>b.score-a.score);
    let n=0; for (const h of hits){ const k=h.s.slice(0,80).toLowerCase(); if(seen.has(k)) continue; seen.add(k); out.push({cat,txt:h.s,doc:file.name}); if(++n>=3) break } }
  return out;
}
async function renderDocs(p){
  const box=$('#docbox'); if(!box) return; box.innerHTML='<p class="hint">Cargando documentos…</p>';
  try{ const ds=await listDocs(p.id);
    box.innerHTML=ds.length?ds.map(d=>`<div class="row"><span class="av ic">PDF</span><span class="row-m"><b class="wrap">${esc(d.name)}</b><small>${(d.size/1024/1024).toFixed(1).replace('.',',')} MB · ${sdate(String(d.lastModifiedDateTime).slice(0,10))}</small></span><button class="btn ghost sm" data-opendoc="${esc(d['@microsoft.graph.downloadUrl']||'')}" data-name="${esc(d.name)}">Abrir</button></div>`).join(''):'<p class="hint">Todavía no hay documentos de este producto.</p>';
    box.querySelectorAll('[data-opendoc]').forEach(b=>b.onclick=async()=>{ try{ const r=await fetch(b.dataset.opendoc); const u=URL.createObjectURL(await r.blob()); const a=document.createElement('a'); a.href=u; a.target='_blank'; a.rel='noopener'; a.download=b.dataset.name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),60000) }catch(e){ toast('No se ha podido abrir el documento') } });
  }catch(e){ box.innerHTML='<p class="hint">No se han podido leer los documentos de OneDrive.</p>' }
}
async function onDocPicked(p,file){
  if(!file) return; if(!/pdf$/i.test(file.name)&&file.type!=='application/pdf'){ toast('Elige un PDF'); return }
  toast('Subiendo documento…');
  try{ await uploadDoc(p.id,file) }catch(e){ toast('No se ha podido subir a OneDrive'); return }
  let found=[]; try{ toast('Leyendo el documento…'); found=await scanPdf(file) }catch(e){ }
  let prev=[]; try{ prev=JSON.parse(p.claves_pdf||'[]') }catch(e){}
  p.claves_pdf=JSON.stringify(prev.filter(x=>x.doc!==file.name).concat(found).slice(-40));
  logChange('Subir documento','producto',p.id,p.nombre,`${file.name} · ${found.length} puntos detectados`);
  schedule(); openProduct(p.id); toast(found.length?`Documento guardado · ${found.length} puntos a vigilar`:'Documento guardado');
}
function clavesCard(p){
  const man=String(p.claves||'').split('\n').map(s=>s.trim()).filter(Boolean); let auto=[]; try{ auto=JSON.parse(p.claves_pdf||'[]') }catch(e){}
  const grp={}; auto.forEach(a=>(grp[a.cat]=grp[a.cat]||[]).push(a));
  return `<div class="card"><div class="card-h">Lo que debes vigilar</div>
    ${man.length?man.map(t=>`<div class="claim"${xi('clave',{t,src:'Resumen del contrato y de los documentos del producto'})}>${ICON.info}<span>${esc(t)}</span></div>`).join(''):''}
    ${Object.keys(grp).length?`<div class="sublab">Detectado en tus documentos</div>${Object.entries(grp).map(([c,xs])=>`<details class="kw"><summary>${esc(c)} <small>${xs.length}</small></summary>${xs.map(a=>`<p${xi('clave',{t:a.txt,src:a.doc,cat:c})}>${esc(a.txt)}</p>`).join('')}</details>`).join('')}`:''}
    ${!man.length&&!Object.keys(grp).length?'<p class="hint">Sube el contrato o las condiciones en PDF y la app marcará comisiones, penalizaciones, plazos y otros puntos a vigilar.</p>':''}
  </div>
  <div class="card"><div class="card-h">Documentos</div><div id="docbox"></div><label class="btn ghost wide" style="cursor:pointer;margin-top:10px">Subir PDF<input type="file" accept="application/pdf,.pdf" hidden data-docup="${esc(p.id)}"></label></div>`;
}
document.addEventListener('change',e=>{ const i=e.target.closest('[data-docup]'); if(i){ onDocPicked(S.prod[i.dataset.docup],i.files[0]); i.value='' } });

/* --- importar actualización (añade o completa productos, divide productos, ajustes) --- */
async function importUpdate(file){
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
  const sh=n=>wb.Sheets[n]?XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:''}):[];
  const ds=v=> typeof v==='number' ? new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10) : String(v).slice(0,10);
  const num=v=> v===''||v==null ? null : +String(v).replace(',','.');
  const P=sh('Productos').length?sh('Productos'):(sh('Clasificación').length?sh('Clasificación'):sh('Clasificacion'));
  const M=sh('Movimientos'), V=sh('Valoraciones'), DV=sh('Dividir'), A=sh('Ajustes');
  let nuevos=0, act=0, div=0; const created=new Set();
  const FIELDS=['nombre','entidad','tipo','categoria','isin','estado','clase','gestion','liquidez','regiones','sectores','divisas','nota','claves'];
  for (const r of P){ const id=String(r.id||'').trim(); if(!id) continue; let p=S.prod[id];
    if (!p){ if(!r.nombre||!r.tipo) continue; p=S.prod[id]={id,nombre:r.nombre,entidad:r.entidad||'',tipo:r.tipo,categoria:r.categoria||catOf(r.tipo),isin:r.isin||'',estado:r.estado||'activo',apertura:r.apertura?ds(r.apertura):null,cierre:null,traspasable:String(r.traspasable||'').toLowerCase().startsWith('s'),costePct:num(r.coste_pct),nota:r.nota||'',periodica:null,movs:[],vals:[]}; created.add(id); nuevos++ } else act++;
    FIELDS.forEach(k=>{ if(r[k]!==''&&r[k]!=null) p[k]=String(r[k]) });
    if (r.riesgo!==''&&r.riesgo!=null) p.riesgo=num(r.riesgo); if (r.coste_pct!==''&&r.coste_pct!=null) p.costePct=num(r.coste_pct); if (r.tae!==''&&r.tae!=null) p.tae=num(r.tae);
    if (r.traspasable!=='') p.traspasable=String(r.traspasable).toLowerCase().startsWith('s');
    if (r.periodica_importe!==''&&r.periodica_importe!=null) p.periodica={importe:num(r.periodica_importe),frecuencia:r.periodica_frecuencia||'mensual',hasta:r.periodica_hasta?ds(r.periodica_hasta):today()} }
  M.forEach(r=>{ const p=S.prod[r.producto_id]; if(!p||!created.has(p.id)) return; p.movs.push({f:ds(r.fecha),tipo:r.tipo,imp:num(r.importe)||0,ext:num(r.externo)||0,cls:r.clasificacion||'',fia:r.fiabilidad||'Dato',mov:r.movimiento||'',nota:r.nota||''}) });
  V.forEach(r=>{ const p=S.prod[r.producto_id]; if(!p||!created.has(p.id)) return; p.vals.push({f:ds(r.fecha),v:num(r.valor)||0,fia:r.fiabilidad||'Dato',fu:r.fuente||''}) });
  // dividir un producto en varios (p. ej. My World en sus 5 fondos), usando TUS movimientos actuales
  const byFrom={}; DV.forEach(r=>{ (byFrom[r.desde]=byFrom[r.desde]||[]).push({id:String(r.hacia),w:num(r.peso)}) });
  for (const [from,kids] of Object.entries(byFrom)){ const par=S.prod[from]; if(!par) continue; const sw=kids.reduce((a,k)=>a+k.w,0)||1;
    for (const k of kids){ const c=S.prod[k.id]; if(!c) continue; const w=k.w/sw;
      c.movs=(par.movs||[]).map(m=>Object.assign({},m,{imp:Math.round(m.imp*w*100)/100,ext:Math.round((m.ext||0)*w*100)/100,nota:(m.nota?m.nota+' · ':'')+`${Math.round(w*100)} % de ${par.nombre}`}));
      if (par.periodica) c.periodica=Object.assign({},par.periodica,{importe:Math.round(par.periodica.importe*w*100)/100});
      c.apertura=par.apertura; c.estado=par.estado; }
    const pvs=par.vals||[]; const kidVals=kids.map(k=>S.prod[k.id]).filter(Boolean);
    for (const pv of pvs){ if (kidVals.every(c=>c.vals.some(v=>v.f===pv.f))) continue;
      let ref=null, best=1e9; for (const d of [...new Set(kidVals.flatMap(c=>c.vals.map(v=>v.f)))]){ const sum=kidVals.reduce((a,c)=>a+(c.vals.find(v=>v.f===d)?.v||0),0); const dd=Math.abs(days(d,pv.f)); if(sum>0&&dd<best){ best=dd; ref={d,sum} } }
      kidVals.forEach((c,i)=>{ const sh2=ref?(c.vals.find(v=>v.f===ref.d)?.v||0)/ref.sum:kids[i].w/sw; if(!c.vals.some(v=>v.f===pv.f)) c.vals.push({f:pv.f,v:Math.round(pv.v*sh2*100)/100,fia:'Estimado',fu:`Reparto de ${par.nombre}`}) }) }
    kidVals.forEach(c=>{ c.vals.sort((a,b)=>a.f<b.f?-1:1); c.movs.sort((a,b)=>a.f<b.f?-1:1) });
    delete S.prod[from]; div++; logChange('Dividir producto','producto',from,par.nombre,`En ${kidVals.map(c=>c.nombre).join(', ')}`,{origen:'Importación'}) }
  if (A[0]){ const a=A[0]; if(a.perdidas_pendientes!==''&&a.perdidas_pendientes!=null) S.cfg.perdidas=num(a.perdidas_pendientes); if(a.sp500_ytd!==''&&a.sp500_ytd!=null) S.cfg.sp500=num(a.sp500_ytd); if(a.sp500_ref) S.cfg.sp500ref=String(a.sp500_ref); if(a.avisos) S.cfg.avisos=String(a.avisos).split('|').map(s=>s.trim()).filter(Boolean) }
  logChange('Importar actualización','datos','',file.name,`${nuevos} nuevos · ${act} completados · ${div} divididos`,{origen:'Importación'});
  return {nuevos,act,div};
}

/* --- textos de ayuda nuevos --- */
function explain3(key,c){
  const T=(t,v,what,you,tip)=>({t,v,what,you,tip}); const ipc=String(S.cfg.ipc).replace('.',',')+' %';
  switch(key){
    case 'ext_total': return T('Invertido de tu bolsillo',eur(c.ext),'Lo que has metido en tus inversiones (fondos, ETF, acciones, cripto, seguros…) desde tus cuentas, menos lo que has sacado de vuelta a ellas. Los traspasos entre inversiones no cuentan porque el dinero solo cambia de sitio.',`En total, <b>${eur(c.ext)}</b> invertidos en neto desde tu primera inversión.`,'Una parte de esta cifra está reconstruida (aportaciones antiguas sin documento).');
    case 'gan_total': return T('Rentabilidad de tus inversiones',eur(c.gan),'Lo que han ganado tus inversiones por encima de lo que pusiste. Si metiste 100 € y ahora valen 120 €, has ganado 20 €. El efectivo no cuenta aquí: lo que entra en tus cuentas es tu sueldo, no rentabilidad.',`Valen hoy ${eur(c.tv)} y has invertido ${eur(c.ext)}.<br><b>${eur(c.tv)} − ${eur(c.ext)} = ${eur(c.gan)}</b>`,'Antes de impuestos. Incluye las inversiones ya cerradas.');
    case 'xirr_total': return T('Rentabilidad anual de tus inversiones',pct(c.x),'Cuánto han crecido tus inversiones de media cada año, teniendo en cuenta cuándo metiste cada euro (XIRR). Es la forma más justa de medir lo que has ganado tú.',`De media, <b>${pctTxt(c.x)} al año</b>. Los precios suben ahora un ${ipc} al año.`,'No incluye el efectivo, que se mide aparte.');
    case 'activos': return T('Activos sin deudas',eur(c.v),'Todo lo que tienes sumado (inversiones y efectivo), sin restar lo que debes.',`Inversiones ${eur(c.inv)} + efectivo ${eur(c.cash)} = <b>${eur(c.v)}</b>.`,'Si restas tus préstamos sale tu patrimonio neto.');
    case 'inv_val': return T('Tus inversiones hoy',eur(c.tv),'Lo que valen ahora tus inversiones: el dinero que has puesto más lo que ha ganado (o perdido).',`Invertido ${eur(c.ext)} + rentabilidad ${signed(c.gan)} = <b>${eur(c.tv)}</b>.`,'');
    case 'year_new': return T(`Invertido en ${c.y}`,eur(c.v),'Lo que has metido en tus inversiones este año desde tus cuentas, menos lo que has retirado. Los traspasos entre inversiones no cuentan.',`<b>${eur(c.v)}</b> en neto.`,'');
    case 'ext_y': return T(`Invertido en ${c.y}`,eur(c.v),'Lo que metiste en inversiones ese año desde tus cuentas, menos lo que retiraste.',`<b>${eur(c.v)}</b>`,'');
    case 'v0_y': return T(`Inversiones al empezar ${c.y}`,eur(c.v),'Lo que valían tus inversiones el 1 de enero de ese año (sin contar el efectivo).',`<b>${eur(c.v)}</b>`,'Valores intermedios aproximados.');
    case 'v1_y': return T(`Inversiones al ${c.parcial?'día de hoy':'acabar '+c.y}`,eur(c.v),'Lo que valían tus inversiones al final del año (sin contar el efectivo).',`<b>${eur(c.v)}</b>`,'Valores intermedios aproximados.');
    case 'y_risk': return T(`Riesgo en ${c.y}`,c.r==null?'—':c.r.toFixed(1).replace('.',',')+' / 7','El nivel de riesgo medio al que estuvo expuesto tu dinero ese año, en la escala oficial del 1 (casi nada) al 7 (muchísimo). Pesa más lo que tenía más dinero, e incluye el efectivo (que es un 1).',c.r==null?'Sin datos.':`Media del año: <b>${c.r.toFixed(1).replace('.',',')} sobre 7</b> (${RLAB(c.r)}).`,'Usa la clasificación actual de cada producto, también para los ya cerrados.');
    case 'y_sp': return T(`S&P 500 en ${c.y}`,pct(c.sp),'Lo que ganó o perdió la bolsa de EE. UU. (las 500 mayores empresas) ese año, con dividendos. Sirve para comparar: un fondo indexado al S&P 500 habría hecho más o menos esto.',c.sp==null?'Sin dato para ese año.':`S&P 500: <b>${pctTxt(c.sp)}</b>. Tus inversiones: <b>${pctTxt(c.r)}</b>. ${c.r!=null?(c.r>=c.sp?'Ese año lo hiciste mejor que el índice.':'Ese año el índice lo hizo mejor.'):''}`,c.parcial?`Año en curso: ${esc(S.cfg.sp500ref||'dato en dólares hasta la última actualización')}. Los años cerrados están en euros.`:'Dato en euros, sin cubrir la divisa.');
    case 'cash_total': return T('Efectivo total',eur(c.tot),'Todo el dinero que tienes en cuentas: corrientes (no pagan nada) y remuneradas (pagan algo de interés).',`<b>${eur(c.tot)}</b> en ${c.n} cuentas: ${eur(c.ef)} en corrientes y ${eur(c.ei)} en remuneradas.`,'Este dinero no tributa al sacarlo; solo los intereses tributan cada año.');
    case 'ipc_now': return T('Inflación hoy',ipc,'Cuánto suben los precios en un año. Con un 5 %, lo que hoy cuesta 100 € costará unos 105 € dentro de un año.',`Dato: <b>${ipc}</b>. ${esc(S.cfg.ipcRef||'')}`,S.ipcLive?'La app lo consulta al INE cada vez que la abres.':'No se ha podido consultar al INE ahora mismo: es el último dato guardado. Puedes cambiarlo en Más › Ajustes.');
    case 'cash_real': return T('Poder de compra al año',signed(c.v),'Lo que gana (o pierde) tu efectivo cada año en poder de compra: el interés que te pagan menos lo que suben los precios.',`Con tus saldos y tipos actuales: <b>${signed(c.v)} al año</b> sobre ${eur(c.tot)}.`,'Las cuentas que no pagan nada pierden exactamente la inflación.');
    case 'tae': return T('Interés de la cuenta',c.tae?String(c.tae).replace('.',',')+' %':'0 %','Lo que te paga la cuenta al año (TAE). Se cobra en intereses, que tributan cada año en la renta.',`Sobre ${eur(c.v)} son unos <b>${eur(c.v*(+c.tae||0)/100)} al año</b> antes de impuestos.`,'Puedes cambiar el tipo en "Editar" si el banco lo modifica.');
    case 'real_acc': return T('Rentabilidad real',pct(c.r),'El interés de la cuenta menos la inflación. Si sale negativo, el dinero de esta cuenta compra cada año un poco menos.',`${String(c.tae||0).replace('.',',')} % − ${ipc} = <b>${pctTxt(c.r)}</b>: ${signed(c.v)} al año sobre ${eur(c.bal)}.`,'');
    case 'tax_total': return T('Impuestos si vendes todo hoy',eur(c.tax),'Lo que pagarías a Hacienda si vendieras hoy todas tus inversiones. Solo se paga por la ganancia, no por lo que pusiste, y las pérdidas de unas restan de las ganancias de otras.',`Ganancia total ${signed(c.G)}${c.pend?` − pérdidas de años anteriores ${eur(c.pend)}`:''} = base ${eur(c.net)}.<br>Tramos 2026: 19 % hasta 6.000 €, 21 % hasta 50.000 €, 23 % hasta 200.000 €…<br><b>Impuestos ≈ ${eur(c.tax)}</b>`,'Estimación: usa lo aportado como coste fiscal (el real puede variar) y supone que vendes todo en el mismo año. Los traspasos entre fondos no pagan nada. Confírmalo con tu gestor.');
    case 'tax_left': return T('Te quedaría',eur(c.v-c.tax),'Lo que tendrías en la cuenta si vendieras todas tus inversiones hoy y pagaras los impuestos.',`${eur(c.v)} − ${eur(c.tax)} = <b>${eur(c.v-c.tax)}</b>`,'');
    case 'tax_prod': return T(`Impuestos: ${c.n}`,eur(c.share),'Lo que pagarías a Hacienda por este producto si lo vendieras hoy.',`Vale ${eur(c.v)} y pusiste ${eur(c.base)}: ganancia <b>${signed(c.g)}</b>.<br>Vendiendo solo este: ${eur(c.alone)} de impuestos. Vendiendo todo a la vez: ${eur(c.share)} (las pérdidas de otros productos compensan).`,c.g<0?'Tiene pérdidas: venderlo restaría impuestos de otras ganancias.':'');
    case 'clave': return T(c.cat||'A vigilar','',esc(c.t),`Fuente: ${esc(c.src||'—')}.`,'Detectado automáticamente o resumido del contrato: comprueba siempre el documento original.');
    case 'chart': return T('Evolución de tus inversiones','','La zona de color es lo que valían tus inversiones cada mes; la morada, tu efectivo. La línea discontinua es lo que habías invertido de tu bolsillo. Si la zona azul está por encima de la línea, vas ganando.','Toca el gráfico para ver los valores de cada mes.','Entre fechas con valores reales, la app traza una línea recta: los meses intermedios son aproximados.');
  }
  return null;
}

/* --- pantalla de inicio --- */
function renderInicio(){
  const el=$('#inicio'); if (!Object.keys(S.prod).length){ el.innerHTML=noData(); return }
  const t=totals(); const tot=t.activos||1; const nd=Object.values(S.debts).filter(d=>loanAt(d).bal>0);
  const cuota=nd.reduce((s,d)=>s+loanAt(d).cuota,0);
  const [ints,dec]=eur(t.neto,2).replace(/\s?€/,'').split(',');
  const y=String(new Date().getFullYear()); let yExt=0; for (const p of Object.values(S.prod)) if (isInv(p)) for (const m of p.movs||[]) if (m.f.startsWith(y)) yExt+=invFlow(m);
  const ser=series(); const an=ser?annual(ser):[]; const cur=an.find(a=>a.y===y);
  const L=liquidation(); const alerts=[...(S.cfg.avisos||[])];
  for (const p of Object.values(S.prod)){ const s=stats(p); if (s.stale!=null && s.stale>60 && s.v>500) alerts.push(`${p.nombre}: sin actualizar desde hace ${Math.round(s.stale)} días`) }
  const ipc=String(S.cfg.ipc).replace('.',',')+' %';
  el.innerHTML=`
  <div class="hero">
    <div class="hero-l"${xi('neto',{neto:t.neto,activos:t.activos,deuda:t.deuda})}>Patrimonio neto</div>
    <div class="hero-n num"${xi('neto',{neto:t.neto,activos:t.activos,deuda:t.deuda})}>${ints}<span>,${dec} €</span></div>
    <div class="hero-pills">
      <span class="pill"${xi('gan_total',{gan:t.gan,tv:t.tv,ext:t.ext})}>${signed(t.gan)} rentabilidad</span>
      <span class="pill"${xi('xirr_total',{x:t.x})}>${pct(t.x)} al año</span>
    </div>
    <div class="hero-bar">${CATS.map(c=>`<i style="width:${t.by[c]/tot*100}%;background:var(${CATCOL[c]})"${xi('cat',{cat:c,v:t.by[c],share:t.by[c]/tot})}></i>`).join('')}</div>
  </div>
  <div class="actions">
    <button class="act" data-go="anadir" data-mode="valores"><span>${ICON.refresh}</span>Valores</button>
    <button class="act" data-saldos><span>${ICON.down}</span>Saldos</button>
    <button class="act" data-go="anadir" data-mode="nueva"><span>${ICON.plus}</span>Nueva</button>
    <button class="act" data-cash><span><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg></span>Efectivo</button>
  </div>
  <div class="card"><div class="card-h">Tus inversiones</div>
    <div class="big num"${xi('inv_val',{tv:t.tv,ext:t.ext,gan:t.gan})}>${eur(t.tv)}</div>
    <div class="tiles three">
      <div class="tile"${xi('ext_total',{ext:t.ext})}><span>Invertido</span><b class="num">${eur(t.ext)}</b></div>
      <div class="tile"${xi('gan_total',{gan:t.gan,tv:t.tv,ext:t.ext})}><span>Rentabilidad</span><b class="num ${t.gan>=0?'pos':'neg'}">${signed(t.gan)}</b></div>
      <div class="tile"${xi('xirr_total',{x:t.x})}><span>Al año</span><b class="num">${pct(t.x)}</b></div>
    </div></div>
  <div class="card"><div class="tiles">
    <div class="tile"${xi('activos',{v:t.activos,inv:t.tv,cash:t.cash})}><span>Activos sin deudas</span><b class="num">${eur(t.activos)}</b></div>
    <div class="tile"${xi('deuda',{deuda:t.deuda,n:nd.length,cuota})}><span>Deuda</span><b class="num neg">${eur(t.deuda)}</b></div>
    <div class="tile"${xi('cash_total',{tot:t.cash,ef:t.by['Efectivo'],ei:t.by['Efectivo invertido'],n:cashProds().length})}><span>Efectivo</span><b class="num">${eur(t.cash)}</b></div>
    <div class="tile"${xi('ipc_now',{})}><span>Inflación hoy</span><b class="num">${ipc}</b></div>
  </div><button class="linkbtn" data-cash>Ver tus cuentas de efectivo ${ICON.chev}</button></div>
  <div class="card"><div class="card-h">Si vendieras todo hoy</div><div class="tiles three">
    <div class="tile"${xi('tax_total',L)}><span>Ganancia</span><b class="num ${L.G>=0?'pos':'neg'}">${signed(L.G)}</b></div>
    <div class="tile"${xi('tax_total',L)}><span>A Hacienda</span><b class="num neg">${eur(L.tax)}</b></div>
    <div class="tile"${xi('tax_left',L)}><span>Te quedaría</span><b class="num">${eur(L.V-L.tax)}</b></div></div>
    <details class="kw"><summary>Ver por producto <small>${L.rows.length}</small></summary>${L.rows.map(r=>`<div class="hbar"${xi('tax_prod',{n:r.p.nombre,v:r.v,base:r.base,g:r.g,alone:r.taxAlone,share:r.taxShare})}><span class="hb-l">${esc(r.p.nombre)}</span><span class="hb-v num ${r.g>=0?'pos':'neg'}">${signed(r.g)}</span><span class="hb-v num">${eur(r.taxShare)}</span></div>`).join('')}</details></div>
  <div class="card"><div class="card-h">Dónde está tu dinero</div>
    ${CATS.map(c=>`<div class="row"${xi('cat',{cat:c,v:t.by[c],share:t.by[c]/tot})}><span class="dot" style="background:var(${CATCOL[c]})"></span><span class="row-m"><b>${c}</b><small>${pctTxt(t.by[c]/tot)} del total</small></span><span class="row-r num">${eur(t.by[c])}</span></div>`).join('')}
  </div>
  ${inicioCharts()}
  ${bankAccordion(t)}
  <div class="card"><div class="card-h">Este año</div>
    <div class="row"${xi('year_new',{v:yExt,y})}><span class="row-m"><b>Invertido</b></span><span class="row-r num">${eur(yExt)}</span></div>
    <div class="row"${xi('gan_y',Object.assign({},cur||{},{y}))}><span class="row-m"><b>Rentabilidad (aprox.)</b></span><span class="row-r num ${(cur?.gan||0)>=0?'pos':'neg'}">${signed(cur?.gan)}</span></div>
    <div class="row"${xi('r_y',{y,r:cur?.r,parcial:true,inf:ipc})}><span class="row-m"><b>Rentabilidad % (aprox.)</b></span><span class="row-r num">${pct(cur?.r)}</span></div>
    <div class="row"${xi('y_sp',{y,sp:cur?.sp,r:cur?.r,parcial:true})}><span class="row-m"><b>S&P 500 este año</b></span><span class="row-r num">${pct(cur?.sp)}</span></div>
  </div>
  ${alerts.length?`<div class="card"><div class="card-h">Avisos</div>${alerts.map(a=>`<div class="row alert"${xi('aviso',{t:a})}><span class="dot" style="background:var(--warn)"></span><span class="row-m"><b class="wrap">${esc(a)}</b></span></div>`).join('')}</div>`:''}`;
  if (TAB==='inicio') setTimeout(()=>drawDonuts(el),0);
}

/* --- histórico --- */
function renderHist(){
  const el=$('#historico'); const ser=series(); if (!ser){ el.innerHTML=noData(); return }
  const an=annual(ser).slice().reverse(); const INF={2021:'3,1 %',2022:'8,4 %',2023:'3,5 %',2024:'2,8 %',2025:'2,7 %'};
  el.innerHTML=`<div class="card"><div class="card-h" ${xi('chart',{})}>Evolución <span class="ib">${ICON.info}</span></div><div class="chartbox"><canvas id="hchart" aria-label="Evolución del patrimonio"></canvas></div>
    <div class="legend"><span><i style="background:var(--inv)"></i>Inversiones</span><span><i style="background:var(--ei)"></i>Efectivo</span><span><i class="dash"></i>Invertido</span></div></div>
  ${an.map(a=>{const inf=INF[a.y]||String(S.cfg.ipc).replace('.',',')+' %';const c=Object.assign({},a,{inf});return `<div class="card"><div class="card-h">${a.y}${a.parcial?' <small>hasta hoy</small>':''}</div><div class="tiles three">
    <div class="tile"${xi('v0_y',{y:a.y,v:a.V0})}><span>Empezó</span><b class="num">${eur(a.V0)}</b></div>
    <div class="tile"${xi('ext_y',{y:a.y,v:a.ext})}><span>Invertido</span><b class="num">${eur(a.ext)}</b></div>
    <div class="tile"${xi('v1_y',{y:a.y,v:a.V,parcial:a.parcial})}><span>${a.parcial?'Hoy':'Acabó'}</span><b class="num">${eur(a.V)}</b></div>
    <div class="tile"${xi('gan_y',c)}><span>Rentabilidad</span><b class="num ${a.gan>=0?'pos':'neg'}">${signed(a.gan)}</b></div>
    <div class="tile"${xi('r_y',c)}><span>Rentab. %</span><b class="num ${a.r>=0?'pos':'neg'}">${pct(a.r)}</b></div>
    <div class="tile"${xi('y_sp',{y:a.y,sp:a.sp,r:a.r,parcial:a.parcial})}><span>S&P 500</span><b class="num">${pct(a.sp)}</b></div>
    <div class="tile"${xi('y_risk',{y:a.y,r:a.riesgo})}><span>Riesgo</span><b class="num">${a.riesgo==null?'—':a.riesgo.toFixed(1).replace('.',',')+' / 7'}</b></div>
    <div class="tile"${xi('inf',{v:inf,src:'IPC medio anual, INE'})}><span>Inflación</span><b class="num">${inf}</b></div>
    <div class="tile"${xi('cash_total',{tot:a.cashEnd,ef:0,ei:a.cashEnd,n:cashProds().length})}><span>Efectivo</span><b class="num">${eur(a.cashEnd)}</b></div></div></div>`}).join('')}`;
  if (!window.Chart || TAB!=='historico') return;
  if (chart) chart.destroy();
  const mut=css('--muted'), line=css('--line');
  chart=new Chart($('#hchart'),{type:'line',data:{labels:ser.map(r=>r.f),datasets:[
    {label:'Inversiones',data:ser.map(r=>r['Inversión']),borderColor:css('--inv'),backgroundColor:css('--inv')+'40',fill:'origin',pointRadius:0,tension:.3,stack:'a',borderWidth:2},
    {label:'Efectivo',data:ser.map(r=>r['Efectivo invertido']),borderColor:css('--ei'),backgroundColor:css('--ei')+'40',fill:'-1',pointRadius:0,tension:.3,stack:'a',borderWidth:2},
    {label:'Invertido',data:ser.map(r=>r.ext),borderColor:css('--ink'),borderDash:[5,4],fill:false,pointRadius:0,stack:'b',borderWidth:1.5}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      scales:{x:{ticks:{color:mut,maxTicksLimit:5,maxRotation:0,callback(v){return D(this.getLabelForValue(v)).toLocaleDateString('es-ES',{month:'short',year:'2-digit'})}},grid:{display:false},border:{display:false}},
        y:{stacked:true,position:'right',ticks:{color:mut,maxTicksLimit:5,callback:v=>new Intl.NumberFormat('es-ES',{notation:'compact'}).format(v)+' €'},grid:{color:line},border:{display:false}}},
      plugins:{legend:{display:false},tooltip:{callbacks:{title:i=>fdate(i[0].label),label:c=>`${c.dataset.label}: ${eur(c.parsed.y)}`}}}}});
}

/* --- ficha de producto (inversión o cuenta) --- */
function openProduct(id){
  const p=S.prod[id]; if(!p) return; const s=stats(p); const dlg=$('#dlg'); const closed=p.estado==='cerrado'; const cash=isCash(p);
  const movs=(p.movs||[]).map((m,i)=>({m,i})).reverse(); const vals=(p.vals||[]).map((v,i)=>({v,i})).reverse();
  const ipc=S.cfg.ipc; const tae=+p.tae||0; const real=(tae-ipc)/100; const L=cash?null:liquidation().rows.find(r=>r.p.id===p.id);
  dlg.innerHTML=`<div class="pd-top"><button class="iconbtn" data-close aria-label="Cerrar">${ICON.back}</button><span></span></div>
  <div class="pd">
    <div class="pd-h">${avatar(p.entidad,true)}<div><div class="pd-n">${esc(p.nombre)}</div><div class="pd-s">${esc(p.entidad)} · ${esc(p.tipo)}${p.isin?' · '+esc(p.isin):''}</div></div></div>
    ${closed?`<div class="pd-v num"${xi('p_gan',{gan:s.gan,v:0,sal:s.sal,ent:s.ent})}>${signed(s.gan,2)}</div><div class="pd-g">Resultado final · cerrado el <span${xi('c_fin',{f:p.cierre})}>${fdate(p.cierre)}</span></div>`
    :`<div class="pd-v num"${xi('p_valor',{v:s.v,f:s.lv?.f,stale:s.stale})}>${eur(s.v,2)}</div>${!cash&&s.gan!=null?`<div class="pd-g"><span class="num ${s.gan>=0?'pos':'neg'}"${xi('p_gan',{gan:s.gan,v:s.v,sal:s.sal,ent:s.ent})}>${signed(s.gan,2)}</span> · <span class="num"${xi('p_pct',{pct:s.pct,gan:s.gan,ent:s.ent})}>${pct(s.pct)}</span></div>`:`<div class="pd-g">${cash?(s.lv?'Saldo a '+fdate(s.lv.f):'Sin saldo todavía'):''}</div>`}`}
    ${actionBar(p)}
    ${(p.vals||[]).length>1?`<div class="card"><div class="chartbox sm"><canvas id="pchart" aria-label="Evolución"></canvas></div></div>`:''}
    <div class="card"><div class="tiles">
      ${cash?`<div class="tile"${xi('tae',{tae,v:s.v})}><span>Interés anual</span><b class="num">${String(tae).replace('.',',')} %</b></div>
        <div class="tile"${xi('ipc_now',{})}><span>Inflación hoy</span><b class="num">${String(ipc).replace('.',',')} %</b></div>
        <div class="tile"${xi('real_acc',{tae,r:real,v:s.v*real,bal:s.v})}><span>Rentab. real</span><b class="num ${real>=0?'pos':'neg'}">${pct(real)}</b></div>
        <div class="tile"${xi('real_acc',{tae,r:real,v:s.v*real,bal:s.v})}><span>Poder de compra/año</span><b class="num ${real>=0?'pos':'neg'}">${signed(s.v*real)}</b></div>`
      :closed?`<div class="tile"${xi('c_ent',{v:s.ent})}><span>Aportado</span><b class="num">${eur(s.ent)}</b></div><div class="tile"${xi('c_rec',{v:s.sal})}><span>Recuperado</span><b class="num">${eur(s.sal)}</b></div><div class="tile"${xi('p_xirr',{x:s.xirr})}><span>Rentabilidad anual</span><b class="num">${pct(s.xirr)}</b></div>`
      :`<div class="tile"${xi('p_neto',{neto:s.neto,ent:s.ent,sal:s.sal})}><span>Invertido</span><b class="num">${eur(s.neto)}</b></div><div class="tile"${xi('p_coste',{c:s.coste,pctc:p.costePct,v:s.v})}><span>Coste al año</span><b class="num">${s.coste==null?'—':eur(s.coste)}</b></div>
        <div class="tile"${xi('p_xirr',{x:s.xirr})}><span>Rentabilidad anual</span><b class="num">${pct(s.xirr)}</b></div>
        <div class="tile"${xi('tax_prod',{n:p.nombre,v:s.v,base:s.neto,g:L?.g??0,alone:L?.taxAlone??0,share:L?.taxShare??0})}><span>Hacienda si vendes</span><b class="num neg">${eur(L?.taxAlone??0)}</b></div>
        <div class="tile"${xi('p_tras',{t:p.traspasable})}><span>Fiscalidad</span><b>${p.traspasable?'Traspasable':'Tributa al vender'}</b></div>`}
      <div class="tile"${xi('p_upd',{f:s.lv?.f,stale:s.stale})}><span>Actualizado</span><b class="num ${s.stale>60?'neg':''}">${sdate(s.lv?.f)}</b></div>
    </div></div>
    ${clavesCard(p)}
    ${!cash?(()=>{ const pr=profile(p); const v=s.v||0; const rows=(mix,dim)=>{ if(!mix) return ''; const sm=Object.values(mix).reduce((a,b)=>a+b,0)||100; return hbars(dim,Object.entries(mix).map(([k2,w])=>({k:k2,v:v*w/sm,share:w/sm,who:[[p.nombre,v*w/sm]]})).sort((a,b)=>b.v-a.v)) };
      return `<div class="card"><div class="card-h">Perfil del producto</div><div class="tiles three">
        <div class="tile"${xi('p_riesgo',{r:pr.riesgo,propio:pr.propio})}><span>Riesgo</span><b class="num">${pr.riesgo?pr.riesgo+' / 7':'—'}</b></div>
        <div class="tile"${xi('p_gest',{g:pr.gestion})}><span>Gestión</span><b>${esc(pr.gestion)}</b></div>
        <div class="tile"${xi('p_liq',{l:pr.liquidez})}><span>Liquidez</span><b>${esc((pr.liquidez||'—').split(' ')[0])}</b></div></div>
        ${pr.reg?`<div class="sublab">Regiones</div>${rows(pr.reg,'reg')}`:''}${pr.sec?`<div class="sublab">Sectores</div>${rows(pr.sec,'sec')}`:''}${pr.div?`<div class="sublab">Monedas</div>${rows(pr.div,'div')}`:''}
        ${!pr.reg&&!pr.sec?'<p class="hint">Sin desglose de regiones ni sectores. Puedes añadirlo en "Editar".</p>':''}</div>` })():''}
    ${p.nota?`<div class="note">${ICON.info}<span>${esc(p.nota)}</span></div>`:''}
    <details class="card edit"><summary>Movimientos <small>${movs.length}</small></summary>${movs.map(({m,i})=>`<div class="row"${xi('mov',m)}><span class="row-m"><b class="wrap">${esc(m.mov||'Movimiento')}</b><small>${sdate(m.f)}${m.aprox?' ≈':''} · ${esc(m.cls||'')}${m.fia&&m.fia!=='Dato'?' · '+esc(m.fia):''}</small></span><span class="row-r num ${m.tipo==='salida'?'neg':''}">${m.tipo==='salida'?'−':'+'}${eur(m.imp,2)}</span><button class="del" data-dm="${i}" aria-label="Borrar movimiento">×</button></div>`).join('')||'<div class="empty">Sin movimientos.</div>'}</details>
    <details class="card edit"><summary>${cash?'Saldos':'Valoraciones'} <small>${vals.length}</small></summary>${vals.map(({v,i})=>`<div class="row"${xi('val',v)}><span class="row-m"><b>${fdate(v.f)}</b><small>${esc(v.fu||'')}${v.fia&&v.fia!=='Dato'?' · '+esc(v.fia):''}</small></span><span class="row-r num">${eur(v.v,2)}</span><button class="del" data-dv="${i}" aria-label="Borrar">×</button></div>`).join('')||'<div class="empty">Sin datos.</div>'}</details>
    <details class="card edit"><summary>Historial de cambios <small>${(S.log||[]).filter(l=>l.objeto_id===p.id).length}</small></summary>${logRows((S.log||[]).filter(l=>l.objeto_id===p.id).slice(-20))}</details>
    <details class="card edit"><summary>Editar este producto</summary>
      <form id="fedit">
      ${cash?`<label class="fl">Interés anual / TAE (%)<input type="number" inputmode="decimal" step="0.01" name="tae" value="${p.tae??''}"></label>`:`<label class="fl">Coste anual (%)<input type="number" inputmode="decimal" step="0.01" name="coste" value="${p.costePct??''}"></label>`}
      <label class="fl">Estado<select name="estado"><option value="activo" ${!closed?'selected':''}>Activo</option><option value="cerrado" ${closed?'selected':''}>Cerrado</option></select></label>
      ${cash?'':`<label class="fl">Aportación periódica (€)<input type="number" inputmode="decimal" step="0.01" name="pimp" value="${p.periodica?.importe??''}"></label>
      <label class="fl">Frecuencia<select name="pfreq">${['mensual','semanal','diaria'].map(x=>`<option ${p.periodica?.frecuencia===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <label class="fl">Riesgo (1 a 7, del folleto)<select name="riesgo"><option value="">Sin dato</option>${[1,2,3,4,5,6,7].map(n=>`<option ${+p.riesgo===n?'selected':''}>${n}</option>`).join('')}</select></label>
      <label class="fl">Clase<select name="clase"><option value="">Automática</option>${['Renta variable','Liquidez','Cripto','Metales'].map(x=>`<option ${p.clase===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <label class="fl">Gestión<select name="gestion"><option value="">Sin dato</option>${['Activa','Indexada','Sin gestión'].map(x=>`<option ${p.gestion===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <label class="fl">Liquidez<select name="liquidez"><option value="">Automática</option>${['Inmediata','Unos días','Bloqueado o con penalización'].map(x=>`<option ${p.liquidez===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <label class="fl">Regiones (ej.: EE. UU.:60;Europa:25;Emergentes:15)<input name="regiones" value="${esc(p.regiones||'')}"></label>
      <label class="fl">Sectores (ej.: Tecnología:40;Salud:20)<input name="sectores" value="${esc(p.sectores||'')}"></label>
      <label class="fl">Monedas (ej.: USD:70;EUR:30)<input name="divisas" value="${esc(p.divisas||'')}"></label>`}
      <label class="fl">Lo que debes vigilar (un punto por línea)<textarea name="claves" rows="5">${esc(p.claves||'')}</textarea></label>
      <button class="btn wide">Guardar cambios</button></form>
      <button class="btn wide danger" id="delp">Borrar este producto</button>
    </details>
  </div>`;
  openSheet(dlg); dlg.scrollTop=0;
  if ((p.vals||[]).length>1) setTimeout(()=>lineChart('pchart',p.vals.map(v=>({f:v.f,v:v.v})),cash?css('--ei'):css('--inv'),cash),0);
  renderDocs(p);
  $('#fedit',dlg).onsubmit=async e=>{e.preventDefault(); const f=new FormData(e.target); const est=f.get('estado'); if(est==='cerrado'&&p.estado!=='cerrado'){p.cierre=today()} p.estado=est;
    if (cash){ p.tae=f.get('tae')===''?null:+f.get('tae') } else {
      p.costePct=f.get('coste')===''?null:+f.get('coste');
      p.periodica = f.get('pimp')? {importe:+f.get('pimp'),frecuencia:f.get('pfreq'),hasta:p.periodica?.hasta||today()} : null;
      p.riesgo=f.get('riesgo')?+f.get('riesgo'):null; ['clase','gestion','liquidez','regiones','sectores','divisas'].forEach(k=>p[k]=String(f.get(k)||'').trim()) }
    p.claves=String(f.get('claves')||'').trim();
    logChange('Editar datos del producto',cash?'efectivo':'producto',p.id,p.nombre,cash?`Interés ${p.tae??'—'} % · estado ${p.estado}`:`Coste ${p.costePct??'—'} % · estado ${p.estado} · riesgo ${p.riesgo??'—'}`); await persist('p',p); render(); openProduct(id); toast('Cambios guardados')};
  dlg.querySelectorAll('[data-dm]').forEach(b=>b.onclick=async ev=>{ ev.stopPropagation(); if(!confirm('¿Borrar este movimiento?'))return; const _m=p.movs.splice(+b.dataset.dm,1)[0]; logChange('Borrar movimiento','producto',p.id,p.nombre,_m.mov||'',{f:_m.f,importe:_m.tipo==='salida'?-_m.imp:_m.imp}); await persist('p',p); render(); openProduct(id) });
  dlg.querySelectorAll('[data-dv]').forEach(b=>b.onclick=async ev=>{ ev.stopPropagation(); if(!confirm('¿Borrar este dato?'))return; const _v=p.vals.splice(+b.dataset.dv,1)[0]; logChange(cash?'Borrar saldo':'Borrar valoración','producto',p.id,p.nombre,'',{f:_v.f,antes:_v.v}); await persist('p',p); render(); openProduct(id) });
  $('#delp',dlg).onclick=async()=>{ if(!confirm(`¿Borrar ${p.nombre} y todo su historial?`))return; logChange('Borrar producto','producto',p.id,p.nombre,`Valor ${eur(value(p),2)}`); delete S.prod[id]; await remove('p',id); dlg.close(); render(); toast('Producto borrado') };
}

/* --- Añadir --- */
function renderAct(){
  const el=$('#anadir'); const pend=pendingPeriodic();
  const modes=[['valores',ICON.refresh,'Actualizar valores','Lo que vale hoy cada inversión'],['saldos',ICON.down,'Actualizar saldos','Lo que hay en cada cuenta de efectivo'],['nueva',ICON.plus,'Nueva inversión o cuenta','Has abierto un producto nuevo'],['periodicas',ICON.repeat,'Aportaciones periódicas',pend.length?`${pend.length} pendientes de registrar`:'Al día']];
  if (actMode==='saldos'){ actMode=null; openSaldos() }
  if (!actMode || !['valores','nueva','periodicas'].includes(actMode)){
    el.innerHTML=`<div class="card list">${modes.map(([k,ic,t,s])=>`<button class="row tap opt" data-m="${k}"><span class="av ic">${ic}</span><span class="row-m"><b>${t}</b><small>${s}</small></span><span class="chev">${ICON.chev}</span></button>`).join('')}</div>
      <p class="hint" style="margin:0 6px">Para aportar, retirar, traspasar o cerrar, entra en la inversión desde Inicio o Activos.</p>`;
    el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{ if(b.dataset.m==='saldos'){ openSaldos(); return } actMode=b.dataset.m; renderAct() }); return;
  }
  const title=modes.find(m=>m[0]===actMode)[2]; let body='';
  if (actMode==='valores'){
    const act=Object.values(S.prod).filter(p=>p.estado!=='cerrado'&&isInv(p)).sort((a,b)=>value(b)-value(a));
    body=`<form id="fval"><label class="fl">Fecha de los valores<input type="date" name="fecha" value="${today()}" required></label>
    <div class="vlist">${act.map(p=>{const lv=lastVal(p);return `<label class="vrow">${avatar(p.entidad)}<span class="row-m"><b>${esc(p.nombre)}</b><small>Antes: ${eur(lv?.v,2)} · ${sdate(lv?.f)}</small></span><input type="number" inputmode="decimal" step="0.01" name="v_${esc(p.id)}" placeholder="Nuevo €" aria-label="Nuevo valor de ${esc(p.nombre)}"></label>`}).join('')}</div>
    <p class="hint">Deja en blanco los que no hayan cambiado.</p><button class="btn wide">Guardar valores</button></form>`;
  } else if (actMode==='nueva'){
    const ents=[...new Set(Object.values(S.prod).map(p=>p.entidad))].sort();
    body=`<form id="fnew"><label class="fl">Tipo<select name="tipo">${TIPOS.map(t=>`<option>${t}</option>`).join('')}</select></label>
    <label class="fl">Nombre<input name="nombre" required placeholder="Ej.: Vanguard Global Stock o Cuenta Wise"></label>
    <label class="fl">Banco o bróker<input name="entidad" list="ents" required><datalist id="ents">${ents.map(e=>`<option value="${esc(e)}">`).join('')}</datalist></label>
    <label class="fl">ISIN o ticker (opcional)<input name="isin"></label>
    <label class="fl">Fecha de apertura<input type="date" name="f" value="${today()}" required></label>
    <label class="fl">Importe inicial o saldo (€)<input type="number" inputmode="decimal" step="0.01" name="imp" required></label>
    <label class="fl">Precio de compra (opcional)<input type="number" inputmode="decimal" step="0.000001" name="precio"></label>
    <label class="fl">Si es una inversión: ¿de qué cuenta sale el dinero?<select name="orig"><option value="">Es una cuenta de efectivo</option>${cashProds().map(o=>`<option value="${esc(o.id)}">${esc(o.entidad)} — ${esc(o.nombre)}</option>`).join('')}</select></label>
    <label class="fl">Coste anual % o interés % (opcional)<input type="number" inputmode="decimal" step="0.01" name="coste"></label>
    <label class="fl">Aportación periódica € (opcional)<input type="number" inputmode="decimal" step="0.01" name="pimp"></label>
    <label class="fl">Frecuencia<select name="pfreq"><option value="mensual">Mensual</option><option value="semanal">Semanal</option><option value="diaria">Diaria</option></select></label>
    <button class="btn wide">Crear</button></form>`;
  } else {
    const per=Object.values(S.prod).filter(p=>p.periodica&&p.estado!=='cerrado');
    body=`<div class="list">${per.map(p=>{const n=pend.filter(x=>x.pid===p.id);return `<div class="row">${avatar(p.entidad)}<span class="row-m"><b>${esc(p.nombre)}</b><small>${eur(p.periodica.importe,2)} ${esc(p.periodica.frecuencia)} · apuntado hasta ${sdate(p.periodica.hasta)}</small></span><span class="row-r num">${n.length?`${n.length} · ${eur(n.reduce((s,x)=>s+x.imp,0))}`:'Al día'}</span></div>`}).join('')||'<div class="empty">Ningún producto tiene aportación periódica.</div>'}</div>
    <button class="btn wide" id="genper" ${pend.length?'':'disabled'}>Registrar ${pend.length} aportaciones pendientes</button>
    <p class="hint">Las periódicas cuentan como dinero aportado a la inversión. Actualiza después el saldo de la cuenta de la que salen.</p>`;
  }
  el.innerHTML=`<button class="backbtn" id="actback">${ICON.back}Volver</button><h2 class="h2">${title}</h2><div class="card">${body}</div>`;
  $('#actback').onclick=()=>{actMode=null;renderAct()};
  bindForms(); bindNew();
}
function bindNew(){
  const fn=$('#fnew'); if(!fn) return;
  fn.onsubmit=async e=>{ e.preventDefault(); const f=new FormData(fn); const tipo=f.get('tipo'); const imp=+f.get('imp'); const precio=+f.get('precio')||null; const orig=f.get('orig'); const fecha=f.get('f'); const cat=catOf(tipo);
    const p={id:uid(),nombre:f.get('nombre'),entidad:f.get('entidad'),tipo,categoria:cat,traspasable:tipo==='Fondo',estado:'activo',costePct:cat==='Inversión'&&f.get('coste')?+f.get('coste'):null,tae:cat!=='Inversión'&&f.get('coste')?+f.get('coste'):null,isin:f.get('isin')||'',nota:'',apertura:fecha,
      periodica: f.get('pimp')?{importe:+f.get('pimp'),frecuencia:f.get('pfreq'),hasta:fecha}:null,movs:[],vals:[{f:fecha,v:imp,fia:'Dato',fu:cat==='Inversión'?'Importe de apertura':'Saldo inicial'}]};
    if (cat==='Inversión'){ const c=S.prod[orig];
      addMov(p,{f:fecha,tipo:'entrada',imp,ext:imp,cls:'Dinero nuevo',fia:'Dato',mov:c?`Aportado desde ${c.nombre}`:'Apertura',precio,uds:precio?imp/precio:null,nota:''});
      if (c){ addMov(c,{f:fecha,tipo:'salida',imp,ext:0,cls:'Interno',fia:'Dato',mov:`Aportado a ${p.nombre}`,nota:''}); adjustValue(c,fecha,-imp,'Calculado: saldo − aportación') } }
    S.prod[p.id]=p; logChange(cat==='Inversión'?'Nueva inversión':'Nueva cuenta',cat==='Inversión'?'producto':'efectivo',p.id,p.nombre,`${tipo} en ${p.entidad}`,{f:fecha,importe:imp});
    schedule(); actMode=null; render(); toast(cat==='Inversión'?'Inversión creada':'Cuenta creada') };
}

/* --- Excel: lectura y escritura con los campos nuevos --- */
function workbookFromState(){
  const P=[],M=[],V=[],Dd=[];
  for (const p of Object.values(S.prod)){
    P.push({id:p.id,nombre:p.nombre,entidad:p.entidad,tipo:p.tipo,categoria:p.categoria,isin:p.isin||'',estado:p.estado,apertura:p.apertura||'',cierre:p.cierre||'',traspasable:p.traspasable?'sí':'no',coste_pct:p.costePct??'',tae:p.tae??'',periodica_importe:p.periodica?.importe??'',periodica_frecuencia:p.periodica?.frecuencia??'',periodica_hasta:p.periodica?.hasta??'',nota:p.nota||'',riesgo:p.riesgo??'',clase:p.clase||'',gestion:p.gestion||'',liquidez:p.liquidez||'',regiones:p.regiones||'',sectores:p.sectores||'',divisas:p.divisas||'',claves:p.claves||'',claves_pdf:p.claves_pdf||''});
    (p.movs||[]).forEach(m=>M.push({producto_id:p.id,producto:p.nombre,fecha:m.f,tipo:m.tipo,importe:m.imp,externo:m.ext,clasificacion:m.cls||'',fiabilidad:m.fia||'',fecha_aproximada:m.aprox?'sí':'',precio:m.precio??'',unidades:m.uds??'',movimiento:m.mov||'',nota:m.nota||''}));
    (p.vals||[]).forEach(v=>V.push({producto_id:p.id,producto:p.nombre,fecha:v.f,valor:v.v,fiabilidad:v.fia||'',fuente:v.fu||''}));
  }
  Object.values(S.debts).forEach(d=>Dd.push({id:d.id,nombre:d.nombre,entidad:d.entidad,capital:d.capital,tin:d.tin,cuota:d.cuota,primer_pago:d.primerPago,n_cuotas:d.n,nota:d.nota||'',amortizaciones:(d.extras||[]).length?JSON.stringify(d.extras):''}));
  const wb=XLSX.utils.book_new();
  [['Productos',P],['Movimientos',M],['Valoraciones',V],['Deudas',Dd]].forEach(([n,r])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(r),n));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((S.log||[]).length?S.log:[{id:'',ts:'',accion:'',objeto:'',objeto_id:'',nombre:'',detalle:'',fecha_efecto:'',importe:'',antes:'',despues:'',origen:'',usuario:'',dispositivo:''}]),'Bitacora');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{ipc:S.cfg.ipc,ipc_ref:S.cfg.ipcRef||'',avisos:(S.cfg.avisos||[]).join(' | '),perdidas_pendientes:S.cfg.perdidas??'',sp500_ytd:S.cfg.sp500??'',sp500_ref:S.cfg.sp500ref||''}]),'Ajustes');
  return XLSX.write(wb,{type:'array',bookType:'xlsx'});
}
function stateFromWorkbook(buf){
  const wb=XLSX.read(buf,{type:'array'});
  const sh=n=>wb.Sheets[n]?XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:''}):[];
  const P=sh('Productos'), M=sh('Movimientos'), V=sh('Valoraciones'), Dd=sh('Deudas'), A=sh('Ajustes'), LG=sh('Bitacora').filter(r=>r.ts);
  if (!P.length) throw new Error('sin_productos');
  const ds=v=> typeof v==='number' ? new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10) : String(v).slice(0,10);
  const num=v=> v===''||v==null ? null : +String(v).replace(',','.');
  const prod={};
  P.forEach(r=>{ prod[r.id]={id:String(r.id),nombre:r.nombre,entidad:r.entidad,tipo:r.tipo,categoria:r.categoria||catOf(r.tipo),isin:r.isin,estado:r.estado||'activo',apertura:r.apertura?ds(r.apertura):null,cierre:r.cierre?ds(r.cierre):null,traspasable:String(r.traspasable).toLowerCase().startsWith('s'),costePct:num(r.coste_pct),tae:num(r.tae),nota:r.nota,
    periodica: r.periodica_importe!==''&&r.periodica_importe!=null?{importe:num(r.periodica_importe),frecuencia:r.periodica_frecuencia||'mensual',hasta:r.periodica_hasta?ds(r.periodica_hasta):today()}:null,movs:[],vals:[],
    riesgo:num(r.riesgo),clase:r.clase||'',gestion:r.gestion||'',liquidez:r.liquidez||'',regiones:String(r.regiones||''),sectores:String(r.sectores||''),divisas:String(r.divisas||''),claves:String(r.claves||''),claves_pdf:String(r.claves_pdf||'')} });
  M.forEach(r=>{ const p=prod[r.producto_id]; if(!p) return; p.movs.push({f:ds(r.fecha),tipo:r.tipo,imp:num(r.importe)||0,ext:num(r.externo)||0,cls:r.clasificacion,fia:r.fiabilidad,aprox:String(r.fecha_aproximada).startsWith('s')||undefined,precio:num(r.precio),uds:num(r.unidades),mov:r.movimiento,nota:r.nota}) });
  V.forEach(r=>{ const p=prod[r.producto_id]; if(!p) return; p.vals.push({f:ds(r.fecha),v:num(r.valor)||0,fia:r.fiabilidad,fu:r.fuente}) });
  Object.values(prod).forEach(p=>{p.movs.sort((a,b)=>a.f<b.f?-1:1);p.vals.sort((a,b)=>a.f<b.f?-1:1)});
  const debts={}; Dd.forEach(r=>{ debts[r.id]={id:String(r.id),nombre:r.nombre,entidad:r.entidad,capital:num(r.capital),tin:num(r.tin),cuota:num(r.cuota),primerPago:ds(r.primer_pago),n:num(r.n_cuotas),nota:r.nota,extras:(()=>{ try{ return r.amortizaciones?JSON.parse(r.amortizaciones):[] }catch(e){ return [] } })()} });
  const cfg=Object.assign({}, S.cfg); const a=A[0]; if (a){ if(a.ipc!=='') cfg.ipc=num(a.ipc); if(a.ipc_ref) cfg.ipcRef=String(a.ipc_ref); cfg.avisos=String(a.avisos||'').split('|').map(s=>s.trim()).filter(Boolean); if(a.perdidas_pendientes!==''&&a.perdidas_pendientes!=null) cfg.perdidas=num(a.perdidas_pendientes); if(a.sp500_ytd!==''&&a.sp500_ytd!=null) cfg.sp500=num(a.sp500_ytd); if(a.sp500_ref) cfg.sp500ref=String(a.sp500_ref) }
  return {prod,debts,cfg,log:LG};
}

/* ---------- arranque ---------- */
document.getElementById('loginbtn').onclick=()=>login();
const _cl=document.getElementById('clearlog'); if(_cl) _cl.onclick=()=>{ try{localStorage.removeItem('pat_log');localStorage.removeItem('pat_loop')}catch(e){} document.getElementById('gatelog').textContent='' };
$('#status').onclick=()=>go('mas');
render(); load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
