
import { useState } from 'react';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail 
} from "firebase/auth";

// 스타일을 위한 간단한 객체
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#f0f2f5',
    fontFamily: "'Pretendard', sans-serif",
  },
  formContainer: {
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    borderRadius: '12px',
    backgroundColor: 'white',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  title: {
    marginBottom: '24px',
    color: '#1a237e',
    fontSize: '1.8rem',
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    padding: '12px',
    marginBottom: '16px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    boxSizing: 'border-box',
    fontSize: '1rem',
  },
  button: {
    width: '100%',
    padding: '12px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#1a237e',
    color: 'white',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
    marginBottom: '16px',
    transition: 'background-color 0.2s',
  },
  toggleButton: {
    background: 'none',
    border: 'none',
    color: '#1a237e',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: '0.9rem',
    marginTop: '8px',
  },
  error: {
    color: '#d32f2f',
    marginTop: '12px',
    fontSize: '0.85rem',
    backgroundColor: '#ffebee',
    padding: '8px',
    borderRadius: '4px',
    wordBreak: 'keep-all',
  },
  success: {
    color: '#2e7d32',
    marginTop: '12px',
    fontSize: '0.85rem',
    backgroundColor: '#e8f5e9',
    padding: '8px',
    borderRadius: '4px',
  }
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [isLogin, setIsLogin] = useState(true);
  const auth = getAuth();

  const getKoreanErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/user-not-found':
        return '등록되지 않은 이메일입니다.';
      case 'auth/wrong-password':
        return '비밀번호가 틀렸습니다.';
      case 'auth/invalid-email':
        return '유효하지 않은 이메일 형식입니다.';
      case 'auth/weak-password':
        return '비밀번호는 6자 이상이어야 합니다.';
      case 'auth/email-already-in-use':
        return '이미 사용 중인 이메일입니다.';
      case 'auth/invalid-credential':
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
      case 'auth/too-many-requests':
        return '너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.';
      default:
        return `오류가 발생했습니다: ${errorCode}`;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!isLogin && password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error(err);
      setError(getKoreanErrorMessage(err.code));
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('비밀번호를 재설정할 이메일을 입력해주세요.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('비밀번호 재설정 이메일을 보냈습니다. 이메일을 확인해주세요.');
      setError(null);
    } catch (err) {
      setError(getKoreanErrorMessage(err.code));
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.formContainer}>
        <h2 style={styles.title}>{isLogin ? '로그인' : '회원가입'}</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 주소"
            required
            style={styles.input}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            required
            style={styles.input}
          />
          {!isLogin && (
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 확인"
              required
              style={styles.input}
            />
          )}
          <button type="submit" style={styles.button}>
            {isLogin ? '로그인' : '회원가입'}
          </button>
        </form>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={() => { setIsLogin(!isLogin); setError(null); setMessage(null); }} style={styles.toggleButton}>
            {isLogin ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
          
          {isLogin && (
            <button onClick={handleResetPassword} style={styles.toggleButton}>
              비밀번호를 잊으셨나요?
            </button>
          )}
        </div>

        {error && <p style={styles.error}>{error}</p>}
        {message && <p style={styles.success}>{message}</p>}
      </div>
    </div>
  );
};

export default Login;
