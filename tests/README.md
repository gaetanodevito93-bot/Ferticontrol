# FertiControl — Suite di test automatica

Esegue l'app reale (`Ferticontrol/Ferticontrol1.html`) in Chromium headless e verifica motore chimico, solver, sicurezza, persistenza e UI. **Da lanciare prima di ogni modifica al file HTML e dopo ogni correzione.**

## Requisiti

- Node.js ≥ 18
- Playwright con Chromium:

```bash
npm install playwright
npx playwright install chromium
```

Se Chromium è già installato altrove, indicare il percorso con la variabile `CHROMIUM_PATH`.

## Esecuzione

```bash
node tests/run-tests.js
```

Exit code `0` = tutti i test passati; `1` = almeno un fallimento (elencati in fondo all'output); `2` = errore della suite stessa.

## Cosa copre

| Sezione | Verifica |
|---|---|
| S1 | Caricamento senza errori JS, stato iniziale (22 sali, 11 ricette, 5 tab) |
| S2 | **Golden test**: bilancio ionico chiuso (cationi ≈ anioni) per ogni sale macro del catalogo — una formula salina è elettricamente neutra |
| S3 | **Golden test**: EC calcolata dai coefficienti vs range EC dichiarato da tutte le 35 fasi delle ricette builtin |
| S4 | **Invarianti** su tutte le 35 fasi: output renderizzato, niente NaN/undefined, input immutabile dopo il calcolo, risultato idempotente (Calcola ×2 = stesso output) |
| S5 | Stress: acqua dura/osmosi/distillata × diluizioni 1:50 e 1:200 sul caso peggiore (pomodoro fruttificazione) |
| S6 | Motore serbatoi: dopo `autoRisolvi` nessuna coppia critica (gravità C) convive nello stesso tank, su tutte le fasi builtin |
| S7 | `verificaSicurezza` rileva conflitti forzati (Ca+fosfato stesso tank) e approva configurazioni corrette |
| S8 | Solver NNLS: target macro raggiunti entro il 15%, dosi mai negative, Fe mai sotto target (overshoot da MixCh documentato, tetto 5 mg/L) |
| S9 | Regressione fix sali custom: B/Cu/Mo, stima EC (`stimaEcC` vs coefficienti tabellati), % N ammoniacale, prodotti liquidi in mL |
| S10 | Round-trip persistenza: export JSON → reset di fabbrica → import → stato identico (inclusi i campi nuovi dei sali custom) |
| S11 | Fuzzing dell'import: JSON malformato, payload ostile (tentativi di injection HTML, valori negativi/enormi/tipo sbagliato), numeri estremi → nessun crash non gestito, nessuna injection nel DOM, app funzionante |
| S12 | Cambio lingua IT/EN a runtime con calcolo completo in inglese |

## Note per chi estende la suite

- Il fallimento dei Google Fonts (`net::ERR...`) è filtrato: offline è il comportamento atteso, non un errore dell'app.
- Il `console.error` dentro il `catch` di `importaDati` è logging voluto: i "crash" veri sono solo i `pageerror`.
- Il Mix Chelati è dimensionato sul micro più esigente: l'overshoot di Fe rispetto al target è **by design** (vedi commento in `solverTarget`), non un bug.
- Ogni bug corretto in futuro dovrebbe diventare un test qui dentro: è la garanzia che non ritorni.
