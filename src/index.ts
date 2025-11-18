import { version as pcuiVersion, revision as pcuiRevision } from '@playcanvas/pcui';
import { version as engineVersion, revision as engineRevision } from 'playcanvas';

import { main } from './main';
import { version as appVersion } from '../package.json';

// print out versions of dependent packages
// NOTE: styles are linked via index.html (dist/index.css)
const params = new URLSearchParams(window.location.search.slice(1));
const enableDebugLog = params.has('debug');
if (!enableDebugLog) {
  console.log = () => {};
  console.debug = () => {};
}

// 过滤浏览器扩展的未处理 Promise 拒绝报错
window.addEventListener('unhandledrejection', (event) => {
  const reason: any = event.reason;
  const msg = typeof reason === 'string' ? reason : (reason && reason.message);
  if (typeof msg === 'string' && msg.includes('The message port closed before a response was received')) {
    event.preventDefault();
    console.debug('[silenced] extension message port closed before response');
  }
});

main();
