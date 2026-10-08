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
  const meta=await graph('');
  if (meta.status===404){ S.mode='nuevo'; ETAG=null; setStatus('No hay Excel todavía en OneDrive'); render(); return }
  if (!meta.ok) throw new Error('graph_'+meta.status);
  const j=await meta.json(); ETAG=j.eTag;
  const r=await graph(':/content'); if(!r.ok) throw new Error('graph_'+r.status);
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
/* ---------- render ---------- */
function render(){
  const lu=lastUpdate(); $('#asof').textContent = lu ? 'Último dato: '+fdate(lu) : 'Sin datos';
  renderResumen(); renderPos(); renderHist(); renderDeudas(); renderAct(); renderDatos();
}
function noData(){ if (S.mode==='nuevo') return `<div class="panel empty"><p style="margin:0 0 8px;color:var(--ink);font-weight:600">Tu OneDrive todavía no tiene el Excel de la app.</p><p style="margin:0">Ve a <b>Datos</b> e importa <b>patrimonio_datos_iniciales.xlsx</b>: se guardará en OneDrive y desde entonces será tu archivo de trabajo.</p></div>`; if (S.mode==='cargando') return `<div class="panel empty">Cargando tus datos…</div>`; return `<div class="panel empty">Todavía no hay datos. Importa tu Excel en <b>Datos</b> o añade tu primera inversión en <b>Actualizar</b>.</div>` }

function renderResumen(){
  const el=$('#resumen'); const has=Object.keys(S.prod).length;
  if (!has){ el.innerHTML=`<h1>Resumen</h1>${noData()}`; return }
  const t=totals(); const ints=Math.trunc(t.neto); const cents=Math.abs(Math.round((t.neto-ints)*100)).toString().padStart(2,'0');
  const tot=t.activos||1;
  const seg = CATS.map(c=>`<i style="width:${t.by[c]/tot*100}%;background:var(${CATVAR[c]})" title="${c}"></i>`).join('');
  const debtW=Math.min(100,t.deuda/tot*100);
  const ents=Object.entries(t.ent).sort((a,b)=>b[1]-a[1]); const max=ents[0]?.[1]||1;
  const y=String(new Date().getFullYear());
  let yExt=0; for (const p of Object.values(S.prod)) for (const m of p.movs||[]) if (m.ext && m.f.startsWith(y)) yExt+=m.ext;
  const ser=series(); const an=ser?annual(ser):[]; const cur=an.find(a=>a.y===y);
  const alerts=[...(S.cfg.avisos||[]).map(a=>({t:a,w:false}))];
  for (const p of Object.values(S.prod)){ const s=stats(p); if (s.stale!=null && s.stale>60 && s.v>500) alerts.push({t:`${p.nombre}: valor sin actualizar desde hace ${Math.round(s.stale)} días`,w:true}) }
  el.innerHTML = `
  <h1>Resumen</h1>
  <p class="lede">Lo que tienes hoy, lo que debes y cómo ha rendido el dinero que has puesto.</p>
  <div class="panel hero">
    <div class="hero-top">
      <div><div class="hero-label">Patrimonio neto</div>
        <div class="hero-num num">${new Intl.NumberFormat('es-ES').format(ints)}<span class="cents">,${cents} €</span></div></div>
      <div class="kpis">
        <div class="kpi"><span>Ganancia acumulada</span><strong class="num ${t.gan>=0?'pos':'neg'}">${eur(t.gan)}</strong></div>
        <div class="kpi"><span>Rentabilidad anual (XIRR)</span><strong class="num">${pct(t.x)}</strong></div>
        <div class="kpi"><span>Aportado neto desde 2021</span><strong class="num">${eur(t.ext)}</strong></div>
        <div class="kpi"><span>Deuda pendiente</span><strong class="num" style="color:var(--debt)">${eur(t.deuda)}</strong></div>
      </div>
    </div>
    <div class="compo">
      <div class="bar" role="img" aria-label="Reparto del patrimonio por categoría">${seg}</div>
      ${t.deuda?`<div class="debtbar" aria-hidden="true"><i style="width:${debtW}%"></i></div>`:''}
      <div class="legend">${CATS.map(c=>`<span><i class="sw" style="background:var(${CATVAR[c]})"></i>${c} <b class="num">${eur(t.by[c])}</b> <span class="mut">${pct(t.by[c]/tot,0).replace('+','')}</span></span>`).join('')}
        ${t.deuda?`<span><i class="sw" style="background:var(--debt)"></i>Deuda <b class="num">−${eur(t.deuda)}</b></span>`:''}</div>
    </div>
  </div>
  <div class="grid g2">
    <div class="panel"><h2>Por entidad</h2><div class="hbars">${ents.map(([e,v])=>`<div class="hb"><span>${esc(e)}</span><span class="t"><i style="width:${v/max*100}%"></i></span><span class="num" style="text-align:right">${eur(v)}</span></div>`).join('')}</div></div>
    <div class="grid" style="align-content:start">
      <div class="panel"><h2>Este año</h2><dl class="dl">
        <dt>Dinero nuevo aportado</dt><dd>${eur(yExt)}</dd>
        <dt>Ganancia del año (aprox.)</dt><dd class="${(cur?.gan||0)>=0?'pos':'neg'}">${eur(cur?.gan)}</dd>
        <dt>Rentabilidad del año (aprox.)</dt><dd>${pct(cur?.r)}</dd>
        <dt>Inflación de referencia</dt><dd>${esc(String(S.cfg.ipc).replace('.',','))} %</dd></dl></div>
      <div class="panel"><h2>Avisos</h2>${alerts.length?`<ul class="alerts">${alerts.map(a=>`<li class="${a.w?'warn':''}">${esc(a.t)}</li>`).join('')}</ul>`:'<p class="hint">Nada pendiente.</p>'}</div>
    </div>
  </div>`;
}

let posFilter='activas';
function renderPos(){
  const el=$('#posiciones');
  if (!Object.keys(S.prod).length){ el.innerHTML=`<h1>Posiciones</h1>${noData()}`; return }
  const fl={activas:p=>p.estado!=='cerrado', 'Inversión':p=>p.estado!=='cerrado'&&p.categoria==='Inversión','Efectivo invertido':p=>p.estado!=='cerrado'&&p.categoria==='Efectivo invertido','Efectivo':p=>p.estado!=='cerrado'&&p.categoria==='Efectivo',cerradas:p=>p.estado==='cerrado'};
  const list=Object.values(S.prod).filter(fl[posFilter]).map(p=>({p,s:stats(p)})).sort((a,b)=>posFilter==='cerradas'?(b.p.cierre||'').localeCompare(a.p.cierre||''):b.s.v-a.s.v);
  const T={v:0,neto:0,gan:0,coste:0}; list.forEach(({s})=>{T.v+=s.v;T.neto+=s.neto;T.gan+=s.gan||0;T.coste+=s.coste||0});
  const chips=[['activas','Activas'],['Inversión','Inversión'],['Efectivo invertido','Efectivo invertido'],['Efectivo','Efectivo'],['cerradas','Cerradas']];
  el.innerHTML=`<h1>Posiciones</h1><p class="lede">Pulsa una fila para ver sus movimientos, corregirlos o cambiar sus datos. La etiqueta “estimado” indica que hay importes reconstruidos.</p>
  <div class="chips">${chips.map(([k,l])=>`<button class="chip" data-f="${k}" aria-pressed="${posFilter===k}">${l}</button>`).join('')}</div>
  <div class="tablewrap"><table><thead><tr><th>Producto</th><th>${posFilter==='cerradas'?'Cerrado':'Valor'}</th><th>Aportado neto</th><th>Ganancia</th><th>Rentab. simple</th><th>XIRR anual*</th><th>Coste / año</th><th>Actualizado</th></tr></thead><tbody>
  ${list.map(({p,s})=>`<tr data-id="${esc(p.id)}"><td><i class="cat" style="background:var(${CATVAR[p.categoria]})"></i><span class="pname">${esc(p.nombre)}</span>${s.est?'<span class="est">estimado</span>':''}<span class="psub">${esc(p.entidad)} · ${esc(p.tipo)}${p.traspasable?' · traspasable':''}</span></td>
    <td class="num">${posFilter==='cerradas'?sdate(p.cierre):eur(s.v)}</td><td class="num">${eur(s.neto)}</td>
    <td class="num ${s.gan>=0?'pos':'neg'}">${s.gan==null?'—':eur(s.gan)}</td><td class="num">${pct(s.pct)}</td><td class="num">${pct(s.xirr)}</td>
    <td class="num">${s.coste==null?'<span class="mut">—</span>':eur(s.coste)}</td>
    <td class="num ${s.stale>60?'stale':''}">${s.lv?sdate(s.lv.f):'—'}</td></tr>`).join('')}
  <tr class="total"><td>Total (${list.length})</td><td class="num">${posFilter==='cerradas'?'':eur(T.v)}</td><td class="num">${eur(T.neto)}</td><td class="num ${T.gan>=0?'pos':'neg'}">${eur(T.gan)}</td><td></td><td></td><td class="num">${T.coste?eur(T.coste):''}</td><td></td></tr>
  </tbody></table></div><p class="hint" style="margin-top:10px">* La XIRR solo se muestra con más de un año de historia: anualizar periodos cortos exagera el resultado.</p>`;
  el.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{posFilter=b.dataset.f;renderPos()});
  el.querySelectorAll('tbody tr[data-id]').forEach(r=>r.onclick=()=>openProduct(r.dataset.id));
}

let chart=null;
function renderHist(){
  const el=$('#historico'); const ser=series();
  if (!ser){ el.innerHTML=`<h1>Histórico</h1>${noData()}`; return }
  const an=annual(ser);
  const closed=Object.values(S.prod).filter(p=>p.estado==='cerrado').map(p=>({p,s:stats(p)})).sort((a,b)=>(b.p.cierre||'').localeCompare(a.p.cierre||''));
  el.innerHTML=`<h1>Histórico</h1><p class="lede">Evolución del valor de inversiones y efectivo invertido frente al dinero que has aportado. Entre valoraciones conocidas el valor se interpola, así que los meses intermedios son aproximados.</p>
  <div class="panel" style="margin-bottom:16px"><div class="chartbox"><canvas id="hchart" aria-label="Evolución del patrimonio"></canvas></div></div>
  <div class="tablewrap" style="margin-bottom:16px"><table><thead><tr><th>Año</th><th>Valor inicio</th><th>Dinero nuevo neto</th><th>Valor fin</th><th>Ganancia</th><th>Rentabilidad aprox.</th><th>Inflación</th></tr></thead><tbody>
  ${an.map(a=>`<tr><td>${a.y}${a.parcial?' <span class="mut">(hasta hoy)</span>':''}</td><td class="num">${eur(a.V0)}</td><td class="num">${eur(a.ext)}</td><td class="num">${eur(a.V)}</td><td class="num ${a.gan>=0?'pos':'neg'}">${eur(a.gan)}</td><td class="num">${pct(a.r)}</td><td class="num mut">${({2021:'3,1 %',2022:'8,4 %',2023:'3,5 %',2024:'2,8 %',2025:'2,7 %'})[a.y]||esc(String(S.cfg.ipc).replace('.',','))+' %'}</td></tr>`).join('')}
  </tbody></table></div>
  <h2>Inversiones cerradas</h2>
  <div class="tablewrap"><table><thead><tr><th>Producto</th><th>Cierre</th><th>Aportado</th><th>Recuperado</th><th>Resultado</th><th>XIRR anual</th></tr></thead><tbody>
  ${closed.map(({p,s})=>`<tr data-id="${esc(p.id)}"><td><span class="pname">${esc(p.nombre)}</span><span class="psub">${esc(p.entidad)}</span></td><td class="num">${fdate(p.cierre)}</td><td class="num">${eur(s.ent)}</td><td class="num">${eur(s.sal)}</td><td class="num ${s.gan>=0?'pos':'neg'}">${eur(s.gan)}</td><td class="num">${pct(s.xirr)}</td></tr>`).join('')||'<tr><td colspan="6" class="mut">Sin inversiones cerradas.</td></tr>'}
  </tbody></table></div>
  <p class="hint" style="margin-top:12px">Inflación media anual IPC (INE); el año en curso usa el dato de referencia de Ajustes.</p>`;
  el.querySelectorAll('tbody tr[data-id]').forEach(r=>r.onclick=()=>openProduct(r.dataset.id));
  if (!window.Chart){ $('#hchart').parentElement.innerHTML='<p class="empty">No se ha podido cargar el gráfico.</p>'; return }
  if (chart) chart.destroy();
  const ink=css('--muted'), line=css('--line');
  chart=new Chart($('#hchart'),{type:'line',data:{labels:ser.map(r=>r.f),datasets:[
    {label:'Inversión',data:ser.map(r=>r['Inversión']),borderColor:css('--inv'),backgroundColor:css('--inv')+'cc',fill:'origin',pointRadius:0,tension:.25,stack:'a',borderWidth:1.5},
    {label:'Efectivo invertido',data:ser.map(r=>r['Efectivo invertido']),borderColor:css('--ei'),backgroundColor:css('--ei')+'bb',fill:'-1',pointRadius:0,tension:.25,stack:'a',borderWidth:1.5},
    {label:'Dinero aportado neto',data:ser.map(r=>r.ext),borderColor:css('--ink'),borderDash:[5,4],fill:false,pointRadius:0,stack:'b',borderWidth:1.5}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      scales:{x:{ticks:{color:ink,maxTicksLimit:8,callback(v){const s=this.getLabelForValue(v);return D(s).toLocaleDateString('es-ES',{month:'short',year:'2-digit'})}},grid:{display:false}},
        y:{stacked:true,ticks:{color:ink,callback:v=>new Intl.NumberFormat('es-ES',{notation:'compact'}).format(v)+' €'},grid:{color:line}}},
      plugins:{legend:{labels:{color:ink,boxWidth:12}},tooltip:{callbacks:{title:i=>fdate(i[0].label),label:c=>`${c.dataset.label}: ${eur(c.parsed.y)}`}}}}});
}

function renderDeudas(){
  const el=$('#deudas'); const ds=Object.values(S.debts);
  const tot=ds.reduce((s,d)=>s+loanAt(d).bal,0), cuota=ds.reduce((s,d)=>s+(loanAt(d).bal>0?d.cuota:0),0);
  el.innerHTML=`<h1>Deudas</h1><p class="lede">El capital pendiente se calcula con el cuadro de amortización (sistema francés) a fecha de hoy.</p>
  <div class="panel" style="margin-bottom:16px;display:flex;gap:40px;flex-wrap:wrap;align-items:flex-end">
    <div><div class="hero-label">Deuda pendiente</div><div class="bigdebt num" style="color:var(--debt)">${eur(tot)}</div></div>
    <div class="kpi"><span>Cuota mensual total</span><strong class="num">${eur(cuota,2)}</strong></div></div>
  <div class="loans">${ds.map(d=>{const L=loanAt(d);return `<div class="panel"><div style="display:flex;justify-content:space-between;gap:10px"><h2 style="margin:0">${esc(d.nombre)}</h2><button class="btn danger" data-del="${esc(d.id)}">Borrar</button></div>
    <span class="mut" style="font-size:13px">${esc(d.entidad)} · TIN ${String(d.tin).replace('.',',')} %</span>
    <div class="prog" role="progressbar" aria-valuenow="${Math.round(L.pctAmort*100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${L.pctAmort*100}%"></i></div>
    <dl class="dl"><dt>Capital pendiente</dt><dd>${eur(L.bal,2)}</dd><dt>Amortizado</dt><dd>${pct(L.pctAmort,0).replace('+','')}</dd><dt>Cuota</dt><dd>${eur(d.cuota,2)}</dd><dt>Cuotas restantes</dt><dd>${L.restantes}</dd><dt>Intereses por pagar</dt><dd>${eur(L.intereses,2)}</dd><dt>Última cuota</dt><dd>${fdate(L.fin)}</dd></dl>
    ${d.nota?`<p class="hint" style="margin-top:10px">${esc(d.nota)}</p>`:''}</div>`}).join('')||'<div class="panel empty">Sin deudas registradas.</div>'}</div>
  <div class="panel" style="margin-top:16px"><h2>Añadir préstamo</h2>
  <form id="fdebt"><div class="row"><label>Nombre<input name="nombre" required placeholder="Préstamo coche"></label><label>Entidad<input name="entidad" required></label></div>
  <div class="row"><label>Capital inicial (€)<input name="capital" type="number" step="0.01" required></label><label>TIN (%)<input name="tin" type="number" step="0.001" required></label><label>Cuota (€)<input name="cuota" type="number" step="0.01" required></label></div>
  <div class="row"><label>Primera cuota<input name="primerPago" type="date" required></label><label>Número de cuotas<input name="n" type="number" required></label></div>
  <button class="btn">Añadir préstamo</button></form></div>`;
  el.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{ if(!confirm('¿Borrar este préstamo?'))return; delete S.debts[b.dataset.del]; await remove('d',b.dataset.del); render(); toast('Préstamo borrado') });
  $('#fdebt').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const d={id:uid(),nombre:f.get('nombre'),entidad:f.get('entidad'),capital:+f.get('capital'),tin:+f.get('tin'),cuota:+f.get('cuota'),primerPago:f.get('primerPago'),n:+f.get('n')};S.debts[d.id]=d;await persist('d',d);render();toast('Préstamo añadido')};
}

/* ---------- forms ---------- */
let actMode='valores';
function prodOptions(filter=p=>p.estado!=='cerrado', sel=''){ return Object.values(S.prod).filter(filter).sort((a,b)=>(a.entidad+a.nombre).localeCompare(b.entidad+b.nombre)).map(p=>`<option value="${esc(p.id)}" ${p.id===sel?'selected':''}>${esc(p.entidad)} — ${esc(p.nombre)}</option>`).join('') }
function catOf(tipo){ return tipo==='Cuenta remunerada'||tipo==='Depósito' ? 'Efectivo invertido' : tipo==='Cuenta corriente' ? 'Efectivo' : 'Inversión' }
function renderAct(){
  const el=$('#actualizar');
  const modes=[['valores','Actualizar valores'],['mov','Meter o sacar dinero'],['nueva','Nueva inversión'],['cerrar','Vender o cerrar'],['periodicas','Aportaciones periódicas']];
  let body='';
  if (actMode==='valores'){
    const act=Object.values(S.prod).filter(p=>p.estado!=='cerrado').sort((a,b)=>(a.entidad+a.nombre).localeCompare(b.entidad+b.nombre));
    body=`<form id="fval"><label style="max-width:220px">Fecha de los valores<input type="date" name="fecha" value="${today()}" required></label>
    <div class="tablewrap vtable"><table><thead><tr><th>Producto</th><th>Último valor</th><th>Fecha</th><th>Nuevo valor (€)</th></tr></thead><tbody>
    ${act.map(p=>{const lv=lastVal(p);return `<tr><td><span class="pname">${esc(p.nombre)}</span><span class="psub">${esc(p.entidad)}</span></td><td class="num">${eur(lv?.v,2)}</td><td class="num">${fdate(lv?.f)}</td><td><input type="number" step="0.01" name="v_${esc(p.id)}" aria-label="Nuevo valor de ${esc(p.nombre)}"></td></tr>`}).join('')}
    </tbody></table></div><p class="hint">Deja en blanco los que no cambien. Se guarda una línea por producto en su historial de valoraciones.</p><button class="btn">Guardar valores</button></form>`;
  } else if (actMode==='mov'){
    body=`<form id="fmov"><div class="radio" role="radiogroup"><label><input type="radio" name="tipo" value="entrada" checked> He metido dinero</label><label><input type="radio" name="tipo" value="salida"> He sacado dinero</label></div>
    <label>Inversión<select name="pid" required>${prodOptions()}</select></label>
    <div class="row"><label>Fecha<input type="date" name="f" value="${today()}" required></label><label>Cantidad (€)<input type="number" step="0.01" name="imp" required></label><label>Precio de compra o venta (opcional)<input type="number" step="0.000001" name="precio"></label></div>
    <label>¿De dónde viene o a dónde va el dinero?<select name="orig"><option value="ext">De / a mi cuenta corriente (dinero nuevo o retirada)</option>${prodOptions(p=>true).replace(/<option /g,'<option data-p ')}</select></label>
    <p class="hint">Si eliges otra inversión, se registra el movimiento contrario en esa también (por ejemplo, un traspaso entre fondos).</p>
    <label>Nota<input name="nota" placeholder="Opcional"></label><button class="btn">Guardar movimiento</button></form>`;
  } else if (actMode==='nueva'){
    const ents=[...new Set(Object.values(S.prod).map(p=>p.entidad))].sort();
    body=`<form id="fnew"><div class="row"><label>Tipo de activo<select name="tipo">${TIPOS.map(t=>`<option>${t}</option>`).join('')}</select></label><label>Nombre<input name="nombre" required placeholder="Vanguard Global Stock"></label></div>
    <div class="row"><label>ISIN o ticker<input name="isin"></label><label>Banco o bróker<input name="entidad" list="ents" required><datalist id="ents">${ents.map(e=>`<option value="${esc(e)}">`).join('')}</datalist></label></div>
    <div class="row"><label>Fecha de apertura<input type="date" name="f" value="${today()}" required></label><label>Importe invertido (€)<input type="number" step="0.01" name="imp" required></label><label>Precio de compra (opcional)<input type="number" step="0.000001" name="precio"></label></div>
    <div class="row"><label>Origen del dinero<select name="orig"><option value="ext">Dinero nuevo (de mi cuenta)</option>${prodOptions(p=>true)}</select></label><label>Coste anual (%) (opcional)<input type="number" step="0.01" name="coste"></label></div>
    <div class="row"><label>Aportación periódica (€, opcional)<input type="number" step="0.01" name="pimp"></label><label>Frecuencia<select name="pfreq"><option value="mensual">Mensual</option><option value="semanal">Semanal</option><option value="diaria">Diaria</option></select></label></div>
    <p class="hint">La categoría se asigna sola: cuentas remuneradas y depósitos van a Efectivo invertido; el resto, a Inversión.</p>
    <button class="btn">Crear inversión</button></form>`;
  } else if (actMode==='cerrar'){
    body=`<form id="fclose"><label>Inversión<select name="pid" required>${prodOptions()}</select></label>
    <div class="row"><label>Fecha<input type="date" name="f" value="${today()}" required></label><label>Importe cobrado (€)<input type="number" step="0.01" name="imp" required></label></div>
    <label>Destino del dinero<select name="dest"><option value="ext">A mi cuenta corriente</option>${prodOptions(p=>true)}</select></label>
    <div class="radio"><label><input type="checkbox" name="total" checked> Cierre total (el valor pasa a 0)</label></div>
    <button class="btn">Registrar venta</button></form>`;
  } else {
    const per=Object.values(S.prod).filter(p=>p.periodica&&p.estado!=='cerrado');
    const pend=pendingPeriodic();
    body=`<div class="tablewrap" style="margin-bottom:16px"><table><thead><tr><th>Inversión</th><th>Importe</th><th>Frecuencia</th><th>Registrado hasta</th><th>Pendiente</th></tr></thead><tbody>
    ${per.map(p=>{const n=pend.filter(x=>x.pid===p.id);return `<tr><td class="pname">${esc(p.nombre)}</td><td class="num">${eur(p.periodica.importe,2)}</td><td>${esc(p.periodica.frecuencia)}</td><td class="num">${fdate(p.periodica.hasta)}</td><td class="num">${n.length} · ${eur(n.reduce((s,x)=>s+x.imp,0))}</td></tr>`}).join('')||'<tr><td colspan="5" class="mut">Ninguna inversión tiene aportación periódica.</td></tr>'}
    </tbody></table></div><button class="btn" id="genper" ${pend.length?'':'disabled'}>Registrar ${pend.length} aportaciones pendientes</button>
    <p class="hint" style="margin-top:10px">Se registran como dinero nuevo con la marca “periódica”. Si alguna no se cobró, bórrala desde la ficha de la inversión.</p>`;
  }
  el.innerHTML=`<h1>Actualizar</h1><p class="lede">Elige qué ha pasado. Todo se guarda al momento en tu cuenta y queda en el historial.</p>
  <div class="seg">${modes.map(([k,l])=>`<button data-m="${k}" aria-pressed="${actMode===k}">${l}</button>`).join('')}</div><div class="panel">${body}</div>`;
  el.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{actMode=b.dataset.m;renderAct()});
  bindForms();
}
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
    render(); toast(n?`${n} valores guardados`:'No has cambiado ningún valor') };
  const fm=$('#fmov'); if (fm) fm.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fm); const p=S.prod[f.get('pid')]; const tipo=f.get('tipo'); const imp=+f.get('imp'); const precio=+f.get('precio')||null; const orig=f.get('orig');
    const ext = orig==='ext' ? (tipo==='entrada'?imp:-imp) : 0;
    addMov(p,{f:f.get('f'),tipo,imp,ext,cls:orig==='ext'?(tipo==='entrada'?'Dinero nuevo':'Retirada'):'Interno',fia:'Dato',mov:tipo==='entrada'?'Aportación':'Retirada',precio,uds:precio?imp/precio:null,nota:f.get('nota')||''});
    await persist('p',p);
    if (orig!=='ext' && S.prod[orig] && orig!==p.id){ const o=S.prod[orig]; addMov(o,{f:f.get('f'),tipo:tipo==='entrada'?'salida':'entrada',imp,ext:0,cls:'Interno',fia:'Dato',mov:tipo==='entrada'?`Hacia ${p.nombre}`:`Desde ${p.nombre}`,nota:''}); await persist('p',o) }
    render(); toast('Movimiento guardado') };
  const fn=$('#fnew'); if (fn) fn.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fn); const tipo=f.get('tipo'); const imp=+f.get('imp'); const precio=+f.get('precio')||null; const orig=f.get('orig'); const fecha=f.get('f');
    const p={id:uid(),nombre:f.get('nombre'),entidad:f.get('entidad'),tipo,categoria:catOf(tipo),traspasable:tipo==='Fondo',estado:'activo',costePct:f.get('coste')?+f.get('coste'):null,isin:f.get('isin')||'',nota:'',apertura:fecha,
      periodica: f.get('pimp')?{importe:+f.get('pimp'),frecuencia:f.get('pfreq'),hasta:fecha}:null,movs:[],vals:[{f:fecha,v:imp,fia:'Dato',fu:'Importe de apertura'}]};
    addMov(p,{f:fecha,tipo:'entrada',imp,ext:orig==='ext'?imp:0,cls:orig==='ext'?'Dinero nuevo':'Interno',fia:'Dato',mov:'Apertura',precio,uds:precio?imp/precio:null,nota:''});
    S.prod[p.id]=p; await persist('p',p);
    if (orig!=='ext' && S.prod[orig]){ const o=S.prod[orig]; addMov(o,{f:fecha,tipo:'salida',imp,ext:0,cls:'Interno',fia:'Dato',mov:`Hacia ${p.nombre}`,nota:''}); await persist('p',o) }
    render(); toast('Inversión creada') };
  const fc=$('#fclose'); if (fc) fc.onsubmit=async e=>{e.preventDefault(); const f=new FormData(fc); const p=S.prod[f.get('pid')]; const imp=+f.get('imp'); const dest=f.get('dest'); const fecha=f.get('f');
    addMov(p,{f:fecha,tipo:'salida',imp,ext:dest==='ext'?-imp:0,cls:dest==='ext'?'Retirada':'Interno',fia:'Dato',mov:'Venta',nota:''});
    if (f.get('total')){ p.estado='cerrado'; p.cierre=fecha; p.vals=(p.vals||[]).filter(x=>x.f!==fecha); p.vals.push({f:fecha,v:0,fia:'Dato',fu:'Cierre'}); p.vals.sort((a,b)=>a.f<b.f?-1:1) }
    await persist('p',p);
    if (dest!=='ext' && S.prod[dest]){ const o=S.prod[dest]; addMov(o,{f:fecha,tipo:'entrada',imp,ext:0,cls:'Interno',fia:'Dato',mov:`Desde ${p.nombre}`,nota:''}); await persist('p',o) }
    render(); toast('Venta registrada') };
  const gp=$('#genper'); if (gp) gp.onclick=async()=>{ const pend=pendingPeriodic(); const by={};
    pend.forEach(x=>{ (by[x.pid]=by[x.pid]||[]).push(x) });
    for (const [pid,xs] of Object.entries(by)){ const p=S.prod[pid]; xs.forEach(x=>addMov(p,{f:x.f,tipo:'entrada',imp:x.imp,ext:x.imp,cls:'Dinero nuevo',fia:'Periódica',mov:'Aportación periódica',nota:''})); p.periodica.hasta=xs[xs.length-1].f; await persist('p',p) }
    render(); toast(`${pend.length} aportaciones registradas`) };
}

/* ---------- product drawer ---------- */
function openProduct(id){
  const p=S.prod[id]; if(!p) return; const s=stats(p); const dlg=$('#dlg');
  dlg.innerHTML=`<div class="dlg-h"><div><h2 style="margin:0 0 4px;font-size:20px">${esc(p.nombre)}</h2><span class="mut" style="font-size:13px">${esc(p.entidad)} · ${esc(p.tipo)} · ${esc(p.categoria)}${p.isin?' · '+esc(p.isin):''}</span></div><button class="x" aria-label="Cerrar">×</button></div>
  <div class="dlg-b">
    <dl class="dl" style="max-width:420px;margin-bottom:16px"><dt>Valor</dt><dd>${eur(s.v,2)}</dd><dt>Aportado neto</dt><dd>${eur(s.neto,2)}</dd><dt>Ganancia</dt><dd class="${s.gan>=0?'pos':'neg'}">${s.gan==null?'—':eur(s.gan,2)}</dd><dt>XIRR anual</dt><dd>${pct(s.xirr)}</dd></dl>
    ${p.nota?`<p class="hint" style="margin-bottom:14px">${esc(p.nota)}</p>`:''}
    <form id="fedit" style="margin-bottom:18px"><div class="row">
      <label>Coste anual (%)<input type="number" step="0.01" name="coste" value="${p.costePct??''}"></label>
      <label>Estado<select name="estado"><option value="activo" ${p.estado!=='cerrado'?'selected':''}>Activa</option><option value="cerrado" ${p.estado==='cerrado'?'selected':''}>Cerrada</option></select></label>
      <label>Periódica (€)<input type="number" step="0.01" name="pimp" value="${p.periodica?.importe??''}"></label>
      <label>Frecuencia<select name="pfreq">${['mensual','semanal','diaria'].map(x=>`<option ${p.periodica?.frecuencia===x?'selected':''}>${x}</option>`).join('')}</select></label>
    </div><button class="btn ghost">Guardar cambios</button></form>
    <h2>Movimientos</h2>
    <div class="tablewrap" style="margin-bottom:16px"><table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Importe</th><th>Clase</th><th>Fiabilidad</th><th></th></tr></thead><tbody>
    ${(p.movs||[]).map((m,i)=>`<tr><td class="num">${fdate(m.f)}${m.aprox?' <span class="mut">≈</span>':''}</td><td style="text-align:left;white-space:normal;min-width:220px">${esc(m.mov)}${m.nota?`<span class="psub">${esc(m.nota)}</span>`:''}</td><td class="num ${m.tipo==='salida'?'neg':''}">${m.tipo==='salida'?'−':''}${eur(m.imp||m.ext,2)}</td><td>${esc(m.cls||'')}</td><td>${esc(m.fia||'')}</td><td><button class="btn danger" data-dm="${i}">Borrar</button></td></tr>`).join('')||'<tr><td colspan="6" class="mut">Sin movimientos.</td></tr>'}
    </tbody></table></div>
    <h2>Valoraciones</h2>
    <div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Valor</th><th>Fiabilidad</th><th>Fuente</th><th></th></tr></thead><tbody>
    ${(p.vals||[]).map((v,i)=>`<tr><td class="num">${fdate(v.f)}</td><td class="num">${eur(v.v,2)}</td><td>${esc(v.fia||'')}</td><td style="text-align:left">${esc(v.fu||'')}</td><td><button class="btn danger" data-dv="${i}">Borrar</button></td></tr>`).join('')||'<tr><td colspan="5" class="mut">Sin valoraciones.</td></tr>'}
    </tbody></table></div>
    <p style="margin-top:18px"><button class="btn danger" id="delp">Borrar esta inversión</button></p>
  </div>`;
  dlg.showModal();
  dlg.querySelector('.x').onclick=()=>dlg.close();
  dlg.onclick=e=>{ if(e.target===dlg) dlg.close() };
  $('#fedit',dlg).onsubmit=async e=>{e.preventDefault(); const f=new FormData(e.target); p.costePct=f.get('coste')===''?null:+f.get('coste'); const est=f.get('estado'); if(est==='cerrado'&&p.estado!=='cerrado'){p.cierre=today()} p.estado=est;
    p.periodica = f.get('pimp')? {importe:+f.get('pimp'),frecuencia:f.get('pfreq'),hasta:p.periodica?.hasta||today()} : null; await persist('p',p); render(); openProduct(id); toast('Cambios guardados')};
  dlg.querySelectorAll('[data-dm]').forEach(b=>b.onclick=async()=>{ if(!confirm('¿Borrar este movimiento?'))return; p.movs.splice(+b.dataset.dm,1); await persist('p',p); render(); openProduct(id) });
  dlg.querySelectorAll('[data-dv]').forEach(b=>b.onclick=async()=>{ if(!confirm('¿Borrar esta valoración?'))return; p.vals.splice(+b.dataset.dv,1); await persist('p',p); render(); openProduct(id) });
  $('#delp',dlg).onclick=async()=>{ if(!confirm(`¿Borrar ${p.nombre} y todo su historial?`))return; delete S.prod[id]; await remove('p',id); dlg.close(); render(); toast('Inversión borrada') };
}

/* ---------- datos: excel ---------- */
function renderDatos(){
  const el=$('#datos');
  el.innerHTML=`<h1>Datos</h1><p class="lede">Tus datos viven en un Excel de tu OneDrive (carpeta Aplicaciones). Cada cambio se guarda allí al momento.</p>
  <div class="grid g2"><div class="panel"><h2>Sincronización</h2><dl class="dl" style="margin-bottom:14px"><dt>Cuenta</dt><dd id="who2">${esc(ACCOUNT?.username||'—')}</dd><dt>Archivo</dt><dd>${esc(CFG.fileName||'patrimonio.xlsx')}</dd><dt>Última sincronización</dt><dd>${lastSync?lastSync.toLocaleString('es-ES'):'—'}</dd></dl>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="reload">Recargar desde OneDrive</button><button class="btn ghost" id="exp">Descargar copia</button><button class="btn ghost" id="out">Cerrar sesión</button></div></div>
  <div class="panel"><h2>Importar un Excel</h2><p class="hint" style="margin-bottom:14px">Sustituye todo por el contenido del archivo y lo guarda en OneDrive. Úsalo la primera vez con patrimonio_datos_iniciales.xlsx.</p><label class="btn ghost" style="display:inline-block;cursor:pointer">Elegir archivo<input type="file" id="imp" accept=".xlsx" hidden></label><p class="hint" id="impmsg" style="margin-top:8px"></p></div></div>
  <div class="panel" style="margin-top:16px"><h2>Ajustes</h2><form id="fcfg"><div class="row"><label>Inflación de referencia (%)<input type="number" step="0.1" name="ipc" value="${S.cfg.ipc}"></label><label>Avisos (uno por línea)<textarea name="avisos" rows="5" style="border:1px solid var(--line);border-radius:8px;padding:9px;background:var(--surface);color:var(--ink);font:inherit">${esc((S.cfg.avisos||[]).join('\n'))}</textarea></label></div><button class="btn ghost">Guardar ajustes</button></form></div>`;
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
/* ---------- nav ---------- */
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected',x===b));
  document.querySelectorAll('main section').forEach(s=>s.hidden=s.id!==b.dataset.tab);
  if (b.dataset.tab==='historico') renderHist();
  window.scrollTo(0,0);
});
document.getElementById('loginbtn').onclick=()=>login();
const _cl=document.getElementById('clearlog'); if(_cl) _cl.onclick=()=>{ try{localStorage.removeItem('pat_log');localStorage.removeItem('pat_loop')}catch(e){} document.getElementById('gatelog').textContent='' };
render(); load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
