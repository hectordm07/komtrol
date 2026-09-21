import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  Database,
  Edit3,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Save,
  Upload,
  X,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { exportRowsToExcel, exportRowsToPdfPortrait } from '../lib/exportUtils'
import { SearchableSelect } from './SearchableSelect'

export type ScorecardMode =
  | 'scorecard-carga'
  | 'inbound-outbound'
  | 'eri'
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

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'

type Profile = {
  user_id: string
  role: Role
  warehouse?: string | null
  project?: string | null
  full_name?: string | null
}

type FieldDef = {
  key: string
  source: string
  label: string
  type: 'number' | 'percent' | 'currency' | 'text'
  auto?: boolean
}

type ChartSpec = {
  type: 'bar' | 'donut' | 'trend' | 'area'
  metric?: string
  metrics?: string[]
  groupBy?: string
  size?: 'small' | 'medium' | 'large' | 'full'
  colors?: string[]
  seriesColor?: string
}

type ReportDef = {
  code: ScorecardMode
  ordinal: number
  name: string
  short_name: string
  source_mode: 'AUTO' | 'HYBRID' | 'MANUAL'
  data_sheet: string
  chart_sheet: string
  header_row: number
  site_field: string | null
  group_field: string | null
  status_field: string | null
  date_field: string
  year_field: string
  fields: FieldDef[]
  chart_layout: ChartSpec[]
  description: string | null
}

type ScorecardRow = {
  id: string
  report_code: string
  import_id: string | null
  year: number
  month: number
  period_date: string
  warehouse: string
  site_name: string
  site_group: string | null
  row_status: string | null
  detail: string | null
  row_key: string
  data: Record<string, unknown>
  source: 'LEGACY_EXCEL' | 'UPLOAD' | 'MANUAL' | 'AUTO'
  source_sheet: string | null
  source_row: number | null
  editable: boolean
  updated_at: string
}

type ImportRow = {
  report_code: string
  year: number
  month: number
  period_date: string
  warehouse: string
  site_name: string
  site_group: string | null
  row_status: string | null
  detail: string | null
  row_key: string
  data: Record<string, unknown>
  source: 'UPLOAD'
  source_sheet: string
  source_row: number
  editable: boolean
  created_by: string
  updated_by: string
  updated_at: string
}

type Props = {
  mode: ScorecardMode
  userId: string
  role: Role
  profile: Profile | null
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const REPORT_CODES: ScorecardMode[] = [
  'inbound-outbound','eri','sobrantes-faltantes','diferencias-inventario',
  'danados-scorecard','dashboard-transitos','activos-inactivos','uca',
  'ahorros','perfect-ship-outbound','perfect-ship-inbound','safe',
]

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalWarehouse(value: unknown) {
  const raw = normalizeText(value).toUpperCase()
  if (!raw) return 'SIN_ASIGNAR'
  const rules: [RegExp,string][] = [
    [/ANTAMINA/, 'ANTAMINA'],
    [/ANTAPAC/, 'ANTAPACCAY'],
    [/BAYOVAR|MISKI MAYO/, 'BAYOVAR'],
    [/CUAJONE/, 'CUAJONE'],
    [/TOQUEPALA|TOQEPALA/, 'TOQUEPALA'],
    [/LAS BAMBAS|BAMBAS/, 'LAS BAMBAS'],
    [/QUELLAVECO/, 'QUELLAVECO'],
    [/AREQUIPA/, 'AREQUIPA'],
    [/CAJAMARCA/, 'CAJAMARCA'],
    [/PIURA/, 'PIURA'],
    [/IQUITOS/, 'IQUITOS'],
    [/TRUJILLO/, 'TRUJILLO'],
    [/CHIMBOTE/, 'CHIMBOTE'],
    [/HUANCAYO/, 'HUANCAYO'],
    [/CHICLAYO/, 'CHICLAYO'],
    [/TARAPOTO/, 'TARAPOTO'],
    [/PUCALLPA/, 'PUCALLPA'],
    [/CUSCO|CUZCO/, 'CUSCO'],
    [/TACNA/, 'TACNA'],
    [/MOQUEGUA/, 'MOQUEGUA'],
    [/LOS OLIVOS/, 'LOS OLIVOS'],
    [/SAN LUIS/, 'SAN LUIS'],
  ]
  const found = rules.find(([pattern]) => pattern.test(raw))
  if (found) return found[1]
  return raw
    .replace(/^(PROYECTO|SUCURSAL|TIENDA|K-|C-|K )\s*/,'')
    .replace(/\s+(KMMP|DCP|CUMMINS)(\/DCP)?$/,'')
    .trim()
    .slice(0,80) || raw.slice(0,80)
}

function excelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = Date.UTC(1899,11,30)
    return new Date(epoch + value * 86400000)
  }
  const parsed = new Date(String(value ?? ''))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function numeric(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const text = normalizeText(value).replace(/,/g,'').replace(/%$/,'')
  if (!text) return 0
  const num = Number(text)
  if (!Number.isFinite(num)) return 0
  return String(value ?? '').includes('%') ? num / 100 : num
}

function fmtValue(value: unknown, type: FieldDef['type']) {
  if (type === 'text') return String(value ?? '—')
  const num = numeric(value)
  if (type === 'percent') return (num * 100).toLocaleString('es-PE',{maximumFractionDigits:2}) + '%'
  if (type === 'currency') return num.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})
  return num.toLocaleString('es-PE',{maximumFractionDigits:2})
}

function aggregate(rows: ScorecardRow[], field: FieldDef) {
  const values = rows.map((row)=>row.data?.[field.key]).filter((value)=>value !== null && value !== undefined && value !== '')
  if (!values.length) return 0
  const nums = values.map(numeric)
  if (field.type === 'percent' || field.key.includes('target') || field.key.includes('pct')) {
    return nums.reduce((sum,value)=>sum+value,0) / nums.length
  }
  return nums.reduce((sum,value)=>sum+value,0)
}

function periodKey(year:number,month:number) {
  return `${year}-${String(month).padStart(2,'0')}-01`
}

function normalizeProfileWarehouse(profile: Profile | null) {
  return canonicalWarehouse(profile?.warehouse || profile?.project || '')
}

function sourceBadge(mode: ReportDef['source_mode']) {
  return mode === 'AUTO' ? 'Automático' : mode === 'HYBRID' ? 'Automático + manual' : 'Carga manual'
}

function ReportIcon({mode}:{mode:ReportDef['source_mode']}) {
  return mode === 'AUTO' ? <RefreshCw size={15}/> : mode === 'HYBRID' ? <Database size={15}/> : <Edit3 size={15}/>
}

function MiniBarChart({
  title,
  rows,
  fields,
  colors,
}:{
  title:string
  rows:{label:string;values:number[]}[]
  fields:FieldDef[]
  colors:string[]
}) {
  const max=Math.max(1,...rows.flatMap((row)=>row.values.map((value)=>Math.abs(value))))
  return (
    <section className="scorecard-chart-card">
      <div className="scorecard-chart-head"><b>{title}</b><span>{rows.length} categorías</span></div>
      <div className="scorecard-multibar">
        {rows.slice(0,18).map((row)=>(
          <div className="scorecard-multibar-row" key={row.label}>
            <span>{row.label}</span>
            <div className="scorecard-multibar-bars">
              {row.values.map((value,index)=>(
                <i key={index} style={{width:`${Math.max(value===0?0:3,Math.min(100,Math.abs(value)/max*100))}%`,background:colors[index%colors.length]}} title={`${fields[index]?.label || 'Valor'}: ${fmtValue(value,fields[index]?.type || 'number')}`} />
              ))}
            </div>
            <b>{rows.length <= 10 ? row.values.map((value,index)=>fmtValue(value,fields[index]?.type || 'number')).join(' · ') : ''}</b>
          </div>
        ))}
        {!rows.length&&<div className="scorecard-empty">Sin datos para graficar.</div>}
      </div>
      {fields.length>1&&<div className="scorecard-legend">{fields.map((field,index)=><span key={field.key}><i style={{background:colors[index%colors.length]}}/>{field.label}</span>)}</div>}
    </section>
  )
}

function MiniDonutChart({
  title,
  segments,
  colors,
}:{
  title:string
  segments:{label:string;value:number;type:FieldDef['type']}[]
  colors:string[]
}) {
  const total=segments.reduce((sum,row)=>sum+Math.max(0,row.value),0)
  let cursor=0
  const gradient=total
    ? `conic-gradient(${segments.map((row,index)=>{const start=cursor;cursor+=Math.max(0,row.value)/total*360;return `${colors[index%colors.length]} ${start}deg ${cursor}deg`}).join(',')})`
    : 'conic-gradient(#E9EEFF 0deg 360deg)'
  return (
    <section className="scorecard-chart-card">
      <div className="scorecard-chart-head"><b>{title}</b><span>Distribución</span></div>
      <div className="scorecard-donut-layout">
        <div className="scorecard-donut" style={{background:gradient}}><div><b>{total.toLocaleString('es-PE',{maximumFractionDigits:2})}</b><span>Total</span></div></div>
        <div className="scorecard-donut-legend">
          {segments.map((row,index)=><div key={row.label}><i style={{background:colors[index%colors.length]}}/><span>{row.label}</span><b>{fmtValue(row.value,row.type)}</b></div>)}
        </div>
      </div>
    </section>
  )
}

function MiniTrendChart({
  title,
  points,
  color='#002060',
  area=false,
  type='number',
}:{
  title:string
  points:{label:string;value:number}[]
  color?:string
  area?:boolean
  type?:FieldDef['type']
}) {
  const max=Math.max(1,...points.map((point)=>Math.abs(point.value)))
  const line=points.map((point,index)=>{
    const x=points.length<=1?50:5+index*(90/(points.length-1))
    const y=87-(Math.abs(point.value)/max)*66
    return `${x},${y}`
  }).join(' ')
  const areaPoints=points.length ? `5,87 ${line} 95,87` : ''
  return (
    <section className="scorecard-chart-card">
      <div className="scorecard-chart-head"><b>{title}</b><span>{points.length ? points[points.length-1].label : ''}</span></div>
      <div className="scorecard-trend">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="5" y1="87" x2="95" y2="87" className="scorecard-axis"/>
          <line x1="5" y1="54" x2="95" y2="54" className="scorecard-gridline"/>
          {area&&areaPoints&&<polygon points={areaPoints} style={{fill:`${color}20`}}/>}
          <polyline points={line} style={{stroke:color}} className="scorecard-trend-line"/>
          {points.map((point,index)=>{
            const x=points.length<=1?50:5+index*(90/(points.length-1))
            const y=87-(Math.abs(point.value)/max)*66
            return <circle key={point.label} cx={x} cy={y} r="2.2" style={{fill:color}}><title>{point.label}: {fmtValue(point.value,type)}</title></circle>
          })}
        </svg>
        <div className="scorecard-trend-labels">{points.map((point)=><span key={point.label}>{point.label}</span>)}</div>
      </div>
    </section>
  )
}

export function ScorecardRemoteModule({mode,userId,role,profile}:Props) {
  const now=new Date()
  const [definitions,setDefinitions]=useState<ReportDef[]>([])
  const [rows,setRows]=useState<ScorecardRow[]>([])
  const [imports,setImports]=useState<any[]>([])
  const [year,setYear]=useState(now.getFullYear())
  const [month,setMonth]=useState(now.getMonth()+1)
  const [warehouseFilter,setWarehouseFilter]=useState(role==='ADMINISTRADOR'||role==='SUPERVISOR'?'TODOS':normalizeProfileWarehouse(profile))
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [editing,setEditing]=useState(false)
  const [uploading,setUploading]=useState(false)
  const [editingRows,setEditingRows]=useState<Record<string,ScorecardRow>>({})
  const fileInputRef=useRef<HTMLInputElement|null>(null)

  const report=definitions.find((item)=>item.code===mode)
  const canLoad=role==='COORDINADOR'||role==='ADMINISTRADOR'
  const canEdit=role==='COORDINADOR'||role==='ADMINISTRADOR'
  const canSeeSourceData=role!=='TRABAJADOR'
  const isViewer=role==='TRABAJADOR'
  const isAdmin=role==='ADMINISTRADOR'

  async function reload() {
    setLoading(true)
    setMessage('')
    const defRes=await supabase.from('scorecard_report_definitions').select('*').eq('active',true).order('ordinal')
    const impRes=canSeeSourceData
      ? await supabase.from('scorecard_imports').select('*').order('created_at',{ascending:false}).limit(50)
      : { data: [], error: null }
    if(defRes.error){setMessage(defRes.error.message);setLoading(false);return}
    setDefinitions((defRes.data??[]) as ReportDef[])
    setImports(impRes.data??[])

  if (mode==='scorecard-carga' && isViewer) {
    return (
      <div className="scorecard-module">
        <section className="panel scorecard-viewer-only">
          <BarChart3 size={32}/>
          <div>
            <b>Vista de reportes</b>
            <span>El perfil Almacenero tiene acceso únicamente a los dashboards y gráficos del Scorecard.</span>
          </div>
        </section>
      </div>
    )
  }

    if(mode==='scorecard-carga'){
      setRows([])
      setLoading(false)
      return
    }

    const startYear=Math.max(2024,year-2)
    let query=supabase
      .from('scorecard_rows')
      .select('*')
      .eq('report_code',mode)
      .gte('year',startYear)
      .lte('year',year)
      .order('period_date',{ascending:true})
      .limit(10000)

    const rowRes=await query
    if(rowRes.error) setMessage(rowRes.error.message)
    setRows((rowRes.data??[]) as ScorecardRow[])
    setLoading(false)
  }

  useEffect(()=>{reload()},[mode,year])

  useEffect(()=>{
    if(!(role==='ADMINISTRADOR'||role==='SUPERVISOR')) setWarehouseFilter(normalizeProfileWarehouse(profile))
  },[role,profile?.warehouse,profile?.project])

  const warehouses=useMemo(()=>Array.from(new Set(rows.map((row)=>row.warehouse).filter(Boolean))).sort(),[rows])

  const scopedRows=useMemo(()=>rows.filter((row)=>
    row.year===year&&row.month===month&&(warehouseFilter==='TODOS'||row.warehouse===warehouseFilter)
  ),[rows,year,month,warehouseFilter])

  const visibleHistorical=useMemo(()=>rows.filter((row)=>warehouseFilter==='TODOS'||row.warehouse===warehouseFilter),[rows,warehouseFilter])

  const fieldMap=useMemo(()=>new Map((report?.fields||[]).map((field)=>[field.key,field])),[report])

  const chartCategories=(fieldKeys:string[])=>{
    const grouped=new Map<string,ScorecardRow[]>()
    scopedRows.forEach((row)=>{
      const label=warehouseFilter==='TODOS'
        ? row.site_name
        : row.row_status || row.detail || row.site_name
      grouped.set(label,[...(grouped.get(label)||[]),row])
    })
    return Array.from(grouped.entries()).map(([label,group])=>({
      label,
      values:fieldKeys.map((key)=>aggregate(group,fieldMap.get(key)||{key,source:key,label:key,type:'number'})),
    })).sort((a,b)=>Math.max(...b.values.map(Math.abs))-Math.max(...a.values.map(Math.abs))).slice(0,24)
  }

  const trendPoints=(metric:string)=>{
    const field=fieldMap.get(metric)||{key:metric,source:metric,label:metric,type:'number' as const}
    const periods=new Map<string,ScorecardRow[]>()
    visibleHistorical.forEach((row)=>{
      const key=`${row.year}-${String(row.month).padStart(2,'0')}`
      periods.set(key,[...(periods.get(key)||[]),row])
    })
    return Array.from(periods.entries())
      .sort(([a],[b])=>a.localeCompare(b))
      .slice(-12)
      .map(([key,group])=>({label:`${MONTHS[Number(key.slice(5))-1]} ${key.slice(2,4)}`,value:aggregate(group,field)}))
  }

  const summaryFields=(report?.fields||[]).slice(0,6)

  const scorecardExportRows=useMemo(()=> {
    if(!report) return [] as Record<string,unknown>[]
    return scopedRows.map((row)=>({
      site_name:row.site_name,
      warehouse:row.warehouse,
      status:row.row_status||row.detail||'',
      ...Object.fromEntries(report.fields.map((field)=>[
        field.key,
        fmtValue(row.data?.[field.key],field.type),
      ])),
    }))
  },[report,scopedRows])

  const scorecardExportColumns=useMemo(()=> {
    if(!report) return []
    return [
      {header:'PROYECTO / SEDE',key:'site_name',width:26},
      {header:'ALMACÉN',key:'warehouse',width:18},
      ...(report.status_field?[{header:'ESTADO / DETALLE',key:'status',width:28}]:[]),
      ...report.fields.map((field)=>({
        header:field.label,
        key:field.key,
        width:field.type==='text'?30:16,
      })),
    ]
  },[report])

  function exportScorecardExcel(){
    if(!report||!scorecardExportRows.length) return
    exportRowsToExcel(
      `KOMTROL_Scorecard_${report.code}_${year}_${String(month).padStart(2,'0')}`,
      report.short_name || report.name,
      scorecardExportColumns,
      scorecardExportRows,
      [['Reporte',report.name],['Periodo',`${MONTHS[month-1]} ${year}`],['Registros',scorecardExportRows.length]]
    )
  }

  function exportScorecardPdf(){
    if(!report||!scorecardExportRows.length) return
    exportRowsToPdfPortrait(
      `KOMTROL_Scorecard_${report.code}_${year}_${String(month).padStart(2,'0')}`,
      `KOMTROL · ${report.name}`,
      scorecardExportColumns,
      scorecardExportRows,
      {subtitle:`${MONTHS[month-1]} ${year} · ${warehouseFilter==='TODOS'?'Todos los proyectos':warehouseFilter}`,summary:[['Registros',scorecardExportRows.length]]}
    )
  }

  async function saveRow(row:ScorecardRow) {
    const editableData={...row.data}
    const {data,error}=await supabase
      .from('scorecard_rows')
      .update({data:editableData,updated_by:userId,updated_at:new Date().toISOString(),source:row.source==='AUTO'?'AUTO':'MANUAL'})
      .eq('id',row.id)
      .select('*')
      .single()
    if(error||!data){setMessage(error?.message||'No se pudo guardar el registro.');return}
    setRows((current)=>current.map((item)=>item.id===row.id?data as ScorecardRow:item))
    setEditingRows((current)=>{const next={...current};delete next[row.id];return next})
    setMessage('Dato actualizado correctamente.')
  }

  function editValue(row:ScorecardRow,key:string,value:string,field:FieldDef) {
    const parsed=field.type==='text'?value:(value.trim()===''?null:Number(value.replace(',','.')))
    setEditingRows((current)=>{
      const base=current[row.id]||row
      return {...current,[row.id]:{...base,data:{...base.data,[key]:parsed}}}
    })
  }

  async function addManualRow() {
    if(!report) return
    const targetWarehouse=warehouseFilter==='TODOS'
      ? (role==='COORDINADOR'?normalizeProfileWarehouse(profile):'SIN_ASIGNAR')
      : warehouseFilter
    const siteName=role==='COORDINADOR'
      ? (profile?.project||profile?.warehouse||targetWarehouse)
      : targetWarehouse
    const rowKey=`manual:${Date.now()}`
    const emptyData=Object.fromEntries(report.fields.map((field)=>[field.key,field.type==='text'?'':null]))
    const {data,error}=await supabase.from('scorecard_rows').insert({
      report_code:report.code,
      year,month,period_date:periodKey(year,month),
      warehouse:targetWarehouse,
      site_name:siteName,
      site_group:null,row_status:null,detail:null,row_key:rowKey,
      data:emptyData,source:'MANUAL',editable:true,created_by:userId,updated_by:userId,
    }).select('*').single()
    if(error||!data){setMessage(error?.message||'No se pudo crear el registro.');return}
    setRows((current)=>[...current,data as ScorecardRow])
    setEditing(true)
    setEditingRows((current)=>({...current,[data.id]:data as ScorecardRow}))
  }

  async function submitPeriod() {
    if(!report) return
    const target=warehouseFilter==='TODOS'?normalizeProfileWarehouse(profile):warehouseFilter
    if(!target||target==='SIN_ASIGNAR'){setMessage('Selecciona un almacén/proyecto antes de enviar.');return}
    const {error}=await supabase.from('scorecard_submissions').upsert({
      report_code:report.code,year,month,warehouse:target,
      project_name:profile?.project||target,status:'ENVIADO',
      submitted_by:userId,submitted_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    },{onConflict:'report_code,year,month,warehouse'})
    setMessage(error?error.message:'Periodo enviado para validación.')
  }

  async function refreshAutomaticData() {
    if(!report||!['AUTO','HYBRID'].includes(report.source_mode)) return
    const target=warehouseFilter==='TODOS'?normalizeProfileWarehouse(profile):warehouseFilter
    if(!target||target==='SIN_ASIGNAR'){setMessage('Selecciona un proyecto/almacén para actualizar datos automáticos.');return}
    const start=`${year}-${String(month).padStart(2,'0')}-01`
    const endMonth=month===12?1:month+1
    const endYear=month===12?year+1:year
    const end=`${endYear}-${String(endMonth).padStart(2,'0')}-01`
    let autoData:Record<string,unknown>|null=null

    if(report.code==='inbound-outbound'){
      const [g,o]=await Promise.all([
        supabase.from('guides').select('line_count').eq('warehouse',target).gte('created_at',start).lt('created_at',end),
        supabase.from('outbound_movements').select('quantity').eq('warehouse',target).gte('movement_date',start).lt('movement_date',end),
      ])
      autoData={
        inbound:(g.data??[]).reduce((sum,row)=>sum+Number(row.line_count||0),0),
        outbound:(o.data??[]).reduce((sum,row)=>sum+Number(row.quantity||0),0),
      }
    } else if(report.code==='sobrantes-faltantes'){
      const inc=await supabase.from('incidents').select('incident_type,qty_expected,qty_received').eq('warehouse',target).gte('created_at',start).lt('created_at',end)
      const values=inc.data??[]
      const missing=values.filter((row)=>row.incident_type==='FALTANTE')
      const surplus=values.filter((row)=>row.incident_type==='SOBRANTE')
      autoData={
        skus:values.length,
        units:missing.reduce((sum,row)=>sum+Math.max(0,Number(row.qty_expected||0)-Number(row.qty_received||0)),0)
          +surplus.reduce((sum,row)=>sum+Math.max(0,Number(row.qty_received||0)-Number(row.qty_expected||0)),0),
      }
    } else if(report.code==='diferencias-inventario'){
      const res=await supabase
        .from('incidents')
        .select('material_no,qty_expected,qty_received,incident_type')
        .eq('warehouse',target)
        .gte('created_at',start)
        .lt('created_at',end)
      const values=(res.data??[]).filter((row)=>
        ['DIFERENCIA','FALTANTE','SOBRANTE'].includes(String(row.incident_type||'').toUpperCase())
      )
      autoData={
        skus:new Set(values.map((row)=>row.material_no).filter(Boolean)).size,
        units:values.reduce((sum,row)=>sum+Math.abs(Number(row.qty_received||0)-Number(row.qty_expected||0)),0),
      }
    } else if(report.code==='danados-scorecard'){
      const res=await supabase.from('damaged_materials').select('material_no,quantity').eq('warehouse',target).gte('event_date',start).lt('event_date',end)
      const values=res.data??[]
      autoData={skus:new Set(values.map((row)=>row.material_no)).size,units:values.reduce((sum,row)=>sum+Number(row.quantity||0),0)}
    } else if(report.code==='dashboard-transitos'){
      const res=await supabase.from('transits').select('transit_date,value_amount,status').eq('warehouse',target).eq('status','EN_TRANSITO')
      const buckets={days_0_7:0,days_7_14:0,days_14_30:0,days_30_100:0,total:0}
      ;(res.data??[]).forEach((row)=>{
        const age=Math.max(0,Math.floor((Date.now()-new Date(row.transit_date+'T12:00:00').getTime())/86400000))
        const amount=Number(row.value_amount||0)
        buckets.total+=amount
        if(age<=7)buckets.days_0_7+=amount
        else if(age<=14)buckets.days_7_14+=amount
        else if(age<=30)buckets.days_14_30+=amount
        else buckets.days_30_100+=amount
      })
      autoData=buckets
    }

    if(!autoData){setMessage('Este indicador conserva carga manual para los campos no disponibles automáticamente.');return}

    const existing=scopedRows.find((row)=>row.warehouse===target)
    const merged={...(existing?.data||{}),...autoData}
    if(existing){
      const {error}=await supabase.from('scorecard_rows').update({data:merged,source:'AUTO',updated_by:userId,updated_at:new Date().toISOString()}).eq('id',existing.id)
      if(error){setMessage(error.message);return}
    }else{
      const {error}=await supabase.from('scorecard_rows').insert({
        report_code:report.code,year,month,period_date:periodKey(year,month),
        warehouse:target,site_name:profile?.project||target,row_key:`auto:${year}:${month}:${target}`,
        data:merged,source:'AUTO',editable:true,created_by:userId,updated_by:userId,
      })
      if(error){setMessage(error.message);return}
    }
    setMessage('Datos automáticos actualizados desde KOMTROL.')
    await reload()
  }

  function parseSheet(def:ReportDef,book:XLSX.WorkBook) {
    const sheet=book.Sheets[def.data_sheet]
    if(!sheet) return [] as ImportRow[]
    const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{range:def.header_row-1,defval:null,raw:true})
    const result:ImportRow[]=[]
    raw.forEach((source,index)=>{
      const siteRaw=source[def.site_field||''] ?? source['DETALLE'] ?? source['Proyecto'] ?? source['Proyectos Mineros'] ?? source['SEDE'] ?? source['NOMBRE'] ?? source['PROYECTO / PLACA']
      if(siteRaw===null||siteRaw===undefined||String(siteRaw).trim()==='') return
      const date=excelDate(source[def.date_field || 'MES'])
      const rowYear=Number(source[def.year_field || 'AÑO'] || date?.getFullYear() || year)
      const rowMonth=Number(date ? date.getMonth()+1 : month)
      if(!rowYear||!rowMonth||rowMonth<1||rowMonth>12) return
      const warehouse=canonicalWarehouse(siteRaw)
      const ownWarehouse=normalizeProfileWarehouse(profile)
      if(role==='COORDINADOR'&&warehouse!==ownWarehouse) return

      const data:Record<string,unknown>={}
      def.fields.forEach((field)=>{
        const value=source[field.source]
        data[field.key]=field.type==='text'
          ? normalizeText(value)
          : value===null||value===undefined||value==='' ? null : numeric(value)
      })
      const status=def.status_field ? normalizeText(source[def.status_field]) || null : null
      const detailField=def.code==='diferencias-inventario'?'Detalle':null
      const detail=detailField ? normalizeText(source[detailField]) || null : null
      const siteName=normalizeText(siteRaw)
      result.push({
        report_code:def.code,year:rowYear,month:rowMonth,period_date:periodKey(rowYear,rowMonth),
        warehouse,site_name:siteName,
        site_group:def.group_field?normalizeText(source[def.group_field])||null:null,
        row_status:status,detail,
        row_key:`${def.code}:${index+def.header_row+1}:${warehouse}:${status||''}:${detail||''}`,
        data,source:'UPLOAD',source_sheet:def.data_sheet,source_row:index+def.header_row+1,
        editable:true,created_by:userId,updated_by:userId,updated_at:new Date().toISOString(),
      })
    })
    return result
  }

  async function uploadWorkbook(file:File,allReports:boolean) {
    if(!canLoad) return
    setUploading(true)
    setMessage('')
    try{
      const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true})
      const defs=allReports?definitions.filter((item)=>REPORT_CODES.includes(item.code)):report?[report]:[]
      const parsed=defs.flatMap((def)=>parseSheet(def,book))
      if(!parsed.length){setMessage('No se encontraron filas válidas para tu alcance en el archivo.');setUploading(false);return}

      const dates=parsed.map((row)=>row.period_date).sort()
      const {data:imp,error:impError}=await supabase.from('scorecard_imports').insert({
        file_name:file.name,import_scope:allReports?'ALL_REPORTS':'REPORT',
        report_code:allReports?null:report?.code||null,
        warehouse:role==='COORDINADOR'?normalizeProfileWarehouse(profile):null,
        project_name:role==='COORDINADOR'?profile?.project||null:null,
        period_from:dates[0],period_to:dates[dates.length-1],status:'PROCESANDO',
        rows_total:parsed.length,uploaded_by:userId,
      }).select('*').single()
      if(impError||!imp) throw impError||new Error('No se pudo registrar la carga.')

      let loaded=0
      for(let i=0;i<parsed.length;i+=300){
        const chunk=parsed.slice(i,i+300).map((row)=>({...row,import_id:imp.id}))
        const {error}=await supabase.from('scorecard_rows').upsert(chunk,{onConflict:'report_code,year,month,warehouse,row_key'})
        if(error) throw error
        loaded+=chunk.length
      }
      await supabase.from('scorecard_imports').update({
        status:'COMPLETADO',rows_loaded:loaded,rows_error:0,completed_at:new Date().toISOString(),
      }).eq('id',imp.id)

      setMessage(`Carga completada: ${loaded.toLocaleString('es-PE')} filas procesadas.`)
      await reload()
    }catch(error:any){
      setMessage(error?.message||'No se pudo procesar el Excel.')
    }finally{
      setUploading(false)
      if(fileInputRef.current) fileInputRef.current.value=''
    }
  }

  function onFileChange(event:ChangeEvent<HTMLInputElement>,allReports:boolean) {
    const file=event.target.files?.[0]
    if(file) void uploadWorkbook(file,allReports)
  }

  if(loading) return <section className="panel"><div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando Scorecard…</p></div></section>

  if(mode==='scorecard-carga'){
    return (
      <div className="scorecard-module">
        {message&&<div className="inline-message">{message}</div>}
        <section className="panel scorecard-management">
          <div className="scorecard-management-actions">
            <div>
              <b>Gestión de datos del Scorecard</b>
              <span>{isAdmin?'Carga masiva de todos los proyectos y 12 reportes.':'Carga mensual de los 12 reportes de tu proyecto.'}</span>
            </div>
            {canLoad&&<label className="primary-button scorecard-upload-button">
              <Upload size={17}/>{uploading?'Procesando…':isAdmin?'Cargar Scorecard completo':'Cargar Scorecard de mi proyecto'}
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" disabled={uploading} onChange={(event)=>onFileChange(event,true)}/>
            </label>}
          </div>
          <div className="scorecard-report-catalog">
            {definitions.filter((item)=>REPORT_CODES.includes(item.code)).map((item)=>(
              <article key={item.code}>
                <span>{item.ordinal}</span>
                <div><b>{item.name}</b><small>{item.description}</small></div>
                <em className={`source-${item.source_mode.toLowerCase()}`}><ReportIcon mode={item.source_mode}/>{sourceBadge(item.source_mode)}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="scorecard-data-title"><b>Últimas cargas</b><span>Trazabilidad de archivos procesados</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Archivo</th><th>Alcance</th><th>Proyecto</th><th>Filas</th><th>Estado</th></tr></thead>
              <tbody>{imports.map((row)=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString('es-PE')}</td><td>{row.file_name}</td><td>{row.import_scope}</td><td>{row.project_name||row.warehouse||'Todos'}</td><td>{row.rows_loaded}/{row.rows_total}</td><td><span className="status-pill">{row.status}</span></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  if(!report) return <section className="panel"><div className="scorecard-empty">Reporte no configurado.</div></section>

  return (
    <div className="scorecard-module">
      <section className="panel scorecard-toolbar">
        <div className="scorecard-report-context">
          <span>{String(report.ordinal).padStart(2,'0')}</span>
          <div><b>{report.name}</b><small>{report.description}</small></div>
          <em className={`source-${report.source_mode.toLowerCase()}`}><ReportIcon mode={report.source_mode}/>{sourceBadge(report.source_mode)}</em>
        </div>
        <div className="scorecard-filters">
          <SearchableSelect value={String(year)} onChange={(value)=>value&&setYear(Number(value))} options={[2024,2025,2026,2027].map((value)=>({value:String(value),label:String(value)}))} placeholder="Buscar año…" clearable={false} ariaLabel="Filtrar por año"/>
          <SearchableSelect value={String(month)} onChange={(value)=>value&&setMonth(Number(value))} options={MONTHS.map((label,index)=>({value:String(index+1),label}))} placeholder="Buscar mes…" clearable={false} ariaLabel="Filtrar por mes"/>
          {(role==='ADMINISTRADOR'||role==='SUPERVISOR')&&<SearchableSelect value={warehouseFilter} onChange={(value)=>setWarehouseFilter(value||'TODOS')} options={[{value:'TODOS',label:'Todos los proyectos'},...warehouses.map((warehouse)=>({value:warehouse,label:warehouse}))]} placeholder="Buscar proyecto…" clearable={false} ariaLabel="Filtrar por proyecto"/>}
          <button className="secondary-button" disabled={!scorecardExportRows.length} onClick={exportScorecardPdf}><FileText size={16}/> PDF</button>
          <button className="secondary-button" disabled={!scorecardExportRows.length} onClick={exportScorecardExcel}><FileSpreadsheet size={16}/> Excel</button>
          <button className="icon-button" onClick={reload}><RefreshCw size={17}/></button>
        </div>
      </section>

      {message&&<div className="inline-message">{message}</div>}

      <div className="scorecard-kpis">
        {summaryFields.map((field)=>(
          <article key={field.key}>
            <span>{field.label}</span>
            <b>{fmtValue(aggregate(scopedRows,field),field.type)}</b>
            <small>{scopedRows.length} registro(s)</small>
          </article>
        ))}
      </div>

      <div className="scorecard-chart-grid">
        {(report.chart_layout||[]).map((spec,index)=>{
          const keys=spec.metrics || (spec.metric?[spec.metric]:[])
          const fields=keys.map((key)=>fieldMap.get(key)||{key,source:key,label:key,type:'number' as const})
          const colors=spec.colors?.length?spec.colors:['#002060','#00B050','#FF0000','#FFC000']
          if(spec.type==='donut'){
            const segments=fields.map((field)=>({label:field.label,value:aggregate(scopedRows,field),type:field.type}))
            return <div className={`scorecard-chart-slot size-${spec.size||'medium'}`} key={index}><MiniDonutChart title={fields.map((field)=>field.label).join(' / ')} segments={segments} colors={colors}/></div>
          }
          if(spec.type==='trend'||spec.type==='area'){
            const field=fields[0]
            return <div className={`scorecard-chart-slot size-${spec.size||'small'}`} key={index}><MiniTrendChart title={field.label} points={trendPoints(field.key)} color={spec.seriesColor||colors[0]} area={spec.type==='area'} type={field.type}/></div>
          }
          return <div className={`scorecard-chart-slot size-${spec.size||'large'}`} key={index}><MiniBarChart title={fields.map((field)=>field.label).join(' vs ')} rows={chartCategories(keys)} fields={fields} colors={colors}/></div>
        })}
      </div>

      {isViewer && !scopedRows.length && (
        <section className="panel scorecard-viewer-empty">
          <BarChart3 size={26}/>
          <div><b>Sin información publicada para este período</b><span>Cuando el Coordinador actualice el Scorecard, los gráficos aparecerán aquí automáticamente.</span></div>
        </section>
      )}

      {canSeeSourceData && (
        <section className="panel scorecard-data-panel">
          <div className="scorecard-data-head">
            <div><b>Datos del reporte</b><span>{year} · {MONTHS[month-1]} · {warehouseFilter==='TODOS'?'Todos los proyectos':warehouseFilter}</span></div>
            <div className="button-row">
              {['AUTO','HYBRID'].includes(report.source_mode)&&canLoad&&<button className="secondary-button" onClick={refreshAutomaticData}><RefreshCw size={16}/> Actualizar automáticos</button>}
              {canLoad&&<label className="secondary-button scorecard-upload-button"><FileSpreadsheet size={16}/>{uploading?'Procesando…':'Cargar Excel'}<input type="file" accept=".xlsx,.xls" disabled={uploading} onChange={(event)=>onFileChange(event,false)}/></label>}
              {canEdit&&<button className="secondary-button" onClick={()=>setEditing((value)=>!value)}>{editing?<X size={16}/>:<Edit3 size={16}/>} {editing?'Cerrar edición':'Editar datos'}</button>}
              {canEdit&&<button className="secondary-button" onClick={addManualRow}><Database size={16}/> Nuevo registro</button>}
              {role==='COORDINADOR'&&<button className="primary-button" onClick={submitPeriod}><CheckCircle2 size={16}/> Enviar mes</button>}
            </div>
          </div>

          <div className="table-wrap scorecard-edit-table">
            <table>
              <thead><tr><th>Proyecto / Sede</th>{report.status_field&&<th>Estado / Detalle</th>}{report.fields.map((field)=><th key={field.key}>{field.label}</th>)}{editing&&<th></th>}</tr></thead>
              <tbody>
                {scopedRows.slice(0,400).map((row)=>{
                  const edited=editingRows[row.id]||row
                  return <tr key={row.id}>
                    <td><b>{row.site_name}</b><small>{row.warehouse}</small></td>
                    {report.status_field&&<td>{row.row_status||row.detail||'—'}</td>}
                    {report.fields.map((field)=>{
                      const value=edited.data?.[field.key]
                      const editable=editing&&canEdit&&(isAdmin||!field.auto)
                      return <td key={field.key}>{editable
                        ? <input
                            value={value===null||value===undefined?'':String(value)}
                            onChange={(event)=>editValue(row,field.key,event.target.value,field)}
                            type={field.type==='text'?'text':'number'}
                            step={field.type==='percent'?'0.0001':'any'}
                          />
                        : <span>{fmtValue(value,field.type)}</span>}</td>
                    })}
                    {editing&&<td><button className="icon-button" disabled={!editingRows[row.id]} onClick={()=>saveRow(edited)}><Save size={15}/></button></td>}
                  </tr>
                })}
              </tbody>
            </table>
            {!scopedRows.length&&<div className="scorecard-empty"><BarChart3 size={28}/><b>Sin información para este periodo</b><span>Carga el Excel, registra valores manuales o actualiza datos automáticos.</span></div>}
          </div>
        </section>
      )}
    </div>
  )
}
