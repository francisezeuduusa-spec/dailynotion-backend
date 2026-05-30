const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../db/supabase');

const signAccessToken = (userId) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return jwt.sign(
    { sub: userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

const signRefreshToken = (userId) => {
  if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET is not set');
  return jwt.sign(
    { sub: userId, type: 'refresh', jti: uuidv4() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

const verifyAccessToken = (token) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return jwt.verify(token, process.env.JWT_SECRET);
};

const verifyRefreshToken = (token) => {
  if (!process.env.JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET is not set');
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

const storeRefreshToken = async (userId, token) => {
  const decoded = verifyRefreshToken(token);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();

  const { error } = await supabase
    .from('refresh_tokens')
    .insert({ user_id: userId, token, expires_at: expiresAt });

  if (error) {
    console.error(`[${new Date().toISOString()}] Failed to store refresh token:`, error.message);
    throw new Error('Failed to store session. Please try again.');
  }
};

const revokeRefreshToken = async (token) => {
  if (!token) return;
  await supabase
    .from('refresh_tokens')
    .update({ revoked: true })
    .eq('token', token);
  // Don't throw on failure — logout should always succeed from user's perspective
};

const isRefreshTokenValid = async (token) => {
  if (!token) return false;
  try {
    const { data, error } = await supabase
      .from('refresh_tokens')
      .select('revoked, expires_at')
      .eq('token', token)
      .single();

    if (error || !data) return false;
    if (data.revoked) return false;
    if (new Date(data.expires_at) < new Date()) return false;
    return true;
  } catch {
    return false;
  }
};

// Clean up expired refresh tokens older than 30 days
// Call this periodically — it's called from the scheduler
const cleanExpiredTokens = async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from('refresh_tokens')
    .delete()
    .lt('expires_at', thirtyDaysAgo);
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  isRefreshTokenValid,
  cleanExpiredTokens
};
