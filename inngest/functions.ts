import { inngest } from "./client"
import { createClient } from "@/lib/supabase/server"

/**
 * Procesa una imagen con Topaz Gigapixel
 */
export const processTopazGigapixel = inngest.createFunction(
  { id: "process-topaz-gigapixel" },
  { event: "topaz/process" },
  async ({ event, step }) => {
    const { jobId, imagePath, photoId, userId } = event.data

    const supabase = await createClient()
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

    // Descargar imagen
    const imageBlob = await step.run("download-image", async () => {
      const { data, error } = await supabase.storage.from("photos").download(imagePath)
      if (error || !data) {
        throw new Error(`Failed to download image: ${error?.message}`)
      }
      // Supabase Storage devuelve un objeto con método arrayBuffer()
      // Usar type assertion para acceder al método
      const supabaseBlob = data as any as { arrayBuffer(): Promise<ArrayBuffer> }
      const arrayBuffer = await supabaseBlob.arrayBuffer()
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
    const { photoId, imageUrl } = event.data

    const supabase = await createClient()

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

    const supabase = await createClient()

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

    // Descargar imagen
    const imageBlob = await step.run("download-image", async () => {
      const { data, error } = await supabase.storage
        .from("photos")
        .download(photo.topaz_gigapixel_url)

      if (error || !data) {
        throw new Error(`Failed to download image: ${error?.message}`)
      }

      // Supabase Storage devuelve un objeto con método arrayBuffer()
      // Usar type assertion para acceder al método
      const supabaseBlob = data as any as { arrayBuffer(): Promise<ArrayBuffer> }
      const arrayBuffer = await supabaseBlob.arrayBuffer()
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
      await supabase
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

