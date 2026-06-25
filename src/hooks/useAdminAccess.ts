import { FormEvent, useState } from 'react';
import { useApp } from '../context/AppContext';

export function useAdminAccess(successMessage: string, connectionErrorMessage: string) {
  const { notify, loginAdmin } = useApp();
  const [password, setPassword] = useState('');

  const unlockAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; token?: string; expiresAt?: string };

      if (!response.ok || !result.ok || !result.token) {
        notify('error', result.message || '后台口令不正确');
        return null;
      }

      loginAdmin(result.token, result.expiresAt);
      setPassword('');
      notify('success', successMessage);
      return { token: result.token, expiresAt: result.expiresAt };
    } catch {
      notify('error', connectionErrorMessage);
      return null;
    }
  };

  return {
    password,
    setPassword,
    unlockAdmin
  };
}
