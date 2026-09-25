type OcrProgress = (progress: number, message?: string) => void

type GuideImageOcrResult = {
  text: string
  confidence: number
  method: 'HEADER_FAST' | 'HEADER_PLUS_FULL'
  barcodes: string[]
}

let workerPromise: Promise<any> | null = null
let activeProgress: OcrProgress | null = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const moduleUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm'
      const tesseract: any = await import(/* @vite-ignore */ moduleUrl)
      const worker = await tesseract.createWorker('spa', 1, {
        logger: (event: any) => {
          if (event?.status === 'recognizing text' && typeof event.progress === 'number') {
            activeProgress?.(Math.max(1, Math.round(event.progress * 100)))
          }
        },
      })
      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      })
      return worker
    })().catch((error) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return image
  } finally {
    // El navegador mantiene el bitmap decodificado aun después de liberar la URL.
    URL.revokeObjectURL(url)
  }
}

function percentile(values: Uint8ClampedArray, target: number) {
  const histogram = new Uint32Array(256)
  for (let i = 0; i < values.length; i += 4) {
    const y = Math.round(values[i] * 0.299 + values[i + 1] * 0.587 + values[i + 2] * 0.114)
    histogram[y]++
  }
  const total = values.length / 4
  const wanted = Math.max(1, Math.round(total * target))
  let acc = 0
  for (let i = 0; i < histogram.length; i++) {
    acc += histogram[i]
    if (acc >= wanted) return i
  }
  return target < 0.5 ? 0 : 255
}

async function prepareCanvas(
  file: File,
  mode: 'header' | 'full',
  maxWidth = 1900,
) {
  const image = await loadImage(file)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) throw new Error('La imagen no tiene dimensiones válidas.')

  // Las guías de KOMTROL concentran N° guía, referencia y fechas en la parte superior.
  // El primer pase procesa solo esa zona para reducir notablemente el tiempo de OCR.
  const cropHeight = mode === 'header'
    ? Math.max(1, Math.round(sourceHeight * 0.58))
    : sourceHeight

  const scale = Math.min(1.8, maxWidth / sourceWidth)
  const targetWidth = Math.max(900, Math.round(sourceWidth * scale))
  const targetHeight = Math.max(1, Math.round(cropHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo preparar la imagen para OCR.')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    0,
    0,
    sourceWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  )

  // Normalización ligera: fondo más blanco, texto oscuro y contraste estable.
  // Evita el umbral binario duro que suele borrar números finos de las guías.
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
  const data = imageData.data
  const low = percentile(data, 0.04)
  const high = percentile(data, 0.97)
  const span = Math.max(36, high - low)

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    let normalized = ((gray - low) / span) * 255
    normalized = Math.max(0, Math.min(255, normalized))
    // Contraste suave alrededor del gris medio.
    normalized = Math.max(0, Math.min(255, (normalized - 128) * 1.16 + 128))
    const value = Math.round(normalized)
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function likelyHasHeader(text: string) {
  const normalized = text.toUpperCase().replace(/\s+/g, ' ')
  const hasGuide = /\bT\s*[0-9O]{3}\s*[- ]\s*[0-9O]{7,9}\b/.test(normalized)
  const hasReference = /REFEREN(?:CIA)?/.test(normalized) || /\b8[0-9O]{8,17}\b/.test(normalized)
  const hasDate = /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/.test(normalized)
  return hasGuide && (hasReference || hasDate)
}

function likelyReplenishment(text: string) {
  const normalized = text.toUpperCase().replace(/\s+/g, '')
  return /REFERENCIA[^8]{0,20}89/.test(normalized) || /\b89[0-9O]{7,17}\b/.test(normalized)
}

async function detectBarcodes(canvas: HTMLCanvasElement) {
  const Detector = (window as any).BarcodeDetector
  if (!Detector) return [] as string[]

  try {
    const supported: string[] = await Detector.getSupportedFormats?.() ?? []
    const preferred = ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix']
      .filter((format) => !supported.length || supported.includes(format))
    const detector = new Detector(preferred.length ? { formats: preferred } : undefined)
    const detected = await detector.detect(canvas)
    return [...new Set(
      (detected ?? [])
        .map((item: any) => String(item?.rawValue ?? '').trim())
        .filter(Boolean)
    )] as string[]
  } catch {
    return []
  }
}

async function recognizeCanvas(
  canvas: HTMLCanvasElement,
  psm: '3' | '6',
  progress?: OcrProgress,
) {
  const worker = await getWorker()
  activeProgress = progress ?? null
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const result = await worker.recognize(canvas)
    return {
      text: String(result?.data?.text ?? ''),
      confidence: Number(result?.data?.confidence ?? 0),
    }
  } finally {
    activeProgress = null
  }
}

export async function prewarmGuideOcr() {
  await getWorker()
}

export async function recognizeGuideImage(
  file: File,
  onProgress?: OcrProgress,
): Promise<GuideImageOcrResult> {
  onProgress?.(2, 'Preparando imagen…')
  const headerCanvas = await prepareCanvas(file, 'header', 1900)

  onProgress?.(5, 'Leyendo códigos y cabecera…')
  const barcodePromise = detectBarcodes(headerCanvas)
  const header = await recognizeCanvas(
    headerCanvas,
    '6',
    (progress) => onProgress?.(5 + Math.round(progress * 0.55), 'Reconociendo cabecera…'),
  )
  const barcodes = await barcodePromise

  const barcodeText = barcodes.length
    ? '\n--- CÓDIGOS DETECTADOS ---\n' + barcodes.join('\n') + '\n'
    : ''

  const headerText = barcodeText + header.text
  const needsFull =
    !likelyHasHeader(headerText) ||
    likelyReplenishment(headerText) ||
    header.confidence < 58

  if (!needsFull) {
    onProgress?.(100, 'Lectura rápida completada')
    headerCanvas.width = 1
    headerCanvas.height = 1
    return {
      text: headerText,
      confidence: header.confidence,
      method: 'HEADER_FAST',
      barcodes,
    }
  }

  onProgress?.(62, 'Leyendo documento completo…')
  const fullCanvas = await prepareCanvas(file, 'full', 2200)
  const full = await recognizeCanvas(
    fullCanvas,
    '3',
    (progress) => onProgress?.(62 + Math.round(progress * 0.37), 'Reconociendo detalle…'),
  )

  headerCanvas.width = 1
  headerCanvas.height = 1
  fullCanvas.width = 1
  fullCanvas.height = 1
  onProgress?.(100, 'Lectura completada')

  const confidence = header.confidence > 0 && full.confidence > 0
    ? (header.confidence * 0.45) + (full.confidence * 0.55)
    : Math.max(header.confidence, full.confidence)

  return {
    text: barcodeText + header.text + '\n--- DETALLE DOCUMENTO ---\n' + full.text,
    confidence,
    method: 'HEADER_PLUS_FULL',
    barcodes,
  }
}
