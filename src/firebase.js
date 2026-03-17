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
  getDocs
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
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

// [중요] enableIndexedDbPersistence 기능을 삭제했습니다.
// 이제 화면에 보이는 데이터는 무조건 100% 서버에서 실시간으로 가져온 데이터입니다.

export const saveDocument = async (coll, id, data) => {
  const docRef = doc(db, coll, id);
  // 서버 저장 시도 (실패 시 즉시 에러 발생)
  return await setDoc(docRef, data, { merge: true });
};

export const removeDocument = async (coll, id) => {
  await deleteDoc(doc(db, coll, id));
};
