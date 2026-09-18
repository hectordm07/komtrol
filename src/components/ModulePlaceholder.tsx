import { CheckCircle2, Clock3, Database, Layers3 } from 'lucide-react'

type Props = {
  title: string
  section: string
  description?: string
}

export function ModulePlaceholder({ title, section, description }: Props) {
  return (
    <section className="panel module-placeholder">
      <div className="module-placeholder-head">
        <div className="module-icon"><Layers3 size={22} /></div>
        <div>
          <span className="eyebrow">{section}</span>
          <h2>{title}</h2>
          <p>{description || 'Módulo recuperado de la arquitectura de KOMTROL Sites.'}</p>
        </div>
      </div>

      <div className="migration-status-grid">
        <div>
          <CheckCircle2 size={18} />
          <span><b>Navegación migrada</b><small>Disponible en la nueva estructura Vercel.</small></span>
        </div>
        <div>
          <Database size={18} />
          <span><b>Base centralizada</b><small>La información se conectará a Supabase sin LocalStorage crítico.</small></span>
        </div>
        <div>
          <Clock3 size={18} />
          <span><b>Migración progresiva</b><small>La funcionalidad del módulo se habilita sin romper lo ya operativo.</small></span>
        </div>
      </div>
    </section>
  )
}
