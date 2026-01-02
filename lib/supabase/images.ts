/**
 * Helper function to get signed URL for an image
 * @param filePath - The path to the file in storage (e.g., "user-id/timestamp.jpg")
 * @returns The signed URL or null if error
 */
export async function getSignedImageUrl(filePath: string | null | undefined): Promise<string | null> {
  if (!filePath) return null

  try {
    const response = await fetch("/api/get-signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    })

    if (!response.ok) {
      console.error("Error getting signed URL:", await response.text())
      return null
    }

    const data = await response.json()
    return data.signedUrl || null
  } catch (error) {
    console.error("Error fetching signed URL:", error)
    return null
  }
}

/**
 * Helper function to get multiple signed URLs at once
 * @param filePaths - Array of file paths
 * @returns Object mapping file paths to signed URLs
 */
export async function getSignedImageUrls(
  filePaths: (string | null | undefined)[],
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {}

  await Promise.all(
    filePaths.map(async (path) => {
      if (path) {
        const url = await getSignedImageUrl(path)
        if (url) {
          urls[path] = url
        }
      }
    }),
  )

  return urls
}

/**
 * Get proxy URL for an image (useful for canvas operations that require CORS)
 * @param filePath - The path to the file in storage
 * @returns The proxy URL
 */
export function getProxyImageUrl(filePath: string | null | undefined): string | null {
  if (!filePath) return null
  return `/api/proxy-image?path=${encodeURIComponent(filePath)}`
}

