"use client"

import { use, useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Sparkles, ImageIcon, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getSignedImageUrl } from "@/lib/supabase/images"
import Link from "next/link"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"

interface ImageRecommendations {
  brightness: number
  contrast: number
  saturation: number
  sharpness: number
  vibrance: number
  temperature: number
  explanation: string
}

export default function EnhancePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const [photo, setPhoto] = useState<any>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<ImageRecommendations | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adjustments, setAdjustments] = useState({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpness: 0,
    vibrance: 0,
    temperature: 0,
  })
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const previousImageUrlRef = useRef<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    loadPhoto()
  }, [resolvedParams.id])

  const loadPhoto = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("photos")
        .select("*, topaz_gigapixel_url, topaz_status")
        .eq("id", resolvedParams.id)
        .single()

      if (error) throw error
      setPhoto(data)

      // Verificar que la imagen de Topaz esté disponible
      if (!data.topaz_gigapixel_url || data.topaz_status !== "completed") {
        setError("La imagen debe estar procesada por Topaz antes de aplicar ajustes. Por favor, espera a que se complete el procesamiento.")
        return
      }

      // Get signed URL for the image - usar la imagen mejorada por Topaz
      const imagePath = data.topaz_gigapixel_url
      const signedUrl = await getSignedImageUrl(imagePath)
      if (signedUrl) {
        setImageUrl(signedUrl)
        // Cargar imagen para procesamiento en canvas
        loadImageForProcessing(signedUrl)
      } else {
        setError("Error al cargar la imagen")
        return
      }

      if (data.ai_recommendations) {
        setRecommendations(data.ai_recommendations)
        setAdjustments(data.ai_recommendations)
      } else {
        analyzeImage(signedUrl)
      }
    } catch (err) {
      setError("Error al cargar la foto")
    }
  }

  const analyzeImage = async (imageUrl: string) => {
    setIsAnalyzing(true)
    setError(null)

    try {
      const response = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, photoId: resolvedParams.id }),
      })

      if (!response.ok) throw new Error("Error al analizar la imagen")

      // El análisis ahora es asíncrono, usar polling para verificar cuando esté listo
      const supabase = createClient()
      const checkRecommendations = async () => {
        const { data } = await supabase
          .from("photos")
          .select("ai_recommendations")
          .eq("id", resolvedParams.id)
          .single()

        if (data?.ai_recommendations) {
          setRecommendations(data.ai_recommendations)
          setAdjustments(data.ai_recommendations)
          setIsAnalyzing(false)
          return true
        }
        return false
      }

      // Verificar inmediatamente (por si ya está listo)
      if (await checkRecommendations()) {
        return
      }

      // Polling cada 2 segundos hasta que esté listo (máximo 30 segundos)
      let attempts = 0
      const maxAttempts = 15
      const pollInterval = setInterval(async () => {
        attempts++
        if (await checkRecommendations() || attempts >= maxAttempts) {
          clearInterval(pollInterval)
          if (attempts >= maxAttempts) {
            setError("El análisis está tardando más de lo esperado. Por favor, recarga la página.")
            setIsAnalyzing(false)
          }
        }
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar la imagen")
      setIsAnalyzing(false)
    }
  }

  const applyEnhancements = async () => {
    setIsApplying(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth/login")
        return
      }

      // Verificar que la imagen de Topaz esté disponible
      if (!photo.topaz_gigapixel_url) {
        throw new Error("La imagen debe estar procesada por Topaz antes de aplicar ajustes")
      }

      // Llamar al endpoint para aplicar los ajustes (el endpoint obtendrá topaz_gigapixel_url)
      const response = await fetch("/api/apply-enhancements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoId: resolvedParams.id,
          adjustments,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al aplicar mejoras")
      }

      const result = await response.json()

      // Redirigir a preview
      router.push(`/preview/${resolvedParams.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aplicar mejoras")
    } finally {
      setIsApplying(false)
    }
  }

  // Procesar imagen con Canvas API (más preciso que CSS filters)
  const processImageWithCanvas = useCallback(() => {
    if (!canvasRef.current || !imageRef.current) return

    setIsProcessing(true)
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      setIsProcessing(false)
      return
    }

    const img = imageRef.current

    // Establecer tamaño del canvas igual a la imagen
    canvas.width = img.width
    canvas.height = img.height

    // Dibujar imagen original
    ctx.drawImage(img, 0, 0)

    // Obtener datos de píxeles
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    // Aplicar ajustes EXACTAMENTE como sharp los aplica
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]

      // 1. Brightness: EXACTO como sharp modulate
      // sharp: brightness = 1 + (brightness / 100), limitado a [0.5, 2.0]
      if (adjustments.brightness !== 0) {
        const brightnessValue = 1 + adjustments.brightness / 100
        const brightnessFactor = Math.max(0.5, Math.min(2.0, brightnessValue))
        r *= brightnessFactor
        g *= brightnessFactor
        b *= brightnessFactor
      }

      // 2. Contrast: EXACTO como sharp linear(a, b)
      // sharp: a = 1 + (contrast / 100), b = (1 - a) * 128
      // linear: output = a * input + offset
      if (adjustments.contrast !== 0) {
        const contrastFactor = 1 + adjustments.contrast / 100
        const a = contrastFactor
        const offset = (1 - contrastFactor) * 128
        r = a * r + offset
        g = a * g + offset
        b = a * b + offset
      }

      // 3. Saturation + Vibrance: EXACTO como sharp (combinados multiplicativamente)
      // sharp: saturationValue = 1 + (saturation / 100)
      // sharp: vibranceValue = 1 + (vibrance / 200)
      // sharp: combinedSaturation = saturationValue * vibranceValue
      if (adjustments.saturation !== 0 || adjustments.vibrance !== 0) {
        const saturationValue = 1 + adjustments.saturation / 100
        const vibranceValue = 1 + adjustments.vibrance / 200
        const combinedSaturation = Math.max(0, Math.min(2, saturationValue * vibranceValue))
        
        // Aplicar saturación combinada
        const gray = 0.299 * r + 0.587 * g + 0.114 * b
        r = gray + (r - gray) * combinedSaturation
        g = gray + (g - gray) * combinedSaturation
        b = gray + (b - gray) * combinedSaturation
      }

      // 4. Temperature: EXACTO como sharp recomb (multiplicación de matrices)
      // sharp: recomb([[1 + rBoost * 0.1, 0, 0], [0, 1, 0], [0, 0, 1 - bReduction * 0.1]])
      // donde rBoost = max(0, tempFactor) y bReduction = max(0, -tempFactor)
      if (adjustments.temperature !== 0) {
        const tempFactor = adjustments.temperature / 100 // -1 a +1
        const rBoost = Math.max(0, tempFactor) // Solo positivo para cálido
        const bReduction = Math.max(0, -tempFactor) // Solo positivo para frío
        
        // Aplicar matriz de recombinación RGB
        const rNew = r * (1 + rBoost * 0.1)
        const gNew = g * 1 // Verde sin cambio
        const bNew = b * (1 - bReduction * 0.1)
        
        r = rNew
        g = gNew
        b = bNew
      }

      // 5. Sharpness: sharp usa unsharp mask con sigma
      // Para Canvas, aplicamos un contraste local mejorado
      // Nota: Un unsharp mask real requeriría procesar píxeles vecinos (kernel de convolución)
      // Por ahora, usamos un método que se aproxima mejor
      if (adjustments.sharpness > 0) {
        // Convertir 0-100 a sigma 0.3-3.0 (igual que sharp)
        const sigma = 0.3 + (adjustments.sharpness / 100) * 2.7
        // Aplicar unsharp mask simplificado: aumentar contraste local
        const avg = (r + g + b) / 3
        const amount = sigma * 0.1 // Factor de intensidad basado en sigma
        r = r + (r - avg) * amount
        g = g + (g - avg) * amount
        b = b + (b - avg) * amount
      }

      // Asegurar valores en rango [0, 255]
      data[i] = Math.max(0, Math.min(255, r))
      data[i + 1] = Math.max(0, Math.min(255, g))
      data[i + 2] = Math.max(0, Math.min(255, b))
    }

    // Aplicar datos procesados
    ctx.putImageData(imageData, 0, 0)

    // Convertir canvas a URL para mostrar
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          // Liberar URL anterior si existe
          if (previousImageUrlRef.current) {
            URL.revokeObjectURL(previousImageUrlRef.current)
          }
          previousImageUrlRef.current = url
          setProcessedImageUrl(url)
        }
        setIsProcessing(false)
      },
      "image/jpeg",
      0.95
    )
  }, [adjustments])

  // Cargar imagen para procesamiento en canvas
  const loadImageForProcessing = useCallback(
    (url: string) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        imageRef.current = img
        processImageWithCanvas()
      }
      img.onerror = () => {
        console.error("Error loading image for processing")
        setIsProcessing(false)
      }
      img.src = url
    },
    [processImageWithCanvas]
  )

  // Reprocesar cuando cambien los ajustes (con debounce)
  useEffect(() => {
    if (imageRef.current) {
      // Limpiar timeout anterior
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
      }
      // Debounce: esperar 100ms después del último cambio
      processingTimeoutRef.current = setTimeout(() => {
        processImageWithCanvas()
      }, 100)
    }

    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustments])

  // Limpiar URL al desmontar
  useEffect(() => {
    return () => {
      if (previousImageUrlRef.current) {
        URL.revokeObjectURL(previousImageUrlRef.current)
      }
    }
  }, [])

  if (!photo) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
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
              Cancelar
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Vista Previa</CardTitle>
                <CardDescription>Imagen con ajustes aplicados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden bg-slate-100 relative">
                  {isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-10">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                  )}
                  {processedImageUrl ? (
                    <img src={processedImageUrl} alt="Preview" className="w-full h-auto" />
                  ) : (
                    <img src={imageUrl || "/placeholder.svg"} alt="Preview" className="w-full h-auto" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Mejoras con IA
                </CardTitle>
                <CardDescription>
                  {isAnalyzing ? "Analizando imagen..." : "Ajusta los parámetros para mejorar tu foto"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isAnalyzing ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
                    <p className="text-slate-600">Analizando tu fotografía...</p>
                  </div>
                ) : (
                  <>
                    {recommendations && (
                      <div className="p-4 bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <Sparkles className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <h4 className="font-semibold text-blue-900 mb-2">Recomendaciones de IA</h4>
                            <p className="text-sm text-slate-700 leading-relaxed">{recommendations.explanation}</p>
                            <div className="mt-3 pt-3 border-t border-blue-200">
                              <p className="text-xs text-slate-600">
                                💡 Los valores recomendados ya están aplicados en los controles. Puedes ajustarlos manualmente si lo deseas.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Brillo</Label>
                          <span className="text-sm text-slate-600">{adjustments.brightness}</span>
                        </div>
                        <Slider
                          value={[adjustments.brightness]}
                          onValueChange={(value) => setAdjustments({ ...adjustments, brightness: value[0] })}
                          min={-100}
                          max={100}
                          step={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Contraste</Label>
                          <span className="text-sm text-slate-600">{adjustments.contrast}</span>
                        </div>
                        <Slider
                          value={[adjustments.contrast]}
                          onValueChange={(value) => setAdjustments({ ...adjustments, contrast: value[0] })}
                          min={-100}
                          max={100}
                          step={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Saturación</Label>
                          <span className="text-sm text-slate-600">{adjustments.saturation}</span>
                        </div>
                        <Slider
                          value={[adjustments.saturation]}
                          onValueChange={(value) => setAdjustments({ ...adjustments, saturation: value[0] })}
                          min={-100}
                          max={100}
                          step={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Nitidez</Label>
                          <span className="text-sm text-slate-600">{adjustments.sharpness}</span>
                        </div>
                        <Slider
                          value={[adjustments.sharpness]}
                          onValueChange={(value) => setAdjustments({ ...adjustments, sharpness: value[0] })}
                          min={0}
                          max={100}
                          step={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Vibración</Label>
                          <span className="text-sm text-slate-600">{adjustments.vibrance}</span>
                        </div>
                        <Slider
                          value={[adjustments.vibrance]}
                          onValueChange={(value) => setAdjustments({ ...adjustments, vibrance: value[0] })}
                          min={-100}
                          max={100}
                          step={1}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Temperatura</Label>
                          <span className="text-sm text-slate-600">{adjustments.temperature}</span>
                        </div>
                        <Slider
                          value={[adjustments.temperature]}
                          onValueChange={(value) => setAdjustments({ ...adjustments, temperature: value[0] })}
                          min={-100}
                          max={100}
                          step={1}
                        />
                      </div>
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <Button onClick={applyEnhancements} disabled={isApplying} className="w-full" size="lg">
                      <Sparkles className="w-4 h-4 mr-2" />
                      {isApplying ? "Aplicando..." : "Aplicar y Continuar"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Canvas oculto para procesamiento */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
