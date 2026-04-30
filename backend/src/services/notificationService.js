// src/services/notificationService.js
const { firestore } = require('../config/firestore');
const { v4: uuidv4 } = require('uuid');

async function sendEmailAlert({ user, search, priceData, analysis, message }) {
  const { price, airline, stops, departure_datetime, deep_link } = priceData;
  const { opportunity } = analysis;

  const formattedPrice = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const stopsText      = stops === 0 ? 'Voo direto' : `${stops} escala${stops > 1 ? 's' : ''}`;
  const departureDate  = departure_datetime
    ? new Date(departure_datetime).toLocaleDateString('pt-BR', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';

  const html = buildEmailHTML({ user, search, formattedPrice, airline, stopsText, departureDate, message, deep_link, opportunity });

  try {
    const { Resend } = require('resend');
    const resend     = new Resend(process.env.RESEND_API_KEY);

    const result = await resend.emails.send({
      from:    process.env.EMAIL_FROM || 'Radar de Passagens <alertas@radarpassagens.com.br>',
      to:      user.email,
      subject: `🔥 ${formattedPrice} · ${search.origin} → ${search.destination_label || search.destination}`,
      html,
    });

    console.log(`📧 Email enviado para ${user.email}:`, result.id);
    return { success: true, id: result.id };
  } catch (err) {
    console.log(`📧 [DEV] Email que seria enviado para ${user.email}:`);
    console.log(`   Assunto: 🔥 ${formattedPrice} · ${search.origin} → ${search.destination_label || search.destination}`);
    console.log(`   Mensagem: ${message}`);
    return { success: true, id: 'dev-mock-' + Date.now() };
  }
}

async function recordAlertSent({ searchId, userId, priceHistoryId, alertType, triggerValue, message, channel = 'email' }) {
  const id = uuidv4();
  await firestore.collection('alerts_sent').doc(id).set({
    search_id:        searchId,
    user_id:          userId,
    price_history_id: priceHistoryId,
    alert_type:       alertType,
    trigger_value:    triggerValue,
    message,
    channel,
    sent_at:          new Date().toISOString(),
  });
  return id;
}

function buildEmailHTML({ user, search, formattedPrice, airline, stopsText, departureDate, message, deep_link, opportunity }) {
  const severityColor = { high: '#ef4444', medium: '#f97316', low: '#3b82f6' }[opportunity?.severity] || '#3b82f6';

  const htmlMessage = message
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" style="color:#3b82f6">$1</a>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
      <tr><td style="background:linear-gradient(135deg,#1e293b,#334155);padding:32px;text-align:center">
        <p style="color:#94a3b8;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px">Radar de Passagens</p>
        <h1 style="color:#fff;font-size:28px;margin:0">${formattedPrice}</h1>
        <p style="color:#94a3b8;font-size:16px;margin:8px 0 0">${search.origin} → ${search.destination_label || search.destination}</p>
      </td></tr>
      <tr><td style="padding:0 32px">
        <div style="background:${severityColor};padding:10px 20px;text-align:center">
          <span style="color:#fff;font-size:13px;font-weight:600;text-transform:uppercase">${opportunity?.label || 'Oportunidade detectada'}</span>
        </div>
      </td></tr>
      <tr><td style="padding:32px">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="text-align:center;padding:16px;background:#f8fafc;border-radius:12px">
            <p style="color:#64748b;font-size:12px;margin:0 0 4px;text-transform:uppercase">Companhia</p>
            <p style="color:#1e293b;font-size:18px;font-weight:700;margin:0">${airline}</p>
          </td><td width="16"></td>
          <td style="text-align:center;padding:16px;background:#f8fafc;border-radius:12px">
            <p style="color:#64748b;font-size:12px;margin:0 0 4px;text-transform:uppercase">Tipo</p>
            <p style="color:#1e293b;font-size:18px;font-weight:700;margin:0">${stopsText}</p>
          </td><td width="16"></td>
          <td style="text-align:center;padding:16px;background:#f8fafc;border-radius:12px">
            <p style="color:#64748b;font-size:12px;margin:0 0 4px;text-transform:uppercase">Partida</p>
            <p style="color:#1e293b;font-size:14px;font-weight:700;margin:0">${departureDate}</p>
          </td>
        </tr></table>
        <div style="margin:24px 0;padding:20px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px">
          <p style="color:#1e40af;font-size:15px;line-height:1.6;margin:0">${htmlMessage}</p>
        </div>
        <div style="text-align:center;margin-top:24px">
          <a href="${deep_link}" style="display:inline-block;background:#3b82f6;color:#fff;padding:16px 40px;border-radius:10px;font-size:16px;font-weight:700;text-decoration:none">Ver Passagem Agora →</a>
        </div>
      </td></tr>
      <tr><td style="padding:24px 32px;border-top:1px solid #e2e8f0;text-align:center">
        <p style="color:#94a3b8;font-size:12px;margin:0">Radar de Passagens · <a href="#" style="color:#94a3b8">Cancelar alertas</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

module.exports = { sendEmailAlert, recordAlertSent };
