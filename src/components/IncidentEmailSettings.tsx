import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Mail, RefreshCw, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Row = {
  id?: string
  warehouse: string
  enabled: boolean
  to_addresses: string[]
  cc_addresses: string[]
}

type Props = {
  userId: string
}

function splitEmails(value: string) {
  return value
    .split(/[;,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function IncidentEmailSettings({ userId }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [drafts, setDrafts] = useState<Record<string, { to: string; cc: string; enabled: boolean }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function reload() {
    setLoading(true)
    const { data, error } = await supabase
      .from('incident_email_destinations')
      .select('id,warehouse,enabled,to_addresses,cc_addresses')
      .order('warehouse')

    if (error) {
      setMessage(error.message)
      setRows([])
      setLoading(false)
      return
    }

    const result = (data ?? []) as Row[]
    setRows(result)
    setDrafts(Object.fromEntries(result.map((row) => [
      row.warehouse,
      {
        to: (row.to_addresses ?? []).join('; '),
        cc: (row.cc_addresses ?? []).join('; '),
        enabled: row.enabled,
      },
    ])))
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const configured = useMemo(
    () => rows.filter((row) => row.enabled && row.to_addresses?.length).length,
    [rows]
  )

  async function saveWarehouse(event: FormEvent, warehouse: string) {
    event.preventDefault()
    const draft = drafts[warehouse]
    if (!draft) return

    const to = splitEmails(draft.to)
    const cc = splitEmails(draft.cc)
    const invalid = [...to, ...cc].find((email) => !validEmail(email))

    if (invalid) {
      setMessage(`Correo inválido: ${invalid}`)
      return
    }
    if (draft.enabled && !to.length) {
      setMessage(`Configura al menos un destinatario para ${warehouse} o desactiva el envío automático.`)
      return
    }

    setSaving(warehouse)
    setMessage('')

    const { error } = await supabase
      .from('incident_email_destinations')
      .upsert({
        warehouse,
        enabled: draft.enabled,
        to_addresses: to,
        cc_addresses: cc,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'warehouse' })

    setSaving(null)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`Destinatarios de ${warehouse} actualizados.`)
    await reload()
  }

  return (
    <section className="panel incident-email-settings">
      <div className="panel-title">
        <div>
          <h3>Correos automáticos de incidencias</h3>
          <p>Define el correo específico por almacén para FALTANTES, SOBRANTES y DAÑADOS.</p>
        </div>
        <div className="button-row">
          <span className="status-pill"><CheckCircle2 size={14}/> {configured} configurado(s)</span>
          <button className="icon-button" onClick={reload}><RefreshCw size={17}/></button>
        </div>
      </div>

      {message && <div className="inline-message">{message}</div>}

      {loading ? (
        <div className="screen-center compact"><RefreshCw className="spin" size={21}/><p>Cargando destinatarios…</p></div>
      ) : (
        <div className="email-destination-grid">
          {rows.map((row) => {
            const draft = drafts[row.warehouse] ?? { to: '', cc: '', enabled: true }
            return (
              <form key={row.warehouse} className="email-destination-card" onSubmit={(e)=>saveWarehouse(e,row.warehouse)}>
                <div className="email-destination-head">
                  <div className="setting-icon"><Mail size={18}/></div>
                  <div><b>{row.warehouse}</b><small>Incidencias de recepción</small></div>
                  <label className="email-toggle">
                    <input type="checkbox" checked={draft.enabled} onChange={(e)=>setDrafts({...drafts,[row.warehouse]:{...draft,enabled:e.target.checked}})}/>
                    <span>{draft.enabled ? 'Activo' : 'Inactivo'}</span>
                  </label>
                </div>

                <label>Para
                  <input
                    value={draft.to}
                    onChange={(e)=>setDrafts({...drafts,[row.warehouse]:{...draft,to:e.target.value}})}
                    placeholder="responsable@empresa.com"
                  />
                </label>

                <label>CC
                  <input
                    value={draft.cc}
                    onChange={(e)=>setDrafts({...drafts,[row.warehouse]:{...draft,cc:e.target.value}})}
                    placeholder="supervisor@empresa.com; otro@empresa.com"
                  />
                </label>

                <button className="primary-button" disabled={saving===row.warehouse}>
                  {saving===row.warehouse?<RefreshCw className="spin" size={15}/>:<Save size={15}/>}
                  {saving===row.warehouse?'Guardando…':'Guardar destinatarios'}
                </button>
              </form>
            )
          })}
        </div>
      )}
    </section>
  )
}
