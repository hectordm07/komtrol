import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })

const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()

const normalize = (value: unknown) =>
  clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const toIsoDate = (value: string) => {
  const parts = value.split(/[\/-]/).map(Number)
  if (parts.length !== 3) return null
  let [a, b, c] = parts
  let year = c
  let month = b
  let day = a
  if (a > 1900) {
    year = a
    month = b
    day = c
  }
  if (year < 100) year += 2000
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null
  return date.toISOString().slice(0, 10)
}

const dateCandidates = (text: string) => {
  const matches = Array.from(text.matchAll(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/g))
  return matches
    .map((match) => ({ raw: match[1], index: match.index ?? 0, iso: toIsoDate(match[1]) }))
    .filter((row) => Boolean(row.iso)) as { raw: string; index: number; iso: string }[]
}

const dateNear = (text: string, keywords: string[]) => {
  const lower = normalize(text)
  const dates = dateCandidates(text)
  for (const keyword of keywords) {
    const pos = lower.indexOf(keyword)
    if (pos < 0) continue
    const nearby = dates
      .map((row) => ({ ...row, distance: Math.abs(row.index - pos) }))
      .filter((row) => row.distance <= 180)
      .sort((a, b) => a.distance - b.distance)[0]
    if (nearby?.iso) return nearby.iso
  }
  return null
}

const addMonths = (iso: string, months: number) => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}

const extractCertificate = (text: string) => {
  const patterns = [
    /(?:certificado|constancia|certificate|codigo|código|nro\.?|n°|no\.)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{4,30})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

const courseTitle = (subject: string) => {
  const raw = subject
    .replace(/^(re|rv|fw|fwd)\s*:\s*/gi, "")
    .replace(/\[(?:curso|capacitaci[oó]n|training|certificado|constancia)[^\]]*\]/gi, "")
    .replace(/^(curso|capacitaci[oó]n|training|certificado|constancia)\s*[:\-–|]\s*/i, "")
    .trim()
  return raw || subject.trim() || "Curso identificado por Outlook"
}

const getToken = async (tenantId: string, clientId: string, clientSecret: string) => {
  const response = await fetch(
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
  const body = await response.json()
  if (!response.ok || !body.access_token) {
    throw new Error("No se pudo autenticar con Microsoft Graph")
  }
  return body.access_token as string
}

const graphJson = async (url: string, accessToken: string) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.body-content-type="text"',
    },
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(body?.error?.message || "Microsoft Graph rechazó la consulta")
  }
  return body
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

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role,active")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!profile?.active) return json({ error: "Usuario no habilitado" }, 403)

  const role = String(profile.role ?? "TRABAJADOR")
  if (!["COORDINADOR", "SUPERVISOR", "ADMINISTRADOR"].includes(role)) {
    return json({ error: "No tienes permisos para sincronizar Outlook" }, 403)
  }

  let action = "sync"
  try {
    const body = await req.json()
    action = String(body?.action ?? "sync")
  } catch {
    // body opcional
  }

  const tenantId = Deno.env.get("MS_TENANT_ID")
  const clientId = Deno.env.get("MS_CLIENT_ID")
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET")
  const secretMailbox = Deno.env.get("MS_COURSE_MAILBOX")

  const { data: config, error: configError } = await admin
    .from("outlook_course_sync_config")
    .select("*")
    .eq("id", "DEFAULT")
    .single()

  if (configError || !config) {
    return json({ error: "Configuración de cursos Outlook no encontrada" }, 500)
  }

  const mailbox = String(config.mailbox_address || secretMailbox || "")
  const secretsConfigured = Boolean(tenantId && clientId && clientSecret && mailbox)

  if (action === "status") {
    return json({
      ok: true,
      configured: secretsConfigured,
      enabled: Boolean(config.enabled),
      mailbox: mailbox || null,
      folder: config.folder_name,
      lastSyncAt: config.last_sync_at,
      lastSyncStatus: config.last_sync_status,
      lastSyncMessage: config.last_sync_message,
      autoImport: Boolean(config.auto_import_enabled),
      autoImportMinConfidence: Number(config.auto_import_min_confidence || 95),
    })
  }

  if (!config.enabled) {
    return json({
      error: "La sincronización de cursos Outlook está preparada pero desactivada.",
      configurationRequired: true,
    }, 409)
  }

  if (!secretsConfigured) {
    return json({
      error: "Microsoft Graph para Cursos todavía no está configurado.",
      configurationRequired: true,
      requiredSecrets: ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_COURSE_MAILBOX"],
    }, 503)
  }

  try {
    const accessToken = await getToken(tenantId!, clientId!, clientSecret!)
    const folderName = String(config.folder_name || "Inbox")
    let folderId = "inbox"

    if (folderName.toLowerCase() !== "inbox") {
      const folderResult = await graphJson(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders?$select=id,displayName&$top=100`,
        accessToken,
      )
      const found = (folderResult.value ?? []).find(
        (row: any) => String(row.displayName ?? "").toLowerCase() === folderName.toLowerCase(),
      )
      if (!found?.id) throw new Error(`No se encontró la carpeta Outlook "${folderName}"`)
      folderId = found.id
    }

    const start = new Date(Date.now() - Number(config.lookback_days || 30) * 86_400_000).toISOString()
    const select = [
      "id","internetMessageId","conversationId","subject","from","toRecipients","ccRecipients",
      "receivedDateTime","bodyPreview","body","hasAttachments"
    ].join(",")

    let nextUrl =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(folderId)}/messages` +
      `?$select=${encodeURIComponent(select)}&$filter=${encodeURIComponent(`receivedDateTime ge ${start}`)}&$orderby=receivedDateTime desc&$top=50`

    const messages: any[] = []
    for (let page = 0; page < 4 && nextUrl; page++) {
      const pageData = await graphJson(nextUrl, accessToken)
      messages.push(...(pageData.value ?? []))
      nextUrl = pageData["@odata.nextLink"] || ""
    }

    const { data: profiles } = await admin
      .from("user_profiles")
      .select("user_id,dni,full_name,corporate_email,warehouse,project")
      .eq("active", true)

    const keywords = (config.subject_keywords ?? []).map((value: string) => normalize(value)).filter(Boolean)
    const senderDomains = (config.sender_domains ?? []).map((value: string) => normalize(value).replace(/^@/, "")).filter(Boolean)
    const threshold = Number(config.auto_import_min_confidence || 95)
    const defaultMonths = Number(config.default_validity_months || 12)

    let detected = 0
    let imported = 0
    let review = 0
    let ignored = 0
    let duplicates = 0

    for (const message of messages) {
      const externalId = String(message.id ?? "")
      if (!externalId) continue

      const { data: existing } = await admin
        .from("course_email_intake")
        .select("id,detection_status,expiration_id")
        .eq("provider", "OUTLOOK")
        .eq("external_message_id", externalId)
        .maybeSingle()

      if (existing?.id) {
        duplicates++
        continue
      }

      const subject = clean(message.subject)
      const body = clean(message.body?.content || message.bodyPreview || "")
      const combined = `${subject} ${body}`
      const normalizedText = normalize(combined)
      const keywordHits = keywords.filter((keyword: string) => normalizedText.includes(keyword))

      const fromAddress = String(message.from?.emailAddress?.address ?? "").toLowerCase()
      const fromName = clean(message.from?.emailAddress?.name)
      const toAddresses = (message.toRecipients ?? [])
        .map((row: any) => String(row.emailAddress?.address ?? "").toLowerCase())
        .filter(Boolean)
      const ccAddresses = (message.ccRecipients ?? [])
        .map((row: any) => String(row.emailAddress?.address ?? "").toLowerCase())
        .filter(Boolean)

      let matchedProfile: any = null
      let matchedBy: string | null = null

      for (const candidate of profiles ?? []) {
        const email = String(candidate.corporate_email ?? "").toLowerCase()
        if (email && [...toAddresses, ...ccAddresses].includes(email)) {
          matchedProfile = candidate
          matchedBy = "RECIPIENT_EMAIL"
          break
        }
      }

      if (!matchedProfile) {
        for (const candidate of profiles ?? []) {
          const dni = String(candidate.dni ?? "")
          const name = normalize(candidate.full_name)
          if ((dni && normalizedText.includes(dni)) || (name && name.length >= 8 && normalizedText.includes(name))) {
            matchedProfile = candidate
            matchedBy = dni && normalizedText.includes(dni) ? "DNI_IN_BODY" : "NAME_IN_BODY"
            break
          }
        }
      }

      const senderDomain = fromAddress.includes("@") ? fromAddress.split("@")[1] : ""
      const trustedSender = senderDomains.length > 0 && senderDomains.includes(senderDomain)

      const issueDate =
        dateNear(combined, ["fecha de emision", "emision", "aprobado", "completado", "realizado", "fecha del curso"]) ||
        null
      let dueDate =
        dateNear(combined, ["vencimiento", "vence", "vigencia hasta", "vigencia", "caduca", "valido hasta", "válido hasta"]) ||
        null

      let inferredDue = false
      if (!dueDate && issueDate) {
        dueDate = addMonths(issueDate, defaultMonths)
        inferredDue = true
      }

      const certNo = extractCertificate(combined)
      const title = courseTitle(subject)

      let confidence = 0
      if (keywordHits.length) confidence += Math.min(40, 25 + keywordHits.length * 5)
      if (matchedProfile) confidence += 30
      if (title) confidence += 10
      if (dueDate) confidence += inferredDue ? 10 : 20
      if (trustedSender) confidence += 5
      if (certNo) confidence += 5
      confidence = Math.min(100, confidence)

      const looksLikeCourse = keywordHits.length > 0 || /curso|capacit|training|certific|constancia/i.test(combined)
      let detectionStatus = looksLikeCourse ? "COURSE_DETECTED" : "NOT_COURSE"

      if (!looksLikeCourse) ignored++
      else detected++

      if (looksLikeCourse && (!matchedProfile || !dueDate || confidence < threshold)) {
        detectionStatus = "NEEDS_REVIEW"
        review++
      }

      const { data: intake, error: intakeError } = await admin
        .from("course_email_intake")
        .insert({
          provider: "OUTLOOK",
          external_message_id: externalId,
          internet_message_id: message.internetMessageId || null,
          conversation_id: message.conversationId || null,
          mailbox_address: mailbox,
          sender_name: fromName || null,
          sender_address: fromAddress || null,
          to_addresses: toAddresses,
          cc_addresses: ccAddresses,
          subject,
          received_at: message.receivedDateTime || new Date().toISOString(),
          body_preview: clean(message.bodyPreview || body).slice(0, 2000),
          has_attachments: Boolean(message.hasAttachments),
          detection_status: detectionStatus,
          confidence,
          detected_course_title: title,
          detected_participant_name: matchedProfile?.full_name || null,
          detected_participant_email: matchedProfile?.corporate_email || toAddresses[0] || null,
          detected_issuer: fromName || senderDomain || null,
          detected_certificate_no: certNo,
          detected_issue_date: issueDate,
          detected_due_date: dueDate,
          matched_user_id: matchedProfile?.user_id || null,
          matched_by: matchedBy,
          parse_notes: inferredDue
            ? `Fecha de vencimiento inferida usando ${defaultMonths} meses desde la fecha detectada.`
            : null,
          raw_metadata: {
            keyword_hits: keywordHits,
            trusted_sender: trustedSender,
            inferred_due_date: inferredDue,
          },
          processed_at: new Date().toISOString(),
        })
        .select("*")
        .single()

      if (intakeError || !intake) continue

      if (message.hasAttachments) {
        try {
          const attachmentData = await graphJson(
            `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(externalId)}/attachments?$select=id,name,contentType,size,isInline`,
            accessToken,
          )
          const attachments = (attachmentData.value ?? [])
            .filter((item: any) => !item.isInline && item.name)
          if (attachments.length) {
            await admin.from("course_email_attachments").insert(
              attachments.map((item: any) => ({
                intake_id: intake.id,
                external_attachment_id: item.id,
                file_name: item.name,
                mime_type: item.contentType || null,
                file_size: item.size || null,
              })),
            )
            await admin
              .from("course_email_intake")
              .update({ attachment_names: attachments.map((item: any) => item.name) })
              .eq("id", intake.id)
          }
        } catch {
          // Los adjuntos no bloquean la detección del curso.
        }
      }

      const canAutoImport =
        Boolean(config.auto_import_enabled) &&
        detectionStatus === "COURSE_DETECTED" &&
        confidence >= threshold &&
        matchedProfile?.user_id &&
        dueDate

      if (canAutoImport) {
        const { data: duplicateExpiration } = await admin
          .from("compliance_expirations")
          .select("id")
          .eq("user_id", matchedProfile.user_id)
          .eq("expiration_type", "CURSO")
          .eq("title", title)
          .eq("due_date", dueDate)
          .maybeSingle()

        let expirationId = duplicateExpiration?.id || null

        if (!expirationId) {
          const { data: expiration, error: expirationError } = await admin
            .from("compliance_expirations")
            .insert({
              user_id: matchedProfile.user_id,
              expiration_type: "CURSO",
              title,
              issuer: fromName || senderDomain || null,
              certificate_no: certNo,
              issue_date: issueDate,
              due_date: dueDate,
              status: "ACTIVO",
              warehouse: matchedProfile.warehouse || null,
              project: matchedProfile.project || null,
              notes: `Importado automáticamente desde Outlook. Asunto: ${subject}`,
              created_by: user.id,
              updated_by: user.id,
              source: "OUTLOOK",
              source_reference: externalId,
              source_received_at: message.receivedDateTime || new Date().toISOString(),
              source_confidence: confidence,
              source_metadata: {
                internet_message_id: message.internetMessageId || null,
                sender: fromAddress,
                intake_id: intake.id,
              },
            })
            .select("id")
            .single()

          if (!expirationError && expiration?.id) expirationId = expiration.id
        }

        if (expirationId) {
          imported++
          await admin
            .from("course_email_intake")
            .update({
              detection_status: "IMPORTED",
              expiration_id: expirationId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", intake.id)

          await admin.from("app_notifications").insert({
            user_id: matchedProfile.user_id,
            notification_type: "COURSE_IMPORTED",
            title: "Curso detectado desde Outlook",
            message: `${title} · vence ${dueDate}`,
            created_by: user.id,
            metadata: { expiration_id: expirationId, intake_id: intake.id },
          })
        }
      }
    }

    const syncMessage =
      `${messages.length} correos revisados · ${detected} cursos detectados · ${imported} importados · ${review} por validar · ${ignored} descartados · ${duplicates} ya procesados.`

    await admin
      .from("outlook_course_sync_config")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "OK",
        last_sync_message: syncMessage,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "DEFAULT")

    return json({
      ok: true,
      mailbox,
      reviewed: messages.length,
      detected,
      imported,
      needsReview: review,
      ignored,
      duplicates,
      message: syncMessage,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado sincronizando Outlook"
    await admin
      .from("outlook_course_sync_config")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "ERROR",
        last_sync_message: message,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "DEFAULT")

    return json({ error: message }, 502)
  }
})
