import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  List,
  MinusCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { exportRowsToExcel } from '../lib/exportUtils'
import { SearchableSelect } from './SearchableSelect'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
type KardexView = 'dashboard' | 'initial' | 'movements'

type Profile = {
  user_id: string
  full_name: string
  role: Role
  warehouse?: string | null
}

type Movement = {
  id: string
  warehouse: string
  center: string | null
  storage_type: string | null
  storage_section: string | null
  movement_type: 'ENTRADA' | 'SALIDA'
  source_type: string
  reference_no: string | null
  shipment_no: string | null
  box_no: string | null
  stock_type: string
  material_no: string
  stock_code: string | null
  description: string | null
  location: string | null
  quantity: number
  unit: string
  notes: string | null
  cut_off_date: string | null
  created_by: string
  created_by_name?: string | null
  created_at: string
}

type BalanceRow = {
  key: string
  warehouse: string
  center: string | null
  storage_type: string | null
  storage_section: string | null
  material_no: string
  stock_code: string | null
  description: string | null
  location: string | null
  box_no: string | null
  shipment_no: string | null
  stock_type: string
  unit: string
  initial: number
  entries: number
  exits: number
  balance: number
  lastMovement: Movement
}

type LedgerRow = Movement & {
  entry: number
  exit: number
  runningBalance: number
}

type HistoryMovement = {
  movement_id: string
  warehouse: string
  center: string | null
  movement_type: 'ENTRADA' | 'SALIDA'
  source_type: string
  reference_no: string | null
  shipment_no: string | null
  box_no: string | null
  material_no: string
  stock_code: string | null
  description: string | null
  location: string | null
  quantity: number
  unit: string
  notes: string | null
  created_by: string
  created_by_name: string
  created_at: string
}

type InitialRow = {
  row: number
  center: string
  warehouse: string
  storageType: string
  storageSection: string
  location: string
  boxNo: string
  shipmentNo: string
  materialNo: string
  stockCode: string
  description: string
  quantity: number
  unit: string
  stockType: string
  cutOffDate: string
  notes: string
  valid: boolean
  error: string
}

type Props = {
  userId: string
  profile: Profile | null
  fixedWarehouse?: string
}

const INITIAL_HEADERS = [
  'CENTRO',
  'ALMACEN',
  'TIPO_ALMACENAMIENTO',
  'SECCION',
  'UBICACION',
  'CAJA',
  'EMBARQUE',
  'MATERIAL',
  'STOCK_CODE',
  'DESCRIPCION',
  'CANTIDAD',
  'UM',
  'TIPO_STOCK',
  'FECHA_CORTE',
  'OBSERVACION',
]

function fmt(value: string) {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function fmtQty(value: number) {
  return Number(value || 0).toLocaleString('es-PE', { maximumFractionDigits: 3 })
}

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
}

function toIsoDate(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (!match) return ''
  const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  const date = new Date(iso + 'T12:00:00')
  return Number.isNaN(date.getTime()) ? '' : iso
}

function parseDelimited(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.trim())
  if (lines.length < 2) return [] as Record<string, string>[]
  const first = lines[0]
  const delimiter = [
    { value: '\t', count: (first.match(/\t/g) ?? []).length },
    { value: ';', count: (first.match(/;/g) ?? []).length },
    { value: ',', count: (first.match(/,/g) ?? []).length },
  ].sort((a, b) => b.count - a.count)[0].value

  const headers = first.split(delimiter).map(normalizeHeader)
  return lines.slice(1).map((line) => {
    const cells = line.split(delimiter)
    const row: Record<string, string> = {}
    headers.forEach((header, index) => { row[header] = String(cells[index] ?? '').trim() })
    return row
  })
}

function validateInitialRows(rows: Record<string, string>[], scopedWarehouse: string) {
  return rows.map((values, index): InitialRow => {
    const warehouse = String(values.ALMACEN || '').trim().toUpperCase()
    const center = String(values.CENTRO || '').trim().toUpperCase()
    const storageType = String(values.TIPO_ALMACENAMIENTO || '').trim().toUpperCase()
    const storageSection = String(values.SECCION || '').trim().toUpperCase()
    const location = String(values.UBICACION || '').trim().toUpperCase()
    const boxNo = String(values.CAJA || '').trim().toUpperCase()
    const shipmentNo = String(values.EMBARQUE || '').trim().toUpperCase()
    const materialNo = String(values.MATERIAL || '').trim().toUpperCase()
    const stockCode = String(values.STOCK_CODE || '').trim()
    const description = String(values.DESCRIPCION || '').trim()
    const quantity = Number(String(values.CANTIDAD || '').replace(',', '.'))
    const unit = String(values.UM || 'UND').trim().toUpperCase()
    const stockType = String(values.TIPO_STOCK || 'SOBRANTE').trim().toUpperCase()
    const cutOffDate = toIsoDate(values.FECHA_CORTE)
    const notes = String(values.OBSERVACION || '').trim()

    let error = ''
    if (!center) error = 'Centro requerido'
    else if (!warehouse) error = 'Almacén requerido'
    else if (scopedWarehouse && warehouse !== scopedWarehouse) error = `Almacén permitido: ${scopedWarehouse}`
    else if (!location) error = 'Ubicación requerida'
    else if (!materialNo) error = 'Material requerido'
    else if (!description) error = 'Descripción requerida'
    else if (!(quantity > 0)) error = 'Cantidad inválida'
    else if (!unit) error = 'UM requerida'
    else if (!cutOffDate) error = 'Fecha de corte inválida'

    return {
      row: index + 2,
      center,
      warehouse,
      storageType,
      storageSection,
      location,
      boxNo,
      shipmentNo,
      materialNo,
      stockCode,
      description,
      quantity,
      unit,
      stockType,
      cutOffDate,
      notes,
      valid: !error,
      error,
    }
  })
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

function normalizePart(value: unknown) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function partBase(value: unknown) {
  return normalizePart(value).replace(/^[A-Z]{1,4}(?=\d)/, '')
}

function partDistance(left: string, right: string) {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  let prev = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    const next = [i]
    for (let j = 1; j <= right.length; j++) {
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      )
    }
    prev = next
  }
  return prev[right.length]
}

function partSimilarity(left: string, right: string) {
  const a = normalizePart(left)
  const b = normalizePart(right)
  if (!a || !b) return 0
  return Math.max(0, Math.round((1 - partDistance(a, b) / Math.max(a.length, b.length)) * 100))
}

function balanceMatchScore(row: BalanceRow, raw: string) {
  const query = normalizePart(raw)
  if (!query) return 0
  const full = normalizePart(row.material_no)
  const base = partBase(row.material_no)
  const queryBase = partBase(query)

  if (full === query) return 100
  if (base && base === query) return 99
  if (queryBase && base === queryBase) return 97
  if (full.endsWith(query) && query.length >= 5) return 96

  const fuzzy = Math.max(partSimilarity(query, full), partSimilarity(query, base))
  if (query.length >= 5 && fuzzy >= 72) return fuzzy

  const text = raw.trim().toLowerCase()
  if ([row.stock_code,row.description,row.location,row.box_no,row.shipment_no,row.warehouse]
    .some((value)=>String(value ?? '').toLowerCase().includes(text))) return 70
  return 0
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

export function SurplusKardexModule({ userId, profile, fixedWarehouse }: Props) {
  const [view, setView] = useState<KardexView>('dashboard')
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState(fixedWarehouse || profile?.warehouse || 'TODOS')
  const [selected, setSelected] = useState<BalanceRow | null>(null)
  const [quickActions, setQuickActions] = useState<BalanceRow | null>(null)
  const [selectedAction, setSelectedAction] = useState<'withdrawal' | 'transfer' | null>(null)
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [destinationLocation, setDestinationLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualForm, setManualForm] = useState({
    warehouse: fixedWarehouse || profile?.warehouse || '',
    center: '',
    storage_type: 'SOBRANTES',
    storage_section: '',
    shipment_no: '',
    box_no: '',
    material_no: '',
    stock_code: '',
    description: '',
    location: '',
    quantity: '',
    unit: 'UND',
    notes: '',
  })

  const [historyTarget, setHistoryTarget] = useState<{ materialNo: string; warehouse: string; description: string; stockCode: string } | null>(null)
  const [historyRows, setHistoryRows] = useState<HistoryMovement[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyShipment, setHistoryShipment] = useState('TODOS')
  const [historyBox, setHistoryBox] = useState('TODOS')

  const [initialFileName, setInitialFileName] = useState('')
  const [initialRows, setInitialRows] = useState<InitialRow[]>([])
  const [initialLoading, setInitialLoading] = useState(false)

  const isAdmin = profile?.role === 'ADMINISTRADOR'
  const canMove = profile?.role !== 'SUPERVISOR'
  const canLoadInitial = profile?.role === 'COORDINADOR' || profile?.role === 'ADMINISTRADOR'
  const scopedWarehouse = fixedWarehouse || (!isAdmin ? profile?.warehouse || '' : '')

  async function loadMovements(silent = false) {
    if (!silent) {
      setLoading(true)
      setMessage('')
    }

    let query = supabase
      .from('surplus_kardex_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10000)

    if (scopedWarehouse) query = query.eq('warehouse', scopedWarehouse)
    const { data, error } = await query

    if (error) {
      if (!silent) setMessage(error.message)
    } else {
      setMovements((data ?? []) as Movement[])
    }

    if (!silent) setLoading(false)
  }

  async function reload() {
    await loadMovements(false)
  }

  useEffect(() => {
    void reload()
  }, [userId, scopedWarehouse])

  useEffect(() => {
    const channel = supabase
      .channel(`surplus-kardex-live-${userId}-${scopedWarehouse || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'surplus_kardex_movements',
        },
        () => {
          void loadMovements(true)
        }
      )
      .subscribe()

    const sync = () => { void loadMovements(true) }
    const timer = window.setInterval(sync, 30_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync()
    }

    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', onVisibility)
      void supabase.removeChannel(channel)
    }
  }, [userId, scopedWarehouse])

  const warehouses = useMemo(
    () => Array.from(new Set(movements.map((row) => row.warehouse))).sort(),
    [movements]
  )

  const activeWarehouseMovements = useMemo(() => {
    if (!isAdmin || fixedWarehouse || warehouseFilter === 'TODOS') return movements
    return movements.filter((row) => row.warehouse === warehouseFilter)
  }, [movements, warehouseFilter, isAdmin, fixedWarehouse])

  const balances = useMemo(() => {
    const map = new Map<string, BalanceRow>()
    for (const movement of [...activeWarehouseMovements].reverse()) {
      const key = [
        movement.warehouse,
        movement.center || '',
        movement.material_no,
        movement.stock_code || '',
        movement.location || '',
        movement.box_no || '',
        movement.shipment_no || '',
        movement.stock_type || 'SOBRANTE',
        movement.unit,
      ].join('|')
      const existing = map.get(key)
      const qty = Number(movement.quantity || 0)
      const delta = movement.movement_type === 'ENTRADA' ? qty : -qty
      const initialDelta = movement.source_type === 'SALDO_INICIAL' ? qty : 0
      const entryDelta = movement.movement_type === 'ENTRADA' && movement.source_type !== 'SALDO_INICIAL' ? qty : 0
      const exitDelta = movement.movement_type === 'SALIDA' ? qty : 0

      if (!existing) {
        map.set(key, {
          key,
          warehouse: movement.warehouse,
          center: movement.center,
          storage_type: movement.storage_type,
          storage_section: movement.storage_section,
          material_no: movement.material_no,
          stock_code: movement.stock_code,
          description: movement.description,
          location: movement.location,
          box_no: movement.box_no,
          shipment_no: movement.shipment_no,
          stock_type: movement.stock_type || 'SOBRANTE',
          unit: movement.unit,
          initial: initialDelta,
          entries: entryDelta,
          exits: exitDelta,
          balance: delta,
          lastMovement: movement,
        })
      } else {
        existing.initial += initialDelta
        existing.entries += entryDelta
        existing.exits += exitDelta
        existing.balance += delta
        existing.lastMovement = movement
        if (movement.description) existing.description = movement.description
      }
    }
    return Array.from(map.values())
      .filter((row) => row.balance > 0.000001)
      .sort((a, b) => a.material_no.localeCompare(b.material_no, 'es', { numeric: true }))
  }, [activeWarehouseMovements])

  const q = search.trim().toLowerCase()

  const visibleBalances = useMemo(() => {
    if (!search.trim()) return balances
    return balances
      .map((row)=>({ row, score: balanceMatchScore(row, search) }))
      .filter((item)=>item.score > 0)
      .sort((a,b)=>b.score-a.score || a.row.material_no.localeCompare(b.row.material_no,'es',{numeric:true}))
      .map((item)=>item.row)
  }, [balances, search])

  const bestBalanceMatch = useMemo(() => {
    if (!search.trim() || !visibleBalances.length) return null
    const row = visibleBalances[0]
    return { row, score: balanceMatchScore(row, search) }
  }, [visibleBalances, search])

  const visibleMovements = useMemo(() => {
    if (!q) return activeWarehouseMovements
    return activeWarehouseMovements.filter((row) =>
      [
        row.warehouse,row.center,row.material_no,row.stock_code,row.description,row.location,
        row.box_no,row.shipment_no,row.reference_no,row.source_type,row.storage_type,row.storage_section,
      ].some((value) => String(value ?? '').toLowerCase().includes(q))
      || normalizePart(row.material_no).endsWith(normalizePart(search))
      || partBase(row.material_no) === normalizePart(search)
    )
  }, [activeWarehouseMovements, q, search])

  const movementLedger = useMemo(() => {
    const balanceByKey = new Map<string, number>()
    const chronological = [...visibleMovements].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())
    const rows: LedgerRow[] = chronological.map((movement)=>{
      const key = [
        movement.warehouse,
        movement.material_no,
        movement.stock_code || '',
        movement.location || '',
        movement.box_no || '',
        movement.shipment_no || '',
        movement.stock_type || 'SOBRANTE',
        movement.unit || 'UND',
      ].join('|')
      const qty = Number(movement.quantity || 0)
      const entry = movement.movement_type === 'ENTRADA' ? qty : 0
      const exit = movement.movement_type === 'SALIDA' ? qty : 0
      const runningBalance = (balanceByKey.get(key) || 0) + entry - exit
      balanceByKey.set(key, runningBalance)
      return { ...movement, entry, exit, runningBalance }
    })
    return rows.reverse()
  }, [visibleMovements])

  const totals = useMemo(() => {
    let initial = 0
    let entries = 0
    let exits = 0
    for (const row of activeWarehouseMovements) {
      const qty = Number(row.quantity || 0)
      if (row.source_type === 'SALDO_INICIAL') initial += qty
      else if (row.movement_type === 'ENTRADA') entries += qty
      if (row.movement_type === 'SALIDA') exits += qty
    }
    return {
      initial,
      entries,
      exits,
      balance: initial + entries - exits,
      materials: new Set(balances.map((row) => row.material_no)).size,
    }
  }, [activeWarehouseMovements, balances])

  function summarizeBy(field: 'material_no' | 'box_no' | 'shipment_no') {
    const map = new Map<string, { key: string; initial: number; entries: number; exits: number; balance: number; count: number }>()
    for (const movement of activeWarehouseMovements) {
      const raw = movement[field]
      const key = raw || (field === 'material_no' ? 'SIN MATERIAL' : field === 'box_no' ? 'SIN CAJA' : 'SIN EMBARQUE')
      const item = map.get(key) || { key, initial: 0, entries: 0, exits: 0, balance: 0, count: 0 }
      const qty = Number(movement.quantity || 0)
      if (movement.source_type === 'SALDO_INICIAL') item.initial += qty
      else if (movement.movement_type === 'ENTRADA') item.entries += qty
      if (movement.movement_type === 'SALIDA') item.exits += qty
      item.balance += movement.movement_type === 'ENTRADA' ? qty : -qty
      item.count += 1
      map.set(key, item)
    }
    return Array.from(map.values())
      .filter((row) => row.balance > 0.000001)
      .sort((a, b) => b.balance - a.balance)
  }

  const byMaterial = useMemo(() => summarizeBy('material_no'), [activeWarehouseMovements])
  const byBox = useMemo(() => summarizeBy('box_no'), [activeWarehouseMovements])
  const byShipment = useMemo(() => summarizeBy('shipment_no'), [activeWarehouseMovements])

  function openAction(row: BalanceRow, action: 'withdrawal' | 'transfer') {
    setSelected(row)
    setSelectedAction(action)
    setQuantity('')
    setNotes('')
    setDestinationLocation('')
    setMessage('')
  }

  async function registerMovement(event: FormEvent) {
    event.preventDefault()
    if (!selected || !selectedAction) return
    const qty = Number(quantity)
    if (!(qty > 0) || qty > selected.balance) {
      setMessage(`La cantidad debe ser mayor a 0 y no superar el saldo disponible (${fmtQty(selected.balance)}).`)
      return
    }

    setSaving(true)
    const rpc = selectedAction === 'withdrawal' ? 'register_surplus_withdrawal_v2' : 'register_surplus_transfer'
    const args = selectedAction === 'withdrawal'
      ? {
          p_warehouse: selected.warehouse,
          p_center: selected.center || '',
          p_material_no: selected.material_no,
          p_stock_code: selected.stock_code || '',
          p_description: selected.description || '',
          p_location: selected.location || '',
          p_box_no: selected.box_no || '',
          p_shipment_no: selected.shipment_no || '',
          p_stock_type: selected.stock_type || 'SOBRANTE',
          p_quantity: qty,
          p_unit: selected.unit || 'UND',
          p_reference_no: null,
          p_notes: notes.trim() || null,
        }
      : {
          p_warehouse: selected.warehouse,
          p_center: selected.center || '',
          p_material_no: selected.material_no,
          p_stock_code: selected.stock_code || '',
          p_description: selected.description || '',
          p_origin_location: selected.location || '',
          p_destination_location: destinationLocation.trim().toUpperCase(),
          p_box_no: selected.box_no || '',
          p_shipment_no: selected.shipment_no || '',
          p_stock_type: selected.stock_type || 'SOBRANTE',
          p_quantity: qty,
          p_unit: selected.unit || 'UND',
          p_reference_no: null,
          p_notes: notes.trim() || null,
        }

    const { data, error } = await supabase.rpc(rpc, args)
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    let generatedCode = ''
    if (selectedAction === 'transfer') {
      generatedCode = String((data as { reference?: string } | null)?.reference || '')
    } else if (data) {
      const { data: created } = await supabase
        .from('surplus_kardex_movements')
        .select('reference_no')
        .eq('id', String(data))
        .maybeSingle()
      generatedCode = String(created?.reference_no || '')
    }

    setSelected(null)
    setSelectedAction(null)
    setMessage(selectedAction === 'withdrawal'
      ? `Salida registrada correctamente. Código: ${generatedCode || 'generado automáticamente'}.`
      : `Transferencia registrada. Código: ${generatedCode || 'generado automáticamente'}. El saldo total no cambia.`)
    await reload()
  }

  function openManualEntry() {
    setManualForm({
      warehouse: fixedWarehouse || profile?.warehouse || (warehouseFilter !== 'TODOS' ? warehouseFilter : ''),
      center: '',
      storage_type: 'SOBRANTES',
      storage_section: '',
      shipment_no: '',
      box_no: '',
      material_no: '',
      stock_code: '',
      description: '',
      location: '',
      quantity: '',
      unit: 'UND',
      notes: '',
    })
    setMessage('')
    setShowManualEntry(true)
  }

  async function registerManualEntry(event: FormEvent) {
    event.preventDefault()
    const qty=Number(manualForm.quantity)
    if(!manualForm.warehouse.trim()){setMessage('Almacén requerido.');return}
    if(!manualForm.shipment_no.trim()){setMessage('Embarque requerido.');return}
    if(!manualForm.material_no.trim()){setMessage('Material requerido.');return}
    if(!(qty>0)){setMessage('Cantidad inválida.');return}

    setSaving(true)
    const {data,error}=await supabase.rpc('register_surplus_manual_entry',{
      p_warehouse:manualForm.warehouse.trim().toUpperCase(),
      p_center:manualForm.center.trim().toUpperCase(),
      p_storage_type:manualForm.storage_type.trim().toUpperCase(),
      p_storage_section:manualForm.storage_section.trim().toUpperCase(),
      p_shipment_no:manualForm.shipment_no.trim().toUpperCase(),
      p_box_no:manualForm.box_no.trim().toUpperCase(),
      p_material_no:manualForm.material_no.trim().toUpperCase(),
      p_stock_code:manualForm.stock_code.trim(),
      p_description:manualForm.description.trim(),
      p_location:manualForm.location.trim().toUpperCase(),
      p_quantity:qty,
      p_unit:manualForm.unit.trim().toUpperCase()||'UND',
      p_reference_no:null,
      p_notes:manualForm.notes.trim()||null,
    })
    setSaving(false)
    if(error){setMessage(error.message);return}
    let generatedCode=''
    if(data){
      const {data:created}=await supabase
        .from('surplus_kardex_movements')
        .select('reference_no')
        .eq('id',String(data))
        .maybeSingle()
      generatedCode=String(created?.reference_no||'')
    }
    setShowManualEntry(false)
    setMessage(`Ingreso manual registrado. Código: ${generatedCode || 'generado automáticamente'} · Embarque ${manualForm.shipment_no.trim().toUpperCase()}.`)
    await reload()
  }

  async function openMaterialHistory(materialNo: string, warehouse: string, description = '', stockCode = '') {
    setHistoryTarget({
      materialNo: materialNo.toUpperCase(),
      warehouse: warehouse.toUpperCase(),
      description,
      stockCode,
    })
    setHistoryRows([])
    setHistoryShipment('TODOS')
    setHistoryBox('TODOS')
    setHistoryError('')
    setHistoryLoading(true)

    const { data, error } = await supabase
      .from('surplus_kardex_movements')
      .select('id,warehouse,center,movement_type,source_type,reference_no,shipment_no,box_no,material_no,stock_code,description,location,quantity,unit,notes,created_by,created_by_name,created_at')
      .eq('warehouse', warehouse.toUpperCase())
      .eq('material_no', materialNo.toUpperCase())
      .order('created_at', { ascending: false })
      .limit(5000)

    setHistoryLoading(false)
    if (error) {
      setHistoryError(error.message)
      return
    }
    setHistoryRows((data ?? []).map((row)=>({
      movement_id: String(row.id),
      warehouse: String(row.warehouse),
      center: row.center,
      movement_type: row.movement_type as 'ENTRADA' | 'SALIDA',
      source_type: String(row.source_type),
      reference_no: row.reference_no,
      shipment_no: row.shipment_no,
      box_no: row.box_no,
      material_no: String(row.material_no),
      stock_code: row.stock_code,
      description: row.description,
      location: row.location,
      quantity: Number(row.quantity || 0),
      unit: String(row.unit || 'UND'),
      notes: row.notes,
      created_by: String(row.created_by),
      created_by_name: String(row.created_by_name || 'Usuario KOMTROL'),
      created_at: String(row.created_at),
    })))
  }

  async function deleteMovement(id: string, reference: string | null, source: string) {
    if (!isAdmin || saving) return
    const paired = source === 'TRANSFERENCIA_IN' || source === 'TRANSFERENCIA_OUT'
    const detail = paired ? 'Se eliminarán ambas partes de la transferencia.' : 'El saldo del Kardex se recalculará.'
    if (!window.confirm(`¿Eliminar el movimiento ${reference || id}? ${detail} Esta acción no se puede deshacer.`)) return
    setSaving(true)
    const { error } = await supabase.rpc('admin_delete_kardex_movement', { p_movement_id: id })
    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }
    await reload()
    if (historyTarget) await openMaterialHistory(historyTarget.materialNo, historyTarget.warehouse, historyTarget.description, historyTarget.stockCode)
    setSaving(false)
    setMessage(paired ? 'Transferencia eliminada y saldos actualizados.' : 'Movimiento eliminado y saldo actualizado.')
  }

  const historyShipments = useMemo(
    () => Array.from(new Set(historyRows.map((row)=>row.shipment_no).filter(Boolean) as string[])).sort(),
    [historyRows]
  )

  const historyBoxes = useMemo(
    () => Array.from(new Set(historyRows.map((row)=>row.box_no).filter(Boolean) as string[])).sort(),
    [historyRows]
  )

  const filteredHistory = useMemo(
    () => historyRows.filter((row)=>
      (historyShipment==='TODOS' || row.shipment_no===historyShipment)
      && (historyBox==='TODOS' || row.box_no===historyBox)
    ),
    [historyRows,historyShipment,historyBox]
  )

  const historyLedger = useMemo(() => {
    let balance = 0
    return [...filteredHistory]
      .sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())
      .map((row)=>{
        const qty=Number(row.quantity||0)
        balance += row.movement_type==='ENTRADA' ? qty : -qty
        return {
          ...row,
          entry: row.movement_type==='ENTRADA' ? qty : 0,
          exit: row.movement_type==='SALIDA' ? qty : 0,
          runningBalance: balance,
        }
      })
      .reverse()
  },[filteredHistory])

  const historyTotals = useMemo(() => {
    const entries=filteredHistory.filter((row)=>row.movement_type==='ENTRADA').reduce((sum,row)=>sum+Number(row.quantity||0),0)
    const exits=filteredHistory.filter((row)=>row.movement_type==='SALIDA').reduce((sum,row)=>sum+Number(row.quantity||0),0)
    return { entries, exits, balance: entries-exits, movements: filteredHistory.length }
  },[filteredHistory])

  async function downloadInitialTemplate() {
    const moduleUrl = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/+esm'
    const XLSX: any = await import(/* @vite-ignore */ moduleUrl)
    const exampleWarehouse = fixedWarehouse || profile?.warehouse || 'ANTAMINA'
    const rows = [
      INITIAL_HEADERS,
      ['C029',exampleWarehouse,'SOBRANTES','GENERAL','SOB-01','CX-001','EMB-0001','RH018753','1100176102','PIN ASSY',5,'UND','SOBRANTE',new Date().toISOString().slice(0,10),'Stock inicial'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [
      {wch:12},{wch:15},{wch:22},{wch:16},{wch:16},{wch:16},{wch:18},{wch:20},
      {wch:18},{wch:38},{wch:12},{wch:10},{wch:15},{wch:16},{wch:28},
    ]
    INITIAL_HEADERS.forEach((_header,index)=>{
      const cell = ws[XLSX.utils.encode_cell({r:0,c:index})]
      if (!cell) return
      cell.s = {
        fill:{fgColor:{rgb:'DDEFF8'}},
        font:{name:'Arial',sz:10,bold:true,color:{rgb:'17384A'}},
        alignment:{horizontal:'center',vertical:'center',wrapText:true},
        border:{
          top:{style:'thin',color:{rgb:'B7CAD5'}},bottom:{style:'thin',color:{rgb:'B7CAD5'}},
          left:{style:'thin',color:{rgb:'B7CAD5'}},right:{style:'thin',color:{rgb:'B7CAD5'}},
        },
      }
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Inicial Kardex')
    XLSX.writeFile(wb, 'KOMTROL_Plantilla_Stock_Inicial_Sobrantes.xlsx')
  }

  async function onInitialFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setInitialLoading(true)
    setMessage('')
    try {
      let rawRows: Record<string, string>[] = []
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const moduleUrl = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/+esm'
        const XLSX: any = await import(/* @vite-ignore */ moduleUrl)
        const workbook = XLSX.read(await file.arrayBuffer(), { type:'array', cellDates:true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        if (!sheet) throw new Error('El Excel no contiene hojas.')
        const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false }) as unknown[][]
        if (matrix.length < 2) throw new Error('El archivo no contiene filas de stock.')
        const headers = matrix[0].map(normalizeHeader)
        rawRows = matrix.slice(1)
          .filter((row)=>row.some((cell)=>String(cell ?? '').trim()))
          .map((row)=>{
            const item:Record<string,string> = {}
            headers.forEach((header,index)=>{ item[header]=String(row[index] ?? '').trim() })
            return item
          })
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        rawRows = parseDelimited(await file.text())
      } else {
        throw new Error('Formato no compatible. Usa .XLSX, .XLS o .CSV.')
      }

      const validated = validateInitialRows(rawRows, scopedWarehouse)
      setInitialRows(validated)
      setInitialFileName(file.name)
      const errors = validated.filter((row)=>!row.valid).length
      setMessage(errors
        ? `Archivo leído: ${validated.length} filas, ${errors} con observaciones.`
        : `Archivo listo: ${validated.length} filas válidas para confirmar.`)
    } catch (error) {
      setInitialRows([])
      setInitialFileName('')
      setMessage(error instanceof Error ? error.message : 'No se pudo leer el archivo.')
    } finally {
      setInitialLoading(false)
      event.target.value = ''
    }
  }

  async function confirmInitialStock() {
    const invalid = initialRows.filter((row)=>!row.valid)
    if (!initialRows.length || invalid.length) {
      setMessage('Corrige las filas inválidas antes de confirmar el stock inicial.')
      return
    }
    if (!canLoadInitial) {
      setMessage('Solo Coordinador o Administrador puede confirmar el stock inicial.')
      return
    }

    const groups = new Map<string, InitialRow[]>()
    for (const row of initialRows) {
      const key = `${row.warehouse}|${row.cutOffDate}`
      const group = groups.get(key) || []
      group.push(row)
      groups.set(key, group)
    }

    setSaving(true)
    try {
      let totalRows = 0
      let totalQty = 0
      for (const rows of groups.values()) {
        const first = rows[0]
        const payload = rows.map((row)=>({
          center: row.center,
          storage_type: row.storageType,
          storage_section: row.storageSection,
          location: row.location,
          box_no: row.boxNo,
          shipment_no: row.shipmentNo,
          stock_type: row.stockType,
          material_no: row.materialNo,
          stock_code: row.stockCode,
          description: row.description,
          quantity: row.quantity,
          unit: row.unit,
          notes: row.notes,
        }))
        const { data, error } = await supabase.rpc('import_surplus_initial_stock', {
          p_warehouse: first.warehouse,
          p_file_name: initialFileName || 'stock_inicial.xlsx',
          p_cut_off_date: first.cutOffDate,
          p_rows: payload,
        })
        if (error) throw error
        totalRows += Number(data?.rows || rows.length)
        totalQty += Number(data?.quantity || rows.reduce((sum,row)=>sum+row.quantity,0))
      }
      setInitialRows([])
      setInitialFileName('')
      setMessage(`Stock inicial confirmado: ${totalRows} registros · ${fmtQty(totalQty)} unidades. El Kardex ya fue actualizado.`)
      setView('dashboard')
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo confirmar el stock inicial.')
    } finally {
      setSaving(false)
    }
  }

  function exportKardexPdf() {
    if (!movementLedger.length) {
      setMessage('No hay movimientos para exportar con los filtros actuales.')
      return
    }

    setMessage('')
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const pageWidth = doc.internal.pageSize.getWidth()
      const generated = new Intl.DateTimeFormat('es-PE', { dateStyle:'medium', timeStyle:'short' }).format(new Date())
      const scope = fixedWarehouse || (!isAdmin ? profile?.warehouse || 'TODOS' : warehouseFilter)
      const oldest = [...movementLedger].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())[0]
      const newest = movementLedger[0]
      const period = oldest && newest
        ? `${new Intl.DateTimeFormat('es-PE',{dateStyle:'short'}).format(new Date(oldest.created_at))} – ${new Intl.DateTimeFormat('es-PE',{dateStyle:'short'}).format(new Date(newest.created_at))}`
        : 'Sin período'

      doc.setFillColor(31,64,84)
      doc.rect(0,0,pageWidth,28,'F')
      doc.setTextColor(255,255,255)
      doc.setFont('helvetica','bold')
      doc.setFontSize(15)
      doc.text('KOMTROL · KARDEX DE SOBRANTES',12,11)
      doc.setFont('helvetica','normal')
      doc.setFontSize(8)
      doc.text(`Almacén: ${scope || 'TODOS'} · Período: ${period}`,12,18)
      doc.text(`Filtro: ${q || 'Sin filtro adicional'}`,12,23)
      doc.text(`Generado: ${generated}`,pageWidth-12,18,{align:'right'})

      const cards = [
        ['ENTRADAS', fmtQty(totals.entries), [48,148,110]],
        ['SALIDAS', fmtQty(totals.exits), [205,82,82]],
        ['SALDO ACTUAL', fmtQty(totals.balance), [38,115,166]],
        ['MOVIMIENTOS', String(movementLedger.length), [115,99,199]],
      ] as const
      cards.forEach((card,index)=>{
        const x=12+index*46
        doc.setDrawColor(219,232,240)
        doc.setFillColor(249,252,255)
        doc.roundedRect(x,33,41,16,2,2,'FD')
        doc.setFontSize(6.5)
        doc.setTextColor(99,125,143)
        doc.setFont('helvetica','bold')
        doc.text(card[0],x+4,39)
        doc.setFontSize(10)
        doc.setTextColor(card[2][0],card[2][1],card[2][2])
        doc.text(card[1],x+4,46)
      })

      autoTable(doc, {
        startY: 55,
        head: [[
          'FECHA','REF.','MOV.','MATERIAL','SC','CAJA / EMBARQUE','UBICACIÓN','ENTRADA / SALIDA','SALDO'
        ]],
        body: movementLedger.map((row)=>[
          fmt(row.created_at),
          row.reference_no || '—',
          row.movement_type,
          row.material_no,
          row.stock_code || '—',
          [row.box_no,row.shipment_no].filter(Boolean).join(' / ') || '—',
          row.location || '—',
          row.entry ? `+${fmtQty(row.entry)}` : row.exit ? `−${fmtQty(row.exit)}` : '—',
          fmtQty(row.runningBalance),
        ]),
        styles: {
          font:'helvetica',
          fontSize:5.3,
          cellPadding:1.05,
          lineColor:[222,231,236],
          lineWidth:.12,
          textColor:[31,64,84],
          valign:'middle',
          overflow:'linebreak',
        },
        headStyles: {
          fillColor:[31,64,84],
          textColor:[255,255,255],
          fontStyle:'bold',
          fontSize:5.2,
          halign:'center',
        },
        alternateRowStyles:{ fillColor:[248,252,254] },
        columnStyles:{
          0:{cellWidth:20},
          1:{cellWidth:19},
          2:{cellWidth:16,halign:'center'},
          3:{cellWidth:22},
          4:{cellWidth:17},
          5:{cellWidth:28},
          6:{cellWidth:23},
          7:{cellWidth:21,halign:'right'},
          8:{cellWidth:17,halign:'right',fontStyle:'bold'},
        },
        didParseCell:(data:any)=>{
          if(data.section==='body' && data.column.index===7) {
            const value=String(data.cell.text?.[0] || '')
            if(value.startsWith('+')) data.cell.styles.textColor=[48,148,110]
            if(value.startsWith('−')) data.cell.styles.textColor=[205,82,82]
          }
        },
        margin:{left:10,right:10,bottom:14},
      })

      const pages=doc.getNumberOfPages()
      for(let page=1;page<=pages;page++){
        doc.setPage(page)
        doc.setDrawColor(219,232,240)
        doc.line(10,286,pageWidth-10,286)
        doc.setFont('helvetica','normal')
        doc.setFontSize(6.5)
        doc.setTextColor(105,125,137)
        doc.text('KOMTROL · Kardex de Sobrantes · Trazabilidad de movimientos',10,291)
        doc.text(`Página ${page} de ${pages}`,pageWidth-10,291,{align:'right'})
      }

      const dateStamp=new Date().toISOString().slice(0,10)
      savePdfBlob(doc, `KOMTROL_Kardex_Sobrantes_${scope || 'TODOS'}_${dateStamp}.pdf`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el PDF del Kardex.')
    }
  }

  function exportKardexExcel() {
    const rows=visibleMovements.map((row)=>({
      center:row.center || '',
      warehouse:row.warehouse,
      storage_type:row.storage_type || '',
      storage_section:row.storage_section || '',
      created_at:fmt(row.created_at),
      movement_type:row.movement_type,
      source_type:row.source_type,
      reference_no:row.reference_no || '',
      box_no:row.box_no || '',
      shipment_no:row.shipment_no || '',
      material_no:row.material_no,
      stock_code:row.stock_code || '',
      description:row.description || '',
      location:row.location || '',
      stock_type:row.stock_type,
      quantity:row.quantity,
      unit:row.unit,
      notes:row.notes || '',
    }))
    exportRowsToExcel(
      'KOMTROL_Kardex_Sobrantes',
      'Kardex',
      [
        {header:'CENTRO',key:'center',width:14},
        {header:'ALMACÉN',key:'warehouse',width:18},
        {header:'TIPO ALMACENAMIENTO',key:'storage_type',width:20},
        {header:'SECCIÓN',key:'storage_section',width:16},
        {header:'FECHA',key:'created_at',width:18},
        {header:'MOVIMIENTO',key:'movement_type',width:14},
        {header:'ORIGEN',key:'source_type',width:18},
        {header:'REFERENCIA',key:'reference_no',width:18},
        {header:'CAJA',key:'box_no',width:18},
        {header:'EMBARQUE',key:'shipment_no',width:20},
        {header:'MATERIAL',key:'material_no',width:18},
        {header:'STOCK CODE',key:'stock_code',width:16},
        {header:'DESCRIPCIÓN',key:'description',width:38},
        {header:'UBICACIÓN',key:'location',width:18},
        {header:'TIPO STOCK',key:'stock_type',width:16},
        {header:'CANTIDAD',key:'quantity',width:12},
        {header:'UM',key:'unit',width:8},
        {header:'OBSERVACIÓN',key:'notes',width:30},
      ],
      rows,
      [['Registros',rows.length],['Almacén',fixedWarehouse || warehouseFilter || profile?.warehouse || 'Todos']]
    )
  }

  if (loading) {
    return <section className="panel"><div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando Kardex de Sobrantes…</p></div></section>
  }

  return (
    <div className="surplus-kardex-module">
      <section className="panel kardex-header-panel">
        <div className="panel-title">
          <div>
            <h3>Kardex de Sobrantes</h3>
            <p>Modelo WM: Centro → Almacén → Tipo → Sección → Ubicación/Bin → Caja → Embarque → Material. Actualización automática activa.</p>
          </div>
          <div className="button-row">
            {canMove && <button className="primary-button" onClick={openManualEntry}><Plus size={15}/> Agregar sobrante</button>}
            <button className="secondary-button" onClick={exportKardexPdf}><FileText size={15}/> PDF Kardex</button>
            <button className="secondary-button" onClick={exportKardexExcel}><FileSpreadsheet size={15}/> Excel</button>
            <button className="icon-button" onClick={() => void reload()} title="Sincronizar ahora"><RefreshCw size={17}/></button>
          </div>
        </div>

        <div className="kardex-view-tabs">
          <button className={view==='dashboard'?'active':''} onClick={()=>setView('dashboard')}><LayoutDashboard size={15}/> Dashboard</button>
          {canLoadInitial && <button className={view==='initial'?'active':''} onClick={()=>setView('initial')}><FileSpreadsheet size={15}/> Stock Inicial</button>}
          <button className={view==='movements'?'active':''} onClick={()=>setView('movements')}><List size={15}/> Movimientos</button>
        </div>

        {message && <div className="inline-message">{message}</div>}
      </section>

      {view === 'dashboard' && (
        <>
          <section className="panel">
            <div className="task-toolbar kardex-toolbar">
              <label className="kardex-smart-search">N° parte / material
                <div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Escanea código completo o sin prefijo…"/></div>
                {bestBalanceMatch && search.trim() && <small className={bestBalanceMatch.score >= 95 ? 'match-high' : bestBalanceMatch.score >= 80 ? 'match-medium' : 'match-low'}>Mejor coincidencia: {bestBalanceMatch.row.material_no} · {bestBalanceMatch.score}%</small>}
              </label>
              {isAdmin && !fixedWarehouse && (
                <SearchableSelect
                  value={warehouseFilter}
                  onChange={(value)=>setWarehouseFilter(value||'TODOS')}
                  options={[{value:'TODOS',label:'Todos los almacenes'},...warehouses.map((warehouse)=>({value:warehouse,label:warehouse}))]}
                  placeholder="Buscar almacén…"
                  clearable={false}
                  ariaLabel="Filtrar por almacén"
                />
              )}
            </div>

            <div className="kardex-kpi-grid">
              <div><span>Stock inicial</span><b>{fmtQty(totals.initial)}</b><small>Unidades</small></div>
              <div><span>Entradas</span><b className="positive">+{fmtQty(totals.entries)}</b><small>Después del corte</small></div>
              <div><span>Salidas</span><b className="negative">−{fmtQty(totals.exits)}</b><small>Retiros / ajustes</small></div>
              <div><span>Saldo actual</span><b>{fmtQty(totals.balance)}</b><small>Unidades</small></div>
              <div><span>Materiales</span><b>{totals.materials}</b><small>Con saldo</small></div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-title"><div><h3>Saldo por material</h3><p>Stock inicial + Entradas − Salidas = Saldo final.</p></div></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Material</th><th>SC</th><th>Descripción</th><th>Centro</th><th>Almacén</th><th>Ubicación</th><th>Caja</th><th>Embarque</th><th>Inicial</th><th>Entradas</th><th>Salidas</th><th>Saldo</th><th>Acciones</th></tr></thead>
                <tbody>{visibleBalances.slice(0,500).map((row)=>(
                  <tr key={row.key}>
                    <td><button className="kardex-material-link" onClick={()=>openMaterialHistory(row.material_no,row.warehouse,row.description||'',row.stock_code||'')}><b>{row.material_no}</b><small>{row.stock_type} · Ver historial</small></button></td>
                    <td>{row.stock_code || '—'}</td><td>{row.description || '—'}</td><td>{row.center || '—'}</td><td>{row.warehouse}</td>
                    <td><b>{row.location || '—'}</b><small>{[row.storage_type,row.storage_section].filter(Boolean).join(' · ')}</small></td>
                    <td>{row.box_no || '—'}</td><td>{row.shipment_no || '—'}</td>
                    <td>{fmtQty(row.initial)}</td><td className="kardex-positive">+{fmtQty(row.entries)}</td><td className="kardex-negative">−{fmtQty(row.exits)}</td>
                    <td><b className="kardex-balance-number">{fmtQty(row.balance)} {row.unit}</b></td>
                    <td><button className="kardex-action-trigger" onClick={()=>setQuickActions(row)}><MoreHorizontal size={16}/><span>Acciones</span></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <div className="kardex-drill-grid">
            <section className="panel">
              <div className="panel-title"><div><h3>Por material</h3><p>Saldos consolidados.</p></div></div>
              <div className="kardex-drill-list">{byMaterial.slice(0,12).map((row)=><div key={row.key}><b>{row.key}</b><span>{fmtQty(row.balance)}</span></div>)}</div>
            </section>
            <section className="panel">
              <div className="panel-title"><div><h3>Por caja</h3><p>Disponibilidad física.</p></div></div>
              <div className="kardex-drill-list">{byBox.slice(0,12).map((row)=><div key={row.key}><b>{row.key}</b><span>{fmtQty(row.balance)}</span></div>)}</div>
            </section>
            <section className="panel">
              <div className="panel-title"><div><h3>Por embarque</h3><p>Sobrantes por recepción.</p></div></div>
              <div className="kardex-drill-list">{byShipment.slice(0,12).map((row)=><div key={row.key}><b>{row.key}</b><span>{fmtQty(row.balance)}</span></div>)}</div>
            </section>
          </div>
        </>
      )}

      {view === 'initial' && canLoadInitial && (
        <section className="panel kardex-initial-panel">
          <div className="panel-title">
            <div><h3>Carga de Stock Inicial</h3><p>La carga crea movimientos ENTRADA / SALDO_INICIAL. El saldo nunca se edita directamente.</p></div>
            <button className="secondary-button" onClick={downloadInitialTemplate}><Download size={15}/> Descargar plantilla Excel</button>
          </div>

          <div className="kardex-initial-grid">
            <div className="kardex-initial-step">
              <span className="step-number">1</span>
              <div><b>Plantilla WM</b><p>Centro, Almacén, Tipo de almacenamiento, Sección, Ubicación, Caja, Embarque, Material, SC, Cantidad, UM y Fecha de corte.</p></div>
            </div>
            <label className="upload-box kardex-stock-upload">
              {initialLoading ? <RefreshCw className="spin" size={24}/> : <Upload size={24}/>}
              <span><b>2 · Cargar inventario inicial</b><small>Admite .XLSX, .XLS y .CSV.</small></span>
              <input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={onInitialFile}/>
            </label>
          </div>

          {initialRows.length > 0 && (
            <>
              <div className="kardex-initial-kpis">
                <div><b>{initialRows.length}</b><span>Total</span></div>
                <div><b>{initialRows.filter((row)=>row.valid).length}</b><span>Válidos</span></div>
                <div><b>{initialRows.filter((row)=>!row.valid).length}</b><span>Errores</span></div>
                <div><b>{fmtQty(initialRows.filter((row)=>row.valid).reduce((sum,row)=>sum+row.quantity,0))}</b><span>Unidades</span></div>
              </div>
              <div className="table-wrap preview-table">
                <table>
                  <thead><tr><th>Fila</th><th>Centro</th><th>Almacén</th><th>Tipo</th><th>Sección</th><th>Ubicación</th><th>Caja</th><th>Embarque</th><th>Material</th><th>SC</th><th>Descripción</th><th>Cantidad</th><th>UM</th><th>Corte</th><th>Validación</th></tr></thead>
                  <tbody>{initialRows.slice(0,40).map((row)=>(
                    <tr key={row.row}>
                      <td>{row.row}</td><td>{row.center}</td><td>{row.warehouse}</td><td>{row.storageType || '—'}</td><td>{row.storageSection || '—'}</td><td>{row.location}</td>
                      <td>{row.boxNo || '—'}</td><td>{row.shipmentNo || '—'}</td><td><b>{row.materialNo}</b></td><td>{row.stockCode || '—'}</td><td>{row.description}</td>
                      <td>{fmtQty(row.quantity)}</td><td>{row.unit}</td><td>{row.cutOffDate}</td><td>{row.valid?<span className="ok-text"><CheckCircle2 size={14}/> Válido</span>:<span className="error-text">{row.error}</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="kardex-confirm-row">
                <span>{initialFileName}</span>
                <button className="primary-button" disabled={saving || initialRows.some((row)=>!row.valid)} onClick={confirmInitialStock}>
                  {saving?<RefreshCw className="spin" size={15}/>:<CheckCircle2 size={15}/>} Confirmar stock inicial
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {view === 'movements' && (
        <>
          <section className="panel kardex-ledger-summary">
            <div className="panel-title">
              <div>
                <span className="kardex-eyebrow">KARDEX PROFESIONAL · INVENTARIO PERPETUO</span>
                <h3>Libro de Entradas y Salidas</h3>
                <p>Cada movimiento conserva referencia, origen, embarque, caja, ubicación y saldo acumulado por material.</p>
              </div>
              <button className="primary-button" onClick={exportKardexPdf}><FileText size={15}/> Exportar PDF</button>
            </div>
            <div className="kardex-ledger-kpis">
              <div><span>Entradas</span><b className="positive">+{fmtQty(totals.entries)}</b><small>Unidades</small></div>
              <div><span>Salidas</span><b className="negative">−{fmtQty(totals.exits)}</b><small>Unidades</small></div>
              <div><span>Saldo actual</span><b>{fmtQty(totals.balance)}</b><small>Unidades</small></div>
              <div><span>Movimientos</span><b>{movementLedger.length}</b><small>Registros visibles</small></div>
            </div>
          </section>

          <section className="panel kardex-ledger-panel">
            <div className="task-toolbar kardex-toolbar">
              <div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar documento, material, caja, embarque, ubicación…"/></div>
              {isAdmin && !fixedWarehouse && (
                <SearchableSelect
                  value={warehouseFilter}
                  onChange={(value)=>setWarehouseFilter(value||'TODOS')}
                  options={[{value:'TODOS',label:'Todos los almacenes'},...warehouses.map((warehouse)=>({value:warehouse,label:warehouse}))]}
                  placeholder="Buscar almacén…"
                  clearable={false}
                  ariaLabel="Filtrar por almacén"
                />
              )}
            </div>
            <div className="kardex-ledger-guide">
              <span><i className="entry-dot"/> Entrada aumenta stock</span>
              <span><i className="exit-dot"/> Salida reduce stock</span>
              <span><i className="transfer-dot"/> Transferencia conserva saldo total y cambia ubicación</span>
            </div>
            <div className="table-wrap professional-kardex-table">
              <table>
                <thead>
                  <tr>
                    <th>Fecha / Hora</th><th>Documento / Ref.</th><th>Movimiento</th><th>Material</th><th>Stock Code</th>
                    <th>Embarque</th><th>Caja</th><th>Ubicación / Bin</th><th>Entrada</th><th>Salida</th><th>Saldo</th><th>Origen</th>{isAdmin && <th>Acciones</th>}
                  </tr>
                </thead>
                <tbody>{movementLedger.slice(0,1500).map((row)=>(
                  <tr key={row.id}>
                    <td>{fmt(row.created_at)}</td>
                    <td><b>{row.reference_no || '—'}</b></td>
                    <td><span className={row.movement_type==='ENTRADA'?'status-pill success':'status-pill warning'}>{row.movement_type}</span></td>
                    <td><button className="kardex-material-link" onClick={()=>openMaterialHistory(row.material_no,row.warehouse,row.description||'',row.stock_code||'')}><b>{row.material_no}</b><small>{row.description || 'Ver historial del material'}</small></button></td>
                    <td>{row.stock_code || '—'}</td>
                    <td>{row.shipment_no || '—'}</td>
                    <td>{row.box_no || '—'}</td>
                    <td><b>{row.location || '—'}</b><small>{[row.storage_type,row.storage_section].filter(Boolean).join(' · ')}</small></td>
                    <td className="kardex-entry-cell">{row.entry ? '+'+fmtQty(row.entry) : '—'}</td>
                    <td className="kardex-exit-cell">{row.exit ? '−'+fmtQty(row.exit) : '—'}</td>
                    <td><b className="kardex-running-balance">{fmtQty(row.runningBalance)} {row.unit}</b></td>
                    <td>{row.source_type.replaceAll('_',' ')}</td>
                    {isAdmin && <td><button className="icon-button danger-icon" disabled={saving} title="Eliminar movimiento" aria-label={`Eliminar movimiento ${row.reference_no || row.id}`} onClick={()=>deleteMovement(row.id,row.reference_no,row.source_type)}><Trash2 size={14}/></button></td>}
                  </tr>
                ))}</tbody>
              </table>
              {!movementLedger.length && <div className="empty-work"><List size={24}/><b>Sin movimientos</b><p>No hay registros con los filtros actuales.</p></div>}
            </div>
          </section>
        </>
      )}

      {quickActions && (
        <div className="kardex-quick-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setQuickActions(null)}>
          <section className="kardex-quick-sheet">
            <div className="kardex-quick-head">
              <div><small>MATERIAL</small><h3>{quickActions.material_no}</h3><p>{quickActions.description || 'Sin descripción'} · {fmtQty(quickActions.balance)} {quickActions.unit}</p></div>
              <button className="icon-button" onClick={()=>setQuickActions(null)}><X size={18}/></button>
            </div>
            <div className="kardex-quick-grid">
              <button onClick={()=>{const row=quickActions;setQuickActions(null);openMaterialHistory(row.material_no,row.warehouse,row.description||'',row.stock_code||'')}}>
                <History size={21}/><span><b>Historial</b><small>Ver cambios y movimientos</small></span>
              </button>
              {canMove && <button onClick={()=>{const row=quickActions;setQuickActions(null);openAction(row,'withdrawal')}}>
                <MinusCircle size={21}/><span><b>Retiro</b><small>Registrar salida de material</small></span>
              </button>}
              {canMove && <button onClick={()=>{const row=quickActions;setQuickActions(null);openAction(row,'transfer')}}>
                <ArrowRightLeft size={21}/><span><b>Mover</b><small>Cambiar ubicación / Bin</small></span>
              </button>}
            </div>
          </section>
        </div>
      )}

      {historyTarget && (
        <div className="modal-backdrop kardex-history-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setHistoryTarget(null)}>
          <section className="modal kardex-history-modal">
            <div className="modal-head">
              <div>
                <span className="kardex-eyebrow">TRAZABILIDAD POR MATERIAL</span>
                <h2>{historyTarget.materialNo}</h2>
                <p>{historyTarget.description || 'Sin descripción'} · {historyTarget.warehouse}{historyTarget.stockCode ? ` · SC ${historyTarget.stockCode}` : ''}</p>
              </div>
              <button type="button" className="icon-button" onClick={()=>setHistoryTarget(null)}><X size={19}/></button>
            </div>

            <div className="kardex-history-kpis">
              <div><span>Entradas</span><b className="positive">+{fmtQty(historyTotals.entries)}</b></div>
              <div><span>Salidas</span><b className="negative">−{fmtQty(historyTotals.exits)}</b></div>
              <div><span>Saldo</span><b>{fmtQty(historyTotals.balance)}</b></div>
              <div><span>Movimientos</span><b>{historyTotals.movements}</b></div>
            </div>

            <div className="kardex-history-filters">
              <label>Embarque
                <SearchableSelect
                  value={historyShipment}
                  onChange={(value)=>setHistoryShipment(value||'TODOS')}
                  options={[{value:'TODOS',label:'Todos'},...historyShipments.map((value)=>({value,label:value}))]}
                  placeholder="Buscar embarque…"
                  clearable={false}
                  ariaLabel="Filtrar por embarque"
                />
              </label>
              <label>Caja
                <SearchableSelect
                  value={historyBox}
                  onChange={(value)=>setHistoryBox(value||'TODOS')}
                  options={[{value:'TODOS',label:'Todas'},...historyBoxes.map((value)=>({value,label:value}))]}
                  placeholder="Buscar caja…"
                  clearable={false}
                  ariaLabel="Filtrar por caja"
                />
              </label>
            </div>

            {historyLoading ? (
              <div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando historial…</p></div>
            ) : historyError ? (
              <div className="inline-message">{historyError}</div>
            ) : (
              <div className="table-wrap kardex-history-table">
                <table>
                  <thead><tr><th>Fecha / Hora</th><th>Código</th><th>Movimiento</th><th>Origen</th><th>Embarque</th><th>Caja</th><th>Ubicación</th><th>Entrada</th><th>Salida</th><th>Saldo</th><th>Usuario</th><th>Observación</th>{isAdmin && <th>Acciones</th>}</tr></thead>
                  <tbody>{historyLedger.map((row)=>(
                    <tr key={row.movement_id}>
                      <td>{fmt(row.created_at)}</td>
                      <td><b>{row.reference_no || '—'}</b></td>
                      <td><span className={row.movement_type==='ENTRADA'?'status-pill success':'status-pill warning'}>{row.movement_type}</span></td>
                      <td>{row.source_type.replaceAll('_',' ')}</td>
                      <td>{row.shipment_no || '—'}</td>
                      <td>{row.box_no || '—'}</td>
                      <td><b>{row.location || '—'}</b></td>
                      <td className="kardex-entry-cell">{row.entry ? '+'+fmtQty(row.entry) : '—'}</td>
                      <td className="kardex-exit-cell">{row.exit ? '−'+fmtQty(row.exit) : '—'}</td>
                      <td><b>{fmtQty(row.runningBalance)} {row.unit}</b></td>
                      <td><b>{row.created_by_name}</b></td>
                      <td>{row.notes || '—'}</td>
                      {isAdmin && <td><button className="icon-button danger-icon" disabled={saving} title="Eliminar movimiento" aria-label={`Eliminar movimiento ${row.reference_no || row.movement_id}`} onClick={()=>deleteMovement(row.movement_id,row.reference_no,row.source_type)}><Trash2 size={14}/></button></td>}
                    </tr>
                  ))}</tbody>
                </table>
                {!historyLedger.length && <div className="empty-work"><History size={25}/><b>Sin movimientos</b><p>No existen movimientos para los filtros seleccionados.</p></div>}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={()=>setHistoryTarget(null)}>Cerrar historial</button>
            </div>
          </section>
        </div>
      )}

      {showManualEntry && (
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setShowManualEntry(false)}>
          <form className="modal kardex-manual-modal" onSubmit={registerManualEntry}>
            <div className="modal-head">
              <div><h2>Agregar sobrante manual</h2><p>Registra una ENTRADA directamente al Kardex y asígnala a un embarque.</p></div>
              <button type="button" className="icon-button" onClick={()=>setShowManualEntry(false)}><X size={19}/></button>
            </div>
            <div className="form-grid">
              <label>Almacén<input required disabled={Boolean(fixedWarehouse || (!isAdmin && profile?.warehouse))} value={manualForm.warehouse} onChange={(e)=>setManualForm({...manualForm,warehouse:e.target.value})}/></label>
              <label>Centro<input value={manualForm.center} onChange={(e)=>setManualForm({...manualForm,center:e.target.value})} placeholder="Ej. C029"/></label>
              <label>Tipo almacenamiento<input value={manualForm.storage_type} onChange={(e)=>setManualForm({...manualForm,storage_type:e.target.value})}/></label>
              <label>Sección<input value={manualForm.storage_section} onChange={(e)=>setManualForm({...manualForm,storage_section:e.target.value})} placeholder="Ej. INBOUND"/></label>
              <label>N° Embarque<input required value={manualForm.shipment_no} onChange={(e)=>setManualForm({...manualForm,shipment_no:e.target.value})} placeholder="Ej. 7653545725MIA"/></label>
              <label>N° Caja<input value={manualForm.box_no} onChange={(e)=>setManualForm({...manualForm,box_no:e.target.value})} placeholder="Opcional"/></label>
              <label>Material<input required value={manualForm.material_no} onChange={(e)=>setManualForm({...manualForm,material_no:e.target.value})}/></label>
              <label>Stock Code<input value={manualForm.stock_code} onChange={(e)=>setManualForm({...manualForm,stock_code:e.target.value})}/></label>
              <label className="span-2">Descripción<input value={manualForm.description} onChange={(e)=>setManualForm({...manualForm,description:e.target.value})}/></label>
              <label>Ubicación / Bin<input value={manualForm.location} onChange={(e)=>setManualForm({...manualForm,location:e.target.value})} placeholder="Ej. SOB-01"/></label>
              <label>Cantidad<input required type="number" min="0.001" step="any" value={manualForm.quantity} onChange={(e)=>setManualForm({...manualForm,quantity:e.target.value})}/></label>
              <label>UM<input value={manualForm.unit} onChange={(e)=>setManualForm({...manualForm,unit:e.target.value})}/></label>
              <div className="auto-code-note"><b>Código automático</b><span>Se generará un código ING-AAAAMMDD-###### al registrar.</span></div>
              <label className="span-2">Observación<textarea rows={3} value={manualForm.notes} onChange={(e)=>setManualForm({...manualForm,notes:e.target.value})}/></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setShowManualEntry(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<RefreshCw className="spin" size={15}/>:<Plus size={15}/>} Registrar entrada</button></div>
          </form>
        </div>
      )}

      {selected && selectedAction && (
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setSelected(null)}>
          <form className="modal kardex-withdrawal-modal" onSubmit={registerMovement}>
            <div className="modal-head">
              <div><h2>{selectedAction==='withdrawal'?'Registrar salida de sobrante':'Transferir / reubicar sobrante'}</h2><p>{selected.material_no} · {selected.warehouse} · {selected.box_no || 'Sin caja'}</p></div>
              <button type="button" className="icon-button" onClick={()=>setSelected(null)}><X size={19}/></button>
            </div>
            <div className="surplus-withdrawal-summary">
              <span>Disponible</span><b>{fmtQty(selected.balance)} {selected.unit}</b>
              <small>{selected.description || ''} · {selected.location || 'Sin ubicación'} · {selected.shipment_no || 'Sin embarque'}</small>
            </div>
            <div className="form-grid">
              <label>Cantidad<input autoFocus required type="number" min="0.001" max={selected.balance} step="any" value={quantity} onChange={(e)=>setQuantity(e.target.value)}/></label>
              <div className="auto-code-note"><b>Código automático</b><span>{selectedAction==='withdrawal'?'Se generará RET-AAAAMMDD-######':'Se generará TRF-AAAAMMDD-######'}</span></div>
              {selectedAction==='transfer' && <label className="span-2">Nueva ubicación / Bin<input required value={destinationLocation} onChange={(e)=>setDestinationLocation(e.target.value)} placeholder="Ej. SOB-04"/></label>}
              <label className="span-2">Motivo / observación<textarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder={selectedAction==='withdrawal'?'Indica para qué se retira el sobrante.':'Indica el motivo de la reubicación.'}/></label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={()=>setSelected(null)}>Cancelar</button>
              <button className="primary-button" disabled={saving}>{saving?<RefreshCw className="spin" size={15}/>:selectedAction==='withdrawal'?<MinusCircle size={15}/>:<ArrowRightLeft size={15}/>} {selectedAction==='withdrawal'?'Registrar salida':'Registrar transferencia'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
