const Datastore = require('@seald-io/nedb');
const path = require('path');

const dbPath = process.env.DEVDOCS_DATA_PATH || path.join(__dirname, '../../data');
require('fs').mkdirSync(dbPath, { recursive: true });

// @seald-io/nedb natively exposes *Async methods — no manual promisify needed.
const db = {
  projects:     new Datastore({ filename: path.join(dbPath, 'projects.db'),     autoload: true }),
  repositories: new Datastore({ filename: path.join(dbPath, 'repositories.db'), autoload: true }),
  documents:    new Datastore({ filename: path.join(dbPath, 'documents.db'),    autoload: true }),
};

module.exports = db;
