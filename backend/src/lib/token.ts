import crypto from "crypto";

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generatePartyCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  const bytes = crypto.randomBytes(3);
  for (let i = 0; i < 3; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}
