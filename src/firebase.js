// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc 
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCTTnt_7Sl7vzq04wkLhlKeGWKJ7bOgOrU",
  authDomain: "watchful-idea-473105-n3.firebaseapp.com",
  projectId: "watchful-idea-473105-n3",
  storageBucket: "watchful-idea-473105-n3.firebasestorage.app",
  messagingSenderId: "29118284465",
  appId: "1:29118284465:web:51549a65c073e97a8c5890",
  measurementId: "G-RG1G9RLW15"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get a reference to the database service
export const db = getFirestore(app);

// Get a reference to the auth service
export const auth = getAuth(app);

// Firestore helper functions
export const getDocument = async (coll, id) => {
  const docRef = doc(db, coll, id);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
};

export const saveDocument = async (coll, id, data) => {
  const docRef = doc(db, coll, id);
  await setDoc(docRef, data, { merge: true });
};

export const getCollection = async (coll, field, operator, value) => {
  const q = field ? query(collection(db, coll), where(field, operator, value)) : collection(db, coll);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const removeDocument = async (coll, id) => {
  await deleteDoc(doc(db, coll, id));
};
