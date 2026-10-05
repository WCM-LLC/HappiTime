// Client behaviour for the Social Life Brunch RSVP page. Submissions go to the
// RSVP Google Sheet through its Apps Script web app (text/plain avoids a CORS preflight).
/* Where RSVPs are sent. Leave empty for preview mode (nothing is stored).
   Set to a JSON endpoint (Google Apps Script web app, form backend, Supabase function) to go live. */
const RSVP_ENDPOINT = "https://script.google.com/macros/s/AKfycbyP19EFoPp-seILpYpV9Fvw8levDVId3W_BAdyBDwumcMXt8WOS8IrlzLDtlBJcgbJ2/exec";

const SECTORS = [
  {k:'founder',    label:'Business owner / founder', org:'Company name',          q:'How long has it been running?', opts:['Idea stage','Under 1 year','1–5 years','5+ years']},
  {k:'creator',    label:'Creator & media',          org:'Brand or channel name', q:'Main platform and audience',     opts:['Instagram','TikTok','YouTube','Podcast','Writing / press'], q2:'Audience size', opts2:['Under 5K','5K–25K','25K–100K','100K+']},
  {k:'hospitality',label:'Hospitality, food & drink',org:'Venue or brand',        q:'Your role',                      opts:['Owner','GM / manager','Bar or kitchen team','Brand / distributor']},
  {k:'tech',       label:'Tech',                     org:'Company',               q:'Your role',                      opts:['Founder','Engineering','Product / design','Sales / growth']},
  {k:'realestate', label:'Real estate',              org:'Company or brokerage',  q:'Your focus',                     opts:['Residential','Commercial','Development','Investing']},
  {k:'finance',    label:'Finance & legal',          org:'Firm',                  q:'Your focus',                     opts:['Banking / lending','Investing / VC','Accounting / tax','Legal','Insurance']},
  {k:'health',     label:'Health, wellness & beauty',org:'Practice or brand',     q:'Your focus',                     opts:['Clinical','Fitness','Beauty','Mental health']},
  {k:'sports',     label:'Sports & entertainment',   org:'Team, label or company',q:'Your role',                      opts:['Athlete','Artist / performer','Management / agency','Events / production']},
  {k:'corporate',  label:'Corporate professional',   org:'Company',               q:'Your level',                     opts:['Individual contributor','Manager','Director','VP and above']},
  {k:'community',  label:'Community & nonprofit',    org:'Organization',          q:'Your role',                      opts:['Founder / ED','Staff','Board','Organizer / volunteer']}
];
const GOALS = ['Meet clients','Meet investors','Find collaborators','Hire or get hired','Just a great afternoon'];


export function initRsvp(root) {
  if (!root || root.dataset.ready === "1") return;
  root.dataset.ready = "1";

  const $ = id => document.getElementById(id);
  const form = $('rsvpForm');
  const steps = [...form.querySelectorAll('.step')];
  const dots = [...document.querySelectorAll('.steps li')];
  const labels = ['Your world','About you','Your seat'];
  let step = 1;
  const state = { sector:null, detail:null, detail2:null, goals:new Set() };

  function chip(name, value, label, type){
    const l = document.createElement('label'); l.className = 'chip';
    const i = document.createElement('input'); i.type = type; i.name = name; i.value = value;
    const s = document.createElement('span'); s.textContent = label;
    l.append(i, s); return l;
  }
  // step 1 chips
  const sc = $('sectorChips');
  SECTORS.forEach(s => sc.append(chip('sector', s.k, s.label, 'radio')));
  sc.addEventListener('change', e => { state.sector = e.target.value; state.detail = state.detail2 = null; $('sectorErr').textContent=''; buildStep2(); });
  // goals
  const gc = $('goalChips');
  GOALS.forEach(g => gc.append(chip('goal', g, g, 'checkbox')));
  gc.addEventListener('change', e => { e.target.checked ? state.goals.add(e.target.value) : state.goals.delete(e.target.value); });

  function buildStep2(){
    const s = SECTORS.find(x => x.k === state.sector); if (!s) return;
    $('s2Title').textContent = s.label;
    $('orgLabel').textContent = s.org;
    $('detailLegend').textContent = s.q;
    const dc = $('detailChips'); dc.textContent = '';
    s.opts.forEach(o => dc.append(chip('detail', o, o, 'radio')));
    if (s.opts2){
      const sep = document.createElement('div'); sep.className = 'chip-sep'; sep.textContent = s.q2; dc.append(sep);
      s.opts2.forEach(o => dc.append(chip('detail2', o, o, 'radio')));
    }
  }
  $('detailChips').addEventListener('change', e => { if (e.target.name==='detail') state.detail = e.target.value; else state.detail2 = e.target.value; $('detailErr').textContent=''; });

  function go(n){
    step = n;
    steps.forEach(s => s.hidden = +s.dataset.step !== n);
    dots.forEach((d,i) => d.classList.toggle('on', i < n));
    $('stepLabel').textContent = `Step ${n} of 3 · ${labels[n-1]}`;
    const first = steps[n-1].querySelector('input:not([type=hidden])');
    if (first) first.focus({preventScroll:true});
    $('rsvp').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
  }

  function setErr(name, msg){
    const f = form.querySelector(`[data-field="${name}"]`); if (!f) return;
    f.classList.toggle('invalid', !!msg); f.querySelector('.err').textContent = msg || '';
  }
  const val = id => $(id).value.trim();
  const partySize = () => form.querySelector('input[name=party]:checked').value === '2' ? 2 : 1;

  function check(n){
    if (n === 1){
      if (!state.sector){ $('sectorErr').textContent = 'Pick the one that fits best.'; sc.querySelector('input').focus(); return false; }
      return true;
    }
    if (n === 2){
      const s = SECTORS.find(x => x.k === state.sector);
      let ok = true;
      if (!val('org')){ setErr('org', `Add your ${s.org.toLowerCase()}.`); ok = false; } else setErr('org','');
      const need2 = !!s.opts2;
      if (!state.detail || (need2 && !state.detail2)){ $('detailErr').textContent = need2 ? 'Pick a platform and an audience size.' : 'Pick one.'; ok = false; }
      if (!ok){ (val('org') ? $('detailChips').querySelector('input') : $('org')).focus(); }
      return ok;
    }
    const errs = {};
    if (!val('first')) errs.first = 'Add your first name.';
    if (!val('last')) errs.last = 'Add your last name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val('email'))) errs.email = 'Enter an email like name@example.com.';
    if (val('phone').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'').length !== 10) errs.phone = 'Enter a 10-digit mobile number.';
    if (!val('invitedBy')) errs.invitedBy = 'Tell us which host invited you.';
    if (partySize() === 2 && !val('guest')) errs.guest = "Add your guest's name, or switch to Just me.";
    ['first','last','email','phone','invitedBy','guest'].forEach(k => setErr(k, errs[k]));
    const dress = $('dress').checked;
    $('dressCheck').classList.toggle('invalid', !dress);
    $('dressErr').textContent = dress ? '' : 'Please confirm the brown-and-blue dress code.';
    const firstBad = Object.keys(errs)[0] || (dress ? null : 'dress');
    if (firstBad) $(firstBad).focus();
    return !firstBad;
  }

  form.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => { if (check(step)) go(step + 1); }));
  form.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => go(step - 1)));
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && step < 3 && e.target.tagName === 'INPUT' && e.target.type === 'text'){ e.preventDefault(); if (check(step)) go(step+1); } });

  form.querySelectorAll('input[name=party]').forEach(r => r.addEventListener('change', () => {
    $('guestField').hidden = partySize() !== 2; if (!$('guestField').hidden) $('guest').focus();
  }));
  $('phone').addEventListener('blur', () => {
    const d = $('phone').value.replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
    if (d.length === 10) $('phone').value = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  });
  $('ig').addEventListener('blur', () => { const v = $('ig').value.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/\/$/,''); $('ig').value = v && !v.startsWith('@') ? '@'+v : v; });
  form.querySelectorAll('.field input').forEach(i => i.addEventListener('input', () => { const f = i.closest('.field'); if (f.classList.contains('invalid')){ f.classList.remove('invalid'); f.querySelector('.err').textContent=''; } }));
  $('dress').addEventListener('change', () => { if ($('dress').checked){ $('dressCheck').classList.remove('invalid'); $('dressErr').textContent=''; } });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (step !== 3){ if (check(step)) go(step+1); return; }
    if (!check(3)) return;
    const s = SECTORS.find(x => x.k === state.sector);
    const data = {
      event: 'The Social Life Brunch, Fall Edition (2026-10-11)',
      sector: s.label, organization: val('org'),
      sector_detail: state.detail, sector_detail_2: state.detail2 || '',
      goals: [...state.goals],
      first: val('first'), last: val('last'), email: val('email'), phone: val('phone'),
      instagram: val('ig'), invited_by: val('invitedBy'),
      party_size: partySize(), guest_name: partySize()===2 ? val('guest') : '',
      dress_code_ack: true, happitime_optin: $('optin').checked,
      submitted_at: new Date().toISOString()
    };
    let recorded = false;
    $('sendErr').textContent = '';
    if (RSVP_ENDPOINT){
      const btn = $('submitBtn'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const r = await fetch(RSVP_ENDPOINT, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(data) });
        const j = await r.json().catch(() => ({ ok: r.ok })); if (!r.ok || j.ok === false) throw new Error(); recorded = true;
      } catch {
        $('sendErr').textContent = "Your RSVP didn't go through. Check your connection and try again, or text 816-721-1419.";
        btn.disabled = false; btn.textContent = 'Request my seat'; return;
      }
      btn.disabled = false; btn.textContent = 'Request my seat';
    }
    $('tName').textContent = `${data.first} ${data.last}`;
    $('tParty').textContent = data.party_size === 2 ? `Party of 2 · with ${data.guest_name}` : 'Party of 1';
    $('doneTitle').textContent = `You're on the list, ${data.first}`;
    $('previewNote').hidden = recorded;
    $('formView').hidden = true; $('doneView').hidden = false;
    $('doneView').focus({preventScroll:true});
    $('rsvp').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
  });

  $('editBtn').addEventListener('click', () => { $('doneView').hidden = true; $('formView').hidden = false; go(1); });

  $('copyBtn').addEventListener('click', async e => {
    const b = e.currentTarget;
    try { await navigator.clipboard.writeText('816-721-1419'); b.textContent = 'Copied'; }
    catch { const r = document.createRange(); r.selectNodeContents($('phoneNum')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected'; }
    setTimeout(() => b.textContent = 'Copy', 1800);
  });
}
