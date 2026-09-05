"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DangNhapPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        setError(
          loginError.message === "Invalid login credentials"
            ? "Email hoặc mật khẩu không đúng."
            : loginError.message
        );
        return;
      }

      const user = data.user;
      if (!user) {
        setError("Không lấy được thông tin tài khoản sau khi đăng nhập.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        await supabase.auth.signOut();
        setError("Không xác định được quyền tài khoản. Vui lòng kiểm tra profile.");
        return;
      }

      if (profile?.role === "admin") {
        window.location.replace("/admin");
        return;
      }

      if (profile?.role === "btc") {
        window.location.replace("/btc");
        return;
      }

      window.location.replace("/kho");
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err?.message || "Có lỗi xảy ra khi đăng nhập.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-lg">
        <p className="mb-2 font-bold text-blue-600">TRẠM SẠC NHÀ S</p>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Đăng nhập</h1>
        <p className="mb-6 text-sm text-gray-500">
          Tài khoản Admin tổng và BTC sẽ tự được đưa tới đúng trang quản trị.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-900">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-900">Mật khẩu</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500 disabled:bg-gray-100"
            />
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </main>
  );
}
