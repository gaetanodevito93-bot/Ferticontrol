'use strict';
/**
 * test_headless.js — Test combinatorio FertiControl
 *
 * Esegue tutte le combinazioni:
 *   11 colture × N fasi di crescita × 6 tipi di acqua × 3 diluizioni
 * Diluizioni testate: 1:50 · 1:150 · 1:200
 *
 * Uso: node test_headless.js
 */

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

// ══════════════════════════════════════════════════════════════════════
// MOCK AMBIENTE BROWSER
// ══════════════════════════════════════════════════════════════════════
const localStorageMock = {
  _store: {},
  getItem(k)    { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear()       { this._store = {}; }
};

// Le funzioni di calcolo non toccano il DOM; questo stub evita ReferenceError
// se qualche funzione ausiliaria ci prova.
const documentMock = {
  getElementById()    { return null; },
  querySelectorAll()  { return { forEach() {}, length: 0 }; },
  querySelector()     { return null; },
  createElement()     { return {}; }
};

// ══════════════════════════════════════════════════════════════════════
// ESTRAZIONE JS DAL FILE HTML
// Riga 677 (1-based) = prima riga del blocco <script> principale
// Riga 4269 (1-based) = initPiante() — prima chiamata UI, da escludere
// slice(676, 4268) include fino alla riga 4268 escluso le chiamate init DOM
// ══════════════════════════════════════════════════════════════════════
const htmlPath  = path.join(__dirname, 'Ferticontrol1.html');
const htmlLines = fs.readFileSync(htmlPath, 'utf8').split('\n');
const jsCode    = htmlLines.slice(676, 4268).join('\n');

// ══════════════════════════════════════════════════════════════════════
// CODICE DI TEST (gira nello stesso scope vm del jsCode)
// ══════════════════════════════════════════════════════════════════════
const testCode = `
(function runTestsCombinatori() {
  // ── Preset acqua (identici a presetAcqua() nel motore) ─────────────
  var ACQUE = {
    ottima:     {ec:0.1,   ph:6.8, ca:10,  mg:2,  k:1, na:5,  so4:5,  cl:5,  hco3:20,  no3:2,  fe:0.01},
    media:      {ec:0.3,   ph:7.2, ca:80,  mg:20, k:5, na:30, so4:40, cl:50, hco3:150, no3:10, fe:0.1},
    dura:       {ec:0.7,   ph:7.8, ca:180, mg:45, k:8, na:60, so4:90, cl:80, hco3:320, no3:15, fe:0.2},
    osmosi:     {ec:0.02,  ph:6.5, ca:2,   mg:1,  k:0, na:2,  so4:1,  cl:2,  hco3:5,   no3:1,  fe:0.01},
    piovana:    {ec:0.05,  ph:6.2, ca:3,   mg:1,  k:1, na:2,  so4:2,  cl:2,  hco3:8,   no3:1,  fe:0.01},
    distillata: {ec:0.001, ph:7.0, ca:0,   mg:0,  k:0, na:0,  so4:0,  cl:0,  hco3:0,   no3:0,  fe:0}
  };

  var DILUIZIONI = [50, 150, 200];
  var PH_FINALE  = 6.0;

  // Costruisce l'array righe (formato motore) dai sali della fase
  function faseSaliARighe(sali) {
    return sali.map(function(s) {
      var info = getSale(s.id);
      return {
        id:   s.id,
        dose: s.g,
        nome: info ? (info.nome || s.id) : s.id,
        serb: info ? (info.serb || 'A') : 'A'
      };
    });
  }

  // ── Contatori ────────────────────────────────────────────────────────
  var nPass = 0, nWarn = 0, nFail = 0;
  var tutti = [];

  // ══════════════════════════════════════════════════════════════════════
  // LOOP PRINCIPALE
  // ══════════════════════════════════════════════════════════════════════
  for (var pi = 0; pi < PIANTE_BUILTIN.length; pi++) {
    var pianta = PIANTE_BUILTIN[pi];

    for (var fi = 0; fi < pianta.fasi.length; fi++) {
      var fase = pianta.fasi[fi];
      var phTest     = (fase.ph[0] + fase.ph[1]) / 2;
      var ecMin      = fase.ec[0];
      var ecMax      = fase.ec[1];

      for (var ai = 0, aqKeys = Object.keys(ACQUE); ai < aqKeys.length; ai++) {
        var nomeAcqua = aqKeys[ai];
        var aq        = ACQUE[nomeAcqua];

        for (var di = 0; di < DILUIZIONI.length; di++) {
          var dil = DILUIZIONI[di];
          var esito;

          try {
            usaSerbC = false;

            // 1. Righe dalla ricetta
            var righe = faseSaliARighe(fase.sali);

            // 2. Correzione dosi per ioni già nell'acqua
            var corrRes = correggiDosi(righe, aq);
            righe = corrRes.righe;

            // 3. Risoluzione incompatibilità + assegnazione serbatoi
            var autoRes = autoRisolvi(righe, dil, aq);
            righe = autoRes.righe;

            // 4. Verifica sicurezza chimica
            var sicurezza = verificaSicurezza(righe, dil, aq, PH_FINALE);

            // 5. Profilo ionico soluzione finale (con apporti acqua)
            var profilo = profiloDaRighe(righe, aq);

            // 6. EC calcolata
            var ec = ecFromIons(profilo, phTest);

            // 7. Bilancio milli-equivalenti
            var meq      = meqBalance(profilo, phTest);
            var meqRatio = (meq.an > 0.001) ? (meq.cat / meq.an) : 1.0;

            // 8. Classificazione
            var ecOk  = ec >= ecMin * 0.70 && ec <= ecMax * 1.40;
            var meqOk = meqRatio >= 0.75   && meqRatio <= 1.30;
            var sicuro = sicurezza.sicuro;

            var warns  = [];
            var errors = [];

            if (!sicuro) {
              for (var ci = 0; ci < sicurezza.critici.length; ci++) {
                errors.push(sicurezza.critici[ci].titolo);
              }
            }
            if (!ecOk) {
              warns.push('EC ' + ec.toFixed(2) + ' mS/cm fuori target ['
                + (ecMin*0.70).toFixed(2) + ' - ' + (ecMax*1.40).toFixed(2) + ']');
            }
            if (!meqOk) {
              warns.push('meq=' + meqRatio.toFixed(3)
                + ' (cat:' + meq.cat.toFixed(1) + ' an:' + meq.an.toFixed(1) + ')');
            }

            var stato;
            if (!sicuro)            stato = 'FAIL';
            else if (!ecOk||!meqOk) stato = 'WARN';
            else                    stato = 'PASS';

            if (stato === 'PASS')      nPass++;
            else if (stato === 'WARN') nWarn++;
            else                       nFail++;

            esito = {
              stato: stato,
              ec: ec.toFixed(2),
              meqRatio: meqRatio.toFixed(3),
              sicuro: sicuro,
              nInt: autoRes.interventi.length,
              needsC: !!(autoRes.needsSerbC && autoRes.needsSerbC.length > 0),
              warns: warns,
              errors: errors
            };

          } catch (err) {
            nFail++;
            esito = {
              stato: 'ERROR', ec: '?', meqRatio: '?', sicuro: false,
              nInt: 0, needsC: false, warns: [],
              errors: ['ECCEZIONE: ' + err.message]
            };
          }

          tutti.push({
            piantaNome: pianta.nome,
            piantaId:   pianta.id,
            emoji:      pianta.emoji || '',
            faseNome:   fase.nome,
            faseIdx:    fi,
            ecTarget:   [ecMin, ecMax],
            acqua:      nomeAcqua,
            dil:        dil,
            esito:      esito
          });
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // REPORT
  // ══════════════════════════════════════════════════════════════════════
  var TOTAL = nPass + nWarn + nFail;
  var SEP   = ('═').repeat(80);
  var sep   = ('─').repeat(80);

  console.log('');
  console.log(SEP);
  console.log('  FERTICONTROL — TEST HEADLESS COMBINATORIO');
  console.log('  11 Colture × Fasi × 6 Acque × Diluizioni 1:50 / 1:150 / 1:200');
  console.log(SEP);
  console.log('  Combinazioni totali : ' + TOTAL);
  console.log('  PASS  ✅ : ' + nPass);
  console.log('  WARN  ⚠️  : ' + nWarn);
  console.log('  FAIL  ❌ : ' + nFail);
  console.log('');

  var prevPianta = null;
  var prevFase   = null;

  for (var ri = 0; ri < tutti.length; ri++) {
    var t = tutti[ri];
    var e = t.esito;

    // ── Intestazione coltura (con statistiche aggregate) ──
    if (t.piantaNome !== prevPianta) {
      var cp = 0, cw = 0, cf = 0;
      for (var k = ri; k < tutti.length && tutti[k].piantaNome === t.piantaNome; k++) {
        if (tutti[k].esito.stato === 'PASS')      cp++;
        else if (tutti[k].esito.stato === 'WARN') cw++;
        else                                       cf++;
      }
      var bdg = cf > 0 ? '❌' : cw > 0 ? '⚠️ ' : '✅';
      console.log(sep);
      console.log(bdg + '  ' + t.emoji + ' ' + t.piantaNome
        + '  [PASS:' + cp + ' WARN:' + cw + ' FAIL:' + cf + ']');
      prevPianta = t.piantaNome;
      prevFase   = null;
    }

    // ── Intestazione fase ──
    if (t.faseNome !== prevFase) {
      console.log('');
      console.log('  Fase: ' + t.faseNome
        + '  (EC target ' + t.ecTarget[0] + '–' + t.ecTarget[1] + ' mS/cm)');
      prevFase = t.faseNome;
    }

    // ── Riga risultato ──
    var icon   = e.stato === 'PASS' ? '✅' : e.stato === 'WARN' ? '⚠️ ' : '❌ ';
    var aqStr  = t.acqua.padEnd(11);
    var dilStr = ('1:' + t.dil).padEnd(7);
    var ecStr  = ('EC=' + e.ec + 'mS').padEnd(13);
    var meqStr = ('meq=' + e.meqRatio).padEnd(12);
    var intStr = 'int=' + e.nInt;

    var extra = '';
    if (e.errors.length > 0) extra += '  ❌ ' + e.errors.join(' | ');
    if (e.warns.length  > 0) extra += '  ⚠️  ' + e.warns.join(' | ');
    if (e.needsC)            extra += '  [Serb.C consigliato]';

    console.log('    ' + icon + ' ' + aqStr + ' ' + dilStr + ' ' + ecStr + ' ' + meqStr + ' ' + intStr + extra);
  }

  // ── Riepilogo finale ──
  console.log('');
  console.log(SEP);
  if (nFail === 0 && nWarn === 0) {
    console.log('  ✅  TUTTI I TEST SUPERATI — ' + TOTAL + '/' + TOTAL + ' combinazioni valide.');
  } else if (nFail === 0) {
    console.log('  ⚠️   ' + nWarn + ' avvertimenti — nessun errore critico.');
    console.log('  ✅  ' + nPass + ' combinazioni corrette su ' + TOTAL + '.');
  } else {
    console.log('  ❌  ' + nFail + ' ERRORI CRITICI — ' + nWarn + ' avvertimenti.');
    console.log('  ✅  ' + nPass + ' combinazioni valide su ' + TOTAL + '.');
  }
  console.log(SEP);
  console.log('');

  if (typeof process !== 'undefined') {
    process.exit(nFail > 0 ? 1 : 0);
  }
})();
`;

// ══════════════════════════════════════════════════════════════════════
// CONTESTO VM + ESECUZIONE
// ══════════════════════════════════════════════════════════════════════
const ctx = vm.createContext({
  localStorage: localStorageMock,
  document:     documentMock,
  window:       { _targetAttivo: null, _bilanciaRighe: null },
  console,
  process,
  Math, Array, Object, JSON, String, Number, Boolean, Set, Map,
  Error, TypeError, RangeError, SyntaxError,
  parseFloat, parseInt, isNaN, isFinite,
  undefined,
  // Timer mock (chiamati a fine script per init UI — no-op in headless)
  setTimeout:    () => {},
  clearTimeout:  () => {},
  setInterval:   () => 0,
  clearInterval: () => {}
});

try {
  vm.runInContext(jsCode + '\n' + testCode, ctx, {
    filename:      'FertiControl-headless-test',
    displayErrors: true
  });
} catch (e) {
  console.error('\nFATAL — Errore durante l\'esecuzione del test:');
  console.error(e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}
