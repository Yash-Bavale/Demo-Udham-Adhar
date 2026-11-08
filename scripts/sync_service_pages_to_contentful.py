#!/usr/bin/env python3
"""One-off sync: push the 132 legacy "service" format SEO pages from the
seo_pages table into Contentful space 1 as published `seoArticle` entries.

Content comes from src/content/wp/<slug>.html when available; otherwise a
minimal overview entry is created so it can be edited in Contentful.

Existing entries (matched by slug) are never overwritten.
FAQ content is intentionally NOT added.

Usage: python3 scripts/sync_service_pages_to_contentful.py [--dry]
"""
import json, os, re, subprocess, sys, time, urllib.request, urllib.error
from html.parser import HTMLParser

SPACE = os.environ["CONTENTFUL_SPACE_ID"]
CMA = os.environ["CONTENTFUL_CMA_TOKEN"]
BASE = "https://api.contentful.com/spaces/%s/environments/master" % SPACE
BASE_URL = "https://udyamadhar.in"
DRY = "--dry" in sys.argv
TODAY = time.strftime("%Y-%m-%d")

SKIP_HEADINGS = re.compile(r"faq|frequently asked|sample certificate", re.I)


def req(method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Authorization", "Bearer " + CMA)
    if body is not None:
        r.add_header("Content-Type", "application/vnd.contentful.management.v1+json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError("%s %s -> %s %s" % (method, path, e.code, e.read().decode()[:400]))


# ---------------------------------------------------------------- HTML parse
class Extract(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.tag = None
        self.buf = []
        self.out = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skip += 1
        elif tag in ("h1", "h2", "h3", "h4", "p", "li"):
            self.tag = tag
            self.buf = []

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.skip = max(0, self.skip - 1)
        elif tag == self.tag:
            text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
            if text:
                self.out.append((tag, text))
            self.tag = None
            self.buf = []

    def handle_data(self, data):
        if not self.skip and self.tag:
            self.buf.append(data)


def html_to_sections(html):
    p = Extract()
    p.feed(html)
    sections, cur = [], None
    seen_headings = set()
    for kind, text in p.out:
        if kind in ("h1", "h2", "h3", "h4"):
            if SKIP_HEADINGS.search(text):
                cur = None
                continue
            key = text.lower()
            if key in seen_headings:
                cur = None
                continue
            seen_headings.add(key)
            level = 2 if kind in ("h1", "h2") else 3
            cur = {"heading": text, "level": level, "paragraphs": [], "subsections": []}
            sections.append(cur)
        else:
            if len(text) < 40:
                continue
            if "Sample Udyam Certificate" in text:
                continue
            if cur is None:
                continue
            if text not in cur["paragraphs"]:
                cur["paragraphs"].append(text)
    return [s for s in sections if s["paragraphs"]]


def rich_text(sections):
    content = []
    for s in sections:
        content.append({
            "nodeType": "heading-%d" % s["level"], "data": {},
            "content": [{"nodeType": "text", "value": s["heading"], "marks": [], "data": {}}],
        })
        for para in s["paragraphs"]:
            content.append({
                "nodeType": "paragraph", "data": {},
                "content": [{"nodeType": "text", "value": para, "marks": [], "data": {}}],
            })
    if not content:
        content = [{"nodeType": "paragraph", "data": {},
                    "content": [{"nodeType": "text", "value": "", "marks": [], "data": {}}]}]
    return {"nodeType": "document", "data": {}, "content": content}


def titleize(slug):
    return " ".join(w.upper() if w in ("msme", "pan", "gst") else w.capitalize()
                    for w in slug.split("-"))


# ------------------------------------------------------------------ sources
def db_service_pages():
    out = subprocess.run(
        ["psql", "-At", "-F", "\t", "-c",
         "select slug, label, coalesce(h1,''), coalesce(meta_title,''), "
         "coalesce(meta_description,'') from seo_pages where page_type='service' order by slug"],
        capture_output=True, text=True, check=True).stdout
    rows = []
    for line in out.strip().splitlines():
        parts = line.split("\t")
        if len(parts) < 5:
            continue
        slug, label, h1, mt, md = parts[:5]
        rows.append({"slug": slug.lstrip("/"), "label": label, "h1": h1,
                     "meta_title": mt, "meta_description": md})
    return rows


def existing_slugs():
    slugs, skip = {}, 0
    while True:
        page = req("GET", "/entries?limit=200&skip=%d" % skip)
        for it in page["items"]:
            s = (it.get("fields", {}).get("slug") or {}).get("en-US")
            if isinstance(s, str):
                slugs[s.lstrip("/")] = it["sys"]["id"]
        skip += 200
        if skip >= page["total"]:
            return slugs


def create_and_publish(slug, fields):
    payload = {"fields": {k: {"en-US": v} for k, v in fields.items()}}
    if DRY:
        print("DRY", slug, "sections:", len(fields.get("bodySections") or []))
        return
    entry = req("POST", "/entries", payload,
                {"X-Contentful-Content-Type": "seoArticle"})
    req("PUT", "/entries/%s/published" % entry["sys"]["id"], None,
        {"X-Contentful-Version": str(entry["sys"]["version"])})
    print("ok", slug, "sections:", len(fields.get("bodySections") or []))


def main():
    existing = existing_slugs()
    print("existing contentful entries with a slug:", len(existing))
    rows = db_service_pages()
    print("service pages in db:", len(rows))

    created = skipped = 0
    for row in rows:
        slug = row["slug"]
        if slug in existing:
            skipped += 1
            continue

        html_path = "src/content/wp/%s.html" % slug
        sections = []
        if os.path.exists(html_path):
            sections = html_to_sections(open(html_path).read())

        title = row["h1"] or row["label"] or titleize(slug)
        intro = sections[0]["paragraphs"][0] if sections else ""
        if not sections:
            para = ("%s: understand the eligibility, documents required, step-by-step "
                    "process, government fees and expected timelines before you apply "
                    "online." % title)
            sections = [{"heading": title, "level": 2, "paragraphs": [para],
                         "subsections": []}]
            intro = para

        meta_title = (row["meta_title"] or title)[:255]
        meta_desc = (row["meta_description"] or intro or title)[:250]

        create_and_publish(slug, {
            "title": [title],
            "slug": slug,
            "metaTitle": meta_title,
            "metaDescription": meta_desc,
            "body": rich_text(sections),
            "bodySections": sections,
            "publishedAt": TODAY,
            "canonicalUrl": "%s/%s" % (BASE_URL, slug),
            "aiOverview": {"short": intro[:300], "medium": intro},
            "quickFacts": [],
            "faqs": [],
            "internalLinks": [],
            "howto": [],
            "eeat": {"experience": "", "expertise": "", "trust": "",
                     "transparency": "", "disclaimer": ""},
            "ctas": {},
        })
        created += 1

    print("created:", created, "skipped (already in contentful):", skipped)


if __name__ == "__main__":
    main()
