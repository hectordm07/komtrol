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

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,active,full_name,project,warehouse,group_name")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!profile?.active) {
    return json({ error: "Usuario no habilitado" }, 403)
  }

  const role = String(profile.role ?? "TRABAJADOR")
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
    await admin.from("incidents").update({ auto_email_status: "NO_CONFIGURADO" }).eq("id", incidentId)
    return json({ error: "No hay una regla de correo activa para esta incidencia" }, 409)
  }

  const { data: destination } = await admin
    .from("incident_email_destinations")
    .select("enabled,to_addresses,cc_addresses")
    .eq("warehouse", incident.warehouse)
    .maybeSingle()

  const warehouseTo =
    destination?.enabled && Array.isArray(destination.to_addresses) && destination.to_addresses.length
      ? destination.to_addresses
      : (Array.isArray(rule.to_addresses) ? rule.to_addresses : [])
  const warehouseCc =
    destination?.enabled && Array.isArray(destination.cc_addresses) && destination.cc_addresses.length
      ? destination.cc_addresses
      : (Array.isArray(rule.cc_addresses) ? rule.cc_addresses : [])

  if (!warehouseTo.length) {
    await admin.from("incidents").update({ auto_email_status: "NO_CONFIGURADO" }).eq("id", incidentId)
    return json({
      error: `No hay destinatario automático configurado para el almacén ${incident.warehouse ?? "SIN ALMACÉN"}`,
      configurationRequired: true,
    }, 409)
  }

  const incidentDate = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(incident.detected_at ?? incident.created_at))

  const difference =
    incident.qty_expected != null && incident.qty_received != null
      ? Number(incident.qty_received) - Number(incident.qty_expected)
      : null

  const subjectTemplate =
    rule.subject_template ??
    "[KOMTROL][{{incident_type}}] {{warehouse}} | {{material_no}} | {{incident_no}}"
  const subject = String(incident.verification_email_subject || subjectTemplate)
    .replaceAll("{{incident_type}}", incident.incident_type ?? "")
    .replaceAll("{{guide_no}}", incident.guide_no ?? "")
    .replaceAll("{{purchase_order}}", incident.purchase_order ?? "")
    .replaceAll("{{material_no}}", incident.material_no ?? "")
    .replaceAll("{{incident_no}}", incident.incident_no ?? "")
    .replaceAll("{{warehouse}}", incident.warehouse ?? "")
    .replaceAll("{{date}}", incidentDate)

  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#22384a;line-height:1.45">
      <h2 style="color:#355c7a">Incidencia KOMTROL - ${escapeHtml(incident.incident_type)}</h2>
      <p><b>Fecha de detección:</b> ${escapeHtml(incidentDate)}</p>
      <p><b>Reportado por:</b> ${escapeHtml(profile.full_name)} · ${escapeHtml(profile.role)} · ${escapeHtml(profile.project || profile.warehouse)}${profile.group_name ? ` · ${escapeHtml(profile.group_name)}` : ""}</p>
      <table cellpadding="7" cellspacing="0" style="border-collapse:collapse;border:1px solid #dce8f1">
        <tr><td><b>Incidencia</b></td><td>${escapeHtml(incident.incident_no)}</td></tr>
        <tr><td><b>Almacén</b></td><td>${escapeHtml(incident.warehouse)}</td></tr>
        <tr><td><b>Opción</b></td><td>${escapeHtml(incident.detection_mode === "VERIFICACION_INVENTARIO" ? "Verificación de inventario" : "Material dañado")}</td></tr>
        <tr><td><b>Guía</b></td><td>${escapeHtml(incident.guide_no)}</td></tr>
        <tr><td><b>N° Embarque o Guía</b></td><td>${escapeHtml(incident.document_no)}</td></tr>
        <tr><td><b>OC</b></td><td>${escapeHtml(incident.purchase_order)}</td></tr>
        <tr><td><b>Código leído</b></td><td>${escapeHtml(incident.barcode_value)}</td></tr>
        <tr><td><b>N° parte / material</b></td><td>${escapeHtml(incident.material_no)}</td></tr>
        <tr><td><b>Stock Code</b></td><td>${escapeHtml(incident.stock_code)}</td></tr>
        <tr><td><b>Descripción</b></td><td>${escapeHtml(incident.description)}</td></tr>
        <tr><td><b>Ubicación</b></td><td>${escapeHtml(incident.location)}</td></tr>
        <tr><td><b>Cantidad requerida</b></td><td>${escapeHtml(incident.qty_expected)}</td></tr>
        <tr><td><b>Cantidad llegada</b></td><td>${escapeHtml(incident.qty_received)}</td></tr>
        <tr><td><b>Diferencia</b></td><td>${escapeHtml(difference)}</td></tr>
        <tr><td><b>Cantidad dañada</b></td><td>${escapeHtml(incident.qty_damaged)}</td></tr>
        <tr><td><b>Observaciones</b></td><td>${escapeHtml(incident.notes)}</td></tr>
      </table>
      <p>Registro generado automáticamente desde KOMTROL.</p>
    </div>`

  const { data: attachmentRows } = await admin
    .from("incident_attachments")
    .select("attachment_type,bucket,storage_path,file_name,content_type,size_bytes")
    .eq("incident_id", incidentId)

  const allowed = (attachmentRows ?? []).filter((a: any) => {
    if (a.attachment_type === "GUIA") return rule.attach_guide
    if (a.attachment_type === "FOTO") return rule.attach_photos
    if (a.attachment_type === "REPORTE") return Boolean(incident.verification_email_subject) || rule.attach_report
    return true
  }).sort((a: any, b: any) => {
    const priority = (type: string) => type === "GUIA" ? 0 : type === "REPORTE" ? 1 : 2
    return priority(a.attachment_type) - priority(b.attachment_type)
  })

  const attachments: any[] = []
  const skippedAttachments: string[] = []
  const attachedTypes = new Set<string>()
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
    attachedTypes.add(a.attachment_type)
  }

  if (incident.verification_email_subject && (!attachedTypes.has("GUIA") || !attachedTypes.has("REPORTE"))) {
    await admin.from("incidents").update({ auto_email_status: "ERROR" }).eq("id", incidentId)
    return json({ error: "La guía PDF y el Excel de verificación deben estar adjuntos antes de enviar el correo." }, 422)
  }

  const { data: notification, error: notificationError } = await admin
    .from("email_notifications")
    .insert({
      incident_id: incidentId,
      status: "ENVIANDO",
      to_addresses: warehouseTo,
      cc_addresses: warehouseCc,
      subject,
      body_html: bodyHtml,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (notificationError || !notification) {
    await admin.from("incidents").update({ auto_email_status: "ERROR" }).eq("id", incidentId)
    return json({ error: "No se pudo registrar la notificación" }, 500)
  }

  await admin.from("incidents").update({ auto_email_status: "ENVIANDO" }).eq("id", incidentId)

  const tenantId = Deno.env.get("MS_TENANT_ID")
  const clientId = Deno.env.get("MS_CLIENT_ID")
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET")
  const senderMailbox = Deno.env.get("MS_SENDER_MAILBOX")

  if (!tenantId || !clientId || !clientSecret || !senderMailbox) {
    await admin.from("email_notifications").update({
      status: "ERROR",
      error_message: "Microsoft Graph no está configurado",
    }).eq("id", notification.id)
    await admin.from("incidents").update({ auto_email_status: "ERROR" }).eq("id", incidentId)
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
    await admin.from("incidents").update({ auto_email_status: "ERROR" }).eq("id", incidentId)
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
          toRecipients: warehouseTo.map((address: string) => ({ emailAddress: { address } })),
          ccRecipients: warehouseCc.map((address: string) => ({ emailAddress: { address } })),
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
    await admin.from("incidents").update({ auto_email_status: "ERROR" }).eq("id", incidentId)
    return json({ error: "Microsoft Graph rechazó el envío", notificationId: notification.id }, 502)
  }

  await admin.from("email_notifications").update({
    status: "ENVIADO",
    sent_at: new Date().toISOString(),
    graph_request_id: graphRequestId,
    error_message: skippedAttachments.length ? `Adjuntos omitidos por tamaño/error: ${skippedAttachments.join(", ")}` : null,
  }).eq("id", notification.id)

  await admin.from("incidents").update({
    status: "NOTIFICADO",
    auto_email_status: "ENVIADO",
  }).eq("id", incidentId)

  return json({
    ok: true,
    notificationId: notification.id,
    graphRequestId,
    skippedAttachments,
  })
})
