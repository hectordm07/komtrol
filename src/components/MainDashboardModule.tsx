import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  PackageCheck,
  RefreshCw,
  Truck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ProfessionalBarChart, ProfessionalDonutChart, ProfessionalTrendChart } from './DashboardVisuals'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
type Profile = {
  user_id:string
  full_name:string
  role:Role
  warehouse?:string|null
  project?:string|null
  group_name?:string|null
  shift_name?:string|null
}

type RemoteGroup = 'TODOS' | 'PROYECTO_MINERO' | 'SUCURSAL' | 'TIENDA'

type WarehouseMeta = {
  name: string
  warehouse_scope: 'REMOTO' | 'CENTRAL'
  remote_group: Exclude<RemoteGroup,'TODOS'> | null
}

type Props = { profile:Profile|null; role:Role; scope?: 'REMOTE' | 'ALL'; onNavigate?:(tab:string)=>void }

type Task = {
  id:string
  warehouse:string|null
  status:string
  progress:number
  responsible_id:string|null
  created_by:string
  title:string
  due_at:string|null
  updated_at:string
}

type Incident = {
  id:string
  warehouse:string|null
  incident_no:string
  incident_type:string
  status:string
  created_at:string
}

type Guide = {
  id:string
  warehouse:string|null
  guide_type:string
  status:string
  created_at:string
}

type Box = {
  id:string
  warehouse:string
  status:string
  created_at:string
}

function fmt(value?:string|null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))
}

export function MainDashboardModule({ profile, role, scope = 'ALL', onNavigate }:Props) {
  const [tasks,setTasks]=useState<Task[]>([])
  const [incidents,setIncidents]=useState<Incident[]>([])
  const [guides,setGuides]=useState<Guide[]>([])
  const [boxes,setBoxes]=useState<Box[]>([])
  const [warehouseCatalog,setWarehouseCatalog]=useState<WarehouseMeta[]>([])
  const [remoteGroup,setRemoteGroup]=useState<RemoteGroup>('TODOS')
  const canViewAll = role === 'SUPERVISOR' || role === 'ADMINISTRADOR'
  const initialWarehouse =
    canViewAll
      ? (scope === 'REMOTE' ? 'TODOS_REMOTOS' : 'TODOS')
      : (scope === 'REMOTE'
          ? (profile?.warehouse && profile.warehouse !== 'CALLAO' ? profile.warehouse : 'TODOS_REMOTOS')
          : (profile?.warehouse || 'TODOS'))
  const [warehouse,setWarehouse]=useState(initialWarehouse)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  async function reload() {
    setLoading(true)
    const [t,i,g,b,w]=await Promise.all([
      supabase.from('tasks').select('id,warehouse,status,progress,responsible_id,created_by,title,due_at,updated_at').order('updated_at',{ascending:false}).limit(1000),
      supabase.from('incidents').select('id,warehouse,incident_no,incident_type,status,created_at').order('created_at',{ascending:false}).limit(1000),
      supabase.from('guides').select('id,warehouse,guide_type,status,created_at').order('created_at',{ascending:false}).limit(1000),
      supabase.from('inbound_boxes').select('id,warehouse,status,created_at').order('created_at',{ascending:false}).limit(500),
      supabase.from('warehouses').select('name,warehouse_scope,remote_group').eq('active',true).order('name'),
    ])
    const error=t.error||i.error||g.error||b.error||w.error
    if (error) setMessage(error.message)
    setTasks((t.data??[]) as Task[])
    setIncidents((i.data??[]) as Incident[])
    setGuides((g.data??[]) as Guide[])
    setBoxes((b.data??[]) as Box[])
    setWarehouseCatalog((w.data??[]) as WarehouseMeta[])
    setLoading(false)
  }

  useEffect(()=>{ reload() },[])

  useEffect(()=>{
    if (!canViewAll) {
      setWarehouse(
        scope === 'REMOTE'
          ? (profile?.warehouse && profile.warehouse !== 'CALLAO' ? profile.warehouse : 'TODOS_REMOTOS')
          : (profile?.warehouse || 'TODOS')
      )
    }
  },[profile?.warehouse,role,scope,canViewAll])

  useEffect(()=>{
    if(scope!=='REMOTE' || !canViewAll || warehouse==='TODOS_REMOTOS') return
    const meta=warehouseCatalog.find((item)=>item.name===warehouse)
    if(remoteGroup!=='TODOS' && meta?.remote_group!==remoteGroup){
      setWarehouse('TODOS_REMOTOS')
    }
  },[scope,canViewAll,remoteGroup,warehouse,warehouseCatalog])

  const scoped=useMemo(()=>{
    const keep=(value:string|null|undefined)=>{
      if (scope === 'REMOTE') {
        if (!value || value.toUpperCase() === 'CALLAO') return false
        const meta=warehouseCatalog.find((item)=>item.name===value)
        if (meta?.warehouse_scope === 'CENTRAL') return false
        if (remoteGroup !== 'TODOS' && meta?.remote_group !== remoteGroup) return false
        return warehouse === 'TODOS_REMOTOS' || value === warehouse
      }
      return warehouse === 'TODOS' || value === warehouse
    }
    return {
      tasks:tasks.filter((x)=>keep(x.warehouse)),
      incidents:incidents.filter((x)=>keep(x.warehouse)),
      guides:guides.filter((x)=>keep(x.warehouse)),
      boxes:boxes.filter((x)=>keep(x.warehouse)),
    }
  },[tasks,incidents,guides,boxes,warehouse,scope,remoteGroup,warehouseCatalog])

  const stats=useMemo(()=>{
    const taskPending=scoped.tasks.filter((x)=>x.status!=='CERRADO').length
    const taskClosed=scoped.tasks.filter((x)=>x.status==='CERRADO').length
    const incidentOpen=scoped.incidents.filter((x)=>x.status!=='CERRADO').length
    const incidentNotified=scoped.incidents.filter((x)=>x.status==='NOTIFICADO').length
    const guideCount=scoped.guides.length
    const boxOpen=scoped.boxes.filter((x)=>x.status==='ABIERTA').length
    const progress=scoped.tasks.length?Math.round(scoped.tasks.reduce((s,x)=>s+Number(x.progress||0),0)/scoped.tasks.length):0
    return {taskPending,taskClosed,incidentOpen,incidentNotified,guideCount,boxOpen,progress}
  },[scoped])

  const canSeeCallaoInbound = role === 'ADMINISTRADOR' || profile?.warehouse?.toUpperCase() === 'CALLAO'

  const callaoStats=useMemo(()=>{
    const callaoIncidents=incidents.filter((x)=>x.warehouse?.toUpperCase()==='CALLAO')
    const callaoBoxes=boxes.filter((x)=>x.warehouse?.toUpperCase()==='CALLAO')
    const callaoGuides=guides.filter((x)=>x.warehouse?.toUpperCase()==='CALLAO')
    return {
      incidents: callaoIncidents.length,
      pending: callaoIncidents.filter((x)=>x.status!=='CERRADO').length,
      notified: callaoIncidents.filter((x)=>x.status==='NOTIFICADO').length,
      openBoxes: callaoBoxes.filter((x)=>x.status==='ABIERTA').length,
      closedBoxes: callaoBoxes.filter((x)=>x.status==='CERRADA').length,
      guides: callaoGuides.length,
    }
  },[incidents,boxes,guides])

  const activity=useMemo(()=>{
    const rows=[
      ...scoped.tasks.slice(0,10).map((x)=>({kind:'TAREA',title:x.title,status:x.status,date:x.updated_at})),
      ...scoped.incidents.slice(0,10).map((x)=>({kind:'INCIDENCIA',title:`${x.incident_no} · ${x.incident_type}`,status:x.status,date:x.created_at})),
      ...scoped.guides.slice(0,10).map((x)=>({kind:'GUÍA',title:x.guide_type.replaceAll('_',' '),status:x.status,date:x.created_at})),
    ]
    return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,12)
  },[scoped])

  const warehouseActivity=useMemo(()=>{
    const names=Array.from(new Set([
      ...warehouseCatalog.map((item)=>item.name),
      ...tasks.map((x)=>x.warehouse).filter(Boolean) as string[],
      ...incidents.map((x)=>x.warehouse).filter(Boolean) as string[],
      ...guides.map((x)=>x.warehouse).filter(Boolean) as string[],
      ...boxes.map((x)=>x.warehouse).filter(Boolean) as string[],
    ])).filter((name)=>{
      if(scope!=='REMOTE') return true
      if(name.toUpperCase()==='CALLAO') return false
      const meta=warehouseCatalog.find((item)=>item.name===name)
      if(meta?.warehouse_scope==='CENTRAL') return false
      return remoteGroup==='TODOS' || meta?.remote_group===remoteGroup
    }).sort()

    return names.map((name)=>{
      const taskCount=tasks.filter((x)=>x.warehouse===name).length
      const incidentCount=incidents.filter((x)=>x.warehouse===name).length
      const guideCount=guides.filter((x)=>x.warehouse===name).length
      const boxCount=boxes.filter((x)=>x.warehouse===name).length
      return {
        key:name,
        label:name,
        value:taskCount+incidentCount+guideCount+boxCount,
        detail:`Tareas: ${taskCount} · Incidencias: ${incidentCount} · Guías: ${guideCount} · Cajas: ${boxCount}`,
      }
    }).sort((a,b)=>b.value-a.value)
  },[warehouseCatalog,tasks,incidents,guides,boxes,scope,remoteGroup])

  const statusSegments=useMemo(()=>[
    {label:'Tareas pendientes',value:stats.taskPending},
    {label:'Tareas cerradas',value:stats.taskClosed},
    {label:'Incidencias abiertas',value:stats.incidentOpen},
    {label:'Incidencias notificadas',value:stats.incidentNotified},
  ],[stats])

  const trendPoints=useMemo(()=>{
    const days=Array.from({length:7},(_,index)=>{
      const d=new Date()
      d.setHours(0,0,0,0)
      d.setDate(d.getDate()-(6-index))
      return {key:d.toISOString().slice(0,10),label:new Intl.DateTimeFormat('es-PE',{weekday:'short'}).format(d).replace('.',''),value:0}
    })
    const byKey=new Map(days.map((row)=>[row.key,row]))
    const add=(value:string)=>{
      const key=new Date(value).toISOString().slice(0,10)
      const row=byKey.get(key)
      if(row) row.value+=1
    }
    scoped.tasks.forEach((x)=>add(x.updated_at))
    scoped.incidents.forEach((x)=>add(x.created_at))
    scoped.guides.forEach((x)=>add(x.created_at))
    return days.map(({label,value})=>({label,value}))
  },[scoped])

  if (loading) return <section className="panel"><div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando dashboard principal…</p></div></section>

  return <div className="main-dashboard">
    <section className="panel dashboard-control-strip dashboard-compact-toolbar">
      <div className="dashboard-context-strip">
        <span className="dashboard-control-kicker">{scope === 'REMOTE' ? 'ALMACENES REMOTOS' : 'VISIÓN NACIONAL'}</span>
        <b>{warehouse === 'TODOS' || warehouse === 'TODOS_REMOTOS' ? 'Consolidado' : warehouse}</b>
      </div>
      <div className="main-dashboard-filter">
        {scope === 'REMOTE' && canViewAll && (
          <label>Grupo
            <select value={remoteGroup} onChange={(e)=>setRemoteGroup(e.target.value as RemoteGroup)}>
              <option value="TODOS">Todos los remotos</option>
              <option value="PROYECTO_MINERO">Proyectos Mineros</option>
              <option value="SUCURSAL">Sucursales</option>
              <option value="TIENDA">Tiendas</option>
            </select>
          </label>
        )}
        {canViewAll && <label>Almacén
          <select value={warehouse} onChange={(e)=>setWarehouse(e.target.value)}>
            {scope === 'REMOTE'
              ? <option value="TODOS_REMOTOS">Todos los almacenes remotos</option>
              : <option value="TODOS">Todos los almacenes</option>}
            {warehouseCatalog
              .filter((item)=>{
                if(scope!=='REMOTE') return true
                if(item.warehouse_scope==='CENTRAL' || item.name.toUpperCase()==='CALLAO') return false
                return remoteGroup==='TODOS' || item.remote_group===remoteGroup
              })
              .map((item)=><option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>}
        <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={18}/></button>
      </div>
    </section>

    {scope === 'REMOTE' && canViewAll && (
      <div className="remote-group-summary">
        {[
          ['PROYECTO_MINERO','Proyectos Mineros'],
          ['SUCURSAL','Sucursales'],
          ['TIENDA','Tiendas'],
        ].map(([key,label])=>{
          const count=warehouseCatalog.filter((item)=>item.warehouse_scope==='REMOTO'&&item.remote_group===key).length
          return <button
            key={key}
            className={remoteGroup===key?'active':''}
            onClick={()=>setRemoteGroup((current)=>current===key?'TODOS':key as RemoteGroup)}
          >
            <span>{label}</span><b>{count}</b>
          </button>
        })}
      </div>
    )}

    {message && <div className="inline-message">{message}</div>}

    <div className="main-dashboard-kpis">
      <DashCard icon={<ClipboardList/>} label="Tareas pendientes" value={stats.taskPending} onClick={onNavigate ? ()=>onNavigate('mi-trabajo') : undefined}/>
      <DashCard icon={<CheckCircle2/>} label="Tareas cerradas" value={stats.taskClosed} onClick={onNavigate ? ()=>onNavigate('mi-trabajo') : undefined}/>
      <DashCard icon={<BarChart3/>} label="Avance promedio" value={`${stats.progress}%`} onClick={onNavigate ? ()=>onNavigate('dashboard-operacion') : undefined}/>
      <DashCard icon={<AlertTriangle/>} label="Incidencias abiertas" value={stats.incidentOpen} onClick={onNavigate ? ()=>onNavigate('incidencias') : undefined}/>
      <DashCard icon={<PackageCheck/>} label="Incidencias notificadas" value={stats.incidentNotified} onClick={onNavigate ? ()=>onNavigate('incidencias') : undefined}/>
      <DashCard icon={<Truck/>} label="Guías registradas" value={stats.guideCount} onClick={onNavigate ? ()=>onNavigate('seguimiento-guias') : undefined}/>
      <DashCard icon={<Boxes/>} label="Cajas abiertas" value={stats.boxOpen} onClick={onNavigate ? ()=>onNavigate(role==='ADMINISTRADOR' || profile?.warehouse==='CALLAO' ? 'inbound-cajas' : 'kardex-sobrantes') : undefined}/>
    </div>

    {canSeeCallaoInbound && onNavigate && (
      <section className="panel dashboard-inbound-integrated">
        <div className="dashboard-inbound-head">
          <div>
            <span>INBOUND · CALLAO</span>
            <b>Resumen operativo</b>
          </div>
          <small>Integrado al Dashboard General</small>
        </div>
        <div className="dashboard-inbound-kpis">
          <button type="button" onClick={()=>onNavigate('inbound-incidencias')}>
            <AlertTriangle size={17}/>
            <span><small>INCIDENCIAS</small><b>{callaoStats.incidents}</b></span>
            <ChevronRight size={15}/>
          </button>
          <button type="button" onClick={()=>onNavigate('inbound-incidencias')}>
            <ClipboardList size={17}/>
            <span><small>PENDIENTES</small><b>{callaoStats.pending}</b></span>
            <ChevronRight size={15}/>
          </button>
          <button type="button" onClick={()=>onNavigate('inbound-cajas')}>
            <Boxes size={17}/>
            <span><small>CAJAS ABIERTAS</small><b>{callaoStats.openBoxes}</b></span>
            <ChevronRight size={15}/>
          </button>
          <button type="button" onClick={()=>onNavigate('inbound-kardex')}>
            <PackageCheck size={17}/>
            <span><small>KARDEX / CERRADAS</small><b>{callaoStats.closedBoxes}</b></span>
            <ChevronRight size={15}/>
          </button>
          <button type="button" onClick={()=>onNavigate('seguimiento-guias')}>
            <Truck size={17}/>
            <span><small>GUÍAS</small><b>{callaoStats.guides}</b></span>
            <ChevronRight size={15}/>
          </button>
        </div>
      </section>
    )}

    {onNavigate && (
      <section className="panel dashboard-report-panel">
        <div className="panel-title">
          <div>
            <h3>Reportes</h3>
            <p>Selecciona un reporte para abrir su detalle.</p>
          </div>
        </div>
        <div className="dashboard-report-links">
          {[
            ...(canSeeCallaoInbound ? [
              ['inbound-incidencias','Inbound · Incidencias'],
              ['inbound-cajas','Inbound · Cajas'],
              ['inbound-kardex','Inbound · Kardex'],
            ] : []),
            ['dashboard-operacion','Operación'],
            ['inbound-outbound','Inbound / Outbound'],
            ['eri','ERI'],
            ['sobrantes-faltantes','Sobrantes / Faltantes'],
            ['diferencias-inventario','Diferencias inventario'],
            ['dashboard-transitos','Tránsitos'],
            ['uca','UCA'],
            ['ahorros','Ahorros'],
            ['perfect-ship','Perfect Ship'],
            ['consignaciones','Consignaciones'],
            ['vhs','VHS'],
            ['safe','SAFE'],
          ].map(([id,label])=>(
            <button key={id} type="button" onClick={()=>onNavigate(id)}>
              <span><BarChart3 size={17}/><b>{label}</b></span>
              <ChevronRight size={17}/>
            </button>
          ))}
        </div>
      </section>
    )}

    <div className="professional-dashboard-grid">
      <ProfessionalBarChart
        title="Actividad por almacén"
        subtitle={scope === 'REMOTE' ? 'Solo almacenes remotos · haz clic para filtrar' : 'Todos los almacenes visibles · haz clic para filtrar y vuelve a pulsar para regresar al consolidado'}
        data={warehouseActivity}
        selected={warehouse}
        onSelect={canViewAll ? (key)=>setWarehouse((current)=>current===key ? (scope === 'REMOTE' ? 'TODOS_REMOTOS' : 'TODOS') : key) : undefined}
      />
      <ProfessionalDonutChart
        title="Estado operacional"
        subtitle="Distribución de tareas e incidencias"
        segments={statusSegments}
      />
      <ProfessionalTrendChart
        title="Tendencia operativa"
        subtitle="Actividad registrada durante los últimos 7 días"
        points={trendPoints}
      />
    </div>

    <section className="panel">
      <div className="panel-title"><div><h3>Actividad reciente</h3><p>{scope === 'REMOTE' ? 'Últimos movimientos de los almacenes remotos visibles para tu perfil.' : 'Últimos movimientos visibles para el almacén seleccionado.'}</p></div></div>
      <div className="main-activity-list">
        {activity.map((row,index)=><article key={index}><span>{row.kind}</span><div><b>{row.title}</b><small>{row.status}</small></div><time>{fmt(row.date)}</time></article>)}
        {!activity.length && <div className="empty-work"><BarChart3 size={27}/><b>Sin actividad registrada</b></div>}
      </div>
    </section>
  </div>
}

function DashCard({icon,label,value,onClick}:{icon:React.ReactNode;label:string;value:string|number;onClick?:()=>void}) {
  if (onClick) {
    return (
      <button type="button" className="main-dashboard-card main-dashboard-card-link" onClick={onClick}>
        <div>{icon}</div>
        <span>{label}</span>
        <b>{value}</b>
        <ChevronRight className="dashboard-card-arrow" size={16}/>
      </button>
    )
  }
  return <div className="main-dashboard-card"><div>{icon}</div><span>{label}</span><b>{value}</b></div>
}
