import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Columns3,
  List,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  UserRound,
  X,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
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

type TaskLabel = {
  id: string
  name: string
  scope: 'PROYECTO' | 'PERSONAL'
  project: string | null
  warehouse: string | null
  created_by: string
  active: boolean
  color: string
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
  relevo_from_shift: string | null
  relevo_to_shift: string | null
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
  relevo_from_shift: '',
  relevo_to_shift: '',
  responsible_id: '',
  category: 'INFORMATIVO',
  priority: 'MEDIA' as Task['priority'],
  due_at: '',
  estimated_hours: '',
  email_subject: '',
  tags: [] as string[],
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
  if (mode === 'mi-trabajo' || mode === 'area-personal') return 'PERSONAL'
  return 'TAREA'
}

function oppositeShift(value?: string | null) {
  const shift = String(value || '').trim().toUpperCase()
  if (shift === 'GUARDIA A') return 'GUARDIA B'
  if (shift === 'GUARDIA B') return 'GUARDIA A'
  return ''
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
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [titleGenerating, setTitleGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | Task['status']>('TODOS')
  const [priorityFilter, setPriorityFilter] = useState<'TODAS' | Task['priority']>('TODAS')
  const [categoryFilter, setCategoryFilter] = useState('TODAS')
  const [responsibleFilter, setResponsibleFilter] = useState('TODOS')
  const [workArea, setWorkArea] = useState<'MI_TRABAJO' | 'TAREAS' | 'RELEVOS'>(
    mode === 'relevos' ? 'RELEVOS' : mode === 'tareas' ? 'TAREAS' : 'MI_TRABAJO'
  )
  const [workView, setWorkView] = useState<'LISTA' | 'TABLERO' | 'CALENDARIO'>(
    mode === 'tablero' ? 'TABLERO' : mode === 'calendario' ? 'CALENDARIO' : 'LISTA'
  )
  const [showCategoryCreator, setShowCategoryCreator] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [showLabelCreator, setShowLabelCreator] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newLabelColor, setNewLabelColor] = useState('#5570D8')
  const [labelScope, setLabelScope] = useState<'PROYECTO' | 'PERSONAL'>('PROYECTO')
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
    const [taskRes, incidentRes, profileRes, categoryRes, labelRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(500),
      supabase
        .from('incidents')
        .select('id,incident_no,incident_type,status,guide_no,document_no,purchase_order,material_no,stock_code,description,notes,warehouse,project,group_name,detected_at,created_at')
        .order('detected_at', { ascending: false })
        .limit(1000),
      supabase.from('user_profiles').select('user_id,dni,full_name,role,active,warehouse,project,group_name,shift_name').eq('active', true).order('full_name'),
      supabase.from('categories').select('name').eq('active', true).order('name'),
      supabase.from('task_labels').select('*').eq('active', true).order('name'),
    ])
    if (taskRes.error) setMessage(taskRes.error.message)
    setTasks((taskRes.data ?? []) as Task[])
    setIncidents((incidentRes.data ?? []) as CalendarIncident[])
    setProfiles((profileRes.data ?? []) as Profile[])
    if (categoryRes.data?.length) setCategories(categoryRes.data.map((x) => x.name))
    setLabels((labelRes.data ?? []) as TaskLabel[])
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
    if (mode === 'relevos') setWorkArea('RELEVOS')
    else if (mode === 'tareas') setWorkArea('TAREAS')
    else if (mode !== 'area-personal') setWorkArea('MI_TRABAJO')

    if (mode === 'tablero') setWorkView('TABLERO')
    else if (mode === 'calendario') setWorkView('CALENDARIO')
    else if (mode !== 'area-personal') setWorkView('LISTA')
  }, [mode])

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      work_type: defaultWorkType(mode),
      warehouse: scopeWarehouse ?? (prev.warehouse || profile?.warehouse || ''),
      project: scopeProject ?? (prev.project || profile?.project || ''),
      group_name: scopeGroup ?? (prev.group_name || profile?.group_name || ''),
      shift_name: scopeShift ?? (prev.shift_name || profile?.shift_name || ''),
      relevo_from_shift: prev.relevo_from_shift || profile?.shift_name || '',
      relevo_to_shift: prev.relevo_to_shift || oppositeShift(profile?.shift_name),
      responsible_id: mode === 'mi-trabajo' || mode === 'area-personal' ? userId : prev.responsible_id,
    }))
  }, [mode, profile?.warehouse, profile?.project, profile?.group_name, profile?.shift_name, scopeWarehouse, scopeProject, scopeGroup, scopeShift, userId])

  const filtered = useMemo(() => {
    let data = [...tasks]

    if (scopeWarehouse) data = data.filter((t) => t.warehouse === scopeWarehouse)
    if (scopeProject) data = data.filter((t) => t.project === scopeProject)
    if (scopeGroup) data = data.filter((t) => t.group_name === scopeGroup)
    if (scopeShift) data = data.filter((t) => t.shift_name === scopeShift)

    if (mode === 'area-personal' || workArea === 'MI_TRABAJO') {
      // Mi trabajo = exclusivamente tareas personales del usuario.
      data = data.filter((t) =>
        t.work_type === 'PERSONAL' &&
        (t.responsible_id === userId || t.created_by === userId)
      )
    } else if (workArea === 'TAREAS') {
      // Tareas = trabajo operativo del grupo/proyecto, nunca tareas personales ni relevos.
      data = data.filter((t) => t.work_type === 'TAREA')

      if (profile?.role === 'TRABAJADOR') {
        if (profile.warehouse) data = data.filter((t) => t.warehouse === profile.warehouse)
        if (profile.project) data = data.filter((t) => t.project === profile.project)
        if (profile.group_name) data = data.filter((t) => t.group_name === profile.group_name)
      } else if (profile?.role === 'COORDINADOR') {
        if (profile.warehouse) data = data.filter((t) => t.warehouse === profile.warehouse)
        if (profile.project) data = data.filter((t) => t.project === profile.project)
      }
    } else if (workArea === 'RELEVOS') {
      // Relevos = continuidad entre guardias del mismo ámbito operativo.
      data = data.filter((t) => t.work_type === 'RELEVO')

      if (profile?.role === 'TRABAJADOR') {
        if (profile.warehouse) data = data.filter((t) => t.warehouse === profile.warehouse)
        if (profile.project) data = data.filter((t) => t.project === profile.project)
        if (profile.group_name) data = data.filter((t) => t.group_name === profile.group_name)
        if (profile.shift_name) {
          data = data.filter((t) =>
            t.relevo_from_shift === profile.shift_name ||
            t.relevo_to_shift === profile.shift_name ||
            (!t.relevo_from_shift && !t.relevo_to_shift && t.shift_name === profile.shift_name)
          )
        }
      } else if (profile?.role === 'COORDINADOR') {
        if (profile.warehouse) data = data.filter((t) => t.warehouse === profile.warehouse)
        if (profile.project) data = data.filter((t) => t.project === profile.project)
      }
    }

    if (statusFilter !== 'TODOS') data = data.filter((t) => effectiveStatus(t) === statusFilter)
    if (priorityFilter !== 'TODAS') data = data.filter((t) => t.priority === priorityFilter)
    if (categoryFilter !== 'TODAS') data = data.filter((t) => t.category === categoryFilter)
    if (responsibleFilter !== 'TODOS') data = data.filter((t) => t.responsible_id === responsibleFilter)

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
          t.relevo_from_shift,
          t.relevo_to_shift,
          t.category,
          t.email_subject,
          ...(t.tags || []),
        ].some((value) => String(value ?? '').toLowerCase().includes(q))
      )
    }
    return data
  }, [
    tasks, mode, search, userId, profile?.role, profile?.warehouse, profile?.project, profile?.group_name, profile?.shift_name,
    scopeWarehouse, scopeProject, scopeGroup, scopeShift, workArea,
    statusFilter, priorityFilter, categoryFilter, responsibleFilter,
  ])

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


  const activeFilterSummary = useMemo(() => {
    const parts = [
      mode === 'tareas' ? 'Tareas' : mode === 'relevos' ? 'Relevos' : mode === 'area-personal' ? 'Área personal' : 'Mi trabajo',
      statusFilter !== 'TODOS' ? `Estado: ${statusFilter.replaceAll('_',' ')}` : '',
      priorityFilter !== 'TODAS' ? `Prioridad: ${priorityFilter}` : '',
      categoryFilter !== 'TODAS' ? `Categoría: ${categoryFilter}` : '',
      responsibleFilter !== 'TODOS' ? `Responsable: ${profileName(responsibleFilter)}` : '',
      search.trim() ? `Búsqueda: ${search.trim()}` : '',
      scopeWarehouse ? `Almacén: ${scopeWarehouse}` : '',
      scopeProject ? `Proyecto: ${scopeProject}` : '',
      scopeGroup ? `Grupo: ${scopeGroup}` : '',
    ].filter(Boolean)
    return parts.join(' · ')
  }, [
    mode,statusFilter,priorityFilter,categoryFilter,responsibleFilter,search,
    scopeWarehouse,scopeProject,scopeGroup,profiles,
  ])

  function taskExportRows() {
    return filtered.map((task) => ({
      ID: task.task_no,
      Tipo: task.work_type,
      Título: task.title,
      Descripción: task.description || '',
      Proyecto: task.project || '',
      Almacén: task.warehouse || '',
      Grupo: task.group_name || '',
      'Relevo origen': task.relevo_from_shift || '',
      'Relevo destino': task.relevo_to_shift || '',
      Responsable: profileName(task.responsible_id),
      Categoría: task.category || '',
      Etiquetas: (task.tags || []).join(', '),
      Prioridad: task.priority,
      Estado: effectiveStatus(task).replaceAll('_',' '),
      Avance: `${task.progress}%`,
      'Fecha inicio': task.start_at ? new Date(task.start_at).toLocaleString('es-PE') : '',
      'Fecha límite': task.due_at ? new Date(task.due_at).toLocaleString('es-PE') : '',
      'Fecha cierre': task.closed_at ? new Date(task.closed_at).toLocaleString('es-PE') : '',
      'Duración estimada (h)': task.estimated_hours ?? '',
      'Asunto correo': task.email_subject || '',
      'Fecha creación': new Date(task.created_at).toLocaleString('es-PE'),
    }))
  }

  function exportTasksExcel() {
    if (!filtered.length) {
      setMessage('No hay tareas en el filtro actual para exportar.')
      return
    }

    const workbook = XLSX.utils.book_new()
    const rows = taskExportRows()
    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet['!cols'] = [
      {wch:18},{wch:11},{wch:36},{wch:48},{wch:20},{wch:16},{wch:20},{wch:24},
      {wch:18},{wch:30},{wch:11},{wch:16},{wch:10},{wch:20},{wch:20},{wch:20},
      {wch:20},{wch:42},{wch:20},
    ]
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tareas')

    const summarySheet = XLSX.utils.aoa_to_sheet([
      ['KOMTROL - Reporte de Tareas'],
      ['Generado', new Date().toLocaleString('es-PE')],
      ['Filtros aplicados', activeFilterSummary || 'Sin filtros adicionales'],
      ['Registros', filtered.length],
      [],
      ['Indicador','Valor'],
      ['Total', counts.total],
      ['Pendientes', counts.pending],
      ['Vencidas', counts.overdue],
      ['Cerradas', counts.closed],
      ['Avance promedio', `${counts.average}%`],
    ])
    summarySheet['!cols']=[{wch:24},{wch:70}]
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen')

    const stamp = new Date().toISOString().slice(0,10)
    XLSX.writeFile(workbook, `KOMTROL_Tareas_${stamp}.xlsx`)
  }

  function exportTasksPdf() {
    if (!filtered.length) {
      setMessage('No hay tareas en el filtro actual para exportar.')
      return
    }

    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    doc.setFillColor(51,67,154)
    doc.rect(0,0,pageWidth,20,'F')
    doc.setTextColor(255,255,255)
    doc.setFontSize(15)
    doc.setFont('helvetica','bold')
    doc.text('KOMTROL · Reporte de Tareas', 12, 9)
    doc.setFontSize(8)
    doc.setFont('helvetica','normal')
    doc.text(`Generado: ${new Date().toLocaleString('es-PE')}`,12,15)

    doc.setTextColor(32,42,85)
    doc.setFontSize(8)
    const filterLines=doc.splitTextToSize(`Filtros: ${activeFilterSummary || 'Sin filtros adicionales'}`,pageWidth-24)
    doc.text(filterLines,12,26)

    autoTable(doc,{
      startY: 31 + Math.max(0,(filterLines.length-1)*3),
      head:[['ID','Tipo','Título','Proyecto / Almacén','Responsable','Categoría / Etiquetas','Prioridad','Estado','Avance','Vence']],
      body:filtered.map((task)=>[
        task.task_no,
        task.work_type,
        task.title,
        [task.project,task.warehouse].filter(Boolean).join(' / ') || '—',
        profileName(task.responsible_id),
        [task.category,(task.tags||[]).join(', ')].filter(Boolean).join(' · ') || '—',
        task.priority,
        effectiveStatus(task).replaceAll('_',' '),
        `${task.progress}%`,
        task.due_at ? new Date(task.due_at).toLocaleDateString('es-PE') : '—',
      ]),
      theme:'grid',
      styles:{
        font:'helvetica',
        fontSize:6.5,
        cellPadding:1.8,
        textColor:[51,64,120],
        lineColor:[216,222,248],
        lineWidth:.2,
        overflow:'linebreak',
        valign:'middle',
      },
      headStyles:{
        fillColor:[51,67,154],
        textColor:[255,255,255],
        fontStyle:'bold',
        fontSize:6.7,
      },
      alternateRowStyles:{fillColor:[247,248,255]},
      columnStyles:{
        0:{cellWidth:24},1:{cellWidth:15},2:{cellWidth:48},3:{cellWidth:36},
        4:{cellWidth:33},5:{cellWidth:40},6:{cellWidth:17},7:{cellWidth:22},
        8:{cellWidth:14},9:{cellWidth:20},
      },
      didDrawPage:()=>{
        const pageHeight=doc.internal.pageSize.getHeight()
        doc.setFontSize(7)
        doc.setTextColor(109,120,158)
        doc.text(`KOMTROL · ${filtered.length} registro(s)`,12,pageHeight-6)
        doc.text(`Página ${doc.getNumberOfPages()}`,pageWidth-12,pageHeight-6,{align:'right'})
      },
    })

    const stamp = new Date().toISOString().slice(0,10)
    doc.save(`KOMTROL_Tareas_${stamp}.pdf`)
  }

  async function createCategory() {
    const name = newCategory.trim().toUpperCase()
    if (!name) return
    const { error } = await supabase.from('categories').insert({
      name,
      active: true,
      created_by: userId,
    })
    if (error) {
      setMessage(error.message.includes('duplicate') ? 'La categoría ya existe.' : error.message)
      return
    }
    setCategories((current) => Array.from(new Set([...current, name])).sort())
    setForm((current) => ({ ...current, category: name }))
    setNewCategory('')
    setShowCategoryCreator(false)
    setMessage(`Categoría ${name} creada.`)
  }

  async function createLabel() {
    const name = newLabel.trim().toUpperCase()
    if (!name) return
    const { data, error } = await supabase.from('task_labels').insert({
      name,
      scope: labelScope,
      project: labelScope === 'PROYECTO' ? (form.project.trim() || profile?.project || null) : null,
      warehouse: labelScope === 'PROYECTO' ? (form.warehouse.trim() || profile?.warehouse || null) : null,
      created_by: userId,
      active: true,
      color: newLabelColor,
    }).select('*').single()
    if (error || !data) {
      setMessage(error?.message?.includes('duplicate') ? 'La etiqueta ya existe en este alcance.' : (error?.message || 'No se pudo crear la etiqueta.'))
      return
    }
    const label = data as TaskLabel
    setLabels((current) => [...current, label].sort((a,b)=>a.name.localeCompare(b.name)))
    setForm((current) => ({ ...current, tags: Array.from(new Set([...current.tags, label.name])) }))
    setNewLabel('')
    setNewLabelColor('#5570D8')
    setShowLabelCreator(false)
    setMessage(`Etiqueta ${label.name} creada y agregada.`)
  }

  function toggleFormTag(tag: string) {
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }))
  }

  async function requestGeneratedTitle(description: string) {
    const source = description.trim()
    if (source.length < 8) return ''

    const { data, error } = await supabase.functions.invoke('generate-task-title', {
      body: {
        description: source,
        context: [form.project, form.warehouse, form.group_name, form.category].filter(Boolean).join(' · '),
      },
    })

    if (error) {
      const fallback = source.replace(/\s+/g, ' ').split(/[.!?;:]/)[0].trim().split(' ').slice(0, 10).join(' ')
      return fallback.charAt(0).toUpperCase() + fallback.slice(1)
    }

    return String(data?.title || '').trim()
  }

  async function generateTaskTitle() {
    if (!form.description.trim()) {
      setMessage('Escribe primero la descripción para generar el título.')
      return
    }
    setTitleGenerating(true)
    const title = await requestGeneratedTitle(form.description)
    setTitleGenerating(false)
    if (!title) {
      setMessage('No se pudo generar un título. Puedes escribirlo manualmente.')
      return
    }
    setForm((current) => ({ ...current, title }))
    setMessage(dataModeMessage())
  }

  function dataModeMessage() {
    return 'Título sugerido a partir de la descripción. Puedes editarlo antes de crear la tarea.'
  }

  async function saveTask(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    let resolvedTitle = form.title.trim()
    if (!resolvedTitle && form.description.trim()) {
      resolvedTitle = await requestGeneratedTitle(form.description)
      if (resolvedTitle) setForm((current) => ({ ...current, title: resolvedTitle }))
    }

    if (!resolvedTitle) {
      setSaving(false)
      setMessage('Ingresa una descripción para generar el título o escribe un título manualmente.')
      return
    }

    if (form.work_type === 'RELEVO') {
      if (!form.relevo_from_shift || !form.relevo_to_shift) {
        setSaving(false)
        setMessage('Selecciona la guardia que entrega y la guardia que recibe el relevo.')
        return
      }
      if (form.relevo_from_shift === form.relevo_to_shift) {
        setSaving(false)
        setMessage('La guardia de origen y destino del relevo deben ser diferentes.')
        return
      }
    }

    const payload = {
      task_no: taskNumber(),
      work_type: form.work_type,
      title: resolvedTitle,
      description: form.description.trim() || null,
      warehouse: form.warehouse.trim() || profile?.warehouse || null,
      project: form.project.trim() || profile?.project || null,
      group_name: form.group_name.trim() || scopeGroup || profile?.group_name || null,
      shift_name: form.work_type === 'RELEVO'
        ? (form.relevo_to_shift || null)
        : (form.shift_name.trim() || scopeShift || profile?.shift_name || null),
      relevo_from_shift: form.work_type === 'RELEVO' ? form.relevo_from_shift : null,
      relevo_to_shift: form.work_type === 'RELEVO' ? form.relevo_to_shift : null,
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
      tags: form.tags,
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
      relevo_from_shift: profile?.shift_name ?? '',
      relevo_to_shift: oppositeShift(profile?.shift_name),
      responsible_id: mode === 'mi-trabajo' || mode === 'area-personal' ? userId : '',
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
        mode === 'area-personal' || workArea === 'MI_TRABAJO'
          ? 'PERSONAL'
          : workArea === 'RELEVOS'
            ? 'RELEVO'
            : 'TAREA',
      responsible_id:
        mode === 'area-personal' || workArea === 'MI_TRABAJO'
          ? userId
          : prev.responsible_id,
      relevo_from_shift: workArea === 'RELEVOS'
        ? (prev.relevo_from_shift || profile?.shift_name || '')
        : prev.relevo_from_shift,
      relevo_to_shift: workArea === 'RELEVOS'
        ? (prev.relevo_to_shift || oppositeShift(profile?.shift_name))
        : prev.relevo_to_shift,
      warehouse: scopeWarehouse ?? (prev.warehouse || profile?.warehouse || ''),
      project: scopeProject ?? (prev.project || profile?.project || ''),
      group_name: scopeGroup ?? (prev.group_name || profile?.group_name || ''),
      shift_name: scopeShift ?? (prev.shift_name || profile?.shift_name || ''),
    }))
    setShowForm(true)
  }



  return (
    <div className="work-module">
      <section className="panel compact-panel work-panel">
        <div className="work-command-bar work-command-bar-actions-only">
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
          <div className="work-command-actions">
            <button type="button" className="secondary-button compact-action" onClick={() => setShowCategoryCreator((value) => !value)}><Plus size={14} /> Categoría</button>
            <button type="button" className="secondary-button compact-action" onClick={() => setShowLabelCreator((value) => !value)}><Tag size={14} /> Etiqueta</button>
            <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={18} /></button>
            <button className="primary-button" onClick={openForm}><Plus size={17} /> {workArea === 'RELEVOS' ? 'Nuevo relevo' : 'Nueva tarea'}</button>
          </div>
        </div>

        {(showCategoryCreator || showLabelCreator) && (
          <div className="work-inline-creators">
            {showCategoryCreator && (
              <div className="work-inline-create">
                <b>Nueva categoría</b>
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Ej. ADMINISTRATIVA" />
                <button type="button" className="primary-button" onClick={createCategory} disabled={!newCategory.trim()}>Crear</button>
                <button type="button" className="icon-button" onClick={() => setShowCategoryCreator(false)}><X size={16}/></button>
              </div>
            )}
            {showLabelCreator && (
              <div className="work-inline-create label-create">
                <b>Nueva etiqueta</b>
                <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ej. OC OBSERVADAS" />
                <input className="label-color-picker" type="color" value={newLabelColor} onChange={(e)=>setNewLabelColor(e.target.value.toUpperCase())} title="Color de etiqueta" />
                <select value={labelScope} onChange={(e) => setLabelScope(e.target.value as 'PROYECTO' | 'PERSONAL')}>
                  <option value="PROYECTO">Proyecto</option>
                  <option value="PERSONAL">Personal</option>
                </select>
                <button type="button" className="primary-button" onClick={createLabel} disabled={!newLabel.trim()}>Crear</button>
                <button type="button" className="icon-button" onClick={() => setShowLabelCreator(false)}><X size={16}/></button>
              </div>
            )}
          </div>
        )}

        <div className="task-kpis">
          <div><ClipboardList size={17} /><span><b>{counts.total}</b><small>Total</small></span></div>
          <div><AlertTriangle size={17} /><span><b>{counts.pending}</b><small>Pendientes</small></span></div>
          <div className={counts.overdue ? 'danger-kpi' : ''}><CalendarDays size={17} /><span><b>{counts.overdue}</b><small>Vencidas</small></span></div>
          <div><CheckCircle2 size={17} /><span><b>{counts.closed}</b><small>Cerradas</small></span></div>
          <div><Columns3 size={17} /><span><b>{counts.average}%</b><small>Avance</small></span></div>
        </div>

        <div className="task-toolbar task-filter-toolbar">
          <div className="search task-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarea, proyecto, grupo, categoría…" /></div>

          <select aria-label="Filtrar por estado" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value as 'TODOS' | Task['status'])}>
            <option value="TODOS">Todos los estados</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="EN_PROCESO">En proceso</option>
            <option value="BLOQUEADO">Bloqueado</option>
            <option value="CERRADO">Cerrado</option>
            <option value="VENCIDA">Vencida</option>
          </select>

          <select aria-label="Filtrar por prioridad" value={priorityFilter} onChange={(e)=>setPriorityFilter(e.target.value as 'TODAS' | Task['priority'])}>
            <option value="TODAS">Todas las prioridades</option>
            <option value="BAJA">Baja</option>
            <option value="MEDIA">Media</option>
            <option value="ALTA">Alta</option>
            <option value="URGENTE">Urgente</option>
          </select>

          <select aria-label="Filtrar por categoría" value={categoryFilter} onChange={(e)=>setCategoryFilter(e.target.value)}>
            <option value="TODAS">Todas las categorías</option>
            {categories.map((category)=><option key={category} value={category}>{category}</option>)}
          </select>

          <select aria-label="Filtrar por responsable" value={responsibleFilter} onChange={(e)=>setResponsibleFilter(e.target.value)}>
            <option value="TODOS">Todos los responsables</option>
            {scopedProfiles.map((p)=><option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
          </select>

          <div className="task-export-actions">
            <button type="button" className="secondary-button" onClick={exportTasksPdf} title="Exportar filtro actual a PDF"><FileText size={16}/> PDF</button>
            <button type="button" className="secondary-button" onClick={exportTasksExcel} title="Exportar filtro actual a Excel"><FileSpreadsheet size={16}/> Excel</button>
          </div>
        </div>

        {message && <div className="inline-message">{message}</div>}

        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando trabajo…</p></div>
        ) : workView === 'TABLERO' ? (
          <TaskBoard tasks={filtered} profiles={profiles} labels={labels} onUpdate={updateTask} onOpen={setSelectedTask} />
        ) : workView === 'CALENDARIO' ? (
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
          <TaskList tasks={filtered} profiles={profiles} labels={labels} onUpdate={updateTask} onOpen={setSelectedTask} />
        )}
      </section>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          userId={userId}
          profiles={profiles}
          labelColors={Object.fromEntries(labels.map((label)=>[label.name,label.color]))}
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
              <label className="task-priority-label">Prioridad
                <div className="priority-field">
                  <span className={`priority-dot p-${form.priority.toLowerCase()}`} />
                  <select className="priority-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })}>
                    <option value="BAJA">Baja</option>
                    <option value="MEDIA">Media</option>
                    <option value="ALTA">Alta</option>
                    <option value="URGENTE">Urgente</option>
                  </select>
                </div>
              </label>
              <label className="task-title-label">Título
                <div className="ai-title-field">
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Se generará desde la descripción" />
                  <button type="button" className="secondary-button ai-title-button" onClick={generateTaskTitle} disabled={titleGenerating || !form.description.trim()}>
                    {titleGenerating ? <RefreshCw className="spin" size={16}/> : <Sparkles size={16}/>}
                    {titleGenerating ? 'Generando…' : 'Generar título'}
                  </button>
                </div>
              </label>
              <label className="span-2">Descripción
                <textarea
                  rows={3}
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  onBlur={() => { if (!form.title.trim() && form.description.trim().length >= 12) void generateTaskTitle() }}
                  placeholder="Describe la actividad; KOMTROL sugerirá el título automáticamente…"
                />
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
              {form.work_type === 'RELEVO' && (
                <>
                  <label>Guardia que entrega *
                    <select value={form.relevo_from_shift} onChange={(e) => setForm({ ...form, relevo_from_shift: e.target.value })}>
                      <option value="">Seleccionar</option>
                      <option value="GUARDIA A">Guardia A</option>
                      <option value="GUARDIA B">Guardia B</option>
                    </select>
                  </label>
                  <label>Guardia que recibe *
                    <select value={form.relevo_to_shift} onChange={(e) => setForm({ ...form, relevo_to_shift: e.target.value })}>
                      <option value="">Seleccionar</option>
                      <option value="GUARDIA A">Guardia A</option>
                      <option value="GUARDIA B">Guardia B</option>
                    </select>
                  </label>
                  <div className="relevo-route-preview span-2">
                    <RefreshCw size={16}/>
                    <span><b>{form.relevo_from_shift || 'Guardia origen'}</b><i>→</i><b>{form.relevo_to_shift || 'Guardia destino'}</b></span>
                    <small>El pendiente quedará trazado como entrega formal entre guardias.</small>
                  </div>
                </>
              )}
              <label>Responsable
                <select value={form.responsible_id} disabled={form.work_type === 'PERSONAL'} onChange={(e) => setForm({ ...form, responsible_id: e.target.value })}>
                  <option value="">Sin asignar</option>
                  {scopedProfiles.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
                </select>
              </label>
              <label>Categoría
                <div className="form-inline-select">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <button type="button" className="icon-button" title="Nueva categoría" onClick={() => setShowCategoryCreator((value)=>!value)}><Plus size={16}/></button>
                </div>
                {showCategoryCreator && (
                  <div className="form-inline-creator">
                    <input value={newCategory} onChange={(e)=>setNewCategory(e.target.value)} placeholder="Nueva categoría" />
                    <button type="button" className="primary-button" disabled={!newCategory.trim()} onClick={createCategory}>Crear</button>
                  </div>
                )}
              </label>
              <label>Fecha límite
                <input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
              </label>
              <label>Duración estimada (horas)
                <input type="number" min="0" step="0.5" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} />
              </label>
              <label className="span-2">Etiquetas
                <div className="task-form-tags">
                  <div className="task-form-tag-list">
                    {labels
                      .filter((label) => label.scope === 'PERSONAL' ? label.created_by === userId : (!label.project || label.project === (form.project || profile?.project)))
                      .map((label) => (
                        <button
                          type="button"
                          key={label.id}
                          className={form.tags.includes(label.name) ? 'active' : ''}
                          style={{
                            color: label.color,
                            borderColor: `${label.color}55`,
                            background: form.tags.includes(label.name) ? `${label.color}22` : `${label.color}0D`,
                          }}
                          onClick={() => toggleFormTag(label.name)}
                        >
                          <Tag size={12}/> {label.name}
                        </button>
                      ))}
                    {!labels.length && <span>Sin etiquetas creadas.</span>}
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setShowLabelCreator((value)=>!value)}><Plus size={14}/> Nueva etiqueta</button>
                </div>
                {showLabelCreator && (
                  <div className="form-inline-creator label">
                    <input value={newLabel} onChange={(e)=>setNewLabel(e.target.value)} placeholder="Nueva etiqueta" />
                    <input className="label-color-picker" type="color" value={newLabelColor} onChange={(e)=>setNewLabelColor(e.target.value.toUpperCase())} title="Color de etiqueta" />
                    <select value={labelScope} onChange={(e)=>setLabelScope(e.target.value as 'PROYECTO' | 'PERSONAL')}>
                      <option value="PROYECTO">Proyecto</option>
                      <option value="PERSONAL">Personal</option>
                    </select>
                    <button type="button" className="primary-button" disabled={!newLabel.trim()} onClick={createLabel}>Crear</button>
                  </div>
                )}
              </label>
              <label className="span-2">Asunto del correo
                <input value={form.email_subject} onChange={(e) => setForm({ ...form, email_subject: e.target.value })} placeholder="Solo si existe un correo asociado" />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="primary-button" disabled={saving || titleGenerating || (!form.title.trim() && !form.description.trim())}>
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

function TaskList({ tasks, profiles, labels, onUpdate, onOpen }: { tasks: Task[]; profiles: Profile[]; labels: TaskLabel[]; onUpdate: (task: Task, changes: Partial<Task>) => void; onOpen: (task: Task) => void }) {
  const name = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? (id ? 'Usuario' : 'Sin asignar')
  const colorFor = (tag: string) => labels.find((label)=>label.name===tag)?.color || '#5570D8'
  if (!tasks.length) return <EmptyWork />

  return (
    <div className="table-wrap tasks-table professional-task-list">
      <table>
        <thead>
          <tr>
            <th>Tipo / Prioridad</th>
            <th>Tarea</th>
            <th>Contexto</th>
            <th>Clasificación</th>
            <th>Responsable</th>
            <th>Vence</th>
            <th>Estado / Avance</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className={isOverdue(task) ? 'overdue-row task-open-row' : 'task-open-row'} onClick={() => onOpen(task)}>
              <td>
                <div className="task-type-priority">
                  <span className="task-type-chip">{task.work_type}</span>
                  <span className={`priority-chip p-${task.priority.toLowerCase()}`}>{task.priority}</span>
                </div>
              </td>
              <td className="task-list-title">
                <b>{task.title}</b>
                <small>{task.task_no}</small>
              </td>
              <td>
                <b>{task.project || '—'}</b>
                <small>{task.group_name || task.warehouse || '—'}</small>
                {task.work_type === 'RELEVO' && (
                  <span className="relevo-route-chip">{task.relevo_from_shift || task.shift_name || 'Guardia'} <i>→</i> {task.relevo_to_shift || 'Guardia destino'}</span>
                )}
              </td>
              <td>
                <div className="task-classification">
                  {task.category && <span className="category-chip">{task.category}</span>}
                  {(task.tags || []).slice(0,3).map((tag)=>{
                    const color=colorFor(tag)
                    return <span className="tag-chip" style={{color,borderColor:`${color}55`,background:`${color}14`}} key={tag}><Tag size={10}/>{tag}</span>
                  })}
                  {(task.tags || []).length > 3 && <small>+{task.tags.length - 3}</small>}
                </div>
              </td>
              <td><span className="user-inline"><UserRound size={14} /> {name(task.responsible_id)}</span></td>
              <td>{shortDate(task.due_at)}{isOverdue(task) && <small className="error-line">Vencida</small>}</td>
              <td>
                <div className="task-status-progress" onClick={(e)=>e.stopPropagation()}>
                  <select className="inline-select" value={task.status} onChange={(e) => onUpdate(task, { status: e.target.value as Task['status'] })}>
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="EN_PROCESO">En proceso</option>
                    <option value="BLOQUEADO">Bloqueado</option>
                    <option value="CERRADO">Cerrado</option>
                  </select>
                  <div className="task-inline-progress"><i style={{width:`${task.progress}%`}}/><span>{task.progress}%</span></div>
                </div>
              </td>
              <td>
                <div className="task-list-actions" onClick={(e)=>e.stopPropagation()}>
                  {task.status !== 'CERRADO' ? (
                    <button
                      type="button"
                      className="task-complete-button"
                      onClick={() => onUpdate(task, { status: 'CERRADO', progress: 100 })}
                      title="Completar tarea"
                    >
                      <CheckCircle2 size={15}/> Completar
                    </button>
                  ) : (
                    <span className="task-completed-label"><CheckCircle2 size={14}/> Completada</span>
                  )}
                  <button className="icon-button task-open-action" onClick={() => onOpen(task)} title="Abrir detalle"><ChevronRight size={16}/></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TaskBoard({ tasks, profiles, labels, onUpdate, onOpen }: { tasks: Task[]; profiles: Profile[]; labels: TaskLabel[]; onUpdate: (task: Task, changes: Partial<Task>) => void; onOpen: (task: Task) => void }) {
  const columns: Task['status'][] = ['PENDIENTE', 'EN_PROCESO', 'BLOQUEADO', 'CERRADO']
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<Task['status'] | null>(null)
  const name = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? 'Sin asignar'
  const colorFor = (tag: string) => labels.find((label)=>label.name===tag)?.color || '#5570D8'
  const labelFor = (status: Task['status']) => ({
    PENDIENTE: 'Pendiente',
    EN_PROCESO: 'En proceso',
    BLOQUEADO: 'Bloqueado',
    CERRADO: 'Cerrado',
    VENCIDA: 'Vencida',
  }[status] || status)

  function dropOn(status: Task['status']) {
    const task = tasks.find((item)=>item.id===draggedTaskId)
    setDragOverStatus(null)
    setDraggedTaskId(null)
    if (!task || task.status===status) return
    onUpdate(task, { status, ...(status==='CERRADO' ? { progress: 100 } : {}) })
  }

  return (
    <div className="task-board-shell">
      <div className="task-board-help"><Columns3 size={15}/><span>Arrastra una tarjeta entre columnas para cambiar su estado. También puedes usar el selector dentro de cada tarea.</span></div>
      <div className="task-board">
        {columns.map((status) => {
          const items = tasks.filter((t) => t.status === status)
          const isOver = dragOverStatus===status
          return (
            <div
              className={isOver ? 'board-column is-drag-over' : 'board-column'}
              key={status}
              onDragOver={(e)=>{e.preventDefault();setDragOverStatus(status)}}
              onDragLeave={(e)=>{if(!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStatus(null)}}
              onDrop={(e)=>{e.preventDefault();dropOn(status)}}
            >
              <div className={`board-column-head board-status-${status.toLowerCase()}`}>
                <div><i/><b>{labelFor(status)}</b></div>
                <span>{items.length}</span>
              </div>
              <div className="board-cards">
                {items.map((task) => (
                  <article
                    className={`task-card task-open-card board-draggable-card ${isOverdue(task) ? 'overdue-card' : ''} ${draggedTaskId===task.id ? 'is-dragging' : ''}`}
                    key={task.id}
                    draggable
                    onDragStart={(e)=>{
                      setDraggedTaskId(task.id)
                      e.dataTransfer.effectAllowed='move'
                      e.dataTransfer.setData('text/plain',task.id)
                    }}
                    onDragEnd={()=>{setDraggedTaskId(null);setDragOverStatus(null)}}
                    onClick={() => onOpen(task)}
                  >
                    <div className="task-card-top">
                      <span className={`priority-dot p-${task.priority.toLowerCase()}`} />
                      <small>{task.task_no}</small>
                      <span className="board-drag-handle" title="Arrastrar">⋮⋮</span>
                    </div>
                    <b>{task.title}</b>
                    <p>{task.project || task.warehouse || 'Sin proyecto'}{task.group_name ? ` · ${task.group_name}` : ''}</p>
                    {task.work_type === 'RELEVO' && <div className="relevo-route-chip board-route">{task.relevo_from_shift || task.shift_name || 'Guardia'} <i>→</i> {task.relevo_to_shift || 'Guardia destino'}</div>}
                    {(task.tags || []).length > 0 && <div className="task-card-tags">{task.tags.slice(0,2).map((tag)=>{
                      const color=colorFor(tag)
                      return <span key={tag} style={{color,borderColor:`${color}55`,background:`${color}14`}}>{tag}</span>
                    })}</div>}
                    <div className="task-card-meta"><span><UserRound size={13} /> {name(task.responsible_id)}</span><span><CalendarDays size={13} /> {shortDate(task.due_at)}</span></div>
                    <div className="progress-bar"><i style={{ width: `${task.progress}%` }} /></div>
                    <div className="task-card-actions" onClick={(e)=>e.stopPropagation()}>
                      <select value={task.status} onChange={(e) => onUpdate(task, { status: e.target.value as Task['status'] })}>
                        {columns.map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}
                      </select>
                      <select value={task.progress} onChange={(e) => onUpdate(task, { progress: Number(e.target.value) })}>
                        {[0, 25, 50, 75, 100].map((v) => <option key={v} value={v}>{v}%</option>)}
                      </select>
                    </div>
                  </article>
                ))}
                {!items.length && <div className={isOver ? 'board-empty active-drop' : 'board-empty'}>{isOver ? 'Suelta aquí' : 'Sin registros'}</div>}
              </div>
            </div>
          )
        })}
      </div>
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

function startOfMonth(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0)
  return next
}

function monthOffset(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0)
}

function monthCalendarCells(month: Date) {
  const first = startOfMonth(month)
  const mondayIndex = (first.getDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - mondayIndex)
  return Array.from({ length: 42 }, (_, index) => {
    const cell = new Date(gridStart)
    cell.setDate(gridStart.getDate() + index)
    cell.setHours(12,0,0,0)
    return cell
  })
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
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const name = (id: string | null) => profiles.find((p) => p.user_id === id)?.full_name ?? 'Sin asignar'
  const dayCells = useMemo(() => monthCalendarCells(calendarMonth), [calendarMonth])
  const monthValue = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,'0')}`

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

  const todayKey = localDateKey(startOfToday())
  const monthLabel = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(calendarMonth)
  const weekdays=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

  return (
    <div className="calendar-month-shell">
      <div className="calendar-month-controls">
        <div>
          <b>{monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1)}</b>
          <span>Vista mensual completa · tareas, relevos e incidencias</span>
        </div>
        <div className="calendar-month-nav">
          <button className="icon-button" onClick={() => setCalendarMonth((current)=>monthOffset(current,-1))} title="Mes anterior"><ChevronLeft size={18}/></button>
          <button className="secondary-button calendar-today-button" onClick={() => setCalendarMonth(startOfMonth(new Date()))}>Hoy</button>
          <input
            className="calendar-month-picker"
            type="month"
            value={monthValue}
            onChange={(e)=>{
              const [year,month]=e.target.value.split('-').map(Number)
              if(year&&month) setCalendarMonth(new Date(year,month-1,1,12,0,0,0))
            }}
            aria-label="Seleccionar mes"
          />
          <button className="icon-button" onClick={() => setCalendarMonth((current)=>monthOffset(current,1))} title="Mes siguiente"><ChevronRight size={18}/></button>
        </div>
      </div>

      <div className="calendar-30-legend">
        <span><i className="calendar-legend-dot task" /> Tarea / pendiente</span>
        <span><i className="calendar-legend-dot relevo" /> Relevo</span>
        <span><i className="calendar-legend-dot incident" /> Incidencia</span>
      </div>

      <div className="calendar-weekdays">
        {weekdays.map((day)=><span key={day}>{day}</span>)}
      </div>

      <div className="calendar-month-grid">
        {dayCells.map((date) => {
          const key = localDateKey(date)
          const dayTasks = taskByDay[key] ?? []
          const dayIncidents = incidentByDay[key] ?? []
          const total = dayTasks.length + dayIncidents.length
          const isToday = key === todayKey
          const inMonth = date.getMonth()===calendarMonth.getMonth() && date.getFullYear()===calendarMonth.getFullYear()

          return (
            <section className={`calendar-month-day ${isToday?'is-today ':''}${!inMonth?'is-outside-month':''}`} key={key}>
              <div className="calendar-month-day-head">
                <b>{date.getDate()}</b>
                {total>0&&<span>{total}</span>}
              </div>

              <div className="calendar-month-events">
                {dayTasks.slice(0,4).map((task) => (
                  <button
                    key={task.id}
                    className={`calendar-event calendar-event-task ${task.work_type==='RELEVO'?'is-relevo ':''}${isOverdue(task) ? 'is-overdue' : ''}`}
                    onClick={() => onOpen(task)}
                    title={`${task.title} · ${name(task.responsible_id)}`}
                  >
                    <i className={`priority-dot p-${task.priority.toLowerCase()}`} />
                    <span>
                      <small>{task.work_type === 'RELEVO' ? 'RELEVO' : task.work_type === 'PERSONAL' ? 'PERSONAL' : 'TAREA'}</small>
                      <b>{task.title}</b>
                    </span>
                  </button>
                ))}

                {dayIncidents.slice(0,3).map((incident) => (
                  <button
                    key={incident.id}
                    className="calendar-event calendar-event-incident"
                    onClick={() => onOpenIncident(incident)}
                    title={`Abrir ${incident.incident_no}`}
                  >
                    <AlertTriangle size={12} />
                    <span><small>INCIDENCIA</small><b>{incident.incident_no}</b></span>
                  </button>
                ))}

                {total > 7 && <span className="calendar-more-events">+{total-7} más</span>}
              </div>
            </section>
          )
        })}
      </div>
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
