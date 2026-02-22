const { app, BrowserWindow, ipcMain, dialog, session, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(raw || '{}');
    }
  } catch (e) {
    console.error('loadSettings error:', e);
  }
  return {};
}

function saveSettings(obj) {
  try {
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('saveSettings error:', e);
  }
}

const userDimkaPath = path.join(app.getPath('userData'), 'dimka.jpg');

function getDimkaDataUrl() {
  try {
    const p = fs.existsSync(userDimkaPath) ? userDimkaPath : path.join(__dirname, 'dimka.jpg');
    const buf = fs.readFileSync(p);
    const ext = path.extname(p).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.error('getDimkaDataUrl error:', e);
    return '';
  }
}

let mainWindow;
let settingsWindow;
let currentTheme = 'winter';
let currentThemeKey = null;
let currentMic = null;
let currentVolume = 1.0;

function createMainWindow() {

  mainWindow = new BrowserWindow({
    width: 600,
    height: 750,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f2027',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL('https://nekto.me/audiochat#');

const ses = mainWindow.webContents.session;

ses.webRequest.onBeforeRequest(
  { urls: ['*://*/*'] },
  (details, callback) => {

    const url = details.url.toLowerCase();

    const blocked = [
      'doubleclick',
      'googlesyndication',
      'adservice',
      'adfox',
      'yandex',
      'banner',
      'ads.',
      '/ads/',
      'analytics',
      'tracking',
      '.ru/',
      '.by/'
    ];

    if (blocked.some(b => url.includes(b))) {
      return callback({ cancel: true });
    }

    callback({ cancel: false });
  }
);

mainWindow.webContents.once('did-finish-load', async () => {

  await mainWindow.webContents.insertCSS(`
    a[href*="play.google.com"],
    a[href*="apps.apple.com"],
    a[href*="nekto.me/ios-chat-ruletka"],
    img[alt*="Google Play"],
    img[alt*="App Store"] {
      display: none !important;
    }

    html, body {
      overflow: hidden !important;
      height: 100% !important;
    }

    #audio-chat-container,
    .chat-step,
    .main-panel {
      min-height: auto !important;
    }
  `);

  await injectBaseLogic();
  await applyTheme(currentTheme);

});

}

async function injectBaseLogic() {

 const currentDimkaUrl = getDimkaDataUrl();

  const script = `
    (function(){
      const DIMKA_PATH = ${JSON.stringify(currentDimkaUrl)};
      if (window.__electronLogicLoaded) return;
      window.__electronLogicLoaded = true;

      function removeTopButtons(){
        document.querySelectorAll("*").forEach(el => {
          const t = el.textContent?.trim();
          if (t === "Голосовой чат" || t === "Текстовый чат") {
            el.remove();
          }
        });
      }

	removeTopButtons();
	 new MutationObserver(removeTopButtons)
  	  .observe(document.body,{childList:true,subtree:true});

	function removeDescriptionBlock(){
  	 const desc = document.querySelector('.description');
  	 if(desc) desc.remove();
	 }

 removeDescriptionBlock();

new MutationObserver(removeDescriptionBlock)
  .observe(document.body,{childList:true,subtree:true});

const style = document.createElement("style");
style.innerHTML =
  ".electron-selected {" +
  "  outline: 3px solid #ff69b4 !important;" +
  "  box-shadow: 0 0 18px rgba(255,105,180,0.9), 0 0 30px rgba(255,105,180,0.6) !important;" +
  "  border-radius: 12px !important;" +
  "}" +

  ".callScreen__buttonsLine {" +
  "  display:flex !important;" +
  "  justify-content:center !important;" +
  "  align-items:center !important;" +
  "  gap:20px !important;" +
  "}" +

"button.callScreen__settingsBtn," +
"button.callScreen__complaintBtn," +
"button.callScreen__finishBtn {" +
  "  width:55px !important;" +
  "  height:55px !important;" +
  "  min-width:55px !important;" +
  "  min-height:55px !important;" +
  "  border-radius:50% !important;" +
  "  display:flex !important;" +
  "  justify-content:center !important;" +
  "  align-items:center !important;" +
  "  padding:0 !important;" +
  "}" +

"button.callScreen__settingsBtn svg," +
"button.callScreen__complaintBtn svg," +
"button.callScreen__finishBtn svg {" +
  "  width:26px !important;" +
  "  height:26px !important;" +
  "}" +

  ".callScreen__complaintBtn {" +
  "  font-size:11px !important;" +
  "  font-weight:700 !important;" +
  "  letter-spacing:0.5px !important;" +
  "  text-align:center !important;" +
  "  white-space:nowrap !important;" +
  "  overflow:hidden !important;" +
  "}";

document.head.appendChild(style);

      const state = {
        yourGender: null,
        yourAge: null,
        partnerGender: null,
        partnerAges: []
      };

      function buttons(){
        return [...document.querySelectorAll("button")];
      }

      function textOf(b){
        return b.textContent.trim();
      }

      function clearByCondition(cond){
        buttons().forEach(b=>{
          if(cond(textOf(b)))
            b.classList.remove("electron-selected");
        });
      }

      document.addEventListener("click", function(e){

        const btn = e.target.closest("button");
        if(!btn) return;

        const text = textOf(btn);

        if(text === "Мужчина" || text === "Женщина"){
          state.yourGender = text;
          clearByCondition(t => t==="Мужчина" || t==="Женщина");
          btn.classList.add("electron-selected");
          return;
        }

        if(/^\\d{2}-\\d{2}$/.test(text)){
          state.yourAge = text;
          clearByCondition(t => /^\\d{2}-\\d{2}$/.test(t));
          btn.classList.add("electron-selected");
          return;
        }

        if(text.includes("Парень") || text.includes("Девушка")){
          state.partnerGender = text;
          clearByCondition(t =>
            t.includes("Парень") || t.includes("Девушка")
          );
          btn.classList.add("electron-selected");
          return;
        }

        if(/^\\d+$/.test(text)){
          if(state.partnerAges.includes(text)){
            state.partnerAges =
              state.partnerAges.filter(a => a !== text);
            btn.classList.remove("electron-selected");
            return;
          }

          if(state.partnerAges.length < 4){
            state.partnerAges.push(text);
            btn.classList.add("electron-selected");
          }

        }

      }, true);

      if (!document.getElementById('__electron_settings_btn')) {

        const btn = document.createElement('div');
        btn.id = '__electron_settings_btn';
        btn.innerText = '⚙';

        Object.assign(btn.style, {
          position: 'fixed',
          top: '14px',
          right: '14px',
          zIndex: 999999,
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          boxShadow: '0 4px 18px rgba(0,0,0,0.4)'
        });

        btn.onclick = () => {
          if (window.electronAPI)
            window.electronAPI.openSettings();
        };

        document.body.appendChild(btn);
      }

function replaceComplaintText(){
  const btn = document.querySelector(".callScreen__complaintBtn");
  if (!btn) return;

  btn.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = "ЖАЛОБА";
    }
  });
}

replaceComplaintText();

new MutationObserver(() => {
  replaceComplaintText();
}).observe(document.body,{childList:true,subtree:true});

function ensureDimkaImage() {
  let img = document.querySelector('.electron-dimka-image');

  if (!img) {
    img = document.createElement('img');
    img.className = 'electron-dimka-image';

    img.style.position = 'fixed';
    img.style.bottom = '0';
    img.style.left = '50%';
    img.style.transform = 'translateX(-50%)';
    img.style.width = '600px';
    img.style.height = '290px';
    img.style.objectFit = 'cover';
    img.style.zIndex = '1';
    img.style.pointerEvents = 'none';

    document.body.appendChild(img);
  }

  return img;
}

function updateDimkaSource() {
  const img = ensureDimkaImage();
  img.src = window.__electronDimka || DIMKA_PATH;
}

function updateDimkaVisibility() {
  const hash = location.hash || '';
  const img = ensureDimkaImage();

  const allowed =
    hash.includes('/peer') ||
    hash.includes('/searching');

  img.style.display = allowed ? 'block' : 'none';
}

updateDimkaSource();
updateDimkaVisibility();

window.addEventListener('hashchange', () => {
  updateDimkaVisibility();
});

new MutationObserver(() => {
  updateDimkaVisibility();
}).observe(document.body, {
  childList: true,
  subtree: true
});

if (window.electronAPI && window.electronAPI.onDimkaChanged) {
  window.electronAPI.onDimkaChanged((url) => {
    window.__electronDimka = url;
    updateDimkaSource();
  });
}

    })();
  `;

  try {
    await mainWindow.webContents.executeJavaScript(script);
  } catch (err) {
    console.error('Error injecting script:', err);
  }

}

ipcMain.handle('set-theme', async (e, theme) => {
  try {
    currentTheme = theme;
    await applyTheme(theme);

    const s = loadSettings();
    s.theme = theme;
    saveSettings(s);

    console.log('Theme saved to settings:', theme);
    return true;
  } catch (err) {
    console.error('set-theme error', err);
    return false;
  }
});

async function applyTheme(name) {
  if (!mainWindow) return;

  const userThemePath = path.join(app.getPath('userData'), 'themes', `${name}.css`);
  const packagedThemePath = path.join(__dirname, 'themes', `${name}.css`);
  let themePath = null;

  if (fs.existsSync(userThemePath)) {
    themePath = userThemePath;
  } else if (fs.existsSync(packagedThemePath)) {
    themePath = packagedThemePath;
  } else {
    console.warn('Theme not found (user or packaged):', userThemePath, packagedThemePath);
    return;
  }

  const css = fs.readFileSync(themePath, 'utf8');

  try {
    if (currentThemeKey) {
      try { await mainWindow.webContents.removeInsertedCSS(currentThemeKey); } catch (e) { }
      currentThemeKey = null;
    }

    currentThemeKey = await mainWindow.webContents.insertCSS(css);
    currentTheme = name;
    console.log('Applied theme:', name, 'from', themePath);
  } catch (err) {
    console.error('applyTheme error:', err);
  }
}

ipcMain.on('open-settings', () => {

  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 420,
    height: 520,
    parent: mainWindow,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer/settings.html'));
  settingsWindow.on('closed', () => settingsWindow = null);

});

ipcMain.handle('get-memory-usage', async () => {
  const mem = await process.getProcessMemoryInfo();
  return { rss: (mem.residentSet / 1024).toFixed(1) };
});

ipcMain.handle('list-themes', async () => {
  const themeDirs = [
    path.join(__dirname, 'themes'),
    path.join(app.getPath('userData'), 'themes')
  ];
  const seen = new Set();
  const results = [];

  for (const dir of themeDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      fs.readdirSync(dir)
        .filter(f => f.endsWith('.css'))
        .forEach(f => {
          const name = f.replace('.css', '');
          if (!seen.has(name)) {
            seen.add(name);
            results.push(name);
          }
        });
    } catch (e) {
      console.error('list-themes read error for', dir, e);
    }
  }

  return results;
});

ipcMain.handle('get-current-theme', async () => {
  return currentTheme;
});

ipcMain.handle('import-custom-theme', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'CSS Files', extensions: ['css'] }]
    });

    if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
      console.log('import-custom-theme: cancelled by user');
      return false;
    }

    const filePath = result.filePaths[0];

    let css;
    try {
      css = fs.readFileSync(filePath, 'utf8');
    } catch (readErr) {
      console.error('Failed to read selected file', readErr);
      return false;
    }

    try {
      const savePath = path.join(app.getPath('userData'), 'themes', 'custom.css');
      const dir = path.dirname(savePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(savePath, css, 'utf8');
      console.log('Saved custom theme to', savePath);
    } catch (writeErr) {
      console.error('Failed to write custom.css', writeErr);
      return false;
    }

    try {
      await applyTheme('custom');
    } catch (applyErr) {
      console.error('applyTheme failed for custom', applyErr);
    }

    try {
      const s = loadSettings();
      s.theme = 'custom';
      saveSettings(s);
      console.log('Saved custom as current theme in settings.json');
    } catch (e) {
      console.error('Failed to save settings after import', e);
    }

    return true;
  } catch (err) {
    console.error('import-custom-theme unexpected error', err);
    return false;
  }
});

ipcMain.handle('set-mic', async (event, deviceId) => {
  try {
    currentMic = deviceId || null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mic-changed', currentMic);
    }
    return true;
  } catch (e) {
    console.error('set-mic handler error', e);
    return false;
  }
});

ipcMain.handle('get-current-mic', async () => {
  return currentMic;
});

app.whenReady().then(() => {
  createMainWindow();

    globalShortcut.register('F5', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hotkey-f5');
    }
  });

  globalShortcut.register('F6', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hotkey-f6');
    }
  });

  globalShortcut.register('F3', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hotkey-f3');
    }
  });
  try {
    const saved = loadSettings();
    if (saved.theme) {
      currentTheme = saved.theme;
    }
  } catch (e) {
    console.warn('Failed to load saved settings:', e);
  }

 const { shell } = require('electron');

  try {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      try {
        const url = webContents.getURL() || '';

        if (
          (permission === 'media' || permission === 'microphone' || permission === 'camera') &&
          (url.startsWith('file://') || url.includes('nekto.me'))
        ) {
          return callback(true);
        }
      } catch (e) {
        console.warn('permission handler error', e);
      }

 try {
  const saved = loadSettings();
  if (saved.theme) {
    currentTheme = saved.theme;
  }
  if (typeof saved.volume !== 'undefined') {
    let v = Number(saved.volume);
    if (!isNaN(v)) {
      if (v > 1) v = Math.min(1, v / 100);
      currentVolume = Math.max(0, Math.min(1, v));
    }
  }
 } catch (e) {
  console.warn('Failed to load saved settings:', e);
 }

      callback(false);
    });

    console.log('Permission handler set');
  } catch (e) {
    console.warn('Failed to set permission handler:', e);
  }

  ipcMain.handle('open-mic-settings', async () => {
    try {
      if (process.platform === 'win32') {
        await shell.openExternal('ms-settings:privacy-microphone');
      } else if (process.platform === 'darwin') {
        await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
      } else {
        await shell.openExternal('https://www.google.com/search?q=enable+microphone+linux');
      }
      return true;
    } catch (e) {
      console.warn('open-mic-settings error', e);
      return false;
    }
  });

ipcMain.handle('import-dimka', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }]
    });

    if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { ok: false, msg: 'cancelled' };
    }

    const src = result.filePaths[0];

    const buf = fs.readFileSync(src);
    const ext = path.extname(src).toLowerCase();
    const mime = (ext === '.png') ? 'image/png' : (ext === '.webp') ? 'image/webp' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

    const resizeWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: false,
      }
    });

    await resizeWin.loadURL('data:text/html,<html><body></body></html>');

    const targetWidth = 600;
    const targetHeight = 290;
    const resizedDataUrl = await resizeWin.webContents.executeJavaScript(`
      (async function(){
        function loadImage(src){
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(e);
            img.src = ${JSON.stringify(dataUrl)};
          });
        }
        try {
          const img = await loadImage(${JSON.stringify(dataUrl)});
          const cvs = document.createElement('canvas');
          cvs.width = ${targetWidth};
          cvs.height = ${targetHeight};
          const ctx = cvs.getContext('2d');

	 ctx.drawImage(img, 0, 0, ${targetWidth}, ${targetHeight});
          return cvs.toDataURL('image/jpeg', 0.9);
        } catch (e) {
          return null;
        }
      })();
    `, true);

    try { resizeWin.destroy(); } catch(e){}

    if (!resizedDataUrl) {
      return { ok: false, msg: 'resize_failed' };
    }

    try {
      const base64 = resizedDataUrl.split(',',2)[1];
      const outBuf = Buffer.from(base64, 'base64');
      const dir = path.dirname(userDimkaPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(userDimkaPath, outBuf);
    } catch (e) {
      console.error('Failed to save resized dimka:', e);
      return { ok: false, msg: 'save_failed' };
    }

    const newUrl = getDimkaDataUrl();
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        await mainWindow.webContents.executeJavaScript(`
          (function(){
            try {
              const url = ${JSON.stringify(newUrl)};
              document.querySelectorAll('.electron-dimka-image').forEach(el => { el.src = url; });
              window.__electronDimka = url;
            } catch(e){}
          })();
        `);
      } catch (e) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('dimka-changed', newUrl);
      }
    }

    return { ok: true, msg: 'saved' };
  } catch (e) {
    console.error('import-dimka error', e);
    return { ok: false, msg: 'error' };
  }
});

ipcMain.handle('reset-dimka', async () => {
  try {
    if (fs.existsSync(userDimkaPath)) {
      try { fs.unlinkSync(userDimkaPath); } catch(e){ console.warn(e); }
    }
    const newUrl = getDimkaDataUrl();
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        await mainWindow.webContents.executeJavaScript(`
          (function(){
            try {
              const url = ${JSON.stringify(newUrl)};
              document.querySelectorAll('.electron-dimka-image').forEach(el => { el.src = url; });
              window.__electronDimka = url;
            } catch(e){}
          })();
        `);
      } catch (e) {
        mainWindow.webContents.send('dimka-changed', newUrl);
      }
    }
    return { ok: true };
  } catch (e) {
    console.error('reset-dimka error', e);
    return { ok: false, msg: 'error' };
  }
});

ipcMain.handle('get-dimka-url', async () => {
  return getDimkaDataUrl();
});


});

ipcMain.handle('get-current-volume', async () => {
  return currentVolume;
});

ipcMain.handle('set-volume', async (event, incoming) => {
  try {
    let v = Number(incoming);
    if (isNaN(v)) v = 1;
    if (v > 1) v = Math.min(1, v / 100);
    v = Math.max(0, Math.min(1, v));

    currentVolume = v;

    try {
      const s = loadSettings();
      s.volume = currentVolume;
      saveSettings(s);
    } catch (e) {
      console.warn('Failed to persist volume to settings:', e);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('set-volume', currentVolume);
      } catch (e) {
        console.warn('Failed to send set-volume to renderer:', e);
      }
    }

    return true;
  } catch (e) {
    console.error('set-volume handler error', e);
    return false;
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => app.quit());
