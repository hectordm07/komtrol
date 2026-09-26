import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.95.0"

const allowedOrigins = new Set([
  "https://komtrol.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
])

function cors(origin: string | null) {
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : "https://komtrol.vercel.app"
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  }
}

Deno.serve(async (req: Request) => {
  const headers = cors(req.headers.get("origin"))
  if (req.method === "OPTIONS") return new Response("ok", { headers })

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido." }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const identifier = String(body?.identifier ?? "").trim().toLowerCase()
    const isDni = /^\\d{8}$/.test(identifier)
    const isUsername = /^[a-z0-9._-]{3,80}$/.test(identifier)

    if (!isDni && !isUsername) {
      return new Response(JSON.stringify({ error: "Identificador inválido." }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Servicio no disponible." }), {
        status: 503,
        headers: { ...headers, "Content-Type": "application/json" },
      })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let query = admin.from("user_profiles").select("user_id,active").eq("active", true)
    query = isDni ? query.eq("dni", identifier) : query.ilike("username", identifier)

    const { data: profile, error: profileError } = await query.maybeSingle()
    if (profileError || !profile?.user_id) {
      return new Response(JSON.stringify({ error: "Credenciales no válidas." }), {
        status: 404,
        headers: { ...headers, "Content-Type": "application/json" },
      })
    }

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(profile.user_id)
    const email = userResult?.user?.email?.trim().toLowerCase()

    if (userError || !email) {
      return new Response(JSON.stringify({ error: "Credenciales no válidas." }), {
        status: 404,
        headers: { ...headers, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ email }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
    })
  } catch {
    return new Response(JSON.stringify({ error: "No se pudo resolver el acceso." }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }
})
