

// ==================== ABA ANDON — PRODUÇÃO HORA A HORA (v4 — formato aprovado por Dante 11/10) ====================
// Células CONFIGURÁVEIS: nome editável (ID fixo preserva o histórico), operadores, postos,
// janela de abertura (ex.: 4h — 13:00-17:00), meta do dia. Produtos simultâneos por célula:
// 1 linha de meta/h por produto (ex.: solda 5 bancadas — 2 produtos). Regimes: WARD (sem PV →
// entrada no SMKT) e PV (com PV → debita a carteira). Salvamento constante (auto-save +
// servidor). Aprendizado: cada hora lançada alimenta o baseline (célula × produto × operadores)
// e o app SUGERE metas — a PCP aprova. Poka-yoke: hora abaixo da meta pede motivo (não bloqueia).
const HH_API = 'https://painel-entregas-semanais-708f0.shrd00.internal.goskip.dev';
let hhApont = [];      // {data, hora, linha, cod, qtd, ward, ts, obs}
let hhApontAudit = []; // trilha imutável de correções/cancelamentos
let hhLinhasCfg = [];  // {id, nome, pessoas, postos, hIni, hFim, meta} — ID fixo, nome editável
let hhCfgData = '';    // data da config carregada
let hhProdCfg = [];    // {linha, cod, ward, metaH} — meta/hora por produto dentro da célula
let hhParadas = [];    // {data, linha, horaIni, horaFim, motivo, obs}
let hhChart = null;
let hhRevLocal = 0;
let hhLinhaSel = '';   // dashboard individual (vazio = todas)
let hhCfgPorDia = {};  // {iso: {linhas:[], produtos:[]}} — config de células/produtos POR DIA
let hhDiaSel = '';     // dia selecionado na Programação (ISO)
let hhSemSelIso = '';  // segunda da semana selecionada (ISO)
function hhHojeIso(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function hhDiaSelIso(){ return hhDiaSel||hhHojeIso(); }
function hhDataClock(iso,now){
 const d=now||new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),minute=d.getHours()*60+d.getMinutes();
 if(String(iso)>today)return {mode:'future',planMinute:0,actualMinute:1440,hour:-1,minute:minute};
 if(String(iso)<today)return {mode:'closed',planMinute:1440,actualMinute:1440,hour:24,minute:minute};
 return {mode:'today',planMinute:minute,actualMinute:minute,hour:d.getHours(),minute:minute};
}
function hhMonitorTimeline(c,iso,now){
 const d=now||new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),minute=d.getHours()*60+d.getMinutes(),start=hhScheduleStart(c),end=hhScheduleEnd(c);
 if(String(iso)>today)return {mode:'future',iso:iso,start:start,end:end,planMinute:start,actualMinute:1440,nowMinute:minute};
 if(String(iso)<today)return {mode:'closed',iso:iso,start:start,end:end,planMinute:end,actualMinute:1440,nowMinute:minute};
 if(minute<start)return {mode:'before',iso:iso,start:start,end:end,planMinute:start,actualMinute:minute,nowMinute:minute};
 if(minute>=end)return {mode:'closed',iso:iso,start:start,end:end,planMinute:end,actualMinute:1440,nowMinute:minute};
 const done=hhWorkIntervals(c).filter(function(x){return x.end<=minute;}),cut=done.length?done[done.length-1].end:start;
 return {mode:hhWorkMinutes(c,minute,minute+1)>0?'active':'break',iso:iso,start:start,end:end,planMinute:minute,actualMinute:minute,nowMinute:minute};
}
function hhApontAtivo(a){return !!a&&!a.excluido;}
function hhApontValidos(){return hhApont.filter(hhApontAtivo);}
function hhApontJaOcorreu(a,cut){const lim=Number(cut)||0;if(a&&a.inicioMin!==undefined&&a.inicioMin!==null)return Number(a.inicioMin)<lim;return (Number(a&&a.hora)+1)*60<=lim;}
function hhGarantirIds(){hhApont.forEach(function(a,i){if(!a._hhId)a._hhId='hh-'+String(a.ts||a.data+'-'+a.linha+'-'+a.cod+'-'+a.hora).replace(/[^a-zA-Z0-9_-]/g,'')+'-'+i;});}
function hhApontAuditAdd(acao,antes,depois,motivo){hhApontAudit.push({id:'audit-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),apontamentoId:(depois||antes||{})._hhId||'',acao:acao,antes:antes?JSON.parse(JSON.stringify(antes)):null,depois:depois?JSON.parse(JSON.stringify(depois)):null,motivo:String(motivo||'').trim(),autor:hhQuem(),em:new Date().toISOString()});}
function hhSegundaDe(iso){ const d=new Date(iso+'T12:00:00'); const dw=(d.getDay()+6)%7; const s=new Date(d); s.setDate(s.getDate()-dw); return s.getFullYear()+'-'+String(s.getMonth()+1).padStart(2,'0')+'-'+String(s.getDate()).padStart(2,'0'); }
function hhSemanasDoAno(){ const hj=new Date(),ano=hj.getFullYear(); const seg1=new Date(ano,0,1); seg1.setDate(seg1.getDate()-((seg1.getDay()+6)%7)); const out=[]; for(let i=0;i<53;i++){ const d=new Date(seg1); d.setDate(d.getDate()+i*7); if(d.getFullYear()>ano)break; out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')); } return out; }
function hhSemLabel(si){ const p=si.split('-'); const d0=new Date(Number(p[0]),Number(p[1])-1,Number(p[2])); const fim=new Date(d0); fim.setDate(fim.getDate()+4); const t=new Date(d0); t.setDate(t.getDate()+3); const j4=new Date(t.getFullYear(),0,4); const n=1+Math.round(((t-j4)/86400000-3+((j4.getDay()+6)%7))/7); return 'S'+n+' · '+p[2]+'/'+p[1]+' – '+String(fim.getDate()).padStart(2,'0')+'/'+String(fim.getMonth()+1).padStart(2,'0'); }
function hhAdmin(){
  if(document.body.classList.contains('viewerMode')) return false;
  try{
    const u=JSON.parse(localStorage.getItem('andon|user')||'null'),t=localStorage.getItem('andon|token')||'';
    const sync=window.ANDON_SYNC,session=!!t && !!sync && typeof sync.connected==='function' && sync.connected();
    return session && !!u && (u.role==='admin' || !u.role);
  }catch(e){ return false; }
}
function hhDescDe(cod){ try{ return (typeof descDe==='function') ? descDe(cod) : cod; }catch(e){ return cod; } }
// ── Jornada HH:MM; horários numéricos antigos continuam legíveis ──
function hhTimeMin(value,fallback){
  if(value===null||value===undefined||value==='')return fallback===undefined?null:fallback;
  if(typeof value==='number'&&isFinite(value))return value>=0&&value<=24?Math.round(value*60):null;
  const s=String(value).trim(),m=s.match(/^(\d{1,2}):(\d{2})$/);
  if(m){const h=Number(m[1]),mi=Number(m[2]);return h<=24&&mi<60&&(h<24||mi===0)?h*60+mi:null;}
  if(/^\d+(?:\.\d+)?$/.test(s)){const h=Number(s);return h>=0&&h<=24?Math.round(h*60):null;}
  return fallback===undefined?null:fallback;
}
function hhTimeTxt(value,fallback){const n=hhTimeMin(value,fallback);if(n===null||!isFinite(n))return '';const z=Math.max(0,Math.min(1440,Math.round(n)));return String(Math.floor(z/60)).padStart(2,'0')+':'+String(z%60).padStart(2,'0');}
function hhClockTxt(mins){if(mins===null||!isFinite(mins))return '';const z=Math.max(0,Math.min(1440,Math.round(mins)));return String(Math.floor(z/60)).padStart(2,'0')+':'+String(z%60).padStart(2,'0');}
function hhCfg(l){const c=hhCfgAtivo(hhDiaSelIso());return (c.linhas.find(function(x){return x.id===l;})||null);}
function hhNome(l){const c=hhCfg(l);return c?c.nome:l;}
function hhScheduleStart(c){return hhTimeMin(c&&c.hIni,c&&String(c.janela)==='4'?780:420);}
function hhScheduleEnd(c){return hhTimeMin(c&&c.hFim,c&&String(c.janela)==='4'?1020:(c&&String(c.janela)==='8'?900:1080));}
function hhJanelaPreset(c){const a=hhScheduleStart(c),b=hhScheduleEnd(c),m=hhMeal(c);if(a===450&&b===1020&&m&&!m.invalid&&m.start===720&&m.end===780)return 'c';return a===420&&b===1080?'11':a===420&&b===900?'8':a===780&&b===1020?'4':'custom';}
function hhMeal(c){if(!c)return null;const ri=c.almocoIni===undefined?'':String(c.almocoIni||'').trim(),rf=c.almocoFim===undefined?'':String(c.almocoFim||'').trim();if(!ri&&!rf)return null;const a=hhTimeMin(c.almocoIni,null),b=hhTimeMin(c.almocoFim,null),s=hhScheduleStart(c),e=hhScheduleEnd(c);return a!==null&&b!==null&&b>a&&a>=s&&b<=e?{start:a,end:b}:{invalid:true};}
function hhWorkSegments(c){if(!c)return [];const start=hhScheduleStart(c),end=hhScheduleEnd(c);if(start===null||end===null||start<0||end>1440||end<=start)return [];const meal=hhMeal(c);if(meal&&meal.invalid)return [{start:start,end:end}];if(meal)return [{start:start,end:meal.start},{start:meal.end,end:end}].filter(function(x){return x.end>x.start;});return [{start:start,end:end}];}
function hhShiftMinutes(c){return hhWorkSegments(c).reduce(function(n,x){return n+x.end-x.start;},0);}
function hhWorkMinutes(c,from,to){return hhWorkSegments(c).reduce(function(n,x){return n+Math.max(0,Math.min(x.end,to)-Math.max(x.start,from));},0);}
function hhWorkIntervals(c){const out=[],fin=c?hhFinalDe(c.id):'';hhWorkSegments(c).forEach(function(seg){let cur=seg.start;while(cur<seg.end){const next=Math.min(seg.end,(Math.floor(cur/60)+1)*60);out.push({start:cur,end:next,hour:Math.floor(cur/60),minutes:next-cur,key:String(cur)+'-'+String(next),label:hhClockTxt(cur)+'–'+hhClockTxt(next),fase:!!fin,final:!!fin});cur=next;}});(c&&c.blocos||[]).forEach(function(b,i){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);if(a===null||z===null||z<=a)return;out.push({start:a,end:z,hour:Math.floor(a/60),minutes:z-a,key:'bloco-'+i+'-'+a+'-'+z,label:(b.cod?escH(b.cod)+' · ':'')+'BLOCO '+hhClockTxt(a)+'–'+hhClockTxt(z),fase:!!fin,final:!!fin,bloco:true,blocoMeta:Number(b.meta)||0,blocoCod:b.cod||''});});out.sort(function(x,y){return x.start-y.start;});return out;}
function hhIntervalFor(l,key){const c=hhCfg(l);return c?hhWorkIntervals(c).find(function(x){return x.key===String(key);})||null:null;}
function hhMinutesToClockHour(c,h){return hhWorkMinutes(c,Number(h)*60,(Number(h)+1)*60);}
function hhHoursForConfig(c){const out=[];hhWorkSegments(c).forEach(function(seg){for(let h=Math.floor(seg.start/60);h<=Math.floor((seg.end-1)/60);h++){if(out.indexOf(h)<0)out.push(h);}});return out.sort(function(a,b){return a-b;});}
function hhHorasCelula(l){return hhHoursForConfig(hhCfg(l));}
function hhFinaisDaCelula(l){return hhProdCfg.filter(function(x){return x.linha===l&&x.cod&&x.final===true;});}
function hhMetaLinha(l){const c=hhCfg(l),fin=hhFinalDe(l),p=hhProdCfg.filter(function(x){return x.linha===l&&x.cod;});const bl=(c&&c.blocos||[]).filter(function(b){return hhTimeMin(b.ini,null)!==null&&hhTimeMin(b.fim,null)!==null&&hhTimeMin(b.fim,null)>hhTimeMin(b.ini,null);});if(bl.length)return bl.reduce(function(n,b){return n+(Number(b.meta)||0);},0);if(c&&p.length){const fins=hhFinaisDaCelula(l);if(fins.length){const qt=fins.reduce(function(n,x){return n+hhQtdDiaDe(x);},0);if(qt>0)return Math.round(qt);const mhTot=fins.reduce(function(n,x){return n+(Number(x.metaH)||0);},0);if(mhTot>0)return Math.round(mhTot*hhShiftMinutes(c)/60);return Math.round(Number(c.meta)||0);}const allPhase=p.every(function(x){const fr=hhFinalRowDe(x.cod);return fr&&fr.linha!==l;});if(allPhase)return 0;const qtAll=p.reduce(function(n,x){return n+(Number(x.qtdDia)||0);},0);if(qtAll>0)return Math.round(qtAll);return Math.round((Number(c.meta)||0));}if(c&&p.every(function(x){const fr=hhFinalRowDe(x.cod);return fr&&fr.linha!==l;})&&p.length)return 0;return c?(Number(c.meta)||0):0;}
function hhPessoasLinha(l){const c=hhCfg(l);return c?(Number(c.pessoas)||0):0;}
// ── regime do produto: WARD se cadastrado como WARD OU se o produto não tem saldo com PV ──
function hhEhFrete(cod, desc){
  const c = String(cod||'').trim();
  if(c === '00043') return true;
  if(/^50[1-6]-/.test(c)) return true;
  const d = String(desc||'').toLowerCase();
  if(/frete|caminh|vuc|carreta|toco.truck|truck/.test(d) && !/carrinh|cart|carro/.test(d)) return true;
  return false;
}
function hhWardDe(cod, linha){
  const pc = hhProdCfg.find(function(p){ return String(p.cod)===String(cod) && (!linha || p.linha===linha); });
  if(pc) return !!pc.ward;
  try{ if(typeof smktSaldo==='function' && smktSaldo(cod)>0) return true; }catch(e){}
  return false;
}
function hhMetaHoraL(l,h){const c=hhCfg(l);const temBlocos=c&&(c.blocos||[]).some(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&z>a;});const bl=(c&&c.blocos||[]).filter(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&h*60>=a&&h*60<z;});if(bl.length)return bl.reduce(function(n,b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return n+(Number(b.meta)||0)*Math.min(60,z-h*60)/Math.max(1,(z-a));},0);if(temBlocos)return 0;const mins=hhMinutesToClockHour(c,h);if(mins<=0)return 0;const fins=hhFinaisDaCelula(l).filter(function(x){return Number(x.metaH)>0;});if(fins.length)return fins.reduce(function(n,x){return n+(Number(x.metaH)||0);},0)*mins/60;const p=hhProdCfg.filter(function(x){return x.linha===l&&x.cod&&hhProdNaHora(x,h);});if(p.length)return p.reduce(function(n,x){return n+hhMetaHEf(x,c);},0)*mins/60;const total=hhShiftMinutes(c);return total>0?(Number(c.meta)||0)*mins/total:0;}
function hhMetaHora(l){const c=hhCfg(l),total=hhShiftMinutes(c);const meta=hhMetaLinha(l);return total>0?(meta/(total/60)):0;}
function hhFmtHora(v){v=Number(v)||0;if(!v)return '';const r=Math.round(v);if(Math.abs(v-r)<0.05||r>=10)return NF.format(r);return String(Math.round(v*10)/10).replace('.',',');}
// ── Qtd por produto + janela de horário (Dante 14/10: a célula divide o dia entre produtos; sem janela = produção decide) ──
function hhProdJanelaMin(p){const a=hhTimeMin(p&&p.hIni,null),b=hhTimeMin(p&&p.hFim,null);return (a!==null&&b!==null&&b>a)?{start:a,end:b}:null;}
function hhProdHorasUteis(p,c){if(!c)return 0;const j=hhProdJanelaMin(p);if(!j)return hhShiftMinutes(c)/60;return hhWorkMinutes(c,j.start,j.end)/60;}
function hhQtdDiaDe(p){ if(!p) return 0; const q=Number(p.qtdDia)||0; if(q>0) return q; const c=hhCfg(p.linha); if(!c) return 0; const unicos=hhProdCfg.filter(function(x){return x.linha===p.linha&&x.cod;}); if(unicos.length===1) return Number(c.meta)||0; return 0; }
function hhMetaHEf(p,c){const mh=Number(p&&p.metaH)||0;if(mh>0)return mh;const q=hhQtdDiaDe(p);if(q<=0||!c)return 0;const hrs=hhProdHorasUteis(p,c);return hrs>0?Math.round(q/hrs*10)/10:0;}
function hhProdNaHora(p,h){const j=hhProdJanelaMin(p);if(!j)return true;return h*60<j.end&&((h+1)*60>j.start);}
function hhProdNoSlot(p,slot){const j=hhProdJanelaMin(p);if(!j||!slot)return true;return slot.start<j.end&&slot.end>j.start;}
function hhMetaElapsed(c,minuteOfDay){const m=Number(minuteOfDay)||0;const bl=(c&&c.blocos||[]).filter(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&z>a;}).sort(function(x,y){return hhTimeMin(x.ini,0)-hhTimeMin(y.ini,0);});if(bl.length){let acc=0;bl.forEach(function(b){const a=hhTimeMin(b.ini,0),z=hhTimeMin(b.fim,0);if(m>=z)acc+=Number(b.meta)||0;else if(m>a&&Number(b.meta)>0)acc+=(Number(b.meta)||0)*(m-a)/(z-a);});return acc;}const worked=hhWorkMinutes(c,0,m),total=hhShiftMinutes(c);if(total<=0)return 0;const fin=hhFinalDe(c.id),p=hhProdCfg.filter(function(x){return x.linha===c.id&&x.cod;});if(p.length){const fins=hhFinaisDaCelula(c.id);if(fins.length){const qt=fins.reduce(function(n,x){return n+(Number(x.qtdDia)||0);},0);if(qt>0){const mhTot=fins.reduce(function(n,x){return n+hhMetaHEf(x,c);},0);return mhTot>0?mhTot*worked/60:qt*worked/total;}const mhTot2=fins.reduce(function(n,x){return n+(Number(x.metaH)||0);},0);return mhTot2>0?mhTot2*worked/60:(Number(c.meta)||0)*worked/total;}const allPhase=p.every(function(x){const fr=hhFinalRowDe(x.cod);return fr&&fr.linha!==c.id;});if(allPhase)return 0;const qtAll=p.reduce(function(n,x){return n+(Number(x.qtdDia)||0);},0);if(qtAll>0){const mhAll=p.reduce(function(n,x){return n+hhMetaHEf(x,c);},0);return mhAll>0?mhAll*worked/60:qtAll*worked/total;}return (Number(c.meta)||0)*worked/total;}if(c&&hhProdCfg.filter(function(x){return x.linha===c.id&&x.cod;}).every(function(x){const fr=hhFinalRowDe(x.cod);return fr&&fr.linha!==c.id;})&&hhProdCfg.some(function(x){return x.linha===c.id&&x.cod;}))return 0;return (Number(c.meta)||0)*worked/total;}
function hhMetaInterval(l,slot,cod){if(!slot)return 0;if(slot.bloco)return Number(slot.blocoMeta)||0;const c=hhCfg(l);if(c&&(c.blocos||[]).some(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&z>a;}))return 0;if(cod){const pr=hhProdCfg.find(function(x){return x.linha===l&&String(x.cod)===String(cod)&&hhProdNoSlot(x,slot);});if(pr)return (hhMetaHEf(pr,c)||Number(pr.metaH)||0)*slot.minutes/60;}const p=hhProdCfg.filter(function(x){return x.linha===l&&x.cod&&hhProdNoSlot(x,slot);});if(p.length)return p.reduce(function(n,x){return n+(hhMetaHEf(x,c)||0);},0)*slot.minutes/60;const total=hhShiftMinutes(c);return total>0?hhMetaPosto(l)*slot.minutes/total:0;}
function hhProdLinhaSlot(l,iso,slot){let q=0,itens={},regimes={},legacy=0,qf=0,itensF={},regimesF={},legacyF=0;if(!slot)return {qtd:0,itens:itens,regimes:regimes,legacy:0,qtdFinal:0,itensFinal:itensF,regimesFinal:regimesF,fase:false,final:false};const fin=hhFinalDe(l);const slots=hhWorkIntervals(hhCfg(l)).filter(function(x){return x.hour===slot.hour;}),first=slots.length?slots[0].key:'';hhApontValidos().forEach(function(a){if(a.linha!==l||a.data!==iso)return;if(a.bloco){if(!slot.bloco||String(a.intervalo)!==String(slot.key))return;}else if(slot.bloco)return;else if(a.intervalo){if(String(a.intervalo)!==slot.key)return;}else if(Number(a.hora)===slot.hour){if(first!==slot.key){legacy+=Number(a.qtd)||0;if(fin&&String(a.cod)===fin)legacyF+=Number(a.qtd)||0;return;}}else return;const z=Number(a.qtd)||0,k=a.cod||'—';q+=z;itens[k]=(itens[k]||0)+z;const w=a.ward===true||(a.ward==null&&hhWardDe(k,l)),rk=(w?'WARD':'PV')+'|'+k;regimes[rk]=(regimes[rk]||0)+z;if(fin&&k===fin){qf+=z;itensF[k]=(itensF[k]||0)+z;regimesF[rk]=(regimesF[rk]||0)+z;}});return {qtd:q,itens:itens,regimes:regimes,legacy:legacy,qtdAll:q+legacy,qtdFinal:fin?qf+legacyF:q+legacy,itensFinal:itensF,regimesFinal:regimesF,fase:!!fin,final:!!fin};}
function hhProdClockHour(l,iso,h){const fin=hhFinalDe(l);let q=0,itens={},regimes={};hhApontValidos().forEach(function(a){if(a.linha!==l||a.data!==iso||Number(a.hora)!==h)return;if(fin&&String(a.cod)!==fin)return;if(!fin&&hhApFase(a))return;const z=Number(a.qtd)||0,k=a.cod||'—';q+=z;itens[k]=(itens[k]||0)+z;const w=a.ward===true||(a.ward==null&&hhWardDe(k,l)),rk=(w?'WARD':'PV')+'|'+k;regimes[rk]=(regimes[rk]||0)+z;});return {qtd:q,itens:itens,regimes:regimes};}
function hhStopMin(v){return hhTimeMin(v,null);}
function hhStopDuration(p){const a=hhStopMin(p.horaIni),b=hhStopMin(p.horaFim);return a!==null&&b!==null?Math.max(0,b-a):0;}
function hhStopOverlapsHour(p,h){const a=hhStopMin(p.horaIni),b=hhStopMin(p.horaFim);return a!==null&&b!==null&&a<(h+1)*60&&b>h*60;}
// ── produção real ──
function hhProdLinhaHora(l, iso, hora){
  let q=0, itens={}, regimes={};
  hhApontValidos().forEach(function(a){ if(a.linha===l && a.data===iso && Number(a.hora)===hora){ const aq=Number(a.qtd)||0, k=a.cod||'—'; q+=aq; itens[k]=(itens[k]||0)+aq; const w=(a.ward===true || (a.ward==null && hhWardDe(k,l))); const rk=(w?'WARD':'PV')+'|'+k; regimes[rk]=(regimes[rk]||0)+aq; } });
  return {qtd:q, itens:itens, regimes:regimes};
}
function hhProdLinhaAcum(l,iso,untilMinute){let q=0;const cutoff=Math.max(0,Number(untilMinute)||0),fin=hhFinalDe(l);hhApontValidos().forEach(function(a){if(a.linha!==l||a.data!==iso)return;if(fin&&String(a.cod)!==fin)return;if(!fin&&hhApFase(a))return;if(hhApontJaOcorreu(a,cutoff))q+=Number(a.qtd)||0;});return q;}
function hhParadasLinha(l, iso){
  return hhParadas.filter(function(p){ return p.linha===l && p.data===iso; });
}
// ── persistência (coleção andon_hh — snapshot completo, último vence; rev evita sobrescrever) ──
function hhSnapshot(){
  return {config:{data:hhCfgData, linhas:hhLinhasCfg, produtos:hhProdCfg}, configPorDia:hhCfgPorDia, apontamentos:hhApont, apontamentosAudit:hhApontAudit, paradas:hhParadas, rev:Date.now()};
}
function hhSave(motivo){
  if(!hhAdmin()){ hhAccessSet(); return false; }
  try{ hhGarantirIds(); localStorage.setItem('hh|apont', JSON.stringify(hhApont)); localStorage.setItem('hh|apont-audit', JSON.stringify(hhApontAudit)); localStorage.setItem('hh|cfg', JSON.stringify({data:hhCfgData, linhas:hhLinhasCfg, produtos:hhProdCfg})); localStorage.setItem('hh|cfgdia', JSON.stringify(hhCfgPorDia)); localStorage.setItem('hh|paradas', JSON.stringify(hhParadas)); }catch(e){}
  hhRevLocal=Date.now();
  const snapStr=JSON.stringify(hhSnapshot());
  if(snapStr===window._hhLastPost){ if(document.getElementById('hhMsg'))hhFlash('✔ Salvo local (sem mudanças)'); return false; }
  window._hhLastPost=snapStr;
  if(window.ANDON_SYNC && window.ANDON_SYNC.connected() && hhAdmin()){
    try{
      fetch(HH_API+'/api/collections/andon_hh/records', {
        method:'POST',
        headers:{'Authorization':window.ANDON_SYNC.token, 'Content-Type':'application/json'},
        body: JSON.stringify({event_type:'system', occurred_at:new Date().toISOString(), reason:motivo||'Andon produção — atualização', source:'andon-hh', changes:hhSnapshot()})
      }).then(function(r){ if(r.status===400||r.status===401||r.status===403){ window.ANDON_SYNC._authFail(); } return r.ok?r.json():null; }).then(function(rr){
        if(rr && document.getElementById('hhMsg')) hhFlash('✔ Salvo no servidor');
      }).catch(function(){ if(document.getElementById('hhMsg')) hhFlash('⚠ Salvo localmente (servidor indisponível)'); });
    }catch(e){}
  } else if(document.getElementById('hhMsg')){ hhFlash('✔ Salvo local — conecte no 🔗 para sincronizar'); }
}
function hhFlash(t){ const m=document.getElementById('hhMsg'); if(!m) return; m.textContent=t; m.style.display=''; setTimeout(function(){ m.style.display='none'; }, 3500); }
// v0.0.412: erro do apontamento visível JUNTO ao botão (não some em 3,5s no topo da página)
function hhEntryErr(t){ const e=document.getElementById('hhEntryErr'); if(!e) return; if(t){ e.textContent=t; e.style.display='block'; } else { e.style.display='none'; } }
function hhAccessSet(){
  const canEdit=hhAdmin(), hint=document.getElementById('hhAdminHint');
  document.body.classList.toggle('hhReadOnly',!canEdit);
  if(hint){ hint.textContent=canEdit?'Modo edição · sessão admin':'Modo leitura · entre com usuário admin para editar'; hint.setAttribute('aria-live','polite'); }
  const selector='#hhCfgTbl input,#hhCfgTbl select,#hhProdTbl input,#hhProdTbl select,#hhSelProd,#hhOutIni,#hhOutFim,#hhMotivo,#hhParLinha,#hhParIni,#hhParFim,#hhParMotivo,#hhParObs,#hhQtd,.hhQtyControl button,#hhPoka input,#hhPoka select,#hhPoka button';
  document.querySelectorAll(selector).forEach(function(el){
    if(!canEdit){ if(!el.hasAttribute('data-hh-prev-disabled')) el.setAttribute('data-hh-prev-disabled',el.disabled?'1':'0'); el.disabled=true; el.setAttribute('aria-disabled','true'); }
    else if(el.hasAttribute('data-hh-prev-disabled')){ el.disabled=el.getAttribute('data-hh-prev-disabled')==='1'; el.removeAttribute('data-hh-prev-disabled'); el.removeAttribute('aria-disabled'); }
  });
  if(window._hhConnPaint) try{ window._hhConnPaint(); }catch(e){}
}
window.hhAccessSet=hhAccessSet;
function hhLoad(){
  try{ const l=JSON.parse(localStorage.getItem('hh|apont')||'[]'); if(Array.isArray(l)) hhApont=l; }catch(e){}
  try{ const au=JSON.parse(localStorage.getItem('hh|apont-audit')||'[]'); if(Array.isArray(au)) hhApontAudit=au; }catch(e){}
  try{ const c=JSON.parse(localStorage.getItem('hh|cfg')||'null'); if(c&&Array.isArray(c.linhas)){ hhLinhasCfg=c.linhas; hhCfgData=c.data||''; hhProdCfg=Array.isArray(c.produtos)?c.produtos:[]; hhTipoNorm(); } }catch(e){}
  try{ const p=JSON.parse(localStorage.getItem('hh|paradas')||'[]'); if(Array.isArray(p)) hhParadas=p; }catch(e){}
  if(!hhCfgData){ hhCfgData=hhHojeIso(); }
  try{ const cd=JSON.parse(localStorage.getItem('hh|cfgdia')||'{}'); if(cd&&typeof cd==='object'){ hhCfgPorDia=cd; } }catch(e){}
  hhTipoNorm();
  hhGarantirIds();
  if(window._hhRevInit!==true){ window._hhRevInit=true; try{ const c0=JSON.parse(localStorage.getItem('hh|cfg')||'null'); if(!c0) hhRevLocal=0; }catch(e){ hhRevLocal=0; } }
  fetch(HH_API+'/api/collections/andon_hh/records?sort=-created&perPage=1').then(function(r){ return r.ok?r.json():null; }).then(function(d){
    if(!d || !d.items || !d.items.length) return;
    const ch=d.items[0].changes||{};
    const srvRev=Number(ch.rev||0);
    if(srvRev>hhRevLocal){
      if(Array.isArray(ch.apontamentos)) hhApont=ch.apontamentos;
      if(Array.isArray(ch.apontamentosAudit)) hhApontAudit=ch.apontamentosAudit;
      if(ch.config && Array.isArray(ch.config.linhas)){ hhLinhasCfg=ch.config.linhas; hhCfgData=ch.config.data||''; hhProdCfg=Array.isArray(ch.config.produtos)?ch.config.produtos:[]; hhTipoNorm(); }
      if(ch.configPorDia && typeof ch.configPorDia==='object'){ hhCfgPorDia=ch.configPorDia; try{localStorage.setItem('hh|cfgdia',JSON.stringify(hhCfgPorDia));}catch(e){} }
      if(Array.isArray(ch.paradas)) hhParadas=ch.paradas;
      hhRevLocal=srvRev;
      try{ localStorage.setItem('hh|apont', JSON.stringify(hhApont)); }catch(e){}
    }
    hhRender();
  }).catch(function(){});
}
// ── cadastro de produtos meta/h por célula ──
function hhFinalDe(l){const f=hhProdCfg.find(function(p){return p.linha===l&&p.final===true;});return f?String(f.cod):'';}
function hhTipoNorm(){hhProdCfg.forEach(function(p,i){if(p.etapa===undefined){ if(p.tipo==='final'||p.final===true)p.etapa=0; else if(p.tipo==='sub')p.etapa=1; else p.etapa=2+i; } p.final=(p.etapa===0); p.tipo=(p.etapa===0?'final':(p.etapa===1?'sub':'fase')); // migração: qtd digitada no campo antigo (v0.0.396) → qtdDia
if(!Number(p.qtdDia)&&Number(p.qtd)>0)p.qtdDia=Number(p.qtd);});}
function hhTipoDe(cod){const p=hhProdCfg.find(function(x){return String(x.cod)===String(cod);});return p?(p.tipo||(p.final===true?'final':'fase')):'fase';}
function hhFinalRowDe(cod){return hhProdCfg.find(function(p){return p.final===true&&String(p.cod)===String(cod);})||null;}
function hhApFase(a){ if(a.fase===true) return true; const fr=hhFinalRowDe(a.cod); if(!fr) return false; return !(a.linha===fr.linha&&String(a.cod)===String(fr.cod)); }
function hhTotFinal(iso,untilMin){let q=0;const cut=Math.max(0,Number(untilMin)||0);hhApontValidos().forEach(function(a){if(a.data!==iso)return;if(!hhApontJaOcorreu(a,cut))return;if(hhApFase(a))return;q+=Number(a.qtd)||0;});return q;}
function hhProdFinalAcum(l,iso,untilMin){const fin=hhFinalDe(l);if(!fin)return 0;let q=0;const cut=Math.max(0,Number(untilMin)||0);hhApontValidos().forEach(function(a){if(a.linha!==l||a.data!==iso||String(a.cod)!==fin||hhApFase(a))return;if(!hhApontJaOcorreu(a,cut))return;q+=Number(a.qtd)||0;});return q;}
function hhMetaPosto(l){const c=hhCfg(l),p=hhProdCfg.filter(function(x){return x.linha===l&&x.cod;});if(c&&p.length)return p.reduce(function(n,x){return n+Math.round((hhMetaHEf(x,c)||0)*hhProdHorasUteis(x,c));},0);return c?(Number(c.meta)||0):0;}
function hhMetaElapsedPosto(c,minuteOfDay){const m=Number(minuteOfDay)||0;const bl=(c&&c.blocos||[]).filter(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&z>a;}).sort(function(x,y){return hhTimeMin(x.ini,0)-hhTimeMin(y.ini,0);});if(bl.length){let acc=0;bl.forEach(function(b){const a=hhTimeMin(b.ini,0),z=hhTimeMin(b.fim,0);if(m>=z)acc+=Number(b.meta)||0;else if(m>a&&Number(b.meta)>0)acc+=(Number(b.meta)||0)*(m-a)/(z-a);});return acc;}const worked=hhWorkMinutes(c,0,m),total=hhShiftMinutes(c);if(total<=0)return 0;const p=hhProdCfg.filter(function(x){return x.linha===c.id&&x.cod;});if(p.length){const qtAll=p.reduce(function(n,x){return n+(Number(x.qtdDia)||0);},0);if(qtAll>0){const mhAll=p.reduce(function(n,x){return n+hhMetaHEf(x,c);},0);return mhAll>0?mhAll*worked/60:qtAll*worked/total;}}return (Number(c.meta)||0)*worked/total;}
function hhCfgAtivo(iso){ const k=String(iso||''); const d=hhCfgPorDia[k]; if(d&&Array.isArray(d.linhas)&&d.linhas.length) return {linhas:d.linhas, produtos:d.produtos||[]}; return {linhas:hhLinhasCfg, produtos:hhProdCfg}; }
function hhProdCfgAtivo(iso){ return hhCfgAtivo(iso).produtos; }
function hhCfgDataDe(iso){ const d=hhCfgPorDia[String(iso||'')]; return d?d.data:''; }
function hhCfgSaveDia(iso,firme){ hhCfgPorDia[String(iso||'')]={data:String(iso||''),linhas:hhLinhasCfg,produtos:hhProdCfg,firme:!!firme}; try{localStorage.setItem('hh|cfgdia',JSON.stringify(hhCfgPorDia));}catch(e){} }
function hhProdCfgSave(){try{localStorage.setItem('hh|cfg',JSON.stringify({data:hhCfgData,linhas:hhLinhasCfg,produtos:hhProdCfg}));}catch(e){}hhCfgSaveDia(hhCfgData||hhDiaSelIso(),hhFirmeDe(hhCfgData||hhDiaSelIso()));}
function hhProdRender(){
  const tb=document.getElementById('hhProdTb'); if(!tb) return;
  tb.innerHTML = hhProdCfg.map(function(p,i){
    const c = hhCfg(p.linha);
    const tipo=(Number(p.etapa)===0)?'final':(Number(p.etapa)===1?'sub':'fase');
    const nNaCelula=hhProdCfg.filter(function(x){return x.linha===p.linha&&x.cod;}).length;
    const multi=nNaCelula>=2;
    const autoHint='<div class="hhAutoHint">automático<br>(meta do dia ÷ horas)</div>';
    const etapa=Number(p.etapa)||0;
    const faseTag=etapa===0?' <span class="hhTagPV" title="Produto final — é a CONTAGEM do dia">🏁 final</span>':(etapa===1?' <span class="hhTagPV" style="background:#FEF3C7;color:#92400E" title="Subconjunto pronto — entra no estoque de subconjuntos; não soma no total do dia">sub</span>':(hhFinalDe(p.linha)?' <span style="font-size:11px;color:#64748B" title="Peça pronta / fase interna — não soma no total do dia">peça</span>':''));
    return '<tr data-pi="'+i+'">'+
      '<td><select data-p="linha" aria-label="Célula do produto">'+hhLinhasCfg.map(function(x){return '<option value="'+escH(x.id)+'"'+(p.linha===x.id?' selected':'')+'>'+escH(x.nome)+'</option>';}).join('')+'</select></td>'+
      '<td><input data-p="cod" value="'+escH(p.cod)+'" aria-label="Código do produto">'+faseTag+'</td>'+
      '<td><select data-p="ward" aria-label="Regime"><option value="pv"'+(!p.ward?' selected':'')+'>PV</option><option value="ward"'+(p.ward?' selected':'')+'>WARD</option></select></td>'+
      '<td><input data-p="pv" value="'+escH(p.pv||'')+'" placeholder="'+(p.ward?'Lote (sem PV)':'PV destino')+'" '+(p.ward?'disabled':'')+' aria-label="PV de destino"></td>'+
      '<td>'+(multi?'<input data-p="postos" type="number" min="0" step="1" value="'+(Number(p.postos)||0)+'" style="width:64px" aria-label="Postos neste produto" title="Postos ocupados por este produto — some e compare com a capacidade da célula">':'<input data-p="postos" type="number" min="0" step="1" value="'+(Number(p.postos)||0)+'" style="width:64px" aria-label="Postos neste produto" title="Postos ocupados por este produto — com 1 produto, a soma deve ser a capacidade da célula">')+'</td>'+
      '<td><input data-p="qtd" type="number" min="0" step="1" value="'+(Number(p.qtdDia)||0)+'" style="width:76px" placeholder="—" aria-label="Qtd do dia deste produto" title="Qtd a produzir deste produto no dia (ex.: 1500). A meta da célula vira a soma das qtds."></td>'+
      '<td>'+(multi?'<div class="hhTimePair"><label>De<input data-p="hIni" type="time" step="60" value="'+hhTimeTxt(p.hIni,null)+'" aria-label="Início da janela do produto"></label><label>Até<input data-p="hFim" type="time" step="60" value="'+hhTimeTxt(p.hFim,null)+'" aria-label="Fim da janela do produto"></label></div>':autoHint)+'</td>'+
      '<td>'+(multi?'<input data-p="metaH" type="number" min="0" step="0.5" value="'+(Number(p.metaH)||0)+'" style="width:76px" aria-label="Meta por hora">':autoHint)+'</td>'+
      '<td style="text-align:center"><select data-p="tipo" aria-label="Tipo de saída do produto nesta célula" title="Produto final = CONTAGEM do dia · Subconjunto pronto = entra no estoque de subconjuntos · Peça pronta / fase interna = não soma no total do dia">'+[0,1,2,3,4,5,6,7,8,9].map(function(n){const lbl=n===0?'0 · Produto final':(n===1?'1 · Subconjunto pronto':(n===2?'2 · Peça pronta':'2+'+n+' · Peça pronta (produto '+n+')'));return '<option value="'+n+'"'+(etapa===n?' selected':'')+'>'+lbl+'</option>';}).join('')+'</select>'+(etapa===0?'<div style="font-size:10px;color:#1D4ED8;font-weight:800">CONTAGEM</div>':'')+'</td>'+
      '<td style="text-align:center"><label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;color:#166534;cursor:pointer" title="Marca que a programação deste produto foi conferida e está OK"><input type="checkbox" data-p="ok" '+(p.ok?'checked':'')+' style="width:18px;height:18px;accent-color:#16A34A">OK</label></td>'+
      '<td class="exec"><button data-prod="del">✕</button></td></tr>';
  }).join('') + (hhProdCfg.length? '' : '<tr><td colspan="10" style="color:var(--mut)">Nenhum produto configurado — adicione abaixo (ex.: SOLDA · 314-0012-08 · 3 postos · PV · 6/h).</td></tr>');
}
// ── CONFIG do dia (admin): células ──
function hhCfgRender(){
  const tb=document.getElementById('hhCfgTb'); if(!tb) return;
  tb.innerHTML = hhLinhasCfg.map(function(c,i){
    const hasProd=hhProdCfg.some(function(p){return p.linha===c.id&&p.cod&&(Number(p.qtdDia)>0||Number(p.metaH)>0);});
    const metaField='<input data-c="meta" type="number" min="0" step="1" value="'+Math.round(hhMetaLinha(c.id))+'" style="width:82px" aria-label="Meta do dia"'+(hasProd?' readonly title="Soma das quantidades do dia dos produtos (ou meta/h × horas) — edite a Qtd dia na tabela de produtos"':' placeholder="Meta/dia editável"')+'>';    const blocos=(c.blocos||[]).map(function(b,bi){
      return '<tr class="hhBlocoRow" data-ci="'+i+'" data-bi="'+bi+'">'+
      '<td style="padding-left:22px"><span style="font-size:12px;color:#64748B;font-weight:700">⧗ bloco '+(bi+1)+'</span></td>'+
      '<td></td><td></td>'+
      '<td><input data-b="ini" type="time" step="60" value="'+hhTimeTxt(b.ini,null)+'" aria-label="Início do bloco" style="width:96px"></td>'+
      '<td><input data-b="fim" type="time" step="60" value="'+hhTimeTxt(b.fim,null)+'" aria-label="Fim do bloco" style="width:96px"></td>'+
      '<td><input data-b="cod" value="'+escH(b.cod||'')+'" placeholder="produto do bloco (opcional)" aria-label="Produto do bloco" style="width:150px"></td>'+
      '<td><input data-b="meta" type="number" min="0" step="1" value="'+(Number(b.meta)||0)+'" placeholder="meta" aria-label="Meta do bloco" style="width:76px"></td>'+
      '<td class="exec"><button data-bcfg="del">✕</button></td></tr>';
    }).join('');
    return blocos+'<tr data-ci="'+i+'">'+
      '<td><input data-c="nome" value="'+escH(c.nome)+'" aria-label="Nome da célula"></td>'+
      '<td><input data-c="pessoas" type="number" min="0" step="1" value="'+(Number(c.pessoas)||0)+'" style="width:64px" aria-label="Operadores"></td>'+
      '<td><input data-c="postos" type="number" min="0" step="1" value="'+(Number(c.postos)||0)+'" style="width:64px" aria-label="Postos/bancadas"></td>'+
      '<td><select data-c="modo" aria-label="Modo de produção" title="Qtd: define qtds por produto e horários · Aberto: produção decide o horário · Auto: meta única distribuída na jornada"><option value="auto"'+((c.modo||'auto')==='auto'?' selected':'')+'>Auto</option><option value="qtd"'+(c.modo==='qtd'?' selected':'')+'>Qtd por produto</option><option value="aberto"'+(c.modo==='aberto'?' selected':'')+'>Aberto</option></select></td>'+
      '<td><select data-c="janela" aria-label="Atalho de jornada"><option value="c"'+(hhJanelaPreset(c)==='c'?' selected':'')+'>07:30–17:00 · almoço 12–13</option><option value="11"'+(hhJanelaPreset(c)==='11'?' selected':'')+'>07:00–18:00</option><option value="8"'+(hhJanelaPreset(c)==='8'?' selected':'')+'>07:00–15:00</option><option value="4"'+(hhJanelaPreset(c)==='4'?' selected':'')+'>13:00–17:00</option><option value="custom"'+(hhJanelaPreset(c)==='custom'?' selected':'')+'>Personalizada</option></select></td>'+
      '<td class="hhTimePair"><label>Início<input data-c="hIni" type="time" step="60" value="'+hhTimeTxt(c.hIni,hhScheduleStart(c))+'" aria-label="Início da jornada"></label><label>Fim<input data-c="hFim" type="time" step="60" value="'+hhTimeTxt(c.hFim,hhScheduleEnd(c))+'" aria-label="Fim da jornada"></label></td>'+
      '<td class="hhTimePair"><label>De<input data-c="almocoIni" type="time" step="60" value="'+hhTimeTxt(c.almocoIni,null)+'" aria-label="Início do almoço"></label><label>Até<input data-c="almocoFim" type="time" step="60" value="'+hhTimeTxt(c.almocoFim,null)+'" aria-label="Fim do almoço"></label></td>'+
      '<td>'+metaField+'</td>'+
      '<td class="exec"><button data-cfg="del">✕</button><label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;color:#166534;cursor:pointer" title="INSERIR NA PROGRAMAÇÃO — confere os dados digitados e grava a programação deste dia (fica fixa)"><input type="checkbox" data-c="ok" '+(c.ok?'checked':'')+' style="width:18px;height:18px;accent-color:#16A34A">OK</label></td></tr>';
  }).join('') + (hhLinhasCfg.length? '' : '<tr><td colspan="9" style="color:var(--mut)">Nenhuma célula configurada — adicione abaixo.</td></tr>');
  const addCell=document.getElementById('hhProdAddCell');
  if(addCell){const cur=addCell.value,sg=hhLinhasCfg.map(function(x){return x.id+':'+x.nome;}).join('|');if(addCell.getAttribute('data-sig')!==sg){addCell.innerHTML=hhLinhasCfg.map(function(x){return '<option value="'+escH(x.id)+'">'+escH(x.nome)+'</option>';}).join('');addCell.setAttribute('data-sig',sg);if(hhCfg(cur))addCell.value=cur;else if(hhLinhasCfg[0])addCell.value=hhLinhasCfg[0].id;}}
  const note=document.getElementById('hhScheduleNote');if(note){const bad=hhLinhasCfg.filter(function(c){const a=hhTimeMin(c.hIni,null),b=hhTimeMin(c.hFim,null),m=hhMeal(c);return a===null||b===null||b<=a||(m&&m.invalid);});note.innerHTML=bad.length?'<div class="hhScheduleWarn">⚠ Verifique jornada/almoço em: '+bad.map(function(c){return escH(c.nome);}).join(', ')+'. O almoço só é descontado quando início e fim válidos estão dentro da jornada.</div>':'';}
  const audit=document.getElementById('hhPostosAudit');
  if(audit){const rows=hhLinhasCfg.map(function(c){
    const ps=hhProdCfg.filter(function(p){return p.linha===c.id&&p.cod;});
    const capacity=Number(c.postos)||0;
    if(!ps.length)return '';
    if(!capacity)return '<div class="hhPostAuditRow">'+escH(c.nome)+': '+NF.format(ps.reduce(function(n,p){return n+(Number(p.postos)||0);},0))+' postos alocados; capacidade da célula ainda não informada.</div>';
    // produtos com janela própria dividem o dia — conflito só se postos simultâneos excedem a capacidade no mesmo minuto
    const comJanela=ps.filter(function(p){return hhProdJanelaMin(p);});
    if(!comJanela.length){
      // produtos da MESMA célula revezam os mesmos postos — conta o PICO (maior alocação), não a soma
      const pico=ps.reduce(function(n,p){return Math.max(n,Number(p.postos)||0);},0);
      const total=ps.reduce(function(n,p){return n+(Number(p.postos)||0);},0);
      if(pico>capacity)return '<div class="hhPostAuditRow warn">⚠ '+escH(c.nome)+': um produto usa '+NF.format(pico)+' postos, capacidade cadastrada '+NF.format(capacity)+'.</div>';
      return '<div class="hhPostAuditRow good">'+escH(c.nome)+': OK — pico de '+NF.format(pico)+' de '+NF.format(capacity)+' postos ('+NF.format(total)+' atribuídos no dia; produtos revezam os mesmos postos).</div>';
    }
    // varre o dia minuto a minuto (passo de 15) somando postos dos produtos ativos em cada instante
    let pico=0,picoTxt='';
    for(let m=0;m<1440;m+=15){
      let used=0;
      ps.forEach(function(p){const j=hhProdJanelaMin(p);if(j&&m>=j.start&&m<j.end)used+=(Number(p.postos)||0);});
      if(used>pico){pico=used;picoTxt=hhClockTxt(m);}
    }
    const total=ps.reduce(function(n,p){return n+(Number(p.postos)||0);},0);
    if(pico>capacity)return '<div class="hhPostAuditRow warn">⚠ '+escH(c.nome)+': pico de '+NF.format(pico)+' postos às '+picoTxt+' (capacidade cadastrada '+NF.format(capacity)+'). Produtos em sequência NÃO somam — só simultâneos.</div>';
    return '<div class="hhPostAuditRow good">'+escH(c.nome)+': OK — pico de '+NF.format(pico)+' de '+NF.format(capacity)+' postos ('+NF.format(total)+' atribuídos no dia, produtos em sequência não somam).</div>';
  }).filter(Boolean);audit.innerHTML=rows.join('');}
}
// ── BASELINE de capacidade histórica (célula × produto × operadores) ──
function hhBaseline(){
  const map = {};
  hhApontValidos().forEach(function(a){
    if(!(Number(a.qtd)>0)) return;
    const k = a.linha+'|'+(a.cod||'—')+'|'+(Number(a.operadores)||hhPessoasLinha(a.linha))+'|'+(Number(a.postos)||0);
    if(!map[k]) map[k]={linha:a.linha, cod:a.cod||'—', pessoas:Number(a.operadores)||hhPessoasLinha(a.linha), postos:Number(a.postos)||0, horas:{}, semanas:{}};
    map[k].horas[a.data+'|'+a.hora] = (map[k].horas[a.data+'|'+a.hora]||0) + Number(a.qtd);
    const wk = a.data.slice(0,7)+'-S'+String(Math.ceil((new Date(a.data+'T12:00:00').getDate()+3)/7));
    map[k].semanas[wk] = (map[k].semanas[wk]||0) + Number(a.qtd);
  });
  return Object.keys(map).map(function(k){
    const m = map[k];
    const hv = Object.keys(m.horas).map(function(x){ return m.horas[x]; });
    const media = hv.reduce(function(s,v){ return s+v; },0)/Math.max(1,hv.length);
    const melhor = hv.reduce(function(mx,v){ return Math.max(mx,v); },0);
    return {linha:m.linha, cod:m.cod, pessoas:m.pessoas, postos:m.postos, media:media, melhor:melhor, nHoras:hv.length};
  }).sort(function(a,b){ return a.linha.localeCompare(b.linha) || String(a.cod).localeCompare(String(b.cod),undefined,{numeric:true}); });
}
function hhBaseRender(){
  const tb=document.getElementById('hhBaseTb'); if(!tb) return;
  const b = hhBaseline();
  tb.innerHTML = b.length? b.map(function(x){
    const sug = Math.round(x.media*10)/10;
    return '<tr><td>'+escH(hhNome(x.linha))+' · '+escH(x.cod)+' — '+escH(hhDescDe(x.cod)).slice(0,40)+'</td>'+
      '<td class="num">'+(x.pessoas||'—')+' / '+(x.postos||'—')+'</td><td class="num">'+NF.format(Math.round(sug))+'</td>'+
      '<td class="num">'+NF.format(x.melhor)+'</td><td class="num"><b>'+hhFmtHora(sug)+'/h</b></td></tr>';
  }).join('') : '<tr><td colspan="5" style="color:var(--mut)">Sem dados suficientes — o baseline se forma com os lançamentos hora a hora.</td></tr>';
}
// ── Três áreas do Andon HH: navegação local, sem recriar controlos ou listeners persistidos. ──
// ── v0.0.409 (Dante 15/10): gestão visual rápida do apontamento — chips de célula/intervalo/produto
// que SÓ preenchem os selects existentes (nada do que funciona é alterado) + sugestão da hora posterior
// (apontou às 13:15 → sugere o intervalo 12:00–13:00). Produtos listados = só os programados na célula.
function hhChipsRender(){
  const rowL=document.getElementById('hhChipsLinha'),rowH=document.getElementById('hhChipsHora'),rowP=document.getElementById('hhChipsProd');
  if(!rowL||!rowH||!rowP) return;
  const selL=document.getElementById('hhSelLinha'),selH=document.getElementById('hhSelHora'),selP=document.getElementById('hhSelProd');
  const lin=selL&&selL.value?selL.value:((hhLinhasCfg[0]||{}).id||'');
  const c=hhCfg(lin);
  // célula: um chip por célula programada
  const sigL=hhLinhasCfg.map(function(x){return x.id+':'+x.nome;}).join('|')+'|sel='+lin;
  if(rowL.getAttribute('data-sig')!==sigL){
    rowL.innerHTML=hhLinhasCfg.map(function(x){
      return '<button type="button" class="hhChip'+(x.id===lin?' on':'')+'" data-chip-linha="'+escH(x.id)+'">'+escH(x.nome)+'</button>';
    }).join('')||'<span class="hhNote" style="margin:0">Nenhuma célula programada</span>';
    rowL.setAttribute('data-sig',sigL);
  }
  // intervalo: faixas da jornada da célula (mesmas do select) — a sugerida vem em destaque
  const sug=hhIntervaloSugerido(lin);
  const ivs=c?hhWorkIntervals(c):[];
  const sigH=lin+'|'+ivs.map(function(s){return s.key;}).join(',')+'|sel='+(selH?selH.value:'')+'|sug='+(sug?sug.key:'');
  if(rowH.getAttribute('data-sig')!==sigH){
    rowH.innerHTML=ivs.map(function(s){
      const on=selH&&selH.value===s.key;
      const isSug=sug&&sug.key===s.key;
      return '<button type="button" class="hhChip'+(on?' on':'')+(isSug?' hhChipSug':'')+'" data-chip-hora="'+escH(s.key)+'" title="Apontar '+s.label+'">'+s.label+'</button>';
    }).join('')+'<button type="button" class="hhChip'+(selH&&selH.value==='__out'?' on':'')+'" data-chip-hora="__out" title="Registrar produção fora da jornada">⏱ Fora</button>';
    rowH.setAttribute('data-sig',sigH);
  }
  // produto: só os programados nesta célula (com meta do dia) — clique preenche o campo
  const prods=hhProdCfg.filter(function(p){return p.linha===lin&&p.cod&&!hhEhFrete(p.cod,hhDescDe(p.cod));});
  const fin=hhFinalDe(lin);
  const codSel=selP?(selP.value||'').trim():'';
  const sigP=lin+'|'+prods.map(function(p){return p.cod;}).join(',')+'|sel='+codSel;
  if(rowP.getAttribute('data-sig')!==sigP){
    rowP.innerHTML=prods.map(function(p){
      const w=!!p.ward;
      const on=String(p.cod)===codSel;
      return '<button type="button" class="hhChip'+(on?' on':'')+'" data-chip-prod="'+escH(String(p.cod))+'" title="'+escH(hhDescDe(p.cod))+(w?' · WARD → Supermercado':' · PV')+'">'+escH(String(p.cod))+(w?' <b>🛒</b>':'')+'</button>';
    }).join('')||'<span class="hhNote" style="margin:0">Nenhum produto programado nesta célula — digite no campo abaixo</span>';
    rowP.setAttribute('data-sig',sigP);
  }
  if(!rowL._bound){ rowL._bound=true; rowL.addEventListener('click',function(e){
    const b=e.target.closest('button[data-chip-linha]'); if(!b) return;
    if(selL){ selL.value=b.getAttribute('data-chip-linha'); selL.dispatchEvent(new Event('change',{bubbles:true})); }
    hhRender();
  }); }
  if(!rowH._bound){ rowH._bound=true; rowH.addEventListener('click',function(e){
    const b=e.target.closest('button[data-chip-hora]'); if(!b) return;
    if(selH){ selH.value=b.getAttribute('data-chip-hora'); selH.dispatchEvent(new Event('change',{bubbles:true})); }
    hhEntryContextRender(); hhChipsRender();
  }); }
  if(!rowP._bound){ rowP._bound=true; rowP.addEventListener('click',function(e){
    const b=e.target.closest('button[data-chip-prod]'); if(!b) return;
    const cod=b.getAttribute('data-chip-prod');
    const selP2=document.getElementById('hhSelProdSel');
    if(selP2){ selP2.value=cod; selP2.dispatchEvent(new Event('change',{bubbles:true})); }
    if(selP){ selP.value=cod; selP.dispatchEvent(new Event('change',{bubbles:true})); }
    hhEntryContextRender();
  }); }
}
// sugestão: hora corrente → intervalo ANTERIOR (13:15 sugere 12–13; 13:00 em ponto ainda sugere 12–13)
function hhIntervaloSugerido(lin){
  const c=hhCfg(lin); if(!c) return null;
  const ivs=hhWorkIntervals(c); if(!ivs.length) return null;
  const now=new Date(), cur=now.getHours()*60+now.getMinutes();
  const passados=ivs.filter(function(s){ return s.end<=cur; });
  if(passados.length) return passados[passados.length-1];
  return ivs[0];
}
// ── v0.0.412 (Dante 15/10 20h): produto como SELECT preparado — opções = produtos da programação
// da célula; "✍️ Outro produto" revela o campo livre (digitar nome ou procurar na lista cadastrada).
// O select SÓ preenche o campo existente (#hhSelProd), que continua sendo a fonte da gravação.
function hhProdSelRender(){
  const sel=document.getElementById('hhSelProdSel'), wrap=document.getElementById('hhProdLivreWrap'), livre=document.getElementById('hhSelProd');
  if(!sel||!wrap||!livre) return;
  const lin=(document.getElementById('hhSelLinha')||{}).value || ((hhLinhasCfg[0]||{}).id||'');
  const prods=hhProdCfg.filter(function(p){return p.linha===lin&&p.cod&&!hhEhFrete(p.cod,hhDescDe(p.cod));});
  const cur=(livre.value||'').trim();
  const outro=!cur||!prods.some(function(p){return String(p.cod)===cur;});
  const sig=lin+'|'+prods.map(function(p){return p.cod;}).join(',')+'|cur='+cur;
  if(sel.getAttribute('data-sig')===sig) return;
  let h='';
  prods.forEach(function(p){
    const w=!!p.ward;
    h+='<option value="'+escH(String(p.cod))+'"'+(String(p.cod)===cur?' selected':'')+'>'+escH(String(p.cod))+(w?' · 🛒 WARD':'')+'</option>';
  });
  h+='<option value="__livre"'+(outro?' selected':'')+'>✍️ Outro produto…</option>';
  sel.innerHTML=h;
  sel.setAttribute('data-sig',sig);
  wrap.style.display=outro?'block':'none';
  if(!sel._bound){
    sel._bound=true;
    sel.addEventListener('change',function(){
      if(sel.value==='__livre'){ wrap.style.display='block'; if(livre) livre.focus(); }
      else{ wrap.style.display='none'; livre.value=sel.value; livre.dispatchEvent(new Event('change',{bubbles:true})); }
      hhEntryContextRender();
    });
  }
}
function hhEntryProductOptionsRender(){
  const sp=document.getElementById('hhProdDL'); if(!sp) return;
  const lin=(document.getElementById('hhSelLinha')||{}).value || ((hhLinhasCfg[0]||{}).id||'');
  const cods={};
  hhProdCfg.filter(function(p){return p.linha===lin&&p.cod&&!hhEhFrete(p.cod,hhDescDe(p.cod));}).forEach(function(p){cods[p.cod]=hhDescDe(p.cod);});
  (Array.isArray(declDraft)?declDraft:[]).forEach(function(d){if(d.cod&&!hhEhFrete(d.cod,hhDescDe(d.cod)))cods[d.cod]=hhDescDe(d.cod);});
  DATA.rows.forEach(function(r){if(!r.frete&&!hhEhFrete(r.codigo,r.desc))cods[r.codigo]=r.desc;});
  const sig=lin+'|'+Object.keys(cods).sort().join('|'); if(sp.getAttribute('data-sig')===sig)return;
  sp.innerHTML=''; Object.keys(cods).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});}).forEach(function(k){const o=document.createElement('option');o.value=k;o.label=k+' — '+String(cods[k]).slice(0,54);sp.appendChild(o);});
  sp.setAttribute('data-sig',sig);
}
function hhSugerirHorarioFora(linha,clock){
 const c=hhCfg(linha);if(!c)return null;const now=clock||new Date(),minute=now.getHours()*60+now.getMinutes(),start=hhScheduleStart(c),end=hhScheduleEnd(c),meal=hhMeal(c);let ini,fim,label;
 if(minute<start){ini=Math.max(0,start-60);fim=start;label='faixa antes da abertura';}
 else if(minute>=end){ini=end;fim=Math.min(1440,minute);label='faixa após o fechamento';}
 else if(meal&&!meal.invalid&&minute>=meal.start&&minute<meal.end){ini=meal.start;fim=meal.end;label='intervalo programado';}
 else return null;
 return fim>ini?{ini:ini,fim:fim,label:label}:null;
}
function hhOutfieldsClear(){['hhOutIni','hhOutFim'].forEach(function(id){const el=document.getElementById(id);if(el)el.value='';});}
function hhEntryContextRender(){
  const lin=(document.getElementById('hhSelLinha')||{}).value||((hhLinhasCfg[0]||{}).id||''),c=hhCfg(lin),cod=((document.getElementById('hhSelProd')||{}).value||'').trim(),he=document.getElementById('hhSelHora');
  let fora=false,slot=null;
  if(he&&he.value==='__out'){fora=true;slot={label:'Fora da jornada'};}
  else slot=he&&he.value?hhIntervalFor(lin,he.value):null;
  const programado=hhProdCfg.some(function(x){return x.linha===lin&&String(x.cod)===String(cod);});
  const out=document.getElementById('hhEntryContext');if(out){if(!c)out.innerHTML='<div class="hhEmpty">Nenhuma célula programada. Cadastre uma célula primeiro em Programação.</div>';else{
    const p=hhProdCfg.find(function(x){return x.linha===lin&&String(x.cod)===String(cod);}),rg=p?(p.ward?'WARD → Supermercado':'PV → Pedido associado'):(cod?'⚠ Não programado nesta célula':'Selecione o produto da célula'),meal=hhMeal(c),lunch=meal&&!meal.invalid?' · almoço '+hhTimeTxt(c.almocoIni)+'–'+hhTimeTxt(c.almocoFim):'',done=slot&&!fora?hhProdLinhaSlot(lin,hhDiaSelIso(),slot):{qtd:0,legacy:0};
    const blocoTxt=slot&&slot.bloco?' · ⧗ BLOCO '+hhClockTxt(slot.start)+'–'+hhClockTxt(slot.end)+(slot.blocoCod?' ('+escH(slot.blocoCod)+')':'')+' — meta própria':'';
    out.innerHTML='<div class="hhEntryContextTop"><b>'+escH(c.nome)+'</b><span class="hhMetaTag">'+NF.format(c.pessoas||0)+' operadores</span><span class="hhMetaTag">'+NF.format(c.postos||0)+' postos</span><span class="hhMetaTag">'+hhTimeTxt(c.hIni,hhScheduleStart(c))+'–'+hhTimeTxt(c.hFim,hhScheduleEnd(c))+lunch+' · '+hhWorkIntervals(c).length+' faixas</span></div><div class="hhEntryContextBottom">Meta do dia <b>'+NF.format(Math.round(hhMetaLinha(lin)))+' un</b> · '+(fora?'Fora da jornada — sem meta · motivo obrigatório':(slot?'Meta nesta faixa <b>'+NF.format(Math.round(hhMetaInterval(lin,slot)))+' un</b> · já lançado '+NF.format(done.qtd)+' un'+blocoTxt:'Selecione intervalo'))+' · '+escH(rg)+(done.legacy?' · '+NF.format(done.legacy)+' un legado sem faixa específica':'')+(meal&&meal.invalid?' · ⚠ almoço incompleto/fora da jornada; não descontado':'')+(cod&&!programado?' · ⚠ produto NÃO programado nesta célula — informe o motivo':'')+(fora?' · ⚠ fora da jornada — informe o motivo':'')+(slot&&slot.fase&&!slot.final?' · ℹ peça pronta / fase interna ('+hhFinalDe(lin)+' é o produto final desta célula) — não soma no total do dia':'')+'</div>';
  }}
  const w=document.getElementById('hhEntryWindow');if(w)w.textContent=c?(c.nome+' · '+(slot?slot.label:'selecione intervalo')):'Aguardando programação';
  const exb=document.getElementById('hhExceBox');if(exb){exb.style.display=((fora||(cod&&!programado))?'block':'none');const et=document.getElementById('hhExceTxt');if(et)et.textContent=(fora&&cod&&!programado)?'fora da jornada + produto não programado':(fora?'fora da jornada':'produto não programado');}
  const ofl=document.getElementById('hhOutFields');if(ofl)ofl.style.display=(fora?'flex':'none');
  if(!fora)hhOutfieldsClear();
  const mfld=document.getElementById('hhMotivoField');if(mfld)mfld.style.display=((fora||(cod&&!programado))?'flex':'none');
  const reg=document.getElementById('hhEntryRegime');if(reg){const p=hhProdCfg.find(function(x){return x.linha===lin&&String(x.cod)===String(cod);});reg.innerHTML=p?'<span class="hhRegimeTag '+(p.ward?'ward':'')+'">'+(p.ward?'WARD · Supermercado':'PV · Pedido')+'</span>':'';}
  const psel=document.getElementById('hhSelPosto');if(psel){const nP=Number(c?c.postos:0)||0,ex=(c&&Array.isArray(c.postosExtras))?c.postosExtras:[],sg2=lin+'|'+nP+'|'+ex.join(',');if(psel.getAttribute('data-sig')!==sg2){let o2='<option value="">— posto —</option>';for(let k2=1;k2<=nP;k2++)o2+='<option value="Posto '+k2+'">Posto '+k2+'</option>';ex.forEach(function(x2){o2+='<option value="'+escH(x2)+'">'+escH(x2)+'</option>';});o2+='<option value="__novo">➕ Novo posto…</option>';psel.innerHTML=o2;psel.setAttribute('data-sig',sg2);}}
}
function hhPlanDiasRender(){
  const sel=document.getElementById('hhSemSel'),box=document.getElementById('hhDiaBtns');
  if(!sel||!box) return;
  const hojeIso=hhHojeIso();
  if(!hhDiaSel) hhDiaSel=hojeIso;
  if(!hhSemSelIso) hhSemSelIso=hhSegundaDe(hojeIso);
  const semanas=hhSemanasDoAno();
  const cur=hhSegundaDe(hhDiaSel);
  sel.innerHTML=semanas.map(function(si){return '<option value="'+si+'"'+(si===cur?' selected':'')+'>'+hhSemLabel(si)+(si===hhSegundaDe(hojeIso)?' (atual)':'')+'</option>';}).join('');
  if(!sel._bound){ sel._bound=true; sel.addEventListener('change',function(){ hhSemSelIso=sel.value; hhDiaSel=hhSemSelIso; hhSemSelAplicar(); }); }
  const segSel=new Date((hhSemSelIso||cur)+'T12:00:00');
  const nomeDia=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  let html='';
  for(let i=0;i<6;i++){
    const d=new Date(segSel); d.setDate(d.getDate()+i);
    const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const br=String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0');
    const cfg=hhCfgPorDia[iso];
    const nCels=cfg&&Array.isArray(cfg.linhas)?cfg.linhas.length:0;
    const nAp=(function(){let n=0;hhApontValidos().forEach(function(a){if(a.data===iso)n++;});return n;})();
    const firme=cfg&&cfg.firme;
    const temAlgo=nCels>0||nAp>0;
    html+='<button data-hh-dia="'+iso+'" class="'+(iso===hhDiaSel?'on':'')+'"'+(temAlgo?'':' style="opacity:.55"')+'>'+nomeDia[d.getDay()]+' · '+br+(firme?' <span style="font-size:9.5px;font-weight:900;color:#1D4ED8">FIRME</span>':'')+(temAlgo?' <span style="font-size:10px;font-weight:800">· '+(nCels?nCels+'c':'')+(nAp?(nCels?' ':'')+nAp+'a':'')+'</span>':'')+'</button>';
  }
  box.innerHTML=html;
  Array.prototype.forEach.call(box.children,function(b){
    b.addEventListener('click',function(){
      hhDiaSel=b.getAttribute('data-hh-dia');
      Array.prototype.forEach.call(box.children,function(x){x.classList.remove('on');});
      b.classList.add('on');
      hhSemSelAplicar();
    });
  });
}
function hhAplicarDia(){
  // REGRA Dante 13/10: dia SEM programação própria abre EM BRANCO (zerado).
  // A config base (hh|cfg) é só TEMPLATE para o botão Copiar — nunca é exibida como programação de um dia.
  const iso=hhDiaSelIso();
  if(window._hhDiaAplicado===iso) return;
  const d=hhCfgPorDia[iso];
  if(d&&Array.isArray(d.linhas)&&d.linhas.length){ hhLinhasCfg=d.linhas; hhProdCfg=Array.isArray(d.produtos)?d.produtos:[]; }
  else { hhLinhasCfg=[]; hhProdCfg=[]; }
  hhCfgData=iso;
  window._hhDiaAplicado=iso;
  hhTipoNorm();
}
function hhSemSelAplicar(){ window._hhDiaAplicado=''; hhAplicarDia(); hhRender(); }
function hhFirmeDe(iso){ const d=hhCfgPorDia[String(iso||'')]; return !!(d&&d.firme); }
function hhSeedHoje(){ return; }
function hhCopiarDiaAnterior(){
  if(!hhAdmin()){ hhFlash('⚠ modo leitura'); return; }
  const iso=hhDiaSelIso();
  let alvo=null,alvoIso='';
  for(let i=1;i<=14;i++){
    const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()-i);
    const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const c=hhCfgPorDia[k];
    if(c&&Array.isArray(c.linhas)&&c.linhas.length){ alvo=c; alvoIso=k; break; }
  }
  if(!alvo){ const b=JSON.parse(localStorage.getItem('hh|cfg')||'null'); if(b&&Array.isArray(b.linhas)&&b.linhas.length){ alvo={linhas:b.linhas,produtos:b.produtos||[]}; alvoIso='programação base'; } }
  if(!alvo){ hhFlash('⚠ nada para copiar — nenhum dia anterior com programação'); return; }
  hhLinhasCfg=JSON.parse(JSON.stringify(alvo.linhas)); hhProdCfg=JSON.parse(JSON.stringify(alvo.produtos||[]));
  hhCfgData=iso; hhCfgSaveDia(iso,false); hhSave('Copiado de '+alvoIso+' → '+iso); hhRender();
  hhFlash('✔ Copiado de '+alvoIso+' — confira e salve como FIRME');
}
function hhFirmarDia(){
  if(!hhAdmin()){ hhFlash('⚠ modo leitura'); return; }
  if(!hhLinhasCfg.length){ hhFlash('⚠ dia vazio — copie do dia anterior ou configure as células antes de salvar'); return; }
  hhCfgData=hhDiaSelIso(); hhCfgSaveDia(hhCfgData,true); hhSave('💾 Programação firme — dia '+hhCfgData); hhRender();
  hhFlash('✔ Programação firme salva ('+hhCfgData+')');
}
function hhPlanSummaryRender(){
 const k=document.getElementById('hhPlanKpis');if(k){const nprod=hhProdCfg.filter(function(p){return !!p.cod;}).length,day=hhLinhasCfg.reduce(function(s,c){return s+hhMetaLinha(c.id);},0),ward=hhProdCfg.filter(function(p){return p.ward;}).length,nfin=Object.keys(hhProdCfg.reduce(function(m,p){if(p.final===true&&p.cod)m[p.cod]=1;return m;},{})).length;k.innerHTML='<div class="hhKpi"><div class="hhKpiLabel">Células</div><div class="hhKpiValue">'+NF.format(hhLinhasCfg.length)+'</div><div class="hhKpiHint">programadas para hoje</div></div><div class="hhKpi"><div class="hhKpiLabel">Produtos / lotes</div><div class="hhKpiValue">'+NF.format(nprod)+'</div><div class="hhKpiHint">podem rodar em paralelo</div></div><div class="hhKpi"><div class="hhKpiLabel">Meta diária (produto final / subconjunto)</div><div class="hhKpiValue">'+NF.format(Math.round(day))+' un</div><div class="hhKpiHint">'+(nfin?'contagem final de '+NF.format(nfin)+' produto(s) — fases internas não somam':'soma de metas/h × horas abertas')+'</div></div><div class="hhKpi"><div class="hhKpiLabel">Destinos WARD</div><div class="hhKpiValue">'+NF.format(ward)+'</div><div class="hhKpiHint">lotes para Supermercado</div></div>';}
 const d=document.getElementById('hhPlanDate'),today=document.getElementById('hhDateLabel'),t=(function(){const iso=hhDiaSelIso();const dt=new Date(iso+'T12:00:00');return dt.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).toUpperCase();})();if(d)d.textContent=t;if(today)today.textContent=t;
}
function hhMetaStageElapsed(c,minute){
 const m=Number(minute)||0,blocks=(c&&c.blocos||[]).filter(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&z>a;});
 if(blocks.length)return blocks.reduce(function(n,b){const a=hhTimeMin(b.ini,0),z=hhTimeMin(b.fim,0);return n+(Number(b.meta)||0)*(Math.max(0,Math.min(z,m)-a))/Math.max(1,z-a);},0);
 const ps=hhProdCfg.filter(function(p){return p.linha===c.id&&p.cod;});
 if(!ps.length){const total=hhShiftMinutes(c);return total>0?(Number(c.meta)||0)*hhWorkMinutes(c,0,m)/total:0;}
 return ps.reduce(function(n,p){const j=hhProdJanelaMin(p),a=j?j.start:hhScheduleStart(c),z=j?j.end:hhScheduleEnd(c),mins=hhWorkMinutes(c,a,Math.max(a,Math.min(z,m)));return n+(hhMetaHEf(p,c)||0)*mins/60;},0);
}
function hhStageAcum(l,iso,until){let q=0;const cut=Number(until)||0;hhApontValidos().forEach(function(a){if(a.linha!==l||a.data!==iso)return;if(hhApontJaOcorreu(a,cut))q+=Number(a.qtd)||0;});return q;}
function hhStageSlot(l,iso,slot){if(!slot)return 0;let q=0;const hourly=hhWorkIntervals(hhCfg(l)).filter(function(x){return x.hour===slot.hour;}),first=hourly.length?hourly[0].key:'';hhApontValidos().forEach(function(a){if(a.linha!==l||a.data!==iso)return;if(slot.outside){if(a.fora&&String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}if(a.fora)return;if(slot.bloco){if(a.bloco&&String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}if(a.bloco)return;if(a.intervalo){if(String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}if(Number(a.hora)===slot.hour&&slot.key===first)q+=Number(a.qtd)||0;});return q;}
function hhMetaStageSlot(c,slot,cut){if(!slot||slot.outside)return 0;const end=Math.min(slot.end,cut===undefined?slot.end:Number(cut));return Math.max(0,hhMetaStageElapsed(c,end)-hhMetaStageElapsed(c,slot.start));}
function hhActualProductSlot(l,iso,slot,cod){if(!slot)return 0;let q=0;hhApontValidos().forEach(function(a){if(a.linha!==l||a.data!==iso||String(a.cod)!==String(cod)||hhApFase(a))return;if(slot.outside){if(a.fora&&String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}if(a.fora)return;if(slot.bloco){if(a.bloco&&String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}if(a.bloco)return;if(a.intervalo){if(String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}if(Number(a.hora)===slot.hour)q+=Number(a.qtd)||0;});return q;}
function hhMetaProdutoElapsed(p,c,minute){if(!p||!c)return 0;const bl=(c.blocos||[]).filter(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&z>a&&(!b.cod||String(b.cod)===String(p.cod));});if(bl.length)return bl.reduce(function(n,b){const a=hhTimeMin(b.ini,0),z=hhTimeMin(b.fim,0);return n+(Number(b.meta)||0)*(Math.max(0,Math.min(z,Number(minute)||0)-a))/Math.max(1,z-a);},0);const j=hhProdJanelaMin(p),a=j?j.start:hhScheduleStart(c),z=j?j.end:hhScheduleEnd(c);return (hhMetaHEf(p,c)||0)*hhWorkMinutes(c,a,Math.max(a,Math.min(z,Number(minute)||0)))/60;}
function hhMetaProdutoSlot(p,c,slot,cut){if(!p||!c||!slot||slot.outside)return 0;const end=Math.min(slot.end,cut===undefined?slot.end:Number(cut));return Math.max(0,hhMetaProdutoElapsed(p,c,end)-hhMetaProdutoElapsed(p,c,slot.start));}
function hhMonitorFocusSlot(c,t){const slots=hhWorkIntervals(c);if(!slots.length)return null;const out=hhApontValidos().filter(function(a){return a.data===t.iso&&a.linha===c.id&&a.fora===true&&Number(a.inicioMin)<Number(a.fimMin);});if((t.mode==='future'||t.mode==='before')&&out.length){const a=out[out.length-1],ini=Number(a.inicioMin),fim=Number(a.fimMin);return {start:ini,end:fim,hour:Math.floor(ini/60),minutes:fim-ini,key:a.intervalo||('out-'+ini+'-'+fim),label:hhClockTxt(ini)+'–'+hhClockTxt(fim)+' · fora',outside:true};}if(t.mode==='future'||t.mode==='before'){const produced=slots.filter(function(x){return hhStageSlot(c.id,t.iso,x)>0;});return produced.length?produced[produced.length-1]:slots[0];}if(t.mode==='active'){const active=slots.find(function(x){return x.start<=t.nowMinute&&x.end>t.nowMinute;});if(active)return active;}const closed=slots.filter(function(x){return x.end<=t.planMinute;});return closed.length?closed[closed.length-1]:(slots.find(function(x){return x.start<=t.planMinute&&x.end>t.planMinute;})||slots[0]);}
function hhMonitorCellMetrics(c,iso,now){const t=hhMonitorTimeline(c,iso,now),focus=hhMonitorFocusSlot(c,t),stageActual=hhStageAcum(c.id,iso,t.actualMinute),stagePlan=hhMetaStageElapsed(c,t.planMinute),stageGoal=hhMetaPosto(c.id),finalActual=hhProdLinhaAcum(c.id,iso,t.actualMinute),finalPlan=hhMetaElapsed(c,t.planMinute),finalGoal=hhMetaLinha(c.id),delta=stageActual-stagePlan;const stop=hhParadas.some(function(p){const a=hhStopMin(p.horaIni),b=hhStopMin(p.horaFim);return p.linha===c.id&&p.data===iso&&a!==null&&b!==null&&a<t.planMinute&&b>t.start;});let state='ok',text='NO RITMO';if(stop){state='stop';text='⛔ PARADA REGISTRADA';}else if(t.mode==='future'){state=stageActual?'ok':'idle';text=stageActual?'✓ PRODUÇÃO ANTECIPADA':'AGUARDANDO ABERTURA';}else if(t.mode==='before'){state=stageActual?'ok':'idle';text=stageActual?'✓ ADIANTADO':'ANTES DA ABERTURA';}else if(t.mode==='break'){state=delta>0.5?'ok':delta< -0.5?'warn':'idle';text=delta>0.5?'PAUSA · ADIANTADO':delta< -0.5?'PAUSA · ATRASADO':'PAUSA PROGRAMADA';}else if(t.mode==='closed'){state=stageActual>=stageGoal?'ok':(stageActual?'stop':'idle');text=stageActual>=stageGoal?'TURNO ENCERRADO · META ATINGIDA':(stageActual?'TURNO ENCERRADO · ABAIXO DA META':'TURNO ENCERRADO · SEM PRODUÇÃO');}else if(delta>0.5){state='ok';text='ADIANTADO';}else if(delta< -0.5){state='stop';text='ATRASADO · PRECISA DE APOIO';}const shift=hhShiftMinutes(c);return {timeline:t,focus:focus,stageActual:stageActual,stagePlan:stagePlan,stageGoal:stageGoal,delta:delta,state:state,text:text,shiftPct:shift?Math.min(100,Math.round(hhWorkMinutes(c,t.start,t.planMinute)/shift*100)):0,slotActual:hhStageSlot(c.id,iso,focus),slotPlan:hhMetaStageSlot(c,focus,t.mode==='active'?t.planMinute:undefined),finalActual:finalActual,finalPlan:finalPlan,finalGoal:finalGoal};}
function hhMonitorProductMetrics(code,lines,iso,now){let actual=0,planned=0,goal=0,focusActual=0,focusPlan=0,focusLabel='',mode='future',elapsed=0;lines.forEach(function(l){const c=hhCfg(l),p=hhProdCfg.find(function(x){return x.linha===l&&String(x.cod)===String(code)&&(x.final===true||x.tipo==='sub');});if(!c||!p)return;const t=hhMonitorTimeline(c,iso,now),slot=hhMonitorFocusSlot(c,t);if(mode==='future'||mode==='before')mode=t.mode;hhApontValidos().forEach(function(a){if(a.linha===l&&a.data===iso&&String(a.cod)===String(code)&&!hhApFase(a)&&hhApontJaOcorreu(a,t.actualMinute))actual+=Number(a.qtd)||0;});planned+=hhMetaProdutoElapsed(p,c,t.planMinute);goal+=hhQtdDiaDe(p)||Math.round(hhMetaProdutoElapsed(p,c,hhScheduleEnd(c)));focusActual+=hhActualProductSlot(l,iso,slot,code);focusPlan+=hhMetaProdutoSlot(p,c,slot,t.mode==='active'?t.planMinute:undefined);if(slot)focusLabel=slot.label;if(t.mode==='active'&&slot){const from=hhWorkMinutes(c,t.start,slot.start),to=hhWorkMinutes(c,t.start,Math.min(slot.end,t.planMinute)),mins=hhShiftMinutes(c);if(mins)elapsed+=to/mins;}else{const mins=hhShiftMinutes(c);if(mins)elapsed+=hhWorkMinutes(c,t.start,t.planMinute)/mins;}});const delta=actual-planned,pct=planned?Math.min(999,Math.round(actual/planned*100)):(goal&&mode!=='future'&&mode!=='before'?0:(actual?100:0));let state='idle',text=mode==='future'?'AGUARDANDO ABERTURA':'SEM PRODUÇÃO';if(mode==='future'||mode==='before'){if(actual){state='ok';text='✓ PRODUÇÃO ANTECIPADA';}}else if(mode==='closed'){state=actual>=goal?'ok':(actual?'stop':'idle');text=actual>=goal?'TURNO ENCERRADO · META ATINGIDA':(actual?'TURNO ENCERRADO · ABAIXO DA META':'TURNO ENCERRADO · SEM PRODUÇÃO');}else if(delta>0.5){state='ok';text='ADIANTADO';}else if(delta< -0.5){state='stop';text='ATRASADO · PRECISA DE APOIO';}else{state='ok';text='NO RITMO';}return {actual:actual,planned:planned,goal:goal,delta:delta,pct:pct,state:state,text:text,focusActual:focusActual,focusPlan:focusPlan,focusLabel:focusLabel,shiftPct:lines.length?Math.round(elapsed/lines.length*100):0,mode:mode};}
function hhMonitorSummaryRender(iso,hNow,nowMinute,now){
 const ref=now||new Date();let finalTotal=0,finalPlan=0,finalGoal=0,ward=0,pv=0;const metrics={};
 hhLinhasCfg.forEach(function(c){const m=metrics[c.id]=hhMonitorCellMetrics(c,iso,ref);finalTotal+=m.finalActual;finalPlan+=m.finalPlan;finalGoal+=m.finalGoal;hhApontValidos().forEach(function(a){if(a.data!==iso||a.linha!==c.id||!hhApontJaOcorreu(a,m.timeline.actualMinute))return;if(a.ward===true||(a.ward==null&&hhWardDe(a.cod,c.id)))ward+=Number(a.qtd)||0;else pv+=Number(a.qtd)||0;});});
 const gap=finalTotal-finalPlan,floor=document.getElementById('hhFloorMetrics');if(floor)floor.innerHTML='<div class="hhMiniKpi"><b>'+NF.format(hhLinhasCfg.length)+'</b><span>Células programadas</span></div><div class="hhMiniKpi"><b>'+NF.format(finalTotal)+' / '+NF.format(Math.round(finalPlan))+'</b><span>Final realizado / meta acumulada</span></div><div class="hhMiniKpi"><b>'+(gap>0?'+':'')+NF.format(Math.round(gap))+' un</b><span>'+(gap>=0?'adiantado':'atrasado')+' no acumulado</span></div><div class="hhMiniKpi"><b>'+NF.format(ward)+' / '+NF.format(pv)+' un</b><span>WARD / PV</span></div>';
 const cards=document.getElementById('hhFloorCards');if(cards)cards.innerHTML=hhLinhasCfg.length?hhLinhasCfg.map(function(c){const m=metrics[c.id],f=m.focus,deltaHour=f?m.slotActual-m.slotPlan:0,pct=m.stagePlan?Math.min(999,Math.round(m.stageActual/m.stagePlan*100)):(m.stageGoal?0:(m.stageActual?100:0)),cl=m.state==='ok'?'ok':(m.state==='warn'?'warn':(m.state==='stop'?'alert':''));const prods=hhProdCfg.filter(function(p){return p.linha===c.id&&p.cod;}).map(function(p){let q=0;hhApontValidos().forEach(function(a){if(a.data===iso&&a.linha===c.id&&String(a.cod)===String(p.cod)&&hhApontJaOcorreu(a,m.timeline.actualMinute))q+=Number(a.qtd)||0;});return '<div class="hhFloorProduct"><span><b>'+escH(p.cod)+'</b> '+(hhWardDe(p.cod,c.id)?'<i class="hhTagWard">WARD</i>':'<i class="hhTagPV">PV</i>')+(String(p.cod)===String(hhFinalDe(c.id))?' <i class="hhTagPV">🏁 final</i>':(hhFinalDe(c.id)?' <i style="color:#64748B;font-size:10px">fase</i>':''))+'</span><span>'+NF.format(q)+' un</span></div>';}).join('');const note=m.timeline.mode==='future'?'Data futura · sem meta vencida':m.timeline.mode==='before'?'Antes da abertura · produção antecipada':m.timeline.mode==='closed'?'Turno encerrado · resultado final':m.timeline.mode==='break'?'Pausa programada · até último intervalo fechado':'Faixa e acumulado até o último intervalo fechado';return '<article class="hhFloorCard '+cl+'"><div class="hhFloorCardHead"><div><span>'+hhTimeTxt(c.hIni,hhScheduleStart(c))+'–'+hhTimeTxt(c.hFim,hhScheduleEnd(c))+(hhMeal(c)&&!hhMeal(c).invalid?' · almoço '+hhTimeTxt(c.almocoIni)+'–'+hhTimeTxt(c.almocoFim):'')+' · '+NF.format(c.pessoas||0)+' operadores · '+NF.format(c.postos||0)+' postos</span><h3>'+escH(c.nome)+'</h3></div><span class="hhFloorStatus">'+m.text+'</span></div><div class="hhFloorFocus"><div class="hhFloorFocusLabel">'+escH(f?f.label:'sem faixa configurada')+'</div><div class="hhFloorFocusNumbers"><span><b>'+NF.format(m.slotActual)+'</b><small>realizado na faixa</small></span><i>vs</i><span><b>'+NF.format(Math.round(m.slotPlan))+'</b><small>meta na faixa</small></span><b class="hhFloorHourDelta'+(deltaHour<0?' neg':'')+'">'+(deltaHour>0?'+':'')+NF.format(Math.round(deltaHour))+'</b></div></div><div class="hhFloorTotal">'+NF.format(m.stageActual)+' <small>/ '+NF.format(Math.round(m.stagePlan))+' un acumuladas · '+(m.delta>=0?'adiantado':'atrasado')+' '+NF.format(Math.abs(Math.round(m.delta)))+'</small></div><div class="hhProgress"><i style="width:'+Math.min(100,pct)+'%"></i></div><div class="hhFloorProgressMeta"><span>Etapa: produzido × plano vencido</span><span>'+m.shiftPct+'% do turno · meta etapa '+NF.format(Math.round(m.stageGoal))+'</span></div>'+prods+'<div class="hhFloorStamp">'+note+'</div></article>';}).join(''):'<div class="hhEmpty">Nenhuma célula programada. Cadastre uma célula na aba Programação.</div>';
 const mk=document.getElementById('hhManagerKpis');if(mk){const n=hhParadas.filter(function(p){return p.data===iso;}).length;mk.innerHTML='<div class="hhManagerKpi"><span>Células no dia</span><b>'+NF.format(hhLinhasCfg.length)+'</b><small>programadas</small></div><div class="hhManagerKpi"><span>Produto final · acumulado</span><b>'+NF.format(finalTotal)+' / '+NF.format(Math.round(finalPlan))+'</b><small>'+(gap>=0?'adiantado ':'atrasado ')+NF.format(Math.abs(Math.round(gap)))+' un</small></div><div class="hhManagerKpi"><span>Meta final do turno</span><b>'+NF.format(Math.round(finalGoal))+' un</b><small>fases internas não somam</small></div><div class="hhManagerKpi"><span>WARD / PV lançados</span><b>'+NF.format(ward)+' / '+NF.format(pv)+' un</b><small>intervalos considerados até a referência</small></div><div class="hhManagerKpi"><span>Paradas</span><b>'+NF.format(n)+'</b><small>causas registradas</small></div>';}
 const manager=document.getElementById('hhManagerCellTb');if(manager)manager.innerHTML=hhLinhasCfg.length?hhLinhasCfg.map(function(c){const m=metrics[c.id];return '<tr><td><b>'+escH(c.nome)+'</b><div class="small">'+escH(c.id)+'</div></td><td>'+hhTimeTxt(c.hIni,hhScheduleStart(c))+'–'+hhTimeTxt(c.hFim,hhScheduleEnd(c))+(hhMeal(c)&&!hhMeal(c).invalid?' · almoço '+hhTimeTxt(c.almocoIni)+'–'+hhTimeTxt(c.almocoFim):'')+'</td><td>'+NF.format(c.pessoas||0)+' · '+NF.format(c.postos||0)+' postos</td><td><b>'+NF.format(m.stageActual)+' / '+NF.format(Math.round(m.stagePlan))+'</b><div class="small">meta etapa '+NF.format(Math.round(m.stageGoal))+'</div></td><td>'+m.shiftPct+'% do turno</td><td class="'+(m.delta>=0?'hhAhead':'hhBehind')+'">'+(m.delta>0?'+':'')+NF.format(Math.round(m.delta))+' un · '+(m.delta>=0?'adiantado':'atrasado')+'</td></tr>';}).join(''):'<tr><td colspan="6" class="hhEmpty">Nenhuma célula configurada.</td></tr>';
 const pareto=document.getElementById('hhParetoTb');if(pareto){const by={};hhParadas.filter(function(p){return p.data===iso;}).forEach(function(p){const r=p.motivo||'Outro',m=hhStopDuration(p);by[r]=by[r]||{min:0,n:0};by[r].min+=m;by[r].n++;});pareto.innerHTML=Object.keys(by).length?Object.keys(by).sort(function(a,b){return by[b].min-by[a].min;}).map(function(k){return '<tr><td>'+escH(k)+'</td><td>'+NF.format(by[k].min)+'</td><td>'+NF.format(by[k].n)+'</td></tr>';}).join(''):'<tr><td colspan="3" class="hhEmpty">Ainda não há paradas registradas nesta data.</td></tr>';}
 const split=document.getElementById('hhSplitStats');if(split)split.innerHTML='<div class="hhSplitCard"><i class="hhTagPV">PV</i><b>'+NF.format(pv)+' un</b><span class="small">Produção associada a pedido</span></div><div class="hhSplitCard"><i class="hhTagWard">WARD</i><b>'+NF.format(ward)+' un</b><span class="small">Lote para Supermercado</span></div>';
 const acts=document.getElementById('hhActionsTb');if(acts){const stops=hhParadas.filter(function(p){return p.data===iso;});acts.innerHTML=stops.length?stops.map(function(p){const c=hhCfg(p.linha),mins=hhStopDuration(p);return '<tr><td><b>'+escH(c?c.nome:p.linha)+'</b></td><td>'+escH(p.motivo||'—')+'</td><td>'+NF.format(mins)+'</td><td>'+escH(p.obs||'Ação/responsável não informados')+'</td><td><span class="hhGatePill">Registrada</span></td></tr>';}).join(''):'<tr><td colspan="5" class="hhEmpty">Nenhuma ação registrada para esta data.</td></tr>';}
 hhAndonCardsRender(iso,hNow,nowMinute,ref);
}

function hhAndonCardsRender(iso,hNow,nowMinute,now){
  const el=document.getElementById('hhAndonCards');if(!el)return;
  const cards=[],ref=now||new Date();
  hhLinhasCfg.forEach(function(c){
    const products=hhProdCfg.filter(function(p){return p.linha===c.id&&p.cod;}),final=hhFinalDe(c.id);
    // Preserve established deduplication: a single product that is its own final only has a final-product card.
    if(products.length===1&&final&&String(products[0].cod)===String(final))return;
    const m=hhMonitorCellMetrics(c,iso,now||new Date()),plan=m.stagePlan,actual=m.stageActual,delta=m.delta,pct=plan?Math.min(999,Math.round(actual/plan*100)):(m.stageGoal?0:(actual?100:0));
    const pause=hhParadas.find(function(p){const a=hhStopMin(p.horaIni),b=hhStopMin(p.horaFim);return p.linha===c.id&&p.data===iso&&a!==null&&b!==null&&a<m.timeline.planMinute&&b>m.timeline.start;});
    const state=pause?'stop':(m.state==='ok'?'ok':(m.state==='warn'?'warn':(m.state==='idle'?'idle':'stop'))),text=pause?'⛔ PARADA — '+escH(pause.motivo||'parada'):m.text;
    const mh=hhMetaHora(c.id),rate=mh?' · '+hhFmtHora(mh)+'/h':'';
    const title=products.slice(0,3).map(function(p){const e=Number(p.etapa)||0,cls=e===0?'final':(e===1?'sub':'peca'),label=e===0?'Produto final':(e===1?'Subconjunto pronto':'Produto');return '<div class="hhAndonItem"><span class="hhAndonBadge '+cls+'">'+label+'</span><span>'+escH(p.cod)+'</span><span style="margin-left:auto;font-size:12px;color:#64748B;font-weight:700">'+NF.format(Number(p.qtdDia)||0)+' un</span></div>';}).join('')+(products.length>3?'<div class="hhAndonItem"><span style="font-size:11.5px;color:#64748B;font-weight:700">+'+(products.length-3)+' outro(s)</span></div>':'');
    const focus=m.focus,dh=focus?m.slotActual-m.slotPlan:0;
    cards.push('<div class="hhAndonBox"><div class="hhAndonTitle"><h3>'+escH(c.nome)+'</h3>'+(title||'<div class="hhAndonItem"><span style="font-size:11.5px;color:#64748B;font-weight:700">sem produto configurado</span></div>')+'</div><div class="hhAndonBody"><div class="hhAndonPct">'+pct+'<small>%</small></div><div class="hhAndonSub">da meta acumulada'+rate+'</div><div class="hhAndonCounts"><div class="hhAndonCount"><b>'+NF.format(actual)+'</b><span>etapa produzida</span></div><div class="hhAndonCount"><b>'+NF.format(Math.round(plan))+'</b><span>plano vencido</span></div></div><div class="hhAndonDelta'+(delta<0?' neg':'')+'">'+(delta>0?'+':'')+NF.format(Math.round(delta))+' un '+(delta>=0?'adiantado':'atrasado')+'</div><div class="hhAndonCounts" style="margin-top:10px"><div class="hhAndonCount"><b>'+NF.format(m.slotActual)+'</b><span>realizado na faixa</span></div><div class="hhAndonCount"><b>'+NF.format(Math.round(m.slotPlan))+'</b><span>meta na faixa</span></div></div><div class="hhAndonDelta'+(dh<0?' neg':'')+'">'+(dh>0?'+':'')+NF.format(Math.round(dh))+' un na faixa · meta turno '+NF.format(Math.round(m.stageGoal))+'</div></div><div class="hhAndonFoot '+state+'"><span>'+text+'</span><span>'+m.shiftPct+'% jornada</span></div></div>');
  });
  const finals={};hhProdCfg.forEach(function(p){if(p.cod&&p.linha&&(p.tipo==='final'||p.tipo==='sub'||p.final===true)){finals[p.cod]=finals[p.cod]||[];finals[p.cod].push(p.linha);}});
  Object.keys(finals).forEach(function(code){
    const lines=finals[code].filter(function(l){const final=hhFinalDe(l);return !final||String(final)===String(code);});if(!lines.length)return;
    const row=hhProdCfg.find(function(p){return String(p.cod)===String(code)&&(p.tipo==='final'||p.tipo==='sub'||p.final===true);})||{},type=row.tipo||'final',m=hhMonitorProductMetrics(code,lines,iso,ref),single=lines.length===1?lines[0]:null,title=single?hhNome(single):hhDescDe(code),sub=single?'':lines.map(function(l){return escH(hhNome(l));}).join(' · '),dh=m.focusActual-m.focusPlan;
    const st=m.state==='ok'?'ok':m.state==='stop'?'stop':m.state==='idle'?'idle':'warn';
    cards.push('<div class="hhAndonBox"><div class="hhAndonTitle"><h3>'+escH(title)+'</h3><div class="hhAndonItem"><span class="hhAndonBadge '+(type==='sub'?'sub':'final')+'">'+(type==='sub'?'Subconjunto pronto':'Produto final')+'</span><span>'+escH(code)+'</span><span style="margin-left:auto;font-size:12px;color:#64748B;font-weight:700">meta turno '+NF.format(Math.round(m.goal))+' un</span></div>'+(sub?'<small>'+sub+'</small>':'')+'</div><div class="hhAndonBody"><div class="hhAndonSub">FAIXA '+escH(m.focusLabel||'sem faixa')+'</div><div class="hhAndonCounts"><div class="hhAndonCount"><b>'+NF.format(m.focusActual)+'</b><span>realizado na faixa</span></div><div class="hhAndonCount"><b>'+NF.format(Math.round(m.focusPlan))+'</b><span>meta na faixa</span></div></div><div class="hhAndonDelta'+(dh<0?' neg':'')+'">'+(dh>0?'+':'')+NF.format(Math.round(dh))+' un na faixa</div><div class="hhAndonCounts" style="margin-top:10px"><div class="hhAndonCount"><b>'+NF.format(m.actual)+'</b><span>produto final acumulado</span></div><div class="hhAndonCount"><b>'+NF.format(Math.round(m.planned))+'</b><span>meta final acumulada</span></div></div><div class="hhAndonDelta'+(m.delta<0?' neg':'')+'">'+(m.delta>0?'+':'')+NF.format(Math.round(m.delta))+' un '+(m.delta>=0?'adiantado':'atrasado')+' · '+NF.format(m.pct)+'%</div></div><div class="hhAndonFoot '+st+'"><span>'+m.text+'</span><span>'+m.shiftPct+'% jornada</span></div></div>');
  });
  el.innerHTML=cards.length?cards.join(''):'<div class="hhEmpty">Nenhuma célula configurada.</div>';
}

function hhBindTabs(){
 if(window._hhTabsBound)return;window._hhTabsBound=true;
 document.querySelectorAll('#viewHH [data-hh-tab]').forEach(function(b){b.addEventListener('click',function(){const key=b.getAttribute('data-hh-tab');document.querySelectorAll('#viewHH [data-hh-tab]').forEach(function(x){const on=x===b;x.classList.toggle('active',on);x.setAttribute('aria-selected',on?'true':'false');});[['programacao','hhPanelPlan'],['apontamento','hhPanelEntry'],['monitoramento','hhPanelMonitor']].forEach(function(pair){const el=document.getElementById(pair[1]);const on=pair[0]===key;el.classList.toggle('active',on);el.hidden=!on;});hhRender();if(key==='monitoramento'&&window.echarts&&hhChart)setTimeout(function(){hhChart.resize();},80);});});
 document.querySelectorAll('#viewHH [data-hh-view]').forEach(function(b){b.addEventListener('click',function(){const key=b.getAttribute('data-hh-view');hhSetMonitorScreen(key);hhRender();if(key==='gestao'&&window.echarts&&hhChart)setTimeout(function(){hhChart.resize();},80);});});
 const cell=document.getElementById('hhSelLinha');if(cell)cell.addEventListener('change',function(){hhRender();});
 const prod=document.getElementById('hhSelProd');if(prod){prod.addEventListener('change',hhEntryContextRender);prod.addEventListener('input',hhEntryContextRender);}
 const hour=document.getElementById('hhSelHora');if(hour)hour.addEventListener('change',hhEntryContextRender);
 const filter=document.getElementById('hhLinhaSel');if(filter)filter.addEventListener('change',function(){hhLinhaSel=filter.value;hhRender();});
 const qty=document.getElementById('hhQtd');document.querySelectorAll('#viewHH [data-hh-qdelta]').forEach(function(b){b.addEventListener('click',function(){if(!hhAdmin()){hhFlash('⚠ modo leitura');return;}if(qty)qty.value=String(Math.max(0,(Number(qty.value)||0)+Number(b.getAttribute('data-hh-qdelta'))));});});
 const tv=document.getElementById('hhTvBtn');if(tv)tv.addEventListener('click',hhTvToggle);
 document.addEventListener('fullscreenchange',function(){if(!document.fullscreenElement&&document.body.classList.contains('hhTv')){hhTvToggle();}});
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.body.classList.contains('hhTv')){hhTvToggle();}});
}
// ── RENDER principal ──
function hhRender(){
  const iso=hhDiaSelIso();
  hhAplicarDia();
  hhPlanDiasRender();
  const now=new Date(),clock=hhDataClock(iso,now),hNow=clock.hour,nowMinute=clock.planMinute;
  let tot=0, totMeta=0,planVencido=0;
  hhLinhasCfg.forEach(function(c){const m=hhMonitorCellMetrics(c,iso,now);totMeta+=m.finalGoal;planVencido+=m.finalPlan;});
  tot=hhTotFinal(iso,clock.actualMinute);
  const nowEl=document.getElementById('hhNow');
  if(nowEl){
    const pct=totMeta>0?Math.round(100*tot/totMeta):0;
    const acumH=planVencido,dif=tot-acumH;
    const status=clock.mode==='future'?(tot?'produção antecipada · aguardando abertura':'aguardando abertura'):clock.mode==='closed'?(tot>=totMeta?'turno encerrado · meta atingida':'turno encerrado · abaixo da meta'):(dif>=0?'adiantado '+NF.format(dif)+' un':'atrasado '+NF.format(Math.abs(dif))+' un');
    nowEl.innerHTML='<div><div class="lbl">Produção em '+dtBR(iso)+' — '+hhLinhasCfg.length+' célula(s)</div><div class="big">'+NF.format(tot)+' <span style="font-size:20px;font-weight:600">/ '+NF.format(totMeta)+' un</span></div><div class="sub">'+pct+'% da meta do dia · '+status+' · referência pelo plano acumulado</div></div>'+
      '<div><div class="lbl">'+(clock.mode==='future'?'Abertura prevista':clock.mode==='closed'?'Turno encerrado':'Hora de referência')+'</div><div class="big">'+(clock.mode==='future'?hhLinhasCfg.map(function(c){return hhTimeTxt(hhScheduleStart(c));}).filter(Boolean).join(' · ')||'—':clock.mode==='closed'?'FECHADO':String(hNow).padStart(2,'0')+'h')+'</div><div class="sub">'+(clock.mode==='future'?'Nenhuma meta vencida':'Somente intervalos encerrados entram no atraso')+'</div></div>';
  }
  hhCfgRender(); hhProdRender(); hhBaseRender(); hhPlanSummaryRender(); hhAccessSet();
  hhGarantirIds(); hhApontListaRender(iso);
  // seletor do dashboard individual
  const sel=document.getElementById('hhLinhaSel');
  if(sel){
    const cur=hhLinhaSel;
    sel.innerHTML='<option value="">— Todas as células (consolidado) —</option>'+hhLinhasCfg.map(function(c){ return '<option value="'+escH(c.id)+'"'+(cur===c.id?' selected':'')+'>'+escH(c.nome)+'</option>'; }).join('');
  }
  // visão consolidada (todas as células) — tabela hora × célula
  const tbc=document.getElementById('hhConsTb'); if(!tbc) return;
  const horas=[]; for(let h=7;h<18;h++) horas.push(h);
  hhApontValidos().forEach(function(a){ if(a.data===iso&&a.fora===true){ const hh=Number(a.hora); if((hh<7||hh>=18)&&horas.indexOf(hh)<0) horas.push(hh); } });
  hhLinhasCfg.forEach(function(c){ (c.blocos||[]).forEach(function(b){ const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null); if(a===null||z===null)return; for(let h=Math.floor(a/60);h<=Math.floor((z-1)/60);h++){ if(horas.indexOf(h)<0)horas.push(h); } }); });
  horas.sort(function(a,b){return a-b;});
  let head='<tr><th>Hora</th>'+hhLinhasCfg.map(function(c){ return '<th>'+escH(c.nome)+'</th>'; }).join('')+'<th>Total</th></tr>';
  let r1='<tr><td><b>Produzido</b></td>'+hhLinhasCfg.map(function(c){ let s=0; horas.forEach(function(h){ s+=hhProdClockHour(c.id,iso,h).qtd; }); return '<td>'+NF.format(s)+'</td>'; }).join('');
  let tt=0; hhApontValidos().forEach(function(a){ if(a.data===iso) tt+=Number(a.qtd)||0; }); r1+='<td><b>'+NF.format(tt)+'</b></td></tr>';
  let r2='<tr><td>Meta do dia</td>'+hhLinhasCfg.map(function(c){ return '<td>'+NF.format(hhMetaLinha(c.id))+'</td>'; }).join('')+'<td>'+NF.format(totMeta)+'</td></tr>';
  let r3='<tr><td>Operadores</td>'+hhLinhasCfg.map(function(c){ return '<td>'+(Number(c.pessoas)||0)+'</td>'; }).join('')+'<td>'+hhLinhasCfg.reduce(function(s,c){ return s+(Number(c.pessoas)||0); },0)+'</td></tr>';
  let r4='<tr><td>Abertura</td>'+hhLinhasCfg.map(function(c){ return '<td>'+hhTimeTxt(c.hIni,hhScheduleStart(c))+'–'+hhTimeTxt(c.hFim,hhScheduleEnd(c))+(hhMeal(c)&&!hhMeal(c).invalid?' · almoço '+hhTimeTxt(c.almocoIni)+'–'+hhTimeTxt(c.almocoFim):'')+'</td>'; }).join('')+'<td>—</td></tr>';
  let r5='<tr><td>Acumulado</td>'+hhLinhasCfg.map(function(c){
    const horasC=hhHorasCelula(c.id);
    const cutoff=nowMinute,acum=hhProdLinhaAcum(c.id,iso,cutoff),mAc=hhMetaElapsed(c,cutoff);
    const d=acum-mAc;
    return '<td><span class="'+(d>=0?'badgeOk':'badgeLate')+'">'+NF.format(acum)+' / '+NF.format(Math.round(mAc))+(d>=0?' ▲':' ▼')+'</span></td>';
  }).join('')+'<td>—</td></tr>';
  tbc.innerHTML=head+r1+r2+r3+r4+r5;
  // grade por hora (consolidado ou célula única) — considera a JANELA de cada célula
  const grids=['hhGrid'].map(function(id){return document.getElementById(id);}).filter(Boolean);
  if(grids.length){
    let cells='';
    const linhasFiltro = hhLinhaSel? hhLinhasCfg.filter(function(c){ return c.id===hhLinhaSel; }) : hhLinhasCfg;
    horas.forEach(function(h){
      let q=0, mH=0, itens={}, wardItems={}, wardQ=0, pvQ=0;
      linhasFiltro.forEach(function(c){
        const bl=(c.blocos||[]).filter(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&h*60>=a&&h*60<z;});
        const emJanela=hhHorasCelula(c.id).indexOf(h)>=0;
        if(!emJanela&&!bl.length) return;
        if(bl.length){
          bl.forEach(function(b){ mH+=(Number(b.meta)||0)*Math.max(0,Math.min(60,(Number(b.meta)>0?60:60)))/60; });
          mH=bl.reduce(function(n,b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);const min=Math.max(0,Math.min(60,z-h*60)-(h*60<a?0:0));return n+(Number(b.meta)||0)*Math.min(60,z-h*60)/Math.max(1,(z-a));},0);
          hhApontValidos().forEach(function(a){ if(a.linha!==c.id||a.data!==iso||Number(a.hora)!==h||!a.bloco)return; const zz=Number(a.qtd)||0; q+=zz; itens[a.cod||'—']=(itens[a.cod||'—']||0)+zz; const w=a.ward===true, rk=(w?'WARD':'PV')+'|'+(a.cod||'—'); regimes[rk]=(regimes[rk]||0)+zz; if(w){wardQ+=zz;wardItems[a.cod||'—']=(wardItems[a.cod||'—']||0)+zz;}else pvQ+=zz; });
        } else {
          const p=hhProdClockHour(c.id,iso,h); q+=p.qtd; mH+=hhMetaHoraL(c.id,h);
          Object.keys(p.itens).forEach(function(k){ itens[k]=(itens[k]||0)+p.itens[k]; }); Object.keys(p.regimes||{}).forEach(function(rk){const z=rk.split('|'),n=p.regimes[rk];if(z[0]==='WARD'){wardQ+=n;wardItems[z.slice(1).join('|')]=(wardItems[z.slice(1).join('|')]||0)+n;}else pvQ+=n;});
        }
      });
      const fora = !linhasFiltro.some(function(c){ const bl=(c.blocos||[]).some(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&h*60>=a&&h*60<z;}); return hhHorasCelula(c.id).indexOf(h)>=0||bl; });
      let cls='#475569', bg='#f8fafc';
      if(fora&&q>0){ bg='#fef3c7'; cls='#92400e'; }
      else if(fora){ bg='#f1f5f9'; cls='#94a3b8'; }
      else if(h===hNow){ bg='#dbeafe'; cls='#1d4ed8'; }
      else if(q>0){ bg='#dcfce7'; cls='#166534'; }
      const paradasHora = hhParadas.filter(function(p){ return p.data===iso && hhStopOverlapsHour(p,h) && (!hhLinhaSel || p.linha===hhLinhaSel); });
      const badge = fora?'':((wardQ>0?' <span class="badgeWard">WARD '+NF.format(wardQ)+'</span>':'')+(pvQ>0?' <span class="badgePv">PV '+NF.format(pvQ)+'</span>':''));
      const btnsSmkt = fora?'':Object.keys(wardItems).map(function(kk){ return '<button data-ward="'+escH(kk)+'" title="Lançar produção no SMKT (supermercado)">🛒 '+escH(kk)+' → SMKT</button>'; }).join(' ');
      const emBloco=linhasFiltro.some(function(c){ return (c.blocos||[]).some(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&h*60>=a&&h*60<z;}); });
      cells+='<div class="hhCell" data-hora="'+h+'" style="background:'+bg+'"><div class="hLbl" style="color:'+cls+'">'+String(h).padStart(2,'0')+'h'+(emBloco?' <span title="bloco de produção" style="color:#1d4ed8">⧗</span>':'')+(paradasHora.length?' <span title="parada" style="color:#b45309">⏸</span>':'')+'</div>'+
        '<div class="hVal" style="color:'+(fora?'#cbd5e1':cls)+'">'+(fora?'—':q)+'</div>'+
        '<div class="hMeta">'+(fora?(q>0?'fora da jornada':'fora da janela'):'meta '+NF.format(Math.round(mH)))+'</div>'+
        (Object.keys(itens).length&&(!fora)?('<div class="hItens">'+Object.keys(itens).map(function(kk){return escH(kk)+' ×'+itens[kk];}).slice(0,3).join(' · ')+'</div>'):'')+
        (badge||'')+(btnsSmkt?'<div class="hhSmktBtns">'+btnsSmkt+'</div>':'')+'</div>';
    });
    grids.forEach(function(grid){grid.innerHTML=cells;});
  }
  // gráfico: por hora — consolidado ou da célula selecionada
  const el=document.getElementById('hhChart');
  if(el && window.echarts && document.getElementById('hhMonitorManager') && document.getElementById('hhMonitorManager').classList.contains('active')){
    const labels=[], vals=[], metas=[];
    const linhasFiltro2 = hhLinhaSel? hhLinhasCfg.filter(function(c){ return c.id===hhLinhaSel; }) : hhLinhasCfg;
    horas.forEach(function(h){
      labels.push(String(h).padStart(2,'0')+'h');
      let v=0,m=0; linhasFiltro2.forEach(function(c){ if(hhHorasCelula(c.id).indexOf(h)<0) return; v+=hhProdClockHour(c.id,iso,h).qtd; m+=hhMetaHoraL(c.id,h); });
      vals.push(v); metas.push(Math.round(m));
    });
    if(hhChart){ hhChart.dispose(); hhChart=null; }
    hhChart=echarts.init(el);
    hhChart.setOption({grid:{left:44,right:14,top:26,bottom:26},tooltip:{trigger:'axis'},
      xAxis:{type:'category',data:labels,axisLabel:{fontSize:12},axisLine:{lineStyle:{color:'#94a3b8'}}},
      yAxis:{type:'value',axisLabel:{fontSize:12},splitLine:{lineStyle:{type:'dashed',color:'#e2e8f0'}}},
      series:[{name:'Produzido',type:'bar',data:vals,barCategoryGap:'25%',itemStyle:{color:'#3b82f6',borderRadius:[4,4,0,0]},
        markLine:{symbol:'none',data:[{yAxis:Math.round(metas[0]||0),lineStyle:{color:'#f59e0b',type:'dashed'},label:{formatter:'Meta/h: '+Math.round(metas[0]||0),position:'insideMiddleTop',color:'#b45309',fontWeight:700}}]}}]});
  }
  // tabela detalhe por hora (com acumulados e paradas) — respeita janelas
  const detailTables=['hhTb','hhManagerDetailTb'].map(function(id){return document.getElementById(id);}).filter(Boolean);
  if(detailTables.length){
    const linhasFiltro3 = hhLinhaSel? hhLinhasCfg.filter(function(c){ return c.id===hhLinhaSel; }) : hhLinhasCfg;
    let acR=0, acM=0, rows='';
    horas.forEach(function(h){
      let q=0,m=0,prods={},mts={};
      linhasFiltro3.forEach(function(c){
        const bl=(c.blocos||[]).filter(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&h*60>=a&&h*60<z;});
        const emJanela=hhHorasCelula(c.id).indexOf(h)>=0;
        if(!emJanela&&!bl.length) return;
        if(bl.length){
          m+=bl.reduce(function(n,b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return n+(Number(b.meta)||0)*Math.min(60,z-h*60)/Math.max(1,(z-a));},0);
          hhApontValidos().forEach(function(a){ if(a.linha!==c.id||a.data!==iso||Number(a.hora)!==h||!a.bloco)return; const zz=Number(a.qtd)||0; q+=zz; const w=a.ward===true, rk=(w?'WARD':'PV')+'|'+(a.cod||'—'); prods[rk]=(prods[rk]||0)+zz; });
        } else {
          const p=hhProdClockHour(c.id,iso,h); q+=p.qtd; m+=hhMetaHoraL(c.id,h);
          Object.keys(p.regimes||{}).forEach(function(rk){ prods[rk]=(prods[rk]||0)+p.regimes[rk]; });
        }
      });
      hhApontValidos().forEach(function(a){if(a.data===iso&&a.motivo&&Number(a.hora)===h&&linhasFiltro3.some(function(x){return x.id===a.linha;}))mts[a.cod||'—']=a.motivo;});
      acR+=q; acM+=m;
      const dif=acR-acM;
      const paradas=hhParadas.filter(function(p){ return p.data===iso && hhStopOverlapsHour(p,h) && (!hhLinhaSel || p.linha===hhLinhaSel); });
      const fora=!linhasFiltro3.some(function(c){ const bl=(c.blocos||[]).some(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&h*60>=a&&h*60<z;}); return hhHorasCelula(c.id).indexOf(h)>=0||bl; });
      const sit=fora?(q>0?'<span style="background:#fef3c7;color:#92400e;font-weight:700;border-radius:999px;padding:4px 12px;font-size:14px">fora da jornada</span>':'<span style="color:var(--mut)">fora da janela</span>'):((h>=hNow)?'<span style="color:var(--mut)">—</span>':(q<=0&&m>0?'<span class="badgeLate">sem registro</span>':(dif>=0?'<span class="badgeOk">adiantado ▲</span>':'<span class="badgeLate">atrasado ▼</span>')));
      rows+='<tr><td>'+String(h).padStart(2,'0')+'h</td><td>'+q+'</td><td>'+NF.format(Math.round(m))+'</td><td>'+acR+'</td><td>'+NF.format(Math.round(acM))+'</td><td>'+(h>=hNow||fora?'—':NF.format(Math.round(dif)))+'</td><td>'+sit+'</td><td style="text-align:left">'+(paradas.length?paradas.map(function(p){ return '⏸ '+escH(p.motivo)+(hhStopDuration(p)?' '+hhStopDuration(p)+' min':''); }).join(' · '):'—')+'</td><td style="text-align:left">'+(Object.keys(prods).length?escH(Object.keys(prods).map(function(rk){const z=rk.split('|');return z.slice(1).join('|')+(z[0]==='WARD'?' ·W':' ·PV')+' ×'+prods[rk]+(mts[z.slice(1).join('|')]?' <span title="'+escH(mts[z.slice(1).join('|')])+'" style="color:#b45309">⚠</span>':'');}).join(' · ')):'—')+'</td></tr>';
    });
    detailTables.forEach(function(tb){tb.innerHTML=rows;});
  }
  // paradas do dia
  const tp=document.getElementById('hhParTb');
  if(tp){
    const pars=hhParadas.filter(function(p){ return p.data===iso && (!hhLinhaSel || p.linha===hhLinhaSel); });
    tp.innerHTML=pars.length? pars.map(function(p,i){
      const lin=hhCfg(p.linha);
      return '<tr><td>'+escH(lin?lin.nome:p.linha)+'</td><td>'+escH(p.posto||'—')+'</td><td>'+String(p.horaIni).padStart(2,'0')+'h</td><td>'+String(p.horaFim).padStart(2,'0')+'h</td><td>'+escH(p.motivo)+'</td><td style="text-align:left">'+escH(p.obs||'')+'</td><td class="exec"><button data-par="del" data-pi="'+i+'">✕</button></td></tr>';
    }).join('') : '<tr><td colspan="7" style="color:var(--mut)">Sem paradas registradas hoje.</td></tr>';
  }
  // Os produtos são filtrados pelo cadastro da célula para não misturar metas/destinos.
  const sig=hhLinhasCfg.map(function(c){ return c.id+':'+c.nome; }).join('|');
  ['hhSelLinha','hhParLinha'].forEach(function(idSl){
    const sl=document.getElementById(idSl); if(!sl||sl.getAttribute('data-sig')===sig)return;
    const cur=sl.value;sl.innerHTML=hhLinhasCfg.map(function(c){return '<option value="'+escH(c.id)+'">'+escH(c.nome)+'</option>';}).join('');sl.setAttribute('data-sig',sig);
    if(hhCfg(cur))sl.value=cur;else if(hhLinhasCfg[0])sl.value=hhLinhasCfg[0].id;
  });
  hhEntryProductOptionsRender();
  hhChipsRender();
  hhProdSelRender();
  hhPostoDatalistsRender();
  const sh=document.getElementById('hhSelHora'),line=(document.getElementById('hhSelLinha')||{}).value||((hhLinhasCfg[0]||{}).id||''),csel=hhCfg(line),hsig=csel?(csel.id+'|'+csel.hIni+'|'+csel.hFim+'|'+csel.almocoIni+'|'+csel.almocoFim):'';
  if(sh&&sh.getAttribute('data-sig')!==hsig){const cur=sh.value;sh.innerHTML='';hhWorkIntervals(csel).forEach(function(slot){const o=document.createElement('option');o.value=slot.key;o.textContent=slot.label;sh.appendChild(o);});const oo=document.createElement('option');oo.value='__out';oo.textContent='⏱ Fora da jornada…';sh.appendChild(oo);sh.setAttribute('data-sig',hsig);if(Array.from(sh.options).some(function(o){return o.value===cur;}))sh.value=cur;else if(cur&&!String(cur).includes('-')){const old=hhWorkIntervals(csel).find(function(slot){return slot.hour===Number(cur);});if(old)sh.value=old.key;}}
  hhEntryContextRender(); hhMonitorSummaryRender(iso,hNow,nowMinute,now);
  // v0.0.409: sugestão da hora posterior — intervalo vazio ou "Fora" herdado → pré-seleciona o intervalo anterior à hora corrente
  if(sh&&hhLinhasCfg.length&&hhDiaSelIso()===hhHojeIso()&&(!sh.value||sh.value==='__out')){
    const sugIv=hhIntervaloSugerido(line);
    if(sugIv){ sh.value=sugIv.key; hhEntryContextRender(); hhChipsRender(); }
  }
}
function horasAbertas(c){ // helper global da aba (usa a config da célula)
  const i=Number(c.hIni)||7, f=Number(c.hFim)||17; const out=[]; for(let h=i;h<f;h++) out.push(h); return out;
}
function hhQuem(){ try{ const u=JSON.parse(localStorage.getItem('andon|user')||'{}'); return (u.email||'Andon').split('@')[0]; }catch(e){ return 'Andon'; } }
function hhApontEditar(idx){
 if(!hhAdmin())return;const a=hhApont[idx];if(!hhApontAtivo(a))return;const modal=document.getElementById('hhApontEditModal');if(!modal)return;hhGarantirIds();modal.dataset.apontamentoId=a._hhId;
 const d=document.getElementById('hhEditData');if(d)d.value=a.data;const conf=hhCfgPorDia[a.data],linhas=conf&&Array.isArray(conf.linhas)?conf.linhas:(a.data===hhDiaSelIso()?hhLinhasCfg:[]),prods=conf&&Array.isArray(conf.produtos)?conf.produtos:(a.data===hhDiaSelIso()?hhProdCfg:[]),sel=document.getElementById('hhEditLinha');
 if(sel){sel.innerHTML=linhas.map(function(c){return '<option value="'+escH(c.id)+'">'+escH(c.nome)+'</option>';}).join('');sel.value=a.linha;}
 const code=document.getElementById('hhEditCod');if(code)code.value=a.cod||'';const dl=document.getElementById('hhEditCodList');if(dl){const codes={};prods.forEach(function(p){if(p.cod)codes[p.cod]=true;});dl.innerHTML=Object.keys(codes).map(function(k){return '<option value="'+escH(k)+'"></option>';}).join('');}
 const q=document.getElementById('hhEditQtd');if(q)q.value=String(a.qtd||'');const ini=document.getElementById('hhEditIni');if(ini)ini.value=hhClockTxt(a.inicioMin!==undefined?Number(a.inicioMin):Number(a.hora)*60);const fim=document.getElementById('hhEditFim');if(fim)fim.value=hhClockTxt(a.fimMin!==undefined?Number(a.fimMin):(Number(a.hora)+1)*60);
 const op=document.getElementById('hhEditOperador');if(op)op.value=a.operador||'';const post=document.getElementById('hhEditPosto');if(post)post.value=a.posto||'';const reason=document.getElementById('hhEditMotivo');if(reason)reason.value='';const err=document.getElementById('hhApontEditErr');if(err)err.style.display='none';modal.hidden=false;if(q)q.focus();
}
function hhApontEditarSalvar(e){
 e.preventDefault();if(!hhAdmin())return;const modal=document.getElementById('hhApontEditModal'),id=modal&&modal.dataset.apontamentoId,idx=hhApont.findIndex(function(x){return x&&x._hhId===id;});if(idx<0||!hhApontAtivo(hhApont[idx]))return;
 const a=hhApont[idx],data=(document.getElementById('hhEditData')||{}).value||a.data,linha=(document.getElementById('hhEditLinha')||{}).value||a.linha,conf=hhCfgPorDia[data],linhas=conf&&Array.isArray(conf.linhas)?conf.linhas:(data===hhDiaSelIso()?hhLinhasCfg:null),produtos=conf&&Array.isArray(conf.produtos)?conf.produtos:(data===hhDiaSelIso()?hhProdCfg:null),c=linhas&&linhas.find(function(x){return x.id===linha;}),cod=((document.getElementById('hhEditCod')||{}).value||'').trim(),qtd=Number((document.getElementById('hhEditQtd')||{}).value),ini=hhTimeMin((document.getElementById('hhEditIni')||{}).value||'',null),fim=hhTimeMin((document.getElementById('hhEditFim')||{}).value||'',null),motivo=((document.getElementById('hhEditMotivo')||{}).value||'').trim(),err=document.getElementById('hhApontEditErr'),fail=function(t){if(err){err.textContent=t;err.style.display='block';}};
 if(!c||!produtos){fail('A programação da célula/data não está carregada; não apliquei a mudança.');return;}if(!cod||!(qtd>0)||ini===null||fim===null||fim<=ini||!motivo){fail('Informe produto, quantidade maior que zero, horários válidos e motivo.');return;}
 const slot=hhWorkIntervals(c).find(function(x){return x.start===ini&&x.end===fim;}),blocos=c.blocos||[],bi=blocos.findIndex(function(b){return hhTimeMin(b.ini,null)===ini&&hhTimeMin(b.fim,null)===fim;}),bloco=bi>=0?blocos[bi]:null,inside=hhWorkMinutes(c,ini,fim)===fim-ini;if(inside&&!slot&&!bloco){fail('O horário deve coincidir com um intervalo ou bloco configurado.');return;}
 const before=JSON.parse(JSON.stringify(a)),prod=produtos.find(function(x){return x.linha===linha&&String(x.cod)===cod;}),finalDaCelula=produtos.find(function(x){return x.linha===linha&&x.final===true;});a.data=data;a.linha=linha;a.cod=cod;a.qtd=qtd;a.hora=String(Math.floor(ini/60));a.inicioMin=ini;a.fimMin=fim;a.intervalo=slot?slot.key:(bloco?'bloco-'+bi+'-'+ini+'-'+fim:'out-'+ini+'-'+fim);a.fora=!inside;a.ward=prod?!!prod.ward:hhWardDe(cod,linha);a.fase=!!finalDaCelula&&String(finalDaCelula.cod)!==cod;a.pv=prod&&!prod.ward?String(prod.pv||''):'';a.operador=((document.getElementById('hhEditOperador')||{}).value||'').trim();a.posto=((document.getElementById('hhEditPosto')||{}).value||'').trim();if(bloco)a.bloco={ini:hhClockTxt(ini),fim:hhClockTxt(fim),cod:bloco.cod||'',meta:Number(bloco.meta)||0};else delete a.bloco;if(!inside||!prod)a.motivo=motivo;a.editadoEm=new Date().toISOString();a.editadoPor=hhQuem();a.motivoEdicao=motivo;
 hhApontAuditAdd('editar',before,a,motivo);hhSave('Apontamento corrigido · '+cod+' · '+motivo);modal.hidden=true;hhEntryErr('');hhRender();
}
function hhApontExcluir(idx){
 if(!hhAdmin())return;const a=hhApont[idx];if(!hhApontAtivo(a))return;const motivo=(window.prompt('Motivo obrigatório do cancelamento lógico:','')||'').trim();if(!motivo){hhEntryErr('Cancelamento não executado: informe o motivo.');return;}if(!window.confirm('Cancelar este apontamento? Ele sairá dos totais, mas ficará no histórico auditável.'))return;
 const before=JSON.parse(JSON.stringify(a));a.excluido=true;a.excluidoEm=new Date().toISOString();a.excluidoPor=hhQuem();a.motivoExclusao=motivo;hhApontAuditAdd('cancelar',before,a,motivo);hhSave('Apontamento cancelado sem apagar histórico · '+String(a.cod)+' · '+motivo);hhEntryErr('');hhRender();
}
function hhApontListaRender(iso){
 const tb=document.getElementById('hhApontLista'),count=document.getElementById('hhApontCount');if(!tb)return;hhGarantirIds();const rows=hhApont.map(function(a,i){return {a:a,i:i};}).filter(function(x){return x.a&&x.a.data===iso;}).sort(function(x,y){const aa=x.a.inicioMin!==undefined?Number(x.a.inicioMin):Number(x.a.hora)*60,bb=y.a.inicioMin!==undefined?Number(y.a.inicioMin):Number(y.a.hora)*60;return aa-bb;});
 if(count)count.textContent=rows.length+' registro(s) · '+rows.filter(function(x){return hhApontAtivo(x.a);}).length+' ativo(s)';if(!rows.length){tb.innerHTML='<tr><td colspan="7" class="hhEmpty">Ainda não há apontamentos nesta data.</td></tr>';return;}
 tb.innerHTML=rows.map(function(x){const a=x.a,c=hhCfg(a.linha),ini=a.inicioMin!==undefined?Number(a.inicioMin):Number(a.hora)*60,fim=a.fimMin!==undefined?Number(a.fimMin):(Number(a.hora)+1)*60,dead=!hhApontAtivo(a);return '<tr class="'+(dead?'hhApontCanceled':'')+'"><td>'+hhClockTxt(ini)+'–'+hhClockTxt(fim)+(a.fora?' · fora':'')+'</td><td>'+escH(c?c.nome:a.linha)+'</td><td>'+escH(a.cod||'—')+'</td><td><b>'+NF.format(Number(a.qtd)||0)+'</b></td><td>'+escH(a.operador||'—')+' / '+escH(a.posto||'—')+'</td><td>'+(dead?'<span class="hhGatePill">Cancelado · '+escH(a.motivoExclusao||'')+'</span>':(a.editadoEm?'<span class="hhGatePill">Corrigido · '+escH(a.motivoEdicao||'')+'</span>':'Ativo'))+'</td><td class="exec">'+(!dead&&hhAdmin()?'<button type="button" data-hh-apedit="'+x.i+'" class="hhActionBtn">✎ Corrigir</button><button type="button" data-hh-apdel="'+x.i+'" class="hhActionBtn hhDeleteBtn">⊘ Cancelar</button>':'—')+'</td></tr>';}).join('');
}
// ── Operador + Posto no apontamento (Dante 14/10): nome livre com histórico, posto da célula com opção de criar novos ──
function hhOperadoresHist(){ try{ const l=JSON.parse(localStorage.getItem('hh|operadores')||'[]'); return Array.isArray(l)?l:[]; }catch(e){ return []; } }
function hhOperadorLembrar(nome){ const n=String(nome||'').trim(); if(!n)return; const l=hhOperadoresHist(); if(l.indexOf(n)<0){ l.push(n); try{ localStorage.setItem('hh|operadores',JSON.stringify(l)); }catch(e){} } }
function hhPostosDaCelula(l){ const c=hhCfg(l); const n=Math.max(1,Number(c&&c.postos)||0); const out=[]; for(let i=1;i<=n;i++)out.push('P'+i); const custom=(c&&c.postosCustom||[]); custom.forEach(function(p){ if(out.indexOf(p)<0)out.push(p); }); return out; }
function hhPostosDaCelulaIdx(c,posto){ const ps=hhPostosDaCelula(c?c.id:''); return ps.indexOf(String(posto||'').trim()); }
function hhPostoDatalistsRender(){
  const dlOp=document.getElementById('hhOperadorDL');
  if(dlOp){ const ops=hhOperadoresHist(); const sig=ops.join('|'); if(dlOp.getAttribute('data-sig')!==sig){ dlOp.innerHTML=''; ops.forEach(function(o){ const el=document.createElement('option'); el.value=o; dlOp.appendChild(el); }); dlOp.setAttribute('data-sig',sig); } }
  const dlPo=document.getElementById('hhPostoDL');
  const lin=(document.getElementById('hhSelLinha')||{}).value||((hhLinhasCfg[0]||{}).id||'');
  if(dlPo){ const ps=hhPostosDaCelula(lin); const sig=lin+'|'+ps.join('|'); if(dlPo.getAttribute('data-sig')!==sig){ dlPo.innerHTML=''; ps.forEach(function(p){ const el=document.createElement('option'); el.value=p; dlPo.appendChild(el); }); dlPo.setAttribute('data-sig',sig); } }
  const hint=document.getElementById('hhPostoHint');
  if(hint){ const c=hhCfg(lin); const n=Number(c&&c.postos)||0; hint.innerHTML=n?'<span class="hhRegimeTag">'+NF.format(n)+' posto(s) na célula — escolha ou digite um novo nome</span>':'<span class="hhRegimeTag ward">célula sem postos cadastrados — digite o nome do posto</span>'; }
}
function hhInit(){
  if(window._hhHandlersBound) return; window._hhHandlersBound=true;
  hhBindTabs();
  hhAccessSet();
  const pselN=document.getElementById('hhSelPosto');
  if(pselN&&!pselN._bound){pselN._bound=true;pselN.addEventListener('change',function(){
    if(pselN.value!=='__novo')return;
    const linN=(document.getElementById('hhSelLinha')||{}).value||((hhLinhasCfg[0]||{}).id||'');const cN=hhCfg(linN);if(!cN){pselN.value='';return;}
    const nome=(window.prompt('Nome do novo posto da célula '+cN.nome+':','Posto '+((Number(cN.postos)||0)+(Array.isArray(cN.postosExtras)?cN.postosExtras.length:0)+1))||'').trim();
    if(!nome){pselN.value='';return;}
    if(!Array.isArray(cN.postosExtras))cN.postosExtras=[];cN.postosExtras.push(nome);
    hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Novo posto em '+cN.nome+': '+nome);
    pselN.setAttribute('data-sig','');pselN.value=nome;
  });}
  if(document.body && window.MutationObserver && !window._hhAccessObserver){
    window._hhAccessObserver=new MutationObserver(function(){hhAccessSet();});
    window._hhAccessObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  }
  if(!window._hhAccessTimer) window._hhAccessTimer=setInterval(hhAccessSet,2000);
  // v0.0.407 (Dante 15/10): login DENTRO da aba HH — o botão de conectar só existia
  // na aba Programação; sem isso o apontamento parecia "sem campo" (modo leitura esconde tudo)
  (function(){
    const bConn=document.getElementById('hhBtnConn'), box=document.getElementById('hhConnBox');
    if(!bConn||!box||bConn._bound) return; bConn._bound=true;
    function hhConnPaint(){
      const admin=hhAdmin();
      bConn.style.display=admin?'none':'';
      if(admin) box.style.display='none';
    }
    bConn.addEventListener('click',function(){ box.style.display = box.style.display==='none' ? 'flex' : 'none'; const e=document.getElementById('hhConnEmail'); if(e&&box.style.display==='flex'&&!e.value) e.focus(); });
    const go=document.getElementById('hhConnGo');
    if(go&&!go._bound){ go._bound=true; go.addEventListener('click', async function(){
      const email=(document.getElementById('hhConnEmail')||{}).value||'';
      const pass=(document.getElementById('hhConnPass')||{}).value||'';
      if(!email||!pass){ hhFlash('⚠ informe e-mail e senha'); return; }
      go.disabled=true; go.textContent='Entrando…';
      try{
        if(window.ANDON_SYNC && typeof ANDON_SYNC.login==='function'){
          await ANDON_SYNC.login(email,pass);
        }else{
          const api='https://painel-entregas-semanais-708f0.shrd00.internal.goskip.dev';
          const r=await fetch(api+'/api/collections/users/auth-with-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:email,password:pass})});
          if(!r.ok) throw new Error('login falhou ('+r.status+')');
          const d=await r.json();
          try{ localStorage.setItem('andon|token',d.token); localStorage.setItem('andon|user',JSON.stringify({id:d.record.id,email:d.record.email,name:d.record.name||d.record.email,role:d.record.role||''})); }catch(e){}
          if(window.ANDON_SYNC){ ANDON_SYNC.token=d.token; ANDON_SYNC.user=d.record; ANDON_SYNC.expired=false; }
        }
        if(window.viewerUISet) viewerUISet();
        hhAccessSet(); hhConnPaint();
        box.style.display='none';
        hhFlash('✔ Conectado — apontamento habilitado');
      }catch(err){ hhFlash('⚠ login falhou — verifique e-mail/senha'); }
      go.disabled=false; go.innerHTML='<span>✓</span> Entrar';
    }); }
    hhConnPaint();
    window._hhConnPaint=hhConnPaint;
  })();
  const bCop=document.getElementById('hhBtnCopiar');
  if(bCop&&!bCop._bound){ bCop._bound=true; bCop.addEventListener('click', function(){ if(!hhAdmin()){hhFlash('⚠ modo leitura — entre como admin para copiar');return;} hhCopiarDiaAnterior(); }); }
  const apList=document.getElementById('hhApontLista');if(apList&&!apList._bound){apList._bound=true;apList.addEventListener('click',function(e){const ed=e.target.closest('button[data-hh-apedit]'),del=e.target.closest('button[data-hh-apdel]');if(ed)hhApontEditar(Number(ed.getAttribute('data-hh-apedit')));else if(del)hhApontExcluir(Number(del.getAttribute('data-hh-apdel')));});}
  const apSave=document.getElementById('hhApontEditSave');if(apSave&&!apSave._bound){apSave._bound=true;apSave.addEventListener('click',function(e){hhApontEditarSalvar(e);});}
  ['hhApontEditClose','hhApontEditCancel'].forEach(function(id){const b=document.getElementById(id);if(b&&!b._bound){b._bound=true;b.addEventListener('click',function(){const m=document.getElementById('hhApontEditModal');if(m)m.hidden=true;});}});
  const sugBtn=document.getElementById('hhSuggestOut');if(sugBtn&&!sugBtn._bound){sugBtn._bound=true;sugBtn.addEventListener('click',function(){const l=(document.getElementById('hhSelLinha')||{}).value||((hhLinhasCfg[0]||{}).id||''),v=hhSugerirHorarioFora(l);if(!v){hhEntryErr('Não há faixa sugerida; preencha Início e Fim manualmente.');return;}const a=document.getElementById('hhOutIni'),b=document.getElementById('hhOutFim');if(a)a.value=hhClockTxt(v.ini);if(b)b.value=hhClockTxt(v.fim);hhEntryErr('Sugestão ('+v.label+'): '+hhClockTxt(v.ini)+'–'+hhClockTxt(v.fim)+'. Confira/ajuste antes de registrar.');});}
  const btn=document.getElementById('hhBtnAdd'); if(!btn) return;
  const bFirm=document.getElementById('hhBtnFirmar');
  if(bFirm&&!bFirm._bound){ bFirm._bound=true; bFirm.addEventListener('click',hhFirmarDia); }
  // botão 🛒 → SMKT na célula da hora (produto WARD): entrada real no estoque de prontos
  const gridEl=document.getElementById('hhGrid');
  if(gridEl) gridEl.addEventListener('click', function(e){
    const b=e.target.closest('button[data-ward]'); if(!b) return;
    if(!hhAdmin()){ hhFlash('⚠ modo leitura — conecte no 🔗 para lançar'); return; }
    const cod=b.getAttribute('data-ward');
    const hora=Number((b.closest('.hhCell')||{}).getAttribute ? b.closest('.hhCell').getAttribute('data-hora') : 0)||0;
    const iso=hhHojeIso();
    const qtdHora=(function(){ let q=0; hhApontValidos().forEach(function(a){ if(a.linha===(hhLinhaSel||a.linha) && a.data===iso && Number(a.hora)===hora && String(a.cod)===String(cod)) q+=Number(a.qtd)||0; }); return q; })();
    const q=Number(window.prompt('Lançar no SMKT (supermercado)\n'+cod+' — '+hhDescDe(cod)+'\nQuantidade da hora '+String(hora).padStart(2,'0')+'h:', String(qtdHora||'')));
    if(!(q>0)) return;
    const dd=new Date(); const dataBr=dd.toLocaleDateString('pt-BR');
    const ents=smktEntradas(); ents.push({cod:String(cod), qtd:q, origem:'andon-hh', data:dataBr, origemDesc:'Produção Andon '+String(hora).padStart(2,'0')+'h', poderDe:'Fábrica', quem:hhQuem()});
    smktSave(ents,[]);
    const hist=smktHistory(); hist.unshift({cod:String(cod), qtd:q, data:dataBr, event:'Entrada via Andon (WARD)', motivo:'Produção '+String(hora).padStart(2,'0')+'h', origem:'andon-hh', poderDe:'Fábrica', quem:hhQuem(), entradaData:iso});
    smktHistorySave(hist);
    hhSave('Entrada SMKT via Andon: '+cod+' ×'+q); hhRender();
    hhFlash('✔ '+cod+' ×'+q+' no SMKT');
  });
  btn.addEventListener('click', function(){
    if(!hhAdmin()){ hhFlash('⚠ modo leitura — conecte no 🔗 para registrar'); return; }
    hhEntryErr('');
    const lin=(document.getElementById('hhSelLinha')||{}).value;
    const cod=((document.getElementById('hhSelProd')||{}).value||'').trim();
    const sh=document.getElementById('hhSelHora');
    let slot=null,fora=false,sMin=null,eMin=null;
    if(sh&&sh.value==='__out'){
      fora=true;
      sMin=hhTimeMin((document.getElementById('hhOutIni')||{}).value||'',null);eMin=hhTimeMin((document.getElementById('hhOutFim')||{}).value||'',null);
      if(sMin===null||eMin===null){hhFlash('⚠ informe início/fim válidos do intervalo fora da jornada');hhEntryErr('⚠ Informe início/fim válidos do intervalo fora da jornada.');return;}
      slot={hour:Math.floor(sMin/60),start:sMin,end:eMin,minutes:eMin-sMin,key:'out-'+sMin+'-'+eMin,label:hhClockTxt(sMin)+'–'+hhClockTxt(eMin)+' (fora)'};
    } else slot=sh&&sh.value?hhIntervalFor(lin,sh.value):null;
    const qtd=Number((document.getElementById('hhQtd')||{}).value)||0;
    if(!lin||!cod||!slot||qtd<=0){hhFlash('⚠ informe célula, produto, intervalo e quantidade');hhEntryErr('⚠ Não registrou — '+(lin?(cod?'':'informe o produto. '):'selecione a célula. ')+(cod?'':'Informe o produto. ')+(!slot&&lin?'Selecione o intervalo. ':'')+(qtd<=0?'Informe a quantidade (maior que zero).':''));return;}
    const programado=hhProdCfg.some(function(p){return p.linha===lin&&String(p.cod)===String(cod);});
    const mEl=document.getElementById('hhMotivo'),motivo=mEl&&mEl.style.display!=='none'?(mEl.value||'').trim():'';
    if((fora||!programado)&&!motivo){hhFlash('⚠ exceção exige motivo — '+(fora?'fora da jornada':'produto não programado'));const mf2=document.getElementById('hhMotivoField');if(mf2)mf2.style.display='flex';if(mEl)mEl.focus();hhEntryErr('⚠ Produto '+(fora?'FORA da jornada':'não programado nesta célula')+' — escreva o Motivo da exceção antes de registrar.');return;}
    const iso=hhDiaSelIso(),cellCfg=hhCfg(lin),productCfg=hhProdCfg.find(function(p){return p.linha===lin&&String(p.cod)===String(cod);}),ward=productCfg?!!productCfg.ward:hhWardDe(cod,lin);
    const fin=hhFinalDe(lin);
    const operador=((document.getElementById('hhOperador')||{}).value||'').trim();
    const posto=((document.getElementById('hhPosto')||{}).value||'').trim();
    if(operador)hhOperadorLembrar(operador);
    if(posto&&cellCfg){ if(!Array.isArray(cellCfg.postosCustom))cellCfg.postosCustom=[]; if(!Array.isArray(cellCfg.postosExtras))cellCfg.postosExtras=[]; if(hhPostosDaCelulaIdx(cellCfg,posto)<0){cellCfg.postosCustom.push(posto);cellCfg.postosExtras.push(posto);} }
    const ap={data:iso,hora:String(slot.hour),linha:lin,cod:cod,qtd:qtd,ward:ward,fase:(fin&&cod!==fin)?true:undefined,pv:(productCfg&&!ward)?String(productCfg.pv||''):'',operadores:cellCfg?Number(cellCfg.pessoas)||0:0,postos:productCfg?Number(productCfg.postos)||0:0,operador:operador,posto:posto,ts:new Date().toISOString()};
    if(fora){ap.fora=true;ap.inicioMin=sMin;ap.fimMin=eMin;ap.intervalo=slot.key;}else{ap.inicioMin=slot.start;ap.fimMin=slot.end;ap.intervalo=slot.key;}
    if(slot.bloco)ap.bloco={ini:hhClockTxt(slot.start),fim:hhClockTxt(slot.end),cod:slot.blocoCod||'',meta:Number(slot.blocoMeta)||0};
    if(motivo)ap.motivo=motivo;
    if(operador)ap.operador=operador;
    if(posto)ap.posto=posto;
    hhApont.push(ap);
    hhEntryErr('');
    hhSave('Apontamento '+hhNome(lin)+' '+slot.label+(ward?' (WARD→SMKT)':'')+(fora?' FORA DA JORNADA':'')+(ap.fase?' · peça/subconjunto (não soma)':' · contagem PRODUTO FINAL')+(motivo?' — motivo: '+motivo:''));
    hhRender();
    const qi=document.getElementById('hhQtd'); if(qi) qi.value='';
    const oi2=document.getElementById('hhOperador'); if(oi2) oi2.value='';
    if(mEl) mEl.value='';
    const opEl=document.getElementById('hhOperador'); if(opEl) opEl.value='';
    const poEl=document.getElementById('hhPosto'); if(poEl) poEl.value='';
    hhPokaChecar(lin, iso);
    if(fin&&cod!==fin&&!slot.bloco){
      const codsFase={}; hhApontValidos().forEach(function(a){ if(a.data===iso&&a.linha===lin&&String(a.cod)!==fin&&a.fase===true&&!a.bloco) codsFase[a.cod]=(codsFase[a.cod]||0)+(Number(a.qtd)||0); });
      const fases=Object.keys(codsFase);
      if(fases.length){
        const sug=fases.reduce(function(mn,k){ return Math.min(mn,codsFase[k]); }, Infinity);
        let jaFinal=0; hhApontValidos().forEach(function(a){if(a.data===iso&&a.linha===lin&&String(a.cod)===fin)jaFinal+=Number(a.qtd)||0;});
        const restante=Math.max(0,sug-jaFinal);
        if(restante>0){
          if(confirm('SUGESTÃO — '+hhNome(lin)+':\nFases prontas hoje: '+fases.map(function(k){return k+' ×'+codsFase[k];}).join(', ')+'\nSugestão de '+restante+' un de '+fin+' para conferir no posto final (já lançado: '+jaFinal+').\n\nOK = pré-preencher o apontamento do produto final (você confere e registra).\nCancelar = seguir sem sugestão.')){
            const pEl=document.getElementById('hhSelProd'); if(pEl){pEl.value=fin;pEl.dispatchEvent(new Event('change',{bubbles:true}));}
            const qEl=document.getElementById('hhQtd'); if(qEl)qEl.value=String(restante);
            const sEl=document.getElementById('hhSelHora');
            const ivs=hhWorkIntervals(hhCfg(lin));
            const alvo=ivs.find(function(x){return x.final;})||ivs[ivs.length-1];
            if(sEl&&alvo){sEl.value=alvo.key;sEl.dispatchEvent(new Event('change',{bubbles:true}));}
            hhFlash('💡 Sugestão '+restante+' un de '+fin+' — confira e registre (veredito é seu)');
          }
        }
      }
    }
  });
  // config: adicionar célula
  const bAdd=document.getElementById('hhCfgAdd');
  if(bAdd) bAdd.addEventListener('click', function(){
    if(!hhAdmin()){ hhFlash('⚠ modo leitura'); return; }
    const n=hhLinhasCfg.length+1;
    hhLinhasCfg.push({id:'L'+n+'-'+Date.now().toString(36), nome:'Célula '+n, pessoas:0, postos:0, janela:'c', hIni:'07:30', hFim:'17:00', almocoIni:'12:00', almocoFim:'13:00', meta:0});
    hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Config: célula adicionada (dia '+hhCfgData+')'); hhCfgRender(); hhRender();
    const nf=document.querySelector('#hhCfgTb tr:last-child input[data-c="nome"]'); if(nf){nf.focus();nf.select();}
  });
  // config: editar (delegação)
  const cfgTb=document.getElementById('hhCfgTb');
  if(cfgTb) cfgTb.addEventListener('click',function(e){
    if(!hhAdmin()){hhAccessSet();return;}
    const tr=e.target.closest('tr[data-ci]');if(!tr)return;
    const c=hhLinhasCfg[Number(tr.getAttribute('data-ci'))];if(!c)return;
    if(e.target.closest('button[data-bcfg=del]')){
      const bi=Number(tr.getAttribute('data-bi'));
      if(Array.isArray(c.blocos)&&c.blocos[bi]){c.blocos.splice(bi,1);hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Bloco removido — '+c.nome+' (dia '+hhCfgData+')');hhCfgRender();hhRender();}
      return;
    }
    if(e.target.closest('button[data-bcfg=add]')){
      if(!Array.isArray(c.blocos))c.blocos=[];
      const ultimo=(c.blocos.length?c.blocos[c.blocos.length-1].fim:(c.hFim||'17:00'));
      c.blocos.push({ini:ultimo,fim:ultimo,cod:'',meta:0});
      hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Bloco adicionado — '+c.nome+' (dia '+hhCfgData+')');hhCfgRender();hhRender();
      return;
    }
  });
  if(cfgTb) cfgTb.addEventListener('input',function(e){
    if(!hhAdmin()){hhAccessSet();return;}
    const tr=e.target.closest('tr[data-ci]');if(!tr)return;const c=hhLinhasCfg[Number(tr.getAttribute('data-ci'))];if(!c)return;
    const fb=e.target.getAttribute('data-b');
    if(fb){
      if(!Array.isArray(c.blocos))c.blocos=[];
      const bi=Number(tr.getAttribute('data-bi'));const b=c.blocos[bi];if(!b)return;
      if(fb==='cod')b.cod=e.target.value.trim();else if(fb==='ini'||fb==='fim')b[fb]=e.target.value;else b[fb]=Number(e.target.value)||0;
      clearTimeout(window._hhCfgT);window._hhCfgT=setTimeout(function(){hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Bloco editado — '+c.nome+' (dia '+hhCfgData+')');},900);
      return;
    }
    const f=e.target.getAttribute('data-c');if(!f||f==='janela')return;
    if(f==='nome')c.nome=e.target.value;else if(f==='ok'){c.ok=e.target.checked;hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData,c.ok);hhSave((c.ok?'✔ INSERIDO NA PROGRAMAÇÃO — ':'Programação desmarcada — ')+c.nome+' (dia '+hhCfgData+')');hhFlash(c.ok?'✔ '+c.nome+' inserido na programação do dia '+hhCfgData+' (firme)':c.nome+' desmarcado');hhPlanDiasRender();return;}else if(f==='modo'){c.modo=e.target.value;if(c.modo==='qtd'){c.meta=hhProdCfg.filter(function(x){return x.linha===c.id&&x.cod;}).reduce(function(n,x){return n+(Number(x.qtdDia)||0);},0);}hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Modo da célula: '+c.nome+' → '+c.modo);hhCfgRender();hhRender();return;}else if(f==='pessoas'||f==='postos'||f==='meta')c[f]=Number(e.target.value)||0;
    else if(f==='hIni'||f==='hFim'||f==='almocoIni'||f==='almocoFim'){c[f]=e.target.value;if(f==='hIni'||f==='hFim')c.janela='custom';return;}
    clearTimeout(window._hhCfgT);window._hhCfgT=setTimeout(function(){hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Config editada (dia '+hhCfgData+')');},900);
  });
  if(cfgTb) cfgTb.addEventListener('click',function(e){
    if(!hhAdmin()){hhAccessSet();return;}
    const tr=e.target.closest('tr[data-ci]');if(!tr)return;
    const c=hhLinhasCfg[Number(tr.getAttribute('data-ci'))];if(!c)return;
    if(e.target.closest('button[data-bcfg=del]')){
      const bi=Number(tr.getAttribute('data-bi'));
      if(Array.isArray(c.blocos)&&c.blocos[bi]){c.blocos.splice(bi,1);hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Bloco removido — '+c.nome+' (dia '+hhCfgData+')');hhCfgRender();hhRender();}
      return;
    }
    if(e.target.closest('button[data-bcfg=add]')){
      if(!Array.isArray(c.blocos))c.blocos=[];
      const ultimo=(c.blocos.length?c.blocos[c.blocos.length-1].fim:(c.hFim||'17:00'));
      c.blocos.push({ini:ultimo,fim:ultimo,cod:'',meta:0});
      hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Bloco adicionado — '+c.nome+' (dia '+hhCfgData+')');hhCfgRender();hhRender();
      return;
    }
  });
  if(cfgTb) cfgTb.addEventListener('change',function(e){
    if(!hhAdmin()){hhAccessSet();return;}
    const tr=e.target.closest('tr[data-ci]');if(!tr)return;const c=hhLinhasCfg[Number(tr.getAttribute('data-ci'))];if(!c)return;
    if(e.target.getAttribute('data-c')==='janela'){c.janela=e.target.value;if(e.target.value==='c'){c.hIni='07:30';c.hFim='17:00';c.almocoIni='12:00';c.almocoFim='13:00';}else if(e.target.value==='11'){c.hIni='07:00';c.hFim='18:00';}else if(e.target.value==='8'){c.hIni='07:00';c.hFim='15:00';}else if(e.target.value==='4'){c.hIni='13:00';c.hFim='17:00';}}
    if(e.target.getAttribute('data-c')==='hIni'||e.target.getAttribute('data-c')==='hFim'){const a=hhTimeMin(c.hIni,null),b=hhTimeMin(c.hFim,null);if(a===null||b===null||b<=a){hhFlash('⚠ informe início/fim válidos; o fim deve ser posterior ao início');hhCfgRender();return;}}
    clearTimeout(window._hhCfgT);hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Jornada/célula atualizada (dia '+hhCfgData+')');hhCfgRender();hhRender();
  });
  if(cfgTb) cfgTb.addEventListener('click',function(e){
    if(!hhAdmin()){hhAccessSet();return;}
    const tr=e.target.closest('tr[data-ci]');if(!tr)return;
    const c=hhLinhasCfg[Number(tr.getAttribute('data-ci'))];if(!c)return;
    if(e.target.closest('button[data-bcfg=del]')){
      const bi=Number(tr.getAttribute('data-bi'));
      if(Array.isArray(c.blocos)&&c.blocos[bi]){c.blocos.splice(bi,1);hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Bloco removido — '+c.nome+' (dia '+hhCfgData+')');hhCfgRender();hhRender();}
      return;
    }
    if(e.target.closest('button[data-bcfg=add]')){
      if(!Array.isArray(c.blocos))c.blocos=[];
      const ultimo=(c.blocos.length?c.blocos[c.blocos.length-1].fim:(c.hFim||'17:00'));
      c.blocos.push({ini:ultimo,fim:ultimo,cod:'',meta:0});
      hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Bloco adicionado — '+c.nome+' (dia '+hhCfgData+')');hhCfgRender();hhRender();
      return;
    }
  });
  if(cfgTb) cfgTb.addEventListener('click', function(e){
    if(!hhAdmin()){ hhAccessSet(); return; }
    const b=e.target.closest('button[data-cfg=del]'); if(!b) return;
    const tr=b.closest('tr[data-ci]'); if(!tr) return;
    const i=Number(tr.getAttribute('data-ci'));
    if(confirm('Remover a célula "'+hhLinhasCfg[i].nome+'" de hoje? Os apontamentos dela permanecem no histórico.')){
      hhLinhasCfg.splice(i,1); hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Config: célula removida (dia '+hhCfgData+')'); hhCfgRender(); hhRender();
    }
  });
  // produtos meta/h: adicionar / editar / remover
  const bProd=document.getElementById('hhProdAdd');
  if(bProd) bProd.addEventListener('click', function(){
    if(!hhAdmin()){ hhFlash('⚠ modo leitura'); return; }
    const lin=(document.getElementById('hhProdAddCell')||{}).value || (hhLinhasCfg[0]||{}).id || '';
    if(!lin){ hhFlash('⚠ configure uma célula primeiro'); return; }
    const proxima=2+hhProdCfg.filter(function(x){return x.linha===lin&&(Number(x.etapa)===undefined?2:Number(x.etapa))>=2;}).length;
    hhProdCfg.push({linha:lin, cod:'', ward:false, pv:'', postos:0, metaH:0, tipo:'fase', final:false, etapa:proxima});
    hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Config: produto adicionado (dia '+hhCfgData+')'); hhProdRender(); hhRender();
  });
  const prodTb=document.getElementById('hhProdTbl');
  if(prodTb){
    prodTb.addEventListener('input', function(e){
      if(!hhAdmin()){ hhAccessSet(); return; }
      const tr=e.target.closest('tr[data-pi]'); if(!tr || e.target.tagName==='SELECT') return;
      const p=hhProdCfg[Number(tr.getAttribute('data-pi'))]; if(!p) return;
      const f=e.target.getAttribute('data-p'); if(!f) return;
      if(f==='cod') p.cod=e.target.value.trim();
      else if(f==='pv') p.pv=e.target.value.trim();
      else if(f==='ok'){p.ok=e.target.checked;hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData,p.ok);hhSave((p.ok?'✔ INSERIDO NA PROGRAMAÇÃO — produto ':'Produto desmarcado — ')+(p.cod||'?')+' (dia '+hhCfgData+')');hhFlash(p.ok?'✔ '+(p.cod||'Produto')+' inserido na programação do dia '+hhCfgData+' (firme)':(p.cod||'Produto')+' desmarcado');hhPlanDiasRender();return;}
      else if(f==='hIni'||f==='hFim'||f==='horario') p[f]=e.target.value;
      else if(f==='qtd'){p.qtdDia=Number(e.target.value)||0;if(p.linha){const cc2=hhCfg(p.linha);if(cc2&&cc2.modo==='qtd'){cc2.meta=hhProdCfg.filter(function(x){return x.linha===p.linha&&x.cod;}).reduce(function(n,x){return n+(Number(x.qtdDia)||0);},0);}}}
      else p[f]=Number(e.target.value)||0;
      clearTimeout(window._hhProdT); window._hhProdT=setTimeout(function(){ hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Config produto editada (dia '+hhCfgData+')'); hhRender(); }, 600);
    });
    prodTb.addEventListener('change', function(e){
      if(!hhAdmin()){ hhAccessSet(); return; }
      const tr=e.target.closest('tr[data-pi]'); if(!tr) return;
      const p=hhProdCfg[Number(tr.getAttribute('data-pi'))]; if(!p) return;
      const f=e.target.getAttribute('data-p');
      if(e.target.tagName==='SELECT'){ if(f==='linha') p.linha=e.target.value; else if(f==='ward') p.ward=(e.target.value==='ward'); else return; }
      else if(f==='tipo'){
        const v=Number(e.target.value)||0;
        if(v===0){ hhProdCfg.forEach(function(x){ if(x!==p&&x.linha===p.linha){ x.final=false; x.tipo='fase'; x.etapa=Math.max(2,Number(x.etapa)||2); } }); p.tipo='final'; p.final=true; p.etapa=0; }
        else { p.tipo=(v===1?'sub':'fase'); p.final=false; p.etapa=v; }
        hhProdCfgSave();
      } else return;
      hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Config produto editada (dia '+hhCfgData+')'); hhRender();
    });
    prodTb.addEventListener('click', function(e){
      if(!hhAdmin()){ hhAccessSet(); return; }
      const b=e.target.closest('button[data-prod=del]'); if(!b) return;
      const tr=b.closest('tr[data-pi]'); if(!tr) return;
      const i=Number(tr.getAttribute('data-pi'));
      hhProdCfg.splice(i,1); hhCfgData=hhDiaSelIso();hhCfgSaveDia(hhCfgData);hhSave('Config: produto removido (dia '+hhCfgData+')'); hhProdRender(); hhRender();
    });
  }
  // paradas: adicionar
  const bPar=document.getElementById('hhParAdd');
  if(bPar) bPar.addEventListener('click', function(){
    if(!hhAdmin()){ hhFlash('⚠ modo leitura'); return; }
    const lin=(document.getElementById('hhParLinha')||{}).value;
    // v0.0.412: posto segue o apontamento — se o operador digitou um posto na produção, ele vem aqui
    const postoProd=((document.getElementById('hhPosto')||{}).value||'').trim();
    const postoEl=document.getElementById('hhParPosto');
    const posto=((postoEl||{}).value||'').trim()||postoProd;
    const hi=(document.getElementById('hhParIni')||{}).value||'',hf=(document.getElementById('hhParFim')||{}).value||'',mot=(document.getElementById('hhParMotivo')||{}).value,mi=hhTimeMin(hi,null),mf=hhTimeMin(hf,null);
    if(!lin||mi===null||mf===null||mf<=mi||!mot){hhFlash('⚠ informe célula e horários válidos');return;}
    hhParadas.push({data:hhDiaSelIso(),linha:lin,posto:posto||'',horaIni:hi,horaFim:hf,motivo:mot,obs:(document.getElementById('hhParObs')||{}).value||''});
    hhSave('Parada registrada'+(posto?' — '+hhNome(lin)+' · '+posto:'')); hhRender();
    const fm=document.getElementById('hhParMotivo'); if(fm) fm.value='';
    const fo=document.getElementById('hhParObs'); if(fo) fo.value='';
    if(postoEl) postoEl.value='';
  });
  // paradas: remover (delegação)
  const parTb=document.getElementById('hhParTb');
  if(parTb) parTb.addEventListener('click', function(e){
    if(!hhAdmin()){ hhAccessSet(); return; }
    const b=e.target.closest('button[data-par=del]'); if(!b) return;
    const i=Number(b.getAttribute('data-pi'));
    const pars=hhParadas.filter(function(p){ return p.data===hhDiaSelIso() && (!hhLinhaSel || p.linha===hhLinhaSel); });
    const p=pars[i]; if(!p) return;
    const gi=hhParadas.indexOf(p);
    if(gi>=0){ hhParadas.splice(gi,1); hhSave('Parada removida'); hhRender(); }
  });
  // auto-refresh
  setInterval(function(){ const v=document.getElementById('viewHH'); if(v&&v.classList.contains('on')) hhRender(); }, 60000);
  hhLoad(); hhSeedHoje(); hhRender();
}
// ── POKA-YOKE: hora abaixo da meta → pedir motivo + tempo de parada (não bloqueia) ──
function hhPokaChecar(lin, iso){
  if(!hhAdmin()) return;
  const hNow=new Date().getHours();
  const hChec=hNow-1;
  const c=hhCfg(lin); if(!c) return;
  const horasC=horasAbertas(c);
  if(horasC.indexOf(hChec)<0) return;
  const emBlocoHora=(c.blocos||[]).some(function(b){const a=hhTimeMin(b.ini,null),z=hhTimeMin(b.fim,null);return a!==null&&z!==null&&hChec*60>=a&&hChec*60<z;});
  if(emBlocoHora) return;
  const p=hhProdClockHour(lin, iso, hChec);
  const mH=hhMetaHoraL(lin,hChec);
  if(mH>0 && p.qtd<mH){
    const box=document.getElementById('hhPoka');
    if(!box) return;
    const linN=hhNome(lin);
    box.innerHTML='<b>⚠ '+escH(linN)+' — '+String(hChec).padStart(2,'0')+'h ficou abaixo da meta ('+p.qtd+' de '+NF.format(Math.round(mH))+' un).</b> Informe o motivo e o tempo de parada (não bloqueia):'+
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">'+
      '<select id="hhPokaMot"><option value="">Motivo…</option><option>Falta de material</option><option>Quebra de equipamento</option><option>Falta de pessoas</option><option>Qualidade/retrabalho</option><option>Setup/troca de produto</option><option>Sem demanda</option><option>Outro</option></select>'+
      '<input id="hhPokaIni" type="time" step="60" min="'+hhTimeTxt(c.hIni,hhScheduleStart(c))+'" max="'+hhTimeTxt(c.hFim,hhScheduleEnd(c))+'" aria-label="Início da parada">'+
      '<input id="hhPokaFim" type="time" step="60" min="'+hhTimeTxt(c.hIni,hhScheduleStart(c))+'" max="'+hhTimeTxt(c.hFim,hhScheduleEnd(c))+'" aria-label="Fim da parada">'+
      '<input id="hhPokaObs" placeholder="observação (opcional)" style="flex:1;min-width:160px">'+
      '<button id="hhPokaOk" class="primary">Registrar parada</button>'+
      '<button id="hhPokaSkip">Dispensar</button></div>';
    box.style.display='';
    document.getElementById('hhPokaOk').addEventListener('click', function(){
      if(!hhAdmin()){ hhAccessSet(); return; }
      const mot=document.getElementById('hhPokaMot').value;
      const hi=document.getElementById('hhPokaIni').value||'',hf=document.getElementById('hhPokaFim').value||'',mi=hhTimeMin(hi,null),mf=hhTimeMin(hf,null);
      if(!mot||mi===null||mf===null||mf<=mi){hhFlash('⚠ informe motivo e horários válidos');return;}
      hhParadas.push({data:iso,linha:lin,horaIni:hi,horaFim:hf,motivo:mot,obs:document.getElementById('hhPokaObs').value||''});
      hhSave('Parada pós-poka ('+linN+')'); hhRender();
      box.style.display='none';
    });
    document.getElementById('hhPokaSkip').addEventListener('click', function(){ box.style.display='none'; });
  }
}
// ── MODO TV: fullscreen + esconde nav/header; ESC ou clique sai ──
function hhTvToggle(){
  const b=document.body;
  const on=b.classList.toggle('hhTv');
  const bt=document.getElementById('hhTvBtn');
  if(bt) bt.textContent=on?'✕ Sair do Modo TV':'⛶ Modo TV';
  // Modo TV de exibição (Dante 14/10): SÓ os cards Andon — sem resto da tela, sem sidebar; X semi-transparente sai
  let x=document.getElementById('hhTvExit');
  if(on){
    document.querySelectorAll('#viewHH .hhPanel').forEach(function(p){p.classList.add('hhTvOnlyCards');});
    const cards=document.getElementById('hhAndonCards');
    if(cards&&cards.closest('.hhPanel')){cards.closest('.hhPanel').classList.add('active');cards.closest('.hhPanel').hidden=false;}
    const floor=document.getElementById('hhMonitorFloor');
    if(floor){floor.classList.add('active');floor.hidden=false;}
    ['hhFloorIntro','hhNow','hhFloorMetrics','hhFloorCards'].forEach(function(id){const el=document.getElementById(id);if(el)el.style.display='none';});
    const grid=document.querySelector('#hhMonitorFloor .card.hhFloorCard');if(grid)grid.style.display='none';
    if(!x){x=document.createElement('button');x.id='hhTvExit';x.textContent='✕';x.title='Sair do modo TV (ESC também sai)';x.addEventListener('click',function(){if(document.body.classList.contains('hhTv'))hhTvToggle();});document.body.appendChild(x);}
    x.style.display='block';
    try{ if(window.ANDON_HH_ONLYCARDS===undefined){} }catch(e){}
  } else {
    document.querySelectorAll('#viewHH .hhPanel').forEach(function(p){p.classList.remove('hhTvOnlyCards');});
    ['hhFloorIntro','hhNow','hhFloorMetrics','hhFloorCards'].forEach(function(id){const el=document.getElementById(id);if(el)el.style.display='';});
    const grid=document.querySelector('#hhMonitorFloor .card.hhFloorCard');if(grid)grid.style.display='';
    if(x)x.style.display='none';
  }
  try{
    if(on && document.documentElement.requestFullscreen && !document.fullscreenElement){ document.documentElement.requestFullscreen().catch(function(){}); }
    else if(!on && document.fullscreenElement && document.exitFullscreen){ document.exitFullscreen().catch(function(){}); }
  }catch(e){}
  try{ hhRender(); }catch(e){}
}
window.hhInit = hhInit;
window.hhRender = hhRender;
(function(){
  // showView principal também conhece a aba HH (fallback se a principal não a conhece)
  const _sv = window.showView;
  window.showView = function(v){
    let result=null;
    if(typeof _sv==='function') result=_sv(v);
    else{
      const views=[['nf','viewNf'],['ent','viewEnt'],['entv','viewEnt'],['pa','viewProgAuto'],['fat','viewFat'],['hh','viewHH']];
      views.forEach(function(pair){const e=document.getElementById(pair[1]);if(!e)return;const active=pair[0]===v||(pair[1]==='viewEnt'&&(v==='ent'||v==='entv'));e.classList.toggle('on',active);e.style.display=active?'block':'none';e.setAttribute('aria-hidden',active?'false':'true');});
      [['nf','tabNf'],['ent','tabEnt'],['entv','tabEntV'],['pa','tabPA'],['fat','tabFat'],['hh','tabHH']].forEach(function(pair){const e=document.getElementById(pair[1]);if(e)e.classList.toggle('on',pair[0]===v);});
    }
    if(v==='hh'){try{hhInit();}catch(e){}try{hhRender();}catch(e){}}
    return result;
  };
})();

// ══════════════════════════════════════════════════════════════════════════
// v0.0.425 (17/10) — MONITORES SEPARADOS conforme anexos de Dante.
// A área antiga fica preservada e oculta; nenhum apontamento/config é alterado.
// ══════════════════════════════════════════════════════════════════════════
function hhSetMonitorScreen(key){
 const selected=['individual','gestao'].indexOf(key)>=0?key:'chao';
 document.querySelectorAll('#viewHH [data-hh-view]').forEach(function(b){const on=b.getAttribute('data-hh-view')===selected;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');});
 [['chao','hhMonitorFloor'],['individual','hhMonitorIndividual'],['gestao','hhMonitorManager']].forEach(function(pair){const el=document.getElementById(pair[1]);if(!el)return;const on=pair[0]===selected;el.classList.toggle('active',on);el.hidden=!on;});
 const pick=document.querySelector('#viewHH .hhIndividualSelect');if(pick){pick.style.display=selected==='individual'?'flex':'none';pick.classList.toggle('active',selected==='individual');}
 if(selected==='individual'&&hhLinhasCfg.length&&!hhLinhasCfg.some(function(c){return c.id===window._hhMonV2CellId;}))window._hhMonV2CellId=hhLinhasCfg[0].id;
 document.body.classList.toggle('hhTvIndividual',selected==='individual');window._hhMonitorScreen=selected;
 try{if(typeof hhMonV2Render==='function')hhMonV2Render(hhDiaSelIso(),new Date());}catch(e){}
}
function hhMonV2Cut(c,iso,now){
 const d=now||new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 if(String(iso)>today)return hhScheduleStart(c);
 if(String(iso)<today)return hhScheduleEnd(c);
 return d.getHours()*60+d.getMinutes();
}
function hhMonV2ActualCut(c,iso,now){const d=now||new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');return String(iso)>=today?1440:hhScheduleEnd(c);}
function hhMonV2Applies(a,l,iso,cut){return a&&a.linha===l&&a.data===iso&&hhApontAtivo(a)&&hhApontJaOcorreu(a,cut);}
function hhMonV2ActualLine(l,iso,cut){let q=0;hhApontValidos().forEach(function(a){if(a.linha===l&&a.data===iso&&hhApontAtivo(a))q+=Number(a.qtd)||0;});return q;}
function hhMonV2SlotActual(l,iso,slot,cut){
 if(!slot)return 0;let q=0;
 const first=(hhWorkIntervals(hhCfg(l)).filter(function(x){return x.hour===slot.hour;})[0]||{}).key;
 hhApontValidos().forEach(function(a){if(a.linha!==l||a.data!==iso||!hhApontAtivo(a))return;
  if(slot.outside){if(a.fora&&String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}
  if(a.fora)return;
  if(slot.bloco){if(a.bloco&&String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}
  if(a.bloco)return;
  if(a.intervalo){if(String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}
  if(Number(a.hora)===slot.hour&&slot.key===first)q+=Number(a.qtd)||0;
 });return q;
}
function hhMonV2ProductSlot(l,iso,slot,cut,cod){
 if(!slot)return 0;let q=0;
 hhApontValidos().forEach(function(a){if(a.linha!==l||a.data!==iso||!hhApontAtivo(a)||String(a.cod)!==String(cod)||hhApFase(a))return;
  if(slot.outside){if(a.fora&&String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}
  if(a.fora)return;if(slot.bloco){if(a.bloco&&String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}if(a.bloco)return;
  if(a.intervalo){if(String(a.intervalo)===String(slot.key))q+=Number(a.qtd)||0;return;}if(Number(a.hora)===slot.hour)q+=Number(a.qtd)||0;
 });return q;
}
function hhMonV2State(c,iso,now){
 const t=hhMonitorTimeline(c,iso,now),cut=hhMonV2Cut(c,iso,now),actualCut=hhMonV2ActualCut(c,iso,now),start=hhScheduleStart(c),end=hhScheduleEnd(c),actual=hhMonV2ActualLine(c.id,iso,actualCut),goal=hhMetaLinha(c.id),expected=hhMetaStageElapsed(c,cut),delta=actual-expected;
 const stop=(hhParadas||[]).find(function(p){if(p.linha!==c.id||p.data!==iso)return false;const a=hhStopMin(p.horaIni),b=hhStopMin(p.horaFim);return a!==null&&b!==null&&a<=cut&&b>cut;});
 const current=String(iso)===hhHojeIso(),notStarted=String(iso)>hhHojeIso()||(current&&cut<start),finished=String(iso)<hhHojeIso()||(current&&cut>=end);
 let state='wait',label=notStarted?'AGUARDANDO ABERTURA':'AGUARDANDO INÍCIO';
 if(stop){state='stop';label='PARADA';}
 else if(notStarted){if(actual>0){state='ahead';label='ADIANTADO · PRODUÇÃO ANTECIPADA';}}
 else if(finished){state=actual>=goal?'ahead':'late';label=actual>=goal?'META ATINGIDA':'TURNO ENCERRADO';}
 else if(expected>0){const rel=delta/expected;if(rel>=0){state=delta>0.5?'ahead':'steady';label=delta>0.5?'ADIANTADO':'NO RITMO';}else if(rel>=-0.05){state='warn';label='ATENÇÃO';}else{state='late';label='ATRASADO';}}
 else if(actual>0){state='ahead';label='ADIANTADO · PRODUÇÃO ANTECIPADA';}
 const tline={mode:!current?(String(iso)>hhHojeIso()?'future':'closed'):(cut<start?'before':cut>=end?'closed':(hhWorkMinutes(c,cut,cut+1)>0?'active':'break'))};
 let focus=hhMonitorFocusSlot(c,t);if(!focus){const slots=hhWorkIntervals(c);focus=slots[0]||null;}
 const slotActual=hhMonV2SlotActual(c.id,iso,focus,actualCut);
 const slotGoal=focus?hhMetaStageSlot(c,focus):0;
 const slotExpected=focus?hhMetaStageSlot(c,focus,Math.max(focus.start,Math.min(cut,focus.end))):0;
 return {timeline:t,tline:tline,cut:cut,actual:actual,goal:goal,expected:expected,delta:delta,state:state,label:label,stop:stop,earlyProduction:notStarted&&current&&actual>0,focus:focus,slotActual:slotActual,slotGoal:slotGoal,slotExpected:slotExpected,progress:goal?Math.min(100,Math.round(actual/goal*100)):0,shiftPct:hhShiftMinutes(c)?Math.max(0,Math.min(100,Math.round(hhWorkMinutes(c,start,cut)/hhShiftMinutes(c)*100))):0};
}
function hhMonV2SlotRows(c,iso,now){
 const cut=hhMonV2Cut(c,iso,now),actualCut=hhMonV2ActualCut(c,iso,now);
 return hhWorkIntervals(c).map(function(slot){const actual=hhMonV2SlotActual(c.id,iso,slot,actualCut),goal=hhMetaStageSlot(c,slot),elapsed=Math.max(0,Math.min(cut,slot.end)-slot.start),expected=elapsed>0?hhMetaStageSlot(c,slot,cut):0;const early=cut<hhScheduleStart(c)&&actual>0&&slot.start<=hhScheduleStart(c),isFuture=cut<=slot.start&&!early,closed=cut>=slot.end;return {slot:slot,actual:actual,goal:goal,expected:expected,future:isFuture,early:early,closed:closed,current:!isFuture&&!closed,delta:actual-(closed?goal:expected)};});
}
function hhMonV2Products(c,iso,now,metrics){
 const prods=hhProdCfg.filter(function(p){return p.linha===c.id&&p.cod;});
 let running=null;const slot=metrics.focus,cut=metrics.cut,actualCut=hhMonV2ActualCut(c,iso,now);
 const found=prods.map(function(p){return {p:p,q:hhMonV2ProductSlot(c.id,iso,slot,actualCut,p.cod)};}).filter(function(x){return x.q>0;}).sort(function(a,b){return b.q-a.q;});
 if(found.length)running=found[0];
 const queue=prods.filter(function(p){return !running||String(p.cod)!==String(running.p.cod);});
 return {all:prods,running:running,queue:queue};
}
function hhMonV2ProductDescription(p){if(!p)return '—';let desc='';try{desc=hhDescDe(p.cod);}catch(e){}return desc&&String(desc)!==String(p.cod)?escH(String(p.cod))+' · '+escH(String(desc)):escH(String(p.cod));}
function hhMonV2StopText(p,c,cut){
 if(!p)return '';
 const a=hhStopMin(p.horaIni),elapsed=a===null?0:Math.max(0,cut-a),reason=escH(p.motivo||'Parada registrada'),obs=String(p.obs||'').trim();
 return '<div class="hhFcStop">⏸ PARADA HÁ '+NF.format(elapsed)+' MIN · '+reason+(obs?'<br>'+escH(obs):'')+'</div>';
}
function hhMonV2Chart(c,iso,now,m){
 const rows=hhMonV2SlotRows(c,iso,now),peak=Math.max(1,...rows.map(function(r){return Math.max(r.actual,r.goal);}));
 return '<div class="hhFcChartTitle"><span>HORA A HORA</span><span>Meta hora · linha tracejada</span></div><div class="hhFcChart">'+rows.map(function(r){const realPct=Math.min(100,r.actual/peak*100),targetPct=Math.min(100,r.goal/peak*100);let cls=r.future?'future':(r.delta>=-0.5?'':(r.delta/Math.max(1,r.expected)>=-0.05?'warn':'late'));return '<div class="hhFcHour" title="'+escH(r.slot.label)+' · meta '+NF.format(Math.round(r.goal))+' · real '+NF.format(r.actual)+'"><div class="hhFcPlot"><i class="hhFcBar '+cls+'" style="height:'+realPct+'%"></i><i class="hhFcTarget" style="bottom:'+targetPct+'%"></i></div><small>'+String(Math.floor(r.slot.start/60)).padStart(2,'0')+(r.slot.start%60?':'+String(r.slot.start%60).padStart(2,'0'):'')+'</small></div>';}).join('')+'</div>';
}
function hhMonV2CellCard(c,index,iso,now,stats){
 const m=stats||hhMonV2State(c,iso,now),prods=hhMonV2Products(c,iso,now,m),stop=m.stop,cls=stop?'stop':m.state;
 const foc=m.focus,slotLabel=foc?foc.label:'—',future=m.tline.mode==='before'||m.tline.mode==='future';
 const pNow=prods.running,first=prods.all[0]||null;
 const emProd=pNow?'<div class="hhFcProduct"><div class="tag">'+(m.label.indexOf('ADIANTADO')>=0?'PRODUÇÃO ADIANTADA · ':'EM PRODUÇÃO · ')+escH(slotLabel)+'</div><div class="prod">'+hhMonV2ProductDescription(pNow.p)+'</div><div class="qty">'+NF.format(pNow.q)+' / '+NF.format(Math.round(m.slotGoal))+' pc na faixa · '+NF.format(hhMonV2ActualLine(c.id,iso,m.cut))+' / '+NF.format(Number(pNow.p.qtdDia)||0)+' pc no dia</div></div>':future&&first?'<div class="hhFcProduct"><div class="tag">PRÓXIMA PRODUÇÃO · '+hhTimeTxt(foc&&foc.start)+'</div><div class="prod">'+hhMonV2ProductDescription(first)+'</div><div class="qty">Programado: '+NF.format(Number(first.qtdDia)||0)+' pc no turno · sem apontamento antecipado</div></div>':'<div class="hhFcProduct"><div class="tag">EM PRODUÇÃO</div><div class="prod">Nenhum produto apontado na faixa vigente</div><div class="qty">Os dados são exibidos após apontamento.</div></div>';
 const qlist=prods.queue.slice(0,2);
 const queue=qlist.length?'<div class="hhFcQueue"><div class="title">Próximos na fila</div>'+qlist.map(function(p){return '<div class="row"><b>'+hhMonV2ProductDescription(p)+'</b><span>'+NF.format(Number(p.qtdDia)||0)+' pc</span></div>';}).join('')+'</div>':'';
 const shift=hhTimeTxt(c.hIni,hhScheduleStart(c))+'–'+hhTimeTxt(c.hFim,hhScheduleEnd(c));
 const progress=Math.min(100,m.progress);
 return '<article class="hhFactoryCard '+cls+'"><header class="hhFactoryCardHead"><div class="cellname"><span class="cellnum">CÉL '+String(index+1).padStart(2,'0')+'</span>'+escH(c.nome)+'</div><span class="status">'+m.label+'</span></header><div class="hhFactoryCardBody">'+
  '<div class="hhFcMetrics"><div class="hhFcMetric"><div class="lbl">Realizado / Meta dia</div><div class="val">'+NF.format(m.actual)+' <small>/ '+NF.format(m.goal)+' pc</small></div><div class="hhFcProgress"><i style="width:'+progress+'%"></i></div><div class="hint">'+m.progress+'% da meta · '+NF.format(Math.max(0,m.goal-m.actual))+' pc faltantes</div></div><div class="hhFcMetric"><div class="lbl">Vs. esperado ('+NF.format(Math.round(m.expected))+')</div><div class="delta '+(m.delta<0?'neg':'')+'">'+(m.delta>0?'+':'')+NF.format(Math.round(m.delta))+' pc</div><div class="hint">'+(m.state==='wait'?'esperado agora: '+NF.format(Math.round(m.expected)):(m.delta>=0?'adiantado do plano':'abaixo do esperado'))+'</div></div></div>'+
  '<div class="hhFcMetric"><div class="lbl">Meta hora · '+escH(slotLabel)+'</div><div class="val">'+NF.format(m.slotActual)+' <small>/ '+NF.format(Math.round(m.slotGoal))+' pc</small></div><div class="hint">esperado agora: '+NF.format(Math.round(m.slotExpected))+(future?' · faixa futura':'')+'</div></div>'+hhMonV2Chart(c,iso,now,m)+emProd+queue+(stop?hhMonV2StopText(stop,c,m.cut):'')+'</div></article>';
}
function hhMonV2DateLabel(iso){const p=String(iso||'').split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]),wd=['dom','seg','ter','qua','qui','sex','sáb'][d.getDay()],mo=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()];return wd+' - '+String(d.getDate()).padStart(2,'0')+' '+mo+' '+d.getFullYear();}
function hhMonV2FactoryTiles(rows,iso,now){
 const active=rows.map(function(x,i){return hhMonV2CellCard(x.c,i,iso,now,x.m);});
 for(let i=active.length;i<6;i++)active.push('<article class="hhFactoryCard empty"><header class="hhFactoryCardHead"><div class="cellname"><span class="cellnum">CÉL '+String(i+1).padStart(2,'0')+'</span>Sem célula programada</div><span class="status">AGUARDANDO PROGRAMAÇÃO</span></header><div class="hhFactoryCardBody"><div class="hhFcMetric"><div class="lbl">Estado</div><div class="val">—</div><div class="hint">Nenhuma célula configurada para esta posição no dia selecionado.</div></div></div></article>');
 return active.join('');
}
function hhMonV2Factory(iso,now){
 const root=document.getElementById('hhFactoryScreen');if(!root)return;
 const d=now||new Date(),cells=hhLinhasCfg.slice(),rows=cells.map(function(c){return {c:c,m:hhMonV2State(c,iso,d)};});
 const sums=rows.reduce(function(a,x){a.actual+=x.m.actual;a.goal+=x.m.goal;a.expected+=x.m.expected;a.delta+=x.m.delta;a[x.m.state]=(a[x.m.state]||0)+1;return a;},{actual:0,goal:0,expected:0,delta:0,ahead:0,steady:0,warn:0,late:0,stop:0,wait:0});
 const prevD=new Date(String(iso)+'T12:00:00');prevD.setDate(prevD.getDate()-1);const prevIso=prevD.getFullYear()+'-'+String(prevD.getMonth()+1).padStart(2,'0')+'-'+String(prevD.getDate()).padStart(2,'0');
 const prevRows=hhApontValidos().filter(function(a){return a.data===prevIso;});let compare='Comparativo '+hhMonV2DateLabel(prevIso)+': sem apontamentos cadastrados';if(prevRows.length){const prev=prevRows.reduce(function(n,a){return n+(Number(a.qtd)||0);},0);const diff=sums.actual-prev;compare='vs. '+hhMonV2DateLabel(prevIso)+': '+(diff>0?'+':'')+NF.format(diff)+' pc';}
 const d0=new Date(String(iso)+'T12:00:00'),mo=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d0.getMonth()],dateShort=['dom','seg','ter','qua','qui','sex','sáb'][d0.getDay()]+' - '+String(d0.getDate()).padStart(2,'0')+' '+mo+' '+d0.getFullYear();
 root.innerHTML='<div class="hhFactoryScreen"><header class="hhFactoryHead"><div class="hhFactoryBrand">D-LEAN SOLUTIONS<strong>Andon · Produção</strong></div><div class="hhFactoryHero"><div class="lbl">Realizado / Meta dia</div><div class="num">'+NF.format(sums.actual)+' <small>/ '+NF.format(sums.goal)+' pc</small></div><div class="sub">'+(sums.goal?Math.round(sums.actual/sums.goal*100):0)+'% da meta · VS. ESPERADO AGORA <b style="color:'+(sums.delta>=0?'#86EFAC':'#FCA5A5')+'">'+(sums.delta>0?'+':'')+NF.format(Math.round(sums.delta))+' pc</b>'+'</div></div><div class="hhFactoryCounts">'+[['ahead','ADIANTADAS / NO RITMO',''],['warn','ATENÇÃO','warn'],['late','ATRASADAS','late'],['stop','PARADA','stop'],['wait','AGUARDANDO','wait']].map(function(x){const count=x[0]==='ahead'?(sums.ahead+sums.steady):(sums[x[0]]||0);return '<div class="hhFactoryCount"><i class="hhFactoryDot '+x[3]+'"></i><b>'+NF.format(count)+'</b> '+x[1]+'</div>';}).join('')+'</div><div class="hhFactoryClock"><div class="time">'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+'</div><div class="date">'+dateShort+'</div></div></header><div class="hhFactoryCards">'+(rows.length?hhMonV2FactoryTiles(rows,iso,d):'<div class="hhEmpty">Sem células programadas para esta data.</div>')+'</div><div class="hhFactoryLegend"><span><i class="hhFactoryDot"></i> Adiantado / no ritmo</span><span><i class="hhFactoryDot warn"></i> Atenção até −5%</span><span><i class="hhFactoryDot late"></i> Atrasado abaixo de −5%</span><span>🟥 P = parada ativa</span><span><i class="hhLegendLine"></i> Meta da faixa</span></div><div class="hhFactoryFoot"><span>Esperado = meta proporcional ao tempo trabalhado do turno.</span><span>Atualizado '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')+'</span></div></div>';
}
function hhMonV2CellScreen(iso,now){
 const root=document.getElementById('hhIndividualScreen');if(!root)return;
 const d=now||new Date(),sel=document.getElementById('hhMonCellSelect');let id=(window._hhMonV2CellId)||(sel&&sel.value)||((hhLinhasCfg[0]||{}).id||'');
 let c=hhLinhasCfg.find(function(x){return x.id===id;});if(!c){c=hhLinhasCfg[0];id=c&&c.id;}
 if(!c){root.innerHTML='<div class="hhEmpty">Nenhuma célula programada.</div>';return;}
 if(sel&&sel.value!==id)sel.value=id;window._hhMonV2CellId=id;
 const m=hhMonV2State(c,iso,d),rows=hhMonV2SlotRows(c,iso,d),pr=hhMonV2Products(c,iso,d,m),focus=m.focus;
 const remaining=Math.max(0,m.goal-m.actual),left=hhWorkMinutes(c,Math.max(m.cut,hhScheduleStart(c)),hhScheduleEnd(c)),rate=remaining&&left?Math.ceil(remaining/(left/60)):0;
 const pct=m.goal?Math.min(100,Math.round(m.actual/m.goal*100)):0;
 let acumActual=0,acumExpected=0;
 const peakHour=Math.max(1,...rows.map(function(r){return Math.max(r.actual,r.goal);}));const table=rows.map(function(r){if(!r.future){acumActual+=r.actual;acumExpected+=r.closed?r.goal:r.expected;}const dh=r.future?'—':((r.delta>0?'+':'')+NF.format(Math.round(r.delta))),da=r.future?'—':((acumActual-acumExpected>0?'+':'')+NF.format(Math.round(acumActual-acumExpected))),barWidth=Math.min(100,Math.round(r.actual/peakHour*100));return '<tr class="'+(r.current?'current ':'')+(r.early?'early ':'')+(r.future?'future':'')+'"><td>'+escH(r.slot.label)+(r.early?' · ADIANTADA':(r.current?' · AGORA':''))+'</td><td>'+NF.format(Math.round(r.goal))+'</td><td>'+NF.format(r.actual)+(r.actual?'<span class="hhIndBar"><i style="width:'+barWidth+'%"></i></span>':'')+'</td><td class="'+(r.future?'future':(r.delta>=0?'pos':'neg'))+'">'+dh+'</td><td class="'+(r.future?'future':(acumActual-acumExpected>=0?'pos':'neg'))+'">'+da+'</td></tr>';}).join('');
 const next=pr.queue.slice(0,4);const running=pr.running;
 let productPanel='';
 if(running){const p=running.p,meta=Number(p.qtdDia)||0,day=hhMonV2ActualLine(c.id,iso,m.cut),stopText=m.stop?hhMonV2StopText(m.stop,c,m.cut):'';productPanel='<div class="hhIndProduct"><div class="state">'+(m.label.indexOf('ADIANTADO')>=0?'PRODUÇÃO ADIANTADA · ':'EM PRODUÇÃO · ')+escH(focus?focus.label:'faixa atual')+'</div><div class="name">'+hhMonV2ProductDescription(p)+'</div><div class="qty">'+NF.format(running.q)+' / '+NF.format(Math.round(m.slotGoal))+' pc na faixa · '+NF.format(day)+' / '+NF.format(meta)+' pc no dia'+(p.pv?' · PV '+escH(p.pv):'')+(p.posto?' · '+escH(String(p.posto))+' posto(s)':'')+'</div></div>'+stopText;}
 else if(m.tline.mode==='before'||m.tline.mode==='future'){const p=pr.all[0];productPanel='<div class="hhIndProduct"><div class="state">AGUARDANDO INÍCIO · PRÓXIMA PRODUÇÃO</div><div class="name">'+(p?hhMonV2ProductDescription(p):'Sem produto na programação')+'</div><div class="qty">'+(p?'Programado: '+NF.format(Number(p.qtdDia)||0)+' pc · início previsto '+hhTimeTxt(focus&&focus.start):'')+'</div></div>';}
 else productPanel='<div class="hhIndProduct"><div class="state">EM PRODUÇÃO</div><div class="name">Sem apontamento de produto na faixa vigente</div><div class="qty">Nenhum produto foi marcado como iniciado; não inferi OP ou cliente.</div></div>';
 const shift='Turno A · '+hhTimeTxt(c.hIni,hhScheduleStart(c))+'–'+hhTimeTxt(c.hFim,hhScheduleEnd(c))+(hhMeal(c)&&!hhMeal(c).invalid?' · almoço '+hhTimeTxt(c.almocoIni)+'–'+hhTimeTxt(c.almocoFim):'');
 const expectedNow=Math.round(m.expected),currentSlot=focus?focus.label:'—',minuteLeft=left;
 const missingHint=remaining?(m.tline.mode==='before'?'abre em '+NF.format(Math.max(0,hhScheduleStart(c)-m.cut))+' min · ritmo nec.: '+NF.format(rate)+' pc/h':'em '+NF.format(minuteLeft)+' min · ritmo nec.: '+NF.format(rate)+' pc/h'):'meta diária atingida';
 root.innerHTML='<div class="hhIndividualScreen"><header class="hhIndHead"><div><div class="hhIndBrand">D-LEAN SOLUTIONS</div><h2>CÉLULA '+String(hhLinhasCfg.indexOf(c)+1).padStart(2,'0')+' — '+escH(c.nome).toUpperCase()+'</h2></div><div class="turno">'+shift+'<br>'+hhMonV2DateLabel(iso)+'</div><div class="state '+m.state+'">'+m.label+(m.delta!==0?' · '+(m.delta>0?'+':'')+NF.format(Math.round(m.delta))+' pc':'')+'</div></header><div class="hhIndMain"><section class="hhIndPanel hhIndSummary"><h3>Resumo da célula</h3><div class="hhIndKpis"><div class="hhIndKpi"><div class="lbl">Realizado / Meta dia</div><div class="big">'+NF.format(m.actual)+' <small>/ '+NF.format(m.goal)+' pc</small></div><div class="hint">'+pct+'% da meta · esperado agora: '+NF.format(expectedNow)+' pc</div><div class="hhIndProgress"><i style="width:'+pct+'%"></i></div></div><div class="hhIndKpi"><div class="lbl">Vs. esperado agora</div><div class="big '+(m.delta>=0?'pos':'neg')+'">'+(m.delta>0?'+':'')+NF.format(Math.round(m.delta))+' <small>pc</small></div><div class="hint">Esperado agora: '+NF.format(expectedNow)+' pc</div></div><div class="hhIndKpi"><div class="lbl">Meta hora · '+escH(currentSlot)+'</div><div class="big">'+NF.format(m.slotActual)+' <small>/ '+NF.format(Math.round(m.slotGoal))+' pc</small></div><div class="hint">Esperado agora: '+NF.format(Math.round(m.slotExpected))+' pc</div></div><div class="hhIndKpi"><div class="lbl">Faltam p/ meta dia</div><div class="big">'+NF.format(remaining)+' <small>pc</small></div><div class="hint">'+missingHint+'</div></div></div></section><section class="hhIndPanel hhIndHourly"><h3>HORA A HORA</h3><div class="hhIndTableWrap"><table class="hhIndTable"><thead><tr><th>Hora</th><th>Meta</th><th>Real</th><th>Δ hora</th><th>Δ acum.</th></tr></thead><tbody>'+table+'</tbody></table></div></section><div class="hhIndRight"><section class="hhIndPanel"><h3>EM PRODUÇÃO</h3>'+productPanel+'</section><section class="hhIndPanel" style="margin-top:10px"><h3>PRÓXIMOS NA FILA</h3><ol class="hhIndQueue">'+(next.length?next.map(function(p){return '<li><b>'+hhMonV2ProductDescription(p)+'</b> · '+NF.format(Number(p.qtdDia)||0)+' pc</li>';}).join(''):'<li>Sem próximo produto na programação.</li>')+'</ol></section></div></div><footer class="hhIndFooter"><span>Precisa de ajuda? Acione o andon da célula — líder, qualidade, manutenção ou logística.</span><span>atualizado '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')+'</span></footer></div>'
}
function hhMonV2Render(iso,now){
 const s=window._hhMonitorScreen||'chao';
 const selector=document.querySelector('#viewHH .hhIndividualSelect');if(selector)selector.style.display=s==='individual'?'flex':'none';
 const sel=document.getElementById('hhMonCellSelect'),wanted=window._hhMonV2CellId||((hhLinhasCfg[0]||{}).id||'');
 if(sel){const sig=hhLinhasCfg.map(function(c){return c.id+':'+c.nome;}).join('|');if(sel.getAttribute('data-sig')!==sig){sel.innerHTML=hhLinhasCfg.map(function(c){return '<option value="'+escH(c.id)+'">'+escH(c.nome)+'</option>';}).join('');sel.setAttribute('data-sig',sig);}if(wanted)sel.value=wanted;if(!sel.value&&hhLinhasCfg[0])sel.value=hhLinhasCfg[0].id;window._hhMonV2CellId=sel.value;}
 hhMonV2Factory(iso,now);
 if(s==='individual')hhMonV2CellScreen(iso,now);
}
// Keep original operational render intact; add the two monitor surfaces after it.
window._hhRenderOperationalBase=hhRender;
hhRender=function(){window._hhRenderOperationalBase();hhMonV2Render(hhDiaSelIso(),new Date());};
window.hhRender=hhRender;
// Screen-specific presentation mode; fullscreen follows the currently selected monitor.
hhTvToggle=function(){
 const body=document.body,on=!body.classList.contains('hhTv'),screen=window._hhMonitorScreen||'chao';
 body.classList.toggle('hhTv',on);body.classList.toggle('hhTvIndividual',on&&screen==='individual');
 const bt=document.getElementById('hhTvBtn');if(bt)bt.textContent=on?'✕ Sair da tela cheia':'⛶ Tela cheia';
 let x=document.getElementById('hhTvExit');if(on){if(!x){x=document.createElement('button');x.id='hhTvExit';x.textContent='✕';x.title='Sair da tela cheia (ESC)';x.addEventListener('click',function(){if(document.body.classList.contains('hhTv'))hhTvToggle();});document.body.appendChild(x);}x.style.display='block';try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)document.documentElement.requestFullscreen().catch(function(){});}catch(e){}}
 else{if(x)x.style.display='none';try{if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(function(){});}catch(e){}}
 try{hhMonV2Render(hhDiaSelIso(),new Date());}catch(e){}
};
function hhMonV2InitScreen(){
 document.querySelectorAll('#viewHH [data-hh-view]').forEach(function(b){
  if(b._hhMonV2Bound)return;b._hhMonV2Bound=true;
  b.addEventListener('click',function(e){e.stopPropagation();hhSetMonitorScreen(b.getAttribute('data-hh-view'));hhRender();if(b.getAttribute('data-hh-view')==='gestao'&&window.echarts&&hhChart)setTimeout(function(){hhChart.resize();},80);});
 });
 const sel=document.getElementById('hhMonCellSelect');
 if(sel&&!sel._hhMonV2Bound){sel._hhMonV2Bound=true;sel.addEventListener('change',function(){window._hhMonV2CellId=sel.value;hhRender();});}
 if(sel){const sig=hhLinhasCfg.map(function(c){return c.id+':'+c.nome;}).join('|');if(sel.getAttribute('data-sig')!==sig){const current=window._hhMonV2CellId||sel.value;sel.innerHTML=hhLinhasCfg.map(function(c){return '<option value="'+escH(c.id)+'">'+escH(c.nome)+'</option>';}).join('');sel.setAttribute('data-sig',sig);if(current&&hhLinhasCfg.some(function(c){return c.id===current;}))sel.value=current;}if(!sel.value&&hhLinhasCfg.length)sel.value=hhLinhasCfg[0].id;window._hhMonV2CellId=sel.value;}
 const tv=document.getElementById('hhTvBtn');
 if(tv&&!tv._hhMonV2Bound){tv._hhMonV2Bound=true;tv.addEventListener('click',function(){hhTvToggle();});}
}

hhMonV2InitScreen();
setInterval(function(){const v=document.getElementById('viewHH');if(v&&v.classList.contains('on')){try{hhMonV2Render(hhDiaSelIso(),new Date());}catch(e){}}},5000);

// v0.0.425: após o carregamento assíncrono do estado, redesenha os dois monitores.

setTimeout(function(){try{hhMonV2InitScreen();if(typeof hhInit==='function')hhInit();if(typeof hhRender==='function')hhRender();}catch(e){}},0);

// ===== v0.0.431 OVERRIDE — Monitores Geral/Individual DARK conforme modelo Dante (TV 1920x1080) =====
function hh431DateLabel(iso){try{const d=new Date(String(iso)+'T12:00:00');const mo=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getMonth()];return ['dom','seg','ter','qua','qui','sex','sáb'][d.getDay()]+' · '+String(d.getDate()).padStart(2,'0')+' '+mo+' '+d.getFullYear();}catch(e){return String(iso);}}
function hh431ClockFull(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0');}
function hh431Delta(v){return (v>0?'+':'')+NF.format(Math.round(v));}
function hh431Icon(m){if(m.stop)return '■';if(m.state==='late')return '▼';if(m.state==='warn')return '⚠';if(m.state==='ahead')return '▲';return '○';}
function hh431ProductDay(l,iso,cod){let q=0;hhApontValidos().forEach(function(a){if(a.linha===l&&a.data===iso&&hhApontAtivo(a)&&String(a.cod)===String(cod)&&!hhApFase(a))q+=Number(a.qtd)||0;});return q;}
function hh431TagClass(m,future){if(future)return 'gray';if(m.stop)return 'red';if(m.state==='warn')return 'yellow';if(m.state==='late')return 'red';return '';}
function hh431FactoryCard(c,index,iso,now,m){
 const rows=hhMonV2SlotRows(c,iso,now),pr=hhMonV2Products(c,iso,now,m),foc=m.focus;
 const progress=Math.min(100,m.progress),falta=Math.max(0,m.goal-m.actual);
 const slotLabel=foc?foc.label:'—',future=m.tline.mode==='before'||m.tline.mode==='future';
 const peak=Math.max(1,...rows.map(function(r){return Math.max(r.actual,r.goal);}));
 const chart=rows.map(function(r){const realPct=Math.min(100,r.actual/peak*100),targetPct=Math.min(100,r.goal/peak*100);let cls=r.future?'future':(r.delta>=-0.5?'':(r.delta/Math.max(1,r.expected)>=-0.05?'warn':'late'));return '<div class="hhFcHour" title="'+escH(r.slot.label)+' · meta '+NF.format(Math.round(r.goal))+' · real '+NF.format(r.actual)+'"><div class="hhFcPlot"><i class="hhFcBar '+cls+'" style="height:'+realPct+'%"></i><i class="hhFcTarget" style="bottom:'+targetPct+'%"></i></div><small>'+String(Math.floor(r.slot.start/60)).padStart(2,'0')+(r.slot.start%60?':'+String(r.slot.start%60).padStart(2,'0'):'')+'</small></div>';}).join('');
 let emProd;
 if(pr.running){const p=pr.running.p,day=hh431ProductDay(c.id,iso,p.cod);emProd='<div class="hhFcProduct"><span class="tag '+(future?'gray':hh431TagClass(m))+'">'+(future?'PRÓXIMA':'EM PRODUÇÃO')+'</span><span class="prod">'+hhMonV2ProductDescription(p)+'</span><span class="qty">'+NF.format(day)+' / '+NF.format(Number(p.qtdDia)||0)+' pc</span></div>';}
 else{const p=pr.all[0];emProd='<div class="hhFcProduct"><span class="tag gray">EM PRODUÇÃO</span><span class="prod">'+(p?hhMonV2ProductDescription(p):'Sem produto programado')+'</span><span class="qty">'+(p?NF.format(Number(p.qtdDia)||0)+' pc':'—')+'</span></div>';}
 const queue=pr.queue.slice(0,2).map(function(p){return '<div class="row"><b>'+hhMonV2ProductDescription(p)+'</b><span>'+NF.format(Number(p.qtdDia)||0)+' pc</span></div>';}).join('');
 const stop=m.stop?hhMonV2StopText(m.stop,c,m.cut):'';
 return '<article class="hhFactoryCard '+m.state+'"><header class="hhFactoryCardHead"><div class="cellname"><span class="cellnum">CÉL '+String(index+1).padStart(2,'0')+'</span>'+escH(c.nome)+'</div><span class="status">'+hh431Icon(m)+' '+escH(m.label)+'</span></header><div class="hhFactoryCardBody">'+
 '<div class="hhFcRow"><div class="hhFcMetric"><div class="lbl">Realizado / Meta dia</div><div class="val">'+NF.format(m.actual)+' <small>/ '+NF.format(m.goal)+' pc</small></div><div class="hhFcProgress"><i style="width:'+progress+'%"></i></div><div class="hint">'+progress+'% da meta · '+NF.format(falta)+' pc faltantes</div></div>'+
 '<div class="hhFcMetric"><div class="lbl">Vs. esperado ('+NF.format(Math.round(m.expected))+')</div><div class="delta '+(m.delta<0?'neg':'')+'">'+hh431Delta(m.delta)+' pc</div><div class="hint">esperado agora: '+NF.format(Math.round(m.expected))+'</div></div></div>'+
 '<div class="hhFcRow"><div class="hhFcMetric"><div class="lbl">Meta hora · '+escH(slotLabel)+'</div><div class="val">'+NF.format(m.slotActual)+' <small>/ '+NF.format(Math.round(m.slotGoal))+' pc</small></div><div class="hint">esperado agora: '+NF.format(Math.round(m.slotExpected))+'</div></div>'+
 '<div><div class="hhFcChartTitle"><span>HORA A HORA</span><span>meta hora — tracejada</span></div><div class="hhFcChart">'+chart+'</div></div></div>'+
 emProd+(queue?'<div class="hhFcQueue"><div class="title">PRÓXIMOS</div>'+queue+'</div>':'')+stop+
 '</div></article>';
}
function hhMonV2Factory431(iso,now){
 const root=document.getElementById('hhFactoryScreen');if(!root)return;
 const d=now||new Date(),cells=hhLinhasCfg.slice(),rows=cells.map(function(c){return {c:c,m:hhMonV2State(c,iso,d)};});
 const sums=rows.reduce(function(a,x){a.actual+=x.m.actual;a.goal+=x.m.goal;a.expected+=x.m.expected;a.delta+=x.m.delta;a[x.m.state]=(a[x.m.state]||0)+1;return a;},{actual:0,goal:0,expected:0,delta:0,ahead:0,steady:0,warn:0,late:0,stop:0,wait:0});
 const first=cells[0],turno=first?('Turno A · '+hhClockTxt(hhScheduleStart(first))+' - '+hhClockTxt(hhScheduleEnd(first))):'';
 const cards=rows.map(function(x,i){return hh431FactoryCard(x.c,i,iso,d,x.m);}).join('');
 const counts=[['','ADIANTADAS / NO RITMO',(sums.ahead+sums.steady)],['warn','ATENÇÃO',sums.warn],['late','ATRASADAS',sums.late],['stop','PARADA',sums.stop],['wait','AGUARDANDO',sums.wait]].map(function(x){return '<div class="hhFactoryCount"><i class="hhFactoryDot '+x[0]+'"></i><b>'+NF.format(x[2])+'</b> '+x[1]+'</div>';}).join('');
 root.innerHTML='<div class="hhFactoryScreen"><header class="hhFactoryHead"><div class="hhFactoryBrand">D-LEAN SOLUTIONS<strong>Andon · Produção</strong><span class="hhFactoryTurno">'+escH(turno)+'</span></div>'+
 '<div class="hhFactoryHero"><div class="lbl">Fábrica · Realizado / Meta dia</div><div class="num">'+NF.format(sums.actual)+' <small>/ '+NF.format(sums.goal)+' pc</small></div><div class="sub">VS. ESPERADO AGORA <b style="color:'+(sums.delta>=0?'#2BD576':'#E5484D')+'">'+hh431Delta(sums.delta)+' pc</b></div></div>'+
 '<div class="hhFactoryCounts">'+counts+'</div>'+
 '<div class="hhFactoryClock"><div class="time">'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+'</div><div class="date">'+hh431DateLabel(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))+'</div></div></header>'+
 '<div class="hhFactoryCards">'+(rows.length?cards:'<div class="hhEmpty">Sem células programadas para esta data.</div>')+'</div>'+
 '<div class="hhFactoryLegend"><span><i class="hhFactoryDot"></i> Adiantado · realizado ≥ esperado</span><span><i class="hhFactoryDot warn"></i> Atenção · até −5%</span><span><i class="hhFactoryDot late"></i> Atrasado · abaixo de −5%</span><span><i class="hhFactoryDot stop"></i> Parada · célula sem produzir</span><span><i class="hhLegendLine"></i> meta hora</span></div>'+
 '<div class="hhFactoryFoot"><span>Esperado = meta proporcional ao tempo do turno.</span><span>atualizado '+hh431ClockFull()+'</span></div></div>';
}
function hhMonV2Individual431(iso,now){
 const root=document.getElementById('hhIndividualScreen');if(!root)return;
 const d=now||new Date(),sel=document.getElementById('hhMonCellSelect');let id=(window._hhMonV2CellId)||(sel&&sel.value)||((hhLinhasCfg[0]||{}).id||'');
 let c=hhLinhasCfg.find(function(x){return x.id===id;});if(!c){c=hhLinhasCfg[0];id=c&&c.id;}
 if(!c){root.innerHTML='<div class="hhEmpty">Nenhuma célula programada.</div>';return;}
 if(sel&&sel.value!==id)sel.value=id;window._hhMonV2CellId=id;
 const m=hhMonV2State(c,iso,d),rows=hhMonV2SlotRows(c,iso,d),pr=hhMonV2Products(c,iso,d,m),focus=m.focus;
 const remaining=Math.max(0,m.goal-m.actual),left=hhWorkMinutes(c,Math.max(m.cut,hhScheduleStart(c)),hhScheduleEnd(c)),rate=remaining&&left?Math.ceil(remaining/(left/60)):0;
 const pct=m.goal?Math.min(100,Math.round(m.actual/m.goal*100)):0;
 const progCls=m.stop||m.state==='late'?'red':(m.state==='warn'?'warn':(m.state==='wait'?'gray':''));
 let acumA=0,acumE=0;
 const table=rows.map(function(r){if(!r.future){acumA+=r.actual;acumE+=r.closed?r.goal:r.expected;}const dh=r.future?'—':hh431Delta(r.delta),da=r.future?'—':hh431Delta(acumA-acumE);return '<tr class="'+(r.current?'current ':'')+(r.early?'early ':'')+(r.future?'future':'')+'"><td>'+escH(r.slot.label)+(r.early?' · adiantada':(r.current?' · agora':''))+'</td><td>'+NF.format(Math.round(r.goal))+'</td><td>'+NF.format(r.actual)+'</td><td class="'+(r.future?'future':(r.delta>=0?'pos':'neg'))+'">'+dh+'</td><td class="'+(r.future?'future':(acumA-acumE>=0?'pos':'neg'))+'">'+da+'</td></tr>';}).join('');
 let prodPanel;
 if(pr.running){const p=pr.running.p,meta=Number(p.qtdDia)||0,day=hh431ProductDay(c.id,iso,p.cod),pctP=meta?Math.min(100,Math.round(day/meta*100)):0,stopText=m.stop?hhMonV2StopText(m.stop,c,m.cut):'';
  prodPanel='<div class="hhIndProduct"><span class="tag '+hh431TagClass(m)+'">EM PRODUÇÃO</span><div class="name">'+hhMonV2ProductDescription(p)+'</div><div class="meta">'+(p.pv?'PV '+escH(p.pv):(p.ward?'Lote WARD (Supermercado)':'sem destino definido'))+' · '+escH(focus?focus.label:'faixa atual')+'</div><div class="qty">'+NF.format(day)+' / '+NF.format(meta)+' pc</div><div class="bar"><i style="width:'+pctP+'%"></i></div><div class="hint">faltam '+NF.format(Math.max(0,meta-day))+' pc p/ a quantidade do dia</div></div>'+stopText;}
 else{const p=pr.all[0];prodPanel='<div class="hhIndProduct"><span class="tag gray">EM PRODUÇÃO</span><div class="name">'+(p?hhMonV2ProductDescription(p):'Sem produto programado')+'</div><div class="meta">'+(m.tline.mode==='before'||m.tline.mode==='future'?'aguardando abertura da célula':'sem apontamento na faixa vigente')+'</div></div>';}
 const queue=pr.queue.slice(0,3).map(function(p,i){return '<li><span class="n">'+(i+1)+'</span><span class="who"><b>'+hhMonV2ProductDescription(p)+'</b><small>'+(p.pv?'PV '+escH(p.pv):(p.ward?'Lote WARD':'—'))+'</small></span><span class="qty">'+NF.format(Number(p.qtdDia)||0)+' pc</span></li>';}).join('');
 const shift='Turno A · '+hhClockTxt(hhScheduleStart(c))+' - '+hhClockTxt(hhScheduleEnd(c));
 const missingHint=remaining?(m.tline.mode==='before'?'abre em '+NF.format(Math.max(0,hhScheduleStart(c)-m.cut))+' min · ritmo nec.: '+NF.format(rate)+' pc/h':'em '+NF.format(left)+' min · ritmo nec.: '+NF.format(rate)+' pc/h'):'meta diária atingida';
 root.innerHTML='<div class="hhIndividualScreen"><header class="hhIndBanner '+m.state+'"><div><div class="hhIndBrand">D-LEAN SOLUTIONS</div><h2>CÉLULA '+String(hhLinhasCfg.indexOf(c)+1).padStart(2,'0')+' — '+escH(c.nome).toUpperCase()+'</h2><div class="turno">'+escH(shift)+'</div></div>'+
 '<div class="hhIndState">'+hh431Icon(m)+' '+escH(m.label)+'<small>'+hh431Delta(m.delta)+' pc</small></div>'+
 '<div class="hhIndClock"><div class="time">'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+'</div><div class="date">'+hh431DateLabel(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))+'</div></div></header>'+
 '<div class="hhIndMain"><section class="hhIndPanel hhIndSummary"><h3>RESUMO DA CÉLULA</h3>'+
 '<div class="lbl">Realizado / Meta dia</div><div class="big">'+NF.format(m.actual)+' <small>/ '+NF.format(m.goal)+' pc</small></div><div class="hint">'+pct+'% da meta · esperado agora: '+NF.format(Math.round(m.expected))+' pc</div><div class="hhIndProgress '+progCls+'"><i style="width:'+pct+'%"></i></div>'+
 '<div class="lbl">Meta hora · '+escH(focus?focus.label:'—')+'</div><div class="big">'+NF.format(m.slotActual)+' <small>/ '+NF.format(Math.round(m.slotGoal))+' pc</small></div><div class="hint">esperado agora: '+NF.format(Math.round(m.slotExpected))+' pc</div>'+
 '<div class="lbl">Faltam p/ meta dia</div><div class="big">'+NF.format(remaining)+' <small>pc</small></div><div class="hint">'+escH(missingHint)+'</div></section>'+
 '<section class="hhIndPanel"><h3>HORA A HORA <small>Δ = realizado − meta</small></h3><table class="hhIndTable"><thead><tr><th>Hora</th><th>Meta</th><th>Real</th><th>Δ hora</th><th>Δ acum.</th></tr></thead><tbody>'+table+'</tbody></table></section>'+
 '<div class="hhIndRight"><section class="hhIndPanel"><h3>EM PRODUÇÃO</h3>'+prodPanel+'</section><section class="hhIndPanel"><h3>PRÓXIMOS NA FILA</h3><ol class="hhIndQueue">'+(queue||'<li>Sem próximo produto na programação.</li>')+'</ol></section></div></div>'+
 '<footer class="hhIndFooter"><span>Precisa de ajuda? Acione o andon da célula — líder, qualidade, manutenção ou logística.</span><span>atualizado '+hh431ClockFull()+'</span></footer></div>';
}
hhMonV2Render=function(iso,now){
 try{hhMonV2Factory431(iso,now);}catch(e){console.error('hh431 geral',e);}
 try{hhMonV2Individual431(iso,now);}catch(e){console.error('hh431 individual',e);}
};
setTimeout(function(){try{hhMonV2Render(hhDiaSelIso(),new Date());}catch(e){}},0);

