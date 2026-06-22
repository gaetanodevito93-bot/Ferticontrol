// Test runner headless per Ferticontrol
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('/home/user/Ferticontrol/Ferticontrol/Ferticontrol1.html', 'utf8');
const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g)||[];
// const/let inside vm.runInThisContext still don't become globals; convert to var
let allJs = scripts.map(s=>s.replace(/<script[^>]*>/,'').replace(/<\/script>/,'')).join('\n');
allJs = allJs.replace(/^(\s*)(const|let)\s+/gm, '$1var ');

// ── Stub DOM completo ──────────────────────────────────────────────
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

// Carica il JS dell'app — vm.runInThisContext è necessario perché eval()
// in un modulo Node.js scopa var alla funzione wrapper del modulo, non a global
try { vm.runInThisContext(allJs); } catch(e) {
  // ignora errori DOM (initPiante chiama elementi che non esistono)
}

// Verifica che le funzioni core siano disponibili
const required = ['siForIons','autoRisolvi','autoBilanciaSali','verificaSicurezza',
                   'correggiDosi','getSale','PIANTE_BUILTIN','catalogo'];
const missing = required.filter(f => typeof global[f] === 'undefined');
if (missing.length) { console.error('Missing:', missing.join(', ')); process.exit(1); }

// ── Preset acqua ──────────────────────────────────────────────────
const ACQUE = {
  ottima:     {ec:0.1,  ph:6.8, ca:10,  mg:2,  k:1, na:5,  so4:5,  cl:5,  hco3:20,  no3:2,  fe:0.01},
  media:      {ec:0.3,  ph:7.2, ca:80,  mg:20, k:5, na:30, so4:40, cl:50, hco3:150, no3:10, fe:0.1},
  dura:       {ec:0.7,  ph:7.8, ca:180, mg:45, k:8, na:60, so4:90, cl:80, hco3:320, no3:15, fe:0.2},
  osmosi:     {ec:0.02, ph:6.5, ca:2,   mg:1,  k:0, na:2,  so4:1,  cl:2,  hco3:5,   no3:1,  fe:0.01},
  piovana:    {ec:0.05, ph:6.2, ca:3,   mg:1,  k:1, na:2,  so4:2,  cl:2,  hco3:8,   no3:1,  fe:0.01},
  distillata: {ec:0.001,ph:7.0, ca:0,   mg:0,  k:0, na:0,  so4:0,  cl:0,  hco3:0,   no3:0,  fe:0},
};

const DIL = 100;
const PH_FINALE = 6.0;
global.usaSerbC = false;

// ── Test runner ───────────────────────────────────────────────────
let total=0, fails=0;
const issueMap = {};
const failures = [];

PIANTE_BUILTIN.forEach(pianta => {
  pianta.fasi.forEach(fase => {
    Object.entries(ACQUE).forEach(([nomeAcqua, aq]) => {
      total++;
      const key = `${pianta.nome} | ${fase.nome} | ${nomeAcqua}`;
      try {
        let righe = fase.sali.map(s => {
          const info = getSale(s.id);
          return { id:s.id, nome:info?.nome||s.id, dose:s.g, prezzo:info?.prezzo||0 };
        });

        // correzione acqua
        righe = correggiDosi(righe, aq).righe;

        // assegnazione serbatoi + conflitti
        righe = autoRisolvi(righe, DIL, aq).righe;

        // verifica
        let sic = verificaSicurezza(righe, DIL, aq, PH_FINALE);

        // tentativo auto-bilancio
        let balanced = false;
        if (!sic.sicuro) {
          const bil = autoBilanciaSali(righe, aq, DIL, {phFinale:PH_FINALE});
          if (bil.converged) { righe = bil.righe; sic = verificaSicurezza(righe, DIL, aq, PH_FINALE); balanced=true; }
        }

        // verifica anche con phSuggerito se disponibile
        if (!sic.sicuro && sic.phSuggerito) {
          const sic2 = verificaSicurezza(righe, DIL, aq, sic.phSuggerito);
          if (sic2.sicuro) { sic = sic2; }
        }

        if (!sic.sicuro) {
          fails++;
          let si = {}, siConc = {};
          try {
            const profilo = profiloDaRighe(righe, aq);
            si = siForIons(profilo, PH_FINALE, 20);
          } catch(e2) {}
          try {
            siConc = worstSerbSI(righe, aq, DIL);
          } catch(e2) {}
          const critici = sic.critici.map(c=>c.titolo||c.check||JSON.stringify(c));
          failures.push({key, critici, si, siConc, balanced});
          critici.forEach(c => { issueMap[c]=(issueMap[c]||0)+1; });
        }
      } catch(e) {
        fails++;
        failures.push({key, critici:[`ERRORE: ${e.message}`], si:{}, siConc:{}});
      }
    });
  });
});

// ── Report ────────────────────────────────────────────────────────
failures.forEach(({key, critici, si, siConc, balanced}) => {
  const siStr = Object.entries(si).filter(([k,v])=>typeof v==='number'&&k!=='I')
    .map(([k,v])=>`${k}=${v>=0?'+':''}${v.toFixed(2)}`).join(' ');
  const siCStr = Object.entries(siConc).filter(([k,v])=>typeof v==='number'&&k!=='I')
    .map(([k,v])=>`${k}=${v>=0?'+':''}${v.toFixed(2)}`).join(' ');
  console.log(`FAIL ${balanced?'(post-bil)':''} | ${key}`);
  console.log(`     critici: ${critici.join('; ')}`);
  if (siStr)  console.log(`     SI fin:  ${siStr}`);
  if (siCStr) console.log(`     SI conc: ${siCStr}`);
});

console.log('\n═════════════════════════════════════════════════════');
console.log(`Risultati: ${fails} FAIL su ${total} test (${((fails/total)*100).toFixed(0)}%)`);
if (Object.keys(issueMap).length) {
  console.log('\nCriticità più frequenti:');
  Object.entries(issueMap).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${v}x  ${k}`));
}
