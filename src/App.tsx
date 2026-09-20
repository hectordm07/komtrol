import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  LogOut,
  GraduationCap,
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
import { MaterialsModule } from './components/MaterialsModule'
import { OperationsControlModule } from './components/OperationsControlModule'
import { ScorecardRemoteModule } from './components/ScorecardRemoteModule'
import { AdministrationModule } from './components/AdministrationModule'
import { ReplenishmentModule } from './components/ReplenishmentModule'
import { LocationSheetsModule } from './components/LocationSheetsModule'
import { AlertsModule } from './components/AlertsModule'
import { OcCargoTrackingModule } from './components/OcCargoTrackingModule'
import { InboundModule } from './components/InboundModule'
import { ReceivingIncidentModule } from './components/ReceivingIncidentModule'
import { IncidentEmailSettings } from './components/IncidentEmailSettings'
import { SurplusKardexModule } from './components/SurplusKardexModule'
import { ExpirationsModule } from './components/ExpirationsModule'
import { UniversalDashboardModule } from './components/UniversalDashboardModule'

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
  shift_name?: string | null
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

type AppNotification = {
  id: string
  user_id: string
  notification_type: string
  title: string
  message: string | null
  task_id: string | null
  created_by: string | null
  read_at: string | null
  metadata: Record<string, unknown>
  created_at: string
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

function greetingForDate(value: Date) {
  const hour = value.getHours()
  if (hour >= 5 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function todayLabel(value: Date) {
  const label = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(value)
  return `HOY ES ${label.toUpperCase()}`
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0]?.toUpperCase() || 'USUARIO'
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
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')

    const value = identifier.trim().toLowerCase()
    const isDni = /^\d{8}$/.test(value)
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    const isUsername = /^[a-z0-9._-]{3,80}$/i.test(value)

    if (!isDni && !isEmail && !isUsername) {
      setMessage('Ingresa un DNI, usuario o correo válido.')
      return
    }

    if (!password.trim()) {
      setMessage(isDni ? 'Ingresa tu PIN.' : 'Ingresa tu contraseña.')
      return
    }

    if (isDni && !/^\d{4,8}$/.test(password)) {
      setMessage('El PIN debe tener de 4 a 8 dígitos.')
      return
    }

    setLoading(true)

    const email = isDni
      ? loginEmail(value)
      : isEmail
        ? value
        : `${value}@kmmp.com.pe`

    let { error } = await supabase.auth.signInWithPassword({
      email,
      password: password.trim(),
    })

    // Compatibilidad con cuentas antiguas de KOMTROL que usan el PIN
    // transformado como contraseña en Supabase.
    if (
      error?.message?.toLowerCase().includes('invalid login credentials') &&
      /^\d{4,8}$/.test(password)
    ) {
      const legacyAttempt = await supabase.auth.signInWithPassword({
        email,
        password: loginPassword(password),
      })
      error = legacyAttempt.error
    }

    setLoading(false)

    if (error) {
      const messageText = error.message?.toLowerCase() ?? ''
      if (messageText.includes('email not confirmed')) {
        setMessage('El usuario existe, pero su correo aún no está confirmado.')
      } else if (messageText.includes('invalid login credentials')) {
        setMessage(
          isDni
            ? 'DNI o PIN incorrecto. Verifica los datos e intenta nuevamente.'
            : 'Usuario/correo o contraseña incorrectos. Verifica los datos e intenta nuevamente.'
        )
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
          <p>Ingresa con tu DNI, usuario corporativo o correo.</p>

          <label>
            DNI, usuario o correo
            <input
              type="text"
              autoComplete="username"
              placeholder="12345678 o richar.solar"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </label>

          <label>
            PIN o contraseña
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
  const [openSections, setOpenSections] = useState<string[]>(['INICIO'])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([])
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [taskToOpen, setTaskToOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [now, setNow] = useState(() => new Date())

  const user = session.user
  const role = profile?.role ?? (user.app_metadata?.role as Profile['role'] | undefined) ?? 'TRABAJADOR'
  const displayName = profile?.full_name ?? user.user_metadata?.full_name ?? 'Usuario KOMTROL'

  async function reload() {
    setLoading(true)
    const [profileRes, incidentsRes, notificationsRes, appNotificationRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('incidents').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('email_notifications').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('app_notifications').select('*').order('created_at', { ascending: false }).limit(100),
    ])

    if (profileRes.data) setProfile(profileRes.data as Profile)
    setIncidents((incidentsRes.data ?? []) as Incident[])
    setNotifications((notificationsRes.data ?? []) as Notification[])
    setAppNotifications((appNotificationRes.data ?? []) as AppNotification[])
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const { data } = await supabase
        .from('app_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (data) setAppNotifications(data as AppNotification[])
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [user.id])

  useEffect(() => {
    const channel = supabase
      .channel(`app-notifications-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const item = payload.new as AppNotification
          setAppNotifications((current) => [item, ...current.filter((row) => row.id !== item.id)].slice(0, 100))
          setToast(item.message ? `${item.title}: ${item.message}` : item.title)

          if ('Notification' in window && window.Notification.permission === 'granted') {
            const browserNotification = new window.Notification(item.title, {
              body: item.message || 'Tienes una nueva notificación en KOMTROL.',
              icon: '/favicon.ico',
              tag: item.id,
            })
            browserNotification.onclick = () => {
              window.focus()
              void openAppNotification(item)
              browserNotification.close()
            }
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user.id])

  const unreadAppNotifications = appNotifications.filter((item) => !item.read_at).length

  async function toggleNotificationCenter() {
    if ('Notification' in window && window.Notification.permission === 'default') {
      try {
        await window.Notification.requestPermission()
      } catch {
        // El centro interno de KOMTROL seguirá funcionando aunque el navegador no conceda permiso.
      }
    }
    setNotificationOpen((value) => !value)
  }

  async function openAppNotification(item: AppNotification) {
    if (!item.read_at) {
      await supabase
        .from('app_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', item.id)
      setAppNotifications((current) =>
        current.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)
      )
    }

    setNotificationOpen(false)

    if (item.task_id) {
      setTaskToOpen(item.task_id)
      setTab('mi-trabajo')
      setOpenSections((current) => current.includes('ÁREA DE TRABAJO') ? current : [...current, 'ÁREA DE TRABAJO'])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function markAllNotificationsRead() {
    const unread = appNotifications.filter((item) => !item.read_at)
    if (!unread.length) return
    const nowIso = new Date().toISOString()
    await supabase
      .from('app_notifications')
      .update({ read_at: nowIso })
      .is('read_at', null)
    setAppNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: nowIso }))
  }

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

  const allNavSections = [
    {
      section: 'INICIO',
      items: [
        { id: 'inicio' as Tab, label: 'Dashboard', icon: BarChart3 },
        { id: 'alertas' as Tab, label: 'Alertas', icon: Bell },
      ],
    },
    {
      section: 'ÁREA DE TRABAJO',
      items: [
        { id: 'mi-trabajo' as Tab, label: 'Mi trabajo', icon: ClipboardList },
        { id: 'tareas' as Tab, label: 'Tareas', icon: ClipboardList },
        { id: 'relevos' as Tab, label: 'Relevos', icon: RefreshCw },
      ],
    },
    {
      section: 'VENCIMIENTOS',
      collapsible: true,
      items: [
        { id: 'vencimientos-emoa' as Tab, label: 'EMOA', icon: ShieldCheck },
        { id: 'vencimientos-cursos' as Tab, label: 'Cursos', icon: GraduationCap },
        { id: 'vencimientos-licencias' as Tab, label: 'Licencias Internas', icon: BadgeCheck },
      ],
    },
    ...((profile?.warehouse === 'CALLAO' || role === 'ADMINISTRADOR')
      ? [{
          section: 'INBOUND · CALLAO',
          collapsible: true,
          items: [
            { id: 'inbound-incidencias' as Tab, label: 'Incidencias', icon: AlertTriangle },
            { id: 'inbound-cajas' as Tab, label: 'Sobrantes / Cajas', icon: Boxes },
            { id: 'inbound-kardex' as Tab, label: 'Kardex de Sobrantes', icon: ClipboardList },
          ],
        }]
      : []),
    {
      section: 'OPERACIONES',
      items: [
        { id: 'scanner-guias' as Tab, label: 'Scanner de Guías', icon: PackageCheck },
        { id: 'seguimiento-guias' as Tab, label: 'Seguimiento de Guías', icon: Search },
        { id: 'ingresos-reposicion' as Tab, label: 'Ingresos de Reposición', icon: PackageCheck },
        { id: 'oc-cargos' as Tab, label: 'OC / Cargos Directos', icon: ClipboardList },
        { id: 'os-prestamos' as Tab, label: 'OS / Préstamos', icon: Boxes },
        { id: 'outbound' as Tab, label: 'Consumos / Outbound', icon: Send },
        { id: 'hoja-ubicacion' as Tab, label: 'Hojas de Ubicación', icon: ClipboardList },
        { id: 'incidencias' as Tab, label: 'Incidencias', icon: AlertTriangle },
      ],
    },
    {
      section: 'CONTROL',
      items: [
        { id: 'materiales' as Tab, label: 'Materiales', icon: Boxes },
        { id: 'kardex-sobrantes' as Tab, label: 'Kardex de Sobrantes', icon: ClipboardList },
        { id: 'inventarios' as Tab, label: 'Inventarios', icon: ClipboardList },
        { id: 'transitos' as Tab, label: 'Tránsitos', icon: RefreshCw },
        { id: 'danados' as Tab, label: 'Dañados', icon: AlertTriangle },
        { id: 'activos' as Tab, label: 'Activos', icon: ShieldCheck },
      ],
    },
    {
      section: 'SCORECARD ALMACENES REMOTOS',
      items: [
        ...(role === 'COORDINADOR' || role === 'ADMINISTRADOR'
          ? [{ id: 'scorecard-carga' as Tab, label: 'Carga / Datos', icon: Upload }]
          : []),
        { id: 'inbound-outbound' as Tab, label: '1. Inbound / Outbound', icon: BarChart3 },
        { id: 'eri' as Tab, label: '2. ERI', icon: BarChart3 },
        { id: 'sobrantes-faltantes' as Tab, label: '3. Sobrantes / Faltantes', icon: BarChart3 },
        { id: 'diferencias-inventario' as Tab, label: '4. Diferencias Inventario', icon: BarChart3 },
        { id: 'danados-scorecard' as Tab, label: '5. Dañados', icon: BarChart3 },
        { id: 'dashboard-transitos' as Tab, label: '6. Tránsitos', icon: BarChart3 },
        { id: 'activos-inactivos' as Tab, label: '7. Activos / Inactivos', icon: BarChart3 },
        { id: 'uca' as Tab, label: '8. UCA', icon: BarChart3 },
        { id: 'ahorros' as Tab, label: '9. Ahorros', icon: BarChart3 },
        { id: 'perfect-ship-outbound' as Tab, label: '10. P.S. Outbound', icon: BarChart3 },
        { id: 'perfect-ship-inbound' as Tab, label: '11. P.S. Inbound', icon: BarChart3 },
        { id: 'safe' as Tab, label: '12. SAFE', icon: BarChart3 },
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

  const isCallaoProfile = profile?.warehouse?.toUpperCase() === 'CALLAO'
  const isCallaoUser = isCallaoProfile && role !== 'ADMINISTRADOR'
  const isCallaoCoordinator = role === 'COORDINADOR' && profile?.warehouse === 'CALLAO'
  const isCallaoSupervisor = role === 'SUPERVISOR' && profile?.warehouse === 'CALLAO'
  const isCallaoWorker = role === 'TRABAJADOR' && profile?.warehouse === 'CALLAO'

  const universalSections = ['INICIO', 'ÁREA DE TRABAJO', 'VENCIMIENTOS']

  const navSections = !profile
    ? []
    : isCallaoUser
      ? allNavSections
        .filter((group) => universalSections.includes(group.section) || group.section === 'INBOUND · CALLAO')
        .map((group) => {
          if (group.section !== 'INBOUND · CALLAO') return group

          const allowedInbound =
            isCallaoSupervisor
              ? ['inbound-incidencias','inbound-cajas','inbound-kardex']
              : ['inbound-incidencias','inbound-cajas','inbound-kardex']

          return {
            ...group,
            items: group.items.filter((item) => allowedInbound.includes(item.id)),
          }
        })
      : allNavSections.filter((group) => {
          if (isCallaoProfile && group.section === 'SCORECARD ALMACENES REMOTOS') return false
          if (role !== 'ADMINISTRADOR' && group.section === 'INBOUND · CALLAO') return false
          return true
        })

  const flatNav = navSections.flatMap((group) =>
    group.items.map((item) => ({ ...item, section: group.section }))
  )
  const currentNav = flatNav.find((item) => item.id === tab)
  const mobileHomeTab = 'inicio'
  const mobileWorkTab = flatNav.some((item) => item.id === 'mi-trabajo')
    ? 'mi-trabajo'
    : null
  const mobileIncidentTab = flatNav.some((item) => item.id === 'inbound-incidencias')
    ? 'inbound-incidencias'
    : flatNav.some((item) => item.id === 'incidencias')
      ? 'incidencias'
      : null
  const taskTabs = ['mi-trabajo', 'tareas', 'relevos', 'area-personal', 'lista', 'tablero', 'calendario'] as const
  const expirationTabs = ['vencimientos-emoa', 'vencimientos-cursos', 'vencimientos-licencias'] as const
  const isExpirationTab = expirationTabs.includes(tab as typeof expirationTabs[number])
  const expirationType =
    tab === 'vencimientos-cursos' ? 'CURSO' :
    tab === 'vencimientos-licencias' ? 'LICENCIA_INTERNA' :
    'EMOA'
  const inboundTabs = ['inbound-personal', 'inbound-tareas', 'inbound-incidencias', 'inbound-cajas', 'inbound-kardex'] as const
  const isInboundTab = inboundTabs.includes(tab as typeof inboundTabs[number])
  const isTaskTab = taskTabs.includes(tab as typeof taskTabs[number])
  const guideTabs = ['scanner-guias', 'seguimiento-guias'] as const
  const isGuideTab = guideTabs.includes(tab as typeof guideTabs[number])
  const guideMode =
    tab === 'scanner-guias' ? 'scanner' :
    'seguimiento'
  const isOcCargoTab = tab === 'oc-cargos'
  const isReplenishmentTab = tab === 'ingresos-reposicion'
  const isLocationSheetTab = tab === 'hoja-ubicacion'
  const materialTabs = ['materiales', 'master-materiales'] as const
  const isMaterialTab = materialTabs.includes(tab as typeof materialTabs[number])
  const materialMode =
    tab === 'master-materiales' ? 'master' :
    'consulta'
  const operationsControlTabs = ['os-prestamos', 'outbound', 'inventarios', 'transitos', 'danados', 'activos'] as const
  const isOperationsControlTab = operationsControlTabs.includes(tab as typeof operationsControlTabs[number])
  const operationsControlMode =
    tab === 'os-prestamos' ? 'prestamos' :
    tab === 'outbound' ? 'outbound' :
    tab === 'inventarios' ? 'inventarios' :
    tab === 'transitos' ? 'transitos' :
    tab === 'danados' ? 'danados' :
    'activos'
  const dashboardTabs = ['scorecard-carga', 'inbound-outbound', 'eri', 'sobrantes-faltantes', 'diferencias-inventario', 'danados-scorecard', 'dashboard-transitos', 'activos-inactivos', 'uca', 'ahorros', 'perfect-ship-outbound', 'perfect-ship-inbound', 'safe'] as const
  const isDashboardTab = dashboardTabs.includes(tab as typeof dashboardTabs[number])
  const adminTabs = ['proyectos', 'cargas-masivas', 'almacenes', 'categorias', 'metas-kpi', 'periodos', 'auditoria'] as const
  const isAdminModuleTab = adminTabs.includes(tab as typeof adminTabs[number])
  const isKardexTab = tab === 'kardex-sobrantes' || tab === 'inbound-kardex'

  useEffect(() => {
    const allowed = flatNav.map((item) => item.id)
    if (allowed.includes(tab)) return

    setTab('inicio')
  }, [tab, role, profile?.warehouse])

  useEffect(() => {
    if (!currentNav?.section) return
    setOpenSections((current) =>
      current.includes(currentNav.section)
        ? current
        : [...current, currentNav.section]
    )
  }, [currentNav?.section])

  function toggleNavSection(section: string) {
    setOpenSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section]
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">K</div>
          <div><b>KOMTROL</b><span>Control Operativo</span></div>
          <button className="icon-button mobile-only" onClick={() => setMobileMenu(false)}><X size={20} /></button>
        </div>

        <nav className="sidebar-nav">
          {navSections.map((group) => {
            const open = openSections.includes(group.section)
            const hasActiveItem = group.items.some((item) => item.id === tab)
            return (
              <div className={hasActiveItem ? 'nav-section active-section' : 'nav-section'} key={group.section}>
                <button
                  className="nav-section-toggle"
                  onClick={() => toggleNavSection(group.section)}
                  aria-expanded={open}
                >
                  <span>{group.section}</span>
                  {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                {open && (
                  <div className="nav-section-items">
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
                )}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="profile-mini">
            <div className="avatar">{displayName.charAt(0).toUpperCase()}</div>
            <div><b>{displayName}</b><span>{role}</span></div>
          </div>
          <button className="logout-button" onClick={logout}><LogOut size={17} /> Salir</button>
        </div>
      </aside>

      {mobileMenu && (
        <button
          className="mobile-menu-overlay"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMobileMenu(true)}><Menu size={22} /></button>
          <div>
            <h1>{currentNav?.label ?? 'KOMTROL'}</h1>
            <p>{displayName} · {role}{profile?.warehouse ? ` · ${profile.warehouse}` : ''}{profile?.group_name ? ` · ${profile.group_name}` : ''}{profile?.shift_name ? ` · ${profile.shift_name}` : ''}</p>
          </div>
          <div className="top-actions">
            <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={19} /></button>
            <div className="notification-center">
              <button
                className={unreadAppNotifications ? 'icon-button notification-bell has-unread' : 'icon-button notification-bell'}
                title="Notificaciones"
                onClick={() => { void toggleNotificationCenter() }}
              >
                <Bell size={19} />
                {unreadAppNotifications > 0 && <span>{unreadAppNotifications > 99 ? '99+' : unreadAppNotifications}</span>}
              </button>
              {notificationOpen && (
                <div className="notification-panel">
                  <div className="notification-panel-head">
                    <div><b>Notificaciones</b><span>{unreadAppNotifications} sin leer</span></div>
                    {unreadAppNotifications > 0 && <button onClick={markAllNotificationsRead}>Marcar todas</button>}
                  </div>
                  <div className="notification-panel-list">
                    {appNotifications.slice(0, 20).map((item) => (
                      <button
                        key={item.id}
                        className={item.read_at ? 'notification-item' : 'notification-item unread'}
                        onClick={() => openAppNotification(item)}
                      >
                        <i />
                        <div>
                          <b>{item.title}</b>
                          {item.message && <p>{item.message}</p>}
                          <span>{formatDate(item.created_at)}</span>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {!appNotifications.length && (
                      <div className="notification-empty"><Bell size={24} /><span>No tienes notificaciones.</span></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {profile && (
          <section className="user-greeting-sticky" aria-label="Saludo del usuario">
            <div className="user-greeting-inner">
              <span className="user-greeting-date"><i />{todayLabel(now)}</span>
              <div className="user-greeting-copy">
                <strong>{greetingForDate(now)}, <b>{firstName(displayName)}</b></strong>
                <small>{profile.warehouse || 'SIN ALMACÉN'}{profile.group_name ? ` · ${profile.group_name}` : ''}{profile.shift_name ? ` · ${profile.shift_name}` : ''}</small>
              </div>
            </div>
          </section>
        )}

        <div className="content">
          {loading ? (
            <div className="screen-center compact"><div className="loader" /><p>Cargando información…</p></div>
          ) : !profile ? (
            <section className="panel profile-access-blocked">
              <ShieldCheck size={34} />
              <h2>Perfil operativo no configurado</h2>
              <p>Tu cuenta existe, pero todavía no tiene un almacén, rol y grupo asignados. Por seguridad, KOMTROL no mostrará procesos hasta que un administrador configure el perfil.</p>
              <button className="secondary-button" onClick={logout}><LogOut size={16} /> Cerrar sesión</button>
            </section>
          ) : (
            <>
              {tab === 'inicio' && (
                <UniversalDashboardModule
                  userId={user.id}
                  profile={profile}
                  onNavigate={(targetTab) => {
                    const target = flatNav.find((item) => item.id === targetTab)
                    if (!target) {
                      setToast('Este indicador no está disponible para tu perfil.')
                      return
                    }
                    setTab(targetTab)
                    setOpenSections((current) =>
                      current.includes(target.section)
                        ? current
                        : [...current, target.section]
                    )
                    setMobileMenu(false)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                />
              )}

              {tab === 'incidencias' && (
                <ReceivingIncidentModule
                  userId={user.id}
                  profile={profile}
                  scopeMode="REMOTE"
                />
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

              {isInboundTab && tab === 'inbound-incidencias' && (
                <ReceivingIncidentModule
                  userId={user.id}
                  profile={profile}
                  scopeMode="CALLAO"
                />
              )}

              {isInboundTab && tab === 'inbound-cajas' && (
                <InboundModule mode="boxes" userId={user.id} profile={profile} />
              )}

              {isInboundTab && tab === 'inbound-kardex' && (
                <SurplusKardexModule userId={user.id} profile={profile} fixedWarehouse="CALLAO" />
              )}

              {isInboundTab && tab === 'inbound-personal' && (
                <TasksModule
                  mode="area-personal"
                  userId={user.id}
                  profile={profile}
                  scopeWarehouse="CALLAO"
                  scopeProject="INBOUND CALLAO"
                  scopeGroup="INBOUND"
                />
              )}

              {isInboundTab && tab === 'inbound-tareas' && (
                <TasksModule
                  mode="tareas"
                  userId={user.id}
                  profile={profile}
                  scopeWarehouse="CALLAO"
                  scopeProject="INBOUND CALLAO"
                  scopeGroup="INBOUND"
                />
              )}

              {isTaskTab && (
                <TasksModule
                  mode={tab as typeof taskTabs[number]}
                  userId={user.id}
                  profile={profile}
                  initialTaskId={taskToOpen}
                  onInitialTaskOpened={() => setTaskToOpen(null)}
                />
              )}

              {isExpirationTab && (
                <ExpirationsModule
                  type={expirationType}
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

              {isOcCargoTab && (
                <OcCargoTrackingModule
                  userId={user.id}
                  profile={profile}
                />
              )}

              {isReplenishmentTab && (
                <ReplenishmentModule />
              )}

              {isLocationSheetTab && (
                <LocationSheetsModule />
              )}

              {isMaterialTab && (
                <MaterialsModule
                  mode={materialMode}
                  userId={user.id}
                  isAdmin={role === 'ADMINISTRADOR'}
                />
              )}

              {tab === 'kardex-sobrantes' && (
                <SurplusKardexModule userId={user.id} profile={profile} />
              )}

              {isOperationsControlTab && (
                <OperationsControlModule
                  mode={operationsControlMode}
                  userId={user.id}
                  warehouse={profile?.warehouse}
                />
              )}

              {isDashboardTab && !isCallaoProfile && (
                <ScorecardRemoteModule
                  mode={tab as typeof dashboardTabs[number]}
                  userId={user.id}
                  role={role}
                  profile={profile}
                />
              )}

              {isAdminModuleTab && (
                <AdministrationModule
                  mode={tab as typeof adminTabs[number]}
                  userId={user.id}
                  isAdmin={role === 'ADMINISTRADOR'}
                />
              )}

              {tab === 'alertas' && (
                <AlertsModule />
              )}

              {tab === 'usuarios' && role === 'ADMINISTRADOR' && (
                <UsersAdmin />
              )}

              {!isTaskTab && !isExpirationTab && !isInboundTab && !isGuideTab && !isOcCargoTab && !isReplenishmentTab && !isLocationSheetTab && !isMaterialTab && !isOperationsControlTab && !isDashboardTab && !isAdminModuleTab && !isKardexTab && !['inicio', 'alertas', 'incidencias', 'correos', 'usuarios', 'configuracion'].includes(tab) && currentNav && (
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
                  {role === 'ADMINISTRADOR' && (
                    <IncidentEmailSettings userId={user.id} />
                  )}
                </section>
              )}
            </>
          )}
        </div>
        <nav className="mobile-bottom-nav" aria-label="Navegación rápida">
          <button
            className={tab === mobileHomeTab ? 'active' : ''}
            onClick={() => { setTab(mobileHomeTab); setMobileMenu(false) }}
          >
            <BarChart3 size={19} />
            <span>Inicio</span>
          </button>
          {mobileWorkTab && (
            <button
              className={tab === mobileWorkTab ? 'active' : ''}
              onClick={() => { setTab(mobileWorkTab); setMobileMenu(false) }}
            >
              <ClipboardList size={19} />
              <span>Trabajo</span>
            </button>
          )}
          {mobileIncidentTab && (
            <button
              className={tab === mobileIncidentTab ? 'active' : ''}
              onClick={() => { setTab(mobileIncidentTab); setMobileMenu(false) }}
            >
              <AlertTriangle size={19} />
              <span>Incidencias</span>
            </button>
          )}
          <button onClick={() => setMobileMenu(true)}>
            <Menu size={19} />
            <span>Menú</span>
          </button>
        </nav>
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
                  <option value="SOBRANTE">Sobrante</option>
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
