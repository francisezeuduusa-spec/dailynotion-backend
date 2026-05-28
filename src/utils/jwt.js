const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../db/supabase');

const signAccessToken = (userId) => {
  return jwt.sign(
    { sub: userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

const signRefreshToken = (userId) => {
  return jwt.sign(
    { sub: userId, type: 'refresh', jti: uuidv4() },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

const storeRefreshToken = async (userId, token) => {
  const decoded = verifyRefreshToken(token);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();

  const { error } = await supabase
    .from('refresh_tokens')
    .insert({ user_id: userId, token, expires_at: expiresAt });

  if (error) throw new Error('Failed to store refresh token');
};

const revokeRefreshToken = async (token) => {
  const { error } = await supabase
    .from('refresh_tokens')
    .update({ revoked: true })
    .eq('token', token);

  if (error) throw new Error('Failed to revoke refresh token');
};

const isRefreshTokenValid = async (token) => {
  const { data, error } = await supabase
    .from('refresh_tokens')
    .select('revoked, expires_at')
    .eq('token', token)
    .single();

  if (error || !data) return false;
  if (data.revoked) return false;
  if (new Date(data.expires_at) < new Date()) return false;

  return true;
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  isRefreshTokenValid
};
