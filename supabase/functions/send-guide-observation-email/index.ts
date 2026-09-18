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

const isEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

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

  let guideId = ""
  let to: string[] = []
  let cc: string[] = []
  let subject = ""
  let body = ""

  try {
    const payload = await req.json()
    guideId = String(payload.guideId ?? "").trim()
    to = Array.isArray(payload.to) ? payload.to.map(String).map((x: string) => x.trim()).filter(Boolean) : []
    cc = Array.isArray(payload.cc) ? payload.cc.map(String).map((x: string) => x.trim()).filter(Boolean) : []
    subject = String(payload.subject ?? "").trim()
    body = String(payload.body ?? "").trim()
  } catch {
    return json({ error: "JSON inválido" }, 400)
  }

  if (!guideId) return json({ error: "guideId es obligatorio" }, 400)
  if (!to.length) return json({ error: "Debes indicar al menos un destinatario" }, 400)
  if (to.length > 20 || cc.length > 20) return json({ error: "Demasiados destinatarios" }, 400)
  if (![...to, ...cc].every(isEmail)) return json({ error: "Hay direcciones de correo inválidas" }, 400)
  if (!subject || subject.length > 250) return json({ error: "Asunto inválido" }, 400)
  if (!body || body.length > 12000) return json({ error: "Mensaje inválido" }, 400)

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,active,warehouse")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!profile?.active) return json({ error: "Usuario no habilitado" }, 403)

  const { data: guide, error: guideError } = await admin
    .from("guides")
    .select("id,guide_no,reference,document_no,guide_type,warehouse,created_by,responsible_user_id,file_bucket,file_path,file_name")
    .eq("id", guideId)
    .single()

  if (guideError || !guide) return json({ error: "Guía no encontrada" }, 404)
  if (!["ORDEN_COMPRA", "CARGO_DIRECTO"].includes(guide.guide_type)) {
    return json({ error: "Esta guía no pertenece a OC / Cargos Directos" }, 409)
  }

  const role = String(profile.role ?? "TRABAJADOR")
  const allowed =
    guide.created_by === user.id ||
    guide.responsible_user_id === user.id ||
    ["SUPERVISOR", "ADMINISTRADOR"].includes(role) ||
    (role === "COORDINADOR" && guide.warehouse === profile.warehouse)

  if (!allowed) return json({ error: "No tienes acceso a esta guía" }, 403)

  const { data: followup } = await admin
    .from("oc_cargo_followups")
    .select("id,final_status")
    .eq("guide_id", guideId)
    .maybeSingle()

  if (!followup || followup.final_status !== "OBSERVADO") {
    return json({ error: "La guía debe estar guardada con ESTATUS FINAL = OBSERVADO" }, 409)
  }

  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.45">
      ${escapeHtml(body).replaceAll("\n", "<br>")}
    </div>`

  const { data: logRow, error: logError } = await admin
    .from("guide_observation_emails")
    .insert({
      guide_id: guideId,
      followup_id: followup.id,
      status: "ENVIANDO",
      to_addresses: to,
      cc_addresses: cc,
      subject,
      body_text: body,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (logError || !logRow) {
    return json({ error: "No se pudo registrar el correo" }, 500)
  }

  const attachments: any[] = []
  if (guide.file_bucket && guide.file_path) {
    const { data: file, error: fileError } = await admin.storage
      .from(guide.file_bucket)
      .download(guide.file_path)

    if (!fileError && file) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.byteLength <= 2_500_000) {
        attachments.push({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: guide.file_name || `${guide.guide_no}.pdf`,
          contentType: file.type || "application/octet-stream",
          contentBytes: bytesToBase64(bytes),
        })
      }
    }
  }

  const tenantId = Deno.env.get("MS_TENANT_ID")
  const clientId = Deno.env.get("MS_CLIENT_ID")
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET")
  const senderMailbox = Deno.env.get("MS_SENDER_MAILBOX")

  if (!tenantId || !clientId || !clientSecret || !senderMailbox) {
    await admin
      .from("guide_observation_emails")
      .update({
        status: "ERROR",
        error_message: "Microsoft Graph no está configurado",
      })
      .eq("id", logRow.id)

    return json({
      error: "Microsoft Graph todavía no está configurado",
      emailId: logRow.id,
    }, 503)
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
    await admin
      .from("guide_observation_emails")
      .update({
        status: "ERROR",
        error_message: "Error de autenticación Microsoft Graph",
      })
      .eq("id", logRow.id)

    return json({ error: "No se pudo autenticar con Microsoft Graph", emailId: logRow.id }, 502)
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
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: cc.map((address) => ({ emailAddress: { address } })),
          attachments,
        },
        saveToSentItems: true,
      }),
    },
  )

  const graphRequestId = graphResponse.headers.get("request-id")

  if (!graphResponse.ok) {
    const detail = await graphResponse.text()
    await admin
      .from("guide_observation_emails")
      .update({
        status: "ERROR",
        graph_request_id: graphRequestId,
        error_message: detail.slice(0, 1500),
      })
      .eq("id", logRow.id)

    return json({ error: "Microsoft Graph rechazó el envío", emailId: logRow.id }, 502)
  }

  await admin
    .from("guide_observation_emails")
    .update({
      status: "ENVIADO",
      sent_at: new Date().toISOString(),
      graph_request_id: graphRequestId,
      error_message: null,
    })
    .eq("id", logRow.id)

  await admin
    .from("guides")
    .update({ status: "OBSERVADO", updated_at: new Date().toISOString() })
    .eq("id", guideId)

  await admin
    .from("guide_history")
    .insert({
      guide_id: guideId,
      action: "CORREO_OBSERVACION_ENVIADO",
      note: `Correo enviado a ${to.join(", ")}`,
      changed_by: user.id,
    })

  return json({
    ok: true,
    emailId: logRow.id,
    graphRequestId,
    attachmentIncluded: attachments.length > 0,
  })
})
