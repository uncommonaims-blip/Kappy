import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({...devices['Pixel 7'],viewport:{width:412,height:915}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(pathToFileURL(resolve('index.html')).href);
  await page.locator('[data-date]').first().waitFor();
  assert.equal(errors.length,0,'startup JavaScript errors');
  const dates=await page.locator('button[data-date]').evaluateAll(nodes=>nodes.map(n=>n.dataset.date));
  assert.ok(dates.length>=28);
  const start=dates[5],end=dates[8];
  // Start with an unselected date. This was previously impossible.
  const held=page.locator('button[data-date="'+start+'"]');
  const box=await held.boundingBox();
  assert.ok(box,'held date must be visible');
  const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height/2);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.getByText('Range mode ON').waitFor();
  assert.equal(await page.locator('[name="startDate"]').inputValue(),start);
  await page.locator('button[data-date="'+end+'"]').click();
  assert.equal(await page.locator('[name="endDate"]').inputValue(),end,'end date tap must not be swallowed after hold');
  // Switching modes must not erase partially written notes or time fields.
  await page.locator('#requestForm [name="note"]').fill('Available for the morning shift');
  await page.locator('#requestForm [name="startTime"]').fill('09:30');
  await page.locator('#requestForm [name="person"]').selectOption('Morgan');
  await page.locator('[data-requestmode="available"]').click();
  assert.equal(await page.locator('#requestForm [name="note"]').inputValue(),'Available for the morning shift');
  assert.equal(await page.locator('#requestForm [name="startTime"]').inputValue(),'09:30');
  assert.equal(await page.locator('#requestForm [name="person"]').inputValue(),'Morgan');
  assert.equal(await page.locator('#requestForm button[type="submit"]').innerText(),'Record available');
  await page.locator('[data-requestmode="unavailable"]').click();
  assert.equal(await page.locator('#requestForm [name="note"]').inputValue(),'Available for the morning shift');
  assert.equal(await page.locator('#requestForm [name="endDate"]').inputValue(),end);
  assert.equal(await page.locator('[data-requestmode="unavailable"]').getAttribute('aria-pressed'),'true');
  await page.locator('#requestForm button[type="submit"]').click();
  await page.getByText('Recorded').first().waitFor();
  for(const tab of ['messages','wellbeing','people','calendar']){
    await page.locator('[data-tab="'+tab+'"]').click();
    assert.ok((await page.locator('#panel').innerText()).trim().length>20,tab+' must render');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile hold on any date, range mode, end-date tap, mode switching preserves form details, form submit, navigation, no page errors');
}finally{await browser.close()}
