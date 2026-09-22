type RowLike={year:number;month:number}

type Props={
  rows:RowLike[]
  year:number
  month:number
  group:string
  onYearChange:(year:number)=>void
  onMonthChange:(month:number)=>void
  onGroupChange:(group:string)=>void
}

const MONTHS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const GROUPS=[
  {label:'TODOS',value:'TODOS'},
  {label:'PROYECTO',value:'GRUPO:PROYECTO_MINERO'},
  {label:'SUCURSAL',value:'GRUPO:SUCURSAL'},
  {label:'TIENDA',value:'GRUPO:TIENDA'},
]

export function ScorecardClickFilters({rows,year,month,group,onYearChange,onMonthChange,onGroupChange}:Props){
  const years=Array.from(new Set(rows.map((row)=>row.year))).sort((a,b)=>b-a)
  return <aside className="scorecard-click-filters" aria-label="Filtros rápidos del reporte">
    <section>
      <b>AÑO</b>
      <div className="scorecard-click-years">
        {years.map((value)=><button key={value} type="button" className={year===value?'active':''} onClick={()=>onYearChange(value)}>{value}</button>)}
      </div>
    </section>
    <section>
      <b>CENTRO</b>
      <div className="scorecard-click-centers">
        {GROUPS.map((item)=><button key={item.value} type="button" className={group===item.value?'active':''} onClick={()=>onGroupChange(item.value)}>{item.label}</button>)}
      </div>
    </section>
    <section>
      <b>MES</b>
      <div className="scorecard-click-months">
        {MONTHS.map((label,index)=><button key={label} type="button" className={month===index+1?'active':''} onClick={()=>onMonthChange(index+1)}>{label}</button>)}
      </div>
    </section>
  </aside>
}
