import { Router } from 'express'
import multer from 'multer'
import { PrismaClient } from '@prisma/client'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { subirImagen, eliminarArchivo } from '../services/cloudinary.js'
import { AppError } from '../middleware/errorHandler.js'

const router = Router()
const prisma = new PrismaClient()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// GET /api/productos — listar (público)
router.get('/', async (req, res, next) => {
  try {
    const { tipo } = req.query
    const where = { activo: true }
    if (tipo) where.tipo = tipo.toUpperCase()
    const productos = await prisma.producto.findMany({ where, orderBy: { creadoEn: 'desc' } })
    res.json(productos)
  } catch (e) { next(e) }
})

// GET /api/productos/:id
router.get('/:id', async (req, res, next) => {
  try {
    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: req.params.id } })
    // Ocultar URL del archivo digital al público
    delete producto.archivoUrl
    delete producto.archivoPublicId
    res.json(producto)
  } catch (e) { next(e) }
})

// POST /api/productos — crear (admin)
router.post('/', authMiddleware, adminOnly,
  upload.fields([{ name: 'imagen', maxCount: 1 }, { name: 'archivo', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const { nombre, descripcion, tipo, precio, moneda, stock } = req.body
      const data = {
        nombre, descripcion, tipo: tipo.toUpperCase(),
        precio:  parseFloat(precio),
        moneda:  moneda || 'USD',
        stock:   stock ? parseInt(stock) : null,
      }

      // Imagen de portada
      if (req.files?.imagen?.[0]) {
        const { url, publicId } = await subirImagen(req.files.imagen[0].buffer, 'nayart/productos')
        data.imagenUrl      = url
        data.imagenPublicId = publicId
      }

      // Archivo digital (ebook, etc.)
      if (req.files?.archivo?.[0]) {
        const { url, publicId } = await subirImagen(
          req.files.archivo[0].buffer,
          'nayart/archivos',
          { resource_type: 'raw', type: 'private' } // privado — solo accesible con URL firmada
        )
        data.archivoUrl      = url
        data.archivoPublicId = publicId
      }

      const producto = await prisma.producto.create({ data })
      res.status(201).json(producto)
    } catch (e) { next(e) }
  }
)

// PUT /api/productos/:id
router.put('/:id', authMiddleware, adminOnly,
  upload.fields([{ name: 'imagen', maxCount: 1 }, { name: 'archivo', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const data = { ...req.body }
      if (data.precio) data.precio = parseFloat(data.precio)
      if (data.stock !== undefined) data.stock = data.stock ? parseInt(data.stock) : null
      if (data.tipo)  data.tipo   = data.tipo.toUpperCase()
      if ('activo' in data) data.activo = data.activo === 'true'

      const actual = await prisma.producto.findUniqueOrThrow({ where: { id: req.params.id } })

      if (req.files?.imagen?.[0]) {
        if (actual.imagenPublicId) await eliminarArchivo(actual.imagenPublicId)
        const { url, publicId } = await subirImagen(req.files.imagen[0].buffer, 'nayart/productos')
        data.imagenUrl = url; data.imagenPublicId = publicId
      }
      if (req.files?.archivo?.[0]) {
        if (actual.archivoPublicId) await eliminarArchivo(actual.archivoPublicId, 'raw')
        const { url, publicId } = await subirImagen(
          req.files.archivo[0].buffer, 'nayart/archivos',
          { resource_type: 'raw', type: 'private' }
        )
        data.archivoUrl = url; data.archivoPublicId = publicId
      }

      const producto = await prisma.producto.update({ where: { id: req.params.id }, data })
      res.json(producto)
    } catch (e) { next(e) }
  }
)

// DELETE /api/productos/:id
router.delete('/:id', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const producto = await prisma.producto.findUniqueOrThrow({ where: { id: req.params.id } })
    if (producto.imagenPublicId)  await eliminarArchivo(producto.imagenPublicId)
    if (producto.archivoPublicId) await eliminarArchivo(producto.archivoPublicId, 'raw')
    await prisma.producto.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
