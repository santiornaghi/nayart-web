import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { rateLimit } from 'express-rate-limit'
import 'dotenv/config'

import obrasRouter     from './routes/obras.js'
import productosRouter from './routes/productos.js'
import pedidosRouter   from './routes/pedidos.js'
import encargosRouter  from './routes/encargos.js'
import authRouter      from './routes/auth.js'
import pagosRouter     from './routes/pagos.js'
import configRouter    from './routes/config.js'
import { errorHandler } from './middleware/errorHandler.js'

const app  = express()
const PORT = process.env.PORT || 3000

// ── SEGURIDAD ──────────────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5500',  // live-server local
    'http://127.0.0.1:5500',
  ],
  credentials: true,
}))

// Rate limiting general
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  message: { error: 'Demasiadas solicitudes, intentá más tarde.' },
}))

// Rate limiting estricto para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login.' },
})

// ── MIDDLEWARES ────────────────────────────────────────────
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Webhook de pagos necesita el body raw (antes del json parser)
app.use('/api/pagos/webhook', express.raw({ type: 'application/json' }))

// ── HEALTH CHECK ───────────────────────────────────────────
app.get('/health', (_, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() })
})

// ── RUTAS ──────────────────────────────────────────────────
app.use('/api/auth',      authLimiter, authRouter)
app.use('/api/obras',     obrasRouter)
app.use('/api/productos', productosRouter)
app.use('/api/pedidos',   pedidosRouter)
app.use('/api/encargos',  encargosRouter)
app.use('/api/pagos',     pagosRouter)
app.use('/api/config',    configRouter)

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada` })
})

// Error handler global
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`\n🎨 Nayart API corriendo en puerto ${PORT}`)
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`)
})

export default app
