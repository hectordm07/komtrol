# Prompt maestro — Scorecard KOMTROL · Power BI Executive Standard

Actúa como **especialista senior en Power BI, analítica operacional, UX de dashboards y frontend enterprise**. Trabaja directamente sobre el proyecto KOMTROL existente y ejecuta los cambios en producción. No crear una aplicación paralela ni reemplazar la lógica de negocio ya implementada.

## Referencia visual obligatoria
El **Reporte 01 — Inbound & Outbound** es el patrón maestro de composición para los 12 reportes.

Todos deben compartir:
- mismo ancho de panel lateral de filtros;
- misma jerarquía tipográfica;
- mismos radios, bordes y espaciados;
- mismo tamaño visual de botones de Año / Centro / Mes;
- misma altura y densidad de la barra superior;
- gráficos grandes y legibles;
- ausencia de scroll vertical de página en desktop;
- interacción tipo Power BI: hover sobre gráfico = mostrar valores y contexto;
- diseño profesional, ejecutivo, compacto y legible.

No reducir textos a tamaños ilegibles para intentar hacer caber el contenido.

## Objetivo desktop
En resoluciones corporativas **1366×768, 1536×791 y 1920×1080**:
- Topbar + saludo + toolbar + dashboard deben entrar dentro de una sola pantalla.
- El body/main del Scorecard no debe mostrar scroll vertical.
- No debe existir un segundo scroll interno en los dashboards.
- El canvas de cada reporte debe utilizar todo el alto restante real del viewport.
- Mantener un mínimo visual equivalente al Reporte 01.

## Filtros
En los 12 reportes usar filtros laterales de selección directa, no dropdowns cuando no sean necesarios.

### AÑO
Mostrar los años disponibles como botones: 2026, 2025, 2024 y cualquier otro año existente en los datos.

### CENTRO
Mostrar siempre: TODOS, PROYECTO, SUCURSAL, TIENDA.
Si el reporte contiene grupos adicionales reales, agregarlos sin ocultar los anteriores.

### MES
Mostrar meses como matriz de 3 columnas, con selección en verde.

### Filtros específicos
Agregar STATUS / DETALLE / ESTADO solo cuando correspondan al reporte, conservando el mismo estilo.

## Interacción tipo Power BI
Todo gráfico debe ser dinámico:
- hover sobre barras;
- hover sobre puntos;
- hover sobre ranking;
- tooltip con nombre, periodo y métricas relevantes;
- resaltar visualmente el elemento bajo el puntero;
- filtros deben afectar realmente todos los KPI y gráficos.

## Datos
No inventar información.
Consumir exclusivamente información real de Supabase / scorecard_rows.
Permitir navegar todo el histórico disponible desde 2024.
Los 6 últimos meses deben cruzar correctamente de año cuando corresponda.

## Reportes
1. Inbound & Outbound
2. ERI
3. Sobrantes / Faltantes
4. Diferencias de Inventario
5. Dañados
6. Tránsitos
7. Centros Activos / Inactivos
8. UCA
9. Ahorros
10. Perfect Ship Outbound
11. Perfect Ship Inbound
12. SAFE

## Reporte 03 — Sobrantes / Faltantes
Debe mostrar:
- filtros completos y visibles;
- Total $;
- Total SKUs;
- Total unidades;
- variación vs mes anterior;
- evolución de los **últimos 6 meses**;
- tooltip mensual con USD, SKU y unidades;
- Top sedes del mes;
- mayor diferencia del mes;
- selector Status TODOS / FALTANTE / SOBRANTE;
- sin desbordar la pantalla.

## Administración
En los 12 reportes mantener:
**PDF | Excel | Datos / Cargar | Actualizar**

Datos / Cargar es exclusivo para ADMINISTRADOR e incluye:
- ver tabla fuente;
- cargar Excel;
- editar datos;
- guardar;
- nuevo registro;
- eliminar;
- actualizar fuente automática cuando corresponda.

Coordinador, Supervisor y Trabajador no deben ver ni ejecutar estas funciones.

## Responsive
Desktop:
- una sola vista;
- cero scroll vertical del Scorecard;
- sin cortar filtros;
- sin compactación extrema.

Móvil/tablet:
- diseño adaptado;
- sí se permite scroll vertical natural;
- evitar superposición con navegación inferior;
- gráficos anchos pueden tener scroll horizontal dentro de su tarjeta.

## Validación obligatoria
Antes de dar por terminado:
1. revisar reporte por reporte del 1 al 12;
2. confirmar que todos cargan;
3. confirmar filtros visibles;
4. confirmar años disponibles;
5. confirmar hover/tooltips;
6. confirmar datos reales;
7. confirmar Datos / Cargar solo Admin;
8. confirmar que no hay scrollbar vertical de página en desktop;
9. confirmar que no hay tarjetas cortadas;
10. confirmar build Vite/TypeScript;
11. confirmar despliegue Vercel en estado Success.

**No informar que el trabajo terminó hasta que la validación final sea satisfactoria.**