# 🌱 FertiControl — Schema Collegamenti Arduino R4 WiFi

## 📋 Componenti Necessari

### Attuatori (Uscite Digitali - Relè)
| Elemento | Funzione | Pin Arduino | Tipo Relè | Alimentazione |
|----------|----------|------------|-----------|---------------|
| **Peristaltica A** | Dosaggio soluzione madre A | GPIO 2 | Relè 5V | 12V CC |
| **Peristaltica B** | Dosaggio soluzione madre B | GPIO 3 | Relè 5V | 12V CC |
| **Peristaltica pH** | Dosaggio pH+ o pH− | GPIO 4 | Relè 5V | 12V CC |
| **Pompa ricircolo/distrib.** | Miscelazione + irrigazione | GPIO 5 | Relè 5V | 12V CC |
| **Valvola 3 vie** | Serbatoio ↔ Campo | GPIO 6 | Relè 5V (bistabile) | 12V CC |

**Attenzione:** Per la **valvola 3 vie** è consigliato un relè **bistabile** (mantiene stato con un impulso) o un relè standard con logica di gestione dello stato in firmware.

---

## 📊 Sensori (Ingressi Analogici e Digitali)

### Sensori Analogici (ADC - Analog Digital Converter)
| Sensore | Funzione | Pin Arduino | Tensione | Note |
|---------|----------|------------|----------|------|
| **Sensore pH** | Misurazione pH serbatoio | A0 | 0-5V | Richiede circuito di condizionamento (amplificatore) |
| **Sensore EC** | Misurazione conducibilità | A1 | 0-5V | Idem pH |
| **Igrometro 1** | Umidità zona 1 | A2 | 0-5V | Sensore capacitivo (DFRobot, Chirp, ecc.) |
| **Igrometro 2** | Umidità zona 2 | A3 | 0-5V | Idem |
| **Igrometro 3** | Umidità zona 3 | A4 | 0-5V | Idem |
| **Igrometro 4** | Umidità zona 4 | A5 | 0-5V | Idem |

### Sensore Digitale
| Sensore | Funzione | Pin Arduino | Protocollo | Note |
|---------|----------|------------|-----------|------|
| **RTC (Real Time Clock)** | Data/ora per log | I2C (SDA/SCL) | I2C | Arduino R4 ha RTC integrato (PCF85063A) — **opzionale** esterno |

---

## 🔧 Collegamento Schematico

### Alimentazione
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ▪ Alimentatore 12V CC 10A min                      │
│  ├─ GND → Arduino GND (MASSA COMUNE)                │
│  ├─ +12V → Relè + pompe                            │
│  │                                                   │
│  ▪ Arduino R4 WiFi                                  │
│  ├─ USB Power (oppure 12V → regolatore 5V)         │
│  ├─ GND → MASSA COMUNE con 12V                      │
│  │                                                   │
└─────────────────────────────────────────────────────┘
```

### Peristaltiche (Relè ON/OFF Standard)
```
Arduino GPIO (2,3,4) → Modulo Relè IN → Relè → Pompa Peristaltica
                                           ↓
                                      12V GND
```

**Esempio Peristaltica A (GPIO 2):**
```
GPIO 2  ───[330Ω]─── Modulo Relè IN1
GND     ──────────── Modulo Relè GND
12V     ──────────── Modulo Relè VCC

Relè NO (Normally Open):
   ─┐  ┌─ Pompa (+)
    └─┘  
   ─┐  ┌─ 12V (+)
    │
   GND
```

---

## 🔌 Pinout Arduino R4 WiFi Utilizzati

```
┌───────────────────────────────┐
│   ARDUINO R4 WiFi (Top)       │
├───────────────────────────────┤
│ GND  |  5V   |  3.3V  |  IOREF│
├───────────────────────────────┤
│ A0   ├─ pH sensor             │
│ A1   ├─ EC sensor             │
│ A2   ├─ Igrometro 1           │
│ A3   ├─ Igrometro 2           │
│ A4   ├─ Igrometro 3           │
│ A5   ├─ Igrometro 4           │
├───────────────────────────────┤
│ D0 (RX) ─ UART (seriale)      │
│ D1 (TX) ─ UART (seriale)      │
│ D2 ─── Peristaltica A (relè)  │
│ D3 ─── Peristaltica B (relè)  │
│ D4 ─── Peristaltica pH (relè) │
│ D5 ─── Pompa (relè)           │
│ D6 ─── Valvola 3 vie (relè)   │
│ D7  (libero - espandibile)    │
│ D8  (libero - espandibile)    │
│ ...                            │
├───────────────────────────────┤
│ SDA (D20) ─ I2C (RTC ext.)    │
│ SCL (D21) ─ I2C (RTC ext.)    │
└───────────────────────────────┘
```

---

## 📐 Circuito di Condizionamento Sensori pH e EC

### Per Sensore pH
```
Sensore pH (0-14 pH tipicamente, 0-5V output)
     ↓
┌─────────────────────────────────┐
│  Amplificatore (opamp es. LM358) │
│  - Gain regolabile              │
│  - Offset per calibrazione      │
│  - Output 0-5V → Arduino A0     │
└─────────────────────────────────┘
```

**Opzione semplice:** Utilizzare probe pH con output già 0-5V pronta (es. DFRobot, Atlas Scientific).

### Per Sensore EC
```
Sensore EC (0-3000 µS/cm tipicamente, 0-5V output)
     ↓
┌─────────────────────────────────┐
│  Condizionatore di segnale      │
│  - Amplificatore per range      │
│  - Offset calibrazione 0-5V     │
│  - Output → Arduino A1          │
└─────────────────────────────────┘
```

---

## 💧 Igrometri (Sensori Capacitivi Umidità)

### Collegamento Igrometro Capacitivo (es. DFRobot SEN0193)
```
Sensore:
  ├─ VCC (3.3-5V) → Arduino 5V
  ├─ GND → Arduino GND
  ├─ SIG (Analog) → Arduino A2/A3/A4/A5 (sceglierne 4)
```

**Alternativa I2C:** Se usi sensori I2C (es. Chirp), collegali su SDA/SCL.

---

## 📝 Codice di Configurazione Pinout (Arduino IDE)

```cpp
// ATTUATORI - Uscite Digitali (Relè)
#define PIN_PERIST_A 2    // Peristaltica A
#define PIN_PERIST_B 3    // Peristaltica B
#define PIN_PERIST_PH 4   // Peristaltica pH
#define PIN_PUMP 5        // Pompa
#define PIN_VALVE 6       // Valvola 3 vie

// SENSORI ANALOGICI
#define PIN_PH A0         // Sensore pH
#define PIN_EC A1         // Sensore EC
#define PIN_IGRO1 A2      // Igrometro 1
#define PIN_IGRO2 A3      // Igrometro 2
#define PIN_IGRO3 A4      // Igrometro 3
#define PIN_IGRO4 A5      // Igrometro 4

// SETUP
void setup(){
  pinMode(PIN_PERIST_A, OUTPUT);
  pinMode(PIN_PERIST_B, OUTPUT);
  pinMode(PIN_PERIST_PH, OUTPUT);
  pinMode(PIN_PUMP, OUTPUT);
  pinMode(PIN_VALVE, OUTPUT);
  
  // Spegni tutto inizialmente
  digitalWrite(PIN_PERIST_A, LOW);
  digitalWrite(PIN_PERIST_B, LOW);
  digitalWrite(PIN_PERIST_PH, LOW);
  digitalWrite(PIN_PUMP, LOW);
  digitalWrite(PIN_VALVE, LOW);
}

// LETTURA SENSORI
void readSensors(){
  int phRaw = analogRead(PIN_PH);       // 0-1023
  int ecRaw = analogRead(PIN_EC);
  int igro1 = analogRead(PIN_IGRO1);
  int igro2 = analogRead(PIN_IGRO2);
  int igro3 = analogRead(PIN_IGRO3);
  int igro4 = analogRead(PIN_IGRO4);
  
  // Converti a valori fisici (calibrazione dipende dal sensore)
  float phValue = mapPH(phRaw);         // 0-14 pH
  float ecValue = mapEC(ecRaw);         // 0-3000 µS/cm
  float humidity1 = mapIgro(igro1);     // 0-100%
  // ... ecc
}

// CONTROLLO ATTUATORI
void setActuator(int pin, bool state){
  digitalWrite(pin, state ? HIGH : LOW);
}
```

---

## 🔌 Lista Acquisti Consigliata

### Essenziale
- [ ] **Arduino R4 WiFi** (1x) — ~35€
- [ ] **Modulo Relè 5V 4CH** (2x) — ~8€ cad
- [ ] **Pompe Peristaltiche 12V** (4x) — ~15-30€ cad (A, B, pH, ricircolo)
- [ ] **Valvola 3 vie 12V** (1x) — ~25€
- [ ] **Alimentatore 12V 10A** (1x) — ~20€
- [ ] **Sensore pH + Sonda** (1x) — ~40€ (DFRobot o simile)
- [ ] **Sensore EC** (1x) — ~35€
- [ ] **Igrometri capacitivi** (4x) — ~8€ cad
- [ ] **Cavi, connettori, relè ricambio**

### Opzionale (Miglioramenti)
- [ ] **RTC esterno** (DS3231 o PCF8563) — ~5€ (Arduino R4 ha RTC integrato)
- [ ] **LCD/OLED Display** — ~15€ (se vuoi anche display locale)
- [ ] **SD Card Module** — ~10€ (logging esteso)
- [ ] **Sensori aggiuntivi** (pressione, temperatura)

---

## 🔗 Schema Elettrico Completo (ASCII Art)

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌─────────────┐                                             │
│  │ Alimentatore│                                             │
│  │  12V 10A CC │                                             │
│  └─────┬───┬───┘                                             │
│        │   │                                                 │
│        │   └──────── GND (MASSA COMUNE)                      │
│        │                                                     │
│        └──────┬─────┬─────┬─────┬─────┬──── +12V             │
│               │     │     │     │     │                     │
│          ┌────▼─┐ ┌─▼──┐ ┌─▼──┐ ┌─▼──┐ ┌──▼──┐             │
│          │Relè 1│ │Relè│ │Relè│ │Relè│ │Valv.│             │
│          │  A   │ │ B  │ │pH  │ │Pump│ │ 3V  │             │
│          └────┬─┘ └─┬──┘ └─┬──┘ └─┬──┘ └──┬──┘             │
│               │     │      │      │       │                 │
│          ┌────▼────▼──────▼──────▼───────▼──────┐           │
│          │  POMPE PERISTALTICHE E VALVOLA       │           │
│          │ (Tutte a 12V)                        │           │
│          └─────────────────────────────────────┘            │
│                                                              │
│          ┌──────────────────────────┐                       │
│          │  ARDUINO R4 WiFi         │                       │
│          │                          │                       │
│          │ GPIO 2-6 → Relè IN       │                       │
│          │ A0-A5   → Sensori analog │                       │
│          │ SDA/SCL → I2C (RTC opt.) │                       │
│          │                          │                       │
│          │ ┌──────────────────────┐ │                       │
│          │ │ Sensori:             │ │                       │
│          │ │ · pH (A0)            │ │                       │
│          │ │ · EC (A1)            │ │                       │
│          │ │ · Igro1-4 (A2-A5)    │ │                       │
│          │ └──────────────────────┘ │                       │
│          └──────────────────────────┘                       │
│                      │                                      │
│                      └─ WiFi AP                             │
│                      (HMI web browser)                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## ✅ Checklist Installazione

- [ ] **Assemblaggio hardware**
  - [ ] Pompe peristaltiche montate
  - [ ] Valvola 3 vie collegata
  - [ ] Sensori posizionati

- [ ] **Collegamenti elettrici**
  - [ ] Relè collegati a GPIO 2-6
  - [ ] Sensori analogici su A0-A5
  - [ ] Massa comune 12V e Arduino
  - [ ] Alimentazione 12V a pompe e valvola

- [ ] **Calibrazione sensori**
  - [ ] pH: 2-point calibration (4.0, 7.0)
  - [ ] EC: 1-point calibration (soluzione know)
  - [ ] Igrometri: test in aria e terra umida

- [ ] **Test firmware**
  - [ ] Ogni pompa si accende/spegne
  - [ ] Valvola cambia posizione
  - [ ] Letture sensori stabili

- [ ] **HMI web**
  - [ ] Connessione WiFi AP FertiControl
  - [ ] Dashboard mostra dati in tempo reale
  - [ ] Controllo manuale funziona
  - [ ] Ricette salvate correttamente

---

## 🚀 Prossimi Step

1. **Firmware Arduino** → Creeremo il codice C++ che gestisce la FSM
2. **API REST** → Endpoints `/api/status`, `/api/control` per l'HMI
3. **EEPROM storage** → Salvataggio parametri e log cicli su Arduino
4. **Notifiche HTTP** → Alert a Telegram in caso di allarmi

---

**Versione documento:** 1.0  
**Data:** Giugno 2026  
**Progetto:** FertiControl — Fertirrigazione Automatica Arduino R4

