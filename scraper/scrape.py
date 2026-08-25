#!/usr/bin/env python3
"""
Recruiting portal scraper — finds FULL-TIME new-grad / rotational roles.

Design decisions (learned the hard way):
  * PAGINATE. Workday returns 20 per request. Without paging we saw only 41 of
    Capital One's 296 matching posts and missed real roles.
  * RETRY. Greenhouse/SmartRecruiters occasionally time out; one blip should not
    silently drop a company for the whole run.
  * EXCLUDE INTERNSHIPS. A December-2026 grad is ineligible for most of them.
  * ALWAYS log counts and sample titles. Silent zeros are the enemy.

Usage:
    python scraper/scrape.py            # normal run
    python scraper/scrape.py --verify   # test every target config, write nothing
"""

import json, sys, time, urllib.request, urllib.error, os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ROOT / "scraper" / "targets.json"
OUTPUT = ROOT / "live_jobs.json"
UA = "Mozilla/5.0 (compatible; recruiting-dashboard/2.0)"
TIMEOUT = 30
MAX_PAGES = 8          # 8 x 20 = up to 160 postings per keyword
RETRIES = 3


def http(url, method="GET", payload=None):
    """Request with retry + backoff. Raises only after all retries fail."""
    last = None
    for attempt in range(RETRIES):
        try:
            headers = {"User-Agent": UA, "Accept": "application/json"}
            data = None
            if payload is not None:
                data = json.dumps(payload).encode()
                headers["Content-Type"] = "application/json"
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:
            last = e
            if attempt < RETRIES - 1:
                time.sleep(1.5 * (attempt + 1))
    raise last


# ---------- PROVIDERS ----------

def fetch_workday(t):
    url = f"https://{t['tenant']}.{t['wd']}.myworkdayjobs.com/wday/cxs/{t['tenant']}/{t['siteId']}/jobs"
    base = f"https://{t['tenant']}.{t['wd']}.myworkdayjobs.com/en-US/{t['siteId']}"
    out, seen = [], set()
    for kw in t.get("keywords", [""]):
        total = None
        for page in range(MAX_PAGES):
            offset = page * 20
            try:
                d = http(url, "POST", {"appliedFacets": {}, "limit": 20,
                                       "offset": offset, "searchText": kw})
            except Exception as e:
                print(f"      ! '{kw}' p{page}: {type(e).__name__}")
                break
            if total is None:
                total = d.get("total", 0)
            posts = d.get("jobPostings", [])
            if not posts:
                break
            for p in posts:
                path = p.get("externalPath", "")
                if not path or path in seen:
                    continue
                seen.add(path)
                out.append({
                    "title": (p.get("title") or "").strip(),
                    "location": (p.get("locationsText") or "").strip(),
                    "url": base + path,
                    "posted": p.get("postedOn", ""),
                    "id": path,
                })
            if offset + 20 >= (total or 0):
                break
            time.sleep(0.35)
        print(f"      '{kw}': {total or 0} reported by portal, {len(seen)} collected")
    return out


def fetch_greenhouse(t):
    d = http(f"https://boards-api.greenhouse.io/v1/boards/{t['token']}/jobs")
    return [{
        "title": (j.get("title") or "").strip(),
        "location": ((j.get("location") or {}).get("name") or "").strip(),
        "url": j.get("absolute_url", ""),
        "posted": j.get("updated_at", ""),
        "id": str(j.get("id", "")),
    } for j in d.get("jobs", [])]


def fetch_lever(t):
    d = http(f"https://api.lever.co/v0/postings/{t['slug']}?mode=json")
    return [{
        "title": (j.get("text") or "").strip(),
        "location": ((j.get("categories") or {}).get("location") or "").strip(),
        "url": j.get("hostedUrl", ""),
        "posted": datetime.fromtimestamp(j.get("createdAt", 0)/1000, timezone.utc).strftime("%Y-%m-%d") if j.get("createdAt") else "",
        "id": j.get("id", ""),
    } for j in d]


def fetch_ashby(t):
    d = http("https://api.ashbyhq.com/posting-api/job-board/" + t["slug"])
    return [{
        "title": (j.get("title") or "").strip(),
        "location": (j.get("location") or "").strip(),
        "url": j.get("jobUrl", ""),
        "posted": (j.get("publishedAt") or "")[:10],
        "id": j.get("id", ""),
    } for j in d.get("jobs", [])]


def fetch_smartrecruiters(t):
    company, out, offset = t["company"], [], 0
    for _ in range(6):
        d = http(f"https://api.smartrecruiters.com/v1/companies/{company}/postings?limit=100&offset={offset}")
        items = d.get("content", [])
        if not items:
            break
        for j in items:
            loc = j.get("location") or {}
            parts = [loc.get("city"), loc.get("region"), loc.get("country")]
            loc_str = ", ".join(x for x in parts if x)
            jid = j.get("id", "")
            url_out = f"https://jobs.smartrecruiters.com/{company}/{jid}"
            for a in (j.get("actions") or []):
                if a.get("rel") == "postingUrl" and a.get("uri"):
                    url_out = a["uri"]
                    break
            out.append({
                "title": (j.get("name") or "").strip(),
                "location": loc_str,
                "url": url_out,
                "posted": (j.get("releasedDate") or "")[:10],
                "id": jid,
            })
        offset += 100
        if offset >= d.get("totalFound", 0):
            break
        time.sleep(0.3)
    return out


PROVIDERS = {"workday": fetch_workday, "greenhouse": fetch_greenhouse,
             "lever": fetch_lever, "ashby": fetch_ashby,
             "smartrecruiters": fetch_smartrecruiters}


# ---------- RELEVANCE ----------

GRAD_SIGNALS = [
    "new grad", "new graduate", "recent graduate", "rotational", "rotation program",
    "development program", "leadership development", "leadership program", "trainee",
    "early career", "early-career", "entry level", "entry-level", "graduate program",
    "campus hire", "university graduate", "associate program", "associate development",
    "class of 2026", "class of 2027", "2026 start", "2027 start",
    "analyst program", "analyst development",
]

# Internships/co-ops: nearly all require enrollment AFTER the role ends,
# which a December 2026 graduate cannot satisfy.
INTERNSHIP_EXCLUDE = [
    "intern", "internship", "co-op", "coop", "summer 2026", "summer 2027",
    "fall 2026", "spring 2027", "apprentice", "work study", "fellowship",
]

SENIORITY_EXCLUDE = [
    "senior", "sr.", "sr ", " ii", " iii", " iv", "staff ", "principal", "director",
    "vp ", "v.p.", "vice president", "head of", "manager", "mgr", " lead", "lead ",
    "chief", "executive", "svp", "evp", "president", "supervisor", "architect",
    "phd", "postdoc",
]


def relevant(job, t):
    """True only for full-time, new-grad-eligible roles."""
    title = (job.get("title") or "").lower()
    hay = title + " " + (job.get("location") or "").lower()

    kws = [k.lower() for k in t.get("keywords", [])]
    if kws and not any(k in hay for k in kws):
        return False

    if any(x in title for x in INTERNSHIP_EXCLUDE):
        return False
    if any(x in title for x in SENIORITY_EXCLUDE):
        return False

    signals = GRAD_SIGNALS + [g.lower() for g in t.get("grad_terms", [])]
    return any(s in hay for s in signals)


# ---------- MAIN ----------

def run(verify_only=False):
    cfg = json.loads(TARGETS.read_text(encoding="utf-8"))
    targets = [t for t in cfg["targets"] if t.get("enabled", True)]

    prev = {}
    if OUTPUT.exists() and not verify_only:
        try:
            prev = {c["id"]: c for c in json.loads(OUTPUT.read_text(encoding="utf-8")).get("companies", [])}
        except Exception:
            pass

    companies, new_findings, errors = [], [], []

    for t in targets:
        print(f"\n[{t['label']}] {t['type']}")
        fn = PROVIDERS.get(t["type"])
        if not fn:
            errors.append(f"{t['label']}: unknown type '{t['type']}'")
            print("    ! unknown provider type")
            continue
        try:
            raw = fn(t)
        except Exception as e:
            msg = f"{type(e).__name__}: {str(e)[:90]}"
            print(f"    ! FAILED — {msg}")
            errors.append(f"{t['label']}: {msg}")
            old = prev.get(t["id"], {})
            companies.append({**old, "id": t["id"], "label": t["label"],
                              "firm": t.get("firm", t["label"]), "ok": False,
                              "error": msg, "checked": datetime.now(timezone.utc).isoformat()})
            continue

        kept = [j for j in raw if relevant(j, t)]
        prev_ids = {j["id"] for j in prev.get(t["id"], {}).get("jobs", [])}
        fresh = [j for j in kept if j["id"] not in prev_ids] if prev_ids else []

        print(f"    => {len(raw)} fetched, {len(kept)} new-grad matches, {len(fresh)} new")
        for j in kept[:6]:
            print(f"       · {j['title'][:70]}")
        for j in fresh:
            new_findings.append({"company": t["label"], **j})

        companies.append({
            "id": t["id"], "label": t["label"], "firm": t.get("firm", t["label"]),
            "ok": True, "error": "", "checked": datetime.now(timezone.utc).isoformat(),
            "total": len(raw), "count": len(kept), "jobs": kept,
        })

    result = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "companies": companies,
        "new_since_last_run": new_findings,
        "errors": errors,
        "manual_only": cfg.get("_manual_only", []),
    }

    print("\n" + "=" * 62)
    for c in companies:
        state = "OK  " if c["ok"] else "FAIL"
        print(f"  {state}  {c['label']:<26}{c.get('count', 0):>3} matches  {c.get('error','')}")
    print("=" * 62)

    if verify_only:
        bad = [c for c in companies if not c["ok"]]
        print(f"\n{len(companies)-len(bad)}/{len(companies)} targets reachable.")
        return 1 if bad else 0

    OUTPUT.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(f"\nWrote {OUTPUT.name}: {len(companies)} companies, {len(new_findings)} new postings")

    gh = os.environ.get("GITHUB_OUTPUT")
    if gh:
        lines = [f"- **{f['company']}** — [{f['title']}]({f['url']}) · {f['location']}"
                 for f in new_findings]
        with open(gh, "a", encoding="utf-8") as fh:
            fh.write(f"new_count={len(new_findings)}\n")
            fh.write("summary<<EOF\n" + ("\n".join(lines) if lines else "No new postings.") + "\nEOF\n")
    return 0


if __name__ == "__main__":
    sys.exit(run(verify_only="--verify" in sys.argv))
