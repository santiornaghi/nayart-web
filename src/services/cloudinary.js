import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * Sube un buffer al folder indicado en Cloudinary
 * @param {Buffer} buffer
 * @param {string} folder  — 'nayart/obras' | 'nayart/productos' | 'nayart/archivos'
 * @param {object} options — opciones extra de Cloudinary
 * @returns {{ url, publicId }}
 */
export async function subirImagen(buffer, folder = 'nayart/general', options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        transformation: [
          { quality: 'auto:best' },
          { fetch_format: 'auto' },
        ],
        ...options,
      },
      (error, result) => {
        if (error) return reject(error)
        resolve({ url: result.secure_url, publicId: result.public_id })
      }
    )
    Readable.from(buffer).pipe(stream)
  })
}

/**
 * Elimina un archivo de Cloudinary
 */
export async function eliminarArchivo(publicId, resourceType = 'image') {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
}

/**
 * Genera URL firmada para descarga privada (ebooks)
 */
export function urlDescargaPrivada(publicId) {
  return cloudinary.utils.private_download_url(publicId, 'pdf', {
    expires_at: Math.floor(Date.now() / 1000) + 60 * 10, // 10 minutos
    attachment: true,
  })
}
