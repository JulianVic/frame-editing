/**
 * Recomendaciones de ajustes de imagen generadas por IA
 */
export interface ImageRecommendations {
  brightness: number
  contrast: number
  saturation: number
  sharpness: number
  vibrance: number
  temperature: number
  explanation: string
}

/**
 * Estado del procesamiento de Topaz Gigapixel
 */
export type TopazStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * Relación de aspecto permitida para las fotos
 */
export type AspectRatio = '3:2' 

/**
 * Representa una foto en la base de datos
 */
export interface Photo {
  id: string
  user_id: string
  original_url: string
  cropped_url: string | null
  enhanced_url: string | null
  ai_recommendations: ImageRecommendations | null
  aspect_ratio: AspectRatio | null
  created_at: string
  updated_at: string
  topaz_gigapixel_url: string | null
  topaz_status: TopazStatus | null
}

/**
 * Foto con campos opcionales para crear/actualizar
 */
export type PhotoInsert = Omit<Photo, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

/**
 * Campos actualizables de una foto
 */
export type PhotoUpdate = Partial<Omit<Photo, 'id' | 'user_id' | 'created_at'>>
