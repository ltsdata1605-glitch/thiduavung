import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentSingleTabManager, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

const metaEnv = (import.meta as any).env || {};

// Default Firebase Configuration (Synced with project 3717-THIDUA)
const defaultFirebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || "AIzaSyDemoConfigKeyForLocalTesting123456",
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "3717-thidua.firebaseapp.com",
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || "3717-thidua",
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || "3717-thidua.appspot.com",
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: metaEnv.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef123456"
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

try {
  if (!getApps().length) {
    app = initializeApp(defaultFirebaseConfig);
  } else {
    app = getApps()[0];
  }
  // Persistent IndexedDB-backed local cache: Firestore itself now caches
  // every document/chunk it has ever seen, so on a REPEAT visit (same
  // browser) every onSnapshot listener resolves its first snapshot from disk
  // in a few ms instead of waiting on a network round trip.
  // We use persistentSingleTabManager instead of persistentMultipleTabManager
  // to avoid severe Web Lock API deadlocks on iOS Safari / WebKit mobile browsers
  // which caused login and document queries to hang indefinitely.
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
    });
  } catch (cacheError) {
    db = getFirestore(app);
  }
  auth = getAuth(app);
} catch (error) {
  console.warn('Firebase initialization warning (using local fallback mode):', error);
}

export { app, db, auth };

export const reinitializeFirebase = (config: typeof defaultFirebaseConfig) => {
  try {
    app = initializeApp(config, 'customApp');
    db = getFirestore(app);
    auth = getAuth(app);
    return { app, db, auth, success: true };
  } catch (error) {
    console.error('Failed to reinitialize Firebase:', error);
    return { app: null, db: null, auth: null, success: false, error };
  }
};

/**
 * A second, independent Firebase App instance used only when an
 * already-logged-in admin provisions a brand-new account.
 * createUserWithEmailAndPassword() on the PRIMARY auth instance silently
 * swaps the browser's "current user" to the newly created account, which
 * would kick the admin out of their own session — this keeps that call
 * fully isolated from the admin's real session.
 */
export function getSecondaryAuth(): Auth | null {
  try {
    const existing = getApps().find((a) => a.name === 'adminCreateApp');
    const secondaryApp = existing || initializeApp(defaultFirebaseConfig, 'adminCreateApp');
    return getAuth(secondaryApp);
  } catch (error) {
    console.error('Failed to init secondary auth app:', error);
    return null;
  }
}
