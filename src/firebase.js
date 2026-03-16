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
  updateDoc,
  enableIndexedDbPersistence
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ... (기존 설정 유지)
const firebaseConfig = {
  apiKey: "AIzaSyCTTnt_7Sl7vzq04wkLhlKeGWKJ7bOgOrU",
  authDomain: "watchful-idea-473105-n3.firebaseapp.com",
  projectId: "watchful-idea-473105-n3",
  storageBucket: "watchful-idea-473105-n3.firebasestorage.app",
  messagingSenderId: "29118284465",
  appId: "1:29118284465:web:51549a65c073e97a8c5890",
  measurementId: "G-RG1G9RLW15"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// 오프라인 데이터 지속성 활성화
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('다중 탭이 열려 있어 캐시를 활성화할 수 없습니다.');
    } else if (err.code === 'unimplemented') {
        console.warn('현재 브라우저가 오프라인 캐시를 지원하지 않습니다.');
    }
});

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
