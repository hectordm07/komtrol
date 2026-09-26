export type DashboardViewport = 'desktop' | 'tablet' | 'mobile'
export type DashboardSlotKey = 'filters' | 'kpis' | 'main' | 'secondary'

export type DashboardSlotConfig = {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

export type DashboardThemeConfig = {
  primary: string
  titleColor: string
  cardBackground: string
  appBackground: string
  borderColor: string
  chartColor: string
  successColor: string
  dangerColor: string
  cardRadius: number
  titleSize: number
  valueSize: number
  gap: number
}

export type DashboardLayoutConfig = {
  version: 1
  reportTitle: string
  reportDescription: string
  theme: DashboardThemeConfig
  slots: Record<DashboardSlotKey, DashboardSlotConfig>
}

export type DashboardLayoutRow = {
  viewport: DashboardViewport
  config: DashboardLayoutConfig | Record<string, unknown>
}

export const DASHBOARD_REPORTS = [
  { code: 'inbound-outbound', label: '1. Inbound / Outbound' },
  { code: 'eri', label: '2. ERI' },
  { code: 'sobrantes-faltantes', label: '3. Sobrantes / Faltantes' },
  { code: 'diferencias-inventario', label: '4. Diferencias Inventario' },
  { code: 'danados-scorecard', label: '5. Dañados' },
  { code: 'dashboard-transitos', label: '6. Tránsitos' },
  { code: 'activos-inactivos', label: '7. Activos / Inactivos' },
  { code: 'uca', label: '8. UCA' },
  { code: 'ahorros', label: '9. Ahorros' },
  { code: 'perfect-ship-outbound', label: '10. Perfect Ship Out' },
  { code: 'perfect-ship-inbound', label: '11. Perfect Ship In' },
  { code: 'safe', label: '12. SAFE' },
] as const

export const DASHBOARD_VIEWPORTS: Array<{value:DashboardViewport;label:string}> = [
  { value: 'desktop', label: 'Laptop / Desktop' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'mobile', label: 'Móvil' },
]

export const DASHBOARD_SLOT_LABELS: Record<DashboardSlotKey,string> = {
  filters: 'Filtros / panel lateral',
  kpis: 'Tarjetas KPI',
  main: 'Gráfico principal',
  secondary: 'Resumen / gráfico secundario',
}

const SLOT_SELECTORS: Record<string,Record<DashboardSlotKey,string>> = {
  'inbound-outbound': {
    filters: '.io-sidebar-stack',
    kpis: '.io-dashboard-top',
    main: '.io-productivity-panel',
    secondary: '.io-dashboard-bottom',
  },
  eri: {
    filters: '.eri-filter-rail',
    kpis: '.eri-top-grid',
    main: '.eri-bars-card',
    secondary: '.eri-trend-card',
  },
  'sobrantes-faltantes': {
    filters: '.sf3-left',
    kpis: '.sf3-kpis',
    main: '.sf3-evolution',
    secondary: '.sf3-highlight',
  },
  'diferencias-inventario': {
    filters: '.sf3-left',
    kpis: '.sf3-kpis',
    main: '.sf3-evolution',
    secondary: '.sf3-highlight',
  },
}

const PROFESSIONAL_SELECTORS: Record<DashboardSlotKey,string> = {
  filters: '.psc-filter-rail',
  kpis: '.psc-top-metrics,.psc-transit-grid,.psc-safe-risk,.psc-compliance-card,.psc-highlight-card',
  main: '.psc-main-panel,.sf-variation-panel,.psc-savings-table,.psc-risk-columns',
  secondary: '.sf-six-month-panel,.sf-top-sites,.psc-compliance-card,.psc-highlight-card',
}

export function defaultDashboardLayoutConfig(): DashboardLayoutConfig {
  return {
    version: 1,
    reportTitle: '',
    reportDescription: '',
    theme: {
      primary: '#17336F',
      titleColor: '#17336F',
      cardBackground: '#FFFFFF',
      appBackground: '#F6F8FC',
      borderColor: '#DCE4F1',
      chartColor: '#16458F',
      successColor: '#0AA855',
      dangerColor: '#EF3D36',
      cardRadius: 16,
      titleSize: 9,
      valueSize: 38,
      gap: 10,
    },
    slots: {
      filters: { x: 0, y: 0, width: 100, height: 100, visible: true },
      kpis: { x: 0, y: 0, width: 100, height: 100, visible: true },
      main: { x: 0, y: 0, width: 100, height: 100, visible: true },
      secondary: { x: 0, y: 0, width: 100, height: 100, visible: true },
    },
  }
}

function num(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function text(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function color(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback
}

export function normalizeDashboardLayoutConfig(value: unknown): DashboardLayoutConfig {
  const base = defaultDashboardLayoutConfig()
  const input = value && typeof value === 'object' ? value as Record<string,any> : {}
  const theme = input.theme && typeof input.theme === 'object' ? input.theme : {}
  const slots = input.slots && typeof input.slots === 'object' ? input.slots : {}

  const normalizeSlot = (key: DashboardSlotKey): DashboardSlotConfig => {
    const source = slots[key] && typeof slots[key] === 'object' ? slots[key] : {}
    return {
      x: Math.max(-480, Math.min(480, num(source.x, base.slots[key].x))),
      y: Math.max(-480, Math.min(480, num(source.y, base.slots[key].y))),
      width: Math.max(55, Math.min(145, num(source.width, base.slots[key].width))),
      height: Math.max(55, Math.min(145, num(source.height, base.slots[key].height))),
      visible: source.visible === undefined ? base.slots[key].visible : Boolean(source.visible),
    }
  }

  return {
    version: 1,
    reportTitle: typeof input.reportTitle === 'string' ? input.reportTitle : '',
    reportDescription: typeof input.reportDescription === 'string' ? input.reportDescription : '',
    theme: {
      primary: color(theme.primary, base.theme.primary),
      titleColor: color(theme.titleColor, base.theme.titleColor),
      cardBackground: color(theme.cardBackground, base.theme.cardBackground),
      appBackground: color(theme.appBackground, base.theme.appBackground),
      borderColor: color(theme.borderColor, base.theme.borderColor),
      chartColor: color(theme.chartColor, base.theme.chartColor),
      successColor: color(theme.successColor, base.theme.successColor),
      dangerColor: color(theme.dangerColor, base.theme.dangerColor),
      cardRadius: Math.max(6, Math.min(32, num(theme.cardRadius, base.theme.cardRadius))),
      titleSize: Math.max(7, Math.min(18, num(theme.titleSize, base.theme.titleSize))),
      valueSize: Math.max(22, Math.min(64, num(theme.valueSize, base.theme.valueSize))),
      gap: Math.max(2, Math.min(30, num(theme.gap, base.theme.gap))),
    },
    slots: {
      filters: normalizeSlot('filters'),
      kpis: normalizeSlot('kpis'),
      main: normalizeSlot('main'),
      secondary: normalizeSlot('secondary'),
    },
  }
}

export function dashboardViewportForWidth(width: number): DashboardViewport {
  if (width <= 760) return 'mobile'
  if (width <= 1199) return 'tablet'
  return 'desktop'
}

function slotSelectors(reportCode: string) {
  return SLOT_SELECTORS[reportCode] || PROFESSIONAL_SELECTORS
}

function scoped(scope: string, selectors: string) {
  return selectors
    .split(',')
    .map((selector)=>`${scope} ${selector.trim()}`)
    .join(',')
}

function slotCss(scope: string, reportCode: string, config: DashboardLayoutConfig) {
  const selectors = slotSelectors(reportCode)
  return (Object.keys(config.slots) as DashboardSlotKey[]).map((key)=>{
    const slot = config.slots[key]
    const selector = scoped(scope, selectors[key])
    if (!slot.visible) return `${selector}{display:none!important;}`
    return `${selector}{
      translate:${slot.x}px ${slot.y}px!important;
      scale:${slot.width/100} ${slot.height/100}!important;
      transform-origin:top left!important;
    }`
  }).join('\n')
}

function themeCss(scope: string, config: DashboardLayoutConfig) {
  const t = config.theme
  const cards = scoped(scope, [
    '.io-mini-card','.io-trend-card','.io-gauge-card','.io-productivity-panel',
    '.eri-ring-card','.eri-status-card','.eri-trend-card','.eri-bars-card',
    '.psc-metric-card','.psc-highlight-card','.psc-compliance-card','.psc-safe-risk',
    '.psc-main-panel','.sf-six-month-panel','.sf-top-sites','.sf3-kpi','.sf3-highlight','.sf3-evolution'
  ].join(','))

  const headings = scoped(scope, [
    '.io-mini-copy>span','.io-card-heading small','.io-productivity-head small',
    '.eri-card-title b','.eri-trend-title b','.psc-card-ribbon','.psc-panel-ribbon',
    '.sf-panel-head b','.sf3-kpi-copy small','.sf3-highlight-title'
  ].join(','))

  const values = scoped(scope, [
    '.io-mini-copy strong','.io-card-heading strong','.eri-ring-wrap strong',
    '.psc-metric-main strong','.sf3-kpi-copy strong'
  ].join(','))

  const primaryPanels = scoped(scope, [
    '.psc-panel-ribbon','.sf-panel-head','.sf3-evolution-head','.eri-bars-head'
  ].join(','))

  return `
${scope}{
  --kds-primary:${t.primary}!important;
  --kds-title-color:${t.titleColor}!important;
  --kds-card:${t.cardBackground}!important;
  --kds-app:${t.appBackground}!important;
  --kds-border:${t.borderColor}!important;
  --kds-chart-blue:${t.chartColor}!important;
  --kds-success:${t.successColor}!important;
  --kds-danger:${t.dangerColor}!important;
  --kds-card-radius:${t.cardRadius}px!important;
  --kds-title-size:${t.titleSize}px!important;
  --kds-value-size:${t.valueSize}px!important;
  --kds-editor-gap:${t.gap}px!important;
  background:${t.appBackground}!important;
  gap:${t.gap}px!important;
}
${cards}{
  background:${t.cardBackground}!important;
  border-color:${t.borderColor}!important;
  border-radius:${t.cardRadius}px!important;
}
${headings}{
  color:${t.titleColor}!important;
  font-size:${t.titleSize}px!important;
}
${values}{
  font-size:${t.valueSize}px!important;
}
${primaryPanels}{
  background:${t.primary}!important;
}
${scoped(scope,'.sf3-trend-io .line,.psc-metric-trend6 .trend-line')}{stroke:${t.chartColor}!important;}
${scoped(scope,'.sf3-trend-io .area,.psc-metric-trend6 .trend-area')}{fill:${t.chartColor}33!important;}
`
}

export function buildDashboardLayoutCss(reportCode: string, rows: DashboardLayoutRow[]) {
  if (!rows.length) return ''
  const byViewport = new Map<DashboardViewport,DashboardLayoutConfig>()
  rows.forEach((row)=>byViewport.set(row.viewport, normalizeDashboardLayoutConfig(row.config)))
  const scope = `[data-report-code="${reportCode}"]`
  const rules: string[] = []

  const desktop = byViewport.get('desktop')
  if (desktop) {
    rules.push(`@media (min-width:1200px){${themeCss(scope,desktop)}${slotCss(scope,reportCode,desktop)}}`)
  }
  const tablet = byViewport.get('tablet')
  if (tablet) {
    rules.push(`@media (min-width:761px) and (max-width:1199px){${themeCss(scope,tablet)}${slotCss(scope,reportCode,tablet)}}`)
  }
  const mobile = byViewport.get('mobile')
  if (mobile) {
    rules.push(`@media (max-width:760px){${themeCss(scope,mobile)}${slotCss(scope,reportCode,mobile)}}`)
  }
  return rules.join('\n')
}
