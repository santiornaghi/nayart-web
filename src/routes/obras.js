import { Router } from 'express'
import multer from 'multer'
import { PrismaClient } from '@prisma/client'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { subirImagen, eliminarArchivo } from '../services/cloudinary.js'
import { AppError } from '../middleware/errorHandler.js'

const router  = Router()
const prisma  = new PrismaClient()
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// ── PÚBLICAS ───────────────────────────────────────────────

// GET /api/obras — listar obras (con filtros)
router.get('/', async (req, res, next) => {
  try {
    const { tecnica, serie, disponible, destacada, limit = 20, page = 1 } = req.query
    const where = {}
    if (tecnica)    where.tecnica    = tecnica.toUpperCase()
    if (serie)      where.serie      = { contains: serie, mode: 'insensitive' }
    if (disponible) where.disponible = disponible.toUpperCase()
    if (destacada)  where.destacada  = destacada === 'true'

    const [obras, total] = await Promise.all([
      prisma.obra.findMany({
        where,
        orderBy: { creadoEn: 'desc' },
        take:  parseInt(limit),
        skip:  (parseInt(page) - 1) * parseInt(limit),
      }),
      prisma.obra.count({ where }),
    ])

    res.json({ obras, total, page: parseInt(page), pages: Math.ceil(total / limit) })
  } catch (e) { next(e) }
})

// GET /api/obras/:id — obra individual
router.get('/:id', async (req, res, next) => {
  try {
    const obra = await prisma.obra.findUniqueOrThrow({ where: { id: req.params.id } })
    res.json(obra)
  } catch (e) { next(e) }
})

// ── ADMIN ──────────────────────────────────────────────────

// POST /api/obras — crear obra con imagen
router.post('/', authMiddleware, adminOnly, upload.single('imagen'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('La imagen es requerida')

    const { url, publicId } = await subirImagen(req.file.buffer, 'nayart/obras')

    const { titulo, tecnica, serie, concepto, ancho, alto, anio, precio, moneda, disponible, destacada } = req.body

    const obra = await prisma.obra.create({
      data: {
        titulo,
        tecnica:        tecnica.toUpperCase(),
        serie:          serie || null,
        concepto:       concepto || null,
        ancho:          parseFloat(ancho),
        alto:           parseFloat(alto),
        anio:           parseInt(anio),
        precio:         parseFloat(precio),
        moneda:         moneda || 'USD',
        disponible:     disponible?.toUpperCase() || 'DISPONIBLE',
        destacada:      destacada === 'true',
        imagenUrl:      url,
        imagenPublicId: publicId,
      },
    })

    res.status(201).json(obra)
  } catch (e) { next(e) }
})

// PUT /api/obras/:id — actualizar obra
router.put('/:id', authMiddleware, adminOnly, upload.single('imagen'), async (req, res, next) => {
  try {
    const data = { ...req.body }

    // Si hay nueva imagen, subir y eliminar la anterior
    if (req.file) {
      const obraActual = await prisma.obra.findUniqueOrThrow({ where: { id: req.params.id } })
      if (obraActual.imagenPublicId) await eliminarArchivo(obraActual.imagenPublicId)
      const { url, publicId } = await subirImagen(req.file.buffer, 'nayart/obras')
      data.imagenUrl      = url
      data.imagenPublicId = publicId
    }

    // Convertir tipos
    if (data.ancho)     data.ancho     = parseFloat(data.ancho)
    if (data.alto)      data.alto      = parseFloat(data.alto)
    if (data.anio)      data.anio      = parseInt(data.anio)
    if (data.precio)    data.precio    = parseFloat(data.precio)
    if (data.tecnica)   data.tecnica   = data.tecnica.toUpperCase()
    if (data.disponible) data.disponible = data.disponible.toUpperCase()
    if ('destacada' in data) data.destacada = data.destacada === 'true'

    const obra = await prisma.obra.update({ where: { id: req.params.id }, data })
    res.json(obra)
  } catch (e) { next(e) }
})

// DELETE /api/obras/:id
router.delete('/:id', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const obra = await prisma.obra.findUniqueOrThrow({ where: { id: req.params.id } })
    if (obra.imagenPublicId) await eliminarArchivo(obra.imagenPublicId)
    await prisma.obra.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
