import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'Nayart <noreply@nayart.com.ar>'

// ── EMAILS AL CLIENTE ──────────────────────────────────────

export async function emailConfirmacionPedido(pedido) {
  const items = pedido.items.map(i =>
    `<tr>
      <td style="padding:8px 0;color:#6b6560;">${i.obra?.titulo || i.producto?.nombre}</td>
      <td style="padding:8px 0;text-align:right;color:#b84a1e;">${i.moneda} ${i.precioUnit}</td>
    </tr>`
  ).join('')

  await resend.emails.send({
    from: FROM,
    to:   pedido.clienteEmail,
    subject: `Nayart — Pedido #${pedido.numero} confirmado`,
    html: emailBase(`
      <h2 style="font-family:Georgia,serif;font-weight:300;font-size:1.6rem;margin-bottom:1rem;">
        ¡Gracias por tu compra!
      </h2>
      <p style="color:#6b6560;line-height:1.7;margin-bottom:1.5rem;">
        Hola ${pedido.clienteNombre}, recibimos tu pedido y lo estamos procesando.
      </p>
      <table style="width:100%;border-top:1px solid #e8e4de;margin-bottom:1rem;">${items}</table>
      <div style="border-top:1px solid #e8e4de;padding-top:1rem;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#6b6560;">Envío</span>
          <span>${pedido.moneda} ${pedido.costoEnvio}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:1.1rem;margin-top:.5rem;">
          <strong>Total</strong>
          <strong style="color:#b84a1e;">${pedido.moneda} ${pedido.total}</strong>
        </div>
      </div>
      <p style="color:#6b6560;margin-top:1.5rem;font-size:.85rem;">
        Te avisamos cuando tu pedido esté en camino. Cualquier consulta escribinos a 
        <a href="mailto:santiornaghi@gmail.com" style="color:#b84a1e;">santiornaghi@gmail.com</a>
      </p>
    `),
  })
}

export async function emailPedidoEnviado(pedido) {
  await resend.emails.send({
    from: FROM,
    to:   pedido.clienteEmail,
    subject: `Nayart — Tu pedido #${pedido.numero} está en camino`,
    html: emailBase(`
      <h2 style="font-family:Georgia,serif;font-weight:300;font-size:1.6rem;margin-bottom:1rem;">
        Tu pedido está en camino 📦
      </h2>
      <p style="color:#6b6560;line-height:1.7;">
        Hola ${pedido.clienteNombre}, tu pedido fue despachado.
      </p>
      ${pedido.trackingNumero ? `
        <div style="background:#f5f2ed;padding:1rem;margin:1.5rem 0;">
          <div style="font-size:.75rem;letter-spacing:.15em;text-transform:uppercase;color:#b0aba3;margin-bottom:.3rem;">
            Número de seguimiento
          </div>
          <div style="font-size:1.1rem;font-weight:500;">${pedido.trackingNumero}</div>
        </div>
      ` : ''}
      <p style="color:#6b6560;font-size:.85rem;">
        Ante cualquier consulta respondé este email o escribinos al 
        <a href="https://wa.me/5493584390961" style="color:#b84a1e;">WhatsApp</a>.
      </p>
    `),
  })
}

export async function emailEntregaDigital(pedido, urlDescarga) {
  await resend.emails.send({
    from: FROM,
    to:   pedido.clienteEmail,
    subject: `Nayart — Tu descarga está lista`,
    html: emailBase(`
      <h2 style="font-family:Georgia,serif;font-weight:300;font-size:1.6rem;margin-bottom:1rem;">
        Tu descarga está lista
      </h2>
      <p style="color:#6b6560;line-height:1.7;margin-bottom:1.5rem;">
        Hola ${pedido.clienteNombre}, gracias por tu compra. 
        Tu archivo estará disponible por las próximas <strong>24 horas</strong>.
      </p>
      <a href="${urlDescarga}" 
         style="display:inline-block;background:#b84a1e;color:#fff;
                padding:12px 28px;text-decoration:none;
                font-size:.8rem;letter-spacing:.15em;text-transform:uppercase;">
        Descargar ahora →
      </a>
      <p style="color:#b0aba3;margin-top:1.5rem;font-size:.8rem;">
        Si el link expiró, respondé este email y te enviamos uno nuevo.
      </p>
    `),
  })
}

// ── EMAIL AL ADMIN ─────────────────────────────────────────

export async function emailNuevoEncargo(encargo) {
  await resend.emails.send({
    from: FROM,
    to:   process.env.EMAIL_ADMIN,
    subject: `Nayart — Nuevo encargo de ${encargo.nombre}`,
    html: emailBase(`
      <h2 style="font-family:Georgia,serif;font-weight:300;font-size:1.4rem;margin-bottom:1rem;">
        Nuevo encargo recibido
      </h2>
      <table style="width:100%;">
        <tr><td style="color:#b0aba3;padding:4px 0;width:120px;">Nombre</td><td>${encargo.nombre}</td></tr>
        <tr><td style="color:#b0aba3;padding:4px 0;">Email</td><td>${encargo.email}</td></tr>
        <tr><td style="color:#b0aba3;padding:4px 0;">Teléfono</td><td>${encargo.telefono || '—'}</td></tr>
        <tr><td style="color:#b0aba3;padding:4px 0;">Tipo</td><td>${encargo.tipo}</td></tr>
      </table>
      <div style="background:#f5f2ed;padding:1rem;margin-top:1rem;">
        <p style="color:#1a1814;line-height:1.7;">${encargo.mensaje}</p>
      </div>
    `),
  })
}

// ── TEMPLATE BASE ──────────────────────────────────────────
function emailBase(content) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#f5f2ed;margin:0;padding:2rem;font-family:'Helvetica Neue',sans-serif;font-weight:300;">
  <div style="max-width:520px;margin:0 auto;background:#faf8f5;padding:2.5rem;">
    <div style="border-bottom:1px solid #e8e4de;padding-bottom:1.5rem;margin-bottom:1.5rem;">
      <span style="font-family:Georgia,serif;font-size:1.4rem;letter-spacing:.2em;text-transform:uppercase;">NAYA</span>
    </div>
    ${content}
    <div style="border-top:1px solid #e8e4de;margin-top:2rem;padding-top:1rem;">
      <p style="color:#b0aba3;font-size:.75rem;line-height:1.6;">
        Río Cuarto, Córdoba, Argentina<br>
        <a href="https://instagram.com/naya__artt" style="color:#b84a1e;">@naya__artt</a>
      </p>
    </div>
  </div>
</body>
</html>`
}
