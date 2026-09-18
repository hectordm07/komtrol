import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Mail,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { UsersAdmin } from './components/UsersAdmin'
import { ModulePlaceholder } from './components/ModulePlaceholder'
import { TasksModule } from './components/TasksModule'
import { GuidesModule } from './components/GuidesModule'

type Tab = string

type Profile = {
  user_id: string
  dni: string
  full_name: string
  role: 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
  active: boolean
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
}

type Incident = {
  id: string
  incident_no: string
  incident_type: string
  status: string
  guide_no: string | null
  document_no: string | null
  purchase_order: string | null
  material_no: string | null
  description: string | null
  qty_expected: number | null
  qty_received: number | null
  notes: string | null
  created_at: string
}

type Notification = {
  id: string
  incident_id: string
  status: string
  subject: string
  to_addresses: string[]
  cc_addresses: string[]
  sent_at: string | null
  created_at: string
  error_message: string | null
}

const emptyForm = {
  incident_type: 'FALTANTE',
  guide_no: '',
  document_no: '',
  purchase_order: '',
  material_no: '',
  description: '',
  qty_expected: '',
  qty_received: '',
  notes: '',
}

function loginEmail(dni: string) {
  return `${dni.trim()}@login.komtrol.local`
}

function loginPassword(pin: string) {
  return `Kt!${pin.trim()}#`
}

function incidentNumber() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `INC-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoadingSession(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (loadingSession) {
    return (
      <div className="screen-center">
        <div className="loader" />
        <p>Iniciando KOMTROL…</p>
      </div>
    )
  }

  return session ? <Workspace session={session} /> : <Login />
}

function Login() {
  const [dni, setDni] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')

    if (!/^\d{8}$/.test(dni)) {
      setMessage('Ingresa un DNI válido de 8 dígitos.')
      return
    }

    if (!/^\d{4,8}$/.test(pin)) {
      setMessage('El PIN debe tener de 4 a 8 dígitos.')
      return
    }

    setLoading(true)

    const email = loginEmail(dni)

    // Formato principal de KOMTROL. Si el usuario fue creado manualmente
    // usando el PIN directo en Supabase, intentamos una vez ese formato
    // para facilitar la migración de cuentas.
    let { error } = await supabase.auth.signInWithPassword({
      email,
      password: pin.trim(),
    })

    if (error?.message?.toLowerCase().includes('invalid login credentials')) {
      const legacyAttempt = await supabase.auth.signInWithPassword({
        email,
        password: loginPassword(pin),
      })
      error = legacyAttempt.error
    }

    setLoading(false)

    if (error) {
      const messageText = error.message?.toLowerCase() ?? ''
      if (messageText.includes('email not confirmed')) {
        setMessage('El usuario existe, pero aún no está confirmado.')
      } else if (messageText.includes('invalid login credentials')) {
        setMessage('DNI o PIN incorrecto. Verifica los datos e intenta nuevamente.')
      } else {
        setMessage(`No se pudo validar el acceso: ${error.message}`)
      }
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-mark">K</div>
        <div>
          <p className="eyebrow">CONTROL OPERATIVO</p>
          <h1>KOMTROL</h1>
          <p className="brand-copy">
            Centraliza pendientes, incidencias, recepción y trazabilidad del almacén en una sola plataforma.
          </p>
        </div>
        <div className="login-feature-grid">
          <div><PackageCheck size={22} /><span>Recepción y guías</span></div>
          <div><AlertTriangle size={22} /><span>Faltantes y dañados</span></div>
          <div><Mail size={22} /><span>Alertas automáticas</span></div>
          <div><BarChart3 size={22} /><span>Control y seguimiento</span></div>
        </div>
      </section>

      <section className="login-card-wrap">
        <form className="login-card" onSubmit={submit}>
          <div className="mini-logo">K</div>
          <h2>Bienvenido a KOMTROL</h2>
          <p>Ingresa con tu DNI y PIN asignado.</p>

          <label>
            DNI
            <input
              inputMode="numeric"
              autoComplete="username"
              maxLength={8}
              placeholder="00000000"
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
            />
          </label>

          <label>
            PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={8}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </label>

          {message && <div className="form-alert">{message}</div>}

          <button className="primary-button full" disabled={loading}>
            {loading ? <RefreshCw className="spin" size={18} /> : <ShieldCheck size={18} />}
            {loading ? 'Validando…' : 'Ingresar'}
          </button>

          <small>Acceso exclusivo para personal autorizado.</small>
        </form>
      </section>
    </main>
  )
}

function Workspace({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('inicio')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const user = session.user
  const role = profile?.role ?? (user.app_metadata?.role as Profile['role'] | undefined) ?? 'TRABAJADOR'
  const displayName = profile?.full_name ?? user.user_metadata?.full_name ?? 'Usuario KOMTROL'

  async function reload() {
    setLoading(true)
    const [profileRes, incidentsRes, notificationsRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('incidents').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('email_notifications').select('*').order('created_at', { ascending: false }).limit(100),
    ])

    if (profileRes.data) setProfile(profileRes.data as Profile)
    setIncidents((incidentsRes.data ?? []) as Incident[])
    setNotifications((notificationsRes.data ?? []) as Notification[])
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [user.id])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const counts = useMemo(() => {
    return {
      total: incidents.length,
      abiertos: incidents.filter((i) => ['ABIERTO', 'EN_REVISION'].includes(i.status)).length,
      notificados: incidents.filter((i) => i.status === 'NOTIFICADO').length,
      errores: notifications.filter((n) => n.status === 'ERROR').length,
    }
  }, [incidents, notifications])

  async function saveIncident(event: FormEvent) {
    event.preventDefault()
    setSaving(true)

    const { data: created, error } = await supabase
      .from('incidents')
      .insert({
        incident_no: incidentNumber(),
        incident_type: form.incident_type,
        guide_no: form.guide_no || null,
        document_no: form.document_no || null,
        purchase_order: form.purchase_order || null,
        material_no: form.material_no || null,
        description: form.description || null,
        qty_expected: form.qty_expected ? Number(form.qty_expected) : null,
        qty_received: form.qty_received ? Number(form.qty_received) : null,
        notes: form.notes || null,
        created_by: user.id,
      })
      .select('*')
      .single()

    if (error || !created) {
      setSaving(false)
      setToast(error?.message ?? 'No se pudo registrar la incidencia.')
      return
    }

    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${user.id}/${created.id}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('incident-evidence')
        .upload(path, file, { upsert: false })

      if (uploadError) continue

      const attachmentType = file.type.startsWith('image/')
        ? 'FOTO'
        : file.type === 'application/pdf'
          ? 'GUIA'
          : 'OTRO'

      await supabase.from('incident_attachments').insert({
        incident_id: created.id,
        attachment_type: attachmentType,
        bucket: 'incident-evidence',
        storage_path: path,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: user.id,
      })
    }

    setSaving(false)
    setShowIncidentForm(false)
    setForm(emptyForm)
    setFiles([])
    setToast(`Incidencia ${created.incident_no} registrada correctamente.`)
    await reload()
  }

  async function sendNotification(incidentId: string) {
    setSendingId(incidentId)
    const { data, error } = await supabase.functions.invoke('send-outlook-notification', {
      body: { incidentId },
    })
    setSendingId(null)

    if (error) {
      setToast('La incidencia está guardada. Outlook aún no está habilitado o ocurrió un error de envío.')
      await reload()
      return
    }

    if (data?.ok) {
      setToast('Correo enviado y trazabilidad registrada.')
    } else {
      setToast(data?.error ?? 'No se pudo completar el envío.')
    }
    await reload()
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const navSections = [
    {
      section: 'INICIO',
      items: [
        { id: 'inicio' as Tab, label: 'Resumen del almacén', icon: BarChart3 },
        { id: 'mi-trabajo' as Tab, label: 'Mi trabajo', icon: ClipboardList },
        { id: 'alertas' as Tab, label: 'Alertas', icon: Bell },
      ],
    },
    {
      section: 'TRABAJO',
      items: [
        { id: 'area-personal' as Tab, label: 'Área Personal', icon: ClipboardList },
        { id: 'proyectos' as Tab, label: 'Proyectos / Almacenes', icon: Boxes },
        { id: 'relevos' as Tab, label: 'Relevos', icon: RefreshCw },
        { id: 'tareas' as Tab, label: 'Tareas', icon: ClipboardList },
        { id: 'lista' as Tab, label: 'Lista', icon: ClipboardList },
        { id: 'tablero' as Tab, label: 'Tablero', icon: Boxes },
        { id: 'calendario' as Tab, label: 'Calendario', icon: BarChart3 },
      ],
    },
    {
      section: 'OPERACIONES',
      items: [
        { id: 'scanner-guias' as Tab, label: 'Scanner de Guías', icon: PackageCheck },
        { id: 'seguimiento-guias' as Tab, label: 'Seguimiento de Guías', icon: Search },
        { id: 'ingresos-reposicion' as Tab, label: 'Ingresos de Reposición', icon: PackageCheck },
        { id: 'ingresos-consignacion' as Tab, label: 'Ingresos de Consignación', icon: PackageCheck },
        { id: 'oc-cargos' as Tab, label: 'OC / Cargos Directos', icon: ClipboardList },
        { id: 'os-prestamos' as Tab, label: 'OS / Préstamos', icon: Boxes },
        { id: 'outbound' as Tab, label: 'Consumos / Outbound', icon: Send },
        { id: 'hoja-ubicacion' as Tab, label: 'Hoja de Ubicación', icon: ClipboardList },
        { id: 'incidencias' as Tab, label: 'Incidencias', icon: AlertTriangle },
      ],
    },
    {
      section: 'CONTROL',
      items: [
        { id: 'materiales' as Tab, label: 'Materiales', icon: Boxes },
        { id: 'inventarios' as Tab, label: 'Inventarios', icon: ClipboardList },
        { id: 'transitos' as Tab, label: 'Tránsitos', icon: RefreshCw },
        { id: 'danados' as Tab, label: 'Dañados', icon: AlertTriangle },
        { id: 'activos' as Tab, label: 'Activos', icon: ShieldCheck },
      ],
    },
    {
      section: 'DASHBOARD',
      items: [
        { id: 'dashboard-operacion' as Tab, label: 'Operación', icon: BarChart3 },
        { id: 'inbound-outbound' as Tab, label: 'Inbound / Outbound', icon: BarChart3 },
        { id: 'eri' as Tab, label: 'ERI', icon: BarChart3 },
        { id: 'sobrantes-faltantes' as Tab, label: 'Sobrantes / Faltantes', icon: BarChart3 },
        { id: 'diferencias-inventario' as Tab, label: 'Diferencias inventario', icon: BarChart3 },
        { id: 'dashboard-transitos' as Tab, label: 'Tránsitos', icon: BarChart3 },
        { id: 'uca' as Tab, label: 'UCA', icon: BarChart3 },
        { id: 'ahorros' as Tab, label: 'Ahorros', icon: BarChart3 },
        { id: 'perfect-ship' as Tab, label: 'Perfect Ship', icon: BarChart3 },
        { id: 'consignaciones' as Tab, label: 'Consignaciones', icon: BarChart3 },
        { id: 'vhs' as Tab, label: 'VHS', icon: BarChart3 },
        { id: 'safe' as Tab, label: 'SAFE', icon: BarChart3 },
      ],
    },
    ...(role === 'ADMINISTRADOR'
      ? [{
          section: 'ADMINISTRACIÓN',
          items: [
            { id: 'master-materiales' as Tab, label: 'Master de Materiales', icon: Boxes },
            { id: 'cargas-masivas' as Tab, label: 'Cargas Masivas', icon: Upload },
            { id: 'usuarios' as Tab, label: 'Usuarios', icon: ShieldCheck },
            { id: 'almacenes' as Tab, label: 'Almacenes', icon: Boxes },
            { id: 'categorias' as Tab, label: 'Categorías', icon: ClipboardList },
            { id: 'metas-kpi' as Tab, label: 'Metas / KPI', icon: BarChart3 },
            { id: 'periodos' as Tab, label: 'Periodos', icon: RefreshCw },
            { id: 'auditoria' as Tab, label: 'Auditoría', icon: ShieldCheck },
          ],
        }]
      : []),
    {
      section: 'SISTEMA',
      items: [
        { id: 'correos' as Tab, label: 'Correos', icon: Mail },
        { id: 'configuracion' as Tab, label: 'Configuración', icon: Settings },
      ],
    },
  ]

  const flatNav = navSections.flatMap((group) =>
    group.items.map((item) => ({ ...item, section: group.section }))
  )
  const currentNav = flatNav.find((item) => item.id === tab)
  const taskTabs = ['mi-trabajo', 'tareas', 'relevos', 'area-personal', 'lista', 'tablero', 'calendario'] as const
  const isTaskTab = taskTabs.includes(tab as typeof taskTabs[number])
  const guideTabs = ['scanner-guias', 'seguimiento-guias', 'oc-cargos', 'ingresos-reposicion'] as const
  const isGuideTab = guideTabs.includes(tab as typeof guideTabs[number])
  const guideMode =
    tab === 'scanner-guias' ? 'scanner' :
    tab === 'seguimiento-guias' ? 'seguimiento' :
    tab === 'oc-cargos' ? 'oc-cargos' :
    'reposicion'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">K</div>
          <div><b>KOMTROL</b><span>Control Operativo</span></div>
          <button className="icon-button mobile-only" onClick={() => setMobileMenu(false)}><X size={20} /></button>
        </div>

        <nav className="sidebar-nav">
          {navSections.map((group) => (
            <div className="nav-section" key={group.section}>
              <span className="nav-section-title">{group.section}</span>
              {group.items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={tab === id ? 'active' : ''}
                  onClick={() => { setTab(id); setMobileMenu(false) }}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="profile-mini">
            <div className="avatar">{displayName.charAt(0).toUpperCase()}</div>
            <div><b>{displayName}</b><span>{role}</span></div>
          </div>
          <button className="logout-button" onClick={logout}><LogOut size={17} /> Salir</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileMenu(true)}><Menu size={22} /></button>
          <div>
            <h1>{currentNav?.label ?? 'KOMTROL'}</h1>
            <p>{displayName} · {role}</p>
          </div>
          <div className="top-actions">
            <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={19} /></button>
            <button className="icon-button" title="Notificaciones"><Bell size={19} /></button>
          </div>
        </header>

        <div className="content">
          {loading ? (
            <div className="screen-center compact"><div className="loader" /><p>Cargando información…</p></div>
          ) : (
            <>
              {tab === 'inicio' && (
                <>
                  <section className="hero-card">
                    <div>
                      <span className="status-pill"><CheckCircle2 size={15} /> Supabase conectado</span>
                      <h2>Control operativo centralizado</h2>
                      <p>Registra incidencias, adjunta evidencia y mantén trazabilidad de las notificaciones desde un solo lugar.</p>
                    </div>
                    <button className="primary-button" onClick={() => { setTab('incidencias'); setShowIncidentForm(true) }}>
                      <Plus size={18} /> Nueva incidencia
                    </button>
                  </section>

                  <section className="kpi-grid">
                    <Kpi icon={<ClipboardList />} label="Incidencias" value={counts.total} />
                    <Kpi icon={<AlertTriangle />} label="Pendientes" value={counts.abiertos} />
                    <Kpi icon={<Send />} label="Notificadas" value={counts.notificados} />
                    <Kpi icon={<Mail />} label="Errores correo" value={counts.errores} />
                  </section>

                  <section className="panel">
                    <div className="panel-title">
                      <div><h3>Actividad reciente</h3><p>Últimas incidencias registradas</p></div>
                      <button className="text-button" onClick={() => setTab('incidencias')}>Ver todas</button>
                    </div>
                    <IncidentTable incidents={incidents.slice(0, 6)} sendingId={sendingId} onSend={sendNotification} />
                  </section>
                </>
              )}

              {tab === 'incidencias' && (
                <section className="panel">
                  <div className="panel-title">
                    <div><h3>Faltantes, dañados y diferencias</h3><p>Registro y trazabilidad de recepción</p></div>
                    <button className="primary-button" onClick={() => setShowIncidentForm(true)}><Plus size={18} /> Registrar</button>
                  </div>
                  <div className="toolbar">
                    <div className="search"><Search size={17} /><input placeholder="Buscar por guía, OC, material…" /></div>
                  </div>
                  <IncidentTable incidents={incidents} sendingId={sendingId} onSend={sendNotification} />
                </section>
              )}

              {tab === 'correos' && (
                <section className="panel">
                  <div className="panel-title">
                    <div><h3>Historial de notificaciones</h3><p>Seguimiento de correos generados por KOMTROL</p></div>
                  </div>
                  {notifications.length === 0 ? (
                    <Empty icon={<Mail size={32} />} title="Sin correos registrados" text="Los envíos aparecerán aquí cuando se notifique una incidencia." />
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Estado</th><th>Asunto</th><th>Destinatario</th><th>Fecha</th></tr></thead>
                        <tbody>
                          {notifications.map((n) => (
                            <tr key={n.id}>
                              <td><Status value={n.status} /></td>
                              <td><b>{n.subject}</b>{n.error_message && <small className="error-line">{n.error_message}</small>}</td>
                              <td>{n.to_addresses?.join(', ') || 'Sin configurar'}</td>
                              <td>{formatDate(n.sent_at ?? n.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {isTaskTab && (
                <TasksModule
                  mode={tab as typeof taskTabs[number]}
                  userId={user.id}
                  profile={profile}
                />
              )}

              {isGuideTab && (
                <GuidesModule
                  mode={guideMode}
                  userId={user.id}
                  profile={profile}
                />
              )}

              {tab === 'usuarios' && role === 'ADMINISTRADOR' && (
                <UsersAdmin />
              )}

              {!isTaskTab && !isGuideTab && !['inicio', 'incidencias', 'correos', 'usuarios', 'configuracion'].includes(tab) && currentNav && (
                <ModulePlaceholder
                  title={currentNav.label}
                  section={currentNav.section}
                  description={`${currentNav.label} forma parte de la migración completa desde KOMTROL Sites hacia GitHub + Vercel + Supabase.`}
                />
              )}

              {tab === 'configuracion' && (
                <section className="config-grid">
                  <div className="panel setting-card">
                    <div className="setting-icon"><Boxes /></div>
                    <h3>Supabase</h3>
                    <p>Base de datos, autenticación y evidencias.</p>
                    <span className="status-pill"><CheckCircle2 size={15} /> Conectado</span>
                  </div>
                  <div className="panel setting-card">
                    <div className="setting-icon"><Mail /></div>
                    <h3>Microsoft Outlook</h3>
                    <p>El módulo está desplegado. Falta incorporar las credenciales entregadas por TI.</p>
                    <span className="status-pill warning"><AlertTriangle size={15} /> Pendiente credenciales</span>
                  </div>
                  <div className="panel setting-card">
                    <div className="setting-icon"><ShieldCheck /></div>
                    <h3>Perfil de acceso</h3>
                    <p>Rol actual: <b>{role}</b></p>
                    <span className="status-pill"><CheckCircle2 size={15} /> Sesión protegida</span>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {showIncidentForm && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowIncidentForm(false)}>
          <form className="modal" onSubmit={saveIncident}>
            <div className="modal-head">
              <div><h2>Nueva incidencia</h2><p>Registra el detalle antes de notificar.</p></div>
              <button type="button" className="icon-button" onClick={() => setShowIncidentForm(false)}><X size={20} /></button>
            </div>

            <div className="form-grid">
              <label>Tipo
                <select value={form.incident_type} onChange={(e) => setForm({ ...form, incident_type: e.target.value })}>
                  <option value="FALTANTE">Faltante</option>
                  <option value="DANADO">Dañado</option>
                  <option value="DIFERENCIA">Diferencia</option>
                  <option value="SIN_DOCUMENTACION">Sin documentación</option>
                  <option value="OTRO">Otro</option>
                </select>
              </label>
              <label>Guía
                <input value={form.guide_no} onChange={(e) => setForm({ ...form, guide_no: e.target.value })} placeholder="T098-00005674" />
              </label>
              <label>N° Documento
                <input value={form.document_no} onChange={(e) => setForm({ ...form, document_no: e.target.value })} placeholder="Documento / referencia" />
              </label>
              <label>OC
                <input value={form.purchase_order} onChange={(e) => setForm({ ...form, purchase_order: e.target.value })} placeholder="8000..." />
              </label>
              <label>N° parte / material
                <input value={form.material_no} onChange={(e) => setForm({ ...form, material_no: e.target.value })} placeholder="Número de parte" />
              </label>
              <label>Descripción
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción del material" />
              </label>
              <label>Cantidad esperada
                <input type="number" min="0" step="any" value={form.qty_expected} onChange={(e) => setForm({ ...form, qty_expected: e.target.value })} />
              </label>
              <label>Cantidad recibida
                <input type="number" min="0" step="any" value={form.qty_received} onChange={(e) => setForm({ ...form, qty_received: e.target.value })} />
              </label>
              <label className="span-2">Observaciones
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Detalle de la incidencia…" />
              </label>
              <label className="span-2 upload-box">
                <Upload size={22} />
                <span><b>Adjuntar evidencia</b><small>PDF de guía, fotografías u otros archivos</small></span>
                <input type="file" multiple accept=".pdf,image/*" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              </label>
            </div>

            {files.length > 0 && <div className="file-list">{files.map((f) => <span key={f.name}>{f.name}</span>)}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowIncidentForm(false)}>Cancelar</button>
              <button className="primary-button" disabled={saving}>
                {saving ? <RefreshCw className="spin" size={18} /> : <CheckCircle2 size={18} />}
                {saving ? 'Guardando…' : 'Guardar incidencia'}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="kpi-card"><div className="kpi-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>
}

function IncidentTable({ incidents, sendingId, onSend }: {
  incidents: Incident[]
  sendingId: string | null
  onSend: (id: string) => void
}) {
  if (incidents.length === 0) {
    return <Empty icon={<AlertTriangle size={32} />} title="Sin incidencias" text="Registra un faltante, dañado o diferencia para iniciar el seguimiento." />
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Incidencia</th><th>Tipo</th><th>Guía / OC</th><th>Material</th><th>Estado</th><th>Registro</th><th></th></tr>
        </thead>
        <tbody>
          {incidents.map((i) => (
            <tr key={i.id}>
              <td><b>{i.incident_no}</b></td>
              <td>{i.incident_type.replaceAll('_', ' ')}</td>
              <td>{i.guide_no || '—'}<small>{i.purchase_order || ''}</small></td>
              <td>{i.material_no || '—'}<small>{i.description || ''}</small></td>
              <td><Status value={i.status} /></td>
              <td>{formatDate(i.created_at)}</td>
              <td>
                <button
                  className="send-button"
                  disabled={sendingId === i.id || i.status === 'NOTIFICADO'}
                  onClick={() => onSend(i.id)}
                  title="Generar y enviar correo"
                >
                  {sendingId === i.id ? <RefreshCw className="spin" size={16} /> : <Send size={16} />}
                  {i.status === 'NOTIFICADO' ? 'Enviado' : 'Notificar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Status({ value }: { value: string }) {
  return <span className={`status ${value.toLowerCase()}`}>{value.replaceAll('_', ' ')}</span>
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="empty">{icon}<h4>{title}</h4><p>{text}</p></div>
}

export default App
