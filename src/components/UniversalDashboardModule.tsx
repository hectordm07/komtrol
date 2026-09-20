import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Boxes,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  GraduationCap,
  PackageSearch,
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
  shift_name:string|null
  relevo_from_shift:string|null
  relevo_to_shift:string|null
  responsible_id:string|null
  assignment_type:'PERSONAL'|'PERSONA'|'GRUPO'|'GUARDIA'
  assigned_user_id:string|null
  assigned_group:string|null
  assigned_shift:string|null
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

type Incident={
  id:string
  incident_no:string
  incident_type:string
  status:string
  warehouse:string|null
  project:string|null
  qty_expected:number|null
  qty_received:number|null
  qty_damaged:number|null
  created_at:string
}

type KardexMovement={
  id:string
  warehouse:string
  movement_type:string
  source_type:string
  material_no:string
  quantity:number
  stock_type:string|null
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
  const [incidents,setIncidents]=useState<Incident[]>([])
  const [kardexMovements,setKardexMovements]=useState<KardexMovement[]>([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  async function reload(){
    setLoading(true)
    setMessage('')
    const [taskRes,expiryRes,notificationRes,incidentRes,kardexRes]=await Promise.all([
      supabase
        .from('tasks')
        .select('id,task_no,work_type,title,warehouse,project,group_name,shift_name,relevo_from_shift,relevo_to_shift,responsible_id,assignment_type,assigned_user_id,assigned_group,assigned_shift,created_by,status,progress,priority,due_at,closed_at,created_at')
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
      supabase
        .from('incidents')
        .select('id,incident_no,incident_type,status,warehouse,project,qty_expected,qty_received,qty_damaged,created_at')
        .order('created_at',{ascending:false})
        .limit(3000),
      supabase
        .from('surplus_kardex_movements')
        .select('id,warehouse,movement_type,source_type,material_no,quantity,stock_type,created_at')
        .order('created_at',{ascending:false})
        .limit(10000),
    ])

    const error=taskRes.error||expiryRes.error||notificationRes.error||incidentRes.error||kardexRes.error
    if(error) setMessage(error.message)
    setTasks((taskRes.data??[]) as Task[])
    setExpirations((expiryRes.data??[]) as Expiration[])
    setNotifications((notificationRes.data??[]) as Notification[])
    setIncidents((incidentRes.data??[]) as Incident[])
    setKardexMovements((kardexRes.data??[]) as KardexMovement[])
    setLoading(false)
  }

  useEffect(()=>{reload()},[userId])

  const personalTasks=useMemo(()=>tasks.filter((task)=>
    task.work_type==='PERSONAL' &&
    (
      task.assigned_user_id===userId ||
      task.responsible_id===userId ||
      task.created_by===userId
    )
  ),[tasks,userId])

  const groupTasks=useMemo(()=>tasks.filter((task)=>{
    if(task.work_type==='PERSONAL') return false

    const normalizedWarehouse=String(profile.warehouse||'').trim().toUpperCase()
    const normalizedProject=String(profile.project||'').trim().toUpperCase()
    const normalizedGroup=String(profile.group_name||'').trim().toUpperCase()
    const normalizedShift=String(profile.shift_name||'').trim().toUpperCase()

    const sameWarehouse = normalizedWarehouse
      ? String(task.warehouse||'').trim().toUpperCase()===normalizedWarehouse
      : true
    const sameProject = normalizedProject
      ? String(task.project||'').trim().toUpperCase()===normalizedProject
      : true
    const taskGroups=[
      String(task.group_name||'').trim().toUpperCase(),
      String(task.assigned_group||'').trim().toUpperCase(),
    ].filter(Boolean)
    const sameGroup = normalizedGroup
      ? taskGroups.includes(normalizedGroup)
      : true

    if(!sameWarehouse || !sameProject || !sameGroup) return false

    if(task.work_type==='RELEVO' && normalizedShift){
      const relatedShifts=[
        task.shift_name,
        task.relevo_from_shift,
        task.relevo_to_shift,
        task.assigned_shift,
      ].map((value)=>String(value||'').trim().toUpperCase()).filter(Boolean)

      return relatedShifts.length===0 || relatedShifts.includes(normalizedShift)
    }

    return true
  }),[tasks,profile.warehouse,profile.project,profile.group_name,profile.shift_name])

  const openPersonal=personalTasks.filter(isOpen)
  const overduePersonal=personalTasks.filter(isOverdue)
  const due7=personalTasks.filter((task)=>{
    if(!isOpen(task)) return false
    const days=daysUntil(task.due_at)
    return days!==null && days>=0 && days<=7
  })
  const groupPending=groupTasks.filter(isOpen)
  const groupTaskPending=groupPending.filter((task)=>task.work_type==='TAREA')
  const groupRelevoPending=groupPending.filter((task)=>task.work_type==='RELEVO')
  const unread=notifications.filter((row)=>!row.read_at).length
  const operationalWarehouse=(profile.warehouse||'').trim().toUpperCase()
  const operationalProject=(profile.project||'').trim().toUpperCase()

  function scopeWarehouse<T extends {warehouse?:string|null}>(rows:T[]){
    if(profile.role==='ADMINISTRADOR' && !operationalWarehouse) return rows
    if(!operationalWarehouse) return []
    return rows.filter((row)=>String(row.warehouse||'').trim().toUpperCase()===operationalWarehouse)
  }

  const operationalIncidents=incidents.filter((row)=>{
    if(profile.role==='ADMINISTRADOR' && !operationalWarehouse) return true
    const sameWarehouse=String(row.warehouse||'').trim().toUpperCase()===operationalWarehouse
    if(!sameWarehouse) return false
    if(!operationalProject) return true
    const rowProject=String(row.project||'').trim().toUpperCase()
    return !rowProject || rowProject===operationalProject
  })
  const operationalKardex=scopeWarehouse(kardexMovements)
  const openIncidents=operationalIncidents.filter((row)=>row.status!=='CERRADO')
  const surplusIncidents=operationalIncidents.filter((row)=>row.incident_type==='SOBRANTE')
  const surplusQty=surplusIncidents.reduce((sum,row)=>{
    const diff=Math.max(0,Number(row.qty_received||0)-Number(row.qty_expected||0))
    return sum+diff
  },0)
  const kardexEntries=operationalKardex
    .filter((row)=>row.movement_type==='ENTRADA')
    .reduce((sum,row)=>sum+Number(row.quantity||0),0)
  const kardexExits=operationalKardex
    .filter((row)=>row.movement_type==='SALIDA')
    .reduce((sum,row)=>sum+Number(row.quantity||0),0)
  const kardexBalance=Math.max(0,kardexEntries-kardexExits)
  const kardexMaterials=new Set(
    operationalKardex
      .filter((row)=>row.material_no)
      .map((row)=>row.material_no)
  ).size
  const incidentRoute=operationalWarehouse==='CALLAO'?'inbound-incidencias':'incidencias'
  const surplusRoute=operationalWarehouse==='CALLAO'?'inbound-cajas':'kardex-sobrantes'
  const kardexRoute=operationalWarehouse==='CALLAO'?'inbound-kardex':'kardex-sobrantes'

  const incidentSegments=[
    {label:'Sobrantes',value:operationalIncidents.filter((row)=>row.incident_type==='SOBRANTE').length},
    {label:'Faltantes',value:operationalIncidents.filter((row)=>row.incident_type==='FALTANTE').length},
    {label:'Dañados',value:operationalIncidents.filter((row)=>row.incident_type==='DANADO'||row.incident_type==='DAÑADO').length},
    {label:'Otros',value:operationalIncidents.filter((row)=>!['SOBRANTE','FALTANTE','DANADO','DAÑADO'].includes(row.incident_type)).length},
  ]

  const kardexChartData=[
    {key:'ENTRADAS',label:'Entradas',value:kardexEntries,detail:'Total de unidades ingresadas al Kardex de Sobrantes.'},
    {key:'SALIDAS',label:'Salidas',value:kardexExits,detail:'Total de unidades retiradas o ajustadas.'},
    {key:'SALDO',label:'Saldo',value:kardexBalance,detail:'Saldo operativo calculado: entradas menos salidas.'},
  ]

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
      {message&&<div className="inline-message">{message}</div>}

      <div className="universal-dashboard-kpis">
        <DashboardKpi
          icon={<ClipboardList/>}
          label="Mis trabajos"
          value={openPersonal.length}
          detail={`${personalTasks.filter((t)=>t.status==='EN_PROCESO').length} en proceso`}
          tone="personal"
          onClick={()=>onNavigate('mi-trabajo')}
        />
        <DashboardKpi
          icon={<Users/>}
          label="Tareas grupales"
          value={groupTaskPending.length}
          detail={profile.group_name||profile.warehouse||'Trabajo compartido'}
          tone="group"
          onClick={()=>onNavigate('tareas')}
        />
        <DashboardKpi
          icon={<RefreshCw/>}
          label="Relevos"
          value={groupRelevoPending.length}
          detail={profile.shift_name||'Continuidad de guardias'}
          tone="relevo"
          onClick={()=>onNavigate('relevos')}
        />
        <DashboardKpi
          icon={<AlertTriangle/>}
          label="Mis vencidas"
          value={overduePersonal.length}
          detail={overduePersonal.length?'Requieren atención':'Sin retrasos'}
          critical={overduePersonal.length>0}
          onClick={()=>onNavigate('mi-trabajo')}
        />
        <DashboardKpi
          icon={<CalendarClock/>}
          label="Próximos 7 días"
          value={due7.length}
          detail="Mis trabajos por vencer"
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

      <section className="universal-operational-reports">
        <div className="universal-report-heading">
          <div>
            <b>Reportes operativos</b>
            <span>{[profile.warehouse, profile.project].filter(Boolean).join(' · ') || 'Almacenes autorizados'}</span>
          </div>
        </div>

        <div className="universal-operational-kpis">
          <button type="button" onClick={()=>onNavigate(incidentRoute)}>
            <span className="operational-report-icon"><PackageSearch size={19}/></span>
            <span><small>INCIDENCIAS</small><b>{operationalIncidents.length}</b><em>{openIncidents.length} abiertas</em></span>
            <ChevronRight size={16}/>
          </button>
          <button type="button" onClick={()=>onNavigate(surplusRoute)}>
            <span className="operational-report-icon"><Boxes size={19}/></span>
            <span><small>SOBRANTES</small><b>{surplusIncidents.length}</b><em>{surplusQty.toLocaleString('es-PE',{maximumFractionDigits:2})} UND detectadas</em></span>
            <ChevronRight size={16}/>
          </button>
          <button type="button" onClick={()=>onNavigate(kardexRoute)}>
            <span className="operational-report-icon"><ClipboardList size={19}/></span>
            <span><small>KARDEX</small><b>{kardexBalance.toLocaleString('es-PE',{maximumFractionDigits:2})}</b><em>{kardexMaterials} materiales registrados</em></span>
            <ChevronRight size={16}/>
          </button>
        </div>

        <div className="universal-operational-charts">
          <div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate(incidentRoute)} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate(incidentRoute)}}>
            <ProfessionalDonutChart
              title="Incidencias por tipo"
              subtitle={profile.warehouse ? `Almacén ${profile.warehouse}` : 'Almacenes autorizados'}
              segments={incidentSegments}
            />
            <span className="dashboard-chart-access">Ver incidencias <ChevronRight size={14}/></span>
          </div>
          <div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate(kardexRoute)} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate(kardexRoute)}}>
            <ProfessionalBarChart
              title="Kardex de sobrantes"
              subtitle="Entradas, salidas y saldo actual"
              data={kardexChartData}
            />
            <span className="dashboard-chart-access">Ver Kardex <ChevronRight size={14}/></span>
          </div>
        </div>
      </section>

      <div className="universal-dashboard-charts">
        <div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate('mi-trabajo')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate('mi-trabajo')}}>
          <ProfessionalDonutChart
            title="Mis trabajos por estado"
            subtitle="Distribución de trabajo personal"
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
  icon,label,value,detail,onClick,critical=false,tone,
}:{
  icon:ReactNode
  label:string
  value:number
  detail:string
  onClick:()=>void
  critical?:boolean
  tone?:'personal'|'group'|'relevo'
}){
  const className=[
    'universal-kpi',
    critical?'critical':'',
    tone?`tone-${tone}`:'',
  ].filter(Boolean).join(' ')

  return (
    <button type="button" className={className} onClick={onClick}>
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
