"use client"

import { use, useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Download, ImageIcon, Loader2, FileDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getSignedImageUrl } from "@/lib/supabase/images"
import Link from "next/link"
import { jsPDF } from "jspdf"

export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const [photo, setPhoto] = useState<any>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
      const imagePath = data.enhanced_url || data.cropped_url || data.original_url
      const signedUrl = await getSignedImageUrl(imagePath)
      if (signedUrl) {
        setImageUrl(signedUrl)
      } else {
        setError("Error al cargar la imagen")
      }
    } catch (err) {
      setError("Error al cargar la foto")
    }
  }

  const generatePDF = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      if (!canvasRef.current || !imageUrl) return

      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // PDF dimensions in mm (A4 landscape)
      const pdfWidthMM = 297
      const pdfHeightMM = 210
      
      // Convert to pixels at 300 DPI (1 inch = 25.4mm, 300 DPI = 11.81 pixels per mm)
      const pixelsPerMM = 300 / 25.4
      const canvasWidth = pdfWidthMM * pixelsPerMM
      const canvasHeight = pdfHeightMM * pixelsPerMM

      // Set canvas size matching PDF dimensions
      canvas.width = canvasWidth
      canvas.height = canvasHeight

      // White background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Load image
      const img = new Image()
      img.crossOrigin = "anonymous"

      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = imageUrl
      })

      // Calculate frame sizes to fill the entire page
      const frameAspectRatio = 3 / 2 // 120:80 = 90:60 = 60:40 = 3:2
      
      // Largest frame (120×80cm) - fills entire canvas
      const largeFrame = { 
        width: canvasWidth, 
        height: canvasHeight 
      }
      
      // Medium frame (90×60cm) - 75% of large frame (90/120 = 0.75)
      const mediumFrame = { 
        width: largeFrame.width * 0.75, 
        height: largeFrame.height * 0.75 
      }
      
      // Small frame (60×40cm) - 66.67% of medium frame (60/90 = 0.6667)
      const smallFrame = { 
        width: mediumFrame.width * (2/3), 
        height: mediumFrame.height * (2/3) 
      }

      // Start position for the largest frame (no margins, fills entire page)
      const startX = 0
      const startY = 0

      // Draw largest frame border (120×80cm) - full page
      ctx.strokeStyle = "#1e293b" // slate-800
      ctx.lineWidth = 2
      ctx.strokeRect(startX, startY, largeFrame.width, largeFrame.height)

      // Calculate position for medium frame (centered in large frame)
      // Medium frame is 75% of large frame
      const medX = startX + (largeFrame.width - mediumFrame.width) / 2
      const medY = startY + (largeFrame.height - mediumFrame.height) / 2

      // Draw medium frame border (90×60cm)
      ctx.strokeStyle = "#334155" // slate-700
      ctx.lineWidth = 2
      ctx.strokeRect(medX, medY, mediumFrame.width, mediumFrame.height)

      // Draw image in medium frame (with small padding)
      const imagePadding = 2
      ctx.save()
      ctx.beginPath()
      ctx.rect(medX + imagePadding, medY + imagePadding, mediumFrame.width - imagePadding * 2, mediumFrame.height - imagePadding * 2)
      ctx.clip()
      ctx.drawImage(img, medX + imagePadding, medY + imagePadding, mediumFrame.width - imagePadding * 2, mediumFrame.height - imagePadding * 2)
      ctx.restore()

      // Calculate position for small frame (centered in medium frame)
      // Small frame is 66.67% of medium frame
      const smallX = medX + (mediumFrame.width - smallFrame.width) / 2
      const smallY = medY + (mediumFrame.height - smallFrame.height) / 2

      // Draw small frame border (60×40cm)
      ctx.strokeStyle = "#475569" // slate-600
      ctx.lineWidth = 2
      ctx.strokeRect(smallX, smallY, smallFrame.width, smallFrame.height)

      // Draw image in small frame (with small padding, sobrepuesta)
      ctx.save()
      ctx.beginPath()
      ctx.rect(smallX + imagePadding, smallY + imagePadding, smallFrame.width - imagePadding * 2, smallFrame.height - imagePadding * 2)
      ctx.clip()
      ctx.drawImage(img, smallX + imagePadding, smallY + imagePadding, smallFrame.width - imagePadding * 2, smallFrame.height - imagePadding * 2)
      ctx.restore()

      // Convert canvas to image data URL
      const imageDataUrl = canvas.toDataURL("image/png", 1.0)

      // Create PDF (A4 landscape: 297mm x 210mm)
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      })

      // Calculate dimensions for PDF (A4 landscape: 297mm x 210mm)
      const pdfWidth = 297
      const pdfHeight = 210

      // Add image to PDF (full page)
      pdf.addImage(imageDataUrl, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST")

      // Save PDF
      pdf.save(`frame-preview-${Date.now()}.pdf`)

      setIsGenerating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar PDF")
      setIsGenerating(false)
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
              Volver al Dashboard
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-2xl">Vista Comparativa</CardTitle>
              <CardDescription>
                Visualiza tu foto en diferentes tamaños de marco: 120×80cm, 90×60cm y 60×40cm
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-white p-8 rounded-lg border-2 border-slate-200">
                <div className="relative mx-auto" style={{ maxWidth: "900px" }}>
                  {/* Contenedor principal con relación 3:2 */}
                  <div className="relative" style={{ aspectRatio: "3/2" }}>
                    {/* Cuadro exterior: 120x80cm */}
                    <div className="absolute inset-0 border-2 border-slate-800 rounded-sm flex items-center justify-center">
                      <div className="absolute top-2 left-2 bg-white px-2 py-1 rounded text-xs font-semibold text-slate-800 shadow-sm">
                        120×80cm
                      </div>
                      
                      {/* Cuadro medio: 90x60cm (75% del tamaño del exterior) */}
                      <div className="relative border-2 border-slate-700 rounded-sm" style={{ width: "75%", height: "75%", aspectRatio: "3/2" }}>
                        <div className="absolute top-1 left-1 bg-white px-2 py-0.5 rounded text-xs font-semibold text-slate-700 shadow-sm">
                          90×60cm
                        </div>
                        
                        {/* Imagen dentro del cuadro de 90x60cm */}
                        <div className="absolute inset-0 overflow-hidden rounded-sm" style={{ margin: "2px" }}>
                          <img
                            src={imageUrl || "/placeholder.svg"}
                            alt="90x60cm frame"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        
                        {/* Cuadro interior: 60x40cm (66.67% del tamaño del medio, centrado) */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-slate-600 rounded-sm" style={{ width: "66.67%", height: "66.67%", aspectRatio: "3/2" }}>
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-1.5 py-0.5 rounded text-xs font-semibold text-slate-600 shadow-sm whitespace-nowrap">
                            60×40cm
                          </div>
                          
                          {/* Imagen dentro del cuadro de 60x40cm (sobrepuesta) */}
                          <div className="absolute inset-0 overflow-hidden rounded-sm" style={{ margin: "2px" }}>
                            <img
                              src={imageUrl || "/placeholder.svg"}
                              alt="60x40cm frame"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex gap-4">
                <Button onClick={generatePDF} disabled={isGenerating} className="flex-1" size="lg">
                  <Download className="w-4 h-4 mr-2" />
                  {isGenerating ? "Generando..." : "Descargar Vista Previa"}
                </Button>
                <Button variant="outline" asChild size="lg">
                  <Link href="/dashboard">
                    <FileDown className="w-4 h-4 mr-2" />
                    Finalizar
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
