// services/fast2smsService.js
// Thin wrapper around Fast2SMS's dedicated OTP route (route=otp) — a
// fixed-template SMS ("Your OTP: {code}. Do not share this OTP with
// anyone.") that Fast2SMS exempts from India's DLT sender/template
// registration, since the message itself is one of their own pre-approved
// default templates. It costs more per SMS than their DLT-registered bulk
// routes — once FAST2SMS_API_KEY's account has completed DLT registration
// (a business-side process, not something this code can do), switch to
// that route for the lower per-SMS rate; this function's signature and
// call sites won't need to change, only the request body below.
//
// Uses the platform's global `fetch` (Node 18+) rather than adding axios
// as a new dependency for one API call.
const FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2";

async function sendOtpSms(phoneNumber, otp) {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    throw new Error("FAST2SMS_API_KEY is not configured");
  }

  // Fast2SMS wants a bare 10-digit Indian mobile number, not one prefixed
  // with a country code — strip everything down to the last 10 digits.
  const digits = (phoneNumber || "").replace(/\D/g, "");
  const bareNumber = digits.length >= 10 ? digits.slice(-10) : digits;
  if (bareNumber.length !== 10) {
    throw new Error(`Not a valid 10-digit Indian phone number: ${phoneNumber}`);
  }

  const response = await fetch(FAST2SMS_URL, {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      variables_values: otp,
      route: "otp",
      numbers: bareNumber,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.return !== true) {
    console.error("[fast2sms] send failed:", data);
    throw new Error(data.message || "Failed to send OTP SMS");
  }
  return data;
}

module.exports = { sendOtpSms };
