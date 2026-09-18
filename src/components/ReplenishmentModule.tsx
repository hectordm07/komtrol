import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Download,
  FileText,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type Supplier = 'KOMATSU' | 'CUMMINS' | 'POR_VALIDAR'

type ReceiptLine = {
  id: string
  line_no: number
  part_no: string | null
  description: string | null
  quantity: number | null
  unit: string | null
}

type Receipt = {
  id: string
  receipt_no: string
  receipt_date: string
  supplier: Supplier
  guide_id: string | null
  guide_no: string | null
  reference: string | null
  document_no: string | null
  warehouse: string | null
  source: 'SCANNER' | 'CARGA_MASIVA' | 'MANUAL' | 'MIGRADO'
  line_count: number
  notes: string | null
  created_at: string
  replenishment_receipt_lines?: ReceiptLine[]
}

type Props = {
  role: 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return new Intl.DateTimeFormat('es-PE').format(date)
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return /[",;\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

function saveCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
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

export function ReplenishmentModule({ role }: Props) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [supplier, setSupplier] = useState('TODOS')
  const [source, setSource] = useState('TODOS')
  const [selected, setSelected] = useState<Receipt | null>(null)

  async function reload() {
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase
      .from('replenishment_receipts')
      .select('*, replenishment_receipt_lines(*)')
      .order('receipt_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) setMessage(error.message)
    setReceipts((data ?? []) as Receipt[])
    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim()
    return receipts.filter((row) => {
      if (supplier !== 'TODOS' && row.supplier !== supplier) return false
      if (source !== 'TODOS' && row.source !== source) return false
      if (!q) return true
      const inHeader = [
        row.receipt_no,
        row.guide_no,
        row.reference,
        row.document_no,
        row.warehouse,
        row.supplier,
        row.source,
      ].some((value) => String(value ?? '').toLowerCase().includes(q))
      const inLines = (row.replenishment_receipt_lines ?? []).some((line) =>
        [line.part_no, line.description].some((value) =>
          String(value ?? '').toLowerCase().includes(q)
        )
      )
      return inHeader || inLines
    })
  }, [receipts, search, supplier, source])

  const totals = useMemo(() => ({
    receipts: visible.length,
    lines: visible.reduce((sum, row) => sum + Number(row.line_count || 0), 0),
    komatsu: visible.filter((row) => row.supplier === 'KOMATSU').length,
    cummins: visible.filter((row) => row.supplier === 'CUMMINS').length,
  }), [visible])

  function exportAll() {
    const rows: string[][] = [[
      'N_INGRESO',
      'FECHA',
      'PROVEEDOR',
      'GUIA',
      'REFERENCIA',
      'N_DOCUMENTO',
      'ALMACEN',
      'ORIGEN',
      'N_LINEA',
      'NUMERO_PARTE',
      'DESCRIPCION',
      'CANTIDAD',
      'UM',
    ]]

    for (const receipt of visible) {
      const lines = receipt.replenishment_receipt_lines?.length
        ? receipt.replenishment_receipt_lines
        : [null]

      for (const line of lines) {
        rows.push([
          receipt.receipt_no,
          receipt.receipt_date,
          receipt.supplier,
          receipt.guide_no ?? '',
          receipt.reference ?? '',
          receipt.document_no ?? '',
          receipt.warehouse ?? '',
          receipt.source,
          line ? String(line.line_no) : '',
          line?.part_no ?? '',
          line?.description ?? '',
          line?.quantity == null ? '' : String(line.quantity),
          line?.unit ?? '',
        ])
      }
    }

    saveCsv(`KOMTROL_Ingresos_Reposicion_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  function exportReceipt(receipt: Receipt) {
    const rows: string[][] = [
      ['REPORTE DE INGRESO DE REPOSICIÓN'],
      ['N° INGRESO', receipt.receipt_no],
      ['FECHA', fmtDate(receipt.receipt_date)],
      ['PROVEEDOR', receipt.supplier],
      ['GUÍA', receipt.guide_no ?? ''],
      ['REFERENCIA', receipt.reference ?? ''],
      ['N° DOCUMENTO', receipt.document_no ?? ''],
      ['ALMACÉN', receipt.warehouse ?? ''],
      ['ORIGEN', receipt.source],
      [],
      ['LÍNEA', 'NÚMERO DE PARTE', 'DESCRIPCIÓN', 'CANTIDAD', 'UM'],
      ...(receipt.replenishment_receipt_lines ?? []).map((line) => [
        String(line.line_no),
        line.part_no ?? '',
        line.description ?? '',
        line.quantity == null ? '' : String(line.quantity),
        line.unit ?? '',
      ]),
    ]
    saveCsv(`${receipt.receipt_no}_Reposicion.csv`, rows)
  }

  async function updateSupplier(receipt: Receipt, next: 'KOMATSU' | 'CUMMINS') {
    const { error } = await supabase
      .from('replenishment_receipts')
      .update({ supplier: next, updated_at: new Date().toISOString() })
      .eq('id', receipt.id)
    if (error) {
      setMessage(error.message)
      return
    }

    if (receipt.guide_id) {
      await supabase.from('guides').update({ supplier: next }).eq('id', receipt.guide_id)
    }

    setReceipts((rows) => rows.map((row) => row.id === receipt.id ? { ...row, supplier: next } : row))
    if (selected?.id === receipt.id) setSelected({ ...selected, supplier: next })
  }

  function printReport() {
    window.print()
  }

  return (
    <div className="replenishment-module">
      <section className="panel replenishment-panel">
        <div className="panel-title">
          <div>
            <h3>Ingresos de Reposición</h3>
            <p>Registro único de reposiciones recibidas por Scanner de Guías o Carga Masiva.</p>
          </div>
          <div className="button-row">
            <button className="secondary-button" disabled={!visible.length} onClick={exportAll}>
              <Download size={16} /> Descargar ingresado
            </button>
            <button className="icon-button" onClick={reload} title="Actualizar">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        <div className="replenishment-kpis">
          <div><PackageCheck size={18} /><span><b>{totals.receipts}</b><small>Ingresos</small></span></div>
          <div><FileText size={18} /><span><b>{totals.lines}</b><small>Líneas</small></span></div>
          <div><Truck size={18} /><span><b>{totals.komatsu}</b><small>KOMATSU</small></span></div>
          <div><Truck size={18} /><span><b>{totals.cummins}</b><small>CUMMINS</small></span></div>
        </div>

        <div className="replenishment-toolbar">
          <div className="search">
            <Search size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ingreso, guía, referencia, material…" />
          </div>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="TODOS">Todos los proveedores</option>
            <option value="KOMATSU">KOMATSU</option>
            <option value="CUMMINS">CUMMINS</option>
            <option value="POR_VALIDAR">Por validar</option>
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="TODOS">Todos los orígenes</option>
            <option value="SCANNER">Scanner</option>
            <option value="CARGA_MASIVA">Carga Masiva</option>
            <option value="MIGRADO">Migrado</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>

        {message && <div className="inline-message">{message}</div>}

        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando ingresos…</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N° Ingreso</th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Guía</th>
                  <th>Referencia</th>
                  <th>N° Documento</th>
                  <th>Almacén</th>
                  <th>Origen</th>
                  <th>Líneas</th>
                  <th>Reporte</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.receipt_no}</b></td>
                    <td>{fmtDate(row.receipt_date)}</td>
                    <td>
                      {row.supplier === 'POR_VALIDAR' && ['COORDINADOR','SUPERVISOR','ADMINISTRADOR'].includes(role) ? (
                        <select className="inline-select" value={row.supplier} onChange={(e) => updateSupplier(row, e.target.value as 'KOMATSU' | 'CUMMINS')}>
                          <option value="POR_VALIDAR">Por validar</option>
                          <option value="KOMATSU">KOMATSU</option>
                          <option value="CUMMINS">CUMMINS</option>
                        </select>
                      ) : (
                        <span className={row.supplier === 'CUMMINS' ? 'supplier-chip cummins' : row.supplier === 'KOMATSU' ? 'supplier-chip' : 'supplier-chip pending'}>{row.supplier.replace('_', ' ')}</span>
                      )}
                    </td>
                    <td>{row.guide_no || '—'}</td>
                    <td>{row.reference || '—'}</td>
                    <td>{row.document_no || '—'}</td>
                    <td>{row.warehouse || '—'}</td>
                    <td><span className="source-chip">{row.source.replace('_', ' ')}</span></td>
                    <td><b>{row.line_count}</b></td>
                    <td><button className="secondary-button small-report" onClick={() => setSelected(row)}><FileText size={14} /> Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <div className="empty-work">
                <PackageCheck size={30} />
                <b>Sin ingresos de reposición</b>
                <p>Las reposiciones del Scanner o de Cargas Masivas aparecerán aquí automáticamente.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {selected && (
        <div className="modal-backdrop replenishment-report-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <section className="modal replenishment-report">
            <div className="modal-head report-actions">
              <div><h2>Reporte de Ingreso de Reposición</h2><p>{selected.receipt_no}</p></div>
              <div className="button-row no-print">
                <button className="secondary-button" onClick={() => exportReceipt(selected)}><Download size={16} /> CSV</button>
                <button className="primary-button" onClick={printReport}><Printer size={16} /> Imprimir / PDF</button>
                <button className="icon-button" onClick={() => setSelected(null)}><X size={19} /></button>
              </div>
            </div>

            <div className="report-brand">
              <div>
                <b>KOMTROL</b>
                <span>Control Operativo de Almacén</span>
              </div>
              <div>
                <small>N° INGRESO</small>
                <strong>{selected.receipt_no}</strong>
              </div>
            </div>

            <div className="report-header-grid">
              <div><small>Fecha</small><b>{fmtDate(selected.receipt_date)}</b></div>
              <div><small>Proveedor</small><b>{selected.supplier}</b></div>
              <div><small>Guía</small><b>{selected.guide_no || '—'}</b></div>
              <div><small>Referencia</small><b>{selected.reference || '—'}</b></div>
              <div><small>N° Documento</small><b>{selected.document_no || '—'}</b></div>
              <div><small>Almacén</small><b>{selected.warehouse || '—'}</b></div>
              <div><small>Origen</small><b>{selected.source.replace('_', ' ')}</b></div>
              <div><small>Total líneas</small><b>{selected.line_count}</b></div>
            </div>

            <div className="table-wrap report-lines">
              <table>
                <thead><tr><th>#</th><th>Número de parte</th><th>Descripción</th><th>Cantidad</th><th>UM</th></tr></thead>
                <tbody>
                  {(selected.replenishment_receipt_lines ?? []).map((line) => (
                    <tr key={line.id}>
                      <td>{line.line_no}</td>
                      <td><b>{line.part_no || '—'}</b></td>
                      <td>{line.description || '—'}</td>
                      <td>{line.quantity == null ? '—' : Number(line.quantity).toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                      <td>{line.unit || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected.notes && <div className="report-notes"><small>Observación</small><p>{selected.notes}</p></div>}
            <div className="report-footer"><CalendarDays size={14} /> Generado desde KOMTROL · {new Date().toLocaleString('es-PE')}</div>
          </section>
        </div>
      )}
    </div>
  )
}
