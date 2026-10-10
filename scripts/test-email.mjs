
import nodemailer from "nodemailer";

const emailNhan = process.argv[2];

if (!emailNhan) {
  throw new Error("Bạn chưa nhập email nhận thử");
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

try {
  await transporter.verify();
  console.log("✅ Kết nối SMTP thành công!");

  const result = await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: emailNhan,
    subject: "Kiểm tra hệ thống - Trạm sạc nhà S",
    html: `
      <h2>TRẠM SẠC NHÀ S</h2>
      <p>Xin chào!</p>
      <p>Đây là email kiểm tra tự động.</p>
      <p>Hệ thống gửi email đã hoạt động.</p>
      <p>Trân trọng,<br>BTC Trạm sạc nhà S</p>
    `,
  });

  console.log("✅ SMTP đã chấp nhận thư:", result.messageId);
} catch (error) {
  console.error("❌ Gửi email thất bại:", error);
  process.exitCode = 1;
}
