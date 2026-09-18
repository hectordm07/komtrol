import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  Download,
  Edit3,
  Mail,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
type Mode = 'dashboard' | 'incidents' | 'boxes'

type Profile = {
  user_id: string
  full_name: string
  role: Role
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
  shift_name?: string | null
}

type Incident = {
  id: string
  incident_no: string
  incident_type: 'FALTANTE' | 'SOBRANTE' | 'DANADO' | 'DIFERENCIA' | 'SIN_DOCUMENTACION' | 'OTRO'
  status: 'ABIERTO' | 'EN_REVISION' | 'NOTIFICADO' | 'CERRADO'
  guide_no: string | null
  document_no: string | null
  purchase_order: string | null
  material_no: string | null
  description: string | null
  qty_expected: number | null
  qty_received: number | null
  notes: string | null
  warehouse: string | null
  project: string | null
  group_name: string | null
  shift_name: string | null
  operation_area: string
  assigned_to: string | null
  created_by: string
  created_at: string
  updated_at: string
}

type BoxItem = {
  id: string
  box_id: string
  incident_id: string | null
  material_no: string | null
  stock_code: string | null
  description: string | null
  quantity: number
  unit: string
  location: string | null
  notes: string | null
}

type InboundBox = {
  id: string
  box_no: string
  warehouse: string
  title: string | null
  status: 'ABIERTA' | 'CERRADA' | 'DESPACHADA' | 'ANULADA'
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  inbound_box_items?: BoxItem[]
}

type Props = {
  mode: Mode
  userId: string
  profile: Profile | null
}

const WAREHOUSE = 'CALLAO'
const PROJECT = 'INBOUND CALLAO'
const GROUP = 'INBOUND'

const emptyIncident = {
  incident_type: 'SOBRANTE' as Incident['incident_type'],
  guide_no: '',
  document_no: '',
  purchase_order: '',
  material_no: '',
  description: '',
  qty_expected: '',
  qty_received: '',
  notes: '',
  assigned_to: '',
}

function incidentNumber() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `INB-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2,5).toUpperCase()}`
}

function boxNumber() {
  const d = new Date()
  const ymd = d.toISOString().slice(0,10).replaceAll('-','')
  const hms = d.toTimeString().slice(0,8).replaceAll(':','')
  return `CX-CALLAO-${ymd}-${hms}`
}

function fmt(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",;\n]/.test(text) ? '"' + text.replaceAll('"','""') + '"' : text
}

function downloadCsv(name: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function InboundModule({ mode, userId, profile }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [boxes, setBoxes] = useState<InboundBox[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null)
  const [incidentForm, setIncidentForm] = useState(emptyIncident)
  const [selectedSurplus, setSelectedSurplus] = useState<string[]>([])
  const [selectedBox, setSelectedBox] = useState<InboundBox | null>(null)
  const [boxDraft, setBoxDraft] = useState<InboundBox | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const readOnly = profile?.role === 'SUPERVISOR'

  async function reload() {
    setLoading(true)
    setMessage('')
    const [incidentRes, boxRes, profileRes] = await Promise.all([
      supabase
        .from('incidents')
        .select('*')
        .eq('warehouse', WAREHOUSE)
        .eq('operation_area', 'INBOUND')
        .order('created_at', { ascending:false })
        .limit(2000),
      supabase
        .from('inbound_boxes')
        .select('*, inbound_box_items(*)')
        .eq('warehouse', WAREHOUSE)
        .order('created_at', { ascending:false })
        .limit(1000),
      supabase
        .from('user_profiles')
        .select('user_id,full_name,role,warehouse,project,group_name,shift_name')
        .eq('active', true)
        .eq('warehouse', WAREHOUSE)
        .order('full_name'),
    ])
    if (incidentRes.error || boxRes.error || profileRes.error) {
      setMessage(incidentRes.error?.message || boxRes.error?.message || profileRes.error?.message || 'No se pudo cargar Inbound.')
    }
    setIncidents((incidentRes.data ?? []) as Incident[])
    setBoxes((boxRes.data ?? []) as InboundBox[])
    setProfiles((profileRes.data ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => { reload() }, [userId])

  const visibleIncidents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return incidents
    return incidents.filter((row) =>
      [row.incident_no,row.incident_type,row.guide_no,row.purchase_order,row.material_no,row.description,row.status]
        .some((value) => String(value ?? '').toLowerCase().includes(q))
    )
  }, [incidents, search])

  const counts = useMemo(() => ({
    total: incidents.length,
    open: incidents.filter((x) => x.status !== 'CERRADO').length,
    surplus: incidents.filter((x) => x.incident_type === 'SOBRANTE' && x.status !== 'CERRADO').length,
    notified: incidents.filter((x) => x.status === 'NOTIFICADO').length,
    boxes: boxes.length,
  }), [incidents, boxes])

  const profileName = (id?: string | null) =>
    profiles.find((x) => x.user_id === id)?.full_name ?? (id ? 'Usuario' : 'Sin asignar')

  function openNewIncident() {
    setEditingIncident(null)
    setIncidentForm(emptyIncident)
    setShowIncidentForm(true)
  }

  function openEditIncident(row: Incident) {
    setEditingIncident(row)
    setIncidentForm({
      incident_type: row.incident_type,
      guide_no: row.guide_no || '',
      document_no: row.document_no || '',
      purchase_order: row.purchase_order || '',
      material_no: row.material_no || '',
      description: row.description || '',
      qty_expected: row.qty_expected == null ? '' : String(row.qty_expected),
      qty_received: row.qty_received == null ? '' : String(row.qty_received),
      notes: row.notes || '',
      assigned_to: row.assigned_to || '',
    })
    setShowIncidentForm(true)
  }

  async function saveIncident(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = {
      incident_type: incidentForm.incident_type,
      guide_no: incidentForm.guide_no.trim() || null,
      document_no: incidentForm.document_no.trim() || null,
      purchase_order: incidentForm.purchase_order.trim() || null,
      material_no: incidentForm.material_no.trim() || null,
      description: incidentForm.description.trim() || null,
      qty_expected: incidentForm.qty_expected ? Number(incidentForm.qty_expected) : null,
      qty_received: incidentForm.qty_received ? Number(incidentForm.qty_received) : null,
      notes: incidentForm.notes.trim() || null,
      assigned_to: incidentForm.assigned_to || null,
      warehouse: WAREHOUSE,
      project: PROJECT,
      group_name: GROUP,
      shift_name: profile?.shift_name || null,
      operation_area: 'INBOUND',
      updated_at: new Date().toISOString(),
    }

    if (editingIncident) {
      const { error } = await supabase.from('incidents').update(payload).eq('id', editingIncident.id)
      if (error) {
        setSaving(false)
        setMessage(error.message)
        return
      }
      setMessage('Incidencia actualizada.')
    } else {
      const { error } = await supabase.from('incidents').insert({
        ...payload,
        incident_no: incidentNumber(),
        status: 'ABIERTO',
        created_by: userId,
      })
      if (error) {
        setSaving(false)
        setMessage(error.message)
        return
      }
      setMessage('Incidencia Inbound registrada.')
    }

    setSaving(false)
    setShowIncidentForm(false)
    setEditingIncident(null)
    setIncidentForm(emptyIncident)
    await reload()
  }

  async function updateIncidentStatus(row: Incident, status: Incident['status']) {
    const { error } = await supabase
      .from('incidents')
      .update({ status, updated_at:new Date().toISOString() })
      .eq('id', row.id)
    if (error) setMessage(error.message)
    else await reload()
  }

  async function deleteIncident(row: Incident) {
    if (!window.confirm(`¿Eliminar ${row.incident_no}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('incidents').delete().eq('id', row.id)
    if (error) setMessage(error.message)
    else {
      setSelectedSurplus((ids) => ids.filter((id) => id !== row.id))
      setMessage('Incidencia eliminada.')
      await reload()
    }
  }

  async function sendEmail(row: Incident) {
    setSendingId(row.id)
    const { data, error } = await supabase.functions.invoke('send-outlook-notification', {
      body:{ incidentId:row.id },
    })
    setSendingId(null)
    if (error || !data?.ok) {
      setMessage(data?.error || error?.message || 'No se pudo enviar el correo. Revisa la configuración Outlook.')
    } else {
      setMessage('Correo enviado y trazabilidad registrada.')
    }
    await reload()
  }

  function exportIncidents() {
    downloadCsv('KOMTROL_Inbound_Callao_Incidencias.csv', [
      ['INCIDENCIA','TIPO','ESTADO','GUIA','OC','MATERIAL','DESCRIPCION','ESPERADO','RECIBIDO','RESPONSABLE','FECHA'],
      ...visibleIncidents.map((x) => [
        x.incident_no,x.incident_type,x.status,x.guide_no,x.purchase_order,x.material_no,x.description,
        x.qty_expected,x.qty_received,profileName(x.assigned_to),x.created_at
      ]),
    ])
  }

  function toggleSurplus(id: string) {
    setSelectedSurplus((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev,id])
  }

  async function createBoxFromSurplus() {
    const selected = incidents.filter((x) => selectedSurplus.includes(x.id) && x.incident_type === 'SOBRANTE')
    if (!selected.length) {
      setMessage('Selecciona al menos un sobrante para generar una caja.')
      return
    }

    setSaving(true)
    const { data: box, error } = await supabase
      .from('inbound_boxes')
      .insert({
        box_no: boxNumber(),
        warehouse: WAREHOUSE,
        title: `Sobrantes Inbound · ${new Date().toLocaleDateString('es-PE')}`,
        status: 'ABIERTA',
        created_by: userId,
      })
      .select('*')
      .single()

    if (error || !box) {
      setSaving(false)
      setMessage(error?.message || 'No se pudo crear la caja.')
      return
    }

    const items = selected.map((incident) => {
      const expected = Number(incident.qty_expected || 0)
      const received = Number(incident.qty_received || 0)
      const difference = Math.max(received - expected, 0)
      return {
        box_id: box.id,
        incident_id: incident.id,
        material_no: incident.material_no,
        description: incident.description,
        quantity: difference || received || 1,
        unit: 'UND',
        notes: incident.notes,
      }
    })

    const { error: itemError } = await supabase.from('inbound_box_items').insert(items)
    setSaving(false)
    if (itemError) {
      setMessage(itemError.message)
      return
    }
    setSelectedSurplus([])
    setMessage(`${box.box_no} creada con ${items.length} sobrante(s).`)
    await reload()
  }

  function openBox(box: InboundBox) {
    const clone = JSON.parse(JSON.stringify(box)) as InboundBox
    setSelectedBox(box)
    setBoxDraft(clone)
  }

  async function saveBox() {
    if (!boxDraft) return
    setSaving(true)
    const { error } = await supabase
      .from('inbound_boxes')
      .update({
        title: boxDraft.title,
        status: boxDraft.status,
        notes: boxDraft.notes,
        updated_at:new Date().toISOString(),
      })
      .eq('id', boxDraft.id)

    if (!error) {
      for (const item of boxDraft.inbound_box_items ?? []) {
        const { error:itemError } = await supabase
          .from('inbound_box_items')
          .update({
            stock_code:item.stock_code,
            quantity:Number(item.quantity || 0),
            unit:item.unit,
            location:item.location,
            notes:item.notes,
          })
          .eq('id', item.id)
        if (itemError) {
          setMessage(itemError.message)
          setSaving(false)
          return
        }
      }
    }

    setSaving(false)
    if (error) setMessage(error.message)
    else {
      setMessage('Caja actualizada.')
      setSelectedBox(null)
      setBoxDraft(null)
      await reload()
    }
  }

  async function deleteBox(box: InboundBox) {
    if (!window.confirm(`¿Eliminar la caja ${box.box_no} y todo su detalle?`)) return
    const { error } = await supabase.from('inbound_boxes').delete().eq('id', box.id)
    if (error) setMessage(error.message)
    else {
      setMessage('Caja eliminada.')
      await reload()
    }
  }

  async function deleteBoxItem(itemId: string) {
    const { error } = await supabase.from('inbound_box_items').delete().eq('id', itemId)
    if (error) {
      setMessage(error.message)
      return
    }
    setBoxDraft((prev) => prev ? {
      ...prev,
      inbound_box_items:(prev.inbound_box_items ?? []).filter((x) => x.id !== itemId),
    } : prev)
  }

  function exportBox(box: InboundBox) {
    downloadCsv(`${box.box_no}.csv`, [
      ['CAJA','ESTADO','MATERIAL','STOCK CODE','DESCRIPCION','CANTIDAD','UM','UBICACION','OBSERVACION'],
      ...(box.inbound_box_items ?? []).map((item) => [
        box.box_no,box.status,item.material_no,item.stock_code,item.description,item.quantity,item.unit,item.location,item.notes,
      ]),
    ])
  }

  if (loading) {
    return <section className="panel"><div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando Inbound Callao…</p></div></section>
  }

  if (mode === 'dashboard') {
    return (
      <div className="inbound-module">
        <section className="panel inbound-hero">
          <div><span className="status-pill">CALLAO · INBOUND</span><h3>Dashboard de Incidencias Inbound</h3><p>Seguimiento de incidencias, sobrantes, notificaciones y cajas operativas.</p></div>
          <span className="status-pill"><CheckCircle2 size={14}/> Registro desde Incidencias</span>
        </section>
        {message && <div className="inline-message">{message}</div>}
        <div className="inbound-kpis">
          <div><BarChart3/><span><b>{counts.total}</b><small>Total incidencias</small></span></div>
          <div><AlertTriangle/><span><b>{counts.open}</b><small>Pendientes</small></span></div>
          <div><PackagePlus/><span><b>{counts.surplus}</b><small>Sobrantes</small></span></div>
          <div><Mail/><span><b>{counts.notified}</b><small>Notificadas</small></span></div>
          <div><Boxes/><span><b>{counts.boxes}</b><small>Cajas</small></span></div>
        </div>
        <section className="panel">
          <div className="panel-title"><div><h3>Actividad reciente</h3><p>Últimas incidencias de Callao Inbound.</p></div></div>
          <IncidentRows rows={incidents.slice(0,8)} profileName={profileName} sendingId={sendingId} onEdit={openEditIncident} onDelete={deleteIncident} onSend={sendEmail} onStatus={updateIncidentStatus} selectedSurplus={selectedSurplus} onToggle={toggleSurplus} readOnly={true}/>
        </section>
        {showIncidentForm && <IncidentModal form={incidentForm} setForm={setIncidentForm} profiles={profiles} editing={editingIncident} saving={saving} onClose={() => setShowIncidentForm(false)} onSubmit={saveIncident}/>}
      </div>
    )
  }

  if (mode === 'incidents') {
    return (
      <div className="inbound-module">
        <section className="panel">
          <div className="panel-title">
            <div><h3>Incidencias Inbound · Callao</h3><p>Crear, modificar, eliminar, actualizar, notificar y exportar.</p></div>
            <div className="button-row"><button className="secondary-button" onClick={exportIncidents}><Download size={15}/> Exportar</button>{!readOnly && <button className="primary-button" onClick={openNewIncident}><Plus size={15}/> Registrar</button>}</div>
          </div>
          <div className="task-toolbar"><div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar incidencia, guía, OC o material…"/></div></div>
          {message && <div className="inline-message">{message}</div>}
          <IncidentRows rows={visibleIncidents} profileName={profileName} sendingId={sendingId} onEdit={openEditIncident} onDelete={deleteIncident} onSend={sendEmail} onStatus={updateIncidentStatus} selectedSurplus={selectedSurplus} onToggle={toggleSurplus} readOnly={readOnly}/>
          {!readOnly && selectedSurplus.length > 0 && <div className="floating-selection"><b>{selectedSurplus.length} sobrante(s) seleccionado(s)</b><button className="primary-button" disabled={saving} onClick={createBoxFromSurplus}><Boxes size={16}/> Generar caja</button></div>}
        </section>
        {showIncidentForm && <IncidentModal form={incidentForm} setForm={setIncidentForm} profiles={profiles} editing={editingIncident} saving={saving} onClose={() => setShowIncidentForm(false)} onSubmit={saveIncident}/>}
      </div>
    )
  }

  return (
    <div className="inbound-module">
      <section className="panel">
        <div className="panel-title">
          <div><h3>Cajas de Sobrantes · Callao</h3><p>Consolida sobrantes en cajas, actualiza detalle y exporta.</p></div>
          <button className="icon-button" onClick={reload}><RefreshCw size={17}/></button>
        </div>
        {message && <div className="inline-message">{message}</div>}
        <div className="table-wrap">
          <table><thead><tr><th>Caja</th><th>Título</th><th>Estado</th><th>Ítems</th><th>Creación</th><th>Acciones</th></tr></thead>
          <tbody>{boxes.map((box) => <tr key={box.id}><td><b>{box.box_no}</b></td><td>{box.title || '—'}</td><td><span className="status-pill">{box.status}</span></td><td>{box.inbound_box_items?.length ?? 0}</td><td>{fmt(box.created_at)}</td><td><div className="row-actions"><button className="secondary-button" onClick={()=>openBox(box)}><Edit3 size={14}/> {readOnly ? 'Ver detalle' : 'Ver / Editar'}</button><button className="secondary-button" onClick={()=>exportBox(box)}><Download size={14}/></button>{!readOnly && <button className="icon-button danger-icon" onClick={()=>deleteBox(box)}><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table>
          {!boxes.length && <div className="empty-work"><Boxes size={28}/><b>Sin cajas</b><p>Selecciona incidencias tipo SOBRANTE para generar la primera caja.</p></div>}
        </div>
      </section>

      {selectedBox && boxDraft && (
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setSelectedBox(null)}>
          <section className="modal inbound-box-modal">
            <div className="modal-head"><div><h2>{boxDraft.box_no}</h2><p>Detalle editable de sobrantes.</p></div><button className="icon-button" onClick={()=>setSelectedBox(null)}><X size={19}/></button></div>
            <div className="form-grid">
              <label>Título<input disabled={readOnly} value={boxDraft.title || ''} onChange={(e)=>setBoxDraft({...boxDraft,title:e.target.value})}/></label>
              <label>Estado<select disabled={readOnly} value={boxDraft.status} onChange={(e)=>setBoxDraft({...boxDraft,status:e.target.value as InboundBox['status']})}><option>ABIERTA</option><option>CERRADA</option><option>DESPACHADA</option><option>ANULADA</option></select></label>
              <label className="span-2">Observación<textarea disabled={readOnly} rows={2} value={boxDraft.notes || ''} onChange={(e)=>setBoxDraft({...boxDraft,notes:e.target.value})}/></label>
            </div>
            <div className="table-wrap box-item-editor"><table><thead><tr><th>Material</th><th>Descripción</th><th>Cantidad</th><th>UM</th><th>Stock Code</th><th>Ubicación</th><th></th></tr></thead><tbody>
              {(boxDraft.inbound_box_items ?? []).map((item,index)=><tr key={item.id}>
                <td><b>{item.material_no || '—'}</b></td><td>{item.description || '—'}</td>
                <td><input disabled={readOnly} type="number" step="any" value={item.quantity} onChange={(e)=>setBoxDraft({...boxDraft,inbound_box_items:(boxDraft.inbound_box_items??[]).map((x,i)=>i===index?{...x,quantity:Number(e.target.value)}:x)})}/></td>
                <td><input disabled={readOnly} value={item.unit} onChange={(e)=>setBoxDraft({...boxDraft,inbound_box_items:(boxDraft.inbound_box_items??[]).map((x,i)=>i===index?{...x,unit:e.target.value}:x)})}/></td>
                <td><input disabled={readOnly} value={item.stock_code || ''} onChange={(e)=>setBoxDraft({...boxDraft,inbound_box_items:(boxDraft.inbound_box_items??[]).map((x,i)=>i===index?{...x,stock_code:e.target.value}:x)})}/></td>
                <td><input disabled={readOnly} value={item.location || ''} onChange={(e)=>setBoxDraft({...boxDraft,inbound_box_items:(boxDraft.inbound_box_items??[]).map((x,i)=>i===index?{...x,location:e.target.value}:x)})}/></td>
                <td>{!readOnly && <button className="icon-button danger-icon" onClick={()=>deleteBoxItem(item.id)}><Trash2 size={14}/></button>}</td>
              </tr>)}
            </tbody></table></div>
            <div className="modal-actions"><button className="secondary-button" onClick={()=>exportBox(boxDraft)}><Download size={15}/> Exportar</button>{!readOnly && <button className="primary-button" disabled={saving} onClick={saveBox}>{saving?<RefreshCw className="spin" size={15}/>:<Save size={15}/>} Guardar cambios</button>}</div>
          </section>
        </div>
      )}
    </div>
  )
}

function IncidentRows({ rows, profileName, sendingId, onEdit, onDelete, onSend, onStatus, selectedSurplus, onToggle, readOnly }: {
  rows: Incident[]
  profileName:(id?:string|null)=>string
  sendingId:string|null
  onEdit:(row:Incident)=>void
  onDelete:(row:Incident)=>void
  onSend:(row:Incident)=>void
  onStatus:(row:Incident,status:Incident['status'])=>void
  selectedSurplus:string[]
  onToggle:(id:string)=>void
  readOnly:boolean
}) {
  if (!rows.length) return <div className="empty-work"><AlertTriangle size={27}/><b>Sin incidencias</b></div>
  return <div className="table-wrap"><table><thead><tr><th></th><th>Incidencia</th><th>Tipo</th><th>Guía / OC</th><th>Material</th><th>Diferencia</th><th>Responsable</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
    {rows.map((row)=>{
      const diff = Number(row.qty_received || 0)-Number(row.qty_expected || 0)
      return <tr key={row.id}>
        <td>{!readOnly && row.incident_type==='SOBRANTE' && row.status!=='CERRADO' ? <input type="checkbox" checked={selectedSurplus.includes(row.id)} onChange={()=>onToggle(row.id)}/> : null}</td>
        <td><b>{row.incident_no}</b><small>{fmt(row.created_at)}</small></td>
        <td><span className={row.incident_type==='SOBRANTE'?'status-pill warning':'status-pill'}>{row.incident_type.replaceAll('_',' ')}</span></td>
        <td>{row.guide_no || row.purchase_order || '—'}</td>
        <td><b>{row.material_no || '—'}</b><small>{row.description || ''}</small></td>
        <td>{diff === 0 ? '—' : diff.toLocaleString('es-PE',{maximumFractionDigits:3})}</td>
        <td>{profileName(row.assigned_to)}</td>
        <td>{readOnly ? <span className="status-pill">{row.status.replaceAll('_',' ')}</span> : <select className="inline-select" value={row.status} onChange={(e)=>onStatus(row,e.target.value as Incident['status'])}><option>ABIERTO</option><option>EN_REVISION</option><option>NOTIFICADO</option><option>CERRADO</option></select>}</td>
        <td>{readOnly ? <span className="read-only-note">Solo lectura</span> : <div className="row-actions"><button className="icon-button" title="Editar" onClick={()=>onEdit(row)}><Edit3 size={14}/></button><button className="icon-button" title="Enviar correo" disabled={sendingId===row.id} onClick={()=>onSend(row)}>{sendingId===row.id?<RefreshCw className="spin" size={14}/>:<Mail size={14}/>}</button><button className="icon-button danger-icon" title="Eliminar" onClick={()=>onDelete(row)}><Trash2 size={14}/></button></div>}</td>
      </tr>
    })}
  </tbody></table></div>
}

function IncidentModal({ form, setForm, profiles, editing, saving, onClose, onSubmit }: {
  form: typeof emptyIncident
  setForm:(value:typeof emptyIncident)=>void
  profiles:Profile[]
  editing:Incident|null
  saving:boolean
  onClose:()=>void
  onSubmit:(event:FormEvent)=>void
}) {
  return <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && onClose()}>
    <form className="modal inbound-incident-modal" onSubmit={onSubmit}>
      <div className="modal-head"><div><h2>{editing?'Editar incidencia':'Nueva incidencia Inbound'}</h2><p>Almacén CALLAO · Grupo INBOUND</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19}/></button></div>
      <div className="form-grid">
        <label>Tipo<select value={form.incident_type} onChange={(e)=>setForm({...form,incident_type:e.target.value as Incident['incident_type']})}><option value="SOBRANTE">Sobrante</option><option value="FALTANTE">Faltante</option><option value="DANADO">Dañado</option><option value="DIFERENCIA">Diferencia</option><option value="SIN_DOCUMENTACION">Sin documentación</option><option value="OTRO">Otro</option></select></label>
        <label>Responsable<select value={form.assigned_to} onChange={(e)=>setForm({...form,assigned_to:e.target.value})}><option value="">Sin asignar</option>{profiles.map((p)=><option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
        <label>Guía<input value={form.guide_no} onChange={(e)=>setForm({...form,guide_no:e.target.value})}/></label>
        <label>OC<input value={form.purchase_order} onChange={(e)=>setForm({...form,purchase_order:e.target.value})}/></label>
        <label>N° Documento<input value={form.document_no} onChange={(e)=>setForm({...form,document_no:e.target.value})}/></label>
        <label>Número de parte<input value={form.material_no} onChange={(e)=>setForm({...form,material_no:e.target.value})}/></label>
        <label className="span-2">Descripción<input value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label>
        <label>Cantidad esperada<input type="number" min="0" step="any" value={form.qty_expected} onChange={(e)=>setForm({...form,qty_expected:e.target.value})}/></label>
        <label>Cantidad recibida<input type="number" min="0" step="any" value={form.qty_received} onChange={(e)=>setForm({...form,qty_received:e.target.value})}/></label>
        <label className="span-2">Observaciones<textarea rows={3} value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<RefreshCw className="spin" size={15}/>:<CheckCircle2 size={15}/>} {editing?'Actualizar':'Guardar'}</button></div>
    </form>
  </div>
}
