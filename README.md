# KOMTROL

KOMTROL integra control operativo de almacén con Supabase y Microsoft 365/Outlook.

## Arquitectura
KOMTROL → Supabase → Edge Function → Microsoft Graph → Outlook

## Módulo de incidencias
- Faltantes
- Dañados
- Diferencias
- Material sin documentación
- Evidencias: guías PDF, fotos y reportes
- Reglas de correo por tipo de incidencia
- Historial y estado de envíos

## Seguridad
Nunca guardar secretos de Microsoft 365 ni claves de backend en GitHub.

Secretos requeridos en Supabase Edge Functions:
- MS_TENANT_ID
- MS_CLIENT_ID
- MS_CLIENT_SECRET
- MS_SENDER_MAILBOX

Proyecto Supabase: KOMTROL
Project ref: ofzugmnsxnmjldmdybed
