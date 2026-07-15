import { FormEvent, ReactNode, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { loginUserRequest } from '../../lib/apiClient';

export function AdminAccessGate({ children }: { children: ReactNode }) {
  const { authReady, userSession, isAdmin, loginUser, logoutUser } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setErrorMessage('');
    try {
      const session = await loginUserRequest(username, password);
      loginUser(session);
    } catch {
      setErrorMessage('登录失败，请检查用户名和密码后重试');
    } finally {
      setPassword('');
      setSubmitting(false);
    }
  };

  if (!authReady) {
    return (
      <section className="admin-layout">
        <div className="unlock-panel" role="status">
          正在确认登录状态
        </div>
      </section>
    );
  }

  if (!userSession) {
    return (
      <section className="admin-layout">
        <form className="unlock-panel" onSubmit={submitLogin}>
          <p className="eyebrow">Admin</p>
          <h1>管理员登录</h1>
          <label>
            用户名
            <input
              autoComplete="username"
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {errorMessage ? <p role="alert">{errorMessage}</p> : null}
          <button disabled={submitting} type="submit">
            {submitting ? '登录中...' : '登录'}
          </button>
        </form>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="admin-layout">
        <div className="unlock-panel">
          <h1>当前账号没有管理员权限</h1>
          <button onClick={() => void logoutUser().catch(() => undefined)} type="button">
            退出登录
          </button>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
