import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-lineaer-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">¡Gracias por registrarte!</CardTitle>
              <CardDescription>Confirma tu correo electrónico</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Te hemos enviado un correo de confirmación. Por favor revisa tu bandeja de entrada y confirma tu cuenta
                antes de iniciar sesión.
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/login">Ir a Iniciar Sesión</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
