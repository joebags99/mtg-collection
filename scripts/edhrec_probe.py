"""Read-only probe of EDHREC's redesigned site, to find where its data now lives.

    python scripts/edhrec_probe.py [commander-slug]

Makes ~20 GET requests (spaced out), prints a report and saves it to
edhrec_probe_output.txt in the current folder. Nothing is changed anywhere.
"""
import json
import re
import sys
import time

import requests

slug = sys.argv[1] if len(sys.argv) > 1 else "fire-lord-zuko"
session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
})
lines = []


def out(text=""):
    print(text, flush=True)
    lines.append(text)


def get(url):
    time.sleep(0.5)
    try:
        return session.get(url, timeout=20)
    except Exception as e:
        out(f"  !! request failed: {e}")
        return None


def summarize(resp):
    if resp is None:
        return
    ctype = resp.headers.get("Content-Type", "?")
    body = resp.text
    out(f"  -> HTTP {resp.status_code}, {ctype}, {len(body)} chars, final url {resp.url}")
    snippet = re.sub(r"\s+", " ", body[:400])
    out(f"  starts: {snippet}")
    if "json" in ctype:
        try:
            data = resp.json()
            if isinstance(data, dict):
                out(f"  top-level keys: {list(data)[:30]}")
                for key in ("deck", "cards", "container", "panels", "cardlists", "data", "pageProps"):
                    if key in data:
                        val = data[key]
                        desc = f"{type(val).__name__}"
                        if isinstance(val, dict):
                            desc += f" with keys {list(val)[:20]}"
                        elif isinstance(val, list):
                            desc += f" of {len(val)}; first: {json.dumps(val[0])[:200] if val else '-'}"
                        out(f"  ['{key}']: {desc}")
        except Exception as e:
            out(f"  (json parse failed: {e})")


URL_PATTERNS = [
    r"https?://[^\s\"'<>)]*edhrec[^\s\"'<>)]*",   # any edhrec URL
    r"[\"'](/api/[^\s\"'<>)]+)",                    # relative API paths
    r"[\"']([^\s\"'<>)]*\.json[^\s\"'<>)]*)",       # anything .json
]


def scan(text, label):
    found = set()
    for pat in URL_PATTERNS:
        for m in re.findall(pat, text):
            found.add(m)
    interesting = sorted(f for f in found if not re.search(r"\.(png|jpg|svg|css|woff2?|ico)(\?|$)", f))
    out(f"  {label}: buildId present: {'buildId' in text}; _next present: {'/_next/' in text}")
    out(f"  {label}: {len(interesting)} data-looking URLs:")
    for f in interesting[:60]:
        out(f"    {f}")
    return interesting


out(f"EDHREC probe for '{slug}'  ({time.strftime('%Y-%m-%d %H:%M')})")

out("\n== 1. Candidate JSON endpoints ==")
for url in [
    f"https://json.edhrec.com/pages/commanders/{slug}.json",
    f"https://json.edhrec.com/pages/average-decks/{slug}.json",
    f"https://json.edhrec.com/pages/commanders/{slug}/average-deck.json",
    f"https://edhrec.com/api/commanders/{slug}",
    f"https://edhrec.com/api/average-decks/{slug}",
    f"https://edhrec.com/commanders/{slug}/average-deck.json",
    f"https://edhrec.com/commanders/{slug}.json",
]:
    out(f"\nGET {url}")
    summarize(get(url))

out("\n== 2. The pages themselves ==")
page_urls = [f"https://edhrec.com/commanders/{slug}/average-deck", f"https://edhrec.com/commanders/{slug}"]
scripts = set()
for url in page_urls:
    out(f"\nGET {url}")
    resp = get(url)
    summarize(resp)
    if resp is not None and resp.ok:
        scan(resp.text, "page")
        for src in re.findall(r"<script[^>]+src=[\"']([^\"']+)[\"']", resp.text):
            scripts.add(src if src.startswith("http") else "https://edhrec.com" + src)

out("\n== 3. Script bundles referenced by the page (looking for API URLs inside) ==")
for src in sorted(scripts)[:15]:
    out(f"\nGET {src}")
    resp = get(src)
    if resp is None or not resp.ok:
        out(f"  -> {getattr(resp, 'status_code', 'failed')}")
        continue
    scan(resp.text, "bundle")

with open("edhrec_probe_output.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
out("\nSaved full report to edhrec_probe_output.txt")
