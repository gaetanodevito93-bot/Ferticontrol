# FertiControl — Manuale Tecnico

**Versione applicazione:** v2.0
**File:** `index.html`

Questo documento spiega com'è pensato FertiControl, come è costruito e quali funzionalità offre. È rivolto a chi riceve il file e vuole capirne la logica interna: utenti avanzati, sviluppatori e chiunque voglia modificarlo o estenderlo.

---

## Indice

1. [Che cos'è FertiControl](#capitolo-1--che-cosè-ferticontrol)
2. [Filosofia di progetto e architettura](#capitolo-2--filosofia-di-progetto-e-architettura)
3. [Flusso di lavoro e interfaccia](#capitolo-3--flusso-di-lavoro-e-interfaccia)
4. [Scheda Acqua — l'acqua di partenza](#capitolo-4--scheda-acqua)
5. [Scheda Ricette — colture, fasi e ricette personalizzate](#capitolo-5--scheda-ricette)
6. [Scheda Calcola — il cuore operativo](#capitolo-6--scheda-calcola)
7. [Il motore chimico](#capitolo-7--il-motore-chimico)
8. [Automatismi: serbatoi, incompatibilità e auto-risoluzione](#capitolo-8--automatismi)
9. [Il solver a target (NNLS)](#capitolo-9--il-solver-a-target-nnls)
10. [La verifica di sicurezza](#capitolo-10--la-verifica-di-sicurezza)
11. [Scheda Catalogo — ingredienti e scorta](#capitolo-11--scheda-catalogo)
12. [Scheda Dati — backup, import e reset](#capitolo-12--scheda-dati)
13. [Stampa e output operativi](#capitolo-13--stampa-e-output-operativi)
14. [Persistenza dati e sicurezza del codice](#capitolo-14--persistenza-dati-e-sicurezza-del-codice)
15. [Internazionalizzazione (IT/EN)](#capitolo-15--internazionalizzazione)
16. [Limiti, assunzioni e avvertenze](#capitolo-16--limiti-assunzioni-e-avvertenze)
17. [Glossario](#capitolo-17--glossario)

---

## Capitolo 1 — Che cos'è FertiControl

FertiControl è un **calcolatore professionale per la fertirrigazione** orientato alla coltivazione in **coco coir** (fibra di cocco). Il suo compito è trasformare una ricetta nutritiva (espressa come dosi di sali o come target di elementi in mg/L) nelle **soluzioni madri concentrate** da preparare nei serbatoi A, B ed eventualmente C, tenendo conto:

- dell'**acqua di partenza** (i minerali già presenti vengono sottratti);
- della **compatibilità chimica** tra i sali (cosa può stare nello stesso serbatoio senza precipitare);
- del **fattore di diluizione** (quanto è concentrata la soluzione madre rispetto a quella finale);
- del **pH della soluzione finale** (che governa la solubilità dei fosfati di calcio);
- della **disponibilità reale in magazzino** degli ingredienti.

Il risultato è una scheda operativa completa: grammi di ogni sale per serbatoio, EC e pH attesi, bilancio ionico, costi, avvisi di precipitazione e procedura di preparazione passo-passo stampabile.

A differenza dei semplici calcolatori di dosi, FertiControl include un **motore chimico quantitativo** (indici di saturazione, speciazione ionica, correzione di attività) e un **sistema di auto-risoluzione** che sposta i sali tra serbatoi, suggerisce correzioni acide per i bicarbonati e, se necessario, ribilancia automaticamente le dosi per riportare la soluzione in zona sicura.

---

## Capitolo 2 — Filosofia di progetto e architettura

### 2.1 Un solo file, nessuna dipendenza

L'intera applicazione vive in **un unico file HTML** (~5.500 righe, ~350 KB) che contiene CSS, markup e JavaScript. Le scelte che ne derivano:

- **Zero installazione**: si apre con un doppio clic in qualsiasi browser moderno, su desktop e mobile.
- **Zero backend**: nessun server, nessun account, nessuna trasmissione di dati. Tutto gira in locale.
- **Zero build**: niente bundler, framework o transpiler. Il codice è JavaScript "vanilla" leggibile direttamente nel file.
- **Portabilità totale**: il file si può inviare via mail o chiavetta; i dati personali restano nel browser di chi lo usa (vedi Capitolo 14).
- L'unica risorsa esterna sono i **font Google** (Inter, JetBrains Mono): senza connessione l'app funziona comunque, con i font di sistema.

Il singolo file resta il cuore dell'app; accanto ad esso vivono alcuni file **opzionali** che la trasformano in **Progressive Web App** (`manifest.webmanifest`, `sw.js`, `icons/`). Sono inerti se l'app è aperta da `file://` e non intaccano la portabilità: entrano in gioco solo quando l'app è servita via HTTP(S) (vedi §2.4).

### 2.2 Organizzazione interna del file

Il file è ordinato in blocchi riconoscibili:

| Sezione | Contenuto | Zona indicativa |
|---|---|---|
| `<head>` + `<style>` | Meta tag, favicon SVG inline, tutto il CSS (variabili tema, componenti, media query, stili stampa) | righe 1–450 |
| Markup | Header, barra tab, i 5 pannelli, i modali (ingrediente, ricetta, conferme) | righe 450–790 |
| i18n | Dizionari IT/EN e funzioni `t()`, `setLang()`, `applyLang()`, `TT()` | righe 790–1215 |
| Costanti chimiche | Masse molari `MM`, conduttività `LAMBDA`, pKa, fattori ossido `OXIDE` | righe 1215–1225 |
| Motore chimico | Ksp, speciazione con attività, Davies, SI, EC, bilancio meq, profilo, acido (`calcAcidVolume`, `acidoPrescritto`, `contributoAcqua`) | righe 1225–1400 |
| Dati di fabbrica | `SALI_DEFAULT` (catalogo), `PIANTE_BUILTIN` (ricette), traduzioni dati | righe 1400–1800 |
| Stato e persistenza | `safeParse`, migrazione catalogo, `localStorage`, `statoCalc` | righe 1470–1530 |
| UI Ricette | Selezione pianta/fase, editor ricette custom, editor target | righe 1970–2450 |
| Solver | `gaussSolve`, `lsq`, `nnls` (Lawson-Hanson), `risolviMacro`, `risolviMicro`, `solverTarget`, `sostituisciNonDisponibili`, `ricalcolaConDisponibili` | righe 2455–2790 |
| Compatibilità | Gruppi ionici, `INCOMPAT_MATRIX`, `assegnaSerbatoi`, `capNH4NO3`, `autoRisolvi`, `autoBilanciaSali` | righe 2940–3335 |
| Verifica e calcolo | `verificaSicurezza`, `correggiDosi`, `calcola` e rendering risultati | righe 3335–4280 |
| Stampa | `stampaMiscela`, `stampaCatalogo`, iframe di stampa | righe 4280–4760 |
| Catalogo e Dati | CRUD ingredienti, scorta, export/import/reset | righe 4760–5100 |

### 2.3 Convenzioni

- **Unità dosi**: internamente ogni dose è espressa in **g/1000 L di soluzione finale** (equivale a mg/L di prodotto). La conversione a grammi reali nel serbatoio è `dose × volume_serbatoio × diluizione / 1000` (funzione `grConc`).
- **Identificatori sali**: ogni sale ha un `id` corto stabile (`CaN`, `KNO3`, `KH2PO4`, `MixCh`…) usato come chiave in tutte le matrici di compatibilità e nei profili delle ricette.
- **Stile difensivo**: ogni lettura da `localStorage` passa per `safeParse` (un dato corrotto non blocca l'app); ogni testo salvato passa per `stripTags` contro l'injection HTML; il calcolo lavora sempre su una **copia** delle dosi inserite (premere "Calcola" N volte non altera mai gli input).

### 2.4 Progressive Web App

Servita via HTTP(S), FertiControl è installabile e utilizzabile offline. I pezzi:

| File | Ruolo |
|---|---|
| `manifest.webmanifest` | Metadati d'installazione: nome, `display: standalone`, `theme_color`, icone. `start_url` e `scope` sono **relativi**, così la PWA funziona anche da una sottocartella (es. GitHub Pages). |
| `sw.js` | Service worker. **Install**: precache dell'app shell (HTML, manifest, icone). **Activate**: pulizia delle cache vecchie. **Fetch**: *network-first* per l'HTML (prende l'ultima versione se online, altrimenti la cache) e *cache-first* per gli asset statici. I font Google (cross-origin) restano in rete e offline degradano ai font di sistema. |
| `icons/` | Icone PNG 192/512, una **maskable** 512 e l'apple-touch-icon 180. |

Nell'`<head>` ci sono `<link rel="manifest">`, l'apple-touch-icon e i meta Apple; a fine `<body>` uno script registra il service worker **solo se `location.protocol`** inizia con `http` — da `file://` non fa nulla. Un pulsante flottante "Installa app" compare quando il browser emette `beforeinstallprompt` e sparisce dopo l'installazione.

Regola operativa: **a ogni modifica dell'app, incrementa `CACHE_VERSION` in `sw.js`** per invalidare la cache e propagare la nuova versione ai dispositivi che l'hanno installata.

---

## Capitolo 3 — Flusso di lavoro e interfaccia

L'interfaccia è una SPA a schede (tab). Il flusso pensato è **lineare, da sinistra a destra**:

```
① 💧 ACQUA  →  ② 🌿 RICETTE  →  ③ ⚗️ CALCOLA  →  (④ 📦 CATALOGO, ⑤ 💾 DATI a supporto)
```

1. **Acqua** — inserisci l'analisi dell'acqua di partenza (o scegli un preset).
2. **Ricette** — scegli una coltura e la fase di crescita, oppure crea/clona una ricetta tua; premi "→ Calcola" per caricarla.
3. **Calcola** — imposta volumi serbatoi, diluizione e pH finale; premi "Calcola Dosaggi" e ottieni la scheda completa con dosi, verifiche e stampa.
4. **Catalogo** — gestisci i fertilizzanti: composizione, prezzo, note e soprattutto la **scorta** (cosa hai davvero in magazzino).
5. **Dati** — esporta/importa il backup JSON, ripristina i valori di fabbrica, controlla le statistiche.

Elementi trasversali dell'interfaccia:

- **Selettore lingua IT/EN** nell'header (persistito in `fc_lang`).
- **Tooltip informativi** (icona ⓘ) sui parametri delicati come diluizione e pH finale.
- **Toast** di conferma/errore per le operazioni di salvataggio.
- **Modali** per la creazione/modifica di ingredienti e ricette, con conferma esplicita per le eliminazioni.
- Accessibilità: ruoli ARIA su tab e modali, navigazione da tastiera sulle tab, `aria-label` sui pulsanti icona.

---

## Capitolo 4 — Scheda Acqua

### 4.1 Cosa si inserisce

L'analisi dell'acqua di partenza (acquedotto, pozzo, osmosi):

- **EC** (mS/cm), **pH** e **temperatura** (°C, default 20);
- ioni in mg/L: **Ca²⁺, Mg²⁺, K⁺, Na⁺, SO₄²⁻, Cl⁻, HCO₃⁻, NO₃⁻, Fe**.

### 4.2 Preset rapidi e profili personali

Sei preset precompilati: **Ottima (EC 0.1)**, **Acquedotto medio**, **Acqua dura**, **Osmosi inversa**, **Piovana** e **Personalizzata** — quest'ultima precompila i valori dell'acquedotto medio come base realistica da correggere con la propria analisi. Servono come punto di partenza quando non si dispone di un'analisi di laboratorio.

Accanto ai preset generici, l'utente può salvare le **proprie analisi con un nome** ("Pozzo — analisi giugno", "Acquedotto casa") e richiamarle con un click: è la soluzione per chi ha più fonti idriche o analisi stagionali. I profili personali sono persistiti in `fc_acqua_profili`, inclusi nel backup JSON (export/import con merge per nome), aggiornabili risalvando lo stesso nome ed eliminabili singolarmente con conferma.

### 4.3 Come viene usata l'acqua nel calcolo

L'acqua non è un semplice dato informativo — entra in quattro punti del motore:

1. **Ribilanciamento sul profilo della ricetta** (`correggiDosi` in modalità grammi, oppure direttamente nei target nel solver): la ricetta definisce un *profilo* in mg/L pensato per acqua pura. Le dosi dei sali macro vengono **ri-risolte** (vedi `risolviMacro`, Capitolo 9) perché *sali + acqua + acido* riproducano quel profilo. I solfati e i nitrati dell'acqua sono convertiti in unità elementari (SO₄→S con `MM.S/96.06`, NO₃→N con `MM.N/62.00`). La vecchia riduzione proporzionale per singolo ione ignorava che ogni sale porta più elementi: tagliando il nitrato di calcio per il Ca dell'acqua si perdeva anche il suo N (pomodoro vegetativo con acqua media: N da 205 a 125 mg/L). Se i sali della ricetta non bastano — tipicamente quando l'acqua copre già tutto il Ca e con esso sparisce l'N del nitrato di calcio — il solver può aggiungere un sale in scorta (es. NH₄NO₃ entro il limite NH₄ ≤ 10%). La tabella **"Fedeltà alla ricetta"** mostra elemento per elemento ricetta → ottenuto. Il Fe dell'acqua riduce in proporzione i soli chelati di ferro.
2. **Neutralizzazione dei bicarbonati**: se HCO₃⁻ > 50 mg/L il motore prescrive i **mL/L di acido** da aggiungere all'acqua di diluizione, calcolati dalle molarità reali dei prodotti commerciali (`calcAcidVolume`). L'acido si sceglie in Calcola (**Automatico**, default, oppure **HNO₃ 38%** / **H₃PO₄ 75%** forzati dall'utente; persistito in `fc_acido`). In automatico `scegliAcido` calcola la ricetta con entrambi gli acidi e tiene quello col minore scostamento relativo dalla ricetta (N, P, K, Ca, Mg e S a peso dimezzato, esclusi gli elementi che l'acqua da sola già supera; a parità vince l'HNO₃), scartando però un acido che introduca un nutriente assente nella ricetta (P per l'H₃PO₄, N per l'HNO₃) o che porti la soluzione finale in sovrasaturazione di CaHPO₄ quando l'altro la mantiene sicura: la scelta e il motivo sono spiegati negli interventi e sotto il selettore. Fissato l'acido, `acidoPrescritto` è l'unica fonte di verità e il suo **N o P viene conteggiato** da solver, correzione acqua, profilo finale e verifiche; l'alcalinità neutralizzata viene tolta dal profilo finale. La dose è **dimensionata sul pH target**: Henderson-Hasselbalch sul pKa₁ del sistema carbonato (6.35) in **sistema chiuso**, cioè tenendo conto della CO₂ già disciolta al pH dell'acqua — `a = (HCO₃⁻ − CO₂₀·r)/(1 + r)` con `r = 10^(pH−6.35)` — sempre con un residuo tampone minimo di 0.5 meq/L (`RESID_HCO3_MEQ`). Se l'acqua è già al pH target, l'acido è zero. Con acqua molto dura l'H₃PO₄ da solo può superare il fabbisogno di P: il motore lo segnala e consiglia l'HNO₃.
3. **Rischio calcite (CaCO₃)**: il Ca totale e i carbonati dell'acqua (speciati con Henderson-Hasselbalch al pH dell'acqua) vengono confrontati col Ksp della calcite dipendente dalla temperatura.
4. **EC e bilancio ionico finali**: l'EC dell'acqua si somma a quella dei sali; Na e Cl dell'acqua entrano nei controlli di salinità (limiti coco: Na ~50 mg/L, Cl ~100 mg/L).
5. **Temperatura operativa** (`tcAcqua`): tutti gli indici di saturazione — per serbatoio, nel concentrato e nella soluzione finale — e il Ksp della calcite usano la temperatura dell'acqua invece del valore fisso 20 °C. L'effetto è rilevante: brushite (CaHPO₄), struvite e calcite hanno entalpia di dissoluzione negativa, quindi **a caldo sono meno solubili** — la stessa ricetta può essere sicura a 10 °C e sovrasatura a 30 °C. Valori fuori range (1–45 °C) degradano al default 20 °C; la temperatura viene salvata anche nei profili acqua.

### 4.4 Persistenza

I valori inseriti vengono salvati automaticamente in `localStorage` (chiave `fc_acqua`) a ogni modifica e ricaricati all'apertura: l'analisi dell'acqua si inserisce una volta sola.

---

## Capitolo 5 — Scheda Ricette

### 5.1 Ricette predefinite (built-in)

L'app include **11 colture** con fasi di crescita complete, calibrate per coco coir:

| Coltura | Fasi | Note caratteristiche |
|---|---|---|
| 🍅 Pomodoro | 4 (trapianto → veg → frutto → lavaggio) | Ca e K alti in fruttificazione, K/Ca ≈ 1.8 contro il marciume apicale (BER) |
| 🥬 Lattuga | 3 | N alto, Ca contro tip-burn, EC bassa |
| 🌿 Basilico | 3 | Mg elevato per gli oli essenziali |
| 🫑 Peperone | 3 | K alto in fruttificazione, sensibile a BER |
| 🥒 Cetriolo | 3 | Richiesta K molto alta, crescita rapida |
| 🍓 Fragola | 3 | Ca per struttura frutto, EC medio-bassa |
| 🌿 Cannabis/Canapa | 5 (cloni → veg → stretch → flora → flush) | N alto in veg, P+K alti in flora |
| 🍆 Melanzana | 3 | Come peperone ma più Ca |
| 🥒 Zucchina | 3 | N e K alti, ciclo breve |
| 🌱 Spinacio | 3 | N più alto tra le orticole |
| 🥗 Rucola | 2 | Ciclo brevissimo |

Ogni **fase** contiene: nome e icona, range EC e pH consigliati, nota agronomica con i target in mg/L (es. "Ca=140 K=254 P=39 Mg=30 N≈204") e l'elenco dei sali con le dosi in g/1000 L. Nel codice sono l'array `PIANTE_BUILTIN`; ogni dose è già "risolta" (i profili sono stati derivati dai range di letteratura riportati nei commenti).

Selezionando pianta → fase compaiono la **composizione** (tabella sali + profilo elementare calcolato + costo per 1000 L) e le **note agronomiche**; il pulsante **→ Calcola** trasferisce tutto nella scheda Calcola.

### 5.2 Ricette personalizzate

Tre vie per crearle:

- **+ Nuova Ricetta**: da zero, col modale dedicato (nome, emoji, note, N fasi).
- **✏️ Clona e modifica**: duplica una ricetta predefinita in una custom modificabile (le built-in non si toccano mai — restano il riferimento).
- **Import JSON** dalla scheda Dati.

### 5.3 Due modalità per fase: "grammi" e "target"

Ogni fase di una ricetta custom può lavorare in due modi (`modo: 'grammi' | 'target'`):

- **Grammi** — indichi direttamente i sali e le dosi. È la modalità delle ricette built-in: pieno controllo, il motore verifica e corregge.
- **Target** — indichi gli **obiettivi in mg/L per elemento** (N, P, K, Ca, Mg, Fe, Mn, Zn, B, Cu, Mo) e lasci che sia il **solver NNLS** (Capitolo 9) a scegliere i sali e le dosi. L'editor accetta i target sia in **mg/L** sia in **mmol/L** con conversione bidirezionale automatica (`setTargetMg`/`setTargetMol`).

Quando una fase target viene caricata in Calcola, la variabile `window._targetAttivo` segnala a `calcola()` di invocare il solver invece di usare dosi manuali.

---

## Capitolo 6 — Scheda Calcola

### 6.1 Parametri impianto

- **Volume Serbatoio A e B** (litri) — e **C** se attivato.
- **Fattore di diluizione 1:X** — 1 L di concentrato produce X L di soluzione finale. Più X è alto, più la madre è concentrata e più cresce il rischio di precipitazione: il campo ha un warning dinamico (`aggiornaDiluizioneWarning`) e il motore può **suggerire la diluizione massima sicura** in base alle dosi.
- **Acido per i bicarbonati** — HNO₃ (apporta N) o H₃PO₄ (apporta P): il motore conteggia l'elemento apportato e riduce di conseguenza i sali.
- **pH soluzione finale** — il pH mantenuto in coltura (default **5.8**, `PH_DEFAULT`). È l'input chiave della verifica anti-precipitazione dei fosfati (a pH ≤ 6 il fosfato di calcio resta in soluzione; sopra 6.3 tende a precipitare) e **dimensiona la dose di acido** prescritta per i bicarbonati. Se già esiste un risultato, cambiare il pH ricalcola al volo: le dosi dei sali restano invariate per scelta (i fabbisogni nutritivi non dipendono dal pH), mentre cambiano gli indici di saturazione, gli avvisi e i mL di acido.

### 6.2 Tabella "Sali da Preparare"

La lista dei sali in gioco, editabile riga per riga (sale dal catalogo, dose in g/1000 L, prezzo €/kg). Si popola caricando una ricetta o manualmente ("+ Aggiungi sale"). Gli ingredienti **non disponibili in scorta** vengono evidenziati in rosso e compare la **barra "Ricalcola con gli ingredienti disponibili"**: il profilo elementare della ricetta viene ri-risolto con i soli sali in scorta (macro col solver, restando vicino alle dosi originali; micro con sali singoli, chelati di ferro prima del FeSO₄) e una card riporta sali aggiunti, dosi adattate, profilo prima → dopo ed elementi non coperti (>10% sotto la ricetta). Vedi §8.5.

### 6.3 La pipeline di calcolo

Premendo **⚗️ Calcola Dosaggi**, `calcola()` esegue in ordine:

1. **Validazione input** (`validaInput`): volumi > 0, diluizione sensata, dosi numeriche; errori bloccanti mostrati in lista.
2. **Modalità target?** Se attiva, `solverTarget` genera le righe (acqua e acido già sottratti dai target). Il solver viene rieseguito a **ogni** calcolo, così pH, acqua, acido e scorta si riflettono sempre nelle dosi.
3. **Correzione acqua** (`correggiDosi`, solo se le dosi non sono già nette): ri-risolve le dosi macro sul profilo della ricetta (§4.3).

Lo stato della tabella sali è esplicito (`statoCalc`): `target` (fase a target attiva), `nette` (dosi già al netto dell'acqua: generate dal solver, da un bilanciamento applicato o modificate a mano dopo il solver — l'acqua **non** viene sottratta una seconda volta), `saltaBilanciamento` (l'utente ha ripristinato le dosi originali: niente auto-bilanciamento finché non cambia ricetta).
4. **Auto-risoluzione** (`autoRisolvi`): assegna i serbatoi, sposta i sali incompatibili, prescrive l'acido per l'HCO₃⁻, propone il serbatoio C o una diluizione diversa se serve (Capitolo 8).
5. **Verifica di sicurezza** (`verificaSicurezza`): gli 8+ controlli chimici del Capitolo 10.
6. **Auto-bilanciamento** (`autoBilanciaSali`): se la verifica fallisce, prova a ridurre selettivamente le dosi dei sali coinvolti fino a togliere i conflitti critici (concentrato SI ≤ −0.05, finale SI ≤ 0); se converge, riverifica e mostra il **report delle deviazioni**. "Ripristina dosi originali" torna alle dosi inserite e disattiva l'auto-bilanciamento per quel calcolo.
7. **Rendering del risultato**.

### 6.4 Il risultato

Il risultato è pensato per l'agricoltore: dopo il calcolo sono visibili solo **verdetto, interventi e suggerimenti, dosi per serbatoio (la ricetta), riepilogo con i costi, correzione pH/acido, gestione pH in coltura, note operative e procedura**, più i riquadri d'azione (pH suggerito, bilancia sali, serbatoio C, diluizione). Tutte le schede tecniche — **Soluzione finale (apporti totali), Fedeltà alla ricetta, Verifica Chimica Precisa, Verifica Anti-Precipitazione, report del bilanciamento automatico, Bilancio Ionico, Rapporti Agronomici, Contributo per Sostanza e Audit** — sono raggruppate nel pannello **"🔬 Info tecniche"** in fondo alla pagina, chiuso dopo ogni calcolo e aperto dall'apposito pulsante. La stampa non cambia: `stampaMiscela` apre il pannello solo per l'istante della lettura.

La scheda risultato comprende:

- **Dosi per serbatoio** — per A, B e C: grammi reali di ogni sale nel volume del serbatoio (`dose × vol × diluizione / 1000`), con EC parziale del serbatoio.
- **Interventi automatici** — l'elenco di ciò che il motore ha fatto o prescritto (spostamenti, acido, suggerimenti diluizione), ciascuno con spiegazione chimica.
- **Riepilogo** — EC finale attesa (dai coefficienti `EC_COEFF_GLOBAL` derivati da Kohlrausch/Onsager + EC acqua), EC nel concentrato, costo del batch e costo per 1000 L finali (calcolato dalle dosi, quindi indipendente dai volumi dei serbatoi).
- **Fedeltà alla ricetta** — target → ottenuto per N, P, K, Ca, Mg, S (sali + acqua + acido), sia in modalità target sia quando la correzione acqua ha ribilanciato le dosi.
- **Indici di saturazione** con **gauge grafici** (CaSO₄, CaHPO₄, CaCO₃, struvite) per concentrato e soluzione finale.
- **Bilancio ionico** — cationi vs anioni in meq/L (dalla speciazione completa), profilo elementare finale in mg/L e **contributo per sostanza**: quale sale porta quanto di ogni elemento.
- **Rapporti agronomici** — K/Ca, NH₄/N totale, ecc.
- **Verifica di sicurezza** — l'audit trail completo: ogni check con esito OK / AVVISO / GESTITO / CONFLITTO e dettaglio.
- **Pulsanti azione** — 🖨️ stampa della scheda operativa, ⚖️ bilanciamento, ripristino dosi.

---

## Capitolo 7 — Il motore chimico

È la parte che distingue FertiControl da un foglio di calcolo. Tutto il motore è nelle righe 1335–1480 e usa la termodinamica delle soluzioni, non soglie empiriche.

### 7.1 Costanti

- `MM` — masse molari degli elementi (Ca 40.078, Mg 24.305, K 39.098, N 14.007, P 30.974, S 32.06…).
- `LAMBDA` — conduttività molari limite degli ioni (Kohlrausch) per il calcolo EC.
- `OXIDE` — fattori di conversione elemento↔ossido (P→P₂O₅ ×2.2914, K→K₂O ×1.2046…) per leggere le etichette commerciali.
- Costanti acido-base: pKa₂ fosfato 7.20, pKa₃ fosfato 12.35, pKa₂ carbonato 10.33; coefficiente Davies A = 0.509.

### 7.2 Speciazione ionica (`speciate`)

Converte il profilo in ppm in **molarità per specie**, ripartendo:

- il fosforo tra H₂PO₄⁻ / HPO₄²⁻ / PO₄³⁻ secondo il pH. Il pH misura l'**attività** di H⁺, quindi i rapporti seguono i pKa termodinamici corretti per i coefficienti di attività: `[HPO₄²⁻]/[H₂PO₄⁻] = 10^(pH−pKa₂)·γ₁/γ₂`. Forza ionica e γ vengono iterati fino a convergenza. Ignorare γ₁/γ₂ (come nelle versioni precedenti) sottostimava HPO₄²⁻, e quindi il rischio brushite, di un fattore ~1.6 nella soluzione finale e 2–3 nei concentrati;
- i carbonati tra HCO₃⁻ / CO₃²⁻ (stessa correzione di attività);
- l'azoto tra NO₃⁻ e NH₄⁺ (in base al sale di provenienza: NH₄NO₃ = 50/50, MAP = tutto ammoniacale).

### 7.3 Attività: equazione di Davies

Le concentrazioni non bastano nelle soluzioni concentrate: gli ioni si "schermano" a vicenda. `ionicStrength` calcola la forza ionica I e `davies(I, z)` il coefficiente di attività γ per carica z:

```
log γ = −A·z²·( √I/(1+√I) − 0.3·I )
```

Tutti gli indici di saturazione usano **attività** (γ·c), non concentrazioni: questo evita sia falsi allarmi sia falsi negativi nelle madri concentrate.

### 7.4 Prodotti di solubilità dipendenti dalla temperatura

- **Calcite (CaCO₃)**: correlazione di Plummer-Busenberg completa (`kspCalcite`).
- **CaSO₄ (gesso), CaHPO₄ (brushite), struvite (MgNH₄PO₄)**: Ksp a 25 °C corretti con **van 't Hoff** (`vantHoff`) usando le entalpie di dissoluzione.

### 7.5 Indice di saturazione (SI)

Per ogni sale a rischio: `SI = log₁₀(IAP / Ksp)` dove IAP è il prodotto delle attività ioniche.

- **SI < −0.5** → ampio margine, sicuro;
- **−0.5 ≤ SI < 0** → metastabile, avviso;
- **SI > 0** → sovrasaturo, precipita.

Il SI viene calcolato **in tre contesti distinti**: (a) per singolo serbatoio concentrato (`serbSIs` — solo i sali di quel serbatoio × diluizione, pH 6, temperatura dell'acqua; gli ioni dell'acqua di processo non c'entrano, entrano solo nella finale); (b) il peggiore tra i serbatoi (`worstSerbSI`); (c) nella **soluzione finale diluita** al pH operativo scelto (`siFinaleSoluzione`), sempre alla temperatura impostata. Questa separazione è concettualmente importante: un composto può essere a rischio nel concentrato ma non nella finale (gestibile con pulizia tank o 3° serbatoio) o viceversa (grave: precipita nei gocciolatori).

### 7.6 EC e bilancio ionico

- `ecFromIons`: EC dalla somma delle conduttività molari delle specie, con correzione di forza ionica `1/(1+0.5√I)`.
- In parallelo esistono i coefficienti empirici per prodotto (`EC_COEFF_GLOBAL`, mS/cm per g/L) derivati da Kohlrausch con fattore di Onsager (~0.88 per elettroliti 1:1, ~0.60 per MgSO₄ per l'ion-pairing) — usati per l'EC "attesa" della miscela.
- `meqBalance`: somma cationi vs anioni in meq/L; uno sbilancio segnala un profilo incoerente.

### 7.7 pH sicuro suggerito

`phSicuroFinale` cerca il pH massimo a cui CaHPO₄ e struvite restano sotto saturazione nella soluzione finale: se il pH impostato è troppo alto, il motore suggerisce di **abbassare il pH invece di tagliare le dosi** (che rovinerebbe il profilo nutritivo).

---

## Capitolo 8 — Automatismi

### 8.1 Assegnazione automatica dei serbatoi

L'utente **non sceglie mai il serbatoio**: la regola base (`assegnaSerbatoi`) è

- sali di **calcio** (Ca(NO₃)₂, CaCl₂) → **Serbatoio B**;
- **tutto il resto** (fosfati, solfati, chelati, micro, acidi) → **Serbatoio A**;
- **silicato di potassio** → **Serbatoio C** se attivo, altrimenti B (dove fa meno danni) con la richiesta del serbatoio C.

**Serbatoio C automatico.** Ogni calcolo parte da 2 serbatoi; se `checkNeedSerbC` trova incompatibilità che A e B non possono separare (es. silicato con Ca e fosfati, CaSO₄ nel concentrato) il calcolo **attiva da solo il Serbatoio C** e ridistribuisce le dosi su 3 soluzioni madri, spiegando il motivo nel riquadro viola. Da lì l'utente può togliere la spunta (torna a 2 serbatoi, il conflitto resta segnalato) o impostare il volume del C; una scelta manuale resta valida per la sessione (`serbCManuale`).

È la classica separazione A/B della fertirrigazione: il calcio non deve mai incontrare fosfati e solfati nel concentrato.

### 8.2 La matrice di incompatibilità

Due livelli di rilevamento (`coppiaIncompatibile`):

1. **`INCOMPAT_MATRIX`** — ~35 coppie note per ID con gravità (C = critica, A = avviso), precipitato atteso e spiegazione chimica. Copre: Ca+fosfati (CaHPO₄), Ca+molibdato (CaMoO₄, "spesso dimenticato"), silicato+tutto (CaSiO₃, gel di acido silicico, degrado chelati a pH 11-12), KOH+acidi (reazione violenta), FeSO₄+fosfati (vivianite), micro-solfati+fosfati, chelati+Fe²⁺ libero.
2. **Gruppi ionici** (`classificaGruppiIonici` + `GRUPPI_INCOMPAT`) — ogni sale, **anche custom**, viene classificato per gruppi (Ca, PO4, SO4, SiO3, ACID, BASE, CHELATO, Fe2, MoO4) in base a ID e composizione elementare; le regole tra gruppi catturano le incompatibilità dei sali aggiunti dall'utente che la matrice per ID non conosce.

### 8.3 L'auto-solver (`autoRisolvi`)

Dopo l'assegnazione base, in sequenza:

1. **Bicarbonati**: se HCO₃⁻ > 50 mg/L, prescrive i mL/L di acido (HNO₃ o H₃PO₄) nell'acqua di diluizione, dimensionati sul pH target (`calcAcidVolume`, Henderson-Hasselbalch). Se invece l'acqua ha **bassa alcalinità** (HCO₃⁻ ≤ 50 mg/L) ma pH sopra il target, non prescrive una dose fissa — con poco tampone il pH crolla con quantità minime — ma consiglia di aggiungere acido *goccia a goccia misurando*.
2. **Separazione per gravità**: ogni sale ha un punteggio di conflitto nel suo serbatoio (critico = 10, avviso = 1; da matrice per ID **e** per gruppo ionico, quindi anche i sali custom). Si sposta, una alla volta, la riga il cui spostamento riduce di più il punteggio totale: ogni mossa lo abbassa strettamente, quindi il ciclo termina e non oscilla. Se nessuno spostamento migliora (es. silicato senza serbatoio C) le righe restano dove sono — Ca e fosfati restano separati — e il conflitto residuo viene segnalato.
3. **Solfati e gesso**: se un serbatoio resta con SI CaSO₄ > −0.5, MgSO₄/K₂SO₄ vengono spostati in un serbatoio senza calcio.
4. **NH₄**: se l'N ammoniacale supera il 10% dell'N **totale** (sali + nitrato dell'acqua + N dell'acido), l'NH₄NO₃ viene ridotto con la formula esatta `x ≤ (cap·N_altro − NH₄_altro)/(1 − cap/0.5)` (`capNH4NO3`).
5. **Verifica SI nel concentrato**: se anche dopo gli spostamenti un serbatoio resta sovrasaturo, calcola la **diluizione massima sicura** e la propone, oppure segnala la necessità del **serbatoio C** (`checkNeedSerbC`).

Ogni intervento è tracciato in una lista `interventi` mostrata all'utente: l'app non fa mai nulla in silenzio.

### 8.4 Auto-bilanciamento (`autoBilanciaSali`)

Ultima rete di sicurezza: se la verifica fallisce ancora, un loop iterativo **riduce selettivamente le dosi** dei sali che alimentano il composto sovrasaturo (es. meno CaN e meno KH₂PO₄ se il problema è CaHPO₄) fino a riportare il SI sotto soglia: in automatico SI ≤ −0.05 nel concentrato (si tolgono i soli conflitti critici); con il pulsante "Bilancia" l'obiettivo è l'ampio margine (−0.5). Il bilanciamento lavora sulle dosi **nette** (già corrette per l'acqua), le stesse che il calcolo verifica. Se converge:

- le nuove dosi vengono applicate e riverificate;
- un **report delle deviazioni** mostra elemento per elemento lo scostamento dal profilo originale (`renderBilanciaReport`);
- l'utente può accettare (`applicaBilanciamento`) o tornare alle dosi originali (`ripristinaDosiOriginali`).

### 8.5 Ricalcolo con la scorta reale

`ricalcolaConDisponibili` (→ `sostituisciNonDisponibili`) incrocia la ricetta con la scorta di magazzino e **ri-risolve il profilo elementare** con i soli sali disponibili: i macro col solver (regolarizzato verso le dosi originali, CaCl₂ escluso se non era già nella ricetta), i micro mancanti con sali singoli. La vecchia logica sostituiva ogni sale con quello a % più alta dell'elemento "principale": MgSO₄ diventava MnSO₄ (112 mg/L di Mn!) e KH₂PO₄ diventava K₂SO₄ (P azzerato). Il report elenca sali aggiunti, dosi adattate, profilo prima → dopo ed elementi non coperti (>10% sotto la ricetta, oltre a Si ecc. se nessun sale in scorta li fornisce).

### 8.6 Gestione pH in coltura

Oltre alla correzione dell'acqua di partenza (§8.3), i risultati includono una card **"Gestione pH in coltura"** che anticipa come il pH in zona radicale si muoverà *nel tempo*, sulla base della **frazione ammoniacale** della ricetta (`nh4frac = NH₄ / N totale`):

- **NH₄⁺ alto** (> 10%): il pH **tenderà a scendere** — l'assorbimento radicale di ammonio e la sua nitrificazione rilasciano H⁺. La card invita a monitorare il pH del **drenaggio** e, se scende sotto ~5.5, a ridurre la quota ammoniacale o alzare leggermente il pH del feed.
- **Azoto quasi tutto nitrico** (< 3%): il pH **tenderà a salire** — l'assorbimento di NO₃⁻ rilascia ioni alcalini. Se il drenaggio supera ~6.5, si abbassa il pH del feed con un filo di acido.
- **Quota bilanciata** (fra i due): deriva contenuta.

La card ricorda inoltre il target del feed per coco (pH 5.5–6.2), che la misura di riferimento è il **pH del drenaggio** e come intervenire (giù: HNO₃/H₃PO₄ diluiti; su: KOH molto diluito, con DPI). È un avviso agronomico, non un automatismo: non modifica le dosi.

---

## Capitolo 9 — Il solver a target (NNLS)

Quando una fase è in modalità **target**, il problema diventa: *dati gli obiettivi in mg/L per N, P, K, Ca, Mg (e opzionalmente S), quali dosi dei sali disponibili li approssimano meglio, senza dosi negative?* Lo stesso motore (`risolviMacro`) è usato anche dalla correzione per l'acqua (§4.3) e dal ricalcolo con la scorta (§8.5).

### 9.1 Formulazione

È un problema di **minimi quadrati non negativi** (Non-Negative Least Squares):

- matrice A [elementi × sali]: A[i][j] = frazione dell'elemento i nel sale j, pesata (§9.2);
- vettore b: i target **finali** meno gli apporti già presenti (acqua, acido prescritto, sali fissi);
- righe di regolarizzazione (Tikhonov) verso dosi di riferimento: le dosi della ricetta nella correzione acqua/scorta, zero nel solver a target. Nelle direzioni che i target non vincolano il solver resta vicino alla ricetta invece di saltare a un vertice arbitrario; aggiungere un sale nuovo "costa" ~1 mg/L di errore ogni 100 g/1000 L;
- vincolo: dosi ≥ 0; vincolo NH₄ ≤ 10% dell'N totale finale (i portatori di NH₄ vengono scalati e fissati, il resto ri-risolto).

Implementazione: `gaussSolve` (eliminazione gaussiana con pivoting) → `lsq` (equazioni normali con ridge **relativo** 1e-12, senza bias) → `nnls`, algoritmo active-set di **Lawson-Hanson**: a differenza dell'euristica precedente, che escludeva per sempre la variabile più negativa, le variabili possono rientrare nel set passivo e la soluzione soddisfa le condizioni KKT (verificato in S19).

### 9.2 Pesi per elemento

Ogni riga è pesata con `priorità / √max(target, 10)`: lo schema *variance-stabilizing* evita che i grandi numeri (N ~200 mg/L) schiaccino i piccoli (P ~40). Le priorità: **Ca 1.25** (marciume apicale), N/P/K/Mg 1.0, **S 0.6**. Lo zolfo è l'anione di bilanciamento: se la fase non ha un target S (campo opzionale nell'editor, 0 = libero) pesa appena 0.12 e tende a zero solo come criterio di spareggio. Prima S senza target era un obiettivo rigido "zero" e coi target di default Ca e Mg finivano a −13% e −21%.

### 9.3 Scelte deliberate

- **Solo sali in scorta**: macro, Mix Chelati, chelati e micro singoli vengono scelti tra gli ingredienti disponibili.
- **CaCl₂ è escluso** dal pool del solver: matematicamente sarebbe una fonte di Ca "gratis" (senza N), ma scaricherebbe 150–200 mg/L di cloruro fitotossico. Resta un supplemento manuale.
- **Acido coerente**: l'N (HNO₃) o il P (H₃PO₄) dell'acido prescritto al pH della soluzione finale vengono sottratti dai target.
- **Micro** (`risolviMicro`): il **Mix Chelati** è dimensionato in modo che **nessun** micro superi il proprio target (+25%) né la soglia di tossicità (Mn 2, Zn 0.5, B 0.5, Cu 0.15 mg/L). Prima era dimensionato sul micro più esigente e, coi target tipici, il Cu trascinava il B a 0.75 mg/L. I deficit residui (>10%) vengono colmati con i sali singoli più convenienti per mg di elemento (per il Fe i chelati prima del FeSO₄); ciò che nessun sale in scorta fornisce (tipicamente il Cu) viene segnalato con una riga ⚠️.

---

## Capitolo 10 — La verifica di sicurezza

`verificaSicurezza` è il "collaudo" finale: produce un **audit trail** (ogni controllo con esito e dettaglio, sempre visibile) e la lista dei conflitti con gravità. I controlli:

| # | Controllo | Metodo |
|---|---|---|
| 1 | Coppie incompatibili per serbatoio | Matrice ID + gruppi ionici, tutte le coppie (con dose > 0) di ogni tank |
| 2 | SI CaSO₄ per serbatoio | siForIons con Davies, Ksp(T) |
| 2b | SI CaSO₄/CaHPO₄/struvite nel concentrato | `worstSerbSI` — peggior serbatoio; distingue i problemi "solo concentrato" (gestibili) da quelli critici |
| 2c | SI nella soluzione finale al pH operativo | `siFinaleSoluzione`; per i composti pH-dipendenti suggerisce il pH sicuro invece del taglio dosi |
| 3 | CaCO₃ dai bicarbonati dell'acqua | IAP vs Ksp calcite(T), speciazione al pH dell'acqua; "GESTITO" solo se l'acido è davvero prescritto, altrimenti AVVISO |
| 4 | EC del concentrato | Informativo (sali × diluizione + EC dell'acqua): "la sicurezza la fanno gli SI, non soglie EC arbitrarie" |
| 5 | Rapporto NH₄⁺/N totale | Sull'N totale (sali + acqua + acido); oltre il 10% è un AVVISO esplicito |
| 6 | Tossicità micronutrienti | Soglie da letteratura: Mn > 2, Zn > 0.5, B > 0.5, Cu > 0.15 mg/L; oltre 3× la soglia è **critico** (un errore di dosaggio, non una sfumatura) |
| 7 | Salinità Na/Cl | Acqua + sali (il Cl del CaCl₂ è incluso); limiti coco Na ~50, Cl ~100 mg/L |

Esiti possibili per check: **OK**, **AVVISO** (gravità A), **CONFLITTO** (gravità C, bloccante per il giudizio "sicuro"), **GESTITO** (problema presente ma già risolto da una prescrizione, es. acido per i bicarbonati), **INFO**.

Il verdetto complessivo `sicuro` è vero solo senza conflitti critici; in caso contrario parte l'auto-bilanciamento (Capitolo 8.4) e/o vengono mostrati i rimedi suggeriti (pH, diluizione, serbatoio C, riduzione dosi).

---

## Capitolo 11 — Scheda Catalogo

### 11.1 Il catalogo di fabbrica

**22 prodotti** (`SALI_DEFAULT`) in tre categorie:

- **Macro**: Ca(NO₃)₂·4H₂O, KNO₃, Mg(NO₃)₂·6H₂O, MgSO₄·7H₂O, KH₂PO₄, MAP, K₂SO₄, NH₄NO₃, CaCl₂·2H₂O;
- **Micro**: Fe-EDTA 13%, Fe-DTPA 11%, Fe-EDDHA 6%, Mix Chelati (Fe+Mn+Zn+Cu+B+Mo), FeSO₄·7H₂O, MnSO₄·H₂O, ZnSO₄·7H₂O, H₃BO₃, Na₂MoO₄·2H₂O;
- **pH/Additivi**: HNO₃ 38%, H₃PO₄ 75%, KOH 50%, K₂SiO₃ ~49% (liquidi, con densità per il dosaggio in mL).

Ogni prodotto ha: `id`, nome con formula, categoria, **composizione elementare in %** (`el`), coefficiente EC (`ecC`), dose tipica g/1000 L, prezzo €/kg e una **nota tecnica** (es. per i chelati di ferro: la scelta EDTA/DTPA/EDDHA in funzione del pH di stabilità).

### 11.2 Funzioni

- **Scorta magazzino**: ogni ingrediente ha un interruttore "disponibile/non disponibile" (`scorta`, un `Set` persistito). È il dato usato dal ricalcolo con disponibili.
- **CRUD completo**: nuovi ingredienti custom col modale — nome, categoria, **composizione completa in %** (N, P, K, Ca, Mg, S, Fe, Mn, Zn, B, Cu, Mo), **% di N ammoniacale** (per il limite NH₄ ≤ 10% e il rischio struvite), flag **prodotto liquido con densità** (dosaggio mostrato in mL), prezzo, dose tipica e note; modifica ed eliminazione (con conferma). Il coefficiente EC del sale custom viene **stimato automaticamente dalla composizione** (`stimaEcC`, conduttività equivalenti di Kohlrausch + fattore di Onsager), così i sali personalizzati contribuiscono correttamente all'EC attesa.
- **Prezzi** → alimentano il calcolo dei costi per batch e per 1000 L.
- **Stampa catalogo** dedicata.
- Nota UI: il serbatoio **non si imposta a mano** — lo decide il calcolatore dalle regole di compatibilità.

### 11.3 Versioning del catalogo

`CATALOG_VERSION` (oggi 3: coefficienti EC dei sali di fabbrica allineati a `EC_COEFF_GLOBAL`) gestisce gli aggiornamenti: quando la chimica dei default cambia in una nuova versione del file, al primo avvio il catalogo salvato viene **ri-basato sui default correnti** (i fix di composizione raggiungono gli utenti esistenti) **conservando** prezzi, note, dosi personalizzate e i sali custom. La stessa politica ("chimica dei default autoritativa") vale per l'import.

---

## Capitolo 12 — Scheda Dati

- **⬇ Esporta**: scarica un JSON con catalogo, scorta, ricette personalizzate, analisi acqua corrente e profili acqua salvati — backup o condivisione della configurazione tra dispositivi/utenti.
- **⬆ Importa**: carica un JSON esportato. Le ricette e gli ingredienti custom vengono **uniti** agli esistenti; per gli ingredienti default vengono aggiornati i prezzi ma **non** la composizione chimica (che resta quella autoritativa del file). Ogni campo importato è normalizzato e sanificato (`normalizeImportedEl`, `normalizeImportedFase`, `stripTags`, controlli su ID).
- **↺ Reset**: ripristino di fabbrica (catalogo default, scorta piena, zero ricette custom) con doppia conferma — irreversibile, l'app invita a esportare prima.
- **📊 Stato attuale**: contatori live (ingredienti, disponibili in scorta, ricette custom, ricette predefinite).
- Link donazione PayPal (l'app è gratuita e senza pubblicità né tracking).

---

## Capitolo 13 — Stampa e output operativi

Due output cartacei, generati come documenti HTML autonomi e stampati via iframe dedicato (`lanciaStampaIframe`, senza popup):

1. **Scheda miscela** (`stampaMiscela`): l'output completo del calcolo in formato operativo — intestazione con data/ora, parametri impianto, dosi per serbatoio in grammi reali, riepilogo EC/costi, indici di saturazione, prescrizioni (acido, ordine di scioglimento) e una **procedura di preparazione con caselle di spunta** da seguire fisicamente davanti ai serbatoi.
2. **Catalogo** (`stampaCatalogo`): l'elenco ingredienti con composizioni, prezzi e note.

Il CSS contiene inoltre regole `@media print` per la stampa diretta della pagina (nasconde header, tab e pulsanti).

---

## Capitolo 14 — Persistenza dati e sicurezza del codice

### 14.1 Dove stanno i dati

Tutto in `localStorage` del browser — nessun dato lascia il dispositivo:

| Chiave | Contenuto |
|---|---|
| `fc_lang` | Lingua interfaccia (`it`/`en`) |
| `fc_acqua` | Analisi acqua corrente |
| `fc_acqua_profili` | Profili acqua salvati dall'utente (nome + analisi) |
| `fc_catalogo` | Catalogo ingredienti (default modificati + custom) |
| `fc_catalogo_v` | Versione del catalogo per la migrazione |
| `fc_ricette` | Ricette personalizzate |
| `fc_scorta` | ID degli ingredienti disponibili in magazzino |
| `fc_acido` | Acido scelto per i bicarbonati (`HNO3` / `H3PO4`) |

Attenzione: `localStorage` è **per browser e per origine** — aprendo il file da un percorso diverso o in un altro browser i dati non seguono. Per trasferirli si usa l'export JSON.

### 14.2 Robustezza e sicurezza

- **`safeParse`**: ogni lettura da localStorage è protetta — un dato corrotto degrada ai default invece di bloccare lo script a livello top-level (che lascerebbe l'app vuota).
- **Sanificazione**: `stripTags` rimuove `<`, `>`, `"` da tutti i testi salvati/importati; `esc` fa l'escape in rendering; `sanitizeName` e `isSafeId` validano nomi e ID importati. Obiettivo: nessuna injection HTML da un JSON malevolo o da vecchi dati.
- **Immutabilità degli input**: la pipeline di calcolo lavora su copie (`wRighe`); i dati di fabbrica (`SALI_DEFAULT`, `PIANTE_BUILTIN`) non vengono mai mutati.
- **Test a ogni modifica del motore**: la suite (`tests/run-tests.js`, S1–S28) gira in ~10 s con l'hook pre-commit (`git config core.hooksPath tests/hooks`) e su GitHub Actions a ogni push/PR.
- **Nessun tracking**: nessuno script di analytics (rimosso esplicitamente nella storia del progetto).

---

## Capitolo 15 — Internazionalizzazione

Doppia lingua **italiano/inglese** con architettura a tre livelli:

1. **Markup statico**: attributi `data-i18n`, `data-i18n-html`, `data-i18n-placeholder` risolti da `applyLang()` contro i dizionari `I18N.it` / `I18N.en`.
2. **Stringhe generate da JS**: helper `t(chiave)` e `TT(testoIT, testoEN)` per i template inline.
3. **Dati**: i contenuti originali (nomi sali, note, ricette) restano in italiano nel dato; `SALI_I18N` e `RICETTE_I18N` forniscono le traduzioni **solo in visualizzazione** quando `currentLang === 'en'` (accessor `salNome`, `salNote`, `ricNome`, `faseNome`…). Questo evita di duplicare o migrare i dati salvati dagli utenti.

La lingua scelta persiste in `fc_lang` e si cambia dall'header senza ricaricare.

---

## Capitolo 16 — Limiti, assunzioni e avvertenze

- **Orientamento coco coir**: le soglie (NH₄ ≤ 10% dell'N, Na ~50 mg/L, Cl ~100 mg/L, note sull'accumulo di solfati) e le ricette sono calibrate per coco. Per NFT/lana di roccia/suolo i profili vanno adattati.
- **Davies oltre il suo campo di validità**: nei concentrati 1:100 la forza ionica arriva a 1–1.5 mol/L, dove Davies è un'approssimazione (il termine lineare è attenuato sopra 0.5 M). Le coppie ioniche (CaSO₄°, MgSO₄°, CaH₂PO₄⁺) non sono modellate: lo SI del gesso è sovrastimato (errore prudente).
- **Limiti fisici della correzione acqua**: se l'acqua apporta già tutto il Ca (o il Mg) della ricetta, l'N che i nitrati di Ca/Mg avrebbero portato si recupera solo con KNO₃ (vincolato dal K) e NH₄ (≤ 10%); con acque molto dure l'N può restare 20–30% sotto la ricetta. La tabella di fedeltà lo mostra.
- **SI nel concentrato a pH fisso 6.0** (`SERB_SI_PH`): il pH reale delle madri varia col contenuto. La **temperatura** invece è un input (scheda Acqua) e alimenta tutti i Ksp; resta l'assunzione che serbatoi e soluzione finale siano alla stessa temperatura dell'acqua dichiarata.
- **La cinetica non è modellata**: SI > 0 indica sovrasaturazione termodinamica; i tempi reali di precipitazione dipendono da nucleazione, agitazione e impurezze. Il margine −0.5 esiste proprio per questo.
- **EC stimata**: i coefficienti (tabellati per i sali di fabbrica, stimati dalla composizione per i custom) sono accurati per le miscele tipiche ma l'EC reale va sempre verificata col conduttimetro.
- **Distinzione NH₄/NO₃**: per i sali di fabbrica la ripartizione è nota per ID (NH₄NO₃ 50%, MAP 100%); per i sali custom vale il campo "% N ammoniacale" dichiarato dall'utente — se lasciato a 0, l'N viene trattato come nitrico.
- **Non è un sostituto del giudizio agronomico**: il motore verifica la chimica della soluzione, non lo stato della coltura. Le note agronomiche sono indicative.
- **Acidi e basi sono pericolosi**: le prescrizioni di HNO₃/H₃PO₄/KOH presuppongono DPI e procedura corretta ("mai acqua nell'acido").

---

## Capitolo 17 — Glossario

| Termine | Significato |
|---|---|
| **EC** | Conducibilità elettrica (mS/cm) — misura della salinità totale della soluzione |
| **Soluzione madre** | Concentrato (A/B/C) che viene diluito 1:X nell'acqua di irrigazione |
| **Fattore di diluizione 1:X** | 1 L di madre → X L di soluzione finale |
| **SI (Saturation Index)** | log₁₀(IAP/Ksp): > 0 = sovrasaturo (precipita), < 0 = sottosaturo |
| **IAP** | Prodotto delle attività ioniche effettive |
| **Ksp** | Prodotto di solubilità termodinamico |
| **Attività / Davies** | Concentrazione "efficace" di uno ione, corretta per la forza ionica |
| **Speciazione** | Ripartizione di un elemento tra le sue forme chimiche in funzione del pH |
| **meq/L** | Milliequivalenti per litro (concentrazione × carica) — unità del bilancio ionico |
| **NNLS** | Non-Negative Least Squares: minimi quadrati con vincolo di dosi ≥ 0 |
| **BER** | Blossom End Rot (marciume apicale), carenza localizzata di Ca |
| **Struvite** | MgNH₄PO₄·6H₂O, precipitato tipico dove coesistono Mg, ammonio e fosfati |
| **Brushite** | CaHPO₄·2H₂O, il precipitato Ca-fosfato più comune in fertirrigazione |
| **Chelato (EDTA/DTPA/EDDHA)** | Ferro protetto da una molecola organica; i tre differiscono per il pH massimo di stabilità (6.5 / 7.5 / 9) |
| **Coco coir** | Substrato in fibra di cocco, con CEC che trattiene K/Ca/Mg e sensibilità a Na/Cl |

---

*Manuale generato per la versione v2.0 del file `index.html`. In caso di modifiche al codice, aggiornare i riferimenti alle righe indicati nel Capitolo 2.*
