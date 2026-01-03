import { inngest } from "./client"
import { createClient } from "@supabase/supabase-js"

/**
 * Normaliza el path de la imagen, extrayendo solo la ruta del archivo
 * si viene como URL completa de Supabase Storage
 */
function normalizeImagePath(imagePath: string): string {
  // Si es una URL completa, extraer solo la ruta del archivo
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    try {
      const url = new URL(imagePath)
      // Extraer la ruta después de /object/photos/
      const match = url.pathname.match(/\/object\/photos\/(.+)$/)
      if (match) {
        return decodeURIComponent(match[1])
      }
      // Si no coincide el patrón, intentar extraer después del último /
      const pathParts = url.pathname.split("/")
      const photosIndex = pathParts.indexOf("photos")
      if (photosIndex !== -1 && pathParts[photosIndex + 1]) {
        return pathParts.slice(photosIndex + 1).join("/")
      }
    } catch {
      // Si falla el parsing, devolver el path original
    }
  }
  
  // Si ya es una ruta relativa, devolverla tal cual
  // Remover cualquier prefijo de bucket si existe
  return imagePath.replace(/^photos\//, "").replace(/^\/photos\//, "")
}

/**
 * Procesa una imagen con Topaz Gigapixel
 */
/**
 * Crea un cliente de Supabase para uso en Inngest (sin cookies)
 * Usa el service role key si está disponible, o el anon key con el userId
 */
function createInngestSupabaseClient(userId?: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error("[Inngest] NEXT_PUBLIC_SUPABASE_URL no está configurado")
  }
  
  // Si tenemos service role key, usarlo (máximo privilegio)
  if (supabaseServiceRoleKey) {
    console.log("[Inngest] Usando SUPABASE_SERVICE_ROLE_KEY para acceso completo")
    return createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }
  
  // Si no hay service role key, esto es un problema para buckets privados
  console.warn("[Inngest] ⚠️ SUPABASE_SERVICE_ROLE_KEY no está configurado. Usando anon key - esto puede fallar con buckets privados")
  
  if (!supabaseAnonKey) {
    throw new Error("[Inngest] NEXT_PUBLIC_SUPABASE_ANON_KEY no está configurado")
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export const processTopazGigapixel = inngest.createFunction(
  { id: "process-topaz-gigapixel" },
  { event: "topaz/process" },
  async ({ event, step }) => {
    const { jobId, imagePath, photoId, userId } = event.data

    // Crear cliente de Supabase para Inngest (sin cookies)
    const supabase = createInngestSupabaseClient(userId)
    const topazApiKey = process.env.TOPAZ_API_KEY

    if (!topazApiKey) {
      await step.run("mark-failed", async () => {
        await supabase
          .from("topaz_jobs")
          .update({
            status: "failed",
            error_message: "Topaz API key not configured",
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId)

        await supabase
          .from("photos")
          .update({ topaz_status: "failed" })
          .eq("id", photoId)
      })
      return { success: false, error: "Topaz API key not configured" }
    }

    // Normalizar el path de la imagen
    const normalizedPath = normalizeImagePath(imagePath)
    console.log(`[Inngest Topaz] Path original: ${imagePath}, Path normalizado: ${normalizedPath}`)

    // Actualizar estado a processing
    await step.run("update-status-processing", async () => {
      await supabase
        .from("topaz_jobs")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
        })
        .eq("id", jobId)

      await supabase
        .from("photos")
        .update({ topaz_status: "processing" })
        .eq("id", photoId)
    })

    // Descargar imagen usando signed URL (más confiable para buckets privados)
    const imageBlob = await step.run("download-image", async () => {
      console.log(`[Inngest Topaz] Intentando descargar imagen desde path: ${normalizedPath}`)
      
      // Primero verificar que el bucket existe listando los buckets
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
      if (bucketsError) {
        console.error(`[Inngest Topaz] Error listando buckets:`, bucketsError)
        throw new Error(`Error listando buckets: ${bucketsError.message}`)
      }
      
      const photosBucket = buckets?.find(b => b.name === "photos")
      if (!photosBucket) {
        console.error(`[Inngest Topaz] Bucket 'photos' no encontrado. Buckets disponibles:`, buckets?.map(b => b.name))
        throw new Error(`Bucket 'photos' no existe. Buckets disponibles: ${buckets?.map(b => b.name).join(", ") || "ninguno"}`)
      }
      
      console.log(`[Inngest Topaz] Bucket 'photos' encontrado, es público: ${photosBucket.public}`)
      
      // Para buckets privados, usar createSignedUrl y luego fetch
      // Esto es más confiable que download() directo
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("photos")
        .createSignedUrl(normalizedPath, 3600) // 1 hora de validez
      
      if (signedUrlError || !signedUrlData) {
        console.error(`[Inngest Topaz] Error generando signed URL:`, {
          path: normalizedPath,
          originalPath: imagePath,
          error: signedUrlError,
          errorMessage: signedUrlError?.message,
        })
        
        // Intentar listar archivos para verificar si el archivo existe
        const pathParts = normalizedPath.split("/")
        const folder = pathParts.slice(0, -1).join("/")
        const { data: files, error: listError } = await supabase.storage
          .from("photos")
          .list(folder)
        
        if (listError) {
          console.error(`[Inngest Topaz] Error listando archivos en ${folder}:`, listError)
        } else {
          console.log(`[Inngest Topaz] Archivos en ${folder}:`, files?.map(f => f.name))
        }
        
        throw new Error(`Failed to create signed URL: ${signedUrlError?.message || "Unknown error"}`)
      }
      
      console.log(`[Inngest Topaz] Signed URL generada exitosamente`)
      
      // Descargar usando fetch con la signed URL
      const response = await fetch(signedUrlData.signedUrl)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Inngest Topaz] Error descargando desde signed URL:`, {
          status: response.status,
          statusText: response.statusText,
          errorText,
          signedUrl: signedUrlData.signedUrl.substring(0, 100) + "...", // Solo mostrar parte de la URL
        })
        throw new Error(`Failed to download image: HTTP ${response.status} - ${response.statusText}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      console.log(`[Inngest Topaz] Imagen descargada exitosamente, tamaño: ${arrayBuffer.byteLength} bytes`)
      return new Blob([arrayBuffer], { type: "image/jpeg" })
    })

    // Procesar con Topaz Sharpen
    const sharpenedBlob = await step.run("topaz-sharpen", async () => {
      const formData = new FormData()
      // imageBlob ya es un Blob después del step anterior
      formData.append("image", imageBlob as Blob, "image.jpg")

      const response = await fetch("https://api.topazlabs.com/image/v1/sharpen", {
        method: "POST",
        headers: {
          "X-API-Key": topazApiKey,
          accept: "image/jpeg",
        },
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Topaz Sharpen error: ${response.statusText} - ${errorText}`)
      }

      return await response.blob()
    })

    // Procesar con Topaz Enhance
    const enhancedBlob = await step.run("topaz-enhance", async () => {
      const formData = new FormData()
      // sharpenedBlob ya es un Blob después del step anterior
      formData.append("image", sharpenedBlob as Blob, "image.jpg")
      formData.append("output_width", "3840")
      formData.append("crop_to_fill", "false")
      formData.append("output_format", "jpeg")

      const response = await fetch("https://api.topazlabs.com/image/v1/enhance", {
        method: "POST",
        headers: {
          "X-API-Key": topazApiKey,
          accept: "image/jpeg",
        },
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Topaz Enhance error: ${response.statusText} - ${errorText}`)
      }

      return await response.blob()
    })

    // Subir imagen mejorada
    const enhancedFileName = await step.run("upload-enhanced-image", async () => {
      const fileName = `${userId}/topaz_enhanced_${Date.now()}.jpg`
      // Convertir Blob a ArrayBuffer para Supabase
      const arrayBuffer = await (enhancedBlob as Blob).arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const { error } = await supabase.storage.from("photos").upload(fileName, uint8Array, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      })

      if (error) {
        throw new Error(`Failed to upload: ${error.message}`)
      }

      return fileName
    })

    // Actualizar job y foto como completados
    await step.run("mark-completed", async () => {
      await supabase
        .from("topaz_jobs")
        .update({
          status: "completed",
          result_path: enhancedFileName,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId)

      await supabase
        .from("photos")
        .update({
          topaz_gigapixel_url: enhancedFileName,
          topaz_status: "completed",
        })
        .eq("id", photoId)
    })

    return { success: true, resultPath: enhancedFileName }
  }
)

/**
 * Analiza una imagen con IA (Gemini) para obtener recomendaciones
 */
export const analyzeImageWithAI = inngest.createFunction(
  { id: "analyze-image-ai" },
  { event: "ai/analyze-image" },
  async ({ event, step }) => {
    const { photoId, imageUrl, userId } = event.data

    // Crear cliente de Supabase para Inngest (sin cookies)
    const supabase = createInngestSupabaseClient(userId)

    // Llamar a Gemini para análisis
    const recommendations = await step.run("call-gemini", async () => {
      const { generateText, Output } = await import("ai")
      const { google } = await import("@ai-sdk/google")
      const { z } = await import("zod")

      const imageAnalysisSchema = z.object({
        brightness: z.number().min(-100).max(100).describe("Ajuste de brillo recomendado (-100 a 100)"),
        contrast: z.number().min(-100).max(100).describe("Ajuste de contraste recomendado (-100 a 100)"),
        saturation: z.number().min(-100).max(100).describe("Ajuste de saturación recomendado (-100 a 100)"),
        sharpness: z.number().min(0).max(100).describe("Ajuste de nitidez recomendado (0 a 100)"),
        vibrance: z.number().min(-100).max(100).describe("Ajuste de vibración recomendado (-100 a 100)"),
        temperature: z.number().min(-100).max(100).describe("Ajuste de temperatura de color (-100 a 100)"),
        explanation: z.string().describe("Explicación breve y clara de los ajustes recomendados y por qué"),
      })

      const { output } = await generateText({
        model: google("gemini-2.5-flash"),
        output: Output.object({
          schema: imageAnalysisSchema,
        }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analiza esta imagen fotográfica y recomienda ajustes específicos para mejorar su calidad visual. 

Considera:
- Brillo: exposición general de la imagen (-100 muy oscuro, 0 normal, +100 muy brillante)
- Contraste: diferencia entre luces y sombras (-100 bajo contraste, 0 normal, +100 alto contraste)
- Saturación: intensidad de los colores (-100 desaturado, 0 normal, +100 muy saturado)
- Nitidez: claridad y definición de los detalles (0 sin nitidez, 100 máxima nitidez)
- Vibración: saturación selectiva que protege los tonos de piel (-100 a +100)
- Temperatura: balance de blancos (-100 muy frío/azul, 0 neutro, +100 muy cálido/amarillo)

Proporciona valores numéricos precisos y una explicación clara de por qué cada ajuste mejorará la imagen.`,
              },
              {
                type: "image",
                image: imageUrl,
              },
            ],
          },
        ],
        maxOutputTokens: 1000,
      })

      return output
    })

    // Guardar recomendaciones en la base de datos
    await step.run("save-recommendations", async () => {
      await supabase
        .from("photos")
        .update({ ai_recommendations: recommendations })
        .eq("id", photoId)
    })

    return { success: true, recommendations }
  }
)

/**
 * Aplica ajustes de imagen con sharp
 */
export const applyImageEnhancements = inngest.createFunction(
  { id: "apply-image-enhancements" },
  { event: "image/apply-enhancements" },
  async ({ event, step }) => {
    const { photoId, adjustments } = event.data

    // Crear cliente de Supabase para Inngest (sin cookies)
    // Necesitamos obtener el userId de la foto
    const supabase = createInngestSupabaseClient()

    // Obtener la foto y la imagen de Topaz
    const photo = await step.run("get-photo", async () => {
      const { data, error } = await supabase
        .from("photos")
        .select("user_id, topaz_gigapixel_url, topaz_status")
        .eq("id", photoId)
        .single()

      if (error || !data) {
        throw new Error("Photo not found")
      }

      if (!data.topaz_gigapixel_url || data.topaz_status !== "completed") {
        throw new Error("La imagen debe estar procesada por Topaz antes de aplicar ajustes")
      }

      return data
    })

    // Crear cliente de Supabase con el userId de la foto
    const supabaseWithUser = createInngestSupabaseClient(photo.user_id)

    // Descargar imagen usando signed URL (más confiable para buckets privados)
    const imageBlob = await step.run("download-image", async () => {
      // Normalizar el path de la imagen de Topaz
      const normalizedPath = normalizeImagePath(photo.topaz_gigapixel_url)
      console.log(`[Inngest Enhance] Path original: ${photo.topaz_gigapixel_url}, Path normalizado: ${normalizedPath}`)
      
      // Generar signed URL para descargar
      const { data: signedUrlData, error: signedUrlError } = await supabaseWithUser.storage
        .from("photos")
        .createSignedUrl(normalizedPath, 3600) // 1 hora de validez
      
      if (signedUrlError || !signedUrlData) {
        console.error(`[Inngest Enhance] Error generando signed URL:`, {
          path: normalizedPath,
          error: signedUrlError,
        })
        throw new Error(`Failed to create signed URL: ${signedUrlError?.message || "Unknown error"}`)
      }
      
      console.log(`[Inngest Enhance] Signed URL generada, descargando imagen...`)
      
      // Descargar usando fetch con la signed URL
      const response = await fetch(signedUrlData.signedUrl)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[Inngest Enhance] Error descargando desde signed URL:`, {
          status: response.status,
          statusText: response.statusText,
          errorText,
        })
        throw new Error(`Failed to download image: HTTP ${response.status} - ${response.statusText}`)
      }
      
      const arrayBuffer = await response.arrayBuffer()
      console.log(`[Inngest Enhance] Imagen descargada exitosamente, tamaño: ${arrayBuffer.byteLength} bytes`)
      return new Blob([arrayBuffer], { type: "image/jpeg" })
    })

    // Procesar imagen con sharp
    const enhancedBuffer = await step.run("process-with-sharp", async () => {
      const sharp = (await import("sharp")).default
      // imageBlob ya es un Blob después del step anterior
      const arrayBuffer = await (imageBlob as Blob).arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      let imageProcessor = sharp(buffer)

      // Brightness
      if (adjustments.brightness !== 0) {
        const brightnessValue = 1 + adjustments.brightness / 100
        imageProcessor = imageProcessor.modulate({
          brightness: Math.max(0.5, Math.min(2.0, brightnessValue)),
        })
      }

      // Contrast
      if (adjustments.contrast !== 0) {
        const contrastFactor = 1 + adjustments.contrast / 100
        const a = contrastFactor
        const offset = (1 - contrastFactor) * 128
        imageProcessor = imageProcessor.linear(a, offset)
      }

      // Saturation + Vibrance
      if (adjustments.saturation !== 0 || adjustments.vibrance !== 0) {
        const saturationValue = 1 + adjustments.saturation / 100
        const vibranceValue = 1 + adjustments.vibrance / 200
        const combinedSaturation = Math.max(0, Math.min(2, saturationValue * vibranceValue))
        imageProcessor = imageProcessor.modulate({
          saturation: combinedSaturation,
        })
      }

      // Sharpness
      if (adjustments.sharpness > 0) {
        const sigma = 0.3 + (adjustments.sharpness / 100) * 2.7
        imageProcessor = imageProcessor.sharpen(sigma)
      }

      // Temperature
      if (adjustments.temperature !== 0) {
        const tempFactor = adjustments.temperature / 100
        const rBoost = Math.max(0, tempFactor)
        const bReduction = Math.max(0, -tempFactor)

        imageProcessor = imageProcessor.recomb([
          [1 + rBoost * 0.1, 0, 0],
          [0, 1, 0],
          [0, 0, 1 - bReduction * 0.1],
        ])
      }

      return await imageProcessor.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    })

    // Subir imagen mejorada
    const enhancedFileName = await step.run("upload-enhanced-image", async () => {
      const fileName = `${photo.user_id}/enhanced_${Date.now()}.jpg`
      // Usar el cliente con usuario para subir
      // enhancedBuffer es un Buffer de Node.js, convertirlo a Uint8Array para Supabase
      // Si es un Buffer real, usar directamente; si está serializado, reconstruirlo
      let uint8Array: Uint8Array
      if (Buffer.isBuffer(enhancedBuffer)) {
        uint8Array = new Uint8Array(enhancedBuffer.buffer, enhancedBuffer.byteOffset, enhancedBuffer.byteLength)
      } else {
        // Si está serializado (puede pasar en algunos entornos)
        const buffer = Buffer.from(enhancedBuffer as unknown as ArrayLike<number>)
        uint8Array = new Uint8Array(buffer)
      }
      const { error } = await supabase.storage.from("photos").upload(fileName, uint8Array, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      })

      if (error) {
        throw new Error(`Failed to upload: ${error.message}`)
      }

      return fileName
    })

    // Actualizar registro de foto
    await step.run("update-photo", async () => {
      await supabaseWithUser
        .from("photos")
        .update({
          enhanced_url: enhancedFileName,
          ai_recommendations: adjustments,
        })
        .eq("id", photoId)
    })

    return { success: true, enhancedImagePath: enhancedFileName }
  }
)

