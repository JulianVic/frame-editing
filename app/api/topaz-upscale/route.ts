import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { inngest } from "@/inngest/client"

/**
 * API Route para procesar imágenes con Topaz Gigapixel (ASÍNCRONO)
 * 
 * Esta ruta:
 * 1. Crea un job en la base de datos
 * 2. Responde inmediatamente con el job_id
 * 3. Procesa la imagen en background (no bloquea)
 * 
 * El cliente debe hacer polling a /api/topaz-status/[jobId] para obtener el estado
 */

interface TopazUpscaleRequest {
  imagePath: string // Path en Supabase Storage (ej: "user-id/cropped_123.jpg")
  photoId: string
}

export async function POST(req: NextRequest) {
  console.log("[Topaz API] Creando job de procesamiento")

  try {
    // Verificar autenticación del usuario
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("[Topaz API] Error de autenticación:", authError)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parsear request body
    const body: TopazUpscaleRequest = await req.json()
    const { imagePath, photoId } = body

    if (!imagePath || !photoId) {
      console.error("[Topaz API] Parámetros faltantes:", { imagePath: !!imagePath, photoId: !!photoId })
      return NextResponse.json({ error: "imagePath and photoId are required" }, { status: 400 })
    }

    // Verificar que la foto pertenece al usuario
    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .select("user_id")
      .eq("id", photoId)
      .single()

    if (photoError || !photo || photo.user_id !== user.id) {
      console.error("[Topaz API] Foto no encontrada o no autorizada:", photoError)
      return NextResponse.json({ error: "Photo not found or unauthorized" }, { status: 403 })
    }

    // Verificar que no haya un job pendiente o procesando para esta foto
    const { data: existingJob } = await supabase
      .from("topaz_jobs")
      .select("id, status")
      .eq("photo_id", photoId)
      .in("status", ["pending", "processing"])
      .single()

    if (existingJob) {
      console.log("[Topaz API] Job ya existe:", existingJob.id)
      return NextResponse.json({
        jobId: existingJob.id,
        status: existingJob.status,
        message: "Job already exists",
      })
    }

    // Crear nuevo job
    const { data: job, error: jobError } = await supabase
      .from("topaz_jobs")
      .insert({
        photo_id: photoId,
        user_id: user.id,
        image_path: imagePath,
        status: "pending",
      })
      .select()
      .single()

    if (jobError || !job) {
      console.error("[Topaz API] Error creando job:", jobError)
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 })
    }

    console.log("[Topaz API] Job creado:", job.id)

    // Actualizar estado de la foto
    await supabase
      .from("photos")
      .update({ topaz_status: "pending" })
      .eq("id", photoId)

    // Enviar evento a Inngest para procesar en cola
    await inngest.send({
      name: "topaz/process",
      data: {
        jobId: job.id,
        imagePath,
        photoId,
        userId: user.id,
      },
    })

    // Responder inmediatamente
    return NextResponse.json({
      jobId: job.id,
      status: "pending",
      message: "Job created, processing in queue",
    })

  } catch (error) {
    console.error("[Topaz API] Error inesperado:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

// Las funciones de procesamiento ahora se manejan con Inngest
// Ver: inngest/functions.ts

