import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Creando usuario admin...')

  const hash = await bcrypt.hash('nayart2025', 12)

  // Reseteo de contraseña: si existe la variable ADMIN_RESET_PASSWORD en Render,
  // al arrancar se pone esa contraseña. Después de entrar, borrar la variable.
  const reset = process.env.ADMIN_RESET_PASSWORD
  const update = reset ? { password: await bcrypt.hash(reset, 12) } : {}
  if (reset) console.log('⚠ Contraseña del admin reseteada desde ADMIN_RESET_PASSWORD. Borrá la variable después de entrar.')

  const usuario = await prisma.usuario.upsert({
    where:  { email: 'santiornaghi@gmail.com' },
    update,
    create: {
      email:    'santiornaghi@gmail.com',
      password: hash,
      nombre:   'Santiago',
      rol:      'ADMIN',
    },
  })

  console.log(`✓ Usuario creado: ${usuario.email}`)

  // Zonas de envío por defecto
  const zonas = [
    { nombre: 'Río Cuarto / Córdoba capital', costo: 1500 },
    { nombre: 'Resto de Córdoba',             costo: 2500 },
    { nombre: 'Buenos Aires (CABA y GBA)',    costo: 3500 },
    { nombre: 'Interior del país',            costo: 4500 },
  ]

  // Zonas genéricas viejas: quedan desactivadas (ahora Río Cuarto y Córdoba son gratis
  // y el resto del país va por Andreani con tarifa por región)
  await prisma.zonaEnvio.updateMany({ where: { nombre: { in: zonas.map(z => z.nombre) } }, data: { activa: false } })

  // Regiones de Andreani: el costo se carga desde el panel (0 = a cotizar)
  const regiones = [
    { nombre: 'Andreani — Córdoba (resto de la provincia)', provincias: 'Córdoba' },
    { nombre: 'Andreani — Región Centro', provincias: 'Santa Fe,San Luis,La Pampa,Entre Ríos,Santiago del Estero' },
    { nombre: 'Andreani — Buenos Aires y CABA', provincias: 'Buenos Aires,CABA' },
    { nombre: 'Andreani — Cuyo y NOA', provincias: 'Mendoza,San Juan,La Rioja,Catamarca,Tucumán,Salta,Jujuy' },
    { nombre: 'Andreani — NEA', provincias: 'Corrientes,Misiones,Chaco,Formosa' },
    { nombre: 'Andreani — Patagonia', provincias: 'Neuquén,Río Negro,Chubut,Santa Cruz,Tierra del Fuego' },
  ]
  for (const r of regiones) {
    const existe = await prisma.zonaEnvio.findFirst({ where: { nombre: r.nombre } })
    if (!existe) await prisma.zonaEnvio.create({ data: { ...r, costo: 0, activa: true } })
  }

  console.log('✓ Regiones de envío Andreani listas')

  // Obras originales escaneadas (USD 100, disponibles). Se cargan una sola vez:
  // si ya existe alguna con imagen en /img/originales/, no se vuelve a importar.
  const BASE_IMG = 'https://santiornaghi.github.io/nayart-web/img/originales/'
  const yaImportadas = await prisma.obra.count({ where: { imagenUrl: { contains: '/img/originales/' } } })
  if (!yaImportadas) {
    const originales = [
      ['01','Bote en la orilla',17,24],['02','La tranquera',25,18],['03','Ciudad al atardecer',18,25],
      ['04','El caballo',25,18],['05','Tormenta en el campo',25,18],['06','El canal',18,25],
      ['07','Niebla',18,25],['08','Laguna azul',18,25],['09','Siesta',25,18],['10','Arboleda',29,21],
      ['12','Tarde en el campo',25,18],['13','Camino de tierra',25,18],['14','Cielo de tormenta',25,18],
      ['15','Paisano',25,18],['16','Bajo el árbol',25,18],['17','Cordero en el corral',25,18],
      ['18','Chanchos',25,18],['19','La aguada',25,18],['20','Atardecer violeta',25,18],
    ]
    for (const [n, titulo, ancho, alto] of originales) {
      await prisma.obra.create({ data: {
        titulo, tecnica: 'ACUARELA', ancho, alto, anio: 2025, precio: 100, moneda: 'USD',
        disponible: 'DISPONIBLE', imagenUrl: BASE_IMG + n + '.jpg',
      } })
    }
    console.log(`✓ ${originales.length} obras originales importadas`)
  }

  // Configuración inicial de la tienda
  await prisma.configuracionTienda.upsert({
    where:  { id: 'default' },
    update: {},
    create: {
      id:               'default',
      envioGratisDesde: 100,
      retiroPresencial: true,
      monedaPrincipal:  'USD',
      whatsappNumero:   '5493584390961',
      emailContacto:    'santiornaghi@gmail.com',
    },
  })

  console.log('✓ Configuración de tienda creada')
  console.log('\n🎨 Seed completo. Podés loguearte con:')
  console.log('   Email:    santiornaghi@gmail.com')
  console.log('   Password: nayart2025')
  console.log('\n⚠️  Cambiá la contraseña después del primer login.\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
