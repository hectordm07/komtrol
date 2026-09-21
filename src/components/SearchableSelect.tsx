import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

export type SearchableOption = {
  value: string
  label: string
  keywords?: string
}

type Props = {
  value: string
  options: SearchableOption[]
  onChange: (value: string) => void
  placeholder?: string
  noResultsText?: string
  className?: string
  disabled?: boolean
  required?: boolean
  clearable?: boolean
  ariaLabel?: string
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Buscar…',
  noResultsText = 'No se encontraron coincidencias',
  className = '',
  disabled = false,
  required = false,
  clearable = true,
  ariaLabel,
}: Props) {
  const selected = options.find((option) => option.value === value) ?? null
  const [query, setQuery] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) setQuery(selected?.label ?? '')
  }, [selected?.label, open])

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q || (selected && normalize(selected.label) === q)) return options.slice(0, 80)
    return options
      .filter((option) => normalize(`${option.label} ${option.keywords ?? ''}`).includes(q))
      .slice(0, 80)
  }, [options, query, selected])

  function choose(option: SearchableOption) {
    onChange(option.value)
    setQuery(option.label)
    setOpen(false)
  }

  return (
    <div className={`searchable-select ${className}${disabled ? ' is-disabled' : ''}`}>
      <div className="searchable-select-control">
        <Search size={15} />
        <input
          aria-label={ariaLabel}
          disabled={disabled}
          required={required && !value}
          value={query}
          placeholder={placeholder}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(event) => {
            const next = event.target.value
            setQuery(next)
            setOpen(true)
            if (!next && clearable) onChange('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
              setQuery(selected?.label ?? '')
            }
            if (event.key === 'Enter' && open && filtered.length === 1) {
              event.preventDefault()
              choose(filtered[0])
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false)
              setQuery((current) => {
                if (!current && clearable) return ''
                return selected?.label ?? current
              })
            }, 120)
          }}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            className="searchable-select-clear"
            title="Limpiar"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('')
              setQuery('')
              setOpen(true)
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={15} className="searchable-select-chevron" />
        )}
      </div>

      {open && !disabled && (
        <div className="searchable-select-menu">
          {filtered.map((option) => (
            <button
              type="button"
              key={option.value}
              className={option.value === value ? 'selected' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} />}
            </button>
          ))}
          {!filtered.length && <div className="searchable-select-empty">{noResultsText}</div>}
        </div>
      )}
    </div>
  )
}
