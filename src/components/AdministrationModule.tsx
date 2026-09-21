import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Download,
  FileUp,
  FolderKanban,
  History,
  Plus,
  RefreshCw,
  Settings,
  Upload,
  UsersRound,
  XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportRowsToExcel } from '../lib/exportUtils'
import * as XLSX from 'xlsx'

type Mode =
  | 'proyectos'
  | 'cargas-masivas'
  | 'almacenes'
  | 'categorias'
  | 'metas-kpi'
  | 'periodos'
  | 'auditoria'

type Props = {
  mode: Mode
  userId: string
  isAdmin: boolean
}

type Warehouse = {
  id: string
  code: string
  name: string
  active: boolean
  warehouse_scope: 'REMOTO' | 'CENTRAL'
  remote_group: 'PROYECTO_MINERO' | 'SUCURSAL' | 'TIENDA' | null
}

type WarehouseCenter = {
  id: string
  warehouse_code: string
  code: string
  name: string
  business_unit: 'KMMP' | 'DCP' | 'CUMMINS' | 'GENERAL'
  active: boolean
}

type Project = {
  id: string
  code: string
  name: string
  warehouse_code: string | null
  active: boolean
}

type OperationalGroup = {
  id: string
  project_code: string | null
  name: string
  active: boolean
}

type Category = {
  id: string
  name: string
  active: boolean
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

type Period = {
  id: string
  period: string
  warehouse: string
  status: 'ABIERTO' | 'CERRADO'
  closed_at: string | null
}

type ImportType = 'MASTER_MATERIALES' | 'REPOSICION' | 'INBOUND' | 'ORDEN_COMPRA' | 'CARGO_DIRECTO' | 'KPI'

type ImportPreview = {
  row: number
  values: Record<string, string>
  valid: boolean
  error: string
}

const IMPORT_HEADERS: Record<ImportType, string[]> = {
  MASTER_MATERIALES: ['MATERIAL','STOCK_CODE','DESCRIPCION','CENTRO','ALMACEN','UBICACION','PRECIO','OBSERVACION','ESTADO'],
  REPOSICION: ['GUIA','REFERENCIA','FECHA_EMISION','N_DOCUMENTO','PROVEEDOR','LINEA','MATERIAL','DESCRIPCION','CANTIDAD','UM','ALMACEN','OBSERVACION'],
  INBOUND: ['GUIA','REFERENCIA','FECHA_EMISION','N_DOCUMENTO','LINEAS','ALMACEN','OBSERVACION'],
  ORDEN_COMPRA: ['GUIA','REFERENCIA','FECHA_EMISION','N_DOCUMENTO','LINEAS','ALMACEN','OBSERVACION'],
  CARGO_DIRECTO: ['GUIA','REFERENCIA','FECHA_EMISION','N_DOCUMENTO','LINEAS','ALMACEN','OBSERVACION'],
  KPI: ['INDICADOR','ANO','MES','ALMACEN','VALOR','MONTO','UNIDAD'],
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
}

function parseLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function parseDelimited(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.trim())
  if (lines.length < 2) return { headers: [] as string[], rows: [] as Record<string, string>[], delimiter: '\t' }
  const first = lines[0]
  const delimiter = [
    { value: '\t', count: (first.match(/\t/g) ?? []).length },
    { value: ';', count: (first.match(/;/g) ?? []).length },
    { value: ',', count: (first.match(/,/g) ?? []).length },
  ].sort((a, b) => b.count - a.count)[0].value

  const headers = parseLine(first, delimiter).map(normalizeHeader)
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line, delimiter)
    const row: Record<string, string> = {}
    headers.forEach((header, index) => { row[header] = cells[index] ?? '' })
    return row
  })
  return { headers, rows, delimiter }
}

function toIsoDate(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (!match) return ''
  const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  const date = new Date(iso + 'T12:00:00')
  return Number.isNaN(date.getTime()) ? '' : iso
}

function guideType(reference: string) {
  const ref = reference.replace(/\s/g, '')
  if (ref.startsWith('89')) return 'REPOSICION'
  if (ref.startsWith('80')) return 'ORDEN_COMPRA'
  return 'CARGO_DIRECTO'
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => {
    const value = String(cell ?? '')
    return /[",;\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value
  }).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function writeAudit(userId: string, action: string, entityType: string, details: Record<string, unknown>) {
  await supabase.from('audit_log').insert({
    action,
    entity_type: entityType,
    actor_user_id: userId,
    details,
  })
}

export function AdministrationModule({ mode, userId, isAdmin }: Props) {
  if (mode === 'proyectos' || mode === 'almacenes') {
    return <CatalogsAdmin userId={userId} isAdmin={isAdmin} />
  }
  if (mode === 'cargas-masivas') {
    return <BulkImports userId={userId} />
  }
  if (mode === 'categorias') {
    return <CategoriesAdmin userId={userId} />
  }
  if (mode === 'metas-kpi') {
    return <KpiAdmin userId={userId} />
  }
  if (mode === 'periodos') {
    return <PeriodsAdmin userId={userId} />
  }
  return <AuditAdmin />
}

function CatalogsAdmin({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [centers, setCenters] = useState<WarehouseCenter[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [groups, setGroups] = useState<OperationalGroup[]>([])
  const [message, setMessage] = useState('')
  const [warehouseForm, setWarehouseForm] = useState({
    code: '',
    name: '',
    warehouse_scope: 'REMOTO' as 'REMOTO' | 'CENTRAL',
    remote_group: 'PROYECTO_MINERO' as 'PROYECTO_MINERO' | 'SUCURSAL' | 'TIENDA',
  })
  const [centerForm, setCenterForm] = useState({
    warehouse_code: '',
    code: '',
    name: '',
    business_unit: 'KMMP' as WarehouseCenter['business_unit'],
  })
  const [projectForm, setProjectForm] = useState({ code: '', name: '', warehouse_code: '' })
  const [groupForm, setGroupForm] = useState({ project_code: '', name: '' })

  async function reload() {
    const [w, c, p, g] = await Promise.all([
      supabase.from('warehouses').select('*').order('name'),
      supabase.from('warehouse_centers').select('*').order('warehouse_code').order('name'),
      supabase.from('projects').select('*').order('name'),
      supabase.from('operational_groups').select('*').order('name'),
    ])
    setWarehouses((w.data ?? []) as Warehouse[])
    setCenters((c.data ?? []) as WarehouseCenter[])
    setProjects((p.data ?? []) as Project[])
    setGroups((g.data ?? []) as OperationalGroup[])
    const error = w.error || c.error || p.error || g.error
    if (error) setMessage(error.message)
  }

  useEffect(() => { reload() }, [])

  async function addWarehouse(event: FormEvent) {
    event.preventDefault()
    if (!isAdmin) return
    const payload = {
      code: warehouseForm.code.trim().toUpperCase(),
      name: warehouseForm.name.trim(),
      warehouse_scope: warehouseForm.warehouse_scope,
      remote_group: warehouseForm.warehouse_scope === 'REMOTO' ? warehouseForm.remote_group : null,
      created_by: userId,
    }
    const { error } = await supabase.from('warehouses').insert(payload)
    if (error) { setMessage(error.message); return }
    await writeAudit(userId, 'CREATE_WAREHOUSE', 'WAREHOUSE', payload)
    setWarehouseForm({
      code: '',
      name: '',
      warehouse_scope: 'REMOTO',
      remote_group: 'PROYECTO_MINERO',
    })
    setMessage('Almacén creado.')
    reload()
  }

  async function addCenter(event: FormEvent) {
    event.preventDefault()
    if (!isAdmin || !centerForm.warehouse_code) return
    const payload = {
      warehouse_code: centerForm.warehouse_code,
      code: centerForm.code.trim().toUpperCase(),
      name: centerForm.name.trim().toUpperCase(),
      business_unit: centerForm.business_unit,
      created_by: userId,
    }
    const { error } = await supabase.from('warehouse_centers').insert(payload)
    if (error) { setMessage(error.message); return }
    await writeAudit(userId, 'CREATE_WAREHOUSE_CENTER', 'WAREHOUSE_CENTER', payload)
    setCenterForm({ warehouse_code: '', code: '', name: '', business_unit: 'KMMP' })
    setMessage('Centro / unidad creado.')
    reload()
  }

  async function addProject(event: FormEvent) {
    event.preventDefault()
    if (!isAdmin) return
    const payload = {
      code: projectForm.code.trim().toUpperCase(),
      name: projectForm.name.trim(),
      warehouse_code: projectForm.warehouse_code || null,
      created_by: userId,
    }
    const { error } = await supabase.from('projects').insert(payload)
    if (error) { setMessage(error.message); return }
    await writeAudit(userId, 'CREATE_PROJECT', 'PROJECT', payload)
    setProjectForm({ code: '', name: '', warehouse_code: '' })
    setMessage('Proyecto creado.')
    reload()
  }

  async function addGroup(event: FormEvent) {
    event.preventDefault()
    if (!isAdmin) return
    const payload = {
      project_code: groupForm.project_code || null,
      name: groupForm.name.trim().toUpperCase(),
      created_by: userId,
    }
    const { error } = await supabase.from('operational_groups').insert(payload)
    if (error) { setMessage(error.message); return }
    await writeAudit(userId, 'CREATE_GROUP', 'GROUP', payload)
    setGroupForm({ project_code: '', name: '' })
    setMessage('Grupo creado.')
    reload()
  }

  return (
    <div className="admin-catalogs">
      <section className="panel">
        <div className="panel-title">
          <div><h3>Almacenes, Proyectos y Grupos</h3><p>Arquitectura multi-almacén preparada para la operación nacional.</p></div>
          <button className="icon-button" onClick={reload}><RefreshCw size={18} /></button>
        </div>
        {message && <div className="inline-message">{message}</div>}
        {isAdmin && (
          <div className="catalog-form-grid">
            <form className="catalog-form" onSubmit={addWarehouse}>
              <b><Boxes size={16} /> Nuevo almacén</b>
              <input required placeholder="Código" value={warehouseForm.code} onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })} />
              <input required placeholder="Nombre" value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} />
              <select
                value={warehouseForm.warehouse_scope}
                onChange={(e) => setWarehouseForm({
                  ...warehouseForm,
                  warehouse_scope: e.target.value as 'REMOTO' | 'CENTRAL',
                })}
              >
                <option value="REMOTO">Almacén Remoto</option>
                <option value="CENTRAL">Almacén Central</option>
              </select>
              {warehouseForm.warehouse_scope === 'REMOTO' && (
                <select
                  value={warehouseForm.remote_group}
                  onChange={(e) => setWarehouseForm({
                    ...warehouseForm,
                    remote_group: e.target.value as 'PROYECTO_MINERO' | 'SUCURSAL' | 'TIENDA',
                  })}
                >
                  <option value="PROYECTO_MINERO">Proyecto Minero</option>
                  <option value="SUCURSAL">Sucursal</option>
                  <option value="TIENDA">Tienda</option>
                </select>
              )}
              <button className="primary-button"><Plus size={15} /> Crear</button>
            </form>
            <form className="catalog-form" onSubmit={addCenter}>
              <b><Boxes size={16} /> Nuevo centro / unidad</b>
              <select required value={centerForm.warehouse_code} onChange={(e)=>setCenterForm({...centerForm,warehouse_code:e.target.value})}>
                <option value="">Seleccionar almacén / equipo</option>
                {warehouses.filter((item)=>item.active).map((item)=><option key={item.id} value={item.code}>{item.name}</option>)}
              </select>
              <input required placeholder="Código centro · Ej. ANTAMINA_KMMP" value={centerForm.code} onChange={(e)=>setCenterForm({...centerForm,code:e.target.value})}/>
              <input required placeholder="Nombre · Ej. ANTAMINA KMMP" value={centerForm.name} onChange={(e)=>setCenterForm({...centerForm,name:e.target.value})}/>
              <select value={centerForm.business_unit} onChange={(e)=>setCenterForm({...centerForm,business_unit:e.target.value as WarehouseCenter['business_unit']})}>
                <option value="KMMP">KMMP</option>
                <option value="DCP">DCP</option>
                <option value="CUMMINS">CUMMINS</option>
                <option value="GENERAL">GENERAL</option>
              </select>
              <button className="primary-button"><Plus size={15}/> Crear</button>
            </form>

            <form className="catalog-form" onSubmit={addProject}>
              <b><FolderKanban size={16} /> Nuevo proyecto</b>
              <input required placeholder="Código" value={projectForm.code} onChange={(e) => setProjectForm({ ...projectForm, code: e.target.value })} />
              <input required placeholder="Nombre" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
              <select value={projectForm.warehouse_code} onChange={(e) => setProjectForm({ ...projectForm, warehouse_code: e.target.value })}>
                <option value="">Sin almacén</option>
                {warehouses.filter((item)=>item.active).map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}
              </select>
              <button className="primary-button"><Plus size={15} /> Crear</button>
            </form>
            <form className="catalog-form" onSubmit={addGroup}>
              <b><UsersRound size={16} /> Nuevo grupo</b>
              <select value={groupForm.project_code} onChange={(e) => setGroupForm({ ...groupForm, project_code: e.target.value })}>
                <option value="">Grupo general</option>
                {projects.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}
              </select>
              <input required placeholder="PALAS / CAMIONES / ..." value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
              <button className="primary-button"><Plus size={15} /> Crear</button>
            </form>
          </div>
        )}
      </section>

      <div className="admin-three-grid">
        <CatalogTable
          title="Almacenes"
          headers={['Código','Nombre','Tipo','Grupo remoto','Estado']}
          rows={warehouses.map((r) => [
            r.code,
            r.name,
            r.warehouse_scope === 'CENTRAL' ? 'CENTRAL' : 'REMOTO',
            r.warehouse_scope === 'CENTRAL'
              ? '—'
              : r.remote_group === 'PROYECTO_MINERO'
                ? 'PROYECTO MINERO'
                : r.remote_group === 'SUCURSAL'
                  ? 'SUCURSAL'
                  : r.remote_group === 'TIENDA'
                    ? 'TIENDA'
                    : 'SIN CLASIFICAR',
            r.active ? 'ACTIVO' : 'INACTIVO',
          ])}
        />
        <CatalogTable
          title="Centros / Unidades"
          headers={['Almacén / Equipo','Código','Nombre','Unidad','Estado']}
          rows={centers.map((r)=>[r.warehouse_code,r.code,r.name,r.business_unit,r.active?'ACTIVO':'INACTIVO'])}
        />
        <CatalogTable title="Proyectos" headers={['Código','Nombre','Almacén']} rows={projects.map((r) => [r.code, r.name, r.warehouse_code || '—'])} />
        <CatalogTable title="Grupos" headers={['Proyecto','Grupo','Estado']} rows={groups.map((r) => [r.project_code || 'GENERAL', r.name, r.active ? 'ACTIVO' : 'INACTIVO'])} />
      </div>
    </div>
  )
}

function CatalogTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <section className="panel small-catalog">
      <div className="panel-title"><div><h3>{title}</h3><p>{rows.length} registros</p></div></div>
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody>
        </table>
        {!rows.length && <div className="empty-work"><Boxes size={24} /><b>Sin registros</b></div>}
      </div>
    </section>
  )
}

function CategoriesAdmin({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')

  async function reload() {
    const { data, error } = await supabase.from('categories').select('*').order('name')
    if (error) setMessage(error.message)
    setRows((data ?? []) as Category[])
  }

  useEffect(() => { reload() }, [])

  async function add(event: FormEvent) {
    event.preventDefault()
    const value = name.trim().toUpperCase()
    if (!value) return
    const { error } = await supabase.from('categories').insert({ name: value, active: true, created_by: userId })
    if (error) { setMessage(error.message); return }
    await writeAudit(userId, 'CREATE_CATEGORY', 'CATEGORY', { name: value })
    setName('')
    setMessage('Categoría creada.')
    reload()
  }

  async function toggle(row: Category) {
    const { error } = await supabase.from('categories').update({ active: !row.active }).eq('id', row.id)
    if (error) { setMessage(error.message); return }
    await writeAudit(userId, 'UPDATE_CATEGORY', 'CATEGORY', { id: row.id, active: !row.active })
    reload()
  }

  return (
    <section className="panel">
      <div className="panel-title"><div><h3>Categorías</h3><p>Catálogo global independiente de las etiquetas.</p></div></div>
      <form className="inline-admin-form" onSubmit={add}>
        <input required placeholder="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary-button"><Plus size={16} /> Crear</button>
      </form>
      {message && <div className="inline-message">{message}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Categoría</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.name}</b></td><td><span className={row.active ? 'status-pill' : 'status-pill danger'}>{row.active ? 'ACTIVA' : 'INACTIVA'}</span></td><td><button className="secondary-button" onClick={() => toggle(row)}>{row.active ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  )
}

function KpiAdmin({ userId }: { userId: string }) {
  const now = new Date()
  const [rows, setRows] = useState<KpiTarget[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    indicator: 'ERI',
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    warehouse: 'GLOBAL',
    target: '99.5',
    unit: '%',
  })

  async function reload() {
    const [targets, wh] = await Promise.all([
      supabase.from('kpi_targets').select('*').order('year', { ascending: false }).order('month', { ascending: false }).limit(1000),
      supabase.from('warehouses').select('*').eq('active', true).order('name'),
    ])
    if (targets.error || wh.error) setMessage(targets.error?.message || wh.error?.message || '')
    setRows((targets.data ?? []) as KpiTarget[])
    setWarehouses((wh.data ?? []) as Warehouse[])
  }
  useEffect(() => { reload() }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    const payload = {
      indicator: form.indicator.trim().toUpperCase(),
      year: Number(form.year),
      month: Number(form.month),
      warehouse: form.warehouse,
      target: Number(form.target),
      unit: form.unit.trim() || '%',
      created_by: userId,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('kpi_targets').upsert(payload, { onConflict: 'indicator,year,month,warehouse' })
    if (error) { setMessage(error.message); return }
    await writeAudit(userId, 'UPSERT_KPI_TARGET', 'KPI_TARGET', payload)
    setMessage('Meta KPI guardada.')
    reload()
  }

  return (
    <section className="panel">
      <div className="panel-title"><div><h3>Metas / KPI</h3><p>Configura metas por indicador, periodo y almacén.</p></div></div>
      <form className="kpi-admin-form" onSubmit={save}>
        <input required placeholder="Indicador" value={form.indicator} onChange={(e) => setForm({ ...form, indicator: e.target.value })} />
        <input required type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
        <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select>
        <select value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })}><option value="GLOBAL">GLOBAL</option>{warehouses.map((w) => <option key={w.id} value={w.name}>{w.name}</option>)}</select>
        <input required type="number" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
        <input required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <button className="primary-button"><Plus size={16} /> Guardar meta</button>
      </form>
      {message && <div className="inline-message">{message}</div>}
      <div className="table-wrap">
        <table><thead><tr><th>Indicador</th><th>Año</th><th>Mes</th><th>Almacén</th><th>Meta</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}><td><b>{row.indicator}</b></td><td>{row.year}</td><td>{row.month}</td><td>{row.warehouse}</td><td>{row.target} {row.unit}</td></tr>)}
        </tbody></table>
      </div>
    </section>
  )
}

function PeriodsAdmin({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Period[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [message, setMessage] = useState('')
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [warehouse, setWarehouse] = useState('GLOBAL')

  async function reload() {
    const [p, w] = await Promise.all([
      supabase.from('periods').select('*').order('period', { ascending: false }),
      supabase.from('warehouses').select('*').eq('active', true).order('name'),
    ])
    setRows((p.data ?? []) as Period[])
    setWarehouses((w.data ?? []) as Warehouse[])
    if (p.error || w.error) setMessage(p.error?.message || w.error?.message || '')
  }
  useEffect(() => { reload() }, [])

  async function add(event: FormEvent) {
    event.preventDefault()
    const payload = { period, warehouse, status: 'ABIERTO' }
    const { error } = await supabase.from('periods').upsert(payload, { onConflict: 'period,warehouse' })
    if (error) { setMessage(error.message); return }
    await writeAudit(userId, 'OPEN_PERIOD', 'PERIOD', payload)
    setMessage('Periodo habilitado.')
    reload()
  }

  async function toggle(row: Period) {
    const closing = row.status === 'ABIERTO'
    const payload = closing
      ? { status: 'CERRADO', closed_by: userId, closed_at: new Date().toISOString() }
      : { status: 'ABIERTO', closed_by: null, closed_at: null }
    const { error } = await supabase.from('periods').update(payload).eq('id', row.id)
    if (error) { setMessage(error.message); return }
    await writeAudit(userId, closing ? 'CLOSE_PERIOD' : 'REOPEN_PERIOD', 'PERIOD', { id: row.id, period: row.period, warehouse: row.warehouse })
    reload()
  }

  return (
    <section className="panel">
      <div className="panel-title"><div><h3>Periodos</h3><p>Cierre mensual. Solo Administrador puede reabrir un periodo.</p></div></div>
      <form className="inline-admin-form" onSubmit={add}>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}><option value="GLOBAL">GLOBAL</option>{warehouses.map((w) => <option key={w.id} value={w.name}>{w.name}</option>)}</select>
        <button className="primary-button"><Plus size={16} /> Habilitar</button>
      </form>
      {message && <div className="inline-message">{message}</div>}
      <div className="table-wrap"><table><thead><tr><th>Periodo</th><th>Almacén</th><th>Estado</th><th>Cierre</th><th></th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}><td><b>{row.period}</b></td><td>{row.warehouse}</td><td><span className={row.status === 'ABIERTO' ? 'status-pill' : 'status-pill warning'}>{row.status}</span></td><td>{row.closed_at ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.closed_at)) : '—'}</td><td><button className="secondary-button" onClick={() => toggle(row)}>{row.status === 'ABIERTO' ? 'Cerrar periodo' : 'Reabrir'}</button></td></tr>)}
      </tbody></table></div>
    </section>
  )
}

function AuditAdmin() {
  const [audit, setAudit] = useState<Record<string, unknown>[]>([])
  const [imports, setImports] = useState<Record<string, unknown>[]>([])
  const [userImports, setUserImports] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  async function reload() {
    setLoading(true)
    const [a, b, c] = await Promise.all([
      supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('bulk_imports').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('bulk_user_imports').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    setAudit((a.data ?? []) as Record<string, unknown>[])
    setImports((b.data ?? []) as Record<string, unknown>[])
    setUserImports((c.data ?? []) as Record<string, unknown>[])
    setLoading(false)
  }
  useEffect(() => { reload() }, [])

  return (
    <div className="audit-grid">
      <section className="panel">
        <div className="panel-title"><div><h3>Auditoría</h3><p>Operaciones administrativas críticas.</p></div><button className="icon-button" onClick={reload}><RefreshCw size={18} /></button></div>
        {loading ? <div className="screen-center compact"><RefreshCw className="spin" size={22} /></div> : <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead><tbody>
          {audit.map((row) => <tr key={String(row.id)}><td>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(row.created_at)))}</td><td><b>{String(row.action)}</b></td><td>{String(row.entity_type)}</td><td className="audit-detail">{JSON.stringify(row.details)}</td></tr>)}
        </tbody></table></div>}
      </section>
      <section className="panel">
        <div className="panel-title"><div><h3>Bitácora de cargas</h3><p>Archivos y resultados importados.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Archivo</th><th>Total</th><th>Errores</th><th>Estado</th></tr></thead><tbody>
          {imports.map((row) => <tr key={String(row.id)}><td>{String(row.import_type)}</td><td>{String(row.file_name || '—')}</td><td>{String(row.total_rows)}</td><td>{String(row.error_rows)}</td><td>{String(row.status)}</td></tr>)}
          {userImports.map((row) => <tr key={String(row.id)}><td>USUARIOS</td><td>{String(row.file_name || '—')}</td><td>{String(row.total_rows)}</td><td>{String(row.error_count)}</td><td>{String(row.status)}</td></tr>)}
        </tbody></table></div>
      </section>
    </div>
  )
}

function BulkImports({ userId }: { userId: string }) {
  const [type, setType] = useState<ImportType>('MASTER_MATERIALES')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('datos_komtrol.csv')
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')
  const [showErrors, setShowErrors] = useState(true)

  const parsed = useMemo(() => parseDelimited(text), [text])
  const preview = useMemo(() => validateImport(type, parsed.headers, parsed.rows), [type, parsed])
  const validCount = preview.filter((row) => row.valid).length
  const errorCount = preview.length - validCount

  function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
    const array = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true })
    const blob = new Blob([array], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2500)
  }

  function template() {
    try {
      const headers = IMPORT_HEADERS[type]
      const example =
        type === 'MASTER_MATERIALES'
          ? ['RH018753','1100176102','DESCRIPCION MATERIAL','C029','ANTAMINA','PHPB001A','0','','ACTIVO']
          : type === 'REPOSICION'
            ? ['T062-00001445','8910501730',new Date().toISOString().slice(0,10),'','KOMATSU','1','19T6066D5','PIN, BOOM BUMPER - PHLB01A01','4.000','UND','ANTAMINA','']
            : type === 'KPI'
              ? ['ERI',String(new Date().getFullYear()),String(new Date().getMonth() + 1),'ANTAMINA','99.8','','%']
              : ['T098-00005674','8910542095',new Date().toISOString().slice(0,10),'DOC-001','1','ANTAMINA','']

      const ws = XLSX.utils.aoa_to_sheet([headers, example])
      ws['!cols'] = headers.map((header) => ({ wch: Math.max(14, Math.min(38, header.length + 8)) }))
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: 1, c: headers.length - 1 }) }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, type === 'MASTER_MATERIALES' ? 'Maestro Materiales' : type)
      downloadWorkbook(wb, `KOMTROL_Plantilla_${type}.xlsx`)
      setMessage('Plantilla Excel descargada. Completa los datos sin cambiar los encabezados.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar la plantilla Excel.')
    }
  }

  async function onFile(file?: File) {
    if (!file) return
    setFileName(file.name)
    setMessage('')

    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const workbook = XLSX.read(await file.arrayBuffer(), {
          type: 'array',
          cellDates: true,
          dense: false,
        })
        const firstSheet = workbook.SheetNames[0]
        if (!firstSheet) throw new Error('El Excel no contiene hojas.')
        const worksheet = workbook.Sheets[firstSheet]
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false,
        }) as unknown[][]

        if (rows.length < 2) throw new Error('El Excel no contiene registros para importar.')

        const tabText = rows
          .filter((row) => row.some((cell) => String(cell ?? '').trim()))
          .map((row) => row.map((cell) => String(cell ?? '').replace(/\t/g, ' ')).join('\t'))
          .join('\n')

        setText(tabText)
        setMessage(`Archivo leído correctamente: ${Math.max(rows.length - 1, 0)} fila(s). Revisa la validación antes de importar.`)
        return
      }

      if (/\.(csv|txt)$/i.test(file.name)) {
        const content = await file.text()
        setText(content)
        setMessage('Archivo leído correctamente. Revisa la validación antes de importar.')
        return
      }

      setMessage('Formato no compatible. Usa .XLSX, .XLS, .CSV o .TXT.')
    } catch (error) {
      setText('')
      setMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo.')
    }
  }

  function errorField(error: string) {
    const text = error.toUpperCase()
    if (text.includes('MATERIAL')) return 'MATERIAL'
    if (text.includes('DESCRIP')) return 'DESCRIPCION'
    if (text.includes('CENTRO')) return 'CENTRO'
    if (text.includes('ALMAC')) return 'ALMACEN'
    if (text.includes('PRECIO')) return 'PRECIO'
    if (text.includes('GUIA') || text.includes('GUÍA')) return 'GUIA'
    if (text.includes('REFERENCIA')) return 'REFERENCIA'
    if (text.includes('PROVEEDOR')) return 'PROVEEDOR'
    if (text.includes('CANTIDAD')) return 'CANTIDAD'
    if (text.includes('FECHA')) return 'FECHA_EMISION'
    if (text.includes('LINEA') || text.includes('LÍNEA')) return 'LINEA'
    if (text.includes('LINEAS') || text.includes('LÍNEAS')) return 'LINEAS'
    if (text.includes('INDICADOR')) return 'INDICADOR'
    if (text.includes('AÑO') || text.includes('ANO')) return 'ANO'
    if (text.includes('MES')) return 'MES'
    if (text.includes('VALOR')) return 'VALOR'
    if (text.includes('UM')) return 'UM'
    return ''
  }

  function errorImpact(error: string) {
    const text = error.toUpperCase()
    if (text.includes('FECHA')) {
      return {
        level: 'ADVERTENCIA' as const,
        scope: 'Afecta la trazabilidad temporal y los filtros por periodo. Si aceptas la carga, la fila queda observada hasta corregir la fecha.',
      }
    }
    if (text.includes('PRECIO')) {
      return {
        level: 'ADVERTENCIA' as const,
        scope: 'Afecta valorizaciones y reportes económicos. La fila queda observada y no pasa al maestro operativo hasta corregir el valor.',
      }
    }
    if (
      text.includes('CANTIDAD') ||
      text.includes('VALOR') ||
      text.includes('LINEA') ||
      text.includes('LÍNEA') ||
      text.includes('MES') ||
      text.includes('AÑO') ||
      text.includes('ANO')
    ) {
      return {
        level: 'BLOQUEANTE' as const,
        scope: 'Afecta cantidades, cálculos o el periodo del registro. Debe corregirse antes de que esta fila ingrese al módulo operativo.',
      }
    }
    if (text.includes('FALTA COLUMNA')) {
      return {
        level: 'BLOQUEANTE' as const,
        scope: 'La estructura no coincide con la plantilla. El lote puede aceptarse con errores, pero estas filas quedan observadas hasta recuperar la columna.',
      }
    }
    return {
      level: 'BLOQUEANTE' as const,
      scope: 'El dato identifica o relaciona el registro dentro de KOMTROL. La fila se conserva en bitácora, pero no se publica al módulo operativo hasta corregirla.',
    }
  }

  function updatePreviewCell(rowNumber: number, header: string, value: string) {
    const lines = text.replace(/\r/g,'').split('\n').filter((line)=>line.trim())
    if (!lines.length || !header) return
    const headerIndex = parsed.headers.indexOf(header)
    const lineIndex = rowNumber - 1
    if (headerIndex < 0 || lineIndex < 1 || lineIndex >= lines.length) return
    const cells = parseLine(lines[lineIndex], parsed.delimiter)
    while (cells.length < parsed.headers.length) cells.push('')
    cells[headerIndex] = value
    const quote = (cell:string) => {
      const raw=String(cell ?? '')
      return raw.includes(parsed.delimiter) || /["\n]/.test(raw) ? '"' + raw.replace(/"/g,'""') + '"' : raw
    }
    lines[lineIndex] = cells.map(quote).join(parsed.delimiter)
    setText(lines.join('\n'))
  }

  function downloadErrors() {
    const errors = preview.filter((row)=>!row.valid)
    if (!errors.length) return
    const dynamicColumns = IMPORT_HEADERS[type].map((header)=>({
      header,
      key: header,
      width: header.length > 18 ? 28 : 18,
    }))
    const rows = errors.map((row)=>({
      FILA: row.row,
      ERROR: row.error,
      CAMPO: errorField(row.error),
      ...Object.fromEntries(IMPORT_HEADERS[type].map((header)=>[header,row.values[header] || ''])),
    }))
    exportRowsToExcel(
      `KOMTROL_Errores_${type}`,
      'Errores',
      [
        {header:'FILA',key:'FILA',width:10},
        {header:'ERROR',key:'ERROR',width:42},
        {header:'CAMPO',key:'CAMPO',width:18},
        ...dynamicColumns,
      ],
      rows,
      [['Tipo de carga',type],['Filas con error',errors.length]]
    )
  }

  async function confirmImport(acceptErrors = false) {
    if (!preview.length) {
      setMessage('No hay registros para importar.')
      return
    }

    const validRows = preview.filter((row) => row.valid)
    const invalidRows = preview.filter((row) => !row.valid)

    if (!acceptErrors && errorCount) {
      setMessage('Hay filas con error. Puedes corregirlas o usar “Aceptar carga con errores”.')
      setShowErrors(true)
      return
    }

    if (!validRows.length && !acceptErrors) {
      setMessage('No hay filas válidas para importar.')
      setShowErrors(true)
      return
    }

    setImporting(true)
    setMessage('')

    try {
      const result = validRows.length
        ? await executeImport(type, acceptErrors ? validRows : preview, userId)
        : { imported: 0, duplicates: 0, errors: 0 }

      const acceptedErrors = acceptErrors
        ? invalidRows.map((row) => {
            const impact = errorImpact(row.error)
            return {
              row: row.row,
              error: row.error,
              field: errorField(row.error),
              impact: impact.level,
              scope: impact.scope,
              values: row.values,
            }
          })
        : []

      const acceptedWithErrors = acceptErrors && errorCount > 0

      const { error: logError } = await supabase.from('bulk_imports').insert({
        import_type: type,
        file_name: fileName,
        total_rows: preview.length,
        valid_rows: result.imported,
        error_rows: acceptedWithErrors ? errorCount : result.errors,
        duplicate_rows: result.duplicates,
        status: acceptedWithErrors ? 'ACEPTADO_CON_ERRORES' : (result.errors ? 'CON_ERRORES' : 'COMPLETADO'),
        details: {
          ...result,
          accepted_with_errors: acceptedWithErrors,
          accepted_error_rows: acceptedErrors,
        },
        created_by: userId,
      })

      if (logError) throw logError

      await writeAudit(userId, 'BULK_IMPORT', type, {
        file_name: fileName,
        total: preview.length,
        valid_input_rows: validRows.length,
        accepted_error_rows: acceptedWithErrors ? errorCount : 0,
        ...result,
      })

      setMessage(
        acceptedWithErrors
          ? `Carga aceptada con errores: ${result.imported} registro(s) procesado(s) y ${errorCount} fila(s) observada(s) guardadas en la bitácora para corrección. Ninguna fila observada se pierde.`
          : `Importación completada: ${result.imported} procesados, ${result.duplicates} duplicados/actualizados, ${result.errors} errores.`
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la importación.')
    } finally {
      setImporting(false)
    }
  }



  return (
    <section className="panel bulk-import-admin">
      <div className="panel-title">
        <div><h3>Cargas Masivas</h3><p>Maestro de Materiales, Reposición, Inbound, OC, Cargos Directos y KPI desde Excel o CSV.</p></div>
        <button className="secondary-button" onClick={template}><Download size={16} /> Descargar plantilla Excel</button>
      </div>

      <div className="bulk-import-grid">
        <div>
          <label className="field-label">Tipo de información
            <select value={type} onChange={(e) => { setType(e.target.value as ImportType); setText(''); setMessage('') }}>
              <option value="MASTER_MATERIALES">Maestro de Materiales</option>
              <option value="REPOSICION">Reposición (detalle por material)</option>
              <option value="INBOUND">Inbound / Guías (clasificación automática)</option>
              <option value="ORDEN_COMPRA">Orden de Compra</option>
              <option value="CARGO_DIRECTO">Cargos Directos</option>
              <option value="KPI">KPI / Scorecard</option>
            </select>
          </label>
          <label className="upload-box compact-upload">
            <FileUp size={20} />
            <span><b>Cargar Excel / CSV</b><small>Admite .XLSX, .XLS, .CSV y pegado directo desde Excel.</small></span>
            <input type="file" accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <textarea className="bulk-textarea" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={IMPORT_HEADERS[type].join('\t') + '\n...'} />
        </div>
        <div className="bulk-summary-card">
          <div className="bulk-step"><span>1</span><div><b>Validación previa</b><small>Ningún dato se importa hasta confirmar.</small></div></div>
          <div className="mini-kpis">
            <div><b>{preview.length}</b><span>Total</span></div>
            <div><b>{validCount}</b><span>Válidos</span></div>
            <div><b>{errorCount}</b><span>Errores</span></div>
          </div>
          <div className="validation-list">
            <p><CheckCircle2 size={16} /> Columnas obligatorias</p>
            <p><CheckCircle2 size={16} /> Fechas válidas</p>
            <p><CheckCircle2 size={16} /> Duplicados controlados</p>
            <p><CheckCircle2 size={16} /> Bitácora de importación</p>
          </div>
          <div className="bulk-import-actions">
            <button className="primary-button full" disabled={!preview.length || Boolean(errorCount) || importing} onClick={()=>confirmImport(false)}>
              {importing ? <RefreshCw className="spin" size={17} /> : <Upload size={17} />}
              {importing ? 'Importando…' : `Importar ${validCount} registros`}
            </button>
            {errorCount > 0 && (
              <button className="secondary-button full bulk-partial-button" disabled={importing} onClick={()=>confirmImport(true)}>
                <Upload size={17} /> Aceptar carga con errores · {validCount} válidos / {errorCount} observados
              </button>
            )}
            {errorCount > 0 && (
              <button className="secondary-button full" onClick={()=>setShowErrors((value)=>!value)}>
                <XCircle size={16}/> {showErrors ? 'Ocultar' : 'Ver'} detalle de errores
              </button>
            )}
          </div>
        </div>
      </div>

      {message && <div className="inline-message">{message}</div>}

      {errorCount > 0 && showErrors && (
        <section className="bulk-error-panel">
          <div className="bulk-error-head">
            <div>
              <span className="status-pill danger"><XCircle size={14}/> {errorCount} errores detectados</span>
              <h4>Detalle y corrección de errores</h4>
              <p>Revisa el alcance de cada error y corrige el campo directamente. También puedes aceptar el lote con errores: KOMTROL procesa las filas válidas y conserva las observadas completas en la bitácora para corregirlas después.</p>
            </div>
            <button className="secondary-button" onClick={downloadErrors}><Download size={15}/> Descargar errores Excel</button>
          </div>
          <div className="bulk-error-list">
            {preview.filter((row)=>!row.valid).slice(0,100).map((row)=>{
              const field=errorField(row.error)
              const impact=errorImpact(row.error)
              return <article key={row.row} className="bulk-error-row">
                <div className="bulk-error-meta">
                  <b>Fila {row.row}</b>
                  <span>{row.error}</span>
                  <small>{field ? `Campo afectado: ${field}` : 'Error estructural: revisa columnas de la plantilla.'}</small>
                  <div className={impact.level === 'BLOQUEANTE' ? 'bulk-error-impact blocking' : 'bulk-error-impact warning'}>
                    <strong>{impact.level}</strong>
                    <em>{impact.scope}</em>
                  </div>
                </div>
                {field && parsed.headers.includes(field) ? (
                  <label>
                    Corregir {field}
                    <input
                      value={row.values[field] || ''}
                      onChange={(e)=>updatePreviewCell(row.row,field,e.target.value)}
                      placeholder={`Nuevo valor para ${field}`}
                    />
                  </label>
                ) : (
                  <div className="bulk-error-help">Usa la plantilla oficial y conserva todos los encabezados requeridos.</div>
                )}
              </article>
            })}
          </div>
          {errorCount>100&&<div className="table-note">Mostrando 100 de {errorCount} errores. Descarga el Excel para revisar el total.</div>}
        </section>
      )}

      {preview.length > 0 && (
        <div className="table-wrap preview-table">
          <table>
            <thead><tr><th>Fila</th>{IMPORT_HEADERS[type].map((header) => <th key={header}>{header}</th>)}<th>Validación</th></tr></thead>
            <tbody>{preview.slice(0, 30).map((row) => <tr key={row.row}><td>{row.row}</td>{IMPORT_HEADERS[type].map((header) => <td key={header}>{row.values[header] || '—'}</td>)}<td>{row.valid ? <span className="ok-text"><CheckCircle2 size={15} /> Válido</span> : <span className="error-text"><XCircle size={15} /> {row.error}</span>}</td></tr>)}</tbody>
          </table>
          {preview.length > 30 && <div className="table-note">Vista previa: 30 de {preview.length} registros.</div>}
        </div>
      )}
    </section>
  )
}

function validateImport(type: ImportType, headers: string[], rows: Record<string, string>[]): ImportPreview[] {
  const required =
    type === 'MASTER_MATERIALES' ? ['MATERIAL','DESCRIPCION','CENTRO','ALMACEN'] :
    type === 'REPOSICION' ? ['GUIA','REFERENCIA','PROVEEDOR','MATERIAL','DESCRIPCION','CANTIDAD','UM','ALMACEN'] :
    type === 'KPI' ? ['INDICADOR','ANO','MES','ALMACEN','VALOR'] :
    ['GUIA','REFERENCIA','LINEAS','ALMACEN']
  const missing = required.filter((header) => !headers.includes(header))
  if (missing.length) {
    return rows.map((values, index) => ({ row: index + 2, values, valid: false, error: `Falta columna ${missing.join(', ')}` }))
  }

  return rows.map((values, index) => {
    let error = ''
    if (type === 'MASTER_MATERIALES') {
      if (!values.MATERIAL?.trim()) error = 'Material requerido'
      else if (!values.DESCRIPCION?.trim()) error = 'Descripción requerida'
      else if (!values.CENTRO?.trim()) error = 'Centro requerido'
      else if (!values.ALMACEN?.trim()) error = 'Almacén requerido'
      else if (values.PRECIO && Number.isNaN(Number(values.PRECIO.replace(',', '.')))) error = 'Precio inválido'
    } else if (type === 'REPOSICION') {
      const provider = (values.PROVEEDOR || '').trim().toUpperCase()
      if (!values.GUIA?.trim()) error = 'Guía requerida'
      else if (!values.REFERENCIA?.trim().startsWith('89')) error = 'La referencia de Reposición debe iniciar con 89'
      else if (!['KOMATSU','CUMMINS'].includes(provider)) error = 'Proveedor debe ser KOMATSU o CUMMINS'
      else if (!values.MATERIAL?.trim()) error = 'Material requerido'
      else if (!values.DESCRIPCION?.trim()) error = 'Descripción requerida'
      else if (Number.isNaN(Number((values.CANTIDAD || '').replace(',', '.')))) error = 'Cantidad inválida'
      else if (!values.UM?.trim()) error = 'UM requerida'
      else if (!values.ALMACEN?.trim()) error = 'Almacén requerido'
      else if (values.FECHA_EMISION && !toIsoDate(values.FECHA_EMISION)) error = 'Fecha inválida'
      else if (values.LINEA && !(Number(values.LINEA) >= 1)) error = 'Línea inválida'
    } else if (type === 'KPI') {
      if (!values.INDICADOR?.trim()) error = 'Indicador requerido'
      else if (!/^\d{4}$/.test(values.ANO || '')) error = 'Año inválido'
      else if (!(Number(values.MES) >= 1 && Number(values.MES) <= 12)) error = 'Mes inválido'
      else if (!values.ALMACEN?.trim()) error = 'Almacén requerido'
      else if (Number.isNaN(Number((values.VALOR || '').replace(',', '.')))) error = 'Valor inválido'
    } else {
      if (!values.GUIA?.trim()) error = 'Guía requerida'
      else if (!values.REFERENCIA?.trim()) error = 'Referencia requerida'
      else if (!(Number(values.LINEAS) >= 1)) error = 'Líneas inválidas'
      else if (!values.ALMACEN?.trim()) error = 'Almacén requerido'
      else if (values.FECHA_EMISION && !toIsoDate(values.FECHA_EMISION)) error = 'Fecha inválida'
    }
    return { row: index + 2, values, valid: !error, error }
  })
}

async function executeImport(type: ImportType, preview: ImportPreview[], userId: string) {
  if (type === 'MASTER_MATERIALES') {
    const mappedRows = preview.map(({ values }) => ({
      material_no: values.MATERIAL.trim().toUpperCase(),
      stock_code: values.STOCK_CODE?.trim() || null,
      description: values.DESCRIPCION.trim(),
      center: values.CENTRO.trim().toUpperCase(),
      warehouse: values.ALMACEN.trim().toUpperCase(),
      location: values.UBICACION?.trim().toUpperCase() || null,
      price: values.PRECIO ? Number(values.PRECIO.replace(',', '.')) : null,
      notes: values.OBSERVACION?.trim() || null,
      status: ['ACTIVO','INACTIVO','OBSERVADO'].includes((values.ESTADO || '').toUpperCase()) ? values.ESTADO.toUpperCase() : 'ACTIVO',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }))

    // Si el mismo Material/Almacén aparece repetido en el Excel,
    // prevalece la última fila y se contabiliza como duplicado.
    const uniqueMap = new Map<string, typeof mappedRows[number]>()
    let internalDuplicates = 0
    for (const row of mappedRows) {
      const key = `${row.material_no}|${row.warehouse}`
      if (uniqueMap.has(key)) internalDuplicates += 1
      uniqueMap.set(key, row)
    }
    const rows = Array.from(uniqueMap.values())

    const { data: existing, error: existingError } = await supabase
      .from('materials')
      .select('material_no,warehouse')
      .limit(50000)
    if (existingError) throw existingError

    const keys = new Set((existing ?? []).map((row) => `${row.material_no}|${row.warehouse}`))
    const existingDuplicates = rows.filter((row) => keys.has(`${row.material_no}|${row.warehouse}`)).length

    const chunkSize = 500
    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize)
      const { error } = await supabase
        .from('materials')
        .upsert(chunk, { onConflict: 'material_no,warehouse' })
      if (error) throw error
    }

    return {
      imported: rows.length,
      duplicates: internalDuplicates + existingDuplicates,
      errors: 0,
    }
  }

  if (type === 'REPOSICION') {
    const grouped = new Map<string, ImportPreview[]>()
    for (const row of preview) {
      const values = row.values
      const key = [
        values.GUIA.trim().toUpperCase(),
        values.REFERENCIA.trim(),
        values.PROVEEDOR.trim().toUpperCase(),
        values.ALMACEN.trim(),
      ].join('|')
      const list = grouped.get(key) ?? []
      list.push(row)
      grouped.set(key, list)
    }

    let imported = 0
    let duplicates = 0
    let receiptsCreated = 0

    for (const rows of grouped.values()) {
      const first = rows[0].values
      const guideNo = first.GUIA.trim().toUpperCase()
      const reference = first.REFERENCIA.trim()
      const provider = first.PROVEEDOR.trim().toUpperCase()
      const warehouse = first.ALMACEN.trim()

      const { data: existingGuide } = await supabase
        .from('guides')
        .select('id')
        .eq('guide_no', guideNo)
        .eq('reference', reference)
        .maybeSingle()

      if (existingGuide) {
        duplicates += rows.length
        continue
      }

      let emissionDate = toIsoDate(first.FECHA_EMISION || '')
      const today = new Date().toISOString().slice(0, 10)
      if (emissionDate && emissionDate > today) emissionDate = today

      const { data: createdGuide, error: guideError } = await supabase
        .from('guides')
        .insert({
          guide_no: guideNo,
          document_no: first.N_DOCUMENTO?.trim() || null,
          emission_date: emissionDate || null,
          transfer_start_date: null,
          date_source: emissionDate ? 'DOCUMENTO' : 'FECHA_CARGA',
          reception_at: new Date().toISOString(),
          reception_source: 'FECHA_CARGA',
          reference,
          line_count: rows.length,
          guide_type: 'REPOSICION',
          supplier: provider,
          data_source: 'CARGA_MASIVA',
          warehouse,
          responsible_user_id: userId,
          status: 'VALIDADO',
          notes: first.OBSERVACION?.trim() || null,
          created_by: userId,
        })
        .select('id')
        .single()

      if (guideError || !createdGuide) throw guideError || new Error('No se pudo crear la guía de Reposición.')

      const lineRows = rows
        .map((row, index) => ({
          guide_id: createdGuide.id,
          line_no: row.values.LINEA ? Number(row.values.LINEA) : index + 1,
          part_no: row.values.MATERIAL.trim().toUpperCase(),
          description: row.values.DESCRIPCION.trim(),
          quantity: Number(row.values.CANTIDAD.replace(',', '.')),
          unit: row.values.UM.trim().toUpperCase(),
        }))
        .sort((a, b) => a.line_no - b.line_no)

      const { error: linesError } = await supabase.from('guide_lines').insert(lineRows)
      if (linesError) throw linesError

      imported += rows.length
      receiptsCreated += 1
    }

    return { imported, duplicates, errors: 0, receiptsCreated }
  }

  if (type === 'KPI') {
    const rows = preview.map(({ values }) => ({
      indicator: values.INDICADOR.trim().toUpperCase(),
      year: Number(values.ANO),
      month: Number(values.MES),
      warehouse: values.ALMACEN.trim(),
      value: Number(values.VALOR.replace(',', '.')),
      amount: values.MONTO ? Number(values.MONTO.replace(',', '.')) : null,
      unit: values.UNIDAD?.trim() || '%',
      source: 'CARGA_MASIVA',
      created_by: userId,
      updated_at: new Date().toISOString(),
    }))
    const { data: existing } = await supabase.from('kpi_records').select('indicator,year,month,warehouse').limit(10000)
    const keys = new Set((existing ?? []).map((row) => `${row.indicator}|${row.year}|${row.month}|${row.warehouse}`))
    const duplicates = rows.filter((row) => keys.has(`${row.indicator}|${row.year}|${row.month}|${row.warehouse}`)).length
    const { error } = await supabase.from('kpi_records').upsert(rows, { onConflict: 'indicator,year,month,warehouse' })
    if (error) throw error
    return { imported: rows.length, duplicates, errors: 0 }
  }

  const forcedType =
    type === 'ORDEN_COMPRA' ? 'ORDEN_COMPRA' :
    type === 'CARGO_DIRECTO' ? 'CARGO_DIRECTO' :
    null

  const rawRows = preview.map(({ values }) => {
    let emissionDate = toIsoDate(values.FECHA_EMISION || '')
    const today = new Date().toISOString().slice(0, 10)
    if (emissionDate && emissionDate > today) emissionDate = today
    return {
      guide_no: values.GUIA.trim().toUpperCase(),
      document_no: values.N_DOCUMENTO?.trim() || null,
      emission_date: emissionDate || null,
      transfer_start_date: null,
      date_source: emissionDate ? 'DOCUMENTO' : 'FECHA_CARGA',
      reception_at: new Date().toISOString(),
      reception_source: 'FECHA_CARGA',
      reference: values.REFERENCIA.trim(),
      line_count: Number(values.LINEAS),
      guide_type: forcedType || guideType(values.REFERENCIA),
      supplier: null,
      data_source: 'CARGA_MASIVA',
      warehouse: values.ALMACEN.trim(),
      responsible_user_id: userId,
      status: 'VALIDADO',
      notes: values.OBSERVACION?.trim() || null,
      created_by: userId,
    }
  })

  const uniqueRows: typeof rawRows = []
  const internalKeys = new Set<string>()
  let duplicates = 0
  rawRows.forEach((row) => {
    const key = `${row.guide_no}|${row.reference}`
    if (internalKeys.has(key)) duplicates++
    else {
      internalKeys.add(key)
      uniqueRows.push(row)
    }
  })

  const { data: existing } = await supabase.from('guides').select('guide_no,reference').limit(10000)
  const existingKeys = new Set((existing ?? []).map((row) => `${row.guide_no}|${row.reference}`))
  const toInsert = uniqueRows.filter((row) => {
    const exists = existingKeys.has(`${row.guide_no}|${row.reference}`)
    if (exists) duplicates++
    return !exists
  })

  if (toInsert.length) {
    const { error } = await supabase.from('guides').insert(toInsert)
    if (error) throw error
  }
  return { imported: toInsert.length, duplicates, errors: 0 }
}
