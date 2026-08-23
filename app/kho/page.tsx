"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Item = {
  id: string;
  item_code: string | null;
  name: string;
  category: string | null;
  condition: string | null;
  description: string | null;
  image_url: string | null;
  status: string | null;
  quantity: number;
  created_at: string | null;
};

type PickupSlot = {
  id: string;
  item_id: string;
  pickup_location: string;
  pickup_date: string;
  pickup_start_time: string;
  pickup_end_time: string;
  is_active: boolean;
  created_at: string | null;
};

type RequestForm = {
  full_name: string;
  phone: string;
  pickup_slot_id: string;
};

export default function KhoPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<PickupSlot[]>([]);
  const [registeredCounts, setRegisteredCounts] = useState<Record<string, number>>(
    {}
  );

  const [form, setForm] = useState<RequestForm>({
    full_name: "",
    phone: "",
    pickup_slot_id: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [formError, setFormError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "available" | "out">("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortOption, setSortOption] = useState<"newest" | "name-asc" | "remaining-desc">("newest");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [viewMode, setViewMode] = useState<"1" | "2">("2");

  useEffect(() => {
    loadData();

    const savedViewMode = window.localStorage.getItem("kho-view-mode");
    if (savedViewMode === "1" || savedViewMode === "2") {
      setViewMode(savedViewMode);
    }
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [itemsResult, slotsResult] = await Promise.all([
        supabase
          .from("items")
          .select(`
            id,
            item_code,
            name,
            category,
            condition,
            description,
            image_url,
            status,
            quantity,
            created_at
          `)
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("pickup_slots")
          .select(`
            id,
            item_id,
            pickup_location,
            pickup_date,
            pickup_start_time,
            pickup_end_time,
            is_active,
            created_at
          `)
          .eq("is_active", true)
          .order("pickup_date", {
            ascending: true,
          })
          .order("pickup_start_time", {
            ascending: true,
          }),
      ]);

      if (itemsResult.error) {
        throw new Error(itemsResult.error.message);
      }

      if (slotsResult.error) {
        throw new Error(slotsResult.error.message);
      }

      setItems((itemsResult.data ?? []) as Item[]);
      setPickupSlots((slotsResult.data ?? []) as PickupSlot[]);

      const { data: activeRequestCounts, error: activeRequestCountsError } =
        await supabase.rpc("get_public_item_request_counts");

      if (activeRequestCountsError) {
        console.warn(
          "Không tải được số lượng đã đăng ký:",
          activeRequestCountsError.message
        );
        setRegisteredCounts({});
        setError(
          "Không thể tải số lượng đã đăng ký. Hãy chạy SQL RPC get_public_item_request_counts trong Supabase."
        );
      } else {
        const counts: Record<string, number> = {};
        for (const row of activeRequestCounts ?? []) {
          counts[row.item_id] = Number(row.active_count ?? 0);
        }
        setRegisteredCounts(counts);
      }
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải dữ liệu."
      );
    } finally {
      setLoading(false);
    }
  }

  function getRemainingQuantity(item: Item) {
    const total = Number(item.quantity ?? 1);
    const registered = registeredCounts[item.id] ?? 0;
    return Math.max(0, total - registered);
  }

  function openRegister(item: Item) {
    if (getRemainingQuantity(item) <= 0) {
      setSuccessMessage("");
      setFormError("Sản phẩm đã hết hàng. Hiện không thể đăng ký thêm.");
      return;
    }
    const itemSlots = pickupSlots.filter(
      (slot) => slot.item_id === item.id && slot.is_active
    );

    setSelectedItem(item);
    setSelectedSlots(itemSlots);
    setSuccessMessage("");
    setFormError("");

    setForm({
      full_name: "",
      phone: "",
      pickup_slot_id: itemSlots[0]?.id ?? "",
    });
  }

  function closeRegister() {
    if (submitting) return;

    setSelectedItem(null);
    setFormError("");
  }

  function updateForm(
    field: keyof RequestForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function submitRequest() {
    if (!selectedItem) return;

    setFormError("");
    setSuccessMessage("");

    if (!form.full_name.trim()) {
      setFormError("Vui lòng nhập họ và tên.");
      return;
    }

    if (!form.phone.trim()) {
      setFormError("Vui lòng nhập số điện thoại.");
      return;
    }

    if (!form.pickup_slot_id) {
      setFormError("Vui lòng chọn một lịch nhận đồ.");
      return;
    }

    const selectedSlot = selectedSlots.find(
      (slot) => slot.id === form.pickup_slot_id
    );

    if (!selectedSlot) {
      setFormError("Lịch nhận đồ không còn tồn tại hoặc đã được đóng.");
      return;
    }

    try {
      setSubmitting(true);

        const { error: requestError } = await supabase.rpc(
        "create_pickup_request",

        {

          p_item_id: selectedItem.id,

          p_pickup_slot_id: selectedSlot.id,

          p_full_name: form.full_name.trim(),

          p_phone: form.phone.trim(),

        }

      );

      if (requestError) {

        const message = requestError.message || "";

        if (message.includes("đã đăng ký")) {

          throw new Error(

            "Bạn đã đăng ký sản phẩm này rồi. Mỗi sinh viên chỉ được đăng ký 1 lần."

          );

        }

        if (message.includes("hết hàng")) {

          throw new Error(

            "Sản phẩm vừa hết hàng. Một sinh viên khác có thể đã đăng ký trước bạn."

          );

        }

        if (message.includes("Lịch nhận đồ")) {

          throw new Error(

            "Lịch nhận đồ này không còn hoạt động. Vui lòng chọn lịch khác."

          );

        }

        throw new Error(message);

      }

      setSuccessMessage(
        `Đăng ký thành công! Lịch nhận: ${selectedSlot.pickup_location} · ${formatDate(
          selectedSlot.pickup_date
        )} · ${formatTime(selectedSlot.pickup_start_time)} - ${formatTime(
          selectedSlot.pickup_end_time
        )}.`
      );

      setRegisteredCounts((current) => ({
        ...current,
        [selectedItem.id]: (current[selectedItem.id] ?? 0) + 1,
      }));
      setSelectedItem(null);
      setSelectedSlots([]);

      await loadData();
    } catch (err) {
      console.error(err);

      setFormError(
        err instanceof Error
          ? err.message
          : "Không thể đăng ký nhận đồ."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(dateString: string) {
    if (!dateString) return "";

    const [year, month, day] =
      dateString.split("-");

    if (!year || !month || !day) {
      return dateString;
    }

    return `${day}/${month}/${year}`;
  }

  function formatTime(time: string) {
    if (!time) return "";

    return time.slice(0, 5);
  }

  function getItemSlots(itemId: string) {
    return pickupSlots.filter(
      (slot) => slot.item_id === itemId && slot.is_active
    );
  }

  function isItemAvailable(item: Item) {
    // Kho sinh viên không dùng status của BTC để khóa nút Lấy đồ.
    // Chỉ cần sản phẩm còn số lượng và có ít nhất một lịch nhận đồ đang mở.
    const remaining = getRemainingQuantity(item);
    const hasActivePickupSlot = getItemSlots(item.id).length > 0;

    return remaining > 0 && hasActivePickupSlot;
  }

  const locationOptions = Array.from(
    new Set(
      pickupSlots
        .filter((slot) => slot.is_active)
        .map((slot) => slot.pickup_location.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "vi"));

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredItems = items
    .filter((item) => {
      if (!normalizedSearch) return true;
      return [
        item.name,
        item.item_code,
        item.category,
        item.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .filter((item) => {
      const remaining = getRemainingQuantity(item);
      if (onlyAvailable && !isItemAvailable(item)) return false;
      if (stockFilter === "available" && remaining <= 0) return false;
      if (stockFilter === "out" && remaining > 0) return false;
      return true;
    })
    .filter((item) => {
      if (locationFilter === "all") return true;
      return getItemSlots(item.id).some(
        (slot) => slot.pickup_location === locationFilter
      );
    })
    .sort((a, b) => {
      if (sortOption === "name-asc") {
        return a.name.localeCompare(b.name, "vi");
      }
      if (sortOption === "remaining-desc") {
        return getRemainingQuantity(b) - getRemainingQuantity(a);
      }
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10">
          <p className="mb-3 text-sm font-bold uppercase tracking-wider text-blue-600">
            TRẠM SẠC NHÀ S
          </p>

          <h1 className="text-5xl font-bold tracking-tight text-slate-900">
            Kho đồ
          </h1>

          <p className="mt-4 text-xl text-slate-600">
            Xem các món đồ còn hàng và đăng ký nhận theo lịch BTC đã mở.
          </p>
        </div>

        {successMessage && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-6 py-4 text-green-700">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-red-600">
            Không thể tải dữ liệu: {error}
          </div>
        )}

        {!loading && items.length > 0 && (
          <section className="mb-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl">
                  🔎
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo tên, mã sản phẩm, danh mục..."
                  className="w-full rounded-2xl border border-slate-300 bg-white py-4 pl-12 pr-4 text-base text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as "all" | "available" | "out")}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
                >
                  <option value="all">Tất cả sản phẩm</option>
                  <option value="available">Còn hàng</option>
                  <option value="out">Hết hàng</option>
                </select>

                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
                >
                  <option value="all">Tất cả địa điểm</option>
                  {locationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>

                <select
                  value={sortOption}
                  onChange={(e) =>
                    setSortOption(
                      e.target.value as "newest" | "name-asc" | "remaining-desc"
                    )
                  }
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-blue-500"
                >
                  <option value="newest">Mới cập nhật</option>
                  <option value="name-asc">Tên A → Z</option>
                  <option value="remaining-desc">Còn nhiều hàng trước</option>
                </select>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Kiểu hiển thị:
                  </span>

                  <button
                    type="button"
                    aria-pressed={viewMode === "1"}
                    onClick={() => {
                      setViewMode("1");
                      window.localStorage.setItem("kho-view-mode", "1");
                    }}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      viewMode === "1"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    ☰ 1 cột
                  </button>

                  <button
                    type="button"
                    aria-pressed={viewMode === "2"}
                    onClick={() => {
                      setViewMode("2");
                      window.localStorage.setItem("kho-view-mode", "2");
                    }}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      viewMode === "2"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    ▦ 2 cột
                  </button>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={onlyAvailable}
                    onChange={(e) => setOnlyAvailable(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300"
                  />
                  Chỉ hiện sản phẩm có thể lấy ngay
                </label>

                <p className="text-sm text-slate-500">
                  Hiển thị <b>{filteredItems.length}</b> / {items.length} sản phẩm
                </p>
              </div>

              {(searchQuery || stockFilter !== "all" || locationFilter !== "all" ||
                sortOption !== "newest" || onlyAvailable) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setStockFilter("all");
                    setLocationFilter("all");
                    setSortOption("newest");
                    setOnlyAvailable(false);
                  }}
                  className="self-start rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          </section>
        )}

        {loading ? (
          <div className="rounded-3xl bg-white p-16 text-center shadow-sm">
            <p className="text-lg text-slate-500">
              Đang tải dữ liệu...
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl bg-white p-16 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">
              Hiện chưa có món đồ nào
            </h2>

            <p className="mt-3 text-lg text-slate-500">
              BTC sẽ cập nhật đồ mới tại đây.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-200">
            <div className="text-4xl">🔎</div>
            <h2 className="mt-4 text-2xl font-bold text-slate-900">
              Không tìm thấy sản phẩm
            </h2>
            <p className="mt-3 text-slate-500">
              Thử đổi từ khóa hoặc xóa bớt bộ lọc để xem thêm sản phẩm.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStockFilter("all");
                setLocationFilter("all");
                setSortOption("newest");
                setOnlyAvailable(false);
              }}
              className="mt-6 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <div
            className={`grid gap-6 ${
              viewMode === "1"
                ? "grid-cols-1"
                : "grid-cols-1 sm:grid-cols-2"
            }`}
          >
            {filteredItems.map((item) => {
              const remaining = getRemainingQuantity(item);
              const available = isItemAvailable(item);

              return (
                <div
                  key={item.id}
                  className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200 ${
                    viewMode === "1" ? "lg:flex" : ""
                  }`}
                >
                  <div
                    className={`flex h-64 items-center justify-center bg-slate-100 ${
                      viewMode === "1" ? "lg:h-auto lg:w-2/5 lg:shrink-0" : ""
                    }`}
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-lg text-slate-400">
                        Không có ảnh
                      </span>
                    )}
                  </div>

                  <div className={`p-6 ${viewMode === "1" ? "lg:flex-1" : ""}`}>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-blue-600">
                        {item.item_code ?? "MÃ ĐỒ"}
                      </span>

                      <span
                        className={
                          available
                            ? "rounded-full bg-green-50 px-4 py-2 text-sm font-semibold text-green-700"
                            : "rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500"
                        }
                      >
                        {available
                          ? "Có thể lấy"
                          : remaining <= 0
                            ? "Đã hết"
                            : "Không khả dụng"}
                      </span>
                    </div>

                    <h2 className="text-2xl font-bold text-slate-900">
                      {item.name}
                    </h2>

                    {item.category && (
                      <p className="mt-3 text-lg text-slate-500">
                        {item.category}
                      </p>
                    )}

                    <div
                      className={`mt-4 inline-flex rounded-full px-3 py-1 text-sm font-bold ${
                        remaining > 0
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      Còn lại {remaining} / {Number(item.quantity ?? 1)}
                    </div>

                    {item.condition && (
                      <p className="mt-5 text-slate-700">
                        <span className="font-semibold">
                          Tình trạng:
                        </span>{" "}
                        {item.condition}
                      </p>
                    )}

                    {item.description && (
                      <p className="mt-4 min-h-12 leading-7 text-slate-600">
                        {item.description}
                      </p>
                    )}

                    {(() => {
                      const total = Number(item.quantity ?? 1);
                      const registered = registeredCounts[item.id] ?? 0;
                      const remaining = getRemainingQuantity(item);

                      return (
                        <div
                          className={`mt-6 rounded-2xl border p-4 ${
                            remaining > 0
                              ? "border-green-200 bg-green-50"
                              : "border-red-200 bg-red-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-bold text-slate-900">
                              Tình trạng kho
                            </p>
                            <span
                              className={`rounded-full px-3 py-1 text-sm font-bold ${
                                remaining > 0
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {remaining > 0 ? "Còn hàng" : "Hết hàng"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            Còn lại <b>{remaining}</b> / {total} sản phẩm
                            {registered > 0 && ` · Đã đăng ký ${registered}`}
                          </p>
                        </div>
                      );
                    })()}

                    <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                      <p className="font-bold text-slate-900">
                        Lịch nhận đồ
                      </p>

                      {getItemSlots(item.id).length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">
                          BTC chưa mở lịch nhận cho sản phẩm này.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {getItemSlots(item.id).map((slot) => (
                            <div
                              key={slot.id}
                              className="rounded-xl bg-white px-4 py-3 text-sm text-slate-700"
                            >
                              <p className="font-semibold text-slate-900">
                                {slot.pickup_location}
                              </p>
                              <p className="mt-1">
                                {formatDate(slot.pickup_date)} ·{" "}
                                {formatTime(slot.pickup_start_time)} -{" "}
                                {formatTime(slot.pickup_end_time)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={
                        !available ||
                        getItemSlots(item.id).length === 0 ||
getRemainingQuantity(item) <= 0
                      }
                      onClick={() => openRegister(item)}
                      title={getRemainingQuantity(item) <= 0 ? "Sản phẩm đã hết hàng" : undefined}
                      aria-label={getRemainingQuantity(item) <= 0 ? "Sản phẩm đã hết hàng" : "Lấy đồ"}
                      className={`mt-6 w-full rounded-2xl px-5 py-4 text-lg font-bold transition ${
                        available
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                    >
                      {getRemainingQuantity(item) <= 0
                        ? "Hết hàng"
                        : available
                          ? "Lấy đồ"
                          : "Không khả dụng"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="p-8">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">
                    Đăng ký nhận đồ
                  </h2>

                  <p className="mt-2 text-lg text-slate-500">
                    {selectedItem.name}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeRegister}
                  className="rounded-full px-3 py-2 text-2xl text-slate-400 hover:bg-slate-100"
                >
                  ×
                </button>
              </div>

              {formError && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-600">
                  {formError}
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-lg font-bold text-slate-800">
                    Họ và tên
                  </label>

                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) =>
                      updateForm(
                        "full_name",
                        e.target.value
                      )
                    }
                    placeholder="Nguyễn Văn A"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-lg text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-lg font-bold text-slate-800">
                    Số điện thoại
                  </label>

                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) =>
                      updateForm(
                        "phone",
                        e.target.value
                      )
                    }
                    placeholder="0912345678"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-lg text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                  <label className="mb-2 block text-lg font-bold text-slate-800">
                    Chọn lịch nhận đồ
                  </label>

                  <p className="mb-4 text-sm text-slate-600">
                    Bạn chỉ có thể chọn ngày, địa điểm và khung giờ do BTC đã mở.
                  </p>

                  {selectedSlots.length === 0 ? (
                    <div className="rounded-xl bg-white p-4 text-slate-500">
                      Sản phẩm này hiện chưa có lịch nhận đồ.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedSlots.map((slot) => (
                        <label
                          key={slot.id}
                          className={`block cursor-pointer rounded-xl border p-4 transition ${
                            form.pickup_slot_id === slot.id
                              ? "border-blue-500 bg-white ring-2 ring-blue-100"
                              : "border-slate-200 bg-white hover:border-blue-300"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="pickup_slot"
                              value={slot.id}
                              checked={form.pickup_slot_id === slot.id}
                              onChange={(e) =>
                                updateForm(
                                  "pickup_slot_id",
                                  e.target.value
                                )
                              }
                              className="mt-1 h-5 w-5"
                            />

                            <div>
                              <p className="font-bold text-slate-900">
                                {slot.pickup_location}
                              </p>
                              <p className="mt-1 text-slate-700">
                                Ngày:{" "}
                                <span className="font-semibold">
                                  {formatDate(slot.pickup_date)}
                                </span>
                              </p>
                              <p className="mt-1 text-slate-700">
                                Khung giờ:{" "}
                                <span className="font-semibold">
                                  {formatTime(slot.pickup_start_time)} -{" "}
                                  {formatTime(slot.pickup_end_time)}
                                </span>
                              </p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={submitting || selectedSlots.length === 0 || !form.pickup_slot_id}
                onClick={submitRequest}
                className="mt-8 w-full rounded-2xl bg-blue-600 px-5 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? "Đang đăng ký..."
                  : "Xác nhận đăng ký"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}