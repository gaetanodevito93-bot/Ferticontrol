<div align="center">

# 🌿 FertiControl

**Calcolatore professionale per la fertirrigazione in coco coir**

*Dalla ricetta nutritiva alle soluzioni madri concentrate — con verifica chimica quantitativa, compatibilità dei serbatoi e scheda operativa stampabile.*

[![Version](https://img.shields.io/badge/versione-v2.0-2d5a3d)](Ferticontrol/Ferticontrol1.html)
[![License: MIT](https://img.shields.io/badge/licenza-MIT-blue.svg)](LICENSE)
[![Made with](https://img.shields.io/badge/stack-HTML%20%C2%B7%20CSS%20%C2%B7%20Vanilla%20JS-f8f6f1)](Ferticontrol/Ferticontrol1.html)
[![No backend](https://img.shields.io/badge/backend-nessuno-4a8c5e)](#-privacy-e-sicurezza)
[![Tests](https://img.shields.io/badge/test-Playwright%20%C2%B7%20S1%E2%80%93S12-2471a3)](Ferticontrol/tests)
[![i18n](https://img.shields.io/badge/lingue-IT%20%C2%B7%20EN-d4660a)](#-internazionalizzazione)

[Funzionalità](#-funzionalità) · [Come si usa](#-come-si-usa) · [Struttura](#-struttura-del-progetto) · [Test](#-test) · [Documentazione](Ferticontrol/MANUALE_TECNICO.md)

</div>

---

## Che cos'è

**FertiControl** trasforma una ricetta nutritiva — espressa come dosi di sali o come target di elementi in mg/L — nelle **soluzioni madri concentrate** da preparare nei serbatoi A, B ed eventualmente C. A differenza dei semplici calcolatori di dosi, integra un **motore chimico quantitativo** (indici di saturazione, speciazione ionica, correzione di attività secondo Davies) e un **sistema di auto-risoluzione** che sposta i sali tra serbatoi, suggerisce correzioni acide e ribilancia le dosi per riportare la soluzione in zona sicura.

Il tutto in **un unico file HTML** — nessuna installazione, nessun backend, nessun account, nessun tracking. Si apre con un doppio clic in qualsiasi browser moderno, su desktop e mobile.

Il calcolo tiene conto di:

- 💧 l'**acqua di partenza** — i minerali già presenti vengono sottratti dai target;
- ⚗️ la **compatibilità chimica** tra i sali — cosa può convivere nello stesso serbatoio senza precipitare;
- 🧪 il **fattore di diluizione** — quanto è concentrata la madre rispetto alla soluzione finale;
- 📉 il **pH della soluzione finale** — che governa la solubilità dei fosfati di calcio;
- 📦 la **disponibilità reale in magazzino** degli ingredienti.

---

## ✨ Funzionalità

| Area | Cosa fa |
|---|---|
| **Motore chimico** | Speciazione ionica in funzione del pH, indici di saturazione termodinamici (Ksp), correzione di attività (Davies), stima EC e bilancio ionico in meq/L. |
| **Solver a target (NNLS)** | Raggiunge i target di elementi in mg/L risolvendo un problema di minimi quadrati con vincolo di dosi non negative. |
| **Compatibilità serbatoi** | Matrice di incompatibilità tra gruppi ionici, assegnazione automatica ai serbatoi A/B/C, rilevamento coppie critiche (es. Ca + fosfati). |
| **Auto-risoluzione** | Sposta i sali, suggerisce correzioni acide per i bicarbonati e ribilancia le dosi quando la soluzione esce dalla zona sicura. |
| **Verifica di sicurezza** | Controlla precipitazioni, rapporti antagonisti, soglie NH₄/Na/Cl e segnala rischi agronomici. |
| **Catalogo ingredienti** | 22 sali predefiniti + fertilizzanti custom, con composizione, prezzo, note e gestione della **scorta** reale in magazzino. |
| **Ricette** | 11 colture builtin (pomodoro, lattuga, cetriolo, fragola…) con fasi di crescita; editor per ricette e target personalizzati. |
| **Output operativo** | Scheda miscela stampabile con dosi in grammi per serbatoio, EC/costi attesi, ordine di scioglimento e checklist di preparazione. |
| **Backup dati** | Export/import JSON di catalogo, scorta, ricette e profili acqua; reset di fabbrica con doppia conferma. |
| **Bilingue** | Interfaccia completa italiano/inglese, commutabile a runtime senza ricaricare. |
| **App installabile (PWA)** | Quando è servita online, si installa sul dispositivo (desktop/mobile) e funziona **offline** grazie al service worker. |

---

## 🚀 Come si usa

Nessuna build, nessuna dipendenza per l'uso quotidiano.

1. Scarica o clona il repository.
2. Apri **[`Ferticontrol/Ferticontrol1.html`](Ferticontrol/Ferticontrol1.html)** con un doppio clic nel tuo browser.
3. Segui il flusso lineare dell'interfaccia (da sinistra a destra):

```
① 💧 ACQUA  →  ② 🌿 RICETTE  →  ③ ⚗️ CALCOLA  →  (④ 📦 CATALOGO · ⑤ 💾 DATI a supporto)
```

- **Acqua** — inserisci l'analisi dell'acqua di partenza o scegli un preset.
- **Ricette** — scegli coltura e fase, oppure crea/clona una ricetta tua, poi premi *→ Calcola*.
- **Calcola** — imposta volumi serbatoi, diluizione e pH finale; premi *Calcola Dosaggi* e ottieni la scheda completa con dosi, verifiche e stampa.
- **Catalogo** — gestisci fertilizzanti, prezzi e scorta.
- **Dati** — esporta/importa il backup JSON o ripristina i valori di fabbrica.

> 💡 Il file funziona anche **offline**: l'unica risorsa esterna sono i font Google, in loro assenza si usano i font di sistema.

### 📲 Installazione come app (PWA)

FertiControl è anche una **Progressive Web App**. Quando è **servita via HTTPS** (es. GitHub Pages o qualsiasi hosting statico), il browser propone di **installarla** come app: icona sul dispositivo, avvio a tutto schermo e **funzionamento offline** (l'app viene messa in cache da un service worker).

- I service worker richiedono un contesto sicuro (`https://` o `localhost`): aperta con doppio clic da `file://` l'app resta pienamente funzionante, ma **non** installabile.
- File a supporto della PWA (accanto all'app): [`manifest.webmanifest`](Ferticontrol/manifest.webmanifest), [`sw.js`](Ferticontrol/sw.js), [`icons/`](Ferticontrol/icons). Sono opzionali: non influiscono sull'uso da `file://`.
- Percorsi relativi → la PWA funziona anche servita da una sottocartella. Dopo un aggiornamento dell'app, incrementa `CACHE_VERSION` in `sw.js` per propagare la nuova versione.

---

## 🗂 Struttura del progetto

```
Ferticontrol/
├── Ferticontrol1.html      # L'applicazione completa (CSS + markup + JS in un solo file)
├── MANUALE_TECNICO.md      # Manuale tecnico: architettura, motore chimico, solver, sicurezza
└── tests/
    ├── run-tests.js        # Suite Playwright (S1–S12) sull'app reale in Chromium headless
    └── README.md           # Cosa copre ogni sezione di test
```

---

## 🔒 Privacy e sicurezza

- **Zero backend, zero tracking**: nessun server, nessun account, nessuno script di analytics. Tutti i dati restano nel `localStorage` del browser e **non lasciano mai il dispositivo**.
- **Codice difensivo**: ogni lettura da `localStorage` passa per `safeParse` (un dato corrotto degrada ai default invece di bloccare l'app); ogni testo salvato o importato è sanificato (`stripTags`, `esc`, validazione di nomi e ID) contro l'injection HTML.
- **Input immutabili**: la pipeline di calcolo lavora sempre su copie — premere *Calcola* N volte non altera mai i dati inseriti.

---

## 🌍 Internazionalizzazione

Interfaccia completa **italiano / inglese** con architettura a tre livelli: markup statico (`data-i18n`), stringhe generate da JS (`t()`, `TT()`) e traduzioni dei dati **solo in visualizzazione** (i dati salvati dall'utente restano in italiano e non vengono migrati). La lingua persiste tra le sessioni.

---

## 🧪 Test

La suite esegue l'**app reale** in Chromium headless (Playwright) e verifica motore chimico, solver, sicurezza, persistenza e UI — 12 sezioni (S1–S12) che includono golden test sul bilancio ionico e sull'EC, invarianti su tutte le fasi builtin, stress test, round-trip di persistenza e fuzzing dell'import.

```bash
# Requisiti: Node.js ≥ 18
npm install playwright
npx playwright install chromium

# Esecuzione
node Ferticontrol/tests/run-tests.js
```

Exit code `0` = tutti i test passati · `1` = almeno un fallimento · `2` = errore della suite.
Dettagli in **[`Ferticontrol/tests/README.md`](Ferticontrol/tests/README.md)**.

---

## 📖 Documentazione

Il **[Manuale Tecnico](Ferticontrol/MANUALE_TECNICO.md)** (17 capitoli) documenta in dettaglio filosofia di progetto, organizzazione del file, motore chimico, solver NNLS, sistema di compatibilità, verifica di sicurezza, persistenza, i18n, limiti/assunzioni e un glossario dei termini agronomici e chimici.

---

## ⚠️ Avvertenze

- Le soglie e le ricette sono calibrate per la coltivazione in **coco coir**; per NFT, lana di roccia o suolo i profili vanno adattati.
- L'EC è **stimata**: va sempre verificata col conduttimetro. Il motore verifica la chimica della soluzione, **non** sostituisce il giudizio agronomico.
- Acidi e basi (HNO₃, H₃PO₄, KOH) sono pericolosi: le prescrizioni presuppongono DPI e procedura corretta.

---

## 🤝 Contribuire

I contributi sono benvenuti — vedi **[CONTRIBUTING.md](CONTRIBUTING.md)**. In sintesi: la regola d'oro è **lanciare la suite di test prima e dopo ogni modifica** al file HTML, e trasformare ogni bug corretto in un nuovo test.

---

## 📄 Licenza

Distribuito con licenza **MIT** — vedi il file [LICENSE](LICENSE). L'app è gratuita, senza pubblicità né tracking.

---

<div align="center">

<sub>Un progetto per chi prepara soluzioni nutritive con precisione. 🌱</sub>

</div>

---

<details>
<summary>🇬🇧 <b>English summary</b></summary>

<br>

**FertiControl** is a professional fertigation calculator for **coco coir** growing. It turns a nutrient recipe — expressed as salt doses or as element targets in mg/L — into the concentrated **stock solutions** to prepare in tanks A, B and optionally C.

Beyond simple dose calculators, it includes a **quantitative chemistry engine** (ionic speciation, thermodynamic saturation indices, Davies activity correction, EC estimation, meq/L ion balance), an **NNLS target solver**, automatic **tank-compatibility** handling and an **auto-resolution** system that moves salts between tanks, suggests acid corrections and rebalances doses to keep the solution safe.

Everything lives in **a single HTML file** — no install, no backend, no account, no tracking. All data stays in the browser's `localStorage`. The full UI is available in **Italian and English**, switchable at runtime.

**Usage:** open [`Ferticontrol/Ferticontrol1.html`](Ferticontrol/Ferticontrol1.html) in any modern browser and follow the tabs: **Water → Recipes → Calculate** (with **Catalog** and **Data** as support).

**Tests:** a Playwright suite (S1–S12) runs the real app in headless Chromium:

```bash
npm install playwright && npx playwright install chromium
node Ferticontrol/tests/run-tests.js
```

See the [Technical Manual](Ferticontrol/MANUALE_TECNICO.md) (Italian) for full documentation. Licensed under **MIT**.

</details>
