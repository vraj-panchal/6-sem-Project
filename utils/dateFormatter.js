/**
 * Formats a date to Indian Standard Time (IST) in 12-hour format.
 * Format: DD Mon YYYY, hh:mm AM/PM
 * Example: 08 Apr 2026, 04:30 PM
 */
export const formatDateIST = (date) => {
  if (!date) return null;
  
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Calculates a target delivery date (Fixed number of days from baseDate).
 * Standard: 4 Days.
 */
export const calculateExpectedDate = (baseDate, days = 4) => {
  const target = new Date(baseDate);
  target.setDate(target.getDate() + days);
  
  // Set a fixed time during business hours (9:00 AM to 4:00 PM)
  // 11:30 AM is a good middle ground for delivery logic
  target.setHours(11, 30, 0, 0); 
  
  return target;
};

/**
 * Returns a Date object set to 12:00 PM IST (Noon).
 * UTC 06:30 AM = IST 12:00 PM.
 */
export const getISTDateNoon = () => {
  const date = new Date();
  date.setUTCHours(6, 30, 0, 0);
  return date;
};

/**
 * Returns a Date object reflecting the current Indian Standard Time (UTC + 5:30)
 * This is useful for saving exact local creation timestamps to the DB.
 */
export const getCurrentISTDate = () => {
  const date = new Date();
  date.setUTCHours(date.getUTCHours() + 5);
  date.setUTCMinutes(date.getUTCMinutes() + 30);
  return date;
};
