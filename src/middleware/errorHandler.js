export function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message)

  // Errores de Prisma
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Ya existe un registro con ese valor único.' })
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registro no encontrado.' })
  }

  // Errores de validación
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message })
  }

  // Error genérico
  const status = err.status || err.statusCode || 500
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message,
  })
}

// Helper para lanzar errores con status
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}
