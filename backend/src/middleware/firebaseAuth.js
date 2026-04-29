// src/middleware/firebaseAuth.js
const admin = require('firebase-admin');

// Inicializa o Firebase Admin SDK uma única vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // A chave privada vem do .env com \n literal — precisa converter
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

/**
 * Middleware que valida o token JWT do Firebase.
 * Injeta req.firebaseUid com o UID do usuário autenticado.
 * Uso: router.get('/rota-protegida', requireFirebaseAuth, handler)
 */
async function requireFirebaseAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUid   = decoded.uid;
    req.firebaseEmail = decoded.email;
    next();
  } catch (err) {
    console.error('Token Firebase inválido:', err.message);
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = { requireFirebaseAuth };
