// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyBwLtoQhKKurkhNHwFdEm0Ho3AU7czEuRU",
    authDomain: "nexushealth-5acb3.firebaseapp.com",
    projectId: "nexushealth-5acb3",
    storageBucket: "nexushealth-5acb3.firebasestorage.app",
    messagingSenderId: "649211121394",
    appId: "1:649211121394:web:f2881e9d1da48f184f4a6b"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore Database ONLY
export const db = getFirestore(app);