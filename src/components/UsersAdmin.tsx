import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, FileUp, RefreshCw, Search, ShieldCheck, Upload, Users, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Role = 'TRABAJADOR' | 'COORDINADOR' | 'SUPERVISOR' | 'ADMINISTRADOR'

type ProfileRow = {
  user_id: string
  dni: string
  full_name: string
  role: Role
  active: boolean
  warehouse: string | null
  project: string | null
  group_name: string | null
  shift_name: string | null
  position: string | null
  created_at: string
}

type ImportUser = {
  dni: string
  full_name: string
  role: Role
  warehouse: string
  project: string
  group_name: string
  shift_name: string
  position: string
  pin: string
}

type ImportResult = ImportUser & {
  row?: number
  status: string
  error?: string
  generated_pin?: boolean
}

const ROLES: Role[] = ['TRABAJADOR', 'COORDINADOR', 'SUPERVISOR', 'ADMINISTRADOR']

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
}

function parseLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function parseUsers(text: string): ImportUser[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)

  if (lines.length < 2) return []

  const first = lines[0]
  const counts = [
    { delimiter: '\t', count: (first.match(/\t/g) ?? []).length },
    { delimiter: ';', count: (first.match(/;/g) ?? []).length },
    { delimiter: ',', count: (first.match(/,/g) ?? []).length },
  ].sort((a, b) => b.count - a.count)

  const delimiter = counts[0].count > 0 ? counts[0].delimiter : ','
  const headers = parseLine(lines[0], delimiter).map(normalizeHeader)

  const indexOf = (...aliases: string[]) => {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias)
      if (idx >= 0) return idx
    }
    return -1
  }

  const indexes = {
    dni: indexOf('DNI', 'DOCUMENTO'),
    name: indexOf('NOMBRE', 'NOMBRES', 'NOMBRE_COMPLETO', 'FULL_NAME', 'APELLIDOS_Y_NOMBRES'),
    role: indexOf('ROL', 'ROLE'),
    warehouse: indexOf('ALMACEN', 'WAREHOUSE', 'CENTRO'),
    project: indexOf('PROYECTO', 'PROJECT'),
    group: indexOf('GRUPO', 'GROUP'),
    shift: indexOf('GUARDIA', 'TURNO', 'SHIFT', 'SHIFT_NAME'),
    position: indexOf('CARGO', 'PUESTO', 'POSITION'),
    pin: indexOf('PIN', 'CLAVE'),
  }

  if (indexes.dni < 0 || indexes.name < 0) return []

  return lines.slice(1).map((line) => {
    const cells = parseLine(line, delimiter)
    const rawRole = indexes.role >= 0 ? String(cells[indexes.role] || 'TRABAJADOR').trim().toUpperCase() : 'TRABAJADOR'
    const role = ROLES.includes(rawRole as Role) ? rawRole as Role : 'TRABAJADOR'
    return {
      dni: String(cells[indexes.dni] ?? '').replace(/\D/g, '').slice(0, 8),
      full_name: String(cells[indexes.name] ?? '').trim(),
      role,
      warehouse: indexes.warehouse >= 0 ? String(cells[indexes.warehouse] ?? '').trim() : '',
      project: indexes.project >= 0 ? String(cells[indexes.project] ?? '').trim() : '',
      group_name: indexes.group >= 0 ? String(cells[indexes.group] ?? '').trim() : '',
      shift_name: indexes.shift >= 0 ? String(cells[indexes.shift] ?? '').trim() : '',
      position: indexes.position >= 0 ? String(cells[indexes.position] ?? '').trim() : '',
      pin: indexes.pin >= 0 ? String(cells[indexes.pin] ?? '').replace(/\D/g, '').slice(0, 8) : '',
    }
  })
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => {
      const value = String(cell ?? '')
      return /[",;\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value
    }).join(','))
    .join('\n')

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

export function UsersAdmin() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [importText, setImportText] = useState('')
  const [fileName, setFileName] = useState('usuarios_komtrol.csv')
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[]>([])
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  const parsed = useMemo(() => parseUsers(importText), [importText])

  const validation = useMemo(() => {
    const valid = parsed.filter((row) =>
      /^\d{8}$/.test(row.dni) &&
      Boolean(row.full_name) &&
      (!row.pin || /^\d{4,8}$/.test(row.pin))
    )
    return {
      total: parsed.length,
      valid: valid.length,
      errors: parsed.length - valid.length,
    }
  }, [parsed])

  async function loadProfiles() {
    setLoading(true)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id,dni,full_name,role,active,warehouse,project,group_name,shift_name,position,created_at')
      .order('full_name')
    if (error) setMessage(error.message)
    setProfiles((data ?? []) as ProfileRow[])
    setLoading(false)
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  async function onFile(file?: File) {
    if (!file) return
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setMessage('Para Excel, copia las filas y pégalas en el cuadro o guarda el archivo como CSV.')
      return
    }
    setFileName(file.name)
    setImportText(await file.text())
    setResults([])
    setMessage('')
  }

  async function createCallaoTestUsers() {
    const users: ImportUser[] = [
      {
        dni: '99990001',
        full_name: 'Coordinador Callao',
        role: 'COORDINADOR',
        warehouse: 'CALLAO',
        project: 'INBOUND CALLAO',
        group_name: 'INBOUND',
        shift_name: 'GUARDIA A',
        position: 'COORDINADOR ALMACEN CALLAO',
        pin: '431827',
      },
      {
        dni: '99990002',
        full_name: 'Supervisor Callao',
        role: 'SUPERVISOR',
        warehouse: 'CALLAO',
        project: 'INBOUND CALLAO',
        group_name: 'INBOUND',
        shift_name: 'GUARDIA A',
        position: 'SUPERVISOR CALLAO',
        pin: '572904',
      },
    ]

    setImporting(true)
    setMessage('')
    setResults([])

    const { data, error } = await supabase.functions.invoke('admin-bulk-users', {
      body: { users, fileName: 'usuarios_prueba_callao.csv' },
    })

    setImporting(false)

    if (error || !data?.ok) {
      setMessage(data?.error || error?.message || 'No se pudieron crear los usuarios de prueba Callao.')
      return
    }

    const resultRows = (data.results ?? []) as ImportResult[]
    setResults(resultRows)

    for (const row of users) {
      await supabase
        .from('user_profiles')
        .update({
          shift_name: row.shift_name,
          position: row.position,
          warehouse: row.warehouse,
          project: row.project,
          group_name: row.group_name,
          role: row.role,
          active: true,
        })
        .eq('dni', row.dni)
    }

    setMessage('Usuarios de prueba Callao procesados. Coordinador: 99990001 / PIN 431827 · Supervisor: 99990002 / PIN 572904.')
    await loadProfiles()
  }

  async function createUsers() {
    setMessage('')
    setResults([])
    if (!parsed.length) {
      setMessage('No se detectaron filas. Usa la plantilla o copia las columnas desde Excel.')
      return
    }
    if (parsed.length > 200) {
      setMessage('El máximo por lote es 200 usuarios.')
      return
    }
    if (validation.errors > 0) {
      setMessage('Corrige las filas inválidas antes de crear los usuarios.')
      return
    }

    setImporting(true)
    const { data, error } = await supabase.functions.invoke('admin-bulk-users', {
      body: { users: parsed, fileName },
    })
    setImporting(false)

    if (error) {
      setMessage(error.message || 'No se pudo ejecutar la carga masiva.')
      return
    }
    if (!data?.ok) {
      setMessage(data?.error || 'La importación no pudo completarse.')
      return
    }

    const resultRows = (data.results ?? []) as ImportResult[]
    setResults(resultRows)

    for (const row of parsed) {
      if (!row.shift_name) continue
      await supabase
        .from('user_profiles')
        .update({ shift_name: row.shift_name })
        .eq('dni', row.dni)
    }

    setMessage(`Importación terminada: ${data.summary.created} creados, ${data.summary.skipped} existentes y ${data.summary.errors} errores.`)
    await loadProfiles()
  }

  function downloadTemplate() {
    downloadCsv('KOMTROL_Plantilla_Usuarios.csv', [
      ['DNI', 'NOMBRE', 'ROL', 'ALMACEN', 'PROYECTO', 'GRUPO', 'GUARDIA', 'CARGO', 'PIN'],
      ['12345678', 'NOMBRE APELLIDO', 'TRABAJADOR', 'ANTAMINA', 'ALMACEN ANTAMINA', 'PALAS', 'GUARDIA A', 'ALMACENERO', ''],
      ['87654321', 'NOMBRE APELLIDO', 'COORDINADOR', 'CALLAO', 'INBOUND CALLAO', 'INBOUND', 'GUARDIA A', 'COORDINADOR', ''],
    ])
  }

  function downloadCredentials() {
    const created = results.filter((r) => r.status === 'CREADO')
    if (!created.length) return
    downloadCsv('KOMTROL_Credenciales_Creadas.csv', [
      ['DNI', 'NOMBRE', 'ROL', 'ALMACEN', 'PROYECTO', 'GRUPO', 'GUARDIA', 'PIN'],
      ...created.map((r) => [r.dni, r.full_name, r.role, r.warehouse, r.project, r.group_name, r.shift_name || '', r.pin]),
    ])
  }

  const visibleProfiles = profiles.filter((p) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return [p.dni, p.full_name, p.role, p.warehouse, p.project, p.group_name]
      .some((value) => String(value ?? '').toLowerCase().includes(q))
  })

  return (
    <div className="users-admin">
      <section className="panel">
        <div className="panel-title users-title">
          <div>
            <h3>Usuarios y accesos</h3>
            <p>Crea personal masivamente con DNI + PIN y asigna rol, almacén, proyecto y grupo.</p>
          </div>
          <div className="button-row">
            <button className="secondary-button" disabled={importing} onClick={createCallaoTestUsers}><Users size={17} /> Crear pruebas Callao</button>
            <button className="secondary-button" onClick={downloadTemplate}><Download size={17} /> Plantilla CSV</button>
            <button className="icon-button" onClick={loadProfiles} title="Actualizar"><RefreshCw size={18} /></button>
          </div>
        </div>

        <div className="bulk-user-grid">
          <div className="bulk-input-card">
            <div className="bulk-step"><span>1</span><div><b>Copia desde Excel o carga CSV</b><small>Columnas: DNI, NOMBRE, ROL, ALMACEN, PROYECTO, GRUPO, GUARDIA, CARGO, PIN.</small></div></div>
            <label className="upload-box compact-upload">
              <FileUp size={20} />
              <span><b>Seleccionar CSV</b><small>También puedes pegar directamente filas copiadas de Excel.</small></span>
              <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <textarea
              className="bulk-textarea"
              rows={9}
              value={importText}
              onChange={(e) => { setImportText(e.target.value); setResults([]); setMessage('') }}
              placeholder={'DNI\tNOMBRE\tROL\tALMACEN\tPROYECTO\tGRUPO\tGUARDIA\tCARGO\tPIN\n12345678\tNOMBRE APELLIDO\tTRABAJADOR\tANTAMINA\tALMACEN ANTAMINA\tPALAS\tGUARDIA A\tALMACENERO\t'}
            />
            <small className="muted">Si PIN queda vacío, KOMTROL genera automáticamente un PIN de 6 dígitos y lo muestra una sola vez en el resultado.</small>
          </div>

          <div className="bulk-summary-card">
            <div className="bulk-step"><span>2</span><div><b>Validación previa</b><small>No se crea ningún usuario hasta confirmar.</small></div></div>
            <div className="mini-kpis">
              <div><b>{validation.total}</b><span>Total filas</span></div>
              <div><b>{validation.valid}</b><span>Válidas</span></div>
              <div><b>{validation.errors}</b><span>Con error</span></div>
            </div>
            <div className="validation-list">
              <p><CheckCircle2 size={16} /> DNI de 8 dígitos</p>
              <p><CheckCircle2 size={16} /> Nombre obligatorio</p>
              <p><CheckCircle2 size={16} /> Roles KOMTROL válidos</p>
              <p><CheckCircle2 size={16} /> PIN 4–8 dígitos o autogenerado</p>
            </div>
            <button className="primary-button full" disabled={importing || !parsed.length || validation.errors > 0} onClick={createUsers}>
              {importing ? <RefreshCw size={17} className="spin" /> : <Upload size={17} />}
              {importing ? 'Creando usuarios…' : `Crear ${validation.valid} usuarios`}
            </button>
          </div>
        </div>

        {message && <div className="inline-message">{message}</div>}

        {parsed.length > 0 && (
          <div className="table-wrap preview-table">
            <table>
              <thead><tr><th>DNI</th><th>Nombre</th><th>Rol</th><th>Almacén</th><th>Proyecto</th><th>Grupo</th><th>Guardia</th><th>PIN</th><th>Validación</th></tr></thead>
              <tbody>
                {parsed.slice(0, 30).map((row, index) => {
                  const ok = /^\d{8}$/.test(row.dni) && Boolean(row.full_name) && (!row.pin || /^\d{4,8}$/.test(row.pin))
                  return (
                    <tr key={index}>
                      <td><b>{row.dni || '—'}</b></td>
                      <td>{row.full_name || '—'}</td>
                      <td><span className="role-chip">{row.role}</span></td>
                      <td>{row.warehouse || '—'}</td>
                      <td>{row.project || '—'}</td>
                      <td>{row.group_name || '—'}</td>
                      <td>{row.shift_name || '—'}</td>
                      <td>{row.pin ? 'Definido' : 'Auto'}</td>
                      <td>{ok ? <span className="ok-text"><CheckCircle2 size={15} /> Válido</span> : <span className="error-text"><XCircle size={15} /> Revisar</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {parsed.length > 30 && <div className="table-note">Vista previa: 30 de {parsed.length} filas.</div>}
          </div>
        )}

        {results.length > 0 && (
          <div className="results-block">
            <div className="panel-title">
              <div><h3>Resultado de la importación</h3><p>Los PIN generados se muestran para entrega al usuario y no se guardan como texto en la base.</p></div>
              <button className="secondary-button" onClick={downloadCredentials}><Download size={17} /> Descargar credenciales</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Estado</th><th>DNI</th><th>Nombre</th><th>Rol</th><th>PIN</th><th>Detalle</th></tr></thead>
                <tbody>
                  {results.map((r, index) => (
                    <tr key={index}>
                      <td><span className={r.status === 'CREADO' ? 'status-pill' : r.status === 'EXISTE' ? 'status-pill warning' : 'status-pill danger'}>{r.status}</span></td>
                      <td><b>{r.dni}</b></td>
                      <td>{r.full_name}</td>
                      <td>{r.role || '—'}</td>
                      <td>{r.status === 'CREADO' ? r.pin : '—'}</td>
                      <td>{r.error || (r.generated_pin ? 'PIN autogenerado' : 'Creado correctamente')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-title">
          <div><h3>Usuarios registrados</h3><p>{profiles.length} perfiles en KOMTROL.</p></div>
          <div className="search users-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar DNI, nombre, rol, almacén…" /></div>
        </div>
        {loading ? (
          <div className="screen-center compact"><RefreshCw className="spin" size={22} /><p>Cargando usuarios…</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Estado</th><th>DNI</th><th>Nombre</th><th>Rol</th><th>Almacén</th><th>Proyecto</th><th>Grupo</th><th>Guardia</th><th>Cargo</th></tr></thead>
              <tbody>
                {visibleProfiles.map((p) => (
                  <tr key={p.user_id}>
                    <td><span className={p.active ? 'status-pill' : 'status-pill danger'}>{p.active ? 'ACTIVO' : 'INACTIVO'}</span></td>
                    <td><b>{p.dni}</b></td>
                    <td>{p.full_name}</td>
                    <td><span className="role-chip"><ShieldCheck size={13} /> {p.role}</span></td>
                    <td>{p.warehouse || '—'}</td>
                    <td>{p.project || '—'}</td>
                    <td>{p.group_name || '—'}</td>
                    <td>{p.shift_name || '—'}</td>
                    <td>{p.position || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleProfiles.length && <div className="empty-table"><Users size={28} /><p>No hay usuarios para mostrar.</p></div>}
          </div>
        )}
      </section>
    </div>
  )
}
