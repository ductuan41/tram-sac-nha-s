"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  full_name: string | null;
  student_id: string | null;
  role: string;
};

type Item = {
  id: string;
  item_code: string;
  name: string;
  category: string | null;
  condition: string | null;
  description: string | null;
  image_url: string | null;
  pickup_location: string | null;
  pickup_date: string | null;
  pickup_start_time: string | null;
  pickup_end_time: string | null;
  status: string;
  quantity: number;
};

type PickupSlot = {
  id?: string;
  item_id?: string;
  pickup_location: string;
  pickup_date: string;
  pickup_start_time: string;
  pickup_end_time: string;
  is_active: boolean;
};

type Request = {
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
  pickup_slot_id: string | null;
  delivery_method: "PICKUP" | "SHIP" | null;
  shipping_address: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  delivered_by: string | null;
  delivered_at: string | null;
  delivered_by_name: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
};

function formatTimeForInput(value: string | null | undefined) {
  return normalizeStoredTime(value);
}

function normalizeTimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeStoredTime(value: string | null | undefined) {
  if (!value) return "";

  // Supabase/Postgres time can come back as HH:mm:ss.
  // The form only needs HH:mm.
  const match = value.match(/^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (match) return `${match[1]}:${match[2]}`;

  return value;
}

function isValid24HourTime(value: string | null | undefined) {
  const normalized = normalizeStoredTime(value);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function timeToMinutes(value: string | null | undefined) {
  const normalized = normalizeStoredTime(value);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) return -1;

  return Number(match[1]) * 60 + Number(match[2]);
}

export default function BtcPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [slotsByItem, setSlotsByItem] = useState<Record<string, PickupSlot[]>>({});
  const [slotsById, setSlotsById] = useState<Record<string, PickupSlot>>({});

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Bộ lọc phiếu BTC
  const [requestStatusFilter, setRequestStatusFilter] = useState("PENDING");
  const [requestDeliveryFilter, setRequestDeliveryFilter] = useState<"ALL" | "PICKUP" | "SHIP">("ALL");
  const [requestLocationFilter, setRequestLocationFilter] = useState("");
  const [requestDateFilter, setRequestDateFilter] = useState("");
  const [requestTimeFilter, setRequestTimeFilter] = useState("");

  const requestLocations = Array.from(
    new Set(
      requests
        .map((request) =>
          request.pickup_slot_id
            ? slotsById[request.pickup_slot_id]?.pickup_location
            : request.pickup_location
        )
        .filter(Boolean) as string[]
    )
  ).sort();

  const requestDates = Array.from(
    new Set(
      requests
        .map((request) =>
          request.pickup_slot_id
            ? slotsById[request.pickup_slot_id]?.pickup_date
            : request.pickup_date
        )
        .filter(Boolean) as string[]
    )
  ).sort();

  const requestTimeRanges = Array.from(
    new Set(
      requests
        .map((request) => {
          const slot = request.pickup_slot_id
            ? slotsById[request.pickup_slot_id]
            : undefined;

          if (!slot) return "";
          return `${normalizeStoredTime(slot.pickup_start_time)}-${normalizeStoredTime(
            slot.pickup_end_time
          )}`;
        })
        .filter(Boolean)
    )
  ).sort();

  function getRequestSlot(request: Request) {
    return request.pickup_slot_id
      ? slotsById[request.pickup_slot_id]
      : undefined;
  }

  function getRequestLocation(request: Request) {
    return (
      getRequestSlot(request)?.pickup_location ||
      request.pickup_location ||
      ""
    );
  }

  function getRequestDate(request: Request) {
    return (
      getRequestSlot(request)?.pickup_date ||
      request.pickup_date ||
      ""
    );
  }

  function getRequestTimeRange(request: Request) {
    const slot = getRequestSlot(request);
    if (!slot) return "";

    return `${normalizeStoredTime(slot.pickup_start_time)}-${normalizeStoredTime(
      slot.pickup_end_time
    )}`;
  }

  const filteredRequests = requests.filter((request) => {
    if (
      requestDeliveryFilter !== "ALL" &&
      (request.delivery_method || "PICKUP") !== requestDeliveryFilter
    ) {
      return false;
    }

    if (
      requestStatusFilter !== "ALL" &&
      request.status !== requestStatusFilter
    ) {
      return false;
    }

    if (
      requestLocationFilter &&
      getRequestLocation(request) !== requestLocationFilter
    ) {
      return false;
    }

    if (
      requestDateFilter &&
      getRequestDate(request) !== requestDateFilter
    ) {
      return false;
    }

    if (
      requestTimeFilter &&
      getRequestTimeRange(request) !== requestTimeFilter
    ) {
      return false;
    }

    return true;
  });

  function clearRequestFilters() {
    setRequestStatusFilter("PENDING");
    setRequestDeliveryFilter("ALL");
    setRequestLocationFilter("");
    setRequestDateFilter("");
    setRequestTimeFilter("");
  }

  // =========================================================
  // QUẢN LÝ SẢN PHẨM
  // =========================================================

  const emptyItemForm = {
    item_code: "",
    name: "",
    category: "",
    condition: "",
    description: "",
    image_url: "",
    pickup_location: "",
    pickup_date: "",
    pickup_start_time: "",
    pickup_end_time: "",
    quantity: "1",
  };

  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [itemFormError, setItemFormError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");

  function getItemRequestCount(itemId: string) {
    return requests.filter(
      (request) =>
        request.item_id === itemId &&
        request.status !== "CANCELLED"
    ).length;
  }

  function getItemRemaining(item: Item) {
    const total = Number(item.quantity ?? 1);
    return Math.max(0, total - getItemRequestCount(item.id));
  }

  // =========================================================
  // TẢI DỮ LIỆU
  // =========================================================

  async function loadData(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");

    try {
      // -------------------------------------------------------
      // 1. Kiểm tra tài khoản
      // -------------------------------------------------------

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        setError("Bạn chưa đăng nhập.");
        return;
      }

      // -------------------------------------------------------
      // 2. Lấy profile
      // -------------------------------------------------------

      const { data: profileData, error: profileError } =
        await supabase
          .from("profiles")
          .select("id, full_name, student_id, role")
          .eq("id", user.id)
          .single();

      if (profileError) {
        throw profileError;
      }

      // -------------------------------------------------------
      // 3. Kiểm tra quyền BTC
      // -------------------------------------------------------

      if (profileData.role !== "btc") {
        setError("Tài khoản này không có quyền BTC.");
        return;
      }

      const displayName =
        profileData.full_name?.trim() ||
        (typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name.trim()
          : "") ||
        user.email ||
        "BTC";

      setProfile({ ...profileData, full_name: displayName });

      // -------------------------------------------------------
      // 4. Lấy danh sách đồ
      // -------------------------------------------------------

      const { data: itemsData, error: itemsError } =
        await supabase
          .from("items")
          .select(
            "id, item_code, name, category, condition, description, image_url, pickup_location, pickup_date, pickup_start_time, pickup_end_time, status, quantity"
          )
          .order("created_at", {
            ascending: false,
          });

      if (itemsError) {
        throw itemsError;
      }

      setItems(itemsData || []);

      // -------------------------------------------------------
      // 5. Lấy toàn bộ lịch nhận đồ do BTC tạo
      // -------------------------------------------------------
      const { data: slotsData, error: slotsError } = await supabase
        .from("pickup_slots")
        .select(
          "id, item_id, pickup_location, pickup_date, pickup_start_time, pickup_end_time, is_active"
        )
        .eq("is_active", true)
        .order("pickup_date", { ascending: true })
        .order("pickup_start_time", { ascending: true });

      if (slotsError) {
        throw slotsError;
      }

      const groupedSlots: Record<string, PickupSlot[]> = {};
      (slotsData || []).forEach((slot: PickupSlot) => {
        if (!groupedSlots[slot.item_id || ""]) {
          groupedSlots[slot.item_id || ""] = [];
        }
        groupedSlots[slot.item_id || ""].push(slot);
      });
      setSlotsByItem(groupedSlots);

      // -------------------------------------------------------
      // 6. Lấy phiếu nhận đồ
      // -------------------------------------------------------

      const {
        data: requestData,
        error: requestError,
      } = await supabase
        .from("requests")
        .select(
          `
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
          pickup_slot_id,
          delivery_method,
          shipping_address,
          approved_by,
          approved_at,
          approved_by_name,
          delivered_by,
          delivered_at,
          delivered_by_name,
          cancelled_by,
          cancelled_at,
          cancelled_by_name
        `
        )
        .order("created_at", {
          ascending: false,
        });

      if (requestError) {
        throw requestError;
      }

      setRequests(requestData || []);

      const slotMap: Record<string, PickupSlot> = {};
      (slotsData || []).forEach((slot: PickupSlot) => {
        if (slot.id) slotMap[slot.id] = slot;
      });
      setSlotsById(slotMap);
    } catch (err: any) {
      console.error("BTC load error:", err);

      setError(
        err?.message ||
          "Không tải được dữ liệu BTC."
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  // =========================================================
  // LOAD LẦN ĐẦU + REALTIME
  // =========================================================
  // Khi sinh viên tạo/hủy phiếu, hoặc BTC thay đổi sản phẩm/lịch,
  // Supabase Realtime sẽ báo sự kiện để trang tự tải lại dữ liệu.
  // Không cần F5.
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollInFlight = false;

    const refreshData = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        console.log("🔄 BTC Realtime: có thay đổi, đang tải lại...");
        void loadData(false);
      }, 300);
    };

    const addRequestImmediately = (row: Record<string, unknown>) => {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) return;

      setRequests((current) => {
        if (current.some((request) => request.id === id)) {
          return current;
        }

        return [row as unknown as Request, ...current];
      });
    };

    const updateRequestImmediately = (row: Record<string, unknown>) => {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) return;

      setRequests((current) => {
        const exists = current.some((request) => request.id === id);

        if (!exists) {
          return [row as unknown as Request, ...current];
        }

        return current.map((request) =>
          request.id === id
            ? ({ ...request, ...row } as Request)
            : request
        );
      });
    };

    const removeRequestImmediately = (row: Record<string, unknown>) => {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) return;

      setRequests((current) =>
        current.filter((request) => request.id !== id)
      );
    };

    async function setupRealtime() {
      // Tải dữ liệu ban đầu
      await loadData();

      // Lấy session BTC hiện tại
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("❌ Không lấy được session:", sessionError);
        return;
      }

      if (!session) {
        console.error("❌ Không có auth session BTC");
        return;
      }

      // Đưa access token hiện tại cho Realtime
      await supabase.realtime.setAuth(session.access_token);

      console.log("🔐 BTC Realtime: đã set auth");

      channel = supabase
        .channel(`btc-data-realtime-${session.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "requests",
          },
          (payload) => {
            console.log("🟢 BTC Realtime REQUEST INSERT:", payload);

            // Cập nhật UI ngay lập tức.
            addRequestImmediately(payload.new as Record<string, unknown>);

            // Sau đó tải lại để lấy dữ liệu đầy đủ/đồng bộ tuyệt đối.
            refreshData();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "requests",
          },
          (payload) => {
            console.log("🟡 BTC Realtime REQUEST UPDATE:", payload);

            updateRequestImmediately(
              payload.new as Record<string, unknown>
            );

            refreshData();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "requests",
          },
          (payload) => {
            console.log("🔴 BTC Realtime REQUEST DELETE:", payload);

            removeRequestImmediately(
              payload.old as Record<string, unknown>
            );

            refreshData();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "items",
          },
          (payload) => {
            console.log("📦 BTC Realtime ITEMS:", payload);
            refreshData();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pickup_slots",
          },
          (payload) => {
            console.log("📅 BTC Realtime PICKUP SLOTS:", payload);
            refreshData();
          }
        )
        .subscribe((status, err) => {
          console.log("📡 BTC Realtime status:", status);

          if (err) {
            console.error("❌ BTC Realtime error:", err);
          }

          if (status === "SUBSCRIBED") {
            console.log("✅ BTC Realtime đã kết nối thành công!");
            console.log(
              "🟢 BTC Realtime đang nghe INSERT/UPDATE/DELETE của requests."
            );
          }

          if (status === "CHANNEL_ERROR") {
            console.error("❌ BTC Realtime CHANNEL_ERROR");
          }

          if (status === "TIMED_OUT") {
            console.error("⏰ BTC Realtime TIMED_OUT");
          }
        });

      /*
       * FALLBACK:
       * Nếu Supabase Realtime không gửi event vì cấu hình RLS/publication
       * hoặc trình duyệt mất kết nối tạm thời, BTC vẫn tự thấy phiếu mới.
       *
       * Đây không phải F5 và không cần người dùng thao tác gì.
       */
      pollTimer = setInterval(async () => {
        if (pollInFlight) return;

        pollInFlight = true;

        try {
          await loadData(false);
        } catch (error) {
          console.error("❌ BTC fallback refresh error:", error);
        } finally {
          pollInFlight = false;
        }
      }, 3000);

      console.log(
        "🔁 BTC fallback refresh đã bật: kiểm tra dữ liệu mỗi 3 giây."
      );
    }

    void setupRealtime();

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      if (pollTimer) {
        clearInterval(pollTimer);
      }

      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, []);

  // =========================================================
  // KIỂM TRA QUYỀN BTC TRƯỚC MỌI THAO TÁC THAY ĐỔI
  // =========================================================
  // Không chỉ dựa vào giao diện: mỗi thao tác ghi/xóa đều gọi
  // public.is_btc() để kiểm tra lại quyền trên Supabase.
  async function ensureBtcPermission() {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      const msg = "Bạn cần đăng nhập tài khoản BTC.";
      setError(msg);
      setItemFormError(msg);
      return false;
    }

    const { data: isBtc, error: rpcError } =
      await supabase.rpc("is_btc");

    if (rpcError) {
      console.error("BTC permission check error:", rpcError);
      const msg = "Không kiểm tra được quyền BTC. Vui lòng thử lại.";
      setError(msg);
      setItemFormError(msg);
      return false;
    }

    if (isBtc !== true) {
      const msg = "Chỉ tài khoản BTC mới được phép thay đổi dữ liệu.";
      setError(msg);
      setItemFormError(msg);
      return false;
    }

    return true;
  }

  // =========================================================
  // THÊM / SỬA / XÓA SẢN PHẨM
  // =========================================================

  async function openCreateItem() {
    if (!(await ensureBtcPermission())) {
      return;
    }

    setEditingItem(null);
    setItemForm(emptyItemForm);
    setPickupSlots([
      {
        pickup_location: "",
        pickup_date: "",
        pickup_start_time: "",
        pickup_end_time: "",
        is_active: true,
      },
    ]);
    setImageFile(null);
    setImagePreview("");
    setError("");
    setMessage("");
    setItemFormError("");
    setShowItemForm(true);
  }

  async function openEditItem(item: Item) {
    if (!(await ensureBtcPermission())) {
      return;
    }

    setEditingItem(item);
    setItemForm({
      item_code: item.item_code || "",
      name: item.name || "",
      category: item.category || "",
      condition: item.condition || "",
      description: item.description || "",
      image_url: item.image_url || "",
      pickup_location: item.pickup_location || "",
      pickup_date: item.pickup_date || "",
      pickup_start_time: item.pickup_start_time || "",
      pickup_end_time: item.pickup_end_time || "",
      quantity: String(item.quantity ?? 1),
    });

    setImageFile(null);
    setImagePreview(item.image_url || "");
    setError("");
    setMessage("");
    setItemFormError("");

    const { data, error: slotsError } = await supabase
      .from("pickup_slots")
      .select(
        "id, item_id, pickup_location, pickup_date, pickup_start_time, pickup_end_time, is_active"
      )
      .eq("item_id", item.id)
      .eq("is_active", true)
      .order("pickup_date", { ascending: true })
      .order("pickup_start_time", { ascending: true });

    if (slotsError) {
      setItemFormError(`Không tải được lịch nhận đồ: ${slotsError.message}`);
      setPickupSlots([]);
    } else if (data && data.length > 0) {
      setPickupSlots(
        (data as PickupSlot[]).map((slot) => ({
          ...slot,
          pickup_start_time: normalizeStoredTime(slot.pickup_start_time),
          pickup_end_time: normalizeStoredTime(slot.pickup_end_time),
        }))
      );
    } else {
      setPickupSlots([
        {
          pickup_location: item.pickup_location || "",
          pickup_date: item.pickup_date || "",
          pickup_start_time: normalizeStoredTime(item.pickup_start_time),
          pickup_end_time: normalizeStoredTime(item.pickup_end_time),
          is_active: true,
        },
      ]);
    }

    setShowItemForm(true);
  }

  function closeItemForm() {
    if (savingItem) return;
    setShowItemForm(false);
    setEditingItem(null);
    setItemForm(emptyItemForm);
    setPickupSlots([]);
    setImageFile(null);
    setImagePreview("");
    setItemFormError("");
  }

  async function saveItem() {
    setMessage("");
    setError("");
    setItemFormError("");

    if (!(await ensureBtcPermission())) {
      return;
    }

    const itemCode = itemForm.item_code.trim();
    const itemName = itemForm.name.trim();

    if (!itemCode || !itemName) {
      setItemFormError("Vui lòng nhập đầy đủ Mã sản phẩm và Tên sản phẩm.");
      return;
    }

    const quantity = Number(itemForm.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setItemFormError("Số lượng phải là số nguyên lớn hơn hoặc bằng 1.");
      return;
    }

    const cleanedSlots = pickupSlots
      .map((slot) => ({
        ...slot,
        pickup_location: slot.pickup_location.trim(),
      }))
      .filter(
        (slot) =>
          slot.pickup_location ||
          slot.pickup_date ||
          slot.pickup_start_time ||
          slot.pickup_end_time
      );

    if (cleanedSlots.length === 0) {
      setItemFormError("Vui lòng thêm ít nhất một lịch nhận đồ.");
      return;
    }

    for (let index = 0; index < cleanedSlots.length; index++) {
      const slot = cleanedSlots[index];

      if (
        !slot.pickup_location ||
        !slot.pickup_date ||
        !slot.pickup_start_time ||
        !slot.pickup_end_time
      ) {
        setItemFormError(
          `Lịch số ${index + 1}: vui lòng nhập đủ địa điểm, ngày và giờ.`
        );
        return;
      }

      const startTime = normalizeStoredTime(slot.pickup_start_time);
      const endTime = normalizeStoredTime(slot.pickup_end_time);

      if (!isValid24HourTime(startTime) || !isValid24HourTime(endTime)) {
        setItemFormError(
          `Lịch số ${index + 1}: giờ phải có dạng 24 giờ HH:mm, ví dụ 07:30 hoặc 14:00.`
        );
        return;
      }

      if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
        setItemFormError(
          `Lịch số ${index + 1}: giờ kết thúc phải sau giờ bắt đầu.`
        );
        return;
      }

      // Normalize values before sending them to Supabase.
      cleanedSlots[index].pickup_start_time = startTime;
      cleanedSlots[index].pickup_end_time = endTime;
    }

    if (imageFile && !imageFile.type.startsWith("image/")) {
      setItemFormError("File đã chọn không phải là ảnh.");
      return;
    }

    if (imageFile && imageFile.size > 5 * 1024 * 1024) {
      setItemFormError("Ảnh tối đa 5MB.");
      return;
    }

    setSavingItem(true);

    try {
      let imageUrl = itemForm.image_url.trim() || null;

      if (imageFile) {
        const extension =
          imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const filePath = `items/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("item-images")
          .upload(filePath, imageFile, {
            cacheControl: "3600",
            contentType: imageFile.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("item-images")
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
      }

      const firstSlot = {
        ...cleanedSlots[0],
        pickup_start_time: normalizeStoredTime(cleanedSlots[0].pickup_start_time),
        pickup_end_time: normalizeStoredTime(cleanedSlots[0].pickup_end_time),
      };

      // Giữ các cột lịch cũ trong items để tương thích.
      // Lịch đầy đủ được lưu trong pickup_slots.
      const payload = {
        item_code: itemCode,
        name: itemName,
        category: itemForm.category.trim() || null,
        condition: itemForm.condition.trim() || null,
        description: itemForm.description.trim() || null,
        image_url: imageUrl,
        pickup_location: firstSlot.pickup_location,
        pickup_date: firstSlot.pickup_date,
        pickup_start_time: firstSlot.pickup_start_time,
        pickup_end_time: firstSlot.pickup_end_time,
        quantity,
      };

      let itemId = editingItem?.id;

      if (editingItem) {
        const { error: updateError } = await supabase
          .from("items")
          .update(payload)
          .eq("id", editingItem.id);

        if (updateError) throw updateError;

        const { error: deleteSlotsError } = await supabase
          .from("pickup_slots")
          .delete()
          .eq("item_id", editingItem.id);

        if (deleteSlotsError) throw deleteSlotsError;
      } else {
        const { data: insertedItem, error: insertError } = await supabase
          .from("items")
          .insert({
            ...payload,
            status: "AVAILABLE",
          })
          .select("id")
          .single();

        if (insertError) throw insertError;

        itemId = insertedItem.id;
      }

      if (!itemId) {
        throw new Error("Không xác định được ID sản phẩm.");
      }

      const slotRows = cleanedSlots.map((slot) => ({
        item_id: itemId,
        pickup_location: slot.pickup_location,
        pickup_date: slot.pickup_date,
        pickup_start_time: normalizeStoredTime(slot.pickup_start_time),
        pickup_end_time: normalizeStoredTime(slot.pickup_end_time),
        is_active: true,
      }));

      const { error: slotsInsertError } = await supabase
        .from("pickup_slots")
        .insert(slotRows);

      if (slotsInsertError) throw slotsInsertError;

      setMessage(
        editingItem
          ? "Đã cập nhật sản phẩm và toàn bộ lịch nhận đồ."
          : "Đã thêm sản phẩm và lịch nhận đồ vào kho."
      );

      closeItemForm();
      await loadData();
    } catch (err: any) {
      console.error("Save item error:", err);

      const errorMessage =
        err?.message || "Không thể lưu sản phẩm.";

      setItemFormError(errorMessage);
      setError(errorMessage);
      window.alert(`Không thể lưu sản phẩm:
${errorMessage}`);
    } finally {
      setSavingItem(false);
    }
  }

  async function deleteItem(item: Item) {
    if (!(await ensureBtcPermission())) {
      return;
    }

    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa "${item.name}" (${item.item_code}) không?`
    );

    if (!confirmed) return;

    setMessage("");
    setError("");
    setProcessingId(item.id);

    try {
      const { error: deleteError } = await supabase
        .from("items")
        .delete()
        .eq("id", item.id);

      if (deleteError) throw deleteError;

      setMessage(`Đã xóa sản phẩm ${item.item_code}.`);
      await loadData();
    } catch (err: any) {
      console.error("Delete item error:", err);
      setError(
        err?.message ||
          "Không thể xóa sản phẩm. Nếu sản phẩm đã có phiếu nhận, hãy giữ lại sản phẩm thay vì xóa."
      );
    } finally {
      setProcessingId(null);
    }
  }

  // =========================================================
  // BTC DUYỆT PHIẾU / XÁC NHẬN ĐÃ GIAO ĐỒ
  // =========================================================

  async function processRequest(request: Request) {
    setMessage("");
    setError("");

    if (!(await ensureBtcPermission())) {
      return;
    }

    setProcessingId(request.id);

    try {
      const { error: rpcError } = await supabase.rpc(
        "process_pickup_request_by_btc",
        { p_request_id: request.id }
      );

      if (rpcError) throw rpcError;

      setMessage(
        request.status === "PENDING"
          ? "Đã duyệt phiếu thành công."
          : "Đã xác nhận giao đồ thành công!"
      );
      await loadData();
    } catch (err: any) {
      console.error("Process request error:", err);
      setError(err?.message || "Không thể xử lý phiếu.");
    } finally {
      setProcessingId(null);
    }
  }

  // =========================================================
  // HỦY PHIẾU
  // =========================================================

  async function cancelRequest(request: Request) {
    setMessage("");
    setError("");

    if (!(await ensureBtcPermission())) {
      return;
    }

    setProcessingId(request.id);

    try {
      const { error: rpcError } = await supabase.rpc(
        "cancel_pickup_request_by_btc",
        { p_request_id: request.id }
      );

      if (rpcError) throw rpcError;

      setMessage("Đã hủy phiếu và trả đồ về kho.");
      await loadData();
    } catch (err: any) {
      console.error("Cancel request error:", err);
      setError(err?.message || "Không thể hủy phiếu.");
    } finally {
      setProcessingId(null);
    }
  }

  // =========================================================
  // ĐĂNG XUẤT
  // =========================================================

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/dang-nhap";
  }

  // =========================================================
  // ĐANG TẢI
  // =========================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="rounded-2xl bg-white border border-slate-200 px-8 py-6 shadow-sm">
          <p className="text-xl text-slate-600">
            Đang tải trang BTC...
          </p>
        </div>
      </main>
    );
  }

  // =========================================================
  // KHÔNG CÓ QUYỀN
  // =========================================================

  if (error && !profile) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-red-700">
            {error}
          </div>
        </div>
      </main>
    );
  }

  // =========================================================
  // PHIẾU ĐANG CHỜ
  // =========================================================

  const waitingRequests = filteredRequests;

  // =========================================================
  // GIAO DIỆN
  // =========================================================

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* HEADER */}

        <div className="flex items-start justify-between gap-6 mb-8">
          <div>
            <p className="text-blue-600 font-bold text-lg">
              TRẠM SẠC NHÀ S
            </p>

            <h1 className="text-5xl font-black text-slate-900 mt-2">
              Trang BTC
            </h1>

            <p className="text-slate-600 text-lg mt-3">
              Quản lý việc giao và nhận đồ.
            </p>

            {profile?.full_name && (
              <p className="text-blue-700 font-semibold mt-2">
                Xin chào, {profile.full_name}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:bg-slate-100"
          >
            Đăng xuất
          </button>
        </div>

        {/* THÔNG BÁO */}

        {message && (
          <div className="rounded-2xl bg-green-50 border border-green-200 p-6 mb-6 text-green-700 text-lg">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6 mb-6 text-red-700">
            {error}
          </div>
        )}

        {/* =====================================================
            PHIẾU ĐANG CHỜ GIAO
        ===================================================== */}

        <section className="mb-12">

          <div className="flex items-end justify-between gap-5 mb-5">
            <div>
              <h2 className="text-3xl font-black text-slate-900">
                Quản lý phiếu nhận đồ
              </h2>

              <p className="text-slate-600 mt-2">
                Lọc nhanh theo trạng thái, hình thức nhận, địa điểm, ngày và khung giờ.
              </p>
            </div>

            <div className="rounded-full bg-orange-100 text-orange-700 px-5 py-3 font-bold whitespace-nowrap">
              {waitingRequests.length} phiếu
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <label className="block">
                <span className="font-semibold text-slate-700">
                  Trạng thái
                </span>
                <select
                  value={requestStatusFilter}
                  onChange={(e) => setRequestStatusFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                >
                  <option value="PENDING">Chờ giao</option>
                  <option value="APPROVED">Đã duyệt</option>
                  <option value="DELIVERED">Đã giao</option>
                  <option value="CANCELLED">Đã hủy</option>
                  <option value="ALL">Tất cả</option>
                </select>
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700">
                  Hình thức nhận
                </span>
                <select
                  value={requestDeliveryFilter}
                  onChange={(e) =>
                    setRequestDeliveryFilter(
                      e.target.value as "ALL" | "PICKUP" | "SHIP"
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                >
                  <option value="ALL">Tất cả</option>
                  <option value="PICKUP">🏠 Lấy trực tiếp</option>
                  <option value="SHIP">🚚 Ship hàng</option>
                </select>
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700">
                  Địa điểm
                </span>
                <select
                  value={requestLocationFilter}
                  onChange={(e) => setRequestLocationFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                >
                  <option value="">Tất cả địa điểm</option>
                  {requestLocations.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700">
                  Ngày nhận
                </span>
                <select
                  value={requestDateFilter}
                  onChange={(e) => setRequestDateFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                >
                  <option value="">Tất cả ngày</option>
                  {requestDates.map((date) => (
                    <option key={date} value={date}>
                      {new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN")}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-semibold text-slate-700">
                  Khung giờ
                </span>
                <select
                  value={requestTimeFilter}
                  onChange={(e) => setRequestTimeFilter(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                >
                  <option value="">Tất cả khung giờ</option>
                  {requestTimeRanges.map((range) => {
                    const [start, end] = range.split("-");
                    return (
                      <option key={range} value={range}>
                        {start} - {end}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={() => setRequestDeliveryFilter("ALL")}
                className={`rounded-full px-4 py-2 text-sm font-bold border ${
                  requestDeliveryFilter === "ALL"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                Tất cả hình thức
              </button>
              <button
                type="button"
                onClick={() => setRequestDeliveryFilter("PICKUP")}
                className={`rounded-full px-4 py-2 text-sm font-bold border ${
                  requestDeliveryFilter === "PICKUP"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                🏠 Lấy trực tiếp ({requests.filter((r) => (r.delivery_method || "PICKUP") === "PICKUP").length})
              </button>
              <button
                type="button"
                onClick={() => setRequestDeliveryFilter("SHIP")}
                className={`rounded-full px-4 py-2 text-sm font-bold border ${
                  requestDeliveryFilter === "SHIP"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                🚚 Ship hàng ({requests.filter((r) => r.delivery_method === "SHIP").length})
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
              <p className="text-sm text-slate-500">
                Đang hiển thị{" "}
                <span className="font-bold text-slate-800">
                  {filteredRequests.length}
                </span>{" "}
                / {requests.length} phiếu
              </p>

              <button
                type="button"
                onClick={clearRequestFilters}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Xóa bộ lọc
              </button>
            </div>
          </div>

          {waitingRequests.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 p-8 text-slate-500 shadow-sm">
              Hiện không có phiếu nào đang chờ giao.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {waitingRequests.map((request) => {

                const item = items.find(
                  (currentItem) =>
                    currentItem.id ===
                    request.item_id
                );

                const isProcessing =
                  processingId === request.id;

                return (
                  <div
                    key={request.id}
                    className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm"
                  >

                    {/* MÃ ĐỒ */}

                    <div className="flex items-center justify-between gap-4">

                      <span className="rounded-full bg-blue-50 text-blue-600 px-4 py-2 font-bold">
                        {item?.item_code || "Không rõ mã"}
                      </span>

                      <span
                        className={`rounded-full px-4 py-2 font-semibold ${
                          request.status === "DELIVERED"
                            ? "bg-blue-50 text-blue-600"
                            : request.status === "CANCELLED"
                              ? "bg-red-50 text-red-600"
                              : request.status === "APPROVED"
                                ? "bg-green-50 text-green-600"
                                : "bg-orange-50 text-orange-600"
                        }`}
                      >
                        {request.status === "DELIVERED"
                          ? "Đã giao"
                          : request.status === "CANCELLED"
                            ? "Đã hủy"
                            : request.status === "APPROVED"
                              ? "Đã duyệt"
                              : "Chờ giao"}
                      </span>

                    </div>

                    {/* TÊN ĐỒ */}

                    <h3 className="text-2xl font-black text-slate-900 mt-6">
                      {item?.name || "Không rõ món đồ"}
                    </h3>

                    {item?.category && (
                      <p className="text-slate-600 mt-2">
                        {item.category}
                      </p>
                    )}

                    {/* THÔNG TIN NGƯỜI NHẬN */}

                    <div className="mt-6 rounded-xl bg-slate-50 p-5">

                      <p className="font-bold text-slate-900 mb-3">
                        Thông tin người nhận
                      </p>

                      <p className="text-slate-700">
                        <span className="font-semibold">
                          Họ tên:
                        </span>{" "}
                        {request.full_name ||
                          request.student_name ||
                          "Chưa có"}
                      </p>

                      <p className="text-slate-700 mt-2">
                        <span className="font-semibold">
                          SĐT:
                        </span>{" "}
                        {request.phone ||
                          "Chưa có"}
                      </p>

                      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                        <p className="font-bold text-slate-900">
                          Hình thức nhận đồ
                        </p>

                        {request.delivery_method === "SHIP" ? (
                          <>
                            <p className="text-slate-700 mt-2">
                              🚚 <span className="font-semibold">Ship hàng</span>
                            </p>
                            <p className="text-slate-700 mt-2">
                              <span className="font-semibold">
                                Địa chỉ nhận:
                              </span>{" "}
                              {request.shipping_address || "Chưa có"}
                            </p>
                            <p className="text-sm text-slate-500 mt-3">
                              BTC liên hệ sinh viên để xử lý việc giao hàng.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-slate-700 mt-2">
                              🏠 <span className="font-semibold">Đến lấy trực tiếp</span>
                            </p>

                            {(() => {
                              const slot = request.pickup_slot_id
                                ? slotsById[request.pickup_slot_id]
                                : undefined;

                              const location =
                                slot?.pickup_location ||
                                request.pickup_location ||
                                "Chưa có";

                              const date =
                                slot?.pickup_date ||
                                request.pickup_date;

                              return (
                                <>
                                  <p className="text-slate-700 mt-2">
                                    <span className="font-semibold">
                                      Nơi lấy:
                                    </span>{" "}
                                    {location}
                                  </p>

                                  <p className="text-slate-700 mt-2">
                                    <span className="font-semibold">
                                      Ngày lấy:
                                    </span>{" "}
                                    {date
                                      ? new Date(
                                          `${date}T00:00:00`
                                        ).toLocaleDateString("vi-VN")
                                      : "Chưa có"}
                                  </p>

                                  <p className="text-slate-700 mt-2">
                                    <span className="font-semibold">
                                      Khung giờ:
                                    </span>{" "}
                                    {slot
                                      ? `${normalizeStoredTime(slot.pickup_start_time)} - ${normalizeStoredTime(slot.pickup_end_time)}`
                                      : "Chưa có"}
                                  </p>
                                </>
                              );
                            })()}
                          </>
                        )}
                      </div>

                    </div>

                    {(request.approved_by_name ||
                      request.delivered_by_name ||
                      request.cancelled_by_name) && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="font-bold text-slate-900">Lịch sử thao tác</p>
                        {request.approved_by_name && (
                          <p className="text-sm text-slate-600 mt-2">
                            ✅ Duyệt phiếu: <span className="font-semibold">{request.approved_by_name}</span>
                            {request.approved_at ? ` · ${new Date(request.approved_at).toLocaleString("vi-VN")}` : ""}
                          </p>
                        )}
                        {request.delivered_by_name && (
                          <p className="text-sm text-slate-600 mt-2">
                            📦 Giao đồ: <span className="font-semibold">{request.delivered_by_name}</span>
                            {request.delivered_at ? ` · ${new Date(request.delivered_at).toLocaleString("vi-VN")}` : ""}
                          </p>
                        )}
                        {request.cancelled_by_name && (
                          <p className="text-sm text-slate-600 mt-2">
                            ❌ Hủy phiếu: <span className="font-semibold">{request.cancelled_by_name}</span>
                            {request.cancelled_at ? ` · ${new Date(request.cancelled_at).toLocaleString("vi-VN")}` : ""}
                          </p>
                        )}
                      </div>
                    )}

                    {/* MÃ PHIẾU */}

                    <p className="text-sm text-slate-400 mt-4 break-all">
                      Mã phiếu: {request.id}
                    </p>

                    {/* NGÀY TẠO */}

                    {request.created_at && (
                      <p className="text-sm text-slate-400 mt-1">
                        Đăng ký lúc:{" "}
                        {new Date(
                          request.created_at
                        ).toLocaleString("vi-VN")}
                      </p>
                    )}

                    {(request.status === "PENDING" ||
                      request.status === "APPROVED") && (
                      <>
                        {/* XÁC NHẬN */}

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() =>
                            processRequest(request)
                          }
                          className="w-full mt-6 rounded-xl bg-blue-600 text-white py-4 font-bold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessing
                            ? "Đang xử lý..."
                            : request.status === "PENDING"
                              ? "Duyệt phiếu"
                              : "Xác nhận đã giao đồ"}
                        </button>

                        {/* HỦY */}

                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() =>
                            cancelRequest(request)
                          }
                          className="w-full mt-3 rounded-xl border border-red-200 bg-white text-red-600 py-3 font-semibold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Hủy phiếu
                        </button>
                      </>
                    )}

                  </div>
                );
              })}

            </div>
          )}

        </section>

        {/* =====================================================
            KHO ĐỒ
        ===================================================== */}

        <section>

          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">

            <div>
              <h2 className="text-3xl font-black text-slate-900">
                Kho đồ
              </h2>

              <p className="text-slate-600 mt-2">
                Thêm, chỉnh sửa, xóa và theo dõi trạng thái các món đồ.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateItem}
              className="rounded-xl bg-blue-600 text-white px-6 py-3 font-bold hover:bg-blue-700"
            >
              + Thêm sản phẩm
            </button>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {items.map((item) => {

              let statusText = "Còn đồ";

              let statusClass =
                "bg-green-50 text-green-600";

              if (
                item.status ===
                "AVAILABLE"
              ) {
                if (getItemRemaining(item) <= 0) {
                  statusText = "Hết hàng";
                  statusClass =
                    "bg-red-50 text-red-600";
                } else {
                  statusText = "Còn đồ";
                  statusClass =
                    "bg-green-50 text-green-600";
                }
              }

              if (
                item.status ===
                "HELD"
              ) {
                statusText = "Đã giao";
                statusClass =
                  "bg-blue-50 text-blue-600";
              }

              if (
                item.status ===
                "PENDING"
              ) {
                statusText = "Đang chờ";
                statusClass =
                  "bg-orange-50 text-orange-600";
              }

              if (
                item.status ===
                "REJECTED"
              ) {
                statusText = "Từ chối";
                statusClass =
                  "bg-red-50 text-red-600";
              }

              if (
                item.status ===
                "TRANSFERRED"
              ) {
                statusText = "Đã chuyển";
                statusClass =
                  "bg-slate-100 text-slate-600";
              }

              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm"
                >

                  <div className="flex items-center justify-between gap-3">

                    <span className="rounded-full bg-blue-50 text-blue-600 px-4 py-2 font-bold">
                      {item.item_code}
                    </span>

                    <span
                      className={`rounded-full px-4 py-2 font-semibold ${statusClass}`}
                    >
                      {statusText}
                    </span>

                  </div>

                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-44 object-cover rounded-xl mt-5 border border-slate-200"
                    />
                  ) : (
                    <div className="w-full h-44 rounded-xl mt-5 bg-slate-100 flex items-center justify-center text-slate-400">
                      Chưa có ảnh
                    </div>
                  )}

                  <h3 className="text-2xl font-black text-slate-900 mt-6">
                    {item.name}
                  </h3>

                  {item.category && (
                    <p className="text-slate-600 mt-2">
                      {item.category}
                    </p>
                  )}

                  {(() => {
                    const total = Number(item.quantity ?? 1);
                    const registered = getItemRequestCount(item.id);
                    const remaining = getItemRemaining(item);

                    return (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="font-bold text-slate-900">
                          Số lượng kho
                        </p>
                        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                          <div className="rounded-lg bg-white border border-slate-200 p-3">
                            <p className="text-xs text-slate-500">Tổng</p>
                            <p className="text-xl font-black text-slate-900">{total}</p>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-200 p-3">
                            <p className="text-xs text-slate-500">Đã đăng ký</p>
                            <p className="text-xl font-black text-orange-600">{registered}</p>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-200 p-3">
                            <p className="text-xs text-slate-500">Còn lại</p>
                            <p className={`text-xl font-black ${remaining > 0 ? "text-green-600" : "text-red-600"}`}>
                              {remaining}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-4 text-slate-700">
                    <p className="font-semibold text-slate-900">
                      Lịch nhận đồ
                    </p>

                    {(slotsByItem[item.id] || []).length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {(slotsByItem[item.id] || []).map((slot, index) => (
                          <div
                            key={slot.id || `${item.id}-${index}`}
                            className="rounded-lg bg-white border border-blue-100 p-3"
                          >
                            <p>
                              <span className="font-semibold">Địa điểm:</span>{" "}
                              {slot.pickup_location}
                            </p>
                            <p className="mt-1">
                              <span className="font-semibold">Ngày:</span>{" "}
                              {new Date(
                                `${slot.pickup_date}T00:00:00`
                              ).toLocaleDateString("vi-VN")}
                            </p>
                            <p className="mt-1">
                              <span className="font-semibold">Giờ:</span>{" "}
                              {slot.pickup_start_time} - {slot.pickup_end_time}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-slate-500">
                        {item.pickup_location || "Chưa chọn"} ·{" "}
                        {item.pickup_date
                          ? new Date(
                              `${item.pickup_date}T00:00:00`
                            ).toLocaleDateString("vi-VN")
                          : "Chưa chọn"}{" "}
                        · {item.pickup_start_time || "--:--"} -{" "}
                        {item.pickup_end_time || "--:--"}
                      </p>
                    )}
                  </div>

                  {item.condition && (
                    <p className="text-slate-600 mt-2">
                      <span className="font-semibold">Tình trạng:</span>{" "}
                      {item.condition}
                    </p>
                  )}

                  {item.description && (
                    <p className="text-slate-600 mt-2 line-clamp-3">
                      {item.description}
                    </p>
                  )}

                  <p className="text-sm text-slate-400 mt-5">
                    Trạng thái DB: {item.status}
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <button
                      type="button"
                      onClick={() => openEditItem(item)}
                      disabled={processingId === item.id}
                      className="rounded-xl border border-blue-200 bg-blue-50 text-blue-700 py-3 font-bold hover:bg-blue-100 disabled:opacity-50"
                    >
                      Chỉnh sửa
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteItem(item)}
                      disabled={processingId === item.id}
                      className="rounded-xl border border-red-200 bg-red-50 text-red-700 py-3 font-bold hover:bg-red-100 disabled:opacity-50"
                    >
                      {processingId === item.id ? "Đang xóa..." : "Xóa"}
                    </button>
                  </div>

                </div>
              );
            })}

          </div>

        </section>

        {/* =====================================================
            FORM THÊM / CHỈNH SỬA SẢN PHẨM
        ===================================================== */}

        {showItemForm && (
          <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="p-6 border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">
                    {editingItem ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm"}
                  </h2>
                  <p className="text-slate-500 mt-1">
                    Nhập thông tin món đồ, ảnh và lịch nhận đồ.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeItemForm}
                  disabled={savingItem}
                  className="text-2xl text-slate-400 hover:text-slate-700"
                >
                  ×
                </button>
              </div>

              <div className="p-6 space-y-5">
                {itemFormError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
                    <p className="font-bold">Không thể lưu sản phẩm</p>
                    <p className="mt-1 break-words">{itemFormError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <label className="block">
                    <span className="font-semibold text-slate-700">
                      Mã sản phẩm *
                    </span>
                    <input
                      autoComplete="off"
                      value={itemForm.item_code}
                      onChange={(e) =>
                        setItemForm((current) => ({
                          ...current,
                          item_code: e.target.value,
                        }))
                      }
                      placeholder="VD: TS0005"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                    />
                  </label>

                  <label className="block">
                    <span className="font-semibold text-slate-700">
                      Tên sản phẩm *
                    </span>
                    <input
                      autoComplete="off"
                      value={itemForm.name}
                      onChange={(e) =>
                        setItemForm((current) => ({
                          ...current,
                          name: e.target.value,
                        }))
                      }
                      placeholder="VD: Quạt bàn"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                    />
                  </label>

                  <label className="block">
                    <span className="font-semibold text-slate-700">
                      Danh mục
                    </span>
                    <input
                      value={itemForm.category}
                      onChange={(e) =>
                        setItemForm((current) => ({
                          ...current,
                          category: e.target.value,
                        }))
                      }
                      placeholder="VD: Đồ dùng sinh hoạt"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                    />
                  </label>

                  <label className="block">
                    <span className="font-semibold text-slate-700">
                      Tình trạng
                    </span>
                    <input
                      value={itemForm.condition}
                      onChange={(e) =>
                        setItemForm((current) => ({
                          ...current,
                          condition: e.target.value,
                        }))
                      }
                      placeholder="VD: Tốt, mới 90%"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                    />
                  </label>

                  <label className="block">
                    <span className="font-semibold text-slate-700">
                      Số lượng *
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={itemForm.quantity}
                      onChange={(e) =>
                        setItemForm((current) => ({
                          ...current,
                          quantity: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                      placeholder="VD: 10"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Tổng số đơn vị của sản phẩm trong kho.
                    </p>
                  </label>
                </div>

                <div className="block">
                  <span className="font-semibold text-slate-700">
                    Ảnh sản phẩm
                  </span>

                  <div className="mt-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
                    <input
                      type="file"
                      accept="image/*"
                      disabled={savingItem}
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setImageFile(file);

                        if (file) {
                          const previewUrl = URL.createObjectURL(file);
                          setImagePreview(previewUrl);
                        }
                      }}
                      className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-blue-700"
                    />

                    <p className="text-sm text-slate-500 mt-2">
                      Chọn ảnh từ máy, tối đa 5MB. Ảnh sẽ được lưu vào Supabase Storage.
                    </p>

                    {imagePreview && (
                      <div className="mt-4">
                        <img
                          src={imagePreview}
                          alt="Xem trước ảnh sản phẩm"
                          className="w-full max-h-64 object-contain rounded-xl border border-slate-200 bg-white"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-black text-slate-900 text-lg">
                        Lịch nhận đồ
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        BTC có thể tạo nhiều địa điểm, ngày và khung giờ. Sinh viên sẽ chỉ được chọn các lịch này.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={savingItem}
                      onClick={() =>
                        setPickupSlots((current) => [
                          ...current,
                          {
                            pickup_location: "",
                            pickup_date: "",
                            pickup_start_time: "",
                            pickup_end_time: "",
                            is_active: true,
                          },
                        ])
                      }
                      className="shrink-0 rounded-lg bg-blue-600 text-white px-4 py-2 font-bold hover:bg-blue-700 disabled:opacity-50"
                    >
                      + Thêm lịch
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    {pickupSlots.map((slot, index) => (
                      <div
                        key={slot.id || `new-slot-${index}`}
                        className="rounded-xl border border-blue-200 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <p className="font-bold text-slate-900">
                            Lịch {index + 1}
                          </p>

                          {pickupSlots.length > 1 && (
                            <button
                              type="button"
                              disabled={savingItem}
                              onClick={() =>
                                setPickupSlots((current) =>
                                  current.filter((_, i) => i !== index)
                                )
                              }
                              className="text-sm font-semibold text-red-600 hover:text-red-700"
                            >
                              Xóa lịch
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <label className="block md:col-span-2">
                            <span className="font-semibold text-slate-700">
                              Địa điểm nhận đồ *
                            </span>
                            <input
                              list={`btc-pickup-locations-${index}`}
                              value={slot.pickup_location}
                              onChange={(e) =>
                                setPickupSlots((current) =>
                                  current.map((currentSlot, i) =>
                                    i === index
                                      ? {
                                          ...currentSlot,
                                          pickup_location: e.target.value,
                                        }
                                      : currentSlot
                                  )
                                )
                              }
                              placeholder="VD: Hòa Lạc"
                              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                            />
                            <datalist id={`btc-pickup-locations-${index}`}>
                              <option value="Hòa Lạc" />
                              <option value="Khu A" />
                              <option value="Khu B" />
                              <option value="Ký túc xá" />
                              <option value="Cổng trường" />
                            </datalist>
                          </label>

                          <label className="block">
                            <span className="font-semibold text-slate-700">
                              Ngày nhận *
                            </span>
                            <input
                              type="date"
                              value={slot.pickup_date}
                              onChange={(e) =>
                                setPickupSlots((current) =>
                                  current.map((currentSlot, i) =>
                                    i === index
                                      ? {
                                          ...currentSlot,
                                          pickup_date: e.target.value,
                                        }
                                      : currentSlot
                                  )
                                )
                              }
                              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
                            />
                          </label>

                          <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                              <span className="font-semibold text-slate-700">
                                Từ *
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={5}
                                placeholder="07:30"
                                value={formatTimeForInput(slot.pickup_start_time)}
                                onChange={(e) =>
                                  setPickupSlots((current) =>
                                    current.map((currentSlot, i) =>
                                      i === index
                                        ? {
                                            ...currentSlot,
                                            pickup_start_time: normalizeTimeInput(
                                              e.target.value
                                            ),
                                          }
                                        : currentSlot
                                    )
                                  )
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 outline-none focus:border-blue-500"
                              />
                            </label>

                            <label className="block">
                              <span className="font-semibold text-slate-700">
                                Đến *
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={5}
                                placeholder="10:00"
                                value={formatTimeForInput(slot.pickup_end_time)}
                                onChange={(e) =>
                                  setPickupSlots((current) =>
                                    current.map((currentSlot, i) =>
                                      i === index
                                        ? {
                                            ...currentSlot,
                                            pickup_end_time: normalizeTimeInput(
                                              e.target.value
                                            ),
                                          }
                                        : currentSlot
                                    )
                                  )
                                }
                                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 outline-none focus:border-blue-500"
                              />
                            </label>
                          </div>
                          <p className="mt-2 text-sm text-slate-500">
                            Nhập giờ 24h, không dùng AM/PM. Ví dụ: 07:30, 14:00, 18:45.
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="font-semibold text-slate-700">
                    Mô tả
                  </span>
                  <textarea
                    value={itemForm.description}
                    onChange={(e) =>
                      setItemForm((current) => ({
                        ...current,
                        description: e.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="Mô tả chi tiết sản phẩm..."
                    className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                  />
                </label>

                <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeItemForm}
                    disabled={savingItem}
                    className="flex-1 rounded-xl border border-slate-300 bg-white py-3 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Hủy
                  </button>

                  <button
                    type="button"
                    onClick={saveItem}
                    disabled={savingItem}
                    className="flex-1 rounded-xl bg-blue-600 text-white py-3 font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingItem
                      ? "Đang lưu..."
                      : editingItem
                        ? "Lưu thay đổi"
                        : "Thêm vào kho"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}