import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
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

type Props = { profile:Profile|null; role:Role; scope?: 'REMOTE' | 'ALL' }

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

export function MainDashboardModule({ profile, role, scope = 'ALL' }:Props) {
  const [tasks,setTasks]=useState<Task[]>([])
  const [incidents,setIncidents]=useState<Incident[]>([])
  const [guides,setGuides]=useState<Guide[]>([])
  const [boxes,setBoxes]=useState<Box[]>([])
  const [warehouses,setWarehouses]=useState<string[]>([])
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
      supabase.from('warehouses').select('name').eq('active',true).order('name'),
    ])
    const error=t.error||i.error||g.error||b.error||w.error
    if (error) setMessage(error.message)
    setTasks((t.data??[]) as Task[])
    setIncidents((i.data??[]) as Incident[])
    setGuides((g.data??[]) as Guide[])
    setBoxes((b.data??[]) as Box[])
    setWarehouses((w.data??[]).map((x:any)=>String(x.name)))
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

  const scoped=useMemo(()=>{
    const keep=(value:string|null|undefined)=>{
      if (scope === 'REMOTE') {
        if (!value || value === 'CALLAO') return false
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
  },[tasks,incidents,guides,boxes,warehouse,scope])

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
      ...warehouses,
      ...tasks.map((x)=>x.warehouse).filter(Boolean) as string[],
      ...incidents.map((x)=>x.warehouse).filter(Boolean) as string[],
      ...guides.map((x)=>x.warehouse).filter(Boolean) as string[],
      ...boxes.map((x)=>x.warehouse).filter(Boolean) as string[],
    ])).filter((name)=>scope!=='REMOTE' || name!=='CALLAO').sort()

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
  },[warehouses,tasks,incidents,guides,boxes,scope])

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
    <section className="panel dashboard-control-strip">
      <div>
        <span className="dashboard-control-kicker">VISIÓN NACIONAL</span>
        <h2>{scope === 'REMOTE' ? 'Dashboard de Almacenes' : 'Dashboard General de Almacenes'}</h2>
        <p>{warehouse === 'TODOS' || warehouse === 'TODOS_REMOTOS' ? 'Consolidado de todos los almacenes disponibles para tu perfil.' : `Vista filtrada: ${warehouse}`}</p>
      </div>
      <div className="main-dashboard-filter">
        {canViewAll && <label>Almacén
          <select value={warehouse} onChange={(e)=>setWarehouse(e.target.value)}>
            {scope === 'REMOTE'
              ? <option value="TODOS_REMOTOS">Todos los almacenes</option>
              : <option value="TODOS">Todos los almacenes</option>}
            {warehouses
              .filter((name)=>scope !== 'REMOTE' || name !== 'CALLAO')
              .map((name)=><option key={name} value={name}>{name}</option>)}
          </select>
        </label>}
        <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={18}/></button>
      </div>
    </section>

    {message && <div className="inline-message">{message}</div>}

    <div className="main-dashboard-kpis">
      <DashCard icon={<ClipboardList/>} label="Tareas pendientes" value={stats.taskPending}/>
      <DashCard icon={<CheckCircle2/>} label="Tareas cerradas" value={stats.taskClosed}/>
      <DashCard icon={<BarChart3/>} label="Avance promedio" value={`${stats.progress}%`}/>
      <DashCard icon={<AlertTriangle/>} label="Incidencias abiertas" value={stats.incidentOpen}/>
      <DashCard icon={<PackageCheck/>} label="Incidencias notificadas" value={stats.incidentNotified}/>
      <DashCard icon={<Truck/>} label="Guías registradas" value={stats.guideCount}/>
      <DashCard icon={<Boxes/>} label="Cajas abiertas" value={stats.boxOpen}/>
    </div>

    <div className="professional-dashboard-grid">
      <ProfessionalBarChart
        title="Actividad por almacén"
        subtitle="Tareas + incidencias + guías + cajas registradas"
        data={warehouseActivity}
        selected={warehouse}
        onSelect={canViewAll ? (key)=>setWarehouse(key) : undefined}
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

function DashCard({icon,label,value}:{icon:React.ReactNode;label:string;value:string|number}) {
  return <div className="main-dashboard-card"><div>{icon}</div><span>{label}</span><b>{value}</b></div>
}
