
import nodemailer from "nodemailer";

export const runtime = "nodejs";

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error("Thieu cau hinh SMTP");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return await transporter.sendMail({
    from:
      process.env.MAIL_FROM ||
      `"Trạm sạc nhà S" <${user}>`,
    to,
    subject,
    text,
    html,
  });
}
