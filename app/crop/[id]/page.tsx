"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ArrowLeft, Crop, ImageIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getSignedImageUrl } from "@/lib/supabase/images"
import Link from "next/link"
import ReactCrop, { type Crop as CropType } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"

export default function CropPage({ params }: { params: { id: string } }) {
  const [photo, setPhoto] = useState<any>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [aspectRatio, setAspectRatio] = useState<"3:2" | "2:3">("3:2")
  const [crop, setCrop] = useState<CropType>()
  const [completedCrop, setCompletedCrop] = useState<CropType>()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const router = useRouter()

  useEffect(() => {
    loadPhoto()
  }, [params.id])

  const loadPhoto = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("photos").select("*").eq("id", params.id).single()

      if (error) throw error
      setPhoto(data)

      // Get signed URL for the image
      const signedUrl = await getSignedImageUrl(data.original_url)
      if (signedUrl) {
        setImageUrl(signedUrl)
      } else {
        setError("Error al cargar la imagen")
      }
    } catch (err) {
      setError("Error al cargar la foto")
    }
  }

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    const aspect = aspectRatio === "3:2" ? 3 / 2 : 2 / 3

    let cropWidth, cropHeight
    if (width / height > aspect) {
      cropHeight = height
      cropWidth = height * aspect
    } else {
      cropWidth = width
      cropHeight = width / aspect
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
          aspect_ratio: aspectRatio,
        })
        .eq("id", params.id)

      if (updateError) throw updateError

      router.push(`/enhance/${params.id}`)
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
                <RadioGroup
                  value={aspectRatio}
                  onValueChange={(value) => {
                    setAspectRatio(value as "3:2" | "2:3")
                    if (imgRef.current) {
                      onImageLoad({ currentTarget: imgRef.current } as React.SyntheticEvent<HTMLImageElement>)
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3:2" id="3:2" />
                    <Label htmlFor="3:2" className="cursor-pointer">
                      3:2 (Horizontal)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2:3" id="2:3" />
                    <Label htmlFor="2:3" className="cursor-pointer">
                      2:3 (Vertical)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="border rounded-lg overflow-hidden bg-slate-100">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspectRatio === "3:2" ? 3 / 2 : 2 / 3}
                >
                  <img
                    ref={imgRef}
                    src={imageUrl || "/placeholder.svg"}
                    alt="Original"
                    onLoad={onImageLoad}
                    className="max-w-full"
                  />
                </ReactCrop>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button onClick={handleSaveCrop} disabled={isProcessing} className="w-full" size="lg">
                <Crop className="w-4 h-4 mr-2" />
                {isProcessing ? "Procesando..." : "Guardar y Continuar"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
