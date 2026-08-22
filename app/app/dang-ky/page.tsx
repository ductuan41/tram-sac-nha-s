"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RequestRow = {
  id: string;
  item_id: string;
  receiver_id: string | null;
  status: string;
  pickup_date: string | null;
  created_at: string | null;
  student_name: string | null;
  phone: string | null;
  pickup_location: string | null;
  full_name: string | null;

  item?: {
    item_code: string | null;
    name: string | null;
  } | null;
};

export default function DangKyPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    try {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("requests")
        .select(`
          id,
          item_id,
          receiver_id,
          status,
          pickup_date,
          created_at,
          student_name,
          phone,
          pickup_location,
          full_name,
          items:item_id (
            item_code,
            name
          )
        `)
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        throw new Error(error.message);
      }

      const formatted = (data ?? []).map((row: any) => ({
        ...row,
        item: Array.isArray(row.items)
          ? row.items[0] ?? null
          : row.items ?? null,
      }));

      setRequests(formatted);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải danh sách đăng ký."
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateRequest(
    request: RequestRow,
    newStatus: string
  ) {
    try {
      setUpdatingId(request.id);
      setError("");

      const { error: requestError } = await supabase
        .from("requests")
        .update({
          status: newStatus,
        })
        .eq("id", request.id);

      if (requestError) {
        throw new Error(requestError.message);
      }

      /*
       * Khi duyệt:
       * chuyển món đồ thành đã có người nhận.
       *
       * Không đụng vào item nếu hủy.
       */
      if (newStatus === "APPROVED") {
        const { error: itemError } = await supabase
          .from("items")
          .update({
            status: "TAKEN",
            holder_id: request.receiver_id,
            held_at: new Date().toISOString(),
          })
          .eq("id", request.item_id);

        if (itemError) {
          throw new Error(itemError.message);
        }
      }

      await loadRequests();
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật đăng ký."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  function formatDate(date: string | null) {
    if (!date) return "—";

    const parts = date.split("-");

    if (parts.length !== 3) {
      return date;
    }

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function statusLabel(status: string) {
    switch (status) {
      case "APPROVED":
        return "Đã duyệt";

      case "CANCELLED":
        return "Đã hủy";

      case "PENDING":
        return "Chờ duyệt";

      default:
        return status;
    }
  }

  function statusClass(status: string) {
    switch (status) {
      case "APPROVED":
        return "bg-green-100 text-green-700";

      case "CANCELLED":
        return "bg-red-100 text-red-700";

      default:
        return "bg-yellow-100 text-yellow-700";
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
            TRẠM SẠC NHÀ S
          </p>

          <h1 className="mt-2 text-4xl font-bold text-slate-900">
            Quản lý đăng ký nhận đồ
          </h1>

          <p className="mt-3 text-lg text-slate-600">
            BTC xem và xử lý các đăng ký nhận đồ tại đây.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-600">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
            <p className="text-lg text-slate-500">
              Đang tải danh sách đăng ký...
            </p>
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-3xl bg-white p-16 text-center shadow-sm ring-1 ring-slate-200">
            <div className="text-5xl">📋</div>

            <h2 className="mt-5 text-2xl font-bold text-slate-900">
              Chưa có đăng ký nào
            </h2>

            <p className="mt-3 text-slate-500">
              Khi sinh viên đăng ký nhận đồ,
              thông tin sẽ xuất hiện ở đây.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse">
                <thead>
                  <tr className="border-b bg-slate-50 text-left">
                    <th className="px-5 py-4 text-sm font-bold text-slate-600">
                      Người đăng ký
                    </th>

                    <th className="px-5 py-4 text-sm font-bold text-slate-600">
                      Món đồ
                    </th>

                    <th className="px-5 py-4 text-sm font-bold text-slate-600">
                      Số điện thoại
                    </th>

                    <th className="px-5 py-4 text-sm font-bold text-slate-600">
                      Nơi lấy
                    </th>

                    <th className="px-5 py-4 text-sm font-bold text-slate-600">
                      Ngày lấy
                    </th>

                    <th className="px-5 py-4 text-sm font-bold text-slate-600">
                      Trạng thái
                    </th>

                    <th className="px-5 py-4 text-sm font-bold text-slate-600">
                      Xử lý
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {requests.map((request) => (
                    <tr
                      key={request.id}
                      className="border-b last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="px-5 py-5">
                        <div className="font-semibold text-slate-900">
                          {request.full_name ||
                            request.student_name ||
                            "—"}
                        </div>

                        {request.student_name &&
                          request.full_name &&
                          request.student_name !==
                            request.full_name && (
                            <div className="mt-1 text-sm text-slate-500">
                              {request.student_name}
                            </div>
                          )}
                      </td>

                      <td className="px-5 py-5">
                        <div className="font-semibold text-slate-900">
                          {request.item?.name ?? "Không xác định"}
                        </div>

                        <div className="mt-1 text-sm text-blue-600">
                          {request.item?.item_code ?? "—"}
                        </div>
                      </td>

                      <td className="px-5 py-5 text-slate-700">
                        {request.phone || "—"}
                      </td>

                      <td className="px-5 py-5 text-slate-700">
                        {request.pickup_location || "—"}
                      </td>

                      <td className="px-5 py-5 text-slate-700">
                        {formatDate(
                          request.pickup_date
                        )}
                      </td>

                      <td className="px-5 py-5">
                        <span
                          className={`inline-flex rounded-full px-3 py-2 text-sm font-semibold ${statusClass(
                            request.status
                          )}`}
                        >
                          {statusLabel(
                            request.status
                          )}
                        </span>
                      </td>

                      <td className="px-5 py-5">
                        {request.status ===
                        "PENDING" ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={
                                updatingId ===
                                request.id
                              }
                              onClick={() =>
                                updateRequest(
                                  request,
                                  "APPROVED"
                                )
                              }
                              className="rounded-xl bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              Duyệt
                            </button>

                            <button
                              type="button"
                              disabled={
                                updatingId ===
                                request.id
                              }
                              onClick={() =>
                                updateRequest(
                                  request,
                                  "CANCELLED"
                                )
                              }
                              className="rounded-xl bg-red-100 px-4 py-2 font-semibold text-red-600 hover:bg-red-200 disabled:opacity-50"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">
                            Đã xử lý
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={loadRequests}
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-800"
          >
            Làm mới
          </button>
        </div>
      </div>
    </main>
  );
}