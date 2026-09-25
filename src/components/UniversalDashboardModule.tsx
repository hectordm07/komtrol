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
  MailCheck,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  FileCheck2,
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
  oc_cargo_access_level?:'COMERCIAL'|'DOCUMENTARIO'|null
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
  warehouse:string|null
  project:string|null
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
  auto_email_status:'PENDIENTE'|'ENVIANDO'|'ENVIADO'|'ERROR'|'NO_CONFIGURADO'|null
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

type GuideFollowup={
  final_status:string|null
  client_delivery_date:string|null
  billing_status:string|null
}

type GuideRefrendo={
  id:string
}

type DashboardGuide={
  id:string
  guide_no:string
  guide_type:'ORDEN_COMPRA'|'CARGO_DIRECTO'|'REPOSICION'|'OTRO'
  load_status:'VALIDADO'|'OBSERVADO'
  warehouse:string|null
  group_name:string|null
  created_by:string
  responsible_user_id:string|null
  created_at:string
  oc_cargo_followups?:GuideFollowup[]|GuideFollowup|null
  guide_refrendos?:GuideRefrendo[]|null
}

type ReplenishmentReceipt={
  id:string
  guide_id:string|null
  guide_no:string|null
  warehouse:string|null
  group_name:string|null
  sap_kmmp_no:string|null
  sap_fiori_no:string|null
  sap_status:string|null
  ingress_id:string|null
}

type ReplenishmentIngress={
  id:string
  ingress_no:number
  warehouse:string|null
  sap_fiori_ni:string|null
  ingress_date:string
}


type Props={
  userId:string
  profile:Profile
  previewMode?:boolean
  availableTabs?:string[]
  adminValidationMode?:boolean
  adminProfile?:Profile|null
  onNavigate:(tab:string,options?:{
    taskStatus?:'TODOS'|'PENDIENTE'|'EN_PROCESO'|'BLOQUEADO'|'CERRADO'|'VENCIDA'
    restoreAdmin?:boolean
    commercialFilter?:'TODOS'|'PENDIENTE'|'EN_SEGUIMIENTO'|'OBSERVADO'|'ENTREGADO_CLIENTE'|'REFRENDADO'|'ANULADO'|'CERRADO'|'SIN_REFRENDO'|'CON_REFRENDO'
  })=>void
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

function groupMatches(userGroup?:string|null,rowGroup?:string|null){
  const normalize=(value?:string|null)=>String(value||'').trim().toUpperCase().replace(/\s+/g,'')
  const left=normalize(userGroup)
  const right=normalize(rowGroup)
  if(!left||!right) return false
  if(left===right) return true
  const split=(value:string)=>value.split(/[/,;|]+/).filter(Boolean)
  return split(right).includes(left)||split(left).includes(right)
}

function expiryTab(type:Expiration['expiration_type']){
  return type==='CURSO'
    ? 'vencimientos-cursos'
    : type==='LICENCIA_INTERNA'
      ? 'vencimientos-licencias'
      : 'vencimientos-emoa'
}

export function UniversalDashboardModule({
  userId,
  profile,
  previewMode=false,
  availableTabs=[],
  adminValidationMode=false,
  adminProfile=null,
  onNavigate,
}:Props){
  const [tasks,setTasks]=useState<Task[]>([])
  const [expirations,setExpirations]=useState<Expiration[]>([])
  const [notifications,setNotifications]=useState<Notification[]>([])
  const [incidents,setIncidents]=useState<Incident[]>([])
  const [kardexMovements,setKardexMovements]=useState<KardexMovement[]>([])
  const [guides,setGuides]=useState<DashboardGuide[]>([])
  const [replenishmentReceipts,setReplenishmentReceipts]=useState<ReplenishmentReceipt[]>([])
  const [replenishmentIngresses,setReplenishmentIngresses]=useState<ReplenishmentIngress[]>([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [lastUpdated,setLastUpdated]=useState<Date|null>(null)

  async function reload(options?:{silent?:boolean}){
    const silent=Boolean(options?.silent)
    if(!silent) setLoading(true)
    setMessage('')

    const isAdmin = profile.role==='ADMINISTRADOR' && !previewMode
    const isAreaRole = previewMode || profile.role==='SUPERVISOR' || profile.role==='COORDINADOR'

    let expiryQuery = supabase
      .from('compliance_expirations')
      .select('id,user_id,expiration_type,title,due_date,status,warehouse,project')

    if(isAdmin){
      // Administrador: dashboard global, sin recorte por almacén o usuario.
    }else if(isAreaRole){
      if(profile.warehouse) expiryQuery = expiryQuery.eq('warehouse',profile.warehouse)
      if(profile.project) expiryQuery = expiryQuery.eq('project',profile.project)
      if(previewMode) expiryQuery = expiryQuery.neq('user_id',userId)
    }else{
      expiryQuery = expiryQuery.eq('user_id',userId)
    }

    const [taskRes,expiryRes,notificationRes,incidentRes,kardexRes,guideRes,receiptRes,ingressRes]=await Promise.all([
      supabase
        .from('tasks')
        .select('id,task_no,work_type,title,warehouse,project,group_name,shift_name,relevo_from_shift,relevo_to_shift,responsible_id,assignment_type,assigned_user_id,assigned_group,assigned_shift,created_by,status,progress,priority,due_at,closed_at,created_at')
        .order('created_at',{ascending:false})
        .limit(5000),
      expiryQuery.order('due_date',{ascending:true}).limit(3000),
      supabase
        .from('app_notifications')
        .select('id,title,message,task_id,read_at,created_at')
        .eq('user_id',userId)
        .order('created_at',{ascending:false})
        .limit(100),
      supabase
        .from('incidents')
        .select('id,incident_no,incident_type,status,auto_email_status,warehouse,project,qty_expected,qty_received,qty_damaged,created_at')
        .order('created_at',{ascending:false})
        .limit(5000),
      supabase
        .from('surplus_kardex_movements')
        .select('id,warehouse,movement_type,source_type,material_no,quantity,stock_type,created_at')
        .order('created_at',{ascending:false})
        .limit(15000),
      supabase
        .from('guides')
        .select('id,guide_no,guide_type,load_status,warehouse,group_name,created_by,responsible_user_id,created_at,oc_cargo_followups(final_status,client_delivery_date,billing_status),guide_refrendos(id)')
        .in('guide_type',['ORDEN_COMPRA','CARGO_DIRECTO','REPOSICION'])
        .order('created_at',{ascending:false})
        .limit(5000),
      supabase
        .from('replenishment_receipts')
        .select('id,guide_id,guide_no,warehouse,group_name,sap_kmmp_no,sap_fiori_no,sap_status,ingress_id')
        .order('created_at',{ascending:false})
        .limit(5000),
      supabase
        .from('replenishment_ingresses')
        .select('id,ingress_no,warehouse,sap_fiori_ni,ingress_date')
        .order('ingress_date',{ascending:false})
        .limit(3000),
    ])

    const error=taskRes.error||expiryRes.error||notificationRes.error||incidentRes.error||kardexRes.error||guideRes.error||receiptRes.error||ingressRes.error
    if(error) setMessage(error.message)
    setTasks((taskRes.data??[]) as Task[])
    setExpirations((expiryRes.data??[]) as Expiration[])
    setNotifications(previewMode ? [] : (notificationRes.data??[]) as Notification[])
    setIncidents((incidentRes.data??[]) as Incident[])
    setKardexMovements((kardexRes.data??[]) as KardexMovement[])
    setGuides((guideRes.data??[]) as DashboardGuide[])
    setReplenishmentReceipts((receiptRes.data??[]) as ReplenishmentReceipt[])
    setReplenishmentIngresses((ingressRes.data??[]) as ReplenishmentIngress[])
    setLastUpdated(new Date())
    if(!silent) setLoading(false)
  }

  useEffect(()=>{
    void reload()
    const refresh=()=>void reload({silent:true})
    const onVisibility=()=>{ if(document.visibilityState==='visible') refresh() }
    const timer=window.setInterval(refresh,20_000)
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',onVisibility)
    return ()=>{
      window.clearInterval(timer)
      window.removeEventListener('focus',refresh)
      document.removeEventListener('visibilitychange',onVisibility)
    }
  },[userId,previewMode,profile.role,profile.warehouse,profile.project])

  const isAdminDashboard=profile.role==='ADMINISTRADOR'&&!previewMode
  const canAccess=(tab:string)=>!availableTabs.length||availableTabs.includes(tab)

  const personalTasks=useMemo(()=>tasks.filter((task)=>
    !previewMode &&
    task.work_type==='PERSONAL' &&
    (
      task.assigned_user_id===userId ||
      task.responsible_id===userId ||
      task.created_by===userId
    )
  ),[tasks,userId,previewMode])

  const groupTasks=useMemo(()=>tasks.filter((task)=>{
    if(task.work_type==='PERSONAL') return false
    if(isAdminDashboard) return true

    const normalizedWarehouse=String(profile.warehouse||'').trim().toUpperCase()
    const normalizedProject=String(profile.project||'').trim().toUpperCase()
    const normalizedShift=String(profile.shift_name||'').trim().toUpperCase()
    const taskWarehouse=String(task.warehouse||'').trim().toUpperCase()
    const taskProject=String(task.project||'').trim().toUpperCase()

    // Una tarea asignada a PERSONA se mantiene privada para el destinatario,
    // creador o responsable, incluso durante la vista simulada del Administrador.
    if(task.assignment_type==='PERSONA'){
      return task.assigned_user_id===profile.user_id ||
        task.responsible_id===profile.user_id ||
        task.created_by===profile.user_id
    }

    const sameWarehouse = normalizedWarehouse ? taskWarehouse===normalizedWarehouse : true
    const sameProject = normalizedProject
      ? (!taskProject || taskProject===normalizedProject)
      : true

    if(!sameWarehouse || !sameProject) return false

    // Supervisor y Coordinador representan al almacén/proyecto completo:
    // ven TODOS los trabajos grupales y relevos del ámbito, sin limitar por grupo/guardia.
    if(profile.role==='SUPERVISOR' || profile.role==='COORDINADOR') return true

    if(profile.group_name && !groupMatches(profile.group_name,task.group_name) && !groupMatches(profile.group_name,task.assigned_group)) return false

    if(task.assignment_type==='GUARDIA' && normalizedShift && task.assigned_shift){
      if(String(task.assigned_shift).trim().toUpperCase()!==normalizedShift) return false
    }

    // El Almacenero conserva además la continuidad de su propia guardia en relevos.
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
  }),[tasks,userId,previewMode,isAdminDashboard,profile.role,profile.warehouse,profile.project,profile.group_name,profile.shift_name])

  const adminScopeWarehouse=String(adminProfile?.warehouse||'').trim().toUpperCase()
  const adminScopeProject=String(adminProfile?.project||'').trim().toUpperCase()
  const adminScopeGroup=String(adminProfile?.group_name||'').trim().toUpperCase()
  const adminScopeShift=String(adminProfile?.shift_name||'').trim().toUpperCase()

  const adminSameScope=(task:Task)=>{
    const warehouse=String(task.warehouse||'').trim().toUpperCase()
    const project=String(task.project||'').trim().toUpperCase()
    if(adminScopeWarehouse&&warehouse&&warehouse!==adminScopeWarehouse) return false
    if(adminScopeProject&&project&&project!==adminScopeProject) return false
    return true
  }

  const adminDirectTask=(task:Task)=>
    task.assigned_user_id===userId||
    task.responsible_id===userId||
    task.created_by===userId

  const adminValidationPersonal=tasks.filter((task)=>
    adminValidationMode &&
    task.work_type==='PERSONAL' &&
    isOpen(task) &&
    adminDirectTask(task)
  )

  const adminValidationTasks=tasks.filter((task)=>{
    if(!adminValidationMode||task.work_type!=='TAREA'||!isOpen(task)) return false
    if(adminDirectTask(task)) return true
    if(!adminSameScope(task)) return false
    if(task.assignment_type==='GRUPO'&&adminScopeGroup){
      const assigned=String(task.assigned_group||task.group_name||'').trim().toUpperCase()
      return assigned===adminScopeGroup
    }
    if(task.assignment_type==='GUARDIA'&&adminScopeShift){
      return String(task.assigned_shift||task.shift_name||'').trim().toUpperCase()===adminScopeShift
    }
    return false
  })

  const adminValidationRelevos=tasks.filter((task)=>{
    if(!adminValidationMode||task.work_type!=='RELEVO'||!isOpen(task)) return false
    if(adminDirectTask(task)) return true
    if(!adminSameScope(task)||!adminScopeShift) return false
    const shifts=[
      task.assigned_shift,
      task.shift_name,
      task.relevo_from_shift,
      task.relevo_to_shift,
    ].map((value)=>String(value||'').trim().toUpperCase()).filter(Boolean)
    return shifts.includes(adminScopeShift)
  })

  const dashboardTaskBase=isAdminDashboard
    ? tasks.filter((task)=>task.work_type!=='PERSONAL')
    : personalTasks
  const openPersonal=dashboardTaskBase.filter(isOpen)
  const overduePersonal=dashboardTaskBase.filter(isOverdue)
  const due7=dashboardTaskBase.filter((task)=>{
    if(!isOpen(task)) return false
    const days=daysUntil(task.due_at)
    return days!==null && days>=0 && days<=7
  })
  const groupPending=groupTasks.filter(isOpen)
  const groupTaskPending=groupPending.filter((task)=>task.work_type==='TAREA')
  const groupRelevoPending=groupPending.filter((task)=>task.work_type==='RELEVO')
  const isAreaManager=profile.role==='COORDINADOR'||profile.role==='SUPERVISOR'
  const groupScopeDetail=isAreaManager
    ? `${profile.warehouse||'Almacén'} · todos los grupos`
    : (profile.group_name||profile.warehouse||'Trabajo compartido')
  const relayScopeDetail=isAreaManager
    ? `${profile.warehouse||'Almacén'} · todas las guardias`
    : (profile.shift_name||'Continuidad de guardias')
  const unread=notifications.filter((row)=>!row.read_at).length
  const operationalWarehouse=(profile.warehouse||'').trim().toUpperCase()
  const operationalProject=(profile.project||'').trim().toUpperCase()

  function scopeWarehouse<T extends {warehouse?:string|null}>(rows:T[]){
    if(isAdminDashboard) return rows
    if(!operationalWarehouse) return []
    return rows.filter((row)=>String(row.warehouse||'').trim().toUpperCase()===operationalWarehouse)
  }

  const isCommercialProfile=profile.oc_cargo_access_level==='COMERCIAL'
  const operationalGuides=guides.filter((guide)=>{
    if(isAdminDashboard) return true
    if(isCommercialProfile) return guide.guide_type==='ORDEN_COMPRA'
    if(String(guide.warehouse||'').trim().toUpperCase()!==operationalWarehouse) return false
    if(isAreaManager) return true
    if(guide.created_by===profile.user_id || guide.responsible_user_id===profile.user_id) return true
    return groupMatches(profile.group_name,guide.group_name)
  })
  const operationalGuideIds=new Set(operationalGuides.map((guide)=>guide.id))
  const operationalReplenishmentReceipts=isAdminDashboard || isAreaManager
    ? scopeWarehouse(replenishmentReceipts)
    : replenishmentReceipts.filter((row)=>
        String(row.warehouse||'').trim().toUpperCase()===operationalWarehouse &&
        (
          (row.guide_id ? operationalGuideIds.has(row.guide_id) : false) ||
          groupMatches(profile.group_name,row.group_name)
        )
      )
  const operationalIngressIds=new Set(
    operationalReplenishmentReceipts
      .map((row)=>row.ingress_id)
      .filter((value):value is string=>Boolean(value))
  )
  const operationalReplenishmentIngresses=isAdminDashboard || isAreaManager
    ? scopeWarehouse(replenishmentIngresses)
    : replenishmentIngresses.filter((row)=>operationalIngressIds.has(row.id))

  const operationalIncidents=incidents.filter((row)=>{
    if(isAdminDashboard) return true
    const sameWarehouse=String(row.warehouse||'').trim().toUpperCase()===operationalWarehouse
    if(!sameWarehouse) return false
    if(!operationalProject) return true
    const rowProject=String(row.project||'').trim().toUpperCase()
    return !rowProject || rowProject===operationalProject
  })
  const operationalKardex=scopeWarehouse(kardexMovements)
  const openIncidents=operationalIncidents.filter((row)=>row.status!=='CERRADO')
  const incidentEmailsSent=operationalIncidents.filter((row)=>row.auto_email_status==='ENVIADO').length
  const incidentEmailsPending=operationalIncidents.filter((row)=>
    row.auto_email_status==='PENDIENTE' ||
    row.auto_email_status==='ENVIANDO' ||
    !row.auto_email_status
  ).length
  const incidentEmailsError=operationalIncidents.filter((row)=>
    row.auto_email_status==='ERROR' || row.auto_email_status==='NO_CONFIGURADO'
  ).length
  const incidentEmailCoverage=operationalIncidents.length
    ? Math.round((incidentEmailsSent/operationalIncidents.length)*100)
    : 0
  const surplusIncidents=operationalIncidents.filter((row)=>row.incident_type==='SOBRANTE')
  const surplusQty=surplusIncidents.reduce((sum,row)=>{
    const diff=Math.max(0,Number(row.qty_received||0)-Number(row.qty_expected||0))
    return sum+diff
  },0)
  const shortageIncidents=operationalIncidents.filter((row)=>row.incident_type==='FALTANTE')
  const shortageQty=shortageIncidents.reduce((sum,row)=>{
    const diff=Math.max(0,Number(row.qty_expected||0)-Number(row.qty_received||0))
    return sum+diff
  },0)
  const kardexEntries=operationalKardex
    .filter((row)=>row.movement_type==='ENTRADA')
    .reduce((sum,row)=>sum+Number(row.quantity||0),0)
  const kardexExits=operationalKardex
    .filter((row)=>row.movement_type==='SALIDA')
    .reduce((sum,row)=>sum+Number(row.quantity||0),0)
  const kardexBalance=Math.max(0,kardexEntries-kardexExits)
  const kardexByMaterial=new Map<string,number>()
  operationalKardex.forEach((row)=>{
    if(!row.material_no) return
    const current=kardexByMaterial.get(row.material_no)||0
    const delta=row.movement_type==='ENTRADA'
      ? Number(row.quantity||0)
      : row.movement_type==='SALIDA'
        ? -Number(row.quantity||0)
        : 0
    kardexByMaterial.set(row.material_no,current+delta)
  })
  const kardexMaterials=[...kardexByMaterial.values()].filter((value)=>value>0).length
  const incidentRoute=isAdminDashboard?'incidencias':operationalWarehouse==='CALLAO'?'inbound-incidencias':'incidencias'
  const surplusRoute=isAdminDashboard?'kardex-sobrantes':operationalWarehouse==='CALLAO'?'inbound-cajas':'kardex-sobrantes'
  const kardexRoute=isAdminDashboard?'kardex-sobrantes':operationalWarehouse==='CALLAO'?'inbound-kardex':'kardex-sobrantes'

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
    {key:'PENDIENTE',label:'Pendiente',value:dashboardTaskBase.filter((t)=>t.status==='PENDIENTE'&&!isOverdue(t)).length},
    {key:'EN_PROCESO',label:'En proceso',value:dashboardTaskBase.filter((t)=>t.status==='EN_PROCESO'&&!isOverdue(t)).length},
    {key:'BLOQUEADO',label:'Bloqueado',value:dashboardTaskBase.filter((t)=>t.status==='BLOQUEADO').length},
    {key:'CERRADO',label:'Cerrado',value:dashboardTaskBase.filter((t)=>t.status==='CERRADO').length},
    {key:'VENCIDA',label:'Vencido',value:overduePersonal.length},
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
      const value=dashboardTaskBase.filter((task)=>{
        const created=new Date(task.created_at)
        return created.getFullYear()===year&&created.getMonth()===month
      }).length
      points.push({label:monthNames[month],value})
    }
    return points
  },[dashboardTaskBase])

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

  function guideFollowupStatus(guide:DashboardGuide){
    const value=guide.oc_cargo_followups
    const row=Array.isArray(value)?value[0]:value
    return row?.final_status||'PENDIENTE'
  }

  const purchaseOrders=operationalGuides.filter((guide)=>guide.guide_type==='ORDEN_COMPRA')
  const directCharges=operationalGuides.filter((guide)=>guide.guide_type==='CARGO_DIRECTO')
  const replenishmentGuides=operationalGuides.filter((guide)=>guide.guide_type==='REPOSICION')
  const pendingPurchaseOrders=purchaseOrders.filter((guide)=>['PENDIENTE','EN_SEGUIMIENTO'].includes(guideFollowupStatus(guide)))
  const observedPurchaseOrders=purchaseOrders.filter((guide)=>guideFollowupStatus(guide)==='OBSERVADO')
  const deliveredPurchaseOrders=purchaseOrders.filter((guide)=>guideFollowupStatus(guide)==='ENTREGADO_CLIENTE')
  const refrendadoPurchaseOrders=purchaseOrders.filter((guide)=>guideFollowupStatus(guide)==='REFRENDADO')
  const closedPurchaseOrders=purchaseOrders.filter((guide)=>guideFollowupStatus(guide)==='CERRADO')
  const pendingDirectDelivery=directCharges.filter((guide)=>{
    const value=guide.oc_cargo_followups
    const row=Array.isArray(value)?value[0]:value
    const finalStatus=row?.final_status||'PENDIENTE'
    return !row?.client_delivery_date && !['ANULADO','CERRADO','ENTREGADO_CLIENTE','REFRENDADO'].includes(finalStatus)
  })
  const purchaseOrdersWithoutRefrendo=purchaseOrders.filter((guide)=>(guide.guide_refrendos?.length||0)===0)
  const purchaseOrdersWithRefrendo=purchaseOrders.filter((guide)=>(guide.guide_refrendos?.length||0)>0)
  const purchaseOrdersBillingSent=purchaseOrders.filter((guide)=>{
    const value=guide.oc_cargo_followups
    const row=Array.isArray(value)?value[0]:value
    return ['ENVIADO','REENVIADO','CONFIRMADO'].includes(row?.billing_status||'')
  })
  const pendingSapKmmp=operationalReplenishmentReceipts.filter((row)=>!/^18\d+$/.test(String(row.sap_kmmp_no||'')))
  const pendingFioriIngresses=operationalReplenishmentIngresses.filter((row)=>!/^50\d+$/.test(String(row.sap_fiori_ni||'')))
  const guideTypeSegments=[
    {label:'Reposición',value:replenishmentGuides.length},
    {label:'Órdenes de compra',value:purchaseOrders.length},
    {label:'Cargos directos',value:directCharges.length},
  ]
  const directCargoSegments=[
    {key:'PENDIENTE_ENTREGA',label:'Pend. entrega',value:pendingDirectDelivery.length},
    {key:'ENTREGADOS',label:'Entregados',value:Math.max(0,directCharges.length-pendingDirectDelivery.length)},
  ]
  const kmmpCompleted=Math.max(0,operationalReplenishmentReceipts.length-pendingSapKmmp.length)
  const fioriCompleted=Math.max(0,operationalReplenishmentIngresses.length-pendingFioriIngresses.length)
  const documentFlowData=[
    {key:'GUIAS',label:'Guías reposición',value:replenishmentGuides.length,detail:'Total de guías de reposición registradas en KOMTROL.'},
    {key:'KMMP',label:'KMMP completado',value:kmmpCompleted,detail:`${pendingSapKmmp.length} pendiente(s) de ingreso SAP KMMP de ${operationalReplenishmentReceipts.length} recepción(es).`},
    {key:'INGRESOS',label:'Ingresos reposición',value:operationalReplenishmentIngresses.length,detail:'Agrupaciones de ingreso generadas desde Hojas de Ubicación.'},
    {key:'FIORI',label:'FIORI completado',value:fioriCompleted,detail:`${pendingFioriIngresses.length} ingreso(s) pendiente(s) de NI SAP FIORI.`},
    {key:'OC',label:'Órdenes de compra',value:purchaseOrders.length,detail:`${pendingPurchaseOrders.length} OC pendiente(s) · ${purchaseOrdersWithoutRefrendo.length} sin refrendo.`},
    {key:'CARGO',label:'Cargos entregados',value:Math.max(0,directCharges.length-pendingDirectDelivery.length),detail:`${pendingDirectDelivery.length} cargo(s) directo(s) pendiente(s) de entrega al cliente.`},
  ]
  const urgentExpirations=activeExpirations.filter((row)=>{
    const days=daysUntil(row.due_date)
    return days!==null&&days<=30
  }).length
  const commercialPendingTotal=pendingPurchaseOrders.length
  const operationsPendingTotal=pendingSapKmmp.length+pendingFioriIngresses.length+pendingDirectDelivery.length
  const communicationsPendingTotal=incidentEmailsPending+incidentEmailsError
  const globalPendingTotal=
    openPersonal.length+
    openIncidents.length+
    urgentExpirations+
    commercialPendingTotal+
    operationsPendingTotal

  const purchaseOrderRoute =
    isCommercialProfile && canAccess('comercial-ordenes-compra')
      ? 'comercial-ordenes-compra'
      : canAccess('ordenes-compra')
        ? 'ordenes-compra'
        : canAccess('comercial-ordenes-compra')
          ? 'comercial-ordenes-compra'
          : null

  const purchaseOrderStatusSegments=[
    {key:'PENDIENTE',label:'Pendiente',value:purchaseOrders.filter((guide)=>guideFollowupStatus(guide)==='PENDIENTE').length},
    {key:'EN_SEGUIMIENTO',label:'En seguimiento',value:purchaseOrders.filter((guide)=>guideFollowupStatus(guide)==='EN_SEGUIMIENTO').length},
    {key:'OBSERVADO',label:'Observado',value:observedPurchaseOrders.length},
    {key:'ENTREGADO_CLIENTE',label:'Entregado',value:deliveredPurchaseOrders.length},
    {key:'REFRENDADO',label:'Refrendado',value:refrendadoPurchaseOrders.length},
    {key:'CERRADO',label:'Cerrado',value:closedPurchaseOrders.length},
  ]
  const purchaseOrderProgressData=[
    {key:'TODOS',label:'OC registradas',value:purchaseOrders.length,detail:'Órdenes de Compra visibles según el perfil.'},
    {key:'PENDIENTE',label:'Pendientes',value:pendingPurchaseOrders.length,detail:'Pendientes o en seguimiento.'},
    {key:'OBSERVADO',label:'Observadas',value:observedPurchaseOrders.length,detail:'Requieren revisión o regularización.'},
    {key:'CON_REFRENDO',label:'Con refrendo',value:purchaseOrdersWithRefrendo.length,detail:'Refrendos disponibles para visualizar o descargar.'},
    {key:'FACTURACION',label:'Facturación',value:purchaseOrdersBillingSent.length,detail:'Órdenes enviadas o confirmadas para facturación.'},
  ]

  const hasTaskAccess=canAccess(isAdminDashboard?'tareas-globales':'mi-trabajo')
  const hasExpirationAccess=['vencimientos-emoa','vencimientos-cursos','vencimientos-licencias'].some(canAccess)
  const hasDocumentFlowAccess=['ingresos-reposicion','hoja-ubicacion','ordenes-compra','cargos-directos','seguimiento-guias'].some(canAccess)
  const hasOperationalReportAccess=[incidentRoute,surplusRoute,kardexRoute].some(canAccess)
  const inboundReportOnly=
    canAccess('inbound-incidencias') &&
    !canAccess('incidencias') &&
    !hasDocumentFlowAccess

  const visibleDocumentFlowData=documentFlowData.filter((row)=>{
    if(row.key==='FIORI'||row.key==='INGRESOS') return canAccess('hoja-ubicacion')
    if(row.key==='OC') return canAccess('ordenes-compra')
    if(row.key==='CARGO') return canAccess('cargos-directos')
    if(row.key==='GUIAS'||row.key==='KMMP') return canAccess('ingresos-reposicion')
    return false
  })

  if(loading){
    return <div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando dashboard…</p></div>
  }

  return (
    <div className="universal-dashboard">
      <div className="dashboard-live-toolbar">
        <span><i/> Datos en vivo{lastUpdated ? ` · actualizado ${lastUpdated.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}` : ''}</span>
        <button type="button" className="secondary-button" onClick={()=>void reload({silent:true})}><RefreshCw size={14}/> Actualizar</button>
      </div>
      {message&&<div className="inline-message">{message}</div>}

      {adminValidationMode&&(
        <section className="panel admin-preview-validation">
          <div className="admin-preview-validation-head">
            <div>
              <b>Validación del Administrador</b>
              <span>Tus pendientes reales permanecen visibles mientras pruebas otra vista del sistema.</span>
            </div>
            <span className="status-pill">Vista de prueba</span>
          </div>
          <div className="admin-preview-validation-grid">
            <button type="button" onClick={()=>onNavigate('mi-trabajo',{restoreAdmin:true})}>
              <ClipboardList size={18}/>
              <span><small>MIS TRABAJOS</small><b>{adminValidationPersonal.length}</b><em>Pendientes personales</em></span>
              <ChevronRight size={15}/>
            </button>
            <button type="button" onClick={()=>onNavigate('tareas',{restoreAdmin:true})}>
              <Users size={18}/>
              <span><small>TAREAS ASIGNADAS / CREADAS</small><b>{adminValidationTasks.length}</b><em>Pendientes operativos propios</em></span>
              <ChevronRight size={15}/>
            </button>
            <button type="button" onClick={()=>onNavigate('relevos',{restoreAdmin:true})}>
              <RefreshCw size={18}/>
              <span><small>RELEVOS</small><b>{adminValidationRelevos.length}</b><em>Pendientes vinculados contigo</em></span>
              <ChevronRight size={15}/>
            </button>
          </div>
        </section>
      )}

      <div className="universal-dashboard-kpis">
        {hasTaskAccess&&<DashboardKpi
          icon={<ClipboardList/>}
          label={isAdminDashboard?'Pendientes globales':'Mis trabajos'}
          value={isAdminDashboard?globalPendingTotal:openPersonal.length}
          detail={isAdminDashboard?`${openPersonal.length} tareas · ${openIncidents.length} incidencias`:`${personalTasks.filter((t)=>t.status==='EN_PROCESO').length} en proceso`}
          tone="personal"
          onClick={()=>onNavigate(isAdminDashboard?'tareas-globales':'mi-trabajo',{taskStatus:'TODOS'})}
        />}
        {canAccess('tareas')&&<DashboardKpi
          icon={<Users/>}
          label="Tareas grupales"
          value={groupTaskPending.length}
          detail={groupScopeDetail}
          tone="group"
          onClick={()=>onNavigate('tareas')}
        />}
        {canAccess('relevos')&&<DashboardKpi
          icon={<RefreshCw/>}
          label="Relevos"
          value={groupRelevoPending.length}
          detail={relayScopeDetail}
          tone="relevo"
          onClick={()=>onNavigate('relevos')}
        />}
        {hasTaskAccess&&<DashboardKpi
          icon={<AlertTriangle/>}
          label={isAdminDashboard?'Vencidas globales':'Mis vencidas'}
          value={overduePersonal.length}
          detail={overduePersonal.length?'Requieren atención':'Sin retrasos'}
          critical={overduePersonal.length>0}
          onClick={()=>onNavigate(isAdminDashboard?'tareas-globales':'mi-trabajo',{taskStatus:'VENCIDA'})}
        />}
        {hasTaskAccess&&<DashboardKpi
          icon={<CalendarClock/>}
          label="Próximos 7 días"
          value={due7.length}
          detail={isAdminDashboard?'Pendientes globales por vencer':'Mis trabajos por vencer'}
          onClick={()=>onNavigate(isAdminDashboard?'tareas-globales':'mi-trabajo',{taskStatus:'TODOS'})}
        />}
        {canAccess('vencimientos-emoa')&&<DashboardKpi
          icon={<ShieldCheck/>}
          label="EMOA"
          value={expiryByType('EMOA').length}
          detail={emoaNearest?nearestText(emoaNearest.days):'Sin registro activo'}
          onClick={()=>onNavigate('vencimientos-emoa')}
        />}
        {canAccess('vencimientos-cursos')&&<DashboardKpi
          icon={<GraduationCap/>}
          label="Cursos"
          value={expiryByType('CURSO').length}
          detail={courseNearest?nearestText(courseNearest.days):'Sin registro activo'}
          onClick={()=>onNavigate('vencimientos-cursos')}
        />}
        {canAccess('vencimientos-licencias')&&<DashboardKpi
          icon={<BadgeCheck/>}
          label="Licencias internas"
          value={expiryByType('LICENCIA_INTERNA').length}
          detail={licenseNearest?nearestText(licenseNearest.days):'Sin registro activo'}
          onClick={()=>onNavigate('vencimientos-licencias')}
        />}
        {canAccess('alertas')&&<DashboardKpi
          icon={<Bell/>}
          label="Alertas"
          value={unread}
          detail={unread?'Sin leer':'Todo revisado'}
          onClick={()=>onNavigate('alertas')}
        />}
        {canAccess(incidentRoute)&&<DashboardKpi
          icon={<MailCheck/>}
          label="Correo de incidencias"
          value={`${incidentEmailsSent} / ${operationalIncidents.length}`}
          detail={
            !operationalIncidents.length
              ? 'Sin incidencias reportadas'
              : incidentEmailsError
                ? `${incidentEmailsPending} pendientes · ${incidentEmailsError} con error`
                : `${incidentEmailCoverage}% notificadas · ${incidentEmailsPending} pendientes`
          }
          critical={incidentEmailsError>0}
          onClick={()=>onNavigate(incidentRoute)}
        />}
      </div>

      {purchaseOrderRoute&&<section className="universal-operational-reports dashboard-commercial-oc-section">
        <div className="universal-report-heading">
          <div>
            <b>Órdenes de Compra</b>
            <span>{isCommercialProfile
              ? 'Área Comercial · seguimiento documental de todas las OC'
              : isAdminDashboard
                ? 'Vista global · estado documental de las OC'
                : `Información visible para ${profile.warehouse||profile.project||'tu perfil'}`}</span>
          </div>
        </div>

        <div className="document-flow-kpis dashboard-commercial-oc-kpis">
          <button type="button" onClick={()=>onNavigate(purchaseOrderRoute,{commercialFilter:'TODOS'})}>
            <span className="operational-report-icon"><ShoppingCart size={19}/></span>
            <span><small>OC REGISTRADAS</small><b>{purchaseOrders.length}</b><em>Universo visible del perfil</em></span>
            <ChevronRight size={16}/>
          </button>
          <button type="button" className={pendingPurchaseOrders.length?'attention':''} onClick={()=>onNavigate(purchaseOrderRoute,{commercialFilter:'PENDIENTE'})}>
            <span className="operational-report-icon"><Clock3 size={19}/></span>
            <span><small>PENDIENTES</small><b>{pendingPurchaseOrders.length}</b><em>Requieren seguimiento</em></span>
            <ChevronRight size={16}/>
          </button>
          <button type="button" className={observedPurchaseOrders.length?'attention':''} onClick={()=>onNavigate(purchaseOrderRoute,{commercialFilter:'OBSERVADO'})}>
            <span className="operational-report-icon"><AlertTriangle size={19}/></span>
            <span><small>OBSERVADOS</small><b>{observedPurchaseOrders.length}</b><em>Requieren regularización</em></span>
            <ChevronRight size={16}/>
          </button>
          <button type="button" className="success" onClick={()=>onNavigate(purchaseOrderRoute,{commercialFilter:'CON_REFRENDO'})}>
            <span className="operational-report-icon"><CheckCircle2 size={19}/></span>
            <span><small>REFRENDO DISPONIBLE</small><b>{purchaseOrdersWithRefrendo.length}</b><em>Listo para visualizar o descargar</em></span>
            <ChevronRight size={16}/>
          </button>
        </div>

        <div className="universal-operational-charts dashboard-commercial-oc-charts">
          <div className="dashboard-chart-link">
            <ProfessionalDonutChart
              title="Estado de Órdenes de Compra"
              subtitle="Distribución actual del flujo documental"
              segments={purchaseOrderStatusSegments}
              onSelect={(key)=>onNavigate(purchaseOrderRoute,{commercialFilter:key as 'PENDIENTE'|'EN_SEGUIMIENTO'|'OBSERVADO'|'ENTREGADO_CLIENTE'|'REFRENDADO'|'CERRADO'})}
            />
            <span className="dashboard-chart-access">Ver Órdenes de Compra <ChevronRight size={14}/></span>
          </div>
          <div className="dashboard-chart-link">
            <ProfessionalBarChart
              title="Avance documental de OC"
              subtitle="Registro, observaciones, refrendos y facturación"
              data={purchaseOrderProgressData}
              onSelect={(key)=>{
                const filter =
                  key==='OBSERVADO' ? 'OBSERVADO' :
                  key==='CON_REFRENDO' ? 'CON_REFRENDO' :
                  key==='PENDIENTE' ? 'PENDIENTE' :
                  'TODOS'
                onNavigate(purchaseOrderRoute,{commercialFilter:filter})
              }}
            />
            <span className="dashboard-chart-access">Abrir reporte documental <ChevronRight size={14}/></span>
          </div>
        </div>
      </section>}

      {hasDocumentFlowAccess&&!isCommercialProfile&&<section className="universal-operational-reports document-flow-section">
        <div className="universal-report-heading">
          <div>
            <b>Flujo documental y recepción</b>
            <span>{isAdminDashboard
              ? 'Vista global de guías, SAP y entregas'
              : isAreaManager
                ? `Almacén ${profile.warehouse||''} · visión completa del ámbito`
                : profile.warehouse
                  ? 'Almacén ' + profile.warehouse
                  : 'Información autorizada para tu perfil'}</span>
          </div>
        </div>

        <div className="document-flow-kpis">
          {canAccess('ingresos-reposicion')&&<>
            <button type="button" onClick={()=>onNavigate('ingresos-reposicion')}>
              <span className="operational-report-icon"><PackageSearch size={19}/></span>
              <span><small>GUÍAS REPOSICIÓN</small><b>{replenishmentGuides.length}</b><em>Total registradas</em></span>
              <ChevronRight size={16}/>
            </button>
            <button type="button" className={pendingSapKmmp.length?'attention':''} onClick={()=>onNavigate('ingresos-reposicion')}>
              <span className="operational-report-icon"><FileCheck2 size={19}/></span>
              <span><small>SAP KMMP</small><b>{kmmpCompleted}/{operationalReplenishmentReceipts.length}</b><em>{pendingSapKmmp.length} pendientes · doc. 18…</em></span>
              <ChevronRight size={16}/>
            </button>
          </>}
          {canAccess('hoja-ubicacion')&&<>
            <button type="button" onClick={()=>onNavigate('hoja-ubicacion')}>
              <span className="operational-report-icon"><ClipboardList size={19}/></span>
              <span><small>INGRESOS REPOSICIÓN</small><b>{operationalReplenishmentIngresses.length}</b><em>Agrupaciones generadas</em></span>
              <ChevronRight size={16}/>
            </button>
            <button type="button" className={pendingFioriIngresses.length?'attention':''} onClick={()=>onNavigate('hoja-ubicacion')}>
              <span className="operational-report-icon"><ClipboardList size={19}/></span>
              <span><small>SAP FIORI</small><b>{fioriCompleted}/{operationalReplenishmentIngresses.length}</b><em>{pendingFioriIngresses.length} pendientes · NI 50…</em></span>
              <ChevronRight size={16}/>
            </button>
          </>}
          {canAccess('ordenes-compra')&&<button type="button" className={pendingPurchaseOrders.length?'attention':''} onClick={()=>onNavigate('ordenes-compra')}>
            <span className="operational-report-icon"><ShoppingCart size={19}/></span>
            <span><small>ÓRDENES DE COMPRA</small><b>{purchaseOrders.length}</b><em>{pendingPurchaseOrders.length} pendientes · {purchaseOrdersWithoutRefrendo.length} sin refrendo</em></span>
            <ChevronRight size={16}/>
          </button>}
          {canAccess('cargos-directos')&&<button type="button" className={pendingDirectDelivery.length?'attention':''} onClick={()=>onNavigate('cargos-directos')}>
            <span className="operational-report-icon"><FileCheck2 size={19}/></span>
            <span><small>CARGOS DIRECTOS</small><b>{directCharges.length}</b><em>{pendingDirectDelivery.length} pendientes de entrega</em></span>
            <ChevronRight size={16}/>
          </button>}
        </div>

        <div className="universal-operational-charts document-flow-charts">
          {visibleDocumentFlowData.length>0&&<div className="dashboard-chart-link">
            <ProfessionalBarChart
              title="Avance del proceso de ingreso"
              subtitle="Diferencia guías registradas vs. ingresos SAP"
              data={visibleDocumentFlowData}
              onSelect={(key)=>{
                if(key==='FIORI') onNavigate('hoja-ubicacion')
                else if(key==='OC') onNavigate('ordenes-compra')
                else if(key==='CARGO') onNavigate('cargos-directos')
                else onNavigate('ingresos-reposicion')
              }}
            />
            <span className="dashboard-chart-access">Abrir tratamiento <ChevronRight size={14}/></span>
          </div>}
          {canAccess('seguimiento-guias')&&<div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate('seguimiento-guias')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate('seguimiento-guias')}}>
            <ProfessionalDonutChart
              title="Guías registradas por tipo"
              subtitle="Distribución visible según tu perfil"
              segments={guideTypeSegments}
            />
            <span className="dashboard-chart-access">Ver Seguimiento de Guías <ChevronRight size={14}/></span>
          </div>}
          {canAccess('cargos-directos')&&directCharges.length>0&&<div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate('cargos-directos')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate('cargos-directos')}}>
            <ProfessionalDonutChart
              title="Estado de Cargos Directos"
              subtitle="Entregas pendientes y completadas para este perfil"
              segments={directCargoSegments}
            />
            <span className="dashboard-chart-access">Abrir Cargos Directos <ChevronRight size={14}/></span>
          </div>}
        </div>
      </section>}

      {hasOperationalReportAccess&&<section className="universal-operational-reports">
        <div className="universal-report-heading">
          <div>
            <b>{inboundReportOnly?'Reportes Inbound · Callao':'Reportes operativos'}</b>
            <span>{inboundReportOnly
              ? 'Indicadores autorizados para la operación Inbound de Callao'
              : isAdminDashboard
                ? 'Vista global · todos los almacenes y proyectos'
                : [profile.warehouse, profile.project].filter(Boolean).join(' · ') || 'Almacenes autorizados'}</span>
          </div>
        </div>

        <div className="universal-operational-kpis">
          {canAccess(incidentRoute)&&<button type="button" onClick={()=>onNavigate(incidentRoute)}>
            <span className="operational-report-icon"><PackageSearch size={19}/></span>
            <span><small>INCIDENCIAS</small><b>{operationalIncidents.length}</b><em>{openIncidents.length} abiertas</em></span>
            <ChevronRight size={16}/>
          </button>}
          {canAccess(surplusRoute)&&<button type="button" onClick={()=>onNavigate(surplusRoute)}>
            <span className="operational-report-icon"><Boxes size={19}/></span>
            <span><small>SOBRANTES</small><b>{surplusIncidents.length}</b><em>{surplusQty.toLocaleString('es-PE',{maximumFractionDigits:2})} UND detectadas</em></span>
            <ChevronRight size={16}/>
          </button>}
          {canAccess(kardexRoute)&&<button type="button" onClick={()=>onNavigate(kardexRoute)}>
            <span className="operational-report-icon"><ClipboardList size={19}/></span>
            <span><small>KARDEX</small><b>{kardexBalance.toLocaleString('es-PE',{maximumFractionDigits:2})}</b><em>{kardexMaterials} materiales con saldo</em></span>
            <ChevronRight size={16}/>
          </button>}
          {canAccess(incidentRoute)&&<button type="button" className="operational-report-missing" onClick={()=>onNavigate(incidentRoute)}>
            <span className="operational-report-icon"><AlertTriangle size={19}/></span>
            <span><small>FALTANTES</small><b>{shortageIncidents.length}</b><em>{shortageQty.toLocaleString('es-PE',{maximumFractionDigits:2})} UND detectadas</em></span>
            <ChevronRight size={16}/>
          </button>}
        </div>

        <div className="universal-operational-charts">
          {canAccess(incidentRoute)&&<div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate(incidentRoute)} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate(incidentRoute)}}>
            <ProfessionalDonutChart
              title="Incidencias por tipo"
              subtitle={isAdminDashboard?'Todos los almacenes':profile.warehouse ? `Almacén ${profile.warehouse}` : 'Almacenes autorizados'}
              segments={incidentSegments}
            />
            <span className="dashboard-chart-access">Ver incidencias <ChevronRight size={14}/></span>
          </div>}
          {canAccess(kardexRoute)&&<div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate(kardexRoute)} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate(kardexRoute)}}>
            <ProfessionalBarChart
              title="Kardex de sobrantes"
              subtitle="Entradas, salidas y saldo actual"
              data={kardexChartData}
            />
            <span className="dashboard-chart-access">Ver Kardex <ChevronRight size={14}/></span>
          </div>}
        </div>
      </section>}

      {isAdminDashboard&&(
        <section className="universal-operational-reports admin-global-control">
          <div className="universal-report-heading">
            <div>
              <b>Pendientes por área</b>
              <span>Vista ejecutiva del Administrador · todas las áreas de KOMTROL.</span>
            </div>
            <span className="status-pill">{globalPendingTotal.toLocaleString('es-PE')} pendientes operativos</span>
          </div>

          <div className="universal-operational-kpis admin-area-kpis">
            <button type="button" onClick={()=>onNavigate('tareas-globales',{taskStatus:'TODOS'})}>
              <span className="operational-report-icon"><ClipboardList size={19}/></span>
              <span><small>ÁREA DE TRABAJO</small><b>{openPersonal.length}</b><em>Tareas abiertas de toda la operación</em></span>
              <ChevronRight size={16}/>
            </button>
            <button type="button" className={urgentExpirations?'operational-report-missing':''} onClick={()=>onNavigate('vencimientos-emoa')}>
              <span className="operational-report-icon"><CalendarClock size={19}/></span>
              <span><small>VENCIMIENTOS</small><b>{urgentExpirations}</b><em>Vencidos o próximos 30 días</em></span>
              <ChevronRight size={16}/>
            </button>
            <button type="button" className={commercialPendingTotal?'operational-report-missing':''} onClick={()=>onNavigate('comercial-resumen')}>
              <span className="operational-report-icon"><ShoppingCart size={19}/></span>
              <span><small>COMERCIAL</small><b>{commercialPendingTotal}</b><em>{purchaseOrdersWithoutRefrendo.length} OC sin refrendo</em></span>
              <ChevronRight size={16}/>
            </button>
            <button type="button" className={operationsPendingTotal?'operational-report-missing':''} onClick={()=>onNavigate('ingresos-reposicion')}>
              <span className="operational-report-icon"><FileCheck2 size={19}/></span>
              <span><small>OPERACIONES</small><b>{operationsPendingTotal}</b><em>{pendingSapKmmp.length} KMMP · {pendingFioriIngresses.length} FIORI · {pendingDirectDelivery.length} entregas</em></span>
              <ChevronRight size={16}/>
            </button>
            <button type="button" className={openIncidents.length?'operational-report-missing':''} onClick={()=>onNavigate(incidentRoute)}>
              <span className="operational-report-icon"><AlertTriangle size={19}/></span>
              <span><small>INCIDENCIAS</small><b>{openIncidents.length}</b><em>Pendientes de tratamiento</em></span>
              <ChevronRight size={16}/>
            </button>
            <button type="button" className={communicationsPendingTotal?'operational-report-missing':''} onClick={()=>onNavigate('correos')}>
              <span className="operational-report-icon"><MailCheck size={19}/></span>
              <span><small>CORREOS / ALERTAS</small><b>{communicationsPendingTotal}</b><em>{incidentEmailsError} con error · {incidentEmailsPending} pendientes</em></span>
              <ChevronRight size={16}/>
            </button>
          </div>
        </section>
      )}

      <div className="universal-dashboard-charts">
        {hasTaskAccess&&<div className="dashboard-chart-link task-status-chart-link">
          <ProfessionalDonutChart
            title={isAdminDashboard?'Tareas globales por estado':'Mis trabajos por estado'}
            subtitle={isAdminDashboard?'Solo tareas operativas compartidas; se excluyen tareas personales/privadas':'Distribución de trabajo personal'}
            segments={taskStatusSegments}
            onSelect={(status)=>onNavigate(
              isAdminDashboard?'tareas-globales':'mi-trabajo',
              {taskStatus:status as 'PENDIENTE'|'EN_PROCESO'|'BLOQUEADO'|'CERRADO'|'VENCIDA'}
            )}
          />
          <button type="button" className="dashboard-chart-access dashboard-chart-access-button" onClick={()=>onNavigate(isAdminDashboard?'tareas-globales':'mi-trabajo',{taskStatus:'TODOS'})}>
            Ver Área de trabajo <ChevronRight size={14}/>
          </button>
        </div>}

        {hasExpirationAccess&&<div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate('vencimientos-cursos')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate('vencimientos-cursos')}}>
          <ProfessionalBarChart
            title="Vencimientos por categoría"
            subtitle="EMOA, cursos y licencias internas"
            data={expiryTypeData}
          />
          <span className="dashboard-chart-access">Ver Vencimientos <ChevronRight size={14}/></span>
        </div>}

        {hasExpirationAccess&&<div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate('vencimientos-emoa')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate('vencimientos-emoa')}}>
          <ProfessionalDonutChart
            title="Estado de vigencias"
            subtitle={isAdminDashboard?'Urgencia global de vigencias':'Nivel de urgencia de tus vencimientos'}
            segments={expiryUrgency}
          />
          <span className="dashboard-chart-access">Revisar vigencias <ChevronRight size={14}/></span>
        </div>}

        {hasTaskAccess&&<div className="dashboard-chart-link" role="button" tabIndex={0} onClick={()=>onNavigate(isAdminDashboard?'tareas-globales':'mi-trabajo',{taskStatus:'TODOS'})} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onNavigate(isAdminDashboard?'tareas-globales':'mi-trabajo',{taskStatus:'TODOS'})}}>
          <ProfessionalTrendChart
            title="Actividad de tareas"
            subtitle="Tareas creadas en los últimos 6 meses"
            points={activityTrend}
          />
          <span className="dashboard-chart-access">Ver tareas <ChevronRight size={14}/></span>
        </div>}
      </div>


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
  value:number|string
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
        <b>{typeof value==='number'?value.toLocaleString('es-PE'):value}</b>
        <em>{detail}</em>
      </span>
      <ChevronRight className="universal-kpi-arrow" size={16}/>
    </button>
  )
}
