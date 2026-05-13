# Design Spec: Word/Excel Support + Dark Mode

**Date:** 2026-05-13  
**Project:** pdf2mrk  
**Status:** Awaiting user review

---

## Context

pdf2mrk converte PDF in markdown tramite OCR (GLM-OCR via Ollama). L'utente vuole:
1. Supportare anche file Word (.docx/.doc) ed Excel (.xlsx/.xls)
2. Aggiungere una dark mode che copre UI e pannello markdown, ma NON il visualizzatore del documento originale

---

## Feature 1: Word ed Excel Support

### Modalità di conversione

L'utente può scegliere tra due modalità per Word ed Excel (non per PDF, che usa solo OCR):

**Estrazione Diretta** (solo `.docx` e `.xlsx/.xls`):
- Word `.docx`: `python-docx` estrae titoli, paragrafi, tabelle, grassetto/corsivo → markdown strutturato
- Excel `.xlsx/.xls`: `openpyxl`/`pandas` estrae ogni sheet come tabella markdown separata, con intestazione `## Sheet: <nome>`
- Nessun OCR, conversione immediata

> **Nota:** Il vecchio formato `.doc` (binario) NON supporta estrazione diretta. Per `.doc`, l'unica modalità disponibile è OCR. Il selector in UI lo riflette (per `.doc` OCR è l'unica opzione).

**Modalità OCR** (tutti i formati Word/Excel):
- Word/Excel → PDF tramite LibreOffice headless (`libreoffice --headless --convert-to pdf`)
- Il PDF generato entra nel pipeline esistente: PyMuPDF → immagini JPEG → GLM-OCR
- Flusso UI identico al PDF corrente (pagine visibili a sinistra, OCR pagina per pagina)
- Se LibreOffice non è installato sul sistema, la modalità OCR mostra un errore esplicativo

### Pannello sinistro in modalità Estrazione Diretta

Mostra info strutturali del documento:
- **Word:** icona file, nome, numero di paragrafi, intestazioni, tabelle rilevate
- **Excel:** icona file, nome, lista dei sheet con numero righe/colonne ciascuno

In modalità OCR il pannello sinistro rimane identico al flusso PDF.

### Flusso utente

1. L'utente trascina/carica un file (PDF / DOCX / DOC / XLSX / XLS)
2. Se il file è Word o Excel, appare un selector "Modalità conversione: Diretta | OCR"
3. **Modalità Diretta:** Backend converte immediatamente, markdown appare nel pannello destro
4. **Modalità OCR:** Backend converte in PDF, poi flusso normale (pagine + OCR per pagina)
5. Download del markdown come `.md`

### Backend — nuovi endpoint e flusso chiamate

| Endpoint | Descrizione |
|----------|-------------|
| `POST /api/convert-direct` | Estrazione diretta `.docx`/`.xlsx`/`.xls` → restituisce `{markdown: string, info: {...}}` |
| `POST /api/convert-to-pdf` | Converte Word/Excel in PDF via LibreOffice → restituisce `{pages: [...base64 images...], page_count: N}` (stesso formato di `/api/upload` per i PDF) |

**Flusso chiamate per tipo:**
- **PDF:** `POST /api/upload` → pagine → `POST /api/ocr-page` per pagina (invariato)
- **Word/Excel Diretta:** `POST /api/convert-direct` → markdown immediato nel pannello destro
- **Word/Excel OCR:** `POST /api/convert-to-pdf` → riceve pagine come se fosse un PDF → `POST /api/ocr-page` per pagina (riusa endpoint esistente)

### Nuove dipendenze backend

```
python-docx>=1.1.0
openpyxl>=3.1.0
pandas>=2.0.0
```

LibreOffice deve essere installato sul sistema (per modalità OCR).

### Componenti frontend modificati/nuovi

| File | Modifica |
|------|----------|
| `UploadZone.jsx` | Aggiunge `.docx .doc .xlsx .xls` all'attributo `accept`; mostra selector modalità |
| `App.jsx` | Gestisce il tipo file e la modalità scelta; routing verso flusso diretto o OCR |
| `SplitView.jsx` | Passa flag `isDirectMode` al pannello sinistro |
| `PageViewer.jsx` | Aggiunge branch per visualizzare info strutturali (nessuna immagine in direct mode) |
| `api.js` | Aggiunge chiamate a `/api/convert-direct` e `/api/convert-to-pdf` |
| `DocInfoPanel.jsx` | **Nuovo componente** — visualizza metadati strutturali Word/Excel |

---

## Feature 2: Dark Mode

### Tecnica

- Tailwind `darkMode: 'class'` in `tailwind.config.js`
- `ThemeContext` React context con `isDark: boolean` e `toggleTheme()`
- All'attivazione: aggiunge/rimuove classe `dark` su `document.documentElement`
- Preferenza salvata in `localStorage` con chiave `pdf2mrk-theme`
- All'avvio: legge `localStorage`, applica tema prima del primo render (evita flash)

### Scope

| Area | Dark mode |
|------|-----------|
| Header / navbar | ✅ sì |
| Sfondi pagina | ✅ sì |
| Pannello markdown (destra) | ✅ sì |
| Pulsanti, bordi, input | ✅ sì |
| Visualizzatore documento (sinistra) | ❌ sempre sfondo bianco |
| Immagini pagine PDF | ❌ invariate |
| Info strutturali Word/Excel | ❌ sfondo bianco (rappresenta il documento) |

### UI

- Toggle nell'header: icona `Sun` (light) / `Moon` (dark) — usa lucide-react già installato
- Transizione CSS fluida: `transition-colors duration-200` su elementi principali

### Componenti frontend modificati

| File | Modifica |
|------|----------|
| `tailwind.config.js` | `darkMode: 'class'` |
| `main.jsx` | Wrap con `<ThemeProvider>` |
| `ThemeContext.jsx` | **Nuovo** — context + localStorage logic |
| `App.jsx` | Import `ThemeContext`, aggiunge toggle button |
| `index.css` | Variabili / override scrollbar per dark |
| `SplitView.jsx` | Varianti `dark:` su sfondi e bordi |
| `MarkdownPanel.jsx` | Varianti `dark:` su sfondo, testo, prosa |
| `PageViewer.jsx` | Nessuna variante dark (fisso light) |
| `DocInfoPanel.jsx` | Nessuna variante dark (fisso light) |

---

## Verifica end-to-end

1. **Word Diretta:** Caricare un `.docx` con titoli, paragrafi e una tabella → verificare markdown con heading `#`, bold e tabella GFM
2. **Excel Diretta:** Caricare un `.xlsx` con più sheet → verificare un blocco markdown per sheet con tabella
3. **Word OCR:** Caricare `.docx` in modalità OCR → verificare che appaia come PDF (pagine a sinistra), OCR funzionante
4. **Dark mode:** Attivare toggle → UI e markdown panel scuri, pannello sinistro resta chiaro
5. **Persistenza:** Ricaricare pagina in dark mode → tema corretto senza flash
6. **PDF:** Verificare che il flusso PDF esistente non sia rotto
