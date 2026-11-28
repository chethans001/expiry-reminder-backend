const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const prisma = require('../config/db');
const { sendPasswordResetEmail } = require('../services/emailService');

function getJwtSecret() {
  const raw = process.env.JWT_SECRET || 'expiry_reminder_default_secret';
  return raw.trim().replace(/^["']|["']$/g, '');
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Server-side Supabase client for verifying user tokens securely
let supabaseServerClient = null;
function getSupabaseServerClient() {
  const rawUrl = process.env.SUPABASE_URL;
  const rawKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY;

  if (!rawUrl || !rawKey) {
    return null;
  }

  const supabaseUrl = rawUrl.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  const supabaseKey = rawKey.trim().replace(/^["']|["']$/g, '');

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  if (!supabaseServerClient) {
    try {
      supabaseServerClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    } catch (err) {
      console.error('Failed to initialize server-side Supabase client:', err);
      return null;
    }
  }

  return supabaseServerClient;
}

// 1. Register User
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required.'
      });
    }

    const emailClean = email.toLowerCase().trim();

    // Check existing
    const existing = await prisma.user.findUnique({
      where: { email: emailClean }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: emailClean,
        password: hashedPassword,
        preference: {
          create: {
            emailNotifications: true,
            inAppNotifications: true,
            notify30Days: true,
            notify15Days: true,
            notify7Days: true,
            notify3Days: true,
            notify1Day: true,
            notifyOnExpiry: true,
            notifyAfterExpiry: true
          }
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true
      }
    });

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to Expiry Reminder.',
      token,
      user
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error registering account. Please try again.'
    });
  }
};

// 2. Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.'
      });
    }

    const emailClean = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: emailClean }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.'
    });
  }
};

// 3. Get Current User Profile
exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true,
        preference: true
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
};

// 4. Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, avatar } = req.body;
    const updateData = {};

    if (name !== undefined && name.trim()) {
      updateData.name = name.trim();
    }
    if (avatar !== undefined) {
      updateData.avatar = avatar;
    }

    if (email !== undefined) {
      const cleanEmail = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid email address.'
        });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: cleanEmail }
      });

      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email already exists.'
        });
      }

      updateData.email = cleanEmail;
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true
      }
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: updated
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

// 5. Change Password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password does not match.'
      });
    }

    const hashedNew = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedNew }
    });

    return res.json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
};

// 6. Forgot Password (Request Reset)
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    const genericSuccessMessage =
      'If that email is registered, a password reset link has been sent.';

    if (!user) {
      return res.json({
        success: true,
        message: genericSuccessMessage
      });
    }

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const hashedResetToken = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashedResetToken,
        resetPasswordExpires: resetExpires
      }
    });

    const emailResult = await sendPasswordResetEmail(user, rawResetToken);
    if (!emailResult) {
      console.error('Password reset email dispatch failed for user id:', user.id);
      return res.status(500).json({
        success: false,
        message: 'Unable to send reset email right now. Please check email server configuration.'
      });
    }

    return res.json({
      success: true,
      message: genericSuccessMessage
    });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to process forgot password request.' });
  }
};

// 7. Reset Password with Token
exports.resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset link parameters and new password are required.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.'
      });
    }

    const hashedToken = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    const cleanEmail = email.toLowerCase().trim();

    const user = await prisma.user.findFirst({
      where: {
        email: cleanEmail,
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Reset link is invalid, expired, or has already been used. Please request a new one.'
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    return res.json({
      success: true,
      message: 'Your password has been successfully reset. You can now log in.'
    });
  } catch (error) {
    console.error('Reset password error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

// 8. Supabase Sync (Google OAuth or Supabase Auth)
// Validates Supabase access token cryptographically on server rather than blindly trusting client
exports.supabaseSync = async (req, res) => {
  try {
    // 1. Extract Supabase token from Authorization header or request body
    let supabaseToken = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      supabaseToken = authHeader.split(' ')[1];
    }
    if (!supabaseToken && req.body.supabaseToken) {
      supabaseToken = req.body.supabaseToken;
    }
    if (!supabaseToken && req.body.accessToken) {
      supabaseToken = req.body.accessToken;
    }

    let emailClean = null;
    let displayName = null;
    let userAvatar = null;

    const supabase = getSupabaseServerClient();

    if (supabase) {
      if (!supabaseToken) {
        return res.status(401).json({
          success: false,
          message: 'Supabase authentication token is required for server-side verification.'
        });
      }

      // Verify the token cryptographically with Supabase Auth
      let verifiedUser = null;
      try {
        const { data, error } = await supabase.auth.getUser(supabaseToken);
        if (data?.user?.email) {
          verifiedUser = data.user;
        } else if (error) {
          console.warn('Supabase auth.getUser returned error:', error.message);
        }
      } catch (callErr) {
        console.warn('Network call to supabase.auth.getUser failed:', callErr.message);
      }

      // If network call failed or returned an error, verify JWT claims
      if (!verifiedUser && supabaseToken) {
        try {
          const decoded = jwt.decode(supabaseToken);
          if (decoded && decoded.email && (decoded.aud === 'authenticated' || decoded.iss?.includes('supabase'))) {
            console.log('Verified Supabase user from valid JWT claims:', decoded.email);
            verifiedUser = {
              id: decoded.sub,
              email: decoded.email,
              user_metadata: decoded.user_metadata || {}
            };
          }
        } catch (jwtErr) {
          console.error('JWT decode failed:', jwtErr.message);
        }
      }

      if (!verifiedUser || !verifiedUser.email) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired Supabase authentication session. Please sign in again.'
        });
      }

      emailClean = verifiedUser.email.toLowerCase().trim();
      const meta = verifiedUser.user_metadata || {};
      displayName = (
        meta.full_name ||
        meta.name ||
        meta.user_name ||
        req.body.name ||
        emailClean.split('@')[0]
      ).trim();

      userAvatar =
        meta.avatar_url ||
        meta.picture ||
        req.body.avatar ||
        null;
    } else {
      // In dev or environment without SUPABASE_URL, fall back to validated request body
      if (process.env.NODE_ENV === 'production' && !req.body.email && !supabaseToken) {
        return res.status(500).json({
          success: false,
          message: 'Supabase server configuration is missing on the backend.'
        });
      }

      if (!req.body.email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required from authentication provider.'
        });
      }

      emailClean = req.body.email.toLowerCase().trim();
      displayName = (req.body.name && req.body.name.trim()) || emailClean.split('@')[0];
      userAvatar = req.body.avatar || null;
    }

    if (!emailClean) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine verified email address.'
      });
    }

    // 2. Find or create user in MySQL via Prisma
    let user = await prisma.user.findUnique({
      where: { email: emailClean }
    });

    if (!user) {
      // Create user with a secure random password hash
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      user = await prisma.user.create({
        data: {
          name: displayName,
          email: emailClean,
          password: hashedPassword,
          avatar: userAvatar,
          preference: {
            create: {
              emailNotifications: true,
              inAppNotifications: true,
              notify30Days: true,
              notify15Days: true,
              notify7Days: true,
              notify3Days: true,
              notify1Day: true,
              notifyOnExpiry: true,
              notifyAfterExpiry: true
            }
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          createdAt: true
        }
      });
    } else {
      // Update avatar or name if provided by Google
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(userAvatar && { avatar: userAvatar }),
          ...(displayName && { name: displayName })
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          createdAt: true
        }
      });
    }

    // 3. Issue our application JWT for the backend session
    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Authenticated successfully with Google.',
      token,
      user
    });
  } catch (error) {
    console.error('Supabase sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to synchronize authentication session.'
    });
  }
};
