import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  PackageSearch,
  RefreshCw,
  Truck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type AlertItem = {
  id: string
  severity: 'URGENTE' | 'ALTA' | 'MEDIA' | 'INFO'
  source: string
  title: string
  detail: string
  date?: string | null
}

function daysSince(value?: string | null) {
  if (!value) return 0
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short' }).format(d)
}

export function AlertsModule() {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('TODAS')

  async function reload() {
    setLoading(true)
    setMessage('')
    const [tasks, transits, loans, incidents, guides, damaged] = await Promise.all([
      supabase.from('tasks').select('id,task_no,title,status,due_at,priority').neq('status', 'CERRADO').limit(1000),
      supabase.from('transits').select('id,guide_no,reference,status,transit_date,origin,destination').eq('status', 'EN_TRANSITO').limit(1000),
      supabase.from('loans').select('id,os_no,material_no,status,return_date,person_area').neq('status', 'DEVUELTO').limit(1000),
      supabase.from('incidents').select('id,incident_no,incident_type,status,guide_no,material_no,created_at').not('status', 'in', '(CERRADO)').limit(1000),
      supabase.from('guides').select('id,guide_no,reference,status,created_at').eq('status', 'OBSERVADO').limit(1000),
      supabase.from('damaged_materials').select('id,material_no,description,status,event_date').in('status', ['PENDIENTE','EN_REVISION']).limit(1000),
    ])

    const errors = [tasks.error, transits.error, loans.error, incidents.error, guides.error, damaged.error].filter(Boolean)
    if (errors.length) setMessage(errors[0]?.message || 'No se pudo cargar una parte de las alertas.')

    const rows: AlertItem[] = []

    for (const task of tasks.data ?? []) {
      if (!task.due_at) continue
      const due = new Date(task.due_at)
      const hours = (due.getTime() - Date.now()) / 3600000
      if (hours < 0) {
        rows.push({
          id: `task-${task.id}`,
          severity: 'URGENTE',
          source: 'TAREA',
          title: `Tarea vencida: ${task.title}`,
          detail: `${task.task_no} · venció hace ${Math.ceil(Math.abs(hours) / 24)} día(s)`,
          date: task.due_at,
        })
      } else if (hours <= 48) {
        rows.push({
          id: `task-${task.id}`,
          severity: task.priority === 'URGENTE' ? 'URGENTE' : 'ALTA',
          source: 'TAREA',
          title: `Próximo vencimiento: ${task.title}`,
          detail: `${task.task_no} · vence en menos de 48 horas`,
          date: task.due_at,
        })
      }
    }

    for (const transit of transits.data ?? []) {
      const days = daysSince(transit.transit_date)
      if (days >= 30) {
        rows.push({
          id: `transit-${transit.id}`,
          severity: days >= 60 ? 'URGENTE' : 'ALTA',
          source: 'TRÁNSITO',
          title: `Tránsito con ${days} días`,
          detail: `${transit.guide_no || transit.reference || 'Sin referencia'} · ${transit.origin || 'Origen'} → ${transit.destination || 'Destino'}`,
          date: transit.transit_date,
        })
      }
    }

    for (const loan of loans.data ?? []) {
      if (loan.return_date && new Date(loan.return_date + 'T23:59:59').getTime() < Date.now()) {
        rows.push({
          id: `loan-${loan.id}`,
          severity: 'ALTA',
          source: 'PRÉSTAMO',
          title: `Préstamo pendiente: ${loan.material_no}`,
          detail: `${loan.os_no || 'Sin OS'} · ${loan.person_area || 'Sin persona/área'}`,
          date: loan.return_date,
        })
      }
    }

    for (const incident of incidents.data ?? []) {
      if (['NOTIFICADO','CERRADO'].includes(incident.status)) continue
      rows.push({
        id: `incident-${incident.id}`,
        severity: incident.incident_type === 'FALTANTE' ? 'ALTA' : 'MEDIA',
        source: 'INCIDENCIA',
        title: `${incident.incident_type.replaceAll('_', ' ')} pendiente`,
        detail: `${incident.incident_no} · ${incident.guide_no || incident.material_no || 'Sin referencia'}`,
        date: incident.created_at,
      })
    }

    for (const guide of guides.data ?? []) {
      rows.push({
        id: `guide-${guide.id}`,
        severity: 'MEDIA',
        source: 'GUÍA',
        title: `Guía observada: ${guide.guide_no}`,
        detail: guide.reference || 'Sin referencia',
        date: guide.created_at,
      })
    }

    for (const item of damaged.data ?? []) {
      rows.push({
        id: `damaged-${item.id}`,
        severity: item.status === 'PENDIENTE' ? 'ALTA' : 'MEDIA',
        source: 'DAÑADO',
        title: `Material dañado: ${item.material_no}`,
        detail: item.description || item.status,
        date: item.event_date,
      })
    }

    const weight = { URGENTE: 4, ALTA: 3, MEDIA: 2, INFO: 1 }
    rows.sort((a, b) => weight[b.severity] - weight[a.severity] || String(b.date || '').localeCompare(String(a.date || '')))
    setAlerts(rows)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const visible = useMemo(() => filter === 'TODAS' ? alerts : alerts.filter((item) => item.severity === filter), [alerts, filter])
  const counts = useMemo(() => ({
    urgent: alerts.filter((a) => a.severity === 'URGENTE').length,
    high: alerts.filter((a) => a.severity === 'ALTA').length,
    medium: alerts.filter((a) => a.severity === 'MEDIA').length,
  }), [alerts])

  return (
    <section className="panel alerts-module">
      <div className="panel-title">
        <div><h3>Alertas</h3><p>Prioridades calculadas automáticamente con datos reales de la operación.</p></div>
        <button className="icon-button" onClick={reload}><RefreshCw size={18} /></button>
      </div>

      <div className="alert-kpis">
        <button className={filter === 'URGENTE' ? 'active' : ''} onClick={() => setFilter(filter === 'URGENTE' ? 'TODAS' : 'URGENTE')}><AlertTriangle size={18} /><span><b>{counts.urgent}</b><small>Urgentes</small></span></button>
        <button className={filter === 'ALTA' ? 'active' : ''} onClick={() => setFilter(filter === 'ALTA' ? 'TODAS' : 'ALTA')}><Clock3 size={18} /><span><b>{counts.high}</b><small>Alta prioridad</small></span></button>
        <button className={filter === 'MEDIA' ? 'active' : ''} onClick={() => setFilter(filter === 'MEDIA' ? 'TODAS' : 'MEDIA')}><Bell size={18} /><span><b>{counts.medium}</b><small>Seguimiento</small></span></button>
        <button className={filter === 'TODAS' ? 'active' : ''} onClick={() => setFilter('TODAS')}><PackageSearch size={18} /><span><b>{alerts.length}</b><small>Total</small></span></button>
      </div>

      {message && <div className="inline-message">{message}</div>}

      {loading ? (
        <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Calculando alertas…</p></div>
      ) : visible.length ? (
        <div className="alert-list">
          {visible.map((item) => (
            <article className={`alert-row severity-${item.severity.toLowerCase()}`} key={item.id}>
              <div className="alert-row-icon">
                {item.source === 'TRÁNSITO' ? <Truck size={18} /> : item.severity === 'URGENTE' || item.severity === 'ALTA' ? <AlertTriangle size={18} /> : <Bell size={18} />}
              </div>
              <div className="alert-row-content">
                <div><span className="alert-source">{item.source}</span><span className={`alert-severity ${item.severity.toLowerCase()}`}>{item.severity}</span></div>
                <b>{item.title}</b>
                <p>{item.detail}</p>
              </div>
              <time>{fmtDate(item.date)}</time>
            </article>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty"><CheckCircle2 size={34} /><b>Sin alertas para mostrar</b><p>No hay condiciones activas con el filtro seleccionado.</p></div>
      )}
    </section>
  )
}
