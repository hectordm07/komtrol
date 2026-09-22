import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle, BarChart3, CheckCircle2, Database, FileText } from 'lucide-react'

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

function Filters({
  rows,year,month,onYearChange,onMonthChange,segment,setSegment,extraTitle,extraOptions,extra,setExtra
}:{
  rows:Row[];year:number;month:number;onYearChange:(n:number)=>void;onMonthChange:(n:number)=>void
  segment:string;setSegment:(v:string)=>void
  extraTitle?:string;extraOptions?:string[];extra?:string;setExtra?:(v:string)=>void
}){
  const years=useMemo(()=>Array.from(new Set(rows.map((row)=>row.year))).sort((a,b)=>b-a),[rows])
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
    <section className="psc-filter-box">
      <div className="psc-filter-head"><b>AÑO</b></div>
      <select value={year} onChange={(event)=>onYearChange(Number(event.target.value))}>
        {years.map((item)=><option key={item} value={item}>{item}</option>)}
      </select>
    </section>

    {!!segments.length&&<section className="psc-filter-box">
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

    <section className="psc-filter-box">
      <div className="psc-filter-head"><b>MES</b></div>
      <div className="psc-month-grid">
        {MONTHS.map((label,index)=><button key={label} className={month===index+1?'active':''} onClick={()=>onMonthChange(index+1)}>{label}</button>)}
      </div>
    </section>
  </aside>
}

function MetricCard({
  title,value,variation,history,tone='navy',icon
}:{
  title:string;value:string;variation?:number;history:number[];tone?:'navy'|'green'|'red'|'orange'|'purple';icon?:ReactNode
}){
  const up=(variation??0)>=0
  return <article className={"psc-metric-card "+tone}>
    <div className="psc-card-ribbon">{title}</div>
    <div className="psc-metric-main">
      <span className="psc-metric-icon">{icon||<Database size={28}/>}</span>
      <strong>{value}</strong>
      {variation!==undefined&&<em className={up?'up':'down'}>{up?'▲':'▼'} {Math.abs(variation*100).toFixed(2)}%</em>}
    </div>
    <Sparkline points={history} tone={tone}/>
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
      {rows.map((row)=><div className="psc-bar-item" key={row.name}>
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
  return Array.from({length:7},(_,index)=>{
    const d=new Date(year, index, 1)
    const month=index+1
    return metric(rows.filter((row)=>row.year===year&&row.month===month&&segmentMatch(row)&&extraMatch(row)))
  })
}

function DifferenceLike({
  code,rows,year,month,onYearChange,onMonthChange
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
  const variation=previousUsd?totalUsd/previousUsd-1:0

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
      <MetricCard title="TOTAL $" value={compactMoney(totalUsd)} variation={variation} history={totalHistory} tone={code==='sobrantes-faltantes'?'red':'navy'} icon={<Database size={29}/>}/>
      <MetricCard title="TOTAL SKUs" value={numberText(totalSkus)} history={skuHistory} tone="red" icon={<FileText size={29}/>}/>
      <MetricCard title="TOTAL UNIDADES" value={numberText(totalUnits)} history={unitHistory} tone="navy" icon={<Database size={29}/>}/>
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
  const historyPct=monthlyHistory(rows,year,(set)=>avg(set,'uca_pct'),segment,'TODOS')
  const bySite=current.map((row)=>({name:row.site_name,value:pct(row.data.uca_pct)})).filter((r)=>r.value>0).sort((a,b)=>b.value-a.value)
  return <section className="psc-dashboard psc-uca-dashboard">
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange} segment={segment} setSegment={setSegment}/>
    <div className="psc-top-metrics">
      <MetricCard title="TOTAL UBICACIONES LIBRES" value={numberText(empty)} history={historyEmpty} tone="red"/>
      <MetricCard title="TOTAL % UBICACIONES LIBRES" value={(freePct*100).toFixed(0)+'%'} history={historyPct} tone="green"/>
      <MetricCard title="UCA PROMEDIO %" value={(average*100).toFixed(0)+'%'} history={historyPct} tone="navy"/>
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
  const bySite=current.map((row)=>({name:row.site_name,value:pct(row.data.meets)})).filter((r)=>r.value>0).sort((a,b)=>b.value-a.value)
  const inbound=reportCode==='perfect-ship-inbound'
  return <section className={"psc-dashboard psc-perfect-dashboard "+(inbound?'inbound':'outbound')}>
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange} segment={segment} setSegment={setSegment}/>
    <article className={"psc-compliance-card "+(inbound?'orange':'green')}>
      <div className="psc-card-ribbon">PROMEDIO % CUMPLIMIENTO</div>
      <div className="psc-compliance-ring"><strong>{percentText(average)}</strong></div>
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
  const grouped=current.map((row)=>({name:row.site_name,value:Math.abs(n(row.data.score)),status:norm(row.row_status)}))
    .filter((row)=>row.value>0)
    .sort((a,b)=>b.value-a.value)
  return <section className="psc-dashboard psc-safe-dashboard">
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange} segment="TODOS" setSegment={()=>{}}/>
    <article className="psc-safe-risk">
      <div className="psc-card-ribbon">PROYECTOS CON REPORTES DE CONDUCCIÓN PELIGROSA E INSEGURA</div>
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
  const bySite=current.map((row)=>({name:row.site_name,value:n(row.data.value_pen)})).filter((r)=>r.value>0).sort((a,b)=>b.value-a.value)
  return <section className="psc-dashboard psc-assets-dashboard">
    <Filters rows={rows} year={year} month={month} onYearChange={onYearChange} onMonthChange={onMonthChange}
      segment={segment} setSegment={setSegment} extraTitle="ESTADO" extraOptions={extraOptions} extra={extra} setExtra={setExtra}/>
    <div className="psc-top-metrics psc-four">
      <MetricCard title="CENTROS ACTIVOS" value={numberText(active)} history={[]} tone="green" icon={<CheckCircle2 size={28}/>}/>
      <MetricCard title="CENTROS INACTIVOS" value={numberText(inactive)} history={[]} tone="red" icon={<AlertTriangle size={28}/>}/>
      <MetricCard title="VALOR S/" value={'S/ '+value.toLocaleString('es-PE',{maximumFractionDigits:0})} history={[]} tone="navy"/>
      <MetricCard title="UNIDADES" value={numberText(units)} history={[]} tone="orange"/>
    </div>
    <BarPanel title="VALOR DE CENTROS ACTIVOS / INACTIVOS" rows={bySite.slice(0,24)} tone="navy" valueFormatter={(v)=>'S/ '+v.toLocaleString('es-PE',{maximumFractionDigits:0})}/>
  </section>
}

export function ProfessionalScorecardDashboard(props:Props){
  if(props.reportCode==='sobrantes-faltantes'||props.reportCode==='diferencias-inventario'||props.reportCode==='danados-scorecard') return <DifferenceLike {...props}/>
  if(props.reportCode==='dashboard-transitos') return <TransitDashboard {...props}/>
  if(props.reportCode==='activos-inactivos') return <AssetsDashboard {...props}/>
  if(props.reportCode==='uca') return <UcaDashboard {...props}/>
  if(props.reportCode==='ahorros') return <SavingsDashboard {...props}/>
  if(props.reportCode==='perfect-ship-outbound'||props.reportCode==='perfect-ship-inbound') return <PerfectShipDashboard {...props}/>
  return <SafeDashboard {...props}/>
}
