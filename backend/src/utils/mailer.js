/** Email stub: logs to console (SMTP/SendGrid can be swapped in later). */
async function sendMail({ to, subject, text }) {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`\n--- EMAIL to ${to} ---\nSubject: ${subject}\n${text}\n--- END EMAIL ---\n`);
  }
  return { queued: true };
}

module.exports = { sendMail };
