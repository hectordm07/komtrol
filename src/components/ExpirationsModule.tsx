import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportRowsToExcel, exportRowsToPdfPortrait } from '../lib/exportUtils'
import { SearchableSelect, type SearchableOption } from './SearchableSelect'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
type ExpirationType = 'EMOA' | 'CURSO' | 'LICENCIA_INTERNA'

type Profile = {
  user_id: string
  dni?: string | null
  full_name: string
  role: Role
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
  shift_name?: string | null
  corporate_email?: string | null
  worker_access?: boolean
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
  group_name: string | null
  shift_name: string | null
  notes: string | null
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
  source?: 'MANUAL' | 'OUTLOOK' | 'IMPORT'
  source_reference?: string | null
  source_received_at?: string | null
  source_confidence?: number | null
}

type CourseEmailIntake = {
  id: string
  subject: string
  sender_name: string | null
  sender_address: string | null
  received_at: string
  body_preview: string | null
  detection_status: 'PENDING' | 'NOT_COURSE' | 'NEEDS_REVIEW' | 'COURSE_DETECTED' | 'IMPORTED' | 'ERROR'
  confidence: number
  detected_course_title: string | null
  detected_participant_name: string | null
  detected_participant_email: string | null
  detected_issuer: string | null
  detected_certificate_no: string | null
  detected_issue_date: string | null
  detected_due_date: string | null
  matched_user_id: string | null
  matched_by: string | null
  parse_notes: string | null
  attachment_names: string[]
  expiration_id: string | null
}

type OutlookCourseStatus = {
  configured: boolean
  enabled: boolean
  mailbox: string | null
  folder: string | null
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncMessage: string | null
  autoImport: boolean
  autoImportMinConfidence: number
}

type Props = {
  type: ExpirationType
  userId: string
  profile: Profile | null
  previewMode?: boolean
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
  if (row.status === 'ANULADO') return {label:'ANULADO',kind:'inactive'}
  if (row.status === 'RENOVADO') return {label:'RENOVADO',kind:'valid'}
  const days=daysRemaining(row.due_date)
  if (row.status === 'VENCIDO' || days < 0) return {label:'VENCIDO',kind:'expired'}
  if (days <= 15) return {label:'CRÍTICO',kind:'critical'}
  if (days <= 30) return {label:'POR VENCER',kind:'warning'}
  return {label:'VIGENTE',kind:'valid'}
}

function profileOption(profile:Profile):SearchableOption {
  const context=[profile.warehouse,profile.project,profile.shift_name].filter(Boolean).join(' · ')
  return {
    value:profile.user_id,
    label:`${profile.full_name}${context?` · ${context}`:''}`,
    keywords:[profile.dni,profile.corporate_email,profile.warehouse,profile.project,profile.group_name,profile.shift_name].filter(Boolean).join(' '),
  }
}

export function ExpirationsModule({type,userId,profile,previewMode=false}:Props) {
  const [rows,setRows]=useState<Expiration[]>([])
  const [profiles,setProfiles]=useState<Profile[]>([])
  const [loading,setLoading]=useState(true)
  const [search,setSearch]=useState('')
  const [scopeMode,setScopeMode]=useState<'PERSONAL'|'TEAM'|'NATIONAL'>(
    previewMode ? 'TEAM' : profile?.role==='ADMINISTRADOR'
      ? 'NATIONAL'
      : profile?.role==='COORDINADOR'||profile?.role==='SUPERVISOR'
        ? 'TEAM'
        : 'PERSONAL'
  )
  const [projectFilter,setProjectFilter]=useState('TODOS')
  const [shiftFilter,setShiftFilter]=useState('TODAS')
  const [personFilter,setPersonFilter]=useState('TODOS')
  const [showForm,setShowForm]=useState(false)
  const [editingRow,setEditingRow]=useState<Expiration|null>(null)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [courseInbox,setCourseInbox]=useState<CourseEmailIntake[]>([])
  const [outlookStatus,setOutlookStatus]=useState<OutlookCourseStatus|null>(null)
  const [syncingOutlook,setSyncingOutlook]=useState(false)
  const [reviewRow,setReviewRow]=useState<CourseEmailIntake|null>(null)
  const [reviewSaving,setReviewSaving]=useState(false)
  const [reviewForm,setReviewForm]=useState({
    user_id:'',
    title:'',
    issuer:'',
    certificate_no:'',
    issue_date:'',
    due_date:'',
  })
  const [form,setForm]=useState({
    user_id:userId,
    title:'',
    issuer:'',
    certificate_no:'',
    issue_date:'',
    due_date:'',
    notes:'',
    status:'ACTIVO' as Expiration['status'],
  })

  const config=labels[type]
  const Icon=config.icon
  const isAdmin=profile?.role==='ADMINISTRADOR'
  const isCoordinator=profile?.role==='COORDINADOR'||profile?.role==='SUPERVISOR'
  const canUseWorkerView=!previewMode&&(!isAdmin||Boolean(profile?.worker_access))
  const canRegisterOthers=isAdmin&&scopeMode==='NATIONAL'

  async function reload() {
    setLoading(true)
    setMessage('')
    const [expirationRes,profileRes]=await Promise.all([
      supabase.from('compliance_expirations').select('*').eq('expiration_type',type).order('due_date',{ascending:true}).limit(2000),
      supabase.from('user_profiles').select('user_id,dni,full_name,role,warehouse,project,group_name,shift_name,corporate_email,worker_access').eq('active',true).order('full_name'),
    ])
    if (expirationRes.error || profileRes.error) {
      setMessage(expirationRes.error?.message || profileRes.error?.message || 'No se pudo cargar vencimientos.')
    }
    setRows((expirationRes.data ?? []) as Expiration[])
    setProfiles((profileRes.data ?? []) as Profile[])

    if (type === 'CURSO' && isAdmin && scopeMode==='NATIONAL') {
      const {data:inboxData,error:inboxError}=await supabase
        .from('course_email_intake')
        .select('id,subject,sender_name,sender_address,received_at,body_preview,detection_status,confidence,detected_course_title,detected_participant_name,detected_participant_email,detected_issuer,detected_certificate_no,detected_issue_date,detected_due_date,matched_user_id,matched_by,parse_notes,attachment_names,expiration_id')
        .neq('detection_status','NOT_COURSE')
        .order('received_at',{ascending:false})
        .limit(100)
      if(!inboxError) setCourseInbox((inboxData ?? []) as CourseEmailIntake[])

      const {data:statusData}=await supabase.functions.invoke('sync-outlook-courses',{body:{action:'status'}})
      if(statusData?.ok) setOutlookStatus(statusData as OutlookCourseStatus)
    } else {
      setCourseInbox([])
      setOutlookStatus(null)
    }
    setLoading(false)
  }

  useEffect(()=>{reload()},[type,userId])

  useEffect(()=>{
    if(previewMode){
      if(scopeMode!=='TEAM') setScopeMode('TEAM')
      return
    }
    if(profile?.role==='ADMINISTRADOR'){
      if(scopeMode!=='PERSONAL'&&scopeMode!=='NATIONAL') setScopeMode('NATIONAL')
      return
    }
    if(profile?.role==='COORDINADOR'||profile?.role==='SUPERVISOR'){
      if(scopeMode!=='PERSONAL'&&scopeMode!=='TEAM') setScopeMode('TEAM')
      return
    }
    if(scopeMode!=='PERSONAL') setScopeMode('PERSONAL')
  },[profile?.role,previewMode,scopeMode])

  const scopedProfiles=useMemo(()=>{
    if(previewMode) return profiles.filter((p)=>p.user_id!==userId && p.project===profile?.project && p.warehouse===profile?.warehouse)
    if(isAdmin) return profiles
    if(isCoordinator){
      return profiles.filter((p)=>
        String(p.project||'').trim().toUpperCase()===String(profile?.project||'').trim().toUpperCase()
      )
    }
    return profiles.filter((p)=>p.user_id===userId)
  },[profiles,isAdmin,isCoordinator,previewMode,profile?.project,profile?.warehouse,userId])

  const projectOptions=useMemo(()=>Array.from(new Set(
    profiles.map((p)=>p.project).filter((value): value is string=>Boolean(value))
  )).sort(),[profiles])

  const shiftOptions=useMemo(()=>Array.from(new Set(
    scopedProfiles.map((p)=>p.shift_name).filter((value): value is string=>Boolean(value))
  )).sort(),[scopedProfiles])

  const personOptions=useMemo(()=>[
    {value:'TODOS',label:'Todas las personas',keywords:'todos usuarios'},
    ...scopedProfiles.map(profileOption),
  ],[scopedProfiles])

  const projectSearchOptions=useMemo(()=>[
    {value:'TODOS',label:'Todos los proyectos'},
    ...projectOptions.map((project)=>({value:project,label:project})),
  ],[projectOptions])

  const shiftSearchOptions=useMemo(()=>[
    {value:'TODAS',label:'Todas las guardias'},
    ...shiftOptions.map((shift)=>({value:shift,label:shift})),
    {value:'SIN GUARDIA',label:'Sin guardia'},
  ],[shiftOptions])

  const visible=useMemo(()=>{
    let data=[...rows]

    if(previewMode) data=data.filter((row)=>
      row.user_id!==userId && row.project===profile?.project && row.warehouse===profile?.warehouse
    )

    if(scopeMode==='PERSONAL'){
      data=data.filter((row)=>row.user_id===userId)
    }else if(scopeMode==='TEAM'){
      data=data.filter((row)=>
        String(row.project||'').trim().toUpperCase()===String(profile?.project||'').trim().toUpperCase() &&
        (!previewMode || row.warehouse===profile?.warehouse)
      )
    }

    if(scopeMode==='NATIONAL'&&projectFilter!=='TODOS'){
      data=data.filter((row)=>row.project===projectFilter)
    }
    if(shiftFilter!=='TODAS'){
      data=data.filter((row)=>(row.shift_name||'SIN GUARDIA')===shiftFilter)
    }
    if(personFilter!=='TODOS'){
      data=data.filter((row)=>row.user_id===personFilter)
    }

    const q=search.trim().toLowerCase()
    if(q){
      data=data.filter((row)=>{
        const person=profiles.find((p)=>p.user_id===row.user_id)?.full_name
        return [
          person,row.title,row.issuer,row.certificate_no,row.warehouse,row.project,
          row.group_name,row.shift_name,row.notes
        ].some((value)=>String(value ?? '').toLowerCase().includes(q))
      })
    }

    return data
  },[rows,profiles,search,scopeMode,userId,previewMode,profile?.project,profile?.warehouse,projectFilter,shiftFilter,personFilter])

  const groupedVisible=useMemo(()=>{
    if(scopeMode==='PERSONAL') return [] as {project:string;warehouse:string;shifts:{shift:string;rows:Expiration[]}[]}[]

    const projectMap=new Map<string,{warehouse:string;shiftMap:Map<string,Expiration[]>}>()
    visible.forEach((row)=>{
      const project=row.project||'SIN PROYECTO'
      const warehouse=row.warehouse||'SIN ALMACÉN'
      if(!projectMap.has(project)) projectMap.set(project,{warehouse,shiftMap:new Map()})
      const projectData=projectMap.get(project)!
      const shift=row.shift_name||'SIN GUARDIA'
      projectData.shiftMap.set(shift,[...(projectData.shiftMap.get(shift)||[]),row])
    })

    return Array.from(projectMap.entries()).map(([project,data])=>({
      project,
      warehouse:data.warehouse,
      shifts:Array.from(data.shiftMap.entries()).map(([shift,shiftRows])=>({shift,rows:shiftRows})).sort((a,b)=>a.shift.localeCompare(b.shift)),
    })).sort((a,b)=>a.project.localeCompare(b.project))
  },[visible,scopeMode])

  const counts=useMemo(()=>{
    const active=visible.filter((row)=>row.status!=='ANULADO'&&row.status!=='RENOVADO')
    const expired=active.filter((row)=>daysRemaining(row.due_date)<0 || row.status==='VENCIDO').length
    const critical=active.filter((row)=>{const d=daysRemaining(row.due_date);return row.status!=='VENCIDO'&&d>=0&&d<=15}).length
    const warning=active.filter((row)=>{const d=daysRemaining(row.due_date);return row.status!=='VENCIDO'&&d>=16&&d<=30}).length
    const valid=active.filter((row)=>row.status!=='VENCIDO'&&daysRemaining(row.due_date)>30).length
    return {valid,warning,critical,expired}
  },[visible])

  const expirationExportRows=visible.map((row)=>{
    const status=statusFor(row)
    const days=daysRemaining(row.due_date)
    return {
      person:personName(row.user_id),
      detail:row.title,
      issuer:row.issuer||'',
      certificate:row.certificate_no||'',
      issue_date:dateOnly(row.issue_date),
      due_date:dateOnly(row.due_date),
      days:days<0?`${Math.abs(days)} días vencido`:`${days} días`,
      status:status.label,
      warehouse:row.warehouse||'',
      project:row.project||'',
      group:row.group_name||'',
      shift:row.shift_name||'',
    }
  })

  const expirationExcelColumns=[
    {header:'PERSONA',key:'person',width:30},
    {header:'DETALLE',key:'detail',width:34},
    {header:'EMISOR',key:'issuer',width:24},
    {header:'CERTIFICADO',key:'certificate',width:20},
    {header:'EMISIÓN',key:'issue_date',width:14},
    {header:'VENCIMIENTO',key:'due_date',width:14},
    {header:'DÍAS',key:'days',width:18},
    {header:'ESTADO',key:'status',width:16},
    {header:'ALMACÉN',key:'warehouse',width:18},
    {header:'PROYECTO',key:'project',width:22},
    {header:'GRUPO',key:'group',width:18},
    {header:'GUARDIA',key:'shift',width:14},
  ]

  const expirationPdfColumns=[
    {header:'PERSONA',key:'person'},
    {header:'DETALLE',key:'detail'},
    {header:'EMISOR',key:'issuer'},
    {header:'CERT.',key:'certificate'},
    {header:'VENCE',key:'due_date'},
    {header:'DÍAS',key:'days'},
    {header:'ESTADO',key:'status'},
    {header:'GUARDIA',key:'shift'},
  ]

  function exportExpirationExcel(){
    exportRowsToExcel(
      `KOMTROL_Vencimientos_${type}`,
      'Vencimientos',
      expirationExcelColumns,
      expirationExportRows,
      [['Tipo',config.title],['Registros',expirationExportRows.length],['Vencidos',counts.expired]]
    )
  }

  function exportExpirationPdf(){
    exportRowsToPdfPortrait(
      `KOMTROL_Vencimientos_${type}`,
      `KOMTROL · ${config.title}`,
      expirationPdfColumns,
      expirationExportRows,
      {subtitle:config.subtitle,summary:[['Registros',expirationExportRows.length],['Vencidos',counts.expired]]}
    )
  }

  function openNew() {
    setEditingRow(null)
    setForm({
      user_id: canRegisterOthers ? (form.user_id || userId) : userId,
      title:'',
      issuer:'',
      certificate_no:'',
      issue_date:'',
      due_date:'',
      notes:'',
      status:'ACTIVO',
    })
    setShowForm(true)
  }

  function openEdit(row:Expiration) {
    setEditingRow(row)
    setForm({
      user_id:row.user_id,
      title:row.title,
      issuer:row.issuer||'',
      certificate_no:row.certificate_no||'',
      issue_date:row.issue_date?.slice(0,10)||'',
      due_date:row.due_date.slice(0,10),
      notes:row.notes||'',
      status:row.status,
    })
    setShowForm(true)
  }

  function canEditExpiration(row:Expiration) {
    if(isAdmin) return true
    if(row.user_id===userId) return true
    return Boolean(isCoordinator && row.project && row.project===profile?.project)
  }

  async function save(event:FormEvent) {
    event.preventDefault()
    if(!form.due_date || !form.title.trim()) return
    setSaving(true)
    setMessage('')
    const canChooseUser=isAdmin
    const targetUserId=canChooseUser?form.user_id:(editingRow?.user_id||userId)
    const target=profiles.find((p)=>p.user_id===targetUserId) || profile
    const payload={
      user_id:targetUserId,
      expiration_type:type,
      title:form.title.trim(),
      issuer:form.issuer.trim()||null,
      certificate_no:form.certificate_no.trim()||null,
      issue_date:form.issue_date||null,
      due_date:form.due_date,
      status:editingRow?form.status:'ACTIVO',
      warehouse:target?.warehouse || profile?.warehouse || null,
      project:target?.project || profile?.project || null,
      group_name:target?.group_name || null,
      shift_name:target?.shift_name || null,
      notes:form.notes.trim()||null,
      updated_by:userId,
    }
    const {error}=editingRow
      ? await supabase.from('compliance_expirations').update(payload).eq('id',editingRow.id)
      : await supabase.from('compliance_expirations').insert({...payload,created_by:userId})
    setSaving(false)
    if(error){
      setMessage(error.message)
      return
    }
    setShowForm(false)
    setEditingRow(null)
    setMessage(editingRow?'Vigencia actualizada correctamente.':'Vencimiento registrado correctamente.')
    await reload()
  }

  function personName(id:string) {
    return profiles.find((p)=>p.user_id===id)?.full_name || 'Usuario'
  }

  const pendingOutlook=courseInbox.filter((row)=>['NEEDS_REVIEW','COURSE_DETECTED'].includes(row.detection_status)).length

  async function syncOutlookCourses() {
    setSyncingOutlook(true)
    setMessage('')
    const {data,error}=await supabase.functions.invoke('sync-outlook-courses',{body:{action:'sync'}})
    setSyncingOutlook(false)
    if(error || !data?.ok){
      setMessage(data?.error || error?.message || 'Outlook todavía no está configurado para cursos.')
      await reload()
      return
    }
    setMessage(data.message || 'Sincronización Outlook completada.')
    await reload()
  }

  function openReview(row:CourseEmailIntake) {
    setReviewRow(row)
    setReviewForm({
      user_id:row.matched_user_id || userId,
      title:row.detected_course_title || row.subject || '',
      issuer:row.detected_issuer || row.sender_name || '',
      certificate_no:row.detected_certificate_no || '',
      issue_date:row.detected_issue_date || '',
      due_date:row.detected_due_date || '',
    })
  }

  async function confirmOutlookCourse(event:FormEvent) {
    event.preventDefault()
    if(!reviewRow || !reviewForm.user_id || !reviewForm.title.trim() || !reviewForm.due_date) return
    setReviewSaving(true)
    setMessage('')

    const target=profiles.find((p)=>p.user_id===reviewForm.user_id)
    const {data:existing}=await supabase
      .from('compliance_expirations')
      .select('id')
      .eq('user_id',reviewForm.user_id)
      .eq('expiration_type','CURSO')
      .eq('title',reviewForm.title.trim())
      .eq('due_date',reviewForm.due_date)
      .maybeSingle()

    let expirationId=existing?.id || null

    if(!expirationId){
      const {data:created,error}=await supabase
        .from('compliance_expirations')
        .insert({
          user_id:reviewForm.user_id,
          expiration_type:'CURSO',
          title:reviewForm.title.trim(),
          issuer:reviewForm.issuer.trim()||null,
          certificate_no:reviewForm.certificate_no.trim()||null,
          issue_date:reviewForm.issue_date||null,
          due_date:reviewForm.due_date,
          status:'ACTIVO',
          warehouse:target?.warehouse || profile?.warehouse || null,
          project:target?.project || profile?.project || null,
          group_name:target?.group_name || null,
          shift_name:target?.shift_name || null,
          notes:`Validado desde correo Outlook: ${reviewRow.subject}`,
          created_by:userId,
          updated_by:userId,
          source:'OUTLOOK',
          source_reference:reviewRow.id,
          source_received_at:reviewRow.received_at,
          source_confidence:reviewRow.confidence,
          source_metadata:{
            intake_id:reviewRow.id,
            sender:reviewRow.sender_address,
            subject:reviewRow.subject,
            matched_by:reviewRow.matched_by,
          },
        })
        .select('id')
        .single()
      if(error || !created){
        setReviewSaving(false)
        setMessage(error?.message || 'No se pudo registrar el curso detectado.')
        return
      }
      expirationId=created.id
    }

    const {error:updateError}=await supabase
      .from('course_email_intake')
      .update({
        detection_status:'IMPORTED',
        expiration_id:expirationId,
        matched_user_id:reviewForm.user_id,
        detected_course_title:reviewForm.title.trim(),
        detected_issuer:reviewForm.issuer.trim()||null,
        detected_certificate_no:reviewForm.certificate_no.trim()||null,
        detected_issue_date:reviewForm.issue_date||null,
        detected_due_date:reviewForm.due_date,
        updated_at:new Date().toISOString(),
      })
      .eq('id',reviewRow.id)

    setReviewSaving(false)
    if(updateError){
      setMessage(updateError.message)
      return
    }
    setReviewRow(null)
    setMessage('Curso validado e incorporado a Vencimientos.')
    await reload()
  }

  return (
    <div className="expiration-module">
      <section className="panel expiration-hero">
        <div className="panel-title">
          <div className="expiration-title-wrap">
            <span className="expiration-icon"><Icon size={20}/></span>
            <div><h3>{config.title}</h3><p>{config.subtitle}</p></div>
          </div>
          <div className="button-row">
            <button className="secondary-button" disabled={!visible.length} onClick={exportExpirationPdf}><FileText size={16}/> PDF</button>
            <button className="secondary-button" disabled={!visible.length} onClick={exportExpirationExcel}><FileSpreadsheet size={16}/> Excel</button>
            <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={17}/></button>
            {!previewMode && <button className="primary-button" onClick={openNew}><Plus size={16}/> Registrar</button>}
          </div>
        </div>

        <div className="expiration-kpis expiration-vigency-kpis">
          <div className="vigency-valid"><span>Vigentes</span><b>{counts.valid}</b></div>
          <div className="vigency-warning"><span>Por vencer · 16–30 días</span><b>{counts.warning}</b></div>
          <div className="vigency-critical"><span>Críticos · 0–15 días</span><b>{counts.critical}</b></div>
          <div className="vigency-expired"><span>Vencidos</span><b>{counts.expired}</b></div>
        </div>
      </section>

      {type==='CURSO' && isAdmin && scopeMode==='NATIONAL' && (
        <section className="panel outlook-course-panel">
          <div className="panel-title">
            <div className="outlook-course-title">
              <span className="expiration-icon"><Mail size={19}/></span>
              <div>
                <h3>Outlook → Cursos</h3>
                <p>Detección automática de correos de capacitación y carga al módulo de vencimientos.</p>
              </div>
            </div>
            <div className="button-row">
              <span className={outlookStatus?.configured && outlookStatus?.enabled ? 'status-pill' : 'status-pill warning'}>
                {outlookStatus?.configured && outlookStatus?.enabled ? 'LISTO' : outlookStatus?.configured ? 'PREPARADO' : 'API PENDIENTE'}
              </span>
              <button className="secondary-button" onClick={syncOutlookCourses} disabled={syncingOutlook}>
                {syncingOutlook?<RefreshCw className="spin" size={16}/>:<Download size={16}/>}
                {syncingOutlook?'Sincronizando…':'Sincronizar Outlook'}
              </button>
            </div>
          </div>

          <div className="outlook-course-summary">
            <div><span>Correos por validar</span><b>{pendingOutlook}</b></div>
            <div><span>Importados</span><b>{courseInbox.filter((row)=>row.detection_status==='IMPORTED').length}</b></div>
            <div><span>Importación automática</span><b>{outlookStatus?.autoImport?'ACTIVA':'PREPARADA'}</b></div>
            <div><span>Confianza mínima</span><b>{outlookStatus?.autoImportMinConfidence ?? 95}%</b></div>
          </div>

          <div className="outlook-course-info">
            <Mail size={16}/>
            <span>
              {outlookStatus?.configured
                ? `Buzón: ${outlookStatus.mailbox || 'configurado'} · Carpeta: ${outlookStatus.folder || 'Inbox'}`
                : 'La integración está preparada. Al recibir las credenciales de Microsoft Graph solo se habilitan los secretos y el buzón de lectura.'}
            </span>
          </div>

          {outlookStatus?.lastSyncMessage && <div className="inline-message">{outlookStatus.lastSyncMessage}</div>}

          <div className="outlook-course-inbox">
            {courseInbox.slice(0,20).map((row)=>(
              <article key={row.id} className={row.detection_status==='IMPORTED'?'imported':''}>
                <div className="outlook-course-mail">
                  <div className="outlook-course-mail-head">
                    <b>{row.detected_course_title || row.subject}</b>
                    <span>{row.confidence}%</span>
                  </div>
                  <p>{row.subject}</p>
                  <small>{row.sender_name || row.sender_address || 'Remitente'} · {new Date(row.received_at).toLocaleDateString('es-PE')}</small>
                  <div className="outlook-course-mail-meta">
                    <span>Persona: {row.detected_participant_name || row.detected_participant_email || 'Por identificar'}</span>
                    <span>Vence: {dateOnly(row.detected_due_date)}</span>
                    {row.attachment_names?.length>0&&<span>Adjuntos: {row.attachment_names.join(', ')}</span>}
                  </div>
                </div>
                <div className="outlook-course-mail-actions">
                  <span className={row.detection_status==='IMPORTED'?'status-pill':'status-pill warning'}>
                    {row.detection_status==='IMPORTED'?'IMPORTADO':'VALIDAR'}
                  </span>
                  {row.detection_status!=='IMPORTED'&&(
                    <button className="secondary-button" onClick={()=>openReview(row)}><Edit3 size={14}/> Revisar</button>
                  )}
                </div>
              </article>
            ))}
            {!courseInbox.length&&(
              <div className="empty-work"><Mail size={28}/><b>Sin correos procesados</b><p>Los cursos detectados desde Outlook aparecerán aquí.</p></div>
            )}
          </div>
        </section>
      )}

      <section className="panel expiration-data-panel">
        <div className="expiration-scope-bar">
          <div className="expiration-scope-tabs">
            {canUseWorkerView&&(
              <button type="button" className={scopeMode==='PERSONAL'?'active':''} onClick={()=>setScopeMode('PERSONAL')}>
                Mi información
              </button>
            )}
            {(isCoordinator||previewMode)&&(
              <button type="button" className={scopeMode==='TEAM'?'active':''} onClick={()=>setScopeMode('TEAM')}>
                {previewMode?'Registros de esta vista':'Equipo del proyecto'}
              </button>
            )}
            {isAdmin&&(
              <button type="button" className={scopeMode==='NATIONAL'?'active':''} onClick={()=>setScopeMode('NATIONAL')}>
                Administración nacional
              </button>
            )}
          </div>
          <div className="expiration-scope-context">
            {scopeMode==='PERSONAL'
              ? <span>Vista Trabajador · {profile?.warehouse||'Sin almacén'} · {profile?.shift_name||'Sin guardia'}</span>
              : scopeMode==='TEAM'
                ? <span>Proyecto Minero · {profile?.warehouse||profile?.project||'Proyecto'} · Guardias del equipo</span>
                : <span>Todos los proyectos · acceso Administrador</span>}
          </div>
        </div>

        <div className="task-toolbar expiration-filter-toolbar">
          <div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar vigencia, certificado, emisor…"/></div>
          {scopeMode!=='PERSONAL'&&(
            <SearchableSelect
              value={personFilter}
              onChange={(value)=>setPersonFilter(value||'TODOS')}
              options={personOptions}
              placeholder="Buscar persona…"
              noResultsText="Usuario no encontrado"
              clearable={false}
              ariaLabel="Filtrar por persona"
            />
          )}
          {scopeMode==='NATIONAL'&&(
            <SearchableSelect
              value={projectFilter}
              onChange={(value)=>setProjectFilter(value||'TODOS')}
              options={projectSearchOptions}
              placeholder="Buscar proyecto…"
              clearable={false}
              ariaLabel="Filtrar por proyecto"
            />
          )}
          {scopeMode!=='PERSONAL'&&(
            <SearchableSelect
              value={shiftFilter}
              onChange={(value)=>setShiftFilter(value||'TODAS')}
              options={shiftSearchOptions}
              placeholder="Buscar guardia…"
              clearable={false}
              ariaLabel="Filtrar por guardia"
            />
          )}
        </div>
        {message&&<div className="inline-message">{message}</div>}
        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={20}/><p>Cargando vencimientos…</p></div>
        ) : (
          <>
            <div className="table-wrap expiration-desktop-table expiration-hierarchy-table">
              <table>
                <thead><tr><th>Persona</th><th>Detalle</th><th>Emisor</th><th>Certificado</th><th>Emisión</th><th>Vencimiento</th><th>Días</th><th>Estado</th><th>Acción</th></tr></thead>
                {scopeMode==='PERSONAL' ? (
                  <tbody>
                    {visible.map((row)=>{
                      const status=statusFor(row)
                      const days=daysRemaining(row.due_date)
                      return <tr key={row.id}>
                        <td><b>{personName(row.user_id)}</b><small>{row.shift_name||profile?.shift_name||'Sin guardia'}</small></td>
                        <td>{row.title}</td>
                        <td>{row.issuer||'—'}</td>
                        <td>{row.certificate_no||'—'}</td>
                        <td>{dateOnly(row.issue_date)}</td>
                        <td><b>{dateOnly(row.due_date)}</b></td>
                        <td>{days<0?`${Math.abs(days)} días vencido`:`${days} días`}</td>
                        <td><span className={`expiration-status-pill is-${status.kind}`}>{status.label}</span></td>
                        <td>{canEditExpiration(row)&&<button type="button" className="icon-button expiration-edit-button" onClick={()=>openEdit(row)} title="Editar vigencia"><Edit3 size={15}/></button>}</td>
                      </tr>
                    })}
                  </tbody>
                ) : (
                  groupedVisible.map((projectGroup)=>(
                    <tbody key={projectGroup.project} className="expiration-project-group">
                      <tr className="expiration-project-row"><td colSpan={9}><b>Proyecto Minero · {projectGroup.warehouse}</b><span>{projectGroup.project}</span></td></tr>
                      {projectGroup.shifts.map((shiftGroup)=>[
                        <tr className="expiration-shift-row" key={`${projectGroup.project}-${shiftGroup.shift}-head`}><td colSpan={9}><b>{shiftGroup.shift}</b><span>{new Set(shiftGroup.rows.map((row)=>row.user_id)).size} persona(s) · {shiftGroup.rows.length} registro(s)</span></td></tr>,
                        ...shiftGroup.rows.map((row)=>{
                          const status=statusFor(row)
                          const days=daysRemaining(row.due_date)
                          return <tr key={row.id}>
                            <td><b>{personName(row.user_id)}</b><small>{row.group_name||'Sin grupo'}</small></td>
                            <td>{row.title}</td>
                            <td>{row.issuer||'—'}</td>
                            <td>{row.certificate_no||'—'}</td>
                            <td>{dateOnly(row.issue_date)}</td>
                            <td><b>{dateOnly(row.due_date)}</b></td>
                            <td>{days<0?`${Math.abs(days)} días vencido`:`${days} días`}</td>
                            <td><span className={`expiration-status-pill is-${status.kind}`}>{status.label}</span></td>
                            <td>{canEditExpiration(row)&&<button type="button" className="icon-button expiration-edit-button" onClick={()=>openEdit(row)} title="Editar vigencia"><Edit3 size={15}/></button>}</td>
                          </tr>
                        }),
                      ])}
                    </tbody>
                  ))
                )}
              </table>
              {!visible.length&&<div className="empty-work"><CheckCircle2 size={28}/><b>Sin registros</b><p>No hay vencimientos registrados para este alcance.</p></div>}
            </div>

            <div className="expiration-mobile-list">
              {visible.map((row)=>{
                const status=statusFor(row)
                const days=daysRemaining(row.due_date)
                return <article key={row.id}>
                  <div className="expiration-mobile-head">
                    <div><small>{config.title.toUpperCase()}</small><b>{row.title}</b></div>
                    <span className={`expiration-status-pill is-${status.kind}`}>{status.label}</span>
                  </div>
                  <p>{personName(row.user_id)} · {row.project||profile?.project||'Sin proyecto'} · {row.shift_name||profile?.shift_name||'Sin guardia'}</p>
                  <div className="expiration-mobile-data">
                    <div><span>Vencimiento</span><b>{dateOnly(row.due_date)}</b></div>
                    <div><span>Días restantes</span><b>{days<0?`-${Math.abs(days)}`:days}</b></div>
                    <div><span>Emisor</span><b>{row.issuer||'—'}</b></div>
                    <div><span>Certificado</span><b>{row.certificate_no||'—'}</b></div>
                  </div>
                  {canEditExpiration(row)&&<button type="button" className="secondary-button expiration-mobile-edit" onClick={()=>openEdit(row)}><Edit3 size={14}/> Editar vigencia</button>}
                </article>
              })}
              {!visible.length&&<div className="empty-work"><CheckCircle2 size={28}/><b>Sin registros</b><p>No hay vencimientos registrados en esta categoría.</p></div>}
            </div>
          </>
        )}
      </section>

      {reviewRow&&(
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setReviewRow(null)}>
          <form className="modal expiration-modal" onSubmit={confirmOutlookCourse}>
            <div className="modal-head">
              <div><h2>Validar curso detectado</h2><p>{reviewRow.subject} · confianza {reviewRow.confidence}%</p></div>
              <button type="button" className="icon-button" onClick={()=>setReviewRow(null)}><X size={19}/></button>
            </div>
            <div className="outlook-review-source">
              <Mail size={16}/>
              <div><b>{reviewRow.sender_name || reviewRow.sender_address || 'Correo Outlook'}</b><span>{reviewRow.body_preview || 'Sin vista previa'}</span></div>
            </div>
            <div className="form-grid">
              <label className="span-2">Persona
                <SearchableSelect
                  required
                  value={reviewForm.user_id}
                  onChange={(value)=>setReviewForm({...reviewForm,user_id:value})}
                  options={profiles.map(profileOption)}
                  placeholder="Escribe nombre, DNI, almacén o guardia…"
                  noResultsText="Usuario no encontrado"
                  ariaLabel="Persona del curso"
                />
              </label>
              <label className="span-2">Curso<input required value={reviewForm.title} onChange={(e)=>setReviewForm({...reviewForm,title:e.target.value})}/></label>
              <label>Emisor<input value={reviewForm.issuer} onChange={(e)=>setReviewForm({...reviewForm,issuer:e.target.value})}/></label>
              <label>Certificado<input value={reviewForm.certificate_no} onChange={(e)=>setReviewForm({...reviewForm,certificate_no:e.target.value})}/></label>
              <label>Fecha de emisión<input type="date" value={reviewForm.issue_date} onChange={(e)=>setReviewForm({...reviewForm,issue_date:e.target.value})}/></label>
              <label>Fecha de vencimiento<input type="date" required value={reviewForm.due_date} onChange={(e)=>setReviewForm({...reviewForm,due_date:e.target.value})}/></label>
            </div>
            {reviewRow.parse_notes&&<div className="inline-message">{reviewRow.parse_notes}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={()=>setReviewRow(null)}>Cancelar</button>
              <button className="primary-button" disabled={reviewSaving}>
                {reviewSaving?<RefreshCw className="spin" size={15}/>:<CheckCircle2 size={15}/>}
                {reviewSaving?'Guardando…':'Confirmar e importar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showForm&&(
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setShowForm(false)}>
          <form className="modal expiration-modal" onSubmit={save}>
            <div className="modal-head"><div><h2>{editingRow?`Editar ${config.title}`:`Registrar ${config.title}`}</h2><p>{editingRow?'Actualiza la vigencia manteniendo la trazabilidad del registro.':'El sistema calculará automáticamente los días restantes y el estado.'}</p></div><button type="button" className="icon-button" onClick={()=>{setShowForm(false);setEditingRow(null)}}><X size={19}/></button></div>
            <div className="form-grid">
              <label className="span-2">Persona
                <SearchableSelect
                  value={isAdmin?form.user_id:userId}
                  onChange={(value)=>setForm({...form,user_id:value})}
                  options={(isAdmin?profiles:profiles.filter((p)=>p.user_id===userId)).map(profileOption)}
                  placeholder="Escribe nombre, DNI, almacén o guardia…"
                  noResultsText="Usuario no encontrado"
                  disabled={!isAdmin}
                  required
                  ariaLabel="Persona de la vigencia"
                />
                <small>{isAdmin?'Puedes buscar y seleccionar cualquier usuario activo.':'La vigencia pertenece a tu perfil personal.'}</small>
              </label>
              <label className="span-2">Nombre / detalle<input required value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder={type==='CURSO'?'Ej. Trabajo en altura':type==='LICENCIA_INTERNA'?'Ej. Montacargas - Franja amarilla':'Ej. EMOA anual'}/></label>
              <label>Emisor / institución<input value={form.issuer} onChange={(e)=>setForm({...form,issuer:e.target.value})}/></label>
              <label>N° certificado / licencia<input value={form.certificate_no} onChange={(e)=>setForm({...form,certificate_no:e.target.value})}/></label>
              <label>Fecha de emisión<input type="date" value={form.issue_date} onChange={(e)=>setForm({...form,issue_date:e.target.value})}/></label>
              <label>Fecha de vencimiento<input type="date" required value={form.due_date} onChange={(e)=>setForm({...form,due_date:e.target.value})}/></label>
              <label className="span-2">Observación<textarea rows={3} value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label>
              {editingRow&&(
                <label className="span-2">Estado del registro
                  <select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value as Expiration['status']})}>
                    <option value="ACTIVO">Activo</option>
                    <option value="RENOVADO">Renovado</option>
                    <option value="ANULADO">Anulado</option>
                  </select>
                  <small>La condición Vigente / Por vencer / Crítico / Vencido se calcula automáticamente desde la fecha.</small>
                </label>
              )}
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>{setShowForm(false);setEditingRow(null)}}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?'Guardando…':editingRow?'Guardar cambios':'Registrar'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
