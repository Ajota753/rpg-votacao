"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (error) {
      setError("Login inválido!");
      return;
    }

    const user = data.user;

    await supabase.from("online_users").upsert({
      user_id: user.id,
      last_seen: new Date(),
    });

    window.location.href = "/espera";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Login</h1>

        {error && <p className="text-red-400 mb-2">{error}</p>}

        <input
          className="w-full p-3 rounded bg-gray-800 mb-3"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full p-3 rounded bg-gray-800 mb-6"
          type="password"
          placeholder="Senha"
          onChange={(e) => setPass(e.target.value)}
        />

        <button
          onClick={handleLogin}
          className="bg-blue-600 w-full p-3 rounded hover:bg-blue-700"
        >
          Entrar
        </button>
      </div>
    </div>
  );
}
