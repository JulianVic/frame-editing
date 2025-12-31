import { generateObject } from "ai"
import { z } from "zod"

const imageAnalysisSchema = z.object({
  brightness: z.number().min(-100).max(100).describe("Ajuste de brillo recomendado (-100 a 100)"),
  contrast: z.number().min(-100).max(100).describe("Ajuste de contraste recomendado (-100 a 100)"),
  saturation: z.number().min(-100).max(100).describe("Ajuste de saturación recomendado (-100 a 100)"),
  sharpness: z.number().min(0).max(100).describe("Ajuste de nitidez recomendado (0 a 100)"),
  vibrance: z.number().min(-100).max(100).describe("Ajuste de vibración recomendado (-100 a 100)"),
  temperature: z.number().min(-100).max(100).describe("Ajuste de temperatura de color (-100 a 100)"),
  explanation: z.string().describe("Explicación breve de los ajustes recomendados"),
})

export async function POST(req: Request) {
  try {
    const { imageUrl } = await req.json()

    if (!imageUrl) {
      return Response.json({ error: "Image URL is required" }, { status: 400 })
    }

    const { object } = await generateObject({
      model: "anthropic/claude-sonnet-4.5",
      schema: imageAnalysisSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analiza esta imagen y recomienda ajustes específicos para mejorar la calidad de la fotografía. Considera aspectos como exposición, contraste, saturación, nitidez, vibración y temperatura de color. Proporciona valores numéricos precisos para cada ajuste.",
            },
            {
              type: "image",
              image: imageUrl,
            },
          ],
        },
      ],
      maxOutputTokens: 1000,
    })

    return Response.json({
      recommendations: object,
      usage: "success",
    })
  } catch (error) {
    console.error("Error analyzing image:", error)
    return Response.json({ error: "Failed to analyze image" }, { status: 500 })
  }
}
