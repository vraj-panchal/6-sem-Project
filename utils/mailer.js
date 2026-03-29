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


import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// Lazily load transporter to guarantee process.env is fully loaded
let transporter;

export const sendWelcomeEmail = async (userEmail, username) => {
  try {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: process.env.EMAIL_USER,
          clientId: process.env.OAUTH_CLIENT_ID,
          clientSecret: process.env.OAUTH_CLIENT_SECRET,
          refreshToken: process.env.OAUTH_REFRESH_TOKEN,
        },
      });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: "Welcome to Our Platform!",
      html: `
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
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Welcome email sent successfully: " + info.response);
    return true;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return false;
  }
};