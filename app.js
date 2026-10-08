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
  const r=d.tin/1200, n=d.n; const first=D(d.primerPago), at=D(date||today());
  let k=(at.getFullYear()-first.getFullYear())*12+(at.getMonth()-first.getMonth())+(at.getDate()>=first.getDate()?1:0);
  k=Math.max(0,Math.min(n,k));
  const g=Math.pow(1+r,k);
  let bal = r? d.capital*g - d.cuota*(g-1)/r : d.capital - d.cuota*k;
  if (k>=n) bal=0; bal=Math.max(0,bal);
  const end=new Date(first); end.setMonth(end.getMonth()+n-1);
  return {k, bal, restantes:n-k, intereses: Math.max(0,d.cuota*(n-k)-bal), fin:end.toISOString().slice(0,10), pctAmort: 1-bal/d.capital};
}
function totals(){
  const by={'Inversión':0,'Efectivo invertido':0,'Efectivo':0}, ent={};
  let ext=0; const ecf=[]; let tv=0;
  for (const p of Object.values(S.prod)){
    const v=value(p); by[p.categoria]=(by[p.categoria]||0)+v;
    if (v) ent[p.entidad]=(ent[p.entidad]||0)+v;
    for (const m of p.movs||[]) if (m.ext){ ext+=m.ext; ecf.push({f:m.f,v:-m.ext}) }
    if ((p.movs||[]).length) tv+=v;
  }
  const deuda=Object.values(S.debts).reduce((s,d)=>s+loanAt(d).bal,0);
  const activos=by['Inversión']+by['Efectivo invertido']+by['Efectivo'];
  const x=xirr(ecf.concat([{f:today(),v:tv}]));
  return {by, ent, activos, deuda, neto:activos-deuda, ext, gan: tv-ext, x, tv};
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
function series(){
  const starts=Object.values(S.prod).map(p=>p.apertura).filter(Boolean).sort();
  if (!starts.length) return null;
  const s=D(starts[0]); const out=[]; const now=today();
  let d=new Date(s.getFullYear(), s.getMonth()+1, 0);
  while (true){
    const iso=d.toISOString().slice(0,10) > now ? now : d.toISOString().slice(0,10);
    const row={f:iso, 'Inversión':0,'Efectivo invertido':0, ext:0};
    for (const p of Object.values(S.prod)){
      if (p.categoria==='Efectivo' && !(p.movs||[]).length) continue;
      const k = p.categoria==='Efectivo' ? 'Efectivo invertido' : p.categoria;
      row[k]+=valueAt(p, iso);
      for (const m of p.movs||[]) if (m.ext && m.f<=iso) row.ext+=m.ext;
    }
    out.push(row);
    if (iso===now) break;
    d=new Date(d.getFullYear(), d.getMonth()+2, 0);
  }
  return out;
}
function annual(ser){
  const ys=[...new Set(ser.map(r=>r.f.slice(0,4)))];
  const res=[]; let prevV=0, prevExt=0;
  for (const y of ys){
    const rows=ser.filter(r=>r.f.startsWith(y)); const last=rows[rows.length-1];
    const V=last['Inversión']+last['Efectivo invertido'];
    const flows=[]; for (const p of Object.values(S.prod)) for (const m of p.movs||[]) if (m.ext && m.f.startsWith(y)) flows.push(m);
    const ext=flows.reduce((s,m)=>s+m.ext,0);
    const end=last.f, start=`${y}-01-01`; const T=Math.max(1,days(start,end));
    const W=flows.reduce((s,m)=>s+m.ext*Math.max(0,days(m.f,end))/T,0);
    const gan=V-prevV-ext; const base=prevV+W;
    res.push({y, V0:prevV, ext, V, gan, r: base>100? gan/base : null, parcial: end!==`${y}-12-31`});
    prevV=V; prevExt+=ext;
  }
  return res;
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
function workbookFromState(){
  const P=[],M=[],V=[],Dd=[];
  for (const p of Object.values(S.prod)){
    P.push({id:p.id,nombre:p.nombre,entidad:p.entidad,tipo:p.tipo,categoria:p.categoria,isin:p.isin||'',estado:p.estado,apertura:p.apertura||'',cierre:p.cierre||'',traspasable:p.traspasable?'sí':'no',coste_pct:p.costePct??'',periodica_importe:p.periodica?.importe??'',periodica_frecuencia:p.periodica?.frecuencia??'',periodica_hasta:p.periodica?.hasta??'',nota:p.nota||''});
    (p.movs||[]).forEach(m=>M.push({producto_id:p.id,producto:p.nombre,fecha:m.f,tipo:m.tipo,importe:m.imp,externo:m.ext,clasificacion:m.cls||'',fiabilidad:m.fia||'',fecha_aproximada:m.aprox?'sí':'',precio:m.precio??'',unidades:m.uds??'',movimiento:m.mov||'',nota:m.nota||''}));
    (p.vals||[]).forEach(v=>V.push({producto_id:p.id,producto:p.nombre,fecha:v.f,valor:v.v,fiabilidad:v.fia||'',fuente:v.fu||''}));
  }
  Object.values(S.debts).forEach(d=>Dd.push({id:d.id,nombre:d.nombre,entidad:d.entidad,capital:d.capital,tin:d.tin,cuota:d.cuota,primer_pago:d.primerPago,n_cuotas:d.n,nota:d.nota||''}));
  const wb=XLSX.utils.book_new();
  [['Productos',P],['Movimientos',M],['Valoraciones',V],['Deudas',Dd]].forEach(([n,r])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(r),n));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{ipc:S.cfg.ipc,avisos:(S.cfg.avisos||[]).join(' | ')}]),'Ajustes');
  return XLSX.write(wb,{type:'array',bookType:'xlsx'});
}
function stateFromWorkbook(buf){
  const wb=XLSX.read(buf,{type:'array'});
  const sh=n=>wb.Sheets[n]?XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:''}):[];
  const P=sh('Productos'), M=sh('Movimientos'), V=sh('Valoraciones'), Dd=sh('Deudas'), A=sh('Ajustes');
  if (!P.length) throw new Error('sin_productos');
  const ds=v=> typeof v==='number' ? new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10) : String(v).slice(0,10);
  const num=v=> v===''||v==null ? null : +String(v).replace(',','.');
  const prod={};
  P.forEach(r=>{ prod[r.id]={id:String(r.id),nombre:r.nombre,entidad:r.entidad,tipo:r.tipo,categoria:r.categoria||catOf(r.tipo),isin:r.isin,estado:r.estado||'activo',apertura:r.apertura?ds(r.apertura):null,cierre:r.cierre?ds(r.cierre):null,traspasable:String(r.traspasable).toLowerCase().startsWith('s'),costePct:num(r.coste_pct),nota:r.nota,
    periodica: r.periodica_importe!==''?{importe:num(r.periodica_importe),frecuencia:r.periodica_frecuencia||'mensual',hasta:r.periodica_hasta?ds(r.periodica_hasta):today()}:null,movs:[],vals:[]} });
  M.forEach(r=>{ const p=prod[r.producto_id]; if(!p) return; p.movs.push({f:ds(r.fecha),tipo:r.tipo,imp:num(r.importe)||0,ext:num(r.externo)||0,cls:r.clasificacion,fia:r.fiabilidad,aprox:String(r.fecha_aproximada).startsWith('s')||undefined,precio:num(r.precio),uds:num(r.unidades),mov:r.movimiento,nota:r.nota}) });
  V.forEach(r=>{ const p=prod[r.producto_id]; if(!p) return; p.vals.push({f:ds(r.fecha),v:num(r.valor)||0,fia:r.fiabilidad,fu:r.fuente}) });
  Object.values(prod).forEach(p=>{p.movs.sort((a,b)=>a.f<b.f?-1:1);p.vals.sort((a,b)=>a.f<b.f?-1:1)});
  const debts={}; Dd.forEach(r=>{ debts[r.id]={id:String(r.id),nombre:r.nombre,entidad:r.entidad,capital:num(r.capital),tin:num(r.tin),cuota:num(r.cuota),primerPago:ds(r.primer_pago),n:num(r.n_cuotas),nota:r.nota} });
  const cfg=Object.assign({}, S.cfg); if (A[0]){ if(A[0].ipc!=='') cfg.ipc=num(A[0].ipc); cfg.avisos=String(A[0].avisos||'').split('|').map(s=>s.trim()).filter(Boolean) }
  return {prod,debts,cfg};
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
  S.prod=st.prod; S.debts=st.debts; S.cfg=st.cfg; S.mode='db'; dirty=false; lastSync=new Date();
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
    for (const [k,v] of f.entries()){ if(!k.startsWith('v_')||v==='') continue; const p=S.prod[k.slice(2)]; p.vals=(p.vals||[]).filter(x=>x.f!==fecha); p.vals.push({f:fecha,v:+v,fia:'Dato',fu:'Actualización manual'}); p.vals.sort((a,b)=>a.f<b.f?-1:1); await persist('p',p); n++ }
    actMode=null; render(); toast(n?`${n} valores guardados`:'No has cambiado ningún valor') };
  const fm=$('#fmov'); if (fm) fm.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fm); const p=S.prod[f.get('pid')]; const tipo=f.get('tipo'); const imp=+f.get('imp'); const precio=+f.get('precio')||null; const orig=f.get('orig');
    const ext = orig==='ext' ? (tipo==='entrada'?imp:-imp) : 0;
    addMov(p,{f:f.get('f'),tipo,imp,ext,cls:orig==='ext'?(tipo==='entrada'?'Dinero nuevo':'Retirada'):'Interno',fia:'Dato',mov:tipo==='entrada'?'Aportación':'Retirada',precio,uds:precio?imp/precio:null,nota:f.get('nota')||''});
    await persist('p',p);
    if (orig!=='ext' && S.prod[orig] && orig!==p.id){ const o=S.prod[orig]; addMov(o,{f:f.get('f'),tipo:tipo==='entrada'?'salida':'entrada',imp,ext:0,cls:'Interno',fia:'Dato',mov:tipo==='entrada'?`Hacia ${p.nombre}`:`Desde ${p.nombre}`,nota:''}); await persist('p',o) }
    actMode=null; render(); toast('Movimiento guardado') };
  const fn=$('#fnew'); if (fn) fn.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fn); const tipo=f.get('tipo'); const imp=+f.get('imp'); const precio=+f.get('precio')||null; const orig=f.get('orig'); const fecha=f.get('f');
    const p={id:uid(),nombre:f.get('nombre'),entidad:f.get('entidad'),tipo,categoria:catOf(tipo),traspasable:tipo==='Fondo',estado:'activo',costePct:f.get('coste')?+f.get('coste'):null,isin:f.get('isin')||'',nota:'',apertura:fecha,
      periodica: f.get('pimp')?{importe:+f.get('pimp'),frecuencia:f.get('pfreq'),hasta:fecha}:null,movs:[],vals:[{f:fecha,v:imp,fia:'Dato',fu:'Importe de apertura'}]};
    addMov(p,{f:fecha,tipo:'entrada',imp,ext:orig==='ext'?imp:0,cls:orig==='ext'?'Dinero nuevo':'Interno',fia:'Dato',mov:'Apertura',precio,uds:precio?imp/precio:null,nota:''});
    S.prod[p.id]=p; await persist('p',p);
    if (orig!=='ext' && S.prod[orig]){ const o=S.prod[orig]; addMov(o,{f:fecha,tipo:'salida',imp,ext:0,cls:'Interno',fia:'Dato',mov:`Hacia ${p.nombre}`,nota:''}); await persist('p',o) }
    actMode=null; render(); toast('Inversión creada') };
  const fc=$('#fclose'); if (fc) fc.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fc); const p=S.prod[f.get('pid')]; const imp=+f.get('imp'); const dest=f.get('dest'); const fecha=f.get('f');
    addMov(p,{f:fecha,tipo:'salida',imp,ext:dest==='ext'?-imp:0,cls:dest==='ext'?'Retirada':'Interno',fia:'Dato',mov:'Venta',nota:''});
    if (f.get('total')){ p.estado='cerrado'; p.cierre=fecha; p.vals=(p.vals||[]).filter(x=>x.f!==fecha); p.vals.push({f:fecha,v:0,fia:'Dato',fu:'Cierre'}); p.vals.sort((a,b)=>a.f<b.f?-1:1) }
    await persist('p',p);
    if (dest!=='ext' && S.prod[dest]){ const o=S.prod[dest]; addMov(o,{f:fecha,tipo:'entrada',imp,ext:0,cls:'Interno',fia:'Dato',mov:`Desde ${p.nombre}`,nota:''}); await persist('p',o) }
    actMode=null; render(); toast('Venta registrada') };
  const gp=$('#genper'); if (gp) gp.onclick=async()=>{ const pend=pendingPeriodic(); const by={};
    pend.forEach(x=>{ (by[x.pid]=by[x.pid]||[]).push(x) });
    for (const [pid,xs] of Object.entries(by)){ const p=S.prod[pid]; xs.forEach(x=>addMov(p,{f:x.f,tipo:'entrada',imp:x.imp,ext:x.imp,cls:'Dinero nuevo',fia:'Periódica',mov:'Aportación periódica',nota:''})); p.periodica.hasta=xs[xs.length-1].f; await persist('p',p) }
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
const TITLES={inicio:'Inicio',activos:'Activos',anadir:'Añadir',historico:'Histórico',mas:'Más'};
function go(t){ TAB=t; document.querySelectorAll('.tb').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  document.querySelectorAll('main section').forEach(s=>s.hidden=s.id!==t); $('#ttl').textContent=TITLES[t];
  if (t==='anadir') renderAct(); if (t==='historico') renderHist(); $('main').scrollTop=0 }
document.querySelectorAll('.tb').forEach(b=>b.onclick=()=>{ if(b.dataset.tab==='anadir') actMode=null; go(b.dataset.tab) });

/* ---------- render ---------- */
function render(){

  const lu=lastUpdate(); $('#asof').textContent = lu ? 'Datos a '+fdate(lu) : 'Sin datos';
  renderInicio(); renderActivos(); renderHist(); renderAct(); renderMas();
}
function noData(){
  if (S.mode==='nuevo') return `<div class="card empty"><b>Tu OneDrive todavía no tiene el Excel de la app.</b><p>Ve a <b>Más › Importar un Excel</b> y elige <b>patrimonio_datos_iniciales.xlsx</b>. Se guardará en OneDrive y desde entonces será tu archivo de trabajo.</p><button class="btn" data-go="mas">Ir a Más</button></div>`;
  if (S.mode==='cargando') return `<div class="card empty">Cargando tus datos…</div>`;
  return `<div class="card empty"><b>Todavía no hay datos.</b><p>Importa tu Excel en Más o añade tu primera inversión.</p></div>`;
}
function signed(n,d=0){ return n==null?'—':(n>0?'+':'')+eur(n,d) }
function renderInicio(){
  const el=$('#inicio'); if (!Object.keys(S.prod).length){ el.innerHTML=noData(); return }
  const t=totals(); const tot=t.activos||1; const nd=Object.values(S.debts).filter(d=>loanAt(d).bal>0);
  const cuota=nd.reduce((s,d)=>s+d.cuota,0);
  const [ints,dec]=eur(t.neto,2).replace(/\s?€/,'').split(',');
  const y=String(new Date().getFullYear()); let yExt=0; for (const p of Object.values(S.prod)) for (const m of p.movs||[]) if (m.ext && m.f.startsWith(y)) yExt+=m.ext;
  const ser=series(); const an=ser?annual(ser):[]; const cur=an.find(a=>a.y===y);
  const ents=Object.entries(t.ent).sort((a,b)=>b[1]-a[1]);
  const alerts=[...(S.cfg.avisos||[])];
  for (const p of Object.values(S.prod)){ const s=stats(p); if (s.stale!=null && s.stale>60 && s.v>500) alerts.push(`${p.nombre}: sin actualizar desde hace ${Math.round(s.stale)} días`) }
  el.innerHTML=`
  <div class="hero">
    <div class="hero-l"${xi('neto',{neto:t.neto,activos:t.activos,deuda:t.deuda})}>Patrimonio neto · EUR</div>
    <div class="hero-n num"${xi('neto',{neto:t.neto,activos:t.activos,deuda:t.deuda})}>${ints}<span>,${dec} €</span></div>
    <div class="hero-pills">
      <span class="pill"${xi('gan_total',{gan:t.gan,tv:t.tv,ext:t.ext})}>${signed(t.gan)} ganados</span>
      <span class="pill"${xi('xirr_total',{x:t.x})}>${pct(t.x)} al año</span>
    </div>
    <div class="hero-bar">${CATS.map(c=>`<i style="width:${t.by[c]/tot*100}%;background:var(${CATCOL[c]}-on)"${xi('cat',{cat:c,v:t.by[c],share:t.by[c]/tot})}></i>`).join('')}</div>
  </div>
  <div class="actions">
    <button class="act" data-go="anadir" data-mode="valores"><span>${ICON.refresh}</span>Actualizar</button>
    <button class="act" data-go="anadir" data-mode="mov"><span>${ICON.down}</span>Meter dinero</button>
    <button class="act" data-go="anadir" data-mode="nueva"><span>${ICON.plus}</span>Nueva</button>
    <button class="act" data-go="anadir" data-mode="cerrar"><span>${ICON.up}</span>Vender</button>
  </div>
  <p class="tapnote">${ICON.info} Toca cualquier cifra para saber qué significa</p>
  <div class="card">
    <div class="tiles">
      <div class="tile"${xi('ext_total',{ext:t.ext})}><span>Aportado de tu bolsillo</span><b class="num">${eur(t.ext)}</b></div>
      <div class="tile"${xi('gan_total',{gan:t.gan,tv:t.tv,ext:t.ext})}><span>Ganancia</span><b class="num ${t.gan>=0?'pos':'neg'}">${signed(t.gan)}</b></div>
      <div class="tile"${xi('xirr_total',{x:t.x})}><span>Rentabilidad anual</span><b class="num">${pct(t.x)}</b></div>
      <div class="tile"${xi('deuda',{deuda:t.deuda,n:nd.length,cuota})}><span>Deuda</span><b class="num neg">${eur(t.deuda)}</b></div>
    </div>
  </div>
  <div class="card"><div class="card-h">Dónde está tu dinero</div>
    ${CATS.map(c=>`<div class="row"${xi('cat',{cat:c,v:t.by[c],share:t.by[c]/tot})}><span class="dot" style="background:var(${CATCOL[c]})"></span><span class="row-m"><b>${c}</b><small>${pctTxt(t.by[c]/tot)} del total</small></span><span class="row-r num">${eur(t.by[c])}</span></div>`).join('')}
  </div>
  <div class="card"><div class="card-h">Por banco</div>
    ${ents.map(([e,v])=>{const ps=Object.values(S.prod).filter(p=>p.entidad===e&&value(p)>0);return `<div class="row"${xi('entidad',{e,v,share:v/tot,n:ps.length,names:ps.map(p=>p.nombre).join(', ')})}>${avatar(e)}<span class="row-m"><b>${esc(e)}</b><small>${ps.length} producto${ps.length===1?'':'s'}</small></span><span class="row-r num">${eur(v)}</span></div>`}).join('')}
  </div>
  <div class="card"><div class="card-h">Este año</div>
    <div class="row"${xi('year_new',{v:yExt,y})}><span class="row-m"><b>Dinero nuevo</b></span><span class="row-r num">${eur(yExt)}</span></div>
    <div class="row"${xi('gan_y',Object.assign({},cur||{},{y}))}><span class="row-m"><b>Ganancia (aprox.)</b></span><span class="row-r num ${(cur?.gan||0)>=0?'pos':'neg'}">${signed(cur?.gan)}</span></div>
    <div class="row"${xi('r_y',{y,r:cur?.r,parcial:true,inf:String(S.cfg.ipc).replace('.',',')+' %'})}><span class="row-m"><b>Rentabilidad (aprox.)</b></span><span class="row-r num">${pct(cur?.r)}</span></div>
    <div class="row"${xi('inf',{v:String(S.cfg.ipc).replace('.',',')+' %',src:S.cfg.ipcRef})}><span class="row-m"><b>Inflación de referencia</b></span><span class="row-r num">${String(S.cfg.ipc).replace('.',',')} %</span></div>
  </div>
  ${alerts.length?`<div class="card"><div class="card-h">Avisos</div>${alerts.map(a=>`<div class="row alert"${xi('aviso',{t:a})}><span class="dot" style="background:var(--warn)"></span><span class="row-m"><b class="wrap">${esc(a)}</b></span></div>`).join('')}</div>`:''}`;
}

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
function renderHist(){
  const el=$('#historico'); const ser=series(); if (!ser){ el.innerHTML=noData(); return }
  const CY=String(new Date().getFullYear()); const an=annual(ser).map(a=>Object.assign(a,{parcial:a.y===CY})).slice().reverse(); const INF={2021:'3,1 %',2022:'8,4 %',2023:'3,5 %',2024:'2,8 %',2025:'2,7 %'};
  el.innerHTML=`<div class="card"><div class="card-h" ${xi('chart',{})}>Evolución de tu dinero <span class="ib">${ICON.info}</span></div><div class="chartbox"><canvas id="hchart" aria-label="Evolución del patrimonio"></canvas></div>
    <div class="legend"><span><i style="background:var(--inv)"></i>Inversión</span><span><i style="background:var(--ei)"></i>Efectivo invertido</span><span><i class="dash"></i>Aportado</span></div></div>
  ${an.map(a=>{const inf=INF[a.y]||String(S.cfg.ipc).replace('.',',')+' %';const c=Object.assign({},a,{inf});return `<div class="card"><div class="card-h">${a.y}${a.parcial?' <small>hasta hoy</small>':''}</div><div class="tiles three">
    <div class="tile"${xi('v0_y',{y:a.y,v:a.V0})}><span>Empezó</span><b class="num">${eur(a.V0)}</b></div>
    <div class="tile"${xi('ext_y',{y:a.y,v:a.ext})}><span>Dinero nuevo</span><b class="num">${eur(a.ext)}</b></div>
    <div class="tile"${xi('v1_y',{y:a.y,v:a.V,parcial:a.parcial})}><span>${a.parcial?'Hoy':'Acabó'}</span><b class="num">${eur(a.V)}</b></div>
    <div class="tile"${xi('gan_y',c)}><span>Ganancia</span><b class="num ${a.gan>=0?'pos':'neg'}">${signed(a.gan)}</b></div>
    <div class="tile"${xi('r_y',c)}><span>Rentabilidad</span><b class="num">${pct(a.r)}</b></div>
    <div class="tile"${xi('inf',{v:inf,src:'IPC medio anual, INE'})}><span>Inflación</span><b class="num">${inf}</b></div></div></div>`}).join('')}`;
  if (!window.Chart || TAB!=='historico') return;
  if (chart) chart.destroy();
  const mut=css('--muted'), line=css('--line');
  chart=new Chart($('#hchart'),{type:'line',data:{labels:ser.map(r=>r.f),datasets:[
    {label:'Inversión',data:ser.map(r=>r['Inversión']),borderColor:css('--inv'),backgroundColor:css('--inv')+'55',fill:'origin',pointRadius:0,tension:.3,stack:'a',borderWidth:2},
    {label:'Efectivo invertido',data:ser.map(r=>r['Efectivo invertido']),borderColor:css('--ei'),backgroundColor:css('--ei')+'55',fill:'-1',pointRadius:0,tension:.3,stack:'a',borderWidth:2},
    {label:'Aportado',data:ser.map(r=>r.ext),borderColor:css('--ink'),borderDash:[5,4],fill:false,pointRadius:0,stack:'b',borderWidth:1.5}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      scales:{x:{ticks:{color:mut,maxTicksLimit:5,maxRotation:0,callback(v){return D(this.getLabelForValue(v)).toLocaleDateString('es-ES',{month:'short',year:'2-digit'})}},grid:{display:false},border:{display:false}},
        y:{stacked:true,position:'right',ticks:{color:mut,maxTicksLimit:5,callback:v=>new Intl.NumberFormat('es-ES',{notation:'compact'}).format(v)},grid:{color:line},border:{display:false}}},
      plugins:{legend:{display:false},tooltip:{callbacks:{title:i=>fdate(i[0].label),label:c=>`${c.dataset.label}: ${eur(c.parsed.y)}`}}}}});
}

/* ---------- Añadir ---------- */
let actMode=null;
function prodOptions(filter=p=>p.estado!=='cerrado', sel=''){ return Object.values(S.prod).filter(filter).sort((a,b)=>(a.entidad+a.nombre).localeCompare(b.entidad+b.nombre)).map(p=>`<option value="${esc(p.id)}" ${p.id===sel?'selected':''}>${esc(p.entidad)} — ${esc(p.nombre)}</option>`).join('') }
function catOf(tipo){ return tipo==='Cuenta remunerada'||tipo==='Depósito' ? 'Efectivo invertido' : tipo==='Cuenta corriente' ? 'Efectivo' : 'Inversión' }
function renderAct(){
  const el=$('#anadir');
  const pend=pendingPeriodic();
  const modes=[['valores',ICON.refresh,'Actualizar valores','Apunta lo que vale hoy cada producto'],['mov',ICON.down,'Meter o sacar dinero','Una aportación, una retirada o un traspaso'],['nueva',ICON.plus,'Nueva inversión','Has abierto un producto nuevo'],['cerrar',ICON.up,'Vender o cerrar','Has vendido todo o parte'],['periodicas',ICON.repeat,'Aportaciones periódicas',pend.length?`${pend.length} pendientes de registrar`:'Al día']];
  if (!actMode){
    el.innerHTML=`<div class="card list">${modes.map(([k,ic,t,s])=>`<button class="row tap opt" data-m="${k}"><span class="av ic">${ic}</span><span class="row-m"><b>${t}</b><small>${s}</small></span><span class="chev">${ICON.chev}</span></button>`).join('')}</div>`;
    el.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{actMode=b.dataset.m;renderAct()}); return;
  }
  const [,,title]=modes.find(m=>m[0]===actMode);
  let body='';
  if (actMode==='valores'){
    const act=Object.values(S.prod).filter(p=>p.estado!=='cerrado').sort((a,b)=>value(b)-value(a));
    body=`<form id="fval"><label class="fl">Fecha de los valores<input type="date" name="fecha" value="${today()}" required></label>
    <div class="vlist">${act.map(p=>{const lv=lastVal(p);return `<label class="vrow">${avatar(p.entidad)}<span class="row-m"><b>${esc(p.nombre)}</b><small>Antes: ${eur(lv?.v,2)} · ${sdate(lv?.f)}</small></span><input type="number" inputmode="decimal" step="0.01" name="v_${esc(p.id)}" placeholder="Nuevo €" aria-label="Nuevo valor de ${esc(p.nombre)}"></label>`}).join('')}</div>
    <p class="hint">Deja en blanco los que no hayan cambiado.</p><button class="btn wide">Guardar valores</button></form>`;
  } else if (actMode==='mov'){
    body=`<form id="fmov"><div class="seg2"><label><input type="radio" name="tipo" value="entrada" checked><span>He metido</span></label><label><input type="radio" name="tipo" value="salida"><span>He sacado</span></label></div>
    <label class="fl">Producto<select name="pid" required>${prodOptions()}</select></label>
    <label class="fl">Cantidad (€)<input type="number" inputmode="decimal" step="0.01" name="imp" required placeholder="0,00"></label>
    <label class="fl">Fecha<input type="date" name="f" value="${today()}" required></label>
    <label class="fl">Precio de compra o venta (opcional)<input type="number" inputmode="decimal" step="0.000001" name="precio"></label>
    <label class="fl">¿De dónde viene o adónde va?<select name="orig"><option value="ext">De / a mi cuenta corriente</option>${prodOptions(p=>true)}</select></label>
    <p class="hint">Si eliges otro producto, se apunta también en ese (un traspaso).</p>
    <label class="fl">Nota<input name="nota" placeholder="Opcional"></label><button class="btn wide">Guardar</button></form>`;
  } else if (actMode==='nueva'){
    const ents=[...new Set(Object.values(S.prod).map(p=>p.entidad))].sort();
    body=`<form id="fnew"><label class="fl">Tipo de activo<select name="tipo">${TIPOS.map(t=>`<option>${t}</option>`).join('')}</select></label>
    <label class="fl">Nombre<input name="nombre" required placeholder="Ej.: Vanguard Global Stock"></label>
    <label class="fl">Banco o bróker<input name="entidad" list="ents" required><datalist id="ents">${ents.map(e=>`<option value="${esc(e)}">`).join('')}</datalist></label>
    <label class="fl">ISIN o ticker (opcional)<input name="isin"></label>
    <label class="fl">Fecha de apertura<input type="date" name="f" value="${today()}" required></label>
    <label class="fl">Importe invertido (€)<input type="number" inputmode="decimal" step="0.01" name="imp" required></label>
    <label class="fl">Precio de compra (opcional)<input type="number" inputmode="decimal" step="0.000001" name="precio"></label>
    <label class="fl">¿De dónde sale el dinero?<select name="orig"><option value="ext">Dinero nuevo de mi cuenta</option>${prodOptions(p=>true)}</select></label>
    <label class="fl">Coste anual % (opcional)<input type="number" inputmode="decimal" step="0.01" name="coste"></label>
    <label class="fl">Aportación periódica € (opcional)<input type="number" inputmode="decimal" step="0.01" name="pimp"></label>
    <label class="fl">Frecuencia<select name="pfreq"><option value="mensual">Mensual</option><option value="semanal">Semanal</option><option value="diaria">Diaria</option></select></label>
    <button class="btn wide">Crear</button></form>`;
  } else if (actMode==='cerrar'){
    body=`<form id="fclose"><label class="fl">Producto<select name="pid" required>${prodOptions()}</select></label>
    <label class="fl">Importe cobrado (€)<input type="number" inputmode="decimal" step="0.01" name="imp" required></label>
    <label class="fl">Fecha<input type="date" name="f" value="${today()}" required></label>
    <label class="fl">¿Adónde va el dinero?<select name="dest"><option value="ext">A mi cuenta corriente</option>${prodOptions(p=>true)}</select></label>
    <label class="check"><input type="checkbox" name="total" checked> Lo he vendido todo (el producto se cierra)</label>
    <button class="btn wide">Registrar venta</button></form>`;
  } else {
    const per=Object.values(S.prod).filter(p=>p.periodica&&p.estado!=='cerrado');
    body=`<div class="list">${per.map(p=>{const n=pend.filter(x=>x.pid===p.id);return `<div class="row">${avatar(p.entidad)}<span class="row-m"><b>${esc(p.nombre)}</b><small>${eur(p.periodica.importe,2)} ${esc(p.periodica.frecuencia)} · apuntado hasta ${sdate(p.periodica.hasta)}</small></span><span class="row-r num">${n.length?`${n.length} · ${eur(n.reduce((s,x)=>s+x.imp,0))}`:'Al día'}</span></div>`}).join('')||'<div class="empty">Ningún producto tiene aportación periódica.</div>'}</div>
    <button class="btn wide" id="genper" ${pend.length?'':'disabled'}>Registrar ${pend.length} aportaciones pendientes</button>
    <p class="hint">Si alguna no se llegó a cobrar, bórrala desde la ficha del producto.</p>`;
  }
  el.innerHTML=`<button class="backbtn" id="actback">${ICON.back}Volver</button><h2 class="h2">${title}</h2><div class="card">${body}</div>`;
  $('#actback').onclick=()=>{actMode=null;renderAct()};
  bindForms();
}

/* ---------- ficha de producto ---------- */
let pchart=null;
function openProduct(id){
  const p=S.prod[id]; if(!p) return; const s=stats(p); const dlg=$('#dlg'); const closed=p.estado==='cerrado';
  const movs=(p.movs||[]).map((m,i)=>({m,i})).reverse(); const vals=(p.vals||[]).map((v,i)=>({v,i})).reverse();
  dlg.innerHTML=`<div class="pd-top"><button class="iconbtn" data-close aria-label="Cerrar">${ICON.back}</button><span></span></div>
  <div class="pd">
    <div class="pd-h">${avatar(p.entidad,true)}<div><div class="pd-n">${esc(p.nombre)}</div><div class="pd-s">${esc(p.entidad)} · ${esc(p.tipo)}${p.isin?' · '+esc(p.isin):''}</div></div></div>
    ${closed?`<div class="pd-v num"${xi('p_gan',{gan:s.gan,v:0,sal:s.sal,ent:s.ent})}>${signed(s.gan,2)}</div><div class="pd-g">Resultado final · cerrado el <span${xi('c_fin',{f:p.cierre})}>${fdate(p.cierre)}</span></div>`
    :`<div class="pd-v num"${xi('p_valor',{v:s.v,f:s.lv?.f,stale:s.stale})}>${eur(s.v,2)}</div>${s.gan!=null&&p.categoria!=='Efectivo'?`<div class="pd-g"><span class="num ${s.gan>=0?'pos':'neg'}"${xi('p_gan',{gan:s.gan,v:s.v,sal:s.sal,ent:s.ent})}>${signed(s.gan,2)}</span> · <span class="num"${xi('p_pct',{pct:s.pct,gan:s.gan,ent:s.ent})}>${pct(s.pct)}</span></div>`:''}`}
    ${(p.vals||[]).length>1?`<div class="pchart"><canvas id="pchart" aria-label="Evolución del valor"></canvas></div>`:''}
    <div class="card"><div class="tiles">
      ${closed?`<div class="tile"${xi('c_ent',{v:s.ent})}><span>Aportado</span><b class="num">${eur(s.ent)}</b></div><div class="tile"${xi('c_rec',{v:s.sal})}><span>Recuperado</span><b class="num">${eur(s.sal)}</b></div>`
      :`<div class="tile"${xi('p_neto',{neto:s.neto,ent:s.ent,sal:s.sal})}><span>Aportado neto</span><b class="num">${eur(s.neto)}</b></div><div class="tile"${xi('p_coste',{c:s.coste,pctc:p.costePct,v:s.v})}><span>Coste al año</span><b class="num">${s.coste==null?'—':eur(s.coste)}</b></div>`}
      <div class="tile"${xi('p_xirr',{x:s.xirr})}><span>Rentabilidad anual</span><b class="num">${pct(s.xirr)}</b></div>
      <div class="tile"${xi('p_upd',{f:s.lv?.f,stale:s.stale})}><span>Actualizado</span><b class="num ${s.stale>60?'neg':''}">${sdate(s.lv?.f)}</b></div>
      <div class="tile"${xi('cat',{cat:p.categoria,v:s.v,share:totals().activos?s.v/totals().activos:0})}><span>Categoría</span><b>${esc(p.categoria)}</b></div>
      <div class="tile"${xi('p_tras',{t:p.traspasable})}><span>Fiscalidad</span><b>${p.traspasable?'Traspasable':'Tributa al vender'}</b></div>
    </div></div>
    ${p.nota?`<div class="note">${ICON.info}<span>${esc(p.nota)}</span></div>`:''}
    <div class="card"><div class="card-h">Movimientos</div>${movs.map(({m,i})=>`<div class="row"${xi('mov',m)}><span class="row-m"><b class="wrap">${esc(m.mov||'Movimiento')}</b><small>${sdate(m.f)}${m.aprox?' ≈':''} · ${esc(m.cls||'')}${m.fia&&m.fia!=='Dato'?' · '+esc(m.fia):''}</small></span><span class="row-r num ${m.tipo==='salida'?'neg':''}">${m.tipo==='salida'?'−':'+'}${eur(m.imp,2)}</span><button class="del" data-dm="${i}" aria-label="Borrar movimiento">×</button></div>`).join('')||'<div class="empty">Sin movimientos.</div>'}</div>
    <div class="card"><div class="card-h">Valoraciones</div>${vals.map(({v,i})=>`<div class="row"${xi('val',v)}><span class="row-m"><b>${fdate(v.f)}</b><small>${esc(v.fu||'')}${v.fia&&v.fia!=='Dato'?' · '+esc(v.fia):''}</small></span><span class="row-r num">${eur(v.v,2)}</span><button class="del" data-dv="${i}" aria-label="Borrar valoración">×</button></div>`).join('')||'<div class="empty">Sin valoraciones.</div>'}</div>
    <details class="card edit"><summary>Editar este producto</summary>
      <form id="fedit">
      <label class="fl">Coste anual (%)<input type="number" inputmode="decimal" step="0.01" name="coste" value="${p.costePct??''}"></label>
      <label class="fl">Estado<select name="estado"><option value="activo" ${!closed?'selected':''}>Activo</option><option value="cerrado" ${closed?'selected':''}>Cerrado</option></select></label>
      <label class="fl">Aportación periódica (€)<input type="number" inputmode="decimal" step="0.01" name="pimp" value="${p.periodica?.importe??''}"></label>
      <label class="fl">Frecuencia<select name="pfreq">${['mensual','semanal','diaria'].map(x=>`<option ${p.periodica?.frecuencia===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <button class="btn wide">Guardar cambios</button></form>
      <button class="btn wide danger" id="delp">Borrar este producto</button>
    </details>
  </div>`;
  openSheet(dlg); dlg.scrollTop=0;
  if (window.Chart && (p.vals||[]).length>1){ if(pchart) pchart.destroy(); const vs=p.vals;
    pchart=new Chart($('#pchart'),{type:'line',data:{labels:vs.map(v=>v.f),datasets:[{data:vs.map(v=>v.v),borderColor:css('--inv'),backgroundColor:css('--inv')+'33',fill:'origin',pointRadius:0,tension:.3,borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:i=>fdate(i[0].label),label:c=>eur(c.parsed.y,2)}}},scales:{x:{display:false},y:{display:false}}}}) }
  $('#fedit',dlg).onsubmit=async e=>{e.preventDefault(); const f=new FormData(e.target); p.costePct=f.get('coste')===''?null:+f.get('coste'); const est=f.get('estado'); if(est==='cerrado'&&p.estado!=='cerrado'){p.cierre=today()} p.estado=est;
    p.periodica = f.get('pimp')? {importe:+f.get('pimp'),frecuencia:f.get('pfreq'),hasta:p.periodica?.hasta||today()} : null; await persist('p',p); render(); openProduct(id); toast('Cambios guardados')};
  dlg.querySelectorAll('[data-dm]').forEach(b=>b.onclick=async ev=>{ ev.stopPropagation(); if(!confirm('¿Borrar este movimiento?'))return; p.movs.splice(+b.dataset.dm,1); await persist('p',p); render(); openProduct(id) });
  dlg.querySelectorAll('[data-dv]').forEach(b=>b.onclick=async ev=>{ ev.stopPropagation(); if(!confirm('¿Borrar esta valoración?'))return; p.vals.splice(+b.dataset.dv,1); await persist('p',p); render(); openProduct(id) });
  $('#delp',dlg).onclick=async()=>{ if(!confirm(`¿Borrar ${p.nombre} y todo su historial?`))return; delete S.prod[id]; await remove('p',id); dlg.close(); render(); toast('Producto borrado') };
}

/* ---------- Más: deudas, datos y ajustes ---------- */
function renderMas(){
  const el=$('#mas'); const ds=Object.values(S.debts);
  const tot=ds.reduce((s,d)=>s+loanAt(d).bal,0), cuota=ds.reduce((s,d)=>s+(loanAt(d).bal>0?d.cuota:0),0);
  const st=$('#status span')?.textContent||'';
  el.innerHTML=`<h2 class="h2">Deudas</h2>
  <div class="card"><div class="tiles">
    <div class="tile"${xi('deuda',{deuda:tot,n:ds.filter(d=>loanAt(d).bal>0).length,cuota})}><span>Pendiente</span><b class="num neg">${eur(tot)}</b></div>
    <div class="tile"${xi('cuota_total',{v:cuota})}><span>Cuota al mes</span><b class="num">${eur(cuota,2)}</b></div></div></div>
  ${ds.map(d=>{const L=loanAt(d);return `<div class="card"><div class="loan-h">${avatar(d.entidad)}<span class="row-m"><b>${esc(d.nombre)}</b><small>${esc(d.entidad)} · <span${xi('l_tin',{d})}>TIN ${String(d.tin).replace('.',',')} %</span></small></span><button class="del" data-deld="${esc(d.id)}" aria-label="Borrar préstamo">×</button></div>
    <div class="prog"${xi('l_amort',{L,d})}><i style="width:${L.pctAmort*100}%"></i></div>
    <div class="tiles three">
      <div class="tile"${xi('l_bal',{L,d})}><span>Pendiente</span><b class="num">${eur(L.bal)}</b></div>
      <div class="tile"${xi('l_cuota',{L,d})}><span>Cuota</span><b class="num">${eur(d.cuota,2)}</b></div>
      <div class="tile"${xi('l_rest',{L,d})}><span>Quedan</span><b class="num">${L.restantes}</b></div>
      <div class="tile"${xi('l_int',{L,d})}><span>Intereses</span><b class="num">${eur(L.intereses)}</b></div>
      <div class="tile"${xi('l_amort',{L,d})}><span>Devuelto</span><b class="num">${pctTxt(L.pctAmort)}</b></div>
      <div class="tile"${xi('l_fin',{L,d})}><span>Fin</span><b class="num">${sdate(L.fin)}</b></div></div></div>`}).join('')}
  <details class="card edit"><summary>Añadir préstamo</summary>
    <form id="fdebt"><label class="fl">Nombre<input name="nombre" required placeholder="Préstamo coche"></label><label class="fl">Entidad<input name="entidad" required></label>
    <label class="fl">Capital inicial (€)<input name="capital" type="number" inputmode="decimal" step="0.01" required></label><label class="fl">TIN (%)<input name="tin" type="number" inputmode="decimal" step="0.001" required></label>
    <label class="fl">Cuota (€)<input name="cuota" type="number" inputmode="decimal" step="0.01" required></label><label class="fl">Primera cuota<input name="primerPago" type="date" required></label>
    <label class="fl">Número de cuotas<input name="n" type="number" inputmode="numeric" required></label><button class="btn wide">Añadir préstamo</button></form></details>

  <h2 class="h2">Tus datos</h2>
  <div class="card">
    <div class="row"${xi('sync',{s:st})}><span class="row-m"><b>OneDrive</b><small>${esc(st)}</small></span></div>
    <div class="row"><span class="row-m"><b>Cuenta</b><small id="who">${esc(ACCOUNT?.username||'—')}</small></span></div>
    <div class="row"><span class="row-m"><b>Archivo</b><small>OneDrive › Aplicaciones › ${esc(CFG.fileName||'patrimonio.xlsx')}</small></span></div>
    <div class="btns"><button class="btn" id="reload">Recargar</button><button class="btn ghost" id="exp">Descargar copia</button></div>
  </div>
  <div class="card"><div class="card-h">Importar un Excel</div><p class="hint">Sustituye todo por el contenido del archivo y lo guarda en OneDrive.</p><label class="btn ghost wide" style="cursor:pointer">Elegir archivo<input type="file" id="imp" accept=".xlsx" hidden></label><p class="hint" id="impmsg"></p></div>
  <details class="card edit"><summary>Ajustes</summary><form id="fcfg"><label class="fl">Inflación de referencia (%)<input type="number" inputmode="decimal" step="0.1" name="ipc" value="${S.cfg.ipc}"></label><label class="fl">Avisos (uno por línea)<textarea name="avisos" rows="5">${esc((S.cfg.avisos||[]).join('\n'))}</textarea></label><button class="btn wide">Guardar ajustes</button></form></details>
  <button class="btn wide danger" id="out">Cerrar sesión</button>`;
  el.querySelectorAll('[data-deld]').forEach(b=>b.onclick=async()=>{ if(!confirm('¿Borrar este préstamo?'))return; delete S.debts[b.dataset.deld]; await remove('d',b.dataset.deld); render(); toast('Préstamo borrado') });
  $('#fdebt').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const d={id:uid(),nombre:f.get('nombre'),entidad:f.get('entidad'),capital:+f.get('capital'),tin:+f.get('tin'),cuota:+f.get('cuota'),primerPago:f.get('primerPago'),n:+f.get('n')};S.debts[d.id]=d;await persist('d',d);render();toast('Préstamo añadido')};
  $('#reload').onclick=()=>{ if(dirty&&!confirm('Hay cambios sin guardar. ¿Recargar igualmente?'))return; pull().catch(()=>toast('No se ha podido leer OneDrive')) };
  $('#exp').onclick=()=>{ const u=URL.createObjectURL(new Blob([workbookFromState()])); const a=document.createElement('a'); a.href=u; a.download=`patrimonio_${today()}.xlsx`; a.click(); setTimeout(()=>URL.revokeObjectURL(u),5000) };
  $('#out').onclick=logout;
  $('#imp').onchange=async ev=>{ const file=ev.target.files[0]; if(!file) return; const msg=$('#impmsg');
    try{ const st=stateFromWorkbook(await file.arrayBuffer());
      if(!confirm(`Se sustituirán tus datos por ${Object.keys(st.prod).length} productos. ¿Continuar?`)) return;
      S.prod=st.prod; S.debts=st.debts; S.cfg=st.cfg; render(); await push(true); toast('Datos importados y guardados en OneDrive');
    }catch(e){ msg.textContent='No se ha podido leer el archivo. Usa un Excel exportado desde la app.' } ev.target.value='' };
  $('#fcfg').onsubmit=e=>{e.preventDefault(); const f=new FormData(e.target); S.cfg.ipc=+f.get('ipc'); S.cfg.avisos=String(f.get('avisos')).split('\n').map(s=>s.trim()).filter(Boolean); schedule(); render(); toast('Ajustes guardados')};
}

/* ---------- arranque ---------- */
document.getElementById('loginbtn').onclick=()=>login();
const _cl=document.getElementById('clearlog'); if(_cl) _cl.onclick=()=>{ try{localStorage.removeItem('pat_log');localStorage.removeItem('pat_loop')}catch(e){} document.getElementById('gatelog').textContent='' };
$('#status').onclick=()=>go('mas');
render(); load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
