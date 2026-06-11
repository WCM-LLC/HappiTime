// HappiTime Onboarding — S4 feed (the aha moment), S5 earned signup sheet,
// S6 contextual notification prime. Loaded after ob-atoms.jsx / ob-screens.jsx.

const OB_VENUES = [
  { id:'manifesto', name:'Manifesto', hood:'River Market', kind:'Cocktail bar', deal:'$9 craft cocktails', dist:'1.6 mi', ends:24, vibes:['cocktails'] },
  { id:'cava', name:'\u00C7a Va', hood:'Westport', kind:'Champagne bar', deal:'$7 sparkling pours', dist:'0.4 mi', ends:53, vibes:['wine','cocktails'] },
  { id:'crossroads', name:'Crossroads Hotel Bar', hood:'Crossroads', kind:'Hotel bar', deal:'$8 cocktails \u00B7 $12 wine', dist:'1.2 mi', ends:53, vibes:['cocktails','wine','patio'] },
  { id:'peanut', name:'The Peanut', hood:'Westport', kind:'Dive bar', deal:'$3 domestics \u00B7 half-off apps', dist:'0.4 mi', ends:84, vibes:['dive','sports','late'] },
  { id:'alehouse', name:'Westport Ale House', hood:'Westport', kind:'Taproom', deal:'$4 drafts \u00B7 $6 cocktails', dist:'0.8 mi', ends:84, vibes:['brewery','sports'] },
  { id:'ponaks', name:'Ponak\u2019s', hood:'Southwest Blvd', kind:'Mexican kitchen', deal:'$6 margs \u00B7 taco plates', dist:'1.1 mi', ends:97, vibes:['margs','late'] },
  { id:'charbar', name:'Char Bar', hood:'Westport', kind:'BBQ + beer garden', deal:'Half-price wings \u00B7 $5 drafts', dist:'0.5 mi', ends:142, vibes:['patio','late'] },
  { id:'mccoys', name:'McCoy\u2019s Public House', hood:'Westport', kind:'Brewpub', deal:'$1 off house drafts', dist:'0.6 mi', ends:173, vibes:['brewery','patio'] },
];

function fmtEnds(min) {
  if (min <= 0) return 'Ended';
  if (min < 60) return `Ends in ${min}m`;
  return `Ends in ${Math.floor(min/60)}h ${min%60 ? (min%60)+'m' : ''}`.trim();
}

// ── Deal card ───────────────────────────────────────────────────────────────
function ObDealCard({ venue, elapsed, saved, checkedIn, onSave, onCheckIn, accent }) {
  const left = venue.ends - elapsed;
  const urgent = left < 30;
  return (
    <div style={{background:HT.surface,borderRadius:14,border:`1px solid ${HT.border}`,boxShadow:'0 2px 8px rgba(26,26,26,0.06)',padding:13,display:'flex',flexDirection:'column',gap:11}}>
      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
        <div style={{width:62,height:62,flexShrink:0}}><PhotoSlot h={62} label="photo"/></div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15.5,fontWeight:700,color:HT.text,lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{venue.name}</div>
          <div style={{fontSize:11.5,color:HT.muted,marginTop:2.5,fontWeight:500}}>{venue.hood} · {venue.kind} · {venue.dist}</div>
          <div style={{display:'inline-flex',marginTop:7,background:HT.brandSubtle,borderRadius:999,padding:'4px 10px'}}>
            <span style={{fontSize:12,fontWeight:700,color:HT.brandDarkAlt,lineHeight:1.3}}>{venue.deal}</span>
          </div>
        </div>
        <button onClick={onSave} aria-label={saved?'Saved':'Save'} style={{background:'none',border:'none',cursor:'pointer',padding:'2px 0 6px 8px',lineHeight:1,flexShrink:0,transition:'transform 150ms'}}>
          {saved ? ObIcons.heartFill(accent, 22) : ObIcons.heart(HT.mutedLight, 22)}
        </button>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:5,background:urgent?HT.warningLight:'transparent',border:urgent?'1px solid #EFDFAE':'none',borderRadius:999,padding:urgent?'4px 10px':'4px 0'}}>
          {ObIcons.clock(urgent?'#9C7A1E':HT.mutedLight)}
          <span style={{fontSize:12,fontWeight:urgent?700:600,color:urgent?'#9C7A1E':HT.mutedLight,fontVariantNumeric:'tabular-nums'}}>{fmtEnds(left)}</span>
        </div>
        <button onClick={onCheckIn} disabled={checkedIn}
          style={{padding:'8px 16px',borderRadius:999,border:`1px solid ${checkedIn?'transparent':HT.border}`,background:checkedIn?HT.successLight:'transparent',color:checkedIn?HT.success:HT.text,fontSize:12.5,fontWeight:700,cursor:checkedIn?'default':'pointer',fontFamily:'inherit',transition:'all 150ms',display:'flex',alignItems:'center',gap:5,lineHeight:1}}>
          {checkedIn ? ObIcons.check(HT.success, 13) : null}
          {checkedIn ? 'Checked in' : 'Check in'}
        </button>
      </div>
    </div>
  );
}

// ── S4: Feed ────────────────────────────────────────────────────────────────
function ObFeed({ accent, state, setState, onGated }) {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(()=>setElapsed(Math.floor((Date.now()-t0)/60000)), 20000);
    return ()=>clearInterval(iv);
  }, []);

  const active = state.vibes;
  const venues = OB_VENUES
    .filter(v => active.length === 0 || v.vibes.some(x => active.includes(x)))
    .sort((a,b) => (a.ends - b.ends) || (parseFloat(a.dist) - parseFloat(b.dist)));

  const toggleVibe = (v) => setState(s => ({
    ...s,
    vibes: v === null ? [] : (s.vibes.includes(v) ? s.vibes.filter(x=>x!==v) : [...s.vibes, v]),
  }));

  const hoodLabel = state.hood || 'you';

  return (
    <div style={{flex:1,overflowY:'auto',background:HT.bg}}>
      <div style={{padding:'6px 20px 0'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',minHeight:40}}>
          <div style={{display:'flex',alignItems:'center',gap:6,background:HT.surface,border:`1px solid ${HT.border}`,borderRadius:999,padding:'7px 13px'}}>
            {ObIcons.pin(accent, 13)}
            <span style={{fontSize:12.5,fontWeight:700,color:HT.text,lineHeight:1}}>{state.locationStatus==='granted' ? 'Near you' : (state.hood || 'Kansas City')}</span>
          </div>
          {state.signedIn ? (
            <div style={{width:34,height:34,borderRadius:17,background:HT.brandSubtle,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:accent}}>J</div>
          ) : null}
        </div>
        <div style={{fontSize:30,fontWeight:800,color:HT.text,letterSpacing:-0.6,lineHeight:1.05,marginTop:14}}>Tonight near {hoodLabel}</div>
        <div style={{fontSize:13,color:HT.muted,marginTop:5}}>Sorted by ending soonest · closest</div>
      </div>
      <div style={{display:'flex',gap:7,overflowX:'auto',padding:'14px 20px 4px'}}>
        <button onClick={()=>toggleVibe(null)} style={{flexShrink:0,padding:'8px 15px',borderRadius:999,border:`1px solid ${active.length===0?HT.dark:HT.border}`,background:active.length===0?HT.dark:HT.surface,color:active.length===0?'#fff':HT.text,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',lineHeight:1,transition:'all 120ms'}}>All</button>
        {VIBES.map(([v,label])=>{
          const on = active.includes(v);
          return (
            <button key={v} onClick={()=>toggleVibe(v)} style={{flexShrink:0,padding:'8px 15px',borderRadius:999,border:`1px solid ${on?HT.dark:HT.border}`,background:on?HT.dark:HT.surface,color:on?'#fff':HT.text,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',lineHeight:1,transition:'all 120ms'}}>{label}</button>
          );
        })}
      </div>
      <div style={{padding:'10px 20px 8px',fontSize:13,fontWeight:700,color:HT.text}}>{venues.length} deals on now</div>
      <div style={{display:'flex',flexDirection:'column',gap:10,padding:'0 20px 90px'}}>
        {venues.map(v=>(
          <ObDealCard key={v.id} venue={v} elapsed={elapsed} accent={accent}
            saved={state.saved.includes(v.id)}
            checkedIn={state.checkins.includes(v.id)}
            onSave={()=>onGated('save', v)}
            onCheckIn={()=>onGated('checkin', v)}/>
        ))}
        {venues.length === 0 ? (
          <div style={{textAlign:'center',padding:'40px 20px',color:HT.muted,fontSize:14,lineHeight:1.5}}>No matches yet — try another vibe.</div>
        ) : null}
      </div>
    </div>
  );
}

// ── S5: Earned signup sheet ─────────────────────────────────────────────────
function ObSignupSheet({ venue, action, accent, busy, onApple, onGoogle, onDismiss }) {
  const title = action === 'checkin' ? `Check in at ${venue.name}?` : `Save ${venue.name}?`;
  const body = action === 'checkin'
    ? 'Check-ins earn Rounds \u2014 your status at KC spots. Takes 10 seconds with Apple or Google.'
    : 'Keep your saves on every device and start earning Rounds. Takes 10 seconds with Apple or Google.';
  return (
    <ObSheet onDismiss={busy ? undefined : onDismiss}>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div style={{fontSize:21,fontWeight:800,color:HT.text,letterSpacing:-0.3,lineHeight:1.2}}>{title}</div>
        <div style={{fontSize:14,color:HT.muted,lineHeight:1.5,marginBottom:10}}>{body}</div>
        {busy ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'26px 0',color:HT.muted,fontSize:14,fontWeight:600}}>
            <div style={{width:16,height:16,border:`2px solid ${HT.border}`,borderTopColor:accent,borderRadius:'50%',animation:'obSpin 700ms linear infinite'}}></div>
            Signing in…
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button onClick={onApple} style={{width:'100%',background:'#000',color:'#fff',border:'none',borderRadius:999,padding:'14px 0',fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {ObIcons.apple('#fff', 15)} Continue with Apple
            </button>
            <button onClick={onGoogle} style={{width:'100%',background:HT.surface,color:HT.text,border:`1px solid ${HT.border}`,borderRadius:999,padding:'14px 0',fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              <span style={{fontWeight:800,fontSize:15,color:'#4285F4'}}>G</span> Continue with Google
            </button>
            <button onClick={onDismiss} style={{width:'100%',background:'transparent',color:HT.muted,border:'none',padding:'10px 0',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>Not now</button>
          </div>
        )}
      </div>
    </ObSheet>
  );
}

// ── S6: Contextual notification prime ───────────────────────────────────────
function ObNotifSheet({ venue, accent, onNotify, onDismiss }) {
  return (
    <ObSheet onDismiss={onDismiss}>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div style={{width:52,height:52,borderRadius:26,background:HT.brandSubtle,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:4}}>
          {ObIcons.bell(accent, 24)}
        </div>
        <div style={{fontSize:21,fontWeight:800,color:HT.text,letterSpacing:-0.3,lineHeight:1.2}}>Want a ping before {venue.name} starts?</div>
        <div style={{fontSize:14,color:HT.muted,lineHeight:1.5,marginBottom:10}}>One alert, 30 minutes before happy hour at places you save. Nothing else.</div>
        <ObPrimaryBtn label="Notify me" onPress={onNotify} accent={accent}/>
        <button onClick={onDismiss} style={{width:'100%',background:'transparent',color:HT.muted,border:'none',padding:'10px 0',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>No thanks</button>
      </div>
    </ObSheet>
  );
}

Object.assign(window, { OB_VENUES, ObDealCard, ObFeed, ObSignupSheet, ObNotifSheet, fmtEnds });
