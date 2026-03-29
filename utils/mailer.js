// import nodemailer from "nodemailer";

// export const sendWelcomeEmail = async (userEmail, username) => {
//   try {
//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: "nest.official.team@gmail.com",
//         pass: "ulij sfzu czox ezmc", // App Password provided by user
//       },
//     });

//     const mailOptions = {
//       from: "nest.official.team@gmail.com",
//       to: userEmail,
//       subject: "Welcome to Our Platform!",
//       html: `
//         <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
//           <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto;">
//             <h2 style="color: #333333;">Hello, ${username}! 👋</h2>
//             <p style="color: #555555; line-height: 1.6;">
//               Thank you for joining us! We are thrilled to have you on board.
//             </p>
//             <p style="color: #555555; line-height: 1.6;">
//               Start exploring and checking out all our awesome features. If you ever need help, feel free to reach out to our support team.
//             </p>
//             <br/>
//             <p style="color: #555555;">Best Regards,</p>
//             <p style="font-weight: bold; color: #333333;">The Nest Official Team</p>
//           </div>
//         </div>
//       `,
//     };

//     const info = await transporter.sendMail(mailOptions);
//     console.log("Welcome email sent successfully: " + info.response);
//     return true;
//   } catch (error) {
//     console.error("Error sending welcome email:", error);
//     return false;
//   }
// };


import dotenv from "dotenv";
dotenv.config();

// Helper to manually fetch a fresh access token using the Refresh Token
const getAccessToken = async () => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
      refresh_token: process.env.OAUTH_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json();
  return data.access_token;
};

export const sendWelcomeEmail = async (userEmail, username) => {
  try {
    const accessToken = await getAccessToken();

    // Construct exactly what an email looks like behind the scenes (RFC 2822 format)
    const rawEmail = `From: "The Nest Official Team" <${process.env.EMAIL_USER}>
To: ${userEmail}
Subject: Welcome to Our Platform!
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
  <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto;">
    <h2 style="color: #333333;">Hello, ${username}! 👋</h2>
    <p style="color: #555555; line-height: 1.6;">
      Thank you for joining us! We are thrilled to have you on board.
    </p>
    <p style="color: #555555; line-height: 1.6;">
      Start exploring and checking out all our awesome features. If you ever need help, feel free to reach out to our support team.
    </p>
    <br/>
    <p style="color: #555555;">Best Regards,</p>
    <p style="font-weight: bold; color: #333333;">The Nest Official Team</p>
  </div>
</div>`;

    // The Gmail REST API strictly requires "base64url" encoding (no '+', no '/', no '=')
    const encodedEmail = Buffer.from(rawEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    // Send it purely over HTTPS (Port 443), which Render NEVER blocks!
    const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedEmail }),
    });

    const result = await sendResponse.json();
    if (result.error) {
       console.error("Gmail HTTP Error:", result.error);
       return false;
    }
    
    console.log("Welcome email successfully snuck past Render's firewall! ID: " + result.id);
    return true;
  } catch (error) {
    console.error("Error sending welcome email via HTTP:", error);
    return false;
  }
};