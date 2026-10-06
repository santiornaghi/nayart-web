// Integración directa con Andreani Pyme.
// Usa la misma API que el plugin oficial de Andreani para WooCommerce
// (woocommerce-api-acom.andreani.com), con la "Credential ID" que se genera en
// pymes.andreani.com/integraciones. Variable de entorno: ANDREANI_CREDENTIAL.
//
// - cotizarAndreani(): precio real del envío a domicilio (lo usa envios.js)
// - procesarEnvioPedido(): da de alta el envío y te manda la etiqueta por mail
import { PrismaClient } from '@prisma/client'
import { Resend } from 'resend'
import { armarPaquetes } from './envios.js'

const prisma = new PrismaClient()
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'Nayart <noreply@nayart.com.ar>'

const BASE_URL   = 'https://woocommerce-api-acom.andreani.com'
const CP_ORIGEN  = process.env.ANDREANI_CP_ORIGEN || '5800' // Río Cuarto
// Modalidades que no se ofrecen: "Sucursal" necesita que el comprador elija sucursal
const EXCLUIDOS  = ['sucursal', 'bigger']

export const andreaniActivo = () => Boolean(process.env.ANDREANI_CREDENTIAL)

// ── SESIÓN ─────────────────────────────────────────────────
let sesion = null // { token, contratos, vence }

async function pedir(method, path, { headers = {}, body, raw = false, timeout = 15000 } = {}) {
  const r = await fetch(BASE_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  })
  if (raw && r.ok) return Buffer.from(await r.arrayBuffer())
  const texto = await r.text()
  let data
  try { data = texto ? JSON.parse(texto) : {} } catch { data = { texto } }
  if (!r.ok) {
    const e = new Error(`Andreani respondió ${r.status} en ${path}`)
    e.status = r.status
    e.data = data
    throw e
  }
  return data
}

async function login() {
  if (!process.env.ANDREANI_CREDENTIAL) throw new Error('Falta ANDREANI_CREDENTIAL')
  const d = await pedir('POST', '/api/v1/Login', { headers: { Authorization: process.env.ANDREANI_CREDENTIAL } })
  const info = d.response
  if (!info?.accessToken) throw new Error('Andreani no devolvió token: revisá la credencial')
  sesion = { token: info.accessToken, contratos: info.contratos || [], vence: Date.now() + 30 * 60 * 1000 }
  return sesion
}

async function getSesion() {
  if (!sesion || Date.now() > sesion.vence) await login()
  return sesion
}

// Llamada autenticada; si el token venció, reloguea una vez
async function conToken(method, path, opts = {}) {
  await getSesion()
  try {
    return await pedir(method, path, { ...opts, headers: { 'X-Auth-Token': sesion.token } })
  } catch (e) {
    if (e.status !== 401 && e.status !== 403) throw e
    await login()
    return pedir(method, path, { ...opts, headers: { 'X-Auth-Token': sesion.token } })
  }
}

// ── PAQUETES ───────────────────────────────────────────────
// Usa las mismas medidas estimadas que envios.js (armarPaquetes): "alto x ancho x largo" en cm
function bultos({ marcos = 0, otros = 0, valor = 20000 }) {
  const { paquetes } = armarPaquetes({ marcos, otros })
  const lista = paquetes.split(',')
  const valorPorBulto = Math.max(1, Math.round(valor / lista.length))
  return lista.map((p, i) => {
    const [alto, ancho, largo] = p.split('x').map(Number)
    const esMarco = i < marcos
    const gramos  = esMarco ? 1600 : Math.round((0.3 + 0.08 * otros) * 1000)
    return { alto, ancho, largo, gramos, valor: valorPorBulto }
  })
}

const cpLimpio = cp => String(cp || '').replace(/\D/g, '').slice(-4)

// ── COTIZACIÓN ─────────────────────────────────────────────
const cache = new Map()

// Devuelve { costo, modo, fuente: 'andreani' } con la opción a domicilio más barata, o null
export async function cotizarAndreani({ cp, marcos = 0, otros = 0, valor }) {
  const destino = cpLimpio(cp)
  if (!/^\d{4}$/.test(destino)) return null

  const products = bultos({ marcos, otros, valor }).map(b => ({
    quantity: 1,
    price: b.valor,
    dimensions: { width: b.ancho, height: b.alto, depth: b.largo, grams: b.gramos },
  }))

  const clave = destino + JSON.stringify(products)
  const guardada = cache.get(clave)
  if (guardada && Date.now() - guardada.t < 10 * 60 * 1000) return guardada.v

  const d = await conToken('POST', '/api/v1/Pyme/rates', {
    body: { postal_code_origin: CP_ORIGEN, postal_code_destination: destino, products },
  })
  const opciones = (d.response?.rates || [])
    .filter(r => Number(r.total) > 0 && !EXCLUIDOS.some(x => String(r.code).toLowerCase().includes(x)))
    .sort((a, b) => Number(a.total) - Number(b.total))
  if (!opciones.length) return null

  const v = { costo: Math.ceil(Number(opciones[0].total)), modo: opciones[0].code, fuente: 'andreani' }
  cache.set(clave, { t: Date.now(), v })
  return v
}

// ── ALTA DE ENVÍO ──────────────────────────────────────────
// "Sucre 1234 2B" → { calle: 'Sucre', numero: '1234', piso: '2B' }
function separarDireccion(dir = '') {
  const m = String(dir).trim().match(/^(.*?)\s+(\d+)\s*,?\s*(.*)$/)
  if (m && m[1]) return { calle: m[1].replace(/,$/, ''), numero: m[2], piso: m[3] || '' }
  return { calle: String(dir).trim(), numero: 'S/N', piso: '' }
}

function contarItems(items) {
  let marcos = 0, otros = 0
  for (const i of items) {
    const desc = (i.descripcion || '').toLowerCase()
    if (desc.includes('marco')) marcos += i.cantidad
    else otros += i.cantidad
  }
  return { marcos, otros }
}

/**
 * Da de alta el envío del pedido en Andreani y manda la etiqueta a EMAIL_ADMIN.
 * Se llama sola cuando el pedido pasa a CONFIRMADO (pago aprobado o confirmado a mano).
 * Es segura de llamar varias veces: cada pedido se procesa una sola vez.
 */
export async function procesarEnvioPedido(pedidoId) {
  if (!andreaniActivo()) return null

  // Reserva atómica: si dos avisos llegan juntos, solo uno crea el envío
  const tomado = await prisma.pedido.updateMany({
    where: { id: pedidoId, tipoEntrega: 'ENVIO', andreaniEstado: null, trackingNumero: null },
    data:  { andreaniEstado: 'PROCESANDO' },
  })
  if (tomado.count === 0) return null

  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: { items: true } })

  let envio
  try {
    const { marcos, otros } = contarItems(pedido.items)
    const cot = await cotizarAndreani({ cp: pedido.codigoPostal, marcos, otros, valor: pedido.subtotal })
    if (!cot) throw new Error(`Andreani no tiene envío a domicilio para el CP ${pedido.codigoPostal}`)

    const { contratos } = await getSesion()
    const contrato = contratos.find(c => String(c.modoDeEntregaNombre).toLowerCase() === String(cot.modo).toLowerCase())
    if (!contrato) throw new Error(`Tu cuenta no tiene contrato para "${cot.modo}"`)

    const dir = separarDireccion(pedido.direccion)
    const [nombre, ...resto] = pedido.clienteNombre.trim().split(/\s+/)

    const d = await conToken('POST', '/api/v1/Pyme/ShippingRegistration', {
      timeout: 30000,
      body: {
        contract:       { id_contract: contrato.id },
        price_shipment: pedido.costoEnvio || cot.costo,
        origin:         { postal_code: CP_ORIGEN },
        destination: {
          street: dir.calle, number: dir.numero, floor: dir.piso,
          postal_code: cpLimpio(pedido.codigoPostal), locality: pedido.ciudad || '', code_branch: '',
        },
        recipient: {
          name: nombre, last_name: resto.join(' ') || nombre,
          phone_number: pedido.clienteTelefono || '',
          dni: String(pedido.clienteDni || '').replace(/\D/g, ''),
          email: pedido.clienteEmail || '',
        },
        products: bultos({ marcos, otros, valor: pedido.subtotal }).map(b => ({
          price: b.valor, quantity: 1, kgrams: b.gramos / 1000, width: b.ancho, depth: b.largo, height: b.alto,
        })),
        email_merchant: process.env.EMAIL_ADMIN || '',
        remito: String(pedido.numero),
      },
    })
    const id = d.response?.pedidoId
    if (!id) throw Object.assign(new Error('Andreani no devolvió el ID del envío'), { data: d })
    envio = { id: String(id), modo: cot.modo }
  } catch (e) {
    console.error('[andreani] alta fallida pedido', pedido.numero, e.message, e.data ? JSON.stringify(e.data) : '')
    // No se reintenta solo: si el alta llegó pero se perdió la respuesta, se duplicaría el envío
    await prisma.pedido.update({ where: { id: pedidoId }, data: { andreaniEstado: 'ERROR', andreaniError: e.message.slice(0, 500) } })
    await avisar(`⚠️ Falló el envío Andreani del pedido #${pedido.numero}`,
      `<p>${e.message}</p><p>Revisá en <a href="https://pymes.andreani.com/ver-envios">pymes.andreani.com</a> si se creó igual. Si no, hacelo a mano desde ahí.</p>`)
    return null
  }

  await prisma.pedido.update({
    where: { id: pedidoId },
    data:  { andreaniEstado: 'CREADO', andreaniError: null, trackingNumero: envio.id },
  })

  const datos = `<p><b>${pedido.clienteNombre}</b> · ${pedido.direccion}, ${pedido.ciudad}, ${pedido.provincia} (CP ${pedido.codigoPostal})<br>
    Tel: ${pedido.clienteTelefono || '-'}</p><p>Modalidad: ${envio.modo} · ID Andreani: ${envio.id}</p>`
  try {
    const pdf = await conToken('POST', '/api/v1/Pyme/ticket', { body: { trackingNumbers: [envio.id] }, raw: true, timeout: 30000 })
    await avisar(`📦 Envío Andreani listo · Pedido #${pedido.numero}`,
      datos + '<p>Imprimí la etiqueta adjunta, pegala en el paquete y llevalo a una sucursal Andreani.</p>',
      [{ filename: `etiqueta-pedido-${pedido.numero}.pdf`, content: pdf }])
  } catch (e) {
    console.error('[andreani] etiqueta no disponible', pedido.numero, e.message)
    await avisar(`📦 Envío Andreani creado · Pedido #${pedido.numero}`,
      datos + '<p>La etiqueta no se pudo adjuntar: descargala desde <a href="https://pymes.andreani.com/ver-envios">pymes.andreani.com</a>.</p>')
  }
  return envio
}

async function avisar(subject, html, attachments) {
  if (!process.env.EMAIL_ADMIN) return
  try {
    await resend.emails.send({ from: FROM, to: process.env.EMAIL_ADMIN, subject, html, attachments })
  } catch (e) { console.error('[andreani] mail no enviado:', e.message) }
}
