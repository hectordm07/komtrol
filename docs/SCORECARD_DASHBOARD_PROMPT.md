# Prompt maestro — Scorecard KOMTROL (12 reportes)

Actúa como Product Designer senior y Frontend Engineer especializado en dashboards operativos de logística/minería. Trabaja directamente sobre el proyecto KOMTROL existente, sin crear una app paralela.

## Objetivo
Unificar los 12 reportes del Scorecard con una experiencia visual profesional, compacta, didáctica y consistente con los dashboards de referencia entregados por el usuario. Todos deben caber en una sola vista de monitor cuando sea posible y mantener una versión responsive limpia para celular/tablet.

## Regla visual principal
- Mantener la identidad KOMTROL: azul marino, verde, rojo, naranja y fondos claros.
- Usar tarjetas con bordes suaves, radios consistentes, sombras discretas y tipografía legible.
- Evitar gráficos genéricos, espacios vacíos excesivos, textos diminutos, filtros duplicados o elementos cruzados.
- En desktop usar filtros laterales de "solo clic": AÑO, CENTRO/GRUPO, MES y, cuando corresponda, STATUS/DETALLE/ESTADO.
- Los meses se muestran como botones. El valor activo se resalta en verde.
- Los grupos se muestran como botones: Proyecto, Sucursal, Tienda y cualquier grupo adicional real del reporte (Consignaciones, etc.).
- Los gráficos deben mostrar valores, meta cuando exista y nombres completos o abreviados de forma legible.
- Debe existir jerarquía clara: filtros a la izquierda, KPI arriba, análisis principal al centro/derecha y gráfico principal en la zona de mayor tamaño.

## Datos
- No inventar información.
- Consumir exclusivamente los datos reales de Supabase / scorecard_rows.
- Cargar y permitir navegar el histórico disponible desde 2024 en adelante.
- Año y mes deben cambiar los datos reales del dashboard al hacer clic.
- Los filtros por grupo/status/detalle deben filtrar los datos reales, no solo cambiar la apariencia.
- Si no hay datos, mostrar estado vacío profesional.

## Administración
El botón "Datos / Cargar" debe existir en los 12 reportes, visible solo para ADMINISTRADOR.
Solo ADMINISTRADOR puede:
- Ver la tabla de datos del reporte.
- Cargar Excel.
- Crear registros.
- Editar registros.
- Guardar cambios.
- Eliminar registros.
- Actualizar fuentes automáticas cuando aplique.
Coordinador, Supervisor y Trabajador no deben ver ni poder abrir el panel administrativo.

## Los 12 reportes
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

## Diseño por reporte
- Inbound/Outbound: KPI horas/personal, Inbound verde, Outbound rojo, gauge Productividad IL y barras por sede con Meta 45.
- ERI: filtros laterales; Promedio IL, Promedio $, No presentaron, ERI <99.5%, tendencia ERI y barras comparativas con Meta 99.50%.
- Sobrantes/Faltantes: Total $, Total SKUs, Total unidades, filtro Status, proyecto con mayor diferencia y evolución $.
- Diferencias Inventario: Total $, SKUs, unidades, filtro Detalle, mayor diferencia y evolución por sede.
- Dañados: Total $, SKUs, unidades, mayor diferencia y evolución por sede.
- Tránsitos: KPIs por rangos de antigüedad, Total Tránsito y gráficos por rango.
- Activos/Inactivos: KPIs de centros activos/inactivos, valor y unidades; barras por centro.
- UCA: ubicaciones libres, % ubicaciones libres, UCA promedio y barras por sede.
- Ahorros: total ahorro, top 3 sedes con detalle y gráfico de variación de ahorro.
- Perfect Ship Outbound: promedio % cumplimiento en anillo y barras por sede con Meta 98%.
- Perfect Ship Inbound: mismo patrón, con identidad naranja y Meta 98%.
- SAFE: filtros Año/Mes, panel de conducción peligrosa/insegura y variación por proyecto/placa.

## Responsive
Desktop/monitor:
- Priorizar una sola vista sin scroll vertical.
- No comprimir tanto que se pierda legibilidad.
- Ajustar proporciones automáticamente para 1366x768, 1536x791 y 1920x1080.

Móvil:
- No replicar el layout desktop a escala.
- Apilar tarjetas, mantener 2 columnas solo cuando sea legible.
- Evitar cualquier superposición con navegación inferior.
- Permitir scroll horizontal solo dentro de gráficos muy anchos.
- Nunca cortar filtros, valores, nombres o etiquetas.

## Validación antes de terminar
1. Confirmar build TypeScript/Vite sin errores.
2. Confirmar despliegue Vercel exitoso.
3. Revisar los 12 reportes.
4. Confirmar histórico de años/meses.
5. Confirmar filtros clicables.
6. Confirmar "Datos / Cargar" solo Admin.
7. Confirmar edición/creación/eliminación solo Admin.
8. Confirmar que no hay textos cortados, gráficos cruzados ni tarjetas fuera de pantalla.
9. Mantener exportación PDF/Excel.
10. No eliminar funcionalidades existentes.

Ejecuta los cambios directamente en el proyecto y valida el deploy final.
