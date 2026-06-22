# FertiControl 🌱

**Sistema HMI SCADA per fertirrigazione automatica su Arduino R4 WiFi**

---

## Contenuto

| File | Descrizione |
|------|-------------|
| `hmi_fertirrigazione.html` | Interfaccia HMI completa — single file, 100 KB |
| `SCHEMA_COLLEGAMENTI_ARDUINO_R4.md` | Schema elettrico, pinout, lista componenti |

## Caratteristiche HMI

- **Schema di processo animato** — flusso liquido nei tubi, rotori pompe peristaltiche, glow sui componenti attivi
- **5 schermate**: Quadro · Schema · Ricette · Config · Manutenzione
- **Gestione ricette colturali** — CRUD completo con persistenza localStorage
- **Controllo attuatori** — modalità auto/manuale per ogni elemento
- **Sensori live** — pH, EC con scala graduata, 4 zone igrometria
- **Countdown manutenzione** — timer 30s per comandi manuali
- **Mobile-first** — ottimizzato per operatori in campo

## Architettura

```
Arduino R4 WiFi (Access Point)
├── Peristaltica A  →  GPIO 2
├── Peristaltica B  →  GPIO 3
├── Peristaltica pH →  GPIO 4
├── Pompa ricircolo →  GPIO 5
├── Valvola 3 vie   →  GPIO 6
├── Sensore pH      →  A0
├── Sensore EC      →  A1
└── Igrometri 1-4   →  A2-A5
```

## Utilizzo

1. Caricare `hmi_fertirrigazione.html` su Arduino R4 (SPIFFS)
2. Connettere al WiFi `FertiControl_AP`
3. Aprire `192.168.4.1` nel browser del telefono

---
*Progetto: fertirrigazione automatica a due parti A/B con correzione pH progressiva*
