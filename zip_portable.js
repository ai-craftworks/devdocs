/**
 * zip_portable.js
 * Zips the packaged portable build (dist/DevDocs-win32-x64) into a single
 * dist/DevDocs-portable.zip file, ready to share.
 *
 * Run automatically by `npm run package:portable` after electron-packager
 * and the data folder copy finish.
 */
const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const SRC_DIR = path.join(__dirname, 'dist', 'DevDocs-win32-x64');
const OUT_ZIP = path.join(__dirname, 'dist', 'DevDocs-portable.zip');

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`ERROR: ${SRC_DIR} not found.`);
    console.error('Run electron-packager first (this script is meant to run after it).');
    process.exit(1);
  }

  if (fs.existsSync(OUT_ZIP)) {
    fs.unlinkSync(OUT_ZIP);
  }

  console.log(`Zipping ${SRC_DIR} -> ${OUT_ZIP}`);

  const output = fs.createWriteStream(OUT_ZIP);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  output.on('close', () => {
    const sizeMB = (archive.pointer() / (1024 * 1024)).toFixed(1);
    console.log(`Done! Portable build: ${OUT_ZIP} (${sizeMB} MB)`);
    console.log('Extract the zip anywhere and run DevDocs.exe inside.');
  });

  archive.on('error', (err) => {
    console.error('Zip error:', err);
    process.exit(1);
  });

  archive.pipe(output);
  archive.directory(SRC_DIR, 'DevDocs');
  archive.finalize();
}

main();