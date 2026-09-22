import { useMemo, type CSSProperties, type ReactNode } from 'react'
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
    <article className={"eri-ring-card "+tone}>
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
    const rows=historical.filter((row)=>row.year===y&&row.month===m&&!noPresented(row))
    return {
      key:`${y}-${m}`,
      label:MONTHS[m-1],
      items:avg(rows.map((row)=>pct(row.data.items_pct))),
      value:avg(rows.map((row)=>pct(row.data.value_pct))),
    }
  }),[historical,year,month])

  const min=.985
  const max=1.005
  const toY=(value:number)=>12+((max-Math.max(min,Math.min(max,value)))/(max-min))*74
  const toX=(index:number)=>periods.length<=1?50:6+index*(88/(periods.length-1))
  const line=(key:'items'|'value')=>periods.map((row,index)=>`${toX(index)},${toY(row[key])}`).join(' ')

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
          {periods.map((row,index)=><circle key={'v'+row.key} cx={toX(index)} cy={toY(row.value)} r="2.2" className="eri-dot green"><title>{row.label} · Promedio $ {fmtPct(row.value)}</title></circle>)}
          {periods.map((row,index)=><circle key={'i'+row.key} cx={toX(index)} cy={toY(row.items)} r="2.2" className="eri-dot navy"><title>{row.label} · Promedio IL {fmtPct(row.items)}</title></circle>)}
        </svg>
        <div className="eri-trend-months">{periods.map((row)=><span key={row.key}>{row.label}</span>)}</div>
      </div>
    </article>
  )
}

function ComparisonBars({rows}:{rows:Row[]}){
  const items=rows
    .filter((row)=>!noPresented(row))
    .slice()
    .sort((a,b)=>{
      const ai=ERI_SITE_ORDER.indexOf(a.site_name.toUpperCase())
      const bi=ERI_SITE_ORDER.indexOf(b.site_name.toUpperCase())
      if(ai>=0||bi>=0) return (ai<0?9999:ai)-(bi<0?9999:bi)
      return (a.source_row??9999)-(b.source_row??9999)
    })
    .map((row)=>({
      name:row.site_name,
      items:pct(row.data.items_pct),
      value:pct(row.data.value_pct),
    }))

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
        <div className="eri-bars-plot" style={{'--eri-count':Math.max(items.length,1)} as CSSProperties}>
          <div className="eri-target-line" style={{bottom:`${targetPct}%`}}><span>Meta 99.50%</span></div>
          {items.map((item,index)=>(
            <div
              className="eri-bar-group"
              key={item.name+'-'+index}
              data-tooltip={`${item.name} · IL ${fmtPct(item.items)} · $ ${fmtPct(item.value)} · Meta 99.50%`}
            >
              <div className="eri-bars-pair">
                <div className="eri-bar-col">
                  <span className="eri-bar-top navy">{fmtPct(item.items)}</span>
                  <div className="eri-bar navy" style={{height:`${heightPct(item.items)}%`}}/>
                </div>
                <div className="eri-bar-col">
                  <span className="eri-bar-top green">{fmtPct(item.value)}</span>
                  <div className="eri-bar green" style={{height:`${heightPct(item.value)}%`}}/>
                </div>
              </div>
              <span className="eri-site-label">{item.name}</span>
            </div>
          ))}
          {!items.length&&<div className="eri-empty-bars">Sin registros para el período seleccionado.</div>}
        </div>
      </div>
    </article>
  )
}

export function ERIDashboard({
  rows,
  historical,
  year,
  month,
  contextLabel,
  centerGroup,
  onYearChange,
  onMonthChange,
  onCenterGroupChange,
}:Props){
  const current=rows.filter((row)=>!noPresented(row))
  const noPresentation=rows.filter(noPresented)
  const avgItems=avg(current.map((row)=>pct(row.data.items_pct)))
  const avgValue=avg(current.map((row)=>pct(row.data.value_pct)))
  const previousDate=new Date(year,month-2,1)
  const previousRows=historical.filter((row)=>
    row.year===previousDate.getFullYear()&&
    row.month===previousDate.getMonth()+1&&
    !noPresented(row)
  )
  const previousItems=avg(previousRows.map((row)=>pct(row.data.items_pct)))
  const previousValue=avg(previousRows.map((row)=>pct(row.data.value_pct)))
  const itemsVariation=previousItems?avgItems/previousItems-1:(avgItems?1:0)
  const valueVariation=previousValue?avgValue/previousValue-1:(avgValue?1:0)

  const below=rows
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

  return (
    <section className="eri-dashboard eri-dashboard-reference">
      <aside className="eri-filter-rail" aria-label="Filtros ERI">
        <section className="eri-filter-card eri-year-filter">
          <div className="eri-filter-title"><CalendarClock size={15}/><b>AÑO</b></div>
          <div className="eri-year-grid">
            {availableYears.map((value)=><button
              key={value}
              type="button"
              className={year===value?'active':''}
              onClick={()=>onYearChange(value)}
            >{value}</button>)}
          </div>
        </section>

        <section className="eri-filter-card">
          <div className="eri-filter-title"><Building2 size={15}/><b>CENTRO</b></div>
          <div className="eri-center-buttons">
            {centerOptions.map((option)=>(
              <button
                key={option.value}
                type="button"
                className={centerGroup===option.value?'active':''}
                onClick={()=>onCenterGroupChange(option.value)}
              >{option.label}</button>
            ))}
          </div>
        </section>

        <section className="eri-filter-card eri-month-filter">
          <div className="eri-filter-title"><CalendarClock size={15}/><b>MES</b></div>
          <div className="eri-month-grid">
            {displayedMonths.map((monthNumber)=>(
              <button
                key={monthNumber}
                type="button"
                className={month===monthNumber?'active':''}
                onClick={()=>onMonthChange(monthNumber)}
              >{MONTHS[monthNumber-1]}</button>
            ))}
          </div>
        </section>

        <div className="eri-filter-context">
          <b>{MONTHS[month-1]} {year}</b>
          <span>{contextLabel}</span>
        </div>
      </aside>

      <div className="eri-top-grid">
        <MetricRing title="PROMEDIO IL" value={avgItems} variation={itemsVariation} tone="navy" icon={<BarChart3 size={17}/>}/>
        <MetricRing title="PROMEDIO $" value={avgValue} variation={valueVariation} tone="green" icon={<Database size={17}/>}/>

        <article className="eri-status-card">
          <div className="eri-card-title gray"><span><ClipboardList size={17}/></span><b>NO PRESENTARON</b></div>
          <div className="eri-status-body empty-state">
            <span className="eri-empty-icon"><ClipboardList size={30}/></span>
            {noPresentation.length
              ? <div className="eri-name-list">{noPresentation.slice(0,8).map((row)=><b key={row.site_name}>{row.site_name}</b>)}</div>
              : <p>No se registran centros que no presentaron.</p>}
          </div>
        </article>

        <article className="eri-status-card">
          <div className="eri-card-title gray"><span><AlertTriangle size={17}/></span><b>ERI &lt; 99.5 %</b></div>
          <div className="eri-status-body">
            {below.length
              ? <div className="eri-name-list">{below.slice(0,10).map((row)=><b key={row.site_name}>{row.site_name}</b>)}</div>
              : <div className="eri-all-ok"><span>✓</span><b>Todos cumplen la meta</b><small>ERI ≥ 99.50%</small></div>}
          </div>
        </article>

        <TrendPanel historical={historical} year={year} month={month}/>
      </div>

      <ComparisonBars rows={rows}/>
    </section>
  )
}
