import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle, BarChart3, CheckCircle2, Database, FileText, TrendingDown, TrendingUp } from 'lucide-react'

export type ProfessionalScorecardCode =
  | 'sobrantes-faltantes'
  | 'diferencias-inventario'
  | 'danados-scorecard'
  | 'dashboard-transitos'
  | 'activos-inactivos'
  | 'uca'
  | 'ahorros'
  | 'perfect-ship-outbound'
  | 'perfect-ship-inbound'
  | 'safe'

type Row = {
  id:string
  year:number
  month:number
  warehouse:string
  site_name:string
  site_group:string|null
  row_status:string|null
  detail:string|null
  source_row:number|null
  data:Record<string,unknown>
}

type Props = {
  reportCode:ProfessionalScorecardCode
  rows:Row[]
  year:number
  month:number
  onYearChange:(year:number)=>void
  onMonthChange:(month:number)=>void
}

const MONTHS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function n(value:unknown){
  if(typeof value==='number') return Number.isFinite(value)?value:0
  const parsed=Number(String(value??'').replace(/,/g,'').replace(/[^0-9.-]/g,''))
  return Number.isFinite(parsed)?parsed:0
}
function pct(value:unknown){
  const valueNum=n(value)
  return valueNum>1.5?valueNum/100:valueNum
}
function sum(rows:Row[],key:string){return rows.reduce((acc,row)=>acc+n(row.data?.[key]),0)}
function avg(rows:Row[],key:string){
  const values=rows.map((row)=>pct(row.data?.[key])).filter((value)=>Number.isFinite(value)&&value>0)
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0
}
function compactMoney(value:number){
  const abs=Math.abs(value)
  if(abs>=1_000_000) return '$ '+(value/1_000_000).toLocaleString('en-US',{maximumFractionDigits:2})+'M'
  if(abs>=1_000) return '$ '+(value/1_000).toLocaleString('en-US',{maximumFractionDigits:2})+'K'
  return '$ '+value.toLocaleString('en-US',{maximumFractionDigits:0})
}
function numberText(value:number){return value.toLocaleString('en-US',{maximumFractionDigits:0})}
function percentText(value:number){return (value*100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'%'}
function norm(value:unknown){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()
}
function previousPeriod(year:number,month:number){
  if(month===1) return {year:year-1,month:12}
  return {year,month:month-1}
}
function changeRate(current:number,previous:number){
  if(!previous) return current ? 1 : 0
  return current/previous-1
}
function groupLabel(raw:string){
  const key=norm(raw)
  if(key.includes('PROYECT')) return 'PROYECTO'
  if(key.includes('SUCURS')) return 'SUCURSAL'
  if(key.includes('TIENDA')) return 'TIENDA'
  if(key.includes('CONSIGN')) return 'CONSIGNACIONES'
  if(key.includes('CONEXO')) return 'CONEXOS'
  if(key.includes('DISTRIB')) return 'DISTRIBUCIÓN'
  return raw || 'OTROS'
}

function Sparkline({points,tone='navy'}:{points:number[];tone?:'navy'|'green'|'red'|'orange'|'purple'}){
  const clean=points.length?points:[0,0,0]
  const min=Math.min(...clean), max=Math.max(...clean)
  const span=Math.max(max-min,1)
  const coords=clean.map((value,index)=>{
    const x=clean.length===1?50:index*(100/(clean.length-1))
    const y=78-((value-min)/span)*52
    return `${x},${y}`
  }).join(' ')
  return <svg className={"psc-spark "+tone} viewBox="0 0 100 90" preserveAspectRatio="none">
    <polyline points={coords}/>
  </svg>
}

function InteractiveMetricTrend({
  points,
  labels,
  tone='navy',
  formatter=(value)=>numberText(value),
  showValues=false,
}:{
  points:number[]
  labels:string[]
  tone?:'navy'|'green'|'red'|'orange'|'purple'
  formatter?:(value:number)=>string
  showValues?:boolean
}){
  const [hovered,setHovered]=useState<number|null>(null)
  const clean=points.length?points:[0,0,0,0,0,0]
  const min=Math.min(...clean)
  const max=Math.max(...clean)
  const span=Math.max(max-min,1)
  const plotted=clean.map((value,index)=>({
    value,
    x:clean.length===1?50:6+index*(88/(clean.length-1)),
    y:8+((max-value)/span)*29,
  }))
  const line=plotted.map((point)=>`${point.x},${point.y}`).join(' ')
  const area=`${plotted[0]?.x??6},39 ${line} ${plotted[plotted.length-1]?.x??94},39`
  const active=hovered===null?null:plotted[hovered]

  return <div className={"psc-metric-trend6 "+tone}>
    <div className="psc-metric-trend6-head">
      <b>VARIACIÓN 6 MESES</b>
      <span>Pasa el mouse para ver cada mes</span>
    </div>
    <svg viewBox="0 0 100 48" preserveAspectRatio="none">
      <line x1="4" y1="39" x2="96" y2="39" className="base"/>
      <polygon points={area} className="trend-area"/>
      <polyline points={line} className="trend-line"/>
      {plotted.map((point,index)=><g
        key={index}
        onMouseEnter={()=>setHovered(index)}
        onMouseLeave={()=>setHovered(null)}
      >
        {showValues&&<text
          x={point.x}
          y={Math.max(5,point.y-3)}
          textAnchor="middle"
          className="trend-value-label"
        >{formatter(point.value)}</text>}
        <circle
          cx={point.x}
          cy={point.y}
          r={hovered===index?2.6:1.7}
          className="trend-dot"
        />
        <rect x={point.x-7} y="2" width="14" height="40" className="trend-hover-zone"/>
      </g>)}
    </svg>
    <div className="psc-metric-months">
      {labels.map((label,index)=><span key={label+'-'+index}>{label}</span>)}
    </div>
    {active&&<div
      className="psc-metric-trend-tooltip"
      style={{left:`${Math.max(9,Math.min(91,active.x))}%`}}
    >
      <b>{labels[hovered??0]}</b>
      <span>{formatter(active.value)}</span>
    </div>}
  </div>
}

function Filters({
  rows,year,month,onYearChange,onMonthChange,segment,setSegment,extraTitle,extraOptions,extra,setExtra
}:{
  rows:Row[];year:number;month:number;onYearChange:(n:number)=>void;onMonthChange:(n:number)=>void
  segment:string;setSegment:(v:string)=>void
  extraTitle?:string;extraOptions?:string[];extra?:string;setExtra?:(v:string)=>void
}){
  const years=useMemo(()=>Array.from(new Set(rows.map((row)=>row.year))).sort((a,b)=>b-a),[rows])
  const availableMonths=useMemo(()=>Array.from(new Set(
    rows.filter((row)=>row.year===year).map((row)=>row.month)
  )).sort((a,b)=>a-b),[rows,year])
  useEffect(()=>{
    if(availableMonths.length && !availableMonths.includes(month)){
      onMonthChange(availableMonths[availableMonths.length-1])
    }
  },[availableMonths.join(','),month,onMonthChange])
  const segments=useMemo(()=>{
    const labels=Array.from(new Set(rows.map((row)=>groupLabel(row.site_group||''))).values()).filter(Boolean)
    const preferred=['PROYECTO','SUCURSAL','TIENDA','CONSIGNACIONES','CONEXOS','DISTRIBUCIÓN']
    return labels.sort((a,b)=>{
      const ai=preferred.indexOf(a), bi=preferred.indexOf(b)
      if(ai===-1&&bi===-1) return a.localeCompare(b)
      if(ai===-1) return 1
      if(bi===-1) return -1
      return ai-bi
    })
  },[rows])
  return <aside className="psc-filter-rail">
    <section className="psc-filter-box psc-year-filter">
      <div className="psc-filter-head"><b>AÑO</b></div>
      <div className="psc-year-grid">
        {years.map((item)=><button
          key={item}
          type="button"
          className={year===item?'active':''}
          onClick={()=>onYearChange(item)}
        >{item}</button>)}
      </div>
    </section>

    {!!segments.length&&<section className="psc-filter-box psc-center-filter">
      <div className="psc-filter-head"><b>CENTRO</b></div>
      <div className="psc-click-grid single">
        <button className={segment==='TODOS'?'active':''} onClick={()=>setSegment('TODOS')}>TODOS</button>
        {segments.map((item)=><button key={item} className={segment===item?'active':''} onClick={()=>setSegment(item)}>{item}</button>)}
      </div>
    </section>}

    {extraTitle&&extraOptions&&setExtra&&<section className="psc-filter-box">
      <div className="psc-filter-head"><b>{extraTitle}</b></div>
      <div className="psc-click-grid">
        <button className={extra==='TODOS'?'active':''} onClick={()=>setExtra('TODOS')}>TODOS</button>
        {extraOptions.map((item)=><button key={item} className={extra===item?'active':''} onClick={()=>setExtra(item)}>{item}</button>)}
      </div>
    </section>}

    <section className="psc-filter-box psc-month-filter">
      <div className="psc-filter-head"><b>MES</b></div>
      <div className="psc-month-grid">
        {availableMonths.map((monthNumber)=><button
          key={monthNumber}
          className={month===monthNumber?'active':''}
          onClick={()=>onMonthChange(monthNumber)}
        >{MONTHS[monthNumber-1]}</button>)}
      </div>
    </section>
  </aside>
}

function MetricCard({
  title,value,variation,sixMonthVariation,history,tone='navy',icon,historyLabels,historyFormatter,showHistoryValues=false
}:{
  title:string
  value:string
  variation?:number
  sixMonthVariation?:number|null
  history:number[]
  tone?:'navy'|'green'|'red'|'orange'|'purple'
  icon?:ReactNode
  historyLabels?:string[]
  historyFormatter?:(value:number)=>string
  showHistoryValues?:boolean
}){
  const up=(variation??0)>=0
  return <article className={"psc-metric-card kom-unified-card "+tone}>
    <div className="psc-card-ribbon">{title}</div>
    <div className="psc-metric-main">
      <span className="psc-metric-icon">{icon||<Database size={28}/>}</span>
      <strong>{value}</strong>
      {variation!==undefined&&<div className="psc-metric-variation">
        <div>
          <em className={up?'up':'down'}>{up?'▲':'▼'} {Math.abs(variation*100).toFixed(2)}%</em>
          <span>vs. mes anterior</span>
        </div>
        {sixMonthVariation!==undefined&&<div className="six-month">
          {sixMonthVariation===null
            ? <><em className="neutral">—</em><span>vs. hace 6 meses</span></>
            : <><em className={sixMonthVariation>=0?'up':'down'}>{sixMonthVariation>=0?'▲':'▼'} {Math.abs(sixMonthVariation*100).toFixed(2)}%</em><span>vs. hace 6 meses</span></>}
        </div>}
      </div>}
    </div>
    {historyLabels?.length
      ? <InteractiveMetricTrend
          points={history}
          labels={historyLabels}
          tone={tone}
          formatter={historyFormatter}
          showValues={showHistoryValues}
        />
      : <Sparkline points={history} tone={tone}/>}
  </article>
}

function BarPanel({
  title,rows,valueKey,tone='navy',valueFormatter=(v)=>numberText(v),target
}:{
  title:string;rows:Array<{name:string;value:number}>;valueKey?:string;tone?:'navy'|'green'|'red'|'orange'|'purple';
  valueFormatter?:(v:number)=>string;target?:number
}){
  const max=Math.max(...rows.map((row)=>row.value),target||0,1)
  return <article className={"psc-main-panel "+tone}>
    <div className="psc-panel-ribbon">{title}</div>
    <div className="psc-bar-chart" style={{'--psc-count':Math.max(rows.length,1)} as CSSProperties}>
      {target!==undefined&&<div className="psc-target" style={{bottom:`${Math.max(0,Math.min(100,target/max*100))}%`}}><span>Meta {valueFormatter(target)}</span></div>}
      {rows.map((row)=><div
        className="psc-bar-item"
        key={row.name}
        data-tooltip={`${row.name} · ${valueFormatter(row.value)}`}
      >
        <span className="psc-bar-value">{valueFormatter(row.value)}</span>
        <div className="psc-bar-track"><i style={{height:`${Math.max(2,row.value/max*100)}%`}}/></div>
        <b title={row.name}>{row.name}</b>
      </div>)}
      {!rows.length&&<div className="psc-empty">Sin datos para el filtro seleccionado.</div>}
    </div>
  </article>
}

function TopDifference({
  title,row,value,secondary
}:{title:string;row?:string;value:string;secondary?:string}){
  return <article className="psc-highlight-card">
    <div className="psc-card-ribbon">{title}</div>
    <b>{row||'Sin datos'}</b>
    {secondary&&<span>{secondary}</span>}
    <strong>{value}</strong>
  </article>
}

function useReportFilter(rows:Row[],year:number,month:number,segment:string,extra:string){
  const segmentMatch=(row:Row)=>segment==='TODOS'||groupLabel(row.site_group||'')===segment
  const extraMatch=(row:Row)=>{
    if(extra==='TODOS') return true
    const status=norm(row.row_status||row.detail)
    return status===norm(extra)
  }
  return rows.filter((row)=>row.year===year&&row.month===month&&segmentMatch(row)&&extraMatch(row))
}

function monthlyHistory(rows:Row[],year:number,metric:(rows:Row[])=>number,segment:string,extra:string){
  const segmentMatch=(row:Row)=>segment==='TODOS'||groupLabel(row.site_group||'')===segment
  const extraMatch=(row:Row)=>extra==='TODOS'||norm(row.row_status||row.detail)===norm(extra)
  return Array.from({length:12},(_,index)=>{
    const month=index+1
    return metric(rows.filter((row)=>row.year===year&&row.month===month&&segmentMatch(row)&&extraMatch(row)))
  })
}

function lastSixPeriods(year:number,month:number){
  return Array.from({length:6},(_,index)=>{
    const offset=5-index
    const date=new Date(year,month-1-offset,1)
    return {year:date.getFullYear(),month:date.getMonth()+1,label:MONTHS[date.getMonth()]}
  })
}

function matchesSegment(row:Row,segment:string){
  return segment==='TODOS'||groupLabel(row.site_group||'')===segment
}

function matchesExtra(row:Row,extra:string){
  if(extra==='TODOS') return true
  return norm(row.row_status||row.detail)===norm(extra)
}

function report3SiteKey(row:Row){
  return `${norm(row.warehouse)}::${norm(row.site_name)}`
}

function SixMonthEvolution({
  rows,year,month,segment,extra
}:{rows:Row[];year:number;month:number;segment:string;extra:string}){
  const [hovered,setHovered]=useState<number|null>(null)
  const periods=Array.from({length:7},(_,index)=>{
    const offset=6-index
    const date=new Date(year,month-1-offset,1)
    const period={year:date.getFullYear(),month:date.getMonth()+1,label:MONTHS[date.getMonth()]}
    const set=rows.filter((row)=>
      row.year===period.year&&
      row.month===period.month&&
      matchesSegment(row,segment)&&
      matchesExtra(row,extra)
    )
    return {
      ...period,
      usd:sum(set,'usd'),
      skus:sum(set,'skus'),
      units:sum(set,'units'),
    }
  })

  const points=periods.slice(1).map((period,index)=>{
    const previous=periods[index]
    return {
      ...period,
      usdVariation:changeRate(period.usd,previous.usd),
      skuVariation:changeRate(period.skus,previous.skus),
      unitVariation:changeRate(period.units,previous.units),
    }
  })
  const allValues=points.flatMap((item)=>[item.usdVariation,item.skuVariation,item.unitVariation,0])
  const rawMin=Math.min(...allValues)
  const rawMax=Math.max(...allValues)
  const span=Math.max(rawMax-rawMin,.1)
  const min=rawMin-span*.15
  const max=rawMax+span*.15
  const toX=(index:number)=>8+index*(84/Math.max(points.length-1,1))
  const toY=(value:number)=>12+((max-value)/(max-min))*65
  const line=(key:'usdVariation'|'skuVariation'|'unitVariation')=>
    points.map((item,index)=>`${toX(index)},${toY(item[key])}`).join(' ')
  const zeroY=toY(0)
  const tone=extra==='SOBRANTE'?'green':'red'
  const statusLabel=extra==='TODOS'?'Todos':extra.charAt(0)+extra.slice(1).toLowerCase()
  const active=hovered===null?null:points[hovered]

  return <article className={"sf-six-month-panel sf-variation-panel "+tone}>
    <div className="sf-panel-head">
      <div>
        <b>VARIACIÓN % · ÚLTIMOS 6 MESES</b>
        <span>{statusLabel} · comparación contra mes anterior</span>
      </div>
      <div className="sf-variation-legend">
        <span className="usd"><i/>USD</span>
        <span className="sku"><i/>SKU</span>
        <span className="units"><i/>UND</span>
      </div>
    </div>
    <div className="sf-variation-chart">
      <div className="sf-variation-scale">
        <span>{(max*100).toFixed(0)}%</span>
        <span>0%</span>
        <span>{(min*100).toFixed(0)}%</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
        <line x1="5" y1={zeroY} x2="97" y2={zeroY} className="zero"/>
        <polyline points={line('usdVariation')} className="sf-var-line usd"/>
        <polyline points={line('skuVariation')} className="sf-var-line sku"/>
        <polyline points={line('unitVariation')} className="sf-var-line units"/>
        {points.map((item,index)=><g
          key={item.year+'-'+item.month}
          onMouseEnter={()=>setHovered(index)}
          onMouseLeave={()=>setHovered(null)}
          className="sf-var-hit"
        >
          <circle cx={toX(index)} cy={toY(item.usdVariation)} r={hovered===index?2.6:1.9} className="sf-var-point usd"/>
          <circle cx={toX(index)} cy={toY(item.skuVariation)} r={hovered===index?2.6:1.9} className="sf-var-point sku"/>
          <circle cx={toX(index)} cy={toY(item.unitVariation)} r={hovered===index?2.6:1.9} className="sf-var-point units"/>
          <rect x={toX(index)-7} y="7" width="14" height="75" className="sf-var-hover-zone"/>
        </g>)}
      </svg>
      <div className="sf-variation-months">
        {points.map((item)=><span key={item.year+'-'+item.month}>{item.label}<small>{String(item.year).slice(-2)}</small></span>)}
      </div>
      {active&&<div
        className="sf-variation-tooltip"
        style={{left:`${Math.max(12,Math.min(88,toX(hovered??0)))}%`}}
      >
        <b>{active.label} {active.year}</b>
        <span>USD <strong>{active.usdVariation>=0?'+':''}{(active.usdVariation*100).toFixed(1)}%</strong></span>
        <span>SKU <strong>{active.skuVariation>=0?'+':''}{(active.skuVariation*100).toFixed(1)}%</strong></span>
        <span>UND <strong>{active.unitVariation>=0?'+':''}{(active.unitVariation*100).toFixed(1)}%</strong></span>
      </div>}
    </div>
  </article>
}

function TopSitesPanel({
  rows
}:{rows:Row[]}){
  const items=Array.from(new Set(rows.map((row)=>row.site_name))
    .values())
    .map((name)=>{
      const set=rows.filter((row)=>row.site_name===name)
      return {
        name,
        usd:sum(set,'usd'),
        skus:sum(set,'skus'),
        units:sum(set,'units'),
      }
    })
    .filter((item)=>item.usd>0)
    .sort((a,b)=>b.usd-a.usd)
    .slice(0,5)
  const max=Math.max(...items.map((item)=>item.usd),1)

  return <article className="sf-top-sites">
    <div className="sf-panel-head">
      <div>
        <b>TOP SEDES DEL MES</b>
        <span>Mayor diferencia por USD</span>
      </div>
    </div>
    <div className="sf-top-sites-list">
      {items.map((item,index)=>(
        <div
          className="sf-site-row"
          key={item.name}
          data-tooltip={`${item.name} · ${compactMoney(item.usd)} · ${numberText(item.skus)} SKU · ${numberText(item.units)} UND`}
        >
          <span>{index+1}</span>
          <div>
            <b>{item.name}</b>
            <i><em style={{width:`${Math.max(5,item.usd/max*100)}%`}}/></i>
          </div>
          <strong>{compactMoney(item.usd)}</strong>
        </div>
      ))}
      {!items.length&&<div className="sf-empty">Sin diferencias registradas en el mes seleccionado.</div>}
    </div>
  </article>
}

function Report3Filters({
  rows,year,month,onYearChange,onMonthChange,segment,setSegment,status,setStatus,top,topVariation,topHistory
}:{
  rows:Row[]
  year:number
  month:number
  onYearChange:(year:number)=>void
  onMonthChange:(month:number)=>void
  segment:string
  setSegment:(segment:string)=>void
  status:string
  setStatus:(status:string)=>void
  top?:{name:string;value:number;skus:number;units:number}
  topVariation?:number|null
  topHistory?:number[]
}){
  const years=useMemo(()=>Array.from(new Set(rows.map((row)=>row.year))).sort((a,b)=>b-a),[rows])
  const months=useMemo(()=>Array.from(new Set(
    rows.filter((row)=>row.year===year).map((row)=>row.month)
  )).sort((a,b)=>a-b),[rows,year])

  useEffect(()=>{
    if(months.length&&!months.includes(month)){
      onMonthChange(months[months.length-1])
    }
  },[months.join(','),month,onMonthChange])

  const centers=['TODOS','PROYECTO','SUCURSAL','TIENDA']
  const statuses=['TODOS','FALTANTE','SOBRANTE']

  return <aside className="sf3-left">
    <section className="sf3-filter-card">
      <b>AÑO</b>
      <div className="sf3-grid sf3-years">
        {years.map((item)=><button
          type="button"
          key={item}
          className={year===item?'active':''}
          onClick={()=>onYearChange(item)}
        >{item}</button>)}
      </div>
    </section>

    <section className="sf3-filter-card">
      <b>CENTRO</b>
      <div className="sf3-grid sf3-centers">
        {centers.map((item)=><button
          type="button"
          key={item}
          className={segment===item?'active':''}
          onClick={()=>setSegment(item)}
        >{item}</button>)}
      </div>
    </section>

    <section className="sf3-filter-card">
      <b>STATUS</b>
      <div className="sf3-grid sf3-status">
        {statuses.map((item)=><button
          type="button"
          key={item}
          className={status===item?'active':''}
          onClick={()=>setStatus(item)}
        >{item}</button>)}
      </div>
    </section>

    <section className="sf3-filter-card">
      <b>MES</b>
      <div className="sf3-grid sf3-months">
        {months.map((item)=><button
          type="button"
          key={item}
          className={month===item?'active':''}
          onClick={()=>onMonthChange(item)}
        >{MONTHS[item-1]}</button>)}
      </div>
    </section>

    <article className={"sf3-highlight kom-unified-card "+(status==='SOBRANTE'?'green':'red')}>
      <div className="sf3-highlight-title">PROYECTO CON MAYOR DIFERENCIA</div>
      <div className="sf3-highlight-body">
        <b>{top?.name||'Sin diferencias'}</b>
        <strong>{compactMoney(top?.value||0)}</strong>
        <small>{top?numberText(top.skus)+' SKU · '+numberText(top.units)+' UND':'Sin datos'}</small>
        <em>{status==='TODOS'?'Todos':status.charAt(0)+status.slice(1).toLowerCase()}</em>
        <div className="sf3-highlight-spark">
          <Sparkline points={topHistory?.length?topHistory:[0,0,0,0,0,0]} tone={status==='SOBRANTE'?'green':'red'}/>
        </div>
        <div className={"sf3-highlight-variation "+(
          topVariation===null||topVariation===undefined||topVariation===0
            ? 'neutral'
            : topVariation>0?'up':'down'
        )}>
          <span className="sf3-highlight-variation-icon">
            {topVariation===null||topVariation===undefined||topVariation===0
              ? <span className="sf3-neutral-mark">—</span>
              : topVariation>0?<TrendingUp size={17}/>:<TrendingDown size={17}/>}
          </span>
          <div>
            <b>{topVariation===null||topVariation===undefined
              ? '—'
              : `${topVariation>0?'+':''}${(topVariation*100).toFixed(1)}%`}</b>
            <small>vs. mes anterior</small>
          </div>
        </div>
      </div>
    </article>
  </aside>
}

function Report3Trend({
  points,labels,tone,formatter
}:{
  points:number[]
  labels:string[]
  tone:'red'|'green'|'navy'
  formatter:(value:number)=>string
}){
  const [hovered,setHovered]=useState<number|null>(null)
  const clean=points.length?points:[0,0,0,0,0,0]
  const max=Math.max(...clean,1)
  const x=(index:number)=>8+index*(86/Math.max(clean.length-1,1))
  const y=(value:number)=>8+(1-value/max)*34
  const line=clean.map((value,index)=>`${x(index)},${y(value)}`).join(' ')
  const area=`${x(0)},44 ${line} ${x(clean.length-1)},44`
  const active=hovered===null?null:{value:clean[hovered],label:labels[hovered]}

  return <div className={"sf3-trend sf3-trend-io "+tone}>
    <div className="sf3-yaxis">
      <span>{formatter(max)}</span>
      <span>{formatter(max/2)}</span>
      <span>0</span>
    </div>

    <svg viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={area} className="area"/>
      <polyline points={line} className="line"/>
      {clean.map((value,index)=>{
        const current=index===clean.length-1
        return <g
          key={index}
          onMouseEnter={()=>setHovered(index)}
          onMouseLeave={()=>setHovered(null)}
        >
          {current
            ? <>
                <circle cx={x(index)} cy={y(value)} r="3.2" className="current-ring"/>
                <circle cx={x(index)} cy={y(value)} r="1.8" className="current-dot"/>
              </>
            : <circle cx={x(index)} cy={y(value)} r={hovered===index?2.35:1.7} className="dot"/>
          }
          <rect x={x(index)-6} y="4" width="12" height="42" className="hit"/>
        </g>
      })}
    </svg>

    <div className="sf3-trend-months">
      {labels.map((label,index)=><span className={index===labels.length-1?'current':''} key={label+'-'+index}>{label}</span>)}
    </div>

    {active&&<div className="sf3-trend-tooltip" style={{left:`${Math.max(12,Math.min(88,x(hovered??0)))}%`}}>
      <b>{active.label}</b>
      <span>{formatter(active.value)}</span>
    </div>}
  </div>
}

function Report3Kpi({
  title,value,icon,variation,sixMonthVariation,history,labels,tone,formatter,selectionLabel
}:{
  title:string
  value:string
  icon:ReactNode
  variation:number
  sixMonthVariation:number|null
  history:number[]
  labels:string[]
  tone:'red'|'green'|'navy'
  formatter:(value:number)=>string
  selectionLabel?:string|null
}){
  const monthTone=variation>0?'up':variation<0?'down':'neutral'
  const sixTone=sixMonthVariation===null||sixMonthVariation===0?'neutral':sixMonthVariation>0?'up':'down'

  return <article className={"sf3-kpi sf3-kpi-modern "+tone}>
    <div className="sf3-kpi-summary">
      <span className="sf3-kpi-icon">{icon}</span>
      <div className="sf3-kpi-copy">
        <small>{title}</small>
        <strong>{value}</strong>
      </div>
      <div className="sf3-kpi-variations">
        <div className={monthTone}>
          <b>
            {variation>0?<TrendingUp size={11}/>:variation<0?<TrendingDown size={11}/>:<span>—</span>}
            {variation>0?'+':''}{(variation*100).toFixed(1)}%
          </b>
          <span>vs. mes anterior</span>
        </div>
        <div className={sixTone}>
          {sixMonthVariation===null
            ? <><b><span>—</span></b><span>vs. hace 6 meses</span></>
            : <><b>
                {sixMonthVariation>0?<TrendingUp size={11}/>:sixMonthVariation<0?<TrendingDown size={11}/>:<span>—</span>}
                {sixMonthVariation>0?'+':''}{(sixMonthVariation*100).toFixed(1)}%
              </b><span>vs. hace 6 meses</span></>}
        </div>
      </div>
    </div>
    <Report3Trend points={history} labels={labels} tone={tone} formatter={formatter}/>
  </article>
}

function Report3Evolution({
  rows,tone,selectedSiteKey,onSelectSite
}:{
  rows:Array<{key:string;name:string;value:number;skus:number;units:number}>
  tone:'red'|'green'|'navy'
  selectedSiteKey:string|null
  onSelectSite:(key:string)=>void
}){
  const visible=rows.slice(0,18)
  const max=Math.max(...visible.map((row)=>row.value),1)

  return <article className={"sf3-evolution sf3-evolution-clean "+tone}>
    <div className="sf3-evolution-head">
      <span>EVOLUCIÓN $</span>
      {selectedSiteKey&&<small>Selección activa · clic nuevamente para volver al total</small>}
    </div>
    <div className="sf3-evolution-body">
      <div
        className={selectedSiteKey?'sf3-bars has-selection':'sf3-bars'}
        style={{'--sf3-count':Math.max(visible.length,1)} as CSSProperties}
      >
        {visible.map((row)=>{
          const selected=selectedSiteKey===row.key
          return <div
            className={selected?'sf3-bar-item selected':'sf3-bar-item'}
            key={row.key}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            data-tooltip={`${row.name} · ${compactMoney(row.value)} · ${numberText(row.skus)} SKU · ${numberText(row.units)} UND · ${selected?'Clic para quitar filtro':'Clic para filtrar esta sede'}`}
            onClick={()=>onSelectSite(row.key)}
            onKeyDown={(event)=>{
              if(event.key==='Enter'||event.key===' '){
                event.preventDefault()
                onSelectSite(row.key)
              }
            }}
          >
            <span>{compactMoney(row.value)}</span>
            <div className="sf3-bar-track"><i style={{height:`${Math.max(2,row.value/max*100)}%`}}/></div>
            <b>{row.name}</b>
          </div>
        })}
        {!visible.length&&<div className="sf3-empty">Sin datos para el filtro seleccionado.</div>}
      </div>
    </div>
  </article>
}

function SobrantesFaltantesDashboard({
  rows,year,month,onYearChange,onMonthChange
}:Props){
  const [segment,setSegment]=useState('TODOS')
  const [extra,setExtra]=useState('FALTANTE')
  const [selectedSiteKey,setSelectedSiteKey]=useState<string|null>(null)

  const currentBase=useReportFilter(rows,year,month,segment,extra)

  useEffect(()=>{
    if(selectedSiteKey&&!currentBase.some((row)=>report3SiteKey(row)===selectedSiteKey)){
      setSelectedSiteKey(null)
    }
  },[selectedSiteKey,currentBase,year,month,segment,extra])

  const current=selectedSiteKey
    ? currentBase.filter((row)=>report3SiteKey(row)===selectedSiteKey)
    : currentBase

  const totalUsd=sum(current,'usd')
  const totalSkus=sum(current,'skus')
  const totalUnits=sum(current,'units')

  const prev=previousPeriod(year,month)
  const prevBase=useReportFilter(rows,prev.year,prev.month,segment,extra)
  const prevRows=selectedSiteKey
    ? prevBase.filter((row)=>report3SiteKey(row)===selectedSiteKey)
    : prevBase
  const variation=changeRate(totalUsd,sum(prevRows,'usd'))
  const skuVariation=changeRate(totalSkus,sum(prevRows,'skus'))
  const unitVariation=changeRate(totalUnits,sum(prevRows,'units'))

  const sixMonthsBackDate=new Date(year,month-7,1)
  const sixMonthsBase=useReportFilter(
    rows,
    sixMonthsBackDate.getFullYear(),
    sixMonthsBackDate.getMonth()+1,
    segment,
    extra
  )
  const sixMonthsBackRows=selectedSiteKey
    ? sixMonthsBase.filter((row)=>report3SiteKey(row)===selectedSiteKey)
    : sixMonthsBase
  const sixMonthUsdVariation=sixMonthsBackRows.length?changeRate(totalUsd,sum(sixMonthsBackRows,'usd')):null
  const sixMonthSkuVariation=sixMonthsBackRows.length?changeRate(totalSkus,sum(sixMonthsBackRows,'skus')):null
  const sixMonthUnitVariation=sixMonthsBackRows.length?changeRate(totalUnits,sum(sixMonthsBackRows,'units')):null

  const periods=lastSixPeriods(year,month)
  const periodSets=periods.map((period)=>{
    const set=rows.filter((row)=>
      row.year===period.year&&
      row.month===period.month&&
      matchesSegment(row,segment)&&
      matchesExtra(row,extra)
    )
    return selectedSiteKey
      ? set.filter((row)=>report3SiteKey(row)===selectedSiteKey)
      : set
  })
  const labels=periods.map((period)=>period.label)
  const usdHistory=periodSets.map((set)=>sum(set,'usd'))
  const skuHistory=periodSets.map((set)=>sum(set,'skus'))
  const unitHistory=periodSets.map((set)=>sum(set,'units'))

  const siteKeys=Array.from(new Set(currentBase.map(report3SiteKey)))
  const bySite=siteKeys.map((key)=>{
    const set=currentBase.filter((row)=>report3SiteKey(row)===key)
    return {
      key,
      name:set[0]?.site_name||key,
      value:sum(set,'usd'),
      skus:sum(set,'skus'),
      units:sum(set,'units'),
    }
  }).filter((item)=>item.value>0).sort((a,b)=>b.value-a.value)

  const selectedSite=selectedSiteKey
    ? bySite.find((item)=>item.key===selectedSiteKey)
    : null
  const top=selectedSite||bySite[0]

  const previousBySite=Array.from(new Set(prevBase.map(report3SiteKey))).map((key)=>{
    const set=prevBase.filter((row)=>report3SiteKey(row)===key)
    return {key,name:set[0]?.site_name||key,value:sum(set,'usd')}
  }).filter((item)=>item.value>0).sort((a,b)=>b.value-a.value)
  const previousTop=selectedSiteKey
    ? previousBySite.find((item)=>item.key===selectedSiteKey)
    : previousBySite[0]

  const topVariation=top&&previousTop
    ? changeRate(top.value,previousTop.value)
    : null

  const topHistory=periods.map((period)=>{
    const periodRows=rows.filter((row)=>
      row.year===period.year&&
      row.month===period.month&&
      matchesSegment(row,segment)&&
      matchesExtra(row,extra)
    )

    if(selectedSiteKey){
      return sum(periodRows.filter((row)=>report3SiteKey(row)===selectedSiteKey),'usd')
    }

    const periodKeys=Array.from(new Set(periodRows.map(report3SiteKey)))
    return Math.max(
      0,
      ...periodKeys.map((key)=>sum(periodRows.filter((row)=>report3SiteKey(row)===key),'usd'))
    )
  })

  const tone: 'red'|'green'|'navy' = extra==='SOBRANTE'?'green':extra==='FALTANTE'?'red':'navy'
  const selectionLabel=selectedSite?.name||null

  return <section className="sf3-dashboard">
    <Report3Filters
      rows={rows}
      year={year}
      month={month}
      onYearChange={onYearChange}
      onMonthChange={onMonthChange}
      segment={segment}
      setSegment={(value)=>{
        setSegment(value)
        setSelectedSiteKey(null)
      }}
      status={extra}
      setStatus={(value)=>{
        setExtra(value)
        setSelectedSiteKey(null)
      }}
      top={top}
      topVariation={topVariation}
      topHistory={topHistory}
    />

    <div className="sf3-kpis">
      <Report3Kpi
        title="PROMEDIO $"
        value={compactMoney(totalUsd)}
        icon={<Database size={24}/>}
        variation={variation}
        sixMonthVariation={sixMonthUsdVariation}
        history={usdHistory}
        labels={labels}
        tone="red"
        formatter={compactMoney}
        selectionLabel={selectionLabel}
      />
      <Report3Kpi
        title="PROMEDIO SKUs"
        value={numberText(totalSkus)}
        icon={<FileText size={24}/>}
        variation={skuVariation}
        sixMonthVariation={sixMonthSkuVariation}
        history={skuHistory}
        labels={labels}
        tone="navy"
        formatter={numberText}
        selectionLabel={selectionLabel}
      />
      <Report3Kpi
        title="PROMEDIO UNIDADES"
        value={numberText(totalUnits)}
        icon={<Database size={24}/>}
        variation={unitVariation}
        sixMonthVariation={sixMonthUnitVariation}
        history={unitHistory}
        labels={labels}
        tone="navy"
        formatter={numberText}
        selectionLabel={selectionLabel}
      />
    </div>

    <Report3Evolution
      rows={bySite}
      tone={tone}
      selectedSiteKey={selectedSiteKey}
      onSelectSite={(key)=>setSelectedSiteKey((currentKey)=>currentKey===key?null:key)}
    />
  </section>
}

function DifferenceLike({
  reportCode:code,rows,year,month,onYearChange,onMonthChange
}:Props){
  const [segment,setSegment]=useState('TODOS')
  const [extra,setExtra]=useState(code==='sobrantes-faltantes'?'FALTANTE':code==='diferencias-inventario'?'OPERACION':'TODOS')
  const extraOptions=useMemo(()=>Array.from(new Set(rows.map((row)=>String(row.row_status||row.detail||'').trim()).filter(Boolean))).sort(),[rows])
  const current=useReportFilter(rows,year,month,segment,extra)

  const totalUsd=sum(current,'usd')
  const totalSkus=sum(current,'skus')
  const totalUnits=sum(current,'units')
  const prev=previousPeriod(year,month)
  const prevRows=useReportFilter(rows,prev.year,prev.month,segment,extra)
  const previousUsd=sum(prevRows,'usd')
  const previousSkus=sum(prevRows,'skus')
  const previousUnits=sum(prevRows,'units')
  const variation=changeRate(totalUsd,previousUsd)
  const skuVariation=changeRate(totalSkus,previousSkus)
  const unitVariation=changeRate(totalUnits,previousUnits)

  const bySite=Array.from(new Map(current.map((row)=>[row.site_name,0])).keys()).map((name)=>({
    name,
    value:current.filter((row)=>row.site_name===name).reduce((acc,row)=>acc+n(row.data.usd),0)
  })).filter((row)=>row.value!==0).sort((a,b)=>b.value-a.value)

  const top=bySite[0]
  const totalHistory=monthlyHistory(rows,year,(set)=>sum(set,'usd'),segment,extra)
  const skuHistory=monthlyHistory(rows,year,(set)=>sum(set,'skus'),segment,extra)
  const unitHistory=monthlyHistory(rows,year,(set)=>sum(set,'units'),segment,extra)

  const title=code==='sobrantes-faltantes'?'EVOLUCIÓN $':code==='diferencias-inventario'?'EVOLUCIÓN $ AARR & S & T':'EVOLUCIÓN DAÑADOS'
  return <section className="psc-dashboard">
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange}
      segment={segment} setSegment={setSegment}
      extraTitle={code==='sobrantes-faltantes'?'STATUS':code==='diferencias-inventario'?'DETALLE':undefined}
      extraOptions={code==='danados-scorecard'?undefined:extraOptions} extra={extra} setExtra={setExtra}/>
    <div className="psc-top-metrics">
      <MetricCard title="TOTAL $" value={compactMoney(totalUsd)} variation={variation} history={totalHistory} tone="navy" icon={<Database size={29}/>}/>
      <MetricCard title="TOTAL SKUs" value={numberText(totalSkus)} variation={skuVariation} history={skuHistory} tone="red" icon={<FileText size={29}/>}/>
      <MetricCard title="TOTAL UNIDADES" value={numberText(totalUnits)} variation={unitVariation} history={unitHistory} tone="navy" icon={<Database size={29}/>}/>
    </div>
    <TopDifference title="PROYECTO CON MAYOR DIFERENCIA" row={top?.name} value={compactMoney(top?.value||0)} secondary={top?numberText(totalSkus)+' SKUs':undefined}/>
    <BarPanel title={title} rows={bySite.slice(0,24)} tone={code==='sobrantes-faltantes'?'red':'navy'} valueFormatter={compactMoney}/>
  </section>
}

function TransitDashboard(props:Props){
  const {rows,year,month,onYearChange,onMonthChange}=props
  const [segment,setSegment]=useState('TODOS')
  const current=useReportFilter(rows,year,month,segment,'TODOS')
  const keys=[
    ['days_0_7','TOTAL TRANSITO < 0.7] DÍAS','green'],
    ['days_7_14','TOTAL TRANSITO < 7,14] DÍAS','orange'],
    ['days_14_30','TOTAL TRANSITO < 14,30] DÍAS','orange'],
    ['days_30_100','TOTAL TRANSITO < 30,100] DÍAS','red'],
  ] as const
  const metrics=keys.map(([key,title,tone])=>{
    const total=sum(current,key)
    const history=monthlyHistory(rows,year,(set)=>sum(set,key),segment,'TODOS')
    const prev=history[Math.max(0,month-2)]||0
    return {key,title,tone,total,history,variation:prev?total/prev-1:0}
  })
  const total=sum(current,'total')
  const byBucket=(key:string)=>current.map((row)=>({name:row.site_name,value:n(row.data[key])})).filter((r)=>r.value>0).sort((a,b)=>b.value-a.value).slice(0,10)
  return <section className="psc-dashboard psc-transit-dashboard">
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange} segment={segment} setSegment={setSegment}/>
    <div className="psc-top-metrics psc-four">
      {metrics.map((m)=><MetricCard key={m.key} title={m.title} value={compactMoney(m.total)} variation={m.variation} history={m.history} tone={m.tone}/>)}
    </div>
    <TopDifference title="TOTAL TRÁNSITO" value={compactMoney(total)} />
    <div className="psc-transit-grid">
      <BarPanel title="TRÁNSITO < 7,14] DÍAS" rows={byBucket('days_7_14')} tone="orange" valueFormatter={compactMoney}/>
      <BarPanel title="TRÁNSITO < 14,30] DÍAS" rows={byBucket('days_14_30')} tone="orange" valueFormatter={compactMoney}/>
      <BarPanel title="TRÁNSITO < 30,100] DÍAS" rows={byBucket('days_30_100')} tone="red" valueFormatter={compactMoney}/>
    </div>
  </section>
}

function UcaDashboard(props:Props){
  const {rows,year,month,onYearChange,onMonthChange}=props
  const [segment,setSegment]=useState('TODOS')
  const current=useReportFilter(rows,year,month,segment,'TODOS')
  const empty=sum(current,'empty')
  const total=sum(current,'total')
  const average=avg(current,'uca_pct')
  const freePct=total?empty/total:0
  const historyEmpty=monthlyHistory(rows,year,(set)=>sum(set,'empty'),segment,'TODOS')
  const historyFreePct=monthlyHistory(rows,year,(set)=>{
    const available=sum(set,'empty')
    const capacity=sum(set,'total')
    return capacity?available/capacity:0
  },segment,'TODOS')
  const historyPct=monthlyHistory(rows,year,(set)=>avg(set,'uca_pct'),segment,'TODOS')
  const prev=previousPeriod(year,month)
  const prevRows=useReportFilter(rows,prev.year,prev.month,segment,'TODOS')
  const prevEmpty=sum(prevRows,'empty')
  const prevTotal=sum(prevRows,'total')
  const prevFreePct=prevTotal?prevEmpty/prevTotal:0
  const prevAverage=avg(prevRows,'uca_pct')
  const bySite=current.map((row)=>({name:row.site_name,value:pct(row.data.uca_pct)})).filter((r)=>r.value>0).sort((a,b)=>b.value-a.value)
  return <section className="psc-dashboard psc-uca-dashboard">
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange} segment={segment} setSegment={setSegment}/>
    <div className="psc-top-metrics">
      <MetricCard title="TOTAL UBICACIONES LIBRES" value={numberText(empty)} variation={changeRate(empty,prevEmpty)} history={historyEmpty} tone="red"/>
      <MetricCard title="TOTAL % UBICACIONES LIBRES" value={(freePct*100).toFixed(0)+'%'} variation={changeRate(freePct,prevFreePct)} history={historyFreePct} tone="green"/>
      <MetricCard title="UCA PROMEDIO %" value={(average*100).toFixed(0)+'%'} variation={changeRate(average,prevAverage)} history={historyPct} tone="navy"/>
    </div>
    <BarPanel title="% UCA PM & S & T" rows={bySite.slice(0,24)} tone="purple" valueFormatter={percentText} target={1}/>
  </section>
}

function SavingsDashboard(props:Props){
  const {rows,year,month,onYearChange,onMonthChange}=props
  const [segment,setSegment]=useState('TODOS')
  const current=useReportFilter(rows,year,month,segment,'TODOS')
  const total=sum(current,'amount')
  const history=monthlyHistory(rows,year,(set)=>sum(set,'amount'),segment,'TODOS')
  const prev=history[Math.max(0,month-2)]||0
  const variation=prev?total/prev-1:0
  const bySite=current.map((row)=>({name:row.site_name,value:n(row.data.amount),detail:String(row.data.saving_detail||'')})).filter((r)=>r.value>0).sort((a,b)=>b.value-a.value)
  const top3=bySite.slice(0,3)
  return <section className="psc-dashboard psc-savings-dashboard">
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange} segment={segment} setSegment={setSegment}/>
    <MetricCard title="TOTAL AHORRO" value={compactMoney(total)} variation={variation} history={history} tone="navy"/>
    <article className="psc-savings-table">
      <div className="psc-panel-ribbon">PROYECTOS / SEDES CON MAYOR AHORRO</div>
      <div className="psc-table-head"><b>AHORRO</b><b>PROYECTO / SEDE</b><b>DETALLE DE AHORRO</b></div>
      {top3.map((row)=><div className="psc-table-row" key={row.name}><strong>{compactMoney(row.value)}</strong><b>{row.name}</b><span>{row.detail||'Sin detalle'}</span></div>)}
    </article>
    <BarPanel title="VARIACIÓN AHORRO PROYECTOS MINEROS & SUCURSALES & TIENDAS" rows={bySite.slice(0,24)} tone="red" valueFormatter={compactMoney}/>
  </section>
}

function PerfectShipDashboard(props:Props){
  const {rows,year,month,onYearChange,onMonthChange,reportCode}=props
  const [segment,setSegment]=useState('TODOS')
  const current=useReportFilter(rows,year,month,segment,'TODOS')
  const average=avg(current,'meets')
  const target=avg(current,'target')||.98
  const history=monthlyHistory(rows,year,(set)=>avg(set,'meets'),segment,'TODOS')
  const prev=previousPeriod(year,month)
  const previousRows=useReportFilter(rows,prev.year,prev.month,segment,'TODOS')
  const previousAverage=avg(previousRows,'meets')
  const variation=changeRate(average,previousAverage)
  const bySite=current.map((row)=>({name:row.site_name,value:pct(row.data.meets)})).filter((r)=>r.value>0).sort((a,b)=>b.value-a.value)
  const inbound=reportCode==='perfect-ship-inbound'
  return <section className={"psc-dashboard psc-perfect-dashboard "+(inbound?'inbound':'outbound')}>
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange} segment={segment} setSegment={setSegment}/>
    <article className={"psc-compliance-card "+(inbound?'orange':'green')}>
      <div className="psc-card-ribbon">PROMEDIO % CUMPLIMIENTO</div>
      <div className="psc-compliance-ring"><strong>{percentText(average)}</strong></div>
      <div className="psc-compliance-variation">
        <b className={variation>=0?'up':'down'}>{variation>=0?'▲':'▼'} {Math.abs(variation*100).toFixed(2)}%</b>
        <span>vs. mes anterior</span>
      </div>
      <Sparkline points={history} tone={inbound?'orange':'green'}/>
    </article>
    <BarPanel title={`VARIACIÓN P.S ${inbound?'INBOUND':'OUTBOUND'} - META 98 %`} rows={bySite.slice(0,24)} tone={inbound?'orange':'green'} valueFormatter={percentText} target={target}/>
  </section>
}

function SafeDashboard(props:Props){
  const {rows,year,month,onYearChange,onMonthChange}=props
  const current=useReportFilter(rows,year,month,'TODOS','TODOS')
  const dangerous=current.filter((row)=>norm(row.row_status).includes('PELIGRO'))
  const unsafe=current.filter((row)=>norm(row.row_status).includes('INSEG'))
  const prev=previousPeriod(year,month)
  const previous=useReportFilter(rows,prev.year,prev.month,'TODOS','TODOS')
  const prevDangerous=previous.filter((row)=>norm(row.row_status).includes('PELIGRO'))
  const prevUnsafe=previous.filter((row)=>norm(row.row_status).includes('INSEG'))
  const grouped=current.map((row)=>({name:row.site_name,value:Math.abs(n(row.data.score)),status:norm(row.row_status)}))
    .filter((row)=>row.value>0)
    .sort((a,b)=>b.value-a.value)
  return <section className="psc-dashboard psc-safe-dashboard">
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange} segment="TODOS" setSegment={()=>{}}/>
    <article className="psc-safe-risk">
      <div className="psc-card-ribbon">PROYECTOS CON REPORTES DE CONDUCCIÓN PELIGROSA E INSEGURA</div>
      <div className="psc-safe-summary">
        <div><span>TOTAL</span><b>{current.length}</b><em>{changeRate(current.length,previous.length)>=0?'▲':'▼'} {Math.abs(changeRate(current.length,previous.length)*100).toFixed(1)}%</em></div>
        <div><span>PELIGROSA</span><b>{dangerous.length}</b><em>{changeRate(dangerous.length,prevDangerous.length)>=0?'▲':'▼'} {Math.abs(changeRate(dangerous.length,prevDangerous.length)*100).toFixed(1)}%</em></div>
        <div><span>INSEGURA</span><b>{unsafe.length}</b><em>{changeRate(unsafe.length,prevUnsafe.length)>=0?'▲':'▼'} {Math.abs(changeRate(unsafe.length,prevUnsafe.length)*100).toFixed(1)}%</em></div>
      </div>
      <div className="psc-risk-columns">
        <div><b>PELIGROSA</b>{dangerous.slice(0,3).map((row)=><span key={row.id}>{row.site_name}</span>)}</div>
        <div><b>INSEGURA</b>{unsafe.slice(0,3).map((row)=><span key={row.id}>{row.site_name}</span>)}</div>
      </div>
    </article>
    <BarPanel title="VARIACIÓN REPORTE DE CONDUCCIÓN SAFE" rows={grouped.slice(0,20)} tone="navy" valueFormatter={(v)=>v.toFixed(2)}/>
  </section>
}

function AssetsDashboard(props:Props){
  const {rows,year,month,onYearChange,onMonthChange}=props
  const [segment,setSegment]=useState('TODOS')
  const [extra,setExtra]=useState('TODOS')
  const extraOptions=useMemo(()=>Array.from(new Set(rows.map((row)=>String(row.row_status||'').trim()).filter(Boolean))).sort(),[rows])
  const current=useReportFilter(rows,year,month,segment,extra)
  const active=current.filter((row)=>norm(row.row_status)==='ACTIVO').length
  const inactive=current.filter((row)=>norm(row.row_status)==='INACTIVO').length
  const value=sum(current,'value_pen')
  const units=sum(current,'units')
  const prev=previousPeriod(year,month)
  const prevRows=useReportFilter(rows,prev.year,prev.month,segment,extra)
  const prevActive=prevRows.filter((row)=>norm(row.row_status)==='ACTIVO').length
  const prevInactive=prevRows.filter((row)=>norm(row.row_status)==='INACTIVO').length
  const prevValue=sum(prevRows,'value_pen')
  const prevUnits=sum(prevRows,'units')
  const activeHistory=monthlyHistory(rows,year,(set)=>set.filter((row)=>norm(row.row_status)==='ACTIVO').length,segment,extra)
  const inactiveHistory=monthlyHistory(rows,year,(set)=>set.filter((row)=>norm(row.row_status)==='INACTIVO').length,segment,extra)
  const valueHistory=monthlyHistory(rows,year,(set)=>sum(set,'value_pen'),segment,extra)
  const unitsHistory=monthlyHistory(rows,year,(set)=>sum(set,'units'),segment,extra)
  const bySite=current.map((row)=>({name:row.site_name,value:n(row.data.value_pen)})).filter((r)=>r.value>0).sort((a,b)=>b.value-a.value)
  return <section className="psc-dashboard psc-assets-dashboard">
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange}
      segment={segment} setSegment={setSegment} extraTitle="ESTADO" extraOptions={extraOptions} extra={extra} setExtra={setExtra}/>
    <div className="psc-top-metrics psc-four">
      <MetricCard title="CENTROS ACTIVOS" value={numberText(active)} variation={changeRate(active,prevActive)} history={activeHistory} tone="green" icon={<CheckCircle2 size={28}/>}/>
      <MetricCard title="CENTROS INACTIVOS" value={numberText(inactive)} variation={changeRate(inactive,prevInactive)} history={inactiveHistory} tone="red" icon={<AlertTriangle size={28}/>}/>
      <MetricCard title="VALOR S/" value={'S/ '+value.toLocaleString('es-PE',{maximumFractionDigits:0})} variation={changeRate(value,prevValue)} history={valueHistory} tone="navy"/>
      <MetricCard title="UNIDADES" value={numberText(units)} variation={changeRate(units,prevUnits)} history={unitsHistory} tone="orange"/>
    </div>
    <BarPanel title="VALOR DE CENTROS ACTIVOS / INACTIVOS" rows={bySite.slice(0,24)} tone="navy" valueFormatter={(v)=>'S/ '+v.toLocaleString('es-PE',{maximumFractionDigits:0})}/>
  </section>
}

export function ProfessionalScorecardDashboard(props:Props){
  if(props.reportCode==='sobrantes-faltantes') return <SobrantesFaltantesDashboard {...props}/>
  if(props.reportCode==='diferencias-inventario'||props.reportCode==='danados-scorecard') return <DifferenceLike {...props}/>
  if(props.reportCode==='dashboard-transitos') return <TransitDashboard {...props}/>
  if(props.reportCode==='activos-inactivos') return <AssetsDashboard {...props}/>
  if(props.reportCode==='uca') return <UcaDashboard {...props}/>
  if(props.reportCode==='ahorros') return <SavingsDashboard {...props}/>
  if(props.reportCode==='perfect-ship-outbound'||props.reportCode==='perfect-ship-inbound') return <PerfectShipDashboard {...props}/>
  return <SafeDashboard {...props}/>
}
