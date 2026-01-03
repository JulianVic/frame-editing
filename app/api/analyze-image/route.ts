import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { inngest } from "@/inngest/client"

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, photoId } = await req.json()

    if (!imageUrl || !photoId) {
      return NextResponse.json(
        { error: "imageUrl and photoId are required" },
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

    // Verificar que la foto pertenece al usuario
    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .select("user_id")
      .eq("id", photoId)
      .single()

    if (photoError || !photo || photo.user_id !== user.id) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }

    // Enviar evento a Inngest para analizar en cola
    await inngest.send({
      name: "ai/analyze-image",
      data: {
        photoId,
        imageUrl,
        userId: user.id,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Image analysis queued, recommendations will be available shortly",
    })
  } catch (error) {
    console.error("Error queuing image analysis:", error)
    return NextResponse.json(
      {
        error: "Failed to queue image analysis",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
