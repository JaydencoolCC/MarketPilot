export function maskSecret(secret: string) {
  const trimmed = secret.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 3)}...****${trimmed.slice(-3)}`;
}
