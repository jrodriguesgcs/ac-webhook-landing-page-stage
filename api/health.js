module.exports = (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'AC Landing Page Stage Webhook is running',
    version: '1.0.0'
  });
};