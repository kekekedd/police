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

// API Key를 환경 변수가 아닌 실제 값으로 직접 입력합니다.
// 이렇게 해야 다른 기기에서 별도의 .env 파일 없이도 데이터가 연동됩니다.
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

export const saveDocument = async (coll, id, data) => {
  const docRef = doc(db, coll, id);
  // 서버에 실제 저장이 완료될 때까지 기다립니다.
  return await setDoc(docRef, data, { merge: true });
};

export const removeDocument = async (coll, id) => {
  await deleteDoc(doc(db, coll, id));
};
