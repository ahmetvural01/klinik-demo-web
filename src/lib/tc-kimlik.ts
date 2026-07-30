export function isValidTurkishIdentityNumber(value: string | null | undefined) {
  const identityNumber = String(value || "").trim();
  if (!/^[1-9]\d{10}$/.test(identityNumber)) return false;

  const digits = Array.from(identityNumber, Number);
  const oddPositionSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenPositionSum = digits[1] + digits[3] + digits[5] + digits[7];
  const tenthDigit = ((oddPositionSum * 7 - evenPositionSum) % 10 + 10) % 10;
  const eleventhDigit = digits.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10;

  return digits[9] === tenthDigit && digits[10] === eleventhDigit;
}
