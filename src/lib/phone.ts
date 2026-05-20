export function normalizeIndianPhone(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "+91" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  if (digits.length === 13 && digits.startsWith("091")) return "+" + digits.slice(1);
  return null;
}

export function formatIndianPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  if (!m) return phone;
  return `+91 ${m[1]} ${m[2]}`;
}
