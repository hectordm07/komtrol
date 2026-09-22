import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { exportElementToPdfLandscape, exportRowsToExcel } from '../lib/exportUtils'
import {
  DashboardHierarchyFilter,
  dashboardFilterLabel,
  matchesDashboardHierarchy,
  type DashboardCenter,
} from './DashboardHierarchyFilter'
import { InboundOutboundDashboard } from './InboundOutboundDashboard'
import { ERIDashboard } from './ERIDashboard'
import { ProfessionalScorecardDashboard, type ProfessionalScorecardCode } from './ProfessionalScorecardDashboard'

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

type WarehouseMeta = {
  name: string
  code: string
  warehouse_scope: 'REMOTO' | 'CENTRAL'
  remote_group: 'PROYECTO_MINERO' | 'SUCURSAL' | 'TIENDA' | null
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

const TEMPLATE_FIELD_HEADERS:Record<string,string> = {
  inbound:'INBOUND',
  outbound:'OUTBOUND',
  person_day:'PERSONAS_X_DIA',
  work_days:'DIAS_LABORABLES',
  productivity:'PRODUCTIVIDAD',
  target:'META',
  hours:'HORAS',
  items_pct:'ITEMS_PCT',
  value_pct:'VALOR_PCT',
  average_pct:'PROMEDIO_ERI',
  skus:'SKUS',
  units:'UNIDADES',
  usd:'USD',
  variation_units:'VARIACION_UNIDADES',
  variation_usd:'VARIACION_USD_PCT',
  variation:'VARIACION_USD',
  variation_pct:'VARIACION_PCT',
  days_0_7:'TRANSITO_0_7_USD',
  days_7_14:'TRANSITO_7_14_USD',
  days_14_30:'TRANSITO_14_30_USD',
  days_30_100:'TRANSITO_30_100_USD',
  total:'TOTAL',
  total_pct:'TOTAL_PCT',
  center:'CENTRO_SAP',
  company:'SOCIEDAD',
  value_pen:'VALOR_PEN',
  comments:'COMENTARIOS',
  empty:'VACIAS',
  uca_pct:'UCA_PCT',
  concept:'CONCEPTO',
  saving_detail:'DETALLE_AHORRO',
  amount:'AHORRO_USD',
  meets:'CUMPLE_PCT',
  not_meets:'NO_CUMPLE_PCT',
  negative_behaviors:'CONDUCTAS_NEGATIVAS',
  score:'PUNTAJE',
  driving:'CONDUCCION',
}

function templateHeader(field:FieldDef){
  return TEMPLATE_FIELD_HEADERS[field.key] || field.label.toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÜÑ]+/g,'_')
}

function pickSource(source:Record<string,unknown>,keys:Array<string|null|undefined>){
  for(const key of keys){
    if(!key) continue
    const value=source[key]
    if(value!==undefined&&value!==null&&value!=='') return value
  }
  return null
}

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
    [/ANTAPAC/, 'ANTAPACAY'],
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
    [/CUSCO|CUZCO/, 'CUZCO'],
    [/TACNA/, 'TACNA'],
    [/MOQUEGUA/, 'MOQUEGUA'],
    [/LOS OLIVOS/, 'LOS OLIVOS'],
    [/SAN LUIS/, 'SAN LUIS'],
    [/ILO/, 'ILO'],
    [/CALLAO/, 'CALLAO'],
    [/PUCUSANA/, 'PUCUSANA'],
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
  const [warehouseCatalog,setWarehouseCatalog]=useState<WarehouseMeta[]>([])
  const [warehouseCenters,setWarehouseCenters]=useState<DashboardCenter[]>([])
  const [rows,setRows]=useState<ScorecardRow[]>([])
  const [imports,setImports]=useState<any[]>([])
  const [year,setYear]=useState(now.getFullYear())
  const [month,setMonth]=useState(now.getMonth()+1)
  const [warehouseFilter,setWarehouseFilter]=useState('TODOS')
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [editing,setEditing]=useState(false)
  const [sourceDataOpen,setSourceDataOpen]=useState(false)
  const [uploading,setUploading]=useState(false)

  useEffect(()=>{
    setSourceDataOpen(false)
  },[mode,year,month,warehouseFilter])
  const [pdfExporting,setPdfExporting]=useState(false)
  const [editingRows,setEditingRows]=useState<Record<string,ScorecardRow>>({})
  const fileInputRef=useRef<HTMLInputElement|null>(null)
  const dashboardRef=useRef<HTMLDivElement|null>(null)
  const periodInitializedRef=useRef<string>('')

  const report=definitions.find((item)=>item.code===mode)
  const ownWarehouseMeta=warehouseCatalog.find((item)=>
    item.name.toUpperCase()===normalizeProfileWarehouse(profile).toUpperCase() ||
    item.code.toUpperCase()===normalizeProfileWarehouse(profile).toUpperCase()
  )
  const canViewRemoteNetwork=role==='ADMINISTRADOR' ||
    ownWarehouseMeta?.remote_group==='PROYECTO_MINERO' ||
    ownWarehouseMeta?.remote_group==='SUCURSAL' ||
    ownWarehouseMeta?.remote_group==='TIENDA'
  const isAdmin=role==='ADMINISTRADOR'
  const canManageReportData=isAdmin
  const canLoad=role==='COORDINADOR'||isAdmin
  const canEdit=canManageReportData
  const canSeeSourceData=canManageReportData
  const isViewer=role==='TRABAJADOR'

  async function reload() {
    setLoading(true)
    setMessage('')
    const [defRes,warehouseRes,centerRes,impRes]=await Promise.all([
      supabase.from('scorecard_report_definitions').select('*').eq('active',true).order('ordinal'),
      supabase.from('warehouses').select('name,code,warehouse_scope,remote_group').eq('active',true).order('name'),
      supabase.from('warehouse_centers').select('warehouse_code,code,name,business_unit,active').eq('active',true).order('warehouse_code').order('name'),
      canSeeSourceData
        ? supabase.from('scorecard_imports').select('*').order('created_at',{ascending:false}).limit(50)
        : Promise.resolve({ data: [], error: null }),
    ])
    if(defRes.error){setMessage(defRes.error.message);setLoading(false);return}
    if(warehouseRes.error||centerRes.error){setMessage(warehouseRes.error?.message||centerRes.error?.message||'No se pudo cargar la jerarquía de almacenes.');setLoading(false);return}
    setDefinitions((defRes.data??[]) as ReportDef[])
    setWarehouseCatalog((warehouseRes.data??[]) as WarehouseMeta[])
    setWarehouseCenters((centerRes.data??[]) as DashboardCenter[])
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

    const startYear=2024
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
    const loaded=(rowRes.data??[]) as ScorecardRow[]
    setRows(loaded)

    const initializationKey=String(mode)
    if(loaded.length && periodInitializedRef.current!==initializationKey){
      const hasSelectedPeriod=loaded.some((row)=>row.year===year&&row.month===month)
      if(!hasSelectedPeriod){
        const latest=[...loaded].sort((a,b)=>b.period_date.localeCompare(a.period_date))[0]
        if(latest){
          periodInitializedRef.current=initializationKey
          if(latest.year!==year) setYear(latest.year)
          setMonth(latest.month)
        }
      }else{
        periodInitializedRef.current=initializationKey
      }
    }

    setLoading(false)
  }

  useEffect(()=>{reload()},[mode,year])

  useEffect(()=>{
    if(canViewRemoteNetwork){
      setWarehouseFilter('TODOS')
      return
    }
    const own=warehouseCatalog.find((item)=>
      item.name.toUpperCase()===normalizeProfileWarehouse(profile).toUpperCase() ||
      item.code.toUpperCase()===normalizeProfileWarehouse(profile).toUpperCase()
    )
    setWarehouseFilter(own?`ALMACEN:${own.code}`:'TODOS')
  },[mode,role,profile?.warehouse,profile?.project,canViewRemoteNetwork,warehouseCatalog])

  const filterLabel=useMemo(
    ()=>dashboardFilterLabel(warehouseFilter,warehouseCatalog,warehouseCenters),
    [warehouseFilter,warehouseCatalog,warehouseCenters]
  )

  const filterSingleTarget=useMemo(()=>{
    if(warehouseFilter.startsWith('ALMACEN:')){
      const code=warehouseFilter.slice(8)
      return warehouseCatalog.find((item)=>item.code===code)?.name || ''
    }
    if(warehouseFilter.startsWith('CENTRO:')){
      const code=warehouseFilter.slice(7)
      return warehouseCenters.find((item)=>item.code===code)?.name || ''
    }
    return ''
  },[warehouseFilter,warehouseCatalog,warehouseCenters])

  const matchesScorecardScope=(row:ScorecardRow)=>{
    if(mode==='eri'&&warehouseFilter.startsWith('GRUPO:')){
      const requested=warehouseFilter.slice(6)
      const actual=String(row.site_group||'').trim().toUpperCase()
      if(requested==='PROYECTO_MINERO') return actual==='PROYECTO'||actual==='PROYECTO_MINERO'
      if(requested==='SUCURSAL') return actual==='SUCURSAL'
      if(requested==='TIENDA') return actual==='TIENDA'
    }
    return matchesDashboardHierarchy(
      warehouseFilter,
      row.warehouse,
      row.site_name,
      warehouseCatalog,
      warehouseCenters
    )
  }

  const scopedRows=useMemo(()=>rows.filter((row)=>
    row.year===year&&row.month===month&&matchesScorecardScope(row)
  ),[rows,year,month,warehouseFilter,warehouseCatalog,warehouseCenters,mode])

  const visibleHistorical=useMemo(()=>rows.filter((row)=>matchesScorecardScope(row)),
    [rows,warehouseFilter,warehouseCatalog,warehouseCenters,mode])

  const fieldMap=useMemo(()=>new Map((report?.fields||[]).map((field)=>[field.key,field])),[report])

  const chartCategories=(fieldKeys:string[])=>{
    const grouped=new Map<string,ScorecardRow[]>()
    scopedRows.forEach((row)=>{
      const broadFilter=warehouseFilter==='TODOS'||warehouseFilter.startsWith('GRUPO:')
      const label=broadFilter
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

  async function exportScorecardPdf(){
    if(!report||!scorecardExportRows.length||!dashboardRef.current||pdfExporting) return
    setPdfExporting(true)
    setMessage('')
    try{
      await exportElementToPdfLandscape(
        `KOMTROL_Scorecard_${report.code}_${year}_${String(month).padStart(2,'0')}`,
        `KOMTROL · ${report.name}`,
        dashboardRef.current,
        {
          subtitle:`${MONTHS[month-1]} ${year} · ${filterLabel} · ${scorecardExportRows.length} registro(s)`,
          captureWidth: 1440,
        }
      )
    }catch(error){
      setMessage(error instanceof Error?error.message:'No se pudo generar el PDF del dashboard.')
    }finally{
      setPdfExporting(false)
    }
  }

  async function saveRow(row:ScorecardRow) {
    if(!isAdmin){setMessage('Solo el Administrador puede editar datos del Scorecard.');return}
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
    if(!isAdmin){setMessage('Solo el Administrador puede crear registros del Scorecard.');return}
    if(!report) return
    const targetWarehouse=filterSingleTarget || normalizeProfileWarehouse(profile) || 'SIN_ASIGNAR'
    const siteName=profile?.project || profile?.warehouse || targetWarehouse
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

  async function deleteRow(row:ScorecardRow) {
    if(!isAdmin){setMessage('Solo el Administrador puede eliminar datos del Scorecard.');return}
    const accepted=window.confirm(`¿Eliminar definitivamente el registro de ${row.site_name}? Esta acción no se puede deshacer.`)
    if(!accepted) return
    const {error}=await supabase.from('scorecard_rows').delete().eq('id',row.id)
    if(error){setMessage(error.message);return}
    setRows((current)=>current.filter((item)=>item.id!==row.id))
    setEditingRows((current)=>{const next={...current};delete next[row.id];return next})
    setMessage('Registro eliminado correctamente.')
  }

  async function submitPeriod() {
    if(!report) return
    const target=filterSingleTarget||normalizeProfileWarehouse(profile)
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
    const target=filterSingleTarget||normalizeProfileWarehouse(profile)
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

    const preview=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,range:0,defval:null,raw:true})
    const firstRow=(preview[0]||[]).map((value)=>normalizeText(value).toUpperCase())
    const standardized=firstRow.includes('ALMACÉN')||firstRow.includes('ALMACEN')
    const headerIndex=standardized?0:def.header_row-1

    const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{range:headerIndex,defval:null,raw:true})
    const result:ImportRow[]=[]

    raw.forEach((source,index)=>{
      const standardWarehouse=pickSource(source,['ALMACÉN','ALMACEN'])
      const standardCenter=pickSource(source,['CENTRO_UNIDAD','CENTRO / UNIDAD'])
      const legacySite=pickSource(source,[
        def.site_field,
        'DETALLE',
        'Proyecto',
        'Proyectos Mineros',
        'SEDE',
        'NOMBRE',
        'PROYECTO / PLACA',
      ])
      const siteRaw=standardWarehouse ?? legacySite
      if(siteRaw===null||siteRaw===undefined||String(siteRaw).trim()==='') return

      const monthRaw=pickSource(source,['MES',def.date_field])
      const numericMonth=typeof monthRaw==='number' && monthRaw>=1 && monthRaw<=12 ? Number(monthRaw) : null
      const date=numericMonth ? null : excelDate(monthRaw)
      const rowYear=Number(pickSource(source,['AÑO','ANO',def.year_field]) || date?.getFullYear() || year)
      const rowMonth=Number(numericMonth || (date ? date.getMonth()+1 : month))
      if(!rowYear||!rowMonth||rowMonth<1||rowMonth>12) return

      const warehouse=canonicalWarehouse(siteRaw)
      const ownWarehouse=normalizeProfileWarehouse(profile)
      if(role==='COORDINADOR'&&warehouse!==ownWarehouse) return

      const data:Record<string,unknown>={}
      def.fields.forEach((field)=>{
        const value=pickSource(source,[
          templateHeader(field),
          field.source,
          field.label,
          field.key,
        ])
        data[field.key]=field.type==='text'
          ? normalizeText(value)
          : value===null||value===undefined||value==='' ? null : numeric(value)
      })

      if(def.code==='inbound-outbound' && (data.productivity===null||data.productivity===undefined||data.productivity==='')){
        const denominator=numeric(data.person_day)*numeric(data.work_days)
        data.productivity=denominator>0
          ? (numeric(data.inbound)+numeric(data.outbound))/denominator
          : 0
      }

      if(def.code==='eri' && (data.average_pct===null||data.average_pct===undefined||data.average_pct==='')){
        const values=[numeric(data.items_pct),numeric(data.value_pct)].filter((value)=>Number.isFinite(value))
        data.average_pct=values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0
      }

      const status=normalizeText(pickSource(source,['ESTADO',def.status_field])) || null
      const detail=normalizeText(pickSource(source,['DETALLE',def.code==='diferencias-inventario'?'Detalle':null])) || null
      const group=normalizeText(pickSource(source,['GRUPO',def.group_field])) || null
      const centerText=normalizeText(standardCenter)
      const siteName=centerText
        ? `${warehouse} ${centerText}`
        : normalizeText(legacySite || siteRaw)

      const sourceRow=index+headerIndex+2
      result.push({
        report_code:def.code,year:rowYear,month:rowMonth,period_date:periodKey(rowYear,rowMonth),
        warehouse,site_name:siteName,
        site_group:group,
        row_status:status,detail,
        row_key:`${def.code}:${sourceRow}:${warehouse}:${centerText||''}:${status||''}:${detail||''}`,
        data,source:'UPLOAD',source_sheet:def.data_sheet,source_row:sourceRow,
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

  function downloadLoadModel(){
    const workbook=XLSX.utils.book_new()

    const instructionRows=[
      ['KOMTROL · MODELO DE CARGA SCORECARD'],
      ['Regla general','Una fila representa un almacén / centro / período. No combinar KMMP y DCP en una misma fila cuando existan separados.'],
      ['Columnas comunes','AÑO | MES | GRUPO | ALMACÉN | CENTRO_UNIDAD | DETALLE | ESTADO'],
      ['GRUPO','PROYECTO_MINERO | SUCURSAL | TIENDA'],
      ['ALMACÉN','Equipo físico: ANTAMINA, AREQUIPA, PIURA, SAN LUIS, etc.'],
      ['CENTRO_UNIDAD','KMMP | DCP | CUMMINS | GENERAL. Si el almacén no tiene división, usar GENERAL o dejar vacío.'],
      ['MES','Usar número 1–12 o una fecha del mes.'],
      ['Campos automáticos','Pueden dejarse vacíos cuando KOMTROL los calcule o disponga de fuente automática. Para históricos pueden cargarse.'],
      [],
      ['N°','REPORTE','HOJA','MODO','CAMPOS DE NEGOCIO'],
      ...definitions
        .filter((def)=>REPORT_CODES.includes(def.code))
        .map((def)=>[
          def.ordinal,
          def.name,
          def.data_sheet,
          sourceBadge(def.source_mode),
          def.fields.map((field)=>`${templateHeader(field)}${field.auto?' [AUTO]':''}`).join(' | '),
        ]),
    ]
    const instructionSheet=XLSX.utils.aoa_to_sheet(instructionRows)
    instructionSheet['!cols']=[{wch:8},{wch:34},{wch:28},{wch:20},{wch:85}]
    XLSX.utils.book_append_sheet(workbook,instructionSheet,'INSTRUCCIONES')

    definitions
      .filter((def)=>REPORT_CODES.includes(def.code))
      .forEach((def)=>{
        const headers=[
          'AÑO',
          'MES',
          'GRUPO',
          'ALMACÉN',
          'CENTRO_UNIDAD',
          'DETALLE',
          'ESTADO',
          ...def.fields.map(templateHeader),
        ]
        const sheet=XLSX.utils.aoa_to_sheet([headers])
        sheet['!cols']=headers.map((header)=>({wch:Math.max(14,Math.min(28,header.length+4))}))
        XLSX.utils.book_append_sheet(workbook,sheet,def.data_sheet.slice(0,31))
      })

    XLSX.writeFile(workbook,'KOMTROL_Modelo_Carga_Scorecard_12_Reportes.xlsx')
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
            <div className="button-row">
              <button type="button" className="secondary-button" onClick={downloadLoadModel}>
                <Download size={17}/> Modelo de carga
              </button>
              {canLoad&&<label className="primary-button scorecard-upload-button">
                <Upload size={17}/>{uploading?'Procesando…':isAdmin?'Cargar Scorecard completo':'Cargar Scorecard de mi proyecto'}
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" disabled={uploading} onChange={(event)=>onFileChange(event,true)}/>
              </label>}
            </div>
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
          <label className="scorecard-quick-select" aria-label="Filtrar por año">
            <span>Año</span>
            <select value={year} onChange={(event)=>setYear(Number(event.target.value))}>
              {[2024,2025,2026,2027].map((value)=><option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="scorecard-quick-select" aria-label="Filtrar por mes">
            <span>Mes</span>
            <select value={month} onChange={(event)=>setMonth(Number(event.target.value))}>
              {MONTHS.map((label,index)=><option value={index+1} key={label}>{label}</option>)}
            </select>
          </label>
          {canViewRemoteNetwork&&<DashboardHierarchyFilter
            value={warehouseFilter}
            onChange={setWarehouseFilter}
            warehouses={warehouseCatalog}
            centers={warehouseCenters}
            ariaLabel="Filtrar Scorecard por grupo, almacén o centro"
          />}
          <button className="secondary-button" disabled={!scorecardExportRows.length||pdfExporting} onClick={exportScorecardPdf}><FileText size={16}/> {pdfExporting?'Generando…':'PDF'}</button>
          <button className="secondary-button" disabled={!scorecardExportRows.length} onClick={exportScorecardExcel}><FileSpreadsheet size={16}/> Excel</button>
          {canSeeSourceData&&<button
            type="button"
            data-admin-only="true"
            className={sourceDataOpen?'secondary-button scorecard-data-toggle open':'secondary-button scorecard-data-toggle'}
            onClick={()=>setSourceDataOpen((value)=>!value)}
            aria-expanded={sourceDataOpen}
            title={sourceDataOpen?'Ocultar datos del reporte':'Ver datos del reporte'}
          ><Database size={16}/> Datos / Cargar <ChevronDown size={14}/></button>}
          <button className="icon-button" onClick={reload}><RefreshCw size={17}/></button>
        </div>
      </section>

      {message&&<div className="inline-message">{message}</div>}

      <div
        ref={dashboardRef}
        className={`scorecard-dashboard-export scorecard-monitor-fit report-${report.code}`}
        data-report-code={report.code}
      >
        {report.code==='inbound-outbound' ? (
          <InboundOutboundDashboard
            rows={scopedRows}
            historical={visibleHistorical}
            year={year}
            month={month}
            contextLabel={filterLabel}
          />
        ) : report.code==='eri' ? (
          <ERIDashboard
            rows={scopedRows}
            historical={visibleHistorical}
            year={year}
            month={month}
            contextLabel={filterLabel}
            centerGroup={warehouseFilter}
            onYearChange={setYear}
            onMonthChange={setMonth}
            onCenterGroupChange={setWarehouseFilter}
          />
        ) : (
          <ProfessionalScorecardDashboard
            reportCode={report.code as ProfessionalScorecardCode}
            rows={rows}
            year={year}
            month={month}
            onYearChange={setYear}
            onMonthChange={setMonth}
          />
        )}

        {isViewer && !scopedRows.length && (
          <section className="panel scorecard-viewer-empty">
            <BarChart3 size={26}/>
            <div><b>Sin información publicada para este período</b><span>Cuando el Coordinador actualice el Scorecard, los gráficos aparecerán aquí automáticamente.</span></div>
          </section>
        )}
      </div>

      {canSeeSourceData && sourceDataOpen && (
        <div className="scorecard-data-overlay" role="presentation" onMouseDown={(event)=>{
          if(event.target===event.currentTarget) setSourceDataOpen(false)
        }}>
          <section className="panel scorecard-data-panel" role="dialog" aria-modal="true" aria-label="Datos del reporte">
          <div className="scorecard-data-head">
            <div><b>Datos del reporte</b><span>{year} · {MONTHS[month-1]} · {filterLabel} · Acceso Administrador</span></div>
            <div className="button-row">
              <button className="icon-button scorecard-data-close" onClick={()=>setSourceDataOpen(false)} title="Cerrar datos"><X size={16}/></button>
              {['AUTO','HYBRID'].includes(report.source_mode)&&canManageReportData&&<button className="secondary-button" onClick={refreshAutomaticData}><RefreshCw size={16}/> Actualizar automáticos</button>}
              {canManageReportData&&<label className="secondary-button scorecard-upload-button"><FileSpreadsheet size={16}/>{uploading?'Procesando…':'Cargar Excel'}<input type="file" accept=".xlsx,.xls" disabled={uploading} onChange={(event)=>onFileChange(event,false)}/></label>}
              {canManageReportData&&<button className="secondary-button" onClick={()=>setEditing((value)=>!value)}>{editing?<X size={16}/>:<Edit3 size={16}/>} {editing?'Cerrar edición':'Editar datos'}</button>}
              {canManageReportData&&<button className="secondary-button" onClick={addManualRow}><Database size={16}/> Nuevo registro</button>}

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
                    {editing&&<td>
                      <div className="scorecard-row-actions">
                        <button className="icon-button" disabled={!editingRows[row.id]} onClick={()=>saveRow(edited)} title="Guardar cambios"><Save size={15}/></button>
                        {isAdmin&&<button className="icon-button danger" onClick={()=>deleteRow(row)} title="Eliminar registro"><Trash2 size={15}/></button>}
                      </div>
                    </td>}
                  </tr>
                })}
              </tbody>
            </table>
            {!scopedRows.length&&<div className="scorecard-empty"><BarChart3 size={28}/><b>Sin información para este periodo</b><span>Carga el Excel, registra valores manuales o actualiza datos automáticos.</span></div>}
          </div>
          </section>
        </div>
      )}
    </div>
  )
}
