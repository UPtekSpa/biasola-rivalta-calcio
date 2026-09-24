"""Raccoglie news, risultati e classifiche della Biasola Rivalta Calcio.

Legge config.json e aggiorna i file in site/data/:
  news.json     notizie (società, campionato, comunicati ufficiali)
  squadre.json  partite e classifica per ogni squadra
  stato.json    esito dell'ultima raccolta per ogni fonte

Ogni fonte è indipendente: se un sito non risponde o cambia struttura,
le altre continuano a funzionare e i dati già raccolti restano.

Uso: python scraper/collect.py [--snapshot cartella]
  --snapshot salva l'HTML scaricato, utile per adattare i parser.
"""

import argparse
import hashlib
import io
import json
import re
import sys
import time
import traceback
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote_plus, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
MAX_NEWS = 300
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9"})
snapshot_dir = None


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def fetch(url, binary=False):
    last = None
    for attempt in range(3):
        try:
            r = session.get(url, timeout=30)
            r.raise_for_status()
            if snapshot_dir and not binary:
                name = re.sub(r"[^A-Za-z0-9]+", "_", url)[:150] + ".html"
                (snapshot_dir / name).write_bytes(r.content)
            if binary:
                return r.content
            if not r.encoding or r.encoding.lower() == "iso-8859-1":
                r.encoding = r.apparent_encoding
            return r.text
        except requests.RequestException as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise last


def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def news_id(link):
    return hashlib.sha1(link.encode()).hexdigest()[:12]


def norm_title(t):
    t = re.sub(r"\s+-\s+[^-]{2,40}$", "", t)  # suffisso " - Fonte" di Google News
    return re.sub(r"[^a-z0-9]", "", t.lower())


def item(titolo, link, fonte, tipo, data=None, estratto="", squadra=None, righe=None):
    it = {
        "id": news_id(link),
        "titolo": clean(titolo),
        "link": link,
        "fonte": fonte,
        "tipo": tipo,
        "data": data or now_iso(),
        "trovata": now_iso(),
        "estratto": clean(estratto)[:300],
        "squadra": squadra,
    }
    if righe:
        it["righe"] = righe
    return it


def mentions(text, keywords):
    t = (text or "").lower()
    return any(k in t for k in keywords)


# ---------------------------------------------------------------- RSS / Google News

def parse_rss(xml_text):
    out = []
    root = ET.fromstring(xml_text.encode() if isinstance(xml_text, str) else xml_text)
    for el in root.iter("item"):
        title = el.findtext("title") or ""
        link = el.findtext("link") or ""
        date = el.findtext("pubDate")
        src = el.find("source")
        desc = BeautifulSoup(el.findtext("description") or "", "html.parser").get_text(" ")
        try:
            iso = parsedate_to_datetime(date).astimezone(timezone.utc).isoformat() if date else None
        except (TypeError, ValueError):
            iso = None
        out.append({
            "title": title, "link": link, "date": iso, "desc": desc,
            "source": src.text if src is not None else urlparse(link).netloc,
        })
    return out


def google_news(query):
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=it&gl=IT&ceid=IT:it"
    return parse_rss(fetch(url))


def strip_source(title, source):
    """Google News aggiunge " - Fonte" in coda al titolo: la fonte è già mostrata a parte."""
    if source and title.endswith(" - " + source):
        return title[: -len(source) - 3]
    return title


def cita_squadra(title, squadre_girone):
    t = " " + re.sub(r"[^a-z0-9]+", " ", title.lower()) + " "
    return any(f" {n} " in t for n in squadre_girone)


def classifica_news(title, text, cfg, keywords, girone):
    """Decide se una notizia riguarda la società o un suo campionato: (tipo, squadra) o None."""
    if mentions(title + " " + text, keywords):
        return "societa", None
    full = title + " " + text
    for sq in cfg["squadre"]:
        if mentions(full, sq.get("parole_campionato", [])) or cita_squadra(full, girone.get(sq["id"], [])):
            return "campionato", sq["id"]
    return None


def collect_rss(cfg, keywords, girone):
    items = []
    for q in cfg["fonti_generali"]["google_news"]:
        for e in google_news(q):
            if mentions(e["title"] + " " + e["desc"], keywords):
                items.append(item(strip_source(e["title"], e["source"]), e["link"], e["source"],
                                  "societa", e["date"], e["desc"]))
    for url in cfg["fonti_generali"]["rss"]:
        for e in parse_rss(fetch(url)):
            c = classifica_news(e["title"], e["desc"], cfg, keywords, girone)
            if c:
                items.append(item(e["title"], e["link"], urlparse(url).netloc, c[0], e["date"], e["desc"], c[1]))
    return items


def nomi_girone(info, keywords):
    nomi = {r["squadra"] for r in info.get("classifica", [])}
    for p in info.get("girone", []) or info.get("partite", []):
        nomi.update([p["casa"], p["ospite"]])
    out = set()
    for n in nomi:
        if mentions(n, keywords):
            continue
        n = re.sub(r"[^a-z0-9]+", " ", n.lower()).strip()
        n = re.sub(r"\b(a s d|asd|u s|us|f c|fc|pol|ac|ssd|calcio|u21)\b", " ", n)
        n = re.sub(r"\s+", " ", n).strip()
        if len(n) >= 5:
            out.add(n)
    return sorted(out)


# ---------------------------------------------------------------- pagine con link a notizie

def news_links(page_url, cfg, keywords, girone, squadra=None):
    """Articoli linkati da una pagina HTML (titolo e sommario possono essere link separati)."""
    soup = BeautifulSoup(fetch(page_url), "html.parser")
    host = urlparse(page_url).netloc.replace("www.", "")
    testi = {}
    for a in soup.find_all("a", href=True):
        href = urljoin(page_url, a["href"])
        if not re.search(r"/news/[^?]*dettaglio|/news/\d|/\d{4}/\d{2}/\d{2}/", href, re.I):
            continue
        t = clean(a.get_text(" ")) or clean(a.get("title"))
        if t and t not in testi.setdefault(href, []):
            testi[href].append(t)
    out = []
    for href, parti in testi.items():
        titolo = max(parti[:2], key=lambda t: sum(ch.isupper() for ch in t))
        estratto = " ".join(t for t in parti if t != titolo)
        if len(titolo) < 12:
            continue
        c = classifica_news(titolo, estratto, cfg, keywords, girone)
        if c:
            out.append(item(titolo.capitalize() if titolo.isupper() else titolo, href, host,
                            c[0], estratto=estratto, squadra=c[1] or squadra))
    return out


# ---------------------------------------------------------------- comunicati FIGC Reggio Emilia

SEZIONI = ["TERZA CATEGORIA", "SECONDA CATEGORIA", "JUNIORES", "ALLIEVI",
           "GIOVANISSIMI", "ESORDIENTI", "PULCINI", "CALCIO A 5", "FEMMINILE"]


def figc_comunicati(cfg, keywords, stato, max_nuovi=6):
    base = cfg["fonti_generali"]["figc_comunicati"]
    soup = BeautifulSoup(fetch(base), "html.parser")
    cu = {}
    for a in soup.find_all("a", href=True):
        m = re.search(r"/files/(?:announcements|comunicati)/\d{4}/(\d+)/CU(\d+)\.pdf$", a["href"], re.I)
        if m:
            cu[int(m.group(1))] = (int(m.group(2)), urljoin(base, a["href"]))
    visti = set(stato.get("figc_visti", []))
    nuovi = sorted((i for i in cu if i not in visti), reverse=True)[:max_nuovi]
    sezione_squadra = {sq["figc_sezione"]: sq["id"] for sq in cfg["squadre"] if sq.get("figc_sezione")}
    items = []
    for cid in nuovi:
        numero, pdf = cu[cid]
        righe = pdf_mentions(fetch(pdf, binary=True), keywords)
        visti.add(cid)
        if not righe:
            continue
        squadre = {sezione_squadra.get(r["sezione"]) for r in righe} - {None}
        items.append(item(
            f"Comunicato Ufficiale n. {numero} FIGC Reggio Emilia: le righe sulla Biasola",
            pdf, "figcreggioemilia.it", "ufficiale",
            estratto=" · ".join(r["testo"] for r in righe[:3]),
            squadra=squadre.pop() if len(squadre) == 1 else None,
            righe=righe[:20],
        ))
    stato["figc_visti"] = sorted(visti)[-200:]
    return items


def pdf_mentions(pdf_bytes, keywords):
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf_bytes))
    sezione, out = None, []
    for page in reader.pages:
        for line in (page.extract_text() or "").splitlines():
            line = clean(line)
            up = line.upper()
            for s in SEZIONI:
                if s in up and len(line) < 80:
                    sezione = s
            if mentions(line, keywords):
                out.append({"sezione": sezione, "testo": line})
    return out


# ---------------------------------------------------------------- calendario e classifica

DATE_RE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b")
SCORE_RE = re.compile(r"^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$")


def table_rows(html):
    soup = BeautifulSoup(html, "html.parser")
    for tr in soup.find_all("tr"):
        cells = [clean(td.get_text(" ")) for td in tr.find_all(["td", "th"])]
        cells = [c for c in cells if c]
        if cells:
            yield cells


def parse_data(text):
    d = DATE_RE.search(text or "")
    if not d:
        return None
    g, m, y = d.groups()
    y = int(y) + (2000 if len(y) == 2 else 0)
    return f"{y:04d}-{int(m):02d}-{int(g):02d}"


def parse_calendario(html, keywords):
    """Calendario di RomagnaSport: righe .info-calendario con giornata/data o due squadre e risultato.
    Restituisce tutte le partite del girone; 'noi' segna quelle della Biasola."""
    soup = BeautifulSoup(html, "html.parser")
    partite, giornata, data = [], None, None
    for row in soup.select(".info-calendario"):
        testo = clean(row.get_text(" "))
        squadre = [clean(a.get_text(" ")) for a in row.find_all("a") if "squadra.php" in a.get("href", "")]
        if len(squadre) < 2:
            m = re.search(r"(\d{1,2})\s*a\s+giornata", testo, re.I)
            if m:
                giornata = int(m.group(1))
            data = parse_data(testo) or data
            continue
        casa, ospite = squadre[:2]
        m = re.search(r"\b(\d{1,2})\s*-\s*(\d{1,2})\b", testo)
        risultato = f"{m.group(1)}-{m.group(2)}" if m else None
        noi = mentions(casa + " " + ospite, keywords)
        esito = None
        if risultato and noi:
            a, b = int(m.group(1)), int(m.group(2))
            gf, gs = (a, b) if mentions(casa, keywords) else (b, a)
            esito = "V" if gf > gs else "P" if gf < gs else "N"
        partite.append({"giornata": giornata, "data": parse_data(testo) or data, "casa": casa,
                        "ospite": ospite, "risultato": risultato, "esito": esito, "noi": noi})
    return partite


def parse_classifica(html, keywords):
    best = []
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table"):
        rows = []
        for tr in table.find_all("tr"):
            cells = [clean(td.get_text(" ")) for td in tr.find_all(["td", "th"])]
            cells = [c for c in cells if c]
            nums = [c for c in cells if re.fullmatch(r"-?\d+", c)]
            names = [c for c in cells if re.search(r"[A-Za-z]{3}", c)]
            if len(nums) >= 4 and names:
                name_idx = cells.index(names[0])
                after = [int(c) for c in cells[name_idx + 1:] if re.fullmatch(r"-?\d+", c)]
                if len(after) < 4:
                    continue
                nome = re.sub(r"^\d+\s*[.°)]?\s*", "", names[0])
                rows.append({"squadra": nome, "punti": after[0], "giocate": after[1],
                             "valori": after, "noi": mentions(nome, keywords)})
        if len(rows) > len(best):
            best = rows
    for i, r in enumerate(best, 1):
        r["pos"] = i
    return best


# ---------------------------------------------------------------- main

def load(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def run_source(stato, nome, fn):
    try:
        res = fn()
        stato["fonti"][nome] = {"ok": True, "quando": now_iso(),
                                "elementi": len(res) if hasattr(res, "__len__") else None}
        print(f"[ok] {nome}: {stato['fonti'][nome]['elementi']}")
        return res
    except Exception as e:  # una fonte rotta non deve fermare le altre
        stato["fonti"][nome] = {"ok": False, "quando": now_iso(), "errore": f"{type(e).__name__}: {e}"[:300]}
        print(f"[errore] {nome}: {e}", file=sys.stderr)
        traceback.print_exc()
        return None


def merge_news(old, new):
    by_id = {n["id"]: n for n in old}
    titles = {norm_title(n["titolo"]) for n in old}
    for n in new:
        if n["id"] in by_id:
            continue
        t = norm_title(n["titolo"])
        if t in titles:
            continue
        titles.add(t)
        by_id[n["id"]] = n
    out = sorted(by_id.values(), key=lambda n: n.get("data") or "", reverse=True)
    return out[:MAX_NEWS]


def main():
    global snapshot_dir
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot")
    args = ap.parse_args()
    if args.snapshot:
        snapshot_dir = Path(args.snapshot)
        snapshot_dir.mkdir(parents=True, exist_ok=True)

    cfg = load(ROOT / "config.json", None)
    kw = [k.lower() for k in cfg["parole_chiave"]]
    DATA.mkdir(parents=True, exist_ok=True)
    stato = load(DATA / "stato.json", {})
    stato["fonti"] = {}
    news = load(DATA / "news.json", [])
    squadre_old = {s["id"]: s for s in load(DATA / "squadre.json", {}).get("squadre", [])}

    squadre, raccolte = [], []
    for sq in cfg["squadre"]:
        old = squadre_old.get(sq["id"], {})
        info = {k: sq.get(k) for k in ("id", "nome", "campionato", "allenatore", "da_confermare")}
        info["partite"] = old.get("partite", [])
        info["classifica"] = old.get("classifica", [])
        info["girone"] = old.get("girone", [])
        info["link"] = sq.get("link", [])
        rs = sq.get("romagnasport")
        if rs:
            p = run_source(stato, f"Calendario {sq['nome']}", lambda: parse_calendario(fetch(rs["calendario"]), kw))
            if p:
                info["partite"] = [x for x in p if x["noi"]]
                info["girone"] = p
            c = run_source(stato, f"Classifica {sq['nome']}", lambda: parse_classifica(fetch(rs["classifica"]), kw))
            if c:
                info["classifica"] = c
        squadre.append(info)

    girone = {i["id"]: nomi_girone(i, kw) for i in squadre}
    raccolte += run_source(stato, "Google News e RSS", lambda: collect_rss(cfg, kw, girone)) or []
    raccolte += run_source(stato, "Comunicati FIGC Reggio Emilia", lambda: figc_comunicati(cfg, kw, stato)) or []
    pagine = [(u, None) for u in cfg["fonti_generali"].get("pagine_news", [])]
    pagine += [(u, sq["id"]) for sq in cfg["squadre"] for u in sq.get("pagine_news", [])]
    for url, sid in pagine:
        raccolte += run_source(stato, url.split("//")[1][:60],
                               lambda u=url, s=sid: news_links(u, cfg, kw, girone, s)) or []

    news = merge_news(news, raccolte)
    stato["ultimo_aggiornamento"] = now_iso()
    save(DATA / "news.json", news)
    save(DATA / "squadre.json", {"aggiornato": now_iso(), "societa": cfg["societa"], "squadre": squadre})
    save(DATA / "stato.json", stato)
    ok = sum(1 for f in stato["fonti"].values() if f["ok"])
    print(f"Fonti riuscite: {ok}/{len(stato['fonti'])}. Notizie totali: {len(news)}")


if __name__ == "__main__":
    main()
