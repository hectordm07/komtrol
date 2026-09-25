type OcrProgress = (progress: number, message?: string) => void

type GuideImageOcrResult = {
  text: string
  confidence: number
  method: 'HEADER_FAST' | 'HEADER_PLUS_DETAIL'
  barcodes: string[]
}

type WorkerSlot = {
  worker: any | null
  promise: Promise<any> | null
  busy: boolean
  progress: OcrProgress | null
}

const workerSlots: WorkerSlot[] = [
  { worker: null, promise: null, busy: false, progress: null },
  { worker: null, promise: null, busy: false, progress: null },
]
const workerWaiters: Array<(slotIndex: number) => void> = []

function supportedConcurrency() {
  const cores = Number((navigator as any)?.hardwareConcurrency ?? 4)
  const memory = Number((navigator as any)?.deviceMemory ?? 4)
  return cores >= 6 && memory >= 4 ? 2 : 1
}

async function getWorker(slotIndex: number) {
  const slot = workerSlots[slotIndex]
  if (slot.worker) return slot.worker

  if (!slot.promise) {
    slot.promise = (async () => {
      const moduleUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm'
      const tesseract: any = await import(/* @vite-ignore */ moduleUrl)
      const worker = await tesseract.createWorker('spa', 1, {
        logger: (event: any) => {
          if (event?.status === 'recognizing text' && typeof event.progress === 'number') {
            slot.progress?.(Math.max(1, Math.round(event.progress * 100)))
          }
        },
      })
      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      })
      slot.worker = worker
      return worker
    })().catch((error) => {
      slot.promise = null
      slot.worker = null
      throw error
    })
  }

  return slot.promise
}

async function acquireWorker() {
  const limit = supportedConcurrency()
  const freeIndex = workerSlots.slice(0, limit).findIndex((slot) => !slot.busy)

  if (freeIndex >= 0) {
    workerSlots[freeIndex].busy = true
    try {
      const worker = await getWorker(freeIndex)
      return { slotIndex: freeIndex, worker }
    } catch (error) {
      workerSlots[freeIndex].busy = false
      throw error
    }
  }

  const slotIndex = await new Promise<number>((resolve) => workerWaiters.push(resolve))
  try {
    const worker = await getWorker(slotIndex)
    return { slotIndex, worker }
  } catch (error) {
    workerSlots[slotIndex].busy = false
    throw error
  }
}

function releaseWorker(slotIndex: number) {
  const slot = workerSlots[slotIndex]
  slot.progress = null

  const waiter = workerWaiters.shift()
  if (waiter) {
    slot.busy = true
    waiter(slotIndex)
  } else {
    slot.busy = false
  }
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

function regionFor(mode: 'header' | 'detail') {
  // Las fotos de celular suelen incluir mesa/margen arriba. Estas franjas
  // priorizan cabecera y tabla sin procesar toda la foto.
  return mode === 'header'
    ? { top: 0.03, bottom: 0.52, maxWidth: 2100 }
    : { top: 0.27, bottom: 0.76, maxWidth: 2200 }
}

function prepareCanvas(image: HTMLImageElement, mode: 'header' | 'detail') {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) throw new Error('La imagen no tiene dimensiones válidas.')

  const region = regionFor(mode)
  const cropY = Math.max(0, Math.round(sourceHeight * region.top))
  const cropBottom = Math.min(sourceHeight, Math.round(sourceHeight * region.bottom))
  const cropHeight = Math.max(1, cropBottom - cropY)

  const scale = Math.min(1.9, region.maxWidth / sourceWidth)
  const targetWidth = Math.max(1000, Math.round(sourceWidth * scale))
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
    cropY,
    sourceWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  )

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
  const data = imageData.data
  const low = percentile(data, 0.035)
  const high = percentile(data, 0.975)
  const span = Math.max(34, high - low)

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    let normalized = ((gray - low) / span) * 255
    normalized = Math.max(0, Math.min(255, normalized))
    normalized = Math.max(0, Math.min(255, (normalized - 128) * 1.22 + 128))

    // Levanta el fondo y oscurece trazos finos sin aplicar binarización dura.
    if (normalized > 232) normalized = 255
    else if (normalized < 92) normalized *= 0.82

    const value = Math.round(normalized)
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function normalizedOcr(text: string) {
  return text
    .toUpperCase()
    .replace(/[–—−]/g, '-')
    .replace(/(?<=\d)[OQ](?=\d)/g, '0')
    .replace(/(?<=\d)[IL](?=\d)/g, '1')
    .replace(/\s+/g, ' ')
}

function likelyHasHeader(text: string) {
  const normalized = normalizedOcr(text)
  const hasGuide =
    /\bT\s*\d{3}\s*[- ]\s*\d{7,9}\b/.test(normalized) ||
    /N[°ºO]?\s*T\s*\d{3}\s*[- ]?\s*\d{7,9}/.test(normalized)
  const hasReference =
    /REFEREN(?:CIA)?/.test(normalized) ||
    /\b8\d{7,17}(?:[\/-]\d{3,17})?\b/.test(normalized)
  const hasDate = /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/.test(normalized)
  return hasGuide && (hasReference || hasDate)
}

function likelyReplenishment(text: string) {
  const normalized = normalizedOcr(text).replace(/\s+/g, '')
  return /REFERENCIA[^8]{0,20}89/.test(normalized) || /\b89\d{7,17}\b/.test(normalized)
}

function likelyHasMaterialRow(text: string) {
  const normalized = normalizedOcr(text)
  return (
    /DESCRIPCI[ÓO]N/.test(normalized) &&
    (
      /\b\d{1,3}\s+[A-Z0-9][A-Z0-9._/-]{3,}\s+.{3,40}\s+\d+(?:[.,]\d+)?\s+(?:UND|EA|PC|PZ|PIE|FT|M|MT)\b/.test(normalized) ||
      /\b\d+(?:[.,]\d+)?\s+(?:UND|EA|PC|PZ|PIE|FT|M|MT)\b/.test(normalized)
    )
  )
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
  worker: any,
  slotIndex: number,
  canvas: HTMLCanvasElement,
  psm: '3' | '6',
  progress?: OcrProgress,
) {
  const slot = workerSlots[slotIndex]
  slot.progress = progress ?? null

  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  })

  const result = await worker.recognize(canvas)
  slot.progress = null

  return {
    text: String(result?.data?.text ?? ''),
    confidence: Number(result?.data?.confidence ?? 0),
  }
}

export async function prewarmGuideOcr() {
  await getWorker(0)
}

export async function recognizeGuideImage(
  file: File,
  onProgress?: OcrProgress,
): Promise<GuideImageOcrResult> {
  const { slotIndex, worker } = await acquireWorker()

  try {
    onProgress?.(2, 'Preparando imagen…')
    const image = await loadImage(file)
    const headerCanvas = prepareCanvas(image, 'header')

    onProgress?.(5, 'Leyendo cabecera y códigos…')
    const barcodePromise = detectBarcodes(headerCanvas)
    const header = await recognizeCanvas(
      worker,
      slotIndex,
      headerCanvas,
      '6',
      (progress) => onProgress?.(5 + Math.round(progress * 0.52), 'Reconociendo cabecera…'),
    )
    const barcodes = await barcodePromise

    const barcodeText = barcodes.length
      ? '\n--- CÓDIGOS DETECTADOS ---\n' + barcodes.join('\n') + '\n'
      : ''

    const headerText = barcodeText + header.text
    const headerComplete = likelyHasHeader(headerText)
    const hasMaterial = likelyHasMaterialRow(headerText)
    const needsDetail =
      !headerComplete ||
      likelyReplenishment(headerText) ||
      !hasMaterial

    if (!needsDetail) {
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

    onProgress?.(58, 'Leyendo tabla de materiales…')
    const detailCanvas = prepareCanvas(image, 'detail')
    const detail = await recognizeCanvas(
      worker,
      slotIndex,
      detailCanvas,
      '6',
      (progress) => onProgress?.(58 + Math.round(progress * 0.41), 'Reconociendo detalle…'),
    )

    headerCanvas.width = 1
    headerCanvas.height = 1
    detailCanvas.width = 1
    detailCanvas.height = 1
    onProgress?.(100, 'Lectura completada')

    const confidence = header.confidence > 0 && detail.confidence > 0
      ? (header.confidence * 0.62) + (detail.confidence * 0.38)
      : Math.max(header.confidence, detail.confidence)

    return {
      text: barcodeText + header.text + '\n--- DETALLE TABLA ---\n' + detail.text,
      confidence,
      method: 'HEADER_PLUS_DETAIL',
      barcodes,
    }
  } finally {
    releaseWorker(slotIndex)
  }
}
