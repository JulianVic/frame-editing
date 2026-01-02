"use client"

import { use, useEffect, useState } from "react"
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
  const router = useRouter()

  useEffect(() => {
    loadPhoto()
  }, [resolvedParams.id])

  const loadPhoto = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("photos").select("*").eq("id", resolvedParams.id).single()

      if (error) throw error
      setPhoto(data)

      // Get signed URL for the image
      const imagePath = data.cropped_url || data.original_url
      const signedUrl = await getSignedImageUrl(imagePath)
      if (signedUrl) {
        setImageUrl(signedUrl)
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
        body: JSON.stringify({ imageUrl }),
      })

      if (!response.ok) throw new Error("Error al analizar la imagen")

      const data = await response.json()
      setRecommendations(data.recommendations)
      setAdjustments(data.recommendations)

      // Save recommendations to database
      const supabase = createClient()
      await supabase.from("photos").update({ ai_recommendations: data.recommendations }).eq("id", resolvedParams.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar la imagen")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const applyEnhancements = async () => {
    setIsApplying(true)
    setError(null)

    try {
      const supabase = createClient()

      // In a real app, you would apply the adjustments to the image here
      // For now, we'll just mark it as enhanced and continue to PDF generation
      // Store the path of the cropped or original image
      const { error: updateError } = await supabase
        .from("photos")
        .update({
          enhanced_url: photo.cropped_url || photo.original_url, // Store path, not URL
          ai_recommendations: adjustments,
        })
        .eq("id", resolvedParams.id)

      if (updateError) throw updateError

      router.push(`/preview/${resolvedParams.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aplicar mejoras")
    } finally {
      setIsApplying(false)
    }
  }

  const getFilterStyle = () => {
    return {
      filter: `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%) saturate(${100 + adjustments.saturation}%)`,
    }
  }

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
                <div className="border rounded-lg overflow-hidden bg-slate-100">
                  <img
                    src={imageUrl || "/placeholder.svg"}
                    alt="Preview"
                    style={getFilterStyle()}
                    className="w-full h-auto"
                  />
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
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-sm text-slate-700">{recommendations.explanation}</p>
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
    </div>
  )
}
