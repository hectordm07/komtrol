import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, ChevronRight, RefreshCw, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Profile = {
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
  shift_name?: string | null
}

type Task = {
  id: string
  work_type: 'TAREA' | 'RELEVO' | 'PERSONAL'
  assignment_type: 'PERSONAL' | 'PERSONA' | 'GRUPO' | 'GUARDIA'
  assigned_user_id: string | null
  responsible_id: string | null
  created_by: string
  assigned_group: string | null
  group_name: string | null
  assigned_shift: string | null
  shift_name: string | null
  relevo_from_shift: string | null
  relevo_to_shift: string | null
  warehouse: string | null
  project: string | null
  status: string
  progress: number
}

type Props = {
  userId: string
  profile: Profile | null
  onOpen: (tab: 'mi-trabajo' | 'tareas' | 'relevos') => void
}

export function AdminPreviewPendingStrip({ userId, profile, onOpen }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  async function reload(silent = false) {
    if (!silent) setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('id,work_type,assignment_type,assigned_user_id,responsible_id,created_by,assigned_group,group_name,assigned_shift,shift_name,relevo_from_shift,relevo_to_shift,warehouse,project,status,progress')
      .order('created_at', { ascending: false })
      .limit(5000)

    setTasks((data ?? []) as Task[])
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    void reload()
    const refresh = () => void reload(true)
    const timer = window.setInterval(refresh, 20_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId])

  const counts = useMemo(() => {
    const warehouse = String(profile?.warehouse || '').trim().toUpperCase()
    const project = String(profile?.project || '').trim().toUpperCase()
    const group = String(profile?.group_name || '').trim().toUpperCase()
    const shift = String(profile?.shift_name || '').trim().toUpperCase()

    const isOpen = (task: Task) => task.status !== 'CERRADO' && Number(task.progress || 0) < 100
    const direct = (task: Task) =>
      task.assigned_user_id === userId ||
      task.responsible_id === userId ||
      task.created_by === userId

    const sameScope = (task: Task) => {
      const taskWarehouse = String(task.warehouse || '').trim().toUpperCase()
      const taskProject = String(task.project || '').trim().toUpperCase()
      if (warehouse && taskWarehouse && taskWarehouse !== warehouse) return false
      if (project && taskProject && taskProject !== project) return false
      return true
    }

    const personal = tasks.filter((task) =>
      task.work_type === 'PERSONAL' &&
      isOpen(task) &&
      direct(task)
    )

    const work = tasks.filter((task) => {
      if (task.work_type !== 'TAREA' || !isOpen(task)) return false
      if (direct(task)) return true
      if (!sameScope(task)) return false
      if (task.assignment_type === 'GRUPO' && group) {
        return String(task.assigned_group || task.group_name || '').trim().toUpperCase() === group
      }
      if (task.assignment_type === 'GUARDIA' && shift) {
        return String(task.assigned_shift || task.shift_name || '').trim().toUpperCase() === shift
      }
      return false
    })

    const relays = tasks.filter((task) => {
      if (task.work_type !== 'RELEVO' || !isOpen(task)) return false
      if (direct(task)) return true
      if (!sameScope(task) || !shift) return false
      return [
        task.assigned_shift,
        task.shift_name,
        task.relevo_from_shift,
        task.relevo_to_shift,
      ]
        .map((value) => String(value || '').trim().toUpperCase())
        .filter(Boolean)
        .includes(shift)
    })

    return {
      personal: personal.length,
      work: work.length,
      relays: relays.length,
    }
  }, [tasks, userId, profile?.warehouse, profile?.project, profile?.group_name, profile?.shift_name])

  return (
    <section className="panel admin-preview-validation">
      <div className="admin-preview-validation-head">
        <div>
          <b>Validación del Administrador</b>
          <span>Tus pendientes reales permanecen visibles mientras pruebas esta vista del sistema.</span>
        </div>
        <span className="status-pill">{loading ? 'Actualizando…' : 'Vista de prueba'}</span>
      </div>

      <div className="admin-preview-validation-grid">
        <button type="button" onClick={() => onOpen('mi-trabajo')}>
          <ClipboardList size={18}/>
          <span><small>MIS TRABAJOS</small><b>{counts.personal}</b><em>Pendientes personales</em></span>
          <ChevronRight size={15}/>
        </button>
        <button type="button" onClick={() => onOpen('tareas')}>
          <Users size={18}/>
          <span><small>TAREAS</small><b>{counts.work}</b><em>Asignadas, creadas o de tu ámbito</em></span>
          <ChevronRight size={15}/>
        </button>
        <button type="button" onClick={() => onOpen('relevos')}>
          <RefreshCw size={18}/>
          <span><small>RELEVOS</small><b>{counts.relays}</b><em>Pendientes vinculados contigo</em></span>
          <ChevronRight size={15}/>
        </button>
      </div>
    </section>
  )
}
