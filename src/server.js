const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/projects', require('./routes/projects'));
app.use('/api/repositories', require('./routes/repositories'));
app.use('/api/documents', require('./routes/documents'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════╗`);
  console.log(`  ║   DevDocs running on port ${PORT}   ║`);
  console.log(`  ╚══════════════════════════════════╝`);
  console.log(`\n  → http://localhost:${PORT}\n`);
});
