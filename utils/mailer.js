
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
    const rawEmail = `From: "The Nest Official" <${process.env.EMAIL_USER}>
        To: ${userEmail}
        Subject: Welcome to Nest Official - Registration Successful
        MIME-Version: 1.0
        Content-Type: text/html; charset=utf-8

        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 600px; margin: 0 auto; border-top: 4px solid #232f3e;">
            <h2 style="color: #333333; margin-top: 0;">Welcome to Nest Official!</h2>
            <p style="color: #555555; line-height: 1.6; font-size: 16px;">
              Hello <strong>${username}</strong>,
            </p>
            <p style="color: #555555; line-height: 1.6; font-size: 16px;">
              Thank you for registering with Nest Official. We are thrilled to welcome you to our platform.
            </p>
            <p style="color: #555555; line-height: 1.6; font-size: 16px;">
              Your account has been successfully created. You can now log in securely to browse our catalog, track your orders, and manage your account preferences.
            </p>
            <p style="color: #555555; line-height: 1.6; font-size: 16px;">
              If you have any questions or need assistance, our customer support team is always here to help.
            </p>
            <br/>
            <p style="color: #555555; font-size: 15px; margin-bottom: 5px;">Best Regards,</p>
            <p style="font-weight: bold; color: #333333; font-size: 16px; margin-top: 0;">The Nest Official Team</p>
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

export const sendEmployeeRegistrationEmail = async (employeeEmail, username, password) => {
  try {
    const accessToken = await getAccessToken();

    // Construct exactly what an email looks like behind the scenes (RFC 2822 format)
    const rawEmail = `From: "Nest Official Administration" <${process.env.EMAIL_USER}>
To: ${employeeEmail}
Subject: Welcome to the Team - Your Account Details
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 600px; margin: 0 auto; border-top: 4px solid #0056b3;">
    <h2 style="color: #333333; margin-top: 0;">Welcome to the Team!</h2>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      Hello <strong>${username}</strong>,
    </p>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      An administrator has successfully created an employee account for you at Nest Official.
    </p>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      Here are your secure login credentials to access the internal dashboard:
    </p>
    <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid #0056b3; margin: 20px 0;">
      <p style="margin: 0; color: #333333; font-size: 16px;"><strong>Email ID:</strong> ${employeeEmail}</p>
      <p style="margin: 5px 0 0; color: #333333; font-size: 16px;"><strong>Password:</strong> ${password}</p>
    </div>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      For security reasons, we highly recommend logging in and changing your password immediately.
    </p>
    <br/>
    <p style="color: #555555; font-size: 15px; margin-bottom: 5px;">Best Regards,</p>
    <p style="font-weight: bold; color: #333333; font-size: 16px; margin-top: 0;">Nest Official Administration</p>
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
      console.error("Gmail HTTP Error (Employee Mail):", result.error);
      return false;
    }

    console.log("Employee registration email sent successfully! ID: " + result.id);
    return true;
  } catch (error) {
    console.error("Error sending employee email via HTTP:", error);
    return false;
  }
};