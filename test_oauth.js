import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const runTest = async () => {
  console.log("Testing with User:", process.env.EMAIL_USER);
  console.log("Client ID Length:", process.env.OAUTH_CLIENT_ID?.length);
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.OAUTH_CLIENT_ID,
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
        refreshToken: process.env.OAUTH_REFRESH_TOKEN,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Final OAuth Test",
      text: "Testing OAuth2",
    });
    console.log("SUCCESS! Message Sent:", info.messageId);
  } catch (err) {
    console.error("FAILED purely due to:", err);
  }
};
runTest();
