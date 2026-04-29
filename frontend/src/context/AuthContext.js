// src/context/AuthContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = carregando
  const [dbUser, setDbUser]             = useState(null);       // usuário no nosso banco
  const [authError, setAuthError]       = useState(null);

  // Observa mudanças de sessão do Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await syncUserWithBackend(fbUser);
      } else {
        setDbUser(null);
      }
    });
    return unsubscribe;
  }, []);

  // Garante que o usuário Firebase existe no nosso banco SQLite
  async function syncUserWithBackend(fbUser) {
    try {
      const token = await fbUser.getIdToken();
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name:  fbUser.displayName || fbUser.email.split('@')[0],
          email: fbUser.email,
        }),
      });

      if (!res.ok) throw new Error('Falha ao sincronizar usuário');
      const user = await res.json();
      setDbUser(user);
    } catch (err) {
      console.error('Erro ao sincronizar com backend:', err);
      setAuthError('Erro ao conectar com o servidor.');
    }
  }

  // Retorna o token JWT do Firebase para uso nas requisições
  async function getToken() {
    if (!firebaseUser) return null;
    return firebaseUser.getIdToken();
  }

  // ---- Métodos de autenticação ----

  async function loginWithEmail(email, password) {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError(friendlyError(err.code));
      throw err;
    }
  }

  async function registerWithEmail(name, email, password) {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      // Força re-sync com o nome atualizado
      await syncUserWithBackend({ ...cred.user, displayName: name });
    } catch (err) {
      setAuthError(friendlyError(err.code));
      throw err;
    }
  }

  async function loginWithGoogle() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setAuthError(friendlyError(err.code));
      }
      throw err;
    }
  }

  async function logout() {
    await signOut(auth);
    setDbUser(null);
  }

  function friendlyError(code) {
    const messages = {
      'auth/user-not-found':       'Email não encontrado.',
      'auth/wrong-password':       'Senha incorreta.',
      'auth/email-already-in-use': 'Este email já está cadastrado.',
      'auth/weak-password':        'Senha muito fraca. Use ao menos 6 caracteres.',
      'auth/invalid-email':        'Email inválido.',
      'auth/too-many-requests':    'Muitas tentativas. Tente novamente em alguns minutos.',
      'auth/invalid-credential':   'Email ou senha incorretos.',
      'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
    };
    return messages[code] || 'Ocorreu um erro. Tente novamente.';
  }

  const value = {
    firebaseUser,
    dbUser,
    authError,
    setAuthError,
    getToken,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    logout,
    isLoading: firebaseUser === undefined,
    isAuthenticated: !!firebaseUser && !!dbUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
