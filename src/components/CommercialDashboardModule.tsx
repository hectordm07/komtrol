import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
   ChevronRight,
  Eye,
  FileText,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  ProfessionalBarChart,
  ProfessionalDonutChart,
  ProfessionalTrendChart,
} from './DashboardVisuals'

type Followup = {
  final_status: string | null
  billing_status: string | null
  updated_at: string | null
}

type Refrendo = {
  id: string
}

type CommercialGuide = {
  id: string
  guide_no: string
  reference: string
  document_no: string | null
  warehouse: string | null
  reception_at: string
  created_at: string
  load_status: 'VALIDADO' | 'OBSERVADO'
  oc_cargo_followups?: Followup[] | Followup | null
  guide_refrendos?: Refrendo[] | null
}

type Props = {
  onOpenOrders: () => void
}

function normalizeFollowup(value: CommercialGuide['oc_cargo_followups']) {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('es-PE', { dateStyle: 'short' }).format(date)
}

function statusLabel(value?: string | null) {
  return String(value || 'PENDIENTE').replaceAll('_', ' ')
}

export function CommercialDashboardModule({ onOpenOrders }: Props) {
  const [guides, setGuides] = useState<CommercialGuide[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [lastUpdated,setLastUpdated]=useState<Date|null>(null)

  async function reload(options?:{silent?:boolean}) {
    const silent=Boolean(options?.silent)
    if(!silent) setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('guides')
      .select(`
        id,
        guide_no,
        reference,
        document_no,
        warehouse,
        reception_at,
        created_at,
        load_status,
        oc_cargo_followups (final_status,billing_status,updated_at),
        guide_refrendos (id)
      `)
      .eq('guide_type', 'ORDEN_COMPRA')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) {
      setMessage(error.message)
      setGuides([])
    } else {
      setGuides((data ?? []) as CommercialGuide[])
    }

    setLastUpdated(new Date())
    if(!silent) setLoading(false)
  }

  useEffect(() => {
    void reload()
    const refresh=()=>void reload({silent:true})
    const onVisibility=()=>{ if(document.visibilityState==='visible') refresh() }
    const timer=window.setInterval(refresh,20_000)
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',onVisibility)
    return ()=>{
      window.clearInterval(timer)
      window.removeEventListener('focus',refresh)
      document.removeEventListener('visibilitychange',onVisibility)
    }
  }, [])

  const metrics = useMemo(() => {
    const total = guides.length
    const pending = guides.filter((guide) => {
      const status = normalizeFollowup(guide.oc_cargo_followups)?.final_status || 'PENDIENTE'
      return ['PENDIENTE', 'EN_SEGUIMIENTO'].includes(status)
    }).length
    const observed = guides.filter((guide) =>
      normalizeFollowup(guide.oc_cargo_followups)?.final_status === 'OBSERVADO'
    ).length
    const closed = guides.filter((guide) =>
      ['REFRENDADO', 'CERRADO'].includes(normalizeFollowup(guide.oc_cargo_followups)?.final_status || '')
    ).length
    const withRefrendo = guides.filter((guide) => (guide.guide_refrendos?.length || 0) > 0).length
    const withoutRefrendo = total - withRefrendo

    return { total, pending, observed, closed, withRefrendo, withoutRefrendo }
  }, [guides])

  const statusSegments = useMemo(() => {
    const delivered = guides.filter((guide) =>
      normalizeFollowup(guide.oc_cargo_followups)?.final_status === 'ENTREGADO_CLIENTE'
    ).length
    const other = Math.max(0, metrics.total - metrics.pending - metrics.observed - metrics.closed - delivered)

    return [
      { label: 'Pendientes', value: metrics.pending },
      { label: 'Observadas', value: metrics.observed },
      { label: 'Entregadas', value: delivered },
      { label: 'Refrendadas / cerradas', value: metrics.closed },
      { label: 'Otros', value: other },
    ]
  }, [guides, metrics])

  const refrendoData = [
    { key: 'CON', label: 'Con refrendo', value: metrics.withRefrendo, detail: 'Órdenes de Compra con refrendo disponible para visualizar o descargar.' },
    { key: 'SIN', label: 'Sin refrendo', value: metrics.withoutRefrendo, detail: 'Órdenes de Compra que todavía no cuentan con refrendo.' },
  ]

  const monthlyTrend = useMemo(() => {
    const now = new Date()
    const labels: { year: number; month: number; label: string }[] = []
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      labels.push({
        year: date.getFullYear(),
        month: date.getMonth(),
        label: new Intl.DateTimeFormat('es-PE', { month: 'short' }).format(date).replace('.', ''),
      })
    }

    return labels.map((item) => ({
      label: item.label,
      value: guides.filter((guide) => {
        const date = new Date(guide.created_at)
        return date.getFullYear() === item.year && date.getMonth() === item.month
      }).length,
    }))
  }, [guides])

  return (
    <div className="commercial-dashboard">
      <div className="commercial-quickbar">
        <div>
          <span className="commercial-eyebrow">ÁREA COMERCIAL · ÓRDENES DE COMPRA</span>
          <small>{lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}` : 'Datos en vivo'}</small>
        </div>
        <div className="commercial-dashboard-actions">
          <button className="secondary-button" onClick={() => void reload({silent:true})}>
            <RefreshCw size={16}/> Actualizar
          </button>
          <button className="primary-button" onClick={onOpenOrders}>
            <ShoppingCart size={16}/> Ver Órdenes de Compra
          </button>
        </div>
      </div>

      {message && <div className="inline-message">{message}</div>}

      <section className="commercial-kpis commercial-kpis-focused">
        <button type="button" onClick={onOpenOrders}>
          <ShoppingCart size={20}/>
          <span><b>{metrics.total}</b><small>OC REGISTRADAS</small><em>Universo visible del área comercial</em></span>
          <ChevronRight size={15}/>
        </button>
        <button type="button" className={metrics.observed ? 'attention' : ''} onClick={onOpenOrders}>
          <AlertTriangle size={20}/>
          <span><b>{metrics.observed}</b><small>OBSERVADAS</small><em>Requieren revisión y regularización</em></span>
          <ChevronRight size={15}/>
        </button>
        <button type="button" className={metrics.withoutRefrendo ? 'attention' : ''} onClick={onOpenOrders}>
          <BarChart3 size={20}/>
          <span><b>{metrics.withoutRefrendo}</b><small>SIN REFRENDO</small><em>Pendiente documental</em></span>
          <ChevronRight size={15}/>
        </button>
        <button type="button" onClick={onOpenOrders}>
          <FileText size={20}/>
          <span><b>{metrics.withRefrendo}</b><small>REFRENDO DISPONIBLE</small><em>Listo para visualizar o descargar</em></span>
          <ChevronRight size={15}/>
        </button>
      </section>

      <section className="commercial-dashboard-charts">
        <div className="commercial-chart-link" role="button" tabIndex={0} onClick={onOpenOrders} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onOpenOrders()}}>
          <ProfessionalDonutChart
            title="Distribución por estado"
            subtitle="Seguimiento actual de las Órdenes de Compra"
            segments={statusSegments}
          />
          <span>Ver reporte de Órdenes de Compra <ChevronRight size={14}/></span>
        </div>
        <div className="commercial-chart-link" role="button" tabIndex={0} onClick={onOpenOrders} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onOpenOrders()}}>
          <ProfessionalBarChart
            title="Cobertura de refrendos"
            subtitle="Disponibilidad documental de las OC"
            data={refrendoData}
            onSelect={()=>onOpenOrders()}
          />
          <span>Revisar refrendos <ChevronRight size={14}/></span>
        </div>
        <div className="commercial-chart-link commercial-trend-card" role="button" tabIndex={0} onClick={onOpenOrders} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')onOpenOrders()}}>
          <ProfessionalTrendChart
            title="Órdenes registradas"
            subtitle="Últimos 6 meses"
            points={monthlyTrend}
          />
          <span>Ver evolución y detalle <ChevronRight size={14}/></span>
        </div>
      </section>

      <section className="panel commercial-recent-panel">
        <div className="panel-title">
          <div>
            <h3>Órdenes de Compra recientes</h3>
            <p>Vista resumida del estado de guía y refrendo.</p>
          </div>
          <button className="secondary-button" onClick={onOpenOrders}><Eye size={15}/> Ver todas</button>
        </div>

        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={22}/><p>Cargando Órdenes de Compra…</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Guía</th>
                  <th>OC / Referencia</th>
                  <th>Almacén</th>
                  <th>Recepción</th>
                  <th>Estado guía</th>
                  <th>Refrendo</th>
                </tr>
              </thead>
              <tbody>
                {guides.slice(0, 10).map((guide) => {
                  const followup = normalizeFollowup(guide.oc_cargo_followups)
                  const hasRefrendo = Boolean(guide.guide_refrendos?.length)
                  return (
                    <tr key={guide.id}>
                      <td><b>{guide.guide_no}</b></td>
                      <td>{guide.reference}</td>
                      <td>{guide.warehouse || '—'}</td>
                      <td>{fmtDate(guide.reception_at)}</td>
                      <td>
                        <span className={followup?.final_status === 'OBSERVADO' ? 'status-pill danger' : 'status-pill'}>
                          {statusLabel(followup?.final_status)}
                        </span>
                      </td>
                      <td>
                        <span className={hasRefrendo ? 'status-pill' : 'status-pill warning'}>
                          {hasRefrendo ? 'DISPONIBLE' : 'PENDIENTE'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!guides.length && <div className="empty-work"><ShoppingCart size={28}/><b>Sin Órdenes de Compra</b></div>}
          </div>
        )}
      </section>
    </div>
  )
}
