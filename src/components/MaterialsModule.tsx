import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Boxes, Clock3, Download, Edit3, MapPin, Plus, Printer, RefreshCw, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

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

export function MaterialsModule({ mode, userId, isAdmin }: Props) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [locationInput, setLocationInput] = useState('')

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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return materials
    return materials.filter((m) => [m.material_no, m.stock_code, m.description, m.center, m.warehouse, m.location, m.previous_location, m.status]
      .some((v) => String(v ?? '').toLowerCase().includes(q)))
  }, [materials, search])

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

  const locationRows = useMemo(() => {
    const parsed = parseLocationRows(locationInput)
    return parsed.map((row) => {
      const found = materials.find((m) => m.material_no.toUpperCase() === row.material_no.toUpperCase())
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

  function exportLocation() {
    downloadCsv('KOMTROL_Hoja_Ubicacion.csv', [
      ['MATERIAL', 'STOCK CODE', 'DESCRIPCION', 'CANTIDAD', 'CENTRO', 'ALMACEN', 'UBICACION'],
      ...locationRows.map((r) => [r.material_no, r.stock_code, r.description, r.quantity, r.center, r.warehouse, r.location]),
    ])
  }

  if (mode === 'ubicacion') {
    return (
      <section className="panel location-sheet">
        <div className="panel-title">
          <div><h3>Hoja de Ubicación</h3><p>Pega Material + Cantidad desde Excel y KOMTROL completa SC, descripción y ubicación desde el Master.</p></div>
          <div className="button-row">
            <button className="secondary-button" disabled={!locationRows.length} onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
            <button className="secondary-button" disabled={!locationRows.length} onClick={exportLocation}><Download size={16} /> Excel/CSV</button>
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
          <p>{mode === 'master' ? 'Administración central por Centro, Almacén y Ubicación, con trazabilidad del último cambio.' : 'Consulta rápida por número de parte, SC, descripción, centro, almacén o ubicación.'}</p>
        </div>
        <div className="button-row">
          <button className="icon-button" onClick={reload}><RefreshCw size={18} /></button>
          {mode === 'master' && isAdmin && <button className="primary-button" onClick={openNew}><Plus size={17} /> Nuevo material</button>}
        </div>
      </div>

      <div className="task-toolbar">
        <div className="search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar material, SC, descripción, centro, almacén, ubicación…" /></div>
        <span className="view-hint"><Boxes size={16} /> {filtered.length} materiales</span>
      </div>
      {message && <div className="inline-message">{message}</div>}
      {loading ? (
        <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando materiales…</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Material</th><th>Stock Code</th><th>Descripción</th><th>Centro</th><th>Almacén</th><th>Ubicación</th><th>Ubicación anterior</th><th>Último cambio</th><th>Precio</th><th>Estado</th>{mode === 'master' && isAdmin && <th></th>}</tr></thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td><b>{m.material_no}</b></td>
                  <td>{m.stock_code || '—'}</td>
                  <td>{m.description}</td>
                  <td>{m.center || '—'}</td>
                  <td>{m.warehouse || '—'}</td>
                  <td><b>{m.location || '—'}</b></td>
                  <td>{m.previous_location || '—'}</td>
                  <td><span className="material-change-date"><Clock3 size={13} /> {formatDateTime(m.location_changed_at)}</span></td>
                  <td>{m.price == null ? '—' : Number(m.price).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' })}</td>
                  <td><span className={m.status === 'ACTIVO' ? 'status-pill' : m.status === 'OBSERVADO' ? 'status-pill warning' : 'status-pill danger'}>{m.status}</span></td>
                  {mode === 'master' && isAdmin && <td><button className="icon-button small-icon" onClick={() => openEdit(m)}><Edit3 size={15} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <div className="empty-work"><Boxes size={30} /><b>Sin materiales</b><p>No hay registros que coincidan con la búsqueda.</p></div>}
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
