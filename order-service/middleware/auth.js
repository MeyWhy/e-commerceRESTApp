const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing token' });

  const token = authHeader.split(' ')[1]; // Bearer TOKEN
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test');
    req.user = decoded; // { userId, role }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

const authorize = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  }
  next();
};

// check if the resource belongs to the user or admin
const authorizeOwnerOrAdmin = (getResourceOwnerId) => async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  try {
    const ownerId = await getResourceOwnerId(req);
    if (req.user.userId !== ownerId) return res.status(403).json({ error: 'Forbidden: not owner' });
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error during authorization' });
  }
};
const authorizeOwnerOrAdminOrService = (getResourceOwnerId) => async (req, res, next) => {
  if (req.user.role === "admin" || req.user.role === "service") return next();

  try {
    const ownerId = await getResourceOwnerId(req);
    if (req.user.userId !== ownerId) return res.status(403).json({ error: "Forbidden" });
    next();
  } catch (err) {
    res.status(500).json({ error: "Server error during authorization" });
  }
};

module.exports = { authenticate, authorize, authorizeOwnerOrAdmin, authorizeOwnerOrAdminOrService};
