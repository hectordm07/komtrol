import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
import { TaskDetailModal } from './TaskDetailModal'

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
  original_due_at: string | null
  created_at: string
  updated_at: string
}

type CalendarIncident = {
  id: string
  incident_no: string
  incident_type: 'FALTANTE' | 'SOBRANTE' | 'DANADO' | 'DIFERENCIA' | 'SIN_DOCUMENTACION' | 'OTRO'
  status: 'ABIERTO' | 'EN_REVISION' | 'NOTIFICADO' | 'CERRADO'
  guide_no: string | null
  document_no: string | null
  purchase_order: string | null
  material_no: string | null
  stock_code: string | null
  description: string | null
  notes: string | null
  warehouse: string | null
  project: string | null
  group_name: string | null
  detected_at: string
  created_at: string
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
  initialTaskId?: string | null
  onInitialTaskOpened?: () => void
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
  initialTaskId,
  onInitialTaskOpened,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [incidents, setIncidents] = useState<CalendarIncident[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [categories, setCategories] = useState<string[]>(['INFORMATIVO'])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [workScope, setWorkScope] = useState<'PERSONAL' | 'GRUPAL'>('PERSONAL')
  const [workView, setWorkView] = useState<'LISTA' | 'TABLERO' | 'CALENDARIO'>('LISTA')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [selectedIncident, setSelectedIncident] = useState<CalendarIncident | null>(null)
  const [form, setForm] = useState({
    ...emptyForm,
    warehouse: scopeWarehouse ?? profile?.warehouse ?? '',
    project: scopeProject ?? profile?.project ?? '',
    group_name: scopeGroup ?? profile?.group_name ?? '',
    shift_name: scopeShift ?? profile?.shift_name ?? '',
  })

  async function reload() {
    setLoading(true)
    const [taskRes, incidentRes, profileRes, categoryRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(500),
      supabase
        .from('incidents')
        .select('id,incident_no,incident_type,status,guide_no,document_no,purchase_order,material_no,stock_code,description,notes,warehouse,project,group_name,detected_at,created_at')
        .order('detected_at', { ascending: false })
        .limit(1000),
      supabase.from('user_profiles').select('user_id,dni,full_name,role,active,warehouse,project,group_name,shift_name').eq('active', true).order('full_name'),
      supabase.from('categories').select('name').eq('active', true).order('name'),
    ])
    if (taskRes.error) setMessage(taskRes.error.message)
    setTasks((taskRes.data ?? []) as Task[])
    setIncidents((incidentRes.data ?? []) as CalendarIncident[])
    setProfiles((profileRes.data ?? []) as Profile[])
    if (categoryRes.data?.length) setCategories(categoryRes.data.map((x) => x.name))
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [userId])

  useEffect(() => {
    if (!initialTaskId || !tasks.length) return
    const target = tasks.find((task) => task.id === initialTaskId)
    if (!target) return
    setSelectedTask(target)
    onInitialTaskOpened?.()
  }, [initialTaskId, tasks])

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      work_type: defaultWorkType(mode),
      warehouse: scopeWarehouse ?? (prev.warehouse || profile?.warehouse || ''),
      project: scopeProject ?? (prev.project || profile?.project || ''),
      group_name: scopeGroup ?? (prev.group_name || profile?.group_name || ''),
      shift_name: scopeShift ?? (prev.shift_name || profile?.shift_name || ''),
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
      if (workScope === 'PERSONAL') {
        data = data.filter((t) =>
          t.responsible_id === userId ||
          (t.work_type === 'PERSONAL' && t.created_by === userId)
        )
      } else {
        data = data.filter((t) => t.work_type !== 'PERSONAL')

        if (profile?.role !== 'SUPERVISOR' && profile?.role !== 'ADMINISTRADOR') {
          if (profile?.group_name) {
            data = data.filter((t) => t.group_name === profile.group_name)
          } else if (profile?.warehouse) {
            data = data.filter((t) => t.warehouse === profile.warehouse)
          }
        } else if (scopeGroup) {
          data = data.filter((t) => t.group_name === scopeGroup)
        } else if (scopeWarehouse) {
          data = data.filter((t) => t.warehouse === scopeWarehouse)
        }
      }
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
  }, [tasks, mode, search, userId, scopeWarehouse, scopeProject, scopeGroup, scopeShift, workScope, profile?.role, profile?.group_name, profile?.warehouse])

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

    if (data.responsible_id && data.responsible_id !== userId) {
      await supabase.from('app_notifications').insert({
        user_id: data.responsible_id,
        notification_type: 'TASK_ASSIGNED',
        title: 'Nueva tarea asignada',
        message: `${data.task_no} · ${data.title}`,
        task_id: data.id,
        created_by: userId,
        metadata: { task_no: data.task_no },
      })
    }

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
      work_type:
        mode === 'mi-trabajo'
          ? (workScope === 'PERSONAL' ? 'PERSONAL' : 'TAREA')
          : defaultWorkType(mode),
      responsible_id:
        mode === 'mi-trabajo' && workScope === 'PERSONAL'
          ? userId
          : mode === 'area-personal'
            ? userId
            : prev.responsible_id,
      warehouse: scopeWarehouse ?? (prev.warehouse || profile?.warehouse || ''),
      project: scopeProject ?? (prev.project || profile?.project || ''),
      group_name: scopeGroup ?? (prev.group_name || profile?.group_name || ''),
      shift_name: scopeShift ?? (prev.shift_name || profile?.shift_name || ''),
    }))
    setShowForm(true)
  }

  const title =
    mode === 'mi-trabajo' ? 'Área de trabajo' :
    mode === 'relevos' ? 'Relevos' :
    mode === 'area-personal' ? 'Área Personal' :
    mode === 'tablero' ? 'Flujo de tareas' :
    mode === 'calendario' ? 'Calendario' :
    mode === 'lista' ? 'Lista de trabajo' :
    'Tareas'

  const subtitle =
    mode === 'mi-trabajo'
      ? 'Tareas personales y grupales con vistas Lista, Tablero y Calendario.'
      : mode === 'relevos'
        ? 'Continuidad operativa entre guardias.'
        : mode === 'area-personal'
          ? 'Tus tareas personales y seguimiento individual.'
          : 'Pendientes, responsables, fechas y avance operativo.'

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

        {mode === 'mi-trabajo' && (
          <div className="work-view-controller">
            <div className="work-scope-switch" aria-label="Alcance de tareas">
              <button type="button" className={workScope === 'PERSONAL' ? 'active' : ''} onClick={() => setWorkScope('PERSONAL')}>
                <UserRound size={16} /> Personal
              </button>
              <button type="button" className={workScope === 'GRUPAL' ? 'active' : ''} onClick={() => setWorkScope('GRUPAL')}>
                <Columns3 size={16} /> Grupal
              </button>
            </div>
            <div className="work-view-switch" aria-label="Vista de trabajo">
              <button type="button" className={workView === 'LISTA' ? 'active' : ''} onClick={() => setWorkView('LISTA')}>
                <List size={16} /> Lista
              </button>
              <button type="button" className={workView === 'TABLERO' ? 'active' : ''} onClick={() => setWorkView('TABLERO')}>
                <Columns3 size={16} /> Tablero
              </button>
              <button type="button" className={workView === 'CALENDARIO' ? 'active' : ''} onClick={() => setWorkView('CALENDARIO')}>
                <CalendarDays size={16} /> Calendario
              </button>
            </div>
          </div>
        )}

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
            {mode === 'mi-trabajo'
              ? workView === 'TABLERO'
                ? <><Columns3 size={16} /> Tablero · {workScope === 'PERSONAL' ? 'Personal' : 'Grupal'}</>
                : workView === 'CALENDARIO'
                  ? <><CalendarDays size={16} /> Calendario · {workScope === 'PERSONAL' ? 'Personal' : 'Grupal'}</>
                  : <><List size={16} /> Lista · {workScope === 'PERSONAL' ? 'Personal' : 'Grupal'}</>
              : mode === 'tablero'
                ? <><Columns3 size={16} /> Vista Kanban</>
                : mode === 'calendario'
                  ? <><CalendarDays size={16} /> Calendario</>
                  : <><List size={16} /> Lista</>}
          </div>
        </div>

        {message && <div className="inline-message">{message}</div>}

        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando trabajo…</p></div>
        ) : (mode === 'tablero' || (mode === 'mi-trabajo' && workView === 'TABLERO')) ? (
          <TaskBoard tasks={filtered} profiles={profiles} onUpdate={updateTask} onOpen={setSelectedTask} />
        ) : (mode === 'calendario' || (mode === 'mi-trabajo' && workView === 'CALENDARIO')) ? (
          <TaskCalendar
            tasks={filtered}
            incidents={incidents}
            profiles={profiles}
            profile={profile}
            onUpdate={updateTask}
            onOpen={setSelectedTask}
            onOpenIncident={setSelectedIncident}
          />
        ) : (
          <TaskList tasks={filtered} profiles={profiles} onUpdate={updateTask} onOpen={setSelectedTask} />
        )}
      </section>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          userId={userId}
          profiles={profiles}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={(updated) => {
            const next = updated as Task
            setSelectedTask(next)
            setTasks((current) => current.map((item) => item.id === next.id ? next : item))
          }}
        />
      )}

      {selectedIncident && (
        <CalendarIncidentModal
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
        />
      )}

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

function TaskList({ tasks, profiles, onUpdate, onOpen }: { tasks: Task[]; profiles: Profile[]; onUpdate: (task: Task, changes: Partial<Task>) => void; onOpen: (task: Task) => void }) {
  const name = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? (id ? 'Usuario' : 'Sin asignar')
  if (!tasks.length) return <EmptyWork />

  return (
    <div className="table-wrap tasks-table">
      <table>
        <thead><tr><th>Prioridad</th><th>Tarea</th><th>Proyecto / Grupo</th><th>Responsable</th><th>Vence</th><th>Estado</th><th>Avance</th></tr></thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className={isOverdue(task) ? 'overdue-row task-open-row' : 'task-open-row'} onClick={() => onOpen(task)}>
              <td><span className={`priority-chip p-${task.priority.toLowerCase()}`}>{task.priority}</span></td>
              <td><b>{task.title}</b><small>{task.task_no} · {task.work_type}{task.category ? ` · ${task.category}` : ''}</small></td>
              <td>{task.project || '—'}<small>{task.group_name || task.warehouse || '—'}</small></td>
              <td><span className="user-inline"><UserRound size={14} /> {name(task.responsible_id)}</span></td>
              <td>{shortDate(task.due_at)}{isOverdue(task) && <small className="error-line">Vencida</small>}</td>
              <td>
                <select className="inline-select" value={task.status} onClick={(e) => e.stopPropagation()} onChange={(e) => onUpdate(task, { status: e.target.value as Task['status'] })}>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="EN_PROCESO">En proceso</option>
                  <option value="BLOQUEADO">Bloqueado</option>
                  <option value="CERRADO">Cerrado</option>
                </select>
              </td>
              <td>
                <select className="inline-select progress-select" value={task.progress} onClick={(e) => e.stopPropagation()} onChange={(e) => onUpdate(task, { progress: Number(e.target.value) })}>
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

function TaskBoard({ tasks, profiles, onUpdate, onOpen }: { tasks: Task[]; profiles: Profile[]; onUpdate: (task: Task, changes: Partial<Task>) => void; onOpen: (task: Task) => void }) {
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
                <article className={`task-card task-open-card ${isOverdue(task) ? 'overdue-card' : ''}`} key={task.id} onClick={() => onOpen(task)}>
                  <div className="task-card-top"><span className={`priority-dot p-${task.priority.toLowerCase()}`} /><small>{task.task_no}</small></div>
                  <b>{task.title}</b>
                  <p>{task.project || task.warehouse || 'Sin proyecto'}{task.group_name ? ` · ${task.group_name}` : ''}</p>
                  <div className="task-card-meta"><span><UserRound size={13} /> {name(task.responsible_id)}</span><span><CalendarDays size={13} /> {shortDate(task.due_at)}</span></div>
                  <div className="progress-bar"><i style={{ width: `${task.progress}%` }} /></div>
                  <div className="task-card-actions">
                    <select value={task.status} onClick={(e) => e.stopPropagation()} onChange={(e) => onUpdate(task, { status: e.target.value as Task['status'] })}>
                      {columns.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
                    </select>
                    <select value={task.progress} onClick={(e) => e.stopPropagation()} onChange={(e) => onUpdate(task, { progress: Number(e.target.value) })}>
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

function localDateKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setHours(12, 0, 0, 0)
  next.setDate(next.getDate() + amount)
  return next
}

function startOfToday() {
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  return now
}

function TaskCalendar({
  tasks,
  incidents,
  profiles,
  profile,
  onUpdate,
  onOpen,
  onOpenIncident,
}: {
  tasks: Task[]
  incidents: CalendarIncident[]
  profiles: Profile[]
  profile: Profile | null
  onUpdate: (task: Task, changes: Partial<Task>) => void
  onOpen: (task: Task) => void
  onOpenIncident: (incident: CalendarIncident) => void
}) {
  const [windowStart, setWindowStart] = useState(() => startOfToday())
  const name = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? 'Sin asignar'
  const dayCells = useMemo(() => Array.from({ length: 30 }, (_, index) => addDays(windowStart, index)), [windowStart])

  const visibleIncidents = useMemo(() => {
    if (!profile?.warehouse || profile.role === 'ADMINISTRADOR') return incidents
    return incidents.filter((incident) => incident.warehouse === profile.warehouse)
  }, [incidents, profile?.warehouse, profile?.role])

  const taskByDay = useMemo(() => {
    return tasks
      .filter((task) => task.due_at)
      .reduce<Record<string, Task[]>>((acc, task) => {
        const key = localDateKey(task.due_at!)
        if (!key) return acc
        ;(acc[key] ||= []).push(task)
        return acc
      }, {})
  }, [tasks])

  const incidentByDay = useMemo(() => {
    return visibleIncidents.reduce<Record<string, CalendarIncident[]>>((acc, incident) => {
      const key = localDateKey(incident.detected_at || incident.created_at)
      if (!key) return acc
      ;(acc[key] ||= []).push(incident)
      return acc
    }, {})
  }, [visibleIncidents])

  const rangeLabel = `${new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' }).format(dayCells[0])} – ${new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(dayCells[29])}`
  const todayKey = localDateKey(startOfToday())

  return (
    <div className="calendar-30-shell">
      <div className="calendar-30-controls">
        <div>
          <b>Vista de 30 días</b>
          <span>{rangeLabel}</span>
        </div>
        <div className="calendar-30-nav">
          <button className="icon-button" onClick={() => setWindowStart((current) => addDays(current, -30))} title="30 días anteriores"><ChevronLeft size={18} /></button>
          <button className="secondary-button calendar-today-button" onClick={() => setWindowStart(startOfToday())}>Hoy</button>
          <button className="icon-button" onClick={() => setWindowStart((current) => addDays(current, 30))} title="30 días siguientes"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="calendar-30-legend">
        <span><i className="calendar-legend-dot task" /> Tarea / pendiente</span>
        <span><i className="calendar-legend-dot relevo" /> Relevo</span>
        <span><i className="calendar-legend-dot incident" /> Incidencia</span>
      </div>

      <div className="calendar-30-grid">
        {dayCells.map((date) => {
          const key = localDateKey(date)
          const dayTasks = taskByDay[key] ?? []
          const dayIncidents = incidentByDay[key] ?? []
          const total = dayTasks.length + dayIncidents.length
          const isToday = key === todayKey

          return (
            <section className={isToday ? 'calendar-30-day is-today' : 'calendar-30-day'} key={key}>
              <div className="calendar-30-day-head">
                <div>
                  <small>{new Intl.DateTimeFormat('es-PE', { weekday: 'short' }).format(date)}</small>
                  <b>{new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' }).format(date)}</b>
                </div>
                <span>{total}</span>
              </div>

              <div className="calendar-30-events">
                {dayTasks.map((task) => (
                  <button
                    key={task.id}
                    className={`calendar-event calendar-event-task ${isOverdue(task) ? 'is-overdue' : ''}`}
                    onClick={() => onOpen(task)}
                    title="Abrir detalle"
                  >
                    <i className={`priority-dot p-${task.priority.toLowerCase()}`} />
                    <span>
                      <small>{task.work_type === 'RELEVO' ? 'RELEVO' : task.work_type === 'PERSONAL' ? 'PERSONAL' : 'TAREA'}</small>
                      <b>{task.title}</b>
                      <em>{task.project || task.warehouse || 'Sin proyecto'} · {name(task.responsible_id)}</em>
                    </span>
                  </button>
                ))}

                {dayIncidents.map((incident) => (
                  <button
                    key={incident.id}
                    className="calendar-event calendar-event-incident"
                    onClick={() => onOpenIncident(incident)}
                    title="Abrir incidencia"
                  >
                    <AlertTriangle size={14} />
                    <span>
                      <small>INCIDENCIA · {incident.incident_type.replace('_', ' ')}</small>
                      <b>{incident.incident_no}</b>
                      <em>{incident.material_no || incident.description || incident.warehouse || 'Sin detalle'}</em>
                    </span>
                  </button>
                ))}

                {!total && <span className="calendar-30-empty">Sin registros</span>}
              </div>
            </section>
          )
        })}
      </div>

      <style>{`
        .calendar-30-shell{display:grid;gap:12px}
        .calendar-30-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 0}
        .calendar-30-controls>div:first-child{display:grid;gap:2px}
        .calendar-30-controls b{color:#18274b;font-size:14px}
        .calendar-30-controls span{color:#738099;font-size:12px}
        .calendar-30-nav{display:flex;align-items:center;gap:7px}
        .calendar-today-button{min-height:36px;padding:0 14px}
        .calendar-30-legend{display:flex;align-items:center;gap:14px;flex-wrap:wrap;color:#66748f;font-size:12px}
        .calendar-30-legend span{display:inline-flex;align-items:center;gap:6px}
        .calendar-legend-dot{width:9px;height:9px;border-radius:50%;display:inline-block;background:#3155c6}
        .calendar-legend-dot.relevo{background:#7c3aed}
        .calendar-legend-dot.incident{background:#c62828}
        .calendar-30-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}
        .calendar-30-day{min-height:150px;border:1px solid #e2e7f0;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 1px 2px rgba(24,39,75,.03)}
        .calendar-30-day.is-today{border-color:#3155c6;box-shadow:0 0 0 2px rgba(49,85,198,.08)}
        .calendar-30-day-head{display:flex;align-items:center;justify-content:space-between;padding:10px 11px;background:#f7f9fd;border-bottom:1px solid #e8ecf4}
        .calendar-30-day-head>div{display:grid;gap:1px}
        .calendar-30-day-head small{text-transform:capitalize;color:#7b879d;font-size:10px}
        .calendar-30-day-head b{color:#223154;font-size:13px}
        .calendar-30-day-head>span{display:grid;place-items:center;min-width:25px;height:25px;padding:0 7px;border-radius:999px;background:#edf1f8;color:#41516f;font-size:11px;font-weight:800}
        .calendar-30-events{display:grid;gap:7px;padding:8px}
        .calendar-event{width:100%;border:0;border-radius:10px;padding:8px;text-align:left;display:flex;align-items:flex-start;gap:7px;cursor:pointer}
        .calendar-event:hover{filter:brightness(.985)}
        .calendar-event span{min-width:0;display:grid;gap:1px}
        .calendar-event small{font-size:9px;font-weight:800;letter-spacing:.03em}
        .calendar-event b{font-size:11px;line-height:1.25;color:#1d2a49;white-space:normal}
        .calendar-event em{font-style:normal;font-size:9.5px;color:#6f7b91;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .calendar-event-task{background:#f4f7ff;border:1px solid #e2e9ff}
        .calendar-event-task.is-overdue{background:#fff4f3;border-color:#ffd8d4}
        .calendar-event-incident{background:#fff5f4;border:1px solid #ffdcd8;color:#b42318}
        .calendar-event-incident b{color:#7f1d1d}
        .calendar-30-empty{display:block;padding:12px 4px;color:#a0a9b8;font-size:10px;text-align:center}
        .calendar-incident-modal{max-width:620px}
        .calendar-incident-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .calendar-incident-field{padding:11px;border:1px solid #e5e9f1;border-radius:12px;background:#fafbfe}
        .calendar-incident-field.span-2{grid-column:1/-1}
        .calendar-incident-field small{display:block;color:#7b879d;font-size:10px;margin-bottom:3px}
        .calendar-incident-field b,.calendar-incident-field p{margin:0;color:#223154;font-size:13px;overflow-wrap:anywhere}
        @media(max-width:1050px){.calendar-30-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
        @media(max-width:650px){
          .calendar-30-controls{align-items:flex-start}
          .calendar-30-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
          .calendar-30-day{min-height:128px;border-radius:12px}
          .calendar-30-day-head{padding:9px}
          .calendar-30-events{padding:6px;gap:5px}
          .calendar-event{padding:7px}
          .calendar-event em{display:none}
          .calendar-incident-grid{grid-template-columns:1fr}
          .calendar-incident-field.span-2{grid-column:auto}
        }
        @media(max-width:380px){
          .calendar-30-controls{display:grid}
          .calendar-30-nav{justify-content:flex-start}
          .calendar-30-grid{grid-template-columns:1fr 1fr}
        }
      `}</style>
    </div>
  )
}

function CalendarIncidentModal({ incident, onClose }: { incident: CalendarIncident; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal calendar-incident-modal">
        <div className="modal-head">
          <div>
            <h2>{incident.incident_no}</h2>
            <p>{incident.incident_type.replace('_', ' ')} · {incident.status.replace('_', ' ')}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="calendar-incident-grid">
          <div className="calendar-incident-field"><small>Fecha detectada</small><b>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(incident.detected_at))}</b></div>
          <div className="calendar-incident-field"><small>Almacén</small><b>{incident.warehouse || '—'}</b></div>
          <div className="calendar-incident-field"><small>Guía</small><b>{incident.guide_no || '—'}</b></div>
          <div className="calendar-incident-field"><small>OC / Documento</small><b>{incident.purchase_order || incident.document_no || '—'}</b></div>
          <div className="calendar-incident-field"><small>Material</small><b>{incident.material_no || incident.stock_code || '—'}</b></div>
          <div className="calendar-incident-field"><small>Proyecto / Grupo</small><b>{incident.project || incident.group_name || '—'}</b></div>
          <div className="calendar-incident-field span-2"><small>Descripción</small><p>{incident.description || 'Sin descripción'}</p></div>
          <div className="calendar-incident-field span-2"><small>Observación</small><p>{incident.notes || 'Sin observación'}</p></div>
        </div>

        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>Cerrar</button>
        </div>
      </section>
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
