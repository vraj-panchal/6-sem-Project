import { sendWelcomeEmail } from "./utils/mailer.js";

// Manually passing the environment variables for this test
process.env.EMAIL_USER = "nest.official.team@gmail.com";
process.env.EMAIL_PASS = "ulij sfzu czox ezmc";

const test = async () => {
  console.log("Testing welcome email function...");
  const success = await sendWelcomeEmail("vrajpanchal1112@gmail.com", "Vraj (Test)");
  if (success) {
    console.log("✅ Success! The email was sent and no errors were caught.");
  } else {
    console.log("❌ Failed! An error occurred during sending.");
  }
};

test();
