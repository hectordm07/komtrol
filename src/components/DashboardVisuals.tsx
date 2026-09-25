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
  const insight=data.find((row)=>row.key===(hovered || selected))

  return (
    <section className="panel pro-chart-card">
      <div className="pro-chart-head">
        <div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>
        <span>{data.length} categorías</span>
      </div>
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
            onFocus={()=>setHovered(row.key)}
            onBlur={()=>setHovered(null)}
            title={row.detail || `${row.label}: ${valueFormatter(row.value)}`}
          >
            <span className="pro-bar-label">{row.label}</span>
            <span className="pro-bar-track"><i style={{width:`${width}%`}} /></span>
            <b>{valueFormatter(row.value)}</b>
          </button>
        })}
        {!data.length&&<div className="pro-chart-empty">Sin información para graficar.</div>}
      </div>
      {insight?.detail&&(
        <div className="pro-chart-insight">
          <b>{insight.label}</b>
          <span>{insight.detail}</span>
        </div>
      )}
    </section>
  )
}

export function ProfessionalDonutChart({
  title,
  subtitle,
  segments,
  onSelect,
}:{
  title:string
  subtitle?:string
  segments:{key?:string;label:string;value:number;className?:string}[]
  onSelect?:(key:string)=>void
}) {
  const [activeIndex,setActiveIndex]=useState<number|null>(null)
  const total=segments.reduce((sum,row)=>sum+Math.max(0,row.value),0)
  const active=activeIndex===null ? null : segments[activeIndex]
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
      <div className="pro-chart-head">
        <div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>
        {active&&<span>{active.label}</span>}
      </div>
      <div className="pro-donut-layout">
        <div className="pro-donut" style={{background:gradient}} title={active ? `${active.label}: ${active.value}` : `Total: ${total}`}>
          <div>
            <b>{(active?.value ?? total).toLocaleString('es-PE')}</b>
            <span>{active?.label || 'Total'}</span>
          </div>
        </div>
        <div className="pro-donut-legend">
          {segments.map((row,index)=>(
            <div
              key={row.key || row.label}
              className={activeIndex===index?'active':''}
              title={`${row.label}: ${row.value}`}
              tabIndex={0}
              role={onSelect ? 'button' : undefined}
              onClick={()=>onSelect?.(row.key || row.label)}
              onKeyDown={(event)=>{
                if(!onSelect) return
                if(event.key==='Enter' || event.key===' '){
                  event.preventDefault()
                  onSelect(row.key || row.label)
                }
              }}
              onMouseEnter={()=>setActiveIndex(index)}
              onMouseLeave={()=>setActiveIndex(null)}
              onFocus={()=>setActiveIndex(index)}
              onBlur={()=>setActiveIndex(null)}
            >
              <i data-index={index}/>
              <span>{row.label}</span>
              <b>{row.value.toLocaleString('es-PE')}</b>
            </div>
          ))}
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
  const [activeIndex,setActiveIndex]=useState<number|null>(null)
  const max=Math.max(1,...points.map((row)=>row.value))
  const active=points.length ? points[activeIndex ?? points.length-1] : undefined
  const polyline=points.map((row,index)=>{
    const x=points.length<=1?50:5+(index*(90/(points.length-1)))
    const y=88-(row.value/max)*70
    return `${x},${y}`
  }).join(' ')

  return (
    <section className="panel pro-chart-card">
      <div className="pro-chart-head">
        <div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>
        {active&&<span>{active.label} · {active.value.toLocaleString('es-PE')}</span>}
      </div>
      <div className="pro-trend-wrap" onMouseLeave={()=>setActiveIndex(null)}>
        <svg className="pro-trend-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={title}>
          <line x1="5" y1="88" x2="95" y2="88" className="pro-axis"/>
          <line x1="5" y1="18" x2="95" y2="18" className="pro-gridline"/>
          <line x1="5" y1="53" x2="95" y2="53" className="pro-gridline"/>
          <polyline points={polyline} className="pro-trend-area-line"/>
          {activeIndex!==null&&points[activeIndex]&&(()=>{
            const x=points.length<=1?50:5+(activeIndex*(90/(points.length-1)))
            return <line x1={x} y1="16" x2={x} y2="88" className="pro-trend-focus-line"/>
          })()}
          {points.map((row,index)=>{
            const x=points.length<=1?50:5+(index*(90/(points.length-1)))
            const y=88-(row.value/max)*70
            return <circle
              key={row.label}
              cx={x}
              cy={y}
              r={activeIndex===index?3.2:2.4}
              className={activeIndex===index?'pro-trend-dot active':'pro-trend-dot'}
              tabIndex={0}
              onMouseEnter={()=>setActiveIndex(index)}
              onFocus={()=>setActiveIndex(index)}
              onBlur={()=>setActiveIndex(null)}
            >
              <title>{row.label}: {row.value}</title>
            </circle>
          })}
        </svg>
        <div className="pro-trend-labels">{points.map((row,index)=><span className={activeIndex===index?'active':''} key={row.label}>{row.label}</span>)}</div>
      </div>
    </section>
  )
}
