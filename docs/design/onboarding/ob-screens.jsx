// HappiTime Onboarding — pre-feed screens: S1 splash, S2 location prime, S3 vibe picker.
// Loaded after ob-atoms.jsx.

const HOODS = ['Westport','Crossroads','River Market','Plaza','Downtown','Brookside','Waldo','North KC'];

const VIBES = [
  ['dive','Dive bar'], ['cocktails','Cocktails'], ['patio','Patio'], ['sports','Sports bar'],
  ['late','Late-night eats'], ['brewery','Brewery'], ['margs','Margs & tacos'], ['wine','Wine'],
];

// ── S1: Splash — single promise, one CTA ────────────────────────────────────
function ObSplash({ headline, onStart, accent }) {
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',padding:'0 28px 30px',background:HT.bg}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',gap:22}}>
        <ObLogo size={34} accent={accent}/>
        <div style={{fontSize:40,fontWeight:800,color:HT.text,letterSpacing:-0.9,lineHeight:1.08,textWrap:'balance'}}>{headline}</div>
        <div style={{fontSize:16,color:HT.muted,lineHeight:1.55}}>Live deals at Kansas City bars and restaurants. Built by locals, for locals.</div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <ObPrimaryBtn label="Find deals near me" onPress={onStart} accent={accent}/>
        <div style={{fontSize:12.5,color:HT.mutedLight,textAlign:'center',fontWeight:500}}>Browsing is free. No account needed.</div>
      </div>
    </div>
  );
}

// ── S2: Location prime (before the OS prompt) ───────────────────────────────
function ObMapVisual({ accent }) {
  return (
    <div style={{borderRadius:14,overflow:'hidden',border:`1px solid ${HT.border}`,boxShadow:'0 2px 8px rgba(26,26,26,0.06)'}}>
      <svg width="100%" viewBox="0 0 340 170" xmlns="http://www.w3.org/2000/svg" style={{display:'block'}}>
        <defs>
          <pattern id="obgrid" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M 26 0 L 0 0 0 26" fill="none" stroke="#c8cdd8" strokeWidth="0.6"/>
          </pattern>
        </defs>
        <rect width="340" height="170" fill="#dde1ec"/>
        <rect width="340" height="170" fill="url(#obgrid)"/>
        <rect x="24" y="46" width="110" height="13" rx="2" fill="#c8cdd8"/>
        <rect x="150" y="68" width="84" height="13" rx="2" fill="#c8cdd8"/>
        <rect x="250" y="42" width="76" height="13" rx="2" fill="#c8cdd8"/>
        <rect x="44" y="104" width="76" height="10" rx="1" fill="#c8cdd8"/>
        <rect x="206" y="118" width="96" height="10" rx="1" fill="#c8cdd8"/>
        <circle cx="170" cy="90" r="40" fill={accent} opacity="0.10"/>
        <circle cx="170" cy="90" r="40" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.5"/>
        {[[82,64],[232,58],[276,100],[118,120],[170,90]].map(([x,y],i)=>(
          <g key={i}>
            <circle cx={x} cy={y} r={i===4?10:8} fill={i===4?'#1A1A1A':accent} opacity="0.92"/>
            <circle cx={x} cy={y} r={i===4?4.5:3.5} fill="#fff"/>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ObLocationPrime({ accent, onBack, state, setState, requestAlert, onContinue }) {
  const [manual, setManual] = React.useState(false);
  const denied = state.locationStatus === 'denied';
  const showHoods = manual || denied;

  const askIOS = () => requestAlert({
    title: 'Allow \u201CHappiTime\u201D to use your location?',
    message: 'HappiTime shows happy hours within walking distance, only while you\u2019re using the app.',
    buttons: [
      { label: 'Allow While Using App', bold: true, grant: ()=>{ setState(s=>({...s, locationStatus:'granted', hood:'Westport'})); onContinue(); } },
      { label: 'Allow Once', grant: ()=>{ setState(s=>({...s, locationStatus:'granted', hood:'Westport'})); onContinue(); } },
      { label: 'Don\u2019t Allow', grant: ()=>setState(s=>({...s, locationStatus:'denied'})) },
    ],
  });

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',background:HT.bg,overflow:'hidden'}}>
      <div style={{padding:'2px 20px 0',minHeight:44,display:'flex',alignItems:'center'}}>
        <button onClick={onBack} aria-label="Go back" style={{width:36,height:36,borderRadius:18,background:HT.surface,border:`1px solid ${HT.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0}}>
          {ObIcons.back(HT.text)}
        </button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'14px 24px 8px',display:'flex',flexDirection:'column',gap:20}}>
        <ObMapVisual accent={accent}/>
        <div style={{fontSize:29,fontWeight:800,color:HT.text,letterSpacing:-0.5,lineHeight:1.12,textWrap:'balance'}}>Deals within walking distance</div>
        <div style={{fontSize:15,color:HT.muted,lineHeight:1.55,marginTop:-8}}>
          HappiTime sorts tonight’s happy hours by how close they are. We only use your location while you’re using the app.
        </div>
        {denied && !manual ? (
          <div style={{fontSize:13,color:HT.muted,background:HT.brandSubtle,borderRadius:12,padding:'12px 14px',lineHeight:1.5}}>
            No problem — pick a neighborhood instead. You can turn location on later in Settings.
          </div>
        ) : null}
        {showHoods ? (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{fontSize:12,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',color:HT.muted}}>Neighborhood</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              {HOODS.map(h=>{
                const on = state.hood === h;
                return (
                  <button key={h} onClick={()=>setState(s=>({...s, hood:h}))}
                    style={{padding:'10px 16px',borderRadius:999,border:`1px solid ${on?HT.dark:HT.border}`,background:on?HT.dark:HT.surface,color:on?'#fff':HT.text,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all 150ms cubic-bezier(0.4,0,0.2,1)',lineHeight:1}}>
                    {h}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
      <div style={{padding:'12px 24px 30px',display:'flex',flexDirection:'column',gap:8}}>
        {showHoods ? (
          <React.Fragment>
            <ObPrimaryBtn label={state.hood ? `Show deals in ${state.hood}` : 'Pick a neighborhood'} onPress={()=>{ if (state.hood) onContinue(); }} accent={accent} disabled={!state.hood}/>
            {!denied ? <ObSecondaryBtn label="Use my location instead" onPress={askIOS} muted/> : null}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <ObPrimaryBtn label="Enable location" onPress={askIOS} accent={accent}/>
            <ObSecondaryBtn label="Enter a neighborhood instead" onPress={()=>setManual(true)} muted/>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// ── S3: Optional vibe picker (skippable) ────────────────────────────────────
function ObVibePicker({ accent, onBack, state, setState, onContinue }) {
  const toggle = (v) => setState(s => ({
    ...s,
    vibes: s.vibes.includes(v) ? s.vibes.filter(x=>x!==v) : [...s.vibes, v],
  }));
  const n = state.vibes.length;
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',background:HT.bg,overflow:'hidden'}}>
      <div style={{padding:'2px 20px 0',minHeight:44,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <button onClick={onBack} aria-label="Go back" style={{width:36,height:36,borderRadius:18,background:HT.surface,border:`1px solid ${HT.border}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0}}>
          {ObIcons.back(HT.text)}
        </button>
        <button onClick={()=>{ setState(s=>({...s, vibes:[]})); onContinue(); }} style={{background:'none',border:'none',fontSize:14,fontWeight:600,color:HT.muted,cursor:'pointer',padding:'8px 4px',fontFamily:'inherit'}}>Skip</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'14px 24px 8px',display:'flex',flexDirection:'column',gap:14}}>
        <div style={{fontSize:29,fontWeight:800,color:HT.text,letterSpacing:-0.5,lineHeight:1.12}}>What’s your scene?</div>
        <div style={{fontSize:15,color:HT.muted,lineHeight:1.55}}>Pick any. This filters tonight’s deals — change it whenever.</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:8}}>
          {VIBES.map(([v,label])=>{
            const on = state.vibes.includes(v);
            return (
              <button key={v} onClick={()=>toggle(v)} aria-pressed={on}
                style={{minHeight:54,padding:'14px 16px',borderRadius:14,border:`1px solid ${on?HT.dark:HT.border}`,background:on?HT.dark:HT.surface,color:on?'#fff':HT.text,fontSize:15,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all 150ms cubic-bezier(0.4,0,0.2,1)',textAlign:'left',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                <span>{label}</span>
                {on ? ObIcons.check('#fff', 15) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{padding:'12px 24px 30px'}}>
        <ObPrimaryBtn label={n > 0 ? `Show tonight\u2019s deals (${n})` : 'Show tonight\u2019s deals'} onPress={onContinue} accent={accent}/>
      </div>
    </div>
  );
}

Object.assign(window, { ObSplash, ObLocationPrime, ObVibePicker, ObMapVisual, HOODS, VIBES });
