"use client"

import { use, useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Download, ImageIcon, Loader2, FileDown } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const [photo, setPhoto] = useState<any>(null)
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
    } catch (err) {
      setError("Error al cargar la foto")
    }
  }

  const generatePDF = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      if (!canvasRef.current || !photo) return

      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // Set canvas size for A4 at 300 DPI (3508 x 2480 px for landscape)
      canvas.width = 3508
      canvas.height = 2480

      // White background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Load image
      const img = new Image()
      img.crossOrigin = "anonymous"

      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = photo.enhanced_url || photo.cropped_url || photo.original_url
      })

      // Calculate frame sizes in pixels (at 300 DPI: 1 cm = 118.11 pixels)
      const DPI = 118.11
      const frames = [
        { width: 120 * DPI, height: 80 * DPI, label: "120cm × 80cm" },
        { width: 90 * DPI, height: 60 * DPI, label: "90cm × 60cm" },
        { width: 60 * DPI, height: 40 * DPI, label: "60cm × 40cm" },
      ]

      // Calculate positions for nested frames (centered)
      const largeFrame = frames[0]
      const mediumFrame = frames[1]
      const smallFrame = frames[2]

      // Start position for the largest frame (centered on canvas)
      const startX = (canvas.width - largeFrame.width) / 2
      const startY = (canvas.height - largeFrame.height) / 2

      // Draw largest frame border
      ctx.strokeStyle = "#333333"
      ctx.lineWidth = 8
      ctx.strokeRect(startX, startY, largeFrame.width, largeFrame.height)

      // Draw medium frame (centered in large frame)
      const medX = startX + (largeFrame.width - mediumFrame.width) / 2
      const medY = startY + (largeFrame.height - mediumFrame.height) / 2
      ctx.strokeRect(medX, medY, mediumFrame.width, mediumFrame.height)

      // Draw image in medium frame
      ctx.drawImage(img, medX + 4, medY + 4, mediumFrame.width - 8, mediumFrame.height - 8)

      // Draw small frame (centered in medium frame)
      const smallX = medX + (mediumFrame.width - smallFrame.width) / 2
      const smallY = medY + (mediumFrame.height - smallFrame.height) / 2
      ctx.strokeRect(smallX, smallY, smallFrame.width, smallFrame.height)

      // Draw image in small frame
      ctx.drawImage(img, smallX + 4, smallY + 4, smallFrame.width - 8, smallFrame.height - 8)

      // Add labels
      ctx.fillStyle = "#333333"
      ctx.font = "bold 48px sans-serif"

      ctx.fillText(frames[0].label, startX + 20, startY + 70)
      ctx.fillText(frames[1].label, medX + 20, medY + 70)
      ctx.fillText(frames[2].label, smallX + 20, smallY + 70)

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (!blob) return

        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `frame-preview-${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        setIsGenerating(false)
      }, "image/png")
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

  const imageUrl = photo.enhanced_url || photo.cropped_url || photo.original_url

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
              Volver al Dashboard
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-2xl">Vista Previa de Marcos</CardTitle>
              <CardDescription>
                Visualiza tu foto en diferentes tamaños de marco: 120×80cm, 90×60cm y 60×40cm
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <div className="aspect-[3/2] border-4 border-slate-800 rounded-lg overflow-hidden bg-white p-2">
                    <img src={imageUrl || "/placeholder.svg"} alt="120x80cm" className="w-full h-full object-cover" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Marco Grande</p>
                    <p className="text-sm text-slate-600">120cm × 80cm</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="aspect-[3/2] border-4 border-slate-800 rounded-lg overflow-hidden bg-white p-2">
                    <img src={imageUrl || "/placeholder.svg"} alt="90x60cm" className="w-full h-full object-cover" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Marco Mediano</p>
                    <p className="text-sm text-slate-600">90cm × 60cm</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="aspect-[3/2] border-4 border-slate-800 rounded-lg overflow-hidden bg-white p-2">
                    <img src={imageUrl || "/placeholder.svg"} alt="60x40cm" className="w-full h-full object-cover" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Marco Pequeño</p>
                    <p className="text-sm text-slate-600">60cm × 40cm</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Vista Comparativa</h3>
                <div className="bg-white p-8 rounded-lg border-2 border-slate-200">
                  <div className="relative mx-auto" style={{ maxWidth: "800px" }}>
                    <div className="border-8 border-slate-800 rounded-lg p-4 relative">
                      <div className="absolute top-2 left-2 bg-white px-3 py-1 rounded text-sm font-semibold shadow">
                        120×80cm
                      </div>
                      <div className="border-6 border-slate-700 rounded-lg p-3 relative">
                        <div className="absolute top-2 left-2 bg-white px-2 py-1 rounded text-xs font-semibold shadow">
                          90×60cm
                        </div>
                        <img
                          src={imageUrl || "/placeholder.svg"}
                          alt="Nested frames"
                          className="w-full h-auto rounded"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="border-4 border-slate-600 rounded-lg w-2/3 h-2/3 flex items-center justify-center">
                            <div className="bg-white px-2 py-1 rounded text-xs font-semibold shadow">60×40cm</div>
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
