import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportRowsToExcel, exportRowsToPdfPortrait } from '../lib/exportUtils'
import { prewarmGuideOcr, recognizeGuideImage } from '../lib/guideImageOcr'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'

type Profile = {
  user_id: string
  full_name: string
  role: Role
  warehouse?: string | null
}

type GuideType = 'REPOSICION' | 'ORDEN_COMPRA' | 'CARGO_DIRECTO' | 'OTRO'

type Guide = {
  id: string
  guide_no: string
  document_no: string | null
  emission_date: string | null
  transfer_start_date: string | null
  date_source: 'DOCUMENTO' | 'INICIO_TRASLADO' | 'FECHA_CARGA'
  reception_at: string
  reference: string
  line_count: number
  guide_type: GuideType
  warehouse: string | null
  responsible_user_id: string
  status: string
  notes: string | null
  ocr_confidence: number | null
  created_at: string
}

type GuideLine = {
  line_no: number
  part_no: string
  description: string
  quantity: string
  unit: string
}

type Mode = 'scanner' | 'seguimiento' | 'oc-cargos' | 'reposicion'

type Props = {
  mode: Mode
  userId: string
  profile: Profile | null
  initialSearch?: string | null
  onInitialSearchApplied?: () => void
}

type BatchScanStatus = 'PENDIENTE' | 'PROCESANDO' | 'LISTO' | 'REVISAR' | 'ERROR' | 'GUARDADO'

type BatchScanResult = {
  text: string
  confidence: number
  parsed: ReturnType<typeof parseGuideOcr>
  sourceLabel: string
}

type BatchScanItem = {
  id: string
  generation: number
  file: File
  status: BatchScanStatus
  progress: number
  error?: string
  result?: BatchScanResult
}

const emptyLine = (): GuideLine => ({ line_no: 1, part_no: '', description: '', quantity: '', unit: 'UND' })

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeIntegerQuantity(value: string | number | null | undefined) {
  const raw = String(value ?? '').trim().replace(',', '.')
  if (!raw) return ''
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return ''
  return String(Math.max(1, Math.round(parsed)))
}

function classifyReference(reference: string): GuideType {
  const ref = reference.replace(/\s/g, '')
  if (ref.startsWith('89')) return 'REPOSICION'
  if (ref.startsWith('80')) return 'ORDEN_COMPRA'
  return ref ? 'CARGO_DIRECTO' : 'OTRO'
}

function isoDateFromText(raw?: string | null) {
  if (!raw) return ''
  const match = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (!match) return ''
  const [, dd, mm, yyyy] = match
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  const date = new Date(iso + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return ''
  if (date.getTime() > Date.now() + 86400000) return ''
  return iso
}

function findDateNear(text: string, labels: string[]) {
  const normalized = text.replace(/\r/g, '')
  for (const label of labels) {
    const pattern = new RegExp(`${label}[^\\d]{0,30}(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{4})`, 'i')
    const match = normalized.match(pattern)
    const parsed = isoDateFromText(match?.[1])
    if (parsed) return parsed
  }
  return ''
}

const MATERIAL_UNITS = ['UND', 'EA', 'PC', 'PZ', 'PIE', 'FT', 'M', 'MT'] as const

function isMaterialUnit(value: string) {
  return MATERIAL_UNITS.includes(value.toUpperCase() as typeof MATERIAL_UNITS[number])
}

function parseReplenishmentLines(text: string): GuideLine[] {
  const normalized = text.replace(/\r/g, '')
  const tableStart = normalized.search(/DESCRIPCI[ÓO]N/i)
  const tableEndMatch = normalized.match(/\n\s*(?:NOTA\s*:|OBSERVACIONES?\s*:|REPRESENTACI[ÓO]N\s+IMPRESA)/i)
  const tableEnd = tableEndMatch?.index ?? normalized.length
  const section = tableStart >= 0 ? normalized.slice(tableStart, tableEnd) : normalized

  const rows = section
    .split('\n')
    .map((row) => row.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const byLine = new Map<number, GuideLine>()

  // Caso principal: PDF reconstruido por coordenadas.
  // 1 19T6066D5 PIN, BOOM BUMPER - PHLB01A01 4.000 UND 88.00 KG 0.0392
  for (const row of rows) {
    const match = row.match(
      /^(\d{1,3})\s+([A-Z0-9][A-Z0-9._/-]{3,})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(UND|EA|PC|PZ|PIE|FT|M|MT)\b/i
    )
    if (!match) continue

    const lineNo = Number(match[1])
    if (lineNo < 1 || lineNo > 999) continue

    byLine.set(lineNo, {
      line_no: lineNo,
      part_no: match[2].trim(),
      description: cleanText(match[3]),
      quantity: normalizeIntegerQuantity(match[4]),
      unit: match[5].toUpperCase(),
    })
  }

  // Respaldo: algunos PDF separan cada celda en un renglón distinto:
  // 1 / 19T6066D5 / DESCRIPCIÓN / 4.000 / UND / peso / KG / volumen
  for (let index = 0; index < rows.length; index++) {
    const lineToken = rows[index]
    if (!/^\d{1,3}$/.test(lineToken)) continue

    const lineNo = Number(lineToken)
    if (lineNo < 1 || lineNo > 999 || byLine.has(lineNo)) continue

    let cursor = index + 1
    while (cursor < rows.length && !rows[cursor]) cursor++
    const partNo = rows[cursor] ?? ''

    const validPart =
      /^[A-Z0-9][A-Z0-9._/-]{3,}$/i.test(partNo) &&
      !/^\d+(?:[.,]\d+)?$/.test(partNo) &&
      !isMaterialUnit(partNo) &&
      !/^(KG|DESCRIPCI[ÓO]N|COD\.?(?:CLIENTE)?|CANTIDAD|PESO|VOLUMEN)/i.test(partNo)

    if (!validPart) continue
    cursor++

    const descriptionParts: string[] = []
    let quantity = ''
    let unit = ''

    while (cursor < rows.length) {
      const current = rows[cursor]

      // Cantidad y UM en la misma fila: "4.000 UND"
      const qtyUnit = current.match(/^(\d+(?:[.,]\d+)?)\s+(UND|EA|PC|PZ|PIE|FT|M|MT)$/i)
      if (qtyUnit) {
        quantity = normalizeIntegerQuantity(qtyUnit[1])
        unit = qtyUnit[2].toUpperCase()
        break
      }

      // Cantidad y UM en filas separadas: "4.000" / "UND"
      if (/^\d+(?:[.,]\d+)?$/.test(current)) {
        const next = rows[cursor + 1] ?? ''
        if (isMaterialUnit(next)) {
          quantity = normalizeIntegerQuantity(current)
          unit = next.toUpperCase()
          break
        }
      }

      // Si aparece el siguiente correlativo sin hallar cantidad, la fila no es válida.
      if (/^\d{1,3}$/.test(current) && Number(current) === lineNo + 1) break

      descriptionParts.push(current)
      cursor++
    }

    if (!quantity || !unit || !descriptionParts.length) continue

    byLine.set(lineNo, {
      line_no: lineNo,
      part_no: partNo,
      description: cleanText(descriptionParts.join(' ')),
      quantity,
      unit,
    })
  }

  return [...byLine.values()]
    .sort((a, b) => a.line_no - b.line_no)
    .slice(0, 999)
}

function parseLines(text: string): GuideLine[] {
  const normalized = text.replace(/\r/g, '')
  const tableStart = normalized.search(/DESCRIPCI[ÓO]N/i)

  // En fotografías no aceptamos números aislados fuera de la tabla.
  // Esto evita que RUC, peso, fechas o códigos de cabecera se cuenten como líneas.
  if (tableStart < 0) return []

  const rest = normalized.slice(tableStart)
  const tableEndMatch = rest.match(/\n\s*(?:NOTA\s*:|OBSERVACIONES?\s*:|REPRESENTACI[ÓO]N\s+IMPRESA|AUTORIZADA\s+MEDIANTE)/i)
  const section = tableEndMatch?.index != null ? rest.slice(0, tableEndMatch.index) : rest

  const rows = section
    .split('\n')
    .map((row) => row.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const output: GuideLine[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const numbered = row.match(
      /^(\d{1,3})\s+([A-Z0-9][A-Z0-9._/-]{3,})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(UND|EA|PC|PZ|PIE|FT|M|MT)\b/i
    )

    const unnumbered = row.match(
      /^([A-Z0-9][A-Z0-9._/-]{4,})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(UND|EA|PC|PZ|PIE|FT|M|MT)\b/i
    )

    const match = numbered || unnumbered
    if (!match) continue

    const partNo = numbered ? match[2] : match[1]
    if (/^(FECHA|GUIA|GUÍA|REFERENCIA|DOCUMENTO|RUC|PUNTO|RAZON|DOMICILIO|CANTIDAD|PESO|VOLUMEN)/i.test(partNo)) continue

    const description = cleanText(numbered ? match[3] : match[2])
    const quantity = normalizeIntegerQuantity(numbered ? match[4] : match[3])
    const unit = String(numbered ? match[5] : match[4]).toUpperCase()

    if (!description || !quantity || !unit) continue

    const key = `${partNo.toUpperCase()}|${description.toUpperCase()}|${quantity}`
    if (seen.has(key)) continue
    seen.add(key)

    const requestedLine = numbered ? Number(match[1]) : output.length + 1
    const safeLine = requestedLine >= 1 && requestedLine <= 999 ? requestedLine : output.length + 1

    output.push({
      line_no: safeLine,
      part_no: partNo,
      description,
      quantity,
      unit,
    })

    if (output.length >= 999) break
  }

  return output
    .sort((a, b) => a.line_no - b.line_no)
    .map((line, index) => ({ ...line, line_no: index + 1 }))
}

function guideFromFileName(fileName?: string) {
  if (!fileName) return ''
  const normalized = fileName.toUpperCase().replace(/[–—_]/g, '-')
  return normalized.match(/\b[A-Z]\d{3}-\d{8}\b/)?.[0] ||
    normalized.match(/\bT\d{3}\s*-\s*\d{8}\b/)?.[0]?.replace(/\s/g, '') ||
    ''
}

function detectDocumentLineCount(text: string) {
  const rows = text.replace(/\r/g, '').split('\n').map((row) => row.trim()).filter(Boolean)
  const candidates: number[] = []
  let maxInlineLine = 0

  for (const row of rows) {
    // Reconstrucción por coordenadas del PDF:
    // "6 DESCRIPCION MATERIAL 2.000 UND KG"
    const leading = row.match(/^(\d{1,3})\s+(.+)$/)
    if (leading) {
      const lineNo = Number(leading[1])
      const remainder = leading[2]

      // Una línea de material normalmente contiene texto descriptivo y
      // cantidad/unidad; usamos esto para excluir números de cabecera.
      const looksLikeMaterial =
        /[A-ZÁÉÍÓÚÑ]{2,}/i.test(remainder) &&
        (
          /\d+(?:[.,]\d+)?\s*(?:UND|EA|PC|PZ|PIE|FT|M|MT|KG)\b/i.test(remainder) ||
          remainder.length >= 12
        )

      if (looksLikeMaterial && lineNo >= 1 && lineNo <= 999) {
        candidates.push(lineNo)
        maxInlineLine = Math.max(maxInlineLine, lineNo)
      }
    }

    const strict = row.match(/^(\d{1,3})\s+.+?\s+\d+(?:[.,]\d+)?\s+(?:UND|EA|PC|PZ|PIE|FT|M|MT)\b/i)
    if (strict) {
      maxInlineLine = Math.max(maxInlineLine, Number(strict[1]))
    }
  }

  // Buscar la secuencia correlativa 1..N aunque PDF.js haya separado
  // algunos elementos de la tabla en distintos items.
  const unique = [...new Set(candidates)].sort((a, b) => a - b)
  let sequentialCount = 0
  if (unique[0] === 1) {
    sequentialCount = 1
    for (let expected = 2; expected <= unique.length + 1; expected++) {
      if (unique.includes(expected)) sequentialCount = expected
      else break
    }
  }

  // Respaldo para PDFs cuyo número quedó como item aislado.
  const standaloneNumbers = rows
    .filter((row) => /^\d{1,3}$/.test(row))
    .map(Number)
    .filter((value) => value >= 1 && value <= 999)

  if (standaloneNumbers.length) {
    const standaloneSet = new Set(standaloneNumbers)
    let count = standaloneSet.has(1) ? 1 : 0
    while (count && standaloneSet.has(count + 1)) count += 1
    sequentialCount = Math.max(sequentialCount, count)
  }

  return Math.max(maxInlineLine, sequentialCount)
}

function extractObservations(text: string) {
  const normalized = text.replace(/\r/g, '')
  const match = normalized.match(
    /OBSERVACIONES?\s*:\s*([\s\S]*?)(?=\s*(?:KMONCCA\b|REPRESENTACI[ÓO]N\s+IMPRESA\b|AUTORIZADA\s+MEDIANTE\b|SU\s+COMPROBANTE\b|---\s*P[ÁA]GINA\b)|$)/i
  )
  if (!match) return ''

  return match[1]
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeOcrIdentifierText(text: string) {
  return text
    .toUpperCase()
    .replace(/[–—−]/g, '-')
    .replace(/(?<=\d)[OQ](?=\d)/g, '0')
    .replace(/(?<=\d)[IL](?=\d)/g, '1')
}

function extractGuideNumber(text: string, fileName?: string) {
  const normalized = normalizeOcrIdentifierText(text)

  const candidates = [
    normalized.match(/(?:GU[IÍ]A(?:\s+DE\s+REMISI[ÓO]N)?[^A-Z0-9]{0,30}|N[°ºO]?\s*)?(T|I|1)\s*([0-9OQ]{3})\s*[- ]\s*([0-9OQ]{8})/i),
    normalized.match(/\b(T|I|1)([0-9OQ]{3})[- ]?([0-9OQ]{8})\b/i),
  ]

  for (const match of candidates) {
    if (!match) continue
    const prefix = 'T'
    const series = String(match[2] ?? '').replace(/[OQ]/g, '0')
    const number = String(match[3] ?? '').replace(/[OQ]/g, '0')
    if (/^\d{3}$/.test(series) && /^\d{8}$/.test(number)) {
      return `${prefix}${series}-${number}`
    }
  }

  return guideFromFileName(fileName)
}

function extractReferenceValue(text: string) {
  const normalized = normalizeOcrIdentifierText(text)

  // Prioriza el campo rotulado "Referencia" para no confundir RUC, peso o códigos internos.
  const labelled = normalized.match(
    /REFEREN(?:CIA)?\s*[:#-]?\s*([8B][0-9OQ\s./-]{7,32})/i
  )
  if (labelled?.[1]) {
    const cleaned = labelled[1]
      .replace(/[OQ]/g, '0')
      .replace(/^B/, '8')
      .replace(/\s+/g, '')
      .replace(/[^0-9./-]/g, '')
      .replace(/[.-]+$/g, '')
    const digits = cleaned.replace(/\D/g, '')
    if (digits.startsWith('8') && digits.length >= 8) return cleaned
  }

  const globalCandidates = [...normalized.matchAll(/\b[8B][0-9OQ]{7,17}\b/g)]
    .map((match) => match[0].replace(/^B/, '8').replace(/[OQ]/g, '0'))
    .filter((value) => /^8\d{7,17}$/.test(value))

  return globalCandidates.find((value) => value.startsWith('89')) ||
    globalCandidates.find((value) => value.startsWith('80')) ||
    globalCandidates[0] ||
    ''
}

function parseGuideOcr(text: string, fileName?: string, visualOcr = false) {
  const normalized = normalizeOcrIdentifierText(text)
  const guide = extractGuideNumber(text, fileName)
  const reference = extractReferenceValue(text)

  const docMatch =
    normalized.match(/(?:N[°ºO]?\s*(?:DE\s*)?DOCUMENTO|DOCUMENTO)\s*[:#-]?\s*([A-Z0-9-]{4,})/i) ||
    normalized.match(/(?:DOCUMENTO\s*(?:RELACIONADO|REFERENCIA))\s*[:#-]?\s*([A-Z0-9-]{4,})/i)
  const documentNo = docMatch?.[1] || ''

  const emission = findDateNear(normalized, ['FECHA\\s*(?:DE\\s*)?EMISI[ÓO]N', 'EMISI[ÓO]N'])
  const transferStart = findDateNear(normalized, ['FECHA\\s*(?:DE\\s*)?INICIO\\s*(?:DE\\s*)?TRASLADO', 'INICIO\\s*(?:DE\\s*)?TRASLADO'])
  const dateSource = emission ? 'DOCUMENTO' : transferStart ? 'INICIO_TRASLADO' : 'FECHA_CARGA'
  // No inventar una fecha de emisión. Si OCR no la encuentra, el usuario debe validarla.
  // La fecha de carga ya se registra por separado en reception_at.
  const emissionDate = emission || transferStart || ''

  const explicitLines =
    normalized.match(/(?:CANTIDAD\s*(?:DE\s*)?L[IÍ]NEAS|N[°ºO]?\s*(?:DE\s*)?L[IÍ]NEAS|TOTAL\s*(?:DE\s*)?L[IÍ]NEAS|L[IÍ]NEAS)\s*[:#-]?\s*(\d{1,3})/i)

  const replenishment = reference.startsWith('89')
  const parsedLines = replenishment
    ? parseReplenishmentLines(text)
    : parseLines(text)

  const numberedLineCount = detectDocumentLineCount(text)
  const highestParsedLine = parsedLines.reduce((max, line) => Math.max(max, line.line_no), 0)
  const lineCount = explicitLines
    ? Number(explicitLines[1])
    : visualOcr
      ? (highestParsedLine || parsedLines.length || 1)
      : replenishment
        ? Math.max(highestParsedLine, numberedLineCount, parsedLines.length, 1)
        : numberedLineCount || Math.max(parsedLines.length, 1)
  const observations = extractObservations(text)

  return {
    guide_no: guide,
    reference,
    document_no: documentNo,
    emission_date: emissionDate,
    transfer_start_date: transferStart,
    date_source: dateSource as 'DOCUMENTO' | 'INICIO_TRASLADO' | 'FECHA_CARGA',
    guide_type: classifyReference(reference),
    line_count: lineCount,
    observations,
    lines: parsedLines,
  }
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function GuidesModule({ mode, userId, profile, initialSearch, onInitialSearchApplied }: Props) {
  const [guides, setGuides] = useState<Guide[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const pdfRef = useRef<HTMLInputElement | null>(null)
  const [batchItems, setBatchItems] = useState<BatchScanItem[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const batchItemsRef = useRef<BatchScanItem[]>([])
  const batchQueueRef = useRef<BatchScanItem[]>([])
  const batchRunningRef = useRef(false)
  const batchGenerationRef = useRef(0)
  const selectedBatchIdRef = useRef<string | null>(null)

  const [form, setForm] = useState({
    guide_no: '',
    document_no: '',
    emission_date: '',
    transfer_start_date: '',
    date_source: 'FECHA_CARGA' as 'DOCUMENTO' | 'INICIO_TRASLADO' | 'FECHA_CARGA',
    reference: '',
    line_count: '1',
    guide_type: 'OTRO' as GuideType,
    supplier: 'KOMATSU' as 'KOMATSU' | 'CUMMINS',
    warehouse: profile?.warehouse ?? '',
    status: 'VALIDADO',
    notes: '',
    ocr_text: '',
    ocr_confidence: '',
  })
  const [lines, setLines] = useState<GuideLine[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [duplicateGuide, setDuplicateGuide] = useState<{
    id: string
    guide_no: string
    reference: string
    created_at: string
    warehouse: string | null
    status: string
  } | null>(null)

  async function reload() {
    setLoading(true)
    const [guideRes, profileRes] = await Promise.all([
      supabase.from('guides').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('user_profiles').select('user_id,full_name,role,warehouse').eq('active', true).order('full_name'),
    ])
    if (guideRes.error) setMessage(guideRes.error.message)
    setGuides((guideRes.data ?? []) as Guide[])
    setProfiles((profileRes.data ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [userId])

  useEffect(() => {
    if (mode !== 'scanner') return
    void prewarmGuideOcr().catch(() => {
      // El OCR seguirá intentando cargar cuando el usuario seleccione una imagen.
    })
  }, [mode])

  useEffect(() => {
    if (!initialSearch) return
    setSearch(initialSearch)
    onInitialSearchApplied?.()
  }, [initialSearch])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function updateBatchItems(updater: (items: BatchScanItem[]) => BatchScanItem[]) {
    setBatchItems((current) => {
      const next = updater(current)
      batchItemsRef.current = next
      return next
    })
  }

  function updateBatchItem(id: string, changes: Partial<BatchScanItem>) {
    updateBatchItems((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  function setSelectedBatch(nextId: string | null) {
    selectedBatchIdRef.current = nextId
    setSelectedBatchId(nextId)
  }

  function setPreviewForFile(nextFile: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (nextFile?.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(nextFile))
    } else {
      setPreviewUrl('')
    }
  }

  function loadBatchItem(item: BatchScanItem) {
    setSelectedBatch(item.id)
    setDuplicateGuide(null)
    setFile(item.file)
    setPreviewForFile(item.file)
    setScanProgress(item.progress)

    if (item.result) {
      applyOcrResult(
        item.result.text,
        item.result.confidence,
        item.file,
        item.result.sourceLabel,
        true,
      )
      setMessage(
        item.status === 'REVISAR'
          ? 'Lectura terminada con campos pendientes. Revisa N° guía y referencia antes de confirmar.'
          : 'Guía lista para validar. Mientras revisas, KOMTROL continúa procesando el resto del lote.'
      )
    } else {
      setForm((prev) => ({
        ...prev,
        guide_no: '',
        document_no: '',
        emission_date: '',
        transfer_start_date: '',
        date_source: 'FECHA_CARGA',
        reference: '',
        line_count: '1',
        guide_type: 'OTRO',
        supplier: 'KOMATSU',
        status: 'VALIDADO',
        notes: '',
        ocr_text: '',
        ocr_confidence: '',
      }))
      setLines([emptyLine()])

      if (item.status === 'PROCESANDO') {
        setMessage('Esta guía se está procesando. Puedes revisar otra mientras termina.')
      } else if (item.status === 'ERROR') {
        setMessage(item.error || 'No se pudo procesar esta imagen.')
      } else {
        setMessage('Guía en cola de reconocimiento.')
      }
    }
  }

  function selectBatchById(id: string) {
    const item = batchItemsRef.current.find((row) => row.id === id)
    if (item) loadBatchItem(item)
  }

  async function processBatchQueue() {
    if (batchRunningRef.current) return
    batchRunningRef.current = true

    const cores = Number((navigator as any)?.hardwareConcurrency ?? 4)
    const memory = Number((navigator as any)?.deviceMemory ?? 4)
    const concurrency = cores >= 6 && memory >= 4 ? 2 : 1

    const runWorker = async () => {
      while (batchQueueRef.current.length) {
        const item = batchQueueRef.current.shift()
        if (!item) continue

        updateBatchItem(item.id, { status: 'PROCESANDO', progress: 2, error: undefined })

        try {
          const ocr = await recognizeGuideImage(item.file, (progress) => {
            updateBatchItem(item.id, { progress })
            if (selectedBatchIdRef.current === item.id) {
              setScanProgress(progress)
            }
          })

          const parsed = parseGuideOcr(ocr.text, item.file.name, true)
          const ready = Boolean(parsed.guide_no && parsed.reference)
          const result: BatchScanResult = {
            text: ocr.text,
            confidence: ocr.confidence,
            parsed,
            sourceLabel: ocr.method === 'HEADER_FAST'
              ? 'Imagen · lectura rápida'
              : 'Imagen · cabecera + tabla',
          }

          const completedItem: BatchScanItem = {
            ...item,
            status: ready ? 'LISTO' : 'REVISAR',
            progress: 100,
            result,
          }

          updateBatchItem(item.id, {
            status: completedItem.status,
            progress: 100,
            result,
          })

          if (!selectedBatchIdRef.current || selectedBatchIdRef.current === item.id) {
            loadBatchItem(completedItem)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
          updateBatchItem(item.id, {
            status: 'ERROR',
            progress: 100,
            error: errorMessage,
          })
          if (selectedBatchIdRef.current === item.id) {
            setMessage(`No se pudo reconocer esta guía: ${errorMessage}`)
          }
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: concurrency }, () => runWorker()))
    } finally {
      batchRunningRef.current = false

      // Si se agregaron nuevas fotos justo cuando terminaban los workers,
      // relanzamos la cola sin que el usuario tenga que tocar nada.
      if (batchQueueRef.current.length) {
        void processBatchQueue()
      }
    }
  }

  function enqueueGuidePhotos(files: File[]) {
    const images = files.filter((item) => item.type.startsWith('image/'))
    if (!images.length) {
      setMessage('Selecciona imágenes JPG, PNG o fotos de la cámara.')
      return
    }

    const room = Math.max(0, 60 - batchItemsRef.current.length)
    const accepted = images.slice(0, room)
    if (!accepted.length) {
      setMessage('El lote actual ya tiene 60 guías. Termina o limpia el lote para continuar.')
      return
    }

    const stamp = Date.now()
    const generation = batchGenerationRef.current
    const items: BatchScanItem[] = accepted.map((nextFile, index) => ({
      id: `${stamp}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      generation,
      file: nextFile,
      status: 'PENDIENTE',
      progress: 0,
    }))

    updateBatchItems((current) => [...current, ...items])
    batchQueueRef.current.push(...items)

    if (!selectedBatchIdRef.current && items[0]) {
      setSelectedBatch(items[0].id)
      setFile(items[0].file)
      setPreviewForFile(items[0].file)
      setMessage(`Lote recibido: ${accepted.length} guía${accepted.length === 1 ? '' : 's'}. KOMTROL las procesará en segundo plano mientras validas las primeras.`)
    } else {
      setMessage(`${accepted.length} guía${accepted.length === 1 ? '' : 's'} agregada${accepted.length === 1 ? '' : 's'} a la cola.`)
    }

    if (images.length > accepted.length) {
      setMessage(`Se agregaron ${accepted.length} fotos. El máximo por lote es 60 guías.`)
    }

    void processBatchQueue()
  }

  function clearBatch() {
    batchGenerationRef.current += 1
    batchQueueRef.current = []
    updateBatchItems(() => [])
    setSelectedBatch(null)
    resetForm()
    setMessage('Lote limpiado. Puedes iniciar una nueva carga.')
  }

  function advanceToNextBatch(afterId: string) {
    const candidates = batchItemsRef.current.filter((item) =>
      item.id !== afterId &&
      item.status !== 'GUARDADO' &&
      item.status !== 'ERROR'
    )
    const next =
      candidates.find((item) => item.status === 'LISTO') ||
      candidates.find((item) => item.status === 'REVISAR') ||
      candidates.find((item) => item.status === 'PROCESANDO') ||
      candidates.find((item) => item.status === 'PENDIENTE')

    if (next) {
      loadBatchItem(next)
    } else {
      setSelectedBatch(null)
    }
  }

  function resetForm() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    setFile(null)
    setScanProgress(0)
    setDuplicateGuide(null)
    setForm({
      guide_no: '',
      document_no: '',
      emission_date: '',
      transfer_start_date: '',
      date_source: 'FECHA_CARGA',
      reference: '',
      line_count: '1',
      guide_type: 'OTRO',
      supplier: 'KOMATSU',
      warehouse: profile?.warehouse ?? '',
      status: 'VALIDADO',
      notes: '',
      ocr_text: '',
      ocr_confidence: '',
    })
    setLines([emptyLine()])
  }

  async function selectFile(nextFile?: File) {
    if (!nextFile) return
    setSelectedBatch(null)
    setMessage('')
    setDuplicateGuide(null)
    setFile(nextFile)

    // Cada documento empieza limpio. Evita que una guía nueva herede
    // observaciones, fechas o referencias del archivo anterior.
    setForm((prev) => ({
      ...prev,
      guide_no: '',
      document_no: '',
      emission_date: '',
      transfer_start_date: '',
      date_source: 'FECHA_CARGA',
      reference: '',
      line_count: '1',
      guide_type: 'OTRO',
      supplier: 'KOMATSU',
      status: 'VALIDADO',
      notes: '',
      ocr_text: '',
      ocr_confidence: '',
    }))
    setLines([emptyLine()])
    setScanProgress(0)

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(nextFile.type.startsWith('image/') ? URL.createObjectURL(nextFile) : '')

    const isPdf = nextFile.type === 'application/pdf' || /\.pdf$/i.test(nextFile.name)
    if (nextFile.type.startsWith('image/')) {
      await runImageOcr(nextFile)
    } else if (isPdf) {
      await runPdfOcr(nextFile)
    } else {
      setMessage('Formato no compatible para OCR. Usa PDF, JPG o PNG.')
    }
  }

  function applyOcrResult(text: string, confidence: number, sourceFile: File, sourceLabel: string, visualOcr = false) {
    const parsed = parseGuideOcr(text, sourceFile.name, visualOcr)
    const parsedLines = parsed.lines.length ? parsed.lines : [emptyLine()]
    const fallbackGuide = guideFromFileName(sourceFile.name)

    setForm((prev) => ({
      ...prev,
      guide_no: parsed.guide_no || fallbackGuide || prev.guide_no,
      document_no: parsed.document_no || prev.document_no,
      emission_date: parsed.emission_date || prev.emission_date,
      transfer_start_date: parsed.transfer_start_date || prev.transfer_start_date,
      date_source: parsed.date_source,
      reference: parsed.reference || prev.reference,
      line_count: String(parsed.line_count || Number(prev.line_count || 1)),
      guide_type: parsed.reference ? parsed.guide_type : prev.guide_type,
      notes: parsed.observations || '',
      ocr_text: text,
      ocr_confidence: confidence > 0 ? confidence.toFixed(1) : '',
    }))
    setLines(parsedLines)

    const detected = [
      parsed.guide_no || fallbackGuide ? 'guía' : '',
      parsed.reference ? 'referencia' : '',
      parsed.document_no ? 'N° documento' : '',
      parsed.emission_date ? 'fecha' : '',
      parsed.lines.length ? `${parsed.lines.length} línea${parsed.lines.length === 1 ? '' : 's'}` : '',
      parsed.observations ? 'observaciones' : '',
    ].filter(Boolean)

    setMessage(
      detected.length
        ? `${sourceLabel} procesado. Se detectó: ${detected.join(', ')}. Revisa los campos antes de confirmar.`
        : `${sourceLabel} procesado, pero no se identificaron suficientes campos. Revisa el documento y completa lo necesario.`
    )
  }

  async function runImageOcr(imageFile: File) {
    setScanning(true)
    setScanProgress(2)
    setMessage('Preparando lectura rápida de la guía…')
    try {
      const result = await recognizeGuideImage(imageFile, (progress, status) => {
        setScanProgress(progress)
        if (status) setMessage(status)
      })
      applyOcrResult(
        result.text,
        result.confidence,
        imageFile,
        result.method === 'HEADER_FAST' ? 'Imagen · lectura rápida' : 'Imagen · cabecera + tabla',
        true,
      )
    } catch (error) {
      setMessage(`No se pudo completar el OCR de la imagen: ${error instanceof Error ? error.message : 'error desconocido'}.`)
    } finally {
      setScanning(false)
      setScanProgress(100)
    }
  }

  async function runPdfOcr(pdfFile: File) {
    setScanning(true)
    setScanProgress(2)
    setMessage('Leyendo PDF…')
    try {
      const pdfModuleUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs'
      const pdfWorkerUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs'
      const pdfjs: any = await import(/* @vite-ignore */ pdfModuleUrl)
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

      const bytes = new Uint8Array(await pdfFile.arrayBuffer())
      const pdf = await pdfjs.getDocument({ data: bytes }).promise
      const pageLimit = Math.min(pdf.numPages, 5)
      let extractedText = ''

      // 1) Intentar primero extraer texto real del PDF. Es más rápido y preciso
      // para guías generadas digitalmente.
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
        setMessage(`Leyendo texto del PDF · página ${pageNumber} de ${pageLimit}…`)
        setScanProgress(Math.round((pageNumber / pageLimit) * 25))
        const page = await pdf.getPage(pageNumber)
        const content = await page.getTextContent()

        // Reconstruir renglones usando las coordenadas reales del PDF.
        // PDF.js no siempre entrega saltos de línea; sin esto una guía de
        // 6 o 128 posiciones puede convertirse en una sola línea de texto.
        type PositionedText = { text: string; x: number; y: number; width: number }

        const positioned: PositionedText[] = (content.items as any[])
          .map((item: any): PositionedText => ({
            text: typeof item?.str === 'string' ? item.str.trim() : '',
            x: Number(item?.transform?.[4] ?? 0),
            y: Number(item?.transform?.[5] ?? 0),
            width: Number(item?.width ?? 0),
          }))
          .filter((item: PositionedText) => Boolean(item.text))

        positioned.sort((a: any, b: any) => {
          const yDiff = b.y - a.y
          return Math.abs(yDiff) > 2.5 ? yDiff : a.x - b.x
        })

        const rowGroups: Array<{ y: number; items: PositionedText[] }> = []
        for (const item of positioned) {
          const group = rowGroups.find((row) => Math.abs(row.y - item.y) <= 2.5)
          if (group) {
            group.items.push(item)
            group.y = (group.y + item.y) / 2
          } else {
            rowGroups.push({ y: item.y, items: [item] })
          }
        }

        rowGroups.sort((a, b) => b.y - a.y)
        const pageText = rowGroups
          .map((row) => row.items
            .sort((a, b) => a.x - b.x)
            .map((item) => item.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim())
          .filter(Boolean)
          .join('\n')

        extractedText += `\n--- PÁGINA ${pageNumber} ---\n${pageText}\n`
      }

      const compactText = extractedText.replace(/\s+/g, ' ').trim()
      const directParsed = parseGuideOcr(extractedText, pdfFile.name)
      const needsLineOcr =
        directParsed.line_count <= 1 &&
        directParsed.lines.length === 0
      const digitallyReadable =
        compactText.length >= 120 &&
        Boolean(directParsed.guide_no || directParsed.reference) &&
        !needsLineOcr

      if (digitallyReadable) {
        setScanProgress(100)
        // La extracción textual no entrega un porcentaje de confianza de OCR.
        // Se usa 99 para indicar lectura directa del PDF.
        applyOcrResult(extractedText, 99, pdfFile, `PDF digital (${pageLimit} página${pageLimit > 1 ? 's' : ''})`)
        return
      }

      // 2) Si el PDF es escaneado, renderizar cada página y ejecutar OCR.
      setMessage(needsLineOcr
        ? 'Cabecera leída, pero el conteo de líneas no es confiable. Iniciando OCR visual…'
        : 'PDF escaneado detectado. Iniciando OCR de las páginas…')
      const moduleUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm'
      const tesseract: any = await import(/* @vite-ignore */ moduleUrl)
      let ocrText = ''
      let confidenceTotal = 0
      let confidencePages = 0

      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 2.2 })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('No se pudo preparar la página del PDF para OCR.')

        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        await page.render({ canvasContext: context, viewport }).promise

        setMessage(`OCR del PDF · página ${pageNumber} de ${pageLimit}…`)
        const pageBase = 25 + ((pageNumber - 1) / pageLimit) * 75
        const pageShare = 75 / pageLimit

        const result = await tesseract.recognize(canvas, 'spa', {
          logger: (event: any) => {
            if (event?.status === 'recognizing text' && typeof event.progress === 'number') {
              setScanProgress(Math.min(99, Math.round(pageBase + event.progress * pageShare)))
            }
          },
        })

        const pageText = String(result?.data?.text ?? '')
        const pageConfidence = Number(result?.data?.confidence ?? 0)
        ocrText += `\n--- PÁGINA ${pageNumber} ---\n${pageText}\n`
        if (pageConfidence > 0) {
          confidenceTotal += pageConfidence
          confidencePages++
        }

        canvas.width = 1
        canvas.height = 1
      }

      const averageConfidence = confidencePages ? confidenceTotal / confidencePages : 0
      applyOcrResult(ocrText, averageConfidence, pdfFile, `PDF OCR (${pageLimit} página${pageLimit > 1 ? 's' : ''})`, true)
    } catch (error) {
      const fallbackGuide = guideFromFileName(pdfFile.name)
      if (fallbackGuide) {
        setForm((prev) => ({ ...prev, guide_no: fallbackGuide }))
      }
      setMessage(
        `No se pudo completar la lectura automática del PDF: ${error instanceof Error ? error.message : 'error desconocido'}.` +
        (fallbackGuide ? ` Se recuperó la guía ${fallbackGuide} desde el nombre del archivo.` : '')
      )
    } finally {
      setScanning(false)
      setScanProgress(100)
    }
  }

  function onReference(value: string) {
    const reference = value.replace(/\s/g, '')
    setDuplicateGuide(null)
    setForm((prev) => ({ ...prev, reference, guide_type: classifyReference(reference) }))
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine(), line_no: prev.length + 1 }])
    setForm((prev) => ({ ...prev, line_count: String(Number(prev.line_count || 0) + 1) }))
  }

  function updateLine(index: number, changes: Partial<GuideLine>) {
    setLines((prev) => prev.map((line, i) => i === index ? { ...line, ...changes } : line))
  }

  function removeLine(index: number) {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== index).map((line, i) => ({ ...line, line_no: i + 1 }))
      setForm((current) => ({ ...current, line_count: String(Math.max(next.length, 1)) }))
      return next.length ? next : [emptyLine()]
    })
  }

  async function saveGuide(acceptWithWarnings = false) {
    setMessage('')
    setDuplicateGuide(null)

    if (!form.guide_no.trim()) {
      setMessage('Falta el Número de guía. Complétalo antes de confirmar.')
      return
    }
    if (!form.reference.trim()) {
      setMessage('Falta la Referencia. Complétala antes de confirmar.')
      return
    }
    if (!form.warehouse.trim() && !profile?.warehouse) {
      setMessage('Falta el Almacén. Complétalo antes de confirmar.')
      return
    }
    if (form.guide_type === 'REPOSICION' && !form.supplier) {
      setMessage('Selecciona el proveedor de la Reposición: KOMATSU o CUMMINS.')
      return
    }

    const replenishmentLines = form.guide_type === 'REPOSICION'
      ? lines.filter((line) =>
          line.part_no.trim() ||
          line.description.trim() ||
          line.quantity.trim() ||
          line.unit.trim()
        )
      : []

    if (form.guide_type === 'REPOSICION') {
      if (!replenishmentLines.length) {
        setMessage('La Reposición debe tener al menos una línea de material.')
        return
      }

      const invalidIndex = replenishmentLines.findIndex((line) => {
        const qty = Number(normalizeIntegerQuantity(line.quantity))
        return (
          !line.part_no.trim() ||
          !line.description.trim() ||
          !Number.isInteger(qty) ||
          qty <= 0 ||
          !line.unit.trim()
        )
      })

      if (invalidIndex >= 0) {
        const line = replenishmentLines[invalidIndex]
        const missing = [
          !line.part_no.trim() ? 'N° de parte' : '',
          !line.description.trim() ? 'descripción' : '',
          !normalizeIntegerQuantity(line.quantity) ? 'cantidad entera mayor a 0' : '',
          !line.unit.trim() ? 'UM' : '',
        ].filter(Boolean)
        setMessage(`Revisa la línea ${invalidIndex + 1}: falta ${missing.join(', ')}.`)
        return
      }
    }

    const { data: duplicate } = await supabase
      .from('guides')
      .select('id,guide_no,reference,created_at,warehouse,status')
      .eq('guide_no', form.guide_no.trim())
      .eq('reference', form.reference.trim())
      .maybeSingle()

    if (duplicate) {
      setDuplicateGuide(duplicate)
      setMessage(`Registro duplicado: ${duplicate.guide_no} / ${duplicate.reference} ya existe en KOMTROL y no se volverá a insertar.`)
      return
    }

    setSaving(true)
    let fileBucket: string | null = null
    let filePath: string | null = null
    let fileName: string | null = null

    if (file) {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      filePath = `${userId}/${Date.now()}-${safe}`
      const upload = await supabase.storage.from('guide-documents').upload(filePath, file, { upsert: false })
      if (!upload.error) {
        fileBucket = 'guide-documents'
        fileName = file.name
      } else {
        filePath = null
        setMessage(`La guía se guardará sin archivo: ${upload.error.message}`)
      }
    }

    let emissionDate = form.emission_date
    const today = new Date().toISOString().slice(0, 10)
    if (emissionDate && emissionDate > today) {
      emissionDate = form.transfer_start_date && form.transfer_start_date <= today ? form.transfer_start_date : today
    }

    const payload = {
      guide_no: form.guide_no.trim().toUpperCase(),
      document_no: form.document_no.trim() || null,
      emission_date: emissionDate || null,
      transfer_start_date: form.transfer_start_date || null,
      date_source: form.date_source,
      reception_at: new Date().toISOString(),
      reception_source: 'FECHA_CARGA',
      reference: form.reference.trim(),
      line_count: form.guide_type === 'REPOSICION'
        ? Math.max(replenishmentLines.length, 1)
        : Math.max(Math.round(Number(form.line_count || 1)), 1),
      guide_type: form.guide_type,
      supplier: form.guide_type === 'REPOSICION' ? form.supplier : null,
      data_source: 'SCANNER',
      warehouse: form.warehouse.trim() || profile?.warehouse || null,
      responsible_user_id: userId,
      status: form.status,
      notes: [
        form.notes.trim(),
        acceptWithWarnings ? 'Registro confirmado por el usuario aceptando observaciones de OCR.' : '',
      ].filter(Boolean).join(' · ') || null,
      ocr_text: form.ocr_text || null,
      ocr_confidence: form.ocr_confidence ? Number(form.ocr_confidence) : null,
      file_bucket: fileBucket,
      file_path: filePath,
      file_name: fileName,
      created_by: userId,
    }

    const { data: created, error } = await supabase.from('guides').insert(payload).select('*').single()
    if (error || !created) {
      setSaving(false)
      setMessage(error?.message ?? 'No se pudo guardar la guía.')
      return
    }

    if (form.guide_type === 'REPOSICION') {
      const validLines = replenishmentLines.map((line, index) => ({
        guide_id: created.id,
        line_no: index + 1,
        part_no: line.part_no.trim(),
        description: line.description.trim(),
        quantity: Number(normalizeIntegerQuantity(line.quantity)),
        unit: line.unit.trim().toUpperCase(),
      }))

      const { error: lineError } = await supabase.from('guide_lines').insert(validLines)
      if (lineError) {
        await supabase.from('guides').delete().eq('id', created.id)
        if (fileBucket && filePath) {
          await supabase.storage.from(fileBucket).remove([filePath])
        }
        setSaving(false)
        setMessage(`No se pudo confirmar la Reposición porque falló el guardado de sus líneas: ${lineError.message}`)
        return
      }
    }

    await supabase.from('guide_history').insert({
      guide_id: created.id,
      action: 'REGISTRADA',
      note: `Registrada por ${profile?.full_name || 'usuario'}`,
      changed_by: userId,
    })

    setSaving(false)
    setMessage(`Guía ${created.guide_no} registrada correctamente como ${created.guide_type}.`)

    const savedBatchId = selectedBatchIdRef.current
    if (savedBatchId) {
      updateBatchItem(savedBatchId, { status: 'GUARDADO', progress: 100 })
    }

    resetForm()

    if (savedBatchId) {
      window.setTimeout(() => advanceToNextBatch(savedBatchId), 0)
    }

    await reload()
  }

  const visible = useMemo(() => {
    let rows = [...guides]
    if (mode === 'oc-cargos') rows = rows.filter((g) => ['ORDEN_COMPRA', 'CARGO_DIRECTO'].includes(g.guide_type))
    if (mode === 'reposicion') rows = rows.filter((g) => g.guide_type === 'REPOSICION')
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((g) =>
        [g.guide_no, g.reference, g.document_no, g.warehouse, g.guide_type, g.status]
          .some((value) => String(value ?? '').toLowerCase().includes(q))
      )
    }
    return rows
  }, [guides, mode, search])

  const responsibleName = (id: string) => profiles.find((p) => p.user_id === id)?.full_name ?? 'Usuario KOMTROL'
  const ocrConfidence = Number(form.ocr_confidence || 0)
  const hasOcr = Boolean(form.ocr_text || form.ocr_confidence)
  const lowOcrConfidence = hasOcr && ocrConfidence > 0 && ocrConfidence < 65
  const incompleteOcr = hasOcr && (!form.guide_no.trim() || !form.reference.trim() || !form.emission_date)
  const showOcrWarning = lowOcrConfidence || incompleteOcr
  const activeReplenishmentLines = form.guide_type === 'REPOSICION'
    ? lines.filter((line) => line.part_no.trim() || line.description.trim() || line.quantity.trim() || line.unit.trim())
    : []
  const invalidReplenishmentLine = form.guide_type === 'REPOSICION'
    ? activeReplenishmentLines.findIndex((line) =>
        !line.part_no.trim() ||
        !line.description.trim() ||
        !normalizeIntegerQuantity(line.quantity) ||
        !line.unit.trim()
      )
    : -1
  const confirmationIssue = !form.guide_no.trim()
    ? 'Falta N° de guía'
    : !form.reference.trim()
      ? 'Falta referencia'
      : (!form.warehouse.trim() && !profile?.warehouse)
        ? 'Falta almacén'
        : form.guide_type === 'REPOSICION' && !activeReplenishmentLines.length
          ? 'Falta al menos una línea'
          : invalidReplenishmentLine >= 0
            ? `Revisar línea ${invalidReplenishmentLine + 1}`
            : ''
  const messageTone = /no se pudo|error|obligatori|duplicad|ya se encuentra|no compatible/i.test(message)
    ? 'error'
    : /revisa|no se identificaron|se guardará sin archivo|advertencia/i.test(message)
      ? 'warning'
      : /registrada correctamente|se detectó|procesado/i.test(message)
        ? 'success'
        : 'info'

  const guideExportRows=visible.map((guide)=>({
    guide_no:guide.guide_no,
    document_no:guide.document_no||'',
    emission_date:guide.emission_date ? new Intl.DateTimeFormat('es-PE').format(new Date(guide.emission_date+'T12:00:00')) : '',
    transfer_start_date:guide.transfer_start_date ? new Intl.DateTimeFormat('es-PE').format(new Date(guide.transfer_start_date+'T12:00:00')) : '',
    reception_at:new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short'}).format(new Date(guide.reception_at)),
    reference:guide.reference,
    line_count:guide.line_count,
    guide_type:guide.guide_type.replaceAll('_',' '),
    warehouse:guide.warehouse||'',
    responsible:responsibleName(guide.responsible_user_id),
    status:guide.status,
    ocr_confidence:guide.ocr_confidence == null ? '' : `${guide.ocr_confidence}%`,
    notes:guide.notes||'',
  }))

  const guideExcelColumns=[
    {header:'GUÍA',key:'guide_no',width:20},
    {header:'N° DOCUMENTO',key:'document_no',width:18},
    {header:'EMISIÓN',key:'emission_date',width:14},
    {header:'INICIO TRASLADO',key:'transfer_start_date',width:16},
    {header:'RECEPCIÓN',key:'reception_at',width:18},
    {header:'REFERENCIA',key:'reference',width:20},
    {header:'LÍNEAS',key:'line_count',width:10},
    {header:'TIPO',key:'guide_type',width:18},
    {header:'ALMACÉN',key:'warehouse',width:18},
    {header:'RESPONSABLE',key:'responsible',width:26},
    {header:'ESTADO',key:'status',width:16},
    {header:'OCR',key:'ocr_confidence',width:10},
    {header:'OBSERVACIONES',key:'notes',width:36},
  ]

  const guidePdfColumns=[
    {header:'GUÍA',key:'guide_no'},
    {header:'DOC.',key:'document_no'},
    {header:'EMISIÓN',key:'emission_date'},
    {header:'RECEPCIÓN',key:'reception_at'},
    {header:'REFERENCIA',key:'reference'},
    {header:'LÍN.',key:'line_count'},
    {header:'TIPO',key:'guide_type'},
    {header:'ALMACÉN',key:'warehouse'},
    {header:'ESTADO',key:'status'},
  ]

  function exportGuidesExcel(){
    exportRowsToExcel(
      `KOMTROL_Guias_${mode}`,
      'Guias',
      guideExcelColumns,
      guideExportRows,
      [['Vista',mode],['Registros',guideExportRows.length]]
    )
  }

  function exportGuidesPdf(){
    exportRowsToPdfPortrait(
      `KOMTROL_Guias_${mode}`,
      'KOMTROL · Seguimiento de Guías',
      guidePdfColumns,
      guideExportRows,
      {summary:[['Vista',mode],['Registros',guideExportRows.length]]}
    )
  }

  if (mode !== 'scanner') {
    const title = mode === 'reposicion' ? 'Ingresos de Reposición' : mode === 'oc-cargos' ? 'OC / Cargos Directos' : 'Seguimiento de Guías'
    return (
      <section className="panel guide-list-panel">
        <div className="panel-title">
          <div><h3>{title}</h3><p>Registros capturados desde Scanner de Guías y operación.</p></div>
          <div className="button-row">
            <button className="secondary-button" disabled={!visible.length} onClick={exportGuidesPdf}><FileText size={16}/> PDF</button>
            <button className="secondary-button" disabled={!visible.length} onClick={exportGuidesExcel}><FileSpreadsheet size={16}/> Excel</button>
            <button className="icon-button" onClick={reload}><RefreshCw size={18} /></button>
          </div>
        </div>
        <div className="task-toolbar">
          <div className="search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar guía, referencia, documento, almacén…" /></div>
        </div>
        <GuideTable guides={visible} responsibleName={responsibleName} loading={loading} />
      </section>
    )
  }

  return (
    <div className="scanner-module">
      <section className="panel scanner-panel scanner-enterprise">
        <div className="scanner-command-bar">
          <div className="scanner-actions scanner-actions-batch">
            <button className="scan-action primary-scan" disabled={scanning} onClick={() => cameraRef.current?.click()}>
              <span className="scan-action-icon"><Camera size={21} /></span>
              <span><b>Tomar foto</b><small>Captura y sigue con la siguiente</small></span>
            </button>
            <button className="scan-action" disabled={scanning} onClick={() => fileRef.current?.click()}>
              <span className="scan-action-icon"><Upload size={21} /></span>
              <span><b>Cargar 60 fotos</b><small>Selección múltiple · OCR en cola</small></span>
            </button>
            <button className="scan-action" disabled={scanning || batchItems.length > 0} onClick={() => pdfRef.current?.click()}>
              <span className="scan-action-icon"><FileText size={21} /></span>
              <span><b>Subir PDF</b><small>PDF digital o escaneado</small></span>
            </button>
            <input
              ref={cameraRef}
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                enqueueGuidePhotos(files)
                e.currentTarget.value = ''
              }}
            />
            <input
              ref={fileRef}
              hidden
              multiple
              type="file"
              accept="image/*"
              onChange={(e) => {
                enqueueGuidePhotos(Array.from(e.target.files ?? []))
                e.currentTarget.value = ''
              }}
            />
            <input
              ref={pdfRef}
              hidden
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => {
                void selectFile(e.target.files?.[0])
                e.currentTarget.value = ''
              }}
            />
          </div>
          <button
            className="secondary-button scanner-clear"
            onClick={batchItems.length ? clearBatch : resetForm}
          >
            <X size={16} /> {batchItems.length ? 'Limpiar lote' : 'Limpiar'}
          </button>
        </div>

        {batchItems.length > 0 && (
          <section className="scanner-batch-panel">
            <div className="scanner-batch-head">
              <div>
                <b>Lote de guías</b>
                <span>
                  {batchItems.filter((item) => item.status === 'GUARDADO').length} guardadas ·
                  {' '}{batchItems.filter((item) => item.status === 'LISTO' || item.status === 'REVISAR').length} listas ·
                  {' '}{batchItems.filter((item) => item.status === 'PROCESANDO').length} procesando ·
                  {' '}{batchItems.filter((item) => item.status === 'PENDIENTE').length} en cola
                </span>
              </div>
              <strong>{batchItems.length}/60</strong>
            </div>

            <div className="scanner-batch-list">
              {batchItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`scanner-batch-item ${selectedBatchId === item.id ? 'selected' : ''} status-${item.status.toLowerCase()}`}
                  onClick={() => selectBatchById(item.id)}
                >
                  <span className="scanner-batch-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="scanner-batch-copy">
                    <b>{item.result?.parsed.guide_no || item.file.name}</b>
                    <small>
                      {item.result?.parsed.reference
                        ? `Ref. ${item.result.parsed.reference}`
                        : item.status === 'PROCESANDO'
                          ? `Reconociendo · ${item.progress}%`
                          : item.status === 'PENDIENTE'
                            ? 'En cola'
                            : item.status === 'ERROR'
                              ? 'Error de lectura'
                              : 'Revisar campos'}
                    </small>
                  </span>
                  <span className="scanner-batch-status">
                    {item.status === 'LISTO' ? 'Lista'
                      : item.status === 'REVISAR' ? 'Revisar'
                      : item.status === 'PROCESANDO' ? `${item.progress}%`
                      : item.status === 'PENDIENTE' ? 'Cola'
                      : item.status === 'GUARDADO' ? 'Guardada'
                      : 'Error'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {file && (
          <div className="scan-file-card enterprise-file-card">
            <div className="scan-preview">
              {previewUrl ? <img src={previewUrl} alt="Documento seleccionado" /> : <FileText size={34} />}
            </div>
            <div className="scan-file-copy">
              <b>{file.name}</b>
              <small>{Math.round(file.size / 1024)} KB · {file.type || 'archivo'}</small>
              {scanning && <span>Procesando documento · {scanProgress}%</span>}
            </div>
            {scanning && <div className="scan-progress"><span style={{ width: `${scanProgress}%` }} /></div>}
          </div>
        )}

        {message && (
          <div className={`scanner-alert ${messageTone}`}>
            <span className="scanner-alert-icon">
              {messageTone === 'error' || messageTone === 'warning'
                ? <AlertTriangle size={18} />
                : messageTone === 'success'
                  ? <CheckCircle2 size={18} />
                  : <ScanLine size={18} />}
            </span>
            <div><b>{messageTone === 'error' ? 'Revisar' : messageTone === 'warning' ? 'Validación requerida' : messageTone === 'success' ? 'Lectura completada' : 'Procesando'}</b><span>{message}</span></div>
          </div>
        )}

        <section className="scanner-validation-card">
          <div className="validation-header enterprise-validation-head">
            <div>
              <span className="validation-icon"><ScanLine size={19} /></span>
              <span><b>Validar guía</b><small>Revisa los datos detectados antes de confirmar el registro.</small></span>
            </div>
            <div className="scanner-status-chips">
              {form.guide_type !== 'OTRO' && <span className="scanner-status-chip type">{form.guide_type.replace('_',' ')}</span>}
              {form.ocr_confidence && <span className={lowOcrConfidence ? 'scanner-status-chip warning' : 'scanner-status-chip success'}>OCR {form.ocr_confidence}%</span>}
              {hasOcr && <span className={showOcrWarning ? 'scanner-status-chip warning' : 'scanner-status-chip success'}>{showOcrWarning ? 'Revisar lectura' : 'Lectura validable'}</span>}
            </div>
          </div>

          <div className="guide-form-section">
            <div className="guide-form-section-title"><b>Datos principales</b><span>Identificación y clasificación del documento</span></div>
            <div className="form-grid guide-form guide-form-professional">
              <label>Número de guía
                <input value={form.guide_no} onChange={(e) => setForm({ ...form, guide_no: e.target.value.toUpperCase() })} placeholder="T098-00005674" />
              </label>
              <label>Referencia
                <input value={form.reference} onChange={(e) => onReference(e.target.value)} placeholder="89… / 80…" />
              </label>
              <label>N° Documento
                <input value={form.document_no} onChange={(e) => setForm({ ...form, document_no: e.target.value })} placeholder="Documento asociado" />
              </label>
              <label>Tipo
                <select value={form.guide_type} onChange={(e) => setForm({ ...form, guide_type: e.target.value as GuideType })}>
                  <option value="REPOSICION">Reposición</option>
                  <option value="ORDEN_COMPRA">Orden de Compra</option>
                  <option value="CARGO_DIRECTO">Cargo Directo</option>
                  <option value="OTRO">Otro</option>
                </select>
              </label>
              {form.guide_type === 'REPOSICION' && (
                <label>Proveedor
                  <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value as 'KOMATSU' | 'CUMMINS' })}>
                    <option value="KOMATSU">KOMATSU</option>
                    <option value="CUMMINS">CUMMINS</option>
                  </select>
                </label>
              )}
            </div>
          </div>

          <div className="guide-form-section">
            <div className="guide-form-section-title"><b>Fechas y lectura OCR</b><span>Fechas detectadas y calidad de extracción</span></div>
            <div className="form-grid guide-form guide-form-professional">
              <label>Fecha emisión
                <input type="date" max={new Date().toISOString().slice(0, 10)} value={form.emission_date} onChange={(e) => setForm({ ...form, emission_date: e.target.value, date_source: 'DOCUMENTO' })} />
              </label>
              <label>Inicio traslado
                <input type="date" max={new Date().toISOString().slice(0, 10)} value={form.transfer_start_date} onChange={(e) => setForm({ ...form, transfer_start_date: e.target.value })} />
              </label>
              <label>Origen fecha
                <select value={form.date_source} onChange={(e) => setForm({ ...form, date_source: e.target.value as typeof form.date_source })}>
                  <option value="DOCUMENTO">Documento</option>
                  <option value="INICIO_TRASLADO">Inicio traslado</option>
                  <option value="FECHA_CARGA">Fecha de carga</option>
                </select>
              </label>
              <label>Cantidad de líneas
                <input type="number" min="1" value={form.line_count} onChange={(e) => setForm({ ...form, line_count: e.target.value })} />
              </label>
            </div>
          </div>

          <div className="guide-form-section">
            <div className="guide-form-section-title"><b>Contexto operativo</b><span>Ubicación, responsable y observaciones</span></div>
            <div className="form-grid guide-form guide-form-professional">
              <label>Almacén
                <input value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} placeholder="Almacén" />
              </label>
              <label>Responsable
                <input value={profile?.full_name || 'Usuario actual'} disabled />
              </label>
              <label className="span-2">Observación
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observaciones de recepción, lectura OCR o validación…" />
              </label>
            </div>
          </div>
        </section>

        {form.guide_type === 'REPOSICION' && (
          <div className="guide-lines enterprise-guide-lines">
            <div className="guide-lines-head">
              <div><b>Líneas de Reposición</b><span>Número de parte, descripción, cantidad y unidad.</span></div>
              <button className="secondary-button" onClick={addLine}><Plus size={16} /> Agregar línea</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Número de parte</th><th>Descripción</th><th>Cantidad</th><th>UM</th><th></th></tr></thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td><input value={line.part_no} onChange={(e) => updateLine(index, { part_no: e.target.value })} /></td>
                      <td><input value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} /></td>
                      <td><input
                        className="integer-quantity-input"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={normalizeIntegerQuantity(line.quantity)}
                        onChange={(e) => updateLine(index, { quantity: e.target.value.replace(/\D/g, '') })}
                        onBlur={() => updateLine(index, { quantity: normalizeIntegerQuantity(line.quantity) })}
                      /></td>
                      <td><input value={line.unit} onChange={(e) => updateLine(index, { unit: e.target.value.toUpperCase() })} /></td>
                      <td><button className="icon-button small-icon" onClick={() => removeLine(index)} title="Quitar"><X size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="scanner-footer enterprise-scanner-footer">
          <div className="scanner-footer-left">
            <div className="rule-hints">
              <span><b>89…</b> Reposición</span>
              <span><b>80…</b> Orden de Compra</span>
              <span><b>Otros</b> Cargo Directo</span>
            </div>
            {duplicateGuide ? (
              <div className="scanner-duplicate-warning">
                <AlertTriangle size={16}/>
                <div>
                  <b>Registro ya existente</b>
                  <span>{duplicateGuide.guide_no} · Ref. {duplicateGuide.reference} · {duplicateGuide.warehouse || 'Sin almacén'} · {fmtDate(duplicateGuide.created_at)}</span>
                  <small>No se creó un duplicado. Limpia el formulario para escanear otra guía.</small>
                </div>
              </div>
            ) : confirmationIssue ? (
              <div className="scanner-confirmation-issue"><AlertTriangle size={14}/><span>{confirmationIssue}</span></div>
            ) : null}
          </div>
          {!duplicateGuide && message && /no se pudo|error|obligatori|revisa|falta|duplicad|ya se encuentra/i.test(message) && (
            <div className="scanner-footer-feedback"><AlertTriangle size={14}/><span>{message}</span></div>
          )}
          <div className="scanner-footer-actions">
            <button className="secondary-button" type="button" onClick={resetForm}><X size={16}/> Cancelar</button>
            {showOcrWarning && (
              <button className="warning-button" type="button" disabled={saving || scanning} onClick={() => saveGuide(true)}>
                <AlertTriangle size={16}/> Aceptar con observaciones
              </button>
            )}
            <button className="primary-button" disabled={saving || scanning} onClick={() => saveGuide(false)}>
              {saving ? <RefreshCw className="spin" size={17} /> : <CheckCircle2 size={17} />}
              {saving ? 'Guardando…' : 'Confirmar registro'}
            </button>
          </div>
        </div>
      </section>
      <section className="panel guide-list-panel">
        <div className="panel-title">
          <div><h3>Últimas guías</h3><p>Historial reciente registrado en KOMTROL.</p></div>
          <button className="icon-button" onClick={reload}><RefreshCw size={18} /></button>
        </div>
        <GuideTable guides={guides.slice(0, 12)} responsibleName={responsibleName} loading={loading} />
      </section>
    </div>
  )
}

function GuideTable({ guides, responsibleName, loading }: { guides: Guide[]; responsibleName: (id: string) => string; loading: boolean }) {
  if (loading) return <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando guías…</p></div>
  if (!guides.length) {
    return <div className="empty-work"><ImageIcon size={30} /><b>Sin guías</b><p>Los registros aparecerán aquí después de confirmar una guía.</p></div>
  }

  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Tipo</th><th>Guía</th><th>Referencia</th><th>Documento</th><th>Emisión</th><th>Líneas</th><th>Almacén</th><th>Responsable</th><th>Estado</th></tr></thead>
        <tbody>
          {guides.map((guide) => (
            <tr key={guide.id}>
              <td><span className={`guide-type type-${guide.guide_type.toLowerCase().replace('_', '-')}`}>{guide.guide_type.replace('_', ' ')}</span></td>
              <td><b>{guide.guide_no}</b><small>{fmtDate(guide.created_at)}</small></td>
              <td>{guide.reference}</td>
              <td>{guide.document_no || '—'}</td>
              <td>{guide.emission_date || '—'}</td>
              <td>{guide.line_count}</td>
              <td>{guide.warehouse || '—'}</td>
              <td>{responsibleName(guide.responsible_user_id)}</td>
              <td><span className="status-pill">{guide.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}