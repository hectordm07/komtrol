import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
type ExpirationType = 'EMOA' | 'CURSO' | 'LICENCIA_INTERNA'

type Profile = {
  user_id: string
  full_name: string
  role: Role
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
}

type Expiration = {
  id: string
  user_id: string
  expiration_type: ExpirationType
  title: string
  issuer: string | null
  certificate_no: string | null
  issue_date: string | null
  due_date: string
  status: 'ACTIVO' | 'RENOVADO' | 'VENCIDO' | 'ANULADO'
  warehouse: string | null
  project: string | null
  notes: string | null
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

type Props = {
  type: ExpirationType
  userId: string
  profile: Profile | null
}

const labels: Record<ExpirationType,{title:string;subtitle:string;icon:typeof CalendarClock}> = {
  EMOA: {
    title: 'EMOA',
    subtitle: 'Control de vigencia y renovación de evaluaciones EMOA.',
    icon: ShieldCheck,
  },
  CURSO: {
    title: 'Cursos',
    subtitle: 'Cursos obligatorios, certificaciones y capacitaciones con vencimiento.',
    icon: GraduationCap,
  },
  LICENCIA_INTERNA: {
    title: 'Licencias Internas',
    subtitle: 'Licencias internas de operación y autorizaciones vigentes.',
    icon: BadgeCheck,
  },
}

function dateOnly(value?: string | null) {
  if (!value) return '—'
  const [year,month,day] = value.slice(0,10).split('-')
  return `${day}/${month}/${year}`
}

function daysRemaining(value:string) {
  const today = new Date()
  today.setHours(0,0,0,0)
  const due = new Date(`${value.slice(0,10)}T00:00:00`)
  return Math.ceil((due.getTime()-today.getTime())/86_400_000)
}

function statusFor(row:Expiration) {
  if (row.status === 'ANULADO') return {label:'ANULADO',kind:'danger'}
  if (row.status === 'RENOVADO') return {label:'RENOVADO',kind:'success'}
  const days=daysRemaining(row.due_date)
  if (days < 0) return {label:'VENCIDO',kind:'danger'}
  if (days <= 30) return {label:`VENCE EN ${days} DÍAS`,kind:'warning'}
  if (days <= 60) return {label:`${days} DÍAS`,kind:'warning'}
  return {label:'VIGENTE',kind:'success'}
}

export function ExpirationsModule({type,userId,profile}:Props) {
  const [rows,setRows]=useState<Expiration[]>([])
  const [profiles,setProfiles]=useState<Profile[]>([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const [showForm,setShowForm]=useState(false)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [form,setForm]=useState({
    user_id:userId,
    title:'',
    issuer:'',
    certificate_no:'',
    issue_date:'',
    due_date:'',
    notes:'',
  })

  const config=labels[type]
  const Icon=config.icon
  const canManage=profile?.role !== 'TRABAJADOR'

  async function reload() {
    setLoading(true)
    setMessage('')
    const [expirationRes,profileRes]=await Promise.all([
      supabase.from('compliance_expirations').select('*').eq('expiration_type',type).order('due_date',{ascending:true}).limit(2000),
      supabase.from('user_profiles').select('user_id,full_name,role,warehouse,project,group_name').eq('active',true).order('full_name'),
    ])
    if (expirationRes.error || profileRes.error) {
      setMessage(expirationRes.error?.message || profileRes.error?.message || 'No se pudo cargar vencimientos.')
    }
    setRows((expirationRes.data ?? []) as Expiration[])
    setProfiles((profileRes.data ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(()=>{reload()},[type,userId])

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase()
    if(!q) return rows
    return rows.filter((row)=>{
      const person=profiles.find((p)=>p.user_id===row.user_id)?.full_name
      return [person,row.title,row.issuer,row.certificate_no,row.warehouse,row.project,row.notes]
        .some((value)=>String(value ?? '').toLowerCase().includes(q))
    })
  },[rows,profiles,search])

  const counts=useMemo(()=>{
    const active=rows.filter((row)=>row.status!=='ANULADO'&&row.status!=='RENOVADO')
    const expired=active.filter((row)=>daysRemaining(row.due_date)<0).length
    const next30=active.filter((row)=>{const d=daysRemaining(row.due_date);return d>=0&&d<=30}).length
    const next60=active.filter((row)=>{const d=daysRemaining(row.due_date);return d>30&&d<=60}).length
    return {total:active.length,expired,next30,next60}
  },[rows])

  function openNew() {
    setForm({
      user_id: profile?.role==='TRABAJADOR' ? userId : userId,
      title:'',
      issuer:'',
      certificate_no:'',
      issue_date:'',
      due_date:'',
      notes:'',
    })
    setShowForm(true)
  }

  async function save(event:FormEvent) {
    event.preventDefault()
    if(!form.due_date || !form.title.trim()) return
    setSaving(true)
    const target=profiles.find((p)=>p.user_id===form.user_id)
    const {error}=await supabase.from('compliance_expirations').insert({
      user_id:form.user_id,
      expiration_type:type,
      title:form.title.trim(),
      issuer:form.issuer.trim()||null,
      certificate_no:form.certificate_no.trim()||null,
      issue_date:form.issue_date||null,
      due_date:form.due_date,
      status:'ACTIVO',
      warehouse:target?.warehouse || profile?.warehouse || null,
      project:target?.project || profile?.project || null,
      notes:form.notes.trim()||null,
      created_by:userId,
      updated_by:userId,
    })
    setSaving(false)
    if(error){
      setMessage(error.message)
      return
    }
    setShowForm(false)
    setMessage('Vencimiento registrado correctamente.')
    await reload()
  }

  const personName=(id:string)=>profiles.find((p)=>p.user_id===id)?.full_name || 'Usuario'

  return (
    <div className="expiration-module">
      <section className="panel expiration-hero">
        <div className="panel-title">
          <div className="expiration-title-wrap">
            <span className="expiration-icon"><Icon size={20}/></span>
            <div><h3>{config.title}</h3><p>{config.subtitle}</p></div>
          </div>
          <div className="button-row">
            <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={17}/></button>
            <button className="primary-button" onClick={openNew}><Plus size={16}/> Registrar</button>
          </div>
        </div>

        <div className="expiration-kpis">
          <div><span>Total activos</span><b>{counts.total}</b></div>
          <div className={counts.expired?'danger':''}><span>Vencidos</span><b>{counts.expired}</b></div>
          <div className={counts.next30?'warning':''}><span>Próximos 30 días</span><b>{counts.next30}</b></div>
          <div><span>31 a 60 días</span><b>{counts.next60}</b></div>
        </div>
      </section>

      <section className="panel">
        <div className="task-toolbar">
          <div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar persona, curso, licencia, certificado…"/></div>
        </div>
        {message&&<div className="inline-message">{message}</div>}
        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={20}/><p>Cargando vencimientos…</p></div>
        ) : (
          <>
            <div className="table-wrap expiration-desktop-table">
              <table>
                <thead><tr><th>Persona</th><th>Detalle</th><th>Emisor</th><th>Certificado</th><th>Emisión</th><th>Vencimiento</th><th>Días</th><th>Estado</th></tr></thead>
                <tbody>
                  {visible.map((row)=>{
                    const status=statusFor(row)
                    const days=daysRemaining(row.due_date)
                    return <tr key={row.id}>
                      <td><b>{personName(row.user_id)}</b></td>
                      <td>{row.title}</td>
                      <td>{row.issuer||'—'}</td>
                      <td>{row.certificate_no||'—'}</td>
                      <td>{dateOnly(row.issue_date)}</td>
                      <td><b>{dateOnly(row.due_date)}</b></td>
                      <td>{days<0?`${Math.abs(days)} días vencido`:`${days} días`}</td>
                      <td><span className={`status-pill ${status.kind==='danger'?'danger':status.kind==='warning'?'warning':''}`}>{status.label}</span></td>
                    </tr>
                  })}
                </tbody>
              </table>
              {!visible.length&&<div className="empty-work"><CheckCircle2 size={28}/><b>Sin registros</b><p>No hay vencimientos registrados en esta categoría.</p></div>}
            </div>

            <div className="expiration-mobile-list">
              {visible.map((row)=>{
                const status=statusFor(row)
                const days=daysRemaining(row.due_date)
                return <article key={row.id}>
                  <div className="expiration-mobile-head">
                    <div><small>{config.title.toUpperCase()}</small><b>{row.title}</b></div>
                    <span className={`status-pill ${status.kind==='danger'?'danger':status.kind==='warning'?'warning':''}`}>{status.label}</span>
                  </div>
                  <p>{personName(row.user_id)}</p>
                  <div className="expiration-mobile-data">
                    <div><span>Vencimiento</span><b>{dateOnly(row.due_date)}</b></div>
                    <div><span>Días restantes</span><b>{days<0?`-${Math.abs(days)}`:days}</b></div>
                    <div><span>Emisor</span><b>{row.issuer||'—'}</b></div>
                    <div><span>Certificado</span><b>{row.certificate_no||'—'}</b></div>
                  </div>
                </article>
              })}
              {!visible.length&&<div className="empty-work"><CheckCircle2 size={28}/><b>Sin registros</b><p>No hay vencimientos registrados en esta categoría.</p></div>}
            </div>
          </>
        )}
      </section>

      {showForm&&(
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setShowForm(false)}>
          <form className="modal expiration-modal" onSubmit={save}>
            <div className="modal-head"><div><h2>Registrar {config.title}</h2><p>El sistema calculará automáticamente los días restantes y el estado.</p></div><button type="button" className="icon-button" onClick={()=>setShowForm(false)}><X size={19}/></button></div>
            <div className="form-grid">
              <label className="span-2">Persona
                <select value={form.user_id} onChange={(e)=>setForm({...form,user_id:e.target.value})} disabled={!canManage}>
                  {profiles.filter((p)=>profile?.role==='ADMINISTRADOR'||profile?.role==='SUPERVISOR'||p.warehouse===profile?.warehouse||p.user_id===userId).map((p)=><option value={p.user_id} key={p.user_id}>{p.full_name}{p.warehouse?` · ${p.warehouse}`:''}</option>)}
                </select>
              </label>
              <label className="span-2">Nombre / detalle<input required value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder={type==='CURSO'?'Ej. Trabajo en altura':type==='LICENCIA_INTERNA'?'Ej. Montacargas - Franja amarilla':'Ej. EMOA anual'}/></label>
              <label>Emisor / institución<input value={form.issuer} onChange={(e)=>setForm({...form,issuer:e.target.value})}/></label>
              <label>N° certificado / licencia<input value={form.certificate_no} onChange={(e)=>setForm({...form,certificate_no:e.target.value})}/></label>
              <label>Fecha de emisión<input type="date" value={form.issue_date} onChange={(e)=>setForm({...form,issue_date:e.target.value})}/></label>
              <label>Fecha de vencimiento<input type="date" required value={form.due_date} onChange={(e)=>setForm({...form,due_date:e.target.value})}/></label>
              <label className="span-2">Observación<textarea rows={3} value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setShowForm(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?'Guardando…':'Registrar'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
