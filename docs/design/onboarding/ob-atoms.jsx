// HappiTime Onboarding — shared atoms.
// Palette + buttons + bottom sheet + simulated OS alert + logo + toast.

const HT = {
  brand:'#C8965A', brandDark:'#A67842', brandSubtle:'#F5EDE3', brandDarkAlt:'#8B6535',
  dark:'#1A1A1A', bg:'#FAFAF8', surface:'#FFFFFF',
  text:'#1A1A1A', muted:'#6B6B6B', mutedLight:'#9B9B9B',
  border:'#E8E5E0', success:'#2D8A56', successLight:'#ECFDF5',
  error:'#C43E3E', warning:'#D4A843', warningLight:'#FFFBEB',
};

// Striped placeholder for venue photography
function PhotoSlot({ h = 54, label = '' }) {
  return (
    <div style={{height:h,width:'100%',borderRadius:8,background:`repeating-linear-gradient(-45deg, ${HT.brandSubtle}, ${HT.brandSubtle} 6px, #EFE3D2 6px, #EFE3D2 12px)`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
      {label ? <span style={{fontFamily:'ui-monospace,Menlo,monospace',fontSize:8,color:HT.brandDarkAlt,letterSpacing:0.5}}>{label}</span> : null}
    </div>
  );
}

function ObPrimaryBtn({ label, onPress, accent = HT.brand, disabled, small }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <button
      onClick={onPress}
      onMouseDown={()=>setPressed(true)} onMouseUp={()=>setPressed(false)} onMouseLeave={()=>setPressed(false)}
      disabled={disabled}
      style={{width:'100%',background:accent,color:'#fff',border:'none',borderRadius:999,padding:small?'12px 0':'15px 0',fontSize:small?14:15,fontWeight:700,cursor:'pointer',letterSpacing:0.2,fontFamily:'inherit',transition:'all 150ms cubic-bezier(0.4,0,0.2,1)',opacity:disabled?0.5:pressed?0.9:1,transform:pressed?'scale(0.98)':'none'}}>
      {label}
    </button>
  );
}

function ObSecondaryBtn({ label, onPress, muted }) {
  const [pressed, setPressed] = React.useState(false);
  return (
    <button
      onClick={onPress}
      onMouseDown={()=>setPressed(true)} onMouseUp={()=>setPressed(false)} onMouseLeave={()=>setPressed(false)}
      style={{width:'100%',background:muted?'transparent':HT.surface,color:muted?HT.muted:HT.text,border:muted?'none':`1px solid ${HT.border}`,borderRadius:999,padding:muted?'10px 0':'14px 0',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all 150ms cubic-bezier(0.4,0,0.2,1)',opacity:pressed?0.9:1,transform:pressed?'scale(0.98)':'none'}}>
      {label}
    </button>
  );
}

// Simulated iOS permission alert (renders inside the device screen)
function ObSystemAlert({ title, message, buttons }) {
  return (
    <div style={{position:'absolute',inset:0,zIndex:80,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.28)',animation:'obFade 180ms ease-out'}}>
      <div style={{width:272,borderRadius:14,overflow:'hidden',background:'rgba(248,248,248,0.97)',backdropFilter:'blur(20px)',boxShadow:'0 12px 40px rgba(0,0,0,0.25)',fontFamily:'-apple-system,"SF Pro",system-ui,sans-serif'}}>
        <div style={{padding:'18px 16px 16px',textAlign:'center'}}>
          <div style={{fontSize:15,fontWeight:600,color:'#000',lineHeight:1.3}}>{title}</div>
          <div style={{fontSize:12.5,color:'#000',marginTop:5,lineHeight:1.35}}>{message}</div>
        </div>
        {buttons.map((b)=>(
          <button key={b.label} onClick={b.onPress} style={{display:'block',width:'100%',padding:'11px 0',background:'none',border:'none',borderTop:'0.5px solid rgba(60,60,67,0.29)',fontSize:16,color:'#007AFF',fontWeight:b.bold?600:400,cursor:'pointer',fontFamily:'inherit'}}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Bottom sheet with backdrop (renders inside the device screen)
function ObSheet({ onDismiss, children }) {
  return (
    <div style={{position:'absolute',inset:0,zIndex:70,display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
      <div onClick={onDismiss} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.32)',animation:'obFade 200ms ease-out'}}></div>
      <div style={{position:'relative',background:HT.surface,borderRadius:'22px 22px 0 0',padding:'10px 24px 40px',boxShadow:'0 -8px 32px rgba(0,0,0,0.14)',animation:'obSlideUp 320ms cubic-bezier(0.32,0.72,0,1)'}}>
        <div style={{width:38,height:5,borderRadius:3,background:HT.border,margin:'0 auto 18px'}}></div>
        {children}
      </div>
    </div>
  );
}

// Transient toast pinned near the bottom of the screen
function ObToast({ text, visible }) {
  return (
    <div style={{position:'absolute',left:20,right:20,bottom:34,zIndex:60,display:'flex',justifyContent:'center',pointerEvents:'none',opacity:visible?1:0,transform:visible?'translateY(0)':'translateY(10px)',transition:'all 280ms cubic-bezier(0.4,0,0.2,1)'}}>
      <div style={{background:'rgba(26,26,26,0.94)',color:'#F5F5F3',borderRadius:999,padding:'11px 20px',fontSize:13,fontWeight:600,boxShadow:'0 6px 24px rgba(0,0,0,0.25)',textAlign:'center',lineHeight:1.4}}>
        {text}
      </div>
    </div>
  );
}

// HappiTime wordmark approximation: copper circle behind "iTi"
function ObLogo({ size = 40, accent = HT.brand }) {
  return (
    <div style={{position:'relative',display:'inline-block',fontFamily:"'Plus Jakarta Sans',ui-sans-serif,sans-serif",fontWeight:800,letterSpacing:'-0.02em',fontSize:size,lineHeight:1,whiteSpace:'nowrap'}}>
      <span style={{position:'absolute',left:'2.42em',top:'-0.17em',width:'1.34em',height:'1.34em',borderRadius:'50%',background:accent}}></span>
      <span style={{position:'relative',color:HT.dark}}>Happ</span>
      <span style={{position:'relative',color:'#fff'}}>iTi</span>
      <span style={{position:'relative',color:HT.dark}}>me</span>
    </div>
  );
}

const ObIcons = {
  pin: (c, s=26)=><svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>,
  bell: (c, s=26)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  heart: (c, s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  heartFill: (c, s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  check: (c, s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  clock: (c, s=12)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  back: (c, s=16)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  apple: (c, s=16)=><svg width={s} height={s} viewBox="0 0 384 512" fill={c}><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>,
};

Object.assign(window, { HT, PhotoSlot, ObPrimaryBtn, ObSecondaryBtn, ObSystemAlert, ObSheet, ObToast, ObLogo, ObIcons });
