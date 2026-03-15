
import React, { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import Login from './Login';
import App from '../App'; // App.jsx를 임포트하여 로그인 후 보여줄 메인 화면으로 사용합니다.

const Auth = () => {
  const [user, setUser] = useState(null);
  const auth = getAuth();

  useEffect(() => {
    // onAuthStateChanged는 인증 상태의 변화를 감지하는 리스너입니다.
    // 사용자가 로그인하거나 로그아웃할 때마다 호출됩니다.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    // 컴포넌트가 언마운트될 때 리스너를 정리합니다.
    return () => unsubscribe();
  }, [auth]);

  // user 상태에 따라 조건부 렌더링
  // user가 있으면 (로그인 상태이면) App 컴포넌트를,
  // user가 없으면 (로그아웃 상태이면) Login 컴포넌트를 보여줍니다.
  return user ? <App /> : <Login />;
};

export default Auth;
