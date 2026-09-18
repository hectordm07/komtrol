import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const authHeader = req.headers.get("Authorization") ?? ""

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) {
    return json({ error: "Configuración o sesión incompleta" }, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const token = authHeader.replace(/^Bearer\s+/i, "")
  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  const user = userData.user
  if (userError || !user) return json({ error: "Sesión no válida" }, 401)

  let incidentId = ""
  try {
    const body = await req.json()
    incidentId = String(body.incidentId ?? "")
  } catch {
    return json({ error: "JSON inválido" }, 400)
  }
  if (!incidentId) return json({ error: "incidentId es obligatorio" }, 400)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const role = String(user.app_metadata?.role ?? "")
  const canManageAll = role === "COORDINADOR" || role === "ADMINISTRADOR"

  const { data: incident, error: incidentError } = await admin
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .single()

  if (incidentError || !incident) return json({ error: "Incidencia no encontrada" }, 404)
  if (!canManageAll && incident.created_by !== user.id) {
    return json({ error: "No tienes acceso a esta incidencia" }, 403)
  }

  const { data: rule, error: ruleError } = await admin
    .from("email_rules")
    .select("*")
    .eq("incident_type", incident.incident_type)
    .single()

  if (ruleError || !rule || !rule.enabled) {
    return json({ error: "No hay una regla de correo activa para esta incidencia" }, 409)
  }
  if (!Array.isArray(rule.to_addresses) || rule.to_addresses.length === 0) {
    return json({ error: "La regla no tiene destinatarios configurados" }, 409)
  }

  const subject = String(rule.subject_template ?? "[KOMTROL][{{incident_type}}] {{guide_no}}")
    .replaceAll("{{incident_type}}", incident.incident_type ?? "")
    .replaceAll("{{guide_no}}", incident.guide_no ?? "")
    .replaceAll("{{purchase_order}}", incident.purchase_order ?? "")
    .replaceAll("{{material_no}}", incident.material_no ?? "")
    .replaceAll("{{incident_no}}", incident.incident_no ?? "")

  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <h2>Incidencia KOMTROL - ${escapeHtml(incident.incident_type)}</h2>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        <tr><td><b>Incidencia</b></td><td>${escapeHtml(incident.incident_no)}</td></tr>
        <tr><td><b>Guía</b></td><td>${escapeHtml(incident.guide_no)}</td></tr>
        <tr><td><b>N° documento</b></td><td>${escapeHtml(incident.document_no)}</td></tr>
        <tr><td><b>OC</b></td><td>${escapeHtml(incident.purchase_order)}</td></tr>
        <tr><td><b>N° parte / material</b></td><td>${escapeHtml(incident.material_no)}</td></tr>
        <tr><td><b>Descripción</b></td><td>${escapeHtml(incident.description)}</td></tr>
        <tr><td><b>Cantidad esperada</b></td><td>${escapeHtml(incident.qty_expected)}</td></tr>
        <tr><td><b>Cantidad recibida</b></td><td>${escapeHtml(incident.qty_received)}</td></tr>
        <tr><td><b>Observaciones</b></td><td>${escapeHtml(incident.notes)}</td></tr>
      </table>
      <p>Registro generado desde KOMTROL.</p>
    </div>`

  const { data: attachmentRows } = await admin
    .from("incident_attachments")
    .select("attachment_type,bucket,storage_path,file_name,content_type,size_bytes")
    .eq("incident_id", incidentId)

  const allowed = (attachmentRows ?? []).filter((a: any) => {
    if (a.attachment_type === "GUIA") return rule.attach_guide
    if (a.attachment_type === "FOTO") return rule.attach_photos
    if (a.attachment_type === "REPORTE") return rule.attach_report
    return true
  })

  const attachments: any[] = []
  const skippedAttachments: string[] = []
  let totalRawBytes = 0
  const MAX_RAW_BYTES = 2_500_000

  for (const a of allowed) {
    const expectedSize = Number(a.size_bytes ?? 0)
    if (expectedSize && totalRawBytes + expectedSize > MAX_RAW_BYTES) {
      skippedAttachments.push(a.file_name)
      continue
    }
    const { data: file, error: fileError } = await admin.storage
      .from(a.bucket || "incident-evidence")
      .download(a.storage_path)

    if (fileError || !file) {
      skippedAttachments.push(a.file_name)
      continue
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (totalRawBytes + bytes.byteLength > MAX_RAW_BYTES) {
      skippedAttachments.push(a.file_name)
      continue
    }
    totalRawBytes += bytes.byteLength
    attachments.push({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.file_name,
      contentType: a.content_type || "application/octet-stream",
      contentBytes: bytesToBase64(bytes),
    })
  }

  const { data: notification, error: notificationError } = await admin
    .from("email_notifications")
    .insert({
      incident_id: incidentId,
      status: "ENVIANDO",
      to_addresses: rule.to_addresses,
      cc_addresses: rule.cc_addresses ?? [],
      subject,
      body_html: bodyHtml,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (notificationError || !notification) {
    return json({ error: "No se pudo registrar la notificación" }, 500)
  }

  const tenantId = Deno.env.get("MS_TENANT_ID")
  const clientId = Deno.env.get("MS_CLIENT_ID")
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET")
  const senderMailbox = Deno.env.get("MS_SENDER_MAILBOX")

  if (!tenantId || !clientId || !clientSecret || !senderMailbox) {
    await admin.from("email_notifications").update({
      status: "ERROR",
      error_message: "Microsoft Graph no está configurado",
    }).eq("id", notification.id)
    return json({ error: "Microsoft Graph todavía no está configurado", notificationId: notification.id }, 503)
  }

  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        scope: "https://graph.microsoft.com/.default",
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    },
  )

  const tokenData = await tokenResponse.json()
  if (!tokenResponse.ok) {
    await admin.from("email_notifications").update({
      status: "ERROR",
      error_message: "Error de autenticación Microsoft Graph",
    }).eq("id", notification.id)
    return json({ error: "No se pudo autenticar con Microsoft Graph", notificationId: notification.id }, 502)
  }

  const graphResponse = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderMailbox)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: bodyHtml },
          toRecipients: rule.to_addresses.map((address: string) => ({ emailAddress: { address } })),
          ccRecipients: (rule.cc_addresses ?? []).map((address: string) => ({ emailAddress: { address } })),
          attachments,
        },
        saveToSentItems: true,
      }),
    },
  )

  const graphRequestId = graphResponse.headers.get("request-id")

  if (!graphResponse.ok) {
    const detail = await graphResponse.text()
    await admin.from("email_notifications").update({
      status: "ERROR",
      graph_request_id: graphRequestId,
      error_message: detail.slice(0, 1500),
    }).eq("id", notification.id)
    return json({ error: "Microsoft Graph rechazó el envío", notificationId: notification.id }, 502)
  }

  await admin.from("email_notifications").update({
    status: "ENVIADO",
    sent_at: new Date().toISOString(),
    graph_request_id: graphRequestId,
    error_message: skippedAttachments.length ? `Adjuntos omitidos por tamaño/error: ${skippedAttachments.join(", ")}` : null,
  }).eq("id", notification.id)

  await admin.from("incidents").update({ status: "NOTIFICADO" }).eq("id", incidentId)

  return json({
    ok: true,
    notificationId: notification.id,
    graphRequestId,
    skippedAttachments,
  })
})
