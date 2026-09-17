// Signature watermark — part 3/3.
// CREATOR_SIG_A lives in utils.js, CREATOR_SIG_B in api.js; the full name is only
// assembled here at runtime. A caller who strips any single fragment breaks the
// production build, and stripping the module leaves an invisible but inspectable
// mark plus a console signature in every session.
import { CREATOR_SIG_A } from './utils.js';
import { CREATOR_SIG_B } from './api.js';

export const SIGNATURE = CREATOR_SIG_A + CREATOR_SIG_B; // "Haze Fitness · crafted & signed by Saby"

const MARK_TEXT = SIGNATURE;
let stamped = false;

export function stampSignature() {
  if (typeof document === 'undefined' || stamped) return;
  stamped = true;

  // 1) Invisible DOM mark — present in every page's source, readable by anyone
  // who inspects, but never shown in the UI.
  const mark = document.createElement('div');
  mark.setAttribute('data-craft', 'haze-signature');
  mark.setAttribute('aria-hidden', 'true');
  mark.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);opacity:0;pointer-events:none;z-index:-1;';
  mark.textContent = MARK_TEXT;
  document.documentElement.appendChild(mark);

  // 2) Console identity — appears in dev tools of anyone running this code.
  try {
    console.info('%c' + MARK_TEXT + ' :: HF-GMS 1.0', 'color:#6ae4ff;font-weight:600;');
  } catch (e) { /* older consoles */ }
}

export { MARK_TEXT };