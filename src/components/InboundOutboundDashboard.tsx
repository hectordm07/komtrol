import {
  ArrowUpRight,
  BarChart3,
  Clock3,
  PackageMinus,
  PackagePlus,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'

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

const MONTHS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

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

function pctChange(current:number,previous:number){
  if(!previous) return current ? 100 : 0
  return ((current-previous)/Math.abs(previous))*100
}

function ChangePill({value,inverse=false}:{value:number;inverse?:boolean}){
  const positive=value>=0
  const good=inverse?!positive:positive
  return (
    <span className={`io-change-pill ${good?'good':'bad'}`}>
      {positive?<TrendingUp size={12}/>:<TrendingDown size={12}/>}
      {positive?'+':''}{fmt(value,1)}%
    </span>
  )
}

function TrendChart({
  values,
  labels,
  tone,
}:{values:number[];labels:string[];tone:'inbound'|'outbound'}){
  const width=520
  const height=128
  const left=32
  const right=10
  const top=10
  const bottom=25
  const chartW=width-left-right
  const chartH=height-top-bottom

  if(!values.length){
    return <div className="io-trend-empty">Sin histórico disponible</div>
  }

  const max=Math.max(1,...values)
  const min=Math.min(0,...values)
  const range=max-min || 1
  const points=values.map((value,index)=>{
    const x=left+(values.length===1?chartW/2:index/(values.length-1)*chartW)
    const y=top+chartH-((value-min)/range)*chartH
    return {x,y,value,label:labels[index]||''}
  })

  const line=points.map((point)=>`${point.x},${point.y}`).join(' ')
  const area=`${left},${top+chartH} ${line} ${left+chartW},${top+chartH}`
  const grid=[0,.5,1].map((ratio)=>{
    const y=top+chartH-(ratio*chartH)
    const value=min+(range*ratio)
    return {y,value}
  })

  return (
    <svg className={`io-trend-svg ${tone}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`io-${tone}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopOpacity=".22"/>
          <stop offset="100%" stopOpacity=".02"/>
        </linearGradient>
      </defs>

      {grid.map((item,index)=>(
        <g key={index}>
          <line x1={left} y1={item.y} x2={left+chartW} y2={item.y} className="grid"/>
          <text x={left-6} y={item.y+3} textAnchor="end" className="axis-value">{fmt(item.value,0)}</text>
        </g>
      ))}

      <polygon points={area} fill={`url(#io-${tone}-fill)`} className="area"/>
      <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" className="line"/>
      {points.map((point,index)=>(
        <g key={index}>
          <circle cx={point.x} cy={point.y} r="3.3" className="dot"/>
          <text x={point.x} y={height-6} textAnchor="middle" className="month-label">{point.label}</text>
        </g>
      ))}
    </svg>
  )
}

function Gauge({value,target}:{value:number;target:number}){
  const max=Math.max(target*2,90,value*1.12,1)
  const clamped=Math.max(0,Math.min(max,value))
  const angle=-90+(clamped/max)*180
  const radius=78
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
  const nx=cx+61*Math.cos(needleRad)
  const ny=cy+61*Math.sin(needleRad)

  return (
    <div className="io-gauge-wrap">
      <svg className="io-gauge" viewBox="0 0 200 116" aria-label={`Promedio productividad ${fmt(value,1)}`}>
        <path d={arc(-90,-54)} className="gauge-red"/>
        <path d={arc(-54,-18)} className="gauge-orange"/>
        <path d={arc(-18,18)} className="gauge-yellow"/>
        <path d={arc(18,54)} className="gauge-lime"/>
        <path d={arc(54,90)} className="gauge-green"/>
        <line x1={cx} y1={cy} x2={nx} y2={ny} className="needle"/>
        <circle cx={cx} cy={cy} r="6" className="hub"/>
      </svg>
      <div className="io-gauge-center">
        <b>{fmt(value,1)}</b>
        <span>Productividad</span>
      </div>
      <div className="io-gauge-target"><Target size={12}/> Meta {fmt(target,0)}</div>
    </div>
  )
}

function MiniKpi({
  title,
  value,
  digits,
  icon,
  change,
}:{title:string;value:number;digits:number;icon:React.ReactNode;change:number}){
  return (
    <article className="io-mini-card">
      <div className="io-mini-icon">{icon}</div>
      <div className="io-mini-copy">
        <span>{title}</span>
        <strong>{fmt(value,digits)}</strong>
        <small><ChangePill value={change}/> vs. mes anterior</small>
      </div>
    </article>
  )
}

function TrendCard({
  title,
  value,
  values,
  labels,
  tone,
  change,
  icon,
}:{title:string;value:number;values:number[];labels:string[];tone:'inbound'|'outbound';change:number;icon:React.ReactNode}){
  return (
    <article className={`io-trend-card ${tone}`}>
      <div className="io-card-head">
        <div className="io-card-heading">
          <span className="io-card-icon">{icon}</span>
          <div><small>{title}</small><strong>{fmt(value,1)}</strong></div>
        </div>
        <div className="io-card-change">
          <ChangePill value={change} inverse={tone==='outbound'}/>
          <span>vs. mes anterior</span>
        </div>
      </div>
      <TrendChart values={values} labels={labels} tone={tone}/>
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

  const max=Math.max(target*1.5,...items.map((item)=>item.value*1.12),1)
  const targetPct=Math.max(0,Math.min(100,(target/max)*100))

  return (
    <article className="io-productivity-panel">
      <div className="io-productivity-head">
        <div>
          <span className="io-section-icon"><BarChart3 size={15}/></span>
          <div><small>PRODUCTIVIDAD IL</small><b>Por sede / centro</b></div>
        </div>
        <span className="io-target-badge"><Target size={12}/> Meta {fmt(target,0)}</span>
      </div>

      <div className="io-productivity-chart">
        <div className="io-target-line" style={{bottom:`${targetPct}%`}}/>
        <div className="io-bars">
          {items.map((item,index)=>{
            const height=Math.max(item.value?4:0,(item.value/max)*100)
            const above=item.value>=item.target
            return (
              <div className="io-bar-item" key={`${item.name}-${index}`}>
                <div className="io-bar-value">{fmt(item.value,0)}</div>
                <div className={above?'io-bar over':'io-bar under'} style={{height:`${height}%`}}/>
                <div className="io-bar-label" title={item.name}>{item.name}</div>
              </div>
            )
          })}
          {!items.length&&<div className="io-bars-empty">Sin registros para el período seleccionado</div>}
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
    .slice(-9)

  const labels=periods.map(([key])=>{
    const monthIndex=Number(key.slice(5,7))-1
    return MONTHS[monthIndex]||''
  })

  const inboundTrend=periods.map(([,periodRows])=>avg(periodRows.map((row)=>num(row.data.inbound))))
  const outboundTrend=periods.map(([,periodRows])=>avg(periodRows.map((row)=>num(row.data.outbound))))

  const prevDate=new Date(year,month-2,1)
  const prevKey=`${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`
  const previousRows=periodMap.get(prevKey)||[]

  const previousHours=avg(previousRows.map((row)=>num(row.data.hours)))
  const previousPeople=avg(previousRows.map((row)=>num(row.data.person_day)))
  const previousInbound=avg(previousRows.map((row)=>num(row.data.inbound)))
  const previousOutbound=avg(previousRows.map((row)=>num(row.data.outbound)))
  const previousProductivity=avg(previousRows.map((row)=>num(row.data.productivity)))

  const hoursChange=pctChange(avgHours,previousHours)
  const peopleChange=pctChange(avgPeople,previousPeople)
  const inboundChange=pctChange(avgInbound,previousInbound)
  const outboundChange=pctChange(avgOutbound,previousOutbound)
  const productivityChange=pctChange(avgProductivity,previousProductivity)

  return (
    <section className="io-dashboard io-dashboard-v2">
      <div className="io-dashboard-context">
        <div className="io-context-left">
          <span className="io-context-dot"/>
          <b>{MONTHS[month-1]} {year}</b>
          <i/>
          <span>{contextLabel}</span>
        </div>
        <div className="io-context-right">
          <span>{current.length} centro(s) con datos</span>
          <b className={current.length?'ready':'empty'}>{current.length?'Datos actualizados':'Sin datos publicados'}</b>
        </div>
      </div>

      <div className="io-dashboard-top">
        <div className="io-mini-stack">
          <MiniKpi
            title="Promedio horas"
            value={avgHours}
            digits={1}
            icon={<Clock3 size={18}/>}
            change={hoursChange}
          />
          <MiniKpi
            title="Promedio personal"
            value={avgPeople}
            digits={1}
            icon={<Users size={18}/>}
            change={peopleChange}
          />
        </div>

        <TrendCard
          title="PROMEDIO INBOUND"
          value={avgInbound}
          values={inboundTrend}
          labels={labels}
          tone="inbound"
          change={inboundChange}
          icon={<PackagePlus size={18}/>}
        />

        <TrendCard
          title="PROMEDIO OUTBOUND"
          value={avgOutbound}
          values={outboundTrend}
          labels={labels}
          tone="outbound"
          change={outboundChange}
          icon={<PackageMinus size={18}/>}
        />
      </div>

      <div className="io-dashboard-bottom">
        <article className="io-gauge-card">
          <div className="io-gauge-card-head">
            <span className="io-section-icon"><Target size={15}/></span>
            <div><small>PROMEDIO</small><b>Productividad IL</b></div>
          </div>
          <Gauge value={avgProductivity} target={avgTarget}/>
          <div className="io-gauge-footer">
            <ChangePill value={productivityChange}/>
            <span>vs. mes anterior</span>
          </div>
        </article>

        <div className="io-productivity-area">
          <div className={productivityChange>=0?'io-variation positive':'io-variation negative'}>
            <small>VARIACIÓN %</small>
            <div>{productivityChange>=0?<TrendingUp size={15}/>:<TrendingDown size={15}/>}<b>{productivityChange>=0?'+':''}{fmt(productivityChange,1)}%</b></div>
            <span>vs. mes anterior</span>
          </div>
          <ProductivityBars rows={current} target={avgTarget}/>
        </div>
      </div>

      <div className="io-dashboard-footnote">
        <span>Productividad = (Inbound + Outbound) / (Personas × Días laborables)</span>
        <span><ArrowUpRight size={12}/> Filtros aplicados al conjunto completo del reporte</span>
      </div>
    </section>
  )
}
