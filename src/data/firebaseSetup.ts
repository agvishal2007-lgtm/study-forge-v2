import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, initializeAuth, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore/lite';
import { createFirebaseBackend } from './firebaseBackend';

// These values identify the project and are meant to be public. The security rules protect the data.
const app = initializeApp({
  apiKey: 'AIzaSyCbcud9jSPd_yp9dqWivAJaD8yFZkaohOg',
  authDomain: 'study-forge-6c865.firebaseapp.com',
  projectId: 'study-forge-6c865',
  storageBucket: 'study-forge-6c865.firebasestorage.app',
  messagingSenderId: '412333353993',
  appId: '1:412333353993:web:17dd56352d533f63245cd8',
});
const auth = initializeAuth(app, { persistence: browserLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver });

export const backend = createFirebaseBackend(app, auth, getFirestore(app));
