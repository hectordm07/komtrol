import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Download,
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
  sapIngress: string
  source: string
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return new Intl.DateTimeFormat('es-PE').format(date)
}

function flattenIngress(ingress: Ingress): FlatLine[] {
  const receipts = [...(ingress.replenishment_receipts ?? [])]
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
        sapIngress: line.sap_ingress ?? '0',
        source: receipt.source,
      })
    }
  }

  return output
}

async function exportIngressExcel(ingress: Ingress, rows: FlatLine[]) {
  const moduleUrl = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'
  const XLSX: any = await import(/* @vite-ignore */ moduleUrl)

  const aoa: (string | number)[][] = [
    ['RECEPCIÓN DE REPUESTOS - REPOSICIÓN'],
    ['N° INGRESO', ingress.ingress_no],
    ['FECHA', fmtDate(ingress.ingress_date)],
    ['PROVEEDOR', ingress.supplier],
    ['ALMACÉN', ingress.warehouse ?? ''],
    [],
    ['N°', 'NUMERO DE PARTE', 'Stock code', 'Descripción', 'Cantidad', 'UM', 'Ubicación', 'Guía de remisión', 'Fecha de Recepción', 'Ingreso SAP Antamina'],
    ...rows.map((row) => [
      row.rowNo,
      row.partNo,
      row.stockCode,
      row.description,
      row.quantity ?? '',
      row.unit,
      row.location,
      row.guideNo,
      fmtDate(row.receptionDate),
      row.sapIngress,
    ]),
  ]

  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  worksheet['!cols'] = [
    { wch: 7 },
    { wch: 20 },
    { wch: 16 },
    { wch: 42 },
    { wch: 12 },
    { wch: 8 },
    { wch: 16 },
    { wch: 19 },
    { wch: 18 },
    { wch: 20 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, `Ingreso ${ingress.ingress_no}`)
  XLSX.writeFile(
    workbook,
    `KOMTROL_Ingreso_${ingress.ingress_no}_${ingress.ingress_date}.xlsx`
  )
}

export function ReplenishmentModule() {
  const [ingresses, setIngresses] = useState<Ingress[]>([])
  const [selected, setSelected] = useState<Ingress | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const [numberSearch, setNumberSearch] = useState('')
  const [dateSearch, setDateSearch] = useState('')
  const [supplier, setSupplier] = useState('TODOS')

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
      return true
    })
  }, [ingresses, numberSearch, dateSearch, supplier])

  const selectedRows = useMemo(
    () => selected ? flattenIngress(selected) : [],
    [selected]
  )

  function guideCount(row: Ingress) {
    return row.replenishment_receipts?.length ?? 0
  }

  function lineCount(row: Ingress) {
    return (row.replenishment_receipts ?? [])
      .reduce((sum, receipt) => sum + (receipt.replenishment_receipt_lines?.length ?? 0), 0)
  }

  async function exportSelected() {
    if (!selected) return
    setExporting(true)
    setMessage('')
    try {
      await exportIngressExcel(selected, selectedRows)
    } catch (error) {
      setMessage(
        `No se pudo generar el Excel: ${error instanceof Error ? error.message : 'error desconocido'}`
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="replenishment-module">
      <section className="panel replenishment-panel">
        <div className="panel-title">
          <div>
            <h3>Ingresos de Reposición</h3>
            <p>Cada N° de Ingreso agrupa todas las guías recibidas en una fecha por proveedor.</p>
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

          <button
            className="secondary-button clear-ingress-filter"
            onClick={() => {
              setNumberSearch('')
              setDateSearch('')
              setSupplier('TODOS')
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
                <b>No se encontraron ingresos</b>
                <p>Busca por N° de Ingreso, fecha o proveedor.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {selected && (
        <section className="panel ingress-detail-report">
          <div className="ingress-report-title">
            <div>
              <h2>RECEPCIÓN DE REPUESTOS REPOSICIÓN</h2>
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
            </div>
            <div className="button-row">
              <button className="secondary-button" onClick={() => setSelected(null)}>
                Cerrar detalle
              </button>
              <button className="primary-button" disabled={exporting || !selectedRows.length} onClick={exportSelected}>
                {exporting ? <RefreshCw className="spin" size={16} /> : <FileSpreadsheet size={16} />}
                {exporting ? 'Generando…' : 'Exportar Excel'}
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
                  <th>Ingreso SAP Antamina</th>
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
                    <td>{row.sapIngress || '0'}</td>
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
