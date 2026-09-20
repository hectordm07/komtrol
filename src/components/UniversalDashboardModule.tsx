import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  ProfessionalBarChart,
  ProfessionalDonutChart,
  ProfessionalTrendChart,
} from './DashboardVisuals'

type Role='TRABAJADOR'|'COORDINADOR'|'SUPERVISOR'|'ADMINISTRADOR'

type Profile={
  user_id:string
  full_name:string
  role:Role
  warehouse?:string|null
  project?:string|null
  group_name?:string|null
  shift_name?:string|null
}

type Task={
  id:string
  task_no:string
  work_type:'TAREA'|'RELEVO'|'PERSONAL'
  title:string
  warehouse:string|null
  project:string|null
  group_name:string|null
  responsible_id:string|null
  created_by:string
  status:'PENDIENTE'|'EN_PROCESO'|'BLOQUEADO'|'CERRADO'|'VENCIDA'
  progress:number
  priority:'BAJA'|'MEDIA'|'ALTA'|'URGENTE'
  due_at:string|null
  closed_at:string|null
  created_at:string
}

type Expiration={
  id:string
  user_id:string
  expiration_type:'EMOA'|'CURSO'|'LICENCIA_INTERNA'
  title:string
  due_date:string
  status:'ACTIVO'|'RENOVADO'|'VENCIDO'|'ANULADO'
}

type Notification={
  id:string
  title:string
  message:string|null
  task_id:string|null
  read_at:string|null
  created_at:string
}

type Props={
  userId:string
  profile:Profile
  onNavigate:(tab:string)=>void
}

const monthNames=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function daysUntil(value?:string|null){
  if(!value) return null
  const today=new Date()
  today.setHours(0,0,0,0)
  const due=new Date(value)
  due.setHours(0,0,0,0)
  if(Number.isNaN(due.getTime())) return null
  return Math.ceil((due.getTime()-today.getTime())/86_400_000)
}

function isOpen(task:Task){
  return task.status!=='CERRADO'
}

function isOverdue(task:Task){
  if(!isOpen(task) || !task.due_at) return false
  const days=daysUntil(task.due_at)
  return days!==null && days<0
}

function formatDate(value?:string|null){
  if(!value) return 'Sin fecha'
  const date=new Date(value)
  if(Number.isNaN(date.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric'}).format(date)
}

function expiryTab(type:Expiration['expiration_type']){
  return type==='CURSO'
    ? 'vencimientos-cursos'
    : type==='LICENCIA_INTERNA'
      ? 'vencimientos-licencias'
      : 'vencimientos-emoa'
}

function expiryLabel(type:Expiration['expiration_type']){
  return type==='CURSO'?'Curso':type==='LICENCIA_INTERNA'?'Licencia interna':'EMOA'
}

export function UniversalDashboardModule({userId,profile,onNavigate}:Props){
  const [tasks,setTasks]=useState<Task[]>([])
  const [expirations,setExpirations]=useState<Expiration[]>([])
  const [notifications,setNotifications]=useState<Notification[]>([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  async function reload(){
    setLoading(true)
    setMessage('')
    const [taskRes,expiryRes,notificationRes]=await Promise.all([
      supabase
        .from('tasks')
        .select('id,task_no,work_type,title,warehouse,project,group_name,responsible_id,created_by,status,progress,priority,due_at,closed_at,created_at')
        .order('created_at',{ascending:false})
        .limit(3000),
      supabase
        .from('compliance_expirations')
        .select('id,user_id,expiration_type,title,due_date,status')
        .eq('user_id',userId)
        .order('due_date',{ascending:true})
        .limit(500),
      supabase
        .from('app_notifications')
        .select('id,title,message,task_id,read_at,created_at')
        .eq('user_id',userId)
        .order('created_at',{ascending:false})
        .limit(100),
    ])

    const error=taskRes.error||expiryRes.error||notificationRes.error
    if(error) setMessage(error.message)
    setTasks((taskRes.data??[]) as Task[])
    setExpirations((expiryRes.data??[]) as Expiration[])
    setNotifications((notificationRes.data??[]) as Notification[])
    setLoading(false)
  }

  useEffect(()=>{reload()},[userId])

  const personalTasks=useMemo(()=>tasks.filter((task)=>
    task.responsible_id===userId ||
    (task.work_type==='PERSONAL' && task.created_by===userId)
  ),[tasks,userId])

  const groupTasks=useMemo(()=>tasks.filter((task)=>{
    if(task.work_type==='PERSONAL') return false
    if(profile.group_name) return task.group_name===profile.group_name
    if(profile.warehouse) return task.warehouse===profile.warehouse
    return false
  }),[tasks,profile.group_name,profile.warehouse])

  const openPersonal=personalTasks.filter(isOpen)
  const overduePersonal=personalTasks.filter(isOverdue)
  const due7=personalTasks.filter((task)=>{
    if(!isOpen(task)) return false
    const days=daysUntil(task.due_at)
    return days!==null && days>=0 && days<=7
  })
  const groupPending=groupTasks.filter(isOpen)
  const unread=notifications.filter((row)=>!row.read_at).length

  const activeExpirations=expirations.filter((row)=>row.status!=='ANULADO'&&row.status!=='RENOVADO')
  const expiryByType=(type:Expiration['expiration_type'])=>activeExpirations.filter((row)=>row.expiration_type===type)
  const dueWithin=(type:Expiration['expiration_type'],daysMax:number)=>expiryByType(type).filter((row)=>{
    const days=daysUntil(row.due_date)
    return days!==null && days>=0 && days<=daysMax
  }).length

  const taskStatusSegments=[
    {label:'Pendiente',value:personalTasks.filter((t)=>t.status==='PENDIENTE').length},
    {label:'En proceso',value:personalTasks.filter((t)=>t.status==='EN_PROCESO').length},
    {label:'Bloqueado',value:personalTasks.filter((t)=>t.status==='BLOQUEADO').length},
    {label:'Cerrado',value:personalTasks.filter((t)=>t.status==='CERRADO').length},
    {label:'Vencido',value:overduePersonal.length},
  ]

  const expiryTypeData=[
    {
      key:'EMOA',
      label:'EMOA',
      value:expiryByType('EMOA').length,
      detail:`${dueWithin('EMOA',30)} vencen en los próximos 30 días.`,
    },
    {
      key:'CURSO',
      label:'Cursos',
      value:expiryByType('CURSO').length,
      detail:`${dueWithin('CURSO',30)} vencen en los próximos 30 días.`,
    },
    {
      key:'LICENCIA_INTERNA',
      label:'Licencias',
      value:expiryByType('LICENCIA_INTERNA').length,
      detail:`${dueWithin('LICENCIA_INTERNA',30)} vencen en los próximos 30 días.`,
    },
  ]

  const expiryUrgency=[
    {
      label:'Vigente +60',
      value:activeExpirations.filter((row)=>{
        const d=daysUntil(row.due_date)
        return d!==null&&d>60
      }).length,
    },
    {
      label:'31 a 60 días',
      value:activeExpirations.filter((row)=>{
        const d=daysUntil(row.due_date)
        return d!==null&&d>=31&&d<=60
      }).length,
    },
    {
      label:'0 a 30 días',
      value:activeExpirations.filter((row)=>{
        const d=daysUntil(row.due_date)
        return d!==null&&d>=0&&d<=30
      }).length,
    },
    {
      label:'Vencido',
      value:activeExpirations.filter((row)=>{
        const d=daysUntil(row.due_date)
        return d!==null&&d<0
      }).length,
    },
  ]

  const activityTrend=useMemo(()=>{
    const now=new Date()
    const points:{label:string;value:number}[]=[]
    for(let offset=5;offset>=0;offset--){
      const d=new Date(now.getFullYear(),now.getMonth()-offset,1)
      const year=d.getFullYear()
      const month=d.getMonth()
      const value=personalTasks.filter((task)=>{
        const created=new Date(task.created_at)
        return created.getFullYear()===year&&created.getMonth()===month
      }).length
      points.push({label:monthNames[month],value})
    }
    return points
  },[personalTasks])

  const upcoming=useMemo(()=>{
    const taskItems=personalTasks
      .filter((task)=>isOpen(task)&&task.due_at)
      .map((task)=>({
        id:`task-${task.id}`,
        kind:'TAREA' as const,
        title:task.title,
        detail:task.task_no,
        due:task.due_at as string,
        days:daysUntil(task.due_at),
        tab:'mi-trabajo',
      }))

    const expiryItems=activeExpirations.map((row)=>({
      id:`expiry-${row.id}`,
      kind:'VENCIMIENTO' as const,
      title:row.title,
      detail:expiryLabel(row.expiration_type),
      due:row.due_date,
      days:daysUntil(row.due_date),
      tab:expiryTab(row.expiration_type),
    }))

    return [...taskItems,...expiryItems]
      .sort((a,b)=>{
        const ad=a.days??999999
        const bd=b.days??999999
        return ad-bd
      })
      .slice(0,10)
  },[personalTasks,activeExpirations])

  const nearest=(type:Expiration['expiration_type'])=>{
    const list=expiryByType(type)
      .map((row)=>({...row,days:daysUntil(row.due_date)}))
      .filter((row)=>row.days!==null)
      .sort((a,b)=>(a.days??999999)-(b.days??999999))
    return list[0]
  }

  const emoaNearest=nearest('EMOA')
  const courseNearest=nearest('CURSO')
  const licenseNearest=nearest('LICENCIA_INTERNA')

  if(loading){
    return <div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando dashboard…</p></div>
  }

  return (
    <div className="universal-dashboard">
      <section className="panel universal-dashboard-head">
        <div>
          <span className="dashboard-control-kicker">TU INFORMACIÓN OPERATIVA</span>
          <h2>Dashboard</h2>
          <p>
            {profile.project||profile.warehouse||'KOMTROL'}
            {profile.group_name?` · ${profile.group_name}`:''}
            {profile.shift_name?` · ${profile.shift_name}`:''}
          </p>
        </div>
        <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={18}/></button>
      </section>

      {message&&<div className="inline-message">{message}</div>}

      <div className="universal-dashboard-kpis">
        <DashboardKpi
          icon={<ClipboardList/>}
          label="Mis pendientes"
          value={openPersonal.length}
          detail={`${personalTasks.filter((t)=>t.status==='EN_PROCESO').length} en proceso`}
          onClick={()=>onNavigate('mi-trabajo')}
        />
        <DashboardKpi
          icon={<AlertTriangle/>}
          label="Tareas vencidas"
          value={overduePersonal.length}
          detail={overduePersonal.length?'Requieren atención':'Sin retrasos'}
          critical={overduePersonal.length>0}
          onClick={()=>onNavigate('mi-trabajo')}
        />
        <DashboardKpi
          icon={<CalendarClock/>}
          label="Próximos 7 días"
          value={due7.length}
          detail="Tareas por vencer"
          onClick={()=>onNavigate('mi-trabajo')}
        />
        <DashboardKpi
          icon={<Users/>}
          label="Trabajo grupal"
          value={groupPending.length}
          detail={profile.group_name||profile.warehouse||'Tu equipo'}
          onClick={()=>onNavigate('mi-trabajo')}
        />
        <DashboardKpi
          icon={<ShieldCheck/>}
          label="EMOA"
          value={expiryByType('EMOA').length}
          detail={emoaNearest?nearestText(emoaNearest.days):'Sin registro activo'}
          onClick={()=>onNavigate('vencimientos-emoa')}
        />
        <DashboardKpi
          icon={<GraduationCap/>}
          label="Cursos"
          value={expiryByType('CURSO').length}
          detail={courseNearest?nearestText(courseNearest.days):'Sin registro activo'}
          onClick={()=>onNavigate('vencimientos-cursos')}
        />
        <DashboardKpi
          icon={<BadgeCheck/>}
          label="Licencias internas"
          value={expiryByType('LICENCIA_INTERNA').length}
          detail={licenseNearest?nearestText(licenseNearest.days):'Sin registro activo'}
          onClick={()=>onNavigate('vencimientos-licencias')}
        />
        <DashboardKpi
          icon={<Bell/>}
          label="Alertas"
          value={unread}
          detail={unread?'Sin leer':'Todo revisado'}
          onClick={()=>onNavigate('alertas')}
        />
      </div>

      <div className="universal-dashboard-charts">
        <div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate('mi-trabajo')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate('mi-trabajo')}}>
          <ProfessionalDonutChart
            title="Mis tareas por estado"
            subtitle="Distribución de trabajo asignado"
            segments={taskStatusSegments}
          />
          <span className="dashboard-chart-access">Ver Área de trabajo <ChevronRight size={14}/></span>
        </div>

        <div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate('vencimientos-cursos')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate('vencimientos-cursos')}}>
          <ProfessionalBarChart
            title="Vencimientos por categoría"
            subtitle="EMOA, cursos y licencias internas"
            data={expiryTypeData}
          />
          <span className="dashboard-chart-access">Ver Vencimientos <ChevronRight size={14}/></span>
        </div>

        <div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate('vencimientos-emoa')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate('vencimientos-emoa')}}>
          <ProfessionalDonutChart
            title="Estado de vigencias"
            subtitle="Nivel de urgencia de tus vencimientos"
            segments={expiryUrgency}
          />
          <span className="dashboard-chart-access">Revisar vigencias <ChevronRight size={14}/></span>
        </div>

        <div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate('mi-trabajo')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate('mi-trabajo')}}>
          <ProfessionalTrendChart
            title="Actividad de tareas"
            subtitle="Tareas creadas en los últimos 6 meses"
            points={activityTrend}
          />
          <span className="dashboard-chart-access">Ver tareas <ChevronRight size={14}/></span>
        </div>
      </div>

      <section className="panel universal-upcoming">
        <div className="panel-title">
          <div>
            <h3>Próximos compromisos</h3>
            <p>Tareas y vencimientos ordenados por fecha.</p>
          </div>
          <span className="status-pill">{upcoming.length} próximos</span>
        </div>
        <div className="universal-upcoming-list">
          {upcoming.map((row)=>(
            <button key={row.id} onClick={()=>onNavigate(row.tab)}>
              <span className={row.days!==null&&row.days<0?'universal-date-badge overdue':'universal-date-badge'}>
                <b>{row.days===null?'—':row.days<0?`${Math.abs(row.days)}d`:`${row.days}d`}</b>
                <small>{row.days!==null&&row.days<0?'vencido':'restan'}</small>
              </span>
              <span className="universal-upcoming-copy">
                <small>{row.kind} · {row.detail}</small>
                <b>{row.title}</b>
                <span>{formatDate(row.due)}</span>
              </span>
              <ChevronRight size={17}/>
            </button>
          ))}
          {!upcoming.length&&(
            <div className="empty-work">
              <CheckCircle2 size={28}/>
              <b>Sin compromisos próximos</b>
              <p>No tienes tareas o vencimientos pendientes con fecha registrada.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function nearestText(days:number|null){
  if(days===null) return 'Sin fecha'
  if(days<0) return `Vencido hace ${Math.abs(days)} días`
  if(days===0) return 'Vence hoy'
  return `Próximo en ${days} días`
}

function DashboardKpi({
  icon,label,value,detail,onClick,critical=false,
}:{
  icon:React.ReactNode
  label:string
  value:number
  detail:string
  onClick:()=>void
  critical?:boolean
}){
  return (
    <button type="button" className={critical?'universal-kpi critical':'universal-kpi'} onClick={onClick}>
      <span className="universal-kpi-icon">{icon}</span>
      <span className="universal-kpi-copy">
        <small>{label}</small>
        <b>{value.toLocaleString('es-PE')}</b>
        <em>{detail}</em>
      </span>
      <ChevronRight className="universal-kpi-arrow" size={16}/>
    </button>
  )
}
