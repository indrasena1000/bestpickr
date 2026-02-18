// src/components/Skeleton.jsx
export function ResultSkeleton() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ background:'var(--paper)', border:'1px solid var(--line)', borderRadius:'var(--r3)', padding:'18px 20px' }}>
          <div style={{ display:'flex', gap:16, marginBottom:14 }}>
            <div className="skeleton" style={{ width:28, height:28, borderRadius:4 }}/>
            <div className="skeleton" style={{ width:72, height:72, borderRadius:'var(--r2)', flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div className="skeleton" style={{ height:10, width:'30%', borderRadius:4, marginBottom:8 }}/>
              <div className="skeleton" style={{ height:16, width:'80%', borderRadius:4, marginBottom:10 }}/>
              <div style={{ display:'flex', gap:8 }}>
                <div className="skeleton" style={{ height:22, width:70, borderRadius:4 }}/>
                <div className="skeleton" style={{ height:22, width:55, borderRadius:4 }}/>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div className="skeleton" style={{ height:28, width:80, borderRadius:4, marginBottom:6 }}/>
              <div className="skeleton" style={{ height:12, width:60, borderRadius:4 }}/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:16, paddingTop:14, borderTop:'1px solid var(--line)' }}>
            {[...Array(3)].map((_, j) => <div key={j}><div className="skeleton" style={{ height:10, width:'50%', borderRadius:4, marginBottom:6 }}/><div className="skeleton" style={{ height:14, width:'70%', borderRadius:4 }}/></div>)}
            <div className="skeleton" style={{ height:34, width:90, borderRadius:'var(--r)' }}/>
          </div>
        </div>
      ))}
    </div>
  )
}

export function HomeTableSkeleton() {
  return (
    <div style={{ background:'var(--paper)', border:'1px solid var(--line)', borderRadius:'var(--r3)', overflow:'hidden' }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} style={{ display:'grid', gridTemplateColumns:'40px 1fr 90px 90px 100px 120px', padding:'14px 16px', borderBottom:'1px solid var(--line)', alignItems:'center', gap:16 }}>
          <div className="skeleton" style={{ height:16, borderRadius:4 }}/>
          <div><div className="skeleton" style={{ height:14, width:'75%', borderRadius:4, marginBottom:6 }}/><div className="skeleton" style={{ height:10, width:'40%', borderRadius:4 }}/></div>
          <div className="skeleton" style={{ height:22, borderRadius:4 }}/>
          <div className="skeleton" style={{ height:14, borderRadius:4 }}/>
          <div className="skeleton" style={{ height:16, borderRadius:4 }}/>
          <div className="skeleton" style={{ height:32, borderRadius:'var(--r)' }}/>
        </div>
      ))}
    </div>
  )
}
