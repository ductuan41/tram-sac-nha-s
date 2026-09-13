"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Be_Vietnam_Pro } from "next/font/google";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const ITEMS_PER_PAGE = 12;

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

type DeliveryMethod = "PICKUP" | "SHIP";

type RequestForm = {
  delivery_method: DeliveryMethod | "";
  full_name: string;
  phone: string;
  pickup_slot_id: string;
  shipping_address: string;
};

export default function KhoPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Item | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<PickupSlot[]>([]);
  const [registeredCounts, setRegisteredCounts] = useState<
    Record<string, number>
  >({});

  const [form, setForm] = useState<RequestForm>({
    delivery_method: "",
    full_name: "",
    phone: "",
    pickup_slot_id: "",
    shipping_address: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [formError, setFormError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "available" | "out">(
    "all",
  );
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortOption, setSortOption] = useState<
    "newest" | "name-asc" | "remaining-desc"
  >("newest");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [viewMode, setViewMode] = useState<"1" | "2">("2");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refreshData = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        console.log("🔄 Kho Realtime: có thay đổi, đang tải lại...");
        void loadData(true);
      }, 200);
    };

    void loadData();

    const savedViewMode = window.localStorage.getItem("kho-view-mode");
    if (savedViewMode === "1" || savedViewMode === "2") {
      setViewMode(savedViewMode);
    }

    // Không subscribe payload của requests để tránh lộ tên/SĐT cho người chưa đăng nhập.
    channel = supabase
      .channel("public-kho-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" },
        refreshData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_slots" },
        refreshData,
      )
      .subscribe((status) => {
        console.log("📡 Kho Realtime status:", status);
      });

    // Fallback 3 giây để số lượng còn lại cập nhật sau khi có đăng ký.
    pollTimer = setInterval(() => {
      void loadData(true);
    }, 3000);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [
    searchQuery,
    categoryFilter,
    stockFilter,
    locationFilter,
    sortOption,
    onlyAvailable,
  ]);

  async function loadData(silent = false) {
    try {
      if (!silent) setLoading(true);
      setError("");

      const [itemsResult, slotsResult] = await Promise.all([
        supabase
          .from("items")
          .select(
            `
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
          `,
          )
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("pickup_slots")
          .select(
            `
            id,
            item_id,
            pickup_location,
            pickup_date,
            pickup_start_time,
            pickup_end_time,
            is_active,
            created_at
          `,
          )
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
          activeRequestCountsError.message,
        );
        setRegisteredCounts({});
        setError(
          "Không thể tải số lượng đã đăng ký. Hãy chạy SQL RPC get_public_item_request_counts trong Supabase.",
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

      setError(err instanceof Error ? err.message : "Không thể tải dữ liệu.");
    } finally {
      if (!silent) setLoading(false);
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
      (slot) => slot.item_id === item.id && slot.is_active,
    );

    setSelectedItem(item);
    setSelectedSlots(itemSlots);
    setSuccessMessage("");
    setFormError("");

    setForm({
      delivery_method: "",
      full_name: "",
      phone: "",
      pickup_slot_id: itemSlots[0]?.id ?? "",
      shipping_address: "",
    });
  }

  function closeRegister() {
    if (submitting) return;

    setSelectedItem(null);
    setFormError("");
  }

  function updateForm(field: keyof RequestForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function submitRequest() {
    if (!selectedItem) return;

    setFormError("");
    setSuccessMessage("");

    if (!form.delivery_method) {
      setFormError("Vui lòng chọn hình thức nhận đồ.");
      return;
    }

    if (!form.full_name.trim()) {
      setFormError("Vui lòng nhập họ và tên.");
      return;
    }

    if (!form.phone.trim()) {
      setFormError("Vui lòng nhập số điện thoại.");
      return;
    }

    let selectedSlot: PickupSlot | undefined;

    if (form.delivery_method === "PICKUP") {
      if (!form.pickup_slot_id) {
        setFormError("Vui lòng chọn một lịch nhận đồ.");
        return;
      }

      selectedSlot = selectedSlots.find(
        (slot) => slot.id === form.pickup_slot_id,
      );

      if (!selectedSlot) {
        setFormError("Lịch nhận đồ không còn tồn tại hoặc đã được đóng.");
        return;
      }
    }

    if (form.delivery_method === "SHIP" && !form.shipping_address.trim()) {
      setFormError("Vui lòng nhập địa chỉ nhận hàng.");
      return;
    }

    try {
      setSubmitting(true);

      const { error: requestError } = await supabase.rpc(
        "create_pickup_request",
        {
          p_item_id: selectedItem.id,
          p_delivery_method: form.delivery_method,
          p_pickup_slot_id: selectedSlot?.id ?? null,
          p_full_name: form.full_name.trim(),
          p_phone: form.phone.trim(),
          p_shipping_address:
            form.delivery_method === "SHIP"
              ? form.shipping_address.trim()
              : null,
        },
      );

      if (requestError) {
        const message = requestError.message || "";

        if (message.includes("đã đăng ký")) {
          throw new Error(
            "Bạn đã đăng ký sản phẩm này rồi. Mỗi sinh viên chỉ được đăng ký 1 lần cho một sản phẩm.",
          );
        }

        if (message.includes("hết hàng")) {
          throw new Error(
            "Sản phẩm vừa hết hàng. Một sinh viên khác có thể đã đăng ký trước bạn.",
          );
        }

        if (message.includes("Lịch nhận đồ")) {
          throw new Error(
            "Lịch nhận đồ này không còn hoạt động. Vui lòng chọn lịch khác.",
          );
        }

        throw new Error(message);
      }

      if (form.delivery_method === "SHIP") {
        setSuccessMessage(
          "Đăng ký thành công! Vui lòng chờ BTC xác nhận phiếu. BTC sẽ liên hệ với bạn về việc giao hàng.",
        );
      } else if (selectedSlot) {
        setSuccessMessage(
          `Đăng ký thành công! Lịch nhận: ${selectedSlot.pickup_location} · ${formatDate(
            selectedSlot.pickup_date,
          )} · ${formatTime(selectedSlot.pickup_start_time)} - ${formatTime(
            selectedSlot.pickup_end_time,
          )}. Vui lòng chờ BTC xác nhận phiếu.`,
        );
      }

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
        err instanceof Error ? err.message : "Không thể đăng ký nhận đồ.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(dateString: string) {
    if (!dateString) return "";

    const [year, month, day] = dateString.split("-");

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
      (slot) => slot.item_id === itemId && slot.is_active,
    );
  }

  function isItemAvailable(item: Item) {
    // Sản phẩm còn hàng thì có thể đăng ký.
    // Nếu chọn lấy trực tiếp, sinh viên sẽ cần lịch nhận do BTC mở.
    return getRemainingQuantity(item) > 0;
  }

  const locationOptions = Array.from(
    new Set(
      pickupSlots
        .filter((slot) => slot.is_active)
        .map((slot) => slot.pickup_location.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "vi"));

  const categoryOptions = Array.from(
    new Set(
      items
        .map((item) => item.category?.trim())
        .filter((category): category is string => Boolean(category)),
    ),
  ).sort((a, b) => a.localeCompare(b, "vi"));

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredItems = items
    .filter((item) => {
      if (!normalizedSearch) return true;
      return [item.name, item.item_code, item.category, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .filter((item) => {
      if (categoryFilter === "all") return true;
      return item.category?.trim() === categoryFilter;
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
        (slot) => slot.pickup_location === locationFilter,
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

  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMoreItems = visibleCount < filteredItems.length;

  const availableItemCount = items.filter(
    (item) => getRemainingQuantity(item) > 0,
  ).length;

  const pickupLocationCount = locationOptions.length;

  return (
    <main
      className={`${beVietnamPro.className} min-h-screen bg-[#f5f8f6] text-slate-800`}
    >
      <div className="border-b border-emerald-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-600 text-xl text-white shadow-sm">
              S
            </span>
            <span>
              <span className="block text-sm font-extrabold uppercase tracking-[0.16em] text-emerald-700">
                Trạm sạc nhà S
              </span>
              <span className="block text-xs font-medium text-slate-500">
                Trao đi · Nhận lại · Kết nối
              </span>
            </span>
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-amber-200/70 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-extrabold text-slate-900">Đã đăng ký nhận đồ?</p>
            <p className="mt-1 text-sm text-slate-600">
              Nhập họ tên và số điện thoại để xem tình trạng phiếu đăng ký.
            </p>
          </div>
          <a
            href="/theo-doi"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-700 hover:shadow-md"
          >
            Theo dõi đăng ký →
          </a>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="relative mb-8 overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-500 px-6 py-9 text-white shadow-xl shadow-emerald-900/10 sm:px-10 sm:py-12">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10" />
          <div className="absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-lime-300/10" />
          <div className="relative max-w-3xl">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-emerald-100">
              Kho đồ sẻ chia
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              Tìm một món đồ
              <br className="hidden sm:block" /> bạn đang cần.
            </h1>
            <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-emerald-50 sm:text-lg">
              Mỗi món đồ được trao đi là một vòng đời mới được bắt đầu. Tìm
              kiếm, chọn lịch và đăng ký chỉ trong vài bước.
            </p>
            <div className="mt-7 flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-white/15 px-4 py-2 font-semibold backdrop-blur">
                <b>{items.length}</b> vật phẩm
              </span>
              <span className="rounded-full bg-white/15 px-4 py-2 font-semibold backdrop-blur">
                <b>{availableItemCount}</b> còn có thể nhận
              </span>
              <span className="rounded-full bg-white/15 px-4 py-2 font-semibold backdrop-blur">
                <b>{pickupLocationCount}</b> điểm nhận
              </span>
            </div>
          </div>
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
          <section className="mb-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 md:p-6">
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
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-base font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                >
                  <option value="all">Tất cả danh mục</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <select
                  value={stockFilter}
                  onChange={(e) =>
                    setStockFilter(
                      e.target.value as "all" | "available" | "out",
                    )
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                >
                  <option value="all">Tất cả sản phẩm</option>
                  <option value="available">Còn hàng</option>
                  <option value="out">Hết hàng</option>
                </select>

                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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
                      e.target.value as
                        "newest" | "name-asc" | "remaining-desc",
                    )
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
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
                        ? "bg-emerald-600 text-white shadow-sm"
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
                        ? "bg-emerald-600 text-white shadow-sm"
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
                  Tìm thấy <b>{filteredItems.length}</b> / {items.length} sản
                  phẩm
                </p>
              </div>

              {(searchQuery ||
                categoryFilter !== "all" ||
                stockFilter !== "all" ||
                locationFilter !== "all" ||
                sortOption !== "newest" ||
                onlyAvailable) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setCategoryFilter("all");
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
            <p className="text-lg text-slate-500">Đang tải dữ liệu...</p>
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
                setCategoryFilter("all");
                setStockFilter("all");
                setLocationFilter("all");
                setSortOption("newest");
                setOnlyAvailable(false);
              }}
              className="mt-6 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <>
            <div
              className={`grid gap-6 ${
                viewMode === "1" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
              }`}
            >
              {visibleItems.map((item) => {
                const remaining = getRemainingQuantity(item);
                const available = isItemAvailable(item);

                return (
                  <div
                    key={item.id}
                    className={`group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/80 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/10 ${
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
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="text-lg text-slate-400">
                          Không có ảnh
                        </span>
                      )}
                    </div>

                    <div
                      className={`p-6 ${viewMode === "1" ? "lg:flex-1" : ""}`}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <span className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-extrabold tracking-wide text-emerald-700">
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
                            ? "Có thể đăng ký"
                            : remaining <= 0
                              ? "Đã hết"
                              : "Không khả dụng"}
                        </span>
                      </div>

                      <h2 className="text-2xl font-extrabold leading-snug text-slate-900">
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

                      <button
                        type="button"
                        onClick={() => setSelectedDetail(item)}
                        className="mt-6 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-base font-extrabold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                      >
                        Xem chi tiết
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
              <p className="text-sm font-medium text-slate-500">
                Đang hiển thị {visibleItems.length} / {filteredItems.length} sản
                phẩm
              </p>
              {hasMoreItems && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((current) => current + ITEMS_PER_PAGE)
                  }
                  className="rounded-2xl bg-emerald-600 px-7 py-3.5 font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-emerald-200"
                >
                  Xem thêm{" "}
                  {Math.min(
                    ITEMS_PER_PAGE,
                    filteredItems.length - visibleItems.length,
                  )}{" "}
                  sản phẩm
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {selectedDetail && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedDetail(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            <div className="relative">
              {selectedDetail.image_url ? (
                <img
                  src={selectedDetail.image_url}
                  alt={selectedDetail.name}
                  className="h-64 w-full object-cover sm:h-80"
                />
              ) : (
                <div className="flex h-56 items-center justify-center bg-slate-100 text-slate-400">
                  Không có ảnh
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                aria-label="Đóng chi tiết"
                className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/95 text-2xl text-slate-600 shadow-lg transition hover:bg-white hover:text-slate-900"
              >
                ×
              </button>
            </div>

            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold tracking-wide text-emerald-700">
                    {selectedDetail.item_code ?? "MÃ ĐỒ"}
                  </span>
                  <h2 className="mt-4 text-3xl font-extrabold leading-tight text-slate-900">
                    {selectedDetail.name}
                  </h2>
                  {selectedDetail.category && (
                    <p className="mt-2 text-slate-500">
                      {selectedDetail.category}
                    </p>
                  )}
                </div>
                <span
                  className={`rounded-full px-4 py-2 text-sm font-bold ${
                    getRemainingQuantity(selectedDetail) > 0
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {getRemainingQuantity(selectedDetail) > 0
                    ? `Còn ${getRemainingQuantity(selectedDetail)} / ${Number(selectedDetail.quantity ?? 1)}`
                    : "Hết hàng"}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-500">
                    Tình trạng
                  </p>
                  <p className="mt-2 font-bold text-slate-900">
                    {selectedDetail.condition || "Chưa cập nhật"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-500">
                    Đã có phiếu đăng ký
                  </p>
                  <p className="mt-2 font-bold text-slate-900">
                    {registeredCounts[selectedDetail.id] ?? 0} phiếu
                  </p>
                </div>
              </div>

              {selectedDetail.description && (
                <div className="mt-6">
                  <h3 className="font-extrabold text-slate-900">
                    Mô tả vật phẩm
                  </h3>
                  <p className="mt-2 leading-7 text-slate-600">
                    {selectedDetail.description}
                  </p>
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/70 p-5">
                <h3 className="font-extrabold text-slate-900">
                  Lịch lấy trực tiếp
                </h3>
                {getItemSlots(selectedDetail.id).length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">
                    BTC chưa mở lịch lấy trực tiếp. Bạn vẫn có thể đăng ký ship
                    hàng.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {getItemSlots(selectedDetail.id).map((slot) => (
                      <div
                        key={slot.id}
                        className="rounded-xl bg-white p-4 text-sm text-slate-700 ring-1 ring-sky-100"
                      >
                        <p className="font-bold text-slate-900">
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
                disabled={getRemainingQuantity(selectedDetail) <= 0}
                onClick={() => {
                  const item = selectedDetail;
                  setSelectedDetail(null);
                  openRegister(item);
                }}
                className="mt-7 w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-extrabold text-white shadow-lg shadow-emerald-600/15 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
              >
                {getRemainingQuantity(selectedDetail) > 0
                  ? "Đăng ký nhận đồ"
                  : "Vật phẩm đã hết hàng"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
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
                {!form.delivery_method ? (
                  <div>
                    <p className="mb-4 text-lg font-bold text-slate-800">
                      Bạn muốn nhận đồ theo hình thức nào?
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={selectedSlots.length === 0}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            delivery_method: "PICKUP",
                          }))
                        }
                        className="rounded-2xl border-2 border-slate-200 bg-white p-6 text-left transition hover:border-emerald-500 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-55 disabled:hover:border-slate-200"
                      >
                        <div className="text-3xl">🏠</div>
                        <p className="mt-3 text-lg font-bold text-slate-900">
                          Bạn muốn đến lấy trực tiếp
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {selectedSlots.length > 0
                            ? "Chọn địa điểm, ngày và khung giờ do BTC mở."
                            : "BTC chưa mở lịch lấy trực tiếp cho vật phẩm này."}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            delivery_method: "SHIP",
                            pickup_slot_id: "",
                          }))
                        }
                        className="rounded-2xl border-2 border-slate-200 bg-white p-6 text-left transition hover:border-emerald-500 hover:bg-emerald-50"
                      >
                        <div className="text-3xl">🚚</div>
                        <p className="mt-3 text-lg font-bold text-slate-900">
                          Bạn muốn ship hàng đến bạn
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Nhập địa chỉ để BTC liên hệ và xử lý giao hàng.
                        </p>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          delivery_method: "",
                        }))
                      }
                      className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      ← Chọn lại hình thức nhận đồ
                    </button>

                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-500">
                        Hình thức nhận
                      </p>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-slate-900">
                        {form.delivery_method === "SHIP"
                          ? "🚚 Ship hàng đến bạn"
                          : "🏠 Đến lấy trực tiếp"}
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-lg font-bold text-slate-800">
                        Họ và tên
                      </label>
                      <input
                        type="text"
                        value={form.full_name}
                        onChange={(e) =>
                          updateForm("full_name", e.target.value)
                        }
                        placeholder="Nguyễn Văn A"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-lg font-bold text-slate-800">
                        Số điện thoại
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => updateForm("phone", e.target.value)}
                        placeholder="0912345678"
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                      />
                    </div>

                    {form.delivery_method === "PICKUP" ? (
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
                        <label className="mb-2 block text-lg font-bold text-slate-800">
                          Chọn lịch nhận đồ
                        </label>
                        <p className="mb-4 text-sm text-slate-600">
                          Bạn chỉ có thể chọn ngày, địa điểm và khung giờ do BTC
                          đã mở.
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
                                    ? "border-emerald-500 bg-white ring-2 ring-emerald-100"
                                    : "border-slate-200 bg-white hover:border-emerald-300"
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
                                        e.target.value,
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
                    ) : (
                      <div>
                        <label className="mb-2 block text-lg font-bold text-slate-800">
                          Địa chỉ nhận hàng
                        </label>
                        <textarea
                          value={form.shipping_address}
                          onChange={(e) =>
                            updateForm("shipping_address", e.target.value)
                          }
                          placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
                          rows={4}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={
                  submitting ||
                  !form.delivery_method ||
                  !form.full_name.trim() ||
                  !form.phone.trim() ||
                  (form.delivery_method === "PICKUP" &&
                    (!form.pickup_slot_id || selectedSlots.length === 0)) ||
                  (form.delivery_method === "SHIP" &&
                    !form.shipping_address.trim())
                }
                onClick={submitRequest}
                className="mt-8 w-full rounded-2xl bg-emerald-600 px-5 py-4 text-base font-extrabold text-white shadow-lg shadow-emerald-600/15 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {submitting ? "Đang đăng ký..." : "Xác nhận đăng ký"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
