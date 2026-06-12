import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function verifyAdminPassword(inputPassword, configuredPassword) {
  if (!configuredPassword || !inputPassword) return false;

  const inputDigest = digest(inputPassword);
  const configuredDigest = digest(configuredPassword);

  return timingSafeEqual(inputDigest, configuredDigest);
}
