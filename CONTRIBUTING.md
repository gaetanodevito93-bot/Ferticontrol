# Contribuire a FertiControl

Grazie per l'interesse! FertiControl è un progetto volutamente semplice da mantenere: **un solo file HTML**, nessuna build, nessuna dipendenza a runtime. Queste linee guida servono a mantenerlo affidabile.

## Regola d'oro: i test

L'app calcola dosaggi chimici reali. **Lancia sempre la suite di test prima e dopo ogni modifica** al file `Ferticontrol/Ferticontrol1.html`:

```bash
npm install playwright
npx playwright install chromium
node Ferticontrol/tests/run-tests.js
```

Exit code `0` = tutto verde. Se tocchi la chimica, il solver o la persistenza, **ogni bug corretto deve diventare un nuovo test** nella suite: è la garanzia che non ritorni.

## Come proporre una modifica

1. **Forka** il repository e crea un branch descrittivo (`fix/precipitazione-brushite`, `feat/ricetta-basilico`).
2. Fai le tue modifiche mantenendo lo stile del codice esistente (JavaScript "vanilla", nessuna libreria esterna).
3. Verifica che la suite di test passi (`node Ferticontrol/tests/run-tests.js`).
4. Se hai aggiunto funzionalità o cambiato l'architettura, aggiorna il **[Manuale Tecnico](MANUALE_TECNICO.md)** — in particolare i riferimenti alle righe nel Capitolo 2.
5. Apri una **Pull Request** con una descrizione chiara di *cosa* cambia e *perché*.

## Convenzioni

- **Un solo file**: CSS, markup e JavaScript restano dentro `Ferticontrol1.html`. Niente bundler, framework o transpiler.
- **Stile difensivo**: ogni lettura da `localStorage` passa per `safeParse`; ogni testo salvato/importato va sanificato (`stripTags`, `esc`); il calcolo lavora su copie, mai mutando gli input.
- **Dati di fabbrica immutabili**: `SALI_DEFAULT` e `PIANTE_BUILTIN` non si mutano mai a runtime.
- **Bilingue**: ogni nuova stringa dell'interfaccia va aggiunta ai dizionari `I18N.it` / `I18N.en` (o gestita con `TT()` / `t()`).
- **Commit**: messaggi chiari e in ambito (`feat:`, `fix:`, `refactor:`, `docs:`…).

## Segnalare un bug

Apri una **Issue** descrivendo: cosa ti aspettavi, cosa è successo, i passi per riprodurlo e — se rilevante — l'export JSON dei dati o gli input usati (acqua, ricetta, volumi, diluizione, pH). Screenshot della scheda di calcolo aiutano molto.

## Sicurezza

Non inviare dati sensibili nelle Issue pubbliche. L'app non trasmette dati verso l'esterno: qualunque comportamento contrario è un bug da segnalare con priorità.
