# FertiControl — Manuale Tecnico

**Versione applicazione:** v2.0
**File:** `Ferticontrol/Ferticontrol1.html`

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

### 2.2 Organizzazione interna del file

Il file è ordinato in blocchi riconoscibili:

| Sezione | Contenuto | Zona indicativa |
|---|---|---|
| `<head>` + `<style>` | Meta tag, favicon SVG inline, tutto il CSS (variabili tema, componenti, media query, stili stampa) | righe 1–570 |
| Markup | Header, barra tab, i 5 pannelli, i modali (ingrediente, ricetta, conferme) | righe 570–1280 |
| i18n | Dizionari IT/EN e funzioni `t()`, `setLang()`, `applyLang()`, `TT()` | righe 1280–1335 |
| Costanti chimiche | Masse molari `MM`, conduttività `LAMBDA`, pKa, fattori ossido `OXIDE` | righe 1335–1345 |
| Motore chimico | Ksp termodinamici, speciazione, Davies, indici di saturazione, EC, bilancio meq | righe 1345–1480 |
| Dati di fabbrica | `SALI_DEFAULT` (catalogo), `PIANTE_BUILTIN` (ricette), traduzioni dati | righe 1480–1900 |
| Stato e persistenza | `safeParse`, migrazione catalogo, `localStorage` | righe 1555–1615 |
| UI Ricette | Selezione pianta/fase, editor ricette custom, editor target | righe 2060–2560 |
| Solver | `gaussSolve`, `lsq`, `nnls`, `solverTarget`, `ricalcolaConDisponibili` | righe 2650–2905 |
| Compatibilità | Gruppi ionici, `INCOMPAT_MATRIX`, `assegnaSerbatoi`, `autoRisolvi`, `autoBilanciaSali` | righe 3074–3600 |
| Verifica e calcolo | `verificaSicurezza`, `correggiDosi`, `calcola` e rendering risultati | righe 3638–4630 |
| Stampa | `stampaMiscela`, `stampaCatalogo`, iframe di stampa | righe 4638–5030 |
| Catalogo e Dati | CRUD ingredienti, scorta, export/import/reset | righe 5200–5560 |

### 2.3 Convenzioni

- **Unità dosi**: internamente ogni dose è espressa in **g/1000 L di soluzione finale** (equivale a mg/L di prodotto). La conversione a grammi reali nel serbatoio è `dose × volume_serbatoio × diluizione / 1000` (funzione `grConc`).
- **Identificatori sali**: ogni sale ha un `id` corto stabile (`CaN`, `KNO3`, `KH2PO4`, `MixCh`…) usato come chiave in tutte le matrici di compatibilità e nei profili delle ricette.
- **Stile difensivo**: ogni lettura da `localStorage` passa per `safeParse` (un dato corrotto non blocca l'app); ogni testo salvato passa per `stripTags` contro l'injection HTML; il calcolo lavora sempre su una **copia** delle dosi inserite (premere "Calcola" N volte non altera mai gli input).

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

- **EC** (mS/cm) e **pH**;
- ioni in mg/L: **Ca²⁺, Mg²⁺, K⁺, Na⁺, SO₄²⁻, Cl⁻, HCO₃⁻, NO₃⁻, Fe**.

### 4.2 Preset rapidi e profili personali

Sei preset precompilati: **Ottima (EC 0.1)**, **Acquedotto medio**, **Acqua dura**, **Osmosi inversa**, **Piovana** e **Personalizzata** — quest'ultima precompila i valori dell'acquedotto medio come base realistica da correggere con la propria analisi. Servono come punto di partenza quando non si dispone di un'analisi di laboratorio.

Accanto ai preset generici, l'utente può salvare le **proprie analisi con un nome** ("Pozzo — analisi giugno", "Acquedotto casa") e richiamarle con un click: è la soluzione per chi ha più fonti idriche o analisi stagionali. I profili personali sono persistiti in `fc_acqua_profili`, inclusi nel backup JSON (export/import con merge per nome), aggiornabili risalvando lo stesso nome ed eliminabili singolarmente con conferma.

### 4.3 Come viene usata l'acqua nel calcolo

L'acqua non è un semplice dato informativo — entra in quattro punti del motore:

1. **Sottrazione dei nutrienti già presenti** (`correggiDosi` in modalità grammi, oppure direttamente nei target nel solver NNLS): Ca, Mg, K, Fe vengono scalati dalle dosi; i solfati e i nitrati dell'acqua vengono convertiti nelle unità elementari corrette (SO₄→S con fattore 32.07/96.06, NO₃→N con 14.007/62.00) prima della sottrazione.
2. **Neutralizzazione dei bicarbonati**: se HCO₃⁻ > 50 mg/L il motore prescrive i **mL/L di acido** (HNO₃ 38% o H₃PO₄ 75%) da aggiungere all'acqua di diluizione, calcolati dalle molarità reali dei prodotti commerciali (`calcAcidVolume`). La dose è **dimensionata sul pH target scelto** nel calcolatore: la frazione di alcalinità da neutralizzare segue Henderson-Hasselbalch sul pKa₁ del sistema carbonato (6.35) — a pH 5.8 si neutralizza ~78% dell'HCO₃⁻, a pH 6.5 ~41%, a pH 7.0 ~18% — sempre con un residuo tampone minimo di 0.5 meq/L (`RESID_HCO3_MEQ`) contro i crolli di pH. Se l'acqua è già al pH target, l'acido è zero. Cambiando il pH nel calcolatore la prescrizione si aggiorna in tempo reale.
3. **Rischio calcite (CaCO₃)**: il Ca totale e i carbonati dell'acqua (speciati con Henderson-Hasselbalch al pH dell'acqua) vengono confrontati col Ksp della calcite dipendente dalla temperatura.
4. **EC e bilancio ionico finali**: l'EC dell'acqua si somma a quella dei sali; Na e Cl dell'acqua entrano nei controlli di salinità (limiti coco: Na ~50 mg/L, Cl ~100 mg/L).

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
- **pH soluzione finale** — il pH mantenuto in coltura. È l'input chiave della verifica anti-precipitazione dei fosfati (a pH ≤ 6 il fosfato di calcio resta in soluzione; sopra 6.3 tende a precipitare) e **dimensiona la dose di acido** prescritta per i bicarbonati. Se già esiste un risultato, cambiare il pH ricalcola al volo: le dosi dei sali restano invariate per scelta (i fabbisogni nutritivi non dipendono dal pH), mentre cambiano gli indici di saturazione, gli avvisi e i mL di acido.

### 6.2 Tabella "Sali da Preparare"

La lista dei sali in gioco, editabile riga per riga (sale dal catalogo, dose in g/1000 L, prezzo €/kg). Si popola caricando una ricetta o manualmente ("+ Aggiungi sale"). Gli ingredienti **non disponibili in scorta** vengono evidenziati in rosso e compare la **barra "Ricalcola con gli ingredienti disponibili"**: il sistema tenta sostituzioni automatiche con alternative equivalenti presenti in catalogo (es. altro chelato di ferro, altra fonte di K) e riporta cosa non è sostituibile.

### 6.3 La pipeline di calcolo

Premendo **⚗️ Calcola Dosaggi**, `calcola()` esegue in ordine:

1. **Validazione input** (`validaInput`): volumi > 0, diluizione sensata, dosi numeriche; errori bloccanti mostrati in lista.
2. **Modalità target?** Se attiva, `solverTarget` genera le righe via NNLS (acqua già sottratta dai target).
3. **Correzione acqua** (`correggiDosi`, solo in modalità grammi): sottrae i nutrienti dell'acqua distribuendoli proporzionalmente tra i sali che portano lo stesso elemento.
4. **Auto-risoluzione** (`autoRisolvi`): assegna i serbatoi, sposta i sali incompatibili, prescrive l'acido per l'HCO₃⁻, propone il serbatoio C o una diluizione diversa se serve (Capitolo 8).
5. **Verifica di sicurezza** (`verificaSicurezza`): gli 8+ controlli chimici del Capitolo 10.
6. **Auto-bilanciamento** (`autoBilanciaSali`): se la verifica fallisce, prova a ridurre selettivamente le dosi dei sali coinvolti fino a riportare gli indici di saturazione sotto soglia; se converge, riverifica e mostra il **report delle deviazioni** dal profilo originale, con possibilità di ripristinare le dosi originali.
7. **Rendering del risultato**.

### 6.4 Il risultato

La scheda risultato comprende:

- **Dosi per serbatoio** — per A, B e C: grammi reali di ogni sale nel volume del serbatoio (`dose × vol × diluizione / 1000`), con EC parziale del serbatoio.
- **Interventi automatici** — l'elenco di ciò che il motore ha fatto o prescritto (spostamenti, acido, suggerimenti diluizione), ciascuno con spiegazione chimica.
- **Riepilogo** — EC finale attesa (dai coefficienti `EC_COEFF_GLOBAL` derivati da Kohlrausch/Onsager + EC acqua), EC nel concentrato, costo del batch e costo per 1000 L finali.
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

- il fosforo tra H₂PO₄⁻ / HPO₄²⁻ / PO₄³⁻ secondo il pH (Henderson-Hasselbalch sui pKa);
- i carbonati tra HCO₃⁻ / CO₃²⁻;
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

Il SI viene calcolato **in tre contesti distinti**: (a) per singolo serbatoio concentrato (`serbSIs` — solo i sali di quel serbatoio × diluizione, pH 6, 20 °C; l'acqua di processo non c'entra, entra solo nella finale); (b) il peggiore tra i serbatoi (`worstSerbSI`); (c) nella **soluzione finale diluita** al pH operativo scelto (`siFinaleSoluzione`). Questa separazione è concettualmente importante: un composto può essere a rischio nel concentrato ma non nella finale (gestibile con pulizia tank o 3° serbatoio) o viceversa (grave: precipita nei gocciolatori).

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
- **silicato di potassio** → serbatoio dedicato (C) o gestione speciale.

È la classica separazione A/B della fertirrigazione: il calcio non deve mai incontrare fosfati e solfati nel concentrato.

### 8.2 La matrice di incompatibilità

Due livelli di rilevamento (`coppiaIncompatibile`):

1. **`INCOMPAT_MATRIX`** — ~35 coppie note per ID con gravità (C = critica, A = avviso), precipitato atteso e spiegazione chimica. Copre: Ca+fosfati (CaHPO₄), Ca+molibdato (CaMoO₄, "spesso dimenticato"), silicato+tutto (CaSiO₃, gel di acido silicico, degrado chelati a pH 11-12), KOH+acidi (reazione violenta), FeSO₄+fosfati (vivianite), micro-solfati+fosfati, chelati+Fe²⁺ libero.
2. **Gruppi ionici** (`classificaGruppiIonici` + `GRUPPI_INCOMPAT`) — ogni sale, **anche custom**, viene classificato per gruppi (Ca, PO4, SO4, SiO3, ACID, BASE, CHELATO, Fe2, MoO4) in base a ID e composizione elementare; le regole tra gruppi catturano le incompatibilità dei sali aggiunti dall'utente che la matrice per ID non conosce.

### 8.3 L'auto-solver (`autoRisolvi`)

Dopo l'assegnazione base, in sequenza:

1. **Bicarbonati**: se HCO₃⁻ > 50 mg/L, prescrive i mL/L di acido nell'acqua di diluizione.
2. **Silicato**: se K₂SiO₃ convive con incompatibili, lo sposta in C (se attivo) o riorganizza gli altri sali, spiegando il perché.
3. **Conflitti Ca/fosfati/solfati**: sposta i sali tra A e B per eliminare le coppie critiche.
4. **Verifica SI nel concentrato**: se anche dopo gli spostamenti un serbatoio resta sovrasaturo, calcola la **diluizione massima sicura** e la propone, oppure segnala la necessità del **serbatoio C** (`checkNeedSerbC`).

Ogni intervento è tracciato in una lista `interventi` mostrata all'utente: l'app non fa mai nulla in silenzio.

### 8.4 Auto-bilanciamento (`autoBilanciaSali`)

Ultima rete di sicurezza: se la verifica fallisce ancora, un loop iterativo **riduce selettivamente le dosi** dei sali che alimentano il composto sovrasaturo (es. meno CaN e meno KH₂PO₄ se il problema è CaHPO₄) fino a riportare il SI sotto soglia. Se converge:

- le nuove dosi vengono applicate e riverificate;
- un **report delle deviazioni** mostra elemento per elemento lo scostamento dal profilo originale (`renderBilanciaReport`);
- l'utente può accettare (`applicaBilanciamento`) o tornare alle dosi originali (`ripristinaDosiOriginali`).

### 8.5 Ricalcolo con la scorta reale

`ricalcolaConDisponibili` incrocia la ricetta con la scorta di magazzino: per ogni ingrediente mancante cerca in catalogo un'alternativa funzionalmente equivalente disponibile (stesso elemento portante), ricalcola le dosi e riporta ciò che resta scoperto.

---

## Capitolo 9 — Il solver a target (NNLS)

Quando una fase è in modalità **target**, il problema diventa: *dati gli obiettivi in mg/L per N, P, K, Ca, Mg, S, quali dosi dei sali disponibili li approssimano meglio, senza dosi negative?*

### 9.1 Formulazione

È un problema di **minimi quadrati non negativi** (Non-Negative Least Squares):

- matrice A [elementi × sali]: A[i][j] = frazione dell'elemento i nel sale j;
- vettore b: i target (già al netto dell'acqua di partenza);
- vincolo: dosi ≥ 0.

Implementazione: `gaussSolve` (eliminazione gaussiana) → `lsq` (minimi quadrati) → `nnls` (active-set: elimina iterativamente i sali che risulterebbero negativi).

### 9.2 Pesatura variance-stabilizing

I target hanno scale diverse (N ~200 mg/L, P ~40 mg/L): senza pesi il solver privilegerebbe i grandi numeri. FertiControl pesa ogni riga con **1/√target** (con floor a 10 mg/L): un compromesso calibrato empiricamente — il commento nel codice documenta che il peso 1/target puro "scaricava ~−40% sul Ca e rovinava ricette altrimenti esatte".

### 9.3 Scelte deliberate

- **CaCl₂ è escluso** dal pool del solver: matematicamente sarebbe una fonte di Ca "gratis" (senza N), ma scaricherebbe 150–200 mg/L di cloruro fitotossico. Resta un supplemento manuale per carenze specifiche.
- **I micro hanno logica dedicata**: il **Mix Chelati** viene dimensionato sul micro più esigente; il ferro residuo viene coperto col chelato singolo più economico; senza Mix, ogni micro usa il proprio sale (MnSO₄, ZnSO₄, H₃BO₃, Na₂MoO₄) e il rame mancante viene segnalato esplicitamente.

---

## Capitolo 10 — La verifica di sicurezza

`verificaSicurezza` è il "collaudo" finale: produce un **audit trail** (ogni controllo con esito e dettaglio, sempre visibile) e la lista dei conflitti con gravità. I controlli:

| # | Controllo | Metodo |
|---|---|---|
| 1 | Coppie incompatibili per serbatoio | Matrice ID + gruppi ionici, tutte le coppie di ogni tank |
| 2 | SI CaSO₄ per serbatoio | siForIons con Davies, Ksp(T) |
| 2b | SI CaSO₄/CaHPO₄/struvite nel concentrato | `worstSerbSI` — peggior serbatoio; distingue i problemi "solo concentrato" (gestibili) da quelli critici |
| 2c | SI nella soluzione finale al pH operativo | `siFinaleSoluzione`; per i composti pH-dipendenti suggerisce il pH sicuro invece del taglio dosi |
| 3 | CaCO₃ dai bicarbonati dell'acqua | IAP vs Ksp calcite(T), speciazione al pH dell'acqua |
| 4 | EC del concentrato | Informativo: "la sicurezza la fanno gli SI, non soglie EC arbitrarie" |
| 5 | Rapporto NH₄⁺/N totale | Limite 10% in coco (tossicità da ammonio) |
| 6 | Tossicità micronutrienti | Soglie da letteratura: Mn > 2, Zn > 0.5, B > 0.5, Cu > 0.15 mg/L; con consiglio mirato se la causa è il Mix Chelati |
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

`CATALOG_VERSION` gestisce gli aggiornamenti: quando la chimica dei default cambia in una nuova versione del file, al primo avvio il catalogo salvato viene **ri-basato sui default correnti** (i fix di composizione raggiungono gli utenti esistenti) **conservando** prezzi, note, dosi personalizzate e i sali custom. La stessa politica ("chimica dei default autoritativa") vale per l'import.

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

Attenzione: `localStorage` è **per browser e per origine** — aprendo il file da un percorso diverso o in un altro browser i dati non seguono. Per trasferirli si usa l'export JSON.

### 14.2 Robustezza e sicurezza

- **`safeParse`**: ogni lettura da localStorage è protetta — un dato corrotto degrada ai default invece di bloccare lo script a livello top-level (che lascerebbe l'app vuota).
- **Sanificazione**: `stripTags` rimuove `<`, `>`, `"` da tutti i testi salvati/importati; `esc` fa l'escape in rendering; `sanitizeName` e `isSafeId` validano nomi e ID importati. Obiettivo: nessuna injection HTML da un JSON malevolo o da vecchi dati.
- **Immutabilità degli input**: la pipeline di calcolo lavora su copie (`wRighe`); i dati di fabbrica (`SALI_DEFAULT`, `PIANTE_BUILTIN`) non vengono mai mutati.
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
- **SI nel concentrato a condizioni fisse**: pH 6.0 e 20 °C (`SERB_SI_PH`, `SERB_SI_TC`). Temperature molto diverse nel locale tecnico cambiano i margini reali (i Ksp sono T-dipendenti, ma la T del serbatoio non è un input utente).
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

*Manuale generato per la versione v2.0 del file `Ferticontrol1.html`. In caso di modifiche al codice, aggiornare i riferimenti alle righe indicati nel Capitolo 2.*
