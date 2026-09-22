# Nayart Backend

API REST para la tienda y panel de administración de Nayart.

## Stack

- **Node.js** + **Express** — servidor
- **Prisma** + **PostgreSQL** (Supabase) — base de datos
- **Cloudinary** — imágenes y archivos digitales
- **MercadoPago** — pagos en ARS
- **Stripe** — pagos en USD
- **Resend** — emails transaccionales
- **Railway** — deploy

---

## Instalación local

```bash
# 1. Clonar e instalar
git clone https://github.com/tuusuario/nayart-backend
cd nayart-backend
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Completar el .env con tus credenciales

# 3. Crear las tablas en la base de datos
npm run db:push

# 4. Crear el usuario admin inicial
npm run db:seed

# 5. Correr en modo desarrollo
npm run dev
```

---

## Deploy en Railway

1. Crear cuenta en [railway.app](https://railway.app)
2. Nuevo proyecto → Deploy from GitHub repo
3. Agregar las variables de entorno del `.env.example`
4. Railway detecta Node.js automáticamente y levanta el servidor

---

## Endpoints principales

### Públicos (sin auth)
```
GET    /api/obras              → listar obras
GET    /api/obras/:id          → obra individual
GET    /api/productos          → listar productos
POST   /api/pedidos            → crear pedido
POST   /api/encargos           → enviar formulario de encargo
POST   /api/pagos/mp/preferencia  → iniciar pago MercadoPago
POST   /api/pagos/stripe/intent   → iniciar pago Stripe
```

### Admin (requieren token JWT)
```
POST   /api/auth/login         → login
GET    /api/auth/me            → perfil

POST   /api/obras              → crear obra (con imagen)
PUT    /api/obras/:id          → editar obra
DELETE /api/obras/:id          → eliminar obra

POST   /api/productos          → crear producto
PUT    /api/productos/:id      → editar producto
DELETE /api/productos/:id      → eliminar producto

GET    /api/pedidos            → listar pedidos
GET    /api/pedidos/:id        → detalle de pedido
PATCH  /api/pedidos/:id/estado → cambiar estado + notificar cliente

GET    /api/encargos           → listar encargos
PATCH  /api/encargos/:id       → marcar leído / cambiar estado
```

---

## Servicios externos — dónde crear las cuentas

| Servicio | URL | Plan gratuito |
|----------|-----|---------------|
| Supabase | supabase.com | 500MB DB, gratis |
| Cloudinary | cloudinary.com | 25GB, gratis |
| Railway | railway.app | $5 crédito/mes |
| Resend | resend.com | 3000 emails/mes |
| MercadoPago | mercadopago.com.ar | Comisión por venta |
| Stripe | stripe.com | Comisión por venta |

---

## Estructura del proyecto

```
src/
├── server.js          → punto de entrada
├── routes/
│   ├── obras.js       → CRUD de obras
│   ├── productos.js   → CRUD de productos
│   ├── pedidos.js     → gestión de pedidos y estados
│   ├── auth.js        → login y JWT
│   ├── pagos.js       → MercadoPago y Stripe
│   └── config.js      → zonas de envío y configuración
├── middleware/
│   ├── auth.js        → validación de token JWT
│   └── errorHandler.js → errores globales
└── services/
    ├── cloudinary.js  → subida y gestión de archivos
    └── email.js       → emails transaccionales con Resend
prisma/
└── schema.prisma      → estructura completa de la base de datos
```
