import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth";

export const LoginPage = () => {
  const { token, login, registerAndLogin } = useAuth();
  const [name, setName] = useState("Demo User");
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("secret1234");
  const [mode, setMode] = useState<"login" | "register">("register");
  const [error, setError] = useState<string | null>(null);

  if (token) return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (mode === "register") {
        await registerAndLogin(name, email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 p-4">
      <form className="card w-full max-w-md bg-base-100 p-6 shadow" onSubmit={onSubmit}>
        <h2 className="mb-4 text-2xl font-semibold">{mode === "register" ? "Register" : "Login"}</h2>
        {mode === "register" && (
          <label className="form-control mb-2" htmlFor="register-name">
            <span className="label-text">Name</span>
            <input
              id="register-name"
              className="input input-bordered"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
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
        <button
          type="button"
          className="btn btn-link mt-2"
          onClick={() => setMode(mode === "register" ? "login" : "register")}
        >
          {mode === "register" ? "Already have account? Login" : "Need account? Register"}
        </button>
      </form>
    </div>
  );
};
