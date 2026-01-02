import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { filePath } = await req.json()

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

    // Generate signed URL with 1 day expiration (86400 seconds)
    const { data, error } = await supabase.storage.from("photos").createSignedUrl(filePath, 86400)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ signedUrl: data.signedUrl })
  } catch (error) {
    console.error("Error generating signed URL:", error)
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 })
  }
}
