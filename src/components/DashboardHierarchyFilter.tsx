import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, ChevronDown, Factory, Search, Store, Warehouse } from 'lucide-react'

export type DashboardRemoteGroup = 'PROYECTO_MINERO' | 'SUCURSAL' | 'TIENDA'

export type DashboardWarehouse = {
  code: string
  name: string
  warehouse_scope: 'REMOTO' | 'CENTRAL'
  remote_group: DashboardRemoteGroup | null
}

export type DashboardCenter = {
  warehouse_code: string
  code: string
  name: string
  business_unit: 'KMMP' | 'DCP' | 'CUMMINS' | 'GENERAL'
  active?: boolean
}

type Props = {
  value: string
  warehouses: DashboardWarehouse[]
  centers: DashboardCenter[]
  onChange: (value: string) => void
  includeAll?: boolean
  disabled?: boolean
  ariaLabel?: string
}

const GROUPS: Array<{key:DashboardRemoteGroup;label:string;icon:'mine'|'branch'|'store'}> = [
  {key:'PROYECTO_MINERO',label:'Proyectos Mineros',icon:'mine'},
  {key:'SUCURSAL',label:'Sucursales',icon:'branch'},
  {key:'TIENDA',label:'Tiendas',icon:'store'},
]

function normalize(value:string){
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toUpperCase()
    .replace(/\s+/g,' ')
    .trim()
}

export function dashboardFilterLabel(
  value:string,
  warehouses:DashboardWarehouse[],
  centers:DashboardCenter[]
){
  if(value==='TODOS') return 'Todos los grupos'
  if(value.startsWith('GRUPO:')){
    const key=value.slice(6) as DashboardRemoteGroup
    return GROUPS.find((group)=>group.key===key)?.label || key
  }
  if(value.startsWith('ALMACEN:')){
    const code=value.slice(8)
    return warehouses.find((item)=>item.code===code)?.name || code
  }
  if(value.startsWith('CENTRO:')){
    const code=value.slice(7)
    const center=centers.find((item)=>item.code===code)
    if(!center) return code
    const parent=warehouses.find((item)=>item.code===center.warehouse_code)
    return parent ? parent.name+' · '+center.business_unit : center.name
  }
  return value
}

function GroupIcon({kind}:{kind:'mine'|'branch'|'store'}){
  if(kind==='store') return <Store size={15}/>
  if(kind==='branch') return <Building2 size={15}/>
  return <Factory size={15}/>
}

export function DashboardHierarchyFilter({
  value,
  warehouses,
  centers,
  onChange,
  includeAll=true,
  disabled=false,
  ariaLabel='Filtrar Dashboard',
}:Props){
  const [open,setOpen]=useState(false)
  const [query,setQuery]=useState('')

  useEffect(()=>{
    if(!open) setQuery('')
  },[open])

  const remoteWarehouses=useMemo(
    ()=>warehouses.filter((item)=>item.warehouse_scope==='REMOTO' && item.remote_group),
    [warehouses]
  )

  const grouped=useMemo(()=>{
    const q=normalize(query)
    return GROUPS.map((group)=>{
      const groupWarehouses=remoteWarehouses
        .filter((warehouse)=>warehouse.remote_group===group.key)
        .map((warehouse)=>{
          const rawCenters=centers
            .filter((center)=>center.warehouse_code===warehouse.code && center.active!==false)
          const displayCenters=rawCenters.filter((center)=>
            center.business_unit!=='GENERAL' || rawCenters.length>1
          )
          const childCenters=displayCenters.filter((center)=>{
            if(!q) return true
            const haystack=normalize([
              group.label,
              warehouse.name,
              warehouse.code,
              center.name,
              center.code,
              center.business_unit,
            ].join(' '))
            return haystack.includes(q)
          })
          const warehouseMatches=!q || normalize([group.label,warehouse.name,warehouse.code].join(' ')).includes(q)
          if(!warehouseMatches && !childCenters.length) return null
          return {...warehouse,centers:childCenters}
        })
        .filter(Boolean) as Array<DashboardWarehouse & {centers:DashboardCenter[]}>
      return {...group,warehouses:groupWarehouses}
    }).filter((group)=>group.warehouses.length || (!q && remoteWarehouses.some((item)=>item.remote_group===group.key)))
  },[remoteWarehouses,centers,query])

  const selectedLabel=dashboardFilterLabel(value,warehouses,centers)

  function choose(next:string){
    onChange(next)
    setOpen(false)
  }

  return (
    <div className={`dashboard-hierarchy-filter${disabled?' is-disabled':''}`}>
      <button
        type="button"
        className="dashboard-hierarchy-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={()=>setOpen((current)=>!current)}
      >
        <Search size={16}/>
        <span>{selectedLabel}</span>
        <ChevronDown size={15}/>
      </button>

      {open&&!disabled&&(
        <div className="dashboard-hierarchy-menu">
          <div className="dashboard-hierarchy-search">
            <Search size={14}/>
            <input
              autoFocus
              value={query}
              onChange={(event)=>setQuery(event.target.value)}
              placeholder="Buscar grupo, almacén, KMMP o DCP…"
            />
          </div>

          <div className="dashboard-hierarchy-options">
            {includeAll&&(
              <button
                type="button"
                className={value==='TODOS'?'dashboard-hierarchy-all selected':'dashboard-hierarchy-all'}
                onClick={()=>choose('TODOS')}
              >
                <span><Warehouse size={15}/> Todos los grupos</span>
                {value==='TODOS'&&<Check size={14}/>}
              </button>
            )}

            {grouped.map((group)=>(
              <section className="dashboard-hierarchy-group" key={group.key}>
                <button
                  type="button"
                  className={value===`GRUPO:${group.key}`?'dashboard-hierarchy-group-head selected':'dashboard-hierarchy-group-head'}
                  onClick={()=>choose(`GRUPO:${group.key}`)}
                >
                  <span><GroupIcon kind={group.icon}/><b>{group.label}</b><small>{group.warehouses.length} almacenes</small></span>
                  {value===`GRUPO:${group.key}`&&<Check size={14}/>}
                </button>

                <div className="dashboard-hierarchy-warehouses">
                  {group.warehouses.map((warehouse)=>(
                    <div className="dashboard-hierarchy-warehouse" key={warehouse.code}>
                      <button
                        type="button"
                        className={value===`ALMACEN:${warehouse.code}`?'selected':''}
                        onClick={()=>choose(`ALMACEN:${warehouse.code}`)}
                      >
                        <span><Warehouse size={13}/><b>{warehouse.name}</b></span>
                        {value===`ALMACEN:${warehouse.code}`&&<Check size={13}/>}
                      </button>

                      {warehouse.centers.length>0&&(
                        <div className="dashboard-hierarchy-centers">
                          {warehouse.centers.map((center)=>(
                            <button
                              type="button"
                              key={center.code}
                              className={value===`CENTRO:${center.code}`?'selected':''}
                              onClick={()=>choose(`CENTRO:${center.code}`)}
                            >
                              <span>{center.business_unit==='GENERAL'?'General':center.business_unit}</span>
                              {value===`CENTRO:${center.code}`&&<Check size={12}/>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {!grouped.length&&(
              <div className="dashboard-hierarchy-empty">No se encontraron coincidencias.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function matchesDashboardHierarchy(
  filterValue:string,
  rawWarehouse:string,
  rawSiteName:string | null | undefined,
  warehouses:DashboardWarehouse[],
  centers:DashboardCenter[]
){
  if(filterValue==='TODOS') return true

  const warehouseText=normalize(rawWarehouse)
  const siteText=normalize(rawSiteName || '')

  let parent:DashboardWarehouse|undefined
  let center:DashboardCenter|undefined

  center=centers.find((item)=>
    normalize(item.code)===warehouseText ||
    normalize(item.name)===warehouseText ||
    (siteText && (normalize(item.code)===siteText || normalize(item.name)===siteText))
  )

  if(center){
    parent=warehouses.find((item)=>item.code===center?.warehouse_code)
  }else{
    parent=warehouses.find((item)=>
      normalize(item.code)===warehouseText ||
      normalize(item.name)===warehouseText
    )

    if(parent&&siteText){
      center=centers.find((item)=>
        item.warehouse_code===parent?.code &&
        (normalize(item.code)===siteText || normalize(item.name)===siteText || siteText.includes(normalize(item.name)))
      )
    }
  }

  if(filterValue.startsWith('GRUPO:')){
    return parent?.remote_group===filterValue.slice(6)
  }
  if(filterValue.startsWith('ALMACEN:')){
    return parent?.code===filterValue.slice(8)
  }
  if(filterValue.startsWith('CENTRO:')){
    return center?.code===filterValue.slice(7)
  }

  return normalize(rawWarehouse)===normalize(filterValue)
}
