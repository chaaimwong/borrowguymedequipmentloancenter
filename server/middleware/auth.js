function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อนใช้งานส่วนนี้ (login required)' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อนใช้งานส่วนนี้ (login required)' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง (insufficient permissions)' });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
