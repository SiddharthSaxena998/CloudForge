const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');
const User = require('../models/User');

// userOrId: User document ya sirf ObjectId, dono chalenge
exports.sendNotification = async (userOrId, message, type = 'info') => {
  try {
    const userId = userOrId?._id ?? userOrId;
    if (!userId) return;

    await Notification.create({ user: userId, type, message });

    // Email optional hai, fail ho to bhi kuch break nahi hona chahiye
    const smtpReady =
      process.env.SMTP_USER &&
      process.env.SMTP_USER !== 'your_smtp_user' &&
      process.env.SMTP_HOST;

    if (!smtpReady) {
      console.log(`Notification [${type}]: ${message}`);
      return;
    }

    const user = userOrId?.email ? userOrId : await User.findById(userId).select('email');
    if (!user?.email) return;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: message,
      text: message,
    });
  } catch (e) {
    console.error('sendNotification failed:', e.message);
  }
};