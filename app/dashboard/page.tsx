import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { PhotoCard } from "@/components/photo-card"
import Link from "next/link"
import { ImageIcon, Upload } from "lucide-react"

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/auth/login")
  }

  // Get user's photos (including Topaz fields)
  const { data: photos } = await supabase
    .from("photos")
    .select("*, topaz_gigapixel_url, topaz_status")
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: false })

  return (
    <div className="min-h-svh bg-linear-to-br from-slate-50 to-slate-100">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-6 h-6" />
            <h1 className="text-xl font-bold">FrameAI</h1>
          </div>
          <p className="text-sm text-slate-600">{data.user.email}</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Mis Fotos</h2>
              <p className="text-slate-600 mt-1">Sube y enmarca tus mejores fotografías</p>
            </div>
            <Button asChild size="lg">
              <Link href="/upload">
                <Upload className="w-4 h-4 mr-2" />
                Subir Foto
              </Link>
            </Button>
          </div>

          {!photos || photos.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-lg border-2 border-dashed">
              <ImageIcon className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No tienes fotos aún</h3>
              <p className="text-slate-600 mb-6">Sube tu primera foto para comenzar</p>
              <Button asChild>
                <Link href="/upload">
                  <Upload className="w-4 h-4 mr-2" />
                  Subir Foto
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {photos.map((photo) => {
                // Determinar la ruta siguiente basada en el estado del procesamiento
                const nextRoute = photo.topaz_gigapixel_url
                  ? `/topaz-comparison/${photo.id}` // Si ya tiene Topaz, ir a comparación
                  : photo.enhanced_url
                    ? `/preview/${photo.id}`
                    : photo.cropped_url
                      ? photo.topaz_status === "processing" || photo.topaz_status === "pending"
                        ? `/topaz-comparison/${photo.id}` // Si está procesando, ir a comparación
                        : `/enhance/${photo.id}`
                      : `/crop/${photo.id}`

                // Determinar el texto de estado y color
                let statusText = "Sin recortar"
                let statusColor = "slate"
                
                if (photo.topaz_gigapixel_url) {
                  statusText = "Mejorada con Topaz"
                  statusColor = "green"
                } else if (photo.topaz_status === "processing") {
                  statusText = "Procesando Topaz..."
                  statusColor = "blue"
                } else if (photo.topaz_status === "pending") {
                  statusText = "Pendiente Topaz"
                  statusColor = "yellow"
                } else if (photo.enhanced_url) {
                  statusText = "Completada"
                  statusColor = "slate"
                } else if (photo.cropped_url) {
                  statusText = "Recortada"
                  statusColor = "slate"
                }

                return (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    nextRoute={nextRoute}
                    statusText={statusText}
                    statusColor={statusColor}
                  />
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
