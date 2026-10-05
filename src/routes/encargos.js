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
    if (!nombre || !mensaje || (!email && !telefono)) throw new AppError('Nombre, mensaje y un medio de contacto son requeridos')
    const TIPOS = ['OBRA_ORIGINAL','ENCARGO_PERSONALIZADO','ETIQUETA_BRANDING','MURAL','PINTADA_EN_VIVO','EBOOK_MATERIALES','OTRO']
    const t = String(tipo || '').toUpperCase()
    const encargo = await prisma.encargo.create({
      data: { nombre, email: email || '', telefono, tipo: TIPOS.includes(t) ? t : 'OTRO', mensaje, presupuesto },
    })
    // El aviso por email es opcional: si falla, el encargo ya quedó guardado
    try { await emailNuevoEncargo(encargo) } catch (e) { console.error('[email encargo]', e.message) }
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
