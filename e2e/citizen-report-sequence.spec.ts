import { test, expect, type Page } from '@playwright/test';
import { captureIncidentPhoto, installFakeIncidentCamera } from './helpers/incident-camera';

// UI response handling only. Real counting/races are tested on native PostgreSQL.
async function fixture(page: Page, outcome: 'ordinary'|'restricted'|'other-account'|'new-session' = 'restricted') {
  await installFakeIncidentCamera(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('sequence-fixture')) {
      sessionStorage.setItem('sequence-fixture','1');
      localStorage.setItem('user',JSON.stringify({id:'sequence-citizen',name:'Synthetic Citizen',role:'USER'}));
      localStorage.setItem('emergency-session-generation','original-session');
    }
    for (const method of ['watchPosition','getCurrentPosition']) Object.defineProperty(navigator.geolocation,method,{
      configurable:true,value:(success:PositionCallback)=>setTimeout(()=>success({coords:{latitude:10.252191,longitude:123.949475,accuracy:25},timestamp:Date.now()} as GeolocationPosition),0),
    });
    Object.defineProperty(navigator.geolocation,'clearWatch',{configurable:true,value:(id:number)=>clearTimeout(id)});
  });
  let created = false, readsAfterCreate = 0;
  await page.route('https://nominatim.openstreetmap.org/**',route=>route.fulfill({json:{address:{town:'Cordova',province:'Cebu'}}}));
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname.replace(/\/$/,'');
    if(path==='/api/auth/v1/me') return route.fulfill({json:{data:{user:{id:'sequence-citizen',name:'Synthetic Citizen',role:'USER'}}}});
    if(path==='/api/incidents/v1/nearby-check') return route.fulfill({json:{data:{duplicate:false,locationAccepted:true,barangayName:'Poblacion'}}});
    if(path==='/api/incidents/v1/nearby-detection') return route.fulfill({json:{data:{active:true,complete:true,nearby:false,radiusMeters:100}}});
    if(path==='/api/upload/v1/signature') return route.fulfill({status:503,json:{message:'Synthetic fallback'}});
    if(path==='/api/upload/v1/image') return route.fulfill({json:{data:{url:'https://evidence.invalid/synthetic.jpg',publicId:'synthetic/proof',format:'jpg',bytes:100,width:10,height:10,fileName:'synthetic.jpg'}}});
    if(path==='/api/incidents/v1' && req.method()==='POST') {
      if(outcome==='other-account'||outcome==='new-session') await page.evaluate(kind=>{
        localStorage.setItem('user',JSON.stringify({id:kind==='other-account'?'new-citizen':'sequence-citizen',name:'New session',role:'USER'}));
        localStorage.setItem('emergency-session-generation','new-session');
      },outcome);
      created=true;
      return route.fulfill({status:201,json:{data:{incident:{incidentId:'accepted-third',reportedBy:'sequence-citizen'},...(outcome!=='ordinary'&&{accountDeactivated:true})}}});
    }
    if(path==='/api/incidents/v1'&&req.method()==='GET') {if(created)readsAfterCreate++;return route.fulfill({json:{data:{incidents:[]}}});}
    return route.fulfill({json:{data:{barangays:[],types:[],alerts:[]}}});
  });
  return {get created(){return created;},get readsAfterCreate(){return readsAfterCreate;}};
}
async function draft(page:Page) {
  await page.goto('/dashboard');
  await page.getByRole('button',{name:'Report a medical emergency'}).click();
  await page.getByLabel('Description of Incident').fill('Synthetic report for response handling');
  await page.getByLabel('Contact Number').fill('09171234567');
  await page.getByLabel('Incident barangay').selectOption('Poblacion');
  await expect(page.getByRole('button',{name:'Confirm GPS location'})).toBeEnabled();
  await page.getByRole('button',{name:'Confirm GPS location'}).click();
  await captureIncidentPhoto(page);
}
test('accepted restriction clears only its session, skips protected refetch and explains Main reactivation',async({page})=>{
  const calls=await fixture(page);await draft(page);
  await page.getByRole('button',{name:'Submit Report',exact:true}).click();
  await expect(page).toHaveURL(/\/login\?error=report_sequence_limit/);
  const notice=page.getByRole('tabpanel',{name:'Log In',exact:true}).getByRole('alert');
  await expect(notice).toContainText('Submitted reports remain with responders');
  await expect(notice).toContainText('Contact Main Admin for reactivation');
  expect(calls.created).toBe(true);expect(calls.readsAfterCreate).toBe(0);
  expect(await page.evaluate(()=>localStorage.getItem('user'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('emergency-session-generation'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('emergency-logout-epoch'))).toBeTruthy();
  await expect(page.getByText('Failed to submit incident report',{exact:false})).toHaveCount(0);
});
test('ordinary accepted report keeps the account and normal list refresh',async({page})=>{
  const calls=await fixture(page,'ordinary');await draft(page);
  await page.getByRole('button',{name:'Submit Report',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(calls.created).toBe(true);expect(calls.readsAfterCreate).toBe(1);
  expect(await page.evaluate(()=>localStorage.getItem('emergency-session-generation'))).toBe('original-session');
  await expect(page).toHaveURL(/\/dashboard/);
});
for(const outcome of ['other-account','new-session'] as const) test(`late restriction cannot clear a newer ${outcome}`,async({page})=>{
  const calls=await fixture(page,outcome);await draft(page);
  await page.getByRole('button',{name:'Submit Report',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(calls.created).toBe(true);expect(calls.readsAfterCreate).toBe(0);
  expect(await page.evaluate(()=>localStorage.getItem('emergency-session-generation'))).toBe('new-session');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('user')!).id)).toBe(outcome==='other-account'?'new-citizen':'sequence-citizen');
  await expect(page).toHaveURL(/\/dashboard/);
});
for(const mode of ['desktop-light','mobile-dark'] as const) test(`policy warning remains readable ${mode}`,async({page},testInfo)=>{
  await page.setViewportSize(mode==='desktop-light'?{width:1280,height:850}:{width:390,height:844});
  if(mode==='mobile-dark') await page.emulateMedia({colorScheme:'dark'});
  await fixture(page);await draft(page);
  const warning=page.getByText('Three consecutive reports requesting the same department within five minutes deactivate your account.',{exact:false});
  await warning.scrollIntoViewIfNeeded();await expect(warning).toBeVisible();
  await expect(page.getByRole('button',{name:'Submit Report',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('dialog').screenshot({path:testInfo.outputPath(`${mode}.png`)});
});
test('unknown login error query cannot inject arbitrary content',async({page})=>{
  await page.goto('/login?error=untrusted_message');
  await expect(page.getByRole('tabpanel',{name:'Log In',exact:true}).getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('untrusted_message')).toHaveCount(0);
});
