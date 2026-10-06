// Prueba la conexión con Andreani. No necesita instalar nada ni base de datos.
//
// En tu compu (PowerShell), parado en la carpeta nayart-web:
//   $env:ANDREANI_CREDENTIAL="tu-credencial"; node scripts/probar-andreani.js 1425
//
// También lee ANDREANI_CREDENTIAL de un archivo .env si existe.
import { readFileSync } from 'node:fs'

try {
  for (const linea of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {}

const BASE = 'https://woocommerce-api-acom.andreani.com'
const cp = process.argv[2] || '1425'
const cred = process.env.ANDREANI_CREDENTIAL

async function pedir(path, headers, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${path} respondió ${r.status}: ${texto.slice(0, 300)}`)
  return JSON.parse(texto)
}

if (!cred) {
  console.error('Falta la credencial. Corré:\n  $env:ANDREANI_CREDENTIAL="tu-credencial"; node scripts/probar-andreani.js ' + cp)
  process.exit(1)
}

try {
  const login = await pedir('/api/v1/Login', { Authorization: cred })
  const info = login.response || {}
  console.log('1. Login OK. Modalidades de tu cuenta:', (info.contratos || []).map(c => c.modoDeEntregaNombre).join(', ') || '(ninguna)')

  const cot = await pedir('/api/v1/Pyme/rates', { 'X-Auth-Token': info.accessToken }, {
    postal_code_origin: '5800',
    postal_code_destination: cp,
    products: [{ quantity: 1, price: 38500, dimensions: { width: 34, height: 6, depth: 42, grams: 1600 } }],
  })
  const rates = cot.response?.rates || []
  console.log(`2. Cotización OK (lámina A4 enmarcada, Río Cuarto → CP ${cp}):`)
  for (const r of rates) console.log(`   ${r.code}: $${Math.ceil(r.total)}`)
  if (!rates.length) console.log('   Andreani no devolvió tarifas para ese CP')
} catch (e) {
  console.error('ERROR:', e.message)
  process.exitCode = 1
}
