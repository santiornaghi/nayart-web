import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import Stripe from 'stripe'
import { emailConfirmacionPedido, emailEntregaDigital, emailAdminPagoAprobado } from '../services/email.js'
import { urlDescargaPrivada } from '../services/cloudinary.js'
import { procesarEnvioPedido } from '../services/andreani.js'

const router = Router()
const prisma = new PrismaClient()
const mp     = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Adónde vuelve el comprador después de pagar: la página que lo mandó, si es una de las nuestras
const FRONTS = [process.env.FRONTEND_URL, 'https://santiornaghi.github.io/nayart-web', 'https://nayaart.com', 'https://www.nayaart.com'].filter(Boolean).map(u => u.replace(/\/$/, ''))
function urlRetorno(pedida) {
  const u = String(pedida || '').split(/[?#]/)[0].replace(/\/index\.html$/, '').replace(/\/$/, '')
  return FRONTS.find(f => u === f || u.startsWith(f + '/')) ? u : FRONTS[0]
}

// POST /api/pagos/mp/preferencia  { pedidoId, volverA }
router.post('/mp/preferencia', async (req, res, next) => {
  try {
    const { pedidoId, volverA } = req.body
    const pedido = await prisma.pedido.findUnique({
      where: { id: String(pedidoId || '') },
      include: { items: { include: { obra: true, producto: true } } },
    })
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' })
    if (pedido.pagoEstado === 'APROBADO') return res.status(409).json({ error: 'Este pedido ya está pagado' })
    if (pedido.items.some(i => i.moneda !== 'ARS')) return res.status(400).json({ error: 'Mercado Pago solo cobra en pesos' })
    if (pedido.tipoEntrega === 'ENVIO' && !(pedido.costoEnvio > 0)) {
      return res.status(400).json({ error: 'No pudimos cotizar el envío. Elegí transferencia y lo coordinamos por WhatsApp.' })
    }

    const items = pedido.items.map(item => ({
      id:          item.id,
      title:       item.obra?.titulo || item.producto?.nombre || item.descripcion || 'Nayart',
      quantity:    item.cantidad,
      unit_price:  Number(item.precioUnit),
      currency_id: 'ARS',
    }))
    if (pedido.costoEnvio > 0) {
      items.push({ id: 'envio', title: (pedido.notas || '').includes('Envío a domicilio en Río Cuarto') ? 'Envío en Río Cuarto' : 'Envío por Andreani', quantity: 1, unit_price: Number(pedido.costoEnvio), currency_id: 'ARS' })
    }

    const volver  = urlRetorno(volverA)
    const backend = (process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')
    const [nombre, ...apellido] = pedido.clienteNombre.trim().split(/\s+/)

    const result = await new Preference(mp).create({
      body: {
        items,
        payer: { name: nombre, surname: apellido.join(' '), ...(pedido.clienteEmail ? { email: pedido.clienteEmail } : {}) },
        external_reference: pedido.id,
        statement_descriptor: 'NAYART',
        back_urls: {
          success: `${volver}/?pago=ok&pedido=${pedido.numero}`,
          failure: `${volver}/?pago=error&pedido=${pedido.numero}`,
          pending: `${volver}/?pago=pendiente&pedido=${pedido.numero}`,
        },
        auto_return: 'approved',
        notification_url: `${backend}/api/pagos/mp/webhook`,
      },
    })
    await prisma.pedido.update({ where: { id: pedido.id }, data: { metodoPago: 'MERCADOPAGO' } })
    res.json({ preferenceId: result.id, initPoint: result.init_point })
  } catch (e) { next(e) }
})

// POST /api/pagos/mp/webhook — Mercado Pago avisa acá cada cambio de un pago.
// No confiamos en lo que llega: consultamos el pago a Mercado Pago con nuestro token.
router.post('/mp/webhook', async (req, res) => {
  const tipo = req.body?.type || req.query.type || req.query.topic
  const id   = req.body?.data?.id || req.query['data.id'] || req.query.id
  if (tipo !== 'payment' || !id) return res.sendStatus(200)

  try {
    const pago = await new Payment(mp).get({ id })
    const pedido = pago.external_reference
      ? await prisma.pedido.findUnique({ where: { id: pago.external_reference } })
      : null
    if (!pedido) return res.sendStatus(200)

    if (pago.status === 'approved') {
      // El monto cobrado tiene que cubrir el total del pedido
      if (pago.currency_id !== 'ARS' || Number(pago.transaction_amount) + 1 < pedido.total) {
        console.error('[mp] monto no coincide', pedido.numero, pago.transaction_amount, pedido.total)
        await prisma.pedido.update({ where: { id: pedido.id }, data: {
          notas: [pedido.notas, `⚠️ Pago MP ${pago.id} por ${pago.currency_id} ${pago.transaction_amount} no coincide con el total`].filter(Boolean).join('\n'),
        } })
        return res.sendStatus(200)
      }

      // Una sola vez por pedido, aunque Mercado Pago avise varias veces
      const marcado = await prisma.pedido.updateMany({
        where: { id: pedido.id, pagoEstado: { not: 'APROBADO' } },
        data:  { pagoEstado: 'APROBADO', pagoId: String(pago.id), metodoPago: 'MERCADOPAGO', estado: 'CONFIRMADO' },
      })
      if (marcado.count === 0) return res.sendStatus(200)
      await prisma.pedidoHistorial.create({ data: { pedidoId: pedido.id, estado: 'CONFIRMADO', nota: `Pago Mercado Pago ${pago.id}` } })

      res.sendStatus(200) // respondemos ya; mails y envío van en segundo plano

      const completo = await prisma.pedido.findUnique({
        where: { id: pedido.id },
        include: { items: { include: { obra: true, producto: true } } },
      })
      if (completo.clienteEmail) emailConfirmacionPedido(completo).catch(e => console.error('[mp] mail cliente:', e.message))
      emailAdminPagoAprobado(completo).catch(e => console.error('[mp] mail admin:', e.message))
      procesarEnvioPedido(pedido.id).catch(e => console.error('[andreani]', e))
      return
    }

    if (['rejected', 'cancelled'].includes(pago.status)) {
      await prisma.pedido.updateMany({
        where: { id: pedido.id, pagoEstado: 'PENDIENTE' },
        data:  { pagoEstado: 'RECHAZADO', pagoId: String(pago.id) },
      })
    }
    res.sendStatus(200)
  } catch (e) {
    console.error('[mp] webhook', e.message)
    res.sendStatus(500) // Mercado Pago reintenta más tarde
  }
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
