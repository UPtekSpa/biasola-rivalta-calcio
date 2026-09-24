# Biasola Rivalta Calcio

Sito della Biasola-Rivalta Calcio A.P.S. con news, risultati e classifiche raccolti automaticamente dal web.

## Come funziona

- `config.json` elenca la società, le squadre, i campionati e le fonti da leggere.
- `scraper/collect.py` scarica le fonti e aggiorna i dati in `site/data/`:
  Google News, comunicati ufficiali FIGC Reggio Emilia (PDF), RomagnaSport (calendario e classifica),
  Tuttocampo, CalcioReggiano e SoloDilettanti.
- `.github/workflows/aggiorna.yml` esegue la raccolta ogni giorno alle 7 e alle 19 e la domenica sera,
  salva i dati e pubblica la cartella `site/` su GitHub Pages (branch `gh-pages`).
- Il sito (`site/`) è HTML statico: le pagine leggono i file JSON e mostrano news, partite e classifica.

## Operazioni comuni

- **Aggiungere una squadra**: nuova voce in `squadre` dentro `config.json`.
- **Aggiornare subito**: scheda Actions, "Aggiorna news e pubblica il sito", Run workflow.
- **Provare in locale**: `pip install -r scraper/requirements.txt`, poi `python scraper/collect.py`
  e `python -m http.server -d site`.

Se una fonte non risponde, le altre continuano a funzionare: lo stato di ogni fonte è in fondo al sito.
