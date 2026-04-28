// src/middleware/auth.js

/**
 * Middleware de autenticação por API Key (admin)
 * Para rotas que não devem ser acessíveis publicamente
 */
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];

  if (!process.env.ADMIN_API_KEY) {
    // Sem chave configurada: bloqueia em produção, permite em dev
    if (process.env.NODE_ENV === 'production') {
      return res.status(500).json({ error: 'ADMIN_API_KEY não configurada no servidor' });
    }
    console.warn('⚠️  ADMIN_API_KEY não definida — rota admin liberada (somente dev)');
    return next();
  }

  if (key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Não autorizado: x-api-key inválida ou ausente' });
  }

  next();
}

module.exports = { requireApiKey };
