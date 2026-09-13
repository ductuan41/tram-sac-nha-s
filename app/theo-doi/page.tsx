"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Be_Vietnam_Pro } from "next/font/google";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

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
  if (status === "APPROVED") return "Đã xác nhận";
  return "Chờ duyệt";
}

function statusClass(status: string) {
  if (status === "DELIVERED") return "bg-sky-50 text-sky-700 ring-sky-200";
  if (status === "CANCELLED") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "APPROVED")
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function RequestProgress({ status }: { status: string }) {
  if (status === "CANCELLED") {
    return (
      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="font-bold text-rose-700">Phiếu đăng ký đã được hủy</p>
        <p className="mt-1 text-sm text-rose-600">
          Vật phẩm không còn được xử lý theo phiếu này.
        </p>
      </div>
    );
  }

  const currentStep =
    status === "DELIVERED" ? 3 : status === "APPROVED" ? 2 : 1;
  const steps = ["Đã gửi đăng ký", "BTC đã xác nhận", "Đã giao"];

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-4 text-sm font-bold text-slate-700">Tiến trình phiếu</p>
      <div className="grid grid-cols-3 gap-2">
        {steps.map((step, index) => {
          const completed = index + 1 <= currentStep;
          return (
            <div key={step} className="relative text-center">
              {index < steps.length - 1 && (
                <span
                  className={`absolute left-1/2 top-3 h-0.5 w-full ${index + 1 < currentStep ? "bg-emerald-500" : "bg-slate-200"}`}
                />
              )}
              <span
                className={`relative mx-auto grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${completed ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}
              >
                {completed ? "✓" : index + 1}
              </span>
              <p
                className={`mt-2 text-xs font-semibold leading-4 ${completed ? "text-emerald-700" : "text-slate-400"}`}
              >
                {step}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
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
        },
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
    <main
      className={`${beVietnamPro.className} min-h-screen bg-[#f5f8f6] px-4 py-8 text-slate-800 sm:px-6 lg:px-8`}
    >
      <div className="mx-auto max-w-3xl">
        <a
          href="/kho"
          className="text-sm font-bold text-emerald-700 hover:underline"
        >
          ← Quay lại Kho đồ
        </a>

        <div className="mt-5 overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-500 p-6 text-white shadow-xl shadow-emerald-900/10 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">
            Trạm sạc nhà S
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Theo dõi đăng ký
          </h1>
          <p className="mt-3 text-emerald-50">
            Nhập đúng họ tên và số điện thoại bạn đã dùng khi đăng ký.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block font-bold text-white">Họ và tên</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full rounded-xl border border-white/30 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-200 focus:ring-4 focus:ring-white/20"
              />
            </label>

            <label className="block">
              <span className="mb-2 block font-bold text-white">
                Số điện thoại
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xxxxxxxx"
                inputMode="tel"
                className="w-full rounded-xl border border-white/30 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-200 focus:ring-4 focus:ring-white/20"
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
            className="mt-5 w-full rounded-xl bg-slate-950 py-4 text-base font-extrabold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Đang tra cứu..." : "Tra cứu đăng ký"}
          </button>
        </div>

        {searched && requests.length === 0 && (
          <div className="mt-6 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
            <p className="text-lg font-black text-slate-900">
              Không tìm thấy phiếu đăng ký
            </p>
            <p className="mt-2 text-slate-600">
              Hãy kiểm tra lại họ tên và số điện thoại đã nhập.
            </p>
          </div>
        )}

        {requests.length > 0 && (
          <section className="mt-6 space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
              <p className="font-extrabold text-slate-900">
                Tìm thấy {requests.length} phiếu
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Thông tin được cập nhật theo trạng thái BTC xử lý.
              </p>
            </div>

            {requests.map((request) => (
              <article
                key={request.request_id}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80"
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:p-6">
                  {request.item_image_url ? (
                    <img
                      src={request.item_image_url}
                      alt={request.item_name || "Sản phẩm"}
                      className="h-24 w-full rounded-xl object-cover sm:h-24 sm:w-24 sm:shrink-0"
                    />
                  ) : (
                    <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl bg-slate-100 text-3xl sm:w-24">
                      📦
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-emerald-700">
                          {request.item_code || ""}
                        </p>
                        <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                          {request.item_name || "Không rõ sản phẩm"}
                        </h2>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${statusClass(request.status)}`}
                      >
                        {statusLabel(request.status)}
                      </span>
                    </div>

                    <RequestProgress status={request.status} />

                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      {request.delivery_method === "SHIP" ? (
                        <>
                          <p className="font-black text-slate-900">
                            🚚 Ship hàng
                          </p>
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
                          <p className="font-black text-slate-900">
                            🏠 Đến lấy trực tiếp
                          </p>
                          <p className="mt-2 text-slate-700">
                            <span className="font-bold">Nơi lấy:</span>{" "}
                            {request.pickup_location || "Chưa có"}
                          </p>
                          <p className="mt-2 text-slate-700">
                            <span className="font-bold">Ngày:</span>{" "}
                            {request.pickup_date
                              ? new Date(
                                  `${request.pickup_date}T00:00:00`,
                                ).toLocaleDateString("vi-VN")
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
                    {request.created_at && (
                      <p className="mt-1 text-xs text-slate-400">
                        Đăng ký lúc:{" "}
                        {new Date(request.created_at).toLocaleString("vi-VN")}
                      </p>
                    )}
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
