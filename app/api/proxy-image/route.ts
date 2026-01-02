import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const filePath = searchParams.get("path")

    if (!filePath) {
      return NextResponse.json({ error: "File path is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Verify that the file belongs to the user
    const pathParts = filePath.split("/")
    if (pathParts[0] !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Download the file from storage
    const { data, error } = await supabase.storage.from("photos").download(filePath)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Convert blob to array buffer
    const arrayBuffer = await data.arrayBuffer()

    // Return the image with CORS headers
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": data.type || "image/jpeg",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Cache-Control": "public, max-age=86400", // Cache for 1 day
      },
    })
  } catch (error) {
    console.error("Error proxying image:", error)
    return NextResponse.json({ error: "Failed to proxy image" }, { status: 500 })
  }
}

