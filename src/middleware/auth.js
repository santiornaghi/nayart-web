import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { authMiddleware } from '../middleware/auth.js'
import { AppError } from '../middleware/errorHandler.js'

const router = Router()
const prisma = new PrismaClient()

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) throw new AppError('Email y contraseña requeridos')
    const usuario = await prisma.usuario.findUnique({ where: { email } })
    if (!usuario) throw new AppError('Credenciales incorrectas', 401)
    const ok = await bcrypt.compare(password, usuario.password)
    if (!ok) throw new AppError('Credenciales incorrectas', 401)
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.json({ token, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } })
  } catch (e) { next(e) }
})

router.post('/cambiar-password', authMiddleware, async (req, res, next) => {
  try {
    const { actual, nueva } = req.body
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: req.usuario.id } })
    const ok = await bcrypt.compare(actual, usuario.password)
    if (!ok) throw new AppError('Contraseña actual incorrecta')
    const hash = await bcrypt.hash(nueva, 12)
    await prisma.usuario.update({ where: { id: usuario.id }, data: { password: hash } })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: req.usuario.id },
      select: { id: true, nombre: true, email: true, rol: true },
    })
    res.json(usuario)
  } catch (e) { next(e) }
})

export default router
