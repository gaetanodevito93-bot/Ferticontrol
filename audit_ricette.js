// Audit scientifico ricette — Romano Tesi "Colture Fuori Suolo" (2010) + Sonneveld & Straver (2002)
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('/home/user/Ferticontrol/Ferticontrol/Ferticontrol1.html', 'utf8');
const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g)||[];
let allJs = scripts.map(s=>s.replace(/<script[^>]*>/,'').replace(/<\/script>/,'')).join('\n');
allJs = allJs.replace(/^(\s*)(const|let)\s+/gm, '$1var ');

const mockEl={value:'',style:{display:'block'},textContent:'',innerHTML:'',id:'',className:'',classList:{add:()=>{},remove:()=>{},contains:()=>false,toggle:()=>{}},dataset:{},addEventListener:()=>{},removeEventListener:()=>{},appendChild:()=>mockEl,removeChild:()=>mockEl,insertBefore:()=>mockEl,querySelector:()=>mockEl,querySelectorAll:()=>[],closest:()=>mockEl,parentElement:null,parentNode:null,children:[],childNodes:[],scrollIntoView:()=>{},focus:()=>{},blur:()=>{},click:()=>{},setAttribute:()=>{},getAttribute:()=>null,removeAttribute:()=>{},contains:()=>false,matches:()=>false,offsetHeight:0,offsetWidth:0,scrollTop:0,scrollHeight:0};
mockEl.parentElement=mockEl;mockEl.parentNode=mockEl;
global.document={getElementById:()=>({...mockEl}),querySelectorAll:()=>[],querySelector:()=>mockEl,createElement:(tag)=>({...mockEl,tagName:tag.toUpperCase(),appendChild:()=>mockEl}),createTextNode:(t)=>({textContent:t}),addEventListener:()=>{},removeEventListener:()=>{},body:{...mockEl,appendChild:()=>mockEl},head:{...mockEl,appendChild:()=>mockEl},documentElement:{...mockEl},title:'',cookie:''};
global.window=global;global.window.location={href:'',hash:'',search:'',pathname:'/',hostname:'localhost'};global.window.addEventListener=()=>{};global.window.removeEventListener=()=>{};global.window.history={pushState:()=>{},replaceState:()=>{}};global.window.scrollTo=()=>{};global.window.innerWidth=1024;global.window.innerHeight=768;global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},clear:()=>{}};global.sessionStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{},clear:()=>{}};global.navigator={userAgent:'node',language:'it-IT'};global.location=global.window.location;global.showToast=()=>{};global.alert=()=>{};global.confirm=()=>true;global.prompt=()=>'';global.renderCalcTabella=()=>{};global.renderRicetteCustom=()=>{};global.initPiante=()=>{};global.aggiornaStat=()=>{};global.Chart=function(){return{data:{datasets:[]},update:()=>{},destroy:()=>{}};};global.requestAnimationFrame=(f)=>setTimeout(f,0);global.cancelAnimationFrame=()=>{};
try{vm.runInThisContext(allJs);}catch(e){}

// ── Calcola ioni finali (mg/L) ──────────────────────────────────────
// g = grammi in 100L stock DIL, diluzione 1:10 → 1000L finali
// mg/L = g * pct% / 100  (derivazione: g/100L / 10 diluzione × 1000 mg/g = g*pct/100)
function calcolaIoni(righe) {
  const ions = {ca:0,mg:0,k:0,no3:0,p:0,so4:0,fe:0,mn:0,b:0};
  righe.forEach(r => {
    const sale = getSale(r.id);
    if (!sale || !sale.el) return;
    const g = r.g || 0;
    const el = sale.el;
    if(el.N)  ions.no3 += g * el.N  * (62/14) / 100;  // N → NO3⁻ mg/L
    if(el.Ca) ions.ca  += g * el.Ca / 100;
    if(el.Mg) ions.mg  += g * el.Mg / 100;
    if(el.K)  ions.k   += g * el.K  / 100;
    if(el.P)  ions.p   += g * el.P  / 100;             // P mg/L (non PO4)
    if(el.S)  ions.so4 += g * el.S  * 3 / 100;         // S → SO4²⁻ (96/32=3)
    if(el.Fe) ions.fe  += g * el.Fe / 100;
    if(el.Mn) ions.mn  += g * el.Mn / 100;
    if(el.B)  ions.b   += g * el.B  / 100;
  });
  return ions;
}

// ── Target scientifici (mg/L nella soluzione finale) ────────────────
// Basati su: Sonneveld & Straver (2002) "Nutrient Solutions for Vegetables and Flowers"
// e Romano Tesi (2010) "Colture Fuori Suolo"
// NO3 = mg/L come ione NO3⁻ (non come N); P = mg/L come elemento P
// Tolleranza audit: WARN se fuori range, FAIL se >30% sotto o >40% sopra il limite

const TARGETS = {
  'Pomodoro': {
    'Trapianto / Radicamento':     {no3:[280,700], k:[80,230],  ca:[60,160],  mg:[14,42],  p:[14,42],  fe:[0.5,3.5]},
    'Vegetativo (1°-3° truss)':    {no3:[600,1000],k:[180,360], ca:[130,230], mg:[22,62],  p:[28,58],  fe:[1.5,5]},
    'Fruttificazione (4°+ truss)': {no3:[780,1200],k:[240,420], ca:[150,270], mg:[28,72],  p:[30,65],  fe:[1.5,5]},
    'Fine ciclo / Lavaggio':       {no3:[120,480], k:[40,180],  ca:[35,130],  mg:[8,36],   p:[8,30],   fe:[0,2.5]},
  },
  'Lattuga': {
    'Germinazione / Plantula':     {no3:[180,420], k:[70,180],  ca:[50,130],  mg:[10,30],  p:[12,32],  fe:[0.3,2.5]},
    'Crescita vegetativa':         {no3:[450,850], k:[140,310], ca:[110,210], mg:[18,50],  p:[22,50],  fe:[1.5,4.5]},
    'Pre-raccolta (7 gg)':         {no3:[270,620], k:[90,240],  ca:[70,170],  mg:[13,42],  p:[16,42],  fe:[0.8,3.5]},
  },
  'Basilico': {
    'Germinazione':                {no3:[180,420], k:[70,180],  ca:[50,130],  mg:[10,30],  p:[12,32],  fe:[0.3,2.5]},
    'Crescita vegetativa':         {no3:[400,800], k:[130,290], ca:[100,200], mg:[16,46],  p:[18,46],  fe:[1.5,4.5]},
    'Pre-bolting / Raccolta':      {no3:[430,820], k:[140,310], ca:[110,210], mg:[18,50],  p:[20,50],  fe:[1.5,4.5]},
  },
  'Peperone': {
    'Trapianto':                   {no3:[280,680], k:[80,220],  ca:[60,155],  mg:[14,40],  p:[14,40],  fe:[0.5,3.5]},
    'Vegetativo':                  {no3:[580,980], k:[170,350], ca:[125,225], mg:[20,58],  p:[26,56],  fe:[1.5,5]},
    'Fioritura e Fruttificazione': {no3:[700,1100],k:[210,400], ca:[145,255], mg:[26,68],  p:[28,62],  fe:[1.5,5]},
  },
  'Cetriolo': {
    'Giovane':                     {no3:[280,700], k:[80,230],  ca:[60,160],  mg:[14,42],  p:[14,42],  fe:[0.5,3.5]},
    'Vegetativo / Fioritura':      {no3:[580,980], k:[170,350], ca:[125,225], mg:[20,58],  p:[26,56],  fe:[1.5,5]},
    'Produzione piena':            {no3:[700,1100],k:[220,400], ca:[150,260], mg:[26,68],  p:[28,62],  fe:[1.5,5]},
  },
  'Fragola': {
    'Radicamento':                 {no3:[200,500], k:[70,190],  ca:[50,140],  mg:[10,32],  p:[12,35],  fe:[0.5,3]},
    'Vegetativo':                  {no3:[380,780], k:[120,290], ca:[90,190],  mg:[16,46],  p:[18,45],  fe:[1.5,4.5]},
    'Fioritura e Frutto':          {no3:[560,960], k:[170,360], ca:[120,230], mg:[22,60],  p:[24,56],  fe:[1.5,5]},
  },
  'Cannabis / Canapa': {
    'Germinazione / Cloni':        {no3:[120,420], k:[50,160],  ca:[40,130],  mg:[8,30],   p:[8,30],   fe:[0.2,2.5]},
    'Vegetativo (sett. 2-5)':      {no3:[500,950], k:[140,320], ca:[110,220], mg:[22,65],  p:[22,58],  fe:[2,6]},
    'Stretch / Early Flora':       {no3:[460,880], k:[175,360], ca:[105,215], mg:[24,66],  p:[32,75],  fe:[2,6]},
    'Fioritura piena (sett. 4-7)': {no3:[380,820], k:[195,400], ca:[95,205],  mg:[24,68],  p:[44,110], fe:[2,6]},
    'Ripening / Flush':            {no3:[100,380], k:[70,190],  ca:[50,155],  mg:[12,40],  p:[8,40],   fe:[0.2,2.5]},
  },
  'Melanzana': {
    'Trapianto':                   {no3:[260,660], k:[75,215],  ca:[58,152],  mg:[12,38],  p:[12,38],  fe:[0.5,3.5]},
    'Vegetativo':                  {no3:[560,960], k:[160,340], ca:[120,220], mg:[18,55],  p:[24,54],  fe:[1.5,5]},
    'Fruttificazione':             {no3:[680,1080],k:[200,390], ca:[140,250], mg:[24,64],  p:[26,60],  fe:[1.5,5]},
  },
  'Zucchina': {
    'Giovane':                     {no3:[400,980], k:[65,220],  ca:[50,155],  mg:[10,46],  p:[12,46],  fe:[0.5,3.5]},
    'Produzione':                  {no3:[560,960], k:[160,340], ca:[120,220], mg:[18,55],  p:[22,52],  fe:[1.5,4.5]},
    'Fine stagione':               {no3:[340,720], k:[100,250], ca:[75,175],  mg:[14,42],  p:[16,42],  fe:[0.8,3.5]},
  },
  'Spinacio': {
    'Germoglio / Plantula':        {no3:[180,420], k:[65,170],  ca:[46,126],  mg:[8,28],   p:[10,28],  fe:[0.3,2.5]},
    'Crescita':                    {no3:[380,780], k:[115,275], ca:[88,188],  mg:[14,44],  p:[14,40],  fe:[1.5,4.5]},
    'Pre-raccolta':                {no3:[280,700], k:[80,260],  ca:[45,160],  mg:[10,42],  p:[14,40],  fe:[0.5,3.5]},
  },
  'Rucola': {
    'Crescita':                    {no3:[340,740], k:[100,255], ca:[78,178],  mg:[12,38],  p:[12,36],  fe:[1.5,4.5]},
    'Pre-raccolta (5 gg)':         {no3:[260,600], k:[75,205],  ca:[58,148],  mg:[9,30],   p:[8,28],   fe:[0.8,3]},
  },
};

// ── Audit ─────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════');
console.log('AUDIT RICETTE — Romano Tesi (2010) + Sonneveld & Straver (2002)');
console.log('Concentrazioni nella soluzione finale (mg/L), DIL=100, 1000L');
console.log('NO3 come ione NO3⁻ | P come elemento P | SO4 come ione SO4²⁻');
console.log('FAIL = >30% sotto o >40% sopra il range target');
console.log('═══════════════════════════════════════════════════════════════\n');

let totCheck=0, totOk=0, totWarn=0, totFail=0;
const allIssues=[];

PIANTE_BUILTIN.forEach(pianta => {
  const targets = TARGETS[pianta.nome];
  if (!targets) { console.log(`[SKIP] Nessun target per: ${pianta.nome}`); return; }
  console.log(`\n▶ ${pianta.nome}`);

  pianta.fasi.forEach(fase => {
    const target = targets[fase.nome];
    const righe = fase.sali.map(s => ({id:s.id, g:s.g}));
    const ions = calcolaIoni(righe);

    const ionStr = [
      `NO3=${ions.no3.toFixed(0)}`,
      `K=${ions.k.toFixed(0)}`,
      `Ca=${ions.ca.toFixed(0)}`,
      `Mg=${ions.mg.toFixed(0)}`,
      `P=${ions.p.toFixed(0)}`,
      `SO4=${ions.so4.toFixed(0)}`,
      `Fe=${ions.fe.toFixed(2)}`,
    ].join('  ');
    console.log(`  ${fase.nome}:`);
    console.log(`    ${ionStr}`);

    if (!target) {
      console.log(`    ⚠ Nessun target per questa fase`);
      return;
    }

    const checks = [
      {k:'NO3', v:ions.no3},
      {k:'K',   v:ions.k},
      {k:'Ca',  v:ions.ca},
      {k:'Mg',  v:ions.mg},
      {k:'P',   v:ions.p},
      {k:'Fe',  v:ions.fe},
    ];

    const issues=[];
    checks.forEach(({k,v}) => {
      const range = target[k.toLowerCase()];
      if (!range) return;
      totCheck++;
      const [lo,hi]=range;
      const prec = k==='Fe' ? 2 : 0;
      if (v < lo * 0.70) {
        issues.push({k,v:v.toFixed(prec),lo,hi,stato:'BASSO ✗'});
        totFail++;
      } else if (v > hi * 1.40) {
        issues.push({k,v:v.toFixed(prec),lo,hi,stato:'ALTO ✗'});
        totFail++;
      } else if (v < lo || v > hi) {
        issues.push({k,v:v.toFixed(prec),lo,hi,stato:'MARGINE ⚠'});
        totWarn++;
      } else {
        totOk++;
      }
    });

    if (issues.length===0) {
      console.log(`    ✓ tutti i nutrienti nei range`);
    } else {
      issues.forEach(({k,v,lo,hi,stato}) => {
        console.log(`    [${stato}] ${k} = ${v}  target: ${lo}–${hi}`);
        allIssues.push({pianta:pianta.nome,fase:fase.nome,k,v:parseFloat(v),lo,hi,stato});
      });
    }
  });
});

// ── Riepilogo ──────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`RIEPILOGO: ${totOk} OK  ${totWarn} WARN  ${totFail} FAIL  (su ${totCheck} check)`);

const fails = allIssues.filter(i=>i.stato.includes('✗'));
if (fails.length) {
  console.log('\nProblemi da correggere (FAIL):');
  fails.forEach(({pianta,fase,k,v,lo,hi,stato}) =>
    console.log(`  ${pianta} | ${fase} | ${k} = ${v} (target ${lo}–${hi}) [${stato.replace(' ✗','')}]`));
}
const warns = allIssues.filter(i=>i.stato.includes('⚠'));
if (warns.length) {
  console.log('\nMargini accettabili (WARN):');
  warns.forEach(({pianta,fase,k,v,lo,hi}) =>
    console.log(`  ${pianta} | ${fase} | ${k} = ${v} (target ${lo}–${hi})`));
}
