import { FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
} from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const useMocks = process.env.EXPO_PUBLIC_USE_MOCKS === 'true';

export const firebaseConfigIssues = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const isFirebaseConfigured = firebaseConfigIssues.length === 0;

const app = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

// Firebase's default browser persistence probes IndexedDB first. Some iOS Safari
// sessions can leave that probe pending indefinitely (notably after storage was
// cleared or in restricted/private storage contexts), which also prevents the
// first onAuthStateChanged callback. localStorage is sufficient for this app and
// the ordered fallbacks keep restricted WebKit sessions usable.
function initializeWebAuth(): Auth | null {
  if (!app) {
    return null;
  }

  try {
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
    });
  } catch {
    // Expo fast refresh can evaluate this module after Auth is already registered.
    return getAuth(app);
  }
}

export const firebaseAuth: Auth | null = app
  ? Platform.OS === 'web'
    ? initializeWebAuth()
    : getAuth(app)
  : null;
export const firestoreDb: Firestore | null = app ? getFirestore(app) : null;

export function requireAuth(): Auth {
  if (!firebaseAuth) {
    throw new Error('Firebase Auth is not configured.');
  }
  return firebaseAuth;
}

export function requireDb(): Firestore {
  if (!firestoreDb) {
    throw new Error('Firestore is not configured.');
  }
  return firestoreDb;
}
