// src/firebase/config.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// Cole aqui as credenciais do seu projeto Firebase
// Firebase Console → Project Settings → Your apps → SDK setup
const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app      = initializeApp(firebaseConfig);
export const auth     = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Força o popup de seleção de conta no Google mesmo que já esteja logado
googleProvider.setCustomParameters({ prompt: 'select_account' });
