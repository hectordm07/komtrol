import { useMemo, useState } from 'react'

export type ChartDatum = {
  key: string
  label: string
  value: number
  detail?: string
}

export function ProfessionalBarChart({
  title,
  subtitle,
  data,
  selected,
  onSelect,
  valueFormatter = (value:number)=>value.toLocaleString('es-PE',{maximumFractionDigits:1}),
}:{
  title:string
  subtitle?:string
  data:ChartDatum[]
  selected?:string
  onSelect?:(key:string)=>void
  valueFormatter?:(value:number)=>string
}) {
  const max=Math.max(1,...data.map((row)=>Math.abs(row.value)))
  const [hovered,setHovered]=useState<string|null>(null)
  return (
    <section className="panel pro-chart-card">
      <div className="pro-chart-head"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div><span>{data.length} categorías</span></div>
      <div className="pro-bar-chart">
        {data.map((row)=>{
          const width=Math.max(row.value===0?0:4,Math.min(100,(Math.abs(row.value)/max)*100))
          const active=selected===row.key || hovered===row.key
          return <button
            type="button"
            key={row.key}
            className={active?'pro-bar-row active':'pro-bar-row'}
            onClick={()=>onSelect?.(row.key)}
            onMouseEnter={()=>setHovered(row.key)}
            onMouseLeave={()=>setHovered(null)}
            title={row.detail || `${row.label}: ${valueFormatter(row.value)}`}
          >
            <span className="pro-bar-label">{row.label}</span>
            <span className="pro-bar-track"><i style={{width:`${width}%`}} /></span>
            <b>{valueFormatter(row.value)}</b>
          </button>
        })}
        {!data.length&&<div className="pro-chart-empty">Sin información para graficar.</div>}
      </div>
    </section>
  )
}

export function ProfessionalDonutChart({
  title,
  subtitle,
  segments,
}:{
  title:string
  subtitle?:string
  segments:{label:string;value:number;className?:string}[]
}) {
  const total=segments.reduce((sum,row)=>sum+Math.max(0,row.value),0)
  const gradient=useMemo(()=>{
    if(!total) return 'conic-gradient(#e8edf5 0deg 360deg)'
    let cursor=0
    const palette=['#33439a','#5570d8','#7d8fe5','#9ca9ee','#bdc7f5']
    const parts=segments.map((row,index)=>{
      const start=cursor
      cursor+=(Math.max(0,row.value)/total)*360
      return `${palette[index%palette.length]} ${start}deg ${cursor}deg`
    })
    return `conic-gradient(${parts.join(',')})`
  },[segments,total])

  return (
    <section className="panel pro-chart-card">
      <div className="pro-chart-head"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div></div>
      <div className="pro-donut-layout">
        <div className="pro-donut" style={{background:gradient}} title={`Total: ${total}`}>
          <div><b>{total.toLocaleString('es-PE')}</b><span>Total</span></div>
        </div>
        <div className="pro-donut-legend">
          {segments.map((row,index)=><div key={row.label} title={`${row.label}: ${row.value}`}><i data-index={index}/><span>{row.label}</span><b>{row.value.toLocaleString('es-PE')}</b></div>)}
        </div>
      </div>
    </section>
  )
}

export function ProfessionalTrendChart({
  title,
  subtitle,
  points,
}:{
  title:string
  subtitle?:string
  points:{label:string;value:number}[]
}) {
  const max=Math.max(1,...points.map((row)=>row.value))
  const polyline=points.map((row,index)=>{
    const x=points.length<=1?50:5+(index*(90/(points.length-1)))
    const y=88-(row.value/max)*70
    return `${x},${y}`
  }).join(' ')
  return (
    <section className="panel pro-chart-card">
      <div className="pro-chart-head"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div></div>
      <div className="pro-trend-wrap">
        <svg className="pro-trend-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={title}>
          <line x1="5" y1="88" x2="95" y2="88" className="pro-axis"/>
          <line x1="5" y1="18" x2="95" y2="18" className="pro-gridline"/>
          <line x1="5" y1="53" x2="95" y2="53" className="pro-gridline"/>
          <polyline points={polyline} className="pro-trend-area-line"/>
          {points.map((row,index)=>{
            const x=points.length<=1?50:5+(index*(90/(points.length-1)))
            const y=88-(row.value/max)*70
            return <circle key={row.label} cx={x} cy={y} r="2.4" className="pro-trend-dot"><title>{row.label}: {row.value}</title></circle>
          })}
        </svg>
        <div className="pro-trend-labels">{points.map((row)=><span key={row.label}>{row.label}</span>)}</div>
      </div>
    </section>
  )
}
