// ════════════════════════════════════════════════════════════════
// FertiControl — Suite di test automatica
//
// Esegue l'app reale in Chromium headless (Playwright) e verifica:
//   S1. Caricamento senza errori JS
//   S2. Golden test: bilancio ionico chiuso per ogni sale macro
//   S3. Golden test: EC calcolata vs range EC dichiarato dalle ricette
//   S4. Invarianti: tutte le ricette builtin → calcolo senza errori,
//       niente NaN, input immutabile, risultato idempotente
//   S5. Stress: acque difficili × diluizioni estreme
//   S6. Motore serbatoi: nessuna coppia critica nello stesso tank
//   S7. verificaSicurezza rileva i conflitti forzati
//   S8. Solver NNLS: i target vengono effettivamente raggiunti
//   S9. Regressione fix sali custom (B/Cu/Mo, EC, NH4, liquidi)
//   S10. Round-trip export → reset → import
//   S11. Fuzzing dell'import (JSON malformati e ostili)
//   S12. Cambio lingua IT/EN
//
// Uso:  node tests/run-tests.js
// Requisiti: Playwright + Chromium (vedi tests/README.md)
// ════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const APP = 'file://' + path.resolve(__dirname, '..', 'Ferticontrol', 'Ferticontrol1.html');
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
  // ricetta stessa dichiara per la fase (acqua distillata, quindi solo sali).
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

  // ────────────────────────────────────────────────
  console.log('\n═══ S5. Stress: acque difficili × diluizioni estreme ═══');
  const stress = await page.evaluate(() => {
    const out = [];
    ['dura', 'osmosi', 'distillata'].forEach(preset => {
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
  ['N', 'P', 'K', 'Ca', 'Mg'].forEach(el => {
    const t = nnlsRes.targets[el], g = nnlsRes.got[el];
    check(`target ${el}=${t} → ottenuto ${g} (entro 15%)`, Math.abs(g - t) / t <= 0.15);
  });
  // Fe può superare il target: il MixCh è dimensionato sul micro più esigente
  // (qui il Cu) e porta Fe in eccesso — comportamento documentato nel codice.
  // Vincoli: mai SOTTO il target, mai oltre il tetto agronomico di 5 mg/L.
  check(`target Fe=2 → ottenuto ${nnlsRes.got.Fe} (≥ target, ≤ 5 mg/L; overshoot da MixCh atteso)`,
    nnlsRes.got.Fe >= 2 && nnlsRes.got.Fe <= 5);

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
  console.log(`\n════════════════════════════════════════`);
  console.log(`RISULTATO FINALE: ${pass} passati, ${fail} falliti`);
  if (failures.length) { console.log('\nFallimenti:'); failures.forEach(f => console.log('  • ' + f)); }
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERRORE SUITE:', e); process.exit(2); });
