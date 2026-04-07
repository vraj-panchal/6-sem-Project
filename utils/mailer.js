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

export const sendAdminRegistrationEmail = async (adminEmail, username, password) => {
  try {
    const accessToken = await getAccessToken();

    // Construct exactly what an email looks like behind the scenes (RFC 2822 format)
    const rawEmail = `From: "Nest Official Administration" <${process.env.EMAIL_USER}>
To: ${adminEmail}
Subject: Welcome to the Platform - Admin Access Granted
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 600px; margin: 0 auto; border-top: 4px solid #8B0000;">
    <h2 style="color: #333333; margin-top: 0;">Admin Access Granted!</h2>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      Hello <strong>${username}</strong>,
    </p>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      You have been successfully registered as a System Administrator at Nest Official.
    </p>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      Because you possess administrative privileges, please ensure your account remains completely secure at all times.
    </p>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      Welcome aboard the administration team!
    </p>
    <br/>
    <p style="color: #555555; font-size: 15px; margin-bottom: 5px;">Best Regards,</p>
    <p style="font-weight: bold; color: #333333; font-size: 16px; margin-top: 0;">Nest Official Security Team</p>
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
      console.error("Gmail HTTP Error (Admin Mail):", result.error);
      return false;
    }

    console.log("Admin registration email sent successfully! ID: " + result.id);
    return true;
  } catch (error) {
    console.error("Error sending admin email via HTTP:", error);
    return false;
  }
};

export const sendLoginOTPEmail = async (email, otp, username) => {
  try {
    const accessToken = await getAccessToken();

    // Construct exactly what an email looks like behind the scenes (RFC 2822 format)
    const rawEmail = `From: "Nest Official Security" <${process.env.EMAIL_USER}>
To: ${email}
Subject: Your Login OTP Code - Nest Official
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 600px; margin: 0 auto; border-top: 4px solid #28a745;">
    <h2 style="color: #333333; margin-top: 0;">Secure Login Authentication</h2>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      Hello <strong>${username}</strong>,
    </p>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      Please use the following 6-digit verification code to complete your login securely. This code will expire in 10 minutes.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <span style="display: inline-block; background-color: #f8f9fa; border: 2px dashed #28a745; padding: 15px 30px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #28a745; border-radius: 8px;">
        ${otp}
      </span>
    </div>

    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      If you did not request this login, please ignore this email and quickly secure your account.
    </p>
    <br/>
    <p style="color: #555555; font-size: 15px; margin-bottom: 5px;">Best Regards,</p>
    <p style="font-weight: bold; color: #333333; font-size: 16px; margin-top: 0;">Nest Official Security Team</p>
  </div>
</div>`;

    const encodedEmail = Buffer.from(rawEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

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
      console.error("Gmail HTTP Error (OTP Mail):", result.error);
      return false;
    }

    console.log("OTP email sent successfully! ID: " + result.id);
    return true;
  } catch (error) {
    console.error("Error sending OTP email via HTTP:", error);
    return false;
  }
};

export const sendPasswordResetOTPEmail = async (email, otp, username) => {
  try {
    const accessToken = await getAccessToken();

    // Construct exactly what an email looks like behind the scenes (RFC 2822 format)
    const rawEmail = `From: "Nest Official Security" <${process.env.EMAIL_USER}>
To: ${email}
Subject: Password Reset Request - Nest Official
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
  <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 600px; margin: 0 auto; border-top: 4px solid #dc3545;">
    <h2 style="color: #333333; margin-top: 0;">Password Reset Request</h2>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      Hello <strong>${username}</strong>,
    </p>
    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      We received a request to reset the password for your Nest Official account. Please use the following 6-digit verification code to securely change your password. This code will expire in 10 minutes.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <span style="display: inline-block; background-color: #f8f9fa; border: 2px dashed #dc3545; padding: 15px 30px; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #dc3545; border-radius: 8px;">
        ${otp}
      </span>
    </div>

    <p style="color: #555555; line-height: 1.6; font-size: 16px;">
      If you did not request a password reset, please safely ignore this email. Your password changes will not take effect unless you verify this OTP.
    </p>
    <br/>
    <p style="color: #555555; font-size: 15px; margin-bottom: 5px;">Best Regards,</p>
    <p style="font-weight: bold; color: #333333; font-size: 16px; margin-top: 0;">Nest Official Security Team</p>
  </div>
</div>`;

    const encodedEmail = Buffer.from(rawEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

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
      console.error("Gmail HTTP Error (Reset OTP Mail):", result.error);
      return false;
    }

    console.log("Password reset OTP email sent successfully! ID: " + result.id);
    return true;
  } catch (error) {
    console.error("Error sending password reset OTP email via HTTP:", error);
    return false;
  }
};

export const sendOrderInvoiceEmail = async (email, username, orderData) => {
  const logoUrl = "https://res.cloudinary.com/dxak3pk4u/image/upload/v1775545588/Green_Fluid_Dome_Logo_qhdt4z.png";

  try {
    const accessToken = await getAccessToken();

    // Extract Phone Number from deliveryAddress (Format: "Name | Phone | Address")
    const addressParts = orderData.deliveryAddress.split(" | ");
    const displayPhone = addressParts[1] || "N/A";

    const itemsHtml = orderData.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 15px; border-bottom: 1px solid #f0f0f0;">
            <p style="margin: 0; font-weight: 600; color: #1e5128; font-size: 14px;">${item.productName}</p>
            <span style="color: #6a994e; font-size: 11px; background: #f0fdf4; padding: 2px 8px; border-radius: 4px; border: 1px solid #dcfce7; display: inline-block; margin-top: 4px;">Qty: ${item.quantity}</span>
          </td>
          <td style="padding: 15px; border-bottom: 1px solid #f0f0f0; text-align: right; color: #94a3b8; font-size: 13px; text-decoration: line-through;">
            ₹${Number(item.mrp).toFixed(2)}
          </td>
          <td style="padding: 15px; border-bottom: 1px solid #f0f0f0; text-align: right; color: #444; font-size: 14px;">
            ₹${Number(item.pricePerUnit).toFixed(2)}
          </td>
          <td style="padding: 15px; border-bottom: 1px solid #f0f0f0; text-align: right; font-weight: bold; color: #1e5128; font-size: 14px;">
            ₹${Number(item.totalItemPrice).toFixed(2)}
          </td>
        </tr>
      `
      )
      .join("");

    const cgst = Number(orderData.totalTax) / 2;
    const sgst = Number(orderData.totalTax) / 2;
    const discountPercentage = orderData.totalMRP > 0 ? (((Number(orderData.totalMRP) - Number(orderData.subtotal)) / Number(orderData.totalMRP)) * 100).toFixed(0) : 0;

    const rawEmail = `From: "Nest Official" <${process.env.EMAIL_USER}>
To: ${email}
Subject: Order Confirmed! Invoice for #${orderData.orderNumber}
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; padding: 20px; background-color: #f3f4f6; color: #1f2937;">
  <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
    
    <!-- Branding Header -->
    <div style="background: linear-gradient(135deg, #004d2c 0%, #1e5128 100%); padding: 40px 30px; text-align: center; color: white;">
      <img src="${logoUrl}" alt="NEST" style="max-width: 110px; margin-bottom: 15px; border-radius: 8px;">
      <h1 style="margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.025em;">NEST OFFICIAL</h1>
      <p style="margin: 8px 0 0; opacity: 0.85; font-size: 15px;">Order Confirmation & Tax Invoice</p>
    </div>

    <div style="padding: 40px 30px;">
      <!-- Order Header row -->
      <table style="width: 100%; margin-bottom: 25px;">
        <tr>
          <td style="vertical-align: top;">
            <p style="margin: 0; font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 700; letter-spacing: 0.05em;">Order Number</p>
            <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; color: #111827;">#${orderData.orderNumber}</p>
          </td>
          <td style="vertical-align: top; text-align: right;">
            <p style="margin: 0; font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 700; letter-spacing: 0.05em;">Placed On</p>
            <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; color: #111827;">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </td>
        </tr>
      </table>

      <!-- Customer Details Block (Requested: between ordernumber and items) -->
      <div style="margin-bottom: 30px; padding: 20px; background-color: #f8fafc; border-radius: 12px; border-left: 4px solid #166534;">
        <p style="margin: 0 0 10px 0; color: #166534; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Customer Details</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="color: #334155; font-size: 14px;">
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Username:</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">${username}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Email ID:</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #64748b;">Phone:</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">${displayPhone}</td>
          </tr>
        </table>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 35px; border: 1px solid #f3f4f6; border-radius: 12px; overflow: hidden;">
        <thead>
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px 15px; text-align: left; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700; font-size: 12px;">Items</th>
            <th style="padding: 12px 15px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700; font-size: 12px;">MRP</th>
            <th style="padding: 12px 15px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700; font-size: 12px;">Price</th>
            <th style="padding: 12px 15px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #374151; font-weight: 700; font-size: 12px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Summary -->
      <div style="width: 100%; max-width: 320px; margin-left: auto; background: #fafafa; padding: 25px; border-radius: 12px; border: 1px solid #f0f0f0;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
          <span style="color: #6b7280;">Total MRP</span>
          <span style="font-weight: 600; color: #111827;">₹${Number(orderData.totalMRP).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
          <span style="color: #6b7280;">Subtotal</span>
          <span style="font-weight: 600; color: #111827;">₹${Number(orderData.subtotal).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
          <span style="color: #6b7280;">CGST (9%)</span>
          <span style="font-weight: 600; color: #111827;">₹${cgst.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
          <span style="color: #6b7280;">SGST (9%)</span>
          <span style="font-weight: 600; color: #111827;">₹${sgst.toFixed(2)}</span>
        <tr>
          <td colspan="3" style="padding: 6px 0; color: #6b7280; font-size: 14px;">Total MRP</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #111827;">₹${Number(orderData.totalMRP).toFixed(2)}</td>
        </tr>
        <tr>
          <td colspan="3" style="padding: 6px 0; color: #dc2626; font-size: 14px; font-weight: 600;">Total Discount (-${discountPercentage}%)</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #dc2626;">-₹${Number(orderData.totalDiscount).toFixed(2)}</td>
        </tr>
        <tr style="background: #fcfdfd;">
          <td colspan="3" style="padding: 15px; text-align: right; color: #64748b; font-size: 14px;">Subtotal (Before Tax)</td>
          <td style="padding: 15px; text-align: right; color: #1e293b; font-weight: 600;">₹${Number(orderData.subtotal).toFixed(2)}</td>
        </tr>
        <tr style="background: #fcfdfd;">
          <td colspan="3" style="padding: 15px; text-align: right; color: #64748b; font-size: 14px;">Total Tax (GST Included)</td>
          <td style="padding: 15px; text-align: right; color: #1e293b; font-weight: 600;">₹${Number(orderData.totalTax).toFixed(2)}</td>
        </tr>
        <tr style="background: #f8fafc;">
          <td colspan="3" style="padding: 15px; text-align: right; color: #1e5128; font-weight: 800; font-size: 18px;">Total Payable (Incl. Tax)</td>
          <td style="padding: 15px; text-align: right; color: #1e5128; font-weight: 800; font-size: 24px;">₹${Number(orderData.finalAmount).toFixed(2)}</td>
        </tr>
      </table>

      <!-- Shipping -->
      <div style="margin-top: 40px; padding: 25px; background-color: #fdfdfd; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h4 style="margin: 0 0 10px; color: #166534; font-size: 13px; text-transform: uppercase;">Shipping Address</h4>
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4b5563;">${orderData.deliveryAddress}</p>
        <div style="margin-top: 20px;">
          <h4 style="margin: 0 0 8px; color: #166534; font-size: 13px; text-transform: uppercase;">Payment Method</h4>
          <span style="background: #fff7ed; color: #c2410c; padding: 6px 14px; border-radius: 50px; font-size: 12px; font-weight: 700; border: 1px solid #ffedd5;">${orderData.paymentType}: PENDING ON DELIVERY</span>
        </div>
      </div>
    </div>

    <!-- Official Footer -->
    <div style="background-color: #f9fafb; padding: 35px; text-align: center; border-top: 1px solid #f3f4f6;">
      <p style="margin: 0; font-size: 14px; color: #4b5563; font-weight: 600;">Questions? We're here to help.</p>
      <p style="margin: 8px 0 25px; font-size: 13px; color: #9ca3af;">Contact: <a href="mailto:nest.official.team@gmail.com" style="color: #166534; text-decoration: none; font-weight: 700;">nest.official.team@gmail.com</a></p>
      <div style="border-top: 1px solid #e5e7eb; padding-top: 25px;">
        <p style="margin: 0; font-size: 11px; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;">&copy; ${new Date().getFullYear()} NEST OFFICIAL. PRESERVING NATURE.</p>
      </div>
    </div>
  </div>
</div>`;

    const encodedEmail = Buffer.from(rawEmail).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedEmail }),
    });

    const result = await sendResponse.json();
    console.log("Invoice email sent! ID: " + result.id);
    return true;
  } catch (error) {
    console.error("Error sending invoice email:", error);
    return false;
  }
};