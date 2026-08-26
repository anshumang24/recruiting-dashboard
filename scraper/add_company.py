#!/usr/bin/env python3
"""
Add a new company to BOTH scraper/targets.json and firms.json in one shot,
guaranteeing the `firm` key matches exactly — the #1 source of silent bugs
when these files are edited by hand separately.

Two modes:

  Interactive (asks questions, good for one-off adds):
      python scraper/add_company.py

  Scripted (good for batch adds or calling from elsewhere):
      python scraper/add_company.py --json '{
        "id": "adobe", "label": "Adobe", "type": "workday",
        "tenant": "adobe", "wd": "wd5", "siteId": "external_experienced",
        "keywords": ["analyst","data","finance"], "grad_terms": [],
        "firm_entry": {
          "track": "tech", "sal": "$80-95k", "salmin": 80,
          "city": "San Jose, CA", "office": "Hybrid", "officeNote": "3 days",
          "wlb": "good", "travel": "None", "link": "https://careers.adobe.com",
          "note": "Added via add_company.py"
        }
      }'

Either way, this:
  1. Appends a scraper target to scraper/targets.json (disabled by default —
     you verify it works before it runs unattended)
  2. Appends a matching entry to firms.json with the SAME name, so the
     dashboard's live-role badge picks it up automatically
  3. Refuses to proceed if the name already exists in either file
"""

import json, sys, argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ROOT / "scraper" / "targets.json"
FIRMS = ROOT / "firms.json"

TRACKS = ["fall", "sports", "econ", "strat", "bank", "fintech", "tech", "nc"]
PROVIDER_FIELDS = {
    "workday": ["tenant", "wd", "siteId"],
    "greenhouse": ["token"],
    "lever": ["slug"],
    "ashby": ["slug"],
    "smartrecruiters": ["company"],
}


def ask(prompt, default=None, required=True):
    suffix = f" [{default}]" if default else ""
    while True:
        v = input(f"{prompt}{suffix}: ").strip()
        if not v and default is not None:
            return default
        if not v and not required:
            return ""
        if v:
            return v
        print("  required — try again")


def ask_list(prompt, default=""):
    v = input(f"{prompt} (comma-separated) [{default}]: ").strip() or default
    return [x.strip() for x in v.split(",") if x.strip()]


def ask_choice(prompt, options, default=None):
    while True:
        v = input(f"{prompt} ({'/'.join(options)}){f' [{default}]' if default else ''}: ").strip() or default
        if v in options:
            return v
        print(f"  must be one of: {', '.join(options)}")


def build_interactive():
    print("=== Add a new company ===\n")
    label = ask("Company display name (e.g. 'Adobe')")
    cid = ask("Short id, lowercase no spaces", default=label.lower().replace(" ", ""))
    firm_name = ask("Exact name to use in firms.json target list", default=label)

    print("\nWhich ATS platform do they use? Check a real job URL:")
    print("  myworkdayjobs.com -> workday | greenhouse.io -> greenhouse")
    print("  lever.co -> lever | ashbyhq.com -> ashby | smartrecruiters.com -> smartrecruiters")
    ptype = ask_choice("Platform", list(PROVIDER_FIELDS.keys()))

    target = {"id": cid, "label": label, "firm": firm_name, "type": ptype}
    if ptype == "workday":
        print("\nFrom a URL like https://TENANT.wdN.myworkdayjobs.com/en-US/SITEID/job/...")
        target["tenant"] = ask("  tenant")
        target["wd"] = ask("  wd number (e.g. wd1, wd12)")
        target["siteId"] = ask("  siteId (CASE-SENSITIVE — copy exactly from the URL)")
    elif ptype == "greenhouse":
        target["token"] = ask("  board token (from boards.greenhouse.io/TOKEN)")
    elif ptype == "lever":
        target["slug"] = ask("  company slug (from jobs.lever.co/SLUG)")
    elif ptype == "ashby":
        target["slug"] = ask("  org slug (from jobs.ashbyhq.com/SLUG)")
    elif ptype == "smartrecruiters":
        target["company"] = ask("  company slug (from careers.smartrecruiters.com/SLUG)")

    target["keywords"] = ask_list("Keywords (broad topical match)", "analyst,data,finance")
    target["grad_terms"] = ask_list("Extra grad signals beyond the generic list", "")
    target["enabled"] = False  # always start disabled; verify first
    target["verified"] = ""

    print("\n--- Now the target-list entry (shown in the Targets table) ---")
    firm = {
        "name": firm_name,
        "role": ask("Typical role title", default="Analyst"),
        "track": ask_choice("Track", TRACKS, default="tech"),
        "nc": ask_choice("NC-based?", ["true", "false"], default="false") == "true",
        "star": False, "prog": True,
        "sal": ask("Salary range (e.g. '$80-95k')", default="$75-90k"),
        "salmin": int(ask("Salary floor as a number (e.g. 75)", default="75")),
        "city": ask("City", default="Remote"),
        "office": ask_choice("Office policy", ["Onsite", "Hybrid", "Remote"], default="Hybrid"),
        "officeNote": ask("Office note (e.g. '3 days in office')", default="3 days in office"),
        "wlb": ask_choice("WLB", ["good", "ok", "hard"], default="good"),
        "travel": ask("Travel", default="None"),
        "opens": "Rolling", "deadline": "", "status": "watch",
        "statusText": "Watch — scraper covers this",
        "odds": int(ask("Rough odds estimate (number, e.g. 30)", default="30")),
        "domain": ask("Root domain (for the logo, e.g. 'adobe.com')", default=""),
        "link": ask("Careers page URL", default=""),
        "note": ask("One-line note on fit", default=f"Added via add_company.py, covered by the auto-scraper."),
        "verified": "", "verifyNote": "",
    }
    return target, firm


def build_scripted(payload):
    d = json.loads(payload)
    firm_entry = d.pop("firm_entry")
    d.setdefault("enabled", False)
    d.setdefault("verified", "")
    d.setdefault("grad_terms", [])
    d.setdefault("firm", d["label"])   # target's firm key must exist before saving
    firm_name = d["firm"]
    firm = {
        "name": firm_name, "role": firm_entry.get("role", "Analyst"),
        "track": firm_entry.get("track", "tech"), "nc": firm_entry.get("nc", False),
        "star": firm_entry.get("star", False), "prog": True,
        "sal": firm_entry.get("sal", ""), "salmin": firm_entry.get("salmin", 0),
        "city": firm_entry.get("city", ""), "office": firm_entry.get("office", "Hybrid"),
        "officeNote": firm_entry.get("officeNote", ""), "wlb": firm_entry.get("wlb", "good"),
        "travel": firm_entry.get("travel", "None"), "opens": "Rolling", "deadline": "",
        "status": "watch", "statusText": "Watch — scraper covers this",
        "odds": firm_entry.get("odds", 30), "domain": firm_entry.get("domain", ""),
        "link": firm_entry.get("link", ""),
        "note": firm_entry.get("note", "Added via add_company.py, covered by the auto-scraper."),
        "verified": "", "verifyNote": "",
    }
    return d, firm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="Scripted mode: JSON payload (see module docstring)")
    args = ap.parse_args()

    targets_cfg = json.loads(TARGETS.read_text(encoding="utf-8"))
    firms = json.loads(FIRMS.read_text(encoding="utf-8"))

    target, firm = build_scripted(args.json) if args.json else build_interactive()

    existing_target_ids = {t["id"] for t in targets_cfg["targets"]}
    existing_firm_names = {f["name"].lower() for f in firms}

    if target["id"] in existing_target_ids:
        sys.exit(f"\n✗ A target with id '{target['id']}' already exists. Pick a different id.")
    if firm["name"].lower() in existing_firm_names:
        sys.exit(f"\n✗ A firm named '{firm['name']}' already exists in firms.json. "
                  f"Use the exact existing name in --json, or edit that entry directly instead.")

    targets_cfg["targets"].append(target)
    firms.append(firm)

    TARGETS.write_text(json.dumps(targets_cfg, indent=1), encoding="utf-8")
    FIRMS.write_text(json.dumps(firms, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"\n✓ Added '{firm['name']}' to both files.")
    print(f"  scraper/targets.json — id '{target['id']}', enabled={target['enabled']}")
    print(f"  firms.json — status 'watch'")
    print(f"\nNext step: run  python scraper/scrape.py --verify")
    print(f"  to confirm the config actually works before setting enabled: true.")


if __name__ == "__main__":
    main()
