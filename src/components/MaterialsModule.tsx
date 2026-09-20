import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  CheckCircle2,
  Clock3,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  History,
  MapPin,
  MinusCircle,
  MoreHorizontal,
  MoveHorizontal,
  Plus,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportRowsToExcel, exportRowsToPdfPortrait } from '../lib/exportUtils'

type Material = {
  id: string
  material_no: string
  stock_code: string | null
  description: string
  center: string | null
  warehouse: string | null
  location: string | null
  previous_location: string | null
  location_changed_at: string | null
  price: number | null
  notes: string | null
  status: 'ACTIVO' | 'INACTIVO' | 'OBSERVADO'
  updated_by: string | null
  created_at: string
  updated_at: string
}

type MaterialHistory = {
  id: number
  material_id: string
  action: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  changed_by: string
  created_at: string
}

type SearchMatch = {
  material: Material
  score: number
  kind: 'EXACTA' | 'SIN_PREFIJO' | 'PREFIJO' | 'APROXIMADA' | 'TEXTO'
}

type Mode = 'consulta' | 'master' | 'ubicacion'

type Props = {
  mode: Mode
  userId: string
  isAdmin: boolean
}

const emptyForm = {
  material_no: '',
  stock_code: '',
  description: '',
  center: '',
  warehouse: '',
  location: '',
  price: '',
  notes: '',
  status: 'ACTIVO' as Material['status'],
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin cambio registrado'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date)
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => {
    const v = String(value ?? '')
    return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
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

function parseLocationRows(text: string) {
  return text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\t|;|,/).map((x) => x.trim())
    return { material_no: parts[0] || '', quantity: parts[1] || '1' }
  }).filter((x) => x.material_no)
}

function normalizeCode(value: string | null | undefined) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function baseCode(value: string | null | undefined) {
  const normalized = normalizeCode(value)
  return normalized.replace(/^[A-Z]{1,4}(?=\d)/, '')
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = next
  }
  return prev[b.length]
}

function similarity(a: string, b: string) {
  const left = normalizeCode(a)
  const right = normalizeCode(b)
  if (!left || !right) return 0
  const maxLength = Math.max(left.length, right.length)
  return Math.max(0, Math.round((1 - levenshtein(left, right) / maxLength) * 100))
}

function matchMaterial(material: Material, rawQuery: string): SearchMatch | null {
  const query = normalizeCode(rawQuery)
  if (!query) return null

  const materialCode = normalizeCode(material.material_no)
  const materialBase = baseCode(material.material_no)
  const queryBase = baseCode(query)

  if (materialCode === query) return { material, score: 100, kind: 'EXACTA' }
  if (materialBase && materialBase === query) return { material, score: 99, kind: 'SIN_PREFIJO' }
  if (queryBase && materialBase === queryBase) return { material, score: 97, kind: 'PREFIJO' }
  if (materialCode.endsWith(query) && query.length >= 5) return { material, score: 96, kind: 'SIN_PREFIJO' }

  const fuzzyScore = Math.max(
    similarity(query, materialCode),
    similarity(query, materialBase)
  )
  if (query.length >= 5 && fuzzyScore >= 72) {
    return { material, score: fuzzyScore, kind: 'APROXIMADA' }
  }

  const textQuery = rawQuery.toLowerCase().trim()
  if (
    textQuery &&
    [material.stock_code, material.description, material.center, material.warehouse, material.location]
      .some((value) => String(value ?? '').toLowerCase().includes(textQuery))
  ) {
    return { material, score: 70, kind: 'TEXTO' }
  }

  return null
}

function confidenceLabel(score: number) {
  if (score >= 95) return 'ALTA'
  if (score >= 80) return 'CONFIRMAR'
  return 'REVISAR'
}

export function MaterialsModule({ mode, userId, isAdmin }: Props) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [locationInput, setLocationInput] = useState('')
  const [actionMaterial, setActionMaterial] = useState<Material | null>(null)
  const [actionMode, setActionMode] = useState<'HISTORY' | 'WITHDRAW' | 'MOVE' | null>(null)
  const [historyRows, setHistoryRows] = useState<MaterialHistory[]>([])
  const [actionLoading, setActionLoading] = useState(false)
  const [withdrawQty, setWithdrawQty] = useState('1')
  const [withdrawReason, setWithdrawReason] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  async function reload() {
    setLoading(true)
    const { data, error } = await supabase.from('materials').select('*').order('description').limit(5000)
    if (error) setMessage(error.message)
    setMaterials((data ?? []) as Material[])
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  const matches = useMemo(() => {
    const q = search.trim()
    if (!q) return [] as SearchMatch[]
    return materials
      .map((material) => matchMaterial(material, q))
      .filter(Boolean)
      .sort((a, b) => {
        const left = a as SearchMatch
        const right = b as SearchMatch
        return right.score - left.score || left.material.material_no.localeCompare(right.material.material_no)
      })
      .slice(0, 80) as SearchMatch[]
  }, [materials, search])

  const filtered = useMemo(
    () => search.trim() ? matches.map((row) => row.material) : materials,
    [materials, matches, search]
  )

  const topSuggestions = useMemo(
    () => matches.filter((row) => row.kind !== 'TEXTO').slice(0, 5),
    [matches]
  )

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(material: Material) {
    setEditing(material)
    setForm({
      material_no: material.material_no,
      stock_code: material.stock_code || '',
      description: material.description,
      center: material.center || '',
      warehouse: material.warehouse || '',
      location: material.location || '',
      price: material.price == null ? '' : String(material.price),
      notes: material.notes || '',
      status: material.status,
    })
    setShowForm(true)
  }

  async function saveMaterial(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    const payload = {
      material_no: form.material_no.trim().toUpperCase(),
      stock_code: form.stock_code.trim() || null,
      description: form.description.trim(),
      center: form.center.trim().toUpperCase() || null,
      warehouse: form.warehouse.trim().toUpperCase() || null,
      location: form.location.trim().toUpperCase() || null,
      price: form.price ? Number(form.price) : null,
      notes: form.notes.trim() || null,
      status: form.status,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }

    if (!payload.material_no || !payload.description || !payload.center || !payload.warehouse) {
      setMessage('Material, descripción, centro y almacén son obligatorios.')
      return
    }

    if (editing) {
      const oldValues = {
        material_no: editing.material_no,
        stock_code: editing.stock_code,
        description: editing.description,
        center: editing.center,
        warehouse: editing.warehouse,
        location: editing.location,
        previous_location: editing.previous_location,
        location_changed_at: editing.location_changed_at,
        price: editing.price,
        notes: editing.notes,
        status: editing.status,
      }
      const { data, error } = await supabase.from('materials').update(payload).eq('id', editing.id).select('*').single()
      if (error || !data) {
        setMessage(error?.message || 'No se pudo actualizar el material.')
        return
      }
      await supabase.from('material_history').insert({
        material_id: editing.id,
        action: 'ACTUALIZADO',
        old_values: oldValues,
        new_values: payload,
        changed_by: userId,
      })
      setMessage('Material actualizado y cambio registrado en historial.')
    } else {
      const { data, error } = await supabase.from('materials').insert(payload).select('*').single()
      if (error || !data) {
        setMessage(error?.message || 'No se pudo crear el material.')
        return
      }
      await supabase.from('material_history').insert({
        material_id: data.id,
        action: 'CREADO',
        old_values: null,
        new_values: payload,
        changed_by: userId,
      })
      setMessage('Material creado correctamente.')
    }

    setShowForm(false)
    await reload()
  }

  function openActions(material: Material) {
    setActionMaterial(material)
    setActionMode(null)
    setActionSuccess('')
    setWithdrawQty('1')
    setWithdrawReason('')
    setNewLocation(material.location || '')
  }

  async function openHistory() {
    if (!actionMaterial) return
    setActionMode('HISTORY')
    setActionLoading(true)
    const [historyRes, outboundRes] = await Promise.all([
      supabase
        .from('material_history')
        .select('*')
        .eq('material_id', actionMaterial.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('outbound_movements')
        .select('id,material_no,quantity,destination,reference,responsible,notes,created_at,created_by')
        .eq('material_no', actionMaterial.material_no)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const history = (historyRes.data ?? []) as MaterialHistory[]
    const outboundAsHistory: MaterialHistory[] = (outboundRes.data ?? []).map((row) => ({
      id: -Number(String(row.id).replace(/\D/g, '').slice(0, 8) || Date.now()),
      material_id: actionMaterial.id,
      action: 'RETIRO',
      old_values: null,
      new_values: {
        quantity: row.quantity,
        destination: row.destination,
        reference: row.reference,
        responsible: row.responsible,
        notes: row.notes,
      },
      changed_by: row.created_by,
      created_at: row.created_at,
    }))

    setHistoryRows([...history, ...outboundAsHistory].sort((a, b) => b.created_at.localeCompare(a.created_at)))
    setActionLoading(false)
  }

  async function registerWithdrawal(event: FormEvent) {
    event.preventDefault()
    if (!actionMaterial) return
    const qty = Number(withdrawQty.replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage('Ingresa una cantidad válida para el retiro.')
      return
    }

    setActionLoading(true)
    const payload = {
      movement_date: new Date().toISOString().slice(0, 10),
      warehouse: actionMaterial.warehouse,
      material_no: actionMaterial.material_no,
      stock_code: actionMaterial.stock_code,
      description: actionMaterial.description,
      quantity: qty,
      destination: 'RETIRO MATERIAL',
      reference: 'MATERIAL',
      responsible: userId,
      notes: withdrawReason.trim() || null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('outbound_movements').insert(payload)
    if (!error) {
      await supabase.from('material_history').insert({
        material_id: actionMaterial.id,
        action: 'RETIRO',
        old_values: null,
        new_values: payload,
        changed_by: userId,
      })
    }

    setActionLoading(false)
    if (error) {
      setMessage(error.message)
      return
    }

    setActionSuccess(`Retiro registrado: ${qty.toLocaleString('es-PE')} UND`)
    setActionMode(null)
  }

  async function moveMaterial(event: FormEvent) {
    event.preventDefault()
    if (!actionMaterial) return
    const nextLocation = newLocation.trim().toUpperCase()
    if (!nextLocation) {
      setMessage('Ingresa la nueva ubicación.')
      return
    }
    if (nextLocation === (actionMaterial.location || '').toUpperCase()) {
      setMessage('La nueva ubicación debe ser diferente a la ubicación actual.')
      return
    }

    setActionLoading(true)
    const oldLocation = actionMaterial.location
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('materials')
      .update({
        previous_location: oldLocation,
        location: nextLocation,
        location_changed_at: now,
        updated_at: now,
        updated_by: userId,
      })
      .eq('id', actionMaterial.id)
      .select('*')
      .single()

    if (!error && data) {
      await supabase.from('material_history').insert({
        material_id: actionMaterial.id,
        action: 'MOVIDO',
        old_values: { location: oldLocation, warehouse: actionMaterial.warehouse },
        new_values: { location: nextLocation, warehouse: actionMaterial.warehouse },
        changed_by: userId,
      })
      setActionMaterial(data as Material)
    }

    setActionLoading(false)
    if (error) {
      setMessage(error.message)
      return
    }

    setActionSuccess(`Ubicación actualizada: ${oldLocation || 'Sin ubicación'} → ${nextLocation}`)
    setActionMode(null)
    await reload()
  }

  const locationRows = useMemo(() => {
    const parsed = parseLocationRows(locationInput)
    return parsed.map((row) => {
      const found = materials.find((m) => normalizeCode(m.material_no) === normalizeCode(row.material_no))
      return {
        material_no: row.material_no,
        quantity: row.quantity,
        stock_code: found?.stock_code || '',
        description: found?.description || '',
        center: found?.center || '',
        warehouse: found?.warehouse || '',
        location: found?.location || '',
        found: Boolean(found),
      }
    })
  }, [locationInput, materials])

  const locationExportColumns = [
    { header: 'MATERIAL', key: 'material_no', width: 18 },
    { header: 'STOCK CODE', key: 'stock_code', width: 16 },
    { header: 'DESCRIPCIÓN', key: 'description', width: 42 },
    { header: 'CANTIDAD', key: 'quantity', width: 12 },
    { header: 'CENTRO', key: 'center', width: 14 },
    { header: 'ALMACÉN', key: 'warehouse', width: 18 },
    { header: 'UBICACIÓN', key: 'location', width: 18 },
  ]

  function exportLocationExcel() {
    exportRowsToExcel(
      'KOMTROL_Hoja_Ubicacion',
      'Hoja Ubicacion',
      locationExportColumns,
      locationRows as unknown as Record<string, unknown>[],
      [['Registros', locationRows.length]]
    )
  }

  function exportLocationPdf() {
    exportRowsToPdfPortrait(
      'KOMTROL_Hoja_Ubicacion',
      'KOMTROL · Hoja de Ubicación',
      locationExportColumns,
      locationRows as unknown as Record<string, unknown>[],
      { subtitle: 'Materiales y ubicaciones obtenidos desde el Master.', summary: [['Registros', locationRows.length]] }
    )
  }

  if (mode === 'ubicacion') {
    return (
      <section className="panel location-sheet">
        <div className="panel-title">
          <div><h3>Hoja de Ubicación</h3><p>Pega Material + Cantidad desde Excel y KOMTROL completa SC, descripción y ubicación desde el Master.</p></div>
          <div className="button-row">
            <button className="secondary-button" disabled={!locationRows.length} onClick={exportLocationPdf}><FileText size={16} /> PDF</button>
            <button className="secondary-button" disabled={!locationRows.length} onClick={exportLocationExcel}><FileSpreadsheet size={16} /> Excel</button>
          </div>
        </div>
        <textarea
          className="bulk-textarea location-input"
          rows={5}
          value={locationInput}
          onChange={(e) => setLocationInput(e.target.value)}
          placeholder={'MATERIAL\tCANTIDAD\nRH018753\t2'}
        />
        <div className="table-wrap location-table">
          <table>
            <thead><tr><th>Material</th><th>SC</th><th>Descripción</th><th>Cantidad</th><th>Centro</th><th>Almacén</th><th>Ubicación</th><th>Estado</th></tr></thead>
            <tbody>
              {locationRows.map((row, index) => (
                <tr key={index} className={!row.found ? 'overdue-row' : ''}>
                  <td><b>{row.material_no}</b></td>
                  <td>{row.stock_code || '—'}</td>
                  <td>{row.description || 'No encontrado en Master'}</td>
                  <td>{row.quantity}</td>
                  <td>{row.center || '—'}</td>
                  <td>{row.warehouse || '—'}</td>
                  <td><b>{row.location || '—'}</b></td>
                  <td><span className={row.found ? 'status-pill' : 'status-pill danger'}>{row.found ? 'ENCONTRADO' : 'REVISAR'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!locationRows.length && <div className="empty-work"><MapPin size={30} /><b>Sin materiales</b><p>Pega una lista para generar la hoja automáticamente.</p></div>}
        </div>
      </section>
    )
  }

  return (
    <section className="panel materials-panel">
      <div className="panel-title">
        <div>
          <h3>{mode === 'master' ? 'Maestro de Materiales' : 'Materiales'}</h3>
          <p>{mode === 'master' ? 'Administración central por Centro, Almacén y Ubicación, con trazabilidad del último cambio.' : 'Consulta inteligente por número de parte, SC, descripción, centro, almacén o ubicación.'}</p>
        </div>
        <div className="button-row">
          <button className="icon-button" onClick={reload}><RefreshCw size={18} /></button>
          {mode === 'master' && isAdmin && <button className="primary-button" onClick={openNew}><Plus size={17} /> Nuevo material</button>}
        </div>
      </div>

      <div className="material-smart-search">
        <label>
          N° parte / material
          <div className="material-search-input">
            <Search size={20} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Escanea o escribe el material"
              autoComplete="off"
            />
            {search && <button type="button" className="material-search-clear" onClick={() => setSearch('')}><X size={16} /></button>}
          </div>
        </label>
        <div className="material-search-rule">
          <span>Exacta</span>
          <span>Sin prefijo</span>
          <span>Prefijo probable</span>
          <span>Aproximada</span>
        </div>
      </div>

      {search.trim() && (
        <div className="material-match-summary">
          <div>
            <b>{matches.length ? `${matches.length} coincidencia(s)` : 'Sin coincidencias confiables'}</b>
            <span>KOMTROL compara código completo, código base sin prefijo y similitud aproximada.</span>
          </div>
          {topSuggestions[0]?.score >= 95 && <span className="status-pill"><CheckCircle2 size={14} /> Mejor coincidencia {topSuggestions[0].score}%</span>}
        </div>
      )}

      {topSuggestions.length > 0 && (
        <div className="material-suggestions">
          {topSuggestions.map((match, index) => (
            <article className={index === 0 && match.score >= 95 ? 'material-suggestion recommended' : 'material-suggestion'} key={match.material.id}>
              <div className="material-suggestion-main">
                <div className="material-suggestion-title">
                  <b>{match.material.material_no}</b>
                  {index === 0 && match.score >= 95 && <span>RECOMENDADO</span>}
                </div>
                <p>{match.material.description}</p>
                <small>SC {match.material.stock_code || '—'} · {match.material.warehouse || '—'} · Ubicación {match.material.location || '—'}</small>
              </div>
              <div className="material-confidence">
                <b>{match.score}%</b>
                <span className={match.score >= 95 ? 'high' : match.score >= 80 ? 'medium' : 'low'}>{confidenceLabel(match.score)}</span>
                <small>{match.kind.replace('_', ' ')}</small>
              </div>
              <button className="secondary-button material-suggestion-action" onClick={() => openActions(match.material)}>Seleccionar</button>
            </article>
          ))}
        </div>
      )}

      <div className="task-toolbar material-toolbar">
        <span className="view-hint"><Boxes size={16} /> {filtered.length} materiales</span>
      </div>

      {message && <div className="inline-message">{message}</div>}

      {loading ? (
        <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando materiales…</p></div>
      ) : (
        <>
          <div className="table-wrap materials-responsive-table materials-desktop-list">
            <table>
              <thead><tr><th>Material</th><th>Stock Code</th><th>Descripción</th><th>Centro</th><th>Almacén</th><th>Ubicación</th><th>Ubicación anterior</th><th>Último cambio</th><th>Precio</th><th>Estado</th><th>Acciones</th>{mode === 'master' && isAdmin && <th>Editar</th>}</tr></thead>
              <tbody>
                {filtered.slice(0, 250).map((material) => (
                  <tr key={material.id}>
                    <td><b>{material.material_no}</b></td>
                    <td>{material.stock_code || '—'}</td>
                    <td>{material.description}</td>
                    <td>{material.center || '—'}</td>
                    <td>{material.warehouse || '—'}</td>
                    <td><b>{material.location || '—'}</b></td>
                    <td>{material.previous_location || '—'}</td>
                    <td><span className="material-change-date"><Clock3 size={13} /> {formatDateTime(material.location_changed_at)}</span></td>
                    <td>{material.price == null ? '—' : Number(material.price).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' })}</td>
                    <td><span className={material.status === 'ACTIVO' ? 'status-pill' : material.status === 'OBSERVADO' ? 'status-pill warning' : 'status-pill danger'}>{material.status}</span></td>
                    <td><button className="icon-button material-more-button" onClick={() => openActions(material)} title="Acciones"><MoreHorizontal size={17} /></button></td>
                    {mode === 'master' && isAdmin && <td><button className="icon-button small-icon" onClick={() => openEdit(material)}><Edit3 size={15} /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <div className="empty-work"><Boxes size={30} /><b>Sin materiales</b><p>No hay registros que coincidan con la búsqueda.</p></div>}
            {filtered.length > 250 && <div className="table-note">Mostrando 250 de {filtered.length}. Refina la búsqueda para reducir resultados.</div>}
          </div>

          <div className="materials-mobile-list">
            {filtered.slice(0, 250).map((material) => (
              <article className="material-mobile-card" key={material.id}>
                <div className="material-mobile-card-head">
                  <div>
                    <small>MATERIAL</small>
                    <b>{material.material_no}</b>
                  </div>
                  <span className={material.status === 'ACTIVO' ? 'status-pill' : material.status === 'OBSERVADO' ? 'status-pill warning' : 'status-pill danger'}>{material.status}</span>
                </div>

                <p className="material-mobile-description">{material.description || 'Sin descripción'}</p>

                <div className="material-mobile-data">
                  <div><span>Stock Code</span><b>{material.stock_code || '—'}</b></div>
                  <div><span>Centro</span><b>{material.center || '—'}</b></div>
                  <div><span>Almacén</span><b>{material.warehouse || '—'}</b></div>
                  <div><span>Ubicación</span><b>{material.location || '—'}</b></div>
                  <div><span>Ubicación anterior</span><b>{material.previous_location || '—'}</b></div>
                  <div><span>Precio</span><b>{material.price == null ? '—' : Number(material.price).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' })}</b></div>
                </div>

                <div className="material-mobile-change">
                  <Clock3 size={14} />
                  <span>{formatDateTime(material.location_changed_at)}</span>
                </div>

                <div className="material-mobile-actions">
                  <button className="secondary-button" onClick={() => openActions(material)}>
                    <MoreHorizontal size={17} /> Acciones
                  </button>
                  {mode === 'master' && isAdmin && (
                    <button className="secondary-button" onClick={() => openEdit(material)}>
                      <Edit3 size={16} /> Editar
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!filtered.length && <div className="empty-work"><Boxes size={30} /><b>Sin materiales</b><p>No hay registros que coincidan con la búsqueda.</p></div>}
            {filtered.length > 250 && <div className="table-note">Mostrando 250 de {filtered.length}. Refina la búsqueda para reducir resultados.</div>}
          </div>
        </>
      )}

      {actionMaterial && (
        <div className="material-action-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setActionMaterial(null)}>
          <aside className="material-action-sheet">
            <div className="material-action-head">
              <div><small>MATERIAL</small><h3>{actionMaterial.material_no}</h3><p>{actionMaterial.description}</p></div>
              <button className="icon-button" onClick={() => setActionMaterial(null)}><X size={18} /></button>
            </div>

            {actionSuccess && <div className="material-action-success"><CheckCircle2 size={18} /><span>{actionSuccess}</span></div>}

            {!actionMode && (
              <div className="material-action-grid">
                <button onClick={openHistory}>
                  <History size={21} />
                  <span><b>Historial</b><small>Ver cambios y movimientos</small></span>
                </button>
                <button onClick={() => { setActionMode('WITHDRAW'); setActionSuccess('') }}>
                  <MinusCircle size={21} />
                  <span><b>Retiro</b><small>Registrar salida de material</small></span>
                </button>
                <button onClick={() => { setActionMode('MOVE'); setActionSuccess(''); setNewLocation(actionMaterial.location || '') }}>
                  <MoveHorizontal size={21} />
                  <span><b>Mover</b><small>Cambiar ubicación</small></span>
                </button>
              </div>
            )}

            {actionMode === 'HISTORY' && (
              <div className="material-action-content">
                <div className="material-action-subhead"><button className="text-button" onClick={() => setActionMode(null)}>← Volver</button><b>Historial</b></div>
                {actionLoading ? <div className="screen-center compact"><RefreshCw className="spin" size={20} /></div> : (
                  <div className="material-history-timeline">
                    {historyRows.map((row) => (
                      <article key={row.id}>
                        <i />
                        <div>
                          <b>{row.action}</b>
                          <span>{formatDateTime(row.created_at)}</span>
                          {row.action === 'MOVIDO' && <p>{String(row.old_values?.location ?? 'Sin ubicación')} → {String(row.new_values?.location ?? 'Sin ubicación')}</p>}
                          {row.action === 'RETIRO' && <p>{String(row.new_values?.quantity ?? '—')} UND · {String(row.new_values?.notes ?? 'Sin observación')}</p>}
                          {row.action === 'ACTUALIZADO' && <p>Datos del material actualizados.</p>}
                          {row.action === 'CREADO' && <p>Material incorporado al Master.</p>}
                          <small>Usuario: {row.changed_by}</small>
                        </div>
                      </article>
                    ))}
                    {!historyRows.length && <div className="empty-work compact"><History size={25} /><b>Sin historial</b></div>}
                  </div>
                )}
              </div>
            )}

            {actionMode === 'WITHDRAW' && (
              <form className="material-action-content" onSubmit={registerWithdrawal}>
                <div className="material-action-subhead"><button type="button" className="text-button" onClick={() => setActionMode(null)}>← Volver</button><b>Registrar retiro</b></div>
                <div className="material-context-card"><span>Ubicación actual</span><b>{actionMaterial.location || 'Sin ubicación'}</b><small>{actionMaterial.warehouse || 'Sin almacén'}</small></div>
                <label>Cantidad
                  <input type="number" min="0.001" step="0.001" required value={withdrawQty} onChange={(e) => setWithdrawQty(e.target.value)} />
                </label>
                <label>Motivo / observación
                  <textarea rows={3} value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} placeholder="Ej. Retiro para mantenimiento TD28" />
                </label>
                <button className="primary-button full" disabled={actionLoading}>{actionLoading ? <RefreshCw className="spin" size={17} /> : <MinusCircle size={17} />}{actionLoading ? 'Registrando…' : 'Registrar retiro'}</button>
              </form>
            )}

            {actionMode === 'MOVE' && (
              <form className="material-action-content" onSubmit={moveMaterial}>
                <div className="material-action-subhead"><button type="button" className="text-button" onClick={() => setActionMode(null)}>← Volver</button><b>Mover material</b></div>
                <div className="material-move-route">
                  <div><small>ACTUAL</small><b>{actionMaterial.location || 'Sin ubicación'}</b></div>
                  <MoveHorizontal size={20} />
                  <div><small>NUEVA</small><b>{newLocation.trim().toUpperCase() || '—'}</b></div>
                </div>
                <label>Nueva ubicación
                  <input required value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Ej. PHPB001A" />
                </label>
                <button className="primary-button full" disabled={actionLoading}>{actionLoading ? <RefreshCw className="spin" size={17} /> : <MoveHorizontal size={17} />}{actionLoading ? 'Moviendo…' : 'Mover material'}</button>
              </form>
            )}
          </aside>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <form className="modal" onSubmit={saveMaterial}>
            <div className="modal-head">
              <div><h2>{editing ? 'Editar material' : 'Nuevo material'}</h2><p>Al cambiar la ubicación, KOMTROL conserva la ubicación anterior y registra automáticamente la fecha del cambio.</p></div>
              <button type="button" className="icon-button" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>
            <div className="form-grid">
              <label>Material
                <input required value={form.material_no} onChange={(e) => setForm({ ...form, material_no: e.target.value })} />
              </label>
              <label>Stock Code
                <input value={form.stock_code} onChange={(e) => setForm({ ...form, stock_code: e.target.value })} />
              </label>
              <label className="span-2">Descripción
                <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <label>Centro
                <input required value={form.center} onChange={(e) => setForm({ ...form, center: e.target.value })} placeholder="Ej. C029" />
              </label>
              <label>Almacén
                <input required value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} placeholder="Ej. ANTAMINA" />
              </label>
              <label>Ubicación
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ej. PALA-01-B03" />
              </label>
              <label>Ubicación anterior
                <input disabled value={editing?.previous_location || 'Sin cambio registrado'} />
              </label>
              {editing && editing.location !== (form.location.trim().toUpperCase() || null) && (
                <div className="location-change-preview span-2">
                  <MapPin size={16} />
                  <div>
                    <b>Cambio de ubicación detectado</b>
                    <span>{editing.location || 'Sin ubicación'} → {form.location.trim().toUpperCase() || 'Sin ubicación'}</span>
                  </div>
                </div>
              )}
              <label>Precio
                <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </label>
              <label>Estado
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Material['status'] })}>
                  <option value="ACTIVO">Activo</option>
                  <option value="OBSERVADO">Observado</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </label>
              <label className="span-2">Observación
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="primary-button">{editing ? 'Guardar cambios' : 'Crear material'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
