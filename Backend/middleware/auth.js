const jwt = require('jsonwebtoken');
const { getUser } = require('../utils/userCache');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    // Role / status come from the database, not from the (possibly old) token
    const user = await getUser(decoded._id);
    if (!user) {
      return res.status(401).json({ message: 'This account no longer exists.' });
    }
    if (user.status === 'blocked') {
      return res.status(401).json({ message: 'Your account has been blocked. Contact the administrator.' });
    }
    req.user = {
      _id: user._id,
      email: user.email,
      role: user.role,
      status: user.status,
      limitOverrides: user.limitOverrides || {},
    };
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = authenticate;
