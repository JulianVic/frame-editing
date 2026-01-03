import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"
import { processTopazGigapixel, analyzeImageWithAI, applyImageEnhancements } from "@/inngest/functions"
import { NextRequest } from "next/server"

// Registrar todas las funciones de Inngest
const functions = [processTopazGigapixel, analyzeImageWithAI, applyImageEnhancements]

// Crear el handler de Inngest
const handler = serve({
  client: inngest,
  functions,
})

// Wrapper para agregar logging y manejo de errores
export async function GET(
  req: NextRequest,
  context: { params?: Promise<Record<string, string>> }
) {
  try {
    console.log("[Inngest] GET request recibido - Sincronización de funciones")
    const response = await handler.GET(req, context)
    console.log("[Inngest] Funciones sincronizadas exitosamente")
    return response
  } catch (error) {
    console.error("[Inngest] Error en GET:", error)
    return new Response(
      JSON.stringify({
        error: "Error al sincronizar funciones",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}

export async function POST(
  req: NextRequest,
  context: { params?: Promise<Record<string, string>> }
) {
  try {
    // Intentar leer el body para logging (sin bloquear el stream)
    try {
      const body = await req.clone().text()
      const event = body ? JSON.parse(body) : null
      
      if (event?.name) {
        console.log(`[Inngest] Evento recibido: ${event.name}`)
      }
    } catch {
      // Ignorar errores al leer el body para logging
    }
    
    const response = await handler.POST(req, context)
    return response
  } catch (error) {
    console.error("[Inngest] Error en POST:", error)
    return new Response(
      JSON.stringify({
        error: "Error al procesar evento",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}

export async function PUT(
  req: NextRequest,
  context: { params?: Promise<Record<string, string>> }
) {
  try {
    console.log("[Inngest] PUT request recibido")
    const response = await handler.PUT(req, context)
    return response
  } catch (error) {
    console.error("[Inngest] Error en PUT:", error)
    return new Response(
      JSON.stringify({
        error: "Error al procesar request",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}

// Log de funciones registradas al iniciar (solo en desarrollo)
if (process.env.NODE_ENV === "development") {
  console.log("[Inngest] Handler inicializado con funciones:", [
    "process-topaz-gigapixel",
    "analyze-image-with-ai",
    "apply-image-enhancements",
  ])
}

