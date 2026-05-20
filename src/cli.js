#!/usr/bin/env node
const args = process.argv.slice(2);
const command = args[0];

if (command === 'start') {
  require('./server.js');
} else if(command === "version") {
    console.log("v0.1.0");
    process.exit(1);
} else {
  console.log('Usage: devdocs start');
  process.exit(1);
}