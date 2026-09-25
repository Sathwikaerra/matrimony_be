// A random n-digit numeric code as a zero-padded string (e.g. "042917"),
// not a random integer's default toString — that would silently drop
// leading zeros and sometimes hand back a 5-digit code.
function generateOtp(length = 6) {
  const max = 10 ** length;
  const value = Math.floor(Math.random() * max);
  return String(value).padStart(length, "0");
}

module.exports = { generateOtp };
