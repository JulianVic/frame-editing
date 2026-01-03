"use client"

import type React from "react"

import { use, useEffect, useState, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Crop, ImageIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getSignedImageUrl, getProxyImageUrl } from "@/lib/supabase/images"
import Link from "next/link"
import ReactCrop, { type Crop as CropType } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import type { Photo } from "@/types"

export default function CropPage({ params }: { params: Promise<{ id: string }> }) {
  const clientParams = useParams()
  const resolvedParams = use(params)
  const [photoId, setPhotoId] = useState<string | null>(null)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  // Solo horizontal (3:2)
  const aspectRatio = 3 / 2
  const [crop, setCrop] = useState<CropType>()
  const [completedCrop, setCompletedCrop] = useState<CropType>()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const router = useRouter()

  // Get photoId from multiple sources with fallbacks
  useEffect(() => {
    let id: string | null = null

    // Try resolvedParams first
    if (resolvedParams?.id) {
      id = resolvedParams.id
    }
    // Fallback to clientParams
    else if (clientParams?.id) {
      id = Array.isArray(clientParams.id) ? clientParams.id[0] : clientParams.id
    }
    // Final fallback: extract from URL
    else if (typeof window !== "undefined") {
      const pathParts = window.location.pathname.split("/").filter(Boolean)
      const cropIndex = pathParts.indexOf("crop")
      if (cropIndex !== -1 && pathParts[cropIndex + 1]) {
        id = pathParts[cropIndex + 1]
      }
    }

    if (id) {
      setPhotoId(id)
    } else {
      console.error("Could not extract photo ID:", { resolvedParams, clientParams })
    }
  }, [resolvedParams, clientParams])

  useEffect(() => {
    if (photoId) {
      loadPhoto()
    }
  }, [photoId])

  const processWithTopaz = async (imagePath: string, photoId: string) => {
    try {
      console.log("[Crop] Iniciando job de Topaz Gigapixel")
      
      const response = await fetch("/api/topaz-upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath, photoId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("[Crop] Error creando job:", errorData)
        throw new Error(errorData.error || "Error creando job de Topaz")
      }

      const result = await response.json()
      console.log("[Crop] Job creado:", result.jobId)
      // El procesamiento continúa en background
    } catch (error) {
      console.error("[Crop] Error iniciando procesamiento con Topaz:", error)
      // No lanzamos el error para no bloquear el flujo
    }
  }

  const loadPhoto = async () => {
    if (!photoId) return
    
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("photos").select("*").eq("id", photoId).single()

      if (error) throw error
      setPhoto(data)

      // Get proxy URL for the image (needed for canvas CORS)
      // Use proxy URL instead of signed URL to avoid CORS issues with canvas
      const proxyUrl = getProxyImageUrl(data.original_url)
      if (proxyUrl) {
        setImageUrl(proxyUrl)
      } else {
        setError("Error al cargar la imagen")
      }
    } catch (err) {
      setError("Error al cargar la foto")
    }
  }

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget

    let cropWidth, cropHeight
    if (width / height > aspectRatio) {
      cropHeight = height
      cropWidth = height * aspectRatio
    } else {
      cropWidth = width
      cropHeight = width / aspectRatio
    }

    const x = (width - cropWidth) / 2
    const y = (height - cropHeight) / 2

    setCrop({
      unit: "px",
      x,
      y,
      width: cropWidth,
      height: cropHeight,
    })
  }

  const getCroppedImg = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!completedCrop || !imgRef.current) {
        reject(new Error("No crop or image"))
        return
      }

      const image = imgRef.current
      const canvas = document.createElement("canvas")
      const scaleX = image.naturalWidth / image.width
      const scaleY = image.naturalHeight / image.height
      canvas.width = completedCrop.width * scaleX
      canvas.height = completedCrop.height * scaleY
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        reject(new Error("No 2d context"))
        return
      }

      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        canvas.width,
        canvas.height,
      )

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas is empty"))
            return
          }
          resolve(blob)
        },
        "image/jpeg",
        0.95,
      )
    })
  }

  const handleSaveCrop = async () => {
    if (!completedCrop) {
      setError("Por favor selecciona un área para recortar")
      return
    }

    setIsProcessing(true)
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

      const croppedBlob = await getCroppedImg()

      // Upload cropped image
      const fileName = `${user.id}/cropped_${Date.now()}.jpg`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("photos")
        .upload(fileName, croppedBlob, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Store only the file path, not the full URL
      // Update photo record
      const { error: updateError } = await supabase
        .from("photos")
        .update({
          cropped_url: fileName, // Store path instead of URL
          aspect_ratio: "3:2", // Solo horizontal
        })
        .eq("id", photoId)

      if (updateError) throw updateError

      // Verificar si ya existe una imagen mejorada por Topaz
      const { data: updatedPhoto } = await supabase
        .from("photos")
        .select("topaz_gigapixel_url, topaz_status")
        .eq("id", photoId)
        .single()

      // Iniciar procesamiento con Topaz solo si no existe ya una imagen mejorada
      if (photoId && !updatedPhoto?.topaz_gigapixel_url) {
        processWithTopaz(fileName, photoId).catch((err) => {
          console.error("Error iniciando procesamiento con Topaz:", err)
          // No bloqueamos el flujo si Topaz falla
        })
      }

      // Redirigir según el estado
      if (photoId) {
        if (updatedPhoto?.topaz_gigapixel_url) {
          // Si ya tiene imagen de Topaz, ir directamente a comparación
          router.push(`/topaz-comparison/${photoId}`)
        } else if (updatedPhoto?.topaz_status === "processing" || updatedPhoto?.topaz_status === "pending") {
          // Si está procesando, ir a comparación para ver el progreso
          router.push(`/topaz-comparison/${photoId}`)
        } else {
          // Si no hay Topaz, ir a comparación para iniciar el proceso
          router.push(`/topaz-comparison/${photoId}`)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar la imagen")
    } finally {
      setIsProcessing(false)
    }
  }

  if (!photo) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-gradient-to-br from-slate-50 to-slate-100">
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
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Recortar Imagen</CardTitle>
              <CardDescription>Selecciona la proporción y ajusta el área de recorte</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Proporción de Aspecto</Label>
                <div className="p-3 bg-slate-50 rounded-lg border">
                  <p className="text-sm text-slate-600">3:2 (Horizontal)</p>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden bg-slate-100">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspectRatio}
                >
                  <img
                    ref={imgRef}
                    src={imageUrl || "/placeholder.svg"}
                    alt="Original"
                    onLoad={onImageLoad}
                    crossOrigin="anonymous"
                    className="max-w-full"
                  />
                </ReactCrop>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button onClick={handleSaveCrop} disabled={isProcessing} className="w-full" size="lg">
                <Crop className="w-4 h-4 mr-2" />
                {isProcessing ? "Procesando..." : "Guardar y Mejorar"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
