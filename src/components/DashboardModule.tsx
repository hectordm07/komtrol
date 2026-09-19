import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  RefreshCw,
  Truck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ProfessionalBarChart, ProfessionalDonutChart, ProfessionalTrendChart } from './DashboardVisuals'

type DashboardMode =
  | 'dashboard-operacion'
  | 'inbound-outbound'
  | 'eri'
  | 'sobrantes-faltantes'
  | 'diferencias-inventario'
  | 'dashboard-transitos'
  | 'uca'
  | 'ahorros'
  | 'perfect-ship'
  | 'consignaciones'
  | 'vhs'
  | 'safe'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'

type Props = {
  mode: DashboardMode
  role: Role
  warehouse?: string | null
}

type Task = {
  id: string
  work_type: string
  status: string
  progress: number
  due_at: string | null
  warehouse: string | null
  created_at: string
}

type Guide = {
  id: string
  line_count: number
  guide_type: string
  warehouse: string | null
  created_at: string
}

type Outbound = {
  id: string
  quantity: number | null
  warehouse: string | null
  movement_date: string
}

type Inventory = {
  id: string
  status: string
  warehouse: string | null
  year: number
  month: number
}

type Transit = {
  id: string
  status: string
  value_amount: number | null
  transit_date: string
  warehouse: string | null
}

type Damaged = {
  id: string
  quantity: number | null
  status: string
  warehouse: string | null
  event_date: string
}

type Consignment = {
  id: string
  quantity: number | null
  status: string
  warehouse: string | null
  entry_date: string
}

type Incident = {
  id: string
  warehouse: string | null
  incident_type: string
  status: string
  created_at: string
}

type KpiRecord = {
  id: string
  indicator: string
  year: number
  month: number
  warehouse: string
  value: number
  amount: number | null
  unit: string
  source: string
}

type KpiTarget = {
  id: string
  indicator: string
  year: number
  month: number
  warehouse: string
  target: number
  unit: string
}

type DataSet = {
  tasks: Task[]
  guides: Guide[]
  outbound: Outbound[]
  inventories: Inventory[]
  transits: Transit[]
  damaged: Damaged[]
  consignments: Consignment[]
  incidents: Incident[]
  kpis: KpiRecord[]
  targets: KpiTarget[]
  warehouses: string[]
}

const EMPTY: DataSet = {
  tasks: [],
  guides: [],
  outbound: [],
  inventories: [],
  transits: [],
  damaged: [],
  consignments: [],
  incidents: [],
  kpis: [],
  targets: [],
  warehouses: [],
}

const MODE_TITLE: Record<DashboardMode, string> = {
  'dashboard-operacion': 'Operación',
  'inbound-outbound': 'Inbound / Outbound',
  eri: 'ERI',
  'sobrantes-faltantes': 'Sobrantes / Faltantes',
  'diferencias-inventario': 'Diferencias inventario',
  'dashboard-transitos': 'Tránsitos',
  uca: 'UCA',
  ahorros: 'Ahorros',
  'perfect-ship': 'Perfect Ship',
  consignaciones: 'Consignaciones',
  vhs: 'VHS',
  safe: 'SAFE',
}

function dateInPeriod(value: string | null | undefined, year: number, month: number) {
  if (!value) return false
  const d = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return d.getFullYear() === year && d.getMonth() + 1 === month
}

function isOverdue(task: Task) {
  return Boolean(task.due_at && new Date(task.due_at) < new Date() && task.status !== 'CERRADO')
}

function numeric(value: unknown) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

function fmtNumber(value: number, decimals = 0) {
  return value.toLocaleString('es-PE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtMoney(value: number) {
  return value.toLocaleString('es-PE', { style: 'currency', currency: 'PEN' })
}

function selectedWarehouse(value: string | null, filter: string) {
  return filter === 'TODOS' || value === filter
}

function IndicatorCard({ label, value, note, icon }: { label: string; value: string | number; note?: string; icon?: React.ReactNode }) {
  return (
    <div className="dashboard-stat">
      <div className="dashboard-stat-icon">{icon || <BarChart3 size={19} />}</div>
      <div><span>{label}</span><b>{value}</b>{note && <small>{note}</small>}</div>
    </div>
  )
}

function EmptyPeriod({ label = 'Sin datos para este periodo' }: { label?: string }) {
  return (
    <div className="dashboard-empty">
      <BarChart3 size={34} />
      <b>{label}</b>
      <p>Registra información en KOMTROL o realiza una carga masiva para alimentar este indicador.</p>
    </div>
  )
}

export function DashboardModule({ mode, role, warehouse }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [warehouseFilter, setWarehouseFilter] = useState(
    role === 'SUPERVISOR' || role === 'ADMINISTRADOR' ? 'TODOS' : (warehouse || 'TODOS')
  )
  const [data, setData] = useState<DataSet>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function reload() {
    setLoading(true)
    setMessage('')
    const [
      tasksRes,
      guidesRes,
      outboundRes,
      inventoryRes,
      transitsRes,
      damagedRes,
      consignRes,
      incidentsRes,
      kpiRes,
      targetRes,
      warehouseRes,
    ] = await Promise.all([
      supabase.from('tasks').select('id,work_type,status,progress,due_at,warehouse,created_at').limit(5000),
      supabase.from('guides').select('id,line_count,guide_type,warehouse,created_at').limit(5000),
      supabase.from('outbound_movements').select('id,quantity,warehouse,movement_date').limit(5000),
      supabase.from('inventories').select('id,status,warehouse,year,month').limit(5000),
      supabase.from('transits').select('id,status,value_amount,transit_date,warehouse').limit(5000),
      supabase.from('damaged_materials').select('id,quantity,status,warehouse,event_date').limit(5000),
      supabase.from('consignment_entries').select('id,quantity,status,warehouse,entry_date').limit(5000),
      supabase.from('incidents').select('id,warehouse,incident_type,status,created_at').limit(5000),
      supabase.from('kpi_records').select('id,indicator,year,month,warehouse,value,amount,unit,source').eq('year', year).eq('month', month).limit(1000),
      supabase.from('kpi_targets').select('id,indicator,year,month,warehouse,target,unit').eq('year', year).eq('month', month).limit(1000),
      supabase.from('warehouses').select('name').eq('active', true).order('name'),
    ])

    const errors = [
      tasksRes.error, guidesRes.error, outboundRes.error, inventoryRes.error,
      transitsRes.error, damagedRes.error, consignRes.error, incidentsRes.error,
      kpiRes.error, targetRes.error, warehouseRes.error,
    ].filter(Boolean)

    if (errors.length) setMessage(errors[0]?.message ?? 'No se pudo cargar toda la información.')

    setData({
      tasks: (tasksRes.data ?? []) as Task[],
      guides: (guidesRes.data ?? []) as Guide[],
      outbound: (outboundRes.data ?? []) as Outbound[],
      inventories: (inventoryRes.data ?? []) as Inventory[],
      transits: (transitsRes.data ?? []) as Transit[],
      damaged: (damagedRes.data ?? []) as Damaged[],
      consignments: (consignRes.data ?? []) as Consignment[],
      incidents: (incidentsRes.data ?? []) as Incident[],
      kpis: (kpiRes.data ?? []) as KpiRecord[],
      targets: (targetRes.data ?? []) as KpiTarget[],
      warehouses: (warehouseRes.data ?? []).map((row) => String(row.name)),
    })
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [year, month])

  useEffect(() => {
    if (!(role === 'SUPERVISOR' || role === 'ADMINISTRADOR')) {
      setWarehouseFilter(warehouse || 'TODOS')
    }
  }, [role, warehouse])

  const scoped = useMemo(() => {
    const taskRows = data.tasks.filter((row) => dateInPeriod(row.created_at, year, month) && selectedWarehouse(row.warehouse, warehouseFilter))
    const guideRows = data.guides.filter((row) => dateInPeriod(row.created_at, year, month) && selectedWarehouse(row.warehouse, warehouseFilter))
    const outboundRows = data.outbound.filter((row) => dateInPeriod(row.movement_date, year, month) && selectedWarehouse(row.warehouse, warehouseFilter))
    const inventoryRows = data.inventories.filter((row) => row.year === year && row.month === month && selectedWarehouse(row.warehouse, warehouseFilter))
    const transitRows = data.transits.filter((row) => dateInPeriod(row.transit_date, year, month) && selectedWarehouse(row.warehouse, warehouseFilter))
    const damagedRows = data.damaged.filter((row) => dateInPeriod(row.event_date, year, month) && selectedWarehouse(row.warehouse, warehouseFilter))
    const consignRows = data.consignments.filter((row) => dateInPeriod(row.entry_date, year, month) && selectedWarehouse(row.warehouse, warehouseFilter))
    const kpiRows = data.kpis.filter((row) => warehouseFilter === 'TODOS' || row.warehouse === 'GLOBAL' || row.warehouse === warehouseFilter)
    const targetRows = data.targets.filter((row) => warehouseFilter === 'TODOS' || row.warehouse === 'GLOBAL' || row.warehouse === warehouseFilter)

    return {
      tasks: taskRows,
      guides: guideRows,
      outbound: outboundRows,
      inventories: inventoryRows,
      transits: transitRows,
      damaged: damagedRows,
      consignments: consignRows,
      incidents: data.incidents.filter((row) => dateInPeriod(row.created_at, year, month) && selectedWarehouse(row.warehouse, warehouseFilter)),
      kpis: kpiRows,
      targets: targetRows,
    }
  }, [data, year, month, warehouseFilter])

  const warehouseOverview = useMemo(() => {
    const names = Array.from(new Set([
      ...data.warehouses,
      ...data.tasks.map((row)=>row.warehouse).filter(Boolean) as string[],
      ...data.guides.map((row)=>row.warehouse).filter(Boolean) as string[],
      ...data.outbound.map((row)=>row.warehouse).filter(Boolean) as string[],
      ...data.inventories.map((row)=>row.warehouse).filter(Boolean) as string[],
      ...data.transits.map((row)=>row.warehouse).filter(Boolean) as string[],
      ...data.damaged.map((row)=>row.warehouse).filter(Boolean) as string[],
      ...data.consignments.map((row)=>row.warehouse).filter(Boolean) as string[],
      ...data.incidents.map((row)=>row.warehouse).filter(Boolean) as string[],
      ...data.kpis.map((row)=>row.warehouse).filter((value)=>Boolean(value) && value !== 'GLOBAL') as string[],
    ])).sort()

    return names.map((name)=>{
      const tasks = data.tasks.filter((row)=>row.warehouse===name && dateInPeriod(row.created_at,year,month)).length
      const guides = data.guides.filter((row)=>row.warehouse===name && dateInPeriod(row.created_at,year,month)).length
      const outbound = data.outbound.filter((row)=>row.warehouse===name && dateInPeriod(row.movement_date,year,month)).length
      const inventories = data.inventories.filter((row)=>row.warehouse===name && row.year===year && row.month===month).length
      const transits = data.transits.filter((row)=>row.warehouse===name && dateInPeriod(row.transit_date,year,month)).length
      const damaged = data.damaged.filter((row)=>row.warehouse===name && dateInPeriod(row.event_date,year,month)).length
      const consignments = data.consignments.filter((row)=>row.warehouse===name && dateInPeriod(row.entry_date,year,month)).length
      const incidents = data.incidents.filter((row)=>row.warehouse===name && dateInPeriod(row.created_at,year,month)).length
      const kpis = data.kpis.filter((row)=>row.warehouse===name).length
      return {
        key:name,
        label:name,
        value:tasks+guides+outbound+inventories+transits+damaged+consignments+incidents+kpis,
        detail:`Tareas: ${tasks} · Guías: ${guides} · Outbound: ${outbound} · Inventarios: ${inventories} · Tránsitos: ${transits} · Dañados: ${damaged} · Consignaciones: ${consignments} · Incidencias: ${incidents} · KPI: ${kpis}`,
      }
    }).sort((a,b)=>b.value-a.value)
  },[data,year,month])

  const mixSegments = useMemo(() => [
    { label:'Tareas', value:scoped.tasks.length },
    { label:'Guías', value:scoped.guides.length },
    { label:'Outbound', value:scoped.outbound.length },
    { label:'Incidencias', value:scoped.incidents.length },
    { label:'KPI', value:scoped.kpis.length },
  ],[scoped])

  const monthTrend = useMemo(() => {
    const buckets = Array.from({length:5},(_,index)=>({label:`S${index+1}`,value:0}))
    const add=(dateValue:string|null|undefined)=>{
      if(!dateValue) return
      const d=new Date(dateValue.length===10 ? dateValue+'T12:00:00' : dateValue)
      if(d.getFullYear()!==year || d.getMonth()+1!==month) return
      const week=Math.min(4,Math.floor((d.getDate()-1)/7))
      buckets[week].value+=1
    }
    scoped.tasks.forEach((row)=>add(row.created_at))
    scoped.guides.forEach((row)=>add(row.created_at))
    scoped.outbound.forEach((row)=>add(row.movement_date))
    scoped.incidents.forEach((row)=>add(row.created_at))
    scoped.transits.forEach((row)=>add(row.transit_date))
    return buckets
  },[scoped,year,month])

  const kpiBy = (searchTerms: string[]) => {
    const upper = searchTerms.map((term) => term.toUpperCase())
    return scoped.kpis.filter((item) => upper.some((term) => item.indicator.toUpperCase().includes(term)))
  }

  const targetFor = (indicator: string, recordWarehouse?: string) =>
    scoped.targets.find((target) =>
      target.indicator.toUpperCase() === indicator.toUpperCase()
      && (!recordWarehouse || target.warehouse === recordWarehouse || target.warehouse === 'GLOBAL')
    )

  const selector = (
    <div className="dashboard-filters">
      <label>Año
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[year - 2, year - 1, year, year + 1].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>Mes
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select>
      </label>
      <label>Almacén
        <select
          value={warehouseFilter}
          disabled={!(role === 'SUPERVISOR' || role === 'ADMINISTRADOR')}
          onChange={(e) => setWarehouseFilter(e.target.value)}
        >
          {(role === 'SUPERVISOR' || role === 'ADMINISTRADOR') && <option value="TODOS">Todos</option>}
          {warehouse && !data.warehouses.includes(warehouse) && <option value={warehouse}>{warehouse}</option>}
          {data.warehouses.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={18} /></button>
    </div>
  )

  if (loading) {
    return <section className="panel"><div className="screen-center compact"><RefreshCw size={24} className="spin" /><p>Cargando dashboard…</p></div></section>
  }

  return (
    <div className="dashboard-module professional-dashboard-module">
      <section className="panel dashboard-control-strip">
        <div>
          <span className="dashboard-control-kicker">DASHBOARD NACIONAL</span>
          <h2>{MODE_TITLE[mode]}</h2>
          <p>Todos los almacenes · Datos reales KOMTROL · {String(month).padStart(2, '0')}/{year}</p>
        </div>
        {selector}
      </section>

      {message && <div className="inline-message">{message}</div>}

      <div className="professional-dashboard-grid">
        <ProfessionalBarChart
          title="Actividad nacional por almacén"
          subtitle="Todos los almacenes · haz clic en una barra para filtrar y vuelve a pulsarla para regresar al consolidado"
          data={warehouseOverview}
          selected={warehouseFilter === 'TODOS' ? undefined : warehouseFilter}
          onSelect={(role==='SUPERVISOR'||role==='ADMINISTRADOR')
            ? (key)=>setWarehouseFilter((current)=>current===key ? 'TODOS' : key)
            : undefined}
        />
        <ProfessionalDonutChart
          title="Distribución del dashboard"
          subtitle={warehouseFilter === 'TODOS' ? 'Consolidado nacional' : `Almacén: ${warehouseFilter}`}
          segments={mixSegments}
        />
        <ProfessionalTrendChart
          title="Tendencia mensual"
          subtitle={warehouseFilter === 'TODOS' ? 'Actividad nacional agrupada por semana' : `Actividad de ${warehouseFilter} agrupada por semana`}
          points={monthTrend}
        />
      </div>

      <section className="panel dashboard-detail-panel">
        <DashboardContent mode={mode} scoped={scoped} kpiBy={kpiBy} targetFor={targetFor} />
      </section>
    </div>
  )
}

function DashboardContent({
  mode,
  scoped,
  kpiBy,
  targetFor,
}: {
  mode: DashboardMode
  scoped: {
    tasks: Task[]
    guides: Guide[]
    outbound: Outbound[]
    inventories: Inventory[]
    transits: Transit[]
    damaged: Damaged[]
    consignments: Consignment[]
    incidents: Incident[]
    kpis: KpiRecord[]
    targets: KpiTarget[]
  }
  kpiBy: (terms: string[]) => KpiRecord[]
  targetFor: (indicator: string, warehouse?: string) => KpiTarget | undefined
}) {
  if (mode === 'dashboard-operacion') {
    const pending = scoped.tasks.filter((t) => t.status !== 'CERRADO').length
    const closed = scoped.tasks.filter((t) => t.status === 'CERRADO').length
    const overdue = scoped.tasks.filter(isOverdue).length
    const progress = scoped.tasks.length
      ? Math.round(scoped.tasks.reduce((sum, t) => sum + numeric(t.progress), 0) / scoped.tasks.length)
      : 0
    const inboundLines = scoped.guides.reduce((sum, guide) => sum + numeric(guide.line_count), 0)
    const outboundQty = scoped.outbound.reduce((sum, row) => sum + numeric(row.quantity), 0)
    const relevo = scoped.tasks.filter((t) => t.work_type === 'RELEVO').length

    return (
      <>
        <div className="dashboard-stats-grid">
          <IndicatorCard label="Pendientes" value={pending} icon={<ClipboardList size={19} />} />
          <IndicatorCard label="Cerrados" value={closed} icon={<CheckCircle2 size={19} />} />
          <IndicatorCard label="Vencidos" value={overdue} icon={<AlertTriangle size={19} />} />
          <IndicatorCard label="Avance" value={`${progress}%`} icon={<BarChart3 size={19} />} />
          <IndicatorCard label="Líneas Inbound" value={fmtNumber(inboundLines)} icon={<PackageCheck size={19} />} />
          <IndicatorCard label="Cantidad Outbound" value={fmtNumber(outboundQty, 1)} icon={<Truck size={19} />} />
          <IndicatorCard label="Guías" value={scoped.guides.length} />
          <IndicatorCard label="Inventarios" value={scoped.inventories.length} />
          <IndicatorCard label="Relevos" value={relevo} />
          <IndicatorCard label="Dañados" value={scoped.damaged.length} />
        </div>
      </>
    )
  }

  if (mode === 'inbound-outbound') {
    const inbound = scoped.guides.reduce((sum, row) => sum + numeric(row.line_count), 0)
    const outboundQty = scoped.outbound.reduce((sum, row) => sum + numeric(row.quantity), 0)
    const outboundMov = scoped.outbound.length
    if (!scoped.guides.length && !scoped.outbound.length) return <EmptyPeriod />
    return (
      <>
        <div className="dashboard-stats-grid">
          <IndicatorCard label="Líneas Inbound" value={fmtNumber(inbound)} />
          <IndicatorCard label="Movimientos Outbound" value={outboundMov} />
          <IndicatorCard label="Cantidad Outbound" value={fmtNumber(outboundQty, 1)} />
          <IndicatorCard label="Guías registradas" value={scoped.guides.length} />
        </div>
        <div className="comparison-bars">
          <MetricBar label="Inbound" value={inbound} max={Math.max(inbound, outboundMov, 1)} />
          <MetricBar label="Outbound" value={outboundMov} max={Math.max(inbound, outboundMov, 1)} />
        </div>
      </>
    )
  }

  if (mode === 'sobrantes-faltantes') {
    const faltantes = scoped.incidents.filter((row) => row.incident_type === 'FALTANTE')
    const records = kpiBy(['SOBRANTE', 'FALTANTE'])
    if (!faltantes.length && !records.length) return <EmptyPeriod />
    return (
      <>
        <div className="dashboard-stats-grid">
          <IndicatorCard label="Faltantes registrados" value={faltantes.length} />
          <IndicatorCard label="Pendientes" value={faltantes.filter((r) => r.status !== 'CERRADO').length} />
          {records.map((record) => <IndicatorCard key={record.id} label={record.indicator} value={fmtNumber(numeric(record.value), 2)} note={record.amount != null ? fmtMoney(numeric(record.amount)) : record.source} />)}
        </div>
      </>
    )
  }

  if (mode === 'diferencias-inventario') {
    const differences = scoped.incidents.filter((row) => row.incident_type === 'DIFERENCIA')
    if (!differences.length) return <EmptyPeriod />
    return (
      <div className="dashboard-stats-grid">
        <IndicatorCard label="Diferencias" value={differences.length} />
        <IndicatorCard label="Abiertas" value={differences.filter((r) => !['CERRADO','NOTIFICADO'].includes(r.status)).length} />
        <IndicatorCard label="Notificadas / cerradas" value={differences.filter((r) => ['CERRADO','NOTIFICADO'].includes(r.status)).length} />
      </div>
    )
  }

  if (mode === 'dashboard-transitos') {
    if (!scoped.transits.length) return <EmptyPeriod />
    const active = scoped.transits.filter((row) => row.status === 'EN_TRANSITO')
    const buckets = { a: 0, b: 0, c: 0 }
    active.forEach((row) => {
      const days = Math.max(0, Math.floor((Date.now() - new Date(row.transit_date + 'T12:00:00').getTime()) / 86400000))
      if (days <= 30) buckets.a++
      else if (days <= 60) buckets.b++
      else buckets.c++
    })
    const value = active.reduce((sum, row) => sum + numeric(row.value_amount), 0)
    return (
      <div className="dashboard-stats-grid">
        <IndicatorCard label="Total tránsito" value={active.length} />
        <IndicatorCard label="Valor tránsito" value={fmtMoney(value)} />
        <IndicatorCard label="0–30 días" value={buckets.a} />
        <IndicatorCard label="31–60 días" value={buckets.b} />
        <IndicatorCard label="+60 días" value={buckets.c} />
      </div>
    )
  }

  if (mode === 'consignaciones') {
    const totalQty = scoped.consignments.reduce((sum, row) => sum + numeric(row.quantity), 0)
    const records = kpiBy(['CONSIGN'])
    if (!scoped.consignments.length && !records.length) return <EmptyPeriod />
    return (
      <div className="dashboard-stats-grid">
        <IndicatorCard label="Ingresos consignación" value={scoped.consignments.length} />
        <IndicatorCard label="Cantidad recibida" value={fmtNumber(totalQty, 1)} />
        <IndicatorCard label="Observados" value={scoped.consignments.filter((r) => r.status === 'OBSERVADO').length} />
        {records.map((record) => <IndicatorCard key={record.id} label={record.indicator} value={fmtNumber(numeric(record.value), 2)} note={record.amount != null ? fmtMoney(numeric(record.amount)) : record.source} />)}
      </div>
    )
  }

  const terms =
    mode === 'eri' ? ['ERI'] :
    mode === 'uca' ? ['UCA'] :
    mode === 'ahorros' ? ['AHORRO'] :
    mode === 'perfect-ship' ? ['PERFECT SHIP'] :
    mode === 'vhs' ? ['VHS'] :
    ['SAFE']

  const records = kpiBy(terms)
  if (!records.length) return <EmptyPeriod />

  return (
    <div className="kpi-record-grid">
      {records.map((record) => {
        const target = targetFor(record.indicator, record.warehouse)
        const diff = target ? numeric(record.value) - numeric(target.target) : null
        return (
          <article className="kpi-record-card" key={record.id}>
            <div className="kpi-record-head">
              <span>{record.indicator}</span>
              <small>{record.warehouse} · {record.source}</small>
            </div>
            <b>{fmtNumber(numeric(record.value), record.unit === '%' ? 2 : 1)} {record.unit}</b>
            <div className="kpi-record-meta">
              <span>Meta: {target ? `${fmtNumber(numeric(target.target), 2)} ${target.unit}` : 'Sin meta'}</span>
              <span>Diferencia: {diff == null ? '—' : `${diff >= 0 ? '+' : ''}${fmtNumber(diff, 2)}`}</span>
              {record.amount != null && <span>Monto: {fmtMoney(numeric(record.amount))}</span>}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(2, Math.min(100, (value / max) * 100))
  return (
    <div className="metric-bar">
      <div><span>{label}</span><b>{fmtNumber(value)}</b></div>
      <div className="metric-track"><i style={{ width: `${width}%` }} /></div>
    </div>
  )
}
