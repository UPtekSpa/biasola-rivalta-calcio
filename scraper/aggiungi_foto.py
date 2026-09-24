"""Aggiunge foto alla galleria del sito.

Uso: python scraper/aggiungi_foto.py CARTELLA [--didascalia "testo"] [--data AAAA-MM-GG]

Ridimensiona ogni immagine della cartella (foto grande 1600 px e miniatura 480 px),
la salva in site/foto/ e la aggiunge in testa a site/data/foto.json.
"""

import argparse
import hashlib
import json
from datetime import date, datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
FOTO = ROOT / "site" / "foto"
ALBUM = ROOT / "site" / "data" / "foto.json"
ESTENSIONI = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def salva(im, path, lato):
    im = im.copy()
    im.thumbnail((lato, lato))
    im.save(path, "JPEG", quality=82, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cartella")
    ap.add_argument("--didascalia", default="")
    ap.add_argument("--data", default=date.today().isoformat())
    args = ap.parse_args()

    FOTO.mkdir(parents=True, exist_ok=True)
    album = json.loads(ALBUM.read_text()) if ALBUM.exists() else {"foto": []}
    presenti = {f["src"] for f in album["foto"]}
    nuove = []
    for p in sorted(Path(args.cartella).iterdir()):
        if p.suffix.lower() not in ESTENSIONI:
            continue
        nome = f"{args.data}-{hashlib.sha1(p.read_bytes()).hexdigest()[:10]}"
        src = f"foto/{nome}.jpg"
        if src in presenti:
            continue
        im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
        salva(im, FOTO / f"{nome}.jpg", 1600)
        salva(im, FOTO / f"{nome}-mini.jpg", 480)
        nuove.append({"src": src, "miniatura": f"foto/{nome}-mini.jpg",
                      "didascalia": args.didascalia, "data": args.data})
    album["foto"] = nuove + album["foto"]
    album["aggiornato"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    ALBUM.write_text(json.dumps(album, ensure_ascii=False, indent=1) + "\n")
    print(f"Aggiunte {len(nuove)} foto, totale {len(album['foto'])}")


if __name__ == "__main__":
    main()
