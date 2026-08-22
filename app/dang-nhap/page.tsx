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
      // 1. Đăng nhập Supabase
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
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

      // 2. Lấy quyền tài khoản từ profiles
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Profile error:", profileError);

        // Không để tài khoản đăng nhập nhưng không xác định được quyền.
        await supabase.auth.signOut();

        setError(
          "Đăng nhập thành công nhưng không xác định được quyền tài khoản. Vui lòng kiểm tra hồ sơ tài khoản."
        );
        return;
      }

      // 3. BTC → trang BTC
      if (profile?.role === "btc") {
        window.location.replace("/btc");
        return;
      }

      // 4. Tài khoản khác → trang kho sinh viên
      window.location.replace("/kho");
    } catch (err) {
      console.error("Login error:", err);
      setError("Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-lg">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Đăng nhập
        </h1>

        <p className="mb-6 text-sm text-gray-500">
          Đăng nhập bằng tài khoản BTC hoặc tài khoản người dùng.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-gray-900"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-gray-900"
            >
              Mật khẩu
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500 disabled:bg-gray-100"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-600"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </main>
  );
}
