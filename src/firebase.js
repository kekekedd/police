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
  enableIndexedDbPersistence,
  terminate,
  clearIndexedDbPersistence
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

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

// [수습책 1] 오프라인 저장소(캐시) 다시 활성화
// 이렇게 해야 서버 연결이 느려도 데이터가 즉시 사라지는 것을 방지할 수 있습니다.
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('다중 탭 경고: 캐시가 한쪽에서만 작동합니다.');
    } else if (err.code === 'unimplemented') {
        console.warn('브라우저 미지원: 캐시를 사용할 수 없습니다.');
    }
});

export const saveDocument = async (coll, id, data) => {
  const docRef = doc(db, coll, id);
  try {
    // [수습책 2] 서버 응답을 기다리지 않고 로컬에 먼저 반영하도록 비동기로 실행
    // 에러 발생 시에만 catch로 잡습니다.
    return setDoc(docRef, data, { merge: true });
  } catch (err) {
    console.error("저장 중 즉각 오류 발생:", err);
    throw err;
  }
};

export const removeDocument = async (coll, id) => {
  await deleteDoc(doc(db, coll, id));
};
