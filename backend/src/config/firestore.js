// src/config/firestore.js
const admin = require('firebase-admin');

// Inicializa o Firebase Admin SDK uma única vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const firestore = admin.firestore();

// Helpers para converter Timestamps do Firestore em strings ISO
function toISO(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate().toISOString();
  return value;
}

// Converte um documento Firestore em objeto plano
function docToObj(doc) {
  if (!doc.exists) return null;
  const data = doc.data();
  const result = { id: doc.id };
  for (const [k, v] of Object.entries(data)) {
    result[k] = v?.toDate ? v.toDate().toISOString() : v;
  }
  return result;
}

module.exports = { firestore, docToObj, toISO };
