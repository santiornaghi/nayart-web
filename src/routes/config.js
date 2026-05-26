import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authMiddleware, adminOnly } from '../middleware/auth.js'

const router = Router()
const prisma = new PrismaClient()

// GET /api/config/envios — público (para el checkout)
router.get('/envios', async (req, res, next) => {
  try {
    const zonas = await prisma.zonaEnvio.findMany({ where: { activa: true } })
    res.json(zonas)
  } catch (e) { next(e) }
})

// PUT /api/config/envios — admin
router.put('/envios', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { zonas } = req.body
    for (const zona of zonas) {
      await prisma.zonaEnvio.upsert({
        where: { id: zona.id || '' },
        update: { costo: zona.costo, activa: zona.activa },
        create: { nombre: zona.nombre, costo: zona.costo, activa: zona.activa ?? true },
      })
    }
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// GET /api/config/tienda
router.get('/tienda', async (req, res, next) => {
  try {
    const config = await prisma.configuracionTienda.findFirst()
    res.json(config)
  } catch (e) { next(e) }
})

// PUT /api/config/tienda — admin
router.put('/tienda', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const config = await prisma.configuracionTienda.upsert({
      where: { id: req.body.id || '' },
      update: req.body,
      create: req.body,
    })
    res.json(config)
  } catch (e) { next(e) }
})

export default router
