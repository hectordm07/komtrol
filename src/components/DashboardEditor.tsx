import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Eye,
  EyeOff,
  Grip,
  LayoutDashboard,
  Monitor,
  Move,
  Palette,
  RotateCcw,
  Save,
  Smartphone,
  Tablet,
  Type,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  DASHBOARD_REPORTS,
  DASHBOARD_SLOT_LABELS,
  DASHBOARD_VIEWPORTS,
  defaultDashboardLayoutConfig,
  normalizeDashboardLayoutConfig,
  type DashboardLayoutConfig,
  type DashboardSlotKey,
  type DashboardViewport,
} from '../lib/dashboardLayout'

type Props = {
  userId: string
  isAdmin: boolean
}

const PREVIEW_BASE: Record<DashboardSlotKey,{left:number;top:number;width:number;height:number}> = {
  filters: { left: 18, top: 82, width: 150, height: 360 },
  kpis: { left: 184, top: 82, width: 620, height: 118 },
  main: { left: 184, top: 216, width: 620, height: 226 },
  secondary: { left: 18, top: 458, width: 786, height: 72 },
}

function snap(value:number) {
  return Math.round(value/8)*8
}

function clamp(value:number,min:number,max:number) {
  return Math.max(min,Math.min(max,value))
}

function viewportIcon(value:DashboardViewport) {
  if(value==='mobile') return <Smartphone size={15}/>
  if(value==='tablet') return <Tablet size={15}/>
  return <Monitor size={15}/>
}

function slotPreviewLabel(key:DashboardSlotKey) {
  if(key==='filters') return 'Filtros'
  if(key==='kpis') return 'Tarjetas KPI'
  if(key==='main') return 'Gráfico principal'
  return 'Resumen / secundario'
}

export function DashboardEditor({userId,isAdmin}:Props) {
  const [reportCode,setReportCode]=useState<string>('inbound-outbound')
  const [viewport,setViewport]=useState<DashboardViewport>('desktop')
  const [selectedSlot,setSelectedSlot]=useState<DashboardSlotKey>('kpis')
  const [config,setConfig]=useState<DashboardLayoutConfig>(()=>defaultDashboardLayoutConfig())
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const previewRef=useRef<HTMLDivElement|null>(null)
  const dragRef=useRef<{slot:DashboardSlotKey;startX:number;startY:number;baseX:number;baseY:number}|null>(null)

  const reportLabel=useMemo(
    ()=>DASHBOARD_REPORTS.find((item)=>item.code===reportCode)?.label||reportCode,
    [reportCode]
  )

  async function load() {
    setLoading(true)
    setMessage('')
    const {data,error}=await supabase
      .from('dashboard_layout_configs')
      .select('config')
      .eq('report_code',reportCode)
      .eq('viewport',viewport)
      .maybeSingle()

    setLoading(false)
    if(error){
      setMessage(error.message)
      setConfig(defaultDashboardLayoutConfig())
      return
    }
    setConfig(normalizeDashboardLayoutConfig(data?.config))
  }

  useEffect(()=>{ void load() },[reportCode,viewport])

  useEffect(()=>{
    function move(event:PointerEvent){
      const drag=dragRef.current
      if(!drag) return
      const preview=previewRef.current
      if(!preview) return
      const rect=preview.getBoundingClientRect()
      const scaleX=820/Math.max(rect.width,1)
      const scaleY=548/Math.max(rect.height,1)
      const dx=(event.clientX-drag.startX)*scaleX
      const dy=(event.clientY-drag.startY)*scaleY
      setConfig((current)=>({
        ...current,
        slots:{
          ...current.slots,
          [drag.slot]:{
            ...current.slots[drag.slot],
            x:clamp(snap(drag.baseX+dx),-480,480),
            y:clamp(snap(drag.baseY+dy),-480,480),
          },
        },
      }))
    }
    function up(){dragRef.current=null}
    window.addEventListener('pointermove',move)
    window.addEventListener('pointerup',up)
    return ()=>{
      window.removeEventListener('pointermove',move)
      window.removeEventListener('pointerup',up)
    }
  },[])

  function startDrag(event:ReactPointerEvent,slot:DashboardSlotKey){
    if(!isAdmin) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current={
      slot,
      startX:event.clientX,
      startY:event.clientY,
      baseX:config.slots[slot].x,
      baseY:config.slots[slot].y,
    }
    setSelectedSlot(slot)
  }

  function patchTheme<K extends keyof DashboardLayoutConfig['theme']>(
    key:K,
    value:DashboardLayoutConfig['theme'][K]
  ){
    setConfig((current)=>({...current,theme:{...current.theme,[key]:value}}))
  }

  function patchSlot<K extends keyof DashboardLayoutConfig['slots'][DashboardSlotKey]>(
    key:K,
    value:DashboardLayoutConfig['slots'][DashboardSlotKey][K]
  ){
    setConfig((current)=>({
      ...current,
      slots:{
        ...current.slots,
        [selectedSlot]:{...current.slots[selectedSlot],[key]:value},
      },
    }))
  }

  async function save(){
    if(!isAdmin) return
    setSaving(true)
    setMessage('')
    const payload={
      report_code:reportCode,
      viewport,
      config,
      active:true,
      created_by:userId,
      updated_by:userId,
      updated_at:new Date().toISOString(),
    }
    const {error}=await supabase
      .from('dashboard_layout_configs')
      .upsert(payload,{onConflict:'report_code,viewport'})
    setSaving(false)
    if(error){setMessage(error.message);return}
    await supabase.from('audit_log').insert({
      action:'UPDATE_DASHBOARD_LAYOUT',
      entity_type:'DASHBOARD_LAYOUT',
      entity_id:`${reportCode}:${viewport}`,
      actor_user_id:userId,
      details:{report_code:reportCode,viewport,config},
    })
    setMessage('Diseño guardado. El cambio ya queda disponible para este reporte y dispositivo.')
  }

  async function reset(){
    if(!isAdmin) return
    const next=defaultDashboardLayoutConfig()
    setConfig(next)
    const {error}=await supabase
      .from('dashboard_layout_configs')
      .delete()
      .eq('report_code',reportCode)
      .eq('viewport',viewport)
    if(error){setMessage(error.message);return}
    await supabase.from('audit_log').insert({
      action:'RESET_DASHBOARD_LAYOUT',
      entity_type:'DASHBOARD_LAYOUT',
      entity_id:`${reportCode}:${viewport}`,
      actor_user_id:userId,
      details:{report_code:reportCode,viewport},
    })
    setMessage('Diseño restablecido al estándar KOMTROL.')
  }

  const slot=config.slots[selectedSlot]

  return (
    <section className="dashboard-editor">
      <div className="dashboard-editor-head">
        <div>
          <span className="dashboard-editor-icon"><LayoutDashboard size={22}/></span>
          <div>
            <h2>Editor de Dashboards</h2>
            <p>Personaliza los 12 reportes sin tocar código. Los movimientos usan cuadrícula magnética de 8 px para conservar alineación.</p>
          </div>
        </div>
        <div className="dashboard-editor-actions">
          <button className="secondary-button" type="button" onClick={()=>void reset()} disabled={!isAdmin||saving}>
            <RotateCcw size={15}/> Restaurar
          </button>
          <button className="primary-button" type="button" onClick={()=>void save()} disabled={!isAdmin||saving}>
            <Save size={15}/> {saving?'Guardando…':'Guardar diseño'}
          </button>
        </div>
      </div>

      <div className="dashboard-editor-toolbar">
        <label>
          <span>Reporte</span>
          <select value={reportCode} onChange={(event)=>setReportCode(event.target.value)}>
            {DASHBOARD_REPORTS.map((item)=><option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>

        <div className="dashboard-editor-viewports" aria-label="Dispositivo">
          {DASHBOARD_VIEWPORTS.map((item)=><button
            type="button"
            key={item.value}
            className={viewport===item.value?'active':''}
            onClick={()=>setViewport(item.value)}
          >{viewportIcon(item.value)} {item.label}</button>)}
        </div>
      </div>

      {message&&<div className="inline-message">{message}</div>}

      <div className="dashboard-editor-layout">
        <aside className="dashboard-editor-controls">
          <section>
            <div className="dashboard-editor-section-title"><Type size={15}/><b>Texto</b></div>
            <label>
              <span>Título del reporte</span>
              <input
                value={config.reportTitle}
                placeholder={reportLabel}
                onChange={(event)=>setConfig((current)=>({...current,reportTitle:event.target.value}))}
              />
            </label>
            <label>
              <span>Descripción</span>
              <textarea
                rows={2}
                value={config.reportDescription}
                placeholder="Mantener descripción original"
                onChange={(event)=>setConfig((current)=>({...current,reportDescription:event.target.value}))}
              />
            </label>
          </section>

          <section>
            <div className="dashboard-editor-section-title"><Palette size={15}/><b>Color y estilo</b></div>
            <div className="dashboard-editor-color-grid">
              <label><span>Azul principal</span><input type="color" value={config.theme.primary} onChange={(e)=>patchTheme('primary',e.target.value)}/></label>
              <label><span>Títulos</span><input type="color" value={config.theme.titleColor} onChange={(e)=>patchTheme('titleColor',e.target.value)}/></label>
              <label><span>Tarjetas</span><input type="color" value={config.theme.cardBackground} onChange={(e)=>patchTheme('cardBackground',e.target.value)}/></label>
              <label><span>Fondo</span><input type="color" value={config.theme.appBackground} onChange={(e)=>patchTheme('appBackground',e.target.value)}/></label>
              <label><span>Bordes</span><input type="color" value={config.theme.borderColor} onChange={(e)=>patchTheme('borderColor',e.target.value)}/></label>
              <label><span>Gráficos</span><input type="color" value={config.theme.chartColor} onChange={(e)=>patchTheme('chartColor',e.target.value)}/></label>
            </div>
            <div className="dashboard-editor-number-grid">
              <label><span>Radio</span><input type="number" min="6" max="32" value={config.theme.cardRadius} onChange={(e)=>patchTheme('cardRadius',Number(e.target.value))}/></label>
              <label><span>Título px</span><input type="number" min="7" max="18" value={config.theme.titleSize} onChange={(e)=>patchTheme('titleSize',Number(e.target.value))}/></label>
              <label><span>Valor px</span><input type="number" min="22" max="64" value={config.theme.valueSize} onChange={(e)=>patchTheme('valueSize',Number(e.target.value))}/></label>
              <label><span>Espacio px</span><input type="number" min="2" max="30" value={config.theme.gap} onChange={(e)=>patchTheme('gap',Number(e.target.value))}/></label>
            </div>
          </section>

          <section>
            <div className="dashboard-editor-section-title"><Move size={15}/><b>Ubicar / mover</b></div>
            <label>
              <span>Elemento</span>
              <select value={selectedSlot} onChange={(e)=>setSelectedSlot(e.target.value as DashboardSlotKey)}>
                {(Object.keys(DASHBOARD_SLOT_LABELS) as DashboardSlotKey[]).map((key)=>
                  <option key={key} value={key}>{DASHBOARD_SLOT_LABELS[key]}</option>
                )}
              </select>
            </label>
            <div className="dashboard-editor-slot-grid">
              <label><span>X px</span><input type="number" step="8" value={slot.x} onChange={(e)=>patchSlot('x',Number(e.target.value))}/></label>
              <label><span>Y px</span><input type="number" step="8" value={slot.y} onChange={(e)=>patchSlot('y',Number(e.target.value))}/></label>
              <label><span>Ancho %</span><input type="number" min="55" max="145" value={slot.width} onChange={(e)=>patchSlot('width',Number(e.target.value))}/></label>
              <label><span>Alto %</span><input type="number" min="55" max="145" value={slot.height} onChange={(e)=>patchSlot('height',Number(e.target.value))}/></label>
            </div>
            <button
              className={slot.visible?'dashboard-editor-visibility active':'dashboard-editor-visibility'}
              type="button"
              onClick={()=>patchSlot('visible',!slot.visible)}
            >{slot.visible?<Eye size={15}/>:<EyeOff size={15}/>} {slot.visible?'Visible':'Oculto'}</button>
            <p className="dashboard-editor-hint">También puedes arrastrar directamente los bloques de la vista previa.</p>
          </section>
        </aside>

        <div className="dashboard-editor-stage-wrap">
          <div className="dashboard-editor-stage-head">
            <div><b>{config.reportTitle||reportLabel}</b><span>{viewport.toUpperCase()} · vista previa estructural</span></div>
            <span>{loading?'Cargando configuración…':'Snap 8 px'}</span>
          </div>
          <div
            ref={previewRef}
            className="dashboard-editor-stage"
            style={{
              background:config.theme.appBackground,
              borderColor:config.theme.borderColor,
            }}
          >
            <div className="dashboard-editor-preview-header" style={{background:config.theme.primary}}>
              {config.reportTitle||reportLabel}
            </div>
            {(Object.keys(config.slots) as DashboardSlotKey[]).map((key)=>{
              const current=config.slots[key]
              const base=PREVIEW_BASE[key]
              const selected=selectedSlot===key
              return <button
                type="button"
                key={key}
                className={selected?'dashboard-editor-slot selected':'dashboard-editor-slot'}
                onPointerDown={(event)=>startDrag(event,key)}
                onClick={()=>setSelectedSlot(key)}
                style={{
                  left:base.left+current.x,
                  top:base.top+current.y,
                  width:base.width*(current.width/100),
                  height:base.height*(current.height/100),
                  display:current.visible?'flex':'none',
                  borderRadius:config.theme.cardRadius,
                  borderColor:selected?config.theme.primary:config.theme.borderColor,
                  background:config.theme.cardBackground,
                  color:config.theme.titleColor,
                }}
              >
                <Grip size={14}/>
                <span>{slotPreviewLabel(key)}</span>
              </button>
            })}
          </div>
          <div className="dashboard-editor-stage-note">
            <b>Publicación automática:</b> al guardar, todos los usuarios verán este diseño en el dispositivo seleccionado. Los datos y cálculos del reporte no se modifican.
          </div>
        </div>
      </div>
    </section>
  )
}
