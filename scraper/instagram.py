"""Porta nella galleria del sito gli ultimi post Instagram della società.

Usa l'API ufficiale di Instagram con il token salvato nel secret INSTAGRAM_TOKEN.
Senza token non fa nulla. Le immagini vengono scaricate in site/foto/ (gli indirizzi
di Instagram scadono dopo qualche giorno) e aggiunte a site/data/foto.json.
"""

import io
import json
import os
import sys
from datetime import datetime, timezone

import requests
from PIL import Image, ImageOps

from aggiungi_foto import ALBUM, FOTO, salva

API = "https://graph.instagram.com"
CAMPI = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp"


def didascalia(testo):
    riga = next((r.strip() for r in (testo or "").splitlines() if r.strip()), "")
    return riga if len(riga) <= 120 else riga[:117].rstrip() + "…"


def main():
    token = os.environ.get("INSTAGRAM_TOKEN", "").strip()
    if not token:
        print("INSTAGRAM_TOKEN non impostato: salto Instagram")
        return
    r = requests.get(f"{API}/me/media", params={"fields": CAMPI, "limit": 24, "access_token": token}, timeout=30)
    if not r.ok:
        print(f"Instagram non risponde ({r.status_code}): {r.text[:300]}")
        return
    # Allunga la validità del token (dura 60 giorni, si rinnova a ogni uso dopo 24 ore).
    requests.get(f"{API}/refresh_access_token", params={"grant_type": "ig_refresh_token", "access_token": token}, timeout=30)

    FOTO.mkdir(parents=True, exist_ok=True)
    album = json.loads(ALBUM.read_text()) if ALBUM.exists() else {"foto": []}
    presenti = {f.get("instagram") for f in album["foto"]}
    nuove = []
    for post in r.json().get("data", []):
        if post["id"] in presenti:
            continue
        url = post.get("thumbnail_url") if post.get("media_type") == "VIDEO" else post.get("media_url")
        if not url:
            continue
        try:
            img = requests.get(url, timeout=60)
            img.raise_for_status()
            im = ImageOps.exif_transpose(Image.open(io.BytesIO(img.content))).convert("RGB")
        except Exception as e:
            print(f"Immagine {post['id']} non scaricata: {e}")
            continue
        nome = f"ig-{post['id']}"
        salva(im, FOTO / f"{nome}.jpg", 1600)
        salva(im, FOTO / f"{nome}-mini.jpg", 480)
        nuove.append({"src": f"foto/{nome}.jpg", "miniatura": f"foto/{nome}-mini.jpg",
                      "didascalia": didascalia(post.get("caption")), "data": post["timestamp"][:10],
                      "link": post.get("permalink"), "instagram": post["id"]})
    if not nuove:
        print("Nessun nuovo post Instagram")
        return
    album["foto"] = sorted(nuove + album["foto"], key=lambda f: f.get("data") or "", reverse=True)
    album["aggiornato"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    ALBUM.write_text(json.dumps(album, ensure_ascii=False, indent=1) + "\n")
    print(f"Aggiunti {len(nuove)} post Instagram, totale {len(album['foto'])} foto")


if __name__ == "__main__":
    sys.exit(main())
