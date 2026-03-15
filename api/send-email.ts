import nodemailer from "nodemailer";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { subject, body } = req.body;

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465", 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "engenharia@joinvilleimplementos.com.br", // Destinatário padrão
      subject: subject,
      text: body,
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: String(error) });
  }
}