"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getSignedImageUrl } from "@/lib/supabase/images"

interface PhotoCardProps {
  photo: {
    id: string
    original_url: string | null
    cropped_url: string | null
    enhanced_url: string | null
    aspect_ratio: string | null
    created_at: string
  }
  nextRoute: string
  statusText: string
}

export function PhotoCard({ photo, nextRoute, statusText }: PhotoCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    const loadImage = async () => {
      const imagePath = photo.enhanced_url || photo.cropped_url || photo.original_url
      const signedUrl = await getSignedImageUrl(imagePath)
      if (signedUrl) {
        setImageUrl(signedUrl)
      }
    }
    loadImage()
  }, [photo.enhanced_url, photo.cropped_url, photo.original_url])

  return (
    <Link
      href={nextRoute}
      className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow group"
    >
      <div className="aspect-3/2 bg-slate-100 relative">
        {imageUrl && (
          <img src={imageUrl} alt="Foto" className="w-full h-full object-cover" />
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
}

