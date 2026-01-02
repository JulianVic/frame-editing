"use client"

import { useState, useRef, useEffect } from "react"
import { GripVertical } from "lucide-react"

interface ImageComparisonSliderProps {
  beforeImage: string | null
  afterImage: string | null
  isLoading?: boolean
  beforeLabel?: string
  afterLabel?: string
}

export function ImageComparisonSlider({
  beforeImage,
  afterImage,
  isLoading = false,
  beforeLabel = "Antes",
  afterLabel = "Después",
}: ImageComparisonSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50) // Porcentaje (0-100)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Si no hay imagen mejorada, mostrar solo la original
  const showSlider = !isLoading && afterImage && beforeImage

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPosition(percentage)
  }

  const handleMouseDown = () => {
    setIsDragging(true)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const touch = e.touches[0]
    const x = touch.clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPosition(percentage)
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSliderPosition(Number(e.target.value))
  }

  // Prevenir scroll mientras se arrastra
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = "none"
      document.body.style.cursor = "ew-resize"
    } else {
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }

    return () => {
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }
  }, [isDragging])

  // Agregar event listeners globales para mouse
  useEffect(() => {
    if (!isDragging) return

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
      setSliderPosition(percentage)
    }

    const handleGlobalMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener("mousemove", handleGlobalMouseMove)
    window.addEventListener("mouseup", handleGlobalMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove)
      window.removeEventListener("mouseup", handleGlobalMouseUp)
    }
  }, [isDragging])

  if (!beforeImage) {
    return (
      <div className="w-full aspect-video bg-slate-100 flex items-center justify-center rounded-lg">
        <p className="text-slate-500">Imagen no disponible</p>
      </div>
    )
  }

  if (!showSlider) {
    // Mostrar solo imagen original mientras carga
    return (
      <div className="w-full aspect-video relative rounded-lg overflow-hidden bg-slate-100">
        {beforeImage && (
          <img
            src={beforeImage}
            alt={beforeLabel}
            className="w-full h-full object-contain"
          />
        )}
        {isLoading && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="bg-white/90 px-4 py-2 rounded-lg shadow-lg">
              <p className="text-sm text-slate-700">Procesando imagen mejorada...</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full space-y-3">
      {/* Slider Container */}
      <div
        ref={containerRef}
        className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100 cursor-ew-resize select-none"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleTouchMove}
        onTouchStart={(e) => {
          if (!containerRef.current) return
          const rect = containerRef.current.getBoundingClientRect()
          const touch = e.touches[0]
          const x = touch.clientX - rect.left
          const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
          setSliderPosition(percentage)
        }}
      >
        {/* Imagen Original (Fondo) */}
        <div className="absolute inset-0">
          <img
            src={beforeImage}
            alt={beforeLabel}
            className="w-full h-full object-contain"
            draggable={false}
          />
        </div>

        {/* Imagen Mejorada (Superpuesta) */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            clipPath: `inset(0 0 0 ${sliderPosition}%)`,
          }}
        >
          <img
            src={afterImage}
            alt={afterLabel}
            className="w-full h-full object-contain"
            draggable={false}
          />
        </div>

        {/* Línea del Slider */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10 transition-opacity"
          style={{
            left: `${sliderPosition}%`,
            opacity: isDragging ? 1 : 0.9,
          }}
        >
          {/* Control Visual (Círculo con icono) */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-slate-200 hover:scale-110 transition-transform cursor-ew-resize"
            style={{
              transform: "translate(-50%, -50%)",
            }}
          >
            <GripVertical className="w-5 h-5 text-slate-600" />
          </div>
        </div>

        {/* Etiquetas */}
        <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1.5 rounded-md text-sm font-medium backdrop-blur-sm">
          {beforeLabel}
        </div>
        <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1.5 rounded-md text-sm font-medium backdrop-blur-sm">
          {afterLabel}
        </div>
      </div>

      {/* Control de Rango (Opcional - para accesibilidad) */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-600 w-12">{beforeLabel}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={sliderPosition}
          onChange={handleSliderChange}
          className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${sliderPosition}%, #e2e8f0 ${sliderPosition}%, #e2e8f0 100%)`,
          }}
        />
        <span className="text-xs text-slate-600 w-12 text-right">{afterLabel}</span>
      </div>

      {/* Indicador de posición */}
      <div className="text-center text-xs text-slate-500">
        {Math.round(100 - sliderPosition)}% {beforeLabel.toLowerCase()} • {Math.round(sliderPosition)}% {afterLabel.toLowerCase()}
      </div>
    </div>
  )
}

