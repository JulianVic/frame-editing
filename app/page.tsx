import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ImageIcon, Sparkles, Frame, FileDown } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-svh bg-linear-to-br from-slate-50 to-slate-100">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-6 h-6" />
            <h1 className="text-xl font-bold">FrameAI</h1>
           </div>
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link href="/auth/login">Iniciar Sesión</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/sign-up">Registrarse</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl font-bold text-slate-900 mb-6 text-balance">
            Enmarca tus fotos con inteligencia artificial
          </h2>
          <p className="text-xl text-slate-600 mb-12 text-balance">
            Sube, recorta y mejora tus fotografías automáticamente. Genera visualizaciones profesionales en PDF con
            diferentes tamaños de marcos.
          </p>

          <div className="flex gap-4 justify-center mb-20">
            <Button size="lg" asChild>
              <Link href="/auth/sign-up">Comenzar Gratis</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/auth/login">Iniciar Sesión</Link>
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-left">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Mejora con IA</h3>
              <p className="text-slate-600">
                Nuestra IA analiza tu foto y aplica automáticamente mejoras de contraste, nitidez y más.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Frame className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Múltiples Tamaños</h3>
              <p className="text-slate-600">
                Visualiza tu foto en marcos de 120x80cm, 90x60cm y 60x40cm para elegir el mejor tamaño.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <FileDown className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Descarga en PDF</h3>
              <p className="text-slate-600">
                Genera PDFs profesionales con todas las visualizaciones de marcos para imprimir.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
