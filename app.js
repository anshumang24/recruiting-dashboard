/* ============================================================
   RECRUITING COMMAND CENTER — app logic
   Data lives in firms.json / apps.json. Edit those, not this.
   ============================================================ */

const KEY = 'anshuman_recruiting_v5';
let FIRMS = [], APPS = [], CHECKS = {}, NEXTID = 100;
let LIVE = null;   // live_jobs.json — written by the GitHub Actions scraper
let SEED_APPS = [];

const HAS_LS = (() => { try { localStorage.setItem('__t','1'); localStorage.removeItem('__t'); return true; } catch(e){ return false; } })();

/* ---------- HELPERS ---------- */
const TC = {fall:'var(--fall)',sports:'var(--sports)',econ:'var(--econ)',strat:'var(--strat)',
            bank:'var(--bank)',fintech:'var(--fintech)',tech:'var(--vol)',nc:'var(--nc)'};
const TN = {fall:'Fall intern',sports:'Sports',econ:'Econ consulting',strat:'Strategy',
            bank:'Banking',fintech:'Fintech',tech:'Big tech / retail',nc:'NC · local'};
const now   = () => new Date();
const days  = d => d ? Math.ceil((new Date(d+'T23:59:59') - now())/864e5) : null;
const since = d => d ? Math.floor((now() - new Date(d))/864e5) : null;
const fmt   = d => d ? new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
const esc   = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const el    = id => document.getElementById(id);

/* ---------- PERSISTENCE ---------- */
function save(){
  if (HAS_LS) { try { localStorage.setItem(KEY, JSON.stringify({a:APPS,c:CHECKS,n:NEXTID,v:5})); } catch(e){} }
  const s = el('saveStatus');
  if (s) {
    s.textContent = HAS_LS
      ? 'Saved automatically · ' + now().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})
      : 'Not auto-saved — this page must be hosted (GitHub Pages) for auto-save to work';
    s.style.color = HAS_LS ? 'var(--econ)' : 'var(--accent)';
  }
}
function loadState(){
  if (HAS_LS) {
    const r = localStorage.getItem(KEY);
    if (r) { try { const o = JSON.parse(r); APPS=o.a||[]; CHECKS=o.c||{}; NEXTID=o.n||100; return true; } catch(e){} }
  }
  APPS = JSON.parse(JSON.stringify(SEED_APPS)); CHECKS = {}; NEXTID = 100; return false;
}

/* ---------- HERO DATE (was part of countdown rendering, kept standalone) ---------- */
function renderDate(){
  el('hero-date').textContent = now().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
}

/* ---------- DIGEST ---------- */
function renderDigest(){
  const applied = new Set(APPS.map(a => a.firm.toLowerCase()));
  const isApplied = f => applied.has(f.name.toLowerCase()) || f.status === 'applied';

  const openNow   = FIRMS.filter(f => f.status === 'open' && !isApplied(f));
  const allDls    = FIRMS.filter(f => f.deadline && days(f.deadline) > 0 && days(f.deadline) <= 50)
                         .sort((a,b) => days(a.deadline) - days(b.deadline));
  const actionDls = allDls.filter(f => !isApplied(f));
  const appliedDls= allDls.filter(isApplied);
  const uncertain = FIRMS.filter(f => f.status === 'uncertain' || f.status === 'notposted');
  const inFlight  = APPS.filter(a => !['rejected','offer'].includes(a.stage));
  const stale     = APPS.filter(a => a.applied && a.stage === 'applied' && since(a.applied) >= 21);
  const staleCheck= FIRMS.filter(f => f.verified && since(f.verified) >= 14);
  const hiOpen    = openNow.filter(f => f.odds >= 35).sort((a,b) => b.odds - a.odds);

  let rows = '';
  actionDls.slice(0,3).forEach(f => { const n = days(f.deadline);
    rows += `<div class="drow"><span class="dpill ${n<=14?'dp-now':'dp-soon'}">${n}d</span><div><b>${f.name}</b> — ${f.statusText}. ${n<=14?'Move on this now.':'Get it in early.'}</div></div>`; });
  hiOpen.slice(0,5).forEach(f => {
    rows += `<div class="drow"><span class="dpill dp-go">${f.odds}%</span><div><b>${f.name}</b> — ${f.statusText}. Strong fit; apply when you have 30 minutes.</div></div>`; });
  stale.forEach(a => {
    rows += `<div class="drow"><span class="dpill dp-now">${since(a.applied)}d quiet</span><div><b>${a.firm}</b> — applied ${fmt(a.applied)}, no reply. A short follow-up is reasonable now.</div></div>`; });
  appliedDls.slice(0,2).forEach(f => { const n = days(f.deadline);
    rows += `<div class="drow"><span class="dpill dp-wait">${n}d</span><div><b>${f.name}</b> — already applied. Decision expected near their deadline; nothing to do.</div></div>`; });
  if (staleCheck.length)
    rows += `<div class="drow"><span class="dpill dp-wait">Re-verify</span><div><b>${staleCheck.length} entries</b> haven't been checked in 14+ days: ${staleCheck.slice(0,4).map(f=>f.name.split('—')[0].trim()).join(', ')}${staleCheck.length>4?'…':''}. Portal status changes fast — spot-check these.</div></div>`;
  if (uncertain.length)
    rows += `<div class="drow"><span class="dpill dp-warn">Uncertain</span><div><b>${uncertain.map(f=>f.name.split('—')[0].trim()).join(', ')}</b> — status unconfirmed or may not accept external full-time applicants. Verify directly before investing effort.</div></div>`;
  if (!rows) rows = '<div class="drow"><span class="dpill dp-wait">Clear</span><div>Nothing urgent. Good window for interview prep.</div></div>';

  const soon = actionDls[0] ? days(actionDls[0].deadline) : null;
  el('digest').innerHTML = `
    <div class="digest-h"><div class="digest-t">Your week at a glance</div>
      <div class="digest-d">Recomputed ${now().toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div></div>
    <div class="dgrid">
      <div class="dcard go"><div class="dcard-l">Open, not applied</div><div class="dcard-n">${openNow.length}</div><div class="dcard-s">Can apply today</div></div>
      <div class="dcard ${soon&&soon<=21?'urgent':'warn'}"><div class="dcard-l">Next action deadline</div><div class="dcard-n">${soon?soon+'d':'—'}</div><div class="dcard-s">${actionDls[0]?actionDls[0].name:'None within 50 days'}</div></div>
      <div class="dcard"><div class="dcard-l">In flight</div><div class="dcard-n">${inFlight.length}</div><div class="dcard-s">Awaiting response</div></div>
      <div class="dcard ${stale.length?'urgent':''}"><div class="dcard-l">Needs follow-up</div><div class="dcard-n">${stale.length}</div><div class="dcard-s">Quiet 21+ days</div></div>
    </div><div class="dlist">${rows}</div>`;
}


/* ---------- LIVE PORTAL FEED ---------- */
function renderLive(){
  const box = el('livePanel');
  if (!box) return;
  if (!LIVE) {
    box.innerHTML = `<div class="live-empty">No <code>live_jobs.json</code> yet — the scraper hasn't run. Push the workflow, then trigger it once from your repo's <b>Actions</b> tab.</div>`;
    return;
  }
  const gen = new Date(LIVE.generated);
  const ageH = Math.floor((now() - gen) / 36e5);
  const ageTxt = ageH < 1 ? 'just now' : ageH < 24 ? `${ageH}h ago` : `${Math.floor(ageH/24)}d ago`;
  const stale = ageH >= 18;

  const fresh = (LIVE.new_since_last_run || []);
  const okCount = LIVE.companies.filter(c => c.ok).length;
  const failed  = LIVE.companies.filter(c => !c.ok);

  // all currently-visible relevant jobs, new-grad flagged first
  const all = [];
  LIVE.companies.filter(c => c.ok).forEach(c =>
    (c.jobs||[]).forEach(j => all.push({company:c.label, ...j})));
  all.sort((a,b) => (b.grad?1:0) - (a.grad?1:0));

  const rows = all.slice(0,40).map(j =>
    `<div class="lrow"><span class="lpill ${j.grad?'lp-grad':''}">${j.grad?'new grad':'role'}</span>
     <div><b>${esc(j.company)}</b> — <a href="${j.url}" target="_blank">${esc(j.title)}</a>
     <span class="lloc">${esc(j.location||'')}</span></div></div>`).join('');

  box.innerHTML = `
    <div class="live-h">
      <div><span class="live-dot ${stale?'sdot':''}"></span><b>Portal feed</b>
        <span class="live-age ${stale?'sold':''}">checked ${ageTxt}</span></div>
      <div class="live-meta">${okCount}/${LIVE.companies.length} portals OK${failed.length?` · <span class="lfail">${failed.length} failed</span>`:''}</div>
    </div>
    ${fresh.length ? `<div class="live-new"><b>${fresh.length} new since last check:</b> ${fresh.slice(0,6).map(f=>`${esc(f.company)} — ${esc(f.title)}`).join(' · ')}</div>` : ''}
    ${failed.length ? `<div class="live-fail">Failed: ${failed.map(f=>`${esc(f.label)} (${esc(f.error||'error')})`).join(', ')}</div>` : ''}
    <div class="lrows">${rows || '<div class="live-empty">No matching roles found in the last check.</div>'}</div>
    ${(LIVE.manual_only||[]).length ? `<div class="live-manual"><b>Not auto-checkable — check these yourself:</b> ${LIVE.manual_only.map(m=>`<a href="${m.url}" target="_blank">${esc(m.label)}</a>`).join(' · ')}</div>` : ''}
  `;
}

/* ---------- DESKTOP NOTIFICATIONS ---------- */
const NOTIF_SEEN = 'anshuman_notif_seen_v1';
function notifStatus(){
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
function enableNotifs(){
  if (!('Notification' in window)) { alert('This browser does not support notifications.'); return; }
  Notification.requestPermission().then(p => { updateNotifUI(); if (p === 'granted') runNotifChecks(true); });
}
function updateNotifUI(){
  const b = el('notifBtn'); if (!b) return;
  const s = notifStatus();
  b.textContent = s === 'granted' ? '🔔 Notifications on'
                : s === 'denied'  ? '🔕 Blocked in browser settings'
                : '🔔 Enable desktop notifications';
  b.disabled = (s === 'granted' || s === 'denied' || s === 'unsupported');
}
function fire(title, body, tag){
  try { new Notification(title, {body, tag, icon:'https://www.google.com/s2/favicons?domain=github.com&sz=128'}); }
  catch(e){}
}
function runNotifChecks(force){
  if (notifStatus() !== 'granted') return;
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(NOTIF_SEEN) || '{}'); } catch(e){}
  const today = new Date().toISOString().slice(0,10);
  let fired = 0;

  // 1. Deadlines at 14 / 7 / 3 / 1 days out
  FIRMS.forEach(f => {
    if (!f.deadline) return;
    const n = days(f.deadline);
    if (![14,7,3,1].includes(n)) return;
    const applied = APPS.some(a => a.firm.toLowerCase() === f.name.toLowerCase()) || f.status === 'applied';
    if (applied) return;
    const k = `dl:${f.name}:${n}`;
    if (seen[k]) return;
    fire(`${n} day${n===1?'':'s'} left — ${f.name}`, `${f.role}. ${f.statusText}`, k);
    seen[k] = today; fired++;
  });

  // 2. New postings from the scraper
  if (LIVE && (LIVE.new_since_last_run||[]).length) {
    const k = `live:${LIVE.generated}`;
    if (!seen[k]) {
      const list = LIVE.new_since_last_run;
      fire(`${list.length} new posting${list.length===1?'':'s'}`,
           list.slice(0,3).map(f => `${f.company} — ${f.title}`).join('\n'), k);
      seen[k] = today; fired++;
    }
  }

  // 3. Applications gone quiet 21+ days
  APPS.filter(a => a.applied && a.stage === 'applied' && since(a.applied) >= 21).forEach(a => {
    const k = `stale:${a.id}:${Math.floor(since(a.applied)/7)}`;
    if (seen[k]) return;
    fire(`${a.firm} — quiet ${since(a.applied)} days`, 'A short follow-up is reasonable now.', k);
    seen[k] = today; fired++;
  });

  try { localStorage.setItem(NOTIF_SEEN, JSON.stringify(seen)); } catch(e){}
  if (force && !fired) fire('Notifications enabled', "You'll get alerts for deadlines, new postings, and stale applications.", 'test');
}

/* ---------- TRACKER ---------- */
const STAGES = [['outreach','Outreach'],['applied','Applied'],['screening','Screening'],
                ['interview','Interview'],['offer','Offer'],['rejected','Closed']];
function renderTrk(){
  el('trk').innerHTML = STAGES.map(([k,label]) => {
    const items = APPS.filter(a => a.stage === k);
    const bg = k==='offer'?'var(--econ-bg)':k==='rejected'?'#F0EDE9':'var(--surface-2)';
    const fg = k==='offer'?'var(--econ)':k==='rejected'?'#8A8178':'var(--text-2)';
    const body = items.length ? items.map(a => {
      const ds = a.applied ? since(a.applied) : null;
      const st = (k==='applied' && ds!==null && ds>=21) ? 'stale' : '';
      return `<div class="trk-card"><div class="trk-f">${esc(a.firm)}</div><div class="trk-r">${esc(a.role)}</div>
        <div class="trk-n" contenteditable="true" onblur="saveNote(${a.id}, this.textContent)">${esc(a.note||'Click to add a note…')}</div>
        <div class="trk-meta">${a.applied?`<span class="trk-days ${st}">${ds}d since applying</span>`:'<span class="trk-days">outreach only</span>'}
        <select class="stage-sel" onchange="setStage(${a.id}, this.value)">${STAGES.map(([sk,sl])=>`<option value="${sk}"${sk===k?' selected':''}>${sl}</option>`).join('')}</select>
        <button class="xbtn" onclick="delApp(${a.id})" title="Remove">×</button></div></div>`;
    }).join('') : '<div class="trk-empty">Nothing here</div>';
    return `<div class="trk-col"><div class="trk-h" style="background:${bg};color:${fg}"><span>${label}</span><span class="pill">${items.length}</span></div><div class="trk-body">${body}</div></div>`;
  }).join('');
}
function setStage(id,v){ const a=APPS.find(x=>x.id===id); if(a){a.stage=v; save(); renderTrk(); renderDigest(); renderTable();} }
function saveNote(id,txt){ const a=APPS.find(x=>x.id===id); if(a){ a.note = txt.trim()==='Click to add a note…'?'':txt.trim(); save(); } }
function delApp(id){ if(!confirm('Remove from pipeline?'))return; APPS=APPS.filter(a=>a.id!==id); save(); renderTrk(); renderDigest(); renderTable(); }
function addApp(){
  const f = prompt('Company?'); if(!f) return;
  const r = prompt('Role?')||'';
  const d = prompt('Date applied (YYYY-MM-DD), blank if outreach only:')||'';
  APPS.push({id:NEXTID++, firm:f, role:r, applied:d, stage:d?'applied':'outreach', note:''});
  save(); renderTrk(); renderDigest(); renderTable();
}
function quickApply(name, role){
  if (APPS.some(a => a.firm.toLowerCase() === name.toLowerCase())) { alert(name + ' is already in your pipeline.'); return; }
  const d = new Date().toISOString().slice(0,10);
  APPS.push({id:NEXTID++, firm:name, role:role, applied:d, stage:'applied', note:'Added from target list ' + fmt(d)});
  save(); renderTrk(); renderDigest(); renderTable();
}


/* ---------- LIVE JOBS -> FIRM LINKING ---------- */
function liveForFirm(firmName){
  if (!LIVE) return null;
  // A firm can be covered by more than one scraper target (e.g. Mastercard
  // posts across two separate Workday sites) — aggregate ALL matches,
  // don't just take the first one and silently drop the rest.
  const matches = (LIVE.companies||[]).filter(x => (x.firm||x.label||'').toLowerCase() === firmName.toLowerCase());
  if (!matches.length) return null;
  const anyOk = matches.some(c => c.ok);
  const jobs = [];
  const seen = new Set();
  matches.forEach(c => (c.jobs||[]).forEach(j => {
    const key = j.url || j.title;
    if (!seen.has(key)) { seen.add(key); jobs.push(j); }
  }));
  const errors = matches.filter(c => !c.ok && c.error).map(c => c.error);
  return { ok: anyOk, jobs, checked: matches[0].checked, error: errors.join('; ') };
}
function liveBadge(firmName){
  const L = liveForFirm(firmName);
  if (!L) return '';                       // company isn't scraper-covered
  if (!L.ok) return `<div class="lvtag lv-err" title="${esc(L.error||'')}">⚠ portal check failed</div>`;
  if (!L.jobs.length) return `<div class="lvtag lv-none">no new-grad roles live</div>`;
  const list = L.jobs.slice(0,3).map(j =>
    `<a class="lvjob" href="${j.url}" target="_blank" title="${esc(j.location||'')}">${esc(j.title)}</a>`).join('');
  const more = L.jobs.length > 3 ? `<span class="lvmore">+${L.jobs.length-3} more</span>` : '';
  return `<div class="lvtag lv-hit">${L.jobs.length} live new-grad role${L.jobs.length>1?'s':''}</div><div class="lvlist">${list}${more}</div>`;
}

/* ---------- TABLE ---------- */
let filter='all', query='', sortBy='default', hideClosed=true;
const ORD = {open:0, watch:1, applied:2, uncertain:3, notposted:4, closed:5};
const oc = o => o>=45?['o-str','of-str','Strong']:o>=30?['o-gd','of-gd','Good']:o>=20?['o-rl','of-rl','Realistic']:['o-cp','of-cp','Long shot'];

const STAGE_LABEL = {outreach:'Outreach sent',applied:'Applied',screening:'Screening',
                      interview:'Interviewing',offer:'Offer!',rejected:'Not moving forward'};
function appForFirm(firmName){
  // most relevant application for this firm: prefer the most "advanced" stage
  const order = ['offer','interview','screening','applied','outreach','rejected'];
  const matches = APPS.filter(a => a.firm.toLowerCase() === firmName.toLowerCase());
  if (!matches.length) return null;
  matches.sort((a,b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  return matches[0];
}
function pipelineTag(firmName){
  const a = appForFirm(firmName);
  if (!a) return '';
  const cls = a.stage==='rejected' ? 'pt-closed' : a.stage==='offer' ? 'pt-offer' : 'pt-active';
  return `<div class="pipetag ${cls}">${STAGE_LABEL[a.stage]||a.stage}</div>`;
}

function renderTable(){
  const applied = new Set(APPS.map(a=>a.firm.toLowerCase()));
  const closedFirms = new Set(APPS.filter(a=>a.stage==='rejected').map(a=>a.firm.toLowerCase()));
  let L = FIRMS.filter(f => {
    if (hideClosed && closedFirms.has(f.name.toLowerCase())) return false;
    if (filter==='nc'   && !f.nc && f.track!=='nc') return false;
    if (filter==='prog' && !f.prog) return false;
    if (filter==='act') { const isA = applied.has(f.name.toLowerCase())||f.status==='applied';
                          if (isA || !['open','watch'].includes(f.status)) return false; }
    if (!['all','nc','prog','act'].includes(filter) && f.track!==filter) return false;
    if (query && !(f.name+' '+f.role+' '+f.city+' '+f.note+' '+f.sal).toLowerCase().includes(query)) return false;
    return true;
  });
  const S = {
    odds:(a,b)=>b.odds-a.odds, oddsasc:(a,b)=>a.odds-b.odds, sal:(a,b)=>b.salmin-a.salmin,
    name:(a,b)=>a.name.localeCompare(b.name),
    deadline:(a,b)=>((a.deadline?days(a.deadline):9999)-(b.deadline?days(b.deadline):9999)),
    stale:(a,b)=>((b.verified?since(b.verified):9999)-(a.verified?since(a.verified):9999)),
    default:(a,b)=>(ORD[a.status]-ORD[b.status])||(b.star-a.star)||(b.odds-a.odds)
  };
  L.sort(S[sortBy]);
  const hiddenN = FIRMS.length - FIRMS.filter(f=>!hideClosed || !closedFirms.has(f.name.toLowerCase())).length;
  el('count').textContent = `Showing ${L.length} of ${FIRMS.length} targets` +
    (hiddenN ? ` · ${hiddenN} closed hidden` : '');

  el('tb').innerHTML = L.map(f => {
    const c = TC[f.track]||'var(--vol)', [o1,o2,o3] = oc(f.odds);
    const done = applied.has(f.name.toLowerCase());
    const initial = f.name.replace(/^[⭐🔴🚨✅⛔]\s*/,'').trim().charAt(0).toUpperCase();
    const logo = f.domain
      ? `<img class="clogo" src="https://www.google.com/s2/favicons?domain=${f.domain}&sz=128" alt="" onerror="this.outerHTML='<div class=&quot;clogo clogo-fb&quot; style=&quot;background:${c}&quot;>${initial}</div>'">`
      : `<div class="clogo clogo-fb" style="background:${c}">${initial}</div>`;
    const dl = f.deadline ? `<div class="sub2">Deadline ${fmt(f.deadline)} · <b>${days(f.deadline)}d</b></div>` : '';
    const vAge = f.verified ? since(f.verified) : null;
    const vTag = f.verified
      ? `<div class="vtag ${vAge>=14?'vold':''}" title="${esc(f.verifyNote)}">✓ verified ${fmt(f.verified)}${vAge>=14?` · ${vAge}d ago`:''}</div>`
      : `<div class="vtag vnone" title="No direct verification — treat status as an assumption">unverified</div>`;
    const act = done
      ? `<span class="done-tag">✓ In pipeline</span>`
      : `<a class="ab" style="background:${c}" href="${f.link}" target="_blank">Open ↗</a><button class="miniadd" onclick="quickApply('${f.name.replace(/'/g,"\\'")}','${(f.role||'').replace(/'/g,"\\'")}')">+ Applied</button>`;
    return `<tr${done?' class="rowdone"':''}>
      <td class="strip" style="background:${c}"></td>
      <td><div class="fnrow">${logo}<div><div class="fn">${f.star?'⭐ ':''}${f.name}</div><div class="fr">${f.role}</div></div></div>
        <span class="badge b-${f.track}">${TN[f.track]}</span>${f.prog?' <span class="badge b-prog">🎓 Program</span>':''}${f.nc&&f.track!=='nc'?' <span class="badge b-nc">NC</span>':''}
        <div class="fnote">${f.note}</div>${pipelineTag(f.name)}${vTag}${liveBadge(f.name)}</td>
      <td><div class="sal">${f.sal}</div></td>
      <td><div class="city">${f.city}</div><div class="sub2">${f.office} · ${f.officeNote}</div></td>
      <td><span class="wb wb-${f.wlb}">${f.wlb==='good'?'✓ Good':f.wlb==='ok'?'~ Mixed':'✗ Hard'}</span><div class="sub2">${f.travel}</div></td>
      <td><span class="st st-${f.status}">${f.statusText}</span>${dl}${f.opens?`<div class="sub2">Opens: ${f.opens}</div>`:''}</td>
      <td class="occ"><div class="on ${o1}">${f.odds}%</div><div class="obar"><div class="ofill ${o2}" style="width:${f.odds}%"></div></div><div class="ol ${o1}">${o3}</div></td>
      <td class="actcell">${act}</td></tr>`;
  }).join('');
}

/* ---------- CALENDAR EXPORT ---------- */
function exportICS(){
  const evs = [];
  FIRMS.filter(f => f.deadline && days(f.deadline) > 0).forEach(f => {
    evs.push({d:f.deadline, t:`DEADLINE: ${f.name}`, desc:`${f.role} — ${f.statusText}. ${f.link}`});
    const w = new Date(f.deadline); w.setDate(w.getDate()-7);
    evs.push({d:w.toISOString().slice(0,10), t:`1 week left: ${f.name}`, desc:`Deadline ${fmt(f.deadline)}. ${f.link}`});
  });
  FIRMS.filter(f => f.status==='open' && f.statusText.toLowerCase().includes('rolling')).slice(0,6).forEach(f=>{
    evs.push({d:new Date(Date.now()+3*864e5).toISOString().slice(0,10), t:`Apply: ${f.name} (rolling)`, desc:`Rolling — earlier is better. ${f.link}`});
  });
  let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Recruiting//EN\r\nCALSCALE:GREGORIAN\r\n';
  evs.forEach((e,i) => { ics += `BEGIN:VEVENT\r\nUID:r${i}@anshuman\r\nDTSTAMP:${new Date().toISOString().slice(0,10).replace(/-/g,'')}T090000Z\r\nDTSTART;VALUE=DATE:${e.d.replace(/-/g,'')}\r\nSUMMARY:${e.t}\r\nDESCRIPTION:${e.desc}\r\nEND:VEVENT\r\n`; });
  ics += 'END:VCALENDAR';
  const bl = new Blob([ics],{type:'text/calendar'}), u = URL.createObjectURL(bl), a = document.createElement('a');
  a.href = u; a.download = 'recruiting-deadlines.ics'; a.click(); URL.revokeObjectURL(u);
}



/* ---------- BACKUP ---------- */
function copyState(){
  const s = btoa(unescape(encodeURIComponent(JSON.stringify({a:APPS,c:CHECKS,n:NEXTID,v:5}))));
  const b = el('stateBox'); b.value = s; b.select();
  try { document.execCommand('copy'); alert('Backup code copied.'); } catch(e){ alert('Select the text and copy manually.'); }
}
function restoreState(){
  const v = el('stateBox').value.trim(); if(!v){ alert('Paste a code first.'); return; }
  try { const o = JSON.parse(decodeURIComponent(escape(atob(v))));
        if(o.a)APPS=o.a; if(o.c)CHECKS=o.c; if(o.n)NEXTID=o.n;
        save(); renderAll(); alert('Restored.'); }
  catch(e){ alert("That code didn't parse."); }
}
function resetState(){
  if(!confirm('Reset pipeline and checklist to defaults?')) return;
  if(HAS_LS) localStorage.removeItem(KEY);
  APPS = JSON.parse(JSON.stringify(SEED_APPS)); CHECKS={}; NEXTID=100; save(); renderAll();
}

/* ---------- INIT ---------- */
function renderAll(){ renderDate(); renderDigest(); renderTrk(); renderTable(); renderLive(); }

async function init(){
  try {
    const [fr, ap] = await Promise.all([
      fetch('firms.json').then(r => { if(!r.ok) throw new Error('firms.json '+r.status); return r.json(); }),
      fetch('apps.json').then(r => { if(!r.ok) throw new Error('apps.json '+r.status); return r.json(); })
    ]);
    FIRMS = fr; SEED_APPS = ap;
    try { const lr = await fetch('live_jobs.json', {cache:'no-store'});
          if (lr.ok) LIVE = await lr.json(); } catch(e) { LIVE = null; }
  } catch (e) {
    el('loadErr').style.display = 'block';
    el('loadErr').innerHTML = `<b>Couldn't load data files.</b> ${e.message}. <br>
      If you opened this file directly from your computer, browsers block local file loading —
      this page needs to be hosted (GitHub Pages) to work. Push all four files to your repo and open the live URL.`;
    return;
  }

  loadState();

  el('q').addEventListener('input', e => { query = e.target.value.toLowerCase().trim(); renderTable(); });
  el('sort').addEventListener('change', e => { sortBy = e.target.value; renderTable(); });
  el('hideClosed').addEventListener('change', e => { hideClosed = e.target.checked; renderTable(); });
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', function(){
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
    this.classList.add('on'); filter = this.dataset.c; renderTable();
  }));
  window.addEventListener('scroll', () => {
    let cur = '';
    document.querySelectorAll('.page[id]').forEach(s => { if (window.scrollY + 90 >= s.offsetTop) cur = s.id; });
    document.querySelectorAll('.nav a').forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#'+cur));
  }, {passive:true});

  renderAll(); save();
  el(HAS_LS ? 'lsGood' : 'lsWarn').style.display = 'block';
  updateNotifUI(); runNotifChecks(false);
  setInterval(() => { renderDate(); renderDigest(); }, 60000);
  setInterval(() => runNotifChecks(false), 30*60000);
}
document.addEventListener('DOMContentLoaded', init);
