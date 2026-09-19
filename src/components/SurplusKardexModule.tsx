import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Boxes, CheckCircle2, Download, MinusCircle, RefreshCw, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'

type Profile = {
  user_id: string
  full_name: string
  role: Role
  warehouse?: string | null
}

type Movement = {
  id: string
  warehouse: string
  movement_type: 'ENTRADA' | 'SALIDA'
  source_type: string
  reference_no: string | null
  shipment_no: string | null
  material_no: string
  stock_code: string | null
  description: string | null
  location: string | null
  quantity: number
  unit: string
  notes: string | null
  created_by: string
  created_at: string
}

type BalanceRow = {
  key: string
  warehouse: string
  material_no: string
  stock_code: string | null
  description: string | null
  location: string | null
  unit: string
  balance: number
  lastMovement: Movement
}

type Props = {
  userId: string
  profile: Profile | null
  fixedWarehouse?: string
}

function fmt(value: string) {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",;\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text
}

function downloadCsv(name: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function SurplusKardexModule({ userId, profile, fixedWarehouse }: Props) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState(fixedWarehouse || profile?.warehouse || 'TODOS')
  const [selected, setSelected] = useState<BalanceRow | null>(null)
  const [quantity, setQuantity] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const isAdmin = profile?.role === 'ADMINISTRADOR'
  const canWithdraw = profile?.role !== 'SUPERVISOR'
  const scopedWarehouse = fixedWarehouse || (!isAdmin ? profile?.warehouse || '' : '')

  async function reload() {
    setLoading(true)
    setMessage('')
    let query = supabase
      .from('surplus_kardex_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000)

    if (scopedWarehouse) query = query.eq('warehouse', scopedWarehouse)
    const { data, error } = await query
    if (error) setMessage(error.message)
    setMovements((data ?? []) as Movement[])
    setLoading(false)
  }

  useEffect(() => { reload() }, [userId, scopedWarehouse])

  const warehouses = useMemo(
    () => Array.from(new Set(movements.map((row) => row.warehouse))).sort(),
    [movements]
  )

  const balances = useMemo(() => {
    const map = new Map<string, BalanceRow>()
    for (const movement of [...movements].reverse()) {
      const key = [movement.warehouse, movement.material_no, movement.stock_code || '', movement.location || '', movement.unit].join('|')
      const existing = map.get(key)
      const delta = movement.movement_type === 'ENTRADA' ? Number(movement.quantity) : -Number(movement.quantity)
      if (!existing) {
        map.set(key, {
          key,
          warehouse: movement.warehouse,
          material_no: movement.material_no,
          stock_code: movement.stock_code,
          description: movement.description,
          location: movement.location,
          unit: movement.unit,
          balance: delta,
          lastMovement: movement,
        })
      } else {
        existing.balance += delta
        existing.lastMovement = movement
        if (movement.description) existing.description = movement.description
        if (movement.stock_code) existing.stock_code = movement.stock_code
        if (movement.location) existing.location = movement.location
      }
    }
    return Array.from(map.values())
      .filter((row) => row.balance > 0.000001)
      .sort((a, b) => a.material_no.localeCompare(b.material_no, 'es', { numeric: true }))
  }, [movements])

  const visibleBalances = useMemo(() => {
    const q = search.trim().toLowerCase()
    return balances.filter((row) => {
      if (isAdmin && !fixedWarehouse && warehouseFilter !== 'TODOS' && row.warehouse !== warehouseFilter) return false
      if (!q) return true
      return [row.warehouse,row.material_no,row.stock_code,row.description,row.location]
        .some((value) => String(value ?? '').toLowerCase().includes(q))
    })
  }, [balances, search, warehouseFilter, isAdmin, fixedWarehouse])

  const visibleMovements = useMemo(() => {
    const q = search.trim().toLowerCase()
    return movements.filter((row) => {
      if (isAdmin && !fixedWarehouse && warehouseFilter !== 'TODOS' && row.warehouse !== warehouseFilter) return false
      if (!q) return true
      return [row.warehouse,row.material_no,row.stock_code,row.description,row.location,row.reference_no,row.shipment_no,row.source_type]
        .some((value) => String(value ?? '').toLowerCase().includes(q))
    })
  }, [movements, search, warehouseFilter, isAdmin, fixedWarehouse])

  function openWithdrawal(row: BalanceRow) {
    setSelected(row)
    setQuantity('')
    setReference('')
    setNotes('')
    setMessage('')
  }

  async function registerWithdrawal(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const qty = Number(quantity)
    if (!(qty > 0) || qty > selected.balance) {
      setMessage(`La cantidad debe ser mayor a 0 y no superar el saldo disponible (${selected.balance.toLocaleString('es-PE')}).`)
      return
    }

    setSaving(true)
    const { error } = await supabase.rpc('register_surplus_withdrawal', {
      p_warehouse: selected.warehouse,
      p_material_no: selected.material_no,
      p_stock_code: selected.stock_code || '',
      p_description: selected.description || '',
      p_location: selected.location || '',
      p_quantity: qty,
      p_unit: selected.unit || 'UND',
      p_reference_no: reference.trim() || null,
      p_notes: notes.trim() || null,
    })
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setSelected(null)
    setMessage('Salida registrada correctamente en el Kardex de Sobrantes.')
    await reload()
  }

  function exportKardex() {
    downloadCsv('KOMTROL_Kardex_Sobrantes.csv', [
      ['ALMACEN','FECHA','MOVIMIENTO','ORIGEN','REFERENCIA','EMBARQUE','MATERIAL','STOCK_CODE','DESCRIPCION','UBICACION','CANTIDAD','UM','OBSERVACION'],
      ...visibleMovements.map((row) => [
        row.warehouse,fmt(row.created_at),row.movement_type,row.source_type,row.reference_no,row.shipment_no,
        row.material_no,row.stock_code,row.description,row.location,row.quantity,row.unit,row.notes,
      ]),
    ])
  }

  if (loading) {
    return <section className="panel"><div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando Kardex de Sobrantes…</p></div></section>
  }

  return (
    <div className="surplus-kardex-module">
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Kardex de Sobrantes</h3>
            <p>Control de entradas desde cajas de sobrantes y salidas por retiro, con saldo por almacén, material y ubicación.</p>
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={exportKardex}><Download size={15}/> Exportar</button>
            <button className="icon-button" onClick={reload}><RefreshCw size={17}/></button>
          </div>
        </div>

        {message && <div className="inline-message">{message}</div>}

        <div className="task-toolbar kardex-toolbar">
          <div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar material, SC, ubicación, embarque…"/></div>
          {isAdmin && !fixedWarehouse && (
            <select value={warehouseFilter} onChange={(e)=>setWarehouseFilter(e.target.value)}>
              <option value="TODOS">Todos los almacenes</option>
              {warehouses.map((warehouse)=><option key={warehouse}>{warehouse}</option>)}
            </select>
          )}
        </div>

        <div className="kardex-summary">
          <div><Boxes size={19}/><span><b>{visibleBalances.length}</b><small>Materiales con saldo</small></span></div>
          <div><CheckCircle2 size={19}/><span><b>{visibleBalances.reduce((sum,row)=>sum+row.balance,0).toLocaleString('es-PE',{maximumFractionDigits:3})}</b><small>Unidades disponibles</small></span></div>
        </div>

        <div className="kardex-balance-grid">
          {visibleBalances.map((row)=>(
            <article className="kardex-balance-card" key={row.key}>
              <div className="kardex-balance-head"><b>{row.material_no}</b><span className="status-pill">{row.warehouse}</span></div>
              <p>{row.description || 'Sin descripción'}</p>
              <div className="kardex-balance-meta">
                <span>SC <b>{row.stock_code || '—'}</b></span>
                <span>Ubicación <b>{row.location || '—'}</b></span>
              </div>
              <div className="kardex-balance-footer">
                <div><b>{row.balance.toLocaleString('es-PE',{maximumFractionDigits:3})} {row.unit}</b><small>Saldo disponible</small></div>
                {canWithdraw && <button className="primary-button" onClick={()=>openWithdrawal(row)}><MinusCircle size={15}/> Registrar salida</button>}
              </div>
            </article>
          ))}
          {!visibleBalances.length && <div className="empty-work"><Boxes size={28}/><b>Sin sobrantes disponibles</b><p>Los ingresos aparecerán cuando se generen cajas de sobrantes.</p></div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><h3>Movimientos</h3><p>Historial de entradas, salidas y ajustes.</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Almacén</th><th>Movimiento</th><th>Origen</th><th>Referencia</th><th>Embarque</th><th>Material</th><th>Ubicación</th><th>Cantidad</th></tr></thead>
            <tbody>{visibleMovements.slice(0,500).map((row)=>(
              <tr key={row.id}>
                <td>{fmt(row.created_at)}</td><td>{row.warehouse}</td>
                <td><span className={row.movement_type === 'ENTRADA' ? 'status-pill success' : 'status-pill warning'}>{row.movement_type}</span></td>
                <td>{row.source_type.replaceAll('_',' ')}</td><td>{row.reference_no || '—'}</td><td>{row.shipment_no || '—'}</td>
                <td><b>{row.material_no}</b><small>{row.description || ''}</small></td><td>{row.location || '—'}</td>
                <td><b>{row.movement_type === 'ENTRADA' ? '+' : '-'}{Number(row.quantity).toLocaleString('es-PE',{maximumFractionDigits:3})} {row.unit}</b></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {selected && (
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setSelected(null)}>
          <form className="modal kardex-withdrawal-modal" onSubmit={registerWithdrawal}>
            <div className="modal-head">
              <div><h2>Registrar salida de sobrante</h2><p>{selected.material_no} · {selected.warehouse}</p></div>
              <button type="button" className="icon-button" onClick={()=>setSelected(null)}><X size={19}/></button>
            </div>
            <div className="surplus-withdrawal-summary">
              <span>Disponible</span><b>{selected.balance.toLocaleString('es-PE',{maximumFractionDigits:3})} {selected.unit}</b>
              <small>{selected.description || ''} · {selected.location || 'Sin ubicación'}</small>
            </div>
            <div className="form-grid">
              <label>Cantidad a retirar<input autoFocus required type="number" min="0.001" max={selected.balance} step="any" value={quantity} onChange={(e)=>setQuantity(e.target.value)}/></label>
              <label>Referencia / vale<input value={reference} onChange={(e)=>setReference(e.target.value)} placeholder="Ej. RET-001"/></label>
              <label className="span-2">Motivo / observación<textarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Indica para qué se retira el sobrante."/></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setSelected(null)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<RefreshCw className="spin" size={15}/>:<MinusCircle size={15}/>} Registrar salida</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
