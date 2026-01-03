"use client"

import { use, useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, ArrowRight, ImageIcon, Loader2, RefreshCw, Download } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getSignedImageUrl, getProxyImageUrl } from "@/lib/supabase/images"
import { ImageComparisonSlider } from "@/components/image-comparison-slider"
import Link from "next/link"
import type { Photo, TopazStatus } from "@/types"

export default function TopazComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const clientParams = useParams()
  const [photoId, setPhotoId] = useState<string | null>(null)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [topazUrl, setTopazUrl] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<TopazStatus>("pending")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Get photoId from multiple sources
  useEffect(() => {
    let id: string | null = null

    if (resolvedParams?.id) {
      id = resolvedParams.id
    } else if (clientParams?.id) {
      id = Array.isArray(clientParams.id) ? clientParams.id[0] : clientParams.id
    } else if (typeof window !== "undefined") {
      const pathParts = window.location.pathname.split("/").filter(Boolean)
      const comparisonIndex = pathParts.indexOf("topaz-comparison")
      if (comparisonIndex !== -1 && pathParts[comparisonIndex + 1]) {
        id = pathParts[comparisonIndex + 1]
      }
    }

    if (id) {
      setPhotoId(id)
    }
  }, [resolvedParams, clientParams])

  useEffect(() => {
    if (photoId) {
      loadPhoto()
    }
  }, [photoId])

  const loadPhoto = async () => {
    if (!photoId) return

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("photos").select("*").eq("id", photoId).single()

      if (error) throw error
      setPhoto(data)

      // Cargar URL de la imagen original (recortada)
      const originalPath = data.cropped_url || data.original_url
      if (originalPath) {
        const signedUrl = await getSignedImageUrl(originalPath)
        if (signedUrl) {
          setOriginalUrl(signedUrl)
        }
      }

      // Buscar job activo para esta foto
      const { data: jobs } = await supabase
        .from("topaz_jobs")
        .select("id, status")
        .eq("photo_id", photoId)
        .order("created_at", { ascending: false })
        .limit(1)

      if (jobs && jobs.length > 0) {
        const job = jobs[0]
        setJobId(job.id)
        setJobStatus(job.status as any)

        // Si está completado, obtener signed URL desde el endpoint de status
        if (job.status === "completed") {
          // Obtener signed URL desde el endpoint
          const statusResponse = await fetch(`/api/topaz-status/${job.id}`)
          if (statusResponse.ok) {
            const statusData = await statusResponse.json()
            if (statusData.imageUrl) {
              setTopazUrl(statusData.imageUrl)
            } else if (data.topaz_gigapixel_url) {
              // Fallback: obtener signed URL del path
              const signedUrl = await getSignedImageUrl(data.topaz_gigapixel_url)
              if (signedUrl) {
                setTopazUrl(signedUrl)
              }
            }
          }
        } else if (job.status === "pending" || job.status === "processing") {
          // La suscripción Realtime y polling se activarán automáticamente cuando jobId se establezca
          console.log(`[LoadPhoto] Job ${job.id} está ${job.status}, esperando actualización...`)
        }
      } else if (data.topaz_status === "processing" || data.topaz_status === "pending") {
        // Si no hay job pero el status indica procesamiento, crear uno o esperar
        // Esto puede pasar si el job se creó pero aún no está en la BD
        setTimeout(() => loadPhoto(), 1000) // Reintentar después de 1 segundo
      }
    } catch (err) {
      console.error("Error cargando foto:", err)
      setError("Error al cargar la foto")
    } finally {
      setIsLoading(false)
    }
  }

  // Suscripción a Supabase Realtime para cambios en el job (SIN polling)
  useEffect(() => {
    if (!jobId) {
      console.log("[Realtime] No hay jobId, saltando suscripción")
      return
    }

    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let isCompleted = false // Flag para evitar actualizaciones duplicadas

    console.log("[Realtime] Configurando suscripción para job:", jobId)

    // Función para actualizar la UI cuando el job se completa
    const handleJobCompleted = async () => {
      if (isCompleted) {
        console.log("[Realtime] Job ya estaba completado, ignorando actualización duplicada")
        return
      }

      isCompleted = true
      console.log("[Realtime] Job completado, obteniendo signed URL...")

      const statusResponse = await fetch(`/api/topaz-status/${jobId}`)
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        if (statusData.imageUrl) {
          console.log("[Realtime] ✅ URL obtenida, actualizando UI con imagen mejorada")
          setTopazUrl(statusData.imageUrl)
          setJobStatus("completed")
        } else {
          console.warn("[Realtime] ⚠️ Job completado pero no hay imageUrl")
        }
      } else {
        console.error("[Realtime] ❌ Error obteniendo signed URL:", statusResponse.status)
      }
    }

    // Intentar suscribirse a Realtime
    try {
      channel = supabase
        .channel(`topaz-job-${jobId}`, {
          config: {
            broadcast: { self: false },
          },
        })
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "topaz_jobs",
            filter: `id=eq.${jobId}`,
          },
          async (payload) => {
            console.log("[Realtime] 📨 Evento recibido:", {
              oldStatus: (payload.old as any)?.status,
              newStatus: (payload.new as any)?.status,
              hasResultPath: !!(payload.new as any)?.result_path,
            })
            const updatedJob = payload.new as any

            // Actualizar estado inmediatamente
            if (updatedJob.status !== jobStatus) {
              console.log(`[Realtime] Estado cambiado: ${jobStatus} → ${updatedJob.status}`)
              setJobStatus(updatedJob.status)
            }

            if (updatedJob.status === "completed" && updatedJob.result_path) {
              await handleJobCompleted()
            } else if (updatedJob.status === "failed") {
              isCompleted = true
              setError(updatedJob.error_message || "Error procesando la imagen con Topaz Gigapixel")
            } else if (updatedJob.status === "processing") {
              console.log("[Realtime] 🔄 Job en procesamiento...")
            }
          }
        )
        .subscribe((status) => {
          console.log("[Realtime] Estado de suscripción:", status)
          if (status === "SUBSCRIBED") {
            console.log("[Realtime] ✅ Suscrito exitosamente al job:", jobId)
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("[Realtime] ❌ Error en suscripción Realtime:", status)
            console.error("[Realtime] ⚠️ IMPORTANTE: Realtime no está disponible. Verifica que:")
            console.error("  1. La tabla 'topaz_jobs' tenga Realtime habilitado en Supabase Dashboard")
            console.error("  2. Ejecuta el script: scripts/005_enable_realtime_topaz_jobs.sql")
            setError("Error de conexión en tiempo real. Por favor, recarga la página para verificar el estado.")
          }
        })
    } catch (error) {
      console.error("[Realtime] ❌ Error configurando suscripción:", error)
      setError("Error configurando suscripción en tiempo real. Por favor, recarga la página.")
    }

    // Cleanup: desuscribirse cuando el componente se desmonte o el jobId cambie
    return () => {
      console.log("[Realtime] 🧹 Limpiando suscripción para job:", jobId)
      isCompleted = true // Prevenir actualizaciones después del cleanup
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [jobId]) // Solo dependemos de jobId


  const handleContinue = () => {
    if (topazUrl) {
      // Usar la imagen mejorada para el siguiente paso
      router.push(`/enhance/${photoId}`)
    } else {
      // Si no hay imagen mejorada, continuar con la original
      router.push(`/enhance/${photoId}`)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  if (!photo) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <p className="text-red-500">Foto no encontrada</p>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-linear-to-br from-slate-50 to-slate-100">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-6 h-6" />
            <h1 className="text-xl font-bold">FrameAI</h1>
          </div>
          <Button variant="ghost" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Comparación: Antes vs Después</CardTitle>
              <CardDescription>
                Compara la imagen original con la versión mejorada por Topaz Gigapixel AI
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {(jobStatus === "pending" || jobStatus === "processing") && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    <p className="text-sm text-blue-600">
                      {jobStatus === "pending"
                        ? "Iniciando procesamiento con Topaz Gigapixel AI..."
                        : "Mejorando calidad de imagen con IA... Esto puede tomar unos momentos."}
                    </p>
                  </div>
                </div>
              )}

              {/* Image Comparison Slider */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Comparación Interactiva</h3>
                    <p className="text-sm text-slate-600">
                      Desliza la barra para comparar la imagen original con la versión mejorada
                    </p>
                  </div>
                  {jobStatus === "completed" && topazUrl && (
                    <span className="text-xs text-green-500 bg-green-100 px-2 py-1 rounded">
                      Mejorada
                    </span>
                  )}
                </div>

                <ImageComparisonSlider
                  beforeImage={originalUrl}
                  afterImage={topazUrl}
                  isLoading={jobStatus === "pending" || jobStatus === "processing"}
                  beforeLabel="Original"
                  afterLabel="Topaz Gigapixel"
                />
              </div>

              {/* Información adicional */}
              {topazUrl && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700">
                    ✓ La imagen ha sido mejorada exitosamente con Topaz Gigapixel AI. La calidad y
                    resolución han sido aumentadas significativamente.
                  </p>
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex gap-4 pt-4">
                <Button onClick={handleContinue} className="flex-1" size="lg">
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Continuar con {topazUrl ? "imagen mejorada" : "imagen original"}
                </Button>
                {topazUrl && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const link = document.createElement("a")
                      link.href = topazUrl
                      link.download = `topaz-enhanced-${photoId}.jpg`
                      link.click()
                    }}
                    size="lg"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Mejorada
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

