import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Endpoint para consultar el estado de un job de Topaz
 * GET /api/topaz-status/[jobId]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  if (!jobId) {
    return NextResponse.json({ error: "Job ID is required" }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Verificar autenticación
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Obtener job
    const { data: job, error: jobError } = await supabase
      .from("topaz_jobs")
      .select("*")
      .eq("id", jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Verificar que el job pertenece al usuario
    if (job.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Si está completado, obtener signed URL de la imagen (bucket es privado)
    let imageUrl: string | null = null
    if (job.status === "completed" && job.result_path) {
      // Generar signed URL con expiración de 1 día (86400 segundos)
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("photos")
        .createSignedUrl(job.result_path, 86400)

      if (!signedUrlError && signedUrlData) {
        imageUrl = signedUrlData.signedUrl
      } else {
        console.error("[Topaz Status] Error generando signed URL:", signedUrlError)
      }
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      imageUrl,
      resultPath: job.result_path,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    })
  } catch (error) {
    console.error("[Topaz Status] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

