import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfirmRequestBody = {
  requestId?: string;
  resend?: boolean;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: string | null) {
  if (!value) return "Chưa cập nhật";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatTime(value: string | null) {
  if (!value) return "";
  return value.slice(0, 5);
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Máy chủ chưa được cấu hình đầy đủ Supabase." },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!accessToken) {
    return NextResponse.json(
      { error: "Bạn chưa đăng nhập tài khoản BTC." },
      { status: 401 },
    );
  }

  let body: ConfirmRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const requestId = body.requestId?.trim();
  console.log("[BTC CONFIRM] Request ID:", requestId);
console.log("[BTC CONFIRM] Supabase URL:", supabaseUrl);
  const resend = body.resend === true;

  if (!requestId) {
    return NextResponse.json({ error: "Thiếu mã phiếu." }, { status: 400 });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json(
      { error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
      { status: 401 },
    );
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const normalizedRole = String(profile?.role ?? "")
  .trim()
  .toLowerCase();

if (
  profileError ||
  !["btc", "admin"].includes(normalizedRole)
) {
    return NextResponse.json(
      { error: "Tài khoản này không có quyền xác nhận phiếu." },
      { status: 403 },
    );
  }

  console.log("[BTC] Confirm request:", {
  requestId,
  supabaseUrl,
});

const { data: beforeRequest, error: beforeError } = await adminClient
  .from("requests")
  .select("id, status, confirmation_email_sent_at")
  .eq("id", requestId)
  .maybeSingle();

console.log("[BTC] Lookup result:", {
  found: Boolean(beforeRequest),
  errorCode: beforeError?.code,
  errorMessage: beforeError?.message,
});

if (beforeError) {
  return NextResponse.json(
    { error: "Không thể truy vấn phiếu. Kiểm tra nhật ký máy chủ." },
    { status: 500 }
  );
}
console.log("[BTC CONFIRM] Query error:", {
  code: beforeError?.code,
  message: beforeError?.message,
});
console.log("[BTC CONFIRM] Found:", Boolean(beforeRequest));
  if (beforeError || !beforeRequest) {
    return NextResponse.json({ error: "Không tìm thấy phiếu." }, { status: 404 });
  }

  if (resend) {
    if (beforeRequest.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Chỉ có thể gửi lại email cho phiếu đã được xác nhận." },
        { status: 409 },
      );
    }

    if (beforeRequest.confirmation_email_sent_at) {
      return NextResponse.json(
        { error: "Email xác nhận của phiếu này đã được gửi thành công." },
        { status: 409 },
      );
    }
  } else {
    if (beforeRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: "Phiếu này đã được xử lý trước đó." },
        { status: 409 },
      );
    }

    const { error: approveError } = await userClient.rpc(
      "approve_pickup_request_by_btc",
      { p_request_id: requestId },
    );

    if (approveError) {
      return NextResponse.json({ error: approveError.message }, { status: 400 });
    }
  }

  const { data: pickupRequest, error: requestError } = await adminClient
    .from("requests")
    .select(
      "id, item_id, full_name, student_name, email, phone, delivery_method, shipping_address, pickup_slot_id, pickup_date, pickup_location, status",
    )
    .eq("id", requestId)
    .single();

  if (requestError || !pickupRequest) {
    return NextResponse.json(
      {
        approved: !resend,
        emailSent: false,
        warning: "Phiếu đã được xác nhận nhưng không thể tải dữ liệu để gửi email.",
      },
      { status: 200 },
    );
  }

  const recipientEmail = pickupRequest.email?.trim().toLowerCase();

  if (!recipientEmail) {
    const warning =
      "Phiếu đã được xác nhận nhưng chưa có email người nhận nên không thể gửi thư.";

    await adminClient
      .from("requests")
      .update({ confirmation_email_error: warning })
      .eq("id", requestId);

    return NextResponse.json({ approved: !resend, emailSent: false, warning });
  }

  const [{ data: item }, { data: slot }] = await Promise.all([
    adminClient
      .from("items")
      .select("item_code, name")
      .eq("id", pickupRequest.item_id)
      .maybeSingle(),
    pickupRequest.pickup_slot_id
      ? adminClient
          .from("pickup_slots")
          .select(
            "pickup_location, pickup_date, pickup_start_time, pickup_end_time",
          )
          .eq("id", pickupRequest.pickup_slot_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);
  const smtpUser = process.env.SMTP_USER;
 const smtpPassword =
  process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
    const warning =
      "Phiếu đã được xác nhận nhưng máy chủ chưa được cấu hình SMTP để gửi email.";

    await adminClient
      .from("requests")
      .update({ confirmation_email_error: warning })
      .eq("id", requestId);

    return NextResponse.json({ approved: !resend, emailSent: false, warning });
  }

  const fullName =
    pickupRequest.full_name || pickupRequest.student_name || "bạn";
  const itemName = item?.name || "Vật phẩm đã đăng ký";
  const itemCode = item?.item_code || "Chưa có";
  const siteUrl = (process.env.SITE_URL || "https://www.tramsacnhas.io.vn").replace(
    /\/$/,
    "",
  );

  const pickupLocation =
    slot?.pickup_location || pickupRequest.pickup_location || "Chưa cập nhật";
  const pickupDate = formatDate(slot?.pickup_date || pickupRequest.pickup_date);
  const pickupStartTime = formatTime(slot?.pickup_start_time || null);
  const pickupEndTime = formatTime(slot?.pickup_end_time || null);
  const pickupTime =
    pickupStartTime && pickupEndTime
      ? `${pickupStartTime} – ${pickupEndTime}`
      : "Chưa cập nhật";

  const isShipping = pickupRequest.delivery_method === "SHIP";
  const deliveryRows = isShipping
    ? `
        <tr><td style="padding:7px 0;color:#64748b">Hình thức</td><td style="padding:7px 0;font-weight:700">Giao hàng</td></tr>
        <tr><td style="padding:7px 0;color:#64748b">Địa chỉ</td><td style="padding:7px 0;font-weight:700">${escapeHtml(pickupRequest.shipping_address || "Chưa cập nhật")}</td></tr>
      `
    : `
        <tr><td style="padding:7px 0;color:#64748b">Ngày nhận</td><td style="padding:7px 0;font-weight:700">${escapeHtml(pickupDate)}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b">Thời gian</td><td style="padding:7px 0;font-weight:700">${escapeHtml(pickupTime)}</td></tr>
        <tr><td style="padding:7px 0;color:#64748b">Địa điểm</td><td style="padding:7px 0;font-weight:700">${escapeHtml(pickupLocation)}</td></tr>
      `;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  try {
    await transporter.sendMail({
      from:
        process.env.MAIL_FROM ||
        `"Trạm sạc nhà S" <${smtpUser}>`,
      to: recipientEmail,
      replyTo: smtpUser,
      subject: `✅ [Trạm sạc nhà S] Phiếu ${requestId.slice(0, 8).toUpperCase()} đã được xác nhận`,
      text: isShipping
        ? `Chào ${fullName}, BTC đã xác nhận phiếu nhận ${itemName} (${itemCode}). Hình thức: giao hàng. Địa chỉ: ${pickupRequest.shipping_address || "Chưa cập nhật"}. Theo dõi tại ${siteUrl}/theo-doi`
        : `Chào ${fullName}, BTC đã xác nhận phiếu nhận ${itemName} (${itemCode}). Ngày nhận: ${pickupDate}. Thời gian: ${pickupTime}. Địa điểm: ${pickupLocation}. Theo dõi tại ${siteUrl}/theo-doi`,
      html: `
        <div style="margin:0;background:#f1f5f9;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
          <div style="max-width:620px;margin:0 auto;overflow:hidden;border-radius:20px;background:#ffffff;box-shadow:0 8px 30px rgba(15,23,42,.08)">
            <div style="background:linear-gradient(135deg,#047857,#0d9488);padding:28px 32px;color:#ffffff">
              <div style="font-size:13px;font-weight:700;letter-spacing:.16em">TRẠM SẠC NHÀ S</div>
              <h1 style="margin:12px 0 0;font-size:25px;line-height:1.3">Phiếu đăng ký đã được xác nhận</h1>
            </div>
            <div style="padding:30px 32px">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.7">Chào <strong>${escapeHtml(fullName)}</strong>,</p>
              <p style="margin:0 0 22px;font-size:16px;line-height:1.7">BTC Trạm sạc nhà S đã xác nhận đăng ký nhận đồ của bạn.</p>
              <div style="border:1px solid #d1fae5;border-radius:16px;background:#ecfdf5;padding:18px 20px">
                <table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.5">
                  <tr><td style="padding:7px 0;color:#64748b">Mã phiếu</td><td style="padding:7px 0;font-weight:700">${escapeHtml(requestId.slice(0, 8).toUpperCase())}</td></tr>
                  <tr><td style="padding:7px 0;color:#64748b">Vật phẩm</td><td style="padding:7px 0;font-weight:700">${escapeHtml(itemName)}</td></tr>
                  <tr><td style="padding:7px 0;color:#64748b">Mã vật phẩm</td><td style="padding:7px 0;font-weight:700">${escapeHtml(itemCode)}</td></tr>
                  ${deliveryRows}
                </table>
              </div>
              <p style="margin:22px 0 0;font-size:15px;line-height:1.7;color:#475569">
                ${isShipping ? "BTC sẽ liên hệ với bạn nếu cần bổ sung thông tin giao hàng." : "Vui lòng đến đúng thời gian và cung cấp họ tên, số điện thoại hoặc mã phiếu để BTC kiểm tra."}
              </p>
              <div style="margin-top:25px;text-align:center">
                <a href="${siteUrl}/theo-doi" style="display:inline-block;border-radius:12px;background:#059669;padding:13px 22px;color:#ffffff;text-decoration:none;font-weight:700">Theo dõi đăng ký</a>
              </div>
              <p style="margin:26px 0 0;border-top:1px solid #e2e8f0;padding-top:20px;font-size:14px;line-height:1.7;color:#64748b">
                Nếu không thể đến đúng lịch, hãy phản hồi email này hoặc liên hệ <a href="mailto:${escapeHtml(smtpUser)}" style="color:#047857">${escapeHtml(smtpUser)}</a>.
              </p>
              <p style="margin:18px 0 0;font-size:14px;font-weight:700;color:#0f172a">BTC Trạm sạc nhà S</p>
              <p style="margin:4px 0 0;font-size:13px;color:#64748b">Trao đi · Nhận lại · Kết nối</p>
            </div>
          </div>
        </div>
      `,
    });

    const { error: markSentError } = await adminClient
      .from("requests")
      .update({
        confirmation_email_sent_at: new Date().toISOString(),
        confirmation_email_error: null,
      })
      .eq("id", requestId);

    return NextResponse.json({
      approved: !resend,
      emailSent: true,
      warning: markSentError
        ? "Email đã gửi nhưng hệ thống chưa lưu được trạng thái gửi thư."
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không thể gửi email.";

    await adminClient
      .from("requests")
      .update({ confirmation_email_error: message.slice(0, 1000) })
      .eq("id", requestId);

    return NextResponse.json({
      approved: !resend,
      emailSent: false,
      warning:
        "Phiếu đã được xác nhận nhưng gửi email thất bại. Bạn có thể bấm “Gửi lại email xác nhận”.",
    });
  }
}
