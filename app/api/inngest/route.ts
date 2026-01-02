import { serve } from "inngest/next"
import { inngest } from "@/inngest/client"
import { processTopazGigapixel, analyzeImageWithAI, applyImageEnhancements } from "@/inngest/functions"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processTopazGigapixel, analyzeImageWithAI, applyImageEnhancements],
})

