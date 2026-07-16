// ════════════════════════════════════════════════════════════════
// FORGE — graphify
//
// Apre allenamento.html in Chromium headless (Playwright), verifica i
// comportamenti chiave e salva gli screenshot in graphify-out/forge/:
//   01-home.png      vista iniziale
//   02-drag.png      finestra esercizio "vibrata" in trascinamento
//   03-opzioni.png   menu opzioni di un esercizio (solo tre puntini)
//   04-timer.png     timer di recupero dopo una serie completata
//
// Verifiche:
//   V1. Caricamento senza errori JS
//   V2. Nessuna maniglia di trascinamento (.ex-grip rimossa)
//   V3. Pulsante opzioni senza testo (solo i tre puntini)
//   V4. Pressione prolungata → vibrazione + card trascinabile
//   V5. Il trascinamento riordina davvero gli esercizi
//   V6. Trascinare SENZA pressione prolungata NON sposta nulla
//
// Uso:  node FORGE/graphify.js
// ════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

let chromium;
{
  const candidates = [
    'playwright',
    process.env.PLAYWRIGHT_PATH,
    path.join(__dirname, '..', 'node_modules', 'playwright'),
    '/opt/node22/lib/node_modules/playwright',
  ].filter(Boolean);
  let lastErr;
  for (const c of candidates) {
    try { ({ chromium } = require(c)); break; }
    catch (e) { lastErr = e; }
  }
  if (!chromium) {
    console.error('Playwright non trovato. Installa con: npm install playwright');
    throw lastErr;
  }
}

const APP = 'file://' + path.resolve(__dirname, 'allenamento.html');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const OUT = path.resolve(__dirname, '..', 'graphify-out', 'forge');

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXEC, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));

  // spia sulla vibrazione: registra ogni chiamata a navigator.vibrate
  await page.addInitScript(() => {
    window.__vibrations = [];
    Object.defineProperty(Navigator.prototype, 'vibrate', {
      value: function (p) { window.__vibrations.push(p); return true; },
      configurable: true
    });
  });

  await page.goto(APP);
  await page.waitForTimeout(700); // animazioni di ingresso

  check('V1: nessun errore JS al caricamento', jsErrors.length === 0, jsErrors.join(' | '));
  check('V2: maniglia .ex-grip assente', await page.locator('.ex-grip').count() === 0);
  const optsText = (await page.locator('[data-testid="exercise-menu-0"]').innerText()).trim();
  check('V3: pulsante opzioni senza testo', optsText === '', `testo trovato: "${optsText}"`);

  await page.screenshot({ path: path.join(OUT, '01-home.png') });

  // ── V6: trascinare subito (senza tenere premuto) NON deve spostare ──
  const firstName = await page.locator('[data-testid="exercise-name-0"]').innerText();
  let box = await page.locator('[data-testid="exercise-name-0"]').boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + 200, { steps: 8 }); // subito, prima dei 350ms
  await page.mouse.up();
  await page.waitForTimeout(200);
  const nameAfterQuick = await page.locator('[data-testid="exercise-name-0"]').innerText();
  check('V6: drag immediato ignorato (serve la pressione prolungata)', nameAfterQuick === firstName);

  // preme a lungo la card finché non è armata (vibrazione + classe dragging)
  async function holdCard(cardIdx) {
    const b = await page.locator(`[data-testid="exercise-name-${cardIdx}"]`).boundingBox();
    await page.mouse.move(b.x + 10, b.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(550); // oltre la soglia di 350ms
    return {
      x: b.x + 10,
      vibrated: await page.evaluate(() => window.__vibrations.length > 0),
      dragging: await page.locator('.ex-card.dragging').count() === 1
    };
  }
  // quante card (non trascinate) stanno sopra il segnaposto
  const phIndex = () => page.evaluate(() => {
    const list = document.getElementById('exList');
    const ph = list.querySelector('.drag-ph');
    let n = 0;
    for (const el of list.children) {
      if (el === ph) return n;
      if (el.classList.contains('ex-card') && !el.classList.contains('dragging')) n++;
    }
    return -1;
  });

  // ── V4+V7+V5a: pressione prolungata, card compatte, giù sotto la seconda ──
  const armed = await holdCard(0);
  check('V4: vibrazione + card armata dopo pressione prolungata', armed.vibrated && armed.dragging,
    `vibrazioni=${armed.vibrated}, dragging=${armed.dragging}`);
  const compact = await page.evaluate(() => {
    const list = document.getElementById('exList');
    const sets = list.querySelector('.ex-card:not(.dragging) .sets');
    return list.classList.contains('compact') && getComputedStyle(sets).display === 'none';
  });
  check('V7: tutte le card ridotte al solo titolo durante il drag', compact);

  // punto appena sotto il centro della prima card non trascinata (= seconda posizione)
  const dropY = await page.evaluate(() => {
    const c = document.querySelector('#exList .ex-card:not(.dragging)');
    const r = c.getBoundingClientRect();
    return r.top + r.height / 2 + 12;
  });
  await page.mouse.move(armed.x, dropY, { steps: 10 });
  await page.waitForTimeout(250);
  check('segnaposto in seconda posizione prima del rilascio', (await phIndex()) === 1);
  await page.screenshot({ path: path.join(OUT, '02-drag.png') });
  await page.mouse.up();
  await page.waitForTimeout(400);
  let names = await page.locator('.ex-info h3').allInnerTexts();
  check('V5a: card spostata SOTTO la seconda', names[1] === firstName, `ordine: [${names.join(', ')}]`);
  const expanded = await page.evaluate(() =>
    !document.getElementById('exList').classList.contains('compact') &&
    getComputedStyle(document.querySelector('#exList .ex-card .sets')).display !== 'none');
  check('V7b: card di nuovo estese dopo il rilascio', expanded);

  // ── V5b: di nuovo su, in cima ──
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const up = await holdCard(names.indexOf(firstName));
  await page.mouse.move(up.x, 95, { steps: 12 }); // sopra il punto medio della prima card
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(400);
  names = await page.locator('.ex-info h3').allInnerTexts();
  check('V5b: card riportata SOPRA, in cima', names[0] === firstName, `ordine: [${names.join(', ')}]`);

  // ── menu opzioni (solo puntini) ──
  await page.locator('[data-testid="exercise-menu-0"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '03-opzioni.png') });
  await page.mouse.click(195, 100); // chiude toccando fuori
  await page.waitForTimeout(300);

  // ── timer di recupero ──
  await page.locator('[data-testid="set-check-0-0"]').click();
  await page.waitForTimeout(450);
  check('Timer aperto dopo la spunta di una serie', await page.locator('#timerOverlay.open').count() === 1);
  await page.screenshot({ path: path.join(OUT, '04-timer.png') });
  await page.locator('[data-testid="timer-skip"]').click();

  // ── sessioni: salva, "ultima volta" a colpo d'occhio, confronto ──
  await page.fill('[data-testid="reps-0-0"]', '10');
  await page.fill('[data-testid="weight-0-0"]', '52.5');
  check('V8: pulsante "Fine" visibile con almeno una serie completata', await page.locator('#fabSave').isVisible());
  await page.locator('#fabSave').click();
  await page.waitForTimeout(400);
  await page.locator('#finSaveClear').click();
  await page.waitForTimeout(450);
  const prevTxt = (await page.locator('.set-prev').first().innerText()).replace(/\s+/g, ' ');
  check('V9: riga "ultima volta" con ripetizioni e peso', prevTxt.includes('10') && prevTxt.includes('52.5'), prevTxt);
  check('V9b: spunte e valori azzerati dopo "salva e prepara"', await page.locator('.set-check.on').count() === 0);
  await page.screenshot({ path: path.join(OUT, '05-ultima-volta.png') });

  // sessione di oggi con valori migliori, poi confronto
  await page.fill('[data-testid="reps-0-0"]', '11');
  await page.fill('[data-testid="weight-0-0"]', '55');
  await page.locator('[data-testid="set-check-0-0"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-testid="timer-skip"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="app-menu-btn"]').click();
  await page.waitForTimeout(350);
  await page.locator('[data-testid="menu-compare"]').click();
  await page.waitForTimeout(400);
  const cmp = await page.locator('#modal').innerText();
  check('V10: confronto ultima volta / oggi con freccia di miglioramento',
    cmp.includes('52.5') && cmp.includes('55') && cmp.includes('▲'), cmp.slice(0, 120));
  await page.screenshot({ path: path.join(OUT, '06-confronto.png') });

  check('Nessun errore JS durante le interazioni', jsErrors.length === 0, jsErrors.join(' | '));

  await browser.close();
  console.log(`\ngraphify: ${pass} ok, ${fail} falliti — screenshot in ${OUT}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
