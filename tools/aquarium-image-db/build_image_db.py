#!/usr/bin/env python3
"""Baut eine Bilddatenbank für alle Arten aus den Aquarium-JSON-Dateien.

Quelle: Wikipedia-Leitbilder (en, de) und Wikimedia Commons.

Auswahlregel: Pro Art werden alle Kandidaten gesammelt und nach Lizenzrang gewählt:
  1. gemeinfrei (Public Domain mit weltweit gültiger PD-Vorlage) oder CC0
  2. CC BY
  3. CC BY-SA (abschaltbar mit --no-sharealike)
Alle zugelassenen Lizenzen erlauben Weiterverbreitung (z. B. GitHub-Repo, App),
Nutzung in einer App und kommerzielle Nutzung. NC, ND, GFDL, Fair Use und nur in den
USA gemeinfreie Bilder werden verworfen. Zu jedem Bild werden Urheber, Quelle und Lizenz
gespeichert; Bilder ohne benannten Urheber werden nicht übernommen.

Nur Python-Standardbibliothek. Beispiel:
    python3 build_image_db.py --contact admin@example.org --download
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

WIKI_API = {
    "en": "https://en.wikipedia.org/w/api.php",
    "de": "https://de.wikipedia.org/w/api.php",
}
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

# Strukturierte Daten auf Commons: P6216 = Urheberrechtsstatus, Q19652 = gemeinfrei,
# P275 = Lizenz, Q6938433 = CC0
SEARCH_PUBLIC_DOMAIN = "haswbstatement:P6216=Q19652"
SEARCH_CC0 = "haswbstatement:P275=Q6938433"

# --- Lizenzregeln -------------------------------------------------------------------
TIERS = {"public-domain": 0, "cc-by": 1, "cc-by-sa": 2}
TIER_LABEL = {"public-domain": "gemeinfrei", "cc-by": "CC BY", "cc-by-sa": "CC BY-SA"}
CC_CODE = re.compile(r"^cc-by(-sa)?-(\d(?:\.\d)?)(?:-([a-z]{2,3}))?$", re.I)
CC_SHORT = re.compile(r"^CC BY(-SA)? \d(\.\d)?( [a-z]{2,3})?$", re.I)
CC0 = re.compile(r"^(cc0|cc-zero)", re.I)
PUBLIC_DOMAIN = re.compile(r"^(pd|public domain)", re.I)
NC_ND = re.compile(r"(\bnc\b|\bnd\b|-nc|-nd|noncommercial|noderiv)", re.I)
# PD-Vorlagen, die nur in den USA gelten → für Verbreitung in DE/EU nicht ausreichend
PD_US_ONLY = re.compile(r"^Template:PD-(US(?!Gov)|1923|1996|US-?expired|US-?no.notice|US-?not.renewed)", re.I)
# PD-Vorlagen mit weltweit tragfähiger Grundlage
PD_WORLDWIDE = re.compile(r"^Template:(PD-self|PD-author|PD-user|PD-old|PD-Art|PD-USGov|PD-NASA|PD-NOAA|Cc-zero|CC-zero)", re.I)
UNKNOWN_AUTHOR = re.compile(r"^(unknown|unbekannt|anonym\w*|not provided|n/?a|\?+|-+)\b", re.I)
HREF = re.compile(r'href="([^"]+)"|href=\'([^\']+)\'')

# --- Bildregeln ---------------------------------------------------------------------
BAD_FILENAME = re.compile(
    r"(\bmap\b|range|distribution|verbreitung|karte|drawing|illustration|zeichnung|"
    r"\bplate\b|tafel|skeleton|skelett|logo|stamp|briefmarke|bloch|lac[eé]p[eè]de|"
    r"cuvier|\bfig\b|figure|lithograph|engraving|\.svg$|\.gif$|\.tiff?$)",
    re.I,
)
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MIN_WIDTH = 400          # Leitbilder
MIN_WIDTH_SEARCH = 800   # Suchtreffer müssen größer sein, da ungeprüfte Herkunft
BINOMIAL = re.compile(r"\b([A-Z][a-z]+) (?:cf\. )?([a-z]{3,})\b")
SYNONYM = re.compile(r"Syn\.\s+([A-Z][a-z]+ [a-z]{3,})")
NOT_EPITHET = {"spp", "sp", "cf", "var", "aff"}

# Herkunftsrang: je kleiner, desto verlässlicher zeigt das Bild die Art
SRC_LEAD_EN, SRC_LEAD_DE, SRC_SEARCH_FREE, SRC_SEARCH, SRC_GENUS = 0, 1, 2, 3, 4


# --------------------------------------------------------------------------- HTTP
class Client:
    def __init__(self, user_agent: str, delay: float):
        self.ua = user_agent
        self.delay = delay

    def api(self, endpoint: str, params: dict) -> dict:
        params = {**params, "action": "query", "format": "json", "formatversion": "2", "maxlag": "5"}
        url = endpoint + "?" + urllib.parse.urlencode(params)
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": self.ua})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.load(resp)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                wait = 2 ** attempt
                print(f"    ! {exc} – neuer Versuch in {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            if data.get("error", {}).get("code") == "maxlag":
                time.sleep(5)
                continue
            time.sleep(self.delay)
            return data
        raise RuntimeError(f"API nicht erreichbar: {url}")

    def download(self, url: str, target: pathlib.Path) -> None:
        req = urllib.request.Request(url, headers={"User-Agent": self.ua})
        with urllib.request.urlopen(req, timeout=60) as resp:
            target.write_bytes(resp.read())
        time.sleep(self.delay)


# ------------------------------------------------------------------ Hilfsfunktionen
def strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", html.unescape(value))
    return re.sub(r"\s+", " ", text).strip()


def meta(ext: dict, key: str) -> str:
    return strip_html((ext.get(key) or {}).get("value"))


def first_href(raw_html: str | None) -> str:
    match = HREF.search(raw_html or "")
    if not match:
        return ""
    url = match.group(1) or match.group(2)
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/wiki/"):
        return "https://commons.wikimedia.org" + url
    return url


def norm_file(name: str) -> str:
    name = name.removeprefix("File:").removeprefix("Datei:").replace("_", " ").strip()
    return name[:1].upper() + name[1:]


def title_candidates(species: dict, override: dict) -> tuple[list[str], str]:
    """Liefert Artikeltitel-Kandidaten und einen Gattungsnamen als letzten Ausweg."""
    titles: list[str] = list(override.get("titles", []))
    main_part, _, rest = species["scientificName"].partition(" (")
    parts = [main_part]
    inner = rest.rstrip(")")
    if re.fullmatch(r"[A-Z][a-z]+ [a-z]{3,}", inner):  # z. B. "(Clea helena)"
        parts.append(inner)
    for part in parts:
        for genus, epithet in BINOMIAL.findall(part):
            if epithet not in NOT_EPITHET:
                titles.append(f"{genus} {epithet}")
    titles += SYNONYM.findall(species.get("description", ""))
    seen, unique = set(), []
    for t in titles:
        if t.lower() not in seen:
            seen.add(t.lower())
            unique.append(t)
    return unique, species["scientificName"].split()[0]


# ------------------------------------------------------------------ Lizenzprüfung
def classify_license(ext: dict) -> tuple[dict | None, str]:
    """Ordnet die Lizenz einer Stufe zu oder liefert (None, Ablehnungsgrund)."""
    code = meta(ext, "License").lower()
    short = meta(ext, "LicenseShortName")
    if NC_ND.search(code) or NC_ND.search(short):
        return None, f"NC/ND nicht erlaubt: {short or code}"
    url = meta(ext, "LicenseUrl")
    if CC0.match(code) or short.upper().startswith("CC0"):
        tier, label = "public-domain", "CC0 1.0"
        url = url or "https://creativecommons.org/publicdomain/zero/1.0/"
    elif PUBLIC_DOMAIN.match(code) or PUBLIC_DOMAIN.match(short):
        tier, label = "public-domain", "Public Domain (gemeinfrei)"
    elif CC_CODE.match(code) or CC_SHORT.match(short):
        share_alike = "-sa" in code or "BY-SA" in short.upper()
        tier = "cc-by-sa" if share_alike else "cc-by"
        label = short or code.upper()
        m = CC_CODE.match(code)
        if not url and m:
            kind = "by-sa" if share_alike else "by"
            url = f"https://creativecommons.org/licenses/{kind}/{m.group(2)}/" + (f"{m.group(3)}/" if m.group(3) else "")
    else:
        return None, f"weder gemeinfrei noch CC BY/BY-SA: {short or code or '–'}"
    if tier == "cc-by-sa" and ARGS.no_sharealike:
        return None, f"CC BY-SA per --no-sharealike ausgeschlossen: {short}"
    return {
        "license": label,
        "licenseCode": code or short.lower(),
        "licenseUrl": url,
        "licenseTier": tier,
        "shareAlike": tier == "cc-by-sa",
        "usage": {"redistribution": True, "appUse": True, "commercialUse": True},
    }, "ok"


def check_public_domain(client: Client, filename: str) -> tuple[str | None, str, bool]:
    """Prüft die PD-Vorlage der Datei. Rückgabe: (Vorlage, Grund, braucht_Review)."""
    data = client.api(COMMONS_API, {
        "titles": f"File:{filename}", "prop": "templates", "tlnamespace": "10", "tllimit": "500",
    })
    pages = data.get("query", {}).get("pages", [])
    templates = [t["title"] for t in (pages[0].get("templates", []) if pages else [])]
    pd_templates = [t for t in templates if re.match(r"^Template:(PD-|Cc-zero|CC-zero)", t, re.I)]
    if any(PD_US_ONLY.match(t) for t in pd_templates) and not any(PD_WORLDWIDE.match(t) for t in pd_templates):
        return None, "gemeinfrei nur in den USA", False
    good = [t for t in pd_templates if PD_WORLDWIDE.match(t)]
    if good:
        return good[0].removeprefix("Template:"), "ok", False
    if pd_templates:
        return pd_templates[0].removeprefix("Template:"), "PD-Grundlage ungewöhnlich – bitte prüfen", True
    return "unbekannt", "keine PD-Vorlage erkennbar – bitte prüfen", True


def evaluate_batch(client: Client, files: list[str], width: int | None = None) -> dict[str, tuple[dict | None, str]]:
    """Prüft bis zu 50 Dateien je Anfrage auf Format, Größe, Lizenz und Urheber."""
    results: dict[str, tuple[dict | None, str]] = {}
    pending = []
    for f in files:
        name = norm_file(f)
        if BAD_FILENAME.search(name):
            results[name] = (None, "Dateiname deutet auf Karte/Zeichnung")
        else:
            pending.append(name)
    for i in range(0, len(pending), 50):
        chunk = pending[i:i + 50]
        data = client.api(COMMONS_API, {
            "titles": "|".join(f"File:{n}" for n in chunk),
            "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": str(width or ARGS.width),
        })
        pages = {norm_file(p["title"]): p for p in data.get("query", {}).get("pages", [])}
        for name in chunk:
            results[name] = evaluate_page(client, name, pages.get(name))
    return results


def evaluate_page(client: Client, name: str, page: dict | None) -> tuple[dict | None, str]:
    if not page or page.get("missing") or not page.get("imageinfo"):
        return None, "nicht auf Commons (evtl. nicht frei)"
    info = page["imageinfo"][0]
    if info.get("mime") not in ALLOWED_MIME:
        return None, f"Format {info.get('mime')}"
    if info.get("width", 0) < MIN_WIDTH:
        return None, f"zu klein ({info.get('width')} px)"
    ext = info.get("extmetadata", {})
    lic, reason = classify_license(ext)
    if not lic:
        return None, reason
    artist_raw = (ext.get("Artist") or {}).get("value", "")
    author = strip_html(artist_raw)
    if not author or UNKNOWN_AUTHOR.match(author):
        return None, f"Urheber nicht angegeben ({author or '–'})"
    credit_raw = (ext.get("Credit") or {}).get("value", "")
    record = {
        "file": f"File:{name}",
        "title": meta(ext, "ObjectName") or pathlib.Path(name).stem,
        "author": author,
        "authorUrl": first_href(artist_raw),
        "requiredAttribution": meta(ext, "Attribution"),
        "source": "Wikimedia Commons",
        "sourceUrl": info.get("descriptionurl"),
        "originalSource": strip_html(credit_raw),
        "originalSourceUrl": first_href(credit_raw),
        **lic,
        "imageUrl": info.get("url"),
        "thumbUrl": info.get("thumburl"),
        "width": info.get("width"),
        "height": info.get("height"),
        "restrictions": meta(ext, "Restrictions"),
        "needsReview": [],
    }
    if lic["licenseTier"] == "public-domain" and not lic["licenseCode"].startswith(("cc0", "cc-zero")):
        template, why, review = check_public_domain(client, name)
        if template is None:
            return None, why
        record["publicDomainBasis"] = template
        if review:
            record["needsReview"].append(why)
    if record["restrictions"]:
        record["needsReview"].append(f"Einschränkung: {record['restrictions']}")
    return record, "ok"


# ------------------------------------------------------------------ Kandidatensuche
def lead_images(client: Client, titles: list[str], log: list[str]) -> list[tuple[str, str, int]]:
    found = []
    for lang, rank in (("en", SRC_LEAD_EN), ("de", SRC_LEAD_DE)):
        for title in titles:
            data = client.api(WIKI_API[lang], {
                "titles": title, "redirects": "1", "prop": "pageimages|pageprops", "piprop": "name",
            })
            pages = data.get("query", {}).get("pages", [])
            if not pages or pages[0].get("missing"):
                continue
            page = pages[0]
            if "disambiguation" in page.get("pageprops", {}):
                log.append(f"{lang}:{title} ist Begriffsklärung")
                continue
            if page.get("pageimage"):
                found.append((page["pageimage"], f"Wikipedia {lang}: {page['title']}", rank))
                break  # pro Sprache reicht das Leitbild des ersten passenden Artikels
            log.append(f"{lang}:{page['title']} ohne Leitbild")
    return found


def commons_search(client: Client, query: str, extra: str, limit: int,
                   must_contain: str | None, rank: int, via: str) -> list[tuple[str, str, int]]:
    data = client.api(COMMONS_API, {
        "list": "search", "srnamespace": "6", "srlimit": str(limit),
        "srsearch": f"{query} {extra} filetype:bitmap".strip(),
    })
    hits = []
    for hit in data.get("query", {}).get("search", []):
        if must_contain and must_contain.lower() not in hit["title"].lower():
            continue
        hits.append((hit["title"], via, rank))
    return hits


def gather_candidates(client: Client, species: dict, override: dict, log: list[str],
                      query: str | None = None) -> dict[str, tuple[str, int]]:
    """Sammelt Kandidaten (Dateiname → (Herkunft, Rang)). Mit query nur eine freie Commons-Suche."""
    titles, genus = title_candidates(species, override)
    if query:
        candidates = commons_search(client, query, SEARCH_PUBLIC_DOMAIN, 10, None, SRC_SEARCH_FREE, f"Suche „{query}“ (gemeinfrei)")
        candidates += commons_search(client, query, SEARCH_CC0, 10, None, SRC_SEARCH_FREE, f"Suche „{query}“ (CC0)")
        candidates += commons_search(client, query, "", 30, None, SRC_SEARCH, f"Suche „{query}“")
    else:
        binomials = [t for t in titles if re.fullmatch(r"[A-Z][a-z]+ [a-z]{3,}", t)]
        search = override.get("commonsSearch") or (binomials[0] if binomials else genus)
        must = None if override.get("commonsSearch") else search.split()[0]
        candidates = lead_images(client, titles, log)
        candidates += commons_search(client, search, SEARCH_PUBLIC_DOMAIN, 10, must, SRC_SEARCH_FREE, "Commons-Suche (gemeinfrei)")
        candidates += commons_search(client, search, SEARCH_CC0, 10, must, SRC_SEARCH_FREE, "Commons-Suche (CC0)")
        candidates += commons_search(client, search, "", 25, must, SRC_SEARCH, "Commons-Suche")
        if not candidates and genus not in titles:
            candidates = [(f, v + " (nur Gattung)", SRC_GENUS) for f, v, _ in lead_images(client, [genus], log)]
    best: dict[str, tuple[str, int]] = {}
    for f, via, rank in candidates:
        key = norm_file(f)
        if key not in best or rank < best[key][1]:
            best[key] = (via, rank)
    return best


def assess_candidates(client: Client, best: dict[str, tuple[str, int]], width: int | None = None):
    """Prüft alle Kandidaten. Rückgabe: (zugelassene, sortiert nach Lizenz/Herkunft/Größe; abgelehnte)."""
    accepted, rejected = [], []
    if not best:
        return accepted, rejected
    for name, (record, reason) in evaluate_batch(client, list(best), width).items():
        via, rank = best[name]
        if record and rank >= SRC_SEARCH_FREE and record["width"] < MIN_WIDTH_SEARCH:
            record, reason = None, f"Suchtreffer zu klein ({record['width']} px)"
        if record:
            accepted.append({"sort": (TIERS[record["licenseTier"]], rank, -record["width"]),
                             "name": name, "via": via, "rank": rank, "record": record})
        else:
            rejected.append({"name": name, "via": via, "reason": reason})
    accepted.sort(key=lambda a: a["sort"])
    return accepted, rejected


def finish_record(record: dict, via: str, rank: int, override: dict, log: list[str]) -> dict:
    reasons = list(record.pop("needsReview", []))
    if rank >= SRC_SEARCH_FREE:
        reasons.append("aus Commons-Suche, Art bitte bestätigen")
    if override.get("review"):
        reasons.append("laut overrides.json immer prüfen")
    return {**record, "status": "review" if reasons else "ok", "matchedVia": via,
            "reviewReasons": reasons, "log": log}


def resolve(client: Client, species: dict, override: dict) -> dict:
    log: list[str] = []
    if override.get("file"):
        record, reason = next(iter(evaluate_batch(client, [override["file"]]).values()))
        if record:
            record.pop("needsReview", None)
            return {**record, "status": "manual", "matchedVia": "overrides.json (Datei)", "log": log}
        log.append(f"Override-Datei abgelehnt: {reason}")

    best = gather_candidates(client, species, override, log)
    excluded = {norm_file(f) for f in override.get("exclude", [])}
    for key in sorted(excluded & set(best)):
        log.append(f"{key}: per exclude ausgeschlossen")
        del best[key]
    accepted, rejected = assess_candidates(client, best)
    log += [f"{r['name']}: {r['reason']}" for r in rejected]
    if not accepted:
        return {"status": "missing", "matchedVia": "", "log": log}
    top = accepted[0]
    weaker = [a for a in accepted[1:] if a["sort"][0] > top["sort"][0]]
    if weaker:
        log.append(f"{len(weaker)} weitere Treffer mit schwächerer Lizenz übergangen")
    return finish_record(top["record"], top["via"], top["rank"], override, log)


# ------------------------------------------------------------------ Ausgabe
def add_attribution(entry: dict, modified: bool) -> None:
    """Namensnennung nach TASL (Titel, Urheber, Quelle, Lizenz) als Text und HTML."""
    who = entry["requiredAttribution"] or entry["author"]
    changes = f"verkleinert auf {ARGS.width} px Breite" if modified else ""
    entry["modifications"] = changes
    lic_text = entry["license"] + (f" ({entry['licenseUrl']})" if entry["licenseUrl"] else "")
    if entry.get("publicDomainBasis") and entry["licenseTier"] == "public-domain" and "CC0" not in entry["license"]:
        lic_text += f", Grundlage: {entry['publicDomainBasis']}"
    entry["attribution"] = (
        f"„{entry['title']}“ von {who}, Quelle: {entry['source']} ({entry['sourceUrl']}), "
        f"Lizenz: {lic_text}" + (f"; {changes}" if changes else "")
    )
    author_html = html.escape(who)
    if entry["authorUrl"] and not entry["requiredAttribution"]:
        author_html = f'<a href="{html.escape(entry["authorUrl"])}">{author_html}</a>'
    lic_html = html.escape(entry["license"])
    if entry["licenseUrl"]:
        lic_html = f'<a href="{html.escape(entry["licenseUrl"])}">{lic_html}</a>'
    entry["attributionHtml"] = (
        f'<a href="{html.escape(entry["sourceUrl"])}">„{html.escape(entry["title"])}“</a> von {author_html}, '
        f'Quelle: {entry["source"]}, Lizenz: {lic_html}' + (f"; {html.escape(changes)}" if changes else "")
    )


def build_entry(client: Client, out: pathlib.Path, sp: dict, res: dict, override: dict) -> dict:
    """Ergänzt ein Suchergebnis um Artdaten, lädt das Vorschaubild und erzeugt die Namensnennung."""
    if not res.get("restrictions"):
        res.pop("restrictions", None)
    res.pop("needsReview", None)
    entry = {"id": sp["id"], "name": sp["name"], "scientificName": sp["scientificName"],
             "collections": sp["collections"], **res}
    if override.get("note"):
        entry["note"] = override["note"]
    for stale in (out / "images").glob(f"{sp['id']}.*"):
        stale.unlink()  # altes Bild entfernen, falls sich die Auswahl geändert hat oder nichts mehr passt
    if ARGS.download and entry.get("thumbUrl"):
        suffix = pathlib.Path(urllib.parse.urlparse(entry["thumbUrl"]).path).suffix.lower() or ".jpg"
        target = out / "images" / f"{sp['id']}{suffix}"
        try:
            client.download(entry["thumbUrl"], target)
            entry["localPath"] = f"images/{target.name}"
        except (urllib.error.URLError, TimeoutError) as exc:
            entry["log"].append(f"Download fehlgeschlagen: {exc}")
    if entry.get("file"):
        add_attribution(entry, modified=bool(entry.get("localPath")))
    return entry


def atomic_write(path: pathlib.Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def load_species(data_dir: pathlib.Path) -> list[dict]:
    by_id: dict[str, dict] = {}
    for path in sorted(data_dir.glob("*.json")):
        collection = json.loads(path.read_text(encoding="utf-8"))
        for sp in collection["species"]:
            entry = by_id.setdefault(sp["id"], {**sp, "collections": []})
            entry["collections"].append(collection["id"])
    return list(by_id.values())


def write_outputs(out: pathlib.Path, results: list[dict]) -> None:
    payload = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "Wikipedia/Wikimedia Commons",
        "licensePolicy": "Rangfolge: gemeinfrei/CC0 > CC BY > CC BY-SA"
                         + (" (BY-SA ausgeschlossen)" if ARGS.no_sharealike else "")
                         + "; nur Lizenzen mit Weiterverbreitung, App-Nutzung und kommerzieller Nutzung",
        "count": len(results),
        "images": results,
    }
    atomic_write(out / "images.json", json.dumps(payload, ensure_ascii=False, indent=2))

    with (out / "attribution.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh, delimiter=";")
        writer.writerow(["id", "name", "scientificName", "status", "licenseTier", "license", "author",
                         "sourceUrl", "attribution", "reviewReasons", "log"])
        for r in results:
            writer.writerow([r["id"], r["name"], r["scientificName"], r["status"], r.get("licenseTier", ""),
                             r.get("license", ""), r.get("author", ""), r.get("sourceUrl", ""),
                             r.get("attribution", ""), " | ".join(r.get("reviewReasons", [])),
                             " | ".join(r.get("log", []))])

    atomic_write(out / "review.html", render_review(results, payload["generated"]))


STATUS_LABEL = {"ok": "Passt", "manual": "Manuell gesetzt", "review": "Prüfen", "missing": "Fehlt"}
STATUS_COLOR = {"ok": "var(--ok)", "manual": "var(--manual)", "review": "var(--review)", "missing": "var(--missing)"}
TIER_BADGE = {"public-domain": "Gemeinfrei / CC0", "cc-by": "CC BY",
              "cc-by-sa": "CC BY-SA, Weitergabe unter gleichen Bedingungen"}


def render_card(d: dict, interactive: bool = False) -> str:
    """Eine Karte als HTML. Statisch auch ohne JavaScript; interaktiv mit Knöpfen für den Review-Server."""
    e = lambda v: html.escape(str(v if v is not None else ""), quote=True)
    link = lambda url, text: f'<a href="{e(url)}" target="_blank" rel="noopener">{text}</a>' if url else text
    src = d.get("localPath") or d.get("thumbUrl")
    if src:
        img = f'<a class="img" href="{e(d.get("imageUrl") or src)}" target="_blank" rel="noopener">' \
              f'<img loading="lazy" src="{e(src)}" alt="{e(d["name"])}"></a>'
    else:
        img = '<div class="img"><div class="empty">Kein gemeinfreies oder CC-Bild mit Urheberangabe gefunden. ' \
              'Datei in overrides.json eintragen.</div></div>'
    credit = ""
    if d.get("file"):
        who = d.get("requiredAttribution") or d.get("author")
        who_html = e(who) if d.get("requiredAttribution") else link(d.get("authorUrl"), e(who))
        lic = link(d.get("licenseUrl"), e(d.get("license")))
        if d.get("publicDomainBasis") and not str(d.get("license", "")).startswith("CC0"):
            lic += f", {e(d['publicDomainBasis'])}"
        orig = f", {e(d['originalSource'])}" if d.get("originalSource") else ""
        tier = d.get("licenseTier", "")
        credit = (f'<div class="credit"><span class="tier tier-{e(tier)}">{e(TIER_BADGE.get(tier, ""))}</span><br>'
                  f'Foto: {who_html}<br>Quelle: {link(d.get("sourceUrl"), e(d.get("source")))}{orig}<br>'
                  f'Lizenz: {lic}</div>{e(d.get("matchedVia"))}')
    reasons = d.get("reviewReasons") or []
    why = f'<div class="why">{"<br>".join(e(r) for r in reasons)}</div>' if reasons else ""
    log = d.get("log") or []
    log_html = f'<details><summary>Suchprotokoll</summary>{"<br>".join(e(x) for x in log)}</details>' if log else ""
    note = f"<br>{e(d['note'])}" if d.get("note") else ""
    actions = ""
    if interactive:
        sid = e(d["id"])
        buttons = [f'<button type="button" class="primary" data-action="alternatives" data-id="{sid}">Alternativen</button>']
        if d.get("file"):
            buttons.append(f'<button type="button" data-action="reject" data-id="{sid}">Neues Bild</button>')
            if d.get("status") != "manual":
                buttons.append(f'<button type="button" data-action="confirm" data-id="{sid}">Passt</button>')
        actions = f'<div class="actions">{"".join(buttons)}</div>'
    search = " ".join([d["id"], d["name"], d["scientificName"]]).lower()
    status = d.get("status", "missing")
    return (f'<figure style="--status:{STATUS_COLOR.get(status, "var(--muted)")}" data-id="{e(d["id"])}" data-status="{e(status)}" '
            f'data-tier="{e(d.get("licenseTier", ""))}" data-collections="{e(" ".join(d.get("collections", [])))}" '
            f'data-search="{e(search)}">{img}<figcaption>'
            f'<div class="name">{e(d["name"])}</div><div class="sci">{e(d["scientificName"])}</div>'
            f'<div class="meta"><span class="status">{STATUS_LABEL.get(status, status)}</span>, {e(d["id"])}{note}'
            f'<br>{credit}{why}</div>{actions}{log_html}</figcaption></figure>')


def render_review(results: list[dict], generated: str, interactive: bool = False) -> str:
    root = pathlib.Path(__file__).parent / "templates"
    template = (root / "review.html").read_text(encoding="utf-8")
    filters = "".join(
        f'<button type="button" data-status="{s}" aria-pressed="true">'
        f'<span class="dot" style="background:{STATUS_COLOR[s]}"></span>{label} '
        f'(<span class="n">{sum(r.get("status") == s for r in results)}</span>)</button>'
        for s, label in STATUS_LABEL.items())
    collections = sorted({c for r in results for c in r.get("collections", [])})
    server_part = (root / "review_server_part.html").read_text(encoding="utf-8") if interactive else ""
    return (template
            .replace("{{FILTERS}}", filters)
            .replace("{{COLLECTIONS}}", "".join(f'<option value="{html.escape(c)}">{html.escape(c)}</option>' for c in collections))
            .replace("{{TOTAL}}", str(len(results)))
            .replace("{{GENERATED}}", html.escape(generated))
            .replace("{{MODE}}", "Review-Server" if interactive else "statische Ansicht")
            .replace("{{SERVER}}", server_part)
            .replace("{{CARDS}}", "\n".join(render_card(r, interactive) for r in results)))


def main() -> None:
    global ARGS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data", help="Ordner mit den Arten-JSON-Dateien")
    ap.add_argument("--out", default="out", help="Ausgabeordner")
    ap.add_argument("--overrides", default="overrides.json")
    ap.add_argument("--contact", help="Kontakt (E-Mail/URL) für den User-Agent laut Wikimedia-Richtlinie (Pflicht außer bei --review-only)")
    ap.add_argument("--review-only", action="store_true", help="nur review.html und attribution.csv aus vorhandenem images.json neu erzeugen, keine Anfragen")
    ap.add_argument("--width", type=int, default=800, help="Breite der Vorschaubilder in px")
    ap.add_argument("--download", action="store_true", help="Vorschaubilder lokal speichern")
    ap.add_argument("--only", nargs="*", help="nur diese IDs verarbeiten")
    ap.add_argument("--refresh", action="store_true", help="auch bereits gefundene Bilder neu suchen")
    ap.add_argument("--reject", nargs="+", metavar="ID",
                    help="aktuelles Bild dieser Arten dauerhaft ausschließen (in overrides.json) und neu suchen")
    ap.add_argument("--no-sharealike", action="store_true", help="CC BY-SA ausschließen (nur gemeinfrei/CC0 und CC BY)")
    ap.add_argument("--serve", action="store_true", help="Review-Server starten: Bilder neu anfordern, Alternativen ansehen und auswählen")
    ap.add_argument("--host", default="127.0.0.1", help="Adresse für --serve (Standard: nur lokal)")
    ap.add_argument("--port", type=int, default=8765, help="Port für --serve")
    ap.add_argument("--delay", type=float, default=0.3, help="Pause zwischen Anfragen in s")
    ARGS = ap.parse_args()

    if ARGS.review_only:
        db = pathlib.Path(ARGS.out) / "images.json"
        if not db.exists():
            sys.exit(f"{db} fehlt – erst einen normalen Lauf starten.")
        results = json.loads(db.read_text(encoding="utf-8"))["images"]
        write_outputs(pathlib.Path(ARGS.out), results)
        print(f"Galerie neu erzeugt: {(pathlib.Path(ARGS.out) / 'review.html').resolve()} ({len(results)} Arten)")
        return
    if not ARGS.contact:
        ap.error("--contact ist erforderlich")
    if ARGS.serve:
        import review_server
        review_server.serve(ARGS)
        return

    root = pathlib.Path(__file__).parent
    out = pathlib.Path(ARGS.out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    overrides_path = root / ARGS.overrides
    overrides_raw = json.loads(overrides_path.read_text(encoding="utf-8"))

    if ARGS.reject:
        db = out / "images.json"
        current = {r["id"]: r for r in json.loads(db.read_text(encoding="utf-8"))["images"]} if db.exists() else {}
        for sid in ARGS.reject:
            entry = current.get(sid)
            if not entry or not entry.get("file"):
                print(f"{sid}: kein aktuelles Bild in {db}, nichts auszuschließen", file=sys.stderr)
                continue
            ov = overrides_raw.setdefault(sid, {})
            if ov.get("file") and norm_file(ov["file"]) == norm_file(entry["file"]):
                del ov["file"]  # fest gesetzte Datei wird verworfen
            excl = ov.setdefault("exclude", [])
            if entry["file"] not in excl:
                excl.append(entry["file"])
            print(f"{sid}: {entry['file']} wird künftig ausgeschlossen")
        atomic_write(overrides_path, json.dumps(overrides_raw, ensure_ascii=False, indent=2) + "\n")
        ARGS.only = sorted(set(ARGS.only or []) | set(ARGS.reject))
        ARGS.refresh = True

    overrides = {k: v for k, v in overrides_raw.items() if not k.startswith("_")}

    previous = {}
    if (out / "images.json").exists():
        previous = {r["id"]: r for r in json.loads((out / "images.json").read_text(encoding="utf-8"))["images"]}

    client = Client(f"AquariumImageDB/2.0 ({ARGS.contact})", ARGS.delay)
    species = load_species(pathlib.Path(ARGS.data))
    unknown = set(overrides) - {sp["id"] for sp in species}
    if unknown:
        print(f"Warnung: Overrides für unbekannte IDs: {', '.join(sorted(unknown))}", file=sys.stderr)

    results = []
    for i, sp in enumerate(species, 1):
        keep = previous.get(sp["id"])
        if keep and keep.get("file") and "licenseTier" not in keep:
            keep = None  # Eintrag aus älterer Version ohne Lizenzrangfolge → neu prüfen
        selected = not ARGS.only or sp["id"] in ARGS.only
        if keep and (not selected or (keep["status"] in ("ok", "manual") and not ARGS.refresh)):
            results.append(keep)
            continue
        if not selected:
            continue
        print(f"[{i}/{len(species)}] {sp['id']}")
        entry = build_entry(client, out, sp, resolve(client, sp, overrides.get(sp["id"], {})), overrides.get(sp["id"], {}))
        print(f"    → {entry['status']}: {entry.get('file', '–')} [{TIER_LABEL.get(entry.get('licenseTier'), '–')}]")
        results.append(entry)

    write_outputs(out, results)
    counts = {s: sum(r["status"] == s for r in results) for s in ("ok", "manual", "review", "missing")}
    tiers = {TIER_LABEL[t]: sum(r.get("licenseTier") == t for r in results) for t in TIERS}
    print(f"\nFertig: {counts}, Lizenzen: {tiers}")
    print(f"Datenbank: {(out / 'images.json').resolve()}")
    print(f"Galerie:   {(out / 'review.html').resolve()}")


ARGS: argparse.Namespace

if __name__ == "__main__":
    main()
