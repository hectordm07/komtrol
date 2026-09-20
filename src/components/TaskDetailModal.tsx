import { type ClipboardEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  AtSign,
  Bell,
  CalendarPlus,
  CheckCircle2,
  CheckSquare2,
  CircleAlert,
  Info,
  ChevronDown,
  ChevronUp,
  Clock3,
  Edit3,
  FileText,
  History,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Tag,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type AssignmentType = 'PERSONAL' | 'PERSONA' | 'GRUPO' | 'GUARDIA'
type SubtaskAssignmentType = 'PERSONA' | 'GRUPO' | 'GUARDIA'

export type TaskDetailProfile = {
  user_id: string
  full_name: string
  role: 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
  shift_name?: string | null
}

export type TaskDetailTask = {
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
  assignment_type: AssignmentType
  assigned_user_id: string | null
  assigned_group: string | null
  assigned_shift: string | null
  created_by: string
  category: string | null
  tags: string[]
  priority: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  status: 'PENDIENTE' | 'EN_PROCESO' | 'BLOQUEADO' | 'CERRADO' | 'VENCIDA'
  progress: number
  start_at: string | null
  due_at: string | null
  original_due_at?: string | null
  closed_at: string | null
  estimated_hours: number | null
  email_subject: string | null
  extensions_count: number
  created_at: string
  updated_at: string
}

type TaskComment = {
  id: string
  task_id: string
  comment: string
  created_by: string
  created_at: string
}

type TaskHistory = {
  id: number
  task_id: string
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  note: string | null
  changed_by: string
  created_at: string
}

type TaskAttachment = {
  id: string
  task_id: string
  comment_id: string | null
  file_name: string
  storage_path: string
  mime_type: string | null
  file_size: number | null
  created_by: string
  created_at: string
  signed_url?: string
}

type TaskSubtask = {
  id: string
  task_id: string
  title: string
  completed: boolean
  assignment_type: SubtaskAssignmentType
  assigned_user_id: string | null
  assigned_group: string | null
  assigned_shift: string | null
  due_at: string | null
  created_by: string
  completed_by: string | null
  completed_at: string | null
  created_at: string
}

type Props = {
  task: TaskDetailTask
  userId: string
  profiles: TaskDetailProfile[]
  labelColors?: Record<string,string>
  onClose: () => void
  onTaskUpdated: (task: TaskDetailTask) => void
}

function fmtDate(value?: string | null) {
  if (!value) return 'Sin registro'
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function fmtDateOnly(value?: string | null) {
  if (!value) return 'Sin definir'
  return new Intl.DateTimeFormat('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function daysBetween(from?: string | null, to?: string | null) {
  if (!from) return 0
  const start = new Date(from).getTime()
  const end = to ? new Date(to).getTime() : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, (end - start) / 86_400_000)
}

function signedDaysBetween(from?: string | null, to?: string | null) {
  if (!from || !to) return 0
  const start = new Date(from).getTime()
  const end = new Date(to).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return (end - start) / 86_400_000
}

function toLocalInput(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

function fileSize(value?: number | null) {
  if (!value) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function safeFileName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function TaskDetailModal({ task: initialTask, userId, profiles, labelColors = {}, onClose, onTaskUpdated }: Props) {
  const [task, setTask] = useState<TaskDetailTask>(initialTask)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [history, setHistory] = useState<TaskHistory[]>([])
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [showHistory, setShowHistory] = useState(true)
  const [showSubtasks, setShowSubtasks] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [subtaskAssignmentType, setSubtaskAssignmentType] = useState<SubtaskAssignmentType>('PERSONA')
  const [subtaskAssignedUser, setSubtaskAssignedUser] = useState(userId)
  const [subtaskAssignedGroup, setSubtaskAssignedGroup] = useState(initialTask.group_name || '')
  const [subtaskAssignedShift, setSubtaskAssignedShift] = useState(initialTask.relevo_to_shift || initialTask.shift_name || '')
  const [subtaskDueAt, setSubtaskDueAt] = useState('')
  const [extensionOpen, setExtensionOpen] = useState(false)
  const [extensionDue, setExtensionDue] = useState(toLocalInput(initialTask.due_at))
  const [extensionNote, setExtensionNote] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    title: initialTask.title,
    description: initialTask.description || '',
    priority: initialTask.priority,
    category: initialTask.category || '',
    assignment_type: initialTask.assignment_type === 'PERSONAL' ? 'PERSONA' as SubtaskAssignmentType : initialTask.assignment_type as SubtaskAssignmentType,
    assigned_user_id: initialTask.assigned_user_id || userId,
    assigned_group: initialTask.assigned_group || initialTask.group_name || '',
    assigned_shift: initialTask.assigned_shift || initialTask.shift_name || '',
    tags: (initialTask.tags || []).join(', '),
    due_at: toLocalInput(initialTask.due_at),
    email_subject: initialTask.email_subject || '',
  })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const currentProfile = profiles.find((p) => p.user_id === userId)
  const assignedToCurrentUser =
    task.assigned_user_id === userId ||
    (task.assignment_type === 'GRUPO' && task.assigned_group && task.assigned_group === currentProfile?.group_name) ||
    (task.assignment_type === 'GUARDIA' && task.assigned_shift && task.assigned_shift === currentProfile?.shift_name)

  const canEdit =
    task.created_by === userId ||
    task.responsible_id === userId ||
    assignedToCurrentUser ||
    currentProfile?.role === 'ADMINISTRADOR' ||
    currentProfile?.role === 'COORDINADOR'
  const canDeleteAnyComment = currentProfile?.role === 'ADMINISTRADOR'

  const profileName = (id?: string | null) =>
    profiles.find((profile) => profile.user_id === id)?.full_name || (id ? 'Usuario' : 'Sin asignar')

  const scopedProfiles = profiles.filter((profile) => {
    if (task.warehouse && profile.warehouse !== task.warehouse) return false
    if (task.project && profile.project !== task.project) return false
    return true
  })

  const scopedGroups = Array.from(new Set(
    scopedProfiles.map((profile)=>profile.group_name).filter((value): value is string=>Boolean(value))
  )).sort()

  const scopedShifts = Array.from(new Set(
    scopedProfiles.map((profile)=>profile.shift_name).filter((value): value is string=>Boolean(value))
  )).sort()

  const taskAssignmentLabel = () => {
    if (task.assignment_type === 'PERSONA' || task.assignment_type === 'PERSONAL') return profileName(task.assigned_user_id || task.responsible_id)
    if (task.assignment_type === 'GRUPO') return task.assigned_group || task.group_name || 'Grupo'
    return task.assigned_shift || task.shift_name || 'Guardia'
  }

  const subtaskAssignmentLabel = (row: TaskSubtask) => {
    if (row.assignment_type === 'PERSONA') return profileName(row.assigned_user_id)
    if (row.assignment_type === 'GRUPO') return row.assigned_group || 'Grupo'
    return row.assigned_shift || 'Guardia'
  }

  const canToggleSubtask = (row: TaskSubtask) =>
    canEdit ||
    row.assigned_user_id === userId ||
    (row.assignment_type === 'GRUPO' && row.assigned_group === currentProfile?.group_name) ||
    (row.assignment_type === 'GUARDIA' && row.assigned_shift === currentProfile?.shift_name)

  async function loadDetail() {
    setLoading(true)
    setMessage('')

    const [commentRes, historyRes, attachmentRes, subtaskRes, taskRes] = await Promise.all([
      supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at', { ascending: true }),
      supabase.from('task_history').select('*').eq('task_id', task.id).order('created_at', { ascending: false }),
      supabase.from('task_attachments').select('*').eq('task_id', task.id).order('created_at', { ascending: true }),
      supabase.from('task_subtasks').select('*').eq('task_id', task.id).order('created_at', { ascending: true }),
      supabase.from('tasks').select('*').eq('id', task.id).single(),
    ])

    const error = commentRes.error || historyRes.error || attachmentRes.error || subtaskRes.error || taskRes.error
    if (error) setMessage(error.message)

    setComments((commentRes.data ?? []) as TaskComment[])
    setHistory((historyRes.data ?? []) as TaskHistory[])
    setSubtasks((subtaskRes.data ?? []) as TaskSubtask[])

    const rawAttachments = (attachmentRes.data ?? []) as TaskAttachment[]
    const withUrls = await Promise.all(rawAttachments.map(async (attachment) => {
      const { data } = await supabase.storage
        .from('task-attachments')
        .createSignedUrl(attachment.storage_path, 3600)
      return { ...attachment, signed_url: data?.signedUrl }
    }))
    setAttachments(withUrls)

    if (taskRes.data) {
      const fresh = taskRes.data as TaskDetailTask
      setTask(fresh)
      onTaskUpdated(fresh)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadDetail()
  }, [initialTask.id])

  const mentionMatch = useMemo(() => comment.match(/@([^@\n]{0,50})$/), [comment])
  const mentionQuery = mentionMatch?.[1]?.trim().toLowerCase() ?? ''
  const mentionCandidates = useMemo(() => {
    if (!mentionMatch) return []
    return profiles
      .filter((profile) => profile.user_id !== userId)
      .filter((profile) => !mentionQuery || profile.full_name.toLowerCase().includes(mentionQuery))
      .slice(0, 6)
  }, [mentionMatch, mentionQuery, profiles, userId])

  const completedSubtasks = subtasks.filter((item) => item.completed).length
  const elapsedDays = daysBetween(task.created_at, task.closed_at)
  const estimatedDays = task.estimated_hours ? Number(task.estimated_hours) / 24 : null
  const diffVsEstimated = estimatedDays == null ? null : elapsedDays - estimatedDays
  const originalDue = task.original_due_at || task.due_at
  const delayVsOriginal = signedDaysBetween(originalDue, task.due_at)
  const originalCompliance = !originalDue
    ? 'Sin fecha'
    : task.closed_at
      ? (new Date(task.closed_at) <= new Date(originalDue) ? 'Cumplido' : 'Fuera de fecha')
      : (new Date() <= new Date(originalDue) ? 'En seguimiento' : 'Vencida')

  const commentAttachments = (commentId: string) => attachments.filter((item) => item.comment_id === commentId)

  function selectMention(profile: TaskDetailProfile) {
    if (!mentionMatch) return
    const start = (mentionMatch.index ?? comment.length) + 1
    const before = comment.slice(0, start)
    const next = `${before}${profile.full_name} `
    setComment(next)
    setMentionIds((current) => current.includes(profile.user_id) ? current : [...current, profile.user_id])
  }

  function addFiles(nextFiles: File[]) {
    const accepted = nextFiles.filter((file) => file.size <= 8 * 1024 * 1024)
    if (accepted.length !== nextFiles.length) setMessage('Algunos archivos superan el máximo de 8 MB y fueron omitidos.')
    setFiles((current) => [...current, ...accepted].slice(0, 8))
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted: File[] = []
    for (const item of Array.from(event.clipboardData.items)) {
      if (item.kind !== 'file') continue
      const blob = item.getAsFile()
      if (!blob) continue
      const extension = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'bin'
      pasted.push(new File([blob], `imagen-pegada-${Date.now()}.${extension}`, { type: blob.type }))
    }
    if (pasted.length) addFiles(pasted)
  }

  async function publishComment(event: FormEvent) {
    event.preventDefault()
    if (!comment.trim() && !files.length) return

    setPublishing(true)
    setMessage('')

    const text = comment.trim() || 'Archivo adjunto.'
    const { data: created, error } = await supabase
      .from('task_comments')
      .insert({
        task_id: task.id,
        comment: text,
        created_by: userId,
      })
      .select('*')
      .single()

    if (error || !created) {
      setPublishing(false)
      setMessage(error?.message || 'No se pudo publicar el comentario.')
      return
    }

    for (const file of files) {
      const path = `${userId}/${task.id}/${created.id}/${Date.now()}-${safeFileName(file.name)}`
      const { error: uploadError } = await supabase.storage
        .from('task-attachments')
        .upload(path, file, { upsert: false })

      if (uploadError) continue

      await supabase.from('task_attachments').insert({
        task_id: task.id,
        comment_id: created.id,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        file_size: file.size,
        created_by: userId,
      })
    }

    const notifyIds = Array.from(new Set([
      task.responsible_id,
      task.created_by,
      ...mentionIds,
    ].filter(Boolean) as string[])).filter((id) => id !== userId)

    if (notifyIds.length) {
      await supabase.from('app_notifications').insert(
        notifyIds.map((id) => {
          const explicitlyMentioned = mentionIds.includes(id)
          return {
            user_id: id,
            notification_type: explicitlyMentioned ? 'MENTION' : 'TASK_COMMENT',
            title: explicitlyMentioned
              ? `${profileName(userId)} te mencionó en una tarea`
              : `${profileName(userId)} comentó una tarea`,
            message: `${task.task_no} · ${text.slice(0, 200)}`,
            task_id: task.id,
            created_by: userId,
            metadata: { comment_id: created.id, task_no: task.task_no },
          }
        })
      )
    }

    await supabase.from('task_history').insert({
      task_id: task.id,
      action: 'COMENTARIO',
      field_name: 'comment',
      old_value: null,
      new_value: null,
      note: text.slice(0, 500),
      changed_by: userId,
    })

    setComment('')
    setFiles([])
    setMentionIds([])
    setPublishing(false)
    await loadDetail()
  }

  async function deleteComment(row: TaskComment) {
    const linked = commentAttachments(row.id)
    if (linked.length) {
      await supabase.storage
        .from('task-attachments')
        .remove(linked.map((item) => item.storage_path))
    }
    const { error } = await supabase.from('task_comments').delete().eq('id', row.id)
    if (error) {
      setMessage(error.message)
      return
    }
    await loadDetail()
  }

  async function notifyResponsible() {
    const assignedRecipients = scopedProfiles
      .filter((profile) => {
        if (task.assignment_type === 'PERSONA' || task.assignment_type === 'PERSONAL') return profile.user_id === task.assigned_user_id
        if (task.assignment_type === 'GRUPO') return profile.group_name === task.assigned_group
        if (task.assignment_type === 'GUARDIA') return profile.shift_name === task.assigned_shift
        return false
      })
      .map((profile)=>profile.user_id)

    const recipients = Array.from(new Set([
      task.responsible_id,
      task.created_by,
      ...assignedRecipients,
    ].filter(Boolean) as string[])).filter((id) => id !== userId)

    if (!recipients.length) {
      setMessage('No hay otro responsable o creador a quien avisar.')
      return
    }

    const { error } = await supabase.from('app_notifications').insert(
      recipients.map((id) => ({
        user_id: id,
        notification_type: 'TASK_REMINDER',
        title: `${profileName(userId)} solicita revisar una tarea`,
        message: `${task.task_no} · ${task.title}`,
        task_id: task.id,
        created_by: userId,
        metadata: { task_no: task.task_no },
      }))
    )

    setMessage(error ? error.message : 'Aviso enviado correctamente.')
  }

  async function saveExtension(event: FormEvent) {
    event.preventDefault()
    if (!extensionDue) return
    const nextDue = new Date(extensionDue).toISOString()
    const previous = task.due_at

    const { data, error } = await supabase
      .from('tasks')
      .update({
        due_at: nextDue,
        extensions_count: Number(task.extensions_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)
      .select('*')
      .single()

    if (error || !data) {
      setMessage(error?.message || 'No se pudo ampliar la fecha.')
      return
    }

    await supabase.from('task_history').insert({
      task_id: task.id,
      action: 'AMPLIACION',
      field_name: 'due_at',
      old_value: previous,
      new_value: nextDue,
      note: extensionNote.trim() || null,
      changed_by: userId,
    })

    const recipient = task.responsible_id && task.responsible_id !== userId ? task.responsible_id : null
    if (recipient) {
      await supabase.from('app_notifications').insert({
        user_id: recipient,
        notification_type: 'TASK_EXTENSION',
        title: 'Fecha de tarea ampliada',
        message: `${task.task_no} ahora vence el ${fmtDate(nextDue)}`,
        task_id: task.id,
        created_by: userId,
        metadata: { previous_due_at: previous, due_at: nextDue },
      })
    }

    const fresh = data as TaskDetailTask
    setTask(fresh)
    onTaskUpdated(fresh)
    setExtensionOpen(false)
    setExtensionNote('')
    await loadDetail()
  }

  async function syncTaskProgressFromSubtasks() {
    const { data, error } = await supabase
      .from('task_subtasks')
      .select('completed')
      .eq('task_id', task.id)

    if (error || !data?.length) return

    const completed = data.filter((row)=>row.completed).length
    const progress = Math.round((completed / data.length) * 100)

    const { data: updated } = await supabase
      .from('tasks')
      .update({ progress, updated_at: new Date().toISOString() })
      .eq('id', task.id)
      .select('*')
      .single()

    if (updated) {
      const fresh = updated as TaskDetailTask
      setTask(fresh)
      onTaskUpdated(fresh)
    }

    if (progress === 100 && task.status !== 'CERRADO') {
      setMessage('Todas las subtareas están completas. La tarea principal está al 100% y ya puede cerrarse.')
    }
  }

  async function addSubtask(event: FormEvent) {
    event.preventDefault()
    if (!subtaskTitle.trim()) return

    if (subtaskAssignmentType === 'PERSONA' && !subtaskAssignedUser) {
      setMessage('Selecciona la persona responsable de la subtarea.')
      return
    }
    if (subtaskAssignmentType === 'GRUPO' && !subtaskAssignedGroup) {
      setMessage('Selecciona el grupo responsable de la subtarea.')
      return
    }
    if (subtaskAssignmentType === 'GUARDIA' && !subtaskAssignedShift) {
      setMessage('Selecciona la guardia responsable de la subtarea.')
      return
    }

    const { data: created, error } = await supabase.from('task_subtasks').insert({
      task_id: task.id,
      title: subtaskTitle.trim(),
      assignment_type: subtaskAssignmentType,
      assigned_user_id: subtaskAssignmentType === 'PERSONA' ? subtaskAssignedUser : null,
      assigned_group: subtaskAssignmentType === 'GRUPO' ? subtaskAssignedGroup : null,
      assigned_shift: subtaskAssignmentType === 'GUARDIA' ? subtaskAssignedShift : null,
      due_at: subtaskDueAt ? new Date(subtaskDueAt).toISOString() : null,
      created_by: userId,
    }).select('*').single()

    if (error || !created) {
      setMessage(error?.message || 'No se pudo crear la subtarea.')
      return
    }

    const recipients = scopedProfiles
      .filter((profile) => {
        if (subtaskAssignmentType === 'PERSONA') return profile.user_id === subtaskAssignedUser
        if (subtaskAssignmentType === 'GRUPO') return profile.group_name === subtaskAssignedGroup
        return profile.shift_name === subtaskAssignedShift
      })
      .map((profile)=>profile.user_id)
      .filter((id)=>id !== userId)

    const uniqueRecipients = Array.from(new Set(recipients))
    if (uniqueRecipients.length) {
      await supabase.from('app_notifications').insert(
        uniqueRecipients.map((recipientId)=>({
          user_id: recipientId,
          notification_type: 'TASK_ASSIGNED',
          title: 'Nueva subtarea asignada',
          message: `${task.task_no} · ${subtaskTitle.trim()}`,
          task_id: task.id,
          created_by: userId,
          metadata: {
            subtask_id: created.id,
            assignment_type: subtaskAssignmentType,
          },
        }))
      )
    }

    await supabase.from('task_history').insert({
      task_id: task.id,
      action: 'SUBTAREA_CREADA',
      field_name: 'subtask',
      old_value: null,
      new_value: subtaskTitle.trim(),
      note: `Asignada a: ${subtaskAssignmentType === 'PERSONA' ? profileName(subtaskAssignedUser) : subtaskAssignmentType === 'GRUPO' ? subtaskAssignedGroup : subtaskAssignedShift}`,
      changed_by: userId,
    })

    setSubtaskTitle('')
    setSubtaskDueAt('')
    await syncTaskProgressFromSubtasks()
    await loadDetail()
  }

  async function toggleSubtask(row: TaskSubtask) {
    if (!canToggleSubtask(row)) {
      setMessage('No tienes permiso para completar esta subtarea.')
      return
    }

    const completed = !row.completed
    const { error } = await supabase
      .from('task_subtasks')
      .update({
        completed,
        completed_by: completed ? userId : null,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq('id', row.id)

    if (error) {
      setMessage(error.message)
      return
    }

    await supabase.from('task_history').insert({
      task_id: task.id,
      action: completed ? 'SUBTAREA_COMPLETADA' : 'SUBTAREA_REABIERTA',
      field_name: 'subtask',
      old_value: completed ? 'PENDIENTE' : 'COMPLETADA',
      new_value: completed ? 'COMPLETADA' : 'PENDIENTE',
      note: row.title,
      changed_by: userId,
    })

    await syncTaskProgressFromSubtasks()
    await loadDetail()
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    const changes = {
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
      priority: editForm.priority,
      category: editForm.category.trim() || null,
      assignment_type: editForm.assignment_type,
      assigned_user_id: editForm.assignment_type === 'PERSONA' ? editForm.assigned_user_id : null,
      assigned_group: editForm.assignment_type === 'GRUPO' ? editForm.assigned_group : null,
      assigned_shift: editForm.assignment_type === 'GUARDIA' ? editForm.assigned_shift : null,
      tags: editForm.tags.split(',').map((item) => item.trim()).filter(Boolean),
      due_at: editForm.due_at ? new Date(editForm.due_at).toISOString() : null,
      email_subject: editForm.email_subject.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('tasks').update(changes).eq('id', task.id).select('*').single()
    if (error || !data) {
      setMessage(error?.message || 'No se pudo actualizar la tarea.')
      return
    }

    await supabase.from('task_history').insert({
      task_id: task.id,
      action: 'EDITADA',
      field_name: 'detalle',
      old_value: null,
      new_value: null,
      note: 'Se actualizaron los datos generales de la tarea.',
      changed_by: userId,
    })

    const editRecipients = scopedProfiles
      .filter((profile) => {
        if (editForm.assignment_type === 'PERSONA') return profile.user_id === editForm.assigned_user_id
        if (editForm.assignment_type === 'GRUPO') return profile.group_name === editForm.assigned_group
        return profile.shift_name === editForm.assigned_shift
      })
      .map((profile)=>profile.user_id)
      .filter((id)=>id !== userId)

    const uniqueEditRecipients = Array.from(new Set(editRecipients))
    if (uniqueEditRecipients.length) {
      await supabase.from('app_notifications').insert(
        uniqueEditRecipients.map((recipientId)=>({
          user_id: recipientId,
          notification_type: 'TASK_ASSIGNED',
          title: 'Asignación de tarea actualizada',
          message: `${task.task_no} · ${editForm.title.trim()}`,
          task_id: task.id,
          created_by: userId,
          metadata: { task_no: task.task_no, assignment_type: editForm.assignment_type },
        }))
      )
    }

    const fresh = data as TaskDetailTask
    setTask(fresh)
    onTaskUpdated(fresh)
    setEditOpen(false)
    await loadDetail()
  }

  async function setTaskStatus(status: TaskDetailTask['status']) {
    const next: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'CERRADO') {
      next.closed_at = new Date().toISOString()
      next.progress = 100
    } else if (task.status === 'CERRADO') {
      next.closed_at = null
    }

    const { data, error } = await supabase.from('tasks').update(next).eq('id', task.id).select('*').single()
    if (error || !data) {
      setMessage(error?.message || 'No se pudo actualizar el estado.')
      return
    }

    await supabase.from('task_history').insert({
      task_id: task.id,
      action: 'ESTADO',
      field_name: 'status',
      old_value: task.status,
      new_value: status,
      changed_by: userId,
    })

    const fresh = data as TaskDetailTask
    setTask(fresh)
    onTaskUpdated(fresh)
    await loadDetail()
  }

  return (
    <div className="modal-backdrop task-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-detail-modal">
        <header className="task-detail-header">
          <div>
            <h2>Detalle de tarea</h2>
            <p>{task.task_no}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>

        {message && (
          <div className={/no se pudo|error|inválid|supera|debe/i.test(message) ? 'task-detail-alert error' : 'task-detail-alert info'}>
            {/no se pudo|error|inválid|supera|debe/i.test(message) ? <CircleAlert size={18}/> : <Info size={18}/>}
            <span>{message}</span>
          </div>
        )}

        <section className="task-detail-summary">
          <div className="task-detail-chips">
            {task.category && <span className="detail-chip">{task.category}</span>}
            <span className={`priority-chip p-${task.priority.toLowerCase()}`}>{task.priority}</span>
            <span className="detail-chip">{task.status.replaceAll('_', ' ')}</span>
            {(task.tags || []).map((tag) => {
              const color = labelColors[tag] || '#5570D8'
              return <span className="detail-chip tag" style={{color,borderColor:`${color}55`,background:`${color}14`}} key={tag}><Tag size={12} /> {tag}</span>
            })}
          </div>

          <h3>{task.title}</h3>
          {task.description && <p className="task-detail-description">{task.description}</p>}

          <div className="task-detail-grid task-detail-facts">
            <div><span>Proyecto</span><b>{task.project || '—'}</b></div>
            <div><span>Grupo / espacio</span><b>{task.group_name || task.warehouse || '—'}</b></div>
            {task.work_type === 'RELEVO' && (
              <div className="task-detail-relevo-route">
                <span>Relevo de guardia</span>
                <b>{task.relevo_from_shift || task.shift_name || 'Guardia origen'} <i>→</i> {task.relevo_to_shift || 'Guardia destino'}</b>
              </div>
            )}
            <div><span>Creación</span><b>{fmtDate(task.created_at)}</b></div>
            <div><span>Inicio</span><b>{fmtDate(task.start_at)}</b></div>
            <div><span>Cierre</span><b>{fmtDate(task.closed_at)}</b></div>
            <div><span>Creado por</span><b>{profileName(task.created_by)}</b></div>
            <div><span>Responsable de gestión</span><b>{profileName(task.responsible_id || task.created_by)}</b></div>
            <div><span>Asignado a</span><b>{taskAssignmentLabel()}</b><small>{task.assignment_type}</small></div>
            <div><span>Fecha de término</span><b>{fmtDateOnly(task.due_at)}</b></div>
            <div><span>Avance</span><b>{task.progress}%</b></div>
          </div>

          <div className="task-detail-actions">
            <button className="secondary-button" onClick={() => setShowSubtasks((value) => !value)}>
              <CheckSquare2 size={16} /> Subtareas {subtasks.length ? `(${completedSubtasks}/${subtasks.length})` : ''}
            </button>
            {canEdit && <button className="secondary-button" onClick={() => setEditOpen((value) => !value)}><Edit3 size={16} /> Editar</button>}
            <button className="secondary-button" onClick={notifyResponsible}><Bell size={16} /> Avisar</button>
            {canEdit && (
              <select className="task-detail-status-select" value={task.status} onChange={(event) => setTaskStatus(event.target.value as TaskDetailTask['status'])}>
                <option value="PENDIENTE">Pendiente</option>
                <option value="EN_PROCESO">En proceso</option>
                <option value="BLOQUEADO">Bloqueado</option>
                <option value="CERRADO">Cerrado</option>
              </select>
            )}
          </div>
        </section>

        {task.email_subject && (
          <section className="task-email-subject">
            <span><Mail size={15} /> ASUNTO DEL CORREO</span>
            <b>{task.email_subject}</b>
          </section>
        )}

        {editOpen && canEdit && (
          <form className="task-detail-edit" onSubmit={saveEdit}>
            <div className="task-detail-section-head"><b>Editar tarea</b><button type="button" className="text-button" onClick={() => setEditOpen(false)}>Cancelar</button></div>
            <div className="form-grid">
              <label className="span-2">Título<input required value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} /></label>
              <label className="span-2">Descripción<textarea rows={3} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} /></label>
              <label>Prioridad
                <select value={editForm.priority} onChange={(event) => setEditForm({ ...editForm, priority: event.target.value as TaskDetailTask['priority'] })}>
                  <option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option>
                </select>
              </label>
              <label>Categoría<input value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })} /></label>
              <label>Asignar a
                <select value={editForm.assignment_type} onChange={(event) => setEditForm({ ...editForm, assignment_type: event.target.value as SubtaskAssignmentType })}>
                  <option value="PERSONA">Una persona específica</option>
                  <option value="GRUPO">Grupo de almacén</option>
                  <option value="GUARDIA">Una guardia del almacén</option>
                </select>
              </label>
              {editForm.assignment_type === 'PERSONA' && (
                <label>Persona
                  <select value={editForm.assigned_user_id} onChange={(event)=>setEditForm({...editForm,assigned_user_id:event.target.value})}>
                    {scopedProfiles.map((profile)=><option key={profile.user_id} value={profile.user_id}>{profile.full_name}</option>)}
                  </select>
                </label>
              )}
              {editForm.assignment_type === 'GRUPO' && (
                <label>Grupo
                  <select value={editForm.assigned_group} onChange={(event)=>setEditForm({...editForm,assigned_group:event.target.value})}>
                    <option value="">Seleccionar</option>
                    {scopedGroups.map((group)=><option key={group} value={group}>{group}</option>)}
                  </select>
                </label>
              )}
              {editForm.assignment_type === 'GUARDIA' && (
                <label>Guardia
                  <select value={editForm.assigned_shift} onChange={(event)=>setEditForm({...editForm,assigned_shift:event.target.value})}>
                    <option value="">Seleccionar</option>
                    {scopedShifts.map((shift)=><option key={shift} value={shift}>{shift}</option>)}
                    {!scopedShifts.includes('GUARDIA A')&&<option value="GUARDIA A">GUARDIA A</option>}
                    {!scopedShifts.includes('GUARDIA B')&&<option value="GUARDIA B">GUARDIA B</option>}
                  </select>
                </label>
              )}
              <label>Fecha de término<input type="datetime-local" value={editForm.due_at} onChange={(event) => setEditForm({ ...editForm, due_at: event.target.value })} /></label>
              <label className="span-2">Etiquetas<input value={editForm.tags} onChange={(event) => setEditForm({ ...editForm, tags: event.target.value })} placeholder="OC OBSERVADAS, URGENTE" /></label>
              <label className="span-2">Asunto del correo<input value={editForm.email_subject} onChange={(event) => setEditForm({ ...editForm, email_subject: event.target.value })} /></label>
            </div>
            <button className="primary-button">Guardar cambios</button>
          </form>
        )}

        {showSubtasks && (
          <section className="task-detail-section">
            <div className="task-detail-section-head">
              <b>Subtareas</b>
              <span>{completedSubtasks}/{subtasks.length} completadas · {subtasks.length ? Math.round((completedSubtasks/subtasks.length)*100) : 0}%</span>
            </div>
            <div className="task-subtask-list professional-subtasks">
              {subtasks.map((row) => (
                <article key={row.id} className={row.completed ? 'completed' : ''}>
                  <label>
                    <input type="checkbox" checked={row.completed} disabled={!canToggleSubtask(row)} onChange={() => toggleSubtask(row)} />
                    <span><b>{row.title}</b><small>{subtaskAssignmentLabel(row)}{row.due_at ? ` · vence ${fmtDateOnly(row.due_at)}` : ''}</small></span>
                  </label>
                  <span className="subtask-assignment-chip">{row.assignment_type}</span>
                </article>
              ))}
              {!subtasks.length && <p className="task-detail-empty">Aún no hay subtareas.</p>}
            </div>
            {canEdit && (
              <form className="task-subtask-add professional-subtask-form" onSubmit={addSubtask}>
                <label className="subtask-title-field">Subtarea
                  <input value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} placeholder="Ej. Validar guía, actualizar SAP, ubicar material…" />
                </label>
                <label>Asignar a
                  <select value={subtaskAssignmentType} onChange={(event)=>setSubtaskAssignmentType(event.target.value as SubtaskAssignmentType)}>
                    <option value="PERSONA">Una persona específica</option>
                    <option value="GRUPO">Grupo de almacén</option>
                    <option value="GUARDIA">Una guardia del almacén</option>
                  </select>
                </label>

                {subtaskAssignmentType === 'PERSONA' && (
                  <label>Persona
                    <select value={subtaskAssignedUser} onChange={(event)=>setSubtaskAssignedUser(event.target.value)}>
                      {scopedProfiles.map((profile)=><option key={profile.user_id} value={profile.user_id}>{profile.full_name}{profile.group_name ? ` · ${profile.group_name}` : ''}</option>)}
                    </select>
                  </label>
                )}
                {subtaskAssignmentType === 'GRUPO' && (
                  <label>Grupo
                    <select value={subtaskAssignedGroup} onChange={(event)=>setSubtaskAssignedGroup(event.target.value)}>
                      <option value="">Seleccionar grupo</option>
                      {scopedGroups.map((group)=><option key={group} value={group}>{group}</option>)}
                    </select>
                  </label>
                )}
                {subtaskAssignmentType === 'GUARDIA' && (
                  <label>Guardia
                    <select value={subtaskAssignedShift} onChange={(event)=>setSubtaskAssignedShift(event.target.value)}>
                      <option value="">Seleccionar guardia</option>
                      {scopedShifts.map((shift)=><option key={shift} value={shift}>{shift}</option>)}
                      {!scopedShifts.includes('GUARDIA A')&&<option value="GUARDIA A">GUARDIA A</option>}
                      {!scopedShifts.includes('GUARDIA B')&&<option value="GUARDIA B">GUARDIA B</option>}
                    </select>
                  </label>
                )}

                <label>Fecha límite
                  <input type="datetime-local" value={subtaskDueAt} onChange={(event)=>setSubtaskDueAt(event.target.value)} />
                </label>
                <button className="primary-button subtask-add-button" disabled={!subtaskTitle.trim()}><Plus size={16} /> Agregar subtarea</button>
              </form>
            )}
          </section>
        )}

        <section className="task-metrics-grid task-detail-metrics">
          <div><span>Duración estimada</span><b>{task.estimated_hours ? `${Number(task.estimated_hours).toFixed(1)} h` : 'Sin definir'}</b></div>
          <div><span>Tiempo transcurrido</span><b>{elapsedDays.toFixed(2)} días</b></div>
          <div><span>Diferencia vs. estimado</span><b>{diffVsEstimated == null ? '—' : `${diffVsEstimated >= 0 ? '+' : ''}${diffVsEstimated.toFixed(2)} días`}</b></div>
          <div><span>Fecha original</span><b>{fmtDateOnly(originalDue)}</b></div>
          <div><span>Retraso vs. fecha original</span><b>{delayVsOriginal.toFixed(2)} días</b></div>
          <div><span>Cumplimiento original</span><b>{originalCompliance}</b></div>
          <div><span>Ampliaciones</span><b>{task.extensions_count || 0}</b></div>
        </section>

        {canEdit && (
          <section className="task-extension-area">
            {!extensionOpen ? (
              <button className="secondary-button" onClick={() => setExtensionOpen(true)}><CalendarPlus size={16} /> Ampliar fecha</button>
            ) : (
              <form className="task-extension-form" onSubmit={saveExtension}>
                <label>Nueva fecha<input type="datetime-local" required value={extensionDue} onChange={(event) => setExtensionDue(event.target.value)} /></label>
                <label>Motivo<textarea rows={2} value={extensionNote} onChange={(event) => setExtensionNote(event.target.value)} placeholder="Motivo de la ampliación" /></label>
                <div className="button-row">
                  <button type="button" className="secondary-button" onClick={() => setExtensionOpen(false)}>Cancelar</button>
                  <button className="primary-button">Confirmar ampliación</button>
                </div>
              </form>
            )}
          </section>
        )}

        <section className="task-detail-section task-history-section">
          <button className="task-detail-collapser" onClick={() => setShowHistory((value) => !value)}>
            <span><History size={16} /> Historial · {history.length}</span>
            {showHistory ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          {showHistory && (
            <div className="task-history-list">
              {history.map((row) => (
                <article key={row.id}>
                  <i />
                  <div>
                    <b>{row.action.replaceAll('_', ' ')}</b>
                    <span>{fmtDate(row.created_at)} · {profileName(row.changed_by)}</span>
                    {row.note && <p>{row.note}</p>}
                    {row.field_name && row.field_name !== 'comment' && (
                      <small>{row.old_value || '—'} → {row.new_value || '—'}</small>
                    )}
                  </div>
                </article>
              ))}
              {!history.length && <p className="task-detail-empty">Sin historial todavía.</p>}
            </div>
          )}
        </section>

        <section className="task-comments-section">
          <div className="task-detail-section-head">
            <b>Comentarios · {comments.length}</b>
            {loading && <RefreshCw className="spin" size={16} />}
          </div>

          <div className="task-comment-list">
            {comments.map((row) => {
              const author = profileName(row.created_by)
              const linkedFiles = commentAttachments(row.id)
              return (
                <article className="task-comment-card" key={row.id}>
                  <div className="task-comment-head">
                    <div className="task-comment-avatar">{initials(author)}</div>
                    <div><b>{author}</b><span>{fmtDate(row.created_at)}</span></div>
                    {(row.created_by === userId || canDeleteAnyComment) && (
                      <button className="task-comment-delete" onClick={() => deleteComment(row)} title="Eliminar comentario"><Trash2 size={16} /></button>
                    )}
                  </div>
                  <p>{row.comment}</p>

                  {linkedFiles.length > 0 && (
                    <div className="task-comment-files">
                      {linkedFiles.map((file) => (
                        <a key={file.id} href={file.signed_url || '#'} target="_blank" rel="noreferrer">
                          {file.mime_type?.startsWith('image/') && file.signed_url ? (
                            <img src={file.signed_url} alt={file.file_name} />
                          ) : (
                            <div className="task-file-placeholder">{file.mime_type?.startsWith('image/') ? <ImageIcon size={28} /> : <FileText size={28} />}</div>
                          )}
                          <span><Paperclip size={14} /> {file.file_name}{file.file_size ? ` · ${fileSize(file.file_size)}` : ''}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
            {!comments.length && <p className="task-detail-empty">No hay comentarios. Publica el primer seguimiento.</p>}
          </div>

          <form className="task-comment-form" onSubmit={publishComment}>
            <label>Nuevo comentario
              <div className="task-comment-editor">
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  onPaste={handlePaste}
                  placeholder="Ej. @Hector favor revisar..."
                />
                {mentionCandidates.length > 0 && (
                  <div className="mention-suggestions">
                    {mentionCandidates.map((profile) => (
                      <button type="button" key={profile.user_id} onClick={() => selectMention(profile)}>
                        <span>{initials(profile.full_name)}</span>
                        <div><b>{profile.full_name}</b><small>{profile.role}{profile.warehouse ? ` · ${profile.warehouse}` : ''}</small></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>

            <div className="mention-help"><AtSign size={17} /><span>Escribe @ y el nombre para buscar personal autorizado de esta tarea. La persona mencionada recibirá una alerta y podrá abrir la tarea.</span></div>

            <label className="task-upload-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)) }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.xls,.xlsx,.doc,.docx,.ppt,.pptx"
                onChange={(event) => addFiles(Array.from(event.target.files || []))}
              />
              <Upload size={28} />
              <b>Suelta un archivo o selecciónalo</b>
              <span>También puedes copiar una captura y pegarla con Ctrl + V</span>
              <small>Imágenes, Excel, Word, PowerPoint o PDF · Máximo 8 MB por archivo</small>
            </label>

            {files.length > 0 && (
              <div className="task-pending-files">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`}>
                    <Paperclip size={13} /> {file.name}
                    <button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}

            <div className="task-comment-submit">
              <button className="primary-button" disabled={publishing || (!comment.trim() && !files.length)}>
                {publishing ? <RefreshCw className="spin" size={17} /> : <Send size={17} />}
                {publishing ? 'Publicando…' : 'Publicar comentario'}
              </button>
            </div>
          </form>
        </section>
      </section>
    </div>
  )
}
