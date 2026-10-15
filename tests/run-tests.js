// ════════════════════════════════════════════════════════════════
// FertiControl — Suite di test automatica
//
// Esegue l'app reale in Chromium headless (Playwright) e verifica:
//   S1. Caricamento senza errori JS
//   S2. Golden test: bilancio ionico chiuso per ogni sale macro
//   S3. Golden test: EC calcolata vs range EC dichiarato dalle ricette
//   S4. Invarianti: tutte le ricette builtin → calcolo senza errori,
//       niente NaN, input immutabile, risultato idempotente; fedeltà
//       del profilo finale dopo la correzione acqua
//   S5. Stress: acque difficili × diluizioni estreme
//   S6. Motore serbatoi: nessuna coppia critica nello stesso tank
//   S7. verificaSicurezza rileva i conflitti forzati
//   S8. Solver NNLS: i target vengono effettivamente raggiunti (S libero)
//   S9. Regressione fix sali custom (B/Cu/Mo, EC, NH4, liquidi)
//   S10. Round-trip export → reset → import
//   S11. Fuzzing dell'import (JSON malformati e ostili)
//   S12. Cambio lingua IT/EN
//   S13. Profili acqua salvati (CRUD, persistenza, backup)
//   S14. Dose acido dimensionata sul pH target (Henderson-Hasselbalch)
//   S15. Temperatura acqua negli indici di saturazione
//   S16. Consigli di miscelazione e gestione pH (ordine, deriva NH₄)
//   S17. PWA: manifest, service worker, icone
//   S18. Perfezionamento motore (Davies, pH rebound, P da H₃PO₄, ACP)
//   S19. NNLS Lawson-Hanson: KKT, recupero esatto, casi limite
//   S20. Correzione acqua basata sul profilo (regressione N perso)
//   S21. Ricalcolo con ingredienti disponibili (regressione MnSO₄/P=0)
//   S22. Modalità target senza doppia correzione (regressione)
//   S23. Solver target: S libero, scorta, acido, micro entro soglie
//   S24. Serbatoi: gravità dei conflitti, silicato, sali custom
//   S25. Speciazione con coefficienti di attività
//   S26. Correzioni minori (costo, EC concentrato, calcite, NH₄, acido, UI)
//   S27. Pannello "Info tecniche": schede tecniche nascoste dopo il calcolo
//
// Uso:  node tests/run-tests.js   (in automatico: hook tests/hooks/pre-commit e GitHub Actions)
// Requisiti: Playwright + Chromium (vedi tests/README.md)
// ════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');

let chromium;
{
  const candidates = [
    'playwright',
    process.env.PLAYWRIGHT_PATH,
    path.join(__dirname, '..', '..', 'node_modules', 'playwright'),
    '/opt/node22/lib/node_modules/playwright',
  ].filter(Boolean);
  let lastErr;
  for (const c of candidates) {
    try { ({ chromium } = require(c)); break; }
    catch (e) { lastErr = e; }
  }
  if (!chromium) {
    console.error('Playwright non trovato. Installa con: npm install playwright && npx playwright install chromium');
    console.error('(oppure indica il modulo con la variabile PLAYWRIGHT_PATH)');
    throw lastErr;
  }
}

// FC_APP permette di eseguire la suite su un'altra copia dell'app (es. test di mutazione)
const APP = 'file://' + path.resolve(process.env.FC_APP || path.join(__dirname, '..', 'index.html'));
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};
const close = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, headless: true });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    // Ignora il fallimento dei Google Fonts offline: non è un errore dell'app
    if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) jsErrors.push('CONSOLE: ' + m.text());
  });
  page.on('dialog', d => d.accept()); // eventuali alert() non bloccano la suite

  await page.goto(APP);
  await page.waitForTimeout(600);

  // ────────────────────────────────────────────────
  console.log('\n═══ S1. Caricamento ═══');
  check('pagina caricata senza errori JS', jsErrors.length === 0, jsErrors.join(' | '));
  const init = await page.evaluate(() => ({
    sali: catalogo.length, defaults: SALI_DEFAULT.length, piante: PIANTE_BUILTIN.length,
    tabs: document.querySelectorAll('.tab').length,
  }));
  check(`catalogo inizializzato (${init.sali} sali = ${init.defaults} default)`, init.sali === init.defaults && init.defaults === 22);
  check(`ricette builtin presenti (${init.piante})`, init.piante === 11);
  check('5 tab renderizzate', init.tabs === 5);

  // ────────────────────────────────────────────────
  console.log('\n═══ S2. Golden: bilancio ionico per sale macro ═══');
  // Per ogni sale macro, il profilo generato da 1000 g/1000L deve avere
  // cationi ≈ anioni (la formula di un sale è elettricamente neutra).
  const balances = await page.evaluate(() => {
    return catalogo.filter(s => s.cat === 'macro').map(s => {
      const p = profiloDaRighe([{ id: s.id, dose: 1000 }], null);
      const b = meqBalance(p, 6.0);
      return { id: s.id, cat: +b.cat.toFixed(2), an: +b.an.toFixed(2) };
    });
  });
  balances.forEach(b => {
    const diff = b.cat > 0 ? Math.abs(b.cat - b.an) / b.cat : 0;
    check(`${b.id}: cationi ${b.cat} ≈ anioni ${b.an} meq/L (Δ ${(diff * 100).toFixed(1)}%)`, diff < 0.12);
  });

  // ────────────────────────────────────────────────
  console.log('\n═══ S3. Golden: EC calcolata vs EC dichiarata dalle ricette ═══');
  // L'EC stimata dai coefficienti deve cadere vicino al range EC che la
  // ricetta stessa dichiara per la fase (nessuna acqua: solo il contributo dei sali).
  const ecFasi = await page.evaluate(() => {
    return PIANTE_BUILTIN.flatMap(pl => pl.fasi.map((f, fi) => {
      const ec = f.sali.reduce((a, r) => a + (r.g / 1000) * ecCoeffSale(r.id), 0);
      return { pianta: pl.id, fase: f.nome, ec: +ec.toFixed(2), min: f.ec[0], max: f.ec[1] };
    }));
  });
  let ecOk = 0, ecTot = 0;
  const TOLL_EC = 0.7;
  ecFasi.forEach(f => {
    ecTot++;
    const ok = f.ec >= f.min - TOLL_EC && f.ec <= f.max + TOLL_EC;
    if (ok) ecOk++;
    else console.log(`     ⚠️ ${f.pianta}/${f.fase}: EC ${f.ec} fuori da [${f.min}-${f.max}]±${TOLL_EC}`);
  });
  check(`EC coerente col range dichiarato in ${ecOk}/${ecTot} fasi (richiesto 100%)`, ecOk === ecTot);

  // ────────────────────────────────────────────────
  console.log('\n═══ S4. Invarianti: tutte le ricette builtin, acqua media, dil 1:100 ═══');
  const invar = await page.evaluate(() => {
    const out = [];
    presetAcqua('media');
    document.getElementById('diluizione').value = 100;
    document.getElementById('ph-finale').value = 6.0;
    PIANTE_BUILTIN.forEach(pl => {
      pl.fasi.forEach((f, fi) => {
        selPianta(pl.id, 'builtin'); selFase(fi);
        caricaRicettaCorrente();
        const before = JSON.stringify(calcRighe);
        calcola();
        const txt1 = document.getElementById('calc-out').innerText;
        const after = JSON.stringify(calcRighe);
        calcola(); // idempotenza
        const txt2 = document.getElementById('calc-out').innerText;
        out.push({
          id: pl.id + '/' + fi,
          rendered: txt1.length > 500,
          nan: /NaN|undefined/.test(txt1),
          errInput: /Input non valido/.test(txt1),
          immutabile: before === after,
          idempotente: txt1 === txt2,
        });
      });
    });
    return out;
  });
  const bad = invar.filter(r => !r.rendered || r.nan || r.errInput || !r.immutabile || !r.idempotente);
  check(`${invar.length} fasi calcolate: output presente, senza NaN, input immutabile, idempotente`,
    bad.length === 0, JSON.stringify(bad.slice(0, 3)));

  // Fedeltà: il profilo FINALE (sali + acqua + acido) deve restare vicino al
  // profilo della ricetta per ogni fase builtin e ogni acqua. È l'invariante
  // che avrebbe intercettato il crollo dell'N (−80%) della vecchia correzione.
  const fed = await page.evaluate(() => {
    const acque = {
      osmosi: { ec: 0.02, ph: 6.5, temp: 20, ca: 2, mg: 1, k: 0, na: 2, so4: 1, cl: 2, hco3: 5, no3: 1, fe: 0.01 },
      media: { ec: 0.3, ph: 7.2, temp: 20, ca: 80, mg: 20, k: 5, na: 30, so4: 40, cl: 50, hco3: 150, no3: 10, fe: 0.1 },
      dura: { ec: 0.7, ph: 7.8, temp: 20, ca: 180, mg: 45, k: 8, na: 60, so4: 90, cl: 80, hco3: 320, no3: 15, fe: 0.2 },
    };
    const out = [];
    for (const [nome, aq] of Object.entries(acque)) {
      PIANTE_BUILTIN.forEach(pl => pl.fasi.forEach((f, fi) => {
        const righe = f.sali.map(s => ({ id: s.id, dose: s.g }));
        const ric = profiloDaRighe(righe, null);
        const c = correggiDosi(righe, aq, { phFinale: 6.0 });
        const fin = profiloDaRighe(c.righe, aq, c.acido);
        const acq = contributoAcqua(aq, c.acido);
        const dev = {};
        ['N', 'P', 'K', 'Ca', 'Mg'].forEach(el => {
          // elemento raggiungibile solo se l'acqua da sola non lo supera già
          dev[el] = (ric[el] > 0 && acq[el] < ric[el]) ? (fin[el] - ric[el]) / ric[el] : 0;
        });
        const negative = c.righe.some(r => r.dose < 0);
        out.push({ id: `${nome}:${pl.id}/${fi}`, acqua: nome, dev, negative, nh4: fin.N > 0 ? fin.NH4 / fin.N : 0, nh4Ric: ric.N > 0 ? ric.NH4 / ric.N : 0 });
      }));
    }
    return out;
  });
  const peggio = (acqua, el) => fed.filter(f => f.acqua === acqua).reduce((a, f) => Math.abs(f.dev[el]) > Math.abs(a.dev[el]) ? f : a);
  ['N', 'P', 'K', 'Ca', 'Mg'].forEach(el => {
    const w = peggio('osmosi', el);
    check(`osmosi: ${el} entro ±3% in tutte le fasi (peggiore ${w.id} ${(w.dev[el] * 100).toFixed(1)}%)`, Math.abs(w.dev[el]) <= 0.03);
  });
  ['media', 'dura'].forEach(acqua => {
    const wN = peggio(acqua, 'N'), wP = peggio(acqua, 'P'), wK = peggio(acqua, 'K');
    check(`${acqua}: N mai sotto −30% (peggiore ${wN.id} ${(wN.dev.N * 100).toFixed(1)}%; vecchia correzione −80%)`, wN.dev.N >= -0.30);
    check(`${acqua}: P entro ±15% (peggiore ${wP.id} ${(wP.dev.P * 100).toFixed(1)}%)`, Math.abs(wP.dev.P) <= 0.15);
    check(`${acqua}: K entro ±15% (peggiore ${wK.id} ${(wK.dev.K * 100).toFixed(1)}%)`, Math.abs(wK.dev.K) <= 0.15);
  });
  check('correzione acqua: nessuna dose negativa', fed.every(f => !f.negative));
  // la correzione non deve mai portare l'NH₄ oltre il 10% (o oltre la quota già scelta dalla ricetta)
  const nh4Over = fed.filter(f => f.nh4 > Math.max(0.10, f.nh4Ric) + 1e-3);
  check(`correzione acqua: NH₄ ≤ max(10%, quota della ricetta) in tutte le fasi`, nh4Over.length === 0, nh4Over.slice(0, 3).map(f => f.id + ' ' + (f.nh4 * 100).toFixed(1) + '%').join('; '));

  // ────────────────────────────────────────────────
  console.log('\n═══ S5. Stress: acque difficili × diluizioni estreme ═══');
  const stress = await page.evaluate(() => {
    const out = [];
    ['dura', 'osmosi', 'personalizzata'].forEach(preset => {
      [50, 200].forEach(dil => {
        presetAcqua(preset);
        document.getElementById('diluizione').value = dil;
        selPianta('pomodoro', 'builtin'); selFase(2); // fruttificazione = caso peggiore (dosi alte)
        caricaRicettaCorrente();
        calcola();
        const txt = document.getElementById('calc-out').innerText;
        out.push({ caso: preset + '/1:' + dil, rendered: txt.length > 500, nan: /NaN|undefined/.test(txt) });
      });
    });
    return out;
  });
  stress.forEach(s => check(`${s.caso}: calcolo completo senza NaN`, s.rendered && !s.nan));

  // ────────────────────────────────────────────────
  console.log('\n═══ S6. Motore serbatoi: mai coppie critiche nello stesso tank ═══');
  const tanks = await page.evaluate(() => {
    const problemi = [];
    PIANTE_BUILTIN.forEach(pl => {
      pl.fasi.forEach((f, fi) => {
        const righe = f.sali.map(r => ({ id: r.id, nome: r.id, dose: r.g }));
        const res = autoRisolvi(righe, 100, null);
        ['A', 'B', 'C'].forEach(s => {
          const rs = res.righe.filter(r => r.serb === s);
          for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
            const c = coppiaIncompatibile(getSale(rs[i].id) || rs[i], getSale(rs[j].id) || rs[j]);
            if (c.incompat && c.gravita === 'C') problemi.push(`${pl.id}/${fi}: ${rs[i].id}+${rs[j].id} in ${s}`);
          }
        });
      });
    });
    return problemi;
  });
  check('autoRisolvi separa sempre le coppie critiche (36 fasi verificate)', tanks.length === 0, tanks.slice(0, 5).join('; '));

  // ────────────────────────────────────────────────
  console.log('\n═══ S7. verificaSicurezza rileva i conflitti forzati ═══');
  const sicurezza = await page.evaluate(() => {
    // Ca + fosfato forzati nello stesso serbatoio: DEVE risultare non sicuro
    const male = verificaSicurezza([
      { id: 'CaN', nome: 'CaN', dose: 800, serb: 'A' },
      { id: 'KH2PO4', nome: 'KH2PO4', dose: 300, serb: 'A' },
    ], 100, null, 6.0);
    // Configurazione corretta (separati): deve essere sicura
    const bene = verificaSicurezza([
      { id: 'CaN', nome: 'CaN', dose: 800, serb: 'B' },
      { id: 'KNO3', nome: 'KNO3', dose: 500, serb: 'A' },
    ], 100, null, 6.0);
    return { maleSicuro: male.sicuro, maleCritici: male.critici.length, beneSicuro: bene.sicuro, beneCritici: bene.critici.length };
  });
  check(`Ca+fosfato stesso tank → NON sicuro (${sicurezza.maleCritici} critici)`, !sicurezza.maleSicuro && sicurezza.maleCritici > 0);
  check('configurazione corretta → sicura', sicurezza.beneSicuro && sicurezza.beneCritici === 0);

  // ────────────────────────────────────────────────
  console.log('\n═══ S8. Solver NNLS: i target vengono raggiunti ═══');
  const nnlsRes = await page.evaluate(() => {
    const targets = { N: 180, P: 40, K: 250, Ca: 150, Mg: 40, S: 0, Fe: 2, Mn: 0.5, Zn: 0.1, B: 0.3, Cu: 0.05, Mo: 0.05 };
    const righe = solverTarget(targets, 100, 100, 100, null);
    const p = profiloDaRighe(righe, null);
    return { targets, got: { N: +p.N.toFixed(1), P: +p.P.toFixed(1), K: +p.K.toFixed(1), Ca: +p.Ca.toFixed(1), Mg: +p.Mg.toFixed(1), Fe: +p.Fe.toFixed(2) }, nRighe: righe.length, negativi: righe.filter(r => r.dose < 0).length };
  });
  check('nessuna dose negativa dal solver', nnlsRes.negativi === 0);
  // S non specificato = libero: i macro "veri" devono restare entro il 10%
  // (prima S=0 era un target rigido e Ca/Mg finivano a −13%/−21%).
  ['N', 'P', 'K', 'Ca', 'Mg'].forEach(el => {
    const t = nnlsRes.targets[el], g = nnlsRes.got[el];
    check(`target ${el}=${t} → ottenuto ${g} (entro 10%, S libero)`, Math.abs(g - t) / t <= 0.10);
  });
  // Fe coperto (MixCh + chelato per il residuo) senza eccessi.
  check(`target Fe=2 → ottenuto ${nnlsRes.got.Fe} (entro ±10%)`, Math.abs(nnlsRes.got.Fe - 2) <= 0.2);

  // ────────────────────────────────────────────────
  console.log('\n═══ S9. Regressione fix sali custom ═══');
  const custom = await page.evaluate(() => {
    openNuovoIngrediente();
    document.getElementById('ing-nome').value = 'Solfato Ammonico Test';
    document.getElementById('ing-N').value = 21;
    document.getElementById('ing-S').value = 24;
    document.getElementById('ing-B').value = 0.5;
    document.getElementById('ing-Cu').value = 0.2;
    document.getElementById('ing-Mo').value = 0.1;
    document.getElementById('ing-nh4').value = 100;
    document.getElementById('ing-liquid').checked = true;
    document.getElementById('ing-density').disabled = false;
    document.getElementById('ing-density').value = 1.3;
    salvaIngrediente();
    const s = catalogo[catalogo.length - 1];
    const p = profiloDaRighe([{ id: s.id, dose: 100 }], null);
    return {
      id: s.id, el: s.el, nh4Frac: s.nh4Frac, isLiquid: s.isLiquid, density: s.density,
      ecC: s.ecC, coeff: ecCoeffSale(s.id), NH4: p.NH4, NO3: p.NO3,
      mL: fmtDose(getSale(s.id), 130),
      stime: { kno3: stimaEcC({ N: 13.8, K: 38.7 }, 0), can: stimaEcC({ N: 11.8, Ca: 17 }, 0), mgso4: stimaEcC({ Mg: 9.9, S: 13 }, 0) },
    };
  });
  check('B/Cu/Mo salvati', custom.el.B === 0.5 && custom.el.Cu === 0.2 && custom.el.Mo === 0.1);
  check('nh4Frac, isLiquid, density salvati', custom.nh4Frac === 100 && custom.isLiquid === true && custom.density === 1.3);
  check(`EC custom stimata (${custom.ecC}) e usata dal motore`, custom.ecC > 0.5 && custom.coeff === custom.ecC);
  check(`N 100% ammoniacale: NH4=${custom.NH4}, NO3=${custom.NO3}`, close(custom.NH4, 21, 0.01) && custom.NO3 === 0);
  check(`dose liquida in mL ("${custom.mL}")`, /100\s*mL/.test(custom.mL));
  check('stimaEcC coerente coi tabellati (KNO3/CaN/MgSO4)',
    close(custom.stime.kno3, 1.27, 0.15) && close(custom.stime.can, 0.98, 0.15) && close(custom.stime.mgso4, 0.65, 0.1));

  // ────────────────────────────────────────────────
  console.log('\n═══ S10. Round-trip: export → reset → import ═══');
  // 1. Aggiungi anche una ricetta custom, poi cattura il JSON di export
  const exported = await page.evaluate(() => {
    ricetteCustom.push({ nome: 'Ricetta RoundTrip', emoji: '🧪', note: 'test',
      fasi: [{ nome: 'Unica', icon: '🌿', ec: [1, 2], ph: [5.5, 6.5], note: '', modo: 'grammi', sali: [{ id: 'KNO3', nome: 'KNO3', g: 300 }] }] });
    saveRicette();
    let captured = null;
    const origCreate = URL.createObjectURL, origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => { captured = blob; return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    esportaDati();
    URL.createObjectURL = origCreate; URL.revokeObjectURL = origRevoke;
    return captured ? captured.text() : null;
  });
  check('export produce un JSON', !!exported);
  const backup = JSON.parse(exported);
  check('il backup contiene catalogo, ricette, scorta e acqua',
    Array.isArray(backup.catalogo) && Array.isArray(backup.ricetteCustom) && Array.isArray(backup.scorta) && !!backup.acqua);
  check('il backup include il sale custom coi nuovi campi',
    backup.catalogo.some(s => s.nome === 'Solfato Ammonico Test' && s.nh4Frac === 100 && s.isLiquid === true));

  // 2. Reset di fabbrica
  const dopoReset = await page.evaluate(() => { eseguiReset(); return { sali: catalogo.length, defaults: SALI_DEFAULT.length, ricette: ricetteCustom.length }; });
  check(`reset: catalogo ai default (${dopoReset.sali}), zero ricette custom`, dopoReset.sali === dopoReset.defaults && dopoReset.ricette === 0);

  // 3. Import del backup catturato
  const tmpJson = path.join(os.tmpdir(), 'fc-roundtrip.json');
  fs.writeFileSync(tmpJson, exported);
  await page.setInputFiles('#ie-file-input', tmpJson);
  await page.waitForTimeout(500);
  const dopoImport = await page.evaluate(() => {
    const sale = catalogo.find(s => s.nome === 'Solfato Ammonico Test');
    const ric = ricetteCustom.find(r => r.nome === 'Ricetta RoundTrip');
    return { sale: sale ? { nh4Frac: sale.nh4Frac, isLiquid: sale.isLiquid, density: sale.density, B: sale.el.B, Cu: sale.el.Cu, Mo: sale.el.Mo, ecC: sale.ecC } : null,
             ric: ric ? ric.fasi[0].sali[0] : null };
  });
  check('import ripristina il sale custom con tutti i campi',
    !!dopoImport.sale && dopoImport.sale.nh4Frac === 100 && dopoImport.sale.isLiquid === true &&
    dopoImport.sale.density === 1.3 && dopoImport.sale.B === 0.5 && dopoImport.sale.Cu === 0.2 && dopoImport.sale.Mo === 0.1,
    JSON.stringify(dopoImport.sale));
  check('import ripristina la ricetta custom', !!dopoImport.ric && dopoImport.ric.id === 'KNO3' && dopoImport.ric.g === 300);

  // ────────────────────────────────────────────────
  console.log('\n═══ S11. Fuzzing dell\'import ═══');
  const fuzzCases = [
    ['garbage.json', 'questo non è JSON {{{'],
    ['hostile.json', JSON.stringify({
      catalogo: [
        { id: '<script>alert(1)</script>', nome: '<img src=x onerror=alert(1)>', el: { N: 'abc' } },
        { id: 'inject', nome: 'Inject"><b>x</b>', el: { N: -50, K: 99999 }, prezzo: -3, dose: 1e12, nh4Frac: 500, density: 99, isLiquid: 'sì' },
      ],
      ricetteCustom: [
        { nome: '<svg onload=alert(1)>', fasi: [{ nome: 123, sali: [{ id: '../../etc/passwd', g: -5 }] }] },
        { nome: null, fasi: 'non-array' },
      ],
      scorta: ['<script>', 'KNO3'],
    })],
    ['huge.json', JSON.stringify({ catalogo: [{ id: 'big', nome: 'Big', el: { N: 100, K: 100, Ca: 100 }, dose: Number.MAX_SAFE_INTEGER, ecC: 1e9 }], ricetteCustom: [] })],
  ];
  for (const [name, content] of fuzzCases) {
    const f = path.join(os.tmpdir(), 'fc-fuzz-' + name);
    fs.writeFileSync(f, content);
    jsErrors.length = 0;
    await page.setInputFiles('#ie-file-input', f);
    await page.waitForTimeout(400);
    const stato = await page.evaluate(() => ({
      injection: catalogo.some(s => /[<>]/.test(s.nome || '') || /[<>]/.test(s.id || '')) ||
                 ricetteCustom.some(r => /[<>]/.test(r.nome || '')),
      domInjection: !!document.querySelector('#catalogo-list script, #catalogo-list img[onerror], #catalogo-list svg'),
      funzionante: typeof calcola === 'function' && catalogo.length > 0,
      toast: document.getElementById('ie-toast') ? document.getElementById('ie-toast').textContent : '',
    }));
    // Un JSON invalido DEVE essere gestito: niente crash non gestiti (pageerror);
    // il console.error dentro il catch di importaDati è logging voluto, non un crash.
    const crash = jsErrors.filter(e => e.startsWith('PAGEERROR'));
    check(`${name}: nessun crash JS non gestito`, crash.length === 0, crash.join(' | '));
    if (name === 'garbage.json') check(`${name}: errore gestito col toast ("${stato.toast.slice(0, 40)}…")`, /[Ee]rror/.test(stato.toast));
    check(`${name}: nessuna injection in catalogo/ricette/DOM`, !stato.injection && !stato.domInjection);
    check(`${name}: app ancora funzionante`, stato.funzionante);
  }
  // il calcolo funziona ancora dopo il fuzzing
  const postFuzz = await page.evaluate(() => {
    presetAcqua('media'); document.getElementById('diluizione').value = 100;
    selPianta('lattuga', 'builtin'); selFase(1); caricaRicettaCorrente(); calcola();
    return document.getElementById('calc-out').innerText.length > 500;
  });
  check('calcolo completo funziona dopo il fuzzing', postFuzz);

  // ────────────────────────────────────────────────
  console.log('\n═══ S12. Cambio lingua IT/EN ═══');
  jsErrors.length = 0;
  const lang = await page.evaluate(() => {
    setLang('en');
    const en = document.getElementById('tabbtn-acqua').textContent;
    selPianta('pomodoro', 'builtin'); selFase(0); caricaRicettaCorrente(); calcola();
    const outEn = document.getElementById('calc-out').innerText;
    setLang('it');
    const it = document.getElementById('tabbtn-acqua').textContent;
    return { en, it, outOk: outEn.length > 500 && !/NaN/.test(outEn) };
  });
  check(`tab tradotte (EN: "${lang.en.trim()}", IT: "${lang.it.trim()}")`, /Water/i.test(lang.en) && /Acqua/i.test(lang.it));
  check('calcolo completo in inglese senza errori', lang.outOk && jsErrors.length === 0, jsErrors.join(' | '));

  // ────────────────────────────────────────────────
  console.log('\n═══ S13. Profili acqua salvati ═══');
  const profili = await page.evaluate(() => {
    // Salva un profilo con l'analisi corrente modificata
    presetAcqua('dura');
    document.getElementById('aq-ca').value = 175; // valore personalizzato
    saveAcqua();
    document.getElementById('acqua-profilo-nome').value = 'Pozzo Test <script>x</script>';
    salvaProfiloAcqua();
    const salvato = acquaProfili[acquaProfili.length - 1];
    // Cambia acqua, poi ricarica il profilo
    presetAcqua('osmosi');
    const caDopoPreset = document.getElementById('aq-ca').value;
    caricaProfiloAcqua(acquaProfili.length - 1);
    const caRipristinato = document.getElementById('aq-ca').value;
    // Aggiornamento omonimo: non deve duplicare
    document.getElementById('aq-ca').value = 190; saveAcqua();
    document.getElementById('acqua-profilo-nome').value = salvato.nome;
    const nPrima = acquaProfili.length;
    salvaProfiloAcqua();
    return {
      nome: salvato.nome, chips: document.querySelectorAll('#acqua-profili-list button').length,
      caDopoPreset, caRipristinato, duplicato: acquaProfili.length !== nPrima,
      caAggiornato: acquaProfili[nPrima - 1].valori.ca,
      persistito: JSON.parse(localStorage.getItem('fc_acqua_profili')).length === acquaProfili.length,
    };
  });
  check(`nome sanificato ("${profili.nome}")`, !/[<>]/.test(profili.nome));
  check('chip renderizzate (carica + elimina)', profili.chips >= 2);
  check(`profilo ricaricato: Ca ${profili.caDopoPreset} → ${profili.caRipristinato}`, profili.caRipristinato === '175');
  check('salvataggio omonimo aggiorna senza duplicare', !profili.duplicato && profili.caAggiornato === 190);
  check('profili persistiti in localStorage', profili.persistito);

  // Il profilo entra nel backup e sopravvive al round-trip
  const rtProfili = await page.evaluate(async () => {
    let captured = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { captured = b; return 'blob:x'; };
    esportaDati();
    URL.createObjectURL = orig;
    const json = JSON.parse(await captured.text());
    const inBackup = Array.isArray(json.acquaProfili) && json.acquaProfili.some(p => /Pozzo Test/.test(p.nome));
    // elimina e reimporta
    const nome = acquaProfili[acquaProfili.length - 1].nome;
    acquaProfili.length = 0; saveAcquaProfili(); renderProfiliAcqua();
    return { inBackup, json: JSON.stringify(json), nome };
  });
  check('profilo incluso nel backup JSON', rtProfili.inBackup);
  const tmpProf = path.join(os.tmpdir(), 'fc-profili.json');
  fs.writeFileSync(tmpProf, rtProfili.json);
  await page.setInputFiles('#ie-file-input', tmpProf);
  await page.waitForTimeout(400);
  const dopoImportProf = await page.evaluate((nome) => ({
    ripristinato: acquaProfili.some(p => p.nome === nome && p.valori.ca === 190),
    chips: document.querySelectorAll('#acqua-profili-list button').length,
  }), rtProfili.nome);
  check('import ripristina i profili acqua', dopoImportProf.ripristinato && dopoImportProf.chips >= 2);

  // Eliminazione con conferma
  const elim = await page.evaluate(() => {
    const n = acquaProfili.length;
    eliminaProfiloAcqua(acquaProfili.length - 1);
    eseguiElimina(); // conferma
    return { prima: n, dopo: acquaProfili.length };
  });
  check(`eliminazione profilo (${elim.prima} → ${elim.dopo})`, elim.dopo === elim.prima - 1);

  // ────────────────────────────────────────────────
  console.log('\n═══ S14. Dose acido dimensionata sul pH target ═══');
  const acido = await page.evaluate(() => {
    const aq = { ph: 7.8, hco3: 150 }; // ~2.46 meq/L di alcalinità
    const v = (ph) => calcAcidVolume(aq, 1, ph);
    return {
      ph55: v(5.5).meq, ph58: v(5.8).meq, ph62: v(6.2).meq, ph70: v(7.0).meq,
      res55: v(5.5).residuo,
      giaAcida: calcAcidVolume({ ph: 6.0, hco3: 150 }, 1, 6.5).meq,
      legacy: calcAcidVolume(aq, 1).meq, // senza pH target: vecchia regola
      hco3meq: 150 / 61.0,
    };
  });
  check(`più acido a pH basso: 5.5→${acido.ph55.toFixed(2)} > 5.8→${acido.ph58.toFixed(2)} > 6.2→${acido.ph62.toFixed(2)} > 7.0→${acido.ph70.toFixed(2)} meq/L`,
    acido.ph55 >= acido.ph58 && acido.ph58 > acido.ph62 && acido.ph62 > acido.ph70 && acido.ph70 > 0);
  check(`tampone minimo 0.5 meq/L rispettato anche a pH 5.5 (residuo ${acido.res55.toFixed(2)})`, acido.res55 >= 0.5 - 1e-9);
  check('acqua già al pH target → zero acido', acido.giaAcida === 0);
  check(`retrocompatibile senza pH target (${acido.legacy.toFixed(2)} = alcalinità − 0.5)`, close(acido.legacy, acido.hco3meq - 0.5, 0.01));
  // Henderson-Hasselbalch in sistema chiuso: alla CO₂ già presente al pH
  // dell'acqua (7.8) si somma quella generata dall'acido.
  //   a = (1 − c0·r) / (1 + r),  r = 10^(pH−6.35),  c0 = 10^(6.35−7.8)
  const frazAttesa = (ph) => { const r = Math.pow(10, ph - 6.35), c0 = Math.pow(10, 6.35 - 7.8); return (1 - c0 * r) / (1 + r); };
  check(`frazione H-H corretta a pH 5.8 (~${(frazAttesa(5.8) * 100).toFixed(0)}%)`, close(acido.ph58 / acido.hco3meq, frazAttesa(5.8), 0.005));
  check(`frazione H-H corretta a pH 7.0 (~${(frazAttesa(7.0) * 100).toFixed(0)}%, CO₂ iniziale inclusa)`, close(acido.ph70 / acido.hco3meq, frazAttesa(7.0), 0.005));

  // End-to-end: cambiare il pH nel calcolatore aggiorna la card acido
  const acidoUI = await page.evaluate(() => {
    presetAcqua('dura'); // HCO3 320 → correzione sempre presente
    document.getElementById('diluizione').value = 100;
    selPianta('pomodoro', 'builtin'); selFase(1); caricaRicettaCorrente();
    const leggi = (ph) => {
      document.getElementById('ph-finale').value = ph;
      document.getElementById('ph-finale').dispatchEvent(new Event('change'));
      const out = document.getElementById('calc-out').innerText;
      const m = out.match(/HNO₃ 38%\s*\n?\s*([\d.,]+)/);
      return { vol: m ? parseFloat(m[1].replace(',', '.')) : null, menzionaPh: out.includes('pH ' + ph) };
    };
    return { a58: leggi('5.8'), a65: leggi('6.5') };
  });
  check(`UI: acido a pH 5.8 (${acidoUI.a58.vol} mL) > acido a pH 6.5 (${acidoUI.a65.vol} mL)`,
    acidoUI.a58.vol !== null && acidoUI.a65.vol !== null && acidoUI.a58.vol > acidoUI.a65.vol);
  check('UI: la card acido cita il pH target scelto', acidoUI.a58.menzionaPh && acidoUI.a65.menzionaPh);

  // ────────────────────────────────────────────────
  console.log('\n═══ S15. Temperatura acqua negli indici di saturazione ═══');
  const temp = await page.evaluate(() => {
    // Fisica dei Ksp: CaHPO4 e struvite hanno ΔH<0 → meno solubili a caldo;
    // la calcite pure. Il gesso (ΔH≈+1) è quasi T-indipendente.
    const fis = {
      brushite: kspCaHPO4(10) > kspCaHPO4(30),
      struvite: kspStruvite(10) > kspStruvite(30),
      calcite: kspCalcite(10) > kspCalcite(30),
    };
    // SI della stessa soluzione a 10°C vs 30°C (profilo ricco di Ca e P)
    const righe = [{ id: 'CaN', dose: 900 }, { id: 'KH2PO4', dose: 200 }, { id: 'MgNO3', dose: 400 }];
    const si10 = siFinaleSoluzione(righe, { ph: 7, temp: 10, ca: 0 }, 6.2);
    const si30 = siFinaleSoluzione(righe, { ph: 7, temp: 30, ca: 0 }, 6.2);
    // getAcqua legge il campo; valori assurdi → default 20
    document.getElementById('aq-temp').value = 30;
    const t30 = getAcqua().temp;
    document.getElementById('aq-temp').value = 999;
    const tInvalid = getAcqua().temp;
    document.getElementById('aq-temp').value = 20;
    return { fis, si10: +si10.CaHPO4.toFixed(3), si30: +si30.CaHPO4.toFixed(3), t30, tInvalid };
  });
  check('Ksp fisicamente coerenti (brushite/struvite/calcite meno solubili a caldo)',
    temp.fis.brushite && temp.fis.struvite && temp.fis.calcite);
  check(`SI CaHPO₄ a 30°C (${temp.si30}) > a 10°C (${temp.si10})`, temp.si30 > temp.si10);
  check('getAcqua legge la temperatura (30)', temp.t30 === 30);
  check('temperatura non plausibile (999) → default 20', temp.tInvalid === 20);

  // End-to-end: la temperatura cambia l'output del calcolo
  const tempUI = await page.evaluate(() => {
    presetAcqua('media');
    document.getElementById('diluizione').value = 100;
    selPianta('pomodoro', 'builtin'); selFase(2); caricaRicettaCorrente();
    const leggi = (t) => {
      document.getElementById('aq-temp').value = t;
      calcola();
      toggleInfoTecniche(true); // la card SI è tra le info tecniche
      const out = document.getElementById('calc-out').innerText;
      const m = out.match(/indici di saturazione a ([\d.]+)°c/i) || out.match(/a ([\d.]+)°C e pH/i);
      const siM = out.match(/CaHPO₄[^\n]*\n?[^\n]*SI ([+\-][\d.]+)/i);
      return { tMostrata: m ? m[1] : null, siTxt: siM ? siM[1] : null, out: out.length };
    };
    const a = leggi(10), b = leggi(30);
    document.getElementById('aq-temp').value = 20;
    return { a, b };
  });
  check(`UI: la card SI mostra la temperatura scelta (10°C → "${tempUI.a.tMostrata}", 30°C → "${tempUI.b.tMostrata}")`,
    tempUI.a.tMostrata === '10' && tempUI.b.tMostrata === '30');
  check(`UI: il SI CaHPO₄ cambia con la temperatura (${tempUI.a.siTxt} vs ${tempUI.b.siTxt})`,
    tempUI.a.siTxt !== null && tempUI.b.siTxt !== null && tempUI.a.siTxt !== tempUI.b.siTxt);

  // La temperatura segue i profili acqua salvati
  const tempProfilo = await page.evaluate(() => {
    document.getElementById('aq-temp').value = 28; saveAcqua();
    document.getElementById('acqua-profilo-nome').value = 'Serra Estate';
    salvaProfiloAcqua();
    document.getElementById('aq-temp').value = 12; saveAcqua();
    caricaProfiloAcqua(acquaProfili.length - 1);
    const t = document.getElementById('aq-temp').value;
    eliminaProfiloAcqua(acquaProfili.length - 1); eseguiElimina();
    document.getElementById('aq-temp').value = 20; saveAcqua();
    return t;
  });
  check(`la temperatura è salvata nei profili acqua (28 → 12 → ricarica → ${tempProfilo})`, tempProfilo === '28');

  // ────────────────────────────────────────────────
  console.log('\n═══ S16. Consigli di miscelazione e gestione pH ═══');
  // Consigli di preparazione: ordine di scioglimento, separazione Ca, acido prima dei sali
  const mix = await page.evaluate(() => {
    setLang('it');
    presetAcqua('dura'); // HCO3 320 → card acido/gestione pH sempre presenti
    document.getElementById('diluizione').value = 100;
    document.getElementById('ph-finale').value = 6.0;
    selPianta('pomodoro', 'builtin'); selFase(1); caricaRicettaCorrente();
    calcola();
    toggleInfoTecniche(true); // la nota sugli stock è nella card anti-precipitazione
    const out = document.getElementById('calc-out').innerText;
    return {
      // NB: innerText applica text-transform:uppercase dei titoli (.ch) ed
      // espande i simboli ioni (Ca → "Ca (calcio)", N → "N (azoto)"): i match
      // qui sotto sono perciò case-insensitive e tolleranti al testo interposto.
      ordine: out.includes('chelati → nitrati → fosfati'),
      caSeparato: /Ca[\s\S]{0,15}in un serbatoio/i.test(out),
      acidoPrima: /acido[\s\S]{0,120}prima/i.test(out),
      cardPh: /gestione pH in coltura/i.test(out),
      drenaggio: /drenaggio/i.test(out),
    };
  });
  check('procedura: ordine di scioglimento chelati → nitrati → fosfati', mix.ordine);
  check('procedura: Ca separato da solfati/fosfati negli stock', mix.caSeparato);
  check('procedura: acido nell\'acqua PRIMA dei sali (acqua alcalina)', mix.acidoPrima);
  check('card "Gestione pH in coltura" presente', mix.cardPh);
  check('gestione pH: cita il pH di drenaggio (la misura che conta)', mix.drenaggio);

  // Deriva del pH secondo la frazione ammoniacale — nitrificazione fa scendere, NO₃⁻ fa salire
  const drift = await page.evaluate(() => {
    setLang('it');
    presetAcqua('media');
    document.getElementById('ph-finale').value = 6.0;
    selPianta('pomodoro', 'builtin'); selFase(1); caricaRicettaCorrente();
    const run = (righe) => {
      window._bilanciaRighe = righe; // forza un profilo dosi noto senza toccare il DOM
      calcola();
      toggleInfoTecniche(true); // il rapporto NH₄/N è nei rapporti agronomici
      const out = document.getElementById('calc-out').innerText;
      const m = out.match(/NH₄ \/ N[\s\S]*?(\d+)\s*%/i);
      return { nh4: m ? +m[1] : null, scende: /tenderà a scendere/.test(out), sale: /tenderà a salire/.test(out) };
    };
    const alto = run([{ id: 'CaN', dose: 500 }, { id: 'NH4NO3', dose: 400 }, { id: 'KNO3', dose: 150 }, { id: 'KH2PO4', dose: 120 }, { id: 'MgSO4', dose: 150 }]);
    const nitrico = run([{ id: 'CaN', dose: 600 }, { id: 'KNO3', dose: 300 }, { id: 'KH2PO4', dose: 120 }, { id: 'MgSO4', dose: 150 }]);
    return { alto, nitrico };
  });
  check(`alto NH₄ (${drift.alto.nh4}%): il pH "tenderà a scendere"`, drift.alto.nh4 > 10 && drift.alto.scende && !drift.alto.sale);
  check(`tutto nitrico (${drift.nitrico.nh4}%): il pH "tenderà a salire"`, drift.nitrico.nh4 < 3 && drift.nitrico.sale && !drift.nitrico.scende);

  // Advisory bassa alcalinità: acqua a pH alto ma pochi bicarbonati → nessuna dose fissa, goccia a goccia
  const bassaAlc = await page.evaluate(() => {
    setLang('it');
    selPianta('pomodoro', 'builtin'); selFase(1); caricaRicettaCorrente();
    document.getElementById('ph-finale').value = 6.0;
    document.getElementById('aq-hco3').value = 20;   // bassa alcalinità
    document.getElementById('aq-ph').value = 7.5;    // ma pH sopra il target
    calcola();
    const out = document.getElementById('calc-out').innerText;
    return { bassa: /bassa alcalinità/i.test(out), goccia: /goccia a goccia/i.test(out), noDose: !/HNO₃ 38%/.test(out) };
  });
  check('bassa alcalinità: advisory presente ("goccia a goccia", niente dose fissa)', bassaAlc.bassa && bassaAlc.goccia && bassaAlc.noDose);

  // ────────────────────────────────────────────────
  console.log('\n═══ S17. PWA: manifest, service worker, icone ═══');
  const APPDIR = path.resolve(__dirname, '..');
  const htmlSrc = fs.readFileSync(path.join(APPDIR, 'index.html'), 'utf8');
  check('HTML: <link rel="manifest"> presente', /<link[^>]+rel=["']manifest["']/.test(htmlSrc));
  check('HTML: apple-touch-icon presente', /rel=["']apple-touch-icon["']/.test(htmlSrc));
  check('HTML: registrazione SW limitata a http(s) (non su file://)',
    /serviceWorker/.test(htmlSrc) && /location\.protocol\.indexOf\('http'\)===0/.test(htmlSrc));
  check('HTML: pulsante installa (beforeinstallprompt) gestito', /beforeinstallprompt/.test(htmlSrc));

  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(APPDIR, 'manifest.webmanifest'), 'utf8')); } catch (e) { /* invalido */ }
  check('manifest.webmanifest è JSON valido', manifest !== null);
  if (manifest) {
    check('manifest: name + short_name', !!manifest.name && !!manifest.short_name);
    check('manifest: display "standalone"', manifest.display === 'standalone');
    check('manifest: start_url e scope relativi (portabile su sottocartella)',
      typeof manifest.start_url === 'string' && typeof manifest.scope === 'string' && !manifest.start_url.startsWith('/'));
    check('manifest: theme_color = brand (#2d5a3d)', manifest.theme_color === '#2d5a3d');
    const sizes = (manifest.icons || []).map(i => i.sizes);
    check(`manifest: icone 192 e 512 presenti (${sizes.join(', ')})`, sizes.includes('192x192') && sizes.includes('512x512'));
    check('manifest: almeno un\'icona maskable', (manifest.icons || []).some(i => (i.purpose || '').includes('maskable')));
  }
  const swSrc = fs.existsSync(path.join(APPDIR, 'sw.js')) ? fs.readFileSync(path.join(APPDIR, 'sw.js'), 'utf8') : '';
  check('sw.js: lifecycle install/activate/fetch',
    /addEventListener\(['"]install/.test(swSrc) && /addEventListener\(['"]activate/.test(swSrc) && /addEventListener\(['"]fetch/.test(swSrc));
  check('sw.js: cache versionata (CACHE_VERSION)', /CACHE_VERSION/.test(swSrc));
  const iconFiles = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
  check('icone PNG presenti su disco (192/512/maskable/apple)', iconFiles.every(f => fs.existsSync(path.join(APPDIR, f))));

  // Splash: si mantiene lo splash animato dell'app. Il primo splash (di sistema,
  // inevitabile) si fonde con esso usando lo stesso verde scuro come sfondo del
  // manifest, così la sequenza è verde→verde e non "bianco poi verde".
  check('manifest: background_color = verde scuro dello splash (#1a3a2a, no bianco)',
    !!manifest && /^#1a3a2a$/i.test(manifest.background_color));
  const ctxWeb = await browser.newContext();
  const pgWeb = await ctxWeb.newPage();
  await pgWeb.goto(APP);
  const splashShown = await pgWeb.evaluate(() => !!document.getElementById('splash'));
  await ctxWeb.close();
  check('splash animato dell\'app presente all\'avvio', splashShown);

  // ────────────────────────────────────────────────
  console.log('\n═══ S18. Perfezionamento Motore Chimico (Davies, pH Rebound, H₃PO₄ P, ACP) ═══');
  const chemPerf = await page.evaluate(() => {
    // 1. Verifico Davies per I > 0.5 M
    const dHigh = davies(1.5, 1);
    const daviesStable = isFinite(dHigh) && dHigh > 0.01 && dHigh < 1.0;

    // 2. Verifico calcAcidVolume restituisca pMgL_H3PO4
    const aq = { ec: 0.7, ph: 7.8, hco3: 320, ca: 180, mg: 45 };
    const av = calcAcidVolume(aq, 1, 6.0);
    const pCalculated = av.pMgL_H3PO4 > 10;

    // 3. Verifico avviso pH Rebound e P acido nel log autoRisolvi
    const resAuto = autoRisolvi([], 100, aq, 6.0);
    const hasRebound = resAuto.interventi.some(i => i.msg && i.msg.includes('pH Rebound'));
    const hasPInfo = resAuto.interventi.some(i => i.msg && i.msg.includes('apporta'));

    // 4. Verifico audit Fosfato Tricalcico a pH > 6.2
    const righeSali = [{ id: 'CaN', dose: 1000 }, { id: 'KH2PO4', dose: 200 }];
    const secHigh = verificaSicurezza(righeSali, 100, null, 6.5);
    const hasACP = secHigh.audit.some(a => a.check.includes('Ca₃(PO₄)₂'));

    return { daviesStable, pCalculated, hasRebound, hasPInfo, hasACP };
  });

  check('Davies esteso per I > 0.5 M: stabilità matematica', chemPerf.daviesStable);
  check('calcAcidVolume calcola apporto P da H₃PO₄ (> 10 mg/L)', chemPerf.pCalculated);
  check('autoRisolvi: avviso pH Rebound presente', chemPerf.hasRebound);
  check('autoRisolvi: indicazione P da H₃PO₄ presente', chemPerf.hasPInfo);
  check('verificaSicurezza: audit Ca₃(PO₄)₂ attivo a pH > 6.2', chemPerf.hasACP);

  // Stato pulito per le sezioni del motore: acqua media, 2 serbatoi, scorta piena.
  const resetMotore = () => page.evaluate(() => {
    setLang('it');
    usaSerbC = false;
    // catalogo di fabbrica: le sezioni precedenti (fuzzing dell'import) lasciano
    // sali custom ostili (es. "big" con Ca/N/K al 100%) che falserebbero il solver
    catalogo = SALI_DEFAULT.map(s => ({ ...s }));
    scorta = new Set(catalogo.map(s => s.id));
    presetAcqua('media');
    document.getElementById('diluizione').value = 100;
    document.getElementById('ph-finale').value = 6.0;
    document.getElementById('volA').value = 100;
    document.getElementById('volB').value = 100;
    document.getElementById('acido-tipo').value = 'HNO3';
    window._bilanciaRighe = null; window._ricalcoloReport = null;
    resetStatoCalc(null);
  });

  // ────────────────────────────────────────────────
  console.log('\n═══ S19. NNLS (Lawson-Hanson): ottimalità e casi limite ═══');
  const nn = await page.evaluate(() => {
    // generatore pseudo-casuale deterministico (riproducibile)
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const kkt = [];
    for (let t = 0; t < 40; t++) {
      const m = 3 + Math.floor(rnd() * 5), n = 2 + Math.floor(rnd() * 7);
      const A = Array.from({ length: m }, () => Array.from({ length: n }, () => rnd() * 2 - 0.5));
      const b = Array.from({ length: m }, () => rnd() * 4 - 1);
      const x = nnls(A, b);
      const r = b.map((bi, i) => bi - A[i].reduce((s, v, j) => s + v * x[j], 0));
      const w = Array.from({ length: n }, (_, j) => A.reduce((s, row, i) => s + row[j] * r[i], 0));
      // KKT: x ≥ 0; gradiente ≤ 0 dove x = 0; ≈ 0 dove x > 0
      const ok = x.every(v => v >= 0) && x.every((v, j) => v > 1e-9 ? Math.abs(w[j]) < 1e-6 : w[j] < 1e-6);
      kkt.push(ok);
    }
    // recupero esatto di dosi note (sistema determinato)
    const A = [[0.118, 0.138, 0], [0.17, 0, 0], [0, 0.387, 0.287]];
    const x0 = [945, 300, 200];
    const b = A.map(r => r.reduce((s, v, i) => s + v * x0[i], 0));
    const xr = nnls(A, b);
    // un problema in cui la vecchia euristica sbagliava: la variabile più
    // negativa nel LS libero è necessaria nella soluzione vincolata
    const A2 = [[1, 0, 1], [0, 1, 1], [1, 1, 0]], b2 = [1, 1, 0.2];
    const x2 = nnls(A2, b2);
    const res2 = b2.map((bi, i) => bi - A2[i].reduce((s, v, j) => s + v * x2[j], 0)).reduce((s, v) => s + v * v, 0);
    return { kktOk: kkt.filter(Boolean).length, kktTot: kkt.length, xr, x2, res2, vuoto: nnls([[1]], [-1]) };
  });
  check(`KKT soddisfatte in ${nn.kktOk}/${nn.kktTot} problemi casuali (ottimo vincolato vero)`, nn.kktOk === nn.kktTot);
  check(`recupero esatto di dosi note (${nn.xr.map(v => v.toFixed(2)).join(', ')})`, close(nn.xr[0], 945, 0.05) && close(nn.xr[1], 300, 0.05) && close(nn.xr[2], 200, 0.05));
  check(`soluzione ottima su problema "trappola" (residuo² ${nn.res2.toFixed(4)})`, nn.res2 < 0.02);
  check('b negativo con colonna positiva → x = 0', nn.vuoto[0] === 0);

  // ────────────────────────────────────────────────
  console.log('\n═══ S20. Correzione acqua basata sul profilo (regressione) ═══');
  await resetMotore();
  const corr = await page.evaluate(() => {
    const aqMedia = getAcqua();
    const pom = PIANTE_BUILTIN.find(p => p.id === 'pomodoro');
    const veg = pom.fasi[1].sali.map(s => ({ id: s.id, dose: s.g }));
    const ric = profiloDaRighe(veg, null);
    const c = correggiDosi(veg, aqMedia, { phFinale: 6.0 });
    const fin = profiloDaRighe(c.righe, aqMedia, c.acido);
    // acqua più ricca di Ca della ricetta: il nitrato di calcio sparisce,
    // ma l'N che portava va recuperato da altre fonti
    const dura = { ...aqMedia, ca: 180, mg: 45, hco3: 320, ph: 7.8 };
    const cd = correggiDosi(veg, dura, { phFinale: 6.0 });
    const finD = profiloDaRighe(cd.righe, dura, cd.acido);
    // idempotenza e immutabilità
    const copia = JSON.stringify(veg);
    const c2 = correggiDosi(veg, aqMedia, { phFinale: 6.0 });
    // senza acqua nessuna modifica
    const nulla = correggiDosi(veg, null);
    return {
      ricN: ric.N, finN: fin.N, ricP: ric.P, finP: fin.P, ricK: ric.K, finK: fin.K, ricCa: ric.Ca, finCa: fin.Ca,
      acidoN: c.acido ? c.acido.N : 0, fedelta: !!c.fedelta && c.fedelta.length === 6,
      duraCaN: (cd.righe.find(r => r.id === 'CaN') || {}).dose, duraN: finD.N,
      immutato: JSON.stringify(veg) === copia, idem: JSON.stringify(c.righe) === JSON.stringify(c2.righe),
      nullaUguale: JSON.stringify(nulla.righe) === JSON.stringify(veg),
    };
  });
  // Con Ca e Mg dell'acqua che "liberano" nitrato di calcio e di magnesio, l'N
  // perso si recupera solo con KNO₃ (vincolato dal K) e NH₄ (≤ 10%): il limite
  // fisico è ~−5%. La vecchia correzione arrivava a 125 (−39%).
  check(`pomodoro veg + acqua media: N ${corr.finN.toFixed(0)} vs ricetta ${corr.ricN.toFixed(0)} (≥ 90%; prima 125)`, corr.finN >= 0.90 * corr.ricN && corr.finN <= 1.05 * corr.ricN);
  check(`pomodoro veg + acqua media: P, K, Ca entro 5% (P ${corr.finP.toFixed(0)}/${corr.ricP.toFixed(0)}, K ${corr.finK.toFixed(0)}/${corr.ricK.toFixed(0)}, Ca ${corr.finCa.toFixed(0)}/${corr.ricCa.toFixed(0)})`,
    [['finP', 'ricP'], ['finK', 'ricK'], ['finCa', 'ricCa']].every(([f, r]) => Math.abs(corr[f] - corr[r]) / corr[r] <= 0.05));
  check(`l'N dell'acido nitrico è conteggiato (${corr.acidoN.toFixed(1)} mg/L)`, corr.acidoN > 10);
  check('tabella di fedeltà prodotta (6 macro)', corr.fedelta);
  check(`acqua con più Ca della ricetta: CaN → ${corr.duraCaN} g, N ancora ${corr.duraN.toFixed(0)} mg/L (≥ 80% di ${corr.ricN.toFixed(0)})`,
    corr.duraCaN === 0 && corr.duraN >= 0.8 * corr.ricN);
  check('input immutato, risultato deterministico, senza acqua nessuna modifica', corr.immutato && corr.idem && corr.nullaUguale);

  // ────────────────────────────────────────────────
  console.log('\n═══ S21. Ricalcolo con ingredienti disponibili (regressione) ═══');
  await resetMotore();
  const sost = await page.evaluate(() => {
    const base = [{ id: 'CaN', dose: 900, nome: 'CaN' }, { id: 'KNO3', dose: 500, nome: 'KNO3' }, { id: 'MgSO4', dose: 500, nome: 'MgSO4' },
      { id: 'KH2PO4', dose: 200, nome: 'KH2PO4' }, { id: 'MixCh', dose: 30, nome: 'MixCh' }];
    const prova = (manca) => {
      manca.forEach(id => scorta.delete(id));
      const r = sostituisciNonDisponibili(base);
      manca.forEach(id => scorta.add(id));
      const prima = profiloDaRighe(base, null), dopo = profiloDaRighe(r.righe, null);
      return { ids: r.righe.map(x => x.id), prima, dopo, non: r.nonCoperti.map(c => c.el), usaMancanti: r.righe.some(x => manca.includes(x.id)) };
    };
    const mg = prova(['MgSO4']), kp = prova(['KH2PO4']), mix = prova(['MixCh']), ca = prova(['CaN']);
    // UI end-to-end: barra "ricalcola" e card di report
    calcRighe = base.map(r => ({ ...r }));
    scorta.delete('MgSO4'); renderCalcTabella();
    ricalcolaConDisponibili();
    const out = document.getElementById('calc-out').innerText;
    scorta.add('MgSO4');
    return { mg, kp, mix, ca, card: /Ricalcolo con gli ingredienti disponibili/i.test(out), tabSenzaMgSO4: !calcRighe.some(r => r.id === 'MgSO4') };
  });
  const rel = (o, el) => o.prima[el] > 0 ? Math.abs(o.dopo[el] - o.prima[el]) / o.prima[el] : 0;
  check(`MgSO₄ mancante: niente MnSO₄ (Mn ${sost.mg.dopo.Mn.toFixed(2)} = ${sost.mg.prima.Mn.toFixed(2)} mg/L; prima 112)`, !sost.mg.ids.includes('MnSO4') && close(sost.mg.dopo.Mn, sost.mg.prima.Mn, 0.01));
  check(`MgSO₄ mancante: Mg e S coperti entro 5% (Mg ${sost.mg.dopo.Mg.toFixed(0)}, S ${sost.mg.dopo.S.toFixed(0)})`, rel(sost.mg, 'Mg') <= 0.05 && rel(sost.mg, 'S') <= 0.05);
  check(`KH₂PO₄ mancante: P coperto entro 10% (${sost.kp.dopo.P.toFixed(1)} vs ${sost.kp.prima.P.toFixed(1)}; prima 0)`, rel(sost.kp, 'P') <= 0.10);
  check('nessun sostituto è a sua volta non disponibile', !sost.mg.usaMancanti && !sost.kp.usaMancanti && !sost.mix.usaMancanti && !sost.ca.usaMancanti);
  check(`Mix Chelati mancante: Fe/Mn/Zn/B/Mo da sali singoli (Fe ${sost.mix.dopo.Fe.toFixed(2)}, B ${sost.mix.dopo.B.toFixed(2)})`,
    ['Fe', 'Mn', 'Zn', 'B', 'Mo'].every(el => rel(sost.mix, el) <= 0.12));
  check(`Mix Chelati mancante: Cu segnalato come non coperto (${sost.mix.non.join(',')})`, sost.mix.non.includes('Cu'));
  check(`CaN mancante senza altre fonti di Ca: Ca segnalato (${sost.ca.non.join(',')}), CaCl₂ non introdotto`, sost.ca.non.includes('Ca') && !sost.ca.ids.includes('CaCl2'));
  check('UI: card di report del ricalcolo e sale mancante rimosso dalla tabella', sost.card && sost.tabSenzaMgSO4);

  // ────────────────────────────────────────────────
  console.log('\n═══ S22. Modalità target: nessuna doppia correzione (regressione) ═══');
  await resetMotore();
  const tgt = await page.evaluate(() => {
    presetAcqua('dura');
    ricetteCustom.push({ nome: 'Target Test', emoji: '🎯', note: '', fasi: [{ nome: 'T', icon: '🎯', ec: [1, 2], ph: [5.8, 6.2], note: '', modo: 'target', sali: [],
      targets: { N: 200, P: 50, K: 300, Ca: 180, Mg: 50, Fe: 2, Mn: 0.5, B: 0.3, Zn: 0.1, Cu: 0.05, Mo: 0.05 } }] });
    const ri = ricetteCustom.length - 1;
    caricaCustomInCalcola(ri, 0);
    let chiamate = 0;
    const orig = window.correggiDosi;
    window.correggiDosi = function () { chiamate++; return orig.apply(this, arguments); };
    const fed = () => /Fedeltà alla ricetta/i.test(document.getElementById('calc-out').innerText);
    calcola(); const d1 = JSON.stringify(calcRighe), f1 = fed();
    calcola(); const d2 = JSON.stringify(calcRighe), f2 = fed();
    document.getElementById('ph-finale').value = 5.8;
    document.getElementById('ph-finale').dispatchEvent(new Event('change'));
    const d3 = JSON.stringify(calcRighe), f3 = fed();
    const chiamateTarget = chiamate;
    // modifica manuale di una dose: si esce dalla modalità target, ma le dosi
    // restano "nette" e l'acqua non va sottratta di nuovo
    calcRighe[0].dose = calcRighe[0].dose + 10; segnaModificaManuale();
    calcola();
    const dopoModifica = { target: !!statoCalc.target, nette: statoCalc.nette, chiamate };
    window.correggiDosi = orig;
    ricetteCustom.splice(ri, 1);
    document.getElementById('ph-finale').value = 6.0;
    return { idem: d1 === d2, f1, f2, f3, pHcambia: d3 !== d1, chiamateTarget, dopoModifica };
  });
  check('due calcoli consecutivi → stesse dosi (prima il secondo sottraeva di nuovo l\'acqua)', tgt.idem);
  check('tabella di fedeltà presente anche al 2° calcolo e dopo il cambio di pH', tgt.f1 && tgt.f2 && tgt.f3);
  check('cambiando il pH il solver si riesegue (acido e quindi N cambiano)', tgt.pHcambia);
  check(`correggiDosi mai chiamata in modalità target (${tgt.chiamateTarget})`, tgt.chiamateTarget === 0);
  check('dose modificata a mano → fine modalità target, dosi nette, nessuna correzione acqua',
    !tgt.dopoModifica.target && tgt.dopoModifica.nette && tgt.dopoModifica.chiamate === 0);

  // ────────────────────────────────────────────────
  console.log('\n═══ S23. Solver target: S libero, scorta, acido, micro ═══');
  await resetMotore();
  const sv = await page.evaluate(() => {
    const T = { N: 200, P: 50, K: 300, Ca: 180, Mg: 50 };
    const conS = solverTarget({ ...T, S: 60 }, 100, 100, 100, null, 6.0);
    const pS = profiloDaRighe(conS, null);
    // scorta: senza KNO3 il solver non deve usarlo
    scorta.delete('KNO3');
    const senzaKNO3 = solverTarget(T, 100, 100, 100, null, 6.0);
    scorta.add('KNO3');
    // acido: con HNO3 il solver riduce i nitrati, con H3PO4 i fosfati
    // alcalinità moderata: con H₃PO₄ l'acido porta ~1/3 del P del target
    const aq = { ec: 0.4, ph: 7.6, temp: 20, ca: 0, mg: 0, k: 0, na: 0, so4: 0, cl: 0, hco3: 120, no3: 0, fe: 0 };
    const conHNO3 = profiloDaRighe(solverTarget(T, 100, 100, 100, { ...aq, acido: 'HNO3' }, 6.0), null);
    const conH3PO4 = profiloDaRighe(solverTarget(T, 100, 100, 100, { ...aq, acido: 'H3PO4' }, 6.0), null);
    const finH3PO4 = profiloDaRighe(solverTarget(T, 100, 100, 100, { ...aq, acido: 'H3PO4' }, 6.0), { ...aq, acido: 'H3PO4' }, acidoPrescritto({ ...aq, acido: 'H3PO4' }, 6.0));
    // micro coi target di default: nessuno oltre soglia di tossicità
    const micro = profiloDaRighe(solverTarget({ ...T, Fe: 2, Mn: 0.5, B: 0.3, Zn: 0.1, Cu: 0.05, Mo: 0.05 }, 100, 100, 100, null, 6.0), null);
    // senza MixCh in scorta: sali singoli
    scorta.delete('MixCh');
    const singoli = solverTarget({ ...T, Fe: 2, Mn: 0.5, B: 0.3, Zn: 0.1, Mo: 0.05 }, 100, 100, 100, null, 6.0);
    scorta.add('MixCh');
    // acqua molto dura + H₃PO₄: l'acido da solo eccede il P → avviso
    const duraP = autoRisolvi([{ id: 'KNO3', dose: 300 }], 100, { ec: 0.7, ph: 7.8, temp: 20, ca: 0, mg: 0, k: 0, na: 0, so4: 0, cl: 0, hco3: 320, no3: 0, fe: 0, acido: 'H3PO4' }, 6.0);
    return {
      avvisoP: duraP.interventi.some(i => /apporta da solo/.test(i.msg)),
      pS, usaKNO3: senzaKNO3.some(r => r.id === 'KNO3'), pSenza: profiloDaRighe(senzaKNO3, null),
      salNHNO3: conHNO3.N, salNH3PO4: conH3PO4.N, salPHNO3: conHNO3.P, salPH3PO4: conH3PO4.P, finPH3PO4: finH3PO4.P,
      micro, singoli: singoli.map(r => r.id),
      cacl2: conS.some(r => r.id === 'CaCl2'),
    };
  });
  // S è l'anione di bilanciamento (priorità più bassa): tolleranza 10%, gli altri 5%
  ['N', 'P', 'K', 'Ca', 'Mg', 'S'].forEach(el => {
    const t = { N: 200, P: 50, K: 300, Ca: 180, Mg: 50, S: 60 }[el], tol = el === 'S' ? 0.10 : 0.05;
    check(`con S esplicito: ${el}=${t} → ${sv.pS[el].toFixed(1)} (entro ${tol * 100}%)`, Math.abs(sv.pS[el] - t) / t <= tol);
  });
  check('CaCl₂ mai scelto dal solver (cloruro)', !sv.cacl2);
  check(`scorta rispettata: KNO₃ non disponibile → non usato (K ${sv.pSenza.K.toFixed(0)})`, !sv.usaKNO3);
  check(`acido HNO₃: il solver mette meno N dai sali (${sv.salNHNO3.toFixed(0)} < ${sv.salNH3PO4.toFixed(0)} con H₃PO₄)`, sv.salNHNO3 < sv.salNH3PO4 - 10);
  check(`acido H₃PO₄: meno P dai sali (${sv.salPH3PO4.toFixed(0)} < ${sv.salPHNO3.toFixed(0)}), P finale col P dell'acido ≈ 50 (${sv.finPH3PO4.toFixed(1)})`,
    sv.salPH3PO4 < sv.salPHNO3 - 5 && Math.abs(sv.finPH3PO4 - 50) / 50 <= 0.05);
  check('acqua molto dura + H₃PO₄: avviso P in eccesso dall\'acido (consiglia HNO₃)', sv.avvisoP);
  check(`micro coi target di default sotto le soglie (Mn ${sv.micro.Mn.toFixed(2)}, B ${sv.micro.B.toFixed(2)}, Zn ${sv.micro.Zn.toFixed(2)}, Cu ${sv.micro.Cu.toFixed(3)})`,
    sv.micro.Mn <= 2 && sv.micro.B <= 0.5 && sv.micro.Zn <= 0.5 && sv.micro.Cu <= 0.15);
  check(`B mai oltre il 125% del target (${sv.micro.B.toFixed(3)} ≤ 0.375; prima 0.75 col Mix sul Cu)`, sv.micro.B <= 0.375 + 1e-6);
  check(`senza Mix Chelati in scorta → sali singoli (${sv.singoli.filter(id => !['CaN', 'KNO3', 'MgNO3', 'MgSO4', 'KH2PO4', 'MAP', 'K2SO4', 'NH4NO3'].includes(id)).join(', ')})`,
    !sv.singoli.includes('MixCh') && ['MnSO4', 'ZnSO4', 'H3BO3', 'NaMoO4'].every(id => sv.singoli.includes(id)));

  // ────────────────────────────────────────────────
  console.log('\n═══ S24. Serbatoi: gravità dei conflitti, silicato, sali custom ═══');
  await resetMotore();
  const tk = await page.evaluate(() => {
    const serb = (res, id) => (res.righe.find(r => r.id === id) || {}).serb;
    const critStessoTank = (res) => {
      const out = [];
      ['A', 'B', 'C'].forEach(s => {
        const rs = res.righe.filter(r => r.serb === s && r.dose > 0);
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
          const c = coppiaIncompatibile(getSale(rs[i].id) || rs[i], getSale(rs[j].id) || rs[j]);
          if (c.incompat && c.gravita === 'C') out.push(rs[i].id + '+' + rs[j].id);
        }
      });
      return out;
    };
    const ric = [{ id: 'CaN', dose: 900 }, { id: 'KH2PO4', dose: 200 }, { id: 'FeEDTA', dose: 20 }, { id: 'K2SiO3', dose: 50 }];
    usaSerbC = false;
    const noC = autoRisolvi(ric, 100, null, 6.0);
    usaSerbC = true;
    const conC = autoRisolvi(ric, 100, null, 6.0);
    usaSerbC = false;
    // sale custom di calcio (sconosciuto alla matrice per ID): rilevato per gruppo e separato dai fosfati
    catalogo.push({ id: 'testCaChel', nome: 'Calcio custom', cat: 'macro', el: { Ca: 10, N: 5 } });
    const cust = autoRisolvi([{ id: 'testCaChel', dose: 300 }, { id: 'KH2PO4', dose: 200 }, { id: 'MAP', dose: 50 }], 100, null, 6.0);
    catalogo.pop();
    // molibdato: mai insieme al calcio
    const mo = autoRisolvi([{ id: 'CaN', dose: 900 }, { id: 'KH2PO4', dose: 200 }, { id: 'ZnSO4', dose: 2 }, { id: 'MnSO4', dose: 5 }, { id: 'NaMoO4', dose: 0.12 }], 100, null, 6.0);
    return {
      noC: { ca: serb(noC, 'CaN'), p: serb(noC, 'KH2PO4'), needC: noC.needsSerbC.length },
      conC: { si: serb(conC, 'K2SiO3'), soloSi: conC.righe.filter(r => r.serb === 'C').length, crit: critStessoTank(conC) },
      cust: { ca: serb(cust, 'testCaChel'), p: serb(cust, 'KH2PO4'), crit: critStessoTank(cust) },
      mo: { mo: serb(mo, 'NaMoO4'), ca: serb(mo, 'CaN'), crit: critStessoTank(mo) },
    };
  });
  check(`silicato senza serb. C: Ca (${tk.noC.ca}) e fosfati (${tk.noC.p}) restano separati, serve C segnalato`, tk.noC.ca !== tk.noC.p && tk.noC.needC > 0);
  check(`silicato con serb. C: da solo in C, nessun conflitto critico (${tk.conC.crit.join(',') || 'nessuno'})`, tk.conC.si === 'C' && tk.conC.soloSi === 1 && tk.conC.crit.length === 0);
  check(`sale di calcio custom separato dai fosfati (Ca ${tk.cust.ca}, P ${tk.cust.p})`, tk.cust.ca !== tk.cust.p && tk.cust.crit.length === 0);
  check(`molibdato mai col calcio (Mo ${tk.mo.mo}, Ca ${tk.mo.ca}) e nessun critico`, tk.mo.mo !== tk.mo.ca && tk.mo.crit.length === 0);

  // ────────────────────────────────────────────────
  console.log('\n═══ S25. Speciazione con coefficienti di attività ═══');
  const spc = await page.evaluate(() => {
    const prof = profiloDaRighe([{ id: 'CaN', dose: 900 }, { id: 'KH2PO4', dose: 200 }, { id: 'MgSO4', dose: 300 }], null);
    const ph = 6.0;
    const i = speciate(prof, ph);
    const I = ionicStrength(i);
    const g1 = davies(I, 1), g2 = davies(I, 2);
    const atteso = Math.pow(10, ph - PKA2_PHOS) * g1 / g2;
    const Pt = prof.P / 1000 / MM.P;
    // concentrato ×100: la correzione γ₁/γ₂ pesa di più
    const conc = {}; Object.keys(prof).forEach(k => { conc[k] = prof[k] * 100; });
    const ic = speciate(conc, ph);
    const Ic = ionicStrength(ic);
    return {
      rapporto: i.HPO4 / i.H2PO4, atteso, ideale: Math.pow(10, ph - PKA2_PHOS),
      massaP: (i.H2PO4 + i.HPO4 + i.PO4) / Pt,
      rapConc: ic.HPO4 / ic.H2PO4, attConc: Math.pow(10, ph - PKA2_PHOS) * davies(Ic, 1) / davies(Ic, 2),
    };
  });
  check(`[HPO₄²⁻]/[H₂PO₄⁻] = 10^(pH−pKa₂)·γ₁/γ₂ (${spc.rapporto.toFixed(4)} vs ${spc.atteso.toFixed(4)})`, Math.abs(spc.rapporto - spc.atteso) / spc.atteso < 0.01);
  check(`l'attività aumenta HPO₄²⁻ rispetto alla speciazione ideale (${spc.rapporto.toFixed(4)} > ${spc.ideale.toFixed(4)})`, spc.rapporto > spc.ideale * 1.2);
  check(`bilancio di massa del P conservato (${(spc.massaP * 100).toFixed(3)}%)`, close(spc.massaP, 1, 1e-9));
  check(`autoconsistente anche nel concentrato ×100 (${spc.rapConc.toFixed(4)} vs ${spc.attConc.toFixed(4)})`, Math.abs(spc.rapConc - spc.attConc) / spc.attConc < 0.02);

  // ────────────────────────────────────────────────
  console.log('\n═══ S26. Correzioni minori del motore ═══');
  await resetMotore();
  const mn = await page.evaluate(() => {
    const out = {};
    // costo per 1000 L indipendente dai volumi dei serbatoi
    const costoUI = () => { const m = document.getElementById('calc-out').innerText.match(/Costo per 1000 L finali\s*€\s*([\d.,]+)/i); return m ? m[1] : null; };
    selPianta('pomodoro', 'builtin'); selFase(1); caricaRicettaCorrente();
    document.getElementById('volA').value = 100; document.getElementById('volB').value = 100; calcola(); out.costoUguali = costoUI();
    document.getElementById('volA').value = 300; calcola(); out.costoDiversi = costoUI();
    document.getElementById('volA').value = 100;
    // EC del concentrato: l'acqua non si moltiplica per la diluizione
    const righe = [{ id: 'KNO3', dose: 500, serb: 'A' }, { id: 'CaN', dose: 500, serb: 'B' }];
    const ecSali = (500 / 1000) * ecCoeffSale('KNO3') + (500 / 1000) * ecCoeffSale('CaN');
    const v = verificaSicurezza(righe, 100, { ec: 0.7, ph: 7.0, temp: 20, ca: 0, mg: 0, k: 0, na: 0, so4: 0, cl: 0, hco3: 0, no3: 0, fe: 0 }, 6.0);
    out.ecConc = parseFloat(v.audit.find(a => /EC nel concentrato/.test(a.check)).dettaglio);
    out.ecConcAtteso = ecSali * 100 + 0.7;
    // calcite: "GESTITO" solo se l'acido è davvero prescritto
    const aqLieve = { ec: 0.3, ph: 8.3, temp: 20, ca: 150, mg: 0, k: 0, na: 0, so4: 0, cl: 0, hco3: 45, no3: 0, fe: 0 };
    const vc = verificaSicurezza([{ id: 'CaN', dose: 900, serb: 'B' }], 100, aqLieve, 6.0);
    out.calcite = (vc.audit.find(a => /CaCO₃/.test(a.check) && /acqua/.test(a.check)) || {}).esito;
    // cap NH4 esatto sull'N totale
    const cap = autoRisolvi([{ id: 'CaN', dose: 500 }, { id: 'NH4NO3', dose: 400 }, { id: 'KNO3', dose: 150 }], 100, null, 6.0);
    out.nh4 = rapportoNH4(cap.righe, null, 6.0).ratio;
    // il profilo finale include l'acido (N dell'HNO3, HCO3 residuo)
    const aqH = { ec: 0.7, ph: 7.8, temp: 20, ca: 0, mg: 0, k: 0, na: 0, so4: 0, cl: 0, hco3: 320, no3: 0, fe: 0, acido: 'HNO3' };
    const ac = acidoPrescritto(aqH, 6.0);
    const pa = profiloDaRighe([], aqH, ac);
    out.acidoN = pa.N; out.acidoNatteso = ac.meq * 14.007; out.hco3Res = pa.HCO3meq; out.hco3ResAtteso = ac.residuoMeq;
    // micro >3× soglia = critico (es. sostituzione sbagliata MgSO4 → MnSO4)
    const vm = verificaSicurezza([{ id: 'MnSO4', dose: 346, serb: 'A' }, { id: 'CaN', dose: 900, serb: 'B' }], 100, null, 6.0);
    out.mnCritico = !vm.sicuro && vm.critici.some(c => /Micronutriente/.test(c.titolo));
    // coefficienti EC del catalogo allineati a quelli usati dal motore
    out.ecAllineati = SALI_DEFAULT.every(s => EC_COEFF_GLOBAL[s.id] == null || s.ecC === EC_COEFF_GLOBAL[s.id]);
    return out;
  });
  check(`costo per 1000 L uguale con serbatoi da 100/100 e 300/100 L (${mn.costoUguali} = ${mn.costoDiversi})`, mn.costoUguali !== null && mn.costoUguali === mn.costoDiversi);
  check(`EC concentrato = sali×diluizione + EC acqua (${mn.ecConc} ≈ ${mn.ecConcAtteso.toFixed(0)})`, Math.abs(mn.ecConc - mn.ecConcAtteso) <= 1);
  check(`calcite con HCO₃⁻ 45 mg/L (nessuna dose di acido): esito "${mn.calcite}" (non GESTITO)`, mn.calcite === 'AVVISO');
  check(`cap NH₄NO₃ esatto: NH₄ = ${(mn.nh4 * 100).toFixed(2)}% dell'N totale (≤ 10%, ≥ 9.5%)`, mn.nh4 <= 0.10 + 1e-6 && mn.nh4 >= 0.095);
  check(`profilo finale include l'N dell'acido (${mn.acidoN.toFixed(1)} = ${mn.acidoNatteso.toFixed(1)} mg/L) e l'HCO₃⁻ residuo`, close(mn.acidoN, mn.acidoNatteso, 0.01) && close(mn.hco3Res, mn.hco3ResAtteso, 1e-9));
  check('micronutriente oltre 3× la soglia → conflitto critico', mn.mnCritico);
  check('coefficienti EC del catalogo allineati a EC_COEFF_GLOBAL', mn.ecAllineati);

  // Selettore acido: persistito e usato dal motore (intervento e card)
  await resetMotore();
  const acSel = await page.evaluate(() => {
    presetAcqua('media');
    const sel = document.getElementById('acido-tipo');
    sel.value = 'H3PO4'; sel.dispatchEvent(new Event('change'));
    const salvato = localStorage.getItem('fc_acido');
    selPianta('pomodoro', 'builtin'); selFase(1); caricaRicettaCorrente(); calcola();
    const outP = document.getElementById('calc-out').innerText;
    setLang('en'); calcola();
    const outEn = document.getElementById('calc-out').innerText;
    setLang('it');
    sel.value = 'HNO3'; sel.dispatchEvent(new Event('change'));
    return { salvato, aqAcido: getAcqua().acido, interventoP: /mL\/L di H₃PO₄ 75%[\s\S]{0,400}mg\/L di P/.test(outP), enOk: /Doses rebalanced|Recipe fidelity/i.test(outEn) && !/NaN|undefined/.test(outEn) };
  });
  check(`acido scelto persistito (fc_acido = ${acSel.salvato}) e letto da getAcqua`, acSel.salvato === 'H3PO4' && acSel.aqAcido === 'HNO3');
  check('con H₃PO₄ l\'intervento prescrive l\'acido fosforico e il P che apporta', acSel.interventoP);
  check('nuove card (ribilanciamento, fedeltà) tradotte in inglese senza NaN', acSel.enOk);

  // ────────────────────────────────────────────────
  console.log('\n═══ S27. Risultati leggeri: pannello "Info tecniche" ═══');
  await resetMotore();
  const info = await page.evaluate(() => {
    const titoli = ['Verifica Chimica Precisa', 'Verifica Anti-Precipitazione', 'Bilancio Ionico', 'Rapporti Agronomici', 'Contributo', 'Audit'];
    const visibile = (re) => re.test(document.getElementById('calc-out').innerText);
    // titoli delle schede (.ch) effettivamente visibili: le semplici citazioni nel testo non contano
    const titoliSchede = () => [...document.querySelectorAll('#calc-out .card > .ch')].filter(h => h.offsetParent !== null).map(h => h.innerText).join(' | ');
    const catturaStampa = () => { let h = null; const o = window.lanciaStampa; window.lanciaStampa = x => { h = x; }; stampaMiscela(); window.lanciaStampa = o; return (h || '').replace(/\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4},?\s*\d{1,2}:\d{2}/g, ''); };
    selPianta('pomodoro', 'builtin'); selFase(2); caricaRicettaCorrente();
    calcola();
    const pannello = document.getElementById('info-tecniche');
    const chiuso = {
      nascosto: pannello && pannello.style.display === 'none',
      nSchede: pannello ? pannello.querySelectorAll('.card').length : 0,
      titoliVisibili: titoli.filter(t => new RegExp(t, 'i').test(titoliSchede())),
      rapportiVisibili: /Rapporti agronomici/i.test(titoliSchede()) || visibile(/NH₄ \/ N totale/i),
      dosiVisibili: !!document.querySelector('#risultato-stampa .serb-card'),
      riepilogoVisibile: visibile(/Riepilogo/i),
      pulsante: !!document.getElementById('btn-info-tecniche'),
    };
    const stampaChiuso = catturaStampa();
    document.getElementById('btn-info-tecniche').click();
    const aperto = {
      visibile: pannello.style.display === 'block',
      titoliVisibili: titoli.filter(t => new RegExp(t, 'i').test(titoliSchede())),
      aria: document.getElementById('btn-info-tecniche').getAttribute('aria-expanded'),
    };
    const stampaAperto = catturaStampa();
    document.getElementById('btn-info-tecniche').click();
    const richiuso = pannello.style.display === 'none';
    calcola(); // nuovo calcolo → pannello di nuovo chiuso
    const dopoRicalcolo = document.getElementById('info-tecniche').style.display === 'none';
    // i riquadri d'azione (pH suggerito / bilancia) restano visibili a pannello chiuso
    calcRighe = [{ id: 'CaN', nome: 'CaN', dose: 1500, prezzo: 0 }, { id: 'KH2PO4', nome: 'KH2PO4', dose: 500, prezzo: 0 }];
    document.getElementById('ph-finale').value = 6.8; renderCalcTabella(); calcola();
    const azione = visibile(/Basta correggere il pH|Bilancia Sali|Correzione applicata/i);
    document.getElementById('ph-finale').value = 6.0;
    return { chiuso, aperto, richiuso, dopoRicalcolo, azione, stampaUguale: stampaChiuso.length > 500 && stampaChiuso === stampaAperto };
  });
  check('dopo il calcolo il pannello "Info tecniche" è chiuso e il pulsante è presente', info.chiuso.nascosto && info.chiuso.pulsante);
  check(`le 6 schede tecniche sono nel pannello (${info.chiuso.nSchede})`, info.chiuso.nSchede === 6);
  check(`a pannello chiuso nessuna scheda tecnica visibile (${info.chiuso.titoliVisibili.join(', ') || 'nessuna'})`, info.chiuso.titoliVisibili.length === 0 && !info.chiuso.rapportiVisibili);
  check('dosi per serbatoio e riepilogo restano visibili', info.chiuso.dosiVisibili && info.chiuso.riepilogoVisibile);
  check(`il pulsante apre tutte le schede (${info.aperto.titoliVisibili.length}/6 titoli, aria-expanded=${info.aperto.aria})`, info.aperto.visibile && info.aperto.titoliVisibili.length === 6 && info.aperto.aria === 'true');
  check('secondo click richiude; un nuovo calcolo riparte chiuso', info.richiuso && info.dopoRicalcolo);
  check('i riquadri d\'azione (pH suggerito / bilancia) restano visibili a pannello chiuso', info.azione);
  check('la stampa è identica con pannello aperto o chiuso', info.stampaUguale);

  // Ripristino dosi originali: torna alle dosi inserite e NON ri-bilancia
  await resetMotore();
  const rip = await page.evaluate(() => {
    presetAcqua('osmosi');
    // gesso sovrasaturo nella soluzione finale: non risolvibile col pH → bilanciamento
    calcRighe = [{ id: 'CaN', nome: 'CaN', dose: 3000, prezzo: 0 }, { id: 'MgSO4', nome: 'MgSO4', dose: 3000, prezzo: 0 }, { id: 'K2SO4', nome: 'K2SO4', dose: 2000, prezzo: 0 }];
    renderCalcTabella();
    calcola();
    const bilanciato = autoBalanceApplied || !!bilanciaReportData;
    const snapshot = JSON.stringify(origDosiSnapshot && origDosiSnapshot.map(r => r.dose));
    ripristinaDosiOriginali();
    const dosi = calcRighe.map(r => r.dose);
    return { bilanciato, snapshot, dosi, rebilanciato: autoBalanceApplied, salta: statoCalc.saltaBilanciamento };
  });
  check('caso sovrasaturo: l\'auto-bilanciamento interviene', rip.bilanciato);
  check(`ripristina → dosi inserite (${rip.dosi.join(', ')}) e nessun nuovo auto-bilanciamento`,
    JSON.stringify(rip.dosi) === '[3000,3000,2000]' && !rip.rebilanciato && rip.salta);

  // ────────────────────────────────────────────────
  console.log(`\n════════════════════════════════════════`);
  console.log(`RISULTATO FINALE: ${pass} passati, ${fail} falliti`);
  if (failures.length) { console.log('\nFallimenti:'); failures.forEach(f => console.log('  • ' + f)); }
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRORE SUITE:', e); process.exit(2); });
