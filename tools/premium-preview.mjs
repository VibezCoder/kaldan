import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChrome } from './lib/chrome.mjs';
const base = process.env.SITE_URL || 'http://127.0.0.1:5174';
const out = path.resolve('capture');
for (const [name, width, height] of [['desktop',1440,900], ['mobile',390,844]]) {
  const browser = await launchChrome({width,height,mobile:name==='mobile',logDir:out});
  const {cdp} = browser;
  const errors=[];
  cdp.on('Runtime.exceptionThrown', e=>errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
  const evaluate = async expression => (await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;
  const settle = () => evaluate('new Promise(resolve=>{let n=0;function tick(){if(++n>80)resolve(true);else requestAnimationFrame(tick)}tick()})');
  const shot = async suffix => {await settle();const data=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:86,captureBeyondViewport:false});await fs.writeFile(path.join(out,`premium-${name}-${suffix}.jpg`),Buffer.from(data.data,'base64'));};
  try {
    await browser.goto(base,{waitMs:600});
    await evaluate('document.fonts.ready');
    await shot('opening');
    if(name==='desktop'){
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:1100,y:550,deltaX:0,deltaY:650});
      await shot('portal');
    }
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.round(width*.8),y:Math.round(height*.7),deltaX:0,deltaY:await evaluate("document.querySelector('.dining-home').getBoundingClientRect().top")});
    await shot('dining');
    console.log(name, await evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,heading:document.querySelector('.dining-heading h2').getBoundingClientRect().toJSON(),nav:document.querySelector('.site-header').dataset.theme})"));
    await browser.goto(`${base}/accommodations/`,{waitMs:300});
    await shot('rooms');
    await evaluate("document.querySelector('[data-search-scope]').scrollIntoView({behavior:'instant'})");
    await shot('room-list');
    await browser.goto(`${base}/contact-us/`,{waitMs:300});
    await evaluate("document.querySelector('form').scrollIntoView({behavior:'instant'})");
    await shot('contact');
    console.log(name,JSON.stringify({errors}));
  } finally {await browser.close();}
}
