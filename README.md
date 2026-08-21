# Recruiting Command Center

Live dashboard for full-time recruiting. Data is separated from code, so routine
updates mean editing one small JSON file instead of regenerating the whole page.

## Files — all five must be in the repo together

| File | What it is | How often you touch it |
|---|---|---|
| `index.html` | Page structure | Rarely |
| `style.css` | All styling | Rarely |
| `app.js` | Logic: digest, tracker, filters, calendar export | Rarely |
| `firms.json` | **The 68 target companies** | Often — this is the one you edit |
| `apps.json` | Starting pipeline state | Rarely (live changes save to your browser) |

## Setup

1. Push all five files to a GitHub repo
2. Settings → Pages → Deploy from branch `main`, folder `/ (root)`
3. Open your live URL. A green "Auto-save is on" banner confirms it's working.

**It must be hosted.** Opening `index.html` directly from your computer will fail —
browsers block loading local JSON files. The page will tell you this if it happens.

## Updating a company

Edit `firms.json` in GitHub's web editor. One entry looks like:

```json
{
 "name": "Cornerstone Research",
 "role": "Analyst",
 "track": "econ",
 "status": "open",
 "statusText": "OPEN — deadline Sept 13 (verified)",
 "deadline": "2026-09-13",
 "odds": 25,
 "verified": "2026-08-04",
 "verifyNote": "Confirmed via UChicago + Cornell career centers."
}
```

### Fields that matter most

- **`status`** — drives sorting and the digest. One of:
  `open` (apply now) · `watch` (not yet posted) · `applied` · `uncertain` (may not exist for you) · `notposted` · `closed`
- **`deadline`** — `YYYY-MM-DD`. Drives countdowns and calendar export. Leave `""` if rolling.
- **`verified`** — **the date YOU last checked the actual portal.** The dashboard flags
  anything unchecked for 14+ days so stale assumptions surface instead of rotting silently.
- **`verifyNote`** — what you saw when you checked. Shows on hover.

### The verification habit

This is the part that makes the tool trustworthy. Search results and job aggregators
have repeatedly shown postings that didn't actually exist. When you check a portal yourself:

1. Update `verified` to today's date
2. Write what you actually saw in `verifyNote`
3. Fix `status` / `statusText` / `deadline` if they changed

Sort by "Least recently verified" to see what needs a spot-check.

## Adding a company

Copy any existing entry, change the values. Required fields:
`name, role, track, nc, star, prog, sal, salmin, city, office, officeNote, wlb,
travel, opens, deadline, status, statusText, odds, link, note, domain, verified, verifyNote`

`track` must be one of: `fall, sports, econ, strat, bank, fintech, tech, nc`
`wlb` must be one of: `good, ok, hard`
`domain` is the company's root domain — used to pull their logo automatically.

## What saves automatically

Pipeline stages, notes, and checklist ticks save to your browser's local storage.
That's per-browser — laptop and phone don't sync. Use the backup code on the Data
tab to move state between devices.
