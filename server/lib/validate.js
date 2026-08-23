// Thai national ID: 13 digits with a checksum digit (mod 11 algorithm).
function isValidThaiNationalId(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(id[i], 10) * (13 - i);
  }
  const check = (11 - (sum % 11)) % 10;
  return check === parseInt(id[12], 10);
}

module.exports = { isValidThaiNationalId };
