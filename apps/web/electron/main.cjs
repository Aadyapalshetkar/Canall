const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // We keep it secure: no direct access to Node.js from the renderer
    },
    title: "Canall",
    icon: path.join(__dirname, '../public/logo.png'), // Add an icon if available
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
