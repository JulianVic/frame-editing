import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * Endpoint de diagnóstico para verificar la configuración de Supabase Storage
 * NOTA: Eliminar este endpoint en producción
 */
export async function GET(req: NextRequest) {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  }

  // Verificar variables de entorno
  diagnostics.envVars = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    diagnostics.error = "NEXT_PUBLIC_SUPABASE_URL no está configurado"
    return NextResponse.json(diagnostics, { status: 500 })
  }

  if (!supabaseServiceRoleKey) {
    diagnostics.warning = "SUPABASE_SERVICE_ROLE_KEY no está configurado - esto causará problemas con buckets privados"
  }

  // Crear cliente con service role key si está disponible
  const supabase = createClient(
    supabaseUrl,
    supabaseServiceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  // Listar buckets
  try {
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
    
    if (bucketsError) {
      diagnostics.bucketsError = bucketsError.message
    } else {
      diagnostics.buckets = buckets?.map(b => ({
        name: b.name,
        public: b.public,
        createdAt: b.created_at,
      }))
      
      const photosBucket = buckets?.find(b => b.name === "photos")
      if (photosBucket) {
        diagnostics.photosBucketExists = true
        diagnostics.photosBucketIsPublic = photosBucket.public
        
        // Intentar listar archivos en el bucket
        const { data: files, error: filesError } = await supabase.storage
          .from("photos")
          .list("", { limit: 5 })
        
        if (filesError) {
          diagnostics.filesError = filesError.message
        } else {
          diagnostics.sampleFiles = files?.map(f => f.name)
        }
      } else {
        diagnostics.photosBucketExists = false
        diagnostics.recommendation = "Ejecuta el script 002_create_storage_bucket.sql en Supabase"
      }
    }
  } catch (error) {
    diagnostics.storageError = error instanceof Error ? error.message : String(error)
  }

  return NextResponse.json(diagnostics, { status: 200 })
}
