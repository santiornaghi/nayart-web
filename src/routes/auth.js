import jwt from 'jsonwebtoken'

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' })
  }
  const token = header.split(' ')[1]
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

// Solo para rutas del panel admin
export function adminOnly(req, res, next) {
  if (!['ADMIN', 'SUPERADMIN'].includes(req.usuario?.rol)) {
    return res.status(403).json({ error: 'Sin permisos' })
  }
  next()
}
