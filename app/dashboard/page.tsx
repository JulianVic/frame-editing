import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ImageIcon, Upload, ArrowRight } from "lucide-react"

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/auth/login")
  }

  // Get user's photos
  const { data: photos } = await supabase
    .from("photos")
    .select("*")
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: false })

  return (
    <div className="min-h-svh bg-gradient-to-br from-slate-50 to-slate-100">
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
                const nextRoute = photo.enhanced_url
                  ? `/preview/${photo.id}`
                  : photo.cropped_url
                    ? `/enhance/${photo.id}`
                    : `/crop/${photo.id}`

                const statusText = photo.enhanced_url ? "Completada" : photo.cropped_url ? "Recortada" : "Sin recortar"

                return (
                  <Link
                    key={photo.id}
                    href={nextRoute}
                    className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow group"
                  >
                    <div className="aspect-[3/2] bg-slate-100 relative">
                      {(photo.enhanced_url || photo.cropped_url || photo.original_url) && (
                        <img
                          src={photo.enhanced_url || photo.cropped_url || photo.original_url}
                          alt="Foto"
                          className="w-full h-full object-cover"
                        />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <ArrowRight className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-600">
                          {new Date(photo.created_at).toLocaleDateString("es-ES")}
                        </p>
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {statusText}
                        </span>
                      </div>
                      {photo.aspect_ratio && (
                        <p className="text-xs text-slate-500 mt-1">Proporción: {photo.aspect_ratio}</p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
