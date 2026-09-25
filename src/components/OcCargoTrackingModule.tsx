import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  DollarSign,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Mail,
  MapPin,
  RefreshCw,
  Save,
  Search,
  Send,
  Upload,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportRowsToExcel, exportRowsToPdfPortrait } from '../lib/exportUtils'
import { SearchableSelect } from './SearchableSelect'
import { ProfessionalBarChart, ProfessionalDonutChart } from './DashboardVisuals'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'

type Profile = {
  user_id: string
  full_name: string
  role: Role
  warehouse?: string | null
  group_name?: string | null
  oc_cargo_access_level?: 'COMERCIAL' | 'DOCUMENTARIO' | null
}

type GuideType = 'ORDEN_COMPRA' | 'CARGO_DIRECTO'

type Followup = {
  id: string
  guide_id: string
  client_delivery_date: string | null
  refrendo_delivery_date: string | null
  oc_value_usd: number | null
  mine_warehouse_observations: string | null
  kmmp_warehouse_observation: string | null
  received_by: 'ANTAMINA' | 'CONSIGNADO' | 'OTRO' | null
  final_status:
    | 'PENDIENTE'
    | 'EN_SEGUIMIENTO'
    | 'OBSERVADO'
    | 'ENTREGADO_CLIENTE'
    | 'REFRENDADO'
    | 'ANULADO'
    | 'CERRADO'
  cancellation_comments: string | null
  management_owner: string | null
  parts_location: string | null
  scan_sent_date: string | null
  scan_send_status: 'PENDIENTE' | 'ENVIADO' | 'OBSERVADO' | 'NO_APLICA'
  billing_status: 'PENDIENTE' | 'ENVIADO' | 'OBSERVADO' | 'REENVIADO' | 'CONFIRMADO'
  billing_sent_at: string | null
  billing_sent_by: string | null
  billing_sent_by_name: string | null
  updated_at: string
}

type Refrendo = {
  id: string
  guide_id: string
  reference_detected: string | null
  file_bucket: string
  file_path: string
  file_name: string
  source_file_name: string | null
  page_from: number | null
  page_to: number | null
  confidence: number | null
  extraction_method: 'PDF_TEXT' | 'OCR' | 'MANUAL'
  created_by: string
  created_at: string
}

type ObservationEmail = {
  id: string
  guide_id: string
  followup_id: string | null
  status: 'PENDIENTE' | 'ENVIANDO' | 'ENVIADO' | 'ERROR'
  to_addresses: string[]
  cc_addresses: string[]
  subject: string
  body_text: string
  sent_at: string | null
  error_message: string | null
  created_at: string
}

type ObservationEmailPreview = {
  status: ObservationEmail['status'] | 'BORRADOR'
  to_addresses: string[]
  cc_addresses: string[]
  subject: string
  body_text: string
  sent_at: string | null
  error_message: string | null
  created_at: string | null
}

type BulkPreparedRefrendo = {
  key: string
  guideId: string
  guideNo: string
  reference: string
  sourceFileName: string
  pageFrom: number
  pageTo: number
  confidence: number
  extractionMethod: 'PDF_TEXT' | 'OCR'
  bytes: Uint8Array
  duplicate: boolean
}

type BulkIssue = {
  key: string
  sourceFileName: string
  pageFrom: number
  pageTo: number
  message: string
}

type Guide = {
  id: string
  guide_no: string
  document_no: string | null
  emission_date: string | null
  transfer_start_date: string | null
  reception_at: string
  reference: string
  line_count: number
  guide_type: GuideType
  warehouse: string | null
  group_name: string | null
  created_by: string
  responsible_user_id: string
  status: string
  load_status: 'VALIDADO' | 'OBSERVADO'
  notes: string | null
  file_bucket: string | null
  file_path: string | null
  file_name: string | null
  created_at: string
  followup?: Followup | null
  refrendos?: Refrendo[]
  observationEmails?: ObservationEmail[]
}

type OrderListFilter =
  | 'TODOS'
  | 'PENDIENTE'
  | 'EN_SEGUIMIENTO'
  | 'OBSERVADO'
  | 'ENTREGADO_CLIENTE'
  | 'REFRENDADO'
  | 'ANULADO'
  | 'CERRADO'
  | 'SIN_REFRENDO'
  | 'CON_REFRENDO'
  | 'PENDIENTE_ENTREGA'

type Props = {
  userId: string
  profile: Profile | null
  fixedType?: GuideType
  commercialView?: boolean
  initialFilter?: OrderListFilter
}

type FollowupForm = {
  client_delivery_date: string
  refrendo_delivery_date: string
  oc_value_usd: string
  mine_warehouse_observations: string
  kmmp_warehouse_observation: string
  received_by: '' | 'ANTAMINA' | 'CONSIGNADO' | 'OTRO'
  final_status: Followup['final_status']
  cancellation_comments: string
  management_owner: string
  parts_location: string
  scan_sent_date: string
  scan_send_status: Followup['scan_send_status']
  billing_status: Followup['billing_status']
}

const emptyFollowup = (): FollowupForm => ({
  client_delivery_date: '',
  refrendo_delivery_date: '',
  oc_value_usd: '',
  mine_warehouse_observations: '',
  kmmp_warehouse_observation: '',
  received_by: '',
  final_status: 'PENDIENTE',
  cancellation_comments: '',
  management_owner: '',
  parts_location: '',
  scan_sent_date: '',
  scan_send_status: 'PENDIENTE',
  billing_status: 'PENDIENTE',
})

function normalizeFollowup(value: unknown): Followup | null {
  if (!value) return null
  if (Array.isArray(value)) return (value[0] ?? null) as Followup | null
  return value as Followup
}

function isoDay(value?: string | null) {
  if (!value) return ''
  return value.slice(0, 10)
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-PE').format(date)
}

function daysBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null
  const a = new Date(start.length === 10 ? start + 'T12:00:00' : start)
  const b = new Date(end.length === 10 ? end + 'T12:00:00' : end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000))
}

function followupToForm(followup?: Followup | null): FollowupForm {
  if (!followup) return emptyFollowup()
  return {
    client_delivery_date: followup.client_delivery_date || '',
    refrendo_delivery_date: followup.refrendo_delivery_date || '',
    oc_value_usd: followup.oc_value_usd == null ? '' : String(followup.oc_value_usd),
    mine_warehouse_observations: followup.mine_warehouse_observations || '',
    kmmp_warehouse_observation: followup.kmmp_warehouse_observation || '',
    received_by: followup.received_by || '',
    final_status: followup.final_status || 'PENDIENTE',
    cancellation_comments: followup.cancellation_comments || '',
    management_owner: followup.management_owner || '',
    parts_location: followup.parts_location || '',
    scan_sent_date: followup.scan_sent_date || '',
    scan_send_status: followup.scan_send_status || 'PENDIENTE',
    billing_status: followup.billing_status || 'PENDIENTE',
  }
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ')
}

function normalizeMatchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function groupMatches(userGroup?: string | null, rowGroup?: string | null) {
  const normalize = (value?: string | null) => String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  const left = normalize(userGroup)
  const right = normalize(rowGroup)
  if (!left || !right) return false
  if (left === right) return true
  const split = (value: string) => value.split(/[/,;|]+/).filter(Boolean)
  return split(right).includes(left) || split(left).includes(right)
}

function safeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100)
}

function latestRefrendo(guide: Guide) {
  return [...(guide.refrendos || [])].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0] || null
}

function latestObservationEmail(guide: Guide) {
  return [...(guide.observationEmails || [])]
    .sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0] || null
}

function composeObservationEmail(guide: Guide, followup: FollowupForm, reporter: string) {
  const kind = guide.guide_type === 'ORDEN_COMPRA' ? 'ORDEN DE COMPRA' : 'CARGO DIRECTO'
  const subject = `[KOMTROL][${kind} OBSERVADO] Guía ${guide.guide_no} | Ref. ${guide.reference}`
  const body = [
    'Estimados,',
    '',
    'Se reporta la siguiente guía como OBSERVADA desde KOMTROL.',
    '',
    `Tipo: ${kind}`,
    `Guía: ${guide.guide_no}`,
    `Referencia: ${guide.reference}`,
    `N° Documento: ${guide.document_no || '—'}`,
    `Almacén: ${guide.warehouse || '—'}`,
    guide.guide_type === 'ORDEN_COMPRA'
      ? `Valor OC $: ${followup.oc_value_usd || '—'}`
      : '',
    `Observaciones Almacén Mina: ${followup.mine_warehouse_observations || '—'}`,
    `Observación Almacén KMMP: ${followup.kmmp_warehouse_observation || '—'}`,
    `Recepcionado por: ${followup.received_by || '—'}`,
    `Encargado de gestión: ${followup.management_owner || '—'}`,
    `Ubicación de repuestos: ${followup.parts_location || '—'}`,
    `Comentarios para anulación de guía: ${followup.cancellation_comments || '—'}`,
    '',
    'Favor su apoyo con la revisión y regularización correspondiente.',
    '',
    `Registro generado desde KOMTROL por ${reporter || 'usuario'}.`,
  ].filter(Boolean).join('\n')

  return { subject, body }
}

function emails(value: string) {
  return value
    .split(/[;,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function OcCargoTrackingModule({ userId, profile, fixedType, commercialView = false, initialFilter = 'TODOS' }: Props) {
  const [guides, setGuides] = useState<Guide[]>([])
  const [activeType, setActiveType] = useState<GuideType>(fixedType || 'ORDEN_COMPRA')
  const [selected, setSelected] = useState<Guide | null>(null)
  const [form, setForm] = useState<FollowupForm>(emptyFollowup())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderListFilter>(initialFilter)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [bulkOpen,setBulkOpen]=useState(false)
  const [bulkAnalyzing,setBulkAnalyzing]=useState(false)
  const [bulkSaving,setBulkSaving]=useState(false)
  const [bulkProgress,setBulkProgress]=useState('')
  const [bulkPrepared,setBulkPrepared]=useState<BulkPreparedRefrendo[]>([])
  const [bulkIssues,setBulkIssues]=useState<BulkIssue[]>([])
  const [bulkFiles,setBulkFiles]=useState<File[]>([])

  const specialAccess=profile?.oc_cargo_access_level || null
  const isCommercialView = commercialView || specialAccess === 'COMERCIAL'
  const canUploadRefrendos=!isCommercialView
  const canUpdateBilling=!isCommercialView
  const canEditOperational=!isCommercialView && (!specialAccess || ['COORDINADOR','SUPERVISOR','ADMINISTRADOR'].includes(profile?.role || ''))

  const [emailOpen, setEmailOpen] = useState(false)
  const [observationEmailPreview,setObservationEmailPreview]=useState<ObservationEmailPreview|null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [mail, setMail] = useState({
    to: '',
    cc: '',
    subject: '',
    body: '',
  })

  async function reload() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('guides')
      .select(`
        id,
        guide_no,
        document_no,
        emission_date,
        transfer_start_date,
        reception_at,
        reference,
        line_count,
        guide_type,
        warehouse,
        group_name,
        created_by,
        responsible_user_id,
        status,
        load_status,
        notes,
        file_bucket,
        file_path,
        file_name,
        created_at,
        oc_cargo_followups (*),
        guide_refrendos (*),
        guide_observation_emails (*)
      `)
      .in('guide_type', ['ORDEN_COMPRA', 'CARGO_DIRECTO'])
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) {
      setMessage(error.message)
      setGuides([])
    } else {
      const rows = (data ?? []).map((row: any) => ({
        ...row,
        followup: normalizeFollowup(row.oc_cargo_followups),
        refrendos: (row.guide_refrendos ?? []) as Refrendo[],
        observationEmails: (row.guide_observation_emails ?? []) as ObservationEmail[],
      })) as Guide[]
      setGuides(rows)
      if (selected) {
        const refreshed = rows.find((row) => row.id === selected.id) ?? null
        setSelected(refreshed)
        if (refreshed) setForm(followupToForm(refreshed.followup))
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    if (fixedType) setActiveType(fixedType)
  }, [fixedType])

  useEffect(() => {
    setStatusFilter(initialFilter || 'TODOS')
  }, [initialFilter])

  useEffect(() => {
    reload()
  }, [userId])

  const scopedGuides = useMemo(() => {
    if (!profile) return []
    if (profile.role === 'ADMINISTRADOR' || specialAccess === 'COMERCIAL' || specialAccess === 'DOCUMENTARIO') return guides

    const warehouse = String(profile.warehouse || '').trim().toUpperCase()
    return guides.filter((guide) => {
      if (warehouse && String(guide.warehouse || '').trim().toUpperCase() !== warehouse) return false
      if (profile.role === 'COORDINADOR' || profile.role === 'SUPERVISOR') return true
      if (guide.created_by === profile.user_id || guide.responsible_user_id === profile.user_id) return true
      return groupMatches(profile.group_name, guide.group_name)
    })
  }, [guides, profile, specialAccess])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scopedGuides.filter((guide) => {
      if (guide.guide_type !== activeType) return false
      if (statusFilter === 'SIN_REFRENDO' && (guide.refrendos?.length || 0) > 0) return false
      if (statusFilter === 'CON_REFRENDO' && (guide.refrendos?.length || 0) === 0) return false
      if (statusFilter === 'PENDIENTE_ENTREGA') {
        const finalStatus = guide.followup?.final_status ?? 'PENDIENTE'
        if (guide.followup?.client_delivery_date || ['ANULADO','CERRADO','ENTREGADO_CLIENTE','REFRENDADO'].includes(finalStatus)) return false
      }
      if (
        !['TODOS','SIN_REFRENDO','CON_REFRENDO','PENDIENTE_ENTREGA'].includes(statusFilter) &&
        (guide.followup?.final_status ?? 'PENDIENTE') !== statusFilter
      ) return false
      if (!q) return true
      return [
        guide.guide_no,
        guide.reference,
        guide.document_no,
        guide.warehouse,
        guide.load_status,
        guide.followup?.final_status,
        guide.followup?.management_owner,
        guide.followup?.parts_location,
      ].some((value) => String(value ?? '').toLowerCase().includes(q))
    })
  }, [scopedGuides, activeType, statusFilter, search])

  const activeRows = useMemo(
    () => scopedGuides.filter((guide) => guide.guide_type === activeType),
    [scopedGuides, activeType]
  )

  const counts = useMemo(() => {
    const rows = activeRows
    const pendingDelivery = rows.filter((guide) => {
      const finalStatus = guide.followup?.final_status ?? 'PENDIENTE'
      return !guide.followup?.client_delivery_date &&
        !['ANULADO','CERRADO','ENTREGADO_CLIENTE','REFRENDADO'].includes(finalStatus)
    }).length
    const delivered = rows.filter((guide) =>
      Boolean(guide.followup?.client_delivery_date) ||
      ['ENTREGADO_CLIENTE','REFRENDADO','CERRADO'].includes(guide.followup?.final_status || '')
    ).length

    return {
      total: rows.length,
      observed: rows.filter((guide) => guide.followup?.final_status === 'OBSERVADO').length,
      refrendado: rows.filter((guide) => guide.followup?.final_status === 'REFRENDADO').length,
      pending: rows.filter((guide) => !guide.followup || ['PENDIENTE', 'EN_SEGUIMIENTO'].includes(guide.followup.final_status)).length,
      pendingDelivery,
      delivered,
      withRefrendo: rows.filter((guide) => (guide.refrendos?.length || 0) > 0).length,
      billingSent: rows.filter((guide) => ['ENVIADO','REENVIADO','CONFIRMADO'].includes(guide.followup?.billing_status || '')).length,
    }
  }, [activeRows])

  const statusSegments = useMemo(() => [
    {key:'PENDIENTE',label:'Pendiente',value:activeRows.filter((guide)=>!guide.followup || guide.followup.final_status==='PENDIENTE').length},
    {key:'EN_SEGUIMIENTO',label:'En seguimiento',value:activeRows.filter((guide)=>guide.followup?.final_status==='EN_SEGUIMIENTO').length},
    {key:'OBSERVADO',label:'Observado',value:activeRows.filter((guide)=>guide.followup?.final_status==='OBSERVADO').length},
    {key:'ENTREGADO_CLIENTE',label:'Entregado',value:activeRows.filter((guide)=>guide.followup?.final_status==='ENTREGADO_CLIENTE').length},
    {key:'REFRENDADO',label:'Refrendado',value:activeRows.filter((guide)=>guide.followup?.final_status==='REFRENDADO').length},
    {key:'CERRADO',label:'Cerrado',value:activeRows.filter((guide)=>guide.followup?.final_status==='CERRADO').length},
  ],[activeRows])

  const processBars = useMemo(() => activeType === 'CARGO_DIRECTO'
    ? [
        {key:'REGISTRADOS',label:'Registrados',value:counts.total,detail:'Cargos directos visibles para este perfil.'},
        {key:'PENDIENTE_ENTREGA',label:'Pend. entrega',value:counts.pendingDelivery,detail:'Sin fecha de entrega al cliente.'},
        {key:'ENTREGADOS',label:'Entregados',value:counts.delivered,detail:'Cargos con entrega registrada.'},
        {key:'REFRENDO',label:'Con refrendo',value:counts.withRefrendo,detail:'Cargos con PDF de refrendo disponible.'},
        {key:'FACTURACION',label:'Facturación',value:counts.billingSent,detail:'Cargos enviados o confirmados para facturación.'},
      ]
    : [
        {key:'REGISTRADOS',label:'OC registradas',value:counts.total,detail:'Órdenes de compra visibles para este perfil.'},
        {key:'PENDIENTES',label:'Pendientes',value:counts.pending,detail:'Órdenes pendientes o en seguimiento.'},
        {key:'OBSERVADAS',label:'Observadas',value:counts.observed,detail:'Órdenes que requieren regularización.'},
        {key:'REFRENDO',label:'Con refrendo',value:counts.withRefrendo,detail:'Órdenes con PDF disponible.'},
        {key:'FACTURACION',label:'Facturación',value:counts.billingSent,detail:'Órdenes enviadas o confirmadas para facturación.'},
      ],
    [activeType,counts]
  )

  const ocExportRows=visible.map((guide)=>({
    guide_no:guide.guide_no,
    reference:guide.reference,
    document_no:guide.document_no||'',
    emission_date:fmtDate(guide.emission_date),
    reception_at:fmtDate(guide.reception_at),
    oc_value:guide.followup?.oc_value_usd ?? '',
    load_status:guide.load_status,
    final_status:statusLabel(guide.followup?.final_status || 'PENDIENTE'),
    management_owner:guide.followup?.management_owner||'',
    parts_location:guide.followup?.parts_location||'',
    client_delivery_date:fmtDate(guide.followup?.client_delivery_date),
    refrendo_delivery_date:fmtDate(guide.followup?.refrendo_delivery_date),
    scan_send_status:guide.followup?.scan_send_status||'',
    refrendos:(guide.refrendos?.length||0) ? String(guide.refrendos?.length) + ' PDF' : 'PENDIENTE',
    billing_status:statusLabel(guide.followup?.billing_status||'PENDIENTE'),
    billing_sent_at:fmtDate(guide.followup?.billing_sent_at),
    billing_sent_by:guide.followup?.billing_sent_by_name||'',
    warehouse:guide.warehouse||'',
  }))

  const ocExcelColumns=[
    {header:'GUÍA',key:'guide_no',width:20},
    {header:'REFERENCIA',key:'reference',width:20},
    {header:'N° DOCUMENTO',key:'document_no',width:18},
    {header:'EMISIÓN',key:'emission_date',width:14},
    {header:'RECEPCIÓN',key:'reception_at',width:14},
    {header:'VALOR OC USD',key:'oc_value',width:16},
    {header:'ESTADO CARGA',key:'load_status',width:16},
    {header:'ESTADO FINAL',key:'final_status',width:18},
    {header:'ENCARGADO',key:'management_owner',width:24},
    {header:'UBICACIÓN',key:'parts_location',width:20},
    {header:'ENTREGA CLIENTE',key:'client_delivery_date',width:16},
    {header:'REFRENDO',key:'refrendo_delivery_date',width:16},
    {header:'ENVÍO SCAN',key:'scan_send_status',width:16},
    {header:'REFRENDOS',key:'refrendos',width:16},
    {header:'ESTADO FACTURACIÓN',key:'billing_status',width:20},
    {header:'FECHA DE ENVÍO',key:'billing_sent_at',width:18},
    {header:'ENVIADO POR',key:'billing_sent_by',width:24},
    {header:'ALMACÉN',key:'warehouse',width:18},
  ]

  const ocPdfColumns=[
    {header:'GUÍA',key:'guide_no'},
    {header:'REFERENCIA',key:'reference'},
    {header:'DOC.',key:'document_no'},
    {header:'RECEPCIÓN',key:'reception_at'},
    {header:'VALOR USD',key:'oc_value'},
    {header:'ESTADO',key:'final_status'},
    {header:'ENCARGADO',key:'management_owner'},
    {header:'UBICACIÓN',key:'parts_location'},
    {header:'REFRENDOS',key:'refrendos'},
    {header:'FACTURACIÓN',key:'billing_status'},
    {header:'ENVÍO',key:'billing_sent_at'},
  ]

  function exportOcExcel(){
    exportRowsToExcel(
      `KOMTROL_${activeType}`,
      activeType==='ORDEN_COMPRA'?'Órdenes de Compra':'Cargos Directos',
      ocExcelColumns,
      ocExportRows,
      [['Tipo',activeType],['Registros',ocExportRows.length]]
    )
  }

  function exportOcPdf(){
    exportRowsToPdfPortrait(
      `KOMTROL_${activeType}`,
      `KOMTROL · ${activeType==='ORDEN_COMPRA'?'Ordenes de Compra':'Cargos Directos'}`,
      ocPdfColumns,
      ocExportRows,
      {summary:[['Registros',ocExportRows.length],['Pendientes',counts.pending],['Observados',counts.observed]]}
    )
  }

  async function viewRefrendo(guide: Guide) {
    const refrendo = latestRefrendo(guide)
    if (!refrendo) {
      setMessage('Esta guía todavía no tiene refrendo cargado.')
      return
    }

    const { data, error } = await supabase.storage
      .from(refrendo.file_bucket)
      .createSignedUrl(refrendo.file_path, 300)

    if (error || !data?.signedUrl) {
      setMessage(error?.message || 'No se pudo abrir el refrendo.')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function downloadRefrendo(guide: Guide) {
    const refrendo = latestRefrendo(guide)
    if (!refrendo) {
      setMessage('Esta guía todavía no tiene refrendo cargado.')
      return
    }

    const { data, error } = await supabase.storage
      .from(refrendo.file_bucket)
      .createSignedUrl(refrendo.file_path, 120, { download: refrendo.file_name })

    if (error || !data?.signedUrl) {
      setMessage(error?.message || 'No se pudo descargar el refrendo.')
      return
    }

    const link = document.createElement('a')
    link.href = data.signedUrl
    link.download = refrendo.file_name
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  function matchGuideForText(text: string): { guide: Guide; score: number } | null {
    const normalized = normalizeMatchText(text)
    let best: { guide: Guide; score: number } | null = null

    for (const guide of scopedGuides) {
      const candidates = [guide.reference, guide.guide_no, guide.document_no]
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeMatchText(value))
        .filter((value) => value.length >= 5)

      for (const candidate of candidates) {
        if (!normalized.includes(candidate)) continue
        const score = Math.min(100, 88 + Math.min(12, candidate.length / 2))
        if (!best || score > best.score) best = { guide, score }
      }
    }

    return best
  }

  async function analyzeBulkFiles(files: File[]) {
    if (!files.length) return

    setBulkAnalyzing(true)
    setBulkPrepared([])
    setBulkIssues([])
    setBulkProgress('Preparando lector PDF…')

    try {
      const pdfModuleUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs'
      const pdfWorkerUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs'
      const pdfLibUrl = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm'
      const pdfjs: any = await import(/* @vite-ignore */ pdfModuleUrl)
      const PDFLib: any = await import(/* @vite-ignore */ pdfLibUrl)
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

      const prepared: BulkPreparedRefrendo[] = []
      const issues: BulkIssue[] = []
      let tesseract: any = null

      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex]
        setBulkProgress('Analizando ' + file.name + ' · archivo ' + (fileIndex + 1) + ' de ' + files.length)

        const bytes = new Uint8Array(await file.arrayBuffer())
        const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
        const pageAssignments: {
          page: number
          guide: Guide | null
          confidence: number
          method: 'PDF_TEXT' | 'OCR'
        }[] = []

        let previousGuide: Guide | null = null

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          setBulkProgress(file.name + ' · página ' + pageNumber + ' de ' + pdf.numPages)
          const page = await pdf.getPage(pageNumber)
          const content = await page.getTextContent()
          const directText = (content.items || []).map((item: any) => String(item.str || '')).join(' ')
          let match = matchGuideForText(directText)
          let method: 'PDF_TEXT' | 'OCR' = 'PDF_TEXT'

          if (!match) {
            try {
              if (!tesseract) {
                const tesseractUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm'
                tesseract = await import(/* @vite-ignore */ tesseractUrl)
              }

              const viewport = page.getViewport({ scale: 1.45 })
              const canvas = document.createElement('canvas')
              canvas.width = Math.ceil(viewport.width)
              canvas.height = Math.ceil(viewport.height)
              const context = canvas.getContext('2d')

              if (context) {
                await page.render({ canvasContext: context, viewport }).promise
                const result = await tesseract.recognize(canvas, 'spa')
                match = matchGuideForText(String(result?.data?.text || ''))
                method = 'OCR'

                if (match) {
                  match = {
                    guide: match.guide,
                    score: Math.min(match.score, Number(result?.data?.confidence || 82)),
                  }
                }
              }
            } catch {
              // Si OCR no está disponible, la página puede heredarse al documento anterior.
            }
          }

          const assignedGuide = match?.guide || previousGuide
          pageAssignments.push({
            page: pageNumber,
            guide: assignedGuide,
            confidence: match?.score || (assignedGuide ? 72 : 0),
            method: match ? method : 'PDF_TEXT',
          })

          if (match?.guide) previousGuide = match.guide
        }

        const groups: {
          guide: Guide | null
          pages: number[]
          confidence: number
          method: 'PDF_TEXT' | 'OCR'
        }[] = []

        pageAssignments.forEach((assignment) => {
          const last = groups[groups.length - 1]
          if (last && last.guide?.id === assignment.guide?.id) {
            last.pages.push(assignment.page)
            last.confidence = Math.min(last.confidence, assignment.confidence || last.confidence)
            if (assignment.method === 'OCR') last.method = 'OCR'
          } else {
            groups.push({
              guide: assignment.guide,
              pages: [assignment.page],
              confidence: assignment.confidence,
              method: assignment.method,
            })
          }
        })

        const sourceDoc = await PDFLib.PDFDocument.load(bytes)

        for (const group of groups) {
          const pageFrom = group.pages[0]
          const pageTo = group.pages[group.pages.length - 1]

          if (!group.guide) {
            issues.push({
              key: file.name + '-' + pageFrom + '-' + pageTo,
              sourceFileName: file.name,
              pageFrom,
              pageTo,
              message: 'No se encontró una Guía / Referencia registrada en KOMTROL.',
            })
            continue
          }

          const splitDoc = await PDFLib.PDFDocument.create()
          const copied = await splitDoc.copyPages(sourceDoc, group.pages.map((page) => page - 1))
          copied.forEach((page: any) => splitDoc.addPage(page))
          const splitBytes = new Uint8Array(await splitDoc.save())

          const duplicate = (group.guide.refrendos || []).some((item) =>
            item.source_file_name === file.name &&
            item.page_from === pageFrom &&
            item.page_to === pageTo
          )

          prepared.push({
            key: file.name + '-' + group.guide.id + '-' + pageFrom + '-' + pageTo,
            guideId: group.guide.id,
            guideNo: group.guide.guide_no,
            reference: group.guide.reference,
            sourceFileName: file.name,
            pageFrom,
            pageTo,
            confidence: Math.round(group.confidence || 75),
            extractionMethod: group.method,
            bytes: splitBytes,
            duplicate,
          })
        }
      }

      setBulkPrepared(prepared)
      setBulkIssues(issues)
      setBulkProgress(
        'Análisis listo · ' + prepared.length + ' refrendo(s) identificado(s) · ' +
        issues.length + ' bloque(s) por revisar.'
      )
    } catch (error) {
      setBulkProgress('')
      setMessage(
        'No se pudo analizar la carga masiva: ' +
        (error instanceof Error ? error.message : 'error desconocido') + '.'
      )
    } finally {
      setBulkAnalyzing(false)
    }
  }

  async function confirmBulkUpload() {
    const pending = bulkPrepared.filter((item) => !item.duplicate)
    if (!pending.length) return

    setBulkSaving(true)
    let uploaded = 0

    try {
      for (let index = 0; index < pending.length; index++) {
        const item = pending[index]
        setBulkProgress('Guardando refrendo ' + (index + 1) + ' de ' + pending.length + ' · ' + item.guideNo)

        const targetName =
          'REFRENDO_' + safeFileName(item.reference || item.guideNo) +
          '_p' + item.pageFrom + '-' + item.pageTo + '.pdf'
        const filePath =
          userId + '/refrendos/' + item.guideId + '/' +
          Date.now() + '_' + index + '_' + targetName
        const blob = new Blob([item.bytes], { type: 'application/pdf' })

        const upload = await supabase.storage
          .from('guide-documents')
          .upload(filePath, blob, { contentType: 'application/pdf', upsert: false })

        if (upload.error) throw upload.error

        const insert = await supabase.from('guide_refrendos').insert({
          guide_id: item.guideId,
          reference_detected: item.reference,
          file_bucket: 'guide-documents',
          file_path: filePath,
          file_name: targetName,
          source_file_name: item.sourceFileName,
          page_from: item.pageFrom,
          page_to: item.pageTo,
          confidence: item.confidence,
          extraction_method: item.extractionMethod,
          created_by: userId,
        })

        if (insert.error) {
          await supabase.storage.from('guide-documents').remove([filePath])
          throw insert.error
        }

        uploaded++
      }

      setBulkProgress(uploaded + ' refrendo(s) cargado(s) y vinculados correctamente.')
      setBulkPrepared([])
      setBulkFiles([])
      await reload()
    } catch (error) {
      setMessage(
        'Carga masiva detenida: ' +
        (error instanceof Error ? error.message : 'error desconocido') + '.'
      )
    } finally {
      setBulkSaving(false)
    }
  }

  async function updateBillingStatus(status: Followup['billing_status']) {
    if (!selected || !canUpdateBilling) return

    setSaving(true)
    setMessage('')

    const { error } = await supabase.rpc('set_oc_cargo_billing_status', {
      p_guide_id: selected.id,
      p_status: status,
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm((current) => ({ ...current, billing_status: status }))
    setMessage('Facturación actualizada a ' + statusLabel(status) + '.')
    await reload()
  }

  function openFollowup(guide: Guide) {
    setSelected(guide)
    setForm(followupToForm(guide.followup))
    setMessage('')
    setEmailOpen(false)
  }

  function closeFollowup() {
    setSelected(null)
    setEmailOpen(false)
    setMessage('')
  }

  async function saveFollowup(event?: FormEvent) {
    event?.preventDefault()
    if (!selected) return

    setSaving(true)
    setMessage('')

    const payload = {
      guide_id: selected.id,
      client_delivery_date: form.client_delivery_date || null,
      refrendo_delivery_date: form.refrendo_delivery_date || null,
      oc_value_usd:
        selected.guide_type === 'ORDEN_COMPRA' && form.oc_value_usd
          ? Number(form.oc_value_usd)
          : null,
      mine_warehouse_observations: form.mine_warehouse_observations.trim() || null,
      kmmp_warehouse_observation: form.kmmp_warehouse_observation.trim() || null,
      received_by: form.received_by || null,
      final_status: form.final_status,
      cancellation_comments: form.cancellation_comments.trim() || null,
      management_owner: form.management_owner.trim() || null,
      parts_location: form.parts_location.trim() || null,
      scan_sent_date: form.scan_sent_date || null,
      scan_send_status: form.scan_send_status,
      billing_status: selected.followup?.billing_status || form.billing_status || 'PENDIENTE',
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('oc_cargo_followups')
      .upsert(payload, { onConflict: 'guide_id' })
      .select('*')
      .single()

    if (error || !data) {
      setSaving(false)
      setMessage(error?.message || 'No se pudo guardar el seguimiento.')
      return
    }

    await supabase.from('guide_history').insert({
      guide_id: selected.id,
      action: 'SEGUIMIENTO_ACTUALIZADO',
      note: `Seguimiento ${selected.guide_type.replace('_', ' ')} actualizado a ${form.final_status}`,
      changed_by: userId,
    })

    setSaving(false)
    setMessage('Seguimiento guardado correctamente.')
    await reload()
  }

  const dispatchDate = selected
    ? selected.transfer_start_date || selected.emission_date || isoDay(selected.created_at)
    : ''
  const receptionDate = selected ? isoDay(selected.reception_at) : ''
  const today = new Date().toISOString().slice(0, 10)

  const daysFromDispatch = selected ? daysBetween(dispatchDate, today) : null
  const daysReceptionToClient = selected ? daysBetween(receptionDate, form.client_delivery_date) : null
  const daysClientToRefrendo = selected ? daysBetween(form.client_delivery_date, form.refrendo_delivery_date) : null

  function openObservationEmailPreview(guide: Guide) {
    const sent = latestObservationEmail(guide)

    if (sent) {
      setObservationEmailPreview({
        status: sent.status,
        to_addresses: sent.to_addresses || [],
        cc_addresses: sent.cc_addresses || [],
        subject: sent.subject,
        body_text: sent.body_text,
        sent_at: sent.sent_at,
        error_message: sent.error_message,
        created_at: sent.created_at,
      })
      return
    }

    const draft = composeObservationEmail(
      guide,
      guide.id === selected?.id ? form : followupToForm(guide.followup),
      profile?.full_name || 'usuario'
    )

    setObservationEmailPreview({
      status: 'BORRADOR',
      to_addresses: [],
      cc_addresses: [],
      subject: draft.subject,
      body_text: draft.body,
      sent_at: null,
      error_message: null,
      created_at: null,
    })
  }

  async function copyObservationEmailPreview() {
    if (!observationEmailPreview) return
    const value = [
      `Para: ${observationEmailPreview.to_addresses.join('; ') || '—'}`,
      `CC: ${observationEmailPreview.cc_addresses.join('; ') || '—'}`,
      `Asunto: ${observationEmailPreview.subject}`,
      '',
      observationEmailPreview.body_text,
    ].join('\n')
    await navigator.clipboard.writeText(value)
    setMessage('Correo de observación copiado al portapapeles.')
  }

  function buildEmail() {
    if (!selected) return
    if (selected.followup?.final_status !== 'OBSERVADO') {
      setMessage('Para reportar por correo, primero establece ESTATUS FINAL = OBSERVADO y guarda el seguimiento.')
      return
    }

    const draft = composeObservationEmail(selected, form, profile?.full_name || 'usuario')
    setMail({ to: '', cc: '', subject: draft.subject, body: draft.body })
    setEmailOpen(true)
  }

  function openOutlook() {
    const to = emails(mail.to).join(',')
    const cc = emails(mail.cc).join(',')
    const url =
      `mailto:${encodeURIComponent(to)}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`
    window.location.href = url
  }

  async function copyEmail() {
    const text = `Para: ${mail.to}\nCC: ${mail.cc}\nAsunto: ${mail.subject}\n\n${mail.body}`
    await navigator.clipboard.writeText(text)
    setMessage('Correo copiado al portapapeles.')
  }

  async function sendEmail() {
    if (!selected) return
    const to = emails(mail.to)
    if (!to.length) {
      setMessage('Ingresa al menos un destinatario.')
      return
    }
    if (form.final_status !== 'OBSERVADO') {
      setMessage('El correo solo puede enviarse cuando la guía está OBSERVADA.')
      return
    }

    setSendingEmail(true)
    setMessage('')
    const { data, error } = await supabase.functions.invoke('send-guide-observation-email', {
      body: {
        guideId: selected.id,
        to,
        cc: emails(mail.cc),
        subject: mail.subject.trim(),
        body: mail.body,
      },
    })
    setSendingEmail(false)

    if (error) {
      setMessage(`No se pudo enviar desde KOMTROL: ${error.message}. Puedes usar “Abrir en Outlook”.`)
      return
    }
    if (data?.error) {
      setMessage(`${data.error}. Puedes usar “Abrir en Outlook”.`)
      return
    }

    setMessage('Correo de observación enviado correctamente desde KOMTROL.')
    setEmailOpen(false)
    await reload()
  }

  return (
    <div className="oc-cargo-module">
      <section className="panel oc-cargo-list-panel">
        <div className="panel-title">
          <div>
            <h3>{activeType === 'ORDEN_COMPRA' ? 'Órdenes de Compra' : 'Cargos Directos'}</h3>
            <p>{isCommercialView
              ? 'Consulta comercial de estado de guía y refrendos PDF. Acceso de solo lectura.'
              : 'Seguimiento de guías, refrendos PDF y control de envío a Facturación.'}</p>
          </div>
          <div className="button-row">
            {canUploadRefrendos&&<button className="secondary-button" onClick={()=>{setBulkOpen(true);setBulkProgress('');setBulkPrepared([]);setBulkIssues([])}}><Upload size={16}/> Carga masiva refrendos</button>}
            <button className="secondary-button" disabled={!visible.length} onClick={exportOcPdf}><FileText size={16}/> PDF</button>
            <button className="secondary-button" disabled={!visible.length} onClick={exportOcExcel}><FileSpreadsheet size={16}/> Excel</button>
            <button className="icon-button" onClick={reload}><RefreshCw size={18} /></button>
          </div>
        </div>

        {!fixedType && (
          <div className="oc-cargo-type-tabs">
            <button
              className={activeType === 'ORDEN_COMPRA' ? 'active' : ''}
              onClick={() => setActiveType('ORDEN_COMPRA')}
            >
              Órdenes de Compra
              <span>{guides.filter((g) => g.guide_type === 'ORDEN_COMPRA').length}</span>
            </button>
            <button
              className={activeType === 'CARGO_DIRECTO' ? 'active' : ''}
              onClick={() => setActiveType('CARGO_DIRECTO')}
            >
              Cargos Directos
              <span>{guides.filter((g) => g.guide_type === 'CARGO_DIRECTO').length}</span>
            </button>
          </div>
        )}

        <section className="oc-cargo-professional-summary" aria-label="Resumen y analítica">
          <div className="oc-cargo-summary-cards">
            <button type="button" className="oc-cargo-summary-card" onClick={()=>setStatusFilter('TODOS')}>
              <span><FileText size={18}/></span>
              <div><small>{activeType==='ORDEN_COMPRA'?'OC REGISTRADAS':'CARGOS REGISTRADOS'}</small><b>{counts.total}</b><em>Universo visible del perfil</em></div>
            </button>
            <button type="button" className={activeType==='CARGO_DIRECTO'&&counts.pendingDelivery?'oc-cargo-summary-card attention':'oc-cargo-summary-card'} onClick={()=>setStatusFilter(activeType==='CARGO_DIRECTO'?'PENDIENTE_ENTREGA':'PENDIENTE')}>
              <span><Clock3 size={18}/></span>
              <div><small>{activeType==='CARGO_DIRECTO'?'PEND. ENTREGA':'PENDIENTES'}</small><b>{activeType==='CARGO_DIRECTO'?counts.pendingDelivery:counts.pending}</b><em>{activeType==='CARGO_DIRECTO'?'Sin entrega al cliente':'Requieren seguimiento'}</em></div>
            </button>
            <button type="button" className={counts.observed?'oc-cargo-summary-card attention':'oc-cargo-summary-card'} onClick={()=>setStatusFilter('OBSERVADO')}>
              <span><AlertTriangle size={18}/></span>
              <div><small>OBSERVADOS</small><b>{counts.observed}</b><em>Requieren regularización</em></div>
            </button>
            <button type="button" className="oc-cargo-summary-card success" onClick={()=>setStatusFilter('CON_REFRENDO')}>
              <span><CheckCircle2 size={18}/></span>
              <div><small>REFRENDO DISPONIBLE</small><b>{counts.withRefrendo}</b><em>Listo para visualizar o descargar</em></div>
            </button>
          </div>

          <div className="oc-cargo-analytics-grid">
            <div className="oc-cargo-chart-card">
              <ProfessionalDonutChart
                title={activeType==='ORDEN_COMPRA'?'Estado de Órdenes de Compra':'Estado de Cargos Directos'}
                subtitle="Distribución actual del flujo documental"
                segments={statusSegments}
                onSelect={(key)=>setStatusFilter((key||'TODOS') as OrderListFilter)}
              />
            </div>
            <div className="oc-cargo-chart-card">
              <ProfessionalBarChart
                title={activeType==='ORDEN_COMPRA'?'Avance documental de OC':'Avance de Cargos Directos'}
                subtitle={activeType==='ORDEN_COMPRA'?'Registro, observaciones, refrendos y facturación':'Registro, entrega, refrendo y facturación'}
                data={processBars}
                onSelect={(key)=>{
                  if(key==='PENDIENTE_ENTREGA') setStatusFilter('PENDIENTE_ENTREGA')
                  else if(key==='OBSERVADAS') setStatusFilter('OBSERVADO')
                  else if(key==='REFRENDO') setStatusFilter('CON_REFRENDO')
                  else if(key==='PENDIENTES') setStatusFilter('PENDIENTE')
                  else setStatusFilter('TODOS')
                }}
              />
            </div>
          </div>
        </section>

        <div className="task-toolbar oc-cargo-toolbar">
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar guía, referencia, documento, encargado, ubicación…"
            />
          </div>
          <SearchableSelect
            value={statusFilter}
            onChange={(value)=>setStatusFilter((value||'TODOS') as OrderListFilter)}
            options={[
              {value:'TODOS',label:'Todos los estados'},
              {value:'PENDIENTE',label:'Pendiente'},
              {value:'EN_SEGUIMIENTO',label:'En seguimiento'},
              {value:'OBSERVADO',label:'Observado'},
              {value:'ENTREGADO_CLIENTE',label:'Entregado cliente'},
              {value:'REFRENDADO',label:'Refrendado'},
              {value:'ANULADO',label:'Anulado'},
              {value:'CERRADO',label:'Cerrado'},
              {value:'SIN_REFRENDO',label:'Sin refrendo'},
              {value:'CON_REFRENDO',label:'Refrendo disponible'},
              ...(activeType === 'CARGO_DIRECTO' ? [{value:'PENDIENTE_ENTREGA',label:'Pendiente de entrega'}] : []),
            ]}
            placeholder="Filtrar reporte…"
            clearable={true}
            ariaLabel="Filtrar por estado"
          />
        </div>

        {statusFilter !== 'TODOS' && (
          <div className="oc-active-report-filter">
            <span>Filtro activo: <b>{
              statusFilter === 'SIN_REFRENDO' ? 'Sin refrendo' :
              statusFilter === 'CON_REFRENDO' ? 'Refrendo disponible' :
              statusFilter === 'PENDIENTE_ENTREGA' ? 'Pendiente de entrega' :
              statusLabel(statusFilter)
            }</b></span>
            <button type="button" onClick={()=>setStatusFilter('TODOS')}><X size={13}/> Quitar filtro</button>
          </div>
        )}

        {message && !selected && <div className="inline-message">{message}</div>}

        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando guías…</p></div>
        ) : (
          <div className="table-wrap oc-cargo-table-wrap">
            <table className="oc-cargo-compact-table">
              <thead>
                <tr>
                  <th>Guía</th>
                  <th>Referencia / Documento</th>
                  <th>Fechas</th>
                  <th>Estatus final</th>
                  {activeType === 'ORDEN_COMPRA' && <th>Correo observación</th>}
                  <th>Gestión</th>
                  <th>Refrendo</th>
                  <th>Facturación</th>
                  <th>Seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((guide) => (
                  <tr key={guide.id}>
                    <td className="oc-guide-cell">
                      <b>{guide.guide_no}</b>
                      <small>{guide.warehouse || 'Sin almacén'}</small>
                    </td>
                    <td className="oc-reference-cell">
                      <b>{guide.reference}</b>
                      <small>Doc. {guide.document_no || '—'}</small>
                    </td>
                    <td className="oc-dates-cell">
                      <span><small>EMI</small>{fmtDate(guide.emission_date)}</span>
                      <span><small>REC</small>{fmtDate(guide.reception_at)}</span>
                    </td>
                    <td>
                      <span className={guide.followup?.final_status === 'OBSERVADO' ? 'status-pill danger' : guide.followup?.final_status === 'REFRENDADO' || guide.followup?.final_status === 'CERRADO' ? 'status-pill' : 'status-pill warning'}>
                        {statusLabel(guide.followup?.final_status || 'PENDIENTE')}
                      </span>
                    </td>
                    {activeType === 'ORDEN_COMPRA' && (
                      <td>
                        {guide.followup?.final_status === 'OBSERVADO'
                          ? <button className="secondary-button small-report observation-email-button" onClick={()=>openObservationEmailPreview(guide)}>
                              <Mail size={14}/> {latestObservationEmail(guide) ? 'Ver correo' : 'Ver borrador'}
                            </button>
                          : <span className="oc-email-not-applicable">—</span>}
                      </td>
                    )}
                    <td className="oc-management-cell">
                      <b>{guide.followup?.management_owner || 'Sin encargado'}</b>
                      <small>{guide.followup?.parts_location || 'Sin ubicación'}</small>
                    </td>
                    <td>
                      {latestRefrendo(guide)
                        ? <div className="refrendo-action-group">
                            <button className="secondary-button small-report refrendo-view-button" onClick={()=>viewRefrendo(guide)}><Eye size={14}/> Ver</button>
                            <button className="secondary-button small-report refrendo-download-button" onClick={()=>downloadRefrendo(guide)}><Download size={14}/> Descargar</button>
                          </div>
                        : <span className="status-pill warning">PENDIENTE</span>}
                    </td>
                    <td className="oc-billing-cell">
                      <span className={['ENVIADO','REENVIADO','CONFIRMADO'].includes(guide.followup?.billing_status||'')?'status-pill':'status-pill warning'}>
                        {statusLabel(guide.followup?.billing_status||'PENDIENTE')}
                      </span>
                      <small>{guide.followup?.billing_sent_at ? fmtDate(guide.followup.billing_sent_at) : 'Sin envío'}</small>
                    </td>
                    <td>
                      <button className="secondary-button small-report" onClick={() => openFollowup(guide)}>
                        <Eye size={14} /> {isCommercialView ? 'Ver estado' : 'Ver / Editar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!visible.length && (
              <div className="empty-work">
                <CheckCircle2 size={28} />
                <b>Sin guías para este filtro</b>
                <p>Las guías registradas desde Scanner aparecerán automáticamente en su tipo correspondiente.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {bulkOpen && (
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&!bulkAnalyzing&&!bulkSaving&&setBulkOpen(false)}>
          <section className="modal refrendo-bulk-modal">
            <div className="modal-head">
              <div>
                <h2>Carga masiva de Refrendos</h2>
                <p>Selecciona varios PDF o un PDF unido. KOMTROL identifica la Guía / Referencia, separa páginas y vincula cada refrendo.</p>
              </div>
              <button className="icon-button" disabled={bulkAnalyzing||bulkSaving} onClick={()=>setBulkOpen(false)}><X size={19}/></button>
            </div>

            <label className="refrendo-upload-box">
              <Upload size={24}/>
              <span>
                <b>Seleccionar PDF</b>
                <small>Admite múltiples archivos o un único PDF con varios documentos unidos.</small>
              </span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                disabled={bulkAnalyzing||bulkSaving}
                onChange={(e)=>{
                  const files=Array.from(e.target.files||[])
                  setBulkFiles(files)
                  setBulkPrepared([])
                  setBulkIssues([])
                  setBulkProgress(files.length ? files.length + ' archivo(s) listo(s) para analizar.' : '')
                }}
              />
            </label>

            {bulkFiles.length>0&&(
              <div className="refrendo-file-list">
                {bulkFiles.map((file)=>(
                  <span key={file.name+'-'+file.size}>
                    <FileText size={14}/>
                    <b>{file.name}</b>
                    <small>{Math.max(1,Math.round(file.size/1024))} KB</small>
                  </span>
                ))}
              </div>
            )}

            <div className="refrendo-bulk-actions">
              <button className="secondary-button" disabled={!bulkFiles.length||bulkAnalyzing||bulkSaving} onClick={()=>analyzeBulkFiles(bulkFiles)}>
                {bulkAnalyzing?<RefreshCw className="spin" size={16}/>:<Search size={16}/>}
                {bulkAnalyzing?'Analizando…':'Analizar e individualizar'}
              </button>
              <button className="primary-button" disabled={!bulkPrepared.some((item)=>!item.duplicate)||bulkAnalyzing||bulkSaving} onClick={confirmBulkUpload}>
                {bulkSaving?<RefreshCw className="spin" size={16}/>:<Upload size={16}/>}
                {bulkSaving?'Cargando…':'Confirmar y cargar ' + bulkPrepared.filter((item)=>!item.duplicate).length}
              </button>
            </div>

            {bulkProgress&&<div className="inline-message refrendo-progress">{bulkProgress}</div>}

            {(bulkPrepared.length>0||bulkIssues.length>0)&&(
              <div className="table-wrap refrendo-analysis-table">
                <table>
                  <thead>
                    <tr>
                      <th>Archivo origen</th>
                      <th>Páginas</th>
                      <th>Guía</th>
                      <th>Referencia</th>
                      <th>Lectura</th>
                      <th>Confianza</th>
                      <th>Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPrepared.map((item)=>(
                      <tr key={item.key}>
                        <td><b>{item.sourceFileName}</b></td>
                        <td>{item.pageFrom===item.pageTo?item.pageFrom:item.pageFrom+'-'+item.pageTo}</td>
                        <td>{item.guideNo}</td>
                        <td>{item.reference}</td>
                        <td>{item.extractionMethod==='OCR'?'OCR':'PDF'}</td>
                        <td>{item.confidence}%</td>
                        <td><span className={item.duplicate?'status-pill warning':'status-pill'}>{item.duplicate?'YA REGISTRADO':'LISTO'}</span></td>
                      </tr>
                    ))}
                    {bulkIssues.map((item)=>(
                      <tr key={item.key}>
                        <td><b>{item.sourceFileName}</b></td>
                        <td>{item.pageFrom===item.pageTo?item.pageFrom:item.pageFrom+'-'+item.pageTo}</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td><span className="status-pill danger">REVISAR</span><small>{item.message}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop oc-followup-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeFollowup()}>
          <section className="modal oc-followup-modal">
            <div className="modal-head">
              <div>
                <h2>{selected.guide_type === 'ORDEN_COMPRA' ? 'Seguimiento de Orden de Compra' : 'Seguimiento de Cargo Directo'}</h2>
                <p>{selected.guide_no} · Ref. {selected.reference} · {selected.document_no || 'Sin documento'}</p>
              </div>
              <button className="icon-button" onClick={closeFollowup}><X size={20} /></button>
            </div>

            {message && <div className="inline-message">{message}</div>}

            <div className="oc-followup-summary">
              <div><small>Despacho</small><b>{fmtDate(dispatchDate)}</b></div>
              <div><small>Recepción</small><b>{fmtDate(receptionDate)}</b></div>
              <div><small>Días desde despacho</small><b>{daysFromDispatch ?? '—'}</b></div>
              <div><small>Recepción → cliente</small><b>{daysReceptionToClient ?? '—'}</b></div>
              <div><small>Cliente → refrendo</small><b>{daysClientToRefrendo ?? '—'}</b></div>
            </div>

            {selected.followup?.final_status === 'OBSERVADO' && (
              <div className="oc-observation-email-summary">
                <Mail size={19}/>
                <div>
                  <small>CORREO DE OBSERVACIÓN</small>
                  <b>{latestObservationEmail(selected)?.subject || composeObservationEmail(selected, form, profile?.full_name || 'usuario').subject}</b>
                  <span>
                    {latestObservationEmail(selected)
                      ? `${latestObservationEmail(selected)?.status} · ${latestObservationEmail(selected)?.sent_at ? 'Enviado ' + fmtDate(latestObservationEmail(selected)?.sent_at) : 'Pendiente de envío'}`
                      : 'Borrador generado con los datos de la observación.'}
                  </span>
                </div>
                <button type="button" className="secondary-button" onClick={()=>openObservationEmailPreview(selected)}>
                  <Eye size={15}/> Ver correo
                </button>
              </div>
            )}

            <div className="oc-billing-control">
              <div className="oc-billing-copy">
                <small>FACTURACIÓN</small>
                <b>{statusLabel(selected.followup?.billing_status || form.billing_status || 'PENDIENTE')}</b>
                <span>{selected.followup?.billing_sent_at ? 'Enviado ' + fmtDate(selected.followup.billing_sent_at) + ' · ' + (selected.followup.billing_sent_by_name || 'Usuario KOMTROL') : 'Aún no registra envío a Facturación.'}</span>
              </div>
              <SearchableSelect
                value={form.billing_status}
                onChange={(value)=>setForm({...form,billing_status:(value||'PENDIENTE') as Followup['billing_status']})}
                options={[
                  {value:'PENDIENTE',label:'Pendiente'},
                  {value:'ENVIADO',label:'Enviado'},
                  {value:'OBSERVADO',label:'Observado'},
                  {value:'REENVIADO',label:'Reenviado'},
                  {value:'CONFIRMADO',label:'Confirmado'},
                ]}
                placeholder="Estado Facturación…"
                clearable={false}
                ariaLabel="Estado Facturación"
                disabled={!canUpdateBilling}
              />
              <button type="button" className="primary-button" disabled={saving||!canUpdateBilling||form.billing_status===(selected.followup?.billing_status||'PENDIENTE')} onClick={()=>updateBillingStatus(form.billing_status)}>
                <Send size={15}/> Guardar Facturación
              </button>
            </div>

            {latestRefrendo(selected)&&(
              <div className="oc-refrendo-summary">
                <FileText size={18}/>
                <div>
                  <small>REFRENDOS</small>
                  <b>{latestRefrendo(selected)?.file_name}</b>
                  <span>{selected.refrendos?.length || 1} documento(s) vinculado(s)</span>
                </div>
                <div className="refrendo-action-group">
                  <button type="button" className="secondary-button" onClick={()=>viewRefrendo(selected)}><Eye size={15}/> Ver refrendo</button>
                  <button type="button" className="secondary-button" onClick={()=>downloadRefrendo(selected)}><Download size={15}/> Descargar</button>
                </div>
              </div>
            )}

            <form className="oc-followup-form" onSubmit={saveFollowup}>
              <fieldset className="oc-operational-fieldset span-2" disabled={!canEditOperational}>
              <label>Fecha de entrega al cliente
                <input type="date" value={form.client_delivery_date} onChange={(e) => setForm({ ...form, client_delivery_date: e.target.value })} />
              </label>

              <label>Fecha de entrega del refrendo
                <input type="date" value={form.refrendo_delivery_date} onChange={(e) => setForm({ ...form, refrendo_delivery_date: e.target.value })} />
              </label>

              {selected.guide_type === 'ORDEN_COMPRA' && (
                <label>Valor OC $
                  <div className="input-with-icon"><DollarSign size={15} /><input type="number" min="0" step="0.01" value={form.oc_value_usd} onChange={(e) => setForm({ ...form, oc_value_usd: e.target.value })} /></div>
                </label>
              )}

              <label>Recepcionado por
                <select value={form.received_by} onChange={(e) => setForm({ ...form, received_by: e.target.value as FollowupForm['received_by'] })}>
                  <option value="">Seleccionar</option>
                  <option value="ANTAMINA">ANTAMINA</option>
                  <option value="CONSIGNADO">CONSIGNADO</option>
                  <option value="OTRO">OTRO</option>
                </select>
              </label>

              <label>Estatus final
                <select value={form.final_status} onChange={(e) => setForm({ ...form, final_status: e.target.value as Followup['final_status'] })}>
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="EN_SEGUIMIENTO">EN SEGUIMIENTO</option>
                  <option value="OBSERVADO">OBSERVADO</option>
                  <option value="ENTREGADO_CLIENTE">ENTREGADO A CLIENTE</option>
                  <option value="REFRENDADO">REFRENDADO</option>
                  <option value="ANULADO">ANULADO</option>
                  <option value="CERRADO">CERRADO</option>
                </select>
              </label>

              <label>Encargado de gestión
                <input value={form.management_owner} onChange={(e) => setForm({ ...form, management_owner: e.target.value })} placeholder="Nombre del encargado" />
              </label>

              <label>Ubicación de repuestos
                <div className="input-with-icon"><MapPin size={15} /><input value={form.parts_location} onChange={(e) => setForm({ ...form, parts_location: e.target.value })} placeholder="Ubicación física" /></div>
              </label>

              <label>Fecha de envío Scan
                <input type="date" value={form.scan_sent_date} onChange={(e) => setForm({ ...form, scan_sent_date: e.target.value })} />
              </label>

              <label>Status envío de Scan
                <select value={form.scan_send_status} onChange={(e) => setForm({ ...form, scan_send_status: e.target.value as Followup['scan_send_status'] })}>
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="ENVIADO">ENVIADO</option>
                  <option value="OBSERVADO">OBSERVADO</option>
                  <option value="NO_APLICA">NO APLICA</option>
                </select>
              </label>

              <label className="span-2">Observaciones Almacén Mina
                <textarea rows={3} value={form.mine_warehouse_observations} onChange={(e) => setForm({ ...form, mine_warehouse_observations: e.target.value })} />
              </label>

              <label className="span-2">Observación Almacén KMMP
                <textarea rows={3} value={form.kmmp_warehouse_observation} onChange={(e) => setForm({ ...form, kmmp_warehouse_observation: e.target.value })} />
              </label>

              <label className="span-2">Comentarios para anulación de guía
                <textarea rows={2} value={form.cancellation_comments} onChange={(e) => setForm({ ...form, cancellation_comments: e.target.value })} />
              </label>

              <div className="oc-followup-calculated span-2">
                <div><Clock3 size={15} /><span>Días transc. desde despacho</span><b>{daysFromDispatch ?? '—'}</b></div>
                <div><Clock3 size={15} /><span>Recepción a entrega cliente</span><b>{daysReceptionToClient ?? '—'}</b></div>
                <div><Clock3 size={15} /><span>Cliente a refrendo</span><b>{daysClientToRefrendo ?? '—'}</b></div>
              </div>

              </fieldset>
              <div className="modal-actions span-2 oc-followup-actions">
                <button type="button" className="secondary-button" onClick={closeFollowup}>Cerrar</button>
                {!isCommercialView && (
                  <button type="button" className="secondary-button" disabled={selected.followup?.final_status !== 'OBSERVADO'} onClick={buildEmail}>
                    <Mail size={16} /> Reportar observado
                  </button>
                )}
                {canEditOperational&&<button className="primary-button" disabled={saving}>
                  {saving ? <RefreshCw className="spin" size={16} /> : <Save size={16} />}
                  {saving ? 'Guardando…' : 'Guardar seguimiento'}
                </button>}
              </div>
            </form>

            {observationEmailPreview && (
              <div className="oc-email-preview-overlay">
                <section className="oc-email-preview-card">
                  <div className="oc-email-head">
                    <div>
                      <b>Correo de observación</b>
                      <small>{observationEmailPreview.status === 'BORRADOR' ? 'Borrador generado desde el seguimiento' : `Estado: ${observationEmailPreview.status}`}</small>
                    </div>
                    <button className="icon-button" onClick={()=>setObservationEmailPreview(null)}><X size={17}/></button>
                  </div>

                  <div className="oc-email-preview-meta">
                    <span><small>PARA</small><b>{observationEmailPreview.to_addresses.join('; ') || 'Pendiente de destinatario'}</b></span>
                    <span><small>CC</small><b>{observationEmailPreview.cc_addresses.join('; ') || '—'}</b></span>
                    <span className="span-2"><small>ASUNTO</small><b>{observationEmailPreview.subject}</b></span>
                    {observationEmailPreview.sent_at && <span><small>ENVIADO</small><b>{fmtDate(observationEmailPreview.sent_at)}</b></span>}
                  </div>

                  <pre className="oc-email-preview-body">{observationEmailPreview.body_text}</pre>

                  {observationEmailPreview.error_message && (
                    <div className="inline-message">{observationEmailPreview.error_message}</div>
                  )}

                  <div className="modal-actions">
                    <button type="button" className="secondary-button" onClick={()=>void copyObservationEmailPreview()}><Copy size={15}/> Copiar</button>
                    <button type="button" className="primary-button" onClick={()=>setObservationEmailPreview(null)}>Cerrar</button>
                  </div>
                </section>
              </div>
            )}

            {emailOpen && (
              <div className="oc-email-box">
                <div className="oc-email-head">
                  <div><b>Correo de observación</b><small>Editable antes de enviar.</small></div>
                  <button className="icon-button" onClick={() => setEmailOpen(false)}><X size={17} /></button>
                </div>
                <div className="oc-email-grid">
                  <label>Para
                    <input value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} placeholder="correo@kmmp.com.pe; otro@kmmp.com.pe" />
                  </label>
                  <label>CC
                    <input value={mail.cc} onChange={(e) => setMail({ ...mail, cc: e.target.value })} />
                  </label>
                  <label className="span-2">Asunto
                    <input value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
                  </label>
                  <label className="span-2">Mensaje
                    <textarea rows={10} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
                  </label>
                </div>
                <div className="oc-email-actions">
                  <button className="secondary-button" onClick={copyEmail}><Copy size={15} /> Copiar</button>
                  <button className="secondary-button" onClick={openOutlook}><Mail size={15} /> Abrir en Outlook</button>
                  <button className="primary-button" disabled={sendingEmail || !emails(mail.to).length} onClick={sendEmail}>
                    {sendingEmail ? <RefreshCw className="spin" size={15} /> : <Send size={15} />}
                    {sendingEmail ? 'Enviando…' : 'Enviar desde KOMTROL'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}