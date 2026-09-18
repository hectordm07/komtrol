import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

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
}

const emptyLine = (): GuideLine => ({ line_no: 1, part_no: '', description: '', quantity: '', unit: 'UND' })

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
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

function parseLines(text: string): GuideLine[] {
  const output: GuideLine[] = []
  const rows = text.replace(/\r/g, '').split('\n').map((x) => x.trim()).filter(Boolean)

  for (const row of rows) {
    const m = row.match(/^([A-Z0-9][A-Z0-9._/-]{4,})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(UND|EA|PC|PZ|PIE|FT|M|MT)?$/i)
    if (!m) continue
    if (/^(FECHA|GUIA|REFERENCIA|DOCUMENTO|RUC)/i.test(m[1])) continue
    output.push({
      line_no: output.length + 1,
      part_no: m[1],
      description: cleanText(m[2]),
      quantity: m[3].replace(',', '.'),
      unit: (m[4] || 'UND').toUpperCase(),
    })
    if (output.length >= 100) break
  }
  return output
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

function parseGuideOcr(text: string, fileName?: string) {
  const normalized = text.toUpperCase().replace(/[–—]/g, '-')
  const guide =
    normalized.match(/\b[A-Z]\d{3}-\d{8}\b/)?.[0] ||
    normalized.match(/\bT\d{3}\s*-\s*\d{8}\b/)?.[0]?.replace(/\s/g, '') ||
    guideFromFileName(fileName) ||
    ''

  const referenceCandidates = [...normalized.matchAll(/\b8\d{9}\b/g)].map((m) => m[0])
  const reference = referenceCandidates.find((x) => x.startsWith('89')) ||
    referenceCandidates.find((x) => x.startsWith('80')) ||
    referenceCandidates[0] ||
    ''

  const docMatch =
    normalized.match(/(?:N[°ºO]?\s*(?:DE\s*)?DOCUMENTO|DOCUMENTO)\s*[:#-]?\s*([A-Z0-9-]{4,})/i) ||
    normalized.match(/(?:DOCUMENTO\s*(?:RELACIONADO|REFERENCIA))\s*[:#-]?\s*([A-Z0-9-]{4,})/i)
  const documentNo = docMatch?.[1] || ''

  const emission = findDateNear(normalized, ['FECHA\\s*(?:DE\\s*)?EMISI[ÓO]N', 'EMISI[ÓO]N'])
  const transferStart = findDateNear(normalized, ['FECHA\\s*(?:DE\\s*)?INICIO\\s*(?:DE\\s*)?TRASLADO', 'INICIO\\s*(?:DE\\s*)?TRASLADO'])
  const dateSource = emission ? 'DOCUMENTO' : transferStart ? 'INICIO_TRASLADO' : 'FECHA_CARGA'
  const emissionDate = emission || transferStart || new Date().toISOString().slice(0, 10)

  const explicitLines =
    normalized.match(/(?:CANTIDAD\s*(?:DE\s*)?L[IÍ]NEAS|N[°ºO]?\s*(?:DE\s*)?L[IÍ]NEAS|TOTAL\s*(?:DE\s*)?L[IÍ]NEAS|L[IÍ]NEAS)\s*[:#-]?\s*(\d{1,3})/i)
  const parsedLines = parseLines(text)
  const numberedLineCount = detectDocumentLineCount(text)
  const lineCount = explicitLines
    ? Number(explicitLines[1])
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

export function GuidesModule({ mode, userId, profile }: Props) {
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

  const [form, setForm] = useState({
    guide_no: '',
    document_no: '',
    emission_date: '',
    transfer_start_date: '',
    date_source: 'FECHA_CARGA' as 'DOCUMENTO' | 'INICIO_TRASLADO' | 'FECHA_CARGA',
    reference: '',
    line_count: '1',
    guide_type: 'OTRO' as GuideType,
    warehouse: profile?.warehouse ?? '',
    status: 'VALIDADO',
    notes: '',
    ocr_text: '',
    ocr_confidence: '',
  })
  const [lines, setLines] = useState<GuideLine[]>([emptyLine()])
  const [saving, setSaving] = useState(false)

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
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function resetForm() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    setFile(null)
    setScanProgress(0)
    setForm({
      guide_no: '',
      document_no: '',
      emission_date: '',
      transfer_start_date: '',
      date_source: 'FECHA_CARGA',
      reference: '',
      line_count: '1',
      guide_type: 'OTRO',
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
    setMessage('')
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

  function applyOcrResult(text: string, confidence: number, sourceFile: File, sourceLabel: string) {
    const parsed = parseGuideOcr(text, sourceFile.name)
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
      parsed.line_count ? `${parsed.line_count} líneas` : '',
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
    setMessage('Analizando imagen con OCR gratuito…')
    try {
      const moduleUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm'
      const tesseract: any = await import(/* @vite-ignore */ moduleUrl)
      const result = await tesseract.recognize(imageFile, 'spa', {
        logger: (event: any) => {
          if (event?.status === 'recognizing text' && typeof event.progress === 'number') {
            setScanProgress(Math.max(2, Math.round(event.progress * 100)))
          }
        },
      })
      const text = String(result?.data?.text ?? '')
      const confidence = Number(result?.data?.confidence ?? 0)
      applyOcrResult(text, confidence, imageFile, 'Imagen')
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
        const positioned = content.items
          .map((item: any) => ({
            text: typeof item?.str === 'string' ? item.str.trim() : '',
            x: Number(item?.transform?.[4] ?? 0),
            y: Number(item?.transform?.[5] ?? 0),
            width: Number(item?.width ?? 0),
          }))
          .filter((item: any) => item.text)

        positioned.sort((a: any, b: any) => {
          const yDiff = b.y - a.y
          return Math.abs(yDiff) > 2.5 ? yDiff : a.x - b.x
        })

        const rowGroups: Array<{ y: number; items: typeof positioned }> = []
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
      applyOcrResult(ocrText, averageConfidence, pdfFile, `PDF OCR (${pageLimit} página${pageLimit > 1 ? 's' : ''})`)
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

  async function saveGuide() {
    setMessage('')
    if (!form.guide_no.trim() || !form.reference.trim()) {
      setMessage('Número de guía y referencia son obligatorios.')
      return
    }

    const { data: duplicate } = await supabase
      .from('guides')
      .select('id,guide_no,reference,created_at,warehouse,status')
      .eq('guide_no', form.guide_no.trim())
      .eq('reference', form.reference.trim())
      .maybeSingle()

    if (duplicate) {
      setMessage(`Esta guía ya se encuentra registrada: ${duplicate.guide_no} / ${duplicate.reference} · ${fmtDate(duplicate.created_at)}.`)
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
      line_count: Math.max(Number(form.line_count || 1), 1),
      guide_type: form.guide_type,
      warehouse: form.warehouse.trim() || profile?.warehouse || null,
      responsible_user_id: userId,
      status: form.status,
      notes: form.notes.trim() || null,
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
      const validLines = lines
        .filter((line) => line.part_no.trim() || line.description.trim())
        .map((line, index) => ({
          guide_id: created.id,
          line_no: index + 1,
          part_no: line.part_no.trim() || null,
          description: line.description.trim() || null,
          quantity: line.quantity ? Number(line.quantity) : null,
          unit: line.unit.trim() || null,
        }))
      if (validLines.length) await supabase.from('guide_lines').insert(validLines)
    }

    await supabase.from('guide_history').insert({
      guide_id: created.id,
      action: 'REGISTRADA',
      note: `Registrada por ${profile?.full_name || 'usuario'}`,
      changed_by: userId,
    })

    setSaving(false)
    setMessage(`Guía ${created.guide_no} registrada correctamente como ${created.guide_type}.`)
    resetForm()
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

  if (mode !== 'scanner') {
    const title = mode === 'reposicion' ? 'Ingresos de Reposición' : mode === 'oc-cargos' ? 'OC / Cargos Directos' : 'Seguimiento de Guías'
    return (
      <section className="panel guide-list-panel">
        <div className="panel-title">
          <div><h3>{title}</h3><p>Registros capturados desde Scanner de Guías y operación.</p></div>
          <button className="icon-button" onClick={reload}><RefreshCw size={18} /></button>
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
      <section className="panel scanner-panel">
        <div className="panel-title">
          <div><h3>Scanner de Guías</h3><p>Foto / imagen / PDF → lectura automática / OCR → validación → registro → seguimiento.</p></div>
          <button className="secondary-button" onClick={resetForm}><X size={16} /> Limpiar</button>
        </div>

        <div className="scanner-actions">
          <button className="scan-action" onClick={() => cameraRef.current?.click()}><Camera size={22} /><span><b>Tomar foto</b><small>Cámara trasera en celular</small></span></button>
          <button className="scan-action" onClick={() => fileRef.current?.click()}><Upload size={22} /><span><b>Subir imagen / PDF</b><small>PDF digital o escaneado · JPG · PNG</small></span></button>
          <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => selectFile(e.target.files?.[0])} />
          <input ref={fileRef} hidden type="file" accept="image/*,.pdf,application/pdf" onChange={(e) => selectFile(e.target.files?.[0])} />
        </div>

        {file && (
          <div className="scan-file-card">
            <div className="scan-preview">
              {previewUrl ? <img src={previewUrl} alt="Documento seleccionado" /> : <FileText size={38} />}
            </div>
            <div><b>{file.name}</b><small>{Math.round(file.size / 1024)} KB · {file.type || 'archivo'}</small></div>
            {scanning && <div className="scan-progress"><span style={{ width: `${scanProgress}%` }} /></div>}
          </div>
        )}

        {message && <div className="inline-message">{message}</div>}

        <div className="validation-header">
          <div><ScanLine size={19} /><span><b>Validar guía</b><small>Todos los campos son editables antes de confirmar.</small></span></div>
          {form.ocr_confidence && <span className={Number(form.ocr_confidence) < 65 ? 'confidence-badge low' : 'confidence-badge'}>OCR {form.ocr_confidence}%</span>}
        </div>

        <div className="form-grid guide-form">
          <label>Número de guía
            <input value={form.guide_no} onChange={(e) => setForm({ ...form, guide_no: e.target.value.toUpperCase() })} placeholder="T098-00005674" />
          </label>
          <label>Referencia
            <input value={form.reference} onChange={(e) => onReference(e.target.value)} placeholder="89… / 80…" />
          </label>
          <label>N° Documento
            <input value={form.document_no} onChange={(e) => setForm({ ...form, document_no: e.target.value })} placeholder="N° Documento" />
          </label>
          <label>Tipo
            <select value={form.guide_type} onChange={(e) => setForm({ ...form, guide_type: e.target.value as GuideType })}>
              <option value="REPOSICION">Reposición</option>
              <option value="ORDEN_COMPRA">Orden de Compra</option>
              <option value="CARGO_DIRECTO">Cargo Directo</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
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
          <label>Almacén
            <input value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} placeholder="Almacén" />
          </label>
          <label>Responsable
            <input value={profile?.full_name || 'Usuario actual'} disabled />
          </label>
          <label className="span-2">Observación
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observaciones…" />
          </label>
        </div>

        {form.guide_type === 'REPOSICION' && (
          <div className="guide-lines">
            <div className="panel-title compact-title">
              <div><h3>Líneas de Reposición</h3><p>Número de parte, descripción y cantidad.</p></div>
              <button className="secondary-button" onClick={addLine}><Plus size={16} /> Línea</button>
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
                      <td><input type="number" min="0" step="any" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} /></td>
                      <td><input value={line.unit} onChange={(e) => updateLine(index, { unit: e.target.value.toUpperCase() })} /></td>
                      <td><button className="icon-button small-icon" onClick={() => removeLine(index)} title="Quitar"><X size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="scanner-footer">
          <div className="rule-hints">
            <span><b>89…</b> Reposición</span>
            <span><b>80…</b> Orden de Compra</span>
            <span><b>Otros</b> Cargo Directo</span>
          </div>
          <button className="primary-button" disabled={saving || scanning || !form.guide_no || !form.reference} onClick={saveGuide}>
            {saving ? <RefreshCw className="spin" size={17} /> : <CheckCircle2 size={17} />}
            {saving ? 'Guardando…' : 'Confirmar guía'}
          </button>
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
