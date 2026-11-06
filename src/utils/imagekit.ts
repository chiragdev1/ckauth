import "dotenv/config"
import ImageKit, {NotFoundError, toFile} from "@imagekit/nodejs"
import {ApiError} from "./api-error.js"
import {logger} from "./logger.js"

let imagekitClient: ImageKit | null = null

// created on first use, so the server can still start (and serve other routes) without ImageKit configured
function getImageKitClient() {
  if (!imagekitClient) {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY

    if (!privateKey) {
      throw new Error("IMAGEKIT_PRIVATE_KEY is not set")
    }

    imagekitClient = new ImageKit({privateKey, timeout: 30 * 1000, maxRetries: 2})
  }

  return imagekitClient
}

export async function uploadImage(buffer: Buffer, fileName: string, mimeType: string, folder: string, tags: string[] = []) {
  let response
  try {
    response = await getImageKitClient().files.upload({
      file: await toFile(buffer, fileName, {type: mimeType}),
      fileName,
      folder,
      tags,
      // never overwrite an existing file, so the old avatar stays valid until the db points at the new one
      useUniqueFileName: true,
    })
  } catch (error) {
    logger.error({err: error, fileName}, 'imagekit upload failed')
    throw new ApiError(502, "Failed to upload image")
  }

  if (!response.fileId || !response.url) {
    logger.error({fileName, response}, 'imagekit upload returned no fileId or url')
    throw new ApiError(502, "Failed to upload image")
  }

  return {fileId: response.fileId, url: response.url}
}

export async function deleteImage(fileId: string) {
  try {
    await getImageKitClient().files.delete(fileId)
  } catch (error) {
    // already gone is what we wanted anyway
    if (error instanceof NotFoundError) {
      return
    }
    throw error
  }
}
