import React from 'react';
import ReactDOM from 'react-dom/client';
import Auth from './components/Auth'; // App 대신 Auth를 임포트합니다.
import './index.css';
import './firebase'; // Firebase 구성 임포트

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Auth /> {/* 앱의 진입점을 Auth 컴포넌트로 변경합니다. */}
  </React.StrictMode>,
);
