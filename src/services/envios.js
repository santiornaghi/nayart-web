// Cotización de envíos por Andreani.
// - Si están cargadas ENVIOPACK_API_KEY y ENVIOPACK_SECRET_KEY (cuenta de Envíopack),
//   cotiza en tiempo real por código postal.
// - Si no, usa la tarifa por región que se carga en Panel → Envíos.
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Provincias → código ISO 3166-2:AR (sin "AR-"), que usa Envíopack
export const PROVINCIA_ISO = {
  'Salta':'A','Buenos Aires':'B','CABA':'C','San Luis':'D','Entre Ríos':'E','La Rioja':'F',
  'Santiago del Estero':'G','Chaco':'H','San Juan':'J','Catamarca':'K','La Pampa':'L','Mendoza':'M',
  'Misiones':'N','Formosa':'P','Neuquén':'Q','Río Negro':'R','Santa Fe':'S','Tucumán':'T',
  'Chubut':'U','Tierra del Fuego':'V','Corrientes':'W','Córdoba':'X','Jujuy':'Y','Santa Cruz':'Z',
}

// Paquetes estimados según lo que lleva el pedido (cm y kg)
export function armarPaquetes({ marcos = 0, otros = 0 }) {
  const paquetes = []
  let peso = 0
  for (let i = 0; i < marcos; i++) { paquetes.push('6x34x42'); peso += 1.6 }   // lámina enmarcada en kiri
  if (otros > 0 || !paquetes.length) { paquetes.push('3x30x40'); peso += 0.3 + 0.08 * otros } // sobre rígido
  return { paquetes: paquetes.join(','), peso: Math.round(peso * 100) / 100 }
}

let tokenCache = { token: null, vence: 0 }
async function tokenEnviopack() {
  if (tokenCache.token && Date.now() < tokenCache.vence) return tokenCache.token
  const r = await fetch('https://api.enviopack.com/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 'api-key': process.env.ENVIOPACK_API_KEY, 'secret-key': process.env.ENVIOPACK_SECRET_KEY }),
  })
  if (!r.ok) throw new Error('Envíopack: autenticación fallida (' + r.status + ')')
  const d = await r.json()
  tokenCache = { token: d.access_token, vence: Date.now() + 3.5 * 3600 * 1000 } // dura 4 h
  return tokenCache.token
}

async function cotizarEnviopack({ provincia, cp, marcos, otros }) {
  const iso = PROVINCIA_ISO[provincia]
  if (!iso || !/^\d{4}$/.test(String(cp || ''))) return null
  const { paquetes, peso } = armarPaquetes({ marcos, otros })
  const token = await tokenEnviopack()
  const q = new URLSearchParams({ access_token: token, provincia: iso, codigo_postal: cp, peso, paquetes,
    correo: 'andreani', despacho: 'D', modalidad: 'D', servicio: 'N' })
  const r = await fetch('https://api.enviopack.com/cotizar/costo?' + q)
  if (!r.ok) throw new Error('Envíopack: cotización fallida (' + r.status + ')')
  const opciones = (await r.json()).filter(o => o && o.valor > 0)
  if (!opciones.length) return null
  const mejor = opciones.sort((a, b) => a.valor - b.valor)[0]
  return { costo: Math.ceil(mejor.valor), horas: mejor.horas_entrega || null, fuente: 'andreani' }
}

async function cotizarTabla({ provincia, marcos }) {
  const zonas = await prisma.zonaEnvio.findMany({ where: { activa: true, provincias: { not: null } } })
  const zona = zonas.find(z => z.provincias.split(',').map(s => s.trim()).includes(provincia))
  if (!zona) return { costo: null, fuente: 'tabla' }
  const costo = (marcos > 0 && zona.costoMarco) ? zona.costoMarco : zona.costo
  return { costo: costo > 0 ? costo : null, zona: zona.nombre, zonaId: zona.id, fuente: 'tabla' }
}

// Devuelve { costo (null = a cotizar), fuente, ... }
export async function cotizarEnvio({ provincia, cp, marcos = 0, otros = 0 }) {
  if (process.env.ENVIOPACK_API_KEY && process.env.ENVIOPACK_SECRET_KEY) {
    try {
      const r = await cotizarEnviopack({ provincia, cp, marcos, otros })
      if (r) return r
    } catch (e) { console.error('[envios]', e.message) }
  }
  return cotizarTabla({ provincia, marcos })
}
