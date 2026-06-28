'use strict';

const { contextBridge } = require('electron');

// Minimal surface — all features go through the HTTP API
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
});
