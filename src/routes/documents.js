const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');

// GET docs for a repository
router.get('/repository/:repositoryId', async (req, res) => {
  try {
    const docs = await db.documents.findAsync({ repositoryId: req.params.repositoryId });
    docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json({ success: true, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single document
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.documents.findOneAsync({ _id: req.params.id });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create document
router.post('/', async (req, res) => {
  try {
    const {
      repositoryId,
      type,      // 'overview' | 'code' | 'example' | 'changelog' | 'algorithm' | 'guide'
      title,
      content,
      metadata   // type-specific structured data
    } = req.body;

    if (!repositoryId || !title?.trim()) {
      return res.status(400).json({ success: false, error: 'repositoryId and title required' });
    }

    const repo = await db.repositories.findOneAsync({ _id: repositoryId });
    if (!repo) return res.status(404).json({ success: false, error: 'Repository not found' });

    const doc = await db.documents.insertAsync({
      _id: uuidv4(),
      repositoryId,
      type: type || 'overview',
      title: title.trim(),
      content: content || '',
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update document
router.put('/:id', async (req, res) => {
  try {
    const { title, content, metadata, type } = req.body;
    await db.documents.updateAsync(
      { _id: req.params.id },
      { $set: { title, content, metadata, type, updatedAt: new Date().toISOString() } }
    );
    const updated = await db.documents.findOneAsync({ _id: req.params.id });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE document
router.delete('/:id', async (req, res) => {
  try {
    await db.documents.removeAsync({ _id: req.params.id }, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
