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

type CropRegion = {
  left: number
  top: number
  right: number
  bottom: number
  maxWidth: number
  minWidth?: number
}

function regionFor(mode: 'header' | 'detail') {
  // Las fotos de celular suelen incluir mesa/margen. Estas franjas priorizan
  // cabecera y tabla del formato Komatsu sin perder compatibilidad con otros PDFs/fotos.
  return mode === 'header'
    ? { left: 0.00, top: 0.02, right: 1.00, bottom: 0.50, maxWidth: 2200, minWidth: 1100 }
    : { left: 0.00, top: 0.23, right: 1.00, bottom: 0.70, maxWidth: 2400, minWidth: 1200 }
}

function prepareRegionCanvas(image: HTMLImageElement, region: CropRegion) {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) throw new Error('La imagen no tiene dimensiones válidas.')

  const cropX = Math.max(0, Math.round(sourceWidth * region.left))
  const cropY = Math.max(0, Math.round(sourceHeight * region.top))
  const cropRight = Math.min(sourceWidth, Math.round(sourceWidth * region.right))
  const cropBottom = Math.min(sourceHeight, Math.round(sourceHeight * region.bottom))
  const cropWidth = Math.max(1, cropRight - cropX)
  const cropHeight = Math.max(1, cropBottom - cropY)

  const scale = Math.min(2.6, region.maxWidth / cropWidth)
  const targetWidth = Math.max(region.minWidth ?? 700, Math.round(cropWidth * scale))
  const targetHeight = Math.max(1, Math.round(cropHeight * (targetWidth / cropWidth)))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No se pudo preparar la imagen para OCR.')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  )

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
  const data = imageData.data
  const low = percentile(data, 0.03)
  const high = percentile(data, 0.98)
  const span = Math.max(30, high - low)

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    let normalized = ((gray - low) / span) * 255
    normalized = Math.max(0, Math.min(255, normalized))
    normalized = Math.max(0, Math.min(255, (normalized - 128) * 1.28 + 128))

    if (normalized > 236) normalized = 255
    else if (normalized < 105) normalized *= 0.76

    const value = Math.round(normalized)
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function prepareCanvas(image: HTMLImageElement, mode: 'header' | 'detail') {
  return prepareRegionCanvas(image, regionFor(mode))
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
  psm: '3' | '6' | '7' | '11',
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

    let headerText = barcodeText + header.text
    let focusedConfidence = 0

    // Si la lectura general no encontró la guía/referencia, hacemos micro-OCR
    // sobre las zonas donde el formato Komatsu las imprime normalmente.
    if (!likelyHasHeader(headerText)) {
      onProgress?.(54, 'Afinando N° de guía y referencia…')

      const guideZone = prepareRegionCanvas(image, {
        left: 0.55, top: 0.045, right: 0.985, bottom: 0.22, maxWidth: 1500, minWidth: 900,
      })
      const referenceZone = prepareRegionCanvas(image, {
        left: 0.48, top: 0.18, right: 0.985, bottom: 0.40, maxWidth: 1700, minWidth: 950,
      })

      const guideFocused = await recognizeCanvas(worker, slotIndex, guideZone, '7')
      const referenceFocused = await recognizeCanvas(worker, slotIndex, referenceZone, '11')

      guideZone.width = 1
      guideZone.height = 1
      referenceZone.width = 1
      referenceZone.height = 1

      focusedConfidence = Math.max(guideFocused.confidence, referenceFocused.confidence)
      headerText +=
        '\n--- ZONA NUMERO GUIA ---\n' + guideFocused.text +
        '\n--- ZONA REFERENCIA ---\n' + referenceFocused.text
    }

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
        confidence: Math.max(header.confidence, focusedConfidence),
        method: 'HEADER_FAST',
        barcodes,
      }
    }

    onProgress?.(62, 'Leyendo detalle de materiales…')
    const detailCanvas = prepareCanvas(image, 'detail')
    const detail = await recognizeCanvas(
      worker,
      slotIndex,
      detailCanvas,
      '6',
      (progress) => onProgress?.(62 + Math.round(progress * 0.37), 'Reconociendo detalle…'),
    )

    headerCanvas.width = 1
    headerCanvas.height = 1
    detailCanvas.width = 1
    detailCanvas.height = 1
    onProgress?.(100, 'Lectura completada')

    const headerConfidence = Math.max(header.confidence, focusedConfidence)
    const confidence = headerConfidence > 0 && detail.confidence > 0
      ? (headerConfidence * 0.58) + (detail.confidence * 0.42)
      : Math.max(headerConfidence, detail.confidence)

    return {
      text: headerText + '\n--- DETALLE TABLA ---\n' + detail.text,
      confidence,
      method: 'HEADER_PLUS_DETAIL',
      barcodes,
    }
  } finally {
    releaseWorker(slotIndex)
  }
}
