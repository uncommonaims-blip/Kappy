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
  // Exercise a genuine touch TAP first, not Playwright's synthetic mouse click.
  // A touchstart listener must never swallow ordinary date selection.
  const tapDate=dates[2],tapNode=page.locator('button[data-date="'+tapDate+'"]');
  const tapBox=await tapNode.boundingBox();
  assert.ok(tapBox,'tap date must be visible');
  const tapX=Math.round(tapBox.x+tapBox.width/2),tapY=Math.round(tapBox.y+tapBox.height/2);
  const tapCdp=await page.context().newCDPSession(page);
  await tapCdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tapX,y:tapY}]});
  await tapCdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(expected=>document.querySelector('[name="startDate"]')?.value===expected,tapDate);
  assert.equal(await page.locator('[name="startDate"]').inputValue(),tapDate,'ordinary touch tap selects a date');
  // Start with an unselected date. This was previously impossible.
  const held=page.locator('button[data-date="'+start+'"]');
  const box=await held.boundingBox();
  assert.ok(box,'held date must be visible');
  const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height/2);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('.calendar-feedback .calendar-range-prompt').waitFor();
  assert.match(await page.locator('.calendar-range-prompt').innerText(),/Tap an end date/);
  assert.ok(await page.locator('button[data-date="'+start+'"]').evaluate(el=>el.classList.contains('range-anchor')),'held date has active blue anchor class');
  assert.equal(await page.locator('button[data-date="'+start+'"]').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(37, 99, 235)','range anchor is visibly blue');
  assert.notEqual(await page.locator('button[data-date="'+start+'"]').evaluate(el=>getComputedStyle(el).animationName),'none','range anchor pulses');
  await page.getByText('Range mode ON').waitFor();
  assert.equal(await page.locator('[name="startDate"]').inputValue(),start);
  // Finish with a real touchscreen tap rather than Playwright's mouse click.
  // This exercises the exact Android gesture sequence reported broken.
  const endNode=page.locator('button[data-date="'+end+'"]');
  const endBox=await endNode.boundingBox();
  assert.ok(endBox,'ending date must be visible');
  const endX=Math.round(endBox.x+endBox.width/2),endY=Math.round(endBox.y+endBox.height/2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:endX,y:endY}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(expected=>document.querySelector('[name="endDate"]')?.value===expected,end);
  assert.equal(await page.locator('[name="endDate"]').inputValue(),end,'real touch end-date tap must finish range');
  assert.equal(await page.locator('.calendar-range-prompt').count(),0,'calendar prompt clears after end date selection');
  assert.equal(await page.locator('.range-anchor').count(),0,'blue pulse stops after range completion');
  // Switching modes must not erase partially written notes or time fields.
  await page.locator('#requestForm [name="note"]').fill('Available for the morning shift');
  await page.locator('#requestForm [name="startTime"]').fill('09:30');
  await page.locator('#requestForm [name="person"]').selectOption('Morgan');
  await page.locator('[data-requestmode="available"]').click();
  assert.equal(await page.locator('#requestForm [name="note"]').inputValue(),'Available for the morning shift');
  assert.equal(await page.locator('#requestForm [name="startTime"]').inputValue(),'09:30');
  assert.equal(await page.locator('#requestForm [name="person"]').inputValue(),'Morgan');
  assert.equal(await page.locator('#requestForm button[type="submit"]').innerText(),'Record available');
  // Calendar navigation also re-renders the form: no unsent details may vanish.
  await page.locator('[data-month="1"]').click();
  assert.equal(await page.locator('#requestForm [name="note"]').inputValue(),'Available for the morning shift','month navigation preserves draft');
  assert.equal(await page.locator('#requestForm [name="startTime"]').inputValue(),'09:30');
  assert.equal(await page.locator('#requestForm [name="person"]').inputValue(),'Morgan');
  assert.equal(await page.locator('#requestForm [name="startDate"]').inputValue(),start,'browsing months must not change selected start');
  assert.equal(await page.locator('#requestForm [name="endDate"]').inputValue(),end,'browsing months must not clear range');
  await page.locator('[data-month="-1"]').click();
  assert.equal(await page.locator('#requestForm [name="note"]').inputValue(),'Available for the morning shift');
  assert.equal(await page.locator('#requestForm [name="startDate"]').inputValue(),start);
  assert.equal(await page.locator('#requestForm [name="endDate"]').inputValue(),end);
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
  // Regression: the first click on the held date may be synthetic, but a later
  // deliberate click must be allowed to make a single-day range.
  await page.locator('button[data-date="'+start+'"]').click();
  await page.waitForTimeout(550);
  const same=page.locator('button[data-date="'+start+'"]');
  const sameBox=await same.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:Math.round(sameBox.x+sameBox.width/2),y:Math.round(sameBox.y+sameBox.height/2)}]});
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(550);
  await same.click();
  assert.equal(await page.locator('[name="endDate"]').inputValue(),start,'same-day end date must remain clickable');
  // Regression: range selection must continue across month navigation.
  const currentDates=await page.locator('button[data-date]').evaluateAll(nodes=>nodes.map(n=>n.dataset.date));
  const last=currentDates.at(-1);
  const lastDay=page.locator('button[data-date="'+last+'"]');
  const lastBox=await lastDay.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:Math.round(lastBox.x+lastBox.width/2),y:Math.round(lastBox.y+lastBox.height/2)}]});
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('[data-month="1"]').click();
  const nextMonthFirst=await page.locator('button[data-date]').first().getAttribute('data-date');
  await page.locator('button[data-date="'+nextMonthFirst+'"]').click();
  assert.equal(await page.locator('[name="startDate"]').inputValue(),last);
  assert.equal(await page.locator('[name="endDate"]').inputValue(),nextMonthFirst);
  assert.equal(await page.locator('button[data-date="'+nextMonthFirst+'"]').evaluate(el=>el.classList.contains('range-end')),true,'next-month end cap is highlighted');
  await page.locator('[data-month="-1"]').click();
  assert.equal(await page.locator('button[data-date="'+last+'"]').evaluate(el=>el.classList.contains('range-start')),true,'previous-month start cap remains highlighted');
  await page.locator('[data-month="1"]').click();
  const nextDates=await page.locator('button[data-date]').evaluateAll(nodes=>nodes.map(n=>n.dataset.date));
  const nextLater=nextDates[4];
  await page.locator('button[data-date="'+nextLater+'"]').click();
  await page.locator('[data-endmode="1"]').click();
  await page.locator('button[data-date="'+nextDates[8]+'"]').click();
  assert.ok(await page.locator('.day.in-range').count()>0,'intermediate dates have connected highlight');
  assert.equal(await page.locator('.day.in-range').first().evaluate(el=>getComputedStyle(el,'::before').content),'""','range bridge pseudo-element is rendered');
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile hold on any date, range mode, end-date tap, mode switching preserves form details, form submit, navigation, no page errors');
}finally{await browser.close()}
