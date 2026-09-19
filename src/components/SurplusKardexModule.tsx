import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LayoutDashboard,
  List,
  MinusCircle,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

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

export function SurplusKardexModule({ userId, profile, fixedWarehouse }: Props) {
  const [view, setView] = useState<KardexView>('dashboard')
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState(fixedWarehouse || profile?.warehouse || 'TODOS')
  const [selected, setSelected] = useState<BalanceRow | null>(null)
  const [selectedAction, setSelectedAction] = useState<'withdrawal' | 'transfer' | null>(null)
  const [quantity, setQuantity] = useState('')
  const [reference, setReference] = useState('')
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
    reference_no: '',
    notes: '',
  })

  const [initialFileName, setInitialFileName] = useState('')
  const [initialRows, setInitialRows] = useState<InitialRow[]>([])
  const [initialLoading, setInitialLoading] = useState(false)

  const isAdmin = profile?.role === 'ADMINISTRADOR'
  const canMove = profile?.role !== 'SUPERVISOR'
  const canLoadInitial = profile?.role === 'COORDINADOR' || profile?.role === 'ADMINISTRADOR'
  const scopedWarehouse = fixedWarehouse || (!isAdmin ? profile?.warehouse || '' : '')

  async function reload() {
    setLoading(true)
    setMessage('')
    let query = supabase
      .from('surplus_kardex_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10000)

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
    if (!q) return balances
    return balances.filter((row) =>
      [
        row.warehouse,row.center,row.material_no,row.stock_code,row.description,row.location,
        row.box_no,row.shipment_no,row.storage_type,row.storage_section,row.stock_type,
      ].some((value) => String(value ?? '').toLowerCase().includes(q))
    )
  }, [balances, q])

  const visibleMovements = useMemo(() => {
    if (!q) return activeWarehouseMovements
    return activeWarehouseMovements.filter((row) =>
      [
        row.warehouse,row.center,row.material_no,row.stock_code,row.description,row.location,
        row.box_no,row.shipment_no,row.reference_no,row.source_type,row.storage_type,row.storage_section,
      ].some((value) => String(value ?? '').toLowerCase().includes(q))
    )
  }, [activeWarehouseMovements, q])

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
    setReference('')
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
          p_reference_no: reference.trim() || null,
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
          p_reference_no: reference.trim() || null,
          p_notes: notes.trim() || null,
        }

    const { error } = await supabase.rpc(rpc, args)
    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setSelected(null)
    setSelectedAction(null)
    setMessage(selectedAction === 'withdrawal'
      ? 'Salida registrada correctamente en el Kardex.'
      : 'Transferencia registrada. El saldo total no cambia; solo cambia la ubicación.')
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
      reference_no: '',
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
    const {error}=await supabase.rpc('register_surplus_manual_entry',{
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
      p_reference_no:manualForm.reference_no.trim()||null,
      p_notes:manualForm.notes.trim()||null,
    })
    setSaving(false)
    if(error){setMessage(error.message);return}
    setShowManualEntry(false)
    setMessage(`Ingreso manual registrado para el embarque ${manualForm.shipment_no.trim().toUpperCase()}.`)
    await reload()
  }

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

  function exportKardex() {
    downloadCsv('KOMTROL_Kardex_Sobrantes.csv', [
      ['CENTRO','ALMACEN','TIPO_ALMACENAMIENTO','SECCION','FECHA','MOVIMIENTO','ORIGEN','REFERENCIA','CAJA','EMBARQUE','MATERIAL','STOCK_CODE','DESCRIPCION','UBICACION','TIPO_STOCK','CANTIDAD','UM','OBSERVACION'],
      ...visibleMovements.map((row) => [
        row.center,row.warehouse,row.storage_type,row.storage_section,fmt(row.created_at),row.movement_type,row.source_type,row.reference_no,
        row.box_no,row.shipment_no,row.material_no,row.stock_code,row.description,row.location,row.stock_type,row.quantity,row.unit,row.notes,
      ]),
    ])
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
            <p>Modelo WM: Centro → Almacén → Tipo → Sección → Ubicación/Bin → Caja → Embarque → Material.</p>
          </div>
          <div className="button-row">
            {canMove && <button className="primary-button" onClick={openManualEntry}><Plus size={15}/> Agregar sobrante</button>}
            <button className="secondary-button" onClick={exportKardex}><Download size={15}/> Exportar</button>
            <button className="icon-button" onClick={reload}><RefreshCw size={17}/></button>
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
              <div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar material, SC, caja, embarque, ubicación…"/></div>
              {isAdmin && !fixedWarehouse && (
                <select value={warehouseFilter} onChange={(e)=>setWarehouseFilter(e.target.value)}>
                  <option value="TODOS">Todos los almacenes</option>
                  {warehouses.map((warehouse)=><option key={warehouse}>{warehouse}</option>)}
                </select>
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
                    <td><b>{row.material_no}</b><small>{row.stock_type}</small></td>
                    <td>{row.stock_code || '—'}</td><td>{row.description || '—'}</td><td>{row.center || '—'}</td><td>{row.warehouse}</td>
                    <td><b>{row.location || '—'}</b><small>{[row.storage_type,row.storage_section].filter(Boolean).join(' · ')}</small></td>
                    <td>{row.box_no || '—'}</td><td>{row.shipment_no || '—'}</td>
                    <td>{fmtQty(row.initial)}</td><td className="kardex-positive">+{fmtQty(row.entries)}</td><td className="kardex-negative">−{fmtQty(row.exits)}</td>
                    <td><b className="kardex-balance-number">{fmtQty(row.balance)} {row.unit}</b></td>
                    <td>{canMove && <div className="row-actions"><button className="secondary-button" onClick={()=>openAction(row,'withdrawal')}><MinusCircle size={14}/> Retiro</button><button className="secondary-button" onClick={()=>openAction(row,'transfer')}><ArrowRightLeft size={14}/> Mover</button></div>}</td>
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
        <section className="panel">
          <div className="panel-title"><div><h3>Movimientos</h3><p>Historial completo de saldo inicial, ingresos, retiros, ajustes y transferencias.</p></div></div>
          <div className="task-toolbar kardex-toolbar">
            <div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar movimiento, caja, embarque, material…"/></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Centro</th><th>Almacén</th><th>Movimiento</th><th>Origen</th><th>Referencia</th><th>Caja</th><th>Embarque</th><th>Material</th><th>Ubicación</th><th>Cantidad</th><th>Saldo/Tipo</th></tr></thead>
              <tbody>{visibleMovements.slice(0,1000).map((row)=>(
                <tr key={row.id}>
                  <td>{fmt(row.created_at)}</td><td>{row.center || '—'}</td><td>{row.warehouse}</td>
                  <td><span className={row.movement_type==='ENTRADA'?'status-pill success':'status-pill warning'}>{row.movement_type}</span></td>
                  <td>{row.source_type.replaceAll('_',' ')}</td><td>{row.reference_no || '—'}</td><td>{row.box_no || '—'}</td><td>{row.shipment_no || '—'}</td>
                  <td><b>{row.material_no}</b><small>{row.description || ''}</small></td><td>{row.location || '—'}</td>
                  <td><b>{row.movement_type==='ENTRADA'?'+':'−'}{fmtQty(Number(row.quantity))} {row.unit}</b></td><td>{row.stock_type}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
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
              <label>Referencia<input value={manualForm.reference_no} onChange={(e)=>setManualForm({...manualForm,reference_no:e.target.value})} placeholder="Ej. AJU-001"/></label>
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
              <label>Referencia / vale<input value={reference} onChange={(e)=>setReference(e.target.value)} placeholder={selectedAction==='withdrawal'?'Ej. RET-001':'Ej. TRF-001'}/></label>
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
