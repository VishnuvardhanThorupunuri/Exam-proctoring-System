const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'exam-proctoring-super-secret-key-12345!';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({ error: 'Access token missing or invalid' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
};

module.exports = authenticateToken;
