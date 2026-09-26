import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  Database,
  ClipboardList,
  Target,
  TrendingUp,
} from 'lucide-react'

type Row = {
  id?: string
  year:number
  month:number
  period_date:string
  warehouse:string
  site_name:string
  site_group:string|null
  row_status:string|null
  detail:string|null
  source_row:number|null
  data:Record<string,unknown>
}

type Props = {
  rows:Row[]
  historical:Row[]
  year:number
  month:number
  contextLabel:string
  centerGroup:string
  onYearChange:(year:number)=>void
  onMonthChange:(month:number)=>void
  onCenterGroupChange:(value:string)=>void
}

const MONTHS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const TARGET=.995
const ERI_SITE_ORDER=[
  'Antamina','Antamina DCP','Antapacay','Antapaccay DCP',
  'AREQUIPA CUMMINS','AREQUIPA KMMP','Bayovar','Bayovar DCP',
  'CAJAMARCA CUMMINS','CAJAMARCA KMMP','Cuajone','Cuajone DCP',
  'IQUITOS','Las Bambas','Las Bambas DCP','PIURA CUMMINS',
  'PIURA KMMP','Quellaveco','Tienda Los Olivos','Tienda San Luis',
  'Toquepala','Toquepala DCP','Trujillo KMMP',
].map((value)=>value.toUpperCase())

function num(value:unknown){
  if(typeof value==='number') return Number.isFinite(value)?value:0
  const raw=String(value??'').trim().replace(/,/g,'').replace('%','')
  if(!raw) return 0
  const parsed=Number(raw)
  if(!Number.isFinite(parsed)) return 0
  return String(value??'').includes('%') ? parsed/100 : parsed
}

function pct(value:unknown){
  const n=num(value)
  if(n>1.5) return n/100
  return n
}

function fmtPct(value:number){
  return (value*100).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})+'%'
}

function avg(values:number[]){
  const clean=values.filter((value)=>Number.isFinite(value)&&value>0)
  return clean.length?clean.reduce((sum,value)=>sum+value,0)/clean.length:0
}

function rowSiteKey(row:Row){
  return `${String(row.warehouse||'').trim().toUpperCase()}::${String(row.site_name||'').trim().toUpperCase()}`
}

function eriSiteChannel(name:string){
  const upper=String(name||'').toUpperCase()
  const hasDcp=upper.includes('DCP')
  const hasKmmp=upper.includes('KMMP')
  if(hasDcp&&hasKmmp) return 'COMBINED'
  if(hasDcp) return 'DCP'
  if(hasKmmp) return 'KMMP'
  return 'BASE'
}

function sameEriSiteAcrossHistory(selected:Row,candidate:Row){
  const selectedWarehouse=String(selected.warehouse||'').trim().toUpperCase()
  const candidateWarehouse=String(candidate.warehouse||'').trim().toUpperCase()
  if(!selectedWarehouse||selectedWarehouse!==candidateWarehouse) return false

  const selectedChannel=eriSiteChannel(selected.site_name)
  const candidateChannel=eriSiteChannel(candidate.site_name)
  if(selectedChannel==='COMBINED') return true
  if(selectedChannel==='DCP') return candidateChannel==='DCP'||candidateChannel==='COMBINED'
  if(selectedChannel==='KMMP') return candidateChannel==='KMMP'||candidateChannel==='BASE'||candidateChannel==='COMBINED'
  return candidateChannel==='BASE'||candidateChannel==='KMMP'||candidateChannel==='COMBINED'
}

function pctVariation(current:number,previous:number){
  if(previous>0) return current/previous-1
  return current>0?1:0
}

function fmtVariation(value:number){
  const sign=value>0?'+':value<0?'-':''
  return `${sign}${Math.abs(value*100).toFixed(2)}%`
}

function statusText(row:Row){
  return String(row.row_status||row.detail||'').toUpperCase()
}

function noPresented(row:Row){
  const status=statusText(row)
  const items=pct(row.data.items_pct)
  const value=pct(row.data.value_pct)
  return status.includes('NO PRESENT') || (!items && !value)
}

function MetricRing({
  title,
  value,
  variation,
  tone,
  icon,
}:{title:string;value:number;variation:number;tone:'navy'|'green';icon:ReactNode}){
  const radius=58
  const circumference=2*Math.PI*radius
  const progress=Math.max(0,Math.min(1,value))
  const dash=progress*circumference
  return (
    <article
      className={"eri-ring-card "+tone}
      data-tooltip={`${title} ${fmtPct(value)} · Variación ${fmtVariation(variation)} vs. mes anterior`}
    >
      <div className="eri-card-title">
        <span>{icon}</span>
        <b>{title}</b>
      </div>
      <div className="eri-ring-wrap">
        <svg className="eri-ring" viewBox="0 0 140 140" aria-label={title+' '+fmtPct(value)}>
          <circle cx="70" cy="70" r={radius} className="eri-ring-track"/>
          <circle
            cx="70"
            cy="70"
            r={radius}
            className="eri-ring-progress"
            strokeDasharray={`${dash} ${circumference-dash}`}
            transform="rotate(-90 70 70)"
          />
        </svg>
        <strong>{fmtPct(value)}</strong>
      </div>
      <div className="eri-ring-footer">
        <div className="eri-meta-chip"><Target size={13}/> Meta 99.50%</div>
        <div className={variation>=0?'eri-variation-chip up':'eri-variation-chip down'}>
          <b>{variation>=0?'▲':'▼'} {Math.abs(variation*100).toFixed(2)}%</b>
          <span>vs. mes anterior</span>
        </div>
      </div>
    </article>
  )
}

function TrendPanel({historical,year,month}:{historical:Row[];year:number;month:number}){
  const periods=useMemo(()=>Array.from({length:7},(_,index)=>{
    const offset=6-index
    const date=new Date(year,month-1-offset,1)
    const y=date.getFullYear()
    const m=date.getMonth()+1
    const periodRows=historical.filter((row)=>row.year===y&&row.month===m&&!noPresented(row))
    return {
      key:`${y}-${m}`,
      label:MONTHS[m-1],
      items:avg(periodRows.map((row)=>pct(row.data.items_pct))),
      value:avg(periodRows.map((row)=>pct(row.data.value_pct))),
    }
  }),[historical,year,month])

  const detailedPeriods=periods.map((row,index)=>{
    const previous=index>0?periods[index-1]:null
    return {
      ...row,
      itemsVariation:previous?pctVariation(row.items,previous.items):0,
      valueVariation:previous?pctVariation(row.value,previous.value):0,
    }
  })

  const min=.985
  const max=1.005
  const toY=(value:number)=>12+((max-Math.max(min,Math.min(max,value)))/(max-min))*74
  const toX=(index:number)=>detailedPeriods.length<=1?50:6+index*(88/(detailedPeriods.length-1))
  const line=(key:'items'|'value')=>detailedPeriods.map((row,index)=>`${toX(index)},${toY(row[key])}`).join(' ')

  return (
    <article className="eri-trend-card">
      <div className="eri-card-title eri-trend-title">
        <span><TrendingUp size={17}/></span>
        <b>PROMEDIO ERI $ / %</b>
        <div className="eri-trend-legend">
          <em className="green"><i/>Promedio $</em>
          <em className="navy"><i/>Promedio IL</em>
        </div>
      </div>
      <div className="eri-trend-chart">
        <div className="eri-trend-axis">
          <span>100.5%</span><span>100.0%</span><span>99.5%</span><span>99.0%</span><span>98.5%</span>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {[12,30.5,49,67.5,86].map((y)=><line key={y} x1="4" y1={y} x2="98" y2={y} className="eri-gridline"/>)}
          <polyline points={line('value')} className="eri-trend-line green"/>
          <polyline points={line('items')} className="eri-trend-line navy"/>
          {detailedPeriods.map((row,index)=><circle key={'v'+row.key} cx={toX(index)} cy={toY(row.value)} r="2.2" className="eri-dot green"><title>{row.label} · Promedio $ {fmtPct(row.value)} · Variación {fmtVariation(row.valueVariation)}</title></circle>)}
          {detailedPeriods.map((row,index)=><circle key={'i'+row.key} cx={toX(index)} cy={toY(row.items)} r="2.2" className="eri-dot navy"><title>{row.label} · Promedio IL {fmtPct(row.items)} · Variación {fmtVariation(row.itemsVariation)}</title></circle>)}
        </svg>
        <div className="eri-trend-months">{detailedPeriods.map((row)=><span key={row.key}>{row.label}</span>)}</div>
      </div>
    </article>
  )
}

function ComparisonBars({
  rows,
  historical,
  year,
  month,
  selectedSiteKey,
  onSelectSite,
}:{
  rows:Row[]
  historical:Row[]
  year:number
  month:number
  selectedSiteKey:string|null
  onSelectSite:(key:string)=>void
}){
  const previousDate=new Date(year,month-2,1)
  const previousYear=previousDate.getFullYear()
  const previousMonth=previousDate.getMonth()+1
  const previousByKey=new Map(
    historical
      .filter((row)=>row.year===previousYear&&row.month===previousMonth&&!noPresented(row))
      .map((row)=>[rowSiteKey(row),row] as const)
  )

  const items=rows
    .filter((row)=>!noPresented(row))
    .slice()
    .sort((a,b)=>{
      const ai=ERI_SITE_ORDER.indexOf(a.site_name.toUpperCase())
      const bi=ERI_SITE_ORDER.indexOf(b.site_name.toUpperCase())
      if(ai>=0||bi>=0) return (ai<0?9999:ai)-(bi<0?9999:bi)
      return (a.source_row??9999)-(b.source_row??9999)
    })
    .map((row)=>{
      const key=rowSiteKey(row)
      const previous=previousByKey.get(key)
      const items=pct(row.data.items_pct)
      const value=pct(row.data.value_pct)
      const previousItems=previous?pct(previous.data.items_pct):0
      const previousValue=previous?pct(previous.data.value_pct):0
      return {
        key,
        name:row.site_name,
        items,
        value,
        itemsVariation:pctVariation(items,previousItems),
        valueVariation:pctVariation(value,previousValue),
      }
    })

  const min=.90
  const max=1.02
  const heightPct=(value:number)=>Math.max(0,Math.min(100,((value-min)/(max-min))*100))
  const targetPct=heightPct(TARGET)

  return (
    <article className="eri-bars-card">
      <div className="eri-bars-head">
        <div><BarChart3 size={18}/><b>VARIACIÓN % AARR & S & T - META 99.50%</b></div>
        <div className="eri-bars-legend">
          <span className="navy"><i/>AARR & S & T (IL)</span>
          <span className="green"><i/>AARR & S & T ($)</span>
          <span className="target"><i/>Meta 99.50%</span>
        </div>
      </div>
      <div className="eri-bars-chart">
        <div className="eri-y-axis">
          <span>102%</span><span>100%</span><span>98%</span><span>96%</span><span>94%</span><span>92%</span><span>90%</span>
        </div>
        <div
          className={selectedSiteKey?'eri-bars-plot has-selection':'eri-bars-plot'}
          style={{'--eri-count':Math.max(items.length,1)} as CSSProperties}
        >
          <div className="eri-target-line" style={{bottom:`${targetPct}%`}}><span>Meta 99.50%</span></div>
          {items.map((item,index)=>{
            const selected=selectedSiteKey===item.key
            return (
              <div
                className={selected?'eri-bar-group selected':'eri-bar-group'}
                key={item.name+'-'+index}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={()=>onSelectSite(item.key)}
                onKeyDown={(event)=>{
                  if(event.key==='Enter'||event.key===' '){
                    event.preventDefault()
                    onSelectSite(item.key)
                  }
                }}
                data-tooltip={`${item.name}\nIL ${fmtPct(item.items)} · Δ ${fmtVariation(item.itemsVariation)}\n$ ${fmtPct(item.value)} · Δ ${fmtVariation(item.valueVariation)}\nMeta 99.50% · ${selected?'Clic para quitar filtro':'Clic para filtrar sede'}`}
              >
                <div className="eri-bars-pair">
                  <div
                    className="eri-bar-col"
                    style={{'--eri-bar-height':`${heightPct(item.items)}%`} as CSSProperties}
                  >
                    <span className="eri-bar-top navy">{fmtPct(item.items)}</span>
                    <div className="eri-bar navy" style={{height:'var(--eri-bar-height)'}}/>
                  </div>
                  <div
                    className="eri-bar-col"
                    style={{'--eri-bar-height':`${heightPct(item.value)}%`} as CSSProperties}
                  >
                    <span className="eri-bar-top green">{fmtPct(item.value)}</span>
                    <div className="eri-bar green" style={{height:'var(--eri-bar-height)'}}/>
                  </div>
                </div>
                <span className="eri-site-label" title={item.name}>{item.name}</span>
              </div>
            )
          })}
          {!items.length&&<div className="eri-empty-bars">Sin registros para el período seleccionado.</div>}
        </div>
      </div>
    </article>
  )
}


function EriUnifiedTrend({
  points,labels,formatter
}:{
  points:number[]
  labels:string[]
  formatter:(value:number)=>string
}){
  const clean=points.length?points:[0,0,0,0,0,0]
  const min=Math.min(...clean)
  const max=Math.max(...clean)
  const span=Math.max(max-min,.0001)
  const x=(index:number)=>8+index*(86/Math.max(clean.length-1,1))
  const y=(value:number)=>8+((max-value)/span)*34
  const line=clean.map((value,index)=>x(index)+','+y(value)).join(' ')
  const area=x(0)+',44 '+line+' '+x(clean.length-1)+',44'
  return <div className="sf3-trend sf3-trend-io navy eri-unified-trend">
    <div className="sf3-yaxis"><span>{formatter(max)}</span><span>{formatter((max+min)/2)}</span><span>{formatter(min)}</span></div>
    <svg viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={area} className="area"/>
      <polyline points={line} className="line"/>
      {clean.map((value,index)=>{
        const current=index===clean.length-1
        return current
          ? <g key={index}><circle cx={x(index)} cy={y(value)} r="3.2" className="current-ring"/><circle cx={x(index)} cy={y(value)} r="1.8" className="current-dot"/></g>
          : <circle key={index} cx={x(index)} cy={y(value)} r="1.7" className="dot"/>
      })}
    </svg>
    <div className="sf3-trend-months">{labels.map((label,index)=><span className={index===labels.length-1?'current':''} key={label+'-'+index}>{label}</span>)}</div>
  </div>
}

function EriUnifiedKpi({
  title,value,variation,sixVariation,history,labels,icon
}:{
  title:string
  value:number
  variation:number
  sixVariation:number|null
  history:number[]
  labels:string[]
  icon:ReactNode
}){
  const semantic=(v:number|null)=>v===null||v===0?'neutral':v>0?'up':'down'
  return <article className="sf3-kpi sf3-kpi-modern navy eri-unified-kpi">
    <div className="sf3-kpi-summary">
      <span className="sf3-kpi-icon">{icon}</span>
      <div className="sf3-kpi-copy"><small>{title}</small><strong>{fmtPct(value)}</strong></div>
      <div className="sf3-kpi-variations">
        <div className={semantic(variation)}>
          <b>{variation>0?'↗':variation<0?'↘':'—'} {variation===0?'0.0%':fmtVariation(variation)}</b>
          <span>vs. mes anterior</span>
        </div>
        <div className={semantic(sixVariation)}>
          <b>{sixVariation===null?'—':(sixVariation>0?'↗ ':sixVariation<0?'↘ ':'— ')+fmtVariation(sixVariation)}</b>
          <span>vs. hace 6 meses</span>
        </div>
      </div>
    </div>
    <EriUnifiedTrend points={history} labels={labels} formatter={fmtPct}/>
  </article>
}

function eriAverage(row:Row){
  const stored=pct(row.data.average_pct)
  if(stored>0) return stored
  const items=pct(row.data.items_pct)
  const value=pct(row.data.value_pct)
  return items||value?(items+value)/2:0
}

function eriStatusMatch(row:Row,status:string){
  if(status==='TODOS') return true
  if(status==='NO PRESENTARON') return noPresented(row)
  if(status==='PRESENTARON') return !noPresented(row)
  const average=eriAverage(row)
  if(status==='BAJO META') return !noPresented(row)&&average>0&&average<TARGET
  if(status==='CUMPLE') return !noPresented(row)&&average>=TARGET
  return true
}

export function ERIDashboard({
  rows,
  historical,
  year,
  month,
  centerGroup,
  onYearChange,
  onMonthChange,
  onCenterGroupChange,
}:Props){
  const [selectedSiteKey,setSelectedSiteKey]=useState<string|null>(null)
  const [eriStatus,setEriStatus]=useState('TODOS')

  useEffect(()=>{
    if(selectedSiteKey&&!rows.some((row)=>rowSiteKey(row)===selectedSiteKey)){
      setSelectedSiteKey(null)
    }
  },[selectedSiteKey,rows,year,month,centerGroup])

  const selectedCurrentRow=selectedSiteKey
    ? rows.find((row)=>rowSiteKey(row)===selectedSiteKey) || null
    : null

  const dashboardRows=selectedCurrentRow ? [selectedCurrentRow] : rows
  const dashboardHistorical=selectedCurrentRow
    ? historical.filter((row)=>sameEriSiteAcrossHistory(selectedCurrentRow,row))
    : historical

  const current=dashboardRows.filter((row)=>!noPresented(row))
  const noPresentation=dashboardRows.filter(noPresented)
  const avgItems=avg(current.map((row)=>pct(row.data.items_pct)))
  const avgValue=avg(current.map((row)=>pct(row.data.value_pct)))
  const previousDate=new Date(year,month-2,1)
  const previousRows=dashboardHistorical.filter((row)=>
    row.year===previousDate.getFullYear()&&
    row.month===previousDate.getMonth()+1&&
    !noPresented(row)
  )
  const previousItems=avg(previousRows.map((row)=>pct(row.data.items_pct)))
  const previousValue=avg(previousRows.map((row)=>pct(row.data.value_pct)))
  const itemsVariation=previousItems?avgItems/previousItems-1:(avgItems?1:0)
  const valueVariation=previousValue?avgValue/previousValue-1:(avgValue?1:0)

  const below=dashboardRows
    .filter((row)=>!noPresented(row))
    .filter((row)=>{
      const storedAverage=pct(row.data.average_pct)
      const items=pct(row.data.items_pct)
      const value=pct(row.data.value_pct)
      const calculatedAverage=(items+value)/2
      const eriAverage=storedAverage>0?storedAverage:calculatedAverage
      return eriAverage>0&&eriAverage<TARGET
    })

  const centerOptions=[
    {label:'TODOS',value:'TODOS'},
    {label:'PROYECTO',value:'GRUPO:PROYECTO_MINERO'},
    {label:'SUCURSAL',value:'GRUPO:SUCURSAL'},
    {label:'TIENDA',value:'GRUPO:TIENDA'},
  ]
  const availableYears=Array.from(new Set(historical.map((row)=>row.year))).sort((a,b)=>b-a)
  const availableMonths=Array.from(new Set(
    historical.filter((row)=>row.year===year).map((row)=>row.month)
  )).sort((a,b)=>a-b)
  const displayedMonths=availableMonths.length?availableMonths:[month]
  useEffect(()=>{
    if(availableMonths.length && !availableMonths.includes(month)){
      onMonthChange(availableMonths[availableMonths.length-1])
    }
  },[availableMonths.join(','),month,onMonthChange])

  const unifiedRows=dashboardRows.filter((row)=>eriStatusMatch(row,eriStatus))
  const unifiedHistorical=dashboardHistorical.filter((row)=>eriStatusMatch(row,eriStatus))
  const presentedRows=unifiedRows.filter((row)=>!noPresented(row))
  const unifiedItems=avg(presentedRows.map((row)=>pct(row.data.items_pct)))
  const unifiedValue=avg(presentedRows.map((row)=>pct(row.data.value_pct)))
  const unifiedAverage=avg(presentedRows.map(eriAverage))

  const previousUnified=unifiedHistorical.filter((row)=>
    row.year===previousDate.getFullYear()&&
    row.month===previousDate.getMonth()+1&&
    !noPresented(row)
  )
  const previousUnifiedItems=avg(previousUnified.map((row)=>pct(row.data.items_pct)))
  const previousUnifiedValue=avg(previousUnified.map((row)=>pct(row.data.value_pct)))
  const previousUnifiedAverage=avg(previousUnified.map(eriAverage))

  const sixDate=new Date(year,month-7,1)
  const sixUnified=unifiedHistorical.filter((row)=>
    row.year===sixDate.getFullYear()&&
    row.month===sixDate.getMonth()+1&&
    !noPresented(row)
  )
  const sixUnifiedItems=avg(sixUnified.map((row)=>pct(row.data.items_pct)))
  const sixUnifiedValue=avg(sixUnified.map((row)=>pct(row.data.value_pct)))
  const sixUnifiedAverage=avg(sixUnified.map(eriAverage))

  const eriPeriods=Array.from({length:6},(_,index)=>{
    const offset=5-index
    const date=new Date(year,month-1-offset,1)
    return {year:date.getFullYear(),month:date.getMonth()+1,label:MONTHS[date.getMonth()]}
  })
  const eriPeriodRows=eriPeriods.map((period)=>unifiedHistorical.filter((row)=>
    row.year===period.year&&row.month===period.month&&!noPresented(row)
  ))
  const historyItems=eriPeriodRows.map((set)=>avg(set.map((row)=>pct(row.data.items_pct))))
  const historyValue=eriPeriodRows.map((set)=>avg(set.map((row)=>pct(row.data.value_pct))))
  const historyAverage=eriPeriodRows.map((set)=>avg(set.map(eriAverage)))
  const historyLabels=eriPeriods.map((period)=>period.label)

  const validForHighlight=unifiedRows
    .filter((row)=>!noPresented(row)&&eriAverage(row)>0)
    .slice()
    .sort((a,b)=>{
      const diff=eriAverage(a)-eriAverage(b)
      if(diff!==0) return diff
      return (a.source_row??9999)-(b.source_row??9999)
    })
  const highlightRow=validForHighlight[0]
  const highlightValue=highlightRow?eriAverage(highlightRow):0
  const previousHighlight=highlightRow
    ? dashboardHistorical
        .filter((row)=>
          row.year===previousDate.getFullYear()&&
          row.month===previousDate.getMonth()+1&&
          sameEriSiteAcrossHistory(highlightRow,row)&&
          !noPresented(row)
        )
        .sort((a,b)=>(a.source_row??9999)-(b.source_row??9999))[0]
    : undefined
  const highlightVariation=highlightRow&&previousHighlight
    ? pctVariation(highlightValue,eriAverage(previousHighlight))
    : 0
  const highlightHistory=highlightRow
    ? eriPeriods.map((period)=>{
        const matches=dashboardHistorical.filter((row)=>
          row.year===period.year&&
          row.month===period.month&&
          sameEriSiteAcrossHistory(highlightRow,row)&&
          !noPresented(row)
        )
        return avg(matches.map(eriAverage))
      })
    : [0,0,0,0,0,0]

  const noPresentedCount=unifiedRows.filter(noPresented).length
  const belowCount=unifiedRows.filter((row)=>!noPresented(row)&&eriAverage(row)>0&&eriAverage(row)<TARGET).length
  const eriStatuses=['TODOS','PRESENTARON','NO PRESENTARON','BAJO META','CUMPLE']

  return (
    <section className="sf3-dashboard eri-dashboard eri-dashboard-reference eri-dashboard-master-pattern">
      <aside className="sf3-left eri-master-left" aria-label="Filtros ERI">
        <section className="sf3-filter-card">
          <b>AÑO</b>
          <div className="sf3-grid sf3-years">
            {availableYears.map((value)=><button key={value} type="button" className={year===value?'active':''} onClick={()=>onYearChange(value)}>{value}</button>)}
          </div>
        </section>

        <section className="sf3-filter-card">
          <b>CENTRO</b>
          <div className="sf3-grid sf3-centers">
            {centerOptions.map((option)=><button key={option.value} type="button" className={centerGroup===option.value?'active':''} onClick={()=>{onCenterGroupChange(option.value);setSelectedSiteKey(null)}}>{option.label}</button>)}
          </div>
        </section>

        <section className="sf3-filter-card">
          <b>STATUS</b>
          <div className="sf3-grid sf3-status">
            {eriStatuses.map((status)=><button key={status} type="button" className={eriStatus===status?'active':''} onClick={()=>{setEriStatus(status);setSelectedSiteKey(null)}}>{status}</button>)}
          </div>
        </section>

        <section className="sf3-filter-card">
          <b>MES</b>
          <div className="sf3-grid sf3-months">
            {displayedMonths.map((monthNumber)=><button key={monthNumber} type="button" className={month===monthNumber?'active':''} onClick={()=>onMonthChange(monthNumber)}>{MONTHS[monthNumber-1]}</button>)}
          </div>
        </section>

        <article className="sf3-highlight kom-unified-card navy eri-master-highlight">
          <div className="sf3-highlight-title">SEDE CON MENOR ERI</div>
          <div className="sf3-highlight-body">
            <b>{highlightRow?.site_name||'Sin datos'}</b>
            <strong>{fmtPct(highlightValue)}</strong>
            <div className="sf3-highlight-meta">
              <small>{belowCount+' bajo meta · '+noPresentedCount+' no presentaron'}</small>
              <em>Meta 99.50%</em>
            </div>
            <div className={'sf3-highlight-variation '+(highlightVariation>0?'up':highlightVariation<0?'down':'neutral')}>
              <span className="sf3-highlight-variation-icon">{highlightVariation>0?'↗':highlightVariation<0?'↘':'—'}</span>
              <div><b>{fmtVariation(highlightVariation)}</b><small>Variación mensual</small></div>
            </div>
            <div className="sf3-highlight-spark" aria-hidden="true">
              <svg viewBox="0 0 100 30" preserveAspectRatio="none">
                <polyline
                  points={highlightHistory.map((value,index)=>{
                    const min=Math.min(...highlightHistory),max=Math.max(...highlightHistory),span=Math.max(max-min,.0001)
                    const x=highlightHistory.length===1?50:index*(100/(highlightHistory.length-1))
                    const y=26-((value-min)/span)*20
                    return x+','+y
                  }).join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>
        </article>
      </aside>

      <div className="sf3-kpis eri-master-kpis">
        <EriUnifiedKpi
          title="PROMEDIO IL"
          value={unifiedItems}
          variation={pctVariation(unifiedItems,previousUnifiedItems)}
          sixVariation={sixUnified.length?pctVariation(unifiedItems,sixUnifiedItems):null}
          history={historyItems}
          labels={historyLabels}
          icon={<BarChart3 size={24}/>}
        />
        <EriUnifiedKpi
          title="PROMEDIO $"
          value={unifiedValue}
          variation={pctVariation(unifiedValue,previousUnifiedValue)}
          sixVariation={sixUnified.length?pctVariation(unifiedValue,sixUnifiedValue):null}
          history={historyValue}
          labels={historyLabels}
          icon={<Database size={24}/>}
        />
        <EriUnifiedKpi
          title="PROMEDIO ERI"
          value={unifiedAverage}
          variation={pctVariation(unifiedAverage,previousUnifiedAverage)}
          sixVariation={sixUnified.length?pctVariation(unifiedAverage,sixUnifiedAverage):null}
          history={historyAverage}
          labels={historyLabels}
          icon={<Target size={24}/>}
        />
      </div>

      <ComparisonBars
        rows={unifiedRows}
        historical={unifiedHistorical}
        year={year}
        month={month}
        selectedSiteKey={selectedSiteKey}
        onSelectSite={(key)=>setSelectedSiteKey((currentKey)=>currentKey===key?null:key)}
      />
    </section>
  )

}
