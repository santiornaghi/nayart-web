import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import Stripe from 'stripe'
import { emailConfirmacionPedido, emailEntregaDigital } from '../services/email.js'
import { urlDescargaPrivada } from '../services/cloudinary.js'

const router = Router()
const prisma = new PrismaClient()
const mp     = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// POST /api/pagos/mp/preferencia
router.post('/mp/preferencia', async (req, res, next) => {
  try {
    const { pedidoId } = req.body
    const pedido = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedidoId },
      include: { items: { include: { obra: true, producto: true } } },
    })
    const items = pedido.items.map(item => ({
      title:      item.obra?.titulo || item.producto?.nombre,
      quantity:   item.cantidad,
      unit_price: item.precioUnit,
      currency_id: 'ARS',
    }))
    const preference = new Preference(mp)
    const result = await preference.create({
      body: {
        items,
        external_reference: pedidoId,
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pedido/${pedidoId}?pago=ok`,
          failure: `${process.env.FRONTEND_URL}/pedido/${pedidoId}?pago=error`,
          pending: `${process.env.FRONTEND_URL}/pedido/${pedidoId}?pago=pendiente`,
        },
        auto_return: 'approved',
        notification_url: `${process.env.BACKEND_URL}/api/pagos/mp/webhook`,
      },
    })
    res.json({ preferenceId: result.id, initPoint: result.init_point })
  } catch (e) { next(e) }
})

// POST /api/pagos/mp/webhook
router.post('/mp/webhook', async (req, res, next) => {
  try {
    const { type, data } = req.query
    if (type !== 'payment') return res.sendStatus(200)
    const payment = new Payment(mp)
    const pago = await payment.get({ id: data.id })
    if (pago.status === 'approved') {
      const pedidoId = pago.external_reference
      await prisma.pedido.update({
        where: { id: pedidoId },
        data: { pagoEstado: 'APROBADO', pagoId: String(pago.id), metodoPago: 'MERCADOPAGO', estado: 'CONFIRMADO' },
      })
      const pedido = await prisma.pedido.findUnique({
        where: { id: pedidoId },
        include: { items: { include: { obra: true, producto: true } } },
      })
      await emailConfirmacionPedido(pedido)
    }
    res.sendStatus(200)
  } catch (e) { next(e) }
})

// POST /api/pagos/stripe/intent
router.post('/stripe/intent', async (req, res, next) => {
  try {
    const { pedidoId } = req.body
    const pedido = await prisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } })
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(pedido.total * 100),
      currency: 'usd',
      metadata: { pedidoId },
    })
    await prisma.pedido.update({ where: { id: pedidoId }, data: { pagoId: intent.id, metodoPago: 'STRIPE' } })
    res.json({ clientSecret: intent.client_secret })
  } catch (e) { next(e) }
})

// POST /api/pagos/stripe/webhook
router.post('/stripe/webhook', async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature']
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object
      const pedidoId = intent.metadata.pedidoId
      await prisma.pedido.update({
        where: { id: pedidoId },
        data: { pagoEstado: 'APROBADO', estado: 'CONFIRMADO' },
      })
      const pedido = await prisma.pedido.findUnique({
        where: { id: pedidoId },
        include: { items: { include: { obra: true, producto: true } } },
      })
      await emailConfirmacionPedido(pedido)
    }
    res.json({ received: true })
  } catch (e) { next(e) }
})

export default router
