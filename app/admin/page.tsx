"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Be_Vietnam_Pro } from "next/font/google";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

type Stats = {
  total_requests: number;
  pending_requests: number;
  approved_requests: number;
  delivered_requests: number;
  cancelled_requests: number;
  total_items: number;
  available_items: number;
  total_btc: number;
};

type BtcAccount = {
  id: string;
  full_name: string | null;
  student_id: string | null;
  role: string;
  email: string | null;
  approved_count: number;
  delivered_count: number;
  cancelled_count: number;
};

type AdminRequest = {
  id: string;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  item_image_url: string | null;
  status: string;
  full_name: string | null;
  phone: string | null;
  delivery_method: "PICKUP" | "SHIP" | null;
  shipping_address: string | null;
  pickup_location: string | null;
  pickup_date: string | null;
  created_at: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  delivered_by_name: string | null;
  delivered_at: string | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
};

type InventoryItem = {
  id: string;
  item_code: string | null;
  name: string | null;
  category: string | null;
  condition: string | null;
  description: string | null;
  image_url: string | null;
  status: string | null;
  quantity: number;
  active_count: number;
  remaining_quantity: number;
};

type Dashboard = {
  stats: Stats;
  btc_accounts: BtcAccount[];
  requests: AdminRequest[];
  inventory: InventoryItem[];
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN");
}

function statusLabel(status: string) {
  if (status === "PENDING") return "Chờ duyệt";
  if (status === "APPROVED") return "Đã duyệt";
  if (status === "DELIVERED") return "Đã giao";
  if (status === "CANCELLED") return "Đã hủy";
  return status;
}

function statusClass(status: string) {
  if (status === "PENDING") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "APPROVED")
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "DELIVERED") return "bg-sky-50 text-sky-700 ring-sky-200";
  if (status === "CANCELLED") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deliveryFilter, setDeliveryFilter] = useState("ALL");
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState("ALL");
  const [resetting, setResetting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "requests" | "btc" | "inventory"
  >("overview");

  async function loadDashboard(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.replace("/dang-nhap");
        return;
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_admin_dashboard",
      );
      if (rpcError) throw rpcError;

      setDashboard(data as Dashboard);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("Admin dashboard error:", err);
      setError(err?.message || "Không tải được trang quản trị tổng.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();

    const timer = window.setInterval(() => {
      void loadDashboard(false);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const filteredRequests = useMemo(() => {
    const requests = dashboard?.requests || [];
    const keyword = search.trim().toLowerCase();

    return requests.filter((request) => {
      if (statusFilter !== "ALL" && request.status !== statusFilter)
        return false;
      if (
        deliveryFilter !== "ALL" &&
        (request.delivery_method || "PICKUP") !== deliveryFilter
      ) {
        return false;
      }

      if (!keyword) return true;

      return [
        request.full_name,
        request.phone,
        request.item_name,
        request.item_code,
        request.shipping_address,
        request.approved_by_name,
        request.delivered_by_name,
        request.cancelled_by_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [dashboard, search, statusFilter, deliveryFilter]);

  const filteredInventory = useMemo(() => {
    const keyword = inventorySearch.trim().toLowerCase();
    return (dashboard?.inventory || []).filter((item) => {
      if (inventoryStatusFilter === "IN_STOCK" && item.remaining_quantity <= 0)
        return false;
      if (
        inventoryStatusFilter === "OUT_OF_STOCK" &&
        item.remaining_quantity > 0
      )
        return false;
      if (inventoryStatusFilter === "HAS_REQUESTS" && item.active_count <= 0)
        return false;
      if (inventoryStatusFilter === "NO_REQUESTS" && item.active_count > 0)
        return false;
      if (!keyword) return true;
      return [
        item.item_code,
        item.name,
        item.category,
        item.condition,
        item.description,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [dashboard, inventorySearch, inventoryStatusFilter]);

  async function resetTestData() {
    const first = window.confirm(
      "CẢNH BÁO: Thao tác này sẽ xóa toàn bộ dữ liệu vận hành/test như sản phẩm, phiếu đăng ký, lịch nhận và giao dịch. Tài khoản Admin/BTC sẽ KHÔNG bị xóa. Bạn có chắc chắn không?",
    );
    if (!first) return;

    const phrase = window.prompt(
      "Để xác nhận, hãy nhập chính xác: XOA DU LIEU TEST",
    );
    if (phrase !== "XOA DU LIEU TEST") {
      window.alert("Đã hủy. Dữ liệu chưa bị xóa.");
      return;
    }

    setResetting(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("reset_test_data");
      if (rpcError) throw rpcError;
      await loadDashboard(false);
      window.alert(
        "Đã xóa dữ liệu test thành công. Tài khoản Admin/BTC vẫn được giữ lại.",
      );
    } catch (err: any) {
      console.error("Reset test data error:", err);
      setError(err?.message || "Không thể xóa dữ liệu test.");
    } finally {
      setResetting(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace("/dang-nhap");
  }

  if (loading && !dashboard) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-7xl rounded-2xl bg-white p-10 shadow-sm">
          Đang tải trang quản trị tổng...
        </div>
      </main>
    );
  }

  if (error && !dashboard) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-10 shadow-sm">
          <h1 className="text-3xl font-black text-slate-900">
            Không vào được Admin
          </h1>
          <p className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
          <button
            onClick={() => window.location.replace("/dang-nhap")}
            className="mt-6 rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white"
          >
            Về trang đăng nhập
          </button>
        </div>
      </main>
    );
  }

  const stats = dashboard?.stats;

  return (
    <main
      className={`${beVietnamPro.className} min-h-screen bg-[#f5f8f6] px-4 py-8 text-slate-800 sm:px-8`}
    >
      <div className="mx-auto max-w-7xl">
        <header className="relative mb-7 overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-7 text-white shadow-xl shadow-slate-900/15 sm:p-9">
          <div className="absolute -right-20 -top-28 h-64 w-64 rounded-full bg-emerald-400/10" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                  Trạm sạc nhà S
                </p>
                <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">
                  Quyền quản trị cao nhất
                </span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                Trung tâm điều hành
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-300 sm:text-base">
                Giám sát toàn hệ thống, đội ngũ BTC, kho vật phẩm và lịch sử xử
                lý phiếu.
              </p>
              <p className="mt-3 text-xs font-semibold text-slate-400">
                {lastUpdated
                  ? `Đồng bộ gần nhất: ${lastUpdated.toLocaleDateString("vi-VN")} · ${lastUpdated.toLocaleTimeString("vi-VN")}`
                  : "Đang đồng bộ dữ liệu..."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={resetTestData}
                disabled={resetting}
                className="rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resetting ? "Đang xóa..." : "Xóa dữ liệu test"}
              </button>
              <button
                onClick={logout}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/20"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <div className="sticky top-3 z-30 mb-7 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur">
          {[
            ["overview", "Tổng quan"],
            ["requests", "Tất cả phiếu"],
            ["btc", "Đội ngũ BTC"],
            ["inventory", "🗃️ Kho đồ"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              className={`rounded-xl px-5 py-3 font-bold ${
                activeTab === key
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                ["Tổng phiếu", stats?.total_requests ?? 0, "text-emerald-700"],
                ["Chờ duyệt", stats?.pending_requests ?? 0, "text-amber-500"],
                ["Đã duyệt", stats?.approved_requests ?? 0, "text-indigo-600"],
                ["Đã giao", stats?.delivered_requests ?? 0, "text-emerald-600"],
                ["Đã hủy", stats?.cancelled_requests ?? 0, "text-rose-600"],
                ["Tổng sản phẩm", stats?.total_items ?? 0, "text-violet-600"],
                ["Đang có sẵn", stats?.available_items ?? 0, "text-cyan-600"],
                ["Tài khoản BTC", stats?.total_btc ?? 0, "text-orange-500"],
              ].map(([label, value, numberClass]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"
                >
                  <p className="text-sm font-semibold text-slate-500">
                    {label}
                  </p>
                  <p
                    className={`mt-2 text-3xl font-extrabold sm:text-4xl ${numberClass}`}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </section>

            <section className="mt-8 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900">
                    Hoạt động gần đây
                  </h2>
                  <p className="mt-1 text-slate-500">
                    Các phiếu mới nhất trên toàn hệ thống.
                  </p>
                </div>
                {Number(stats?.pending_requests ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("requests")}
                    className="self-start rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
                  >
                    {stats?.pending_requests} phiếu cần chú ý →
                  </button>
                )}
              </div>
              <div className="mt-5 space-y-3">
                {(dashboard?.requests || []).slice(0, 8).map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold text-slate-900">
                          {request.item_code || "—"} ·{" "}
                          {request.item_name || "Sản phẩm"}
                        </p>
                        <p className="text-sm text-slate-600">
                          {request.full_name || "Không rõ tên"} ·{" "}
                          {request.phone || "Không rõ SĐT"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${statusClass(request.status)}`}
                      >
                        {statusLabel(request.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-400">
                      Đăng ký: {formatDateTime(request.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "btc" && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-900">
                Đội ngũ BTC
              </h2>
              <p className="mt-1 text-slate-500">
                Admin tổng xem được từng tài khoản và số thao tác đã thực hiện.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {(dashboard?.btc_accounts || []).map((btc) => (
                <div
                  key={btc.id}
                  className="rounded-2xl border border-slate-200 p-5 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xl font-extrabold text-slate-900">
                      {btc.full_name || "Chưa đặt tên"}
                    </p>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                      {btc.role || "BTC"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {btc.email || "Không có email"}
                  </p>
                  {btc.student_id && (
                    <p className="mt-1 text-sm text-slate-500">
                      MSSV: {btc.student_id}
                    </p>
                  )}

                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-blue-50 p-3">
                      <p className="text-2xl font-black text-emerald-700">
                        {btc.approved_count}
                      </p>
                      <p className="text-xs text-slate-500">Duyệt</p>
                    </div>
                    <div className="rounded-xl bg-green-50 p-3">
                      <p className="text-2xl font-black text-green-700">
                        {btc.delivered_count}
                      </p>
                      <p className="text-xs text-slate-500">Giao</p>
                    </div>
                    <div className="rounded-xl bg-red-50 p-3">
                      <p className="text-2xl font-black text-red-700">
                        {btc.cancelled_count}
                      </p>
                      <p className="text-xs text-slate-500">Hủy</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "inventory" && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  🗃️ Kho đồ
                </h2>
                <p className="mt-1 text-slate-500">
                  Xem toàn bộ sản phẩm hiện có, số lượng tổng và số lượng còn
                  lại.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                {filteredInventory.length} / {dashboard?.inventory?.length || 0}{" "}
                sản phẩm
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                placeholder="Tìm mã đồ, tên đồ, danh mục, tình trạng..."
                className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <select
                value={inventoryStatusFilter}
                onChange={(e) => setInventoryStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-3"
              >
                <option value="ALL">Tất cả vật phẩm</option>
                <option value="IN_STOCK">🟢 Còn hàng</option>
                <option value="OUT_OF_STOCK">🔴 Hết hàng</option>
                <option value="HAS_REQUESTS">🟠 Có phiếu đăng ký</option>
                <option value="NO_REQUESTS">⚪ Chưa có phiếu đăng ký</option>
              </select>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredInventory.map((item) => {
                const statusText =
                  item.remaining_quantity <= 0
                    ? "Hết hàng"
                    : item.active_count > 0
                      ? "Có phiếu đăng ký"
                      : "Còn hàng";
                const inventoryBadgeClass =
                  item.remaining_quantity <= 0
                    ? "bg-rose-50 text-rose-700 ring-rose-200"
                    : item.active_count > 0
                      ? "bg-amber-50 text-amber-700 ring-amber-200"
                      : "bg-emerald-50 text-emerald-700 ring-emerald-200";

                return (
                  <article
                    key={item.id}
                    className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="aspect-[4/3] bg-slate-100">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name || "Sản phẩm"}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-5xl">
                          📦
                        </div>
                      )}
                    </div>

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-emerald-700">
                            {item.item_code || "Không có mã"}
                          </p>
                          <h3 className="mt-1 text-xl font-black text-slate-900">
                            {item.name || "Không rõ tên"}
                          </h3>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${inventoryBadgeClass}`}
                        >
                          {statusText}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs font-semibold text-slate-500">
                            Tổng số lượng
                          </p>
                          <p className="mt-1 text-2xl font-black text-violet-600">
                            {item.quantity}
                          </p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 p-3">
                          <p className="text-xs font-semibold text-slate-500">
                            Còn lại
                          </p>
                          <p className="mt-1 text-2xl font-black text-emerald-600">
                            {item.remaining_quantity}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1 text-sm text-slate-600">
                        {item.category && (
                          <p>
                            <b>Danh mục:</b> {item.category}
                          </p>
                        )}
                        {item.condition && (
                          <p>
                            <b>Tình trạng:</b> {item.condition}
                          </p>
                        )}
                        <p>
                          <b>Đang có phiếu:</b> {item.active_count}
                        </p>
                      </div>

                      {item.description && (
                        <p className="mt-3 line-clamp-3 text-sm text-slate-500">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {filteredInventory.length === 0 && (
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                Không có sản phẩm phù hợp.
              </div>
            )}
          </section>
        )}

        {activeTab === "requests" && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-900">
                Tất cả phiếu nhận
              </h2>
              <p className="mt-1 text-slate-500">
                Admin tổng xem toàn bộ phiếu, kể cả đã hủy và đã giao.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên, SĐT, mã đồ, tên đồ, BTC..."
                className="rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-3"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="PENDING">Chờ duyệt</option>
                <option value="APPROVED">Đã duyệt</option>
                <option value="DELIVERED">Đã giao</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
              <select
                value={deliveryFilter}
                onChange={(e) => setDeliveryFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-3"
              >
                <option value="ALL">Tất cả hình thức</option>
                <option value="PICKUP">🏠 Lấy trực tiếp</option>
                <option value="SHIP">🚚 Ship hàng</option>
              </select>
            </div>

            <p className="mt-4 text-sm text-slate-500">
              Đang hiển thị <b>{filteredRequests.length}</b> /{" "}
              {dashboard?.requests.length || 0} phiếu
            </p>

            <div className="mt-5 space-y-4">
              {filteredRequests.map((request) => (
                <article
                  key={request.id}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-bold text-emerald-700">
                        {request.item_code || "Không rõ mã"}
                      </p>
                      <h3 className="mt-1 text-xl font-black text-slate-900">
                        {request.item_name || "Không rõ sản phẩm"}
                      </h3>
                      <p className="mt-2 text-slate-700">
                        {request.full_name || "Không rõ tên"} ·{" "}
                        {request.phone || "Không rõ SĐT"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-4 py-2 font-bold ring-1 ${statusClass(request.status)}`}
                    >
                      {statusLabel(request.status)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="font-bold text-slate-900">Hình thức nhận</p>
                      {request.delivery_method === "SHIP" ? (
                        <>
                          <p className="mt-2">🚚 Ship hàng</p>
                          <p className="mt-1 text-sm text-slate-600">
                            Địa chỉ: {request.shipping_address || "Chưa có"}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="mt-2">🏠 Lấy trực tiếp</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {request.pickup_location || "Chưa có địa điểm"} ·{" "}
                            {request.pickup_date || "Chưa có ngày"}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="font-bold text-slate-900">
                        Lịch sử thao tác
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-slate-600">
                        <p>📝 Đăng ký: {formatDateTime(request.created_at)}</p>
                        {request.approved_by_name && (
                          <p>
                            ✅ Duyệt: <b>{request.approved_by_name}</b> ·{" "}
                            {formatDateTime(request.approved_at)}
                          </p>
                        )}
                        {request.delivered_by_name && (
                          <p>
                            📦 Giao: <b>{request.delivered_by_name}</b> ·{" "}
                            {formatDateTime(request.delivered_at)}
                          </p>
                        )}
                        {request.cancelled_by_name && (
                          <p>
                            ❌ Hủy: <b>{request.cancelled_by_name}</b> ·{" "}
                            {formatDateTime(request.cancelled_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              {filteredRequests.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                  Không có phiếu phù hợp bộ lọc.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
