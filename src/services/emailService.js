const nodemailer = require('nodemailer');

let transporter = null;

function cleanEnv(val) {
  if (!val || typeof val !== 'string') return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

function getTransporter() {
  if (!transporter) {
    const emailUser = cleanEnv(process.env.SMTP_USER || process.env.EMAIL_USER);
    const emailPass = cleanEnv(process.env.SMTP_PASS || process.env.EMAIL_PASS);
    const emailService = cleanEnv(process.env.EMAIL_SERVICE);
    const smtpHost = cleanEnv(process.env.SMTP_HOST);

    if (emailUser && emailPass) {
      if (emailService) {
        transporter = nodemailer.createTransport({
          service: emailService,
          auth: {
            user: emailUser,
            pass: emailPass
          }
        });
      } else {
        transporter = nodemailer.createTransport({
          host: smtpHost || 'smtp.gmail.com',
          port: parseInt(cleanEnv(process.env.SMTP_PORT) || '587', 10),
          secure: cleanEnv(process.env.SMTP_PORT) === '465',
          auth: {
            user: emailUser,
            pass: emailPass
          }
        });
      }
      transporter._isSimulated = false;
    } else {
      // In development without credentials, create a simulated transporter
      transporter = {
        _isSimulated: true,
        sendMail: async (mailOptions) => {
          console.log('--- [EMAIL DISPATCH - DEV SIMULATION] ---');
          console.log(`To: ${mailOptions.to}`);
          console.log(`Subject: ${mailOptions.subject}`);
          console.log('-----------------------------------------');
          return { messageId: 'simulated-' + Date.now(), simulated: true };
        }
      };
    }
  }
  return transporter;
}

function getFromAddress() {
  return process.env.SMTP_FROM || process.env.EMAIL_FROM || '"Expiry Reminder" <reminders@expiryreminder.app>';
}

function formatExpiryDate(dateVal) {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatRemainingDays(days) {
  if (days === 0) return 'Expires Today (0 days left)';
  if (days === 1) return '1 day remaining';
  if (days > 1) return `${days} days remaining`;
  const ago = Math.abs(days);
  return `Expired ${ago} day${ago === 1 ? '' : 's'} ago`;
}

async function sendExpiryReminderEmail(user, items) {
  try {
    const t = getTransporter();
    const itemsListHtml = items.map(item => `
      <li style="margin-bottom: 12px; padding: 10px 12px; background: #f8fafc; border-radius: 8px; border-left: 4px solid ${item.daysRemaining <= 1 ? '#e11d48' : '#f59e0b'};">
        <div style="font-size: 15px; font-weight: bold; color: #0f172a;">${item.name}</div>
        <div style="font-size: 13px; color: #475569; margin-top: 4px;">
          <strong>Category:</strong> ${item.category?.name || 'Other'} &nbsp;|&nbsp;
          <strong>Where to Store:</strong> ${item.storageLocation || 'Other'}
        </div>
        <div style="font-size: 13px; color: #475569; margin-top: 2px;">
          <strong>Expiry Date:</strong> ${formatExpiryDate(item.expiryDate)} &nbsp;|&nbsp;
          <strong style="color: ${item.daysRemaining <= 0 ? '#e11d48' : '#d97706'};">Remaining:</strong> ${formatRemainingDays(item.daysRemaining)}
        </div>
      </li>
    `).join('');

    const itemsListText = items.map(item =>
      `- ${item.name} | Category: ${item.category?.name || 'Other'} | Expiry Date: ${formatExpiryDate(item.expiryDate)} | ${formatRemainingDays(item.daysRemaining)} | Where to Store: ${item.storageLocation || 'Other'}`
    ).join('\n');

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fafafa; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 20px; border-radius: 8px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px;">Expiry Reminder</h1>
          <p style="margin: 4px 0 0 0; opacity: 0.9;">Your Household Expiry Alerts</p>
        </div>
        <div style="background: white; padding: 24px; border-radius: 8px; margin-top: 16px;">
          <p style="font-size: 16px; color: #1e293b;">Hello ${user.name || 'there'},</p>
          <p style="color: #475569;">Here is your personal expiry update for upcoming or expired household items:</p>
          <ul style="list-style: none; padding-left: 0; color: #334155;">
            ${itemsListHtml}
          </ul>
          <div style="text-align: center; margin-top: 24px;">
            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Open My Expiry Dashboard
            </a>
          </div>
        </div>
        <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 16px;">
          This is an automated reminder from your personal Expiry Reminder assistant.
        </p>
      </div>
    `;

    return await t.sendMail({
      from: getFromAddress(),
      to: user.email,
      subject: `⏰ Expiry Reminder: ${items.length} item(s) need your attention`,
      html,
      text: `Hello ${user.name || 'there'},\n\nHere are your upcoming expiry alerts:\n${itemsListText}\n\nCheck your dashboard: ${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard`
    });
  } catch (error) {
    console.error('Error sending reminder email:', error);
    return null;
  }
}

async function sendTestEmail(user) {
  const t = getTransporter();
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fafafa; border-radius: 12px; border: 1px solid #e2e8f0;">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 20px; border-radius: 8px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">Test Email Successful</h1>
        <p style="margin: 4px 0 0 0; opacity: 0.9;">Expiry Reminder Notification Check</p>
      </div>
      <div style="background: white; padding: 24px; border-radius: 8px; margin-top: 16px;">
        <p style="font-size: 16px; color: #1e293b;">Hello ${user.name || 'there'},</p>
        <p style="color: #475569;">This is a test email from <strong>Expiry Reminder</strong>.</p>
        <p style="color: #475569;">Your email notifications are configured to send alerts to <strong>${user.email}</strong> at 7 days, 3 days, 1 day before expiry, and on the expiry date.</p>
      </div>
    </div>
  `;

  const info = await t.sendMail({
    from: getFromAddress(),
    to: user.email,
    subject: '✅ Test Email - Expiry Reminder Notifications',
    html,
    text: `Hello ${user.name || 'there'},\nThis is a test email from Expiry Reminder. Alerts will be sent to ${user.email}.`
  });

  return {
    success: true,
    simulated: Boolean(t._isSimulated || info?.simulated),
    messageId: info?.messageId
  };
}

async function sendPasswordResetEmail(user, resetToken) {
  try {
    const t = getTransporter();
    const clientUrl = (cleanEnv(process.env.CLIENT_URL) || 'http://localhost:5173').replace(/\/+$/, '');
    const resetUrl = `${clientUrl}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(user.email)}`;

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fafafa; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 20px; border-radius: 8px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px;">Password Reset Request</h1>
        </div>
        <div style="background: white; padding: 24px; border-radius: 8px; margin-top: 16px;">
          <p style="font-size: 16px; color: #1e293b;">Hello ${user.name},</p>
          <p style="color: #475569;">You requested a password reset for your Expiry Reminder account. Click the button below to reset your password. This link is valid for 1 hour.</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Reset My Password
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 13px;">Or copy and paste this link: ${resetUrl}</p>
          <p style="color: #94a3b8; font-size: 13px;">If you did not request this reset, you can safely ignore this email.</p>
        </div>
      </div>
    `;

    return await t.sendMail({
      from: getFromAddress(),
      to: user.email,
      subject: '🔑 Password Reset Request - Expiry Reminder',
      html,
      text: `Hello ${user.name},\nReset your password here: ${resetUrl}`
    });
  } catch (error) {
    console.error('Error sending reset email:', error);
    return null;
  }
}

module.exports = {
  sendExpiryReminderEmail,
  sendPasswordResetEmail,
  sendTestEmail
};
