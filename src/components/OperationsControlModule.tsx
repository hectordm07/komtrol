import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportRowsToExcel, exportRowsToPdfPortrait } from '../lib/exportUtils'

type Mode =
  | 'consignacion'
  | 'prestamos'
  | 'outbound'
  | 'inventarios'
  | 'transitos'
  | 'danados'
  | 'activos'

type Props = {
  mode: Mode
  userId: string
  warehouse?: string | null
}

type FieldConfig = {
  name: string
  label: string
  type?: 'text' | 'date' | 'number' | 'select' | 'textarea'
  required?: boolean
  options?: string[]
  placeholder?: string
}

type ColumnConfig = {
  name: string
  label: string
  format?: 'date' | 'number' | 'currency' | 'status' | 'days'
}

type ModuleConfig = {
  title: string
  subtitle: string
  table: string
  icon: 'package' | 'truck' | 'alert' | 'boxes' | 'clipboard'
  fields: FieldConfig[]
  columns: ColumnConfig[]
  defaults: Record<string, string>
  statusOptions?: string[]
}

const MONTHS = [
  'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE',
]

const CONFIG: Record<Mode, ModuleConfig> = {
  consignacion: {
    title: 'Ingresos de Consignación',
    subtitle: 'Recepción, ubicación y seguimiento de materiales en consignación.',
    table: 'consignment_entries',
    icon: 'package',
    defaults: { entry_date: new Date().toISOString().slice(0, 10), status: 'RECEPCIONADO', unit: 'UND' },
    statusOptions: ['PENDIENTE','RECEPCIONADO','UBICADO','OBSERVADO','CERRADO'],
    fields: [
      { name: 'entry_date', label: 'Fecha', type: 'date', required: true },
      { name: 'guide_no', label: 'Guía' },
      { name: 'reference', label: 'OC / Referencia' },
      { name: 'material_no', label: 'Material', required: true, placeholder: 'Número de parte' },
      { name: 'stock_code', label: 'Stock Code' },
      { name: 'description', label: 'Descripción' },
      { name: 'quantity', label: 'Cantidad', type: 'number', required: true },
      { name: 'unit', label: 'Unidad' },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'location', label: 'Ubicación' },
      { name: 'status', label: 'Estado', type: 'select', options: ['PENDIENTE','RECEPCIONADO','UBICADO','OBSERVADO','CERRADO'] },
      { name: 'notes', label: 'Observación', type: 'textarea' },
    ],
    columns: [
      { name: 'entry_date', label: 'Fecha', format: 'date' },
      { name: 'guide_no', label: 'Guía' },
      { name: 'reference', label: 'Referencia' },
      { name: 'material_no', label: 'Material' },
      { name: 'description', label: 'Descripción' },
      { name: 'quantity', label: 'Cant.', format: 'number' },
      { name: 'location', label: 'Ubicación' },
      { name: 'status', label: 'Estado', format: 'status' },
    ],
  },
  prestamos: {
    title: 'OS / Préstamos',
    subtitle: 'Control de materiales entregados, devolución y observaciones.',
    table: 'loans',
    icon: 'boxes',
    defaults: { status: 'PENDIENTE' },
    statusOptions: ['PENDIENTE','ENTREGADO','DEVUELTO','OBSERVADO'],
    fields: [
      { name: 'os_no', label: 'OS' },
      { name: 'material_no', label: 'Material', required: true },
      { name: 'description', label: 'Descripción' },
      { name: 'quantity', label: 'Cantidad', type: 'number', required: true },
      { name: 'person_area', label: 'Persona / Área' },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'delivery_date', label: 'Fecha entrega', type: 'date' },
      { name: 'return_date', label: 'Fecha devolución', type: 'date' },
      { name: 'status', label: 'Estado', type: 'select', options: ['PENDIENTE','ENTREGADO','DEVUELTO','OBSERVADO'] },
      { name: 'notes', label: 'Observación', type: 'textarea' },
    ],
    columns: [
      { name: 'os_no', label: 'OS' },
      { name: 'material_no', label: 'Material' },
      { name: 'description', label: 'Descripción' },
      { name: 'quantity', label: 'Cant.', format: 'number' },
      { name: 'person_area', label: 'Persona / Área' },
      { name: 'delivery_date', label: 'Entrega', format: 'date' },
      { name: 'return_date', label: 'Devolución', format: 'date' },
      { name: 'status', label: 'Estado', format: 'status' },
    ],
  },
  outbound: {
    title: 'Consumos / Outbound',
    subtitle: 'Registra una vez el consumo para operación, estadística y dashboard.',
    table: 'outbound_movements',
    icon: 'truck',
    defaults: { movement_date: new Date().toISOString().slice(0, 10) },
    fields: [
      { name: 'movement_date', label: 'Fecha', type: 'date', required: true },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'material_no', label: 'Material', required: true },
      { name: 'stock_code', label: 'Stock Code' },
      { name: 'description', label: 'Descripción' },
      { name: 'quantity', label: 'Cantidad', type: 'number', required: true },
      { name: 'destination', label: 'Destino' },
      { name: 'reference', label: 'OT / Reserva / Referencia' },
      { name: 'responsible', label: 'Responsable' },
      { name: 'notes', label: 'Observación', type: 'textarea' },
    ],
    columns: [
      { name: 'movement_date', label: 'Fecha', format: 'date' },
      { name: 'material_no', label: 'Material' },
      { name: 'description', label: 'Descripción' },
      { name: 'quantity', label: 'Cant.', format: 'number' },
      { name: 'destination', label: 'Destino' },
      { name: 'reference', label: 'OT / Reserva' },
      { name: 'responsible', label: 'Responsable' },
      { name: 'warehouse', label: 'Almacén' },
    ],
  },
  inventarios: {
    title: 'Inventarios',
    subtitle: 'Programación, ejecución y cierre de inventarios por periodo y almacén.',
    table: 'inventories',
    icon: 'clipboard',
    defaults: {
      year: String(new Date().getFullYear()),
      month: String(new Date().getMonth() + 1),
      status: 'PROGRAMADO',
    },
    statusOptions: ['PROGRAMADO','EN_PROCESO','REALIZADO','NO_REALIZADO','EN_PROCESO_CIERRE'],
    fields: [
      { name: 'year', label: 'Año', type: 'number', required: true },
      { name: 'month', label: 'Mes', type: 'select', options: MONTHS.map((_, i) => String(i + 1)), required: true },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'inventory_type', label: 'Tipo inventario' },
      { name: 'scheduled_date', label: 'Fecha programada', type: 'date' },
      { name: 'completed_date', label: 'Fecha realizada', type: 'date' },
      { name: 'responsible', label: 'Responsable' },
      { name: 'result', label: 'Resultado' },
      { name: 'status', label: 'Estado', type: 'select', options: ['PROGRAMADO','EN_PROCESO','REALIZADO','NO_REALIZADO','EN_PROCESO_CIERRE'] },
      { name: 'notes', label: 'Observación', type: 'textarea' },
    ],
    columns: [
      { name: 'year', label: 'Año' },
      { name: 'month', label: 'Mes' },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'inventory_type', label: 'Tipo' },
      { name: 'scheduled_date', label: 'Programada', format: 'date' },
      { name: 'completed_date', label: 'Realizada', format: 'date' },
      { name: 'responsible', label: 'Responsable' },
      { name: 'status', label: 'Estado', format: 'status' },
    ],
  },
  transitos: {
    title: 'Tránsitos',
    subtitle: 'Material en tránsito, antigüedad, origen, destino y estado.',
    table: 'transits',
    icon: 'truck',
    defaults: { transit_date: new Date().toISOString().slice(0, 10), status: 'EN_TRANSITO' },
    statusOptions: ['EN_TRANSITO','RECIBIDO','OBSERVADO','CERRADO'],
    fields: [
      { name: 'transit_date', label: 'Fecha', type: 'date', required: true },
      { name: 'guide_no', label: 'Guía' },
      { name: 'reference', label: 'Referencia' },
      { name: 'origin', label: 'Origen' },
      { name: 'destination', label: 'Destino' },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'material_no', label: 'Material' },
      { name: 'quantity', label: 'Cantidad', type: 'number' },
      { name: 'value_amount', label: 'Valor', type: 'number' },
      { name: 'status', label: 'Estado', type: 'select', options: ['EN_TRANSITO','RECIBIDO','OBSERVADO','CERRADO'] },
      { name: 'notes', label: 'Observación', type: 'textarea' },
    ],
    columns: [
      { name: 'transit_date', label: 'Fecha', format: 'date' },
      { name: 'guide_no', label: 'Guía' },
      { name: 'reference', label: 'Referencia' },
      { name: 'origin', label: 'Origen' },
      { name: 'destination', label: 'Destino' },
      { name: 'material_no', label: 'Material' },
      { name: 'quantity', label: 'Cant.', format: 'number' },
      { name: 'transit_date', label: 'Días', format: 'days' },
      { name: 'status', label: 'Estado', format: 'status' },
    ],
  },
  danados: {
    title: 'Dañados',
    subtitle: 'Material observado o dañado con motivo, cantidad y regularización.',
    table: 'damaged_materials',
    icon: 'alert',
    defaults: { event_date: new Date().toISOString().slice(0, 10), status: 'PENDIENTE' },
    statusOptions: ['PENDIENTE','EN_REVISION','REGULARIZADO','CERRADO'],
    fields: [
      { name: 'event_date', label: 'Fecha', type: 'date', required: true },
      { name: 'material_no', label: 'Material', required: true },
      { name: 'stock_code', label: 'Stock Code' },
      { name: 'description', label: 'Descripción' },
      { name: 'quantity', label: 'Cantidad', type: 'number', required: true },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'reason', label: 'Motivo' },
      { name: 'status', label: 'Estado', type: 'select', options: ['PENDIENTE','EN_REVISION','REGULARIZADO','CERRADO'] },
      { name: 'notes', label: 'Observación', type: 'textarea' },
    ],
    columns: [
      { name: 'event_date', label: 'Fecha', format: 'date' },
      { name: 'material_no', label: 'Material' },
      { name: 'stock_code', label: 'SC' },
      { name: 'description', label: 'Descripción' },
      { name: 'quantity', label: 'Cant.', format: 'number' },
      { name: 'reason', label: 'Motivo' },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'status', label: 'Estado', format: 'status' },
    ],
  },
  activos: {
    title: 'Activos',
    subtitle: 'Control de activos, ubicación, responsable, estado y última revisión.',
    table: 'assets',
    icon: 'boxes',
    defaults: { status: 'ACTIVO' },
    statusOptions: ['ACTIVO','INACTIVO','OBSERVADO','MANTENIMIENTO'],
    fields: [
      { name: 'asset_name', label: 'Activo', required: true },
      { name: 'description', label: 'Descripción' },
      { name: 'asset_code', label: 'Código' },
      { name: 'location', label: 'Ubicación' },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'responsible', label: 'Responsable' },
      { name: 'status', label: 'Estado', type: 'select', options: ['ACTIVO','INACTIVO','OBSERVADO','MANTENIMIENTO'] },
      { name: 'last_review', label: 'Última revisión', type: 'date' },
      { name: 'notes', label: 'Observación', type: 'textarea' },
    ],
    columns: [
      { name: 'asset_name', label: 'Activo' },
      { name: 'asset_code', label: 'Código' },
      { name: 'description', label: 'Descripción' },
      { name: 'location', label: 'Ubicación' },
      { name: 'responsible', label: 'Responsable' },
      { name: 'warehouse', label: 'Almacén' },
      { name: 'last_review', label: 'Últ. revisión', format: 'date' },
      { name: 'status', label: 'Estado', format: 'status' },
    ],
  },
}

function iconFor(value: ModuleConfig['icon']) {
  if (value === 'truck') return <Truck size={20} />
  if (value === 'alert') return <AlertTriangle size={20} />
  if (value === 'boxes') return <Boxes size={20} />
  if (value === 'clipboard') return <ClipboardList size={20} />
  return <PackageCheck size={20} />
}

function asText(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function formatCell(value: unknown, format?: ColumnConfig['format']) {
  if (value === null || value === undefined || value === '') return '—'
  if (format === 'date') {
    const date = new Date(String(value) + (String(value).length === 10 ? 'T12:00:00' : ''))
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat('es-PE').format(date)
  }
  if (format === 'number') return Number(value).toLocaleString('es-PE')
  if (format === 'currency') return Number(value).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' })
  if (format === 'days') {
    const date = new Date(String(value) + 'T12:00:00')
    const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
    return String(diff)
  }
  return String(value)
}

function downloadCsv(filename: string, columns: ColumnConfig[], rows: Record<string, unknown>[]) {
  const values = [
    columns.map((c) => c.label),
    ...rows.map((row) => columns.map((c) => formatCell(row[c.name], c.format))),
  ]
  const csv = values.map((row) => row.map((cell) => {
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

export function OperationsControlModule({ mode, userId, warehouse }: Props) {
  const config = CONFIG[mode]
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<Record<string, string>>({
    ...config.defaults,
    warehouse: config.defaults.warehouse || warehouse || '',
  })

  async function reload() {
    setLoading(true)
    const { data, error } = await supabase
      .from(config.table)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) setMessage(error.message)
    setRows((data ?? []) as Record<string, unknown>[])
    setLoading(false)
  }

  useEffect(() => {
    setForm({ ...config.defaults, warehouse: config.defaults.warehouse || warehouse || '' })
    reload()
  }, [mode, warehouse])

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows
    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q))
    )
  }, [rows, search])

  const exportColumns = config.columns.map((column) => ({
    header: column.label,
    key: column.name,
    width: column.label.length > 18 ? 30 : 18,
  }))

  const exportRows = visible.map((row) =>
    Object.fromEntries(
      config.columns.map((column) => [
        column.name,
        formatCell(row[column.name], column.format),
      ])
    )
  )

  function exportVisibleExcel() {
    exportRowsToExcel(
      `KOMTROL_${mode}`,
      config.title.slice(0, 31),
      exportColumns,
      exportRows,
      [['Módulo', config.title], ['Registros', exportRows.length], ['Almacén', warehouse || 'Todos']]
    )
  }

  function exportVisiblePdf() {
    exportRowsToPdfPortrait(
      `KOMTROL_${mode}`,
      `KOMTROL · ${config.title}`,
      exportColumns,
      exportRows,
      { subtitle: config.subtitle, summary: [['Registros', exportRows.length], ['Almacén', warehouse || 'Todos']] }
    )
  }

  async function autofillMaterial(materialNo: string) {
    const value = materialNo.trim()
    if (!value) return
    const { data } = await supabase
      .from('materials')
      .select('material_no,stock_code,description,location,warehouse')
      .eq('material_no', value)
      .limit(1)
      .maybeSingle()
    if (!data) return
    setForm((current) => ({
      ...current,
      material_no: data.material_no || current.material_no,
      stock_code: data.stock_code || current.stock_code || '',
      description: data.description || current.description || '',
      location: data.location || current.location || '',
      warehouse: current.warehouse || data.warehouse || warehouse || '',
    }))
  }

  function newRecord() {
    setForm({ ...config.defaults, warehouse: config.defaults.warehouse || warehouse || '' })
    setMessage('')
    setShowForm(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload: Record<string, unknown> = { created_by: userId }
    for (const field of config.fields) {
      const value = form[field.name] ?? ''
      if (value === '') {
        payload[field.name] = null
      } else if (field.type === 'number') {
        payload[field.name] = Number(value)
      } else {
        payload[field.name] = value
      }
    }

    if (mode === 'inventarios') {
      payload.year = Number(form.year)
      payload.month = Number(form.month)
    }

    const { error } = await supabase.from(config.table).insert(payload)
    setSaving(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setShowForm(false)
    setMessage('Registro guardado correctamente.')
    await reload()
  }

  async function updateStatus(row: Record<string, unknown>, status: string) {
    if (!config.statusOptions) return
    const { error } = await supabase
      .from(config.table)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', String(row.id))
    if (error) {
      setMessage(error.message)
      return
    }
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, status } : item))
  }

  return (
    <section className="panel operations-control-panel">
      <div className="panel-title">
        <div className="title-with-icon">
          <div className="module-icon">{iconFor(config.icon)}</div>
          <div><h3>{config.title}</h3><p>{config.subtitle}</p></div>
        </div>
        <div className="button-row">
          <button className="secondary-button" disabled={!visible.length} onClick={exportVisiblePdf}><FileText size={16} /> PDF</button>
          <button className="secondary-button" disabled={!visible.length} onClick={exportVisibleExcel}><FileSpreadsheet size={16} /> Excel</button>
          <button className="icon-button" onClick={reload}><RefreshCw size={18} /></button>
          <button className="primary-button" onClick={newRecord}><Plus size={17} /> Registrar</button>
        </div>
      </div>

      <div className="task-toolbar">
        <div className="search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en registros…" /></div>
        <span className="view-hint">{visible.length} registros</span>
      </div>

      {message && <div className="inline-message">{message}</div>}

      {loading ? (
        <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando registros…</p></div>
      ) : (
        <div className="table-wrap operations-table">
          <table>
            <thead>
              <tr>{config.columns.map((column, index) => <th key={`${column.name}-${index}`}>{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={String(row.id)}>
                  {config.columns.map((column, index) => (
                    <td key={`${column.name}-${index}`}>
                      {column.format === 'status' && config.statusOptions ? (
                        <select className="inline-select" value={asText(row[column.name]) === '—' ? '' : String(row[column.name])} onChange={(e) => updateStatus(row, e.target.value)}>
                          {config.statusOptions.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
                        </select>
                      ) : (
                        column.name === config.columns[0].name
                          ? <b>{formatCell(row[column.name], column.format)}</b>
                          : formatCell(row[column.name], column.format)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && <div className="empty-work">{iconFor(config.icon)}<b>Sin registros</b><p>Registra el primer movimiento desde KOMTROL.</p></div>}
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <form className="modal operation-modal" onSubmit={save}>
            <div className="modal-head">
              <div><h2>{config.title}</h2><p>El registro quedará asociado al usuario actual.</p></div>
              <button type="button" className="icon-button" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="form-grid">
              {config.fields.map((field) => {
                const spanClass = field.type === 'textarea' ? 'span-2' : ''
                if (field.type === 'textarea') {
                  return <label key={field.name} className={spanClass}>{field.label}
                    <textarea rows={2} required={field.required} value={form[field.name] ?? ''} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} />
                  </label>
                }
                if (field.type === 'select') {
                  return <label key={field.name}>{field.label}
                    <select required={field.required} value={form[field.name] ?? ''} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}>
                      {(field.options ?? []).map((option, index) => (
                        <option key={option} value={option}>
                          {field.name === 'month' ? MONTHS[index] : option.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                }
                return <label key={field.name}>{field.label}
                  <input
                    type={field.type || 'text'}
                    step={field.type === 'number' ? 'any' : undefined}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={form[field.name] ?? ''}
                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                    onBlur={field.name === 'material_no' ? (e) => autofillMaterial(e.target.value) : undefined}
                  />
                </label>
              })}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="primary-button" disabled={saving}>
                {saving ? <RefreshCw className="spin" size={17} /> : <Plus size={17} />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
