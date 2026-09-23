import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Barcode,
  Camera,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Mail,
  PackageSearch,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportRowsToExcel, exportRowsToPdfPortrait } from '../lib/exportUtils'
import { SearchableSelect } from './SearchableSelect'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
type ScopeMode = 'CALLAO' | 'REMOTE'
type DetectionMode = 'VERIFICACION_INVENTARIO' | 'MATERIAL_DANADO'

type Profile = {
  user_id: string
  full_name: string
  role: Role
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
  shift_name?: string | null
}

type Material = {
  material_no: string
  stock_code: string | null
  description: string
  location: string | null
  warehouse: string | null
}

type IncidentAttachment = {
  id: string
  attachment_type: string
  bucket: string
  storage_path: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  created_at: string
}

type Incident = {
  id: string
  incident_no: string
  incident_type: 'FALTANTE' | 'SOBRANTE' | 'DANADO' | 'DIFERENCIA' | 'SIN_DOCUMENTACION' | 'OTRO'
  status: 'ABIERTO' | 'EN_REVISION' | 'NOTIFICADO' | 'CERRADO'
  detection_mode: DetectionMode | null
  guide_no: string | null
  document_no: string | null
  purchase_order: string | null
  barcode_value: string | null
  material_no: string | null
  stock_code: string | null
  description: string | null
  location: string | null
  qty_expected: number | null
  qty_received: number | null
  qty_damaged: number | null
  notes: string | null
  warehouse: string | null
  project: string | null
  group_name: string | null
  shift_name: string | null
  operation_area: string
  auto_email_status: 'PENDIENTE' | 'ENVIANDO' | 'ENVIADO' | 'ERROR' | 'NO_CONFIGURADO'
  created_by: string
  detected_at: string
  created_at: string
  incident_attachments?: IncidentAttachment[]
}

type Props = {
  userId: string
  profile: Profile | null
  scopeMode: ScopeMode
  initialIncidentId?: string | null
  onInitialIncidentOpened?: () => void
}

type FormState = {
  detection_mode: DetectionMode
  guide_no: string
  document_no: string
  purchase_order: string
  barcode_value: string
  material_no: string
  stock_code: string
  description: string
  location: string
  qty_expected: string
  qty_received: string
  qty_damaged: string
  notes: string
}

const emptyForm = (): FormState => ({
  detection_mode: 'VERIFICACION_INVENTARIO',
  guide_no: '',
  document_no: '',
  purchase_order: '',
  barcode_value: '',
  material_no: '',
  stock_code: '',
  description: '',
  location: '',
  qty_expected: '',
  qty_received: '',
  qty_damaged: '',
  notes: '',
})

function incidentNumber(warehouse: string) {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `INC-${warehouse || 'ALM'}-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2,5).toUpperCase()}`
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",;\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function normalizeMaterialCode(value: unknown) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function materialBaseCode(value: unknown) {
  return normalizeMaterialCode(value).replace(/^[A-Z]{1,4}(?=\d)/, '')
}

function materialDistance(left: string, right: string) {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length

  let prev = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    const next = [i]
    for (let j = 1; j <= right.length; j++) {
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      )
    }
    prev = next
  }
  return prev[right.length]
}

function materialSimilarity(left: string, right: string) {
  const a = normalizeMaterialCode(left)
  const b = normalizeMaterialCode(right)
  if (!a || !b) return 0
  return Math.max(0, Math.round((1 - materialDistance(a, b) / Math.max(a.length, b.length)) * 100))
}

function scoreMaterialMatch(material: Material, rawCode: string) {
  const query = normalizeMaterialCode(rawCode)
  const full = normalizeMaterialCode(material.material_no)
  const base = materialBaseCode(material.material_no)
  const queryBase = materialBaseCode(query)

  if (!query || !full) return { score: 0, kind: 'SIN_COINCIDENCIA' }
  if (full === query) return { score: 100, kind: 'EXACTA' }
  if (base && base === query) return { score: 99, kind: 'SIN_PREFIJO' }
  if (queryBase && base === queryBase) return { score: 98, kind: 'PREFIJO_PARCIAL' }
  if (full.endsWith(query) && query.length >= 5) return { score: 97, kind: 'SUFIJO' }

  const fuzzy = Math.max(
    materialSimilarity(query, full),
    materialSimilarity(query, base),
    materialSimilarity(queryBase, base)
  )
  return { score: fuzzy, kind: 'APROXIMADA' }
}

function labelEmailStatus(value: Incident['auto_email_status']) {
  if (value === 'ENVIADO') return 'Correo enviado'
  if (value === 'ENVIANDO') return 'Enviando correo'
  if (value === 'NO_CONFIGURADO') return 'Falta destinatario'
  if (value === 'ERROR') return 'Error de correo'
  return 'Correo pendiente'
}

export function ReceivingIncidentModule({ userId, profile, scopeMode, initialIncidentId, onInitialIncidentOpened }: Props) {
  const readOnly = profile?.role === 'SUPERVISOR'
  const [warehouses, setWarehouses] = useState<string[]>([])
  const [warehouse, setWarehouse] = useState(
    scopeMode === 'CALLAO'
      ? 'CALLAO'
      : (profile?.warehouse && profile.warehouse !== 'CALLAO' ? profile.warehouse : 'ANTAMINA')
  )
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [form, setForm] = useState<FormState>(emptyForm())
  const [editing, setEditing] = useState<Incident | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lookingMaterial, setLookingMaterial] = useState(false)
  const [message, setMessage] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [evidencePreview, setEvidencePreview] = useState<{ url: string; name: string } | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const zxingControlsRef = useRef<any>(null)

  async function loadWarehouses() {
    if (scopeMode === 'CALLAO' || profile?.role !== 'ADMINISTRADOR') return
    const { data } = await supabase
      .from('warehouses')
      .select('name')
      .eq('active', true)
      .neq('code', 'CALLAO')
      .order('name')
    const names = (data ?? []).map((row: any) => String(row.name))
    setWarehouses(names)
    if (!names.includes(warehouse) && names.length) setWarehouse(names[0])
  }

  async function reload() {
    setLoading(true)
    setMessage('')

    let query = supabase
      .from('incidents')
      .select('*, incident_attachments(id,attachment_type,bucket,storage_path,file_name,content_type,size_bytes,created_at)')
      .eq('warehouse', warehouse)
      .order('detected_at', { ascending: false })
      .limit(2000)

    query = scopeMode === 'CALLAO'
      ? query.eq('operation_area', 'INBOUND')
      : query.eq('operation_area', 'GENERAL')

    const { data, error } = await query
    if (error) setMessage(error.message)
    setIncidents((data ?? []) as Incident[])
    setLoading(false)
  }

  useEffect(() => {
    loadWarehouses()
  }, [scopeMode, profile?.role])

  useEffect(() => {
    reload()
  }, [warehouse, scopeMode])

  useEffect(() => () => {
    stopScanner()
    if (photoPreview) URL.revokeObjectURL(photoPreview)
  }, [photoPreview])

  const difference = useMemo(() => {
    const required = Number(form.qty_expected)
    const arrived = Number(form.qty_received)
    if (form.detection_mode !== 'VERIFICACION_INVENTARIO') return null
    if (form.qty_expected === '' || form.qty_received === '' || !Number.isFinite(required) || !Number.isFinite(arrived)) return null
    return arrived - required
  }, [form.qty_expected, form.qty_received, form.detection_mode])

  const detectedType = useMemo(() => {
    if (form.detection_mode === 'MATERIAL_DANADO') return 'DANADO'
    if (difference == null) return null
    if (difference > 0) return 'SOBRANTE'
    if (difference < 0) return 'FALTANTE'
    return 'SIN_DIFERENCIA'
  }, [form.detection_mode, difference])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return incidents
    return incidents.filter((row) =>
      [
        row.incident_no,
        row.incident_type,
        row.guide_no,
        row.purchase_order,
        row.material_no,
        row.stock_code,
        row.description,
        row.status,
        row.auto_email_status,
      ].some((value) => String(value ?? '').toLowerCase().includes(q))
    )
  }, [incidents, search])

  function clearPhotoSelection() {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview('')
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  function chooseEvidencePhoto(file?: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setMessage('La evidencia debe ser una imagen.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('La foto supera 5 MB. Toma una foto con menor resolución.')
      return
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setMessage('Foto de evidencia lista para guardar con la incidencia.')
  }

  async function uploadIncidentPhoto(incidentId: string, file: File) {
    const ext = (file.name.split('.').pop() || file.type.split('/').pop() || 'jpg')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'jpg'
    const safeWarehouse = (warehouse || 'almacen').toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const storagePath = `${safeWarehouse}/${incidentId}/${Date.now()}-${userId.slice(0, 8)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('incident-evidence')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'image/jpeg',
      })

    if (uploadError) return uploadError.message

    const { error: attachmentError } = await supabase
      .from('incident_attachments')
      .insert({
        incident_id: incidentId,
        attachment_type: 'FOTO',
        bucket: 'incident-evidence',
        storage_path: storagePath,
        file_name: file.name || `evidencia-${Date.now()}.${ext}`,
        content_type: file.type || 'image/jpeg',
        size_bytes: file.size,
        uploaded_by: userId,
      })

    if (attachmentError) {
      await supabase.storage.from('incident-evidence').remove([storagePath])
      return attachmentError.message
    }

    return null
  }

  async function viewEvidence(row: Incident) {
    const photo = (row.incident_attachments ?? []).find((item) => item.attachment_type === 'FOTO')
    if (!photo) {
      setMessage('Esta incidencia no tiene foto de evidencia.')
      return
    }

    const { data, error } = await supabase.storage
      .from(photo.bucket || 'incident-evidence')
      .createSignedUrl(photo.storage_path, 600)

    if (error || !data?.signedUrl) {
      setMessage(error?.message || 'No se pudo abrir la evidencia.')
      return
    }

    setEvidencePreview({ url: data.signedUrl, name: photo.file_name })
  }

  function openNew() {
    clearPhotoSelection()
    setEditing(null)
    setForm(emptyForm())
    setShowForm(true)
    setMessage('')
  }

  function openEdit(row: Incident) {
    clearPhotoSelection()
    setEditing(row)
    setForm({
      detection_mode: row.detection_mode || (row.incident_type === 'DANADO' ? 'MATERIAL_DANADO' : 'VERIFICACION_INVENTARIO'),
      guide_no: row.guide_no || '',
      document_no: row.document_no || '',
      purchase_order: row.purchase_order || '',
      barcode_value: row.barcode_value || '',
      material_no: row.material_no || '',
      stock_code: row.stock_code || '',
      description: row.description || '',
      location: row.location || '',
      qty_expected: row.qty_expected == null ? '' : String(row.qty_expected),
      qty_received: row.qty_received == null ? '' : String(row.qty_received),
      qty_damaged: row.qty_damaged == null ? '' : String(row.qty_damaged),
      notes: row.notes || '',
    })
    setShowForm(true)
    setMessage('')
  }

  useEffect(() => {
    if (!initialIncidentId) return
    let cancelled = false

    async function openInitialIncident() {
      const { data, error } = await supabase
        .from('incidents')
        .select('*, incident_attachments(id,attachment_type,bucket,storage_path,file_name,content_type,size_bytes,created_at)')
        .eq('id', initialIncidentId)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        setMessage(error.message)
        return
      }
      if (!data) {
        setMessage('No se encontró la incidencia seleccionada desde Alertas.')
        return
      }

      const incident = data as Incident
      if (scopeMode === 'CALLAO' && incident.operation_area !== 'INBOUND') {
        setMessage('Esta incidencia pertenece a otra operación.')
        return
      }
      if (scopeMode === 'REMOTE' && incident.operation_area === 'INBOUND') {
        setMessage('Esta incidencia pertenece a Inbound Callao.')
        return
      }

      if (incident.warehouse && incident.warehouse !== warehouse) {
        setWarehouse(incident.warehouse)
      }
      openEdit(incident)
      onInitialIncidentOpened?.()
    }

    openInitialIncident()
    return () => { cancelled = true }
  }, [initialIncidentId, scopeMode])

  async function lookupMaterial(rawCode?: string) {
    const code = String(rawCode ?? form.material_no ?? '').trim()
    if (!code) return

    setLookingMaterial(true)
    setMessage('')

    const normalized = normalizeMaterialCode(code)
    const base = materialBaseCode(normalized)
    const fields = 'material_no,stock_code,description,location,warehouse'

    let rows: Material[] = []
    let lookupError: { message?: string } | null = null

    // 1) Coincidencia exacta por número de parte (sin distinguir mayúsculas/minúsculas).
    const exactResult = await supabase
      .from('materials')
      .select(fields)
      .eq('status', 'ACTIVO')
      .ilike('material_no', normalized)
      .limit(20)

    if (exactResult.error) lookupError = exactResult.error
    rows = (exactResult.data ?? []) as Material[]

    // 2) Coincidencia exacta por Stock Code.
    if (!rows.length && !lookupError) {
      const stockResult = await supabase
        .from('materials')
        .select(fields)
        .eq('status', 'ACTIVO')
        .ilike('stock_code', normalized)
        .limit(20)
      if (stockResult.error) lookupError = stockResult.error
      rows = (stockResult.data ?? []) as Material[]
    }

    // 3) El scanner puede omitir total o parcialmente el prefijo.
    // Ej.: R54639F1 debe encontrar KTR54639F1.
    if (!rows.length && !lookupError && base.length >= 4) {
      const partialResult = await supabase
        .from('materials')
        .select(fields)
        .eq('status', 'ACTIVO')
        .ilike('material_no', `%${base}%`)
        .limit(100)
      if (partialResult.error) lookupError = partialResult.error
      rows = (partialResult.data ?? []) as Material[]
    }

    // 4) Si todavía no hay candidatos, usar los últimos caracteres para recuperar
    // posibles lecturas incompletas y evaluar similitud en el cliente.
    if (!rows.length && !lookupError && normalized.length >= 5) {
      const tail = normalized.slice(-Math.min(6, normalized.length))
      const tailResult = await supabase
        .from('materials')
        .select(fields)
        .eq('status', 'ACTIVO')
        .ilike('material_no', `%${tail}%`)
        .limit(150)
      if (tailResult.error) lookupError = tailResult.error
      rows = (tailResult.data ?? []) as Material[]
    }

    // 5) Último recurso: evaluar el Master activo completo. Actualmente el Master
    // tiene pocos miles de registros, por lo que esta ruta solo se usa si las
    // búsquedas anteriores no devolvieron candidatos.
    if (!rows.length && !lookupError && normalized.length >= 5) {
      const masterResult = await supabase
        .from('materials')
        .select(fields)
        .eq('status', 'ACTIVO')
        .limit(5000)
      if (masterResult.error) lookupError = masterResult.error
      rows = (masterResult.data ?? []) as Material[]
    }

    setLookingMaterial(false)

    if (lookupError) {
      setMessage(lookupError.message || 'No se pudo consultar el Master de Materiales.')
      return
    }

    const ranked = rows
      .map((material) => ({ material, ...scoreMaterialMatch(material, code) }))
      .filter((item) => item.score >= 72)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        const aWarehouse = a.material.warehouse === warehouse ? 1 : 0
        const bWarehouse = b.material.warehouse === warehouse ? 1 : 0
        if (bWarehouse !== aWarehouse) return bWarehouse - aWarehouse
        return a.material.material_no.localeCompare(b.material.material_no)
      })

    const best = ranked[0]

    if (!best) {
      setForm((prev) => ({
        ...prev,
        barcode_value: rawCode ? code : prev.barcode_value,
        material_no: code.toUpperCase(),
      }))
      setMessage(`No se encontró una coincidencia confiable para “${code}” en el Master. Revisa el código o completa el material manualmente.`)
      return
    }

    setForm((prev) => ({
      ...prev,
      barcode_value: rawCode ? code : prev.barcode_value,
      material_no: best.material.material_no,
      stock_code: best.material.stock_code || '',
      description: best.material.description || '',
      location: best.material.location || '',
    }))

    if (best.score >= 95) {
      setMessage(
        best.kind === 'EXACTA'
          ? `Material ${best.material.material_no} cargado desde el Master.`
          : `Coincidencia validada: “${code}” → ${best.material.material_no} (${best.score}%). Datos completados desde el Master.`
      )
    } else {
      setMessage(
        `Coincidencia aproximada: “${code}” → ${best.material.material_no} (${best.score}%). Verifica el material antes de registrar la incidencia.`
      )
    }
  }

  function stopScanner() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (zxingControlsRef.current?.stop) {
      try { zxingControlsRef.current.stop() } catch {}
    }
    zxingControlsRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function acceptScan(code: string) {
    const clean = code.trim()
    if (!clean) return
    stopScanner()
    setScannerOpen(false)
    setScannerMessage('')
    await lookupMaterial(clean)
  }

  async function startScanner() {
    setScannerOpen(true)
    setScannerMessage('Solicitando cámara…')

    await new Promise((resolve) => setTimeout(resolve, 50))

    const video = videoRef.current
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('Este navegador no permite usar la cámara. Ingresa el código manualmente.')
      return
    }

    try {
      const NativeDetector = (window as any).BarcodeDetector

      if (NativeDetector) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        streamRef.current = stream
        video.srcObject = stream
        await video.play()
        setScannerMessage('Apunta la cámara al código de barras.')

        const detector = new NativeDetector({
          formats: ['code_128','code_39','ean_13','ean_8','upc_a','upc_e','itf','qr_code','data_matrix'],
        })

        const detect = async () => {
          if (!streamRef.current || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const rawValue = codes?.[0]?.rawValue
            if (rawValue) {
              await acceptScan(String(rawValue))
              return
            }
          } catch {}
          rafRef.current = requestAnimationFrame(detect)
        }
        rafRef.current = requestAnimationFrame(detect)
        return
      }

      setScannerMessage('Cargando lector compatible con tu celular…')
      const moduleUrl = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm'
      const ZXing: any = await import(/* @vite-ignore */ moduleUrl)
      const reader = new ZXing.BrowserMultiFormatReader()
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        video,
        (result: any) => {
          const value = result?.getText?.()
          if (value) acceptScan(String(value))
        }
      )
      zxingControlsRef.current = controls
      setScannerMessage('Apunta la cámara al código de barras.')
    } catch (error: any) {
      stopScanner()
      setScannerMessage(
        error?.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Habilítalo en el navegador o ingresa el código manualmente.'
          : 'No se pudo iniciar la cámara. Puedes ingresar el código manualmente.'
      )
    }
  }

  async function saveIncident(event: FormEvent) {
    event.preventDefault()
    if (readOnly) return
    setMessage('')

    if (!warehouse) {
      setMessage('No se pudo determinar el almacén del usuario.')
      return
    }
    if (!form.material_no.trim()) {
      setMessage('Ingresa o escanea el número de parte/material.')
      return
    }

    if (form.detection_mode === 'VERIFICACION_INVENTARIO') {
      const required = Number(form.qty_expected)
      const arrived = Number(form.qty_received)
      if (form.qty_expected === '' || form.qty_received === '' || required < 0 || arrived < 0) {
        setMessage('Cantidad requerida y cantidad llegada son obligatorias y no pueden ser negativas.')
        return
      }
      if (required === arrived) {
        setMessage('Las cantidades coinciden. No existe incidencia y no se generará correo.')
        return
      }
    } else {
      const damaged = Number(form.qty_damaged)
      if (!form.qty_damaged || !Number.isFinite(damaged) || damaged <= 0) {
        setMessage('Ingresa una cantidad dañada mayor a cero.')
        return
      }
    }

    setSaving(true)

    const payload = {
      detection_mode: form.detection_mode,
      guide_no: form.guide_no.trim() || null,
      document_no: form.document_no.trim() || null,
      purchase_order: form.purchase_order.trim() || null,
      barcode_value: form.barcode_value.trim() || null,
      material_no: form.material_no.trim(),
      stock_code: form.stock_code.trim() || null,
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      qty_expected: form.detection_mode === 'VERIFICACION_INVENTARIO' ? Number(form.qty_expected) : null,
      qty_received: form.detection_mode === 'VERIFICACION_INVENTARIO' ? Number(form.qty_received) : null,
      qty_damaged: form.detection_mode === 'MATERIAL_DANADO' ? Number(form.qty_damaged) : null,
      notes: form.notes.trim() || null,
      warehouse,
      project: scopeMode === 'CALLAO' ? 'INBOUND CALLAO' : (profile?.project || null),
      group_name: scopeMode === 'CALLAO' ? 'INBOUND' : (profile?.group_name || null),
      shift_name: profile?.shift_name || null,
      operation_area: scopeMode === 'CALLAO' ? 'INBOUND' : 'GENERAL',
      auto_email_status: 'PENDIENTE',
      updated_at: new Date().toISOString(),
    }

    let saved: Incident | null = null

    if (editing) {
      const { data, error } = await supabase
        .from('incidents')
        .update(payload)
        .eq('id', editing.id)
        .select('*')
        .single()
      if (error || !data) {
        setSaving(false)
        setMessage(error?.message || 'No se pudo actualizar la incidencia.')
        return
      }
      saved = data as Incident
      let evidenceError = ''
      if (photoFile) evidenceError = (await uploadIncidentPhoto(saved.id, photoFile)) || ''
      setMessage(
        evidenceError
          ? `Incidencia actualizada, pero la foto no pudo guardarse: ${evidenceError}`
          : 'Incidencia actualizada. Usa el botón de correo si deseas reenviar la notificación.'
      )
    } else {
      const { data, error } = await supabase
        .from('incidents')
        .insert({
          ...payload,
          incident_no: incidentNumber(warehouse),
          incident_type: form.detection_mode === 'MATERIAL_DANADO' ? 'DANADO' : 'DIFERENCIA',
          status: 'ABIERTO',
          created_by: userId,
          detected_at: new Date().toISOString(),
        })
        .select('*')
        .single()

      if (error || !data) {
        setSaving(false)
        setMessage(error?.message || 'No se pudo registrar la incidencia.')
        return
      }

      saved = data as Incident

      let evidenceError = ''
      if (photoFile) evidenceError = (await uploadIncidentPhoto(saved.id, photoFile)) || ''

      const { data: emailData, error: emailError } = await supabase.functions.invoke(
        'send-outlook-notification',
        { body: { incidentId: saved.id } }
      )

      if (emailError || !emailData?.ok) {
        const emailMessage = emailData?.error || emailError?.message || 'correo pendiente'
        setMessage(
          evidenceError
            ? `Incidencia ${saved.incident_type} registrada. Foto pendiente: ${evidenceError}. Correo pendiente: ${emailMessage}`
            : `Incidencia ${saved.incident_type} registrada. El envío automático quedó pendiente: ${emailMessage}`
        )
      } else {
        setMessage(
          evidenceError
            ? `Incidencia ${saved.incident_type} registrada y correo enviado, pero la foto no pudo guardarse: ${evidenceError}`
            : photoFile
              ? `Incidencia ${saved.incident_type} registrada, foto guardada y adjuntada al correo automático.`
              : `Incidencia ${saved.incident_type} registrada y correo automático enviado.`
        )
      }
    }

    setSaving(false)
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm())
    clearPhotoSelection()
    await reload()
  }

  async function resendEmail(row: Incident) {
    setMessage('')
    const { data, error } = await supabase.functions.invoke('send-outlook-notification', {
      body: { incidentId: row.id },
    })
    if (error || !data?.ok) {
      setMessage(data?.error || error?.message || 'No se pudo enviar el correo.')
    } else {
      setMessage('Correo de incidencia enviado correctamente.')
    }
    await reload()
  }

  async function deleteIncident(row: Incident) {
    if (readOnly) return
    if (!window.confirm(`¿Eliminar ${row.incident_no}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('incidents').delete().eq('id', row.id)
    if (error) setMessage(error.message)
    else {
      setMessage('Incidencia eliminada.')
      await reload()
    }
  }

  const incidentExportRows = visible.map((row) => ({
    incident_no: row.incident_no,
    detected_at: formatDate(row.detected_at),
    warehouse: row.warehouse || '',
    option: row.detection_mode === 'VERIFICACION_INVENTARIO' ? 'VERIFICACIÓN DE INVENTARIO' : 'MATERIAL DAÑADO',
    result: row.incident_type,
    guide_no: row.guide_no || '',
    purchase_order: row.purchase_order || '',
    barcode_value: row.barcode_value || '',
    material_no: row.material_no || '',
    stock_code: row.stock_code || '',
    description: row.description || '',
    location: row.location || '',
    qty_expected: row.qty_expected ?? '',
    qty_received: row.qty_received ?? '',
    difference: row.qty_expected != null && row.qty_received != null ? Number(row.qty_received) - Number(row.qty_expected) : '',
    qty_damaged: row.qty_damaged ?? '',
    status: row.status,
    email: row.auto_email_status || '',
  }))

  const incidentExcelColumns = [
    { header:'INCIDENCIA', key:'incident_no', width:18 },
    { header:'FECHA', key:'detected_at', width:18 },
    { header:'ALMACÉN', key:'warehouse', width:18 },
    { header:'OPCIÓN', key:'option', width:28 },
    { header:'RESULTADO', key:'result', width:18 },
    { header:'N° EMBARQUE O GUÍA', key:'guide_no', width:22 },
    { header:'OC', key:'purchase_order', width:18 },
    { header:'CÓDIGO LEÍDO', key:'barcode_value', width:20 },
    { header:'MATERIAL', key:'material_no', width:18 },
    { header:'STOCK CODE', key:'stock_code', width:16 },
    { header:'DESCRIPCIÓN', key:'description', width:38 },
    { header:'UBICACIÓN', key:'location', width:18 },
    { header:'CANT. REQUERIDA', key:'qty_expected', width:16 },
    { header:'CANT. LLEGADA', key:'qty_received', width:16 },
    { header:'DIFERENCIA', key:'difference', width:14 },
    { header:'CANT. DAÑADA', key:'qty_damaged', width:14 },
    { header:'ESTADO', key:'status', width:16 },
    { header:'CORREO', key:'email', width:16 },
  ]

  const incidentPdfColumns = [
    { header:'INCIDENCIA', key:'incident_no' },
    { header:'FECHA', key:'detected_at' },
    { header:'RESULTADO', key:'result' },
    { header:'GUÍA / OC', key:'guide_no' },
    { header:'MATERIAL', key:'material_no' },
    { header:'SC', key:'stock_code' },
    { header:'UBICACIÓN', key:'location' },
    { header:'REQ.', key:'qty_expected' },
    { header:'LLEG.', key:'qty_received' },
    { header:'DIF.', key:'difference' },
    { header:'ESTADO', key:'status' },
  ]

  function exportIncidentsExcel() {
    exportRowsToExcel(
      `KOMTROL_Incidencias_${warehouse}`,
      'Incidencias',
      incidentExcelColumns,
      incidentExportRows,
      [['Almacén', warehouse], ['Registros', incidentExportRows.length]]
    )
  }

  function exportIncidentsPdf() {
    exportRowsToPdfPortrait(
      `KOMTROL_Incidencias_${warehouse}`,
      'KOMTROL · Incidencias de Recepción',
      incidentPdfColumns,
      incidentExportRows,
      { subtitle: `Almacén: ${warehouse}`, summary: [['Registros', incidentExportRows.length]] }
    )
  }

  return (
    <div className="receiving-incidents">
      <section className="panel receiving-hero">
        <div>
          <span className="status-pill"><PackageSearch size={14}/> {scopeMode === 'CALLAO' ? 'CALLAO · INBOUND' : 'ALMACÉN REMOTO'}</span>
          <h3>Incidencias de Recepción</h3>
          <p>Solo dos opciones: verificación de inventario o material dañado. KOMTROL determina automáticamente faltante o sobrante.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" disabled={!visible.length} onClick={exportIncidentsPdf}><FileText size={16}/> PDF</button>
          <button className="secondary-button" disabled={!visible.length} onClick={exportIncidentsExcel}><FileSpreadsheet size={16}/> Excel</button>
          {!readOnly && <button className="primary-button" onClick={openNew}><AlertTriangle size={16}/> Detectar incidencia</button>}
        </div>
      </section>

      {profile?.role === 'ADMINISTRADOR' && scopeMode === 'REMOTE' && (
        <section className="panel receiving-warehouse-select">
          <label>Almacén remoto
            <SearchableSelect
              value={warehouse}
              onChange={(value)=>value&&setWarehouse(value)}
              options={warehouses.map((name)=>({value:name,label:name}))}
              placeholder="Buscar almacén…"
              clearable={false}
              ariaLabel="Filtrar por almacén remoto"
            />
          </label>
        </section>
      )}

      {message && <div className="inline-message">{message}</div>}

      <section className="panel">
        <div className="panel-title">
          <div><h3>Registro de incidencias · {warehouse}</h3><p>La fecha y el estado de correo quedan trazados automáticamente.</p></div>
          <button className="icon-button" onClick={reload}><RefreshCw size={17}/></button>
        </div>

        <div className="task-toolbar">
          <div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar incidencia, guía, OC, material o stock code…"/></div>
        </div>

        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando incidencias…</p></div>
        ) : (
          <div className="table-wrap">
            <table className="receiving-table">
              <thead><tr><th>Fecha</th><th>Incidencia</th><th>Material</th><th>Resultado</th><th>Cantidades</th><th>Correo</th><th>Acciones</th></tr></thead>
              <tbody>
                {visible.map((row) => {
                  const diff = row.qty_expected != null && row.qty_received != null
                    ? Number(row.qty_received) - Number(row.qty_expected)
                    : null
                  return <tr key={row.id}>
                    <td>{formatDate(row.detected_at)}</td>
                    <td><b>{row.incident_no}</b><small>{row.detection_mode === 'MATERIAL_DANADO' ? 'Material dañado' : 'Verificación inventario'}</small></td>
                    <td><b>{row.material_no || '—'}</b><small>{row.stock_code || ''}{row.description ? ` · ${row.description}` : ''}</small></td>
                    <td><span className={row.incident_type === 'FALTANTE' ? 'status-pill danger' : row.incident_type === 'SOBRANTE' ? 'status-pill warning' : 'status-pill'}>{row.incident_type}</span></td>
                    <td>
                      {row.detection_mode === 'VERIFICACION_INVENTARIO'
                        ? <><b>Req. {row.qty_expected ?? '—'} / Lleg. {row.qty_received ?? '—'}</b><small>Diferencia: {diff == null ? '—' : Math.abs(diff)}</small></>
                        : <><b>Dañado: {row.qty_damaged ?? '—'}</b><small>{row.notes || ''}</small></>}
                    </td>
                    <td><span className={row.auto_email_status === 'ENVIADO' ? 'status-pill' : row.auto_email_status === 'ERROR' || row.auto_email_status === 'NO_CONFIGURADO' ? 'status-pill danger' : 'status-pill warning'}>{labelEmailStatus(row.auto_email_status)}</span></td>
                    <td><div className="row-actions">
                      {(row.incident_attachments ?? []).some((item)=>item.attachment_type === 'FOTO') && <button className="icon-button" title="Ver foto de evidencia" onClick={()=>viewEvidence(row)}><ImagePlus size={14}/></button>}
                      {!readOnly && <button className="icon-button" title="Editar" onClick={()=>openEdit(row)}><Edit3 size={14}/></button>}
                      {!readOnly && <button className="icon-button" title="Enviar / reenviar correo" onClick={()=>resendEmail(row)}><Mail size={14}/></button>}
                      {!readOnly && <button className="icon-button danger-icon" title="Eliminar" onClick={()=>deleteIncident(row)}><Trash2 size={14}/></button>}
                      {readOnly && <span className="read-only-note">Solo lectura</span>}
                    </div></td>
                  </tr>
                })}
              </tbody>
            </table>
            {!visible.length && <div className="empty-work"><CheckCircle2 size={28}/><b>Sin incidencias registradas</b><p>Cuando exista un faltante, sobrante o material dañado aparecerá aquí.</p></div>}
          </div>
        )}
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setShowForm(false)}>
          <form className="modal receiving-modal" onSubmit={saveIncident}>
            <div className="modal-head">
              <div><h2>{editing ? 'Editar incidencia' : 'Detectar incidencia de recepción'}</h2><p>{warehouse} · {profile?.group_name || 'Operación'} · {profile?.shift_name || 'Sin guardia'}</p></div>
              <button type="button" className="icon-button" onClick={()=>setShowForm(false)}><X size={19}/></button>
            </div>

            <div className="incident-option-grid">
              <button type="button" className={form.detection_mode === 'VERIFICACION_INVENTARIO' ? 'incident-option active' : 'incident-option'} onClick={()=>setForm({...form,detection_mode:'VERIFICACION_INVENTARIO',qty_damaged:''})}>
                <PackageSearch size={22}/>
                <span><b>1. Verificación de inventario</b><small>Compara cantidad requerida vs cantidad llegada.</small></span>
              </button>
              <button type="button" className={form.detection_mode === 'MATERIAL_DANADO' ? 'incident-option active' : 'incident-option'} onClick={()=>setForm({...form,detection_mode:'MATERIAL_DANADO',qty_expected:'',qty_received:''})}>
                <AlertTriangle size={22}/>
                <span><b>2. Material dañado</b><small>Registra cantidad dañada y observación.</small></span>
              </button>
            </div>

            <div className="barcode-material-card">
              <div className="barcode-material-actions">
                <button type="button" className="primary-button" onClick={startScanner}><Camera size={16}/> Escanear con cámara</button>
                <span><Barcode size={16}/> {form.barcode_value || 'Sin código leído'}</span>
              </div>
              <div className="form-grid">
                <label>N° parte / material
                  <div className="material-lookup-input">
                    <input value={form.material_no} onChange={(e)=>setForm({...form,material_no:e.target.value})} onBlur={()=>lookupMaterial()} placeholder="Escanea o ingresa el número de parte"/>
                    <button type="button" className="icon-button" disabled={lookingMaterial} onClick={()=>lookupMaterial()}>{lookingMaterial?<RefreshCw className="spin" size={15}/>:<Search size={15}/>}</button>
                  </div>
                </label>
                <label>Stock Code<input value={form.stock_code} onChange={(e)=>setForm({...form,stock_code:e.target.value})}/></label>
                <label className="span-2">Descripción<input value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label>
                <label>Ubicación<input value={form.location} onChange={(e)=>setForm({...form,location:e.target.value})}/></label>
                <label>Guía<input value={form.guide_no} onChange={(e)=>setForm({...form,guide_no:e.target.value})}/></label>
                <label>N° Embarque o Guía<input value={form.document_no} onChange={(e)=>setForm({...form,document_no:e.target.value})}/></label>
                <label>OC<input value={form.purchase_order} onChange={(e)=>setForm({...form,purchase_order:e.target.value})}/></label>
              </div>
            </div>

            <div className="incident-evidence-card">
              <div className="incident-evidence-head">
                <div>
                  <b>Foto del material</b>
                  <small>Evidencia fotográfica de la condición recibida.</small>
                </div>
                <button type="button" className="secondary-button" onClick={()=>photoInputRef.current?.click()}>
                  <Camera size={16}/> {photoFile ? 'Cambiar foto' : 'Tomar foto'}
                </button>
              </div>
              <input
                ref={photoInputRef}
                className="evidence-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e)=>chooseEvidencePhoto(e.target.files?.[0])}
              />
              {photoPreview ? (
                <div className="incident-evidence-preview">
                  <img src={photoPreview} alt="Vista previa de evidencia"/>
                  <div>
                    <b>{photoFile?.name || 'Foto de evidencia'}</b>
                    <small>{photoFile ? `${(photoFile.size / 1024 / 1024).toFixed(2)} MB` : ''}</small>
                    <button type="button" className="secondary-button" onClick={clearPhotoSelection}>Quitar</button>
                  </div>
                </div>
              ) : editing && (editing.incident_attachments ?? []).some((item)=>item.attachment_type === 'FOTO') ? (
                <button type="button" className="evidence-existing-button" onClick={()=>viewEvidence(editing)}>
                  <ImagePlus size={17}/> Ver evidencia existente
                </button>
              ) : (
                <div className="incident-evidence-empty">
                  <ImagePlus size={20}/>
                  <span>Sin foto. En celular se abrirá directamente la cámara posterior.</span>
                </div>
              )}
            </div>

            {form.detection_mode === 'VERIFICACION_INVENTARIO' ? (
              <div className="inventory-verification-card">
                <div className="verification-quantities">
                  <label>Cantidad requerida<input type="number" min="0" step="any" value={form.qty_expected} onChange={(e)=>setForm({...form,qty_expected:e.target.value})}/></label>
                  <span>VS</span>
                  <label>Cantidad llegada<input type="number" min="0" step="any" value={form.qty_received} onChange={(e)=>setForm({...form,qty_received:e.target.value})}/></label>
                </div>

                <div className={detectedType === 'FALTANTE' ? 'verification-result shortage' : detectedType === 'SOBRANTE' ? 'verification-result surplus' : detectedType === 'SIN_DIFERENCIA' ? 'verification-result equal' : 'verification-result'}>
                  {detectedType === 'FALTANTE' && <><AlertTriangle size={20}/><div><b>FALTANTE</b><span>Faltan {Math.abs(difference || 0)} unidad(es).</span></div></>}
                  {detectedType === 'SOBRANTE' && <><PackageSearch size={20}/><div><b>SOBRANTE</b><span>Sobran {Math.abs(difference || 0)} unidad(es).</span></div></>}
                  {detectedType === 'SIN_DIFERENCIA' && <><CheckCircle2 size={20}/><div><b>SIN INCIDENCIA</b><span>La cantidad llegada coincide con la requerida.</span></div></>}
                  {!detectedType && <><Barcode size={20}/><div><b>Esperando cantidades</b><span>KOMTROL calculará el resultado automáticamente.</span></div></>}
                </div>
              </div>
            ) : (
              <div className="damaged-material-card">
                <label>Cantidad dañada<input type="number" min="0" step="any" value={form.qty_damaged} onChange={(e)=>setForm({...form,qty_damaged:e.target.value})}/></label>
                <span className="status-pill danger"><AlertTriangle size={14}/> Resultado automático: DAÑADO</span>
              </div>
            )}

            <label className="receiving-notes">Observaciones
              <textarea rows={3} value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="Detalle adicional de la incidencia…"/>
            </label>

            {!editing && (
              <div className="auto-email-note">
                <Mail size={18}/>
                <div><b>Correo automático</b><span>Al guardar una incidencia, KOMTROL intentará enviarla automáticamente al destinatario configurado para {warehouse}, incluyendo fecha y detalle.</span></div>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={()=>setShowForm(false)}>Cancelar</button>
              <button className="primary-button" disabled={saving || detectedType === 'SIN_DIFERENCIA'}>
                {saving?<RefreshCw className="spin" size={16}/>:<Save size={16}/>}
                {saving ? 'Guardando…' : editing ? 'Actualizar incidencia' : 'Registrar incidencia'}
              </button>
            </div>
          </form>
        </div>
      )}

      {evidencePreview && (
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setEvidencePreview(null)}>
          <section className="modal evidence-view-modal">
            <div className="modal-head">
              <div><h2>Evidencia fotográfica</h2><p>{evidencePreview.name}</p></div>
              <button className="icon-button" onClick={()=>setEvidencePreview(null)}><X size={19}/></button>
            </div>
            <img src={evidencePreview.url} alt="Evidencia de incidencia"/>
          </section>
        </div>
      )}

      {scannerOpen && (
        <div className="modal-backdrop scanner-backdrop" onMouseDown={(e)=>{ if(e.target===e.currentTarget){ stopScanner(); setScannerOpen(false) } }}>
          <section className="modal barcode-scanner-modal">
            <div className="modal-head">
              <div><h2>Lector de código de barras</h2><p>Usa la cámara posterior del celular.</p></div>
              <button className="icon-button" onClick={()=>{stopScanner();setScannerOpen(false)}}><X size={19}/></button>
            </div>
            <div className="scanner-frame">
              <video ref={videoRef} muted playsInline />
              <div className="scanner-guide"><span/></div>
            </div>
            <p className="scanner-message">{scannerMessage}</p>
          </section>
        </div>
      )}
    </div>
  )
}
