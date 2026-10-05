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

  // Obras originales escaneadas (USD 110, disponibles). Se cargan una sola vez:
  // si ya existe alguna con imagen en /img/originales/, no se vuelve a importar.
  const BASE_IMG = 'https://santiornaghi.github.io/nayart-web/img/originales/'
  const yaImportadas = await prisma.obra.count({ where: { imagenUrl: { contains: '/img/originales/' } } })
  if (!yaImportadas) {
    const originales = [
      ['01','Bote en la orilla',17,24],['02','La tranquera',25,18],['03','Ciudad al atardecer',18,25],
      ['05','Tormenta en el campo',25,18],['06','El canal',18,25],
      ['07','Niebla',18,25],['08','Laguna azul',18,25],['10','Arboleda',29,21],
      ['12','Tarde en el campo',25,18],['13','Camino de tierra',25,18],['14','Cielo de tormenta',25,18],
      ['15','Paisano',25,18],['16','Bajo el árbol',25,18],['17','Cordero en el corral',25,18],
      ['18','Chanchos',25,18],['19','La aguada',25,18],['20','Atardecer violeta',25,18],
    ]
    for (const [n, titulo, ancho, alto] of originales) {
      await prisma.obra.create({ data: {
        titulo, tecnica: 'ACUARELA', ancho, alto, anio: 2025, precio: 110, moneda: 'USD',
        disponible: 'DISPONIBLE', imagenUrl: BASE_IMG + n + '.jpg',
      } })
    }
    console.log(`✓ ${originales.length} obras originales importadas`)
  }

  // Aumento del 10% (oct 2026): originales que seguían en USD 100 pasan a USD 110
  const subidas = await prisma.obra.updateMany({ where: { imagenUrl: { contains: '/img/originales/' }, precio: 100, moneda: 'USD' }, data: { precio: 110 } })
  if (subidas.count) console.log(`✓ ${subidas.count} originales actualizados a USD 110`)

  // Obras retiradas del sitio: se borran si nunca tuvieron pedidos
  for (const titulo of ['El caballo', 'Siesta']) {
    const obras = await prisma.obra.findMany({ where: { titulo, imagenUrl: { contains: '/img/originales/' } }, include: { pedidoItems: true } })
    for (const o of obras) {
      if (o.pedidoItems.length) await prisma.obra.update({ where: { id: o.id }, data: { disponible: 'NO_DISPONIBLE' } })
      else await prisma.obra.delete({ where: { id: o.id } })
    }
  }

  // Descripción breve de cada obra (solo si todavía no tiene una cargada desde el panel)
  const DESCRIPCIONES = {
  'Bote en la orilla': 'Un bote rojo varado sobre la arena húmeda. El cielo se abre en azules lavados y la playa queda casi en blanco, hecha con pocas pinceladas.',
  'La tranquera': 'Mediodía de campo entre alambrados y árboles. La luz quema el fondo y las sombras de la tranquera ordenan la escena.',
  'Ciudad al atardecer': 'Una avenida a contraluz: bicicletas, peatones y sombras largas en violeta. El sol se disuelve entre los edificios.',
  'Tormenta en el campo': 'Nubes cargadas sobre un campo abierto. El cielo está pintado húmedo sobre húmedo; abajo, vacas y un camino que se pierde.',
  'El canal': 'Casas de ladrillo, un puente y el agua que lo refleja todo en verticales. Una ciudad vieja resuelta con pocos tonos tierra.',
  'Niebla': 'Casi abstracta: una masa de grises que avanza y una línea de luz arriba. El granulado del pigmento hace el resto.',
  'Laguna azul': 'Árboles y agua bajo un cielo índigo. Los bordes se funden y el horizonte apenas se sugiere.',
  'Arboleda': 'Verdes superpuestos de una arboleda junto al agua. Las copas se arman con manchas y el reflejo se estira hacia abajo.',
  'Tarde en el campo': 'Un casco de estancia con su bandera, árboles oscuros y gente en el pasto. Cielo celeste abierto y luz de tarde.',
  'Camino de tierra': 'Un camino de campo hacia una casa, con animales pastando. Verdes intensos y un cielo blanco de llovizna.',
  'Cielo de tormenta': 'El cielo ocupa casi todo: azules que se abren y dejan pasar la luz sobre una franja de campo verde.',
  'Paisano': 'Un hombre de boina sentado a la sombra, frente a un caballo. El retrato de una siesta de campo.',
  'Bajo el árbol': 'Animales echados a la sombra de un árbol grande, sobre tierra y pasto de mediodía.',
  'Cordero en el corral': 'Un chico abraza a un cordero negro entre la paja del corral. La paja está hecha reservando el blanco del papel.',
  'Chanchos': 'Dos chanchos colorados hozando junto a un muro de ladrillo. Pincelada rápida y mucha textura.',
  'La aguada': 'Vacas que bajan a tomar agua a la sombra de los árboles. Los reflejos se arman con manchas de color puro.',
  'Atardecer violeta': 'Un atardecer de pueblo: postes de luz, una casa y figuras a contraluz bajo un cielo violeta y naranja.',
  }
  for (const [titulo, concepto] of Object.entries(DESCRIPCIONES)) {
    await prisma.obra.updateMany({ where: { titulo, concepto: null }, data: { concepto } })
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
