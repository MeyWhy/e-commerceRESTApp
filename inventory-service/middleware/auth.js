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

/* Autorise UNIQUEMENT l’admin */
const authorizeAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }

  next();
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

module.exports = { authenticate, authorizeAdmin, authorizeOwnerOrAdminOrService };
