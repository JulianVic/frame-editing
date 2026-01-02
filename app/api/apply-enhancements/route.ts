import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { inngest } from "@/inngest/client"

interface EnhancementParams {
  brightness: number // -100 to 100
  contrast: number // -100 to 100
  saturation: number // -100 to 100
  sharpness: number // 0 to 100
  vibrance: number // -100 to 100
  temperature: number // -100 to 100
}

export async function POST(req: NextRequest) {
  try {
    const { photoId, adjustments } = await req.json()

    if (!photoId || !adjustments) {
      return NextResponse.json(
        { error: "photoId and adjustments are required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Verificar autenticación
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Obtener la foto con topaz_gigapixel_url
    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .select("user_id, topaz_gigapixel_url, topaz_status")
      .eq("id", photoId)
      .single()

    if (photoError || !photo || photo.user_id !== user.id) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }

    // Verificar que la imagen de Topaz esté disponible
    if (!photo.topaz_gigapixel_url || photo.topaz_status !== "completed") {
      return NextResponse.json(
        { error: "La imagen debe estar procesada por Topaz antes de aplicar ajustes" },
        { status: 400 }
      )
    }

    // Enviar evento a Inngest para aplicar ajustes en cola
    await inngest.send({
      name: "image/apply-enhancements",
      data: {
        photoId,
        adjustments,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Enhancements queued, processing in background",
    })
  } catch (error) {
    console.error("Error applying enhancements:", error)
    return NextResponse.json(
      {
        error: "Failed to apply enhancements",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

