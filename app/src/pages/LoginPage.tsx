import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth";

export const LoginPage = () => {
  const { token, login } = useAuth();
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("secret1234");
  const [error, setError] = useState<string | null>(null);

  if (token) return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 p-4">
      <form className="card w-full max-w-md bg-base-100 p-6 shadow" onSubmit={onSubmit}>
        <h2 className="mb-4 text-2xl font-semibold">Login</h2>
        <label className="form-control mb-2" htmlFor="login-email">
          <span className="label-text">Email</span>
          <input
            id="login-email"
            className="input input-bordered"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="form-control mb-4" htmlFor="login-password">
          <span className="label-text">Password</span>
          <input
            id="login-password"
            className="input input-bordered"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="mb-4 text-sm text-error">{error}</div>}
        <button className="btn btn-primary">Continue</button>
      </form>
    </div>
  );
};
