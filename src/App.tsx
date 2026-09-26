import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
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
  KeyRound,
  Mail,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Briefcase,
  Upload,
  Users,
  X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { UsersAdmin } from './components/UsersAdmin'
import { ModulePlaceholder } from './components/ModulePlaceholder'
import { TasksModule, type TasksMode } from './components/TasksModule'
import { GuidesModule } from './components/GuidesModule'
import { MaterialsModule } from './components/MaterialsModule'
import { OperationsControlModule } from './components/OperationsControlModule'
import { ScorecardRemoteModule } from './components/ScorecardRemoteModule'
import { AdministrationModule } from './components/AdministrationModule'
import { ReplenishmentModule } from './components/ReplenishmentModule'
import { LocationSheetsModule } from './components/LocationSheetsModule'
import { AlertsModule } from './components/AlertsModule'
import type { AlertItem } from './components/AlertsModule'
import { OcCargoTrackingModule } from './components/OcCargoTrackingModule'
import { InboundModule } from './components/InboundModule'
import { ReceivingIncidentModule } from './components/ReceivingIncidentModule'
import { IncidentEmailSettings } from './components/IncidentEmailSettings'
import { SurplusKardexModule } from './components/SurplusKardexModule'
import { ExpirationsModule } from './components/ExpirationsModule'
import { UniversalDashboardModule } from './components/UniversalDashboardModule'
import { CommercialDashboardModule, type CommercialOrderFilter } from './components/CommercialDashboardModule'

type Tab = string

type AccessView =
  | 'ACTUAL'
  | 'MI_PERFIL_OPERATIVO'
  | 'USUARIO'
  | 'SUPERVISOR_CALLAO'
  | 'SUPERVISOR_PROYECTO_MINERO'
  | 'COORDINADOR_PROYECTO_MINERO'
  | 'COORDINADOR_CALLAO'
  | 'ALMACENERO_PROYECTO_MINERO'
  | 'ALMACENERO_SUCURSAL'
  | 'ALMACENERO_CALLAO'
  | 'COMERCIAL'

type PreviewAccessConfig = {
  label: string
  shortLabel: string
  role: Profile['role']
  warehouse: string
  project: string
  position: string
  warehouse_scope: 'REMOTO' | 'CENTRAL'
  remote_group: 'PROYECTO_MINERO' | 'SUCURSAL' | 'TIENDA' | null
  group_name?: string | null
  shift_name?: string | null
  oc_cargo_access_level?: 'COMERCIAL' | 'DOCUMENTARIO' | null
}

type WarehouseMeta = {
  name: string
  code: string
  warehouse_scope: 'REMOTO' | 'CENTRAL'
  remote_group: 'PROYECTO_MINERO' | 'SUCURSAL' | 'TIENDA' | null
}

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
  position?: string | null
  worker_access?: boolean
  oc_cargo_access_level?: 'COMERCIAL' | 'DOCUMENTARIO' | null
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
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstAccess, setFirstAccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  function switchMode(next: boolean) {
    setFirstAccess(next)
    setPassword('')
    setConfirmPassword('')
    setMessage('')
    if (next) setIdentifier((value) => value.replace(/\D/g, '').slice(0, 8))
  }

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

    let email = value
    if (!isEmail) {
      const resolved = await supabase.functions.invoke('resolve-login-identifier', {
        body: { identifier: value },
      })

      const resolvedEmail = String(resolved.data?.email ?? '').trim().toLowerCase()
      if (resolved.error || !resolvedEmail) {
        setLoading(false)
        setMessage(
          isDni
            ? 'DNI o PIN incorrecto. Verifica los datos e intenta nuevamente.'
            : 'Usuario o contraseña incorrectos. Verifica los datos e intenta nuevamente.'
        )
        return
      }
      email = resolvedEmail
    }

    let { error } = await supabase.auth.signInWithPassword({
      email,
      password: password.trim(),
    })

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

  async function createFirstAccess(event: FormEvent) {
    event.preventDefault()
    setMessage('')

    const dni = identifier.replace(/\D/g, '').slice(0, 8)
    const pin = password.replace(/\D/g, '').slice(0, 8)

    if (!/^\d{8}$/.test(dni)) {
      setMessage('Ingresa tu DNI de 8 dígitos.')
      return
    }
    if (!/^\d{6,8}$/.test(pin)) {
      setMessage('Crea una clave de 6 a 8 dígitos.')
      return
    }
    if (pin !== confirmPassword) {
      setMessage('Las claves no coinciden.')
      return
    }

    setLoading(true)
    const email = loginEmail(dni)

    // 1) Nuevos usuarios preautorizados: crean su propia cuenta desde el padrón.
    const signUpAttempt = await supabase.auth.signUp({
      email,
      password: pin,
      options: {
        data: {
          self_first_access: true,
          dni,
        },
      },
    })

    if (signUpAttempt.data.session) {
      setLoading(false)
      return
    }

    // El trigger de Supabase confirma las cuentas internas aprobadas.
    const directLogin = await supabase.auth.signInWithPassword({ email, password: pin })
    if (!directLogin.error) {
      setLoading(false)
      return
    }

    // 2) Compatibilidad con usuarios que el Administrador precreó sin PIN.
    const activation = await supabase.functions.invoke('activate-first-access', {
      body: { dni, pin },
    })

    if (!activation.error && activation.data?.ok) {
      const finalLogin = await supabase.auth.signInWithPassword({ email, password: pin })
      setLoading(false)
      if (!finalLogin.error) return
      setMessage('La clave fue creada, pero no se pudo iniciar sesión. Intenta ingresar nuevamente.')
      return
    }

    setLoading(false)

    const signUpText = signUpAttempt.error?.message?.toLowerCase() ?? ''
    const activationMessage = activation.data?.error || ''
    if (/already|registered|exists/.test(signUpText) || activationMessage.includes('ya tiene')) {
      setMessage('Este DNI ya tiene una clave registrada. Usa la opción Ingresar.')
    } else if (activationMessage.includes('no está habilitado')) {
      setMessage('Tu DNI no está habilitado para ingresar a KOMTROL.')
    } else {
      setMessage('No se pudo crear la clave. Verifica que tu DNI esté habilitado por el Administrador.')
    }
  }

  return (
    <main className="login-page login-page-premium">
      <section className="login-brand login-brand-premium">
        <div className="login-brand-lockup">
          <img className="login-brand-logo" src="/icons/komtrol-mark.svg?v=brand3" alt="KOMTROL" />
          <div>
            <span className="login-brand-kicker">PLATAFORMA OPERATIVA</span>
            <strong>KOMTROL</strong>
          </div>
        </div>

        <div className="login-brand-message">
          <span className="login-brand-pill"><ShieldCheck size={15} /> CONTROL CENTRALIZADO</span>
          <h1>Todo tu almacén<br />en un solo lugar</h1>
          <p>
            Control operativo, trazabilidad y resultados con información organizada para dar continuidad a cada proceso.
          </p>
        </div>

        <div className="login-feature-grid login-feature-grid-premium">
          <div>
            <span className="login-feature-icon"><PackageCheck size={21} /></span>
            <span><b>Control centralizado</b><small>Operaciones y seguimiento</small></span>
          </div>
          <div>
            <span className="login-feature-icon"><Search size={21} /></span>
            <span><b>Trazabilidad operativa</b><small>Información de principio a fin</small></span>
          </div>
          <div>
            <span className="login-feature-icon"><BarChart3 size={21} /></span>
            <span><b>Información en tiempo real</b><small>Indicadores para actuar mejor</small></span>
          </div>
        </div>

        <div className="login-brand-footer">CONTROL · TRAZABILIDAD · RESULTADOS</div>
      </section>

      <section className="login-card-wrap login-card-wrap-premium">
        <form className="login-card login-card-premium" onSubmit={firstAccess ? createFirstAccess : submit}>
          <div className="login-card-brand">
            <img className="login-card-logo" src="/icons/komtrol-mark.svg?v=brand3" alt="KOMTROL" />
            <span>KOMTROL</span>
          </div>

          <div className="login-card-heading">
            <span className="login-card-kicker">{firstAccess ? 'PRIMER ACCESO' : 'ACCESO SEGURO'}</span>
            <h2>{firstAccess ? 'Crea tu clave personal' : 'Bienvenido a KOMTROL'}</h2>
            <p>
              {firstAccess
                ? 'Ingresa tu DNI y crea una clave de 6 a 8 dígitos para activar tu acceso.'
                : 'Ingresa con tu usuario KOMTROL en formato primerNombre.primerApellido.'}
            </p>
          </div>

          <div className="login-form-fields">
            <label>
              {firstAccess ? 'DNI' : 'Usuario KOMTROL'}
              <input
                type="text"
                inputMode={firstAccess ? 'numeric' : undefined}
                autoComplete="username"
                maxLength={firstAccess ? 8 : undefined}
                placeholder={firstAccess ? 'Ej.: 12345678' : 'Ej.: hector.delgado'}
                value={identifier}
                onChange={(e) => setIdentifier(firstAccess ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value)}
              />
            </label>

            <label>
              {firstAccess ? 'Nueva clave (6 a 8 dígitos)' : 'PIN o contraseña'}
              <input
                type="password"
                inputMode={firstAccess ? 'numeric' : undefined}
                autoComplete={firstAccess ? 'new-password' : 'current-password'}
                maxLength={firstAccess ? 8 : undefined}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(firstAccess ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value)}
              />
            </label>

            {firstAccess && (
              <label>
                Confirmar clave
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 8))}
                />
              </label>
            )}
          </div>

          {message && <div className="form-alert login-form-alert">{message}</div>}

          <div className="login-actions">
            <button className="primary-button full login-primary-button" disabled={loading}>
              {loading ? <RefreshCw className="spin" size={18} /> : <ShieldCheck size={18} />}
              {loading
                ? (firstAccess ? 'Creando clave…' : 'Validando…')
                : (firstAccess ? 'Crear clave e ingresar' : 'Ingresar')}
            </button>

            <button
              type="button"
              className="secondary-button full login-secondary-button"
              disabled={loading}
              onClick={() => switchMode(!firstAccess)}
            >
              {firstAccess ? 'Volver a ingresar' : 'Primera vez: crear mi clave'}
            </button>
          </div>

          <div className="login-security-note">
            <ShieldCheck size={15} />
            <span>Acceso exclusivo para personal autorizado</span>
          </div>
        </form>
      </section>
    </main>
  )
}

type ScreenProfile = 'mobile' | 'tablet' | 'laptop' | 'monitor' | 'wide'

function detectScreenProfile(width: number): ScreenProfile {
  if (width < 640) return 'mobile'
  if (width < 1024) return 'tablet'
  if (width < 1600) return 'laptop'
  if (width < 2200) return 'monitor'
  return 'wide'
}

function screenProfileLabel(profile: ScreenProfile) {
  return ({
    mobile: 'Móvil',
    tablet: 'Tablet',
    laptop: 'Laptop',
    monitor: 'Monitor',
    wide: 'Monitor amplio',
  } as const)[profile]
}

function Workspace({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('inicio')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [openSections, setOpenSections] = useState<string[]>(['INICIO'])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accessProfiles,setAccessProfiles]=useState<Profile[]>([])
  const [selectedAccessUserId,setSelectedAccessUserId]=useState<string|null>(null)
  const [warehouseCatalog, setWarehouseCatalog] = useState<WarehouseMeta[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([])
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [taskToOpen, setTaskToOpen] = useState<string | null>(null)
  const [dashboardTaskStatus, setDashboardTaskStatus] = useState<'TODOS'|'PENDIENTE'|'EN_PROCESO'|'BLOQUEADO'|'CERRADO'|'VENCIDA'|null>(null)
  const [commercialOrderFilter,setCommercialOrderFilter]=useState<CommercialOrderFilter>('TODOS')
  const [commentToOpen, setCommentToOpen] = useState<string | null>(null)
  const [popNotification, setPopNotification] = useState<AppNotification | null>(null)
  const knownNotificationIds = useRef(new Set<string>())
  const notificationsLoaded = useRef(false)
  const [alertIncidentToOpen, setAlertIncidentToOpen] = useState<string | null>(null)
  const [alertGuideSearch, setAlertGuideSearch] = useState<string | null>(null)
  const [alertOperationSearch, setAlertOperationSearch] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [accessView, setAccessView] = useState<AccessView>('ACTUAL')
  const [now, setNow] = useState(() => new Date())
  const [viewport, setViewport] = useState(() => {
    const width = typeof window === 'undefined' ? 1440 : window.innerWidth
    const height = typeof window === 'undefined' ? 900 : window.innerHeight
    return { width, height, profile: detectScreenProfile(width) }
  })

  useEffect(() => {
    let frame = 0
    const syncViewport = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const width = window.innerWidth
        const height = window.innerHeight
        const profile = detectScreenProfile(width)
        const density = height < 820 ? 'compact' : height < 980 ? 'balanced' : 'comfortable'

        document.documentElement.dataset.screenProfile = profile
        document.documentElement.dataset.screenDensity = density
        document.documentElement.style.setProperty('--kt-viewport-width', `${width}px`)
        document.documentElement.style.setProperty('--kt-viewport-height', `${height}px`)
        setViewport({ width, height, profile })
      })
    }

    syncViewport()
    window.addEventListener('resize', syncViewport, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', syncViewport)
    }
  }, [])

  const user = session.user
  const actualRole = profile?.role ?? (user.app_metadata?.role as Profile['role'] | undefined) ?? 'TRABAJADOR'
  const canPreviewSystemViews = actualRole === 'ADMINISTRADOR'
  const selectedAccessUser=selectedAccessUserId
    ? accessProfiles.find((item)=>item.user_id===selectedAccessUserId) || null
    : null
  const warehouseMetaFor=(warehouse?:string|null)=>warehouseCatalog.find((item)=>
    item.name.toUpperCase()===String(warehouse||'').toUpperCase() ||
    item.code.toUpperCase()===String(warehouse||'').toUpperCase()
  )
  const profileWarehouseMeta=warehouseMetaFor(profile?.warehouse)
  const selectedWarehouseMeta=warehouseMetaFor(selectedAccessUser?.warehouse)

  const previewAccess: PreviewAccessConfig | null =
    accessView === 'ACTUAL'
      ? null
      : accessView === 'MI_PERFIL_OPERATIVO'
        ? {
            label: 'Mi perfil operativo',
            shortLabel: 'Almacenero Proyecto Minero',
            role: 'TRABAJADOR',
            warehouse: profile?.warehouse || 'ANTAMINA',
            project: profile?.project || 'PROYECTO MINERO',
            position: profile?.warehouse?.toUpperCase()==='CALLAO' ? 'ALMACENERO CALLAO' : 'ALMACENERO DE PROYECTO MINERO',
            warehouse_scope: profileWarehouseMeta?.warehouse_scope || (profile?.warehouse?.toUpperCase()==='CALLAO' ? 'CENTRAL' : 'REMOTO'),
            remote_group: profileWarehouseMeta?.remote_group || (profile?.warehouse?.toUpperCase()==='CALLAO' ? null : 'PROYECTO_MINERO'),
            group_name: profile?.group_name || null,
            shift_name: profile?.shift_name || null,
            oc_cargo_access_level: null,
          }
        : accessView === 'USUARIO' && selectedAccessUser
          ? {
              label: selectedAccessUser.full_name,
              shortLabel: selectedAccessUser.full_name.split(' ').slice(0,2).join(' '),
              role: selectedAccessUser.role,
              warehouse: selectedAccessUser.warehouse || 'SIN ALMACÉN',
              project: selectedAccessUser.project || selectedAccessUser.warehouse || 'SIN PROYECTO',
              position: selectedAccessUser.position || selectedAccessUser.role,
              warehouse_scope: selectedWarehouseMeta?.warehouse_scope || (selectedAccessUser.warehouse?.toUpperCase()==='CALLAO' ? 'CENTRAL' : 'REMOTO'),
              remote_group: selectedWarehouseMeta?.remote_group || (selectedAccessUser.warehouse?.toUpperCase()==='CALLAO' ? null : 'PROYECTO_MINERO'),
              group_name: selectedAccessUser.group_name || null,
              shift_name: selectedAccessUser.shift_name || null,
              oc_cargo_access_level: selectedAccessUser.oc_cargo_access_level || null,
            }
          : ({
        SUPERVISOR_CALLAO: {
          label: 'Supervisor Almacén Callao',
          shortLabel: 'Supervisor Callao',
          role: 'SUPERVISOR',
          warehouse: 'CALLAO',
          project: 'CALLAO',
          position: 'SUPERVISOR DE ALMACÉN',
          warehouse_scope: 'CENTRAL',
          remote_group: null,
        },
        SUPERVISOR_PROYECTO_MINERO: {
          label: 'Supervisor Almacén Proyecto Minero',
          shortLabel: 'Supervisor Proyecto Minero',
          role: 'SUPERVISOR',
          warehouse: 'ANTAMINA',
          project: 'PROYECTO MINERO',
          position: 'SUPERVISOR DE ALMACÉN',
          warehouse_scope: 'REMOTO',
          remote_group: 'PROYECTO_MINERO',
        },
        COORDINADOR_PROYECTO_MINERO: {
          label: 'Coordinador de Almacén Proyecto Minero',
          shortLabel: 'Coordinador Proyecto Minero',
          role: 'COORDINADOR',
          warehouse: 'ANTAMINA',
          project: 'PROYECTO MINERO',
          position: 'COORDINADOR DE ALMACÉN',
          warehouse_scope: 'REMOTO',
          remote_group: 'PROYECTO_MINERO',
        },
        COORDINADOR_CALLAO: {
          label: 'Coordinador de Almacén Callao',
          shortLabel: 'Coordinador Callao',
          role: 'COORDINADOR',
          warehouse: 'CALLAO',
          project: 'CALLAO',
          position: 'COORDINADOR DE ALMACÉN',
          warehouse_scope: 'CENTRAL',
          remote_group: null,
        },
        ALMACENERO_PROYECTO_MINERO: {
          label: 'Almacenero de Proyecto Minero',
          shortLabel: 'Almacenero Proyecto Minero',
          role: 'TRABAJADOR',
          warehouse: 'ANTAMINA',
          project: 'PROYECTO MINERO',
          position: 'ALMACENERO',
          warehouse_scope: 'REMOTO',
          remote_group: 'PROYECTO_MINERO',
        },
        ALMACENERO_SUCURSAL: {
          label: 'Almacenero de Sucursales',
          shortLabel: 'Almacenero Sucursales',
          role: 'COORDINADOR',
          warehouse: 'SUCURSAL',
          project: 'SUCURSAL',
          position: 'ALMACENERO DE SUCURSAL',
          warehouse_scope: 'REMOTO',
          remote_group: 'SUCURSAL',
        },
        ALMACENERO_CALLAO: {
          label: 'Almacenero Callao',
          shortLabel: 'Almacenero Callao',
          role: 'TRABAJADOR',
          warehouse: 'CALLAO',
          project: 'CALLAO',
          position: 'ALMACENERO',
          warehouse_scope: 'CENTRAL',
          remote_group: null,
        },
        COMERCIAL: {
          label: 'Área Comercial',
          shortLabel: 'Comercial',
          role: 'TRABAJADOR',
          warehouse: 'COMERCIAL',
          project: 'COMERCIAL',
          position: 'ÁREA COMERCIAL',
          warehouse_scope: 'REMOTO',
          remote_group: null,
          group_name: 'COMERCIAL',
          shift_name: null,
          oc_cargo_access_level: 'COMERCIAL',
        },
      } as Record<Exclude<AccessView, 'ACTUAL' | 'MI_PERFIL_OPERATIVO' | 'USUARIO'>, PreviewAccessConfig>)[accessView as Exclude<AccessView, 'ACTUAL' | 'MI_PERFIL_OPERATIVO' | 'USUARIO'>]

  const isAccessPreview = Boolean(previewAccess)
  const isOperationalWorkerMode = accessView === 'MI_PERFIL_OPERATIVO' && actualRole === 'ADMINISTRADOR'
  const isReadOnlyAccessPreview = isAccessPreview && !isOperationalWorkerMode
  const role: Profile['role'] = previewAccess?.role ?? actualRole
  const effectiveProfile: Profile | null = profile
    ? {
        ...profile,
        user_id: accessView === 'USUARIO' && selectedAccessUser ? selectedAccessUser.user_id : profile.user_id,
        full_name: accessView === 'USUARIO' && selectedAccessUser ? selectedAccessUser.full_name : profile.full_name,
        role,
        warehouse: previewAccess?.warehouse ?? profile.warehouse,
        project: previewAccess?.project ?? profile.project,
        position: previewAccess?.position ?? profile.position,
        group_name: previewAccess?.group_name ?? profile.group_name,
        shift_name: previewAccess?.shift_name ?? profile.shift_name,
        oc_cargo_access_level: previewAccess?.oc_cargo_access_level ?? profile.oc_cargo_access_level,
      }
    : null
  const displayName = profile?.full_name ?? user.user_metadata?.full_name ?? 'Usuario KOMTROL'

  async function reload() {
    setLoading(true)
    const [profileRes, accessProfilesRes, warehouseRes, incidentsRes, notificationsRes, appNotificationRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_profiles').select('*').order('full_name'),
      supabase.from('warehouses').select('name,code,warehouse_scope,remote_group').eq('active',true).order('name'),
      supabase.from('incidents').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('email_notifications').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('app_notifications').select('*').order('created_at', { ascending: false }).limit(100),
    ])

    if (profileRes.data) setProfile(profileRes.data as Profile)
    setAccessProfiles((accessProfilesRes.data ?? []) as Profile[])
    setWarehouseCatalog((warehouseRes.data ?? []) as WarehouseMeta[])
    setIncidents((incidentsRes.data ?? []) as Incident[])
    setNotifications((notificationsRes.data ?? []) as Notification[])
    const currentNotifications = (appNotificationRes.data ?? []) as AppNotification[]
    setAppNotifications(currentNotifications)
    currentNotifications.forEach((item) => knownNotificationIds.current.add(item.id))
    notificationsLoaded.current = true
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [user.id])

  useEffect(() => {
    if (!canPreviewSystemViews && accessView !== 'ACTUAL') {
      setAccessView('ACTUAL')
    }
  }, [canPreviewSystemViews, accessView])

  function changeAccessView(next: AccessView) {
    if (next !== 'ACTUAL' && !canPreviewSystemViews) return
    if(next!=='USUARIO') setSelectedAccessUserId(null)
    setAccessView(next)
    setTab('inicio')
    setOpenSections(['INICIO'])
    setMobileMenu(false)
    setNotificationOpen(false)
    setTaskToOpen(null)
    setDashboardTaskStatus(null)
    setCommercialOrderFilter('TODOS')
    const nextLabel = next === 'ACTUAL'
      ? 'Administrador'
      : next === 'MI_PERFIL_OPERATIVO'
        ? 'Mi perfil operativo · Almacenero Proyecto Minero'
        : next === 'USUARIO'
          ? (selectedAccessUser?.full_name || 'Usuario')
          : ({
          SUPERVISOR_CALLAO: 'Supervisor Almacén Callao',
          SUPERVISOR_PROYECTO_MINERO: 'Supervisor Almacén Proyecto Minero',
          COORDINADOR_PROYECTO_MINERO: 'Coordinador de Almacén Proyecto Minero',
          COORDINADOR_CALLAO: 'Coordinador de Almacén Callao',
          ALMACENERO_PROYECTO_MINERO: 'Almacenero de Proyecto Minero',
          ALMACENERO_SUCURSAL: 'Almacenero de Sucursales',
          ALMACENERO_CALLAO: 'Almacenero Callao',
          COMERCIAL: 'Área Comercial',
        } as Record<Exclude<AccessView, 'ACTUAL' | 'MI_PERFIL_OPERATIVO' | 'USUARIO'>, string>)[next as Exclude<AccessView, 'ACTUAL' | 'MI_PERFIL_OPERATIVO' | 'USUARIO'>]
    setToast(next === 'ACTUAL'
      ? 'Vista Administrador restaurada.'
      : 'Vista ' + nextLabel + ' activada. Tu rol real sigue siendo Administrador.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function changeAccessSelection(value:string){
    if(value.startsWith('USER:')){
      const userId=value.slice(5)
      const target=accessProfiles.find((item)=>item.user_id===userId)
      if(!target) return
      setSelectedAccessUserId(userId)
      setAccessView('USUARIO')
      setTab('inicio')
      setOpenSections(['INICIO'])
      setMobileMenu(false)
      setNotificationOpen(false)
      setTaskToOpen(null)
      setDashboardTaskStatus(null)
      setCommercialOrderFilter('TODOS')
      setToast(`Vista de ${target.full_name} activada. Solo simula permisos y alcance; no abre sus tareas personales privadas.`)
      window.scrollTo({top:0,behavior:'smooth'})
      return
    }
    changeAccessView(value as AccessView)
  }

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
      if (data) {
        const current = data as AppNotification[]
        if (notificationsLoaded.current) {
          const newest = current.find((item) => !knownNotificationIds.current.has(item.id) && !item.read_at)
          if (newest) setPopNotification(newest)
        }
        current.forEach((item) => knownNotificationIds.current.add(item.id))
        notificationsLoaded.current = true
        setAppNotifications(current)
      }
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
          if (!knownNotificationIds.current.has(item.id)) setPopNotification(item)
          knownNotificationIds.current.add(item.id)
          setAppNotifications((current) => [item, ...current.filter((row) => row.id !== item.id)].slice(0, 100))

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
    setPopNotification(null)

    if (item.task_id) {
      const { data: task, error } = await supabase.from('tasks').select('id,work_type').eq('id', item.task_id).maybeSingle()
      if (error || !task) {
        setToast('La tarea de esta notificación ya no está disponible.')
        return
      }
      setDashboardTaskStatus(null)
      setTaskToOpen(item.task_id)
      setCommentToOpen(typeof item.metadata?.comment_id === 'string' ? item.metadata.comment_id : null)
      setTab(task.work_type === 'RELEVO' ? 'relevos' : task.work_type === 'PERSONAL' ? 'mi-trabajo' : 'tareas')
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

  async function updateOwnPassword(event: FormEvent) {
    event.preventDefault()
    setPasswordMessage('')

    if (!/^\d{6,8}$/.test(newPassword)) {
      setPasswordMessage('La nueva clave debe tener de 6 a 8 dígitos.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage('Las claves no coinciden.')
      return
    }

    setPasswordSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)

    if (error) {
      setPasswordMessage(`No se pudo cambiar la clave: ${error.message}`)
      return
    }

    setNewPassword('')
    setConfirmNewPassword('')
    setPasswordModalOpen(false)
    setToast('Clave actualizada correctamente.')
  }

  const allNavSections = [
    {
      section: 'INICIO',
      items: [
        { id: 'inicio' as Tab, label: (profile?.oc_cargo_access_level === 'COMERCIAL' || accessView === 'COMERCIAL') ? 'Inicio' : 'Dashboard', icon: BarChart3 },
        { id: 'alertas' as Tab, label: 'Alertas', icon: Bell },
      ],
    },
    {
      section: 'ÁREA DE TRABAJO',
      items: [
        { id: 'mi-trabajo' as Tab, label: 'Mis trabajos', icon: ClipboardList },
        ...(role === 'ADMINISTRADOR'
          ? [{ id: 'tareas-globales' as Tab, label: 'Tareas globales', icon: BarChart3 }]
          : []),
        { id: 'tareas' as Tab, label: 'Tareas grupales', icon: Users },
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
    ...((effectiveProfile?.warehouse === 'CALLAO' || role === 'ADMINISTRADOR')
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
        { id: 'ordenes-compra' as Tab, label: 'Órdenes de Compra', icon: ShoppingCart },
        { id: 'cargos-directos' as Tab, label: 'Cargos Directos', icon: ClipboardList },
        { id: 'os-prestamos' as Tab, label: 'OS / Préstamos', icon: Boxes },
        { id: 'outbound' as Tab, label: 'Consumos / Outbound', icon: Send },
        { id: 'hoja-ubicacion' as Tab, label: 'Hojas de Ubicación', icon: ClipboardList },
        { id: 'incidencias' as Tab, label: 'Incidencias', icon: AlertTriangle },
      ],
    },
    ...((effectiveProfile?.oc_cargo_access_level === 'COMERCIAL' || accessView === 'COMERCIAL' || role === 'ADMINISTRADOR')
      ? [{
          section: 'COMERCIAL',
          collapsible: true,
          items: [
            ...(role === 'ADMINISTRADOR'
              ? [{ id: 'comercial-resumen' as Tab, label: 'Resumen Comercial', icon: BarChart3 }]
              : []),
            { id: 'comercial-ordenes-compra' as Tab, label: 'Órdenes de Compra', icon: Briefcase },
          ],
        }]
      : []),
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
        ...(role === 'ADMINISTRADOR'
          ? [{ id: 'configuracion' as Tab, label: 'Configuración', icon: Settings }]
          : []),
      ],
    },
  ]

  const effectiveWarehouseMeta = warehouseCatalog.find((item)=>
    item.name.toUpperCase() === effectiveProfile?.warehouse?.toUpperCase() ||
    item.code.toUpperCase() === effectiveProfile?.warehouse?.toUpperCase()
  )
  const effectiveWarehouseScope = previewAccess?.warehouse_scope ?? effectiveWarehouseMeta?.warehouse_scope ?? null
  const effectiveRemoteGroup = previewAccess?.remote_group ?? effectiveWarehouseMeta?.remote_group ?? null
  const isDistributionCenter = effectiveWarehouseScope === 'CENTRAL'
  const canViewRemoteScorecards = role === 'ADMINISTRADOR' ||
    (!isDistributionCenter && (
      effectiveRemoteGroup === 'PROYECTO_MINERO' ||
      effectiveRemoteGroup === 'SUCURSAL' ||
      effectiveRemoteGroup === 'TIENDA'
    ))

  const isCallaoProfile = effectiveProfile?.warehouse?.toUpperCase() === 'CALLAO'
  const isCallaoUser = isCallaoProfile && role !== 'ADMINISTRADOR'
  const isCallaoCoordinator = role === 'COORDINADOR' && effectiveProfile?.warehouse === 'CALLAO'
  const isCallaoSupervisor = role === 'SUPERVISOR' && effectiveProfile?.warehouse === 'CALLAO'
  const isCallaoWorker = role === 'TRABAJADOR' && effectiveProfile?.warehouse === 'CALLAO'
  const hasOcCargoSpecialAccess = Boolean(effectiveProfile?.oc_cargo_access_level)
  const isCommercialArea =
    accessView === 'COMERCIAL' ||
    (effectiveProfile?.oc_cargo_access_level === 'COMERCIAL' && role !== 'ADMINISTRADOR')

  const universalSections = ['INICIO', 'ÁREA DE TRABAJO', 'VENCIMIENTOS']

  const navSections = !profile
    ? []
    : isCommercialArea
      ? allNavSections
        .filter((group) => ['INICIO', 'ÁREA DE TRABAJO', 'COMERCIAL'].includes(group.section))
        .map((group) => {
          if (group.section !== 'INICIO') return group
          return { ...group, items: group.items.filter((item) => item.id === 'inicio') }
        })
    : isCallaoUser
      ? allNavSections
        .filter((group) => universalSections.includes(group.section) || group.section === 'INBOUND · CALLAO' || (hasOcCargoSpecialAccess && group.section === 'OPERACIONES'))
        .map((group) => {
          if (group.section === 'OPERACIONES' && hasOcCargoSpecialAccess) {
            return {
              ...group,
              items: group.items.filter((item) => ['ordenes-compra', 'cargos-directos'].includes(item.id)),
            }
          }
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
          if (!canViewRemoteScorecards && group.section === 'SCORECARD ALMACENES REMOTOS') return false
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
  const taskTabs = ['mi-trabajo', 'tareas-globales', 'tareas', 'relevos', 'area-personal', 'lista', 'tablero', 'calendario'] as const
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
  const operationalOcTabs = ['ordenes-compra', 'cargos-directos'] as const
  const isOcCargoTab = operationalOcTabs.includes(tab as typeof operationalOcTabs[number])
  const operationalOcType =
    tab === 'cargos-directos' ? 'CARGO_DIRECTO' as const : 'ORDEN_COMPRA' as const
  const isCommercialSummaryTab = tab === 'comercial-resumen'
  const isCommercialOrdersTab = tab === 'comercial-ordenes-compra'
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
  }, [tab, role, effectiveProfile?.warehouse, effectiveProfile?.oc_cargo_access_level, selectedAccessUserId])

  useEffect(() => {
    if (!currentNav?.section) return
    setOpenSections((current) =>
      current.includes(currentNav.section)
        ? current
        : [...current, currentNav.section]
    )
  }, [currentNav?.section])

  function openAlertTreatment(item: AlertItem) {
    let targetTab: Tab | null = null

    setAlertIncidentToOpen(null)
    setAlertGuideSearch(null)
    setAlertOperationSearch(null)

    if (item.source === 'TAREA') {
      targetTab = 'mi-trabajo'
      setTaskToOpen(item.entityId)
    } else if (item.source === 'INCIDENCIA') {
      targetTab = item.operationArea === 'INBOUND' || item.warehouse?.toUpperCase() === 'CALLAO'
        ? 'inbound-incidencias'
        : 'incidencias'
      setAlertIncidentToOpen(item.entityId)
    } else if (item.source === 'GUÍA') {
      targetTab = 'seguimiento-guias'
      setAlertGuideSearch(item.reference || item.entityId)
    } else if (item.source === 'TRÁNSITO') {
      targetTab = 'transitos'
      setAlertOperationSearch(item.reference || item.entityId)
    } else if (item.source === 'PRÉSTAMO') {
      targetTab = 'os-prestamos'
      setAlertOperationSearch(item.reference || item.entityId)
    } else if (item.source === 'DAÑADO') {
      targetTab = 'danados'
      setAlertOperationSearch(item.reference || item.entityId)
    }

    if (!targetTab) {
      setToast('No se encontró un tratamiento asociado a esta alerta.')
      return
    }

    const target = flatNav.find((navItem) => navItem.id === targetTab)
    if (!target) {
      setToast('El tratamiento de esta alerta no está disponible para el perfil actual.')
      return
    }

    setTab(targetTab)
    setOpenSections((current) =>
      current.includes(target.section)
        ? current
        : [...current, target.section]
    )
    setNotificationOpen(false)
    setMobileMenu(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
          <img className="sidebar-brand-logo" src="/icons/komtrol-mark.svg?v=brand3" alt="KOMTROL" />
          <div><b>KOMTROL</b><span>Control Operativo</span></div>
          <button className="icon-button mobile-only" onClick={() => setMobileMenu(false)}><X size={20} /></button>
        </div>

        <div className="sidebar-scroll-area">
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
                        onClick={() => {
                          setDashboardTaskStatus(null)
                          if (id === 'comercial-ordenes-compra' || id === 'ordenes-compra' || id === 'cargos-directos') setCommercialOrderFilter('TODOS')
                          setTab(id)
                          setMobileMenu(false)
                        }}
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
          {canPreviewSystemViews && (
            <div className="access-view-switcher">
              <div className="access-view-head">
                <span>VISTA DEL SISTEMA</span>
                <small>Rol real: Administrador</small>
              </div>

              <button
                type="button"
                className={isOperationalWorkerMode ? 'operational-mode-button active' : 'operational-mode-button'}
                onClick={() => changeAccessView(isOperationalWorkerMode ? 'ACTUAL' : 'MI_PERFIL_OPERATIVO')}
              >
                <ClipboardList size={16} />
                <span>
                  <b>{isOperationalWorkerMode ? 'Volver a Administrador' : 'Trabajar como Almacenero'}</b>
                  <small>{isOperationalWorkerMode ? 'Regresa al acceso completo del sistema' : 'Modo operativo · permite registrar y editar datos'}</small>
                </span>
                <ChevronRight size={15} />
              </button>

              <div className="access-view-select-wrap">
                <ShieldCheck size={14} />
                <select
                  aria-label="Seleccionar vista del sistema"
                  value={accessView==='USUARIO'&&selectedAccessUserId ? `USER:${selectedAccessUserId}` : accessView}
                  onChange={(event)=>changeAccessSelection(event.target.value)}
                >
                  <optgroup label="MIS ACCESOS">
                    <option value="ACTUAL">Administrador · acceso completo</option>
                    <option value="MI_PERFIL_OPERATIVO">Mi perfil operativo · Almacenero Proyecto Minero</option>
                  </optgroup>

                  {accessProfiles.some((item)=>item.user_id!==user.id&&item.warehouse?.toUpperCase()!=='CALLAO'&&item.oc_cargo_access_level!=='COMERCIAL')&&(
                    <optgroup label="USUARIOS · PROYECTO MINERO">
                      {accessProfiles
                        .filter((item)=>item.user_id!==user.id&&item.warehouse?.toUpperCase()!=='CALLAO'&&item.oc_cargo_access_level!=='COMERCIAL')
                        .map((item)=><option key={item.user_id} value={`USER:${item.user_id}`}>{item.full_name} · {item.role}{item.active === false ? ' · INACTIVO' : ''}</option>)}
                    </optgroup>
                  )}

                  {accessProfiles.some((item)=>item.user_id!==user.id&&item.warehouse?.toUpperCase()==='CALLAO')&&(
                    <optgroup label="USUARIOS · CALLAO">
                      {accessProfiles
                        .filter((item)=>item.user_id!==user.id&&item.warehouse?.toUpperCase()==='CALLAO')
                        .map((item)=><option key={item.user_id} value={`USER:${item.user_id}`}>{item.full_name} · {item.role}{item.active === false ? ' · INACTIVO' : ''}</option>)}
                    </optgroup>
                  )}

                  {accessProfiles.some((item)=>item.user_id!==user.id&&item.oc_cargo_access_level==='COMERCIAL')&&(
                    <optgroup label="USUARIOS · COMERCIAL">
                      {accessProfiles
                        .filter((item)=>item.user_id!==user.id&&item.oc_cargo_access_level==='COMERCIAL')
                        .map((item)=><option key={item.user_id} value={`USER:${item.user_id}`}>{item.full_name} · Comercial{item.active === false ? ' · INACTIVO' : ''}</option>)}
                    </optgroup>
                  )}

                  <optgroup label="VISTAS DE REFERENCIA · CALLAO">
                    <option value="SUPERVISOR_CALLAO">Supervisor Almacén Callao</option>
                    <option value="COORDINADOR_CALLAO">Coordinador de Almacén Callao</option>
                    <option value="ALMACENERO_CALLAO">Almacenero Callao</option>
                  </optgroup>
                  <optgroup label="VISTAS DE REFERENCIA · PROYECTO MINERO">
                    <option value="SUPERVISOR_PROYECTO_MINERO">Supervisor Almacén Proyecto Minero</option>
                    <option value="COORDINADOR_PROYECTO_MINERO">Coordinador de Almacén Proyecto Minero</option>
                    <option value="ALMACENERO_PROYECTO_MINERO">Almacenero de Proyecto Minero</option>
                  </optgroup>
                  <optgroup label="VISTAS DE REFERENCIA · OTROS">
                    <option value="ALMACENERO_SUCURSAL">Almacenero de Sucursales</option>
                    <option value="COMERCIAL">Área Comercial</option>
                  </optgroup>
                </select>
                <ChevronDown size={13} />
              </div>

              <div className={isAccessPreview ? 'access-view-current is-preview' : 'access-view-current'}>
                <span className="access-view-current-icon">
                  {previewAccess?.role === 'TRABAJADOR' ? <ClipboardList size={14}/> : previewAccess?.role === 'COORDINADOR' ? <Users size={14}/> : <ShieldCheck size={14}/>} 
                </span>
                <div>
                  <b>{previewAccess?.shortLabel || 'Administrador'}</b>
                  <small>{previewAccess
                    ? (accessView === 'COMERCIAL'
                        ? 'Dashboard · Área de Trabajo · Órdenes de Compra'
                        : accessView === 'MI_PERFIL_OPERATIVO'
                          ? `${previewAccess.warehouse} · ${profile?.group_name || 'OPERACIÓN'} · ${profile?.shift_name || 'SIN GUARDIA'}`
                          : accessView === 'USUARIO'
                            ? `Vista de usuario · ${previewAccess.role} · ${previewAccess.warehouse}${previewAccess.shift_name ? ' · ' + previewAccess.shift_name : ''}`
                            : previewAccess.warehouse + ' · ' + previewAccess.role)
                    : 'Acceso completo del sistema'}</small>
                </div>
              </div>

              <div className="access-org-path">
                <small>ORGANIGRAMA DE ACCESO</small>
                <span>Administrador <ChevronRight size={10}/> {previewAccess?.warehouse || 'Sistema'} <ChevronRight size={10}/> {previewAccess?.role || 'Administrador'}{accessView==='USUARIO'&&selectedAccessUser ? <><ChevronRight size={10}/>{selectedAccessUser.full_name.split(' ').slice(0,2).join(' ')}</> : null}</span>
              </div>

              {isAccessPreview && (
                <div className={isOperationalWorkerMode ? 'access-preview-note operational' : 'access-preview-note'}>
                  {isOperationalWorkerMode
                    ? 'Modo operativo activo. Puedes registrar, editar y completar información como Almacenero de Proyecto Minero usando tu propia cuenta.'
                    : 'Vista de prueba activa. No cambia tu rol real de Administrador.'}
                </div>
              )}
            </div>
          )}
          <div className="profile-mini">
            <div className="avatar">{displayName.charAt(0).toUpperCase()}</div>
            <div>
              <b>{displayName}</b>
              <span>{isOperationalWorkerMode ? `${previewAccess?.shortLabel || role} · MODO OPERATIVO` : isAccessPreview ? `${previewAccess?.shortLabel || role} · VISTA DE PRUEBA` : role}</span>
            </div>
          </div>
          <button
            type="button"
            className="account-action-button"
            onClick={() => {
              setNewPassword('')
              setConfirmNewPassword('')
              setPasswordMessage('')
              setPasswordModalOpen(true)
            }}
          >
            <KeyRound size={17} /> Cambiar clave
          </button>
          <button className="logout-button" onClick={logout}><LogOut size={17} /> Salir</button>
        </div>
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
          <div className="topbar-title-block">
            <div className="topbar-title-line">
              <h1>{currentNav?.label ?? 'KOMTROL'}</h1>
              {isAccessPreview && (
                <span className={isOperationalWorkerMode ? 'access-preview-badge operational' : 'access-preview-badge'}>
                  {isOperationalWorkerMode ? 'MODO OPERATIVO · ' : 'VISTA · '}{previewAccess?.shortLabel}
                </span>
              )}
            </div>
            <p>{displayName} · {isAccessPreview ? (previewAccess?.position || role) : role}{effectiveProfile?.warehouse ? ` · ${effectiveProfile.warehouse}` : ''}{effectiveProfile?.group_name ? ` · ${effectiveProfile.group_name}` : ''}{effectiveProfile?.shift_name ? ` · ${effectiveProfile.shift_name}` : ''}</p>
          </div>
          <div className="top-actions">
            <span
              className="viewport-profile-badge"
              title={`Vista detectada: ${screenProfileLabel(viewport.profile)} · ${viewport.width}×${viewport.height}px`}
            >
              {screenProfileLabel(viewport.profile)} · {viewport.width}×{viewport.height}
            </span>
            <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={19} /></button>
            {!isReadOnlyAccessPreview && <div className="notification-center">
              <button
                className={unreadAppNotifications ? 'icon-button notification-bell has-unread' : 'icon-button notification-bell'}
                title="Notificaciones"
                onClick={() => { void toggleNotificationCenter() }}
              >
                <Bell size={19} />
                {unreadAppNotifications > 0 && <span>{unreadAppNotifications > 99 ? '99+' : unreadAppNotifications}</span>}
              </button>
              {notificationOpen && (
                <div className="notification-panel" role="region" aria-label="Notificaciones">
                  <div className="notification-panel-head">
                    <span className="notification-panel-head-icon"><Bell size={19} /></span>
                    <div><b>Notificaciones</b><span>{unreadAppNotifications ? `${unreadAppNotifications} sin leer` : 'Todo al día'}</span></div>
                    {unreadAppNotifications > 0 && <button onClick={markAllNotificationsRead}>Marcar todas como leídas</button>}
                  </div>
                  <div className="notification-panel-list">
                    {appNotifications.slice(0, 20).map((item) => (
                      <button
                        key={item.id}
                        className={item.read_at ? 'notification-item' : 'notification-item unread'}
                        onClick={() => openAppNotification(item)}
                      >
                        <span className="notification-item-icon"><Bell size={17} /></span>
                        <div>
                          <b>{item.title}{!item.read_at && <i className="notification-unread-dot" aria-label="Sin leer" />}</b>
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
            </div>}
          </div>
        </header>

        {profile && (
          <section className="user-greeting-sticky" aria-label="Saludo del usuario">
            <div className="user-greeting-inner">
              <span className="user-greeting-date"><i />{todayLabel(now)}</span>
              <div className="user-greeting-copy">
                <strong>{greetingForDate(now)}, <b>{firstName(displayName)}</b></strong>
                <small>{effectiveProfile?.warehouse || 'SIN ALMACÉN'}{effectiveProfile?.group_name ? ` · ${effectiveProfile.group_name}` : ''}{effectiveProfile?.shift_name ? ` · ${effectiveProfile.shift_name}` : ''}{isOperationalWorkerMode ? ` · MODO ${previewAccess?.shortLabel?.toUpperCase()}` : isAccessPreview ? ` · VISTA ${previewAccess?.shortLabel?.toUpperCase()}` : ''}</small>
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
                  key={accessView}
                  userId={user.id}
                  profile={effectiveProfile!}
                  previewMode={isReadOnlyAccessPreview}
                  availableTabs={flatNav.map((item)=>item.id)}
                  onNavigate={(targetTab, options) => {
                    const target = flatNav.find((item) => item.id === targetTab)
                    if (!target) {
                      setToast('Este indicador no está disponible para tu perfil.')
                      return
                    }
                    if (options?.restoreAdmin) {
                      setAccessView('ACTUAL')
                      setToast('Vista Administrador restaurada para atender tu pendiente.')
                    }
                    setDashboardTaskStatus(
                      ['tareas-globales', 'mi-trabajo', 'tareas', 'relevos'].includes(targetTab)
                        ? (options?.taskStatus || 'TODOS')
                        : null
                    )
                    if (targetTab === 'comercial-ordenes-compra' || targetTab === 'ordenes-compra' || targetTab === 'cargos-directos') {
                      setCommercialOrderFilter((options?.commercialFilter || 'TODOS') as CommercialOrderFilter)
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
                  profile={effectiveProfile!}
                  scopeMode="REMOTE"
                  initialIncidentId={alertIncidentToOpen}
                  onInitialIncidentOpened={() => setAlertIncidentToOpen(null)}
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
                  profile={effectiveProfile!}
                  scopeMode="CALLAO"
                  initialIncidentId={alertIncidentToOpen}
                  onInitialIncidentOpened={() => setAlertIncidentToOpen(null)}
                />
              )}

              {isInboundTab && tab === 'inbound-cajas' && (
                <InboundModule mode="boxes" userId={user.id} profile={effectiveProfile!} />
              )}

              {isInboundTab && tab === 'inbound-kardex' && (
                <SurplusKardexModule userId={user.id} profile={effectiveProfile!} fixedWarehouse="CALLAO" />
              )}

              {isInboundTab && tab === 'inbound-personal' && (
                <TasksModule
                  mode="area-personal"
                  userId={user.id}
                  profile={effectiveProfile!}
                  scopeWarehouse="CALLAO"
                  scopeProject="INBOUND CALLAO"
                  scopeGroup="INBOUND"
                />
              )}

              {isInboundTab && tab === 'inbound-tareas' && (
                <TasksModule
                  mode="tareas"
                  userId={user.id}
                  profile={effectiveProfile!}
                  scopeWarehouse="CALLAO"
                  scopeProject="INBOUND CALLAO"
                  scopeGroup="INBOUND"
                />
              )}

              {isTaskTab && (
                <TasksModule
                  key={`${accessView}-${tab}-${dashboardTaskStatus || 'default'}`}
                  mode={(tab === 'tareas-globales' ? 'global-admin' : tab) as TasksMode}
                  userId={user.id}
                  profile={effectiveProfile!}
                  previewMode={isReadOnlyAccessPreview}
                  scopeWarehouse={isAccessPreview ? previewAccess?.warehouse : undefined}
                  scopeProject={isAccessPreview ? previewAccess?.project : undefined}
                  initialStatusFilter={dashboardTaskStatus || 'TODOS'}
                  initialTaskId={taskToOpen}
                  initialCommentId={commentToOpen}
                  onInitialTaskOpened={() => setTaskToOpen(null)}
                  onTaskClosed={() => setCommentToOpen(null)}
                />
              )}

              {isExpirationTab && (
                <ExpirationsModule
                  key={`${accessView}-${expirationType}`}
                  type={expirationType}
                  userId={user.id}
                  profile={effectiveProfile!}
                  previewMode={isReadOnlyAccessPreview}
                />
              )}

              {isGuideTab && (
                <GuidesModule
                  mode={guideMode}
                  userId={user.id}
                  profile={effectiveProfile!}
                  initialSearch={alertGuideSearch}
                  onInitialSearchApplied={() => setAlertGuideSearch(null)}
                />
              )}

              {isOcCargoTab && (
                <OcCargoTrackingModule
                  key={`${tab}-${commercialOrderFilter}`}
                  userId={user.id}
                  profile={effectiveProfile!}
                  fixedType={operationalOcType}
                  initialFilter={commercialOrderFilter}
                />
              )}

              {isCommercialSummaryTab && role === 'ADMINISTRADOR' && (
                <CommercialDashboardModule
                  onOpenOrders={(filter='TODOS') => {
                    setCommercialOrderFilter(filter)
                    setTab('comercial-ordenes-compra')
                    setOpenSections((current) => current.includes('COMERCIAL') ? current : [...current, 'COMERCIAL'])
                    setMobileMenu(false)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                />
              )}

              {isCommercialOrdersTab && (isCommercialArea || role === 'ADMINISTRADOR') && (
                <OcCargoTrackingModule
                  key={`commercial-orders-${commercialOrderFilter}-${role}`}
                  userId={user.id}
                  profile={effectiveProfile!}
                  fixedType="ORDEN_COMPRA"
                  commercialView={role !== 'ADMINISTRADOR'}
                  initialFilter={commercialOrderFilter}
                />
              )}

              {isReplenishmentTab && (
                <ReplenishmentModule
                  userId={user.id}
                  profile={effectiveProfile!}
                />
              )}

              {isLocationSheetTab && (
                <LocationSheetsModule userId={user.id} profile={effectiveProfile!} />
              )}

              {isMaterialTab && (
                <MaterialsModule
                  mode={materialMode}
                  userId={user.id}
                  isAdmin={role === 'ADMINISTRADOR'}
                />
              )}

              {tab === 'kardex-sobrantes' && (
                <SurplusKardexModule userId={user.id} profile={effectiveProfile!} />
              )}

              {isOperationsControlTab && (
                <OperationsControlModule
                  mode={operationsControlMode}
                  userId={user.id}
                  warehouse={effectiveProfile?.warehouse}
                  initialSearch={alertOperationSearch}
                  onInitialSearchApplied={() => setAlertOperationSearch(null)}
                />
              )}

              {isDashboardTab && canViewRemoteScorecards && (
                <ScorecardRemoteModule
                  mode={tab as typeof dashboardTabs[number]}
                  userId={user.id}
                  role={role}
                  profile={effectiveProfile!}
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
                <AlertsModule key={accessView} onOpenAlert={openAlertTreatment} previewWarehouse={isAccessPreview ? previewAccess?.warehouse : undefined} previewProject={isAccessPreview ? previewAccess?.project : undefined} />
              )}

              {tab === 'usuarios' && role === 'ADMINISTRADOR' && (
                <UsersAdmin />
              )}

              {!isTaskTab && !isExpirationTab && !isInboundTab && !isGuideTab && !isOcCargoTab && !isCommercialSummaryTab && !isCommercialOrdersTab && !isReplenishmentTab && !isLocationSheetTab && !isMaterialTab && !isOperationsControlTab && !isDashboardTab && !isAdminModuleTab && !isKardexTab && !['inicio', 'alertas', 'incidencias', 'correos', 'usuarios', 'configuracion'].includes(tab) && currentNav && (
                <ModulePlaceholder
                  title={currentNav.label}
                  section={currentNav.section}
                  description={`${currentNav.label} forma parte de la migración completa desde KOMTROL Sites hacia GitHub + Vercel + Supabase.`}
                />
              )}

              {tab === 'configuracion' && role === 'ADMINISTRADOR' && (
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

      {passwordModalOpen && (
        <div
          className="modal-backdrop account-modal-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && !passwordSaving && setPasswordModalOpen(false)}
        >
          <form className="modal account-password-modal" onSubmit={updateOwnPassword}>
            <div className="modal-head">
              <div>
                <span className="account-modal-kicker"><KeyRound size={14} /> SEGURIDAD DE CUENTA</span>
                <h2>Cambiar clave</h2>
                <p>Actualiza tu clave personal de acceso a KOMTROL. Esta opción está disponible para todos los perfiles.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                disabled={passwordSaving}
                onClick={() => setPasswordModalOpen(false)}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="account-password-form">
              <label>
                Nueva clave
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  placeholder="6 a 8 dígitos"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value.replace(/\D/g, '').slice(0, 8))}
                  autoFocus
                />
                <small>Usa entre 6 y 8 dígitos. No compartas tu clave con otros usuarios.</small>
              </label>
              <label>
                Confirmar nueva clave
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={8}
                  placeholder="Repite la nueva clave"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value.replace(/\D/g, '').slice(0, 8))}
                />
              </label>
            </div>

            {passwordMessage && <div className="form-alert account-password-alert">{passwordMessage}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={passwordSaving}
                onClick={() => setPasswordModalOpen(false)}
              >
                Cancelar
              </button>
              <button className="primary-button" disabled={passwordSaving || !newPassword || !confirmNewPassword}>
                {passwordSaving ? <RefreshCw className="spin" size={18} /> : <KeyRound size={18} />}
                {passwordSaving ? 'Actualizando…' : 'Actualizar clave'}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {popNotification && !isReadOnlyAccessPreview && (
        <div className="task-notification-pop" role="alert">
          <Bell size={19}/>
          <div><b>{popNotification.title}</b><p>{popNotification.message}</p></div>
          <button type="button" onClick={() => { void openAppNotification(popNotification) }}>{popNotification.task_id ? 'Abrir tarea' : 'Ver aviso'}</button>
          <button type="button" className="pop-close" onClick={() => setPopNotification(null)} aria-label="Cerrar aviso"><X size={16}/></button>
        </div>
      )}
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
