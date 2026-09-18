import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  FileSpreadsheet,
  FileText,
  PackageCheck,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

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
  rowNo: number
  partNo: string
  stockCode: string
  description: string
  quantity: number | null
  unit: string
  location: string
  guideNo: string
  receptionDate: string
  source: string
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return new Intl.DateTimeFormat('es-PE').format(date)
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
        rowNo: output.length + 1,
        partNo: line.part_no ?? '',
        stockCode: line.stock_code ?? '',
        description: line.description ?? '',
        quantity: line.quantity,
        unit: line.unit ?? '',
        location: line.location ?? '',
        guideNo: receipt.guide_no ?? '',
        receptionDate: receipt.receipt_date,
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

async function exportIngressExcel(
  ingress: Ingress,
  rows: FlatLine[],
  sapFilter: 'PENDIENTE' | 'INGRESADO' | 'TODOS'
) {
  const moduleUrl = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/+esm'
  const XLSX: any = await import(/* @vite-ignore */ moduleUrl)

  const statusLabel =
    sapFilter === 'PENDIENTE' ? 'PENDIENTES SAP' :
    sapFilter === 'INGRESADO' ? 'INGRESADOS SAP' :
    'TODOS'

  const aoa: any[][] = [
    ['HOJA DE UBICACIÓN - RECEPCIÓN DE REPUESTOS', '', '', '', '', '', '', 'N°', ingress.ingress_no],
    [`${ingress.supplier} · ${fmtDate(ingress.ingress_date)} · ${statusLabel}${ingress.warehouse ? ' · ' + ingress.warehouse : ''}`, '', '', '', '', '', '', '', ''],
    ['N°', 'NÚMERO DE PARTE', 'STOCK CODE', 'DESCRIPCIÓN', 'CANT.', 'UM', 'UBICACIÓN', 'GUÍA DE REMISIÓN', 'FECHA DE RECEPCIÓN'],
    ...rows.map((row) => [
      row.rowNo,
      row.partNo,
      row.stockCode || 'SIN SC',
      row.description,
      row.quantity ?? '',
      row.unit,
      row.location || '-',
      row.guideNo,
      excelDate(row.receptionDate),
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
  ]
  ws['!cols'] = [
    { wch: 7 },
    { wch: 22 },
    { wch: 17 },
    { wch: 50 },
    { wch: 12 },
    { wch: 9 },
    { wch: 18 },
    { wch: 21 },
    { wch: 20 },
  ]
  ws['!rows'] = [{ hpt: 27 }, { hpt: 18 }, { hpt: 32 }]
  ws['!autofilter'] = { ref: `A3:I${rows.length + 3}` }

  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'B8C0CC' } },
    bottom: { style: 'thin', color: { rgb: 'B8C0CC' } },
    left: { style: 'thin', color: { rgb: 'D7DCE3' } },
    right: { style: 'thin', color: { rgb: 'D7DCE3' } },
  }

  if (ws['A1']) {
    ws['A1'].s = {
      font: { name: 'Arial', sz: 16, bold: true, color: { rgb: '0570C7' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'medium', color: { rgb: '111111' } },
        bottom: { style: 'medium', color: { rgb: '111111' } },
        left: { style: 'medium', color: { rgb: '111111' } },
      },
    }
  }

  if (ws['A2']) {
    ws['A2'].s = {
      font: { name: 'Arial', sz: 9, color: { rgb: '536174' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        bottom: { style: 'medium', color: { rgb: '111111' } },
        left: { style: 'medium', color: { rgb: '111111' } },
      },
    }
  }

  for (const address of ['H1', 'I1']) {
    const cell = ws[address]
    if (!cell) continue
    cell.s = {
      fill: { fgColor: { rgb: 'FFF600' } },
      font: {
        name: 'Arial',
        sz: address === 'I1' ? 18 : 13,
        bold: true,
        color: { rgb: '0066C2' },
      },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'medium', color: { rgb: '111111' } },
        bottom: { style: 'medium', color: { rgb: '111111' } },
        left: { style: 'medium', color: { rgb: '111111' } },
        right: { style: 'medium', color: { rgb: '111111' } },
      },
    }
  }

  for (const address of ['H2', 'I2']) {
    if (!ws[address]) ws[address] = { t: 's', v: '' }
    ws[address].s = {
      fill: { fgColor: { rgb: 'FFF600' } },
      border: {
        bottom: { style: 'medium', color: { rgb: '111111' } },
        left: { style: 'medium', color: { rgb: '111111' } },
        right: { style: 'medium', color: { rgb: '111111' } },
      },
    }
  }

  const headerColors = [
    'FFFFFF', 'FF2C2C', 'FFFFFF', 'FF2C2C', 'FFF600',
    'FFFFFF', 'FFF600', 'FFFFFF', 'FFFFFF',
  ]

  for (let col = 0; col < 9; col++) {
    const address = XLSX.utils.encode_cell({ r: 2, c: col })
    const cell = ws[address]
    if (!cell) continue
    cell.s = {
      fill: { fgColor: { rgb: '050505' } },
      font: { name: 'Arial', sz: 9, bold: true, color: { rgb: headerColors[col] } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'medium', color: { rgb: '111111' } },
        bottom: { style: 'medium', color: { rgb: '111111' } },
        left: { style: 'thin', color: { rgb: 'FFFFFF' } },
        right: { style: 'thin', color: { rgb: 'FFFFFF' } },
      },
    }
  }

  for (let row = 3; row < rows.length + 3; row++) {
    for (let col = 0; col < 9; col++) {
      const address = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = ws[address]
      if (!cell) continue
      cell.s = {
        font: {
          name: 'Arial',
          sz: 9,
          bold: col === 1,
          color: { rgb: col === 1 ? '111827' : '334155' },
        },
        alignment: {
          horizontal: [0, 4, 5].includes(col) ? 'center' : 'left',
          vertical: 'center',
          wrapText: col === 3,
        },
        border: thinBorder,
      }
      if (col === 4 && typeof cell.v === 'number') cell.z = '0.000'
      if (col === 8 && cell.v instanceof Date) cell.z = 'dd/mm/yyyy'
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `Ingreso ${ingress.ingress_no}`)
  XLSX.writeFile(
    wb,
    `KOMTROL_Hoja_Ubicacion_${ingress.ingress_no}_${sapFilter}_${ingress.ingress_date}.xlsx`
  )
}

async function exportIngressPdf(
  ingress: Ingress,
  rows: FlatLine[],
  sapFilter: 'PENDIENTE' | 'INGRESADO' | 'TODOS'
) {
  const jspdfUrl = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm'
  const autoTableUrl = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/+esm'
  const jspdfModule: any = await import(/* @vite-ignore */ jspdfUrl)
  const autoTableModule: any = await import(/* @vite-ignore */ autoTableUrl)
  const jsPDF = jspdfModule.jsPDF
  const autoTable = autoTableModule.default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = 7
  const right = 7
  const numberBoxWidth = 49
  const headerHeight = 19
  const reportWidth = pageWidth - left - right
  const statusLabel =
    sapFilter === 'PENDIENTE' ? 'PENDIENTES SAP' :
    sapFilter === 'INGRESADO' ? 'INGRESADOS SAP' :
    'TODOS'

  const drawReportHeader = () => {
    doc.setDrawColor(17, 17, 17)
    doc.setLineWidth(0.5)
    doc.setFillColor(255, 255, 255)
    doc.rect(left, 7, reportWidth - numberBoxWidth, headerHeight, 'FD')

    doc.setTextColor(5, 112, 199)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(
      'HOJA DE UBICACIÓN - RECEPCIÓN DE REPUESTOS',
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
    doc.setFillColor(255, 246, 0)
    doc.setDrawColor(17, 17, 17)
    doc.rect(boxX, 7, numberBoxWidth, headerHeight, 'FD')
    doc.setTextColor(0, 86, 179)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('N°', boxX + 11, 18, { align: 'center' })
    doc.setFontSize(18)
    doc.text(String(ingress.ingress_no), boxX + 35, 18.5, { align: 'center' })
  }

  drawReportHeader()

  autoTable(doc, {
    startY: 31,
    margin: { left, right, top: 31, bottom: 12 },
    head: [[
      'N°',
      'NÚMERO DE PARTE',
      'STOCK CODE',
      'DESCRIPCIÓN',
      'CANT.',
      'UM',
      'UBICACIÓN',
      'GUÍA DE REMISIÓN',
      'FECHA DE RECEPCIÓN',
    ]],
    body: rows.map((row) => [
      row.rowNo,
      row.partNo,
      row.stockCode || 'SIN SC',
      row.description,
      row.quantity == null ? '' : Number(row.quantity).toFixed(3),
      row.unit,
      row.location || '-',
      row.guideNo,
      fmtDate(row.receptionDate),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 6.3,
      cellPadding: 1.3,
      lineColor: [213, 220, 227],
      lineWidth: 0.15,
      textColor: [51, 65, 85],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [5, 5, 5],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 6.2,
      minCellHeight: 10,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 30, fontStyle: 'bold' },
      2: { cellWidth: 25 },
      3: { cellWidth: 78 },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 13, halign: 'center' },
      6: { cellWidth: 27 },
      7: { cellWidth: 30 },
      8: { cellWidth: 28, halign: 'center' },
    },
    didParseCell: (data: any) => {
      if (data.section !== 'head') return
      if ([1, 3].includes(data.column.index)) data.cell.styles.textColor = [255, 44, 44]
      if ([4, 6].includes(data.column.index)) data.cell.styles.textColor = [255, 246, 0]
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) drawReportHeader()
      doc.setTextColor(110, 120, 135)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.text(
        `Ingreso ${ingress.ingress_no} · ${statusLabel} · Página ${data.pageNumber}`,
        pageWidth - right,
        pageHeight - 5,
        { align: 'right' }
      )
    },
  })

  doc.save(
    `KOMTROL_Hoja_Ubicacion_${ingress.ingress_no}_${sapFilter}_${ingress.ingress_date}.pdf`
  )
}

export function LocationSheetsModule() {
  const [ingresses, setIngresses] = useState<Ingress[]>([])
  const [selected, setSelected] = useState<Ingress | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [message, setMessage] = useState('')
  const [numberSearch, setNumberSearch] = useState('')
  const [dateSearch, setDateSearch] = useState('')
  const [supplier, setSupplier] = useState('TODOS')
  const [sapFilter, setSapFilter] = useState<'PENDIENTE' | 'INGRESADO' | 'TODOS'>('PENDIENTE')

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
          reference,
          document_no,
          warehouse,
          source,
          line_count,
          notes,
          sap_kmmp_no,
          sap_fiori_no,
          sap_status,
          replenishment_receipt_lines (
            id,
            line_no,
            part_no,
            stock_code,
            description,
            quantity,
            unit,
            location,
            sap_ingress
          )
        )
      `)
      .order('ingress_no', { ascending: false })
      .limit(1000)

    if (error) {
      setMessage(error.message)
      setIngresses([])
    } else {
      const rows = (data ?? []) as Ingress[]
      setIngresses(rows)
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

  async function exportSelectedExcel() {
    if (!selected) return
    setExporting('excel')
    setMessage('')
    try {
      await exportIngressExcel(selected, selectedRows, sapFilter)
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
      await exportIngressPdf(selected, selectedRows, sapFilter)
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
          <button className="icon-button" onClick={reload} title="Actualizar">
            <RefreshCw size={18} />
          </button>
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
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="KOMATSU">KOMATSU</option>
              <option value="CUMMINS">CUMMINS</option>
              <option value="POR_VALIDAR">Por validar</option>
            </select>
          </label>

          <label>
            Estado SAP
            <select value={sapFilter} onChange={(e) => setSapFilter(e.target.value as 'PENDIENTE' | 'INGRESADO' | 'TODOS')}>
              <option value="PENDIENTE">Pendientes SAP</option>
              <option value="INGRESADO">Ingresados SAP</option>
              <option value="TODOS">Todos</option>
            </select>
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
                      <button className="secondary-button small-report" onClick={() => setSelected(row)}>
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
        <section className="panel ingress-detail-report">
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
            <div className="button-row">
              <button className="secondary-button" onClick={() => setSelected(null)}>
                Cerrar detalle
              </button>
              <button className="secondary-button" disabled={Boolean(exporting) || !selectedRows.length} onClick={exportSelectedPdf}>
                {exporting === 'pdf' ? <RefreshCw className="spin" size={16} /> : <FileText size={16} />}
                {exporting === 'pdf' ? 'Generando PDF…' : 'Generar PDF'}
              </button>
              <button className="primary-button" disabled={Boolean(exporting) || !selectedRows.length} onClick={exportSelectedExcel}>
                {exporting === 'excel' ? <RefreshCw className="spin" size={16} /> : <FileSpreadsheet size={16} />}
                {exporting === 'excel' ? 'Generando Excel…' : 'Exportar Excel'}
              </button>
            </div>
          </div>

          <div className="table-wrap ingress-detail-table">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>NÚMERO DE PARTE</th>
                  <th>Stock code</th>
                  <th>Descripción</th>
                  <th>Cant.</th>
                  <th>UM</th>
                  <th>Ubicación</th>
                  <th>Guía de remisión</th>
                  <th>Fecha de Recepción</th>
                </tr>
              </thead>
              <tbody>
                {selectedRows.map((row) => (
                  <tr key={`${row.rowNo}-${row.guideNo}-${row.partNo}`}>
                    <td>{row.rowNo}</td>
                    <td><b>{row.partNo || '—'}</b></td>
                    <td>{row.stockCode || 'SIN SC'}</td>
                    <td>{row.description || '—'}</td>
                    <td>{row.quantity == null ? '—' : Number(row.quantity).toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                    <td>{row.unit || '—'}</td>
                    <td>{row.location || '-'}</td>
                    <td>{row.guideNo || '—'}</td>
                    <td>{fmtDate(row.receptionDate)}</td>
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
        </section>
      )}
    </div>
  )
}
