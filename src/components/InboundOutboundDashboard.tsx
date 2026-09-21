import { Clock3, TrendingDown, TrendingUp, Users } from 'lucide-react'

type Row = {
  year:number
  month:number
  period_date:string
  warehouse:string
  site_name:string
  site_group:string|null
  source_row:number|null
  data:Record<string,unknown>
}

type Props = {
  rows:Row[]
  historical:Row[]
  year:number
  month:number
  contextLabel:string
}

function num(value:unknown){
  if(typeof value==='number') return Number.isFinite(value)?value:0
  const parsed=Number(String(value??'').replace(/,/g,'').trim())
  return Number.isFinite(parsed)?parsed:0
}

function avg(values:number[]){
  const clean=values.filter((value)=>Number.isFinite(value))
  return clean.length?clean.reduce((sum,value)=>sum+value,0)/clean.length:0
}

function fmt(value:number,digits=0){
  return value.toLocaleString('es-PE',{maximumFractionDigits:digits,minimumFractionDigits:digits})
}

function withoutConsolidated(rows:Row[]){
  return rows.filter((row)=>
    row.warehouse!=='GLOBAL' &&
    row.site_group!=='CONSOLIDADO' &&
    !row.site_name.toUpperCase().includes('CONSOLIDADO')
  )
}

function Sparkline({values}:{values:number[]}){
  const width=260
  const height=70
  if(!values.length) return <div className="io-sparkline empty"/>
  const min=Math.min(...values)
  const max=Math.max(...values)
  const range=max-min || 1
  const points=values.map((value,index)=>{
    const x=values.length===1?width/2:index/(values.length-1)*width
    const y=height-8-((value-min)/range)*(height-16)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg className="io-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke"/>
    </svg>
  )
}

function Gauge({value,target}:{value:number;target:number}){
  const max=Math.max(target*2,90,value*1.12,1)
  const clamped=Math.max(0,Math.min(max,value))
  const angle=-90+(clamped/max)*180
  const radius=76
  const cx=100
  const cy=94

  const polar=(deg:number)=>{
    const rad=(deg-90)*Math.PI/180
    return {x:cx+radius*Math.cos(rad),y:cy+radius*Math.sin(rad)}
  }

  const arc=(start:number,end:number)=>{
    const a=polar(start)
    const b=polar(end)
    return `M ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y}`
  }

  const needleRad=(angle-90)*Math.PI/180
  const nx=cx+62*Math.cos(needleRad)
  const ny=cy+62*Math.sin(needleRad)

  const zones=[
    {start:-90,end:-55,cls:'z1'},
    {start:-55,end:-20,cls:'z2'},
    {start:-20,end:15,cls:'z3'},
    {start:15,end:50,cls:'z4'},
    {start:50,end:90,cls:'z5'},
  ]

  return (
    <div className="io-gauge-wrap">
      <svg className="io-gauge" viewBox="0 0 200 112" aria-label={`Promedio productividad ${fmt(value,1)}`}>
        {zones.map((zone)=><path key={zone.cls} d={arc(zone.start,zone.end)} className={zone.cls}/>)}
        <line x1={cx} y1={cy} x2={nx} y2={ny} className="needle"/>
        <circle cx={cx} cy={cy} r="6" className="hub"/>
      </svg>
      <div className="io-gauge-value">{fmt(value,0)}</div>
      <div className="io-gauge-target">Meta {fmt(target,0)}</div>
    </div>
  )
}

function TrendCard({
  title,
  value,
  values,
  tone,
}:{
  title:string
  value:number
  values:number[]
  tone:'inbound'|'outbound'
}){
  return (
    <article className={`io-trend-card ${tone}`}>
      <span className="io-card-title">{title}</span>
      <strong>{fmt(value,0)}</strong>
      <Sparkline values={values}/>
    </article>
  )
}

function ProductivityBars({rows,target}:{rows:Row[];target:number}){
  const items=withoutConsolidated(rows)
    .slice()
    .sort((a,b)=>(a.source_row??9999)-(b.source_row??9999))
    .map((row)=>({
      name:row.site_name,
      value:num(row.data.productivity),
      target:num(row.data.target)||target,
    }))

  const max=Math.max(target*1.45,...items.map((item)=>item.value*1.08),1)
  const targetPct=Math.min(96,Math.max(0,(target/max)*100))

  return (
    <article className="io-productivity-panel">
      <div className="io-panel-title">PRODUCTIVIDAD IL</div>
      <div className="io-productivity-chart">
        <div className="io-target-line" style={{bottom:`${targetPct}%`}}>
          <span>Meta {fmt(target,0)}</span>
        </div>
        <div className="io-bars">
          {items.map((item,index)=>{
            const height=Math.max(2,(item.value/max)*100)
            const above=item.value>=item.target
            return (
              <div className="io-bar-item" key={`${item.name}-${index}`}>
                <div className="io-bar-value">{fmt(item.value,0)}</div>
                <div className={above?'io-bar over':'io-bar under'} style={{height:`${height}%`}}/>
                <div className="io-bar-label" title={item.name}>{item.name}</div>
              </div>
            )
          })}
        </div>
      </div>
    </article>
  )
}

export function InboundOutboundDashboard({rows,historical,year,month,contextLabel}:Props){
  const current=withoutConsolidated(rows)
  const history=withoutConsolidated(historical)

  const avgHours=avg(current.map((row)=>num(row.data.hours)))
  const avgPeople=avg(current.map((row)=>num(row.data.person_day)))
  const avgInbound=avg(current.map((row)=>num(row.data.inbound)))
  const avgOutbound=avg(current.map((row)=>num(row.data.outbound)))
  const avgProductivity=avg(current.map((row)=>num(row.data.productivity)))
  const avgTarget=avg(current.map((row)=>num(row.data.target)).filter((value)=>value>0)) || 45

  const periodMap=new Map<string,Row[]>()
  history.forEach((row)=>{
    const key=`${row.year}-${String(row.month).padStart(2,'0')}`
    periodMap.set(key,[...(periodMap.get(key)||[]),row])
  })

  const periods=Array.from(periodMap.entries())
    .sort(([a],[b])=>a.localeCompare(b))
    .slice(-12)

  const inboundTrend=periods.map(([,periodRows])=>avg(periodRows.map((row)=>num(row.data.inbound))))
  const outboundTrend=periods.map(([,periodRows])=>avg(periodRows.map((row)=>num(row.data.outbound))))

  const prevDate=new Date(year,month-2,1)
  const prevKey=`${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`
  const previousRows=periodMap.get(prevKey)||[]
  const previousProductivity=avg(previousRows.map((row)=>num(row.data.productivity)))
  const variation=previousProductivity
    ? ((avgProductivity-previousProductivity)/previousProductivity)*100
    : 0

  return (
    <section className="io-dashboard">
      <div className="io-dashboard-context">
        <div><b>{contextLabel}</b><span>{String(month).padStart(2,'0')}/{year}</span></div>
        <small>{current.length} centro(s) con datos</small>
      </div>

      <div className="io-dashboard-top">
        <div className="io-mini-stack">
          <article className="io-mini-card">
            <span>PROMEDIO HORAS</span>
            <div><Clock3/><b>{fmt(avgHours,1)}</b></div>
          </article>
          <article className="io-mini-card">
            <span>PROMEDIO PERSONAL</span>
            <div><Users/><b>{fmt(avgPeople,1)}</b></div>
          </article>
        </div>

        <TrendCard title="PROMEDIO INBOUND" value={avgInbound} values={inboundTrend} tone="inbound"/>
        <TrendCard title="PROMEDIO OUTBOUND" value={avgOutbound} values={outboundTrend} tone="outbound"/>
      </div>

      <div className="io-dashboard-bottom">
        <article className="io-gauge-card">
          <div className="io-panel-title">PROMEDIO PRODUCTIVIDAD IL</div>
          <Gauge value={avgProductivity} target={avgTarget}/>
        </article>

        <div className="io-productivity-area">
          <div className={variation>=0?'io-variation positive':'io-variation negative'}>
            <span>VARIACIÓN %</span>
            <div>{variation>=0?<TrendingUp/>:<TrendingDown/>}<b>{fmt(Math.abs(variation),2)}%</b></div>
            <small>vs. mes anterior</small>
          </div>
          <ProductivityBars rows={current} target={avgTarget}/>
        </div>
      </div>
    </section>
  )
}
