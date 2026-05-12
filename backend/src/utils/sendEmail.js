import nodemailer from 'nodemailer';

/**
 * Send an email using Nodemailer
 * @param {Object} options - Email options (email, subject, message)
 */
const sendEmail = async (options) => {
  // 1) Create a transporter
  // Using generic SMTP config as requested. Use Mailtrap or similar for testing.
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // 2) Define the email options
  const mailOptions = {
    from: `StudyBuddy <${process.env.EMAIL_FROM || 'noreply@studybuddy.com'}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    // html: options.html, // Can add HTML support later
  };

  // 3) Actually send the email
  await transporter.sendMail(mailOptions);
};

export default sendEmail;
