"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type RequestRow = {
  request_id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  item_image_url: string | null;
  status: string;
  delivery_method: "PICKUP" | "SHIP" | null;
  shipping_address: string | null;
  pickup_location: string | null;
  pickup_date: string | null;
  pickup_start_time: string | null;
  pickup_end_time: string | null;
  created_at: string | null;
};

function normalizeTime(value: string | null) {
  if (!value) return "";
  const m = value.match(/^(\\d{2}):(\\d{2})/);
  return m ? `${m[1]}:${m[2]}` : value;
}

function statusLabel(status: string) {
  if (status === "DELIVERED") return "Đã giao";
  if (status === "CANCELLED") return "Đã hủy";
  if (status === "APPROVED") return "Đã duyệt";
  return "Chờ xử lý";
}

function statusClass(status: string) {
  if (status === "DELIVERED") return "bg-blue-50 text-blue-700";
  if (status === "CANCELLED") return "bg-red-50 text-red-700";
  if (status === "APPROVED") return "bg-green-50 text-green-700";
  return "bg-orange-50 text-orange-700";
}

export default function TheoDoiPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  async function searchRequests() {
    setError("");
    setSearched(false);

    if (!fullName.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }
    if (!phone.trim()) {
      setError("Vui lòng nhập số điện thoại.");
      return;
    }

    try {
      setLoading(true);
      const { data, error: rpcError } = await supabase.rpc(
        "get_my_pickup_requests",
        {
          p_full_name: fullName.trim(),
          p_phone: phone.trim(),
        }
      );

      if (rpcError) throw rpcError;
      setRequests((data ?? []) as RequestRow[]);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tra cứu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <a href="/kho" className="text-sm font-bold text-blue-600 hover:underline">
          ← Quay lại Kho đồ
        </a>

        <div className="mt-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-wide text-blue-600">
            Trạm sạc nhà S
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">
            📋 Theo dõi đăng ký
          </h1>
          <p className="mt-3 text-slate-600">
            Nhập đúng họ tên và số điện thoại bạn đã dùng khi đăng ký.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block font-bold text-slate-800">Họ và tên</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block font-bold text-slate-800">Số điện thoại</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xxxxxxxx"
                inputMode="tel"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
              />
            </label>
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 p-4 font-semibold text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={searchRequests}
            disabled={loading}
            className="mt-5 w-full rounded-xl bg-blue-600 py-4 text-lg font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Đang tra cứu..." : "Tra cứu đăng ký"}
          </button>
        </div>

        {searched && requests.length === 0 && (
          <div className="mt-6 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
            <p className="text-lg font-black text-slate-900">Không tìm thấy phiếu đăng ký</p>
            <p className="mt-2 text-slate-600">
              Hãy kiểm tra lại họ tên và số điện thoại đã nhập.
            </p>
          </div>
        )}

        {requests.length > 0 && (
          <section className="mt-6 space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="font-black text-slate-900">Tìm thấy {requests.length} phiếu</p>
              <p className="mt-1 text-sm text-slate-500">
                Thông tin được cập nhật theo trạng thái BTC xử lý.
              </p>
            </div>

            {requests.map((request) => (
              <article
                key={request.request_id}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex gap-4 p-5">
                  {request.item_image_url ? (
                    <img
                      src={request.item_image_url}
                      alt={request.item_name || "Sản phẩm"}
                      className="h-20 w-20 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                      📦
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-blue-600">{request.item_code || ""}</p>
                        <h2 className="mt-1 text-xl font-black text-slate-900">
                          {request.item_name || "Không rõ sản phẩm"}
                        </h2>
                      </div>
                      <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${statusClass(request.status)}`}>
                        {statusLabel(request.status)}
                      </span>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      {request.delivery_method === "SHIP" ? (
                        <>
                          <p className="font-black text-slate-900">🚚 Ship hàng</p>
                          <p className="mt-2 text-slate-700">
                            <span className="font-bold">Địa chỉ nhận:</span>{" "}
                            {request.shipping_address || "Chưa có"}
                          </p>
                          <p className="mt-2 text-sm text-slate-500">
                            BTC sẽ liên hệ để xử lý việc giao hàng.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-black text-slate-900">🏠 Đến lấy trực tiếp</p>
                          <p className="mt-2 text-slate-700">
                            <span className="font-bold">Nơi lấy:</span>{" "}
                            {request.pickup_location || "Chưa có"}
                          </p>
                          <p className="mt-2 text-slate-700">
                            <span className="font-bold">Ngày:</span>{" "}
                            {request.pickup_date
                              ? new Date(`${request.pickup_date}T00:00:00`).toLocaleDateString("vi-VN")
                              : "Chưa có"}
                          </p>
                          <p className="mt-2 text-slate-700">
                            <span className="font-bold">Khung giờ:</span>{" "}
                            {request.pickup_start_time
                              ? `${normalizeTime(request.pickup_start_time)} - ${normalizeTime(request.pickup_end_time)}`
                              : "Chưa có"}
                          </p>
                        </>
                      )}
                    </div>

                    <p className="mt-4 break-all text-xs text-slate-400">
                      Mã phiếu: {request.request_id}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
