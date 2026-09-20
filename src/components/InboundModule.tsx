import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  FileSpreadsheet,
  Mail,
  PackagePlus,
  Plus,
  RefreshCw,
  TrendingUp,
  ArrowRight,
  Lock,
  Unlock,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { exportRowsToExcel, exportRowsToPdfPortrait } from '../lib/exportUtils'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'
type Mode = 'dashboard' | 'incidents' | 'boxes'

type Profile = {
  user_id: string
  full_name: string
  role: Role
  warehouse?: string | null
  project?: string | null
  group_name?: string | null
  shift_name?: string | null
}

type Incident = {
  id: string
  incident_no: string
  incident_type: 'FALTANTE' | 'SOBRANTE' | 'DANADO' | 'DIFERENCIA' | 'SIN_DOCUMENTACION' | 'OTRO'
  status: 'ABIERTO' | 'EN_REVISION' | 'NOTIFICADO' | 'CERRADO'
  guide_no: string | null
  document_no: string | null
  purchase_order: string | null
  material_no: string | null
  description: string | null
  stock_code: string | null
  location: string | null
  qty_expected: number | null
  qty_received: number | null
  notes: string | null
  warehouse: string | null
  project: string | null
  group_name: string | null
  shift_name: string | null
  operation_area: string
  assigned_to: string | null
  created_by: string
  created_at: string
  updated_at: string
  inbound_box_id?: string | null
}

type BoxItem = {
  id: string
  box_id: string
  incident_id: string | null
  material_no: string | null
  stock_code: string | null
  description: string | null
  quantity: number
  unit: string
  location: string | null
  notes: string | null
}

type InboundBox = {
  id: string
  box_no: string
  warehouse: string
  shipment_no: string | null
  title: string | null
  status: 'ABIERTA' | 'CERRADA' | 'DESPACHADA' | 'ANULADA'
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  opened_at?: string | null
  closed_at?: string | null
  closed_by?: string | null
  inbound_box_items?: BoxItem[]
}

type Props = {
  mode: Mode
  userId: string
  profile: Profile | null
  onNavigate?: (tab: string) => void
}

const WAREHOUSE = 'CALLAO'
const PROJECT = 'INBOUND CALLAO'
const GROUP = 'INBOUND'

const emptyIncident = {
  incident_type: 'SOBRANTE' as Incident['incident_type'],
  guide_no: '',
  document_no: '',
  purchase_order: '',
  material_no: '',
  description: '',
  qty_expected: '',
  qty_received: '',
  notes: '',
  assigned_to: '',
}

function incidentNumber() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `INB-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2,5).toUpperCase()}`
}

function fmt(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",;\n]/.test(text) ? '"' + text.replaceAll('"','""') + '"' : text
}

function downloadCsv(name: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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

function exportBoxPdf(box: InboundBox) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const totalQty = (box.inbound_box_items ?? []).reduce((sum,item)=>sum+Number(item.quantity || 0),0)
  const generated = new Intl.DateTimeFormat('es-PE', { dateStyle:'medium', timeStyle:'short' }).format(new Date())

  doc.setFillColor(31,64,84)
  doc.rect(0,0,pageWidth,29,'F')
  doc.setTextColor(255,255,255)
  doc.setFont('helvetica','bold')
  doc.setFontSize(15)
  doc.text('KOMTROL · CAJA DE SOBRANTES INBOUND', 10, 11)
  doc.setFont('helvetica','normal')
  doc.setFontSize(8)
  doc.text(`Caja: ${box.box_no} · Embarque: ${box.shipment_no || 'SIN EMBARQUE'} · Almacén: ${box.warehouse}`,10,18)
  doc.text(`Estado: ${box.status} · Apertura: ${fmt(box.opened_at || box.created_at)}`,10,24)
  doc.text(`Generado: ${generated}`,pageWidth-10,18,{align:'right'})

  const cards = [
    ['ÍTEMS', String(box.inbound_box_items?.length ?? 0)],
    ['UNIDADES', totalQty.toLocaleString('es-PE',{maximumFractionDigits:3})],
    ['ESTADO', box.status],
  ]
  cards.forEach((card,index)=>{
    const x=10+index*58
    doc.setDrawColor(219,232,240)
    doc.setFillColor(249,252,255)
    doc.roundedRect(x,34,52,15,2,2,'FD')
    doc.setFont('helvetica','bold')
    doc.setFontSize(6.5)
    doc.setTextColor(99,125,143)
    doc.text(card[0],x+4,40)
    doc.setFontSize(9)
    doc.setTextColor(31,64,84)
    doc.text(card[1],x+4,46)
  })

  if (box.title || box.notes) {
    doc.setFont('helvetica','normal')
    doc.setFontSize(7)
    doc.setTextColor(90,105,115)
    const detail=[box.title,box.notes].filter(Boolean).join(' · ')
    const lines=doc.splitTextToSize(detail,pageWidth-20)
    doc.text(lines,10,54)
  }

  autoTable(doc, {
    startY: box.title || box.notes ? 66 : 55,
    head: [['N°','MATERIAL','STOCK CODE','DESCRIPCIÓN','CANT.','UM','UBICACIÓN / BIN','OBSERVACIÓN']],
    body: (box.inbound_box_items ?? []).map((item,index) => [
      index + 1,
      item.material_no || '—',
      item.stock_code || '—',
      item.description || '—',
      Number(item.quantity).toLocaleString('es-PE',{maximumFractionDigits:3}),
      item.unit || 'UND',
      item.location || '—',
      item.notes || '',
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 5.8,
      cellPadding: 1.15,
      lineColor: [219,232,240],
      lineWidth: 0.12,
      textColor:[31,64,84],
      valign:'middle',
      overflow:'linebreak',
    },
    headStyles: {
      fillColor: [31,64,84],
      textColor: [255,255,255],
      fontStyle: 'bold',
      fontSize:5.8,
      halign:'center',
    },
    alternateRowStyles:{fillColor:[248,252,254]},
    columnStyles: {
      0:{cellWidth:8,halign:'center'},
      1:{cellWidth:23},
      2:{cellWidth:20},
      3:{cellWidth:50},
      4:{cellWidth:14,halign:'right'},
      5:{cellWidth:10,halign:'center'},
      6:{cellWidth:27},
      7:{cellWidth:34},
    },
    margin:{left:10,right:10,bottom:14},
  })

  const pages=doc.getNumberOfPages()
  for(let page=1;page<=pages;page++){
    doc.setPage(page)
    doc.setDrawColor(219,232,240)
    doc.line(10,pageHeight-11,pageWidth-10,pageHeight-11)
    doc.setFont('helvetica','normal')
    doc.setFontSize(6.5)
    doc.setTextColor(105,125,137)
    doc.text('KOMTROL · Control de sobrantes por embarque',10,pageHeight-6)
    doc.text(`Página ${page} de ${pages}`,pageWidth-10,pageHeight-6,{align:'right'})
  }

  savePdfBlob(doc, `KOMTROL_${box.box_no}_${box.shipment_no || 'SIN_EMBARQUE'}.pdf`)
}

export function InboundModule({ mode, userId, profile, onNavigate }: Props) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [boxes, setBoxes] = useState<InboundBox[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null)
  const [incidentForm, setIncidentForm] = useState(emptyIncident)
  const [selectedSurplus, setSelectedSurplus] = useState<string[]>([])
  const [selectedBox, setSelectedBox] = useState<InboundBox | null>(null)
  const [boxDraft, setBoxDraft] = useState<InboundBox | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [kardexBalance, setKardexBalance] = useState(0)
  const [showOpenBox, setShowOpenBox] = useState(false)
  const [newBoxShipment, setNewBoxShipment] = useState('')
  const [newBoxNotes, setNewBoxNotes] = useState('')
  const readOnly = profile?.role === 'SUPERVISOR'
  const canOperateBoxes = profile?.role !== 'SUPERVISOR'

  async function reload() {
    setLoading(true)
    setMessage('')
    const [incidentRes, boxRes, profileRes, kardexRes] = await Promise.all([
      supabase
        .from('incidents')
        .select('*')
        .eq('warehouse', WAREHOUSE)
        .eq('operation_area', 'INBOUND')
        .order('created_at', { ascending:false })
        .limit(2000),
      supabase
        .from('inbound_boxes')
        .select('*, inbound_box_items(*)')
        .eq('warehouse', WAREHOUSE)
        .order('created_at', { ascending:false })
        .limit(1000),
      supabase
        .from('user_profiles')
        .select('user_id,full_name,role,warehouse,project,group_name,shift_name')
        .eq('active', true)
        .eq('warehouse', WAREHOUSE)
        .order('full_name'),
      supabase
        .from('surplus_kardex_movements')
        .select('movement_type,quantity')
        .eq('warehouse', WAREHOUSE)
        .limit(10000),
    ])
    if (incidentRes.error || boxRes.error || profileRes.error || kardexRes.error) {
      setMessage(incidentRes.error?.message || boxRes.error?.message || profileRes.error?.message || kardexRes.error?.message || 'No se pudo cargar Inbound.')
    }
    setIncidents((incidentRes.data ?? []) as Incident[])
    setBoxes((boxRes.data ?? []) as InboundBox[])
    setProfiles((profileRes.data ?? []) as Profile[])
    setKardexBalance((kardexRes.data ?? []).reduce((sum,row)=>sum+(row.movement_type==='ENTRADA'?Number(row.quantity||0):-Number(row.quantity||0)),0))
    setLoading(false)
  }

  useEffect(() => { reload() }, [userId])

  const visibleIncidents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return incidents
    return incidents.filter((row) =>
      [row.incident_no,row.incident_type,row.guide_no,row.purchase_order,row.material_no,row.description,row.status]
        .some((value) => String(value ?? '').toLowerCase().includes(q))
    )
  }, [incidents, search])

  const counts = useMemo(() => ({
    total: incidents.length,
    open: incidents.filter((x) => x.status !== 'CERRADO').length,
    surplus: incidents.filter((x) => x.incident_type === 'SOBRANTE').length,
    faltante: incidents.filter((x) => x.incident_type === 'FALTANTE').length,
    damaged: incidents.filter((x) => x.incident_type === 'DANADO').length,
    notified: incidents.filter((x) => x.status === 'NOTIFICADO').length,
    boxes: boxes.length,
    openBoxes: boxes.filter((x) => x.status === 'ABIERTA').length,
    closedBoxes: boxes.filter((x) => x.status === 'CERRADA').length,
  }), [incidents, boxes])

  const shipmentBars = useMemo(() => {
    const map = new Map<string, number>()
    incidents.filter((x)=>x.incident_type==='SOBRANTE').forEach((row)=>{
      const shipment=(row.document_no || row.guide_no || 'SIN-EMBARQUE').toUpperCase()
      const diff=Math.max(Number(row.qty_received||0)-Number(row.qty_expected||0),0)
      map.set(shipment,(map.get(shipment)||0)+diff)
    })
    return Array.from(map.entries())
      .map(([shipment,quantity])=>({shipment,quantity}))
      .sort((a,b)=>b.quantity-a.quantity)
      .slice(0,5)
  },[incidents])

  const trendData = useMemo(() => {
    const days = Array.from({length:7},(_,index)=>{
      const d=new Date()
      d.setHours(0,0,0,0)
      d.setDate(d.getDate()-(6-index))
      return {key:d.toISOString().slice(0,10),label:new Intl.DateTimeFormat('es-PE',{weekday:'short'}).format(d).replace('.',''),value:0}
    })
    const byKey=new Map(days.map((day)=>[day.key,day]))
    incidents.forEach((row)=>{
      const key=new Date(row.created_at).toISOString().slice(0,10)
      const target=byKey.get(key)
      if(target) target.value+=1
    })
    return days
  },[incidents])

  const maxShipment = Math.max(1,...shipmentBars.map((row)=>row.quantity))
  const maxTrend = Math.max(1,...trendData.map((row)=>row.value))


  const profileName = (id?: string | null) =>
    profiles.find((x) => x.user_id === id)?.full_name ?? (id ? 'Usuario' : 'Sin asignar')

  function openNewIncident() {
    setEditingIncident(null)
    setIncidentForm(emptyIncident)
    setShowIncidentForm(true)
  }

  function openEditIncident(row: Incident) {
    setEditingIncident(row)
    setIncidentForm({
      incident_type: row.incident_type,
      guide_no: row.guide_no || '',
      document_no: row.document_no || '',
      purchase_order: row.purchase_order || '',
      material_no: row.material_no || '',
      description: row.description || '',
      qty_expected: row.qty_expected == null ? '' : String(row.qty_expected),
      qty_received: row.qty_received == null ? '' : String(row.qty_received),
      notes: row.notes || '',
      assigned_to: row.assigned_to || '',
    })
    setShowIncidentForm(true)
  }

  async function saveIncident(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const payload = {
      incident_type: incidentForm.incident_type,
      guide_no: incidentForm.guide_no.trim() || null,
      document_no: incidentForm.document_no.trim() || null,
      purchase_order: incidentForm.purchase_order.trim() || null,
      material_no: incidentForm.material_no.trim() || null,
      description: incidentForm.description.trim() || null,
      qty_expected: incidentForm.qty_expected ? Number(incidentForm.qty_expected) : null,
      qty_received: incidentForm.qty_received ? Number(incidentForm.qty_received) : null,
      notes: incidentForm.notes.trim() || null,
      assigned_to: incidentForm.assigned_to || null,
      warehouse: WAREHOUSE,
      project: PROJECT,
      group_name: GROUP,
      shift_name: profile?.shift_name || null,
      operation_area: 'INBOUND',
      updated_at: new Date().toISOString(),
    }

    if (editingIncident) {
      const { error } = await supabase.from('incidents').update(payload).eq('id', editingIncident.id)
      if (error) {
        setSaving(false)
        setMessage(error.message)
        return
      }
      setMessage('Incidencia actualizada.')
    } else {
      const { error } = await supabase.from('incidents').insert({
        ...payload,
        incident_no: incidentNumber(),
        status: 'ABIERTO',
        created_by: userId,
      })
      if (error) {
        setSaving(false)
        setMessage(error.message)
        return
      }
      setMessage('Incidencia Inbound registrada.')
    }

    setSaving(false)
    setShowIncidentForm(false)
    setEditingIncident(null)
    setIncidentForm(emptyIncident)
    await reload()
  }

  async function updateIncidentStatus(row: Incident, status: Incident['status']) {
    const { error } = await supabase
      .from('incidents')
      .update({ status, updated_at:new Date().toISOString() })
      .eq('id', row.id)
    if (error) setMessage(error.message)
    else await reload()
  }

  async function deleteIncident(row: Incident) {
    if (!window.confirm(`¿Eliminar ${row.incident_no}? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('incidents').delete().eq('id', row.id)
    if (error) setMessage(error.message)
    else {
      setSelectedSurplus((ids) => ids.filter((id) => id !== row.id))
      setMessage('Incidencia eliminada.')
      await reload()
    }
  }

  async function sendEmail(row: Incident) {
    setSendingId(row.id)
    const { data, error } = await supabase.functions.invoke('send-outlook-notification', {
      body:{ incidentId:row.id },
    })
    setSendingId(null)
    if (error || !data?.ok) {
      setMessage(data?.error || error?.message || 'No se pudo enviar el correo. Revisa la configuración Outlook.')
    } else {
      setMessage('Correo enviado y trazabilidad registrada.')
    }
    await reload()
  }

  const incidentExportRows = visibleIncidents.map((x) => ({
    incident_no: x.incident_no,
    incident_type: x.incident_type,
    status: x.status,
    guide_no: x.guide_no || '',
    purchase_order: x.purchase_order || '',
    material_no: x.material_no || '',
    stock_code: x.stock_code || '',
    description: x.description || '',
    qty_expected: x.qty_expected ?? '',
    qty_received: x.qty_received ?? '',
    difference: x.qty_expected != null && x.qty_received != null ? Number(x.qty_received) - Number(x.qty_expected) : '',
    responsible: profileName(x.assigned_to),
    created_at: fmt(x.created_at),
  }))

  const incidentExcelColumns = [
    { header:'INCIDENCIA', key:'incident_no', width:18 },
    { header:'TIPO', key:'incident_type', width:16 },
    { header:'ESTADO', key:'status', width:16 },
    { header:'GUÍA', key:'guide_no', width:20 },
    { header:'OC', key:'purchase_order', width:18 },
    { header:'MATERIAL', key:'material_no', width:18 },
    { header:'STOCK CODE', key:'stock_code', width:16 },
    { header:'DESCRIPCIÓN', key:'description', width:38 },
    { header:'ESPERADO', key:'qty_expected', width:12 },
    { header:'RECIBIDO', key:'qty_received', width:12 },
    { header:'DIFERENCIA', key:'difference', width:12 },
    { header:'RESPONSABLE', key:'responsible', width:24 },
    { header:'FECHA', key:'created_at', width:18 },
  ]

  const incidentPdfColumns = [
    { header:'INCIDENCIA', key:'incident_no' },
    { header:'TIPO', key:'incident_type' },
    { header:'ESTADO', key:'status' },
    { header:'GUÍA / OC', key:'guide_no' },
    { header:'MATERIAL', key:'material_no' },
    { header:'SC', key:'stock_code' },
    { header:'DIF.', key:'difference' },
    { header:'RESP.', key:'responsible' },
    { header:'FECHA', key:'created_at' },
  ]

  function exportIncidentsExcel() {
    exportRowsToExcel(
      'KOMTROL_Inbound_Callao_Incidencias',
      'Incidencias',
      incidentExcelColumns,
      incidentExportRows,
      [['Almacén', WAREHOUSE], ['Registros', incidentExportRows.length]]
    )
  }

  function exportIncidentsPdf() {
    exportRowsToPdfPortrait(
      'KOMTROL_Inbound_Callao_Incidencias',
      'KOMTROL · Incidencias Inbound Callao',
      incidentPdfColumns,
      incidentExportRows,
      { subtitle: `Almacén: ${WAREHOUSE}`, summary: [['Registros', incidentExportRows.length]] }
    )
  }

  function toggleSurplus(id: string) {
    setSelectedSurplus((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev,id])
  }

  async function createBoxFromSurplus() {
    setMessage('Las incidencias SOBRANTE ya crean o alimentan automáticamente la caja abierta de su embarque.')
    setSelectedSurplus([])
    await reload()
  }

  async function openNewBox(event: FormEvent) {
    event.preventDefault()
    const shipment=newBoxShipment.trim().toUpperCase()
    if(!shipment){ setMessage('Ingresa el N° de embarque.'); return }
    setSaving(true)
    const {error}=await supabase.rpc('open_inbound_surplus_box',{
      p_warehouse:WAREHOUSE,
      p_shipment_no:shipment,
      p_title:`Sobrantes Inbound · Embarque ${shipment}`,
      p_notes:newBoxNotes.trim()||null,
    })
    setSaving(false)
    if(error){ setMessage(error.message); return }
    setShowOpenBox(false)
    setNewBoxShipment('')
    setNewBoxNotes('')
    setMessage(`Caja abierta para el embarque ${shipment}. Los próximos sobrantes se agregarán automáticamente.`)
    await reload()
  }

  async function closeBox(box: InboundBox) {
    if(!window.confirm(`¿Cerrar la caja ${box.box_no}? Al confirmar, todos sus sobrantes ingresarán al Kardex.`)) return
    setSaving(true)
    const {data,error}=await supabase.rpc('close_inbound_surplus_box',{p_box_id:box.id,p_notes:box.notes||null})
    setSaving(false)
    if(error){ setMessage(error.message); return }
    setMessage(`Caja ${box.box_no} cerrada. ${Number(data?.movements_created||0)} movimiento(s) ingresaron al Kardex.`)
    setSelectedBox(null)
    setBoxDraft(null)
    await reload()
  }

  async function reopenBox(box: InboundBox) {
    if(profile?.role!=='ADMINISTRADOR') return
    if(!window.confirm(`¿Reabrir ${box.box_no}? Se revertirán del Kardex los ingresos creados por el cierre.`)) return
    setSaving(true)
    const {error}=await supabase.rpc('reopen_inbound_surplus_box',{p_box_id:box.id})
    setSaving(false)
    if(error){ setMessage(error.message); return }
    setMessage(`Caja ${box.box_no} reabierta.`)
    setSelectedBox(null)
    setBoxDraft(null)
    await reload()
  }


  function openBox(box: InboundBox) {
    const clone = JSON.parse(JSON.stringify(box)) as InboundBox
    setSelectedBox(box)
    setBoxDraft(clone)
  }

  async function saveBox() {
    if (!boxDraft) return
    if (boxDraft.status !== 'ABIERTA') {
      setMessage('Las cajas cerradas son de solo lectura. Solo el Administrador puede reabrirlas.')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('inbound_boxes')
      .update({
        title: boxDraft.title,
        notes: boxDraft.notes,
        updated_at:new Date().toISOString(),
      })
      .eq('id', boxDraft.id)

    if (!error) {
      for (const item of boxDraft.inbound_box_items ?? []) {
        const { error:itemError } = await supabase
          .from('inbound_box_items')
          .update({
            stock_code:item.stock_code,
            quantity:Number(item.quantity || 0),
            unit:item.unit,
            location:item.location,
            notes:item.notes,
          })
          .eq('id', item.id)
        if (itemError) {
          setMessage(itemError.message)
          setSaving(false)
          return
        }
      }
    }

    setSaving(false)
    if (error) setMessage(error.message)
    else {
      setMessage('Caja actualizada.')
      setSelectedBox(null)
      setBoxDraft(null)
      await reload()
    }
  }

  async function deleteBox(box: InboundBox) {
    if (box.status !== 'ABIERTA') {
      setMessage('No se puede eliminar una caja cerrada. El Administrador puede reabrirla primero.')
      return
    }
    if (!window.confirm(`¿Eliminar la caja ${box.box_no} y todo su detalle?`)) return
    const { error } = await supabase.from('inbound_boxes').delete().eq('id', box.id)
    if (error) setMessage(error.message)
    else {
      setMessage('Caja eliminada.')
      await reload()
    }
  }

  async function deleteBoxItem(itemId: string) {
    const { error } = await supabase.from('inbound_box_items').delete().eq('id', itemId)
    if (error) {
      setMessage(error.message)
      return
    }
    setBoxDraft((prev) => prev ? {
      ...prev,
      inbound_box_items:(prev.inbound_box_items ?? []).filter((x) => x.id !== itemId),
    } : prev)
  }

  function exportBoxExcel(box: InboundBox) {
    const rows=(box.inbound_box_items ?? []).map((item)=>({
      box_no:box.box_no,
      shipment_no:box.shipment_no || '',
      status:box.status,
      material_no:item.material_no || '',
      stock_code:item.stock_code || '',
      description:item.description || '',
      quantity:item.quantity,
      unit:item.unit || 'UND',
      location:item.location || '',
      notes:item.notes || '',
    }))
    exportRowsToExcel(
      `KOMTROL_${box.box_no}_${box.shipment_no || 'SIN_EMBARQUE'}`,
      'Caja Inbound',
      [
        {header:'CAJA',key:'box_no',width:18},
        {header:'EMBARQUE',key:'shipment_no',width:22},
        {header:'ESTADO',key:'status',width:14},
        {header:'MATERIAL',key:'material_no',width:18},
        {header:'STOCK CODE',key:'stock_code',width:16},
        {header:'DESCRIPCIÓN',key:'description',width:38},
        {header:'CANTIDAD',key:'quantity',width:12},
        {header:'UM',key:'unit',width:8},
        {header:'UBICACIÓN',key:'location',width:18},
        {header:'OBSERVACIÓN',key:'notes',width:30},
      ],
      rows,
      [['Caja',box.box_no],['Embarque',box.shipment_no || 'Sin embarque'],['Ítems',rows.length]]
    )
  }

  if (loading) {
    return <section className="panel"><div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando Inbound Callao…</p></div></section>
  }

  if (mode === 'dashboard') {
    const donutTotal=Math.max(1,counts.surplus+counts.faltante+counts.damaged)
    const surplusDeg=(counts.surplus/donutTotal)*360
    const faltanteDeg=((counts.surplus+counts.faltante)/donutTotal)*360
    const trendPoints=trendData.map((row,index)=>{
      const x=8+(index*(84/Math.max(trendData.length-1,1)))
      const y=78-((row.value/maxTrend)*62)
      return `${x},${y}`
    }).join(' ')

    return (
      <div className="inbound-module inbound-figma-dashboard">


        <div className="dashboard-inline-actions">
          <span>CALLAO · INBOUND · actualización en tiempo real</span>
          <button className="icon-button" onClick={reload} title="Actualizar dashboard"><RefreshCw size={17}/></button>
        </div>

        {message && <div className="inline-message">{message}</div>}

        <div className="inbound-figma-kpis">
          <button type="button" className="inbound-kpi-link" onClick={()=>onNavigate?.('inbound-incidencias')}>
            <BarChart3/><span><small>INCIDENCIAS</small><b>{counts.total}</b><em>Últimos registros</em></span><ArrowRight className="indicator-link-arrow" size={17}/>
          </button>
          <button type="button" className="inbound-kpi-link warning" onClick={()=>onNavigate?.('inbound-incidencias')}>
            <AlertTriangle/><span><small>PENDIENTES</small><b>{counts.open}</b><em>Requieren gestión</em></span><ArrowRight className="indicator-link-arrow" size={17}/>
          </button>
          <button type="button" className="inbound-kpi-link success" onClick={()=>onNavigate?.('inbound-incidencias')}>
            <PackagePlus/><span><small>SOBRANTES</small><b>{counts.surplus}</b><em>Detectados</em></span><ArrowRight className="indicator-link-arrow" size={17}/>
          </button>
          <button type="button" className="inbound-kpi-link purple" onClick={()=>onNavigate?.('inbound-cajas')}>
            <Boxes/><span><small>CAJAS ABIERTAS</small><b>{counts.openBoxes}</b><em>{counts.closedBoxes} cerradas</em></span><ArrowRight className="indicator-link-arrow" size={17}/>
          </button>
          <button type="button" className="inbound-kpi-link" onClick={()=>onNavigate?.('inbound-kardex')}>
            <TrendingUp/><span><small>SALDO KARDEX</small><b>{kardexBalance.toLocaleString('es-PE',{maximumFractionDigits:3})}</b><em>UND disponibles</em></span><ArrowRight className="indicator-link-arrow" size={17}/>
          </button>
        </div>

        <div className="inbound-chart-grid">
          <section className="panel inbound-chart-card incident-type-chart indicator-clickable" role="button" tabIndex={0} onClick={()=>onNavigate?.('inbound-incidencias')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onNavigate?.('inbound-incidencias')}}}>
            <div className="chart-heading"><div><h3>Incidencias por tipo</h3><p>Distribución actual</p></div><span className="indicator-open-hint">Ver detalle <ArrowRight size={14}/></span></div>
            <div className="donut-layout">
              <div className="inbound-donut" style={{background:`conic-gradient(#33439a 0deg ${surplusDeg}deg,#5570d8 ${surplusDeg}deg ${faltanteDeg}deg,#9ca9ee ${faltanteDeg}deg 360deg)`}}>
                <div><b>{counts.surplus+counts.faltante+counts.damaged}</b><span>Total</span></div>
              </div>
              <div className="chart-legend">
                <div><i className="green"/><span>Sobrantes</span><b>{counts.surplus}</b></div>
                <div><i className="orange"/><span>Faltantes</span><b>{counts.faltante}</b></div>
                <div><i className="red"/><span>Dañados</span><b>{counts.damaged}</b></div>
              </div>
            </div>
          </section>

          <section className="panel inbound-chart-card shipment-chart indicator-clickable" role="button" tabIndex={0} onClick={()=>onNavigate?.('inbound-cajas')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onNavigate?.('inbound-cajas')}}}>
            <div className="chart-heading"><div><h3>Sobrantes por embarque</h3><p>Unidades detectadas</p></div><span className="indicator-open-hint">Ver cajas <ArrowRight size={14}/></span></div>
            <div className="shipment-bars">
              {shipmentBars.map((row,index)=>(
                <div className="shipment-bar-row" key={row.shipment}>
                  <span title={row.shipment}>{row.shipment}</span>
                  <div><i style={{width:`${Math.max(5,(row.quantity/maxShipment)*100)}%`}} className={index===0?'top':''}/></div>
                  <b>{row.quantity.toLocaleString('es-PE',{maximumFractionDigits:3})}</b>
                </div>
              ))}
              {!shipmentBars.length && <div className="chart-empty">Sin sobrantes por embarque.</div>}
            </div>
          </section>

          <section className="panel inbound-chart-card box-status-chart indicator-clickable" role="button" tabIndex={0} onClick={()=>onNavigate?.('inbound-cajas')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onNavigate?.('inbound-cajas')}}}>
            <div className="chart-heading"><div><h3>Estado de cajas</h3><p>Flujo por embarque</p></div><span className="indicator-open-hint">Ver cajas <ArrowRight size={14}/></span></div>
            <div className="box-status-list">
              <div><i className="purple"/><span>Abiertas</span><b>{counts.openBoxes}</b></div>
              <div><i className="green"/><span>Cerradas / Kardex</span><b>{counts.closedBoxes}</b></div>
              <div><i className="orange"/><span>Total cajas</span><b>{counts.boxes}</b></div>
            </div>
          </section>
        </div>

        <div className="inbound-bottom-grid">
          <section className="panel inbound-chart-card trend-chart indicator-clickable" role="button" tabIndex={0} onClick={()=>onNavigate?.('inbound-incidencias')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onNavigate?.('inbound-incidencias')}}}>
            <div className="chart-heading"><div><h3>Tendencia de incidencias</h3><p>Últimos 7 días</p></div><span className="indicator-open-hint">Ver incidencias <ArrowRight size={14}/></span></div>
            <div className="trend-svg-wrap">
              <svg viewBox="0 0 100 86" preserveAspectRatio="none" aria-label="Tendencia de incidencias">
                <defs><linearGradient id="inboundTrendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#5570d8" stopOpacity=".24"/><stop offset="100%" stopColor="#5570d8" stopOpacity=".02"/></linearGradient></defs>
                <polyline points={`8,82 ${trendPoints} 92,82`} fill="url(#inboundTrendFill)" stroke="none"/>
                <polyline points={trendPoints} fill="none" stroke="#33439a" strokeWidth="2.2" vectorEffect="non-scaling-stroke"/>
                {trendData.map((row,index)=>{
                  const x=8+(index*(84/Math.max(trendData.length-1,1)))
                  const y=78-((row.value/maxTrend)*62)
                  return <circle key={row.key} cx={x} cy={y} r="2.2" fill="#5570d8"/>
                })}
              </svg>
              <div className="trend-labels">{trendData.map((row)=><span key={row.key}>{row.label}</span>)}</div>
            </div>
          </section>

          <section className="panel inbound-recent-panel figma-recent indicator-clickable" role="button" tabIndex={0} onClick={()=>onNavigate?.('inbound-incidencias')} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onNavigate?.('inbound-incidencias')}}}>
            <div className="panel-title"><div><h3>Actividad reciente</h3><p>Incidencias y cajas de Callao.</p></div><span className="indicator-open-hint">Ver detalle <ArrowRight size={14}/></span></div>
            <div className="inbound-recent-list">
              {incidents.slice(0,4).map((row)=>{
                const diff=Number(row.qty_received||0)-Number(row.qty_expected||0)
                const relatedBox=boxes.find((box)=>box.id===row.inbound_box_id)
                return <article className="inbound-recent-card" key={row.id}>
                  <div className="inbound-recent-main">
                    <span className={row.incident_type==='SOBRANTE'?'status-pill success':row.incident_type==='FALTANTE'?'status-pill warning':'status-pill danger'}>{row.incident_type}</span>
                    <b>{row.document_no || row.material_no || row.incident_no}</b>
                    <small>{relatedBox ? `Caja ${relatedBox.box_no} · ${relatedBox.status}` : row.description || 'Sin caja asociada'}</small>
                  </div>
                  <div className="inbound-recent-meta"><b>{diff===0?'—':diff.toLocaleString('es-PE',{maximumFractionDigits:3})}</b><small>Diferencia</small></div>
                  <time>{fmt(row.created_at)}</time>
                </article>
              })}
              {!incidents.length && <div className="empty-work"><CheckCircle2 size={25}/><b>Sin actividad reciente</b></div>}
            </div>
          </section>
        </div>
      </div>
    )
  }

  if (mode === 'incidents') {
    return (
      <div className="inbound-module">
        <section className="panel">
          <div className="panel-title">
            <div><h3>Incidencias Inbound · Callao</h3><p>Crear, modificar, eliminar, actualizar, notificar y exportar.</p></div>
            <div className="button-row"><button className="secondary-button" disabled={!visibleIncidents.length} onClick={exportIncidentsPdf}><FileText size={15}/> PDF</button><button className="secondary-button" disabled={!visibleIncidents.length} onClick={exportIncidentsExcel}><FileSpreadsheet size={15}/> Excel</button>{!readOnly && <button className="primary-button" onClick={openNewIncident}><Plus size={15}/> Registrar</button>}</div>
          </div>
          <div className="task-toolbar"><div className="search"><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar incidencia, guía, OC o material…"/></div></div>
          {message && <div className="inline-message">{message}</div>}
          <IncidentRows rows={visibleIncidents} profileName={profileName} sendingId={sendingId} onEdit={openEditIncident} onDelete={deleteIncident} onSend={sendEmail} onStatus={updateIncidentStatus} selectedSurplus={selectedSurplus} onToggle={toggleSurplus} readOnly={readOnly}/>
          {!readOnly && selectedSurplus.length > 0 && <div className="floating-selection"><b>{selectedSurplus.length} sobrante(s)</b><button className="secondary-button" disabled={saving} onClick={createBoxFromSurplus}><Boxes size={16}/> Ver caja automática</button></div>}
        </section>
        {showIncidentForm && <IncidentModal form={incidentForm} setForm={setIncidentForm} profiles={profiles} editing={editingIncident} saving={saving} onClose={() => setShowIncidentForm(false)} onSubmit={saveIncident}/>}
      </div>
    )
  }

  return (
    <div className="inbound-module inbound-boxes-view">
      <section className="panel inbound-boxes-hero">
        <div className="panel-title">
          <div>
            <span className="inbound-live-tag">SOBRANTES · CALLAO</span>
            <h3>Cajas por Embarque</h3>
            <p>Cada SOBRANTE detectado se agrega automáticamente a la caja ABIERTA de su embarque. Al cerrar la caja, ingresa al Kardex.</p>
          </div>
          <div className="button-row">
            {canOperateBoxes && <button className="primary-button" onClick={()=>setShowOpenBox(true)}><Plus size={15}/> Abrir caja</button>}
            <button className="icon-button" onClick={reload}><RefreshCw size={17}/></button>
          </div>
        </div>
        <div className="box-flow-strip">
          <span><AlertTriangle size={14}/> Incidencia SOBRANTE</span><ArrowRight size={14}/><span><Unlock size={14}/> Caja abierta</span><ArrowRight size={14}/><span><Lock size={14}/> Cierre</span><ArrowRight size={14}/><span><TrendingUp size={14}/> Kardex</span>
        </div>
      </section>

      {message && <div className="inline-message">{message}</div>}

      <div className="inbound-box-summary">
        <article><b>{counts.openBoxes}</b><span>Cajas abiertas</span></article>
        <article><b>{counts.closedBoxes}</b><span>Cajas cerradas</span></article>
        <article><b>{boxes.reduce((sum,box)=>sum+(box.inbound_box_items?.length||0),0)}</b><span>Ítems en cajas</span></article>
      </div>

      <div className="inbound-box-grid">
        {boxes.map((box)=>{
          const totalQty=(box.inbound_box_items??[]).reduce((sum,item)=>sum+Number(item.quantity||0),0)
          return <article className={`panel inbound-box-card ${box.status==='ABIERTA'?'open':'closed'}`} key={box.id}>
            <div className="box-card-head">
              <div><small>CAJA</small><h3>{box.box_no}</h3><p>Embarque <b>{box.shipment_no || 'SIN EMBARQUE'}</b></p></div>
              <span className={box.status==='ABIERTA'?'status-pill warning':'status-pill success'}>{box.status}</span>
            </div>
            <div className="box-card-metrics">
              <span><b>{box.inbound_box_items?.length ?? 0}</b><small>Ítems</small></span>
              <span><b>{totalQty.toLocaleString('es-PE',{maximumFractionDigits:3})}</b><small>UND</small></span>
              <span><b>{box.status==='ABIERTA'?'Pendiente':'Ingresado'}</b><small>Kardex</small></span>
            </div>
            <div className="box-card-times"><span>Apertura {fmt(box.opened_at || box.created_at)}</span>{box.closed_at && <span>Cierre {fmt(box.closed_at)}</span>}</div>
            <div className="box-card-actions">
              <button className="secondary-button" onClick={()=>openBox(box)}><Edit3 size={14}/> Detalle</button>
              <button className="secondary-button" onClick={()=>exportBoxPdf(box)}><FileText size={14}/> PDF</button>
              {canOperateBoxes && box.status==='ABIERTA' && <button className="primary-button" disabled={saving} onClick={()=>closeBox(box)}><Lock size={14}/> Cerrar caja</button>}
              {profile?.role==='ADMINISTRADOR' && box.status==='CERRADA' && <button className="secondary-button" disabled={saving} onClick={()=>reopenBox(box)}><Unlock size={14}/> Reabrir</button>}
            </div>
          </article>
        })}
        {!boxes.length && <div className="panel empty-work"><Boxes size={28}/><b>Sin cajas</b><p>La primera incidencia SOBRANTE abrirá automáticamente una caja por embarque.</p></div>}
      </div>

      {showOpenBox && (
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setShowOpenBox(false)}>
          <form className="modal inbound-open-box-modal" onSubmit={openNewBox}>
            <div className="modal-head"><div><h2>Abrir nueva caja</h2><p>Se generará automáticamente el correlativo EMBARQUE-0001, -0002…</p></div><button type="button" className="icon-button" onClick={()=>setShowOpenBox(false)}><X size={19}/></button></div>
            <div className="form-grid">
              <label className="span-2">N° Embarque<input autoFocus required value={newBoxShipment} onChange={(e)=>setNewBoxShipment(e.target.value)} placeholder="Ej. 7653545725MIA"/></label>
              <label className="span-2">Observación<textarea rows={3} value={newBoxNotes} onChange={(e)=>setNewBoxNotes(e.target.value)} placeholder="Opcional"/></label>
            </div>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setShowOpenBox(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<RefreshCw className="spin" size={15}/>:<Unlock size={15}/>} Abrir caja</button></div>
          </form>
        </div>
      )}

      {selectedBox && boxDraft && (
        <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && setSelectedBox(null)}>
          <section className="modal inbound-box-modal">
            <div className="modal-head"><div><h2>{boxDraft.box_no}</h2><p>Embarque: <b>{boxDraft.shipment_no || 'SIN EMBARQUE'}</b> · Detalle de sobrantes.</p></div><button className="icon-button" onClick={()=>setSelectedBox(null)}><X size={19}/></button></div>
            <div className="form-grid">
              <label>Título<input disabled={readOnly || boxDraft.status!=='ABIERTA'} value={boxDraft.title || ''} onChange={(e)=>setBoxDraft({...boxDraft,title:e.target.value})}/></label>
              <label>Estado<div className="box-status-readonly"><span className={boxDraft.status==='ABIERTA'?'status-pill warning':'status-pill success'}>{boxDraft.status}</span>{boxDraft.status==='CERRADA' && <small>Ingresada al Kardex</small>}</div></label>
              <label className="span-2">Observación<textarea disabled={readOnly || boxDraft.status!=='ABIERTA'} rows={2} value={boxDraft.notes || ''} onChange={(e)=>setBoxDraft({...boxDraft,notes:e.target.value})}/></label>
            </div>
            <div className="table-wrap box-item-editor"><table><thead><tr><th>Material</th><th>Descripción</th><th>Cantidad</th><th>UM</th><th>Stock Code</th><th>Ubicación</th><th></th></tr></thead><tbody>
              {(boxDraft.inbound_box_items ?? []).map((item,index)=><tr key={item.id}>
                <td><b>{item.material_no || '—'}</b></td><td>{item.description || '—'}</td>
                <td><input disabled={readOnly || boxDraft.status!=='ABIERTA'} type="number" step="any" value={item.quantity} onChange={(e)=>setBoxDraft({...boxDraft,inbound_box_items:(boxDraft.inbound_box_items??[]).map((x,i)=>i===index?{...x,quantity:Number(e.target.value)}:x)})}/></td>
                <td><input disabled={readOnly || boxDraft.status!=='ABIERTA'} value={item.unit} onChange={(e)=>setBoxDraft({...boxDraft,inbound_box_items:(boxDraft.inbound_box_items??[]).map((x,i)=>i===index?{...x,unit:e.target.value}:x)})}/></td>
                <td><input disabled={readOnly || boxDraft.status!=='ABIERTA'} value={item.stock_code || ''} onChange={(e)=>setBoxDraft({...boxDraft,inbound_box_items:(boxDraft.inbound_box_items??[]).map((x,i)=>i===index?{...x,stock_code:e.target.value}:x)})}/></td>
                <td><input disabled={readOnly || boxDraft.status!=='ABIERTA'} value={item.location || ''} onChange={(e)=>setBoxDraft({...boxDraft,inbound_box_items:(boxDraft.inbound_box_items??[]).map((x,i)=>i===index?{...x,location:e.target.value}:x)})}/></td>
                <td>{!readOnly && boxDraft.status==='ABIERTA' && <button className="icon-button danger-icon" onClick={()=>deleteBoxItem(item.id)}><Trash2 size={14}/></button>}</td>
              </tr>)}
            </tbody></table></div>
            <div className="modal-actions"><button className="secondary-button" onClick={()=>exportBoxPdf(boxDraft)}><FileText size={15}/> PDF</button><button className="secondary-button" onClick={()=>exportBoxExcel(boxDraft)}><FileSpreadsheet size={15}/> Excel</button>{!readOnly && boxDraft.status==='ABIERTA' && <button className="secondary-button" disabled={saving} onClick={saveBox}>{saving?<RefreshCw className="spin" size={15}/>:<Save size={15}/>} Guardar cambios</button>}{canOperateBoxes && boxDraft.status==='ABIERTA' && <button className="primary-button" disabled={saving} onClick={()=>closeBox(boxDraft)}><Lock size={15}/> Cerrar e ingresar al Kardex</button>}{profile?.role==='ADMINISTRADOR' && boxDraft.status==='CERRADA' && <button className="secondary-button" disabled={saving} onClick={()=>reopenBox(boxDraft)}><Unlock size={15}/> Reabrir caja</button>}</div>
          </section>
        </div>
      )}
    </div>
  )
}

function IncidentRows({ rows, profileName, sendingId, onEdit, onDelete, onSend, onStatus, selectedSurplus, onToggle, readOnly }: {
  rows: Incident[]
  profileName:(id?:string|null)=>string
  sendingId:string|null
  onEdit:(row:Incident)=>void
  onDelete:(row:Incident)=>void
  onSend:(row:Incident)=>void
  onStatus:(row:Incident,status:Incident['status'])=>void
  selectedSurplus:string[]
  onToggle:(id:string)=>void
  readOnly:boolean
}) {
  if (!rows.length) return <div className="empty-work"><AlertTriangle size={27}/><b>Sin incidencias</b></div>
  return <div className="table-wrap"><table><thead><tr><th></th><th>Incidencia</th><th>Tipo</th><th>Guía / OC</th><th>Material</th><th>Diferencia</th><th>Responsable</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
    {rows.map((row)=>{
      const diff = Number(row.qty_received || 0)-Number(row.qty_expected || 0)
      return <tr key={row.id}>
        <td>{!readOnly && row.incident_type==='SOBRANTE' && row.status!=='CERRADO' ? <input type="checkbox" checked={selectedSurplus.includes(row.id)} onChange={()=>onToggle(row.id)}/> : null}</td>
        <td><b>{row.incident_no}</b><small>{fmt(row.created_at)}</small></td>
        <td><span className={row.incident_type==='SOBRANTE'?'status-pill warning':'status-pill'}>{row.incident_type.replaceAll('_',' ')}</span></td>
        <td>{row.guide_no || row.purchase_order || '—'}</td>
        <td><b>{row.material_no || '—'}</b><small>{row.description || ''}</small></td>
        <td>{diff === 0 ? '—' : diff.toLocaleString('es-PE',{maximumFractionDigits:3})}</td>
        <td>{profileName(row.assigned_to)}</td>
        <td>{readOnly ? <span className="status-pill">{row.status.replaceAll('_',' ')}</span> : <select className="inline-select" value={row.status} onChange={(e)=>onStatus(row,e.target.value as Incident['status'])}><option>ABIERTO</option><option>EN_REVISION</option><option>NOTIFICADO</option><option>CERRADO</option></select>}</td>
        <td>{readOnly ? <span className="read-only-note">Solo lectura</span> : <div className="row-actions"><button className="icon-button" title="Editar" onClick={()=>onEdit(row)}><Edit3 size={14}/></button><button className="icon-button" title="Enviar correo" disabled={sendingId===row.id} onClick={()=>onSend(row)}>{sendingId===row.id?<RefreshCw className="spin" size={14}/>:<Mail size={14}/>}</button><button className="icon-button danger-icon" title="Eliminar" onClick={()=>onDelete(row)}><Trash2 size={14}/></button></div>}</td>
      </tr>
    })}
  </tbody></table></div>
}

function IncidentModal({ form, setForm, profiles, editing, saving, onClose, onSubmit }: {
  form: typeof emptyIncident
  setForm:(value:typeof emptyIncident)=>void
  profiles:Profile[]
  editing:Incident|null
  saving:boolean
  onClose:()=>void
  onSubmit:(event:FormEvent)=>void
}) {
  return <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget && onClose()}>
    <form className="modal inbound-incident-modal" onSubmit={onSubmit}>
      <div className="modal-head"><div><h2>{editing?'Editar incidencia':'Nueva incidencia Inbound'}</h2><p>Almacén CALLAO · Grupo INBOUND</p></div><button type="button" className="icon-button" onClick={onClose}><X size={19}/></button></div>
      <div className="form-grid">
        <label>Tipo<select value={form.incident_type} onChange={(e)=>setForm({...form,incident_type:e.target.value as Incident['incident_type']})}><option value="SOBRANTE">Sobrante</option><option value="FALTANTE">Faltante</option><option value="DANADO">Dañado</option><option value="DIFERENCIA">Diferencia</option><option value="SIN_DOCUMENTACION">Sin documentación</option><option value="OTRO">Otro</option></select></label>
        <label>Responsable<select value={form.assigned_to} onChange={(e)=>setForm({...form,assigned_to:e.target.value})}><option value="">Sin asignar</option>{profiles.map((p)=><option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}</select></label>
        <label>Guía<input value={form.guide_no} onChange={(e)=>setForm({...form,guide_no:e.target.value})}/></label>
        <label>OC<input value={form.purchase_order} onChange={(e)=>setForm({...form,purchase_order:e.target.value})}/></label>
        <label>N° Embarque o Guía<input value={form.document_no} onChange={(e)=>setForm({...form,document_no:e.target.value})}/></label>
        <label>Número de parte<input value={form.material_no} onChange={(e)=>setForm({...form,material_no:e.target.value})}/></label>
        <label className="span-2">Descripción<input value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/></label>
        <label>Cantidad esperada<input type="number" min="0" step="any" value={form.qty_expected} onChange={(e)=>setForm({...form,qty_expected:e.target.value})}/></label>
        <label>Cantidad recibida<input type="number" min="0" step="any" value={form.qty_received} onChange={(e)=>setForm({...form,qty_received:e.target.value})}/></label>
        <label className="span-2">Observaciones<textarea rows={3} value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<RefreshCw className="spin" size={15}/>:<CheckCircle2 size={15}/>} {editing?'Actualizar':'Guardar'}</button></div>
    </form>
  </div>
}
