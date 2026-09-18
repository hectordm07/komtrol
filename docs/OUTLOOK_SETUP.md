# Microsoft 365 / Outlook - KOMTROL

## Objetivo
Cuando se confirme una incidencia de almacén, KOMTROL genera una notificación, toma destinatarios configurados, adjunta evidencias y envía el correo mediante Microsoft Graph.

## Datos que debe proporcionar TI
- Tenant ID
- Client ID
- Client Secret temporal o certificado para producción
- Buzón autorizado para envíos

## Microsoft Graph
Registrar KOMTROL en Microsoft Entra ID con permiso de aplicación `Mail.Send` y consentimiento de administrador.

Recomendación: restringir el acceso de la aplicación al buzón de KOMTROL autorizado por TI.

## Secretos de Supabase Edge Functions
Configurar, sin subirlos a GitHub:
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_SENDER_MAILBOX`

## Flujo
1. Registrar faltante, dañado o diferencia.
2. Guardar guía/fotos/reporte en Storage privado.
3. Confirmar incidencia.
4. Invocar `send-outlook-notification` con el `incidentId`.
5. La función obtiene la regla de destinatarios desde Supabase.
6. Microsoft Graph realiza el envío.
7. KOMTROL registra estado, fecha y resultado.
