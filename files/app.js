/* ============================================================
   RECRUITING COMMAND CENTER — app logic
   Data lives in firms.json / apps.json. Edit those, not this.
   ============================================================ */

const KEY = 'anshuman_recruiting_v5';
let FIRMS = [], APPS = [], CHECKS = {}, NEXTID = 100;
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

/* ---------- COUNTDOWNS ---------- */
const CD = [
  {l:'Cisco LIFT',        t:'Rolling — may close early. Apply now.', d:'2026-09-01', hot:1},
  {l:'Cornerstone',       t:'Deadline Sept 13, 11:59pm ET (confirmed)', d:'2026-09-13'},
  {l:'Analysis Group',    t:'Expect posting any day — deadline ~Sept 14', d:'2026-09-14', hot:1},
  {l:'Vanguard programs', t:'Opening late Aug — priority ends mid-Oct', d:'2026-10-15'},
  {l:'Fall semester',     t:'Final semester at NC State', d:'2026-08-19'},
  {l:'Graduation',        t:'December 2026', d:'2026-12-15'}
];
function renderCD(){
  el('cds').innerHTML = CD.map(c => {
    const n = days(c.d), cls = ((c.hot && n<=21) || n<=7) ? 'urgent' : n<=30 ? 'warn' : '';
    return `<div class="cd ${cls}"><div class="cd-l">${c.l}</div><div class="cd-t">${c.t}</div>
            <div class="cd-n">${n>0?n:'—'}</div><div class="cd-u">${n>0?'days':'passed'}</div></div>`;
  }).join('');
  el('hero-date').textContent = 'Recruiting command center · ' +
    now().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
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

/* ---------- TABLE ---------- */
let filter='all', query='', sortBy='default';
const ORD = {open:0, watch:1, applied:2, uncertain:3, notposted:4, closed:5};
const oc = o => o>=45?['o-str','of-str','Strong']:o>=30?['o-gd','of-gd','Good']:o>=20?['o-rl','of-rl','Realistic']:['o-cp','of-cp','Long shot'];

function renderTable(){
  const applied = new Set(APPS.map(a=>a.firm.toLowerCase()));
  let L = FIRMS.filter(f => {
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
  el('count').textContent = `Showing ${L.length} of ${FIRMS.length} targets`;

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
      ? '<span class="done-tag">✓ In pipeline</span>'
      : `<a class="ab" style="background:${c}" href="${f.link}" target="_blank">Open ↗</a><button class="miniadd" onclick="quickApply('${f.name.replace(/'/g,"\\'")}','${(f.role||'').replace(/'/g,"\\'")}')">+ Applied</button>`;
    return `<tr${done?' class="rowdone"':''}>
      <td class="strip" style="background:${c}"></td>
      <td><div class="fnrow">${logo}<div><div class="fn">${f.star?'⭐ ':''}${f.name}</div><div class="fr">${f.role}</div></div></div>
        <span class="badge b-${f.track}">${TN[f.track]}</span>${f.prog?' <span class="badge b-prog">🎓 Program</span>':''}${f.nc&&f.track!=='nc'?' <span class="badge b-nc">NC</span>':''}
        <div class="fnote">${f.note}</div>${vTag}</td>
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

/* ---------- CHECKLIST ---------- */
const CL = [
 {t:'This week',bg:'var(--sports-bg)',fg:'var(--sports)',items:[
  "<strong>Cisco LIFT — apply now.</strong> Rolling with early-close risk, Raleigh-based. Resume already tailored.",
  "<strong>Check Analysis Group iCIMS portal.</strong> Expect the 2027 posting any day; deadline likely ~Sept 14.",
  "<strong>Cornerstone — submit.</strong> Live since Aug 1, deadline Sept 13. Reviewed after deadline, so no rush penalty, but get it off your plate.",
  "<strong>WF Markets Analyst — prep.</strong> You've moved forward. Rates, FX, market structure + behavioral.",
  "<strong>Follow up: Capital One, Pacers.</strong> Both long quiet.",
  "<strong>Check Vanguard early-career page.</strong> They're actively posting; graduate programs should follow."]},
 {t:'Verify before trusting',bg:'#FBF3EC',fg:'var(--accent)',items:[
  "<strong>BofA QDA — call campus recruiting.</strong> Every posting found is intern-only. Ask directly whether external full-time applications are accepted.",
  "<strong>Mastercard US — join talent community.</strong> Zero US openings confirmed Aug 10.",
  "<strong>Goldman — check application page.</strong> Timelines vary by division. Max 4 applications per year, so choose deliberately.",
  "<strong>Spot-check anything marked 'unverified'</strong> in the table before investing real effort."]},
 {t:'September',bg:'var(--econ-bg)',fg:'var(--econ)',items:[
  "<strong>Sept 13 — Cornerstone deadline.</strong>",
  "<strong>Analysis Group deadline (~Sept 14)</strong> once posting is live.",
  "<strong>Vanguard priority window</strong> — apply by mid-Oct at the latest, earlier is materially better.",
  "<strong>Wells Fargo, Truist follow-ups</strong> if no movement."]},
 {t:'Interview prep',bg:'var(--strat-bg)',fg:'var(--strat)',items:[
  "<strong>Host OKC project on GitHub</strong> with a clean README you can link anywhere.",
  "<strong>Write out 5 core stories:</strong> Lowe's tariff analysis, Tableau dashboard, FDIC research, OKC project, SMT cross-functional work.",
  "<strong>10 cases out loud</strong> — market sizing, profitability, one sports-flavored.",
  "<strong>Know your numbers cold:</strong> 100M+ rows, 20+ KPIs, R²≥0.95, 9 banks, 25 years.",
  "<strong>Markets basics for WF:</strong> rates, FX, market structure."]}
];
function renderCL(){
  el('cl').innerHTML = CL.map((c,ci) => {
    const d = c.items.filter((_,i)=>CHECKS[ci+'-'+i]).length;
    return `<div class="cl"><div class="cl-h" style="background:${c.bg};color:${c.fg}"><span>${c.t}</span><span class="pill">${d} / ${c.items.length}</span></div>
      ${c.items.map((x,i)=>`<div class="cl-i ${CHECKS[ci+'-'+i]?'done':''}" onclick="tick(${ci},${i})"><div class="cb"></div><div class="ct">${x}</div></div>`).join('')}</div>`;
  }).join('');
}
function tick(ci,i){ CHECKS[ci+'-'+i] = !CHECKS[ci+'-'+i]; save(); renderCL(); }

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
function renderAll(){ renderCD(); renderDigest(); renderTrk(); renderTable(); renderCL(); }

async function init(){
  try {
    const [fr, ap] = await Promise.all([
      fetch('firms.json').then(r => { if(!r.ok) throw new Error('firms.json '+r.status); return r.json(); }),
      fetch('apps.json').then(r => { if(!r.ok) throw new Error('apps.json '+r.status); return r.json(); })
    ]);
    FIRMS = fr; SEED_APPS = ap;
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
  setInterval(() => { renderCD(); renderDigest(); }, 60000);
}
document.addEventListener('DOMContentLoaded', init);
