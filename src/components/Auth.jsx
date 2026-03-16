
import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import Login from './Login';
import App from '../App';

const Auth = () => {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsInitializing(false);
    });

    return () => unsubscribe();
  }, [auth]);

  // Firebase 초기 인증 상태를 확인 중일 때는 아무것도 렌더링하지 않거나
  // 아주 짧은 로딩 표시를 할 수 있습니다. (여기서는 바로 로딩화면으로 이어지도록 처리)
  if (isInitializing) {
    return (
      <div className="loading-screen">
        <div className="loader-container">
          <div className="loader-spinner"></div>
          <div className="loader-text">인증 상태를 확인 중입니다...</div>
        </div>
      </div>
    );
  }

  return user ? <App user={user} /> : <Login />;
};

export default Auth;
