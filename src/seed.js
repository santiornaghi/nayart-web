import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Creando usuario admin...')

  const hash = await bcrypt.hash('nayart2025', 12)

  const usuario = await prisma.usuario.upsert({
    where:  { email: 'santiornaghi@gmail.com' },
    update: {},
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

  for (const zona of zonas) {
    await prisma.zonaEnvio.upsert({
      where:  { id: zona.nombre },
      update: {},
      create: zona,
    })
  }

  console.log('✓ Zonas de envío creadas')

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
