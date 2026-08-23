#!/usr/bin/env python3
"""
Recruiting portal scraper.

Runs on GitHub Actions. Checks career portals that expose a real JSON API,
writes results to live_jobs.json, and reports what changed since last run.

Portals WITHOUT a usable API (Paycom, iCIMS, Phenom) are listed in
targets.json under _manual_only and must be checked by hand.

Usage:
    python scraper/scrape.py            # normal run
    python scraper/scrape.py --test     # connectivity check only
"""

import json, sys, time, urllib.request, urllib.error, os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ROOT / "scraper" / "targets.json"
OUTPUT = ROOT / "live_jobs.json"
UA = "Mozilla/5.0 (compatible; recruiting-dashboard/1.0)"
TIMEOUT = 25


def http(url, method="GET", payload=None, extra_headers=None):
    headers = {"User-Agent": UA, "Accept": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


# ---------- PROVIDERS ----------

def fetch_workday(t):
    """Workday exposes a POST search endpoint that returns clean JSON."""
    url = f"https://{t['tenant']}.{t['wd']}.myworkdayjobs.com/wday/cxs/{t['tenant']}/{t['siteId']}/jobs"
    out, seen = [], set()
    debug = os.environ.get("SCRAPER_DEBUG") == "1"
    for kw in t.get("keywords", [""]):
        try:
            d = http(url, "POST", {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": kw})
        except Exception as e:
            print(f"    ! workday '{kw}': {type(e).__name__}: {e}")
            continue
        if debug:
            total = d.get("total", "?")
            n = len(d.get("jobPostings", []))
            sample = d.get("jobPostings", [{}])[0].get("title", "") if d.get("jobPostings") else "(none)"
            print(f"    [debug] kw='{kw}' url={url} total={total} returned={n} sample_title={sample!r}")
        for p in d.get("jobPostings", []):
            path = p.get("externalPath", "")
            if path in seen:
                continue
            seen.add(path)
            out.append({
                "title": p.get("title", "").strip(),
                "location": p.get("locationsText", "").strip(),
                "url": f"https://{t['tenant']}.{t['wd']}.myworkdayjobs.com/en-US/{t['siteId']}{path}",
                "posted": p.get("postedOn", ""),
                "id": path,
            })
        time.sleep(0.6)
    return out


def fetch_greenhouse(t):
    d = http(f"https://boards-api.greenhouse.io/v1/boards/{t['token']}/jobs")
    return [{
        "title": j.get("title", "").strip(),
        "location": (j.get("location") or {}).get("name", "").strip(),
        "url": j.get("absolute_url", ""),
        "posted": j.get("updated_at", ""),
        "id": str(j.get("id", "")),
    } for j in d.get("jobs", [])]


def fetch_lever(t):
    d = http(f"https://api.lever.co/v0/postings/{t['slug']}?mode=json")
    return [{
        "title": j.get("text", "").strip(),
        "location": (j.get("categories") or {}).get("location", "").strip(),
        "url": j.get("hostedUrl", ""),
        "posted": datetime.fromtimestamp(j.get("createdAt", 0) / 1000, timezone.utc).strftime("%Y-%m-%d") if j.get("createdAt") else "",
        "id": j.get("id", ""),
    } for j in d]


def fetch_ashby(t):
    d = http("https://api.ashbyhq.com/posting-api/job-board/" + t["slug"])
    return [{
        "title": j.get("title", "").strip(),
        "location": j.get("location", "").strip(),
        "url": j.get("jobUrl", ""),
        "posted": j.get("publishedAt", "")[:10],
        "id": j.get("id", ""),
    } for j in d.get("jobs", [])]


def fetch_smartrecruiters(t):
    """SmartRecruiters' public posting API. Paginated at 100/page; we pull up to 3 pages."""
    company = t["company"]
    out, offset = [], 0
    for _ in range(3):
        url = f"https://api.smartrecruiters.com/v1/companies/{company}/postings?limit=100&offset={offset}"
        d = http(url)
        items = d.get("content", [])
        if not items:
            break
        for j in items:
            loc = j.get("location") or {}
            loc_str = ", ".join(x for x in [loc.get("city"), loc.get("region"), loc.get("country")] if x)
            if loc.get("remote"):
                loc_str = (loc_str + " (Remote)").strip()
            jid = j.get("id", "")
            url_out = f"https://jobs.smartrecruiters.com/{company}/{jid}" if jid else ""
            for a in j.get("actions", []) or []:
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
    return out


PROVIDERS = {"workday": fetch_workday, "greenhouse": fetch_greenhouse,
             "lever": fetch_lever, "ashby": fetch_ashby, "smartrecruiters": fetch_smartrecruiters}


# ---------- RELEVANCE ----------

def relevant(job, t):
    """Keep jobs matching a keyword; boost if they also look new-grad targeted."""
    hay = (job["title"] + " " + job["location"]).lower()
    kws = [k.lower() for k in t.get("keywords", [])]
    if kws and not any(k in hay for k in kws):
        return False, False
    grads = [g.lower() for g in t.get("grad_terms", [])]
    is_grad = any(g in hay for g in grads) if grads else False
    return True, is_grad


# ---------- MAIN ----------

def run(test_only=False):
    cfg = json.loads(TARGETS.read_text(encoding="utf-8"))
    targets = [t for t in cfg["targets"] if t.get("enabled", True)]

    prev = {}
    if OUTPUT.exists():
        try:
            prev = {c["id"]: c for c in json.loads(OUTPUT.read_text(encoding="utf-8")).get("companies", [])}
        except Exception:
            prev = {}

    companies, new_findings, errors = [], [], []

    for t in targets:
        print(f"[{t['label']}] {t['type']}…")
        fn = PROVIDERS.get(t["type"])
        if not fn:
            errors.append(f"{t['label']}: unknown type {t['type']}")
            continue
        try:
            raw = fn(t)
        except urllib.error.HTTPError as e:
            msg = f"HTTP {e.code}"
            print(f"    ! {msg}")
            errors.append(f"{t['label']}: {msg}")
            old = prev.get(t["id"], {})
            companies.append({**old, "id": t["id"], "label": t["label"],
                              "ok": False, "error": msg,
                              "checked": datetime.now(timezone.utc).isoformat()})
            continue
        except Exception as e:
            msg = f"{type(e).__name__}: {e}"
            print(f"    ! {msg}")
            errors.append(f"{t['label']}: {msg}")
            old = prev.get(t["id"], {})
            companies.append({**old, "id": t["id"], "label": t["label"],
                              "ok": False, "error": msg,
                              "checked": datetime.now(timezone.utc).isoformat()})
            continue

        kept = []
        for j in raw:
            ok, is_grad = relevant(j, t)
            if ok:
                j["grad"] = is_grad
                kept.append(j)

        prev_ids = {j["id"] for j in prev.get(t["id"], {}).get("jobs", [])}
        fresh = [j for j in kept if j["id"] not in prev_ids] if prev_ids else []

        print(f"    {len(raw)} fetched, {len(kept)} relevant, {len(fresh)} new")
        for j in fresh:
            new_findings.append({"company": t["label"], **j})

        companies.append({
            "id": t["id"], "label": t["label"], "ok": True, "error": "",
            "checked": datetime.now(timezone.utc).isoformat(),
            "total": len(raw), "count": len(kept), "jobs": kept,
        })

    result = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "companies": companies,
        "new_since_last_run": new_findings,
        "errors": errors,
        "manual_only": cfg.get("_manual_only", []),
    }

    if test_only:
        print("\n--- CONNECTIVITY TEST ---")
        for c in companies:
            print(f"  {'OK  ' if c['ok'] else 'FAIL'}  {c['label']:<20} {c.get('count', 0)} relevant  {c.get('error','')}")
        return 0 if all(c["ok"] for c in companies) else 1

    OUTPUT.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(f"\nWrote {OUTPUT.name}: {len(companies)} companies, {len(new_findings)} new postings")

    # Surface results to the GitHub Actions workflow
    gh = os.environ.get("GITHUB_OUTPUT")
    if gh:
        body_lines = []
        for f in new_findings:
            tag = " **[new-grad]**" if f.get("grad") else ""
            body_lines.append(f"- **{f['company']}** — [{f['title']}]({f['url']}) · {f['location']}{tag}")
        with open(gh, "a", encoding="utf-8") as fh:
            fh.write(f"new_count={len(new_findings)}\n")
            fh.write("summary<<EOF\n" + ("\n".join(body_lines) if body_lines else "No new postings.") + "\nEOF\n")
    return 0


if __name__ == "__main__":
    sys.exit(run(test_only="--test" in sys.argv))
