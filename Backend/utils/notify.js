const nodemailer = require('nodemailer');

exports.sendNotification = async (user, message, type) => {
  const Notification = require('../models/Notification');
  await Notification.create({
    user: user._id,
    type,
    message,
  });

  if (process.env.SMTP_USER) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: message,
      text: message,
    });
  } else {
    console.log(`Notification [${type}]: ${message}`);
  }
};