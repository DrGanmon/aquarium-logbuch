"""Kleiner Review-Server für die Bilddatenbank (nur Python-Standardbibliothek).

Start über build_image_db.py:
    python3 build_image_db.py --contact admin@example.org --serve

Funktionen im Browser:
  - Alternativen: alle zulässigen Kandidaten einer Art mit Lizenz, Urheber und Quelle anzeigen
  - Eigene Suche: beliebiger Suchbegriff auf Wikimedia Commons
  - Wählen: Kandidat übernehmen (wird in overrides.json als feste Datei gespeichert)
  - Neues Bild: aktuelles Bild ausschließen und das nächstbeste automatisch wählen
  - Passt: aktuelles Bild bestätigen (wird als feste Datei gespeichert)
Jede Änderung aktualisiert sofort images.json, attribution.csv, review.html und das lokale Bild.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import mimetypes
import pathlib
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import build_image_db as core

CANDIDATE_THUMB_WIDTH = 360
LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


class ReviewApp:
    """Hält den Datenbestand im Speicher und serialisiert alle Änderungen."""

    def __init__(self, args):
        self.args = args
        self.root = pathlib.Path(core.__file__).parent
        self.out = pathlib.Path(args.out)
        (self.out / "images").mkdir(parents=True, exist_ok=True)
        self.overrides_path = self.root / args.overrides
        self.overrides_raw = json.loads(self.overrides_path.read_text(encoding="utf-8"))
        self.client = core.Client(f"AquariumImageDB/2.0 ({args.contact})", args.delay)
        species = core.load_species(pathlib.Path(args.data))
        self.species = {sp["id"]: sp for sp in species}
        self.order = [sp["id"] for sp in species]
        db = self.out / "images.json"
        known = {r["id"]: r for r in json.loads(db.read_text(encoding="utf-8"))["images"]} if db.exists() else {}
        self.entries = {}
        for sid in self.order:
            sp = self.species[sid]
            self.entries[sid] = known.get(sid) or {
                "id": sid, "name": sp["name"], "scientificName": sp["scientificName"],
                "collections": sp["collections"], "status": "missing", "matchedVia": "",
                "log": ["noch nicht gesucht – über „Alternativen“ ein Bild wählen"],
            }
        self.lock = threading.Lock()

    # ---------------------------------------------------------------- Zustand
    def override(self, sid: str) -> dict:
        return self.overrides_raw.setdefault(sid, {})

    def results(self) -> list[dict]:
        return [self.entries[sid] for sid in self.order]

    def counts(self) -> dict:
        return {s: sum(r.get("status") == s for r in self.results()) for s in core.STATUS_LABEL}

    def save(self) -> None:
        clean = {k: v for k, v in self.overrides_raw.items() if k.startswith("_") or v}
        core.atomic_write(self.overrides_path, json.dumps(clean, ensure_ascii=False, indent=2) + "\n")
        core.write_outputs(self.out, self.results())

    def page(self) -> str:
        now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        return core.render_review(self.results(), now, interactive=True)

    # ---------------------------------------------------------------- Aktionen
    def candidates(self, sid: str, query: str | None) -> str:
        sp = self.species[sid]
        log: list[str] = []
        with self.lock:
            best = core.gather_candidates(self.client, sp, self.override(sid), log, query=query)
            accepted, rejected = core.assess_candidates(self.client, best, CANDIDATE_THUMB_WIDTH)
        return render_candidates(self.entries[sid], self.override(sid), accepted, rejected, query)

    def select(self, sid: str, file: str) -> dict:
        with self.lock:
            record, reason = next(iter(core.evaluate_batch(self.client, [file]).values()))
            if not record:
                raise ValueError(f"Bild nicht zulässig: {reason}")
            ov = self.override(sid)
            ov["file"] = record["file"]
            name = core.norm_file(record["file"])
            ov["exclude"] = [f for f in ov.get("exclude", []) if core.norm_file(f) != name]
            if not ov["exclude"]:
                del ov["exclude"]
            reasons = list(record.pop("needsReview", []))
            res = {**record, "status": "manual", "matchedVia": "im Review gewählt",
                   "reviewReasons": reasons, "log": []}
            entry = core.build_entry(self.client, self.out, self.species[sid], res, ov)
            self.entries[sid] = entry
            self.save()
            return entry

    def reject(self, sid: str) -> dict:
        with self.lock:
            current = self.entries[sid]
            if not current.get("file"):
                raise ValueError("Diese Art hat kein Bild, das verworfen werden könnte.")
            ov = self.override(sid)
            if ov.get("file") and core.norm_file(ov["file"]) == core.norm_file(current["file"]):
                del ov["file"]
            excl = ov.setdefault("exclude", [])
            if current["file"] not in excl:
                excl.append(current["file"])
            res = core.resolve(self.client, self.species[sid], ov)
            entry = core.build_entry(self.client, self.out, self.species[sid], res, ov)
            self.entries[sid] = entry
            self.save()
            return entry

    def confirm(self, sid: str) -> dict:
        with self.lock:
            entry = self.entries[sid]
            if not entry.get("file"):
                raise ValueError("Diese Art hat kein Bild zum Bestätigen.")
            self.override(sid)["file"] = entry["file"]
            entry["status"] = "manual"
            entry["matchedVia"] = f"{entry.get('matchedVia', '')} (im Review bestätigt)".strip()
            self.save()
            return entry


# -------------------------------------------------------------------- HTML-Fragment
def render_candidates(entry: dict, override: dict, accepted: list[dict], rejected: list[dict],
                      query: str | None) -> str:
    current = core.norm_file(entry.get("file", "")) if entry.get("file") else None
    excluded = {core.norm_file(f) for f in override.get("exclude", [])}
    sid = esc(entry["id"])
    scope = f" für „{esc(query)}“" if query else ""
    intro = (f"<p>{len(accepted)} zulässige Bilder{scope}, sortiert nach Lizenz (gemeinfrei zuerst), "
             f"dann Herkunft und Auflösung. Zulässig heißt: gemeinfrei, CC0, CC BY oder CC BY-SA mit benanntem Urheber.</p>")
    if not accepted:
        intro += "<p>Keine zulässigen Bilder gefunden. Probiere oben eine eigene Suche, z. B. mit dem englischen Namen.</p>"

    items = []
    for a in accepted:
        r = a["record"]
        name = a["name"]
        is_current, is_excluded = name == current, name in excluded
        cls = "cand" + (" current" if is_current else "") + (" excluded" if is_excluded else "")
        who = esc(r.get("requiredAttribution") or r["author"])
        if r.get("authorUrl") and not r.get("requiredAttribution"):
            who = f'<a href="{esc(r["authorUrl"])}" target="_blank" rel="noopener">{who}</a>'
        lic = esc(r["license"])
        if r.get("licenseUrl"):
            lic = f'<a href="{esc(r["licenseUrl"])}" target="_blank" rel="noopener">{lic}</a>'
        if r.get("publicDomainBasis") and not r["license"].startswith("CC0"):
            lic += f", {esc(r['publicDomainBasis'])}"
        orig = f"<br>Ursprung: {esc(r['originalSource'])}" if r.get("originalSource") else ""
        warn = "".join(f'<div class="why">{esc(w)}</div>' for w in r.get("needsReview", []))
        if is_current:
            action = '<span class="flag">Aktuell gewählt</span>'
        else:
            label = "Trotzdem wählen" if is_excluded else "Dieses Bild wählen"
            action = (f'<button type="button" class="primary" data-action="select" data-id="{sid}" '
                      f'data-file="{esc(r["file"])}">{label}</button>')
        excl_note = '<span class="flag excl">Ausgeschlossen</span>' if is_excluded else ""
        items.append(
            f'<div class="{cls}">'
            f'<a class="img" href="{esc(r["sourceUrl"])}" target="_blank" rel="noopener" title="Dateiseite auf Commons öffnen">'
            f'<img loading="lazy" src="{esc(r["thumbUrl"])}" alt="{esc(r["title"])}"></a>'
            f'<div class="body"><span class="tier tier-{esc(r["licenseTier"])}">{esc(core.TIER_BADGE[r["licenseTier"]])}</span>'
            f'<span class="title">{esc(r["title"])}</span>'
            f'<div>Foto: {who}<br>Lizenz: {lic}<br>Quelle: <a href="{esc(r["sourceUrl"])}" target="_blank" rel="noopener">'
            f'{esc(r["source"])}</a>{orig}</div>'
            f'<div class="muted">{esc(a["via"])}, {r["width"]}×{r["height"]} px</div>{warn}{excl_note}{action}</div></div>'
        )

    rej = ""
    if rejected:
        lines = "".join(f"<li>{esc(x['name'])}: {esc(x['reason'])}</li>" for x in sorted(rejected, key=lambda x: x["name"]))
        rej = (f'<details class="rejected"><summary>{len(rejected)} Kandidaten abgelehnt '
               f'(Lizenz, Urheber, Format oder Größe)</summary><ul>{lines}</ul></details>')
    return f'{intro}<div class="cands">{"".join(items)}</div>{rej}'


# -------------------------------------------------------------------- HTTP
def make_handler(app: ReviewApp, host: str, port: int):
    allowed_hosts = {f"{h}:{port}" for h in LOOPBACK} | {f"[::1]:{port}"}
    check_host = host in LOOPBACK

    class Handler(BaseHTTPRequestHandler):
        server_version = "AquariumReview/1.0"

        def _send(self, code: int, body: str | bytes, ctype: str) -> None:
            data = body.encode("utf-8") if isinstance(body, str) else body
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _json(self, code: int, payload: dict) -> None:
            self._send(code, json.dumps(payload, ensure_ascii=False), "application/json; charset=utf-8")

        def _guard(self) -> bool:
            """Schutz gegen Anfragen fremder Webseiten (DNS-Rebinding, Cross-Site-POST)."""
            if check_host and self.headers.get("Host", "") not in allowed_hosts:
                self._send(403, "Unbekannter Host", "text/plain; charset=utf-8")
                return False
            return True

        def do_GET(self):
            if not self._guard():
                return
            url = urllib.parse.urlparse(self.path)
            if url.path in ("/", "/index.html"):
                with app.lock:
                    page = app.page()
                return self._send(200, page, "text/html; charset=utf-8")
            if url.path.startswith("/images/"):
                return self._image(urllib.parse.unquote(url.path[len("/images/"):]))
            if url.path == "/api/candidates":
                if self.headers.get("X-Review") != "1":
                    return self._send(403, "Fehlender Header", "text/plain; charset=utf-8")
                qs = urllib.parse.parse_qs(url.query)
                sid = qs.get("id", [""])[0]
                query = qs.get("q", [""])[0].strip() or None
                if sid not in app.species:
                    return self._send(404, "Unbekannte Art", "text/plain; charset=utf-8")
                try:
                    return self._send(200, app.candidates(sid, query), "text/html; charset=utf-8")
                except Exception as exc:  # Netzwerk- oder API-Fehler an den Browser melden
                    return self._send(502, f"Suche fehlgeschlagen: {exc}", "text/plain; charset=utf-8")
            self._send(404, "Nicht gefunden", "text/plain; charset=utf-8")

        def _image(self, name: str) -> None:
            base = (app.out / "images").resolve()
            path = (base / name).resolve()
            if path.parent != base or not path.is_file():
                return self._send(404, "Bild nicht gefunden", "text/plain; charset=utf-8")
            ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            self._send(200, path.read_bytes(), ctype)

        def do_POST(self):
            if not self._guard():
                return
            if self.headers.get("X-Review") != "1" or "application/json" not in self.headers.get("Content-Type", ""):
                return self._json(403, {"error": "Anfrage abgelehnt"})
            length = int(self.headers.get("Content-Length") or 0)
            if length > 10_000:
                return self._json(413, {"error": "Anfrage zu groß"})
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                return self._json(400, {"error": "Ungültiges JSON"})
            sid = body.get("id")
            if sid not in app.species:
                return self._json(404, {"error": "Unbekannte Art"})
            action = urllib.parse.urlparse(self.path).path
            try:
                if action == "/api/select" and body.get("file"):
                    entry = app.select(sid, body["file"])
                elif action == "/api/reject":
                    entry = app.reject(sid)
                elif action == "/api/confirm":
                    entry = app.confirm(sid)
                else:
                    return self._json(404, {"error": "Unbekannte Aktion"})
            except ValueError as exc:
                return self._json(400, {"error": str(exc)})
            except Exception as exc:
                return self._json(502, {"error": f"Fehler bei Wikimedia oder beim Speichern: {exc}"})
            print(f"  {action.removeprefix('/api/')}: {sid} → {entry.get('status')} {entry.get('file', '')}")
            with app.lock:
                counts = app.counts()
            self._json(200, {"card": core.render_card(entry, interactive=True), "counts": counts})

        def log_message(self, fmt, *args):  # nur Fehler ausgeben, keine Zugriffszeilen
            if args and str(args[1]).startswith(("4", "5")):
                sys.stderr.write(f"  HTTP {args[1]}: {self.path}\n")

    return Handler


def serve(args) -> None:
    args.download = True  # gewählte Bilder immer lokal speichern
    core.ARGS = args      # beim Start als Skript ist build_image_db ein zweites Modulobjekt
    app = ReviewApp(args)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(app, args.host, args.port))
    shown = "localhost" if args.host in LOOPBACK else args.host
    print(f"Review-Server läuft: http://{shown}:{args.port}/  (beenden mit Strg+C)")
    if args.host not in LOOPBACK:
        print("Achtung: Der Server ist ohne Anmeldung im Netz erreichbar. Besser per SSH-Tunnel nutzen.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")
    finally:
        server.server_close()
