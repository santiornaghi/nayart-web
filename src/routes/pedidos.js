import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { authMiddleware, adminOnly } from '../middleware/auth.js'
import { emailConfirmacionPedido, emailPedidoEnviado, emailEntregaDigital } from '../services/email.js'
import { urlDescargaPrivada } from '../services/cloudinary.js'
import { AppError } from '../middleware/errorHandler.js'

const router = Router()
const prisma = new PrismaClient()

// ── PÚBLICAS ───────────────────────────────────────────────

// POST /api/pedidos — crear pedido (viene del checkout)
router.post('/', async (req, res, next) => {
  try {
    const {
      clienteNombre, clienteEmail, clienteTelefono,
      tipoEntrega, direccion, ciudad, provincia, codigoPostal,
      items, // [{ tipo: 'obra'|'producto', id, cantidad }]
      metodoPago, // 'MERCADOPAGO' | 'TRANSFERENCIA'
      zonaId,     // zona de envío elegida en la página
      notas,
    } = req.body
    if (!clienteNombre || !clienteTelefono) throw new AppError('Faltan nombre y teléfono')

    if (!items?.length) throw new AppError('El carrito está vacío')

    // Resolver items y calcular total
    let subtotal = 0
    const itemsData = []

    for (const item of items) {
      if (item.tipo === 'lamina') {
        // Láminas: precio fijado en el servidor (ARS)
        const PRECIO_SIN_MARCO = { A4: 10000, A5: 8000 }
        const PRECIO_CON_KIRI  = { A4: 35000, A5: 25000 }
        const precio = (item.marco ? PRECIO_CON_KIRI : PRECIO_SIN_MARCO)[item.tamano]
        if (!precio) throw new AppError('Tamaño de lámina inválido')
        const cant = Math.max(1, Math.min(20, parseInt(item.cantidad) || 1))
        const titulo = String(item.titulo || 'Obra').slice(0, 80)
        itemsData.push({ descripcion: `Lámina ${item.tamano} — ${titulo}${item.marco ? ' — con marco kiri' : ''}`, cantidad: cant, precioUnit: precio, moneda: 'ARS' })
        subtotal += precio * cant
        continue
      }
      if (item.tipo === 'sticker') {
        const STICKERS = { 1: 'Calle soleada', 2: 'Callejón' }
        const nombre = STICKERS[item.id]
        if (!nombre) throw new AppError('Sticker inválido')
        const cant = Math.max(1, Math.min(50, parseInt(item.cantidad) || 1))
        itemsData.push({ descripcion: `Sticker — ${nombre}`, cantidad: cant, precioUnit: 2000, moneda: 'ARS' })
        subtotal += 2000 * cant
        continue
      }
      if (item.tipo === 'obra') {
        const obra = await prisma.obra.findUniqueOrThrow({ where: { id: item.id } })
        if (obra.disponible !== 'DISPONIBLE') throw new AppError(`"${obra.titulo}" ya no está disponible`)
        itemsData.push({ obraId: obra.id, cantidad: 1, precioUnit: obra.precio, moneda: obra.moneda })
        subtotal += obra.precio
      } else {
        const producto = await prisma.producto.findUniqueOrThrow({ where: { id: item.id } })
        if (!producto.activo) throw new AppError(`"${producto.nombre}" no está disponible`)
        if (producto.stock !== null && producto.stock < item.cantidad) {
          throw new AppError(`Stock insuficiente para "${producto.nombre}"`)
        }
        itemsData.push({ productoId: producto.id, cantidad: item.cantidad, precioUnit: producto.precio, moneda: producto.moneda })
        subtotal += producto.precio * item.cantidad
      }
    }

    // Costo de envío
    let costoEnvio = 0
    let zonaNombre = null
    if (tipoEntrega === 'ENVIO') {
      // Sin zona elegida (ej: Andreani) el costo queda a cotizar y se informa aparte
      const zona = zonaId
        ? await prisma.zonaEnvio.findFirst({ where: { id: zonaId, activa: true } })
        : null
      costoEnvio = zona?.costo || 0
      zonaNombre = zona?.nombre || null
    }

    // 10% de descuento pagando por transferencia (sobre los productos, no el envío)
    const pago = ['MERCADOPAGO', 'TRANSFERENCIA'].includes(metodoPago) ? metodoPago : null
    const descuento = pago === 'TRANSFERENCIA' ? Math.round(subtotal * 0.10 * 100) / 100 : 0
    // Si el carrito mezcla pesos y dólares, se detalla cada moneda por separado
    const porMoneda = {}
    for (const i of itemsData) porMoneda[i.moneda] = (porMoneda[i.moneda] || 0) + i.precioUnit * i.cantidad
    const mixto = Object.keys(porMoneda).length > 1
    const detalleMonedas = mixto
      ? 'Monedas mixtas — ' + Object.entries(porMoneda).map(([m, v]) => {
          const d = pago === 'TRANSFERENCIA' ? v * 0.9 : v
          return `${m} ${Math.round(d * 100) / 100}`
        }).join(' + ') + (pago === 'TRANSFERENCIA' ? ' (con 10% off)' : '')
      : null
    const notasPedido = [
      detalleMonedas,
      zonaNombre && `Zona de envío: ${zonaNombre}`,
      descuento && `Descuento transferencia 10%: -${descuento}`,
      notas,
    ].filter(Boolean).join('\n') || null

    // Crear pedido en transacción
    const pedido = await prisma.$transaction(async (tx) => {
      const p = await tx.pedido.create({
        data: {
          clienteNombre, clienteEmail: clienteEmail || '', clienteTelefono,
          tipoEntrega, direccion, ciudad, provincia, codigoPostal,
          subtotal, costoEnvio, total: subtotal - descuento + costoEnvio,
          metodoPago: pago, notas: notasPedido,
          moneda: itemsData.every(i => i.moneda === 'ARS') ? 'ARS' : 'USD',
          items: { create: itemsData },
          historial: { create: { estado: 'PENDIENTE' } },
        },
        include: { items: { include: { obra: true, producto: true } } },
      })

      // Marcar obras como vendidas (reserva)
      for (const item of itemsData) {
        if (item.obraId) {
          await tx.obra.update({ where: { id: item.obraId }, data: { disponible: 'VENDIDA' } })
        }
        // Descontar stock de productos físicos
        if (item.productoId) {
          const prod = await tx.producto.findUnique({ where: { id: item.productoId } })
          if (prod.stock !== null) {
            await tx.producto.update({
              where: { id: item.productoId },
              data:  { stock: { decrement: item.cantidad } },
            })
          }
        }
      }
      return p
    })

    res.status(201).json({ pedidoId: pedido.id, numero: pedido.numero, subtotal, descuento, costoEnvio, total: pedido.total })
  } catch (e) { next(e) }
})

// GET /api/pedidos/:id/estado — consulta pública del estado (para el cliente)
router.get('/:id/estado', async (req, res, next) => {
  try {
    const pedido = await prisma.pedido.findUniqueOrThrow({
      where:   { id: req.params.id },
      select:  { numero: true, estado: true, trackingNumero: true, tipoEntrega: true },
    })
    res.json(pedido)
  } catch (e) { next(e) }
})

// ── ADMIN ──────────────────────────────────────────────────

// GET /api/pedidos — listar pedidos
router.get('/', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { estado, page = 1, limit = 20 } = req.query
    const where = estado ? { estado: estado.toUpperCase() } : {}

    const [pedidos, total] = await Promise.all([
      prisma.pedido.findMany({
        where,
        include: { items: { include: { obra: true, producto: true } } },
        orderBy: { creadoEn: 'desc' },
        take: parseInt(limit),
        skip: (parseInt(page) - 1) * parseInt(limit),
      }),
      prisma.pedido.count({ where }),
    ])

    res.json({ pedidos, total })
  } catch (e) { next(e) }
})

// GET /api/pedidos/:id — detalle completo
router.get('/:id', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const pedido = await prisma.pedido.findUniqueOrThrow({
      where:   { id: req.params.id },
      include: {
        items:    { include: { obra: true, producto: true } },
        historial: { orderBy: { creadoEn: 'asc' } },
      },
    })
    res.json(pedido)
  } catch (e) { next(e) }
})

// PATCH /api/pedidos/:id/estado — cambiar estado
router.patch('/:id/estado', authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { estado, trackingNumero, nota } = req.body
    const estadosValidos = ['CONFIRMADO', 'PREPARANDO', 'ENVIADO', 'ENTREGADO', 'CANCELADO']
    if (!estadosValidos.includes(estado)) throw new AppError('Estado inválido')

    const data = { estado }
    if (trackingNumero) data.trackingNumero = trackingNumero

    const pedido = await prisma.$transaction(async (tx) => {
      const p = await tx.pedido.update({
        where:   { id: req.params.id },
        data,
        include: { items: { include: { obra: true, producto: true } } },
      })
      await tx.pedidoHistorial.create({ data: { pedidoId: p.id, estado, nota } })
      return p
    })

    // Notificaciones automáticas
    if (estado === 'ENVIADO') {
      await emailPedidoEnviado(pedido)
    }

    // Entrega digital — enviar link de descarga
    if (estado === 'CONFIRMADO') {
      for (const item of pedido.items) {
        if (item.producto?.tipo === 'EBOOK' && item.producto?.archivoPublicId) {
          const url = urlDescargaPrivada(item.producto.archivoPublicId)
          await emailEntregaDigital(pedido, url)
        }
      }
    }

    res.json(pedido)
  } catch (e) { next(e) }
})

// ── HELPERS ────────────────────────────────────────────────
async function resolverZonaEnvio(provincia) {
  // Mapa simplificado — se puede hacer más granular
  const zonaMap = {
    'cordoba':        'Resto de Córdoba',
    'buenos aires':   'Buenos Aires (CABA y GBA)',
    'caba':           'Buenos Aires (CABA y GBA)',
  }
  const key = provincia.toLowerCase()
  const nombreZona = zonaMap[key] || 'Interior del país'
  return prisma.zonaEnvio.findFirst({ where: { nombre: { contains: nombreZona } } })
}

export default router
