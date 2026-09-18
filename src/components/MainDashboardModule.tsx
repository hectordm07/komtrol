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

type Props = { profile:Profile|null; role:Role }

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

export function MainDashboardModule({ profile, role }:Props) {
  const [tasks,setTasks]=useState<Task[]>([])
  const [incidents,setIncidents]=useState<Incident[]>([])
  const [guides,setGuides]=useState<Guide[]>([])
  const [boxes,setBoxes]=useState<Box[]>([])
  const [warehouses,setWarehouses]=useState<string[]>([])
  const [warehouse,setWarehouse]=useState(profile?.warehouse || 'TODOS')
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
    if (role !== 'ADMINISTRADOR') setWarehouse(profile?.warehouse || 'TODOS')
  },[profile?.warehouse,role])

  const scoped=useMemo(()=>{
    const keep=(value:string|null|undefined)=>warehouse==='TODOS'||value===warehouse
    return {
      tasks:tasks.filter((x)=>keep(x.warehouse)),
      incidents:incidents.filter((x)=>keep(x.warehouse)),
      guides:guides.filter((x)=>keep(x.warehouse)),
      boxes:boxes.filter((x)=>keep(x.warehouse)),
    }
  },[tasks,incidents,guides,boxes,warehouse])

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

  if (loading) return <section className="panel"><div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando dashboard principal…</p></div></section>

  return <div className="main-dashboard">
    <section className="panel main-dashboard-hero">
      <div>
        <span className="status-pill"><CheckCircle2 size={14}/> Operación conectada</span>
        <h2>Resumen del almacén</h2>
        <p>
          {profile?.warehouse || 'Sin almacén'} · {profile?.group_name || 'Sin grupo'} · {profile?.shift_name || 'Sin guardia'}
        </p>
      </div>
      <div className="main-dashboard-filter">
        {role === 'ADMINISTRADOR' && <label>Almacén
          <select value={warehouse} onChange={(e)=>setWarehouse(e.target.value)}>
            <option value="TODOS">Todos</option>
            {warehouses.map((name)=><option key={name} value={name}>{name}</option>)}
          </select>
        </label>}
        <button className="icon-button" onClick={reload}><RefreshCw size={18}/></button>
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

    <section className="panel">
      <div className="panel-title"><div><h3>Actividad reciente</h3><p>Últimos movimientos visibles para el almacén seleccionado.</p></div></div>
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
