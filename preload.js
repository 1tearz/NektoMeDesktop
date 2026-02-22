'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function makeVolumeCode(volume) {
  return `
    (function(){
      try {
        const vol = Math.max(0, Math.min(1, ${Number(volume)} || 0));
        window.__electronVolume = vol;

        if (!window.__electronVolumeMap) window.__electronVolumeMap = new WeakMap();

        if (!window.__electronMasterCtx) {
          try {
            window.__electronMasterCtx = new (window.AudioContext || window.webkitAudioContext)();
            window.__electronMasterGain = window.__electronMasterCtx.createGain();
            window.__electronMasterGain.gain.value = vol;
            window.__electronMasterGain.connect(window.__electronMasterCtx.destination);
          } catch(e) {
            window.__electronMasterCtx = null;
            window.__electronMasterGain = null;
          }
        } else {
          try { if (window.__electronMasterGain) window.__electronMasterGain.gain.value = vol; } catch(e){}
        }

        function attachToElement(el) {
          try {
            if (!el || !(el instanceof HTMLMediaElement)) return;
            try { el.volume = vol; } catch(e){}

            if (!window.__electronMasterCtx) return;
            if (window.__electronVolumeMap.has(el)) return;

            try {
              const src = window.__electronMasterCtx.createMediaElementSource(el);
              src.connect(window.__electronMasterGain);
              window.__electronVolumeMap.set(el, src);
            } catch (eCreate) {
            }
          } catch(e){}
        }

        try {
          Array.from(document.querySelectorAll('audio, video')).forEach(attachToElement);
        } catch(e){}

        if (!window.__electronVolumeObserver) {
          window.__electronVolumeObserver = new MutationObserver(function(muts){
            try {
              for (const m of muts) {
                if (m.addedNodes && m.addedNodes.length) {
                  m.addedNodes.forEach(node => {
                    try {
                      if (node && node.tagName && (node.tagName.toLowerCase() === 'audio' || node.tagName.toLowerCase() === 'video')) {
                        attachToElement(node);
                      }
                      if (node && node.querySelectorAll) {
                        node.querySelectorAll('audio, video').forEach(attachToElement);
                      }
                    } catch(e){}
                  });
                }
                if (
                  m.type === 'attributes' &&
                  m.target &&
                  (
                    (m.target.tagName || '').toLowerCase() === 'audio' ||
                    (m.target.tagName || '').toLowerCase() === 'video'
                  )
                ) {
                  attachToElement(m.target);
                }
              }
            } catch(e){}
          });
          window.__electronVolumeObserver.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcObject'] });
        }

        if (!window.__electronVolumeInterval) {
          window.__electronVolumeInterval = setInterval(() => {
            try {
              Array.from(document.querySelectorAll('audio, video')).forEach(attachToElement);
            } catch(e){}
          }, 2000);
        }

        function tryResume() {
          try {
            if (window.__electronMasterCtx && window.__electronMasterCtx.state === 'suspended') {
              window.__electronMasterCtx.resume().catch(()=>{});
            }
            Array.from(document.querySelectorAll('audio, video')).forEach(attachToElement);
          } catch(e){}
        }

        if (!window.__electronVolumeInteractionHandlerAdded) {
          window.__electronVolumeInteractionHandlerAdded = true;
          ['click','keydown','pointerdown','touchstart'].forEach(evt => {
            window.addEventListener(evt, tryResume, { once: true, capture: true });
          });
        }
      } catch(e){}
    })();
  `;
}

contextBridge.exposeInMainWorld('electronAPI', {
  openSettings: () => ipcRenderer.send('open-settings')
});

function injectToPage(code) {
  try {
    const script = document.createElement('script');
    script.textContent = code;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (e) {
    window.addEventListener('DOMContentLoaded', () => {
      try {
        const script = document.createElement('script');
        script.textContent = code;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      } catch (err) {
        console.error('injectToPage fallback error', err);
      }
    }, { once: true });
  }
}

(function installPcTracker(){
  const patch = `
    (function(){
      try {
        if (window.__electron_pc_patched) return;
        window.__electron_pc_patched = true;
        const OrigPC = window.RTCPeerConnection;
        if (!OrigPC) return;
        window.__electron_pcs = [];

        function WrappedPC(...args) {
          const pc = new OrigPC(...args);
          try { window.__electron_pcs.push(pc); } catch(e){}
          const origClose = pc.close && pc.close.bind(pc);
          if (origClose) {
            pc.close = function() {
              try {
                const i = window.__electron_pcs.indexOf(pc);
                if (i !== -1) window.__electron_pcs.splice(i, 1);
              } catch(e){}
              return origClose();
            };
          }
          return pc;
        }

        WrappedPC.prototype = OrigPC.prototype;
        window.RTCPeerConnection = WrappedPC;
        console.log('[mic] RTCPeerConnection patched by preload');
      } catch(e) { try { console.warn('[mic] pc patch failed', e); } catch(_){} }
    })();
  `;
  try {
    injectToPage(patch);
  } catch(e){
    try { console.warn('installPcTracker inject failed', e); } catch(_) {}
  }
})();

function makeInjectCode(deviceId) {
  return `
    (function(){
      try {
        window.__electronPreferredMic = ${JSON.stringify(deviceId)};

        if (!navigator.mediaDevices) return;

        if (!navigator.mediaDevices.__electron_original_getUserMedia) {
          navigator.mediaDevices.__electron_original_getUserMedia =
            navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

          navigator.mediaDevices.getUserMedia = function(constraints) {
            constraints = constraints || {};
            try {
              if (constraints.audio === undefined) constraints.audio = true;
              if (typeof constraints.audio === 'boolean') constraints.audio = {};

              var hasDeviceId = false;
              try {
                if (constraints.audio) {
                  if (typeof constraints.audio === 'string') {
                    hasDeviceId = true;
                  } else if (typeof constraints.audio === 'object' && constraints.audio.deviceId) {
                    if (typeof constraints.audio.deviceId === 'string') hasDeviceId = true;
                    else if (typeof constraints.audio.deviceId === 'object' && Object.keys(constraints.audio.deviceId).length > 0) hasDeviceId = true;
                  }
                }
              } catch(e) { }

              if (!hasDeviceId && window.__electronPreferredMic) {
                try {
                  constraints.audio = Object.assign({}, constraints.audio, { deviceId: { exact: window.__electronPreferredMic } });
                } catch(e){}
              }
            } catch(e) {
            }
            return navigator.mediaDevices.__electron_original_getUserMedia(constraints);
          };
        } else {
          window.__electronPreferredMic = ${JSON.stringify(deviceId)};
        }

        (async function attemptReplace() {
          try {
            if (!window.__electronPreferredMic) return;

            var newStream = null;
            try {
              newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: window.__electronPreferredMic } } });
            } catch(e1) {
              try {
                newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
              } catch(e2) {
                newStream = null;
              }
            }

            if (!newStream) return;

            var newTrack = newStream.getAudioTracks()[0];
            if (!newTrack) {
              try { newStream.getTracks().forEach(t => { try { t.stop(); } catch(_){} }); } catch(_) {}
              return;
            }

            try {
              var pcs = Array.isArray(window.__electron_pcs) ? window.__electron_pcs : [];
              pcs.forEach(function(pc){
                try {
                  var senders = (pc.getSenders && typeof pc.getSenders === 'function') ? pc.getSenders() : [];
                  senders.forEach(function(sender){
                    try {
                      if (sender && sender.track && sender.track.kind === 'audio') {
                        if (typeof sender.replaceTrack === 'function') {
                          try { sender.replaceTrack(newTrack); } catch(e){}
                        }
                      }
                    } catch(e){}
                  });
                } catch(e){}
              });
              try { console.log('[mic] attempted replaceTrack on peer connections'); } catch(e){}
            } catch(e){}

            try { newStream.getTracks().forEach(t => { try { t.stop(); } catch(_){} }); } catch(_) {}

          } catch(e) {
            try { console.warn('[mic] attemptReplace error', e); } catch(_) {}
          }
        })();

      } catch(e) {
        try { console.error('electron mic wrapper error', e); } catch(_){}
      }
    })();
  `;
}

try {
  contextBridge.exposeInMainWorld('micSwitch', {
    replace: (deviceId) => {
      try {
        const code = makeInjectCode(deviceId);
        injectToPage(code);
      } catch (e) {
        console.error('micSwitch.replace error', e);
      }
    }
  });
} catch(e) {
  console.warn('Failed to expose micSwitch', e);
}

ipcRenderer.on('mic-changed', (event, deviceId) => {
  try {
    const code = makeInjectCode(deviceId);
    injectToPage(code);
  } catch (e) {
    console.error('ipcRenderer.mic-changed handling error', e);
  }
});

ipcRenderer.on('dimka-changed', (event, dataUrl) => {
  try {
    const code = `(function(){ try {
      const url = ${JSON.stringify(dataUrl)};
      document.querySelectorAll('.electron-dimka-image').forEach(el => { el.src = url; });
      window.__electronDimka = url;
    } catch(e){} })();`;
    injectToPage(code);
  } catch (e) {
    console.error('ipcRenderer.dimka-changed handling error', e);
  }
});

(async () => {
  try {
    const current = await ipcRenderer.invoke('get-current-mic');
    if (current) {
      const code = makeInjectCode(current);
      injectToPage(code);
    }
  } catch (e) {
  }
})();

(function() {
  const hotkeysCode = `
    (function(){
      function log(...args){ try { console.log('[hk]', ...args); } catch(e){} }

      function focusIsTyping(e){
        const t = e && e.target;
        if (!t) return false;
        const tag = (t.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return true;
        if (t.isContentEditable) return true;
        return false;
      }

      function isVisible(el){
        if(!el) return false;
        try {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity||'1')===0) return false;
          const r = el.getBoundingClientRect();
          return r.width>0 && r.height>0;
        } catch(e){ return false; }
      }

      function findAllDeep(root, selector){
        const res = [];
        (function walk(node){
          try {
            if (!node) return;
            if (node.querySelectorAll) {
              node.querySelectorAll(selector).forEach(el => res.push(el));
            }
            if (node.shadowRoot) walk(node.shadowRoot);
            node.childNodes && node.childNodes.forEach(child => walk(child));
          } catch(e){}
        })(root || document);
        return res;
      }

      function findByTextDeep(patterns, opts={}) {
        const results = [];
        function matchesText(text, pat){
          if(!text) return false;
          text = text.trim().replace(/\\s+/g,' ');
          if (pat instanceof RegExp) return pat.test(text);
          return text === pat || text.toLowerCase().includes(String(pat).toLowerCase());
        }
        function walk(node){
          if(!node) return;
          let list = [];
          try {
            list = Array.from(node.querySelectorAll('button, a, [role="button"], [data-testid], [data-action]'));
          } catch(e){}
          for (const n of list) {
            try {
              if (!isVisible(n)) continue;
              const text = (n.textContent || n.value || n.getAttribute('aria-label') || '').trim();
              for (const p of patterns) {
                if (matchesText(text, p)) {
                  results.push(n);
                }
              }
            } catch(e){}
          }
          if (node.shadowRoot) walk(node.shadowRoot);
          node.childNodes && node.childNodes.forEach(c => walk(c));
        }
        walk(document);
        return results;
      }

      function attemptClick(el) {
        if (!el) return false;
        try {
          log('attemptClick on', readable(el));
          try { el.click(); log('-> clicked via el.click()'); } catch(e){ log('-> el.click failed', e); }

          try {
            const down = new PointerEvent('pointerdown', { bubbles:true, cancelable:true, composed:true });
            const up = new PointerEvent('pointerup', { bubbles:true, cancelable:true, composed:true });
            const click = new MouseEvent('click', { bubbles:true, cancelable:true, composed:true });
            el.dispatchEvent(down);
            el.dispatchEvent(up);
            el.dispatchEvent(click);
            log('-> dispatched pointer/mouse events');
          } catch(e){ log('-> dispatch pointer events failed', e); }

          try {
            el.focus && el.focus();
            const ev = new KeyboardEvent('keydown', {key:'Enter', code:'Enter', bubbles:true, cancelable:true});
            el.dispatchEvent(ev);
            log('-> dispatched Enter');
          } catch(e){ log('-> dispatch Enter failed', e); }

          return true;
        } catch(e){
          log('attemptClick error', e);
          return false;
        }
      }

      function readable(el){
        try {
          const tag = el.tagName;
          const cls = el.className ? (' ' + el.className) : '';
          const txt = (el.textContent||'').trim().slice(0,60).replace(/\\s+/g,' ');
          return \`\${tag}\${cls} "\${txt}"\`;
        } catch(e){ return String(el); }
      }

      function clickByTextVariants(variants, opts={firstOnly:true, skipAnchors:false}) {
        for (const v of variants) {
          const found = findByTextDeep([v]);
          for (const el of found) {
            if (!isVisible(el)) continue;
            if (opts.skipAnchors && el.tagName && el.tagName.toLowerCase() === 'a') continue;
            if (attemptClick(el)) return el;
          }
        }
        return null;
      }

      function getVisibleModals(){
        const sel = ['[role="dialog"]', '.MuiDialog-root', '.modal', '.dialog', '.Dialog', '.ant-modal'];
        const nodes = Array.from(document.querySelectorAll(sel.join(','))).filter(isVisible);
        return nodes;
      }

      function waitForModal(timeout=2000){
        return new Promise(resolve => {
          const start = Date.now();
          (function poll(){
            const m = getVisibleModals();
            if (m.length) return resolve(m[0]);
            if (Date.now() - start > timeout) return resolve(null);
            setTimeout(poll, 120);
          })();
        });
      }

      function actionStart(){
        log('actionStart: try known selectors + text');
        const sel = ['button.start', 'button[data-action="start"]', 'button[data-testid="start-button"]'];
        for (const s of sel) {
          const el = document.querySelector(s);
          if (el && isVisible(el)) { if (attemptClick(el)) return true; }
        }
        const variants = ['Начало разговора','Начать разговор','Начать','Старт','Start'];
        const found = clickByTextVariants(variants);
        if (found) return true;
        log('actionStart: not found');
        return false;
      }

      function actionFinishMain(){
        log('actionFinishMain: try selectors + text');
        const sel = ['button.callScreen__finishBtn','button.finish','button[data-action="finish"]','button[data-testid="end-button"]'];
        for (const s of sel) {
          const el = document.querySelector(s);
          if (el && isVisible(el)) { if (attemptClick(el)) return true; }
        }
        const variants = ['Завершить','Завершить разговор','Завершить сеанс','Finish','End'];
        const found = clickByTextVariants(variants);
        if (found) return true;
        log('actionFinishMain: not found');
        return false;
      }

      async function actionSearchNew(){
        log('actionSearchNew: try prefer non-anchor buttons');
        const selectors = ['button[data-action="next"]','button[data-action="search-new"]','button[aria-label*="Поиск"]','button[aria-label*="Искать"]','button[data-testid="next"]'];
        for (const s of selectors){
          const el = document.querySelector(s);
          if (el && isVisible(el)) { if (attemptClick(el)) return true; }
        }
        const variants = ['Искать нового собеседника','Искать','Поиск собеседника','Найти собеседника','Искать нового','Next','Find'];
        const btn = clickByTextVariants(variants, {skipAnchors:true});
        if (btn) return true;

        const anchors = Array.from(document.querySelectorAll('a')).filter(isVisible);
        for (const a of anchors){
          try {
            const txt = (a.textContent||'').trim();
            for (const v of variants){
              if (!txt) continue;
              if (txt.includes(v) && !(a.getAttribute('href')||'').match(/(^#?$|audiochat#?$)/)) {
                if (attemptClick(a)) return true;
              }
            }
          } catch(e){}
        }
        log('actionSearchNew: not found');
        return false;
      }

async function actionDialogConfirm(){
  log('actionDialogConfirm: wait modal');
  const modal = await waitForModal(2000);
  if (modal){
    log('modal found', modal);
    const confirmVariants = ['Завершить','Подтвердить','Да','OK','Confirm','Yes'];
    for (const v of confirmVariants) {
      const found = findByTextDeep([v], { });
      for (const el of found) {
        if (!modal.contains(el)) continue;
        if (!isVisible(el)) continue;
        if (attemptClick(el)) return true;
      }
    }
    const roleBtns = Array.from(modal.querySelectorAll('[role="button"], button')).filter(isVisible);
    if (roleBtns.length){
      if (attemptClick(roleBtns[0])) return true;
    }
    try { modal.focus(); modal.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', bubbles:true})); return true; } catch(e){}
  } else {
    const res = clickByTextVariants(['Завершить','Подтвердить','Да','OK','Confirm','Yes']);
    if (res) return true;
    log('actionDialogConfirm: nothing found globally');
  }
  return false;
}

async function actionDialogCancel(){
  log('actionDialogCancel: wait modal');
  const modal = await waitForModal(2000);
  if (modal){
    const cancelVariants = ['Отменить','Отмена','Cancel','No'];
    for (const v of cancelVariants) {
      const found = findByTextDeep([v]);
      for (const el of found) {
        if (!modal.contains(el)) continue;
        if (!isVisible(el)) continue;
        if (attemptClick(el)) return true;
      }
    }
    const roleBtns = Array.from(modal.querySelectorAll('[role="button"], button')).reverse().filter(isVisible);
    if (roleBtns.length) { if (attemptClick(roleBtns[0])) return true; }
    try { modal.focus(); modal.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', code:'Escape', bubbles:true})); return true; } catch(e){}
  } else {
    const res = clickByTextVariants(['Отменить','Отмена','Cancel','No']);
    if (res) return true;
    log('actionDialogCancel: nothing found globally');
  }
  return false;
}

try {
  window.actionDialogConfirm = actionDialogConfirm;
  window.actionDialogCancel = actionDialogCancel;
} catch(e) {
  try { console.error('[hk] export actions failed', e); } catch(_) {}
}

      function actionToggleMute(){
        log('actionToggleMute: try selectors/text');
        const selectors = ['button[aria-label*="mute"]','button[aria-label*="Микрофон"]','button[title*="mute"]','button[title*="Микрофон"]','.microphone-toggle, .mute-button, .btn-mute','button[data-action="mute"]'];
        for (const s of selectors){
          const el = document.querySelector(s);
          if (el && isVisible(el)) { if (attemptClick(el)) return true; }
        }
        const txtRes = clickByTextVariants(['Включить микрофон','Выключить микрофон','Блокировать микрофон','Отключить микрофон','Mute','Unmute']);
        if (txtRes) return true;
        log('actionToggleMute: not found');
        return false;
      }

      window.addEventListener('keydown', function(e){
        try {
          if (focusIsTyping(e)) return;
          if (e.ctrlKey || e.altKey || e.metaKey) return;

switch(e.code){
  case 'F1':
    e.preventDefault(); e.stopPropagation(); log('F1 pressed'); actionStart(); break;

  case 'F2':
    e.preventDefault(); e.stopPropagation(); log('F2 pressed'); actionFinishMain(); break;

  case 'F3':
    e.preventDefault(); e.stopPropagation(); log('F3 pressed'); actionToggleMute(); break;

  case 'F4':
    e.preventDefault(); e.stopPropagation(); log('F4 pressed'); actionSearchNew(); break;

  case 'F5':
    e.preventDefault(); e.stopPropagation(); log('F5 pressed (cancel)'); actionDialogCancel(); break;

  case 'F6':
    e.preventDefault(); e.stopPropagation(); log('F6 pressed (confirm)'); actionDialogConfirm(); break;

  default:
    break;
}
        } catch(err){ log('key handler error', err); }
      }, false);

      log('hotkeys strong injector installed');
    })();
  `;

  try {
    injectToPage(hotkeysCode);
  } catch(e){}
})();

ipcRenderer.on('hotkey-f5', () => {
  injectToPage(`
    if (window.actionDialogCancel) {
      window.actionDialogCancel();
    }
  `);
});

ipcRenderer.on('hotkey-f6', () => {
  injectToPage(`
    if (window.actionDialogConfirm) {
      window.actionDialogConfirm();
    }
  `);
});

ipcRenderer.on('hotkey-f3', () => {
  injectToPage(`
    (function(){
      try {
        if (window.actionToggleMute && typeof window.actionToggleMute === 'function') {
          try { window.actionToggleMute(); return; } catch(e){}
        }

        var selectors = [
          '.callScreen__microBtn',
          'button[aria-label*="micro"]',
          '.microphone-toggle',
          'button[title*="micro"]',
          'button[aria-label*="Микрофон"]'
        ];

        var clicked = false;
        for (var i = 0; i < selectors.length && !clicked; i++) {
          try {
            var btn = document.querySelector(selectors[i]);
            if (btn) {
              try { btn.click(); clicked = true; break; } catch(e) {
                try {
                  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true, composed:true }));
                  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, cancelable:true, composed:true }));
                  btn.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, composed:true }));
                  clicked = true;
                  break;
                } catch(_) {}
              }
            }
          } catch(_) {}
        }

        if (!clicked) {
          try {
            var pathEl = document.querySelector('.callScreen__microBtn svg path');
            if (pathEl) {
              var pbtn = pathEl.closest('button');
              if (pbtn) { try { pbtn.click(); } catch(e){} }
            }
          } catch(_) {}
        }
      } catch(e){}
    })();
  `);
});

ipcRenderer.on('set-volume', (event, value) => {
  try {
    const code = makeVolumeCode(value);
    injectToPage(code);
  } catch (e) {
    console.error('ipcRenderer.set-volume handling error', e);
  }
});

(async () => {
  try {
    const current = await ipcRenderer.invoke('get-current-volume');
    if (typeof current !== 'undefined' && current !== null) {
      const code = makeVolumeCode(current);
      injectToPage(code);
    }
  } catch (e) {
  }
})();