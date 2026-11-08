import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { launchChrome } from './lib/chrome.mjs';
import { createServer } from '../kaldan-site/server.mjs';

const out = path.resolve('capture');
await fs.rm(path.join(out, 'kaldan-enquiry.txt'), { force: true });
const server = createServer({ env: {}, rateLimit: { maxRequests: 100 }, fetch: async () => { throw new Error('Live email is disabled in browser tests'); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const routes = await (await fetch(`${base}/routes.json`)).json();
const report = { testedAt: new Date().toISOString(), routes: routes.length, profiles: [], checks: [], failures: [] };
const check = (name, valid, detail) => { report.checks.push({name,passed:!!valid,detail}); if(!valid)report.failures.push({name,detail}); };

async function session(name,width,height,options={}) {
  const browser=await launchChrome({width,height,mobile:!!options.mobile,logDir:out});
  const {cdp}=browser;
  const errors=[];
  cdp.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails.exception?.description || e.exceptionDetails.text));
  const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;};
  const settle=(frames=40)=>options.nojs ? evaluate('true') : evaluate(`new Promise(resolve=>{let n=0;function tick(){if(++n>${frames})resolve(true);else requestAnimationFrame(tick)}tick()})`);
  const shot=async label=>{await settle(10);const {data}=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:85,captureBeyondViewport:false});await fs.writeFile(path.join(out,`verified-${name}-${label}.jpg`),Buffer.from(data,'base64'));};
  const key=async (key,code=key,modifiers=0)=>{const keyCode=({Escape:27,Tab:9,ArrowRight:39,ArrowLeft:37,KeyA:65,Enter:13,Backspace:8})[code]||0;const event={key,code,modifiers,windowsVirtualKeyCode:keyCode,nativeVirtualKeyCode:keyCode};await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',...event});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',...event});};
  const rect=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);
  const scrollTo=async selector=>{const r=await rect(selector);if(options.nojs){await evaluate(`window.scrollBy({top:${r.top-115},behavior:'instant'})`);return;}await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:width-15,y:height-150,deltaX:0,deltaY:r.top-115});await settle(85);};
  const click=async selector=>{let r=await rect(selector);if(r.top<85 || r.bottom>height){await scrollTo(selector);r=await rect(selector);}const x=Math.min(width-10,r.x+r.width/2),y=Math.min(height-10,r.y+r.height/2);await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await settle(18);};
  const type=async (selector,text)=>{await click(selector);await key('a','KeyA',2);await key('Backspace');if(text)await cdp.send('Input.insertText',{text});await settle(5);};
  const goto=async route=>{await browser.goto(`${base}${route}`,{waitMs:60});if(!options.nojs)await evaluate('document.fonts.ready.then(()=>true)');await settle(5);};
  try{
    if(options.mobile)await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    if(options.reduced)await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    if(options.nojs)await cdp.send('Emulation.setScriptExecutionDisabled',{value:true});
    if(options.blocked)await cdp.send('Network.setBlockedURLs',{urls:['*main-*.js']});
    if(options.assetFailure)await cdp.send('Network.setBlockedURLs',{urls:['*.woff2','*.mp4']});
    await goto('/');
    check(`${name}: opening heading visible`,await evaluate("(()=>{const e=document.querySelector('h1'),r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.top>70&&r.bottom<innerHeight&&s.opacity!=='0'})()"));
    check(`${name}: no horizontal overflow`,await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    await shot('opening');
    if(options.nojs || options.blocked || options.assetFailure){
      await scrollTo('.dining-home');await shot('dining-fallback');
      check(`${name}: dining text visible`,await evaluate("(()=>{const e=document.querySelector('.dining-heading h2');return getComputedStyle(e).opacity==='1'&&e.getBoundingClientRect().top<innerHeight})()"));
      check(`${name}: all three stay cards remain in layout`,await evaluate("[...document.querySelectorAll('.room-feature')].every(e=>e.getBoundingClientRect().height>100)"));
      if(options.nojs)check(`${name}: static navigation available`,await evaluate("document.querySelector('.noscript-nav').getBoundingClientRect().height>0"));
    } else {
      await click('[data-open-menu]');
      check(`${name}: menu opens by pointer`,await evaluate("document.querySelector('#site-menu').open"));
      await shot('menu');
      for(let i=0;i<20;i++)await key('Tab');
      check(`${name}: menu keyboard focus remains inside`,await evaluate("document.querySelector('#site-menu').contains(document.activeElement)"));
      await key('Escape');await settle(8);
      check(`${name}: Escape closes and restores focus`,await evaluate("!document.querySelector('#site-menu').open&&document.activeElement.matches('[data-open-menu]')"));
      await click('[data-open-menu]');await click('#site-menu [data-close]');
      check(`${name}: visible menu close works`,await evaluate("!document.querySelector('#site-menu').open"));
      await click('.site-header [data-reserve]');
      check(`${name}: reservation handoff present`,await evaluate("document.querySelector('#reservation').open&&document.querySelector('#reservation a.button').href==='https://bookings.kaldanhotels.com/?propertyId=9858'"));
      await shot('reservation');await key('Escape');
      if(!options.reduced){
        await click('[data-pause-film]');
        check(`${name}: background film pauses`,await evaluate("document.querySelector('.arrival-film').paused"));
        await click('[data-pause-film]');
        await click('[data-film]');await settle(65);
        check(`${name}: palace film plays`,await evaluate("document.querySelector('#palace-film').open&&!document.querySelector('#palace-film video').paused&&document.querySelector('#palace-film video').readyState>=2"));
        await key('Escape');await settle(12);
        check(`${name}: closing film pauses it`,await evaluate("document.querySelector('#palace-film video').paused"));
      }else check(`${name}: no automatic film or sticky expansion`,await evaluate("!document.querySelector('.arrival-film').getAttribute('src')&&!document.querySelector('.arrival').classList.contains('is-cinematic')"));
      if(width>1000&&!options.reduced){
        await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:width-20,y:500,deltaX:0,deltaY:740});await settle(100);await shot('portal');
        check(`${name}: portal contracts and light header appears`,await evaluate("getComputedStyle(document.querySelector('.arrival-window')).clipPath.includes('round')&&document.querySelector('.site-header').dataset.theme==='light'&&document.querySelector('.arrival-copy').inert"));
        await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:width-20,y:500,deltaX:0,deltaY:-900});await settle(150);
        check(`${name}: reverse scroll restores hero controls`,await evaluate("!document.querySelector('.arrival-copy').inert&&Number(getComputedStyle(document.querySelector('.arrival-copy')).opacity)>.99"));
      }
      await scrollTo('.stay-section');
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:width-15,y:height-100,deltaX:0,deltaY:120});await settle(60);
      check(`${name}: dark header theme`,await evaluate("document.querySelector('.site-header').dataset.theme==='dark'"));
      await shot('stay');
      await scrollTo('.experience-stage');await click('[data-experience="1"]');
      check(`${name}: experience changes image and text`,await evaluate("document.querySelector('[data-experience=\"1\"]').getAttribute('aria-pressed')==='true'&&document.querySelector('.experience-counter').textContent==='02 / 03'&&document.querySelector('[data-experience-copy]').textContent.includes('Breathe')"));
      check(`${name}: experience text does not overlap controls`,await evaluate("document.querySelector('[data-experience-copy]').getBoundingClientRect().bottom<=document.querySelector('.experience-controls').getBoundingClientRect().top+1"));
      await settle(60);await shot('experience');
      await scrollTo('.dining-home');await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:width-15,y:height-100,deltaX:0,deltaY:130});await settle(60);await shot('dining');
      check(`${name}: light header and readable dining`,await evaluate("document.querySelector('.site-header').dataset.theme==='light'&&getComputedStyle(document.querySelector('.dining-heading h2')).opacity==='1'"));
      await goto('/accommodations/');await click('[data-filter="Villas"]');
      check(`${name}: villas filter`,await evaluate("document.querySelectorAll('[data-search-item]:not([hidden])').length===3"));
      await type('[data-search]','no-such-palace-room');
      check(`${name}: no-results message`,await evaluate("!document.querySelector('[data-empty]').hidden&&document.querySelectorAll('[data-search-item]:not([hidden])').length===0"));
      await type('[data-search]','');await click('[data-filter="all"]');
      check(`${name}: filters reset`,await evaluate("document.querySelectorAll('[data-search-item]:not([hidden])').length===8"));
      await goto('/accommodations/luxury-villa/');await shot('room-detail');
      await goto('/gallery/images/');await click('[data-filter="Dining"]');
      await click('[data-filter-item]:not([hidden]) [data-lightbox]');
      const caption=await evaluate("document.querySelector('#lightbox figcaption').textContent");
      check(`${name}: gallery lightbox opens`,await evaluate("document.querySelector('#lightbox').open&&document.querySelector('#lightbox img').naturalWidth>0"));
      await key('ArrowRight');check(`${name}: gallery next via keyboard`,caption!==await evaluate("document.querySelector('#lightbox figcaption').textContent"));
      await shot('gallery');await key('Escape');
      await goto('/faqs/');await type('[data-search]','check-in');
      check(`${name}: FAQ search`,await evaluate("document.querySelectorAll('.faq-list details:not([hidden])').length>0&&document.querySelectorAll('.faq-list details:not([hidden])').length<36"));
      await click('.faq-list details:not([hidden]) summary');
      check(`${name}: FAQ opens`,await evaluate("document.querySelector('.faq-list details:not([hidden])').open"));
      await goto('/contact-us/?room=Luxury%20Villa');
      check(`${name}: accommodation enquiry prefilled`,await evaluate("document.querySelector('[name=message]').value.includes('Luxury Villa')"));
      await click('button[type=submit]');
      check(`${name}: required-field validation`,await evaluate("!document.querySelector('form').checkValidity()&&!document.querySelector('.form-status').textContent.includes('Sending')"));
      await type('[name=name]','Browser Test Guest');await type('[name=email]','guest@example.com');await type('[name=message]','Local browser test only. Please do not send this enquiry.');
      await click('[name=consent]');await click('button[type=submit]');await settle(30);
      check(`${name}: unavailable delivery is honest`,await evaluate("/unavailable/i.test(document.querySelector('.form-status').textContent)&&!document.querySelector('form').classList.contains('is-sent')&&!document.querySelector('button[type=submit]').disabled"));
      await shot('contact-status');
      await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
      await click('[data-download-enquiry]');await settle(25);
      check(`${name}: enquiry download prepared`,await evaluate("/has not been sent/i.test(document.querySelector('.form-status').textContent)"));
    }
    if(options.allRoutes){
      const layouts=[];
      for(const route of routes){
        await goto(route.path);
        const layout=await evaluate("(()=>{const h=document.querySelector('h1'),r=h.getBoundingClientRect();return {path:location.pathname,h1:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth-innerWidth,top:r.top,bottom:r.bottom,heroBottom:h.closest('section').getBoundingClientRect().bottom,broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.getAttribute('src'))}})()");
        layouts.push(layout);
        check(`${name}: ${route.path} layout`,layout.h1===1&&layout.overflow<=1&&layout.top>=70&&layout.bottom<=layout.heroBottom&&layout.broken.length===0,layout);
      }
      report.profiles.push({name,width,height,layouts});
    }else report.profiles.push({name,width,height});
    check(`${name}: no JavaScript exceptions`,errors.length===0,errors);
  }catch(error){check(`${name}: completed test flow`,false,error.stack);await shot('failure').catch(()=>{});}
  finally{await browser.close();}
}
try{
  await session('desktop',1440,900,{allRoutes:true});
  await session('mobile',390,844,{mobile:true,allRoutes:true});
  await session('narrow',320,740,{mobile:true});
  await session('tablet',768,1024,{mobile:true});
  await session('reduced',1440,900,{reduced:true});
  await session('nojs',1440,900,{nojs:true});
  await session('blocked-module',1440,900,{blocked:true});
  await session('asset-failure',390,844,{mobile:true,assetFailure:true});
  const download=await fs.readFile(path.join(out,'kaldan-enquiry.txt'),'utf8').catch(()=> '');
  check('download contains actual enquiry, not a confirmation',download.includes('Browser Test Guest')&&download.includes('not a reservation confirmation'));
}finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
await fs.writeFile(path.join(out,'premium-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({checks:report.checks.length,failures:report.failures},null,2));
assert.equal(report.failures.length,0,'Browser verification failed; inspect capture/premium-verification.json');
