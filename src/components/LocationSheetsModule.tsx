import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  CalendarDays,
  FileSpreadsheet,
  FileText,
  PackageCheck,
  RefreshCw,
  Search,
  Truck,
  Camera,
  Mail,
  Printer,
  AlertTriangle,
  Edit3,
  CheckCircle2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SearchableSelect } from './SearchableSelect'

type Supplier = 'KOMATSU' | 'CUMMINS' | 'POR_VALIDAR'

type ReceiptLine = {
  id: string
  line_no: number
  part_no: string | null
  stock_code: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  location: string | null
  sap_ingress: string | null
  quantity_received: number | null
  delivery_date: string | null
  verification_incident_id: string | null
}

type Receipt = {
  id: string
  receipt_date: string
  supplier: Supplier
  guide_no: string | null
  reference: string | null
  document_no: string | null
  warehouse: string | null
  source: 'SCANNER' | 'CARGA_MASIVA' | 'MANUAL' | 'MIGRADO'
  line_count: number
  notes: string | null
  sap_kmmp_no: string | null
  sap_fiori_no: string | null
  sap_status: 'PENDIENTE' | 'INGRESADO'
  guide_id: string | null
  guides?: { file_bucket: string | null; file_path: string | null; file_name: string | null }[] | { file_bucket: string | null; file_path: string | null; file_name: string | null } | null
  replenishment_receipt_lines?: ReceiptLine[]
}

type Ingress = {
  id: string
  ingress_no: number
  ingress_date: string
  supplier: Supplier
  warehouse: string | null
  notes: string | null
  created_at: string
  replenishment_receipts?: Receipt[]
}

type FlatLine = {
  id: string
  receiptId: string
  rowNo: number
  partNo: string
  stockCode: string
  description: string
  quantity: number | null
  location: string
  guideNo: string
  deliveryDate: string | null
  quantityReceived: number | null
  verificationIncidentId: string | null
  guideFile: { file_bucket: string | null; file_path: string | null; file_name: string | null } | null
  warehouse: string | null
  reference: string | null
  source: string
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return new Intl.DateTimeFormat('es-PE').format(date)
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(value)
}

function receivedQuantity(row: FlatLine) {
  return row.quantityReceived ?? row.quantity
}

function savePdfBlob(doc: jsPDF, filename: string) {
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2500)
}

function flattenIngress(
  ingress: Ingress,
  sapFilter: 'PENDIENTE' | 'INGRESADO' | 'TODOS'
): FlatLine[] {
  const receipts = [...(ingress.replenishment_receipts ?? [])]
    .filter((receipt) => sapFilter === 'TODOS' || receipt.sap_status === sapFilter)
    .sort((a, b) => {
      const date = String(a.receipt_date).localeCompare(String(b.receipt_date))
      if (date !== 0) return date
      return String(a.guide_no ?? '').localeCompare(String(b.guide_no ?? ''))
    })

  const output: FlatLine[] = []

  for (const receipt of receipts) {
    const lines = [...(receipt.replenishment_receipt_lines ?? [])]
      .sort((a, b) => a.line_no - b.line_no)

    for (const line of lines) {
      output.push({
        id: line.id,
        receiptId: receipt.id,
        rowNo: output.length + 1,
        partNo: line.part_no ?? '',
        stockCode: line.stock_code ?? '',
        description: line.description ?? '',
        quantity: line.quantity,
        location: line.location ?? '',
        guideNo: receipt.guide_no ?? '',
        deliveryDate: line.delivery_date,
        quantityReceived: line.quantity_received,
        verificationIncidentId: line.verification_incident_id,
        guideFile: Array.isArray(receipt.guides) ? receipt.guides[0] || null : receipt.guides || null,
        warehouse: receipt.warehouse,
        reference: receipt.reference,
        source: receipt.source,
      })
    }
  }

  const sorted = output.sort((a, b) => {
    const byPart = a.partNo.localeCompare(b.partNo, 'es', {
      numeric: true,
      sensitivity: 'base',
    })
    if (byPart !== 0) return byPart

    const byGuide = a.guideNo.localeCompare(b.guideNo, 'es', {
      numeric: true,
      sensitivity: 'base',
    })
    if (byGuide !== 0) return byGuide

    return a.rowNo - b.rowNo
  })

  return sorted.map((row, index) => ({
    ...row,
    rowNo: index + 1,
  }))
}

function excelDate(value: string) {
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return Number.isNaN(date.getTime()) ? value : date
}

function verificationWorkbook(rows: FlatLine[], received: number, target: FlatLine, reporter: string, project: string) {
  const body = rows.map((row) => {
    const actual = row.id === target.id ? received : receivedQuantity(row)
    return [project, row.partNo, row.description, row.quantity ?? '', actual ?? '',
      actual == null || row.quantity == null ? '' : Number(actual) - Number(row.quantity),
      row.guideNo, row.reference || '', reporter]
  })
  const sheet = XLSX.utils.aoa_to_sheet([
    ['VERIFICACIÓN DE INVENTARIO · REPOSICIÓN', project],
    ['Centro / Proyecto', 'Código', 'Descripción', 'Cant.', 'Cant. recibida', 'Diferencia', 'Guía de remisión', 'Referencia', 'Reportado por'],
    ...body,
  ])
  sheet['!cols'] = [22, 23, 46, 17, 18, 16, 24, 18, 31].map((wch) => ({ wch }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Verificación')
  const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new File([bytes], `Verificacion_Inventario_${target.guideNo || target.partNo}.xlsx`, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

async function exportIngressExcel(
  ingress: Ingress,
  rows: FlatLine[],
  sapFilter: 'PENDIENTE' | 'INGRESADO' | 'TODOS',
  responsible: string,
) {
  const moduleUrl = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/+esm'
  const XLSX: any = await import(/* @vite-ignore */ moduleUrl)

  const statusLabel =
    sapFilter === 'PENDIENTE' ? 'PENDIENTES SAP' :
    sapFilter === 'INGRESADO' ? 'INGRESADOS SAP' :
    'TODOS'

  // Formato de revisión manual: no incluye Stock Code ni Cant. recibida.
  // Stock Mina queda en blanco hasta contar con una fuente de stock confiable.
  const aoa: any[][] = [
    ['HOJA DE UBICACIÓN - REVISIÓN MANUAL', '', '', '', '', '', 'N°', ingress.ingress_no],
    [`${ingress.supplier} · ${fmtDate(ingress.ingress_date)} · ${statusLabel}${ingress.warehouse ? ' · ' + ingress.warehouse : ''}`, '', '', '', '', '', '', ''],
    ['NÚMERO DE PARTE', 'DESCRIPCIÓN', 'STOCK MINA', 'GUÍA DE REMISIÓN', 'CANT.', 'UBICACIÓN', 'RESPONSABLE', 'OBSERVACIÓN'],
    ...rows.map((row) => [
      row.partNo,
      row.description,
      '',
      row.guideNo,
      row.quantity ?? '',
      row.location || '',
      responsible,
      '',
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ]
  ws['!cols'] = [
    { wch: 21 },
    { wch: 46 },
    { wch: 15 },
    { wch: 21 },
    { wch: 11 },
    { wch: 18 },
    { wch: 29 },
    { wch: 34 },
  ]
  ws['!rows'] = [{ hpt: 27 }, { hpt: 18 }, { hpt: 32 }]
  ws['!autofilter'] = { ref: `A3:H${rows.length + 3}` }

  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'B8C0CC' } },
    bottom: { style: 'thin', color: { rgb: 'B8C0CC' } },
    left: { style: 'thin', color: { rgb: 'D7DCE3' } },
    right: { style: 'thin', color: { rgb: 'D7DCE3' } },
  }

  if (ws['A1']) {
    ws['A1'].s = {
      font: { name: 'Arial', sz: 14, bold: true, color: { rgb: '263F91' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
    }
  }

  if (ws['A2']) {
    ws['A2'].s = {
      font: { name: 'Arial', sz: 9, color: { rgb: '536174' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
    }
  }

  for (const address of ['G1', 'H1']) {
    const cell = ws[address]
    if (!cell) continue
    cell.s = {
      fill: { fgColor: { rgb: 'EEF2FF' } },
      font: { name: 'Arial', sz: address === 'H1' ? 18 : 13, bold: true, color: { rgb: '263F91' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: thinBorder,
    }
  }

  for (let col = 0; col < 8; col++) {
    const address = XLSX.utils.encode_cell({ r: 2, c: col })
    const cell = ws[address]
    if (!cell) continue
    cell.s = {
      fill: { fgColor: { rgb: '263F91' } },
      font: { name: 'Arial', sz: 9, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: thinBorder,
    }
  }

  for (let row = 3; row < rows.length + 3; row++) {
    ws['!rows'][row] = { hpt: 31 }
    for (let col = 0; col < 8; col++) {
      const address = XLSX.utils.encode_cell({ r: row, c: col })
      if (!ws[address]) ws[address] = { t: 's', v: '' }
      const cell = ws[address]
      cell.s = {
        font: { name: 'Arial', sz: 9, bold: col === 0, color: { rgb: '334155' } },
        alignment: {
          horizontal: [2, 4].includes(col) ? 'center' : 'left',
          vertical: 'center',
          wrapText: [1, 6, 7].includes(col),
        },
        border: thinBorder,
      }
      if (col === 4 && typeof cell.v === 'number') {
        const decimals = String(cell.v).split('.')[1]?.length ?? 0
        cell.z = decimals ? `#,##0.${'0'.repeat(Math.min(decimals, 3))}` : '#,##0'
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `Ingreso ${ingress.ingress_no}`)
  XLSX.writeFile(
    wb,
    `KOMTROL_Revision_Manual_${ingress.ingress_no}_${sapFilter}_${ingress.ingress_date}.xlsx`
  )
}

function exportIngressPdf(
  ingress: Ingress,
  rows: FlatLine[],
  sapFilter: 'PENDIENTE' | 'INGRESADO' | 'TODOS',
  responsible: string,
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = 7
  const right = 7
  const numberBoxWidth = 42
  const headerHeight = 19
  const reportWidth = pageWidth - left - right
  const statusLabel =
    sapFilter === 'PENDIENTE' ? 'PENDIENTES SAP' :
    sapFilter === 'INGRESADO' ? 'INGRESADOS SAP' :
    'TODOS'

  const drawReportHeader = () => {
    doc.setDrawColor(215, 225, 255)
    doc.setLineWidth(0.5)
    doc.setFillColor(255, 255, 255)
    doc.rect(left, 7, reportWidth - numberBoxWidth, headerHeight, 'FD')

    doc.setTextColor(38, 63, 145)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(
      'HOJA DE UBICACIÓN - REVISIÓN MANUAL',
      left + (reportWidth - numberBoxWidth) / 2,
      14,
      { align: 'center' }
    )

    doc.setTextColor(83, 97, 116)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(
      `${ingress.supplier} · ${fmtDate(ingress.ingress_date)} · ${statusLabel}${ingress.warehouse ? ' · ' + ingress.warehouse : ''}`,
      left + (reportWidth - numberBoxWidth) / 2,
      20.5,
      { align: 'center' }
    )

    const boxX = left + reportWidth - numberBoxWidth
    doc.setFillColor(238, 242, 255)
    doc.rect(boxX, 7, numberBoxWidth, headerHeight, 'FD')
    doc.setTextColor(38, 63, 145)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('N°', boxX + 10, 18, { align: 'center' })
    doc.setFontSize(15)
    doc.text(String(ingress.ingress_no), boxX + 28, 18.5, { align: 'center' })
  }

  drawReportHeader()

  autoTable(doc, {
    startY: 31,
    margin: { left, right, top: 31, bottom: 12 },
    head: [[
      'NÚMERO DE PARTE',
      'DESCRIPCIÓN',
      'STOCK MINA',
      'GUÍA DE REMISIÓN',
      'CANT.',
      'UBICACIÓN',
      'RESPONSABLE',
      'OBSERVACIÓN',
    ]],
    body: rows.map((row) => [
      row.partNo,
      row.description,
      '',
      row.guideNo,
      row.quantity == null ? '' : formatQuantity(Number(row.quantity)),
      row.location || '',
      responsible,
      '',
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 6.2,
      cellPadding: 1.5,
      lineColor: [190, 198, 210],
      lineWidth: 0.18,
      textColor: [51, 65, 85],
      valign: 'middle',
      minCellHeight: 11,
    },
    headStyles: {
      fillColor: [38, 63, 145],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 6,
      minCellHeight: 10,
    },
    columnStyles: {
      0: { cellWidth: 29, fontStyle: 'bold' },
      1: { cellWidth: 62 },
      2: { cellWidth: 21, halign: 'center' },
      3: { cellWidth: 31 },
      4: { cellWidth: 17, halign: 'center' },
      5: { cellWidth: 24 },
      6: { cellWidth: 42 },
      7: { cellWidth: 48 },
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) drawReportHeader()
      doc.setTextColor(110, 120, 135)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text(
        `Ingreso ${ingress.ingress_no} · Revisión manual · Página ${data.pageNumber}`,
        pageWidth - right,
        pageHeight - 5,
        { align: 'right' }
      )
    },
  })

  savePdfBlob(
    doc,
    `KOMTROL_Revision_Manual_${ingress.ingress_no}_${sapFilter}_${ingress.ingress_date}.pdf`
  )
}

type ReporterProfile = {
  full_name: string
  role: 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
  shift_name?: string | null
}

export function LocationSheetsModule({ userId, profile }: { userId: string; profile: ReporterProfile | null }) {
  const [ingresses, setIngresses] = useState<Ingress[]>([])
  const [selected, setSelected] = useState<Ingress | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [message, setMessage] = useState('')
  const [numberSearch, setNumberSearch] = useState('')
  const [receivedSearch, setReceivedSearch] = useState('')
  const [dateSearch, setDateSearch] = useState('')
  const [supplier, setSupplier] = useState('TODOS')
  const [sapFilter, setSapFilter] = useState<'PENDIENTE' | 'INGRESADO' | 'TODOS'>('PENDIENTE')
  const [detailMode, setDetailMode] = useState<'PRINT' | 'VERIFY'>('PRINT')
  const [editingVerificationLineId, setEditingVerificationLineId] = useState<string | null>(null)
  const [receivedDrafts, setReceivedDrafts] = useState<Record<string, string>>({})
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<string, string>>({})
  const [guideFiles, setGuideFiles] = useState<Record<string, File>>({})
  const [photos, setPhotos] = useState<Record<string, File[]>>({})
  const [savingLine, setSavingLine] = useState<string | null>(null)
  const [incidentMailStatus, setIncidentMailStatus] = useState<Record<string, string>>({})

  async function importVerificationExcel(file?: File) {
    if (!file || profile?.role === 'SUPERVISOR') return
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const normalized = (value: unknown) => String(value ?? '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
      const lines = ingresses.flatMap((entry) => flattenIngress(entry, 'TODOS'))
      const imported: Record<string, string> = {}
      const groups = new Map<string, {
        guide_no: string; receipt_date: string;
        lines: { part_no: string; description: string; quantity: number; quantity_received: number }[]
      }>()
      let unmatched = 0
      for (const name of workbook.SheetNames) {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '', raw: false })
        const headerIndex = grid.findIndex((cells) => {
          const keys = cells.map(normalized)
          return keys.some((key) => key === 'CODIGO' || key === 'NUMERODEPARTE' || key === 'MATERIAL')
            && keys.some((key) => key.includes('CANTRECIBIDA') || key.includes('CANTIDADRECIBIDA'))
        })
        if (headerIndex < 0) continue
        const keys = grid[headerIndex].map(normalized)
        const codeAt = keys.findIndex((key) => ['CODIGO', 'NUMERODEPARTE', 'MATERIAL'].includes(key))
        const amountAt = keys.findIndex((key) => key.includes('CANTRECIBIDA') || key.includes('CANTIDADRECIBIDA'))
        const orderedAt = keys.findIndex((key) => key.includes('CANTPEDIDO') || key.includes('CANTPEDIDA'))
        const descriptionAt = keys.findIndex((key) => key === 'DESCRIPCION')
        const dateAt = keys.findIndex((key) => key.includes('FECHADERECEPCION'))
        const guideAt = keys.findIndex((key) => key.includes('GUIADEREMISION') || key === 'GUIA')
        for (const cells of grid.slice(headerIndex + 1)) {
          const code = normalized(cells[codeAt])
          const value = String(cells[amountAt] ?? '').trim()
          if (!code || !value) continue
          const number = Number(value.replace(',', '.'))
          if (!Number.isFinite(number) || number < 0) { unmatched++; continue }
          const guide = guideAt >= 0 ? normalized(cells[guideAt]) : ''
          const matches = lines.filter((row) => !row.verificationIncidentId && normalized(row.partNo) === code
            && (!guide || normalized(row.guideNo) === guide))
          if (matches.length === 1) {
            imported[matches[0].id] = String(number)
            continue
          }
          if (matches.length > 1 || !guide || orderedAt < 0 || !code) { unmatched++; continue }
          const expected = Number(String(cells[orderedAt] ?? '').replace(',', '.'))
          if (!Number.isFinite(expected) || expected < 0) { unmatched++; continue }
          const dateText = dateAt >= 0 ? String(cells[dateAt] ?? '') : ''
          const localDate = dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
          const receiptDate = localDate ? `${localDate[3]}-${localDate[2].padStart(2, '0')}-${localDate[1].padStart(2, '0')}`
            : /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? dateText : new Date().toISOString().slice(0, 10)
          const key = `${guide}|${receiptDate}`
          if (!groups.has(key)) groups.set(key, { guide_no: String(cells[guideAt]).trim().toUpperCase(), receipt_date: receiptDate, lines: [] })
          groups.get(key)!.lines.push({
            part_no: String(cells[codeAt]).trim().toUpperCase(),
            description: descriptionAt >= 0 ? String(cells[descriptionAt] || '').trim() : '',
            quantity: expected, quantity_received: number,
          })
        }
      }
      setReceivedDrafts((previous) => ({ ...previous, ...imported }))
      let created = 0
      let skipped = 0
      if (groups.size) {
        const warehouse = selected?.warehouse || profile?.warehouse
        if (!warehouse) throw new Error('Selecciona un ingreso o usa un perfil con almacén para importar guías nuevas.')
        const { data, error } = await supabase.rpc('import_replenishment_verification', {
          p_groups: Array.from(groups.values()), p_warehouse: warehouse,
          p_supplier: selected?.supplier || (supplier === 'TODOS' ? 'POR_VALIDAR' : supplier),
        })
        if (error) throw new Error(error.message)
        created = Number(data?.created || 0)
        skipped = Number(data?.skipped || 0)
        await reload()
      }
      setMessage(created || Object.keys(imported).length
        ? `${created} guía(s) nueva(s) cargadas y ${Object.keys(imported).length} cantidad(es) vinculadas. ${skipped ? `${skipped} guía(s) ya existentes. ` : ''}${unmatched ? `${unmatched} fila(s) sin coincidencia. ` : ''}Revisa cada diferencia, adjunta el PDF si falta y pulsa Verificar para registrar la incidencia y enviar el correo.`
        : 'No se importaron líneas. Revisa las columnas Código, Cant Pedido, Cant Recibida y Guía de Remisión; las guías existentes no se duplican.')
    } catch (error) {
      setMessage(`No se pudo leer el Excel: ${error instanceof Error ? error.message : 'formato no válido'}`)
    }
  }

  async function reload() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('replenishment_ingresses')
      .select(`
        id,
        ingress_no,
        ingress_date,
        supplier,
        warehouse,
        notes,
        created_at,
        replenishment_receipts (
          id,
          receipt_date,
          supplier,
          guide_no,
          guide_id,
          reference,
          document_no,
          warehouse,
          source,
          line_count,
          notes,
          sap_kmmp_no,
          sap_fiori_no,
          sap_status,
          guides (file_bucket, file_path, file_name),
          replenishment_receipt_lines (
            id,
            line_no,
            part_no,
            stock_code,
            description,
            quantity,
            unit,
            location,
            sap_ingress,
            quantity_received,
            delivery_date,
            verification_incident_id
          )
        )
      `)
      .order('ingress_no', { ascending: false })
      .limit(1000)

    if (error) {
      setMessage(error.message)
      setIngresses([])
    } else {
      const rows = (data ?? []) as unknown as Ingress[]
      setIngresses(rows)
      const incidentIds = rows.flatMap((entry) => (entry.replenishment_receipts ?? [])
        .flatMap((receipt) => (receipt.replenishment_receipt_lines ?? [])
          .map((line) => line.verification_incident_id).filter((id): id is string => Boolean(id))))
      if (incidentIds.length) {
        const { data: statuses } = await supabase.from('incidents')
          .select('id,auto_email_status').in('id', incidentIds)
        setIncidentMailStatus(Object.fromEntries((statuses ?? []).map((item) => [item.id, item.auto_email_status])))
      } else setIncidentMailStatus({})
      if (selected) {
        const refreshed = rows.find((row) => row.id === selected.id) ?? null
        setSelected(refreshed)
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  const visible = useMemo(() => {
    const no = numberSearch.trim()
    return ingresses.filter((row) => {
      if (no && !String(row.ingress_no).includes(no)) return false
      if (dateSearch && row.ingress_date !== dateSearch) return false
      if (supplier !== 'TODOS' && row.supplier !== supplier) return false
      if (
        sapFilter !== 'TODOS' &&
        !(row.replenishment_receipts ?? []).some((receipt) => receipt.sap_status === sapFilter)
      ) return false
      return true
    })
  }, [ingresses, numberSearch, dateSearch, supplier, sapFilter])

  const selectedRows = useMemo(
    () => selected ? flattenIngress(selected, sapFilter) : [],
    [selected, sapFilter]
  )

  const matchingSelectedRows = useMemo(() => {
    const query = receivedSearch.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE')
    if (!query) return selectedRows
    return selectedRows.filter((row) => [row.partNo, row.description, row.guideNo, row.reference]
      .some((field) => field.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE').includes(query)))
  }, [selectedRows, receivedSearch])

  function matchingReceipts(row: Ingress) {
    return (row.replenishment_receipts ?? [])
      .filter((receipt) => sapFilter === 'TODOS' || receipt.sap_status === sapFilter)
  }

  function guideCount(row: Ingress) {
    return matchingReceipts(row).length
  }

  function lineCount(row: Ingress) {
    return matchingReceipts(row)
      .reduce((sum, receipt) => sum + (receipt.replenishment_receipt_lines?.length ?? 0), 0)
  }

  async function attachFile(incidentId: string, file: File, type: 'GUIA' | 'REPORTE' | 'FOTO') {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${userId}/${incidentId}/${crypto.randomUUID()}-${safe}`
    const { error: uploadError } = await supabase.storage.from('incident-evidence')
      .upload(storagePath, file, { upsert: false, contentType: file.type || 'application/octet-stream' })
    if (uploadError) throw new Error(`${file.name}: ${uploadError.message}`)
    const { error } = await supabase.from('incident_attachments').insert({
      incident_id: incidentId, attachment_type: type, bucket: 'incident-evidence',
      storage_path: storagePath, file_name: file.name, content_type: file.type,
      size_bytes: file.size, uploaded_by: userId,
    })
    if (error) {
      await supabase.storage.from('incident-evidence').remove([storagePath])
      throw new Error(`${file.name}: ${error.message}`)
    }
  }

  async function saveVerification(row: FlatLine) {
    if (profile?.role === 'SUPERVISOR' || savingLine || row.verificationIncidentId) return
    const raw = receivedDrafts[row.id] ?? (receivedQuantity(row) == null ? '' : String(receivedQuantity(row)))
    const received = Number(raw)
    if (!raw.trim() || !Number.isFinite(received) || received < 0) {
      setMessage('Ingresa una cantidad recibida válida (cero si no llegó el material).')
      return
    }
    const expected = Number(row.quantity)
    if (row.quantity == null || !Number.isFinite(expected)) {
      setMessage('La cantidad pedida debe estar registrada antes de verificar.')
      return
    }
    const difference = received - expected
    const originalPdf = row.guideFile?.file_path && /\.pdf$/i.test(row.guideFile.file_name || row.guideFile.file_path)
      ? row.guideFile : null
    const newPdf = guideFiles[row.receiptId]
    if (difference !== 0 && !originalPdf && (!newPdf || (newPdf.type !== 'application/pdf' && !/\.pdf$/i.test(newPdf.name)))) {
      setMessage(`Adjunta la guía ${row.guideNo || 'de esta reposición'} en PDF para comunicar la diferencia.`)
      return
    }
    if (newPdf && newPdf.size > 2 * 1024 * 1024) {
      setMessage('La guía PDF supera 2 MB. Adjunta un archivo más pequeño para el correo.')
      return
    }
    const evidencePhotos = photos[row.id] || []
    if (evidencePhotos.some((photo) => !photo.type.startsWith('image/') || photo.size > 1_500_000)) {
      setMessage('Cada foto debe ser una imagen de hasta 1,5 MB.')
      return
    }

    setSavingLine(row.id)
    setMessage('')
    const deliveryDate = deliveryDrafts[row.id] || row.deliveryDate || null
    if (difference === 0) {
      const { data, error } = await supabase.from('replenishment_receipt_lines')
        .update({ quantity_received: received, delivery_date: deliveryDate, verified_at: new Date().toISOString(), verified_by: userId })
        .eq('id', row.id).is('verification_incident_id', null).select('id')
      if (error || !data?.length) setMessage(error?.message || 'No se pudo guardar la verificación. Revisa tus permisos.')
      else { await reload(); setMessage('Cantidad verificada. No hay diferencia ni correo por enviar.') }
      setSavingLine(null)
      return
    }

    const warehouse = row.warehouse || selected?.warehouse || profile?.warehouse
    if (!warehouse) {
      setSavingLine(null)
      setMessage('Esta guía no tiene almacén asignado. Complétalo antes de registrar la incidencia.')
      return
    }
    const project = profile?.project || profile?.warehouse || warehouse
    const dateLabel = new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: '2-digit',
    }).format(new Date()).replaceAll('/', '.')
    const subject = `VERIFICACIÓN DE INVENTARIO / ${project.toUpperCase()} / ${dateLabel}`
    const incidentNo = `INC-REP-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`

    const { data: incident, error: incidentError } = await supabase.from('incidents').insert({
      incident_no: incidentNo, incident_type: difference < 0 ? 'FALTANTE' : 'SOBRANTE',
      detection_mode: 'VERIFICACION_INVENTARIO', status: 'ABIERTO',
      guide_no: row.guideNo || null, document_no: row.reference || null,
      purchase_order: row.reference?.startsWith('8') ? row.reference : null,
      material_no: row.partNo, stock_code: row.stockCode || null,
      description: row.description || null, location: row.location || null,
      qty_expected: expected, qty_received: received,
      notes: `Verificación de reposición · Ingreso ${selected?.ingress_no || '—'} · Referencia: ${row.reference || 'sin referencia'} · Reportado por ${profile?.full_name || 'usuario'} (${profile?.role || 'perfil'}).`,
      warehouse, project: profile?.project || null, group_name: profile?.group_name || null,
      shift_name: profile?.shift_name || null, operation_area: 'GENERAL',
      verification_email_subject: subject, auto_email_status: 'PENDIENTE',
      created_by: userId, detected_at: new Date().toISOString(),
    }).select('id').single()
    if (incidentError || !incident) {
      setSavingLine(null)
      setMessage(incidentError?.message || 'No se pudo crear la incidencia.')
      return
    }

    const { data: linked, error: linkError } = await supabase.from('replenishment_receipt_lines')
      .update({ quantity_received: received, delivery_date: deliveryDate, verified_at: new Date().toISOString(),
        verified_by: userId, verification_incident_id: incident.id })
      .eq('id', row.id).is('verification_incident_id', null).select('id')
    if (linkError || !linked?.length) {
      setSavingLine(null)
      setMessage(`Incidencia ${incidentNo} creada, pero la línea no se vinculó: ${linkError?.message || 'ya fue verificada'}. Revisa Incidencias antes de reintentar.`)
      return
    }

    try {
      if (newPdf) await attachFile(incident.id, newPdf, 'GUIA')
      else if (originalPdf) {
        const { error } = await supabase.from('incident_attachments').insert({
          incident_id: incident.id, attachment_type: 'GUIA', bucket: originalPdf.file_bucket || 'guide-documents',
          storage_path: originalPdf.file_path, file_name: originalPdf.file_name || `${row.guideNo}.pdf`,
          content_type: 'application/pdf', uploaded_by: userId,
        })
        if (error) throw new Error(`Guía PDF: ${error.message}`)
      }
      const sameGuide = selectedRows.filter((item) => item.receiptId === row.receiptId)
      const report = verificationWorkbook(sameGuide, received, row, profile?.full_name || 'Usuario', project)
      await attachFile(incident.id, report, 'REPORTE')
      for (const photo of evidencePhotos) await attachFile(incident.id, photo, 'FOTO')
      const { data: email, error: mailError } = await supabase.functions.invoke('send-outlook-notification', {
        body: { incidentId: incident.id },
      })
      if (mailError || !email?.ok) throw new Error(email?.error || mailError?.message || 'Correo pendiente')
      await reload()
      setMessage(`Incidencia ${incidentNo} registrada y correo enviado con la guía y el Excel de verificación.`)
    } catch (error) {
      await reload()
      setMessage(`Incidencia ${incidentNo} registrada. El correo quedó pendiente: ${error instanceof Error ? error.message : 'revisa los adjuntos'}.`)
    } finally {
      setSavingLine(null)
      setEditingVerificationLineId(null)
    }
  }

  async function retryVerification(row: FlatLine) {
    if (!row.verificationIncidentId || profile?.role === 'SUPERVISOR' || savingLine) return
    setSavingLine(row.id)
    setMessage('')
    const incidentId = row.verificationIncidentId
    try {
      const { data: attachments, error } = await supabase.from('incident_attachments')
        .select('attachment_type').eq('incident_id', incidentId)
      if (error) throw new Error(error.message)
      const types = new Set((attachments ?? []).map((item) => item.attachment_type))
      if (!types.has('GUIA')) {
        const pdf = guideFiles[row.receiptId]
        const original = row.guideFile?.file_path && /\.pdf$/i.test(row.guideFile.file_name || row.guideFile.file_path)
          ? row.guideFile : null
        if (pdf?.size && pdf.size <= 2 * 1024 * 1024 && (pdf.type === 'application/pdf' || /\.pdf$/i.test(pdf.name))) {
          await attachFile(incidentId, pdf, 'GUIA')
        } else if (original) {
          const { error: insertError } = await supabase.from('incident_attachments').insert({
            incident_id: incidentId, attachment_type: 'GUIA', bucket: original.file_bucket || 'guide-documents',
            storage_path: original.file_path, file_name: original.file_name || `${row.guideNo}.pdf`,
            content_type: 'application/pdf', uploaded_by: userId,
          })
          if (insertError) throw new Error(insertError.message)
        } else throw new Error('Adjunta una guía PDF de hasta 2 MB.')
      }
      if (!types.has('REPORTE')) {
        const report = verificationWorkbook(
          selectedRows.filter((item) => item.receiptId === row.receiptId), Number(row.quantityReceived), row,
          profile?.full_name || 'Usuario', profile?.project || profile?.warehouse || row.warehouse || 'Almacén',
        )
        await attachFile(incidentId, report, 'REPORTE')
      }
      if (photos[row.id]?.length && !types.has('FOTO')) {
        for (const photo of photos[row.id]) {
          if (photo.size > 1_500_000 || !photo.type.startsWith('image/')) {
            throw new Error('Cada foto debe ser una imagen de hasta 1,5 MB.')
          }
          await attachFile(incidentId, photo, 'FOTO')
        }
      }
      const { data: email, error: emailError } = await supabase.functions.invoke('send-outlook-notification', {
        body: { incidentId },
      })
      if (emailError || !email?.ok) throw new Error(email?.error || emailError?.message || 'No se pudo enviar el correo')
      await reload()
      setMessage('Correo enviado con la guía PDF y el Excel de verificación.')
    } catch (error) {
      setMessage(`Correo pendiente: ${error instanceof Error ? error.message : 'revisa los adjuntos'}`)
    } finally {
      setSavingLine(null)
    }
  }

  async function exportSelectedExcel() {
    if (!selected) return
    setExporting('excel')
    setMessage('')
    try {
      await exportIngressExcel(selected, selectedRows, sapFilter, profile?.full_name || 'Responsable')
    } catch (error) {
      setMessage(
        `No se pudo generar el Excel: ${error instanceof Error ? error.message : 'error desconocido'}`
      )
    } finally {
      setExporting(null)
    }
  }

  async function exportSelectedPdf() {
    if (!selected) return
    setExporting('pdf')
    setMessage('')
    try {
      await exportIngressPdf(selected, selectedRows, sapFilter, profile?.full_name || 'Responsable')
    } catch (error) {
      setMessage(
        `No se pudo generar el PDF: ${error instanceof Error ? error.message : 'error desconocido'}`
      )
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="replenishment-module">
      <section className="panel replenishment-panel">
        <div className="panel-title">
          <div>
            <h3>Hojas de Ubicación</h3>
            <p>Por defecto muestra solo guías PENDIENTES de ingreso SAP. Las guías con documento 18… o 50… pasan a INGRESADO y dejan de aparecer aquí.</p>
          </div>
          <div className="button-row">
            {profile?.role !== 'SUPERVISOR' && <label className="secondary-button verification-upload"><FileSpreadsheet size={15} /> Importar verificación
              <input type="file" accept=".xlsx,.xls" onChange={(event) => {
                void importVerificationExcel(event.target.files?.[0])
                event.target.value = ''
              }} />
            </label>}
            <button className="icon-button" onClick={reload} title="Actualizar"><RefreshCw size={18} /></button>
          </div>
        </div>

        <div className="replenishment-search-grid">
          <label>
            N° de Ingreso
            <div className="search">
              <Search size={16} />
              <input
                inputMode="numeric"
                value={numberSearch}
                onChange={(e) => setNumberSearch(e.target.value.replace(/\D/g, ''))}
                placeholder="Ej. 101"
              />
            </div>
          </label>

          <label>
            Fecha de ingreso
            <input
              type="date"
              value={dateSearch}
              onChange={(e) => setDateSearch(e.target.value)}
            />
          </label>

          <label>
            Proveedor
            <SearchableSelect
              value={supplier}
              onChange={(value)=>setSupplier(value||'TODOS')}
              options={[
                {value:'TODOS',label:'Todos'},
                {value:'KOMATSU',label:'KOMATSU'},
                {value:'CUMMINS',label:'CUMMINS'},
                {value:'POR_VALIDAR',label:'Por validar'},
              ]}
              placeholder="Buscar proveedor…"
              clearable={false}
              ariaLabel="Filtrar por proveedor"
            />
          </label>

          <label>
            Estado SAP
            <SearchableSelect
              value={sapFilter}
              onChange={(value)=>setSapFilter((value||'PENDIENTE') as 'PENDIENTE' | 'INGRESADO' | 'TODOS')}
              options={[
                {value:'PENDIENTE',label:'Pendientes SAP'},
                {value:'INGRESADO',label:'Ingresados SAP'},
                {value:'TODOS',label:'Todos'},
              ]}
              placeholder="Buscar estado SAP…"
              clearable={false}
              ariaLabel="Filtrar por estado SAP"
            />
          </label>

          <button
            className="secondary-button clear-ingress-filter"
            onClick={() => {
              setNumberSearch('')
              setDateSearch('')
              setSupplier('TODOS')
              setSapFilter('PENDIENTE')
            }}
          >
            Limpiar filtros
          </button>
        </div>

        {message && <div className="inline-message">{message}</div>}

        {loading ? (
          <div className="screen-center compact">
            <RefreshCw className="spin" size={22} />
            <p>Cargando ingresos…</p>
          </div>
        ) : (
          <div className="table-wrap ingress-list-table">
            <table>
              <thead>
                <tr>
                  <th>N° Ingreso</th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Almacén</th>
                  <th>Guías</th>
                  <th>Líneas</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td><b className="ingress-number">{row.ingress_no}</b></td>
                    <td>{fmtDate(row.ingress_date)}</td>
                    <td>
                      <span className={row.supplier === 'CUMMINS' ? 'supplier-chip cummins' : row.supplier === 'KOMATSU' ? 'supplier-chip' : 'supplier-chip pending'}>
                        {row.supplier.replace('_', ' ')}
                      </span>
                    </td>
                    <td>{row.warehouse || '—'}</td>
                    <td><b>{guideCount(row)}</b></td>
                    <td><b>{lineCount(row)}</b></td>
                    <td>
                      <button className="secondary-button small-report" onClick={() => { setSelected(row); setReceivedSearch(''); setDetailMode('PRINT'); setEditingVerificationLineId(null) }}>
                        <FileText size={14} /> Ver ingreso
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!visible.length && (
              <div className="empty-work">
                <PackageCheck size={30} />
                <b>No se encontraron hojas de ubicación</b>
                <p>Busca la hoja por N° de Ingreso, fecha o proveedor.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {selected && (
        <section className={`panel ingress-detail-report ${detailMode === 'PRINT' ? 'location-print-mode' : 'location-verify-mode'}`}>
          <div className="ingress-report-title">
            <div>
              <h2>HOJA DE UBICACIÓN - RECEPCIÓN DE REPUESTOS</h2>
              <p>
                {selected.supplier} · {fmtDate(selected.ingress_date)}
                {selected.warehouse ? ` · ${selected.warehouse}` : ''}
              </p>
            </div>
            <div className="ingress-report-number">
              <span>N°</span>
              <b>{selected.ingress_no}</b>
            </div>
          </div>

          <div className="ingress-detail-actions">
            <div className="ingress-detail-summary">
              <span><Truck size={15} /> {guideCount(selected)} guías</span>
              <span><PackageCheck size={15} /> {selectedRows.length} líneas</span>
              <span><CalendarDays size={15} /> {fmtDate(selected.ingress_date)}</span>
              <span className={sapFilter === 'PENDIENTE' ? 'sap-filter-chip pending' : sapFilter === 'INGRESADO' ? 'sap-filter-chip entered' : 'sap-filter-chip'}>
                {sapFilter === 'PENDIENTE' ? 'Pendientes SAP' : sapFilter === 'INGRESADO' ? 'Ingresados SAP' : 'Todos'}
              </span>
            </div>
            <div className="button-row ingress-mode-actions">
              <button className="secondary-button" onClick={() => { setSelected(null); setReceivedSearch(''); setDetailMode('PRINT'); setEditingVerificationLineId(null) }}>
                Cerrar detalle
              </button>
              <button
                className={detailMode === 'PRINT' ? 'primary-button' : 'secondary-button'}
                onClick={() => { setDetailMode('PRINT'); setEditingVerificationLineId(null); setReceivedSearch('') }}
              >
                <Printer size={16} /> Revisión manual
              </button>
              {profile?.role !== 'SUPERVISOR' && (
                <button
                  className={detailMode === 'VERIFY' ? 'primary-button' : 'secondary-button'}
                  onClick={() => { setDetailMode('VERIFY'); setEditingVerificationLineId(null) }}
                >
                  <AlertTriangle size={16} /> Verificación inventario
                </button>
              )}
              {detailMode === 'PRINT' && <>
                <button className="secondary-button" disabled={!selectedRows.length} onClick={() => window.print()}>
                  <Printer size={16} /> Imprimir
                </button>
                <button className="secondary-button" disabled={Boolean(exporting) || !selectedRows.length} onClick={exportSelectedPdf}>
                  {exporting === 'pdf' ? <RefreshCw className="spin" size={16} /> : <FileText size={16} />}
                  {exporting === 'pdf' ? 'Generando PDF…' : 'PDF'}
                </button>
                <button className="secondary-button" disabled={Boolean(exporting) || !selectedRows.length} onClick={exportSelectedExcel}>
                  {exporting === 'excel' ? <RefreshCw className="spin" size={16} /> : <FileSpreadsheet size={16} />}
                  {exporting === 'excel' ? 'Generando Excel…' : 'Excel'}
                </button>
              </>}
            </div>
          </div>

          {detailMode === 'PRINT' ? (
            <div className="manual-review-view">
              <div className="manual-review-note">
                <Printer size={17} />
                <div>
                  <b>Formato para revisión manual</b>
                  <span>Imprime esta hoja y valida físicamente el material. Stock Mina se deja en blanco mientras no exista una fuente de stock confiable.</span>
                </div>
              </div>

              <div className="table-wrap ingress-detail-table manual-review-table">
                <table>
                  <thead>
                    <tr>
                      <th>NÚMERO DE PARTE</th>
                      <th>DESCRIPCIÓN</th>
                      <th>STOCK MINA</th>
                      <th>GUÍA DE REMISIÓN</th>
                      <th>CANT.</th>
                      <th>UBICACIÓN</th>
                      <th>RESPONSABLE</th>
                      <th>OBSERVACIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRows.map((row) => (
                      <tr key={`print-${row.id}`}>
                        <td><b>{row.partNo || '—'}</b></td>
                        <td>{row.description || '—'}</td>
                        <td className="manual-empty-cell">&nbsp;</td>
                        <td>{row.guideNo || '—'}</td>
                        <td className="manual-qty">{row.quantity == null ? '' : formatQuantity(Number(row.quantity))}</td>
                        <td>{row.location || ''}</td>
                        <td>{profile?.full_name || '—'}</td>
                        <td className="manual-observation-cell">&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!selectedRows.length && (
                  <div className="empty-work">
                    <FileText size={28} />
                    <b>Este ingreso aún no tiene líneas</b>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="inventory-verification-view">
              {profile?.role !== 'SUPERVISOR' && <div className="verification-import">
                <label className="secondary-button"><FileSpreadsheet size={15} /> Cargar cantidades desde Excel
                  <input type="file" accept=".xlsx,.xls" onChange={(event) => {
                    void importVerificationExcel(event.target.files?.[0])
                    event.target.value = ''
                  }} />
                </label>
                <small>Opcional. También puedes buscar un material y habilitar solo su cantidad recibida para reportar una diferencia.</small>
              </div>}

              <div className="verification-search">
                <label htmlFor="verification-material-search">Buscar material para reportar faltante o sobrante</label>
                <div className="search">
                  <Search size={16} />
                  <input id="verification-material-search" type="search" value={receivedSearch}
                    onChange={(event) => setReceivedSearch(event.target.value)}
                    placeholder="Número de parte, descripción, guía o referencia…" />
                </div>
                <small>{receivedSearch ? `${matchingSelectedRows.length} de ${selectedRows.length} líneas` : 'Selecciona Reportar diferencia para habilitar únicamente la cantidad recibida de esa línea.'}</small>
              </div>

              <div className="table-wrap ingress-detail-table verification-mode-table">
                <table>
                  <thead>
                    <tr>
                      <th>NÚMERO DE PARTE</th>
                      <th>DESCRIPCIÓN</th>
                      <th>GUÍA DE REMISIÓN</th>
                      <th>REFERENCIA</th>
                      <th>CANT.</th>
                      <th>UBICACIÓN</th>
                      <th>CANT. RECIBIDA</th>
                      <th>EVIDENCIA</th>
                      <th>ACCIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchingSelectedRows.map((row) => {
                      const isEditing = editingVerificationLineId === row.id
                      const draft = receivedDrafts[row.id] ?? (receivedQuantity(row) == null ? '' : String(receivedQuantity(row)))
                      const received = draft === '' ? NaN : Number(draft)
                      const expected = row.quantity == null ? NaN : Number(row.quantity)
                      const delta = Number.isFinite(received) && Number.isFinite(expected) ? received - expected : 0
                      const hasDifference = Number.isFinite(received) && Number.isFinite(expected) && delta !== 0

                      return (
                        <tr key={`verify-${row.id}`} className={isEditing ? 'verification-row-editing' : ''}>
                          <td><b>{row.partNo || '—'}</b></td>
                          <td>{row.description || '—'}</td>
                          <td>{row.guideNo || '—'}</td>
                          <td><b>{row.reference || '—'}</b></td>
                          <td>{row.quantity == null ? '—' : formatQuantity(Number(row.quantity))}</td>
                          <td>{row.location || '—'}</td>
                          <td>
                            {row.verificationIncidentId ? (
                              <span className="verification-locked-value">{row.quantityReceived == null ? '—' : formatQuantity(Number(row.quantityReceived))}</span>
                            ) : isEditing ? (
                              <div className="verification-count-editor">
                                <input className="verification-count" type="number" min="0" step="0.001"
                                  value={draft}
                                  onChange={(event) => setReceivedDrafts((previous) => ({ ...previous, [row.id]: event.target.value }))}
                                  disabled={Boolean(savingLine)}
                                  autoFocus
                                  aria-label={`Cantidad recibida de ${row.partNo}`}
                                  placeholder="0"
                                />
                                {Number.isFinite(received) && Number.isFinite(expected) && (
                                  <small className={delta < 0 ? 'verification-short' : delta > 0 ? 'verification-over' : 'verification-ok'}>
                                    {delta < 0 ? `Faltan ${formatQuantity(Math.abs(delta))}` : delta > 0 ? `Sobran ${formatQuantity(delta)}` : 'Sin diferencia'}
                                  </small>
                                )}
                              </div>
                            ) : (
                              <span className="verification-locked-value">{row.quantity == null ? '—' : formatQuantity(Number(row.quantity))}</span>
                            )}
                          </td>
                          <td>
                            {row.verificationIncidentId ? (
                              <small>Incidencia registrada</small>
                            ) : isEditing ? (
                              <div className="verification-evidence-stack">
                                {!row.guideFile?.file_path || !/\.pdf$/i.test(row.guideFile.file_name || row.guideFile.file_path) ? (
                                  <label className="verification-file">Guía PDF
                                    <input type="file" accept="application/pdf,.pdf" onChange={(event) => {
                                      const next = event.target.files?.[0]
                                      if (next) setGuideFiles({ ...guideFiles, [row.receiptId]: next })
                                    }} />
                                    {guideFiles[row.receiptId]?.name && <small>{guideFiles[row.receiptId].name}</small>}
                                  </label>
                                ) : <small><CheckCircle2 size={13} /> PDF vinculado</small>}
                                <label className="verification-file"><Camera size={13} /> Foto opcional
                                  <input type="file" accept="image/*" multiple onChange={(event) => {
                                    const next = Array.from(event.target.files || [])
                                    if (next.length) setPhotos({ ...photos, [row.id]: next })
                                  }} />
                                  {photos[row.id]?.length ? <small>{photos[row.id].length} foto(s)</small> : null}
                                </label>
                              </div>
                            ) : <small>Se habilita al reportar</small>}
                          </td>
                          <td>
                            {row.verificationIncidentId ? (
                              <div className="verification-actions">
                                <span className={incidentMailStatus[row.verificationIncidentId] === 'ENVIADO' ? 'status-pill success' : 'status-pill warning'}>
                                  {incidentMailStatus[row.verificationIncidentId] === 'ENVIADO' ? 'Correo enviado' : 'Correo pendiente'}
                                </span>
                                {profile?.role !== 'SUPERVISOR' && incidentMailStatus[row.verificationIncidentId] !== 'ENVIADO' && (
                                  <button className="secondary-button" disabled={Boolean(savingLine)} onClick={() => retryVerification(row)}>
                                    <Mail size={13} /> Reintentar
                                  </button>
                                )}
                              </div>
                            ) : profile?.role === 'SUPERVISOR' ? 'Solo lectura' : isEditing ? (
                              <div className="verification-actions">
                                <button className="secondary-button" disabled={Boolean(savingLine)} onClick={() => {
                                  setEditingVerificationLineId(null)
                                  setReceivedDrafts((previous) => {
                                    const next = { ...previous }
                                    delete next[row.id]
                                    return next
                                  })
                                }}>
                                  Cancelar
                                </button>
                                <button
                                  className="primary-button"
                                  disabled={Boolean(savingLine) || !hasDifference}
                                  onClick={() => void saveVerification(row)}
                                  title={!hasDifference ? 'Modifica la cantidad para registrar un faltante o sobrante' : 'Registrar incidencia y enviar correo'}
                                >
                                  {savingLine === row.id ? <RefreshCw className="spin" size={13} /> : <Mail size={13} />}
                                  {savingLine === row.id ? 'Enviando…' : 'Registrar y enviar'}
                                </button>
                              </div>
                            ) : (
                              <button className="secondary-button verification-enable-button" onClick={() => {
                                setEditingVerificationLineId(row.id)
                                setReceivedDrafts((previous) => ({
                                  ...previous,
                                  [row.id]: previous[row.id] ?? (row.quantity == null ? '' : String(row.quantity)),
                                }))
                              }}>
                                <Edit3 size={14} /> Reportar diferencia
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {!selectedRows.length && (
                  <div className="empty-work">
                    <FileText size={28} />
                    <b>Este ingreso aún no tiene líneas</b>
                  </div>
                )}
                {Boolean(selectedRows.length) && !matchingSelectedRows.length && (
                  <div className="empty-work">
                    <Search size={28} />
                    <b>No se encontró ese material</b>
                    <p>Prueba con número de parte, descripción, guía o referencia.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
