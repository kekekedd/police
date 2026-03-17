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
  enableIndexedDbPersistence
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  // 환경변수가 없을 경우를 대비해 직접 값을 입력하거나 대체 수단을 확보합니다.
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "", 
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

// 오프라인 캐시 활성화
enableIndexedDbPersistence(db).catch((err) => {
    console.warn("Offline persistence notice:", err.code);
});

export const saveDocument = async (coll, id, data) => {
  const docRef = doc(db, coll, id);
  try {
    // 타임아웃을 제거하여 Firebase가 직접 에러를 던지게 합니다.
    await setDoc(docRef, data, { merge: true });
  } catch (err) {
    console.error("Firebase 상세 에러:", err);
    throw err;
  }
};

export const removeDocument = async (coll, id) => {
  await deleteDoc(doc(db, coll, id));
};
