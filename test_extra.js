// test_extra.js — Suite di test aggiuntivi per Ferticontrol
// Copre: bilancio cariche, EC vs target, compatibilità serbatoi, casi limite
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('/home/user/Ferticontrol/Ferticontrol/Ferticontrol1.html', 'utf8');
const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g)||[];
let allJs = scripts.map(s=>s.replace(/<script[^>]*>/,'').replace(/<\/script>/,'')).join('\n');
allJs = allJs.replace(/^(\s*)(const|let)\s+/gm, '$1var ');

// ── Stub DOM ──────────────────────────────────────────────────────
const mockEl = {
  value:'', style:{display:'block',visibility:'',color:'',backgroundColor:'',
    width:'',height:'',opacity:'',border:'',margin:'',padding:'',fontSize:''},
  textContent:'', innerHTML:'', id:'', className:'',
  classList:{add:()=>{},remove:()=>{},contains:()=>false,toggle:()=>{}},
  dataset:{}, addEventListener:()=>{}, removeEventListener:()=>{},
  appendChild:()=>mockEl, removeChild:()=>mockEl, insertBefore:()=>mockEl,
  querySelector:()=>mockEl, querySelectorAll:()=>[],
  closest:()=>mockEl, parentElement:null, parentNode:null,
  children:[], childNodes:[],
  scrollIntoView:()=>{}, focus:()=>{}, blur:()=>{}, click:()=>{},
  setAttribute:()=>{}, getAttribute:()=>null, removeAttribute:()=>{},
  contains:()=>false, matches:()=>false,
  offsetHeight:0, offsetWidth:0, scrollTop:0, scrollHeight:0
};
mockEl.parentElement = mockEl;
mockEl.parentNode = mockEl;

global.document = {
  getElementById: ()=>({...mockEl}),
  querySelectorAll: ()=>[],
  querySelector: ()=>mockEl,
  createElement: (tag)=>({...mockEl, tagName:tag.toUpperCase(), appendChild:()=>mockEl}),
  createTextNode: (t)=>({textContent:t}),
  addEventListener: ()=>{},
  removeEventListener: ()=>{},
  body:{...mockEl, appendChild:()=>mockEl},
  head:{...mockEl, appendChild:()=>mockEl},
  documentElement:{...mockEl},
  title:'', cookie:''
};
global.window = global;
global.window.location = {href:'', hash:'', search:'', pathname:'/', hostname:'localhost'};
global.window.addEventListener = ()=>{};
global.window.removeEventListener = ()=>{};
global.window.history = {pushState:()=>{}, replaceState:()=>{}};
global.window.scrollTo = ()=>{};
global.window.innerWidth = 1024;
global.window.innerHeight = 768;
global.localStorage = { getItem:()=>null, setItem:()=>{}, removeItem:()=>{}, clear:()=>{} };
global.sessionStorage = { getItem:()=>null, setItem:()=>{}, removeItem:()=>{}, clear:()=>{} };
global.navigator = { userAgent:'node', language:'it-IT' };
global.location = global.window.location;
global.showToast = ()=>{};
global.alert = ()=>{};
global.confirm = ()=>true;
global.prompt = ()=>'';
global.renderCalcTabella = ()=>{};
global.renderRicetteCustom = ()=>{};
global.initPiante = ()=>{};
global.aggiornaStat = ()=>{};
global.Chart = function(){return{data:{datasets:[]},update:()=>{},destroy:()=>{}};};
global.requestAnimationFrame = (f)=>setTimeout(f,0);
global.cancelAnimationFrame = ()=>{};

try { vm.runInThisContext(allJs); } catch(e) {}

const required = ['profiloDaRighe','ecFromIons','meqBalance','autoRisolvi','correggiDosi',
                   'verificaSicurezza','getSale','PIANTE_BUILTIN','coppiaIncompatibile'];
const missing = required.filter(f => typeof global[f] === 'undefined');
if (missing.length) { console.error('Missing globals:', missing.join(', ')); process.exit(1); }

// ── Preset acqua ──────────────────────────────────────────────────
const AQ_OTTIMA = {ec:0.1, ph:6.8, ca:10, mg:2, k:1, na:5,  so4:5, cl:5, hco3:20,  no3:2, fe:0.01};
const AQ_MEDIA  = {ec:0.3, ph:7.2, ca:80, mg:20,k:5, na:30, so4:40,cl:50,hco3:150, no3:10,fe:0.1};

const DIL = 100;
const PH_FINALE = 6.0;
global.usaSerbC = false;

function prepRighe(fase, aq) {
  let r = fase.sali.map(s => {
    const info = getSale(s.id);
    return { id:s.id, nome:info?.nome||s.id, dose:s.g, prezzo:info?.prezzo||0 };
  });
  r = correggiDosi(r, aq).righe;
  r = autoRisolvi(r, DIL, aq).righe;
  return r;
}

// ══════════════════════════════════════════════════════════════════
// TEST 1 — Bilancio delle cariche (cationi ≈ anioni in meq/L)
// Tolleranza: WARN se cat/an fuori [0.75, 1.30], FAIL se fuori [0.55, 1.50]
// Nota: i sali da fertirrigazione hanno sempre un leggero surplus cationico
// perché i microelementi cationici (Fe, Mn, Zn, Cu) non compaiono nell'anion sum.
// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log('TEST 1 — Bilancio Cariche (meqBalance, acqua ottima)');
console.log('══════════════════════════════════════════════════════');

let t1_total=0, t1_warn=0, t1_fail=0;
PIANTE_BUILTIN.forEach(pianta => {
  pianta.fasi.forEach(fase => {
    t1_total++;
    const key = `${pianta.nome} | ${fase.nome}`;
    try {
      const righe = prepRighe(fase, AQ_OTTIMA);
      const profilo = profiloDaRighe(righe, AQ_OTTIMA);
      const bal = meqBalance(profilo, PH_FINALE);
      if(bal.an < 0.01) { console.log(`  SKIP  ${key}  (anioni ~ 0)`); return; }
      const ratio = bal.cat / bal.an;
      const ratioStr = ratio.toFixed(2);
      if(ratio < 0.55 || ratio > 1.50) {
        t1_fail++;
        console.log(`  FAIL  ${key}  cat/an=${ratioStr}  (cat=${bal.cat.toFixed(1)} an=${bal.an.toFixed(1)} mmol/L)`);
      } else if(ratio < 0.75 || ratio > 1.30) {
        t1_warn++;
        console.log(`  WARN  ${key}  cat/an=${ratioStr}`);
      }
    } catch(e) {
      t1_fail++;
      console.log(`  FAIL  ${key}  ERRORE: ${e.message}`);
    }
  });
});
console.log(`\n  Risultato: ${t1_fail} FAIL, ${t1_warn} WARN su ${t1_total} check`);

// ══════════════════════════════════════════════════════════════════
// TEST 2 — EC calcolata vs target di fase
// Usa acqua "ottima" (EC 0.1 mS/cm) per non gonfiare il confronto.
// WARN se EC fuori [target_min*0.70, target_max*1.40]
// FAIL se EC fuori [target_min*0.40, target_max*2.00]
// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log('TEST 2 — EC Calcolata vs Target di Fase (acqua ottima)');
console.log('══════════════════════════════════════════════════════');

let t2_total=0, t2_warn=0, t2_fail=0;
PIANTE_BUILTIN.forEach(pianta => {
  pianta.fasi.forEach(fase => {
    if(!fase.ec || fase.ec.length < 2) return;
    t2_total++;
    const key = `${pianta.nome} | ${fase.nome}`;
    const ecMin = fase.ec[0], ecMax = fase.ec[1];
    try {
      const righe = prepRighe(fase, AQ_OTTIMA);
      const profilo = profiloDaRighe(righe, AQ_OTTIMA);
      const ec = ecFromIons(profilo, PH_FINALE);
      const tooLow  = ec < ecMin * 0.70;
      const tooHigh = ec > ecMax * 1.40;
      const veryLow  = ec < ecMin * 0.40;
      const veryHigh = ec > ecMax * 2.00;
      const ecStr = ec.toFixed(2);
      const tgStr = `[${ecMin}–${ecMax}]`;
      if(veryLow || veryHigh) {
        t2_fail++;
        console.log(`  FAIL  ${key}  EC=${ecStr} target=${tgStr} mS/cm`);
      } else if(tooLow || tooHigh) {
        t2_warn++;
        console.log(`  WARN  ${key}  EC=${ecStr} target=${tgStr} mS/cm`);
      }
    } catch(e) {
      t2_fail++;
      console.log(`  FAIL  ${key}  ERRORE: ${e.message}`);
    }
  });
});
console.log(`\n  Risultato: ${t2_fail} FAIL, ${t2_warn} WARN su ${t2_total} check`);

// ══════════════════════════════════════════════════════════════════
// TEST 3 — Compatibilità serbatoi
// Dopo autoRisolvi: nessun serbatoio deve contenere una coppia incompatibile.
// Usa acqua "media" (caso realistico con HCO3 = 150).
// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log('TEST 3 — Compatibilità Serbatoi (autoRisolvi, acqua media)');
console.log('══════════════════════════════════════════════════════');

let t3_total=0, t3_fail=0;
PIANTE_BUILTIN.forEach(pianta => {
  pianta.fasi.forEach(fase => {
    t3_total++;
    const key = `${pianta.nome} | ${fase.nome}`;
    try {
      const righe = prepRighe(fase, AQ_MEDIA);
      const perSerb = {A:[], B:[], C:[]};
      righe.forEach(r => {
        const s = r.serb || 'A';
        if(perSerb[s]) perSerb[s].push(r);
      });
      const conflitti = [];
      ['A','B','C'].forEach(sk => {
        const lista = perSerb[sk];
        for(let i=0; i<lista.length; i++){
          for(let j=i+1; j<lista.length; j++){
            const infoA = getSale(lista[i].id) || {id:lista[i].id};
            const infoB = getSale(lista[j].id) || {id:lista[j].id};
            infoA.id = lista[i].id; infoB.id = lista[j].id;
            const res = coppiaIncompatibile(infoA, infoB);
            if(res.incompat && res.gravita === 'C') {
              conflitti.push(`Serb.${sk}: ${lista[i].id} + ${lista[j].id} → ${res.p}`);
            }
          }
        }
      });
      if(conflitti.length) {
        t3_fail++;
        console.log(`  FAIL  ${key}`);
        conflitti.forEach(c => console.log(`        ${c}`));
      }
    } catch(e) {
      t3_fail++;
      console.log(`  FAIL  ${key}  ERRORE: ${e.message}`);
    }
  });
});
console.log(`\n  Risultato: ${t3_fail} FAIL su ${t3_total} check`);

// ══════════════════════════════════════════════════════════════════
// TEST 4 — Casi limite input acqua
// Verifica che l'app non vada in crash con input estremi.
// Non si chiede sicurezza garantita, solo assenza di eccezioni.
// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log('TEST 4 — Casi Limite Input Acqua');
console.log('══════════════════════════════════════════════════════');

const CASI_ESTREMI = [
  {nome:'Acqua salinissima (Na/Cl alti)',    aq:{ec:2.0,ph:7.5,ca:200,mg:50,k:10,na:300,so4:150,cl:400,hco3:200,no3:20,fe:0.5}},
  {nome:'pH alcalino estremo (pH 9)',         aq:{ec:0.4,ph:9.0,ca:60, mg:15,k:3, na:20, so4:30, cl:20, hco3:600,no3:5, fe:0.1}},
  {nome:'pH acido estremo (pH 4.5)',          aq:{ec:0.2,ph:4.5,ca:20, mg:5, k:2, na:10, so4:15, cl:10, hco3:5,  no3:3, fe:0.2}},
  {nome:'Acqua nulla (null)',                 aq:null},
  {nome:'Acqua distillata pura (tutti zero)', aq:{ec:0.001,ph:7.0,ca:0,mg:0,k:0,na:0,so4:0,cl:0,hco3:0,no3:0,fe:0}},
  {nome:'HCO3 elevatissimo (800 mg/L)',       aq:{ec:0.8,ph:8.2,ca:200,mg:40,k:5,na:50,so4:60,cl:30,hco3:800,no3:5,fe:0.1}},
];

let t4_total=0, t4_crash=0;

// Usa solo 2 colture × 1 fase ciascuna per velocità
const piante_edge = [PIANTE_BUILTIN[0], PIANTE_BUILTIN[1]];

CASI_ESTREMI.forEach(({nome: nomeAq, aq}) => {
  piante_edge.forEach(pianta => {
    const fase = pianta.fasi[0];
    t4_total++;
    const key = `[${nomeAq}] ${pianta.nome} | ${fase.nome}`;
    try {
      let righe = fase.sali.map(s => {
        const info = getSale(s.id);
        return { id:s.id, nome:info?.nome||s.id, dose:s.g, prezzo:info?.prezzo||0 };
      });
      righe = correggiDosi(righe, aq).righe;
      righe = autoRisolvi(righe, DIL, aq).righe;
      const sic = verificaSicurezza(righe, DIL, aq, PH_FINALE);
      const ec = ecFromIons(profiloDaRighe(righe, aq), PH_FINALE);
      // Non controlliamo se sicuro o no — solo che non crasha e restituisce valori sensati
      if(!isFinite(ec) || ec < 0) {
        t4_crash++;
        console.log(`  FAIL  ${key}  EC non finita: ${ec}`);
      } else {
        console.log(`  OK    ${key}  EC=${ec.toFixed(2)} mS/cm  sicuro=${sic.sicuro}`);
      }
    } catch(e) {
      t4_crash++;
      console.log(`  CRASH ${key}  ERRORE: ${e.message}`);
    }
  });
});
console.log(`\n  Risultato: ${t4_crash} CRASH/FAIL su ${t4_total} casi`);

// ══════════════════════════════════════════════════════════════════
// RIEPILOGO FINALE
// ══════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════');
console.log('RIEPILOGO FINALE');
console.log('══════════════════════════════════════════════════════');
console.log(`  Test 1 Bilancio Cariche:   ${t1_fail} FAIL, ${t1_warn} WARN su ${t1_total}`);
console.log(`  Test 2 EC vs Target:       ${t2_fail} FAIL, ${t2_warn} WARN su ${t2_total}`);
console.log(`  Test 3 Compatib. Serb.:    ${t3_fail} FAIL su ${t3_total}`);
console.log(`  Test 4 Casi Limite:        ${t4_crash} CRASH/FAIL su ${t4_total}`);
const totalFail = t1_fail + t2_fail + t3_fail + t4_crash;
const totalTest = t1_total + t2_total + t3_total + t4_total;
console.log(`\n  TOTALE: ${totalFail} FAIL su ${totalTest} check`);
