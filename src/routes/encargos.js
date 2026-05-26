import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authMiddleware } from '../middleware/auth.js'
import { emailNuevoEncargo } from '../services/email.js'
import { AppError } from '../middleware/errorHandler.js'

const router = Router()
const prisma = new PrismaClient()

// POST /api/encargos — formulario público
router.post('/', async (req, res, next) => {
  try {
    const { nombre, email, telefono, tipo, mensaje, presupuesto } = req.body
    if (!nombre || !email || !mensaje) throw new AppError('Nombre, email y mensaje son requeridos')
    const encargo = await prisma.encargo.create({
      data: { nombre, email, telefono, tipo: tipo?.toUpperCase() || 'OTRO', mensaje, presupuesto },
    })
    await emailNuevoEncargo(encargo)
    res.status(201).json({ ok: true, id: encargo.id })
  } catch (e) { next(e) }
})

// GET /api/encargos — listar (admin)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { leido, estado } = req.query
    const where = {}
    if (leido !== undefined) where.leido = leido === 'true'
    if (estado) where.estado = estado.toUpperCase()
    const encargos = await prisma.encargo.findMany({ where, orderBy: { creadoEn: 'desc' } })
    res.json(encargos)
  } catch (e) { next(e) }
})

// PATCH /api/encargos/:id
router.patch('/:id', authMiddleware, async (req, res, next) => {
  try {
    const encargo = await prisma.encargo.update({
      where: { id: req.params.id },
      data: req.body,
    })
    res.json(encargo)
  } catch (e) { next(e) }
})

export default router
