import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, ChevronDown, ChevronRight, Factory, Search, Store, Warehouse } from 'lucide-react'

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
  const [expandedGroups,setExpandedGroups]=useState<Set<DashboardRemoteGroup>>(new Set())
  const [expandedWarehouses,setExpandedWarehouses]=useState<Set<string>>(new Set())

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

  useEffect(()=>{
    if(!open) return

    if(query.trim()){
      setExpandedGroups(new Set(grouped.map((group)=>group.key)))
      setExpandedWarehouses(new Set(
        grouped.flatMap((group)=>group.warehouses.map((warehouse)=>warehouse.code))
      ))
      return
    }

    if(value.startsWith('GRUPO:')){
      const groupKey=value.slice(6) as DashboardRemoteGroup
      setExpandedGroups((current)=>new Set(current).add(groupKey))
      return
    }

    if(value.startsWith('ALMACEN:')){
      const warehouseCode=value.slice(8)
      const warehouse=warehouses.find((item)=>item.code===warehouseCode)
      if(warehouse?.remote_group){
        setExpandedGroups((current)=>new Set(current).add(warehouse.remote_group as DashboardRemoteGroup))
      }
      return
    }

    if(value.startsWith('CENTRO:')){
      const centerCode=value.slice(7)
      const center=centers.find((item)=>item.code===centerCode)
      const warehouse=warehouses.find((item)=>item.code===center?.warehouse_code)
      if(warehouse?.remote_group){
        setExpandedGroups((current)=>new Set(current).add(warehouse.remote_group as DashboardRemoteGroup))
      }
      if(warehouse){
        setExpandedWarehouses((current)=>new Set(current).add(warehouse.code))
      }
    }
  },[open,query,value,grouped,warehouses,centers])

  function toggleGroup(groupKey:DashboardRemoteGroup){
    setExpandedGroups((current)=>{
      const next=new Set(current)
      if(next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  function toggleWarehouse(warehouseCode:string){
    setExpandedWarehouses((current)=>{
      const next=new Set(current)
      if(next.has(warehouseCode)) next.delete(warehouseCode)
      else next.add(warehouseCode)
      return next
    })
  }

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

            {grouped.map((group)=>{
              const groupExpanded=expandedGroups.has(group.key)
              return (
                <section className="dashboard-hierarchy-group" key={group.key}>
                  <div className={value===`GRUPO:${group.key}`?'dashboard-hierarchy-group-head selected':'dashboard-hierarchy-group-head'}>
                    <button
                      type="button"
                      className="dashboard-hierarchy-expand"
                      title={groupExpanded?'Contraer grupo':'Ampliar grupo'}
                      aria-label={groupExpanded?`Contraer ${group.label}`:`Ampliar ${group.label}`}
                      onClick={()=>toggleGroup(group.key)}
                    >
                      {groupExpanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}
                    </button>
                    <button
                      type="button"
                      className="dashboard-hierarchy-select"
                      onClick={()=>choose(`GRUPO:${group.key}`)}
                    >
                      <GroupIcon kind={group.icon}/>
                      <b>{group.label}</b>
                      <small>{group.warehouses.length} almacenes</small>
                    </button>
                    {value===`GRUPO:${group.key}`&&<Check size={14}/>}
                  </div>

                  {groupExpanded&&(
                    <div className="dashboard-hierarchy-warehouses">
                      {group.warehouses.map((warehouse)=>{
                        const warehouseExpanded=expandedWarehouses.has(warehouse.code)
                        const hasCenters=warehouse.centers.length>0
                        return (
                          <div className="dashboard-hierarchy-warehouse" key={warehouse.code}>
                            <div className={value===`ALMACEN:${warehouse.code}`?'dashboard-hierarchy-warehouse-row selected':'dashboard-hierarchy-warehouse-row'}>
                              {hasCenters?(
                                <button
                                  type="button"
                                  className="dashboard-hierarchy-expand"
                                  title={warehouseExpanded?'Contraer centros':'Ampliar centros'}
                                  aria-label={warehouseExpanded?`Contraer ${warehouse.name}`:`Ampliar ${warehouse.name}`}
                                  onClick={()=>toggleWarehouse(warehouse.code)}
                                >
                                  {warehouseExpanded?<ChevronDown size={13}/>:<ChevronRight size={13}/>}
                                </button>
                              ):(
                                <span className="dashboard-hierarchy-expand-spacer"/>
                              )}
                              <button
                                type="button"
                                className="dashboard-hierarchy-select"
                                onClick={()=>choose(`ALMACEN:${warehouse.code}`)}
                              >
                                <Warehouse size={13}/>
                                <b>{warehouse.name}</b>
                              </button>
                              {value===`ALMACEN:${warehouse.code}`&&<Check size={13}/>}
                            </div>

                            {hasCenters&&warehouseExpanded&&(
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
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}

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
