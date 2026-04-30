// src/middleware/firebaseAuth.js
const admin = require('firebase-admin');

// O Firebase Admin já foi inicializado em config/firestore.js
// Aqui apenas usamos o auth
async function requireFirebaseAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decoded      = await admin.auth().verifyIdToken(token);
    req.firebaseUid    = decoded.uid;
    req.firebaseEmail  = decoded.email;
    next();
  } catch (err) {
    console.error('Token Firebase inválido:', err.message);
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = { requireFirebaseAuth };
