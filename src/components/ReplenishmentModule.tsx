import { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  PackageCheck,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
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
  created_at: string
  sap_kmmp_no: string | null
  sap_fiori_no: string | null
  sap_status: 'PENDIENTE' | 'INGRESADO'
  replenishment_receipt_lines?: ReceiptLine[]
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value)
  return new Intl.DateTimeFormat('es-PE').format(date)
}

export function ReplenishmentModule() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [selected, setSelected] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [dateSearch, setDateSearch] = useState('')
  const [supplier, setSupplier] = useState('TODOS')
  const [sapKmmp, setSapKmmp] = useState('')
  const [savingSap, setSavingSap] = useState(false)

  async function reload() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('replenishment_receipts')
      .select(`
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
        created_at,
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
      `)
      .order('receipt_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) {
      setMessage(error.message)
      setReceipts([])
    } else {
      const rows = (data ?? []) as Receipt[]
      setReceipts(rows)
      if (selected) {
        setSelected(rows.find((row) => row.id === selected.id) ?? null)
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    reload()
  }, [])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()

    return receipts.filter((row) => {
      if (dateSearch && row.receipt_date !== dateSearch) return false
      if (supplier !== 'TODOS' && row.supplier !== supplier) return false

      if (!q) return true

      const headerMatch = [
        row.guide_no,
        row.reference,
        row.document_no,
        row.warehouse,
        row.source,
        row.sap_kmmp_no,
        row.sap_fiori_no,
        row.sap_status,
      ].some((value) => String(value ?? '').toLowerCase().includes(q))

      const detailMatch = (row.replenishment_receipt_lines ?? []).some((line) =>
        [line.part_no, line.stock_code, line.description, line.location]
          .some((value) => String(value ?? '').toLowerCase().includes(q))
      )

      return headerMatch || detailMatch
    })
  }, [receipts, search, dateSearch, supplier])

  const selectedLines = useMemo(
    () => [...(selected?.replenishment_receipt_lines ?? [])].sort((a, b) => a.line_no - b.line_no),
    [selected]
  )

  function openDetail(row: Receipt) {
    setSelected(row)
    setSapKmmp(row.sap_kmmp_no || '')
    setMessage('')
  }

  async function saveSapEntry() {
    if (!selected) return

    const kmmp = sapKmmp.trim()

    if (kmmp && !/^18\d+$/.test(kmmp)) {
      setMessage('SAP KMMP inválido: debe contener solo números y empezar con 18. Ejemplo: 180499543.')
      return
    }
    setSavingSap(true)
    setMessage('')

    const { data, error } = await supabase
      .from('replenishment_receipts')
      .update({
        sap_kmmp_no: kmmp || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selected.id)
      .select('sap_kmmp_no,sap_fiori_no,sap_status')
      .single()

    setSavingSap(false)

    if (error || !data) {
      setMessage(error?.message || 'No se pudo actualizar el ingreso SAP.')
      return
    }

    const updated = {
      ...selected,
      sap_kmmp_no: data.sap_kmmp_no,
      sap_fiori_no: data.sap_fiori_no,
      sap_status: data.sap_status as 'PENDIENTE' | 'INGRESADO',
    }

    setSelected(updated)
    setReceipts((rows) => rows.map((row) => row.id === selected.id ? updated : row))
    setMessage(
      data.sap_status === 'INGRESADO'
        ? 'Guía marcada como INGRESADO. Ya no aparecerá en la Hoja de Ubicación de pendientes SAP.'
        : 'Guía marcada como PENDIENTE SAP.'
    )
  }

  return (
    <div className="replenishment-module">
      <section className="panel replenishment-panel">
        <div className="panel-title">
          <div>
            <h3>Ingresos de Reposición</h3>
            <p>Detalle de guías de Reposición registradas por Scanner o Carga Masiva.</p>
          </div>
          <button className="icon-button" onClick={reload} title="Actualizar">
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="guide-replenishment-filters">
          <div className="search">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar guía, referencia, documento o material…"
            />
          </div>

          <input
            type="date"
            value={dateSearch}
            onChange={(e) => setDateSearch(e.target.value)}
            title="Fecha de recepción"
          />

          <SearchableSelect
            value={supplier}
            onChange={(value)=>setSupplier(value||'TODOS')}
            options={[
              {value:'TODOS',label:'Todos los proveedores'},
              {value:'KOMATSU',label:'KOMATSU'},
              {value:'CUMMINS',label:'CUMMINS'},
              {value:'POR_VALIDAR',label:'Por validar'},
            ]}
            placeholder="Buscar proveedor…"
            clearable={false}
            ariaLabel="Filtrar por proveedor"
          />

          <button
            className="secondary-button"
            onClick={() => {
              setSearch('')
              setDateSearch('')
              setSupplier('TODOS')
            }}
          >
            Limpiar
          </button>
        </div>

        {message && <div className="inline-message">{message}</div>}

        {loading ? (
          <div className="screen-center compact">
            <RefreshCw className="spin" size={22} />
            <p>Cargando guías…</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Guía</th>
                  <th>Referencia</th>
                  <th>N° Documento</th>
                  <th>Almacén</th>
                  <th>Origen</th>
                  <th>Líneas</th>
                  <th>Estado SAP</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.receipt_date)}</td>
                    <td>
                      <span className={row.supplier === 'CUMMINS' ? 'supplier-chip cummins' : row.supplier === 'KOMATSU' ? 'supplier-chip' : 'supplier-chip pending'}>
                        {row.supplier.replace('_', ' ')}
                      </span>
                    </td>
                    <td><b>{row.guide_no || '—'}</b></td>
                    <td>{row.reference || '—'}</td>
                    <td>{row.document_no || '—'}</td>
                    <td>{row.warehouse || '—'}</td>
                    <td><span className="source-chip">{row.source.replace('_', ' ')}</span></td>
                    <td><b>{row.line_count}</b></td>
                    <td>
                      <span className={row.sap_status === 'INGRESADO' ? 'status-pill' : 'status-pill warning'}>
                        {row.sap_status}
                      </span>
                    </td>
                    <td>
                      <button className="secondary-button small-report" onClick={() => openDetail(row)}>
                        <FileText size={14} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!visible.length && (
              <div className="empty-work">
                <PackageCheck size={30} />
                <b>Sin guías de Reposición</b>
                <p>Las guías registradas aparecerán aquí automáticamente.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {selected && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <section className="modal guide-replenishment-detail">
            <div className="modal-head">
              <div>
                <h2>{selected.guide_no || 'Guía de Reposición'}</h2>
                <p>{fmtDate(selected.receipt_date)} · {selected.supplier} · {selected.line_count} líneas</p>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}><X size={19} /></button>
            </div>

            <div className="guide-detail-meta">
              <div><small>Referencia</small><b>{selected.reference || '—'}</b></div>
              <div><small>N° Documento</small><b>{selected.document_no || '—'}</b></div>
              <div><small>Almacén</small><b>{selected.warehouse || '—'}</b></div>
              <div><small>Origen</small><b>{selected.source.replace('_', ' ')}</b></div>
            </div>

            <div className="sap-validation-card">
              <div className="sap-validation-head">
                <div>
                  <small>Estado SAP</small>
                  <b className={selected.sap_status === 'INGRESADO' ? 'sap-status entered' : 'sap-status pending'}>
                    {selected.sap_status}
                  </b>
                </div>
                <p>
                  Desde esta guía se registra el ingreso <b>SAP KMMP (18…)</b>.
                  El NI de <b>SAP FIORI (50…)</b> se registra desde la Hoja de Ubicación del ingreso agrupado.
                </p>
              </div>

              <div className="sap-validation-fields">
                <label>SAP KMMP
                  <input
                    inputMode="numeric"
                    value={sapKmmp}
                    onChange={(e) => setSapKmmp(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ej. 180499543"
                  />
                  <small>Debe iniciar con 18</small>
                </label>
                <button className="primary-button sap-save-button" disabled={savingSap} onClick={saveSapEntry}>
                  {savingSap ? <RefreshCw className="spin" size={16} /> : <PackageCheck size={16} />}
                  {savingSap ? 'Guardando…' : 'Guardar SAP KMMP'}
                </button>
              </div>
            </div>

            <div className="table-wrap guide-detail-lines">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Número de parte</th>
                    <th>Stock Code</th>
                    <th>Descripción</th>
                    <th>Cantidad</th>
                    <th>UM</th>
                    <th>Ubicación</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.line_no}</td>
                      <td><b>{line.part_no || '—'}</b></td>
                      <td>{line.stock_code || 'SIN SC'}</td>
                      <td>{line.description || '—'}</td>
                      <td>{line.quantity == null ? '—' : Number(line.quantity).toLocaleString('es-PE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                      <td>{line.unit || '—'}</td>
                      <td>{line.location || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!selectedLines.length && (
                <div className="empty-work">
                  <FileText size={26} />
                  <b>Esta guía aún no tiene detalle de materiales</b>
                </div>
              )}
            </div>

            {selected.notes && (
              <div className="report-notes">
                <small>Observación</small>
                <p>{selected.notes}</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
