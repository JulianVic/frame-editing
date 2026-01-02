"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Upload, ArrowLeft, ImageIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (!selectedFile.type.startsWith("image/")) {
        setError("Por favor selecciona un archivo de imagen válido")
        return
      }
      setFile(selectedFile)
      setError(null)

      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(selectedFile)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Check if user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }

      // Upload file to Supabase Storage
      const fileExt = file.name.split(".").pop()
      const fileName = `${user.id}/${Date.now()}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage.from("photos").upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      })

      if (uploadError) throw uploadError

      // Store only the file path, not the full URL
      // Create photo record in database
      const { data: photoData, error: dbError } = await supabase
        .from("photos")
        .insert({
          user_id: user.id,
          original_url: fileName, // Store path instead of URL
        })
        .select()
        .single()

      if (dbError) throw dbError

      // Redirect to crop page with photo ID
      router.push(`/crop/${photoData.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la imagen")
    } finally {
      setIsUploading(false)
    }
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
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Subir Foto</CardTitle>
              <CardDescription>Selecciona una imagen para enmarcar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="photo">Seleccionar Imagen</Label>
                <div className="flex items-center gap-4">
                  <input id="photo" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById("photo")?.click()}
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {file ? "Cambiar Imagen" : "Seleccionar Imagen"}
                  </Button>
                </div>
              </div>

              {preview && (
                <div className="space-y-4">
                  <div className="border rounded-lg overflow-hidden bg-slate-100">
                    <img src={preview || "/placeholder.svg"} alt="Vista previa" className="w-full h-auto" />
                  </div>
                  <p className="text-sm text-slate-600">Archivo: {file?.name}</p>
                </div>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}

              <Button onClick={handleUpload} disabled={!file || isUploading} className="w-full" size="lg">
                {isUploading ? "Subiendo..." : "Continuar al Recorte"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
