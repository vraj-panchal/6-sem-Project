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
  return target;
};
