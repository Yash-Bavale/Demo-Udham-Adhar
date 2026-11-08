#!/usr/bin/env python3
"""One-off migration: push every hardcoded SEO page (legacy WP HTML pages and
legacy redirect slugs) into Contentful space 1 as `seoArticle` entries.

After this runs, /$ serves every SEO URL straight from Contentful and the
hardcoded route files / redirect map can be deleted.

Usage: python3 scripts/migrate_seo_to_contentful.py [--dry]
"""
import json, os, re, sys, time, urllib.request, urllib.error
from html.parser import HTMLParser

SPACE = os.environ["CONTENTFUL_SPACE_ID"]
CMA = os.environ["CONTENTFUL_CMA_TOKEN"]
BASE = "https://api.contentful.com/spaces/%s/environments/master" % SPACE
BASE_URL = "https://udyamadhar.in"
DRY = "--dry" in sys.argv
TODAY = time.strftime("%Y-%m-%d")

POLICY = {
    "disclaimer", "payment-notice", "cookie-policy",
    "payment-notice-service-acknowledgment", "consent-acknowledgment",
    "compliance-statement", "other-problem", "about", "aml-anti-fraud-policy",
    "complaint", "notice", "refund-cancellation-policy", "privacy-policy",
    "important-notice", "about-us", "pricing-transparency",
    "grievance-redressal-policy", "terms-conditions", "service-delivery-policy",
}


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Authorization", "Bearer " + CMA)
    if body is not None:
        r.add_header("Content-Type", "application/vnd.contentful.management.v1+json")
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError("%s %s -> %s %s" % (method, path, e.code, e.read().decode()[:400]))


# ---------------------------------------------------------------- HTML parse
class Extract(HTMLParser):
    """Collect headings / paragraphs / list items, skipping script+style."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.tag = None
        self.buf = []
        self.out = []  # (kind, text)

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
    for kind, text in p.out:
        if kind in ("h1", "h2", "h3", "h4"):
            level = 2 if kind in ("h1", "h2") else 3
            cur = {"heading": text, "level": level, "paragraphs": [], "subsections": []}
            sections.append(cur)
        else:
            if len(text) < 3:
                continue
            if cur is None:
                cur = {"heading": "Overview", "level": 2, "paragraphs": [], "subsections": []}
                sections.append(cur)
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


# ------------------------------------------------------------- entry upsert
def existing_slugs():
    slugs, skip = {}, 0
    while True:
        page = req("GET", "/entries?content_type=seoArticle&limit=200&skip=%d" % skip)
        for it in page["items"]:
            s = it["fields"].get("slug", {}).get("en-US")
            if s:
                slugs[s] = it["sys"]["id"]
        skip += 200
        if skip >= page["total"]:
            return slugs


def upsert(slug, fields, existing):
    payload = {"fields": {k: {"en-US": v} for k, v in fields.items()}}
    if DRY:
        print("DRY", slug)
        return
    eid = existing.get(slug)
    if eid:
        cur = req("GET", "/entries/" + eid)
        r = urllib.request.Request(BASE + "/entries/" + eid, data=json.dumps(payload).encode(), method="PUT")
        r.add_header("Authorization", "Bearer " + CMA)
        r.add_header("Content-Type", "application/vnd.contentful.management.v1+json")
        r.add_header("X-Contentful-Version", str(cur["sys"]["version"]))
        with urllib.request.urlopen(r) as resp:
            entry = json.loads(resp.read().decode())
    else:
        r = urllib.request.Request(BASE + "/entries", data=json.dumps(payload).encode(), method="POST")
        r.add_header("Authorization", "Bearer " + CMA)
        r.add_header("Content-Type", "application/vnd.contentful.management.v1+json")
        r.add_header("X-Contentful-Content-Type", "seoArticle")
        with urllib.request.urlopen(r) as resp:
            entry = json.loads(resp.read().decode())
        existing[slug] = entry["sys"]["id"]
    # publish
    r = urllib.request.Request(BASE + "/entries/%s/published" % entry["sys"]["id"], method="PUT")
    r.add_header("Authorization", "Bearer " + CMA)
    r.add_header("X-Contentful-Version", str(entry["sys"]["version"]))
    with urllib.request.urlopen(r) as resp:
        resp.read()
    print("ok", slug)


def meta_from_route(path):
    src = open(path).read()

    def grab(pattern):
        m = re.search(pattern, src)
        return m.group(1).strip() if m else ""

    return {
        "title": grab(r'\{ title: "([^"]+)" \}'),
        "description": grab(r'name: "description", content: "([^"]*)"'),
        "canonical": grab(r'rel: "canonical", href: "([^"]+)"'),
        "intro": grab(r'content=\{`([^`]*)`\}'),
        "h1": grab(r'<SeoLandingPage title="([^"]+)"'),
    }


def main():
    existing = existing_slugs()
    print("existing entries:", len(existing))

    # 1. Legacy WP HTML pages -> full entries
    wp_slugs = []
    for name in sorted(os.listdir("src/routes")):
        if not name.endswith(".tsx"):
            continue
        path = os.path.join("src/routes", name)
        src = open(path).read()
        if "content/wp/" not in src:
            continue
        slug = name[:-4]
        if slug in POLICY:
            continue
        wp_slugs.append(slug)
        meta = meta_from_route(path)
        html_file = re.search(r'@/content/wp/([\w.-]+)\.html', src).group(1)
        html = open("src/content/wp/%s.html" % html_file).read()
        sections = html_to_sections(html)
        if meta["intro"]:
            sections.insert(0, {"heading": "Overview", "level": 2,
                                "paragraphs": [meta["intro"]], "subsections": []})
        title = meta["h1"] or titleize(slug)
        upsert(slug, {
            "title": [title],
            "slug": slug,
            "metaTitle": (meta["title"] or title)[:255],
            "metaDescription": (meta["description"] or title)[:300],
            "body": rich_text(sections),
            "bodySections": sections,
            "publishedAt": TODAY,
            "canonicalUrl": meta["canonical"] or "%s/%s" % (BASE_URL, slug),
            "aiOverview": {"short": meta["intro"][:300], "medium": meta["intro"]},
            "quickFacts": [],
            "faqs": [],
            "internalLinks": [],
            "howto": [],
            "eeat": {"experience": "", "expertise": "", "trust": "",
                     "transparency": "", "disclaimer": ""},
            "ctas": {},
        }, existing)

    print("wp pages:", len(wp_slugs))

    # 2. Legacy redirect slugs -> thin entries canonicalised to their target
    redirects = {}
    for m in re.finditer(r'"([a-z0-9-]+)":\s*"(/[^"]+)"', open("src/lib/legacy-redirects.ts").read()):
        redirects[m.group(1)] = m.group(2)
    count = 0
    for slug, target in sorted(redirects.items()):
        if target.startswith("/#"):
            continue
        if slug in existing:
            continue  # already authored, don't overwrite
        title = titleize(slug)
        tgt_name = titleize(target.strip("/"))
        para = ("%s is covered in full on our %s page, which explains the process, "
                "documents, fees and timelines in detail." % (title, tgt_name))
        sections = [{"heading": title, "level": 2, "paragraphs": [para], "subsections": []}]
        upsert(slug, {
            "title": [title],
            "slug": slug,
            "metaTitle": "%s | Business Help Services" % title,
            "metaDescription": para[:300],
            "body": rich_text(sections),
            "bodySections": sections,
            "publishedAt": TODAY,
            "canonicalUrl": BASE_URL + target,
            "aiOverview": {"short": para, "medium": para},
            "quickFacts": [],
            "faqs": [],
            "internalLinks": [{"href": target, "anchor": tgt_name, "reason": "Primary page"}],
            "howto": [],
            "eeat": {"experience": "", "expertise": "", "trust": "",
                     "transparency": "", "disclaimer": ""},
            "ctas": {},
        }, existing)
        count += 1
    print("legacy slugs:", count)


if __name__ == "__main__":
    main()
