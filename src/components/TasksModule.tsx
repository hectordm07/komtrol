import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Columns3,
  List,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'

type Profile = {
  user_id: string
  dni: string
  full_name: string
  role: Role
  active: boolean
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
  shift_name?: string | null
}

type Task = {
  id: string
  task_no: string
  work_type: 'TAREA' | 'RELEVO' | 'PERSONAL'
  title: string
  description: string | null
  warehouse: string | null
  project: string | null
  group_name: string | null
  shift_name: string | null
  responsible_id: string | null
  created_by: string
  category: string | null
  tags: string[]
  priority: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  status: 'PENDIENTE' | 'EN_PROCESO' | 'BLOQUEADO' | 'CERRADO' | 'VENCIDA'
  progress: number
  start_at: string | null
  due_at: string | null
  closed_at: string | null
  estimated_hours: number | null
  email_subject: string | null
  extensions_count: number
  created_at: string
  updated_at: string
}

type Mode = 'mi-trabajo' | 'tareas' | 'relevos' | 'area-personal' | 'lista' | 'tablero' | 'calendario'

type Props = {
  mode: Mode
  userId: string
  profile: Profile | null
  scopeWarehouse?: string
  scopeProject?: string
  scopeGroup?: string
  scopeShift?: string
}

const emptyForm = {
  work_type: 'TAREA' as Task['work_type'],
  title: '',
  description: '',
  warehouse: '',
  project: '',
  group_name: '',
  shift_name: '',
  responsible_id: '',
  category: 'INFORMATIVO',
  priority: 'MEDIA' as Task['priority'],
  due_at: '',
  estimated_hours: '',
  email_subject: '',
}

function taskNumber() {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
  const hms = d.toTimeString().slice(0, 8).replace(/:/g, '')
  return `KT-${ymd}-${hms}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
}

function shortDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(new Date(value))
}

function isOverdue(task: Task) {
  return Boolean(task.due_at && new Date(task.due_at) < new Date() && task.status !== 'CERRADO')
}

function effectiveStatus(task: Task) {
  return isOverdue(task) && task.status !== 'BLOQUEADO' ? 'VENCIDA' : task.status
}

function defaultWorkType(mode: Mode): Task['work_type'] {
  if (mode === 'relevos') return 'RELEVO'
  if (mode === 'area-personal') return 'PERSONAL'
  return 'TAREA'
}

export function TasksModule({
  mode,
  userId,
  profile,
  scopeWarehouse,
  scopeProject,
  scopeGroup,
  scopeShift,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [categories, setCategories] = useState<string[]>(['INFORMATIVO'])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    ...emptyForm,
    warehouse: scopeWarehouse ?? profile?.warehouse ?? '',
    project: scopeProject ?? profile?.project ?? '',
    group_name: scopeGroup ?? profile?.group_name ?? '',
    shift_name: scopeShift ?? profile?.shift_name ?? '',
  })

  async function reload() {
    setLoading(true)
    const [taskRes, profileRes, categoryRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('user_profiles').select('user_id,dni,full_name,role,active,warehouse,project,group_name,shift_name').eq('active', true).order('full_name'),
      supabase.from('categories').select('name').eq('active', true).order('name'),
    ])
    if (taskRes.error) setMessage(taskRes.error.message)
    setTasks((taskRes.data ?? []) as Task[])
    setProfiles((profileRes.data ?? []) as Profile[])
    if (categoryRes.data?.length) setCategories(categoryRes.data.map((x) => x.name))
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [userId])

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      work_type: defaultWorkType(mode),
      warehouse: scopeWarehouse ?? prev.warehouse || profile?.warehouse || '',
      project: scopeProject ?? prev.project || profile?.project || '',
      group_name: scopeGroup ?? prev.group_name || profile?.group_name || '',
      shift_name: scopeShift ?? prev.shift_name || profile?.shift_name || '',
      responsible_id: mode === 'area-personal' ? userId : prev.responsible_id,
    }))
  }, [mode, profile?.warehouse, profile?.project, profile?.group_name, profile?.shift_name, scopeWarehouse, scopeProject, scopeGroup, scopeShift, userId])

  const filtered = useMemo(() => {
    let data = [...tasks]

    if (scopeWarehouse) data = data.filter((t) => t.warehouse === scopeWarehouse)
    if (scopeProject) data = data.filter((t) => t.project === scopeProject)
    if (scopeGroup) data = data.filter((t) => t.group_name === scopeGroup)
    if (scopeShift) data = data.filter((t) => t.shift_name === scopeShift)

    if (mode === 'mi-trabajo') {
      data = data.filter((t) => t.responsible_id === userId || t.created_by === userId)
    } else if (mode === 'tareas') {
      data = data.filter((t) => t.work_type === 'TAREA')
    } else if (mode === 'relevos') {
      data = data.filter((t) => t.work_type === 'RELEVO')
    } else if (mode === 'area-personal') {
      data = data.filter((t) => t.work_type === 'PERSONAL' && t.created_by === userId)
    }

    const q = search.toLowerCase().trim()
    if (q) {
      data = data.filter((t) =>
        [
          t.task_no,
          t.title,
          t.description,
          t.warehouse,
          t.project,
          t.group_name,
          t.shift_name,
          t.category,
          t.email_subject,
        ].some((value) => String(value ?? '').toLowerCase().includes(q))
      )
    }
    return data
  }, [tasks, mode, search, userId, scopeWarehouse, scopeProject, scopeGroup, scopeShift])

  const counts = useMemo(() => {
    const total = filtered.length
    const closed = filtered.filter((t) => t.status === 'CERRADO').length
    const overdue = filtered.filter(isOverdue).length
    const pending = filtered.filter((t) => t.status !== 'CERRADO').length
    const average = total ? Math.round(filtered.reduce((sum, t) => sum + Number(t.progress || 0), 0) / total) : 0
    return { total, closed, overdue, pending, average }
  }, [filtered])

  const scopedProfiles = profiles.filter((p) => !scopeWarehouse || p.warehouse === scopeWarehouse)

  const profileName = (id?: string | null) =>
    profiles.find((p) => p.user_id === id)?.full_name ?? (id ? 'Usuario' : 'Sin asignar')

  async function saveTask(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = {
      task_no: taskNumber(),
      work_type: form.work_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      warehouse: form.warehouse.trim() || profile?.warehouse || null,
      project: form.project.trim() || profile?.project || null,
      group_name: form.group_name.trim() || scopeGroup || profile?.group_name || null,
      shift_name: form.shift_name.trim() || scopeShift || profile?.shift_name || null,
      responsible_id: form.work_type === 'PERSONAL' ? userId : (form.responsible_id || null),
      created_by: userId,
      category: form.category || null,
      priority: form.priority,
      status: 'PENDIENTE',
      progress: 0,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      original_due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
      email_subject: form.email_subject.trim() || null,
      email_related: Boolean(form.email_subject.trim()),
    }

    const { data, error } = await supabase.from('tasks').insert(payload).select('*').single()
    if (error || !data) {
      setSaving(false)
      setMessage(error?.message ?? 'No se pudo crear la tarea.')
      return
    }

    await supabase.from('task_history').insert({
      task_id: data.id,
      action: 'CREADA',
      field_name: 'status',
      old_value: null,
      new_value: 'PENDIENTE',
      changed_by: userId,
    })

    setSaving(false)
    setShowForm(false)
    setForm({
      ...emptyForm,
      work_type: defaultWorkType(mode),
      warehouse: scopeWarehouse ?? profile?.warehouse ?? '',
      project: scopeProject ?? profile?.project ?? '',
      group_name: scopeGroup ?? profile?.group_name ?? '',
      shift_name: scopeShift ?? profile?.shift_name ?? '',
      responsible_id: mode === 'area-personal' ? userId : '',
    })
    setMessage(`${data.task_no} creada correctamente.`)
    await reload()
  }

  async function updateTask(task: Task, changes: Partial<Task>) {
    const next: Record<string, unknown> = { ...changes, updated_at: new Date().toISOString() }

    if (changes.status === 'CERRADO') {
      next.closed_at = new Date().toISOString()
      next.progress = 100
    } else if (changes.status && task.status === 'CERRADO') {
      next.closed_at = null
    }

    const { error } = await supabase.from('tasks').update(next).eq('id', task.id)
    if (error) {
      setMessage(error.message)
      return
    }

    const field = changes.status !== undefined ? 'status' : changes.progress !== undefined ? 'progress' : 'update'
    const oldValue = field === 'status' ? task.status : field === 'progress' ? String(task.progress) : ''
    const newValue = field === 'status' ? String(changes.status) : field === 'progress' ? String(changes.progress) : ''

    await supabase.from('task_history').insert({
      task_id: task.id,
      action: 'ACTUALIZADA',
      field_name: field,
      old_value: oldValue,
      new_value: newValue,
      changed_by: userId,
    })

    setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, ...next } as Task : item))
  }

  function openForm() {
    setForm((prev) => ({
      ...prev,
      work_type: defaultWorkType(mode),
      responsible_id: mode === 'area-personal' ? userId : prev.responsible_id,
      warehouse: scopeWarehouse ?? prev.warehouse || profile?.warehouse || '',
      project: scopeProject ?? prev.project || profile?.project || '',
      group_name: scopeGroup ?? prev.group_name || profile?.group_name || '',
      shift_name: scopeShift ?? prev.shift_name || profile?.shift_name || '',
    }))
    setShowForm(true)
  }

  const title =
    mode === 'mi-trabajo' ? 'Mi trabajo' :
    mode === 'relevos' ? 'Relevos' :
    mode === 'area-personal' ? 'Área Personal' :
    mode === 'tablero' ? 'Tablero' :
    mode === 'calendario' ? 'Calendario' :
    mode === 'lista' ? 'Lista de trabajo' :
    'Tareas'

  const subtitle =
    mode === 'relevos' ? 'Continuidad operativa entre guardias.' :
    mode === 'area-personal' ? 'Tus tareas personales y seguimiento individual.' :
    'Pendientes, responsables, fechas y avance operativo.'

  return (
    <div className="work-module">
      <section className="panel compact-panel">
        <div className="panel-title">
          <div><h3>{title}</h3><p>{subtitle}</p></div>
          <div className="button-row">
            <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={18} /></button>
            <button className="primary-button" onClick={openForm}><Plus size={17} /> {mode === 'relevos' ? 'Nuevo relevo' : 'Nueva tarea'}</button>
          </div>
        </div>

        <div className="task-kpis">
          <div><ClipboardList size={17} /><span><b>{counts.total}</b><small>Total</small></span></div>
          <div><AlertTriangle size={17} /><span><b>{counts.pending}</b><small>Pendientes</small></span></div>
          <div className={counts.overdue ? 'danger-kpi' : ''}><CalendarDays size={17} /><span><b>{counts.overdue}</b><small>Vencidas</small></span></div>
          <div><CheckCircle2 size={17} /><span><b>{counts.closed}</b><small>Cerradas</small></span></div>
          <div><Columns3 size={17} /><span><b>{counts.average}%</b><small>Avance</small></span></div>
        </div>

        <div className="task-toolbar">
          <div className="search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarea, proyecto, grupo, categoría…" /></div>
          <div className="view-hint">
            {mode === 'tablero' ? <><Columns3 size={16} /> Tablero</> : mode === 'calendario' ? <><CalendarDays size={16} /> Calendario</> : <><List size={16} /> Lista</>}
          </div>
        </div>

        {message && <div className="inline-message">{message}</div>}

        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando trabajo…</p></div>
        ) : mode === 'tablero' ? (
          <TaskBoard tasks={filtered} profiles={profiles} onUpdate={updateTask} />
        ) : mode === 'calendario' ? (
          <TaskCalendar tasks={filtered} profiles={profiles} onUpdate={updateTask} />
        ) : (
          <TaskList tasks={filtered} profiles={profiles} onUpdate={updateTask} />
        )}
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <form className="modal task-modal" onSubmit={saveTask}>
            <div className="modal-head">
              <div><h2>{form.work_type === 'RELEVO' ? 'Nuevo relevo' : form.work_type === 'PERSONAL' ? 'Nueva tarea personal' : 'Nueva tarea'}</h2><p>Registra una vez y da seguimiento desde KOMTROL.</p></div>
              <button type="button" className="icon-button" onClick={() => setShowForm(false)}><X size={20} /></button>
            </div>

            <div className="form-grid">
              <label>Tipo
                <select value={form.work_type} onChange={(e) => setForm({ ...form, work_type: e.target.value as Task['work_type'] })}>
                  <option value="TAREA">Tarea</option>
                  <option value="RELEVO">Relevo</option>
                  <option value="PERSONAL">Personal</option>
                </select>
              </label>
              <label>Prioridad
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })}>
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </label>
              <label className="span-2">Título
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Pendiente / actividad" />
              </label>
              <label className="span-2">Descripción
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalle de la actividad…" />
              </label>
              <label>Almacén
                <input value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} placeholder="Almacén" />
              </label>
              <label>Proyecto
                <input value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="Proyecto" />
              </label>
              <label>Grupo
                <input value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} placeholder="PALAS / CAMIONES" />
              </label>
              <label>Responsable
                <select value={form.responsible_id} disabled={form.work_type === 'PERSONAL'} onChange={(e) => setForm({ ...form, responsible_id: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {scopedProfiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
                </select>
              </label>
              <label>Categoría
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>Fecha límite
                <input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
              </label>
              <label>Duración estimada (horas)
                <input type="number" min="0" step="0.5" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} />
              </label>
              <label className="span-2">Asunto del correo
                <input value={form.email_subject} onChange={(e) => setForm({ ...form, email_subject: e.target.value })} placeholder="Solo si existe un correo asociado" />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="primary-button" disabled={saving || !form.title.trim()}>
                {saving ? <RefreshCw className="spin" size={17} /> : <Plus size={17} />}
                {saving ? 'Guardando…' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function TaskList({ tasks, profiles, onUpdate }: { tasks: Task[]; profiles: Profile[]; onUpdate: (task: Task, changes: Partial<Task>) => void }) {
  const name = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? (id ? 'Usuario' : 'Sin asignar')
  if (!tasks.length) return <EmptyWork />

  return (
    <div className="table-wrap tasks-table">
      <table>
        <thead><tr><th>Prioridad</th><th>Tarea</th><th>Proyecto / Grupo</th><th>Responsable</th><th>Vence</th><th>Estado</th><th>Avance</th></tr></thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className={isOverdue(task) ? 'overdue-row' : ''}>
              <td><span className={`priority-chip p-${task.priority.toLowerCase()}`}>{task.priority}</span></td>
              <td><b>{task.title}</b><small>{task.task_no} · {task.work_type}{task.category ? ` · ${task.category}` : ''}</small></td>
              <td>{task.project || '—'}<small>{task.group_name || task.warehouse || '—'}</small></td>
              <td><span className="user-inline"><UserRound size={14} /> {name(task.responsible_id)}</span></td>
              <td>{shortDate(task.due_at)}{isOverdue(task) && <small className="error-line">Vencida</small>}</td>
              <td>
                <select className="inline-select" value={task.status} onChange={(e) => onUpdate(task, { status: e.target.value as Task['status'] })}>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="EN_PROCESO">En proceso</option>
                  <option value="BLOQUEADO">Bloqueado</option>
                  <option value="CERRADO">Cerrado</option>
                </select>
              </td>
              <td>
                <select className="inline-select progress-select" value={task.progress} onChange={(e) => onUpdate(task, { progress: Number(e.target.value) })}>
                  {[0, 25, 50, 75, 100].map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskBoard({ tasks, profiles, onUpdate }: { tasks: Task[]; profiles: Profile[]; onUpdate: (task: Task, changes: Partial<Task>) => void }) {
  const columns: Task['status'][] = ['PENDIENTE', 'EN_PROCESO', 'BLOQUEADO', 'CERRADO']
  const name = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? 'Sin asignar'

  return (
    <div className="task-board">
      {columns.map((status) => {
        const items = tasks.filter((t) => t.status === status)
        return (
          <div className="board-column" key={status}>
            <div className="board-column-head"><b>{status.replace('_', ' ')}</b><span>{items.length}</span></div>
            <div className="board-cards">
              {items.map((task) => (
                <article className={`task-card ${isOverdue(task) ? 'overdue-card' : ''}`} key={task.id}>
                  <div className="task-card-top"><span className={`priority-dot p-${task.priority.toLowerCase()}`} /><small>{task.task_no}</small></div>
                  <b>{task.title}</b>
                  <p>{task.project || task.warehouse || 'Sin proyecto'}{task.group_name ? ` · ${task.group_name}` : ''}</p>
                  <div className="task-card-meta"><span><UserRound size={13} /> {name(task.responsible_id)}</span><span><CalendarDays size={13} /> {shortDate(task.due_at)}</span></div>
                  <div className="progress-bar"><i style={{ width: `${task.progress}%` }} /></div>
                  <div className="task-card-actions">
                    <select value={task.status} onChange={(e) => onUpdate(task, { status: e.target.value as Task['status'] })}>
                      {columns.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                    </select>
                    <select value={task.progress} onChange={(e) => onUpdate(task, { progress: Number(e.target.value) })}>
                      {[0, 25, 50, 75, 100].map((v) => <option key={v} value={v}>{v}%</option>)}
                    </select>
                  </div>
                </article>
              ))}
              {!items.length && <div className="board-empty">Sin registros</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TaskCalendar({ tasks, profiles, onUpdate }: { tasks: Task[]; profiles: Profile[]; onUpdate: (task: Task, changes: Partial<Task>) => void }) {
  const name = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? 'Sin asignar'
  const grouped = tasks
    .filter((t) => t.due_at)
    .reduce<Record<string, Task[]>>((acc, task) => {
      const key = task.due_at!.slice(0, 10)
      ;(acc[key] ||= []).push(task)
      return acc
    }, {})
  const dates = Object.keys(grouped).sort()

  if (!dates.length) return <EmptyWork text="No hay tareas con fecha límite para mostrar en calendario." />

  return (
    <div className="calendar-list">
      {dates.map((date) => (
        <section className="calendar-day" key={date}>
          <div className="calendar-date">
            <b>{new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(date + 'T12:00:00'))}</b>
            <span>{grouped[date].length}</span>
          </div>
          <div className="calendar-items">
            {grouped[date].map((task) => (
              <article key={task.id} className={isOverdue(task) ? 'calendar-task overdue-card' : 'calendar-task'}>
                <span className={`priority-dot p-${task.priority.toLowerCase()}`} />
                <div><b>{task.title}</b><small>{task.project || task.warehouse || 'Sin proyecto'} · {name(task.responsible_id)}</small></div>
                <select className="inline-select" value={task.status} onChange={(e) => onUpdate(task, { status: e.target.value as Task['status'] })}>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="EN_PROCESO">En proceso</option>
                  <option value="BLOQUEADO">Bloqueado</option>
                  <option value="CERRADO">Cerrado</option>
                </select>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function EmptyWork({ text = 'No hay tareas para mostrar en esta vista.' }: { text?: string }) {
  return (
    <div className="empty-work">
      <ClipboardList size={30} />
      <b>Sin registros</b>
      <p>{text}</p>
    </div>
  )
}
