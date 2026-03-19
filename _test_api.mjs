/**
 * ClawPM 超级全面 API 测试脚本 — 覆盖所有 PRD 功能
 * 每轮使用不同随机种子，从不同角度测试
 * 用法: node _test_api.mjs [--loop] [--rounds=100]
 */
const BASE = 'http://localhost:3210';
const TOKEN = 'dev-token';
const HEADERS = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'X-ClawPM-User': 'test-user' };
let ROUND = 1;
const UID = Date.now().toString(36);
function rnd(p=''){return `${p}${UID}-R${ROUND}-${Math.random().toString(36).slice(2,6)}`;}
let totalTests=0,passedTests=0,failedTests=0;const failures=[],testTimings=[];
async function api(method,path,body=null,extraHeaders={}){
  const headers={...HEADERS,...extraHeaders};
  if(!body||method==='GET')delete headers['Content-Type'];
  const opts={method,headers};
  if(body&&method!=='GET'){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
  try{const res=await fetch(`${BASE}${path}`,opts);let data=null;const text=await res.text();try{data=JSON.parse(text);}catch{data=text;}return{status:res.status,data,ok:res.ok};}
  catch(e){return{status:0,data:null,ok:false,error:e.message};}
}
async function test(name,fn){totalTests++;const s=Date.now();try{await fn();passedTests++;const ms=Date.now()-s;testTimings.push({name,ms});console.log(`  ✅ ${name} (${ms}ms)`);}catch(e){failedTests++;const ms=Date.now()-s;testTimings.push({name,ms,failed:true});const msg=e.message||String(e);failures.push({name,error:msg});console.log(`  ❌ ${name}: ${msg} (${ms}ms)`);}}
function assert(c,m){if(!c)throw new Error(m||'Assertion failed');}
function assertEqual(a,e,m){if(a!==e)throw new Error(`${m||'assertEqual'}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);}
function assertType(v,t,m){if(typeof v!==t)throw new Error(`${m}: expected ${t}, got ${typeof v}`);}

const ctx={};
function resetCtx(){Object.assign(ctx,{projectSlug:null,projectId:null,taskIds:[],backlogIds:[],domainId:null,domainName:null,domainPrefix:null,milestoneId:null,milestoneName:null,memberId:null,memberIdentifier:null,memberIdentifier2:null,agentIdentifier:null,iterationId:null,intakeId:null,intakeId2:null,customFieldId:null,customFieldId2:null,attachmentId:null,attachmentId2:null,reqLinkId:null,goalId:null,objectiveId:null,noteId:null,notificationId:null,accountToken:null,accountUsername:null});}

// ═══ 1. SERVER HEALTH ═══
async function testServerHealth(){
  console.log('\n🏥 [1/25] Server Health');
  await test('Server reachable',async()=>{const r=await api('GET','/api/v1/projects');assert(r.status!==0,`Server not reachable: ${r.error}`);});
}

// ═══ 2. PROJECTS ═══
async function testProjects(){
  console.log('\n📁 [2/25] Projects');
  await test('List projects (default exists)',async()=>{const r=await api('GET','/api/v1/projects');assertEqual(r.status,200,'status');assert(r.data.some(p=>p.slug==='default'),'default missing');});
  await test('Create project',async()=>{ctx.projectSlug=rnd('proj-');const r=await api('POST','/api/v1/projects',{name:`Test ${rnd()}`,slug:ctx.projectSlug,description:'Auto-test'});assertEqual(r.status,201,'create');ctx.projectId=r.data.id;});
  await test('Get project by slug',async()=>{const r=await api('GET',`/api/v1/projects/${ctx.projectSlug}`);assertEqual(r.status,200,'get');assertEqual(r.data.slug,ctx.projectSlug,'slug');});
  await test('Update project',async()=>{const d=rnd('upd-');const r=await api('PATCH',`/api/v1/projects/${ctx.projectSlug}`,{description:d});assertEqual(r.status,200,'patch');assertEqual(r.data.description,d,'desc');});
  await test('Create project no name → 400',async()=>{assertEqual((await api('POST','/api/v1/projects',{slug:'x'})).status,400,'400');});
  await test('Get non-existent project → 404',async()=>{assertEqual((await api('GET','/api/v1/projects/not-exist-xxx')).status,404,'404');});
  await test('Duplicate slug handling',async()=>{const r=await api('POST','/api/v1/projects',{name:rnd(),slug:ctx.projectSlug});assert(r.status===201||r.status===400||r.status===409,`got ${r.status}`);});
}

// ═══ 3. DOMAINS ═══
async function testDomains(){
  console.log('\n🏷️  [3/25] Domains');
  await test('Create domain',async()=>{ctx.domainName=rnd('Dom-');ctx.domainPrefix=`D${ROUND}${Math.random().toString(36).slice(2,6)}`.toUpperCase().slice(0,8);const r=await api('POST','/api/v1/domains',{name:ctx.domainName,task_prefix:ctx.domainPrefix,keywords:['test'],color:'#ff5733'});assertEqual(r.status,201,'create');ctx.domainId=r.data.id;});
  await test('List domains',async()=>{const r=await api('GET','/api/v1/domains');assertEqual(r.status,200,'list');assert(r.data.some(d=>d.id===ctx.domainId),'include');});
  await test('Update domain',async()=>{const r=await api('PATCH',`/api/v1/domains/${ctx.domainId}`,{color:'#00ff00'});assertEqual(r.status,200,'patch');assertEqual(r.data.color,'#00ff00','color');});
  await test('Update domain 404',async()=>{assertEqual((await api('PATCH','/api/v1/domains/99999',{color:'#000'})).status,404,'404');});
}

// ═══ 4. MILESTONES ═══
async function testMilestones(){
  console.log('\n🎯 [4/25] Milestones');
  await test('Create milestone',async()=>{ctx.milestoneName=rnd('MS-');const r=await api('POST','/api/v1/milestones',{name:ctx.milestoneName,target_date:'2026-06-01',description:'Test MS'});assertEqual(r.status,201,'create');ctx.milestoneId=r.data.id;});
  await test('List milestones (enriched)',async()=>{const r=await api('GET','/api/v1/milestones');assertEqual(r.status,200,'list');const m=r.data.find(x=>x.id===ctx.milestoneId);assert(m,'include');assertType(m.taskCount,'number','taskCount');});
  await test('Update milestone',async()=>{assertEqual((await api('PATCH',`/api/v1/milestones/${ctx.milestoneId}`,{description:rnd()})).status,200,'patch');});
  await test('Update milestone 404',async()=>{assertEqual((await api('PATCH','/api/v1/milestones/99999',{name:'x'})).status,404,'404');});
}

// ═══ 5. MEMBERS ═══
async function testMembers(){
  console.log('\n👤 [5/25] Members');
  await test('Create human member',async()=>{ctx.memberIdentifier=rnd('mem-');const r=await api('POST','/api/v1/members',{name:rnd('H-'),identifier:ctx.memberIdentifier,type:'human',role:'dev',description:'前端开发'});assertEqual(r.status,201,'create');ctx.memberId=r.data.id;});
  await test('Create member 2',async()=>{ctx.memberIdentifier2=rnd('mem2-');assertEqual((await api('POST','/api/v1/members',{name:rnd('C-'),identifier:ctx.memberIdentifier2,type:'human'})).status,201,'create');});
  await test('Create agent',async()=>{ctx.agentIdentifier=rnd('agent-');const r=await api('POST','/api/v1/agents',{name:rnd('AI-'),identifier:ctx.agentIdentifier,description:'Test Agent'});assertEqual(r.status,201,'create');assertEqual(r.data.type,'agent','type');});
  await test('List members (stats)',async()=>{const r=await api('GET','/api/v1/members');assertEqual(r.status,200,'list');const m=r.data.find(x=>x.identifier===ctx.memberIdentifier);assert(m,'include');assertType(m.taskCount,'number','taskCount');});
  await test('Get member',async()=>{const r=await api('GET',`/api/v1/members/${ctx.memberIdentifier}`);assertEqual(r.status,200,'get');assertEqual(r.data.identifier,ctx.memberIdentifier,'id');});
  await test('Update member',async()=>{const r=await api('PATCH',`/api/v1/members/${ctx.memberIdentifier}`,{role:'lead',description:'全栈'});assertEqual(r.status,200,'patch');assertEqual(r.data.role,'lead','role');});
  await test('Get 404 member',async()=>{assertEqual((await api('GET','/api/v1/members/not-exist-xxx')).status,404,'404');});
  await test('Check id taken',async()=>{const r=await api('GET',`/api/v1/members/check-identifier?identifier=${ctx.memberIdentifier}`);assertEqual(r.data.available,false,'taken');});
  await test('Check id free',async()=>{const r=await api('GET',`/api/v1/members/check-identifier?identifier=${rnd('avail-')}`);assertEqual(r.data.available,true,'free');});
}

// ═══ 6. TASKS CRUD ═══
async function testTasksCRUD(){
  console.log('\n📋 [6/25] Tasks CRUD');
  await test('Create root task (all fields)',async()=>{const r=await api('POST','/api/v1/tasks',{title:rnd('Root-'),description:'# Root',priority:'P1',owner:'test-user',labels:['feature','epic'],tags:['api-test'],due_date:'2026-06-01',start_date:'2026-03-20'});assertEqual(r.status,201,'create');assert(r.data.taskId.match(/^T-\d+$/),'T-NNN pattern');ctx.taskIds.push(r.data.taskId);});
  await test('Create child task',async()=>{const r=await api('POST','/api/v1/tasks',{title:rnd('Child-'),parent_task_id:ctx.taskIds[0],priority:'P2',owner:'test-user'});assertEqual(r.status,201,'create');assert(r.data.parentTaskId!==null,'has parent');ctx.taskIds.push(r.data.taskId);});
  await test('Create grandchild (3 levels)',async()=>{const r=await api('POST','/api/v1/tasks',{title:rnd('GChild-'),parent_task_id:ctx.taskIds[1],priority:'P3'});assertEqual(r.status,201,'create');ctx.taskIds.push(r.data.taskId);});
  await test('Create task with domain prefix',async()=>{const r=await api('POST','/api/v1/tasks',{title:rnd('DT-'),domain:ctx.domainName,priority:'P0'});assertEqual(r.status,201,'create');assert(r.data.taskId.startsWith(ctx.domainPrefix),`should start with ${ctx.domainPrefix}`);ctx.taskIds.push(r.data.taskId);});
  await test('Create task with milestone',async()=>{const r=await api('POST','/api/v1/tasks',{title:rnd('MST-'),milestone:ctx.milestoneName,status:'planned'});assertEqual(r.status,201,'create');ctx.taskIds.push(r.data.taskId);});
  await test('Create task with assignee',async()=>{const r=await api('POST','/api/v1/tasks',{title:rnd('AT-'),assignee:ctx.memberIdentifier,start_date:'2026-04-01',due_date:'2026-05-01'});assertEqual(r.status,201,'create');ctx.taskIds.push(r.data.taskId);});
  await test('Create minimal task (先上车后补票)',async()=>{const r=await api('POST','/api/v1/tasks',{title:rnd('Min-')});assertEqual(r.status,201,'create');assertEqual(r.data.status,'backlog','default backlog');assertEqual(r.data.priority,'P2','default P2');ctx.taskIds.push(r.data.taskId);});
  await test('List tasks',async()=>{const r=await api('GET','/api/v1/tasks');assertEqual(r.status,200,'list');assert(r.data.length>=7,'>=7 tasks');});
  await test('Get task (enriched)',async()=>{const r=await api('GET',`/api/v1/tasks/${ctx.taskIds[0]}`);assertEqual(r.status,200,'get');assertEqual(r.data.taskId,ctx.taskIds[0],'match');assert('labels' in r.data,'has labels');assert('tags' in r.data,'has tags');});
  await test('Get 404 task',async()=>{assertEqual((await api('GET','/api/v1/tasks/ZZZZZ-999')).status,404,'404');});
  await test('Update title',async()=>{const t=rnd('Upd-');const r=await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}`,{title:t});assertEqual(r.data.title,t,'title');});
  await test('Update status',async()=>{const r=await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}`,{status:'active'});assertEqual(r.data.status,'active','status');});
  await test('Update labels',async()=>{const r=await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}`,{labels:['feature','urgent']});assert(r.data.labels.includes('urgent'),'label');});
  await test('Update priority',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}`,{priority:'P0'})).data.priority,'P0','prio');});
  await test('Update tags',async()=>{const r=await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}`,{tags:['api-test','auto']});assert(r.data.tags.includes('auto'),'tag');});
  await test('Update owner',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}`,{owner:ctx.memberIdentifier})).status,200,'ok');});
  await test('Update assignee',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}`,{assignee:ctx.memberIdentifier2})).status,200,'ok');});
  await test('Update blocker',async()=>{const r=await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}`,{blocker:'Waiting API'});assertEqual(r.data.blocker,'Waiting API','blocker');});
  await test('Update 404',async()=>{assertEqual((await api('PATCH','/api/v1/tasks/ZZZZZ-999',{title:'x'})).status,404,'404');});
  await test('Filter by status',async()=>{const r=await api('GET','/api/v1/tasks?status=active');for(const t of r.data)assertEqual(t.status,'active','status');});
  await test('Filter by priority',async()=>{const r=await api('GET','/api/v1/tasks?priority=P0');for(const t of r.data)assertEqual(t.priority,'P0','prio');});
  await test('Filter by owner',async()=>{const r=await api('GET',`/api/v1/tasks?owner=${ctx.memberIdentifier}`);for(const t of r.data)assertEqual(t.owner,ctx.memberIdentifier,'owner');});
  await test('Rapid 5x concurrent create',async()=>{const ps=[];for(let i=0;i<5;i++)ps.push(api('POST','/api/v1/tasks',{title:rnd(`R${i}-`)}));const rs=await Promise.all(ps);for(let i=0;i<rs.length;i++){assert(rs[i].status===201,`Rapid ${i}: ${rs[i].status}`);ctx.taskIds.push(rs[i].data.taskId);}assertEqual(new Set(rs.map(r=>r.data.taskId)).size,rs.length,'unique IDs');});
}

// ═══ 7. TASKS TREE ═══
async function testTasksTree(){
  console.log('\n🌲 [7/25] Tasks Tree');
  await test('Get tree',async()=>{const r=await api('GET','/api/v1/tasks/tree');assertEqual(r.status,200,'tree');for(const n of r.data)assert('children' in n,'has children');});
  await test('Get tree filtered',async()=>{assertEqual((await api('GET','/api/v1/tasks/tree?status=active')).status,200,'ok');});
  await test('Get children',async()=>{const r=await api('GET',`/api/v1/tasks/${ctx.taskIds[0]}/children`);assertEqual(r.status,200,'children');assert(r.data.length>=1,'has child');});
  await test('Get context',async()=>{const r=await api('GET',`/api/v1/tasks/${ctx.taskIds[1]}/context`);assertEqual(r.status,200,'ctx');assert(r.data.ancestors.length>=1,'ancestors');assert(Array.isArray(r.data.siblings),'siblings');});
  await test('Grandchild context (deep)',async()=>{const r=await api('GET',`/api/v1/tasks/${ctx.taskIds[2]}/context`);assert(r.data.ancestors.length>=2,'>=2 ancestors');});
  await test('Context 404',async()=>{assertEqual((await api('GET','/api/v1/tasks/ZZZZZ-999/context')).status,404,'404');});
  await test('Reparent to root',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${ctx.taskIds[1]}/reparent`,{new_parent_task_id:null})).status,200,'ok');});
  await test('Reparent back',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${ctx.taskIds[1]}/reparent`,{new_parent_task_id:ctx.taskIds[0]})).status,200,'ok');});
  await test('Reparent cycle → 400',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}/reparent`,{new_parent_task_id:ctx.taskIds[1]})).status,400,'cycle');});
  await test('Reparent deep cycle → 400',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}/reparent`,{new_parent_task_id:ctx.taskIds[2]})).status,400,'deep cycle');});
  await test('Reparent 404',async()=>{assertEqual((await api('PATCH','/api/v1/tasks/ZZZZZ-999/reparent',{new_parent_task_id:null})).status,404,'404');});
  await test('Reorder children',async()=>{const ch=await api('GET',`/api/v1/tasks/${ctx.taskIds[0]}/children`);if(ch.data.length>0){const r=await api('PATCH','/api/v1/tasks/reorder-children',{parent_task_id:ctx.taskIds[0],ordered_child_ids:ch.data.map(c=>c.taskId)});assertEqual(r.status,200,'reorder');}});
  await test('Reorder invalid → 400',async()=>{assertEqual((await api('PATCH','/api/v1/tasks/reorder-children',{parent_task_id:ctx.taskIds[0],ordered_child_ids:'bad'})).status,400,'400');});
}

// ═══ 8. STATUS FLOW ═══
async function testStatusFlow(){
  console.log('\n🔄 [8/25] Status Flow');
  let tid;
  await test('Create flow task',async()=>{const r=await api('POST','/api/v1/tasks',{title:rnd('Flow-')});assertEqual(r.data.status,'backlog','default backlog');tid=r.data.taskId;ctx.taskIds.push(tid);});
  await test('backlog→planned',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${tid}`,{status:'planned'})).data.status,'planned','planned');});
  await test('planned→active',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${tid}`,{status:'active'})).data.status,'active','active');});
  await test('active→review',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${tid}`,{status:'review'})).data.status,'review','review');});
  await test('review→done',async()=>{assertEqual((await api('PATCH',`/api/v1/tasks/${tid}`,{status:'done'})).data.status,'done','done');});
}

// ═══ 9. PROGRESS ═══
async function testProgress(){
  console.log('\n📊 [9/25] Progress');
  await test('Update progress 50%',async()=>{const r=await api('POST',`/api/v1/tasks/${ctx.taskIds[0]}/progress`,{progress:50,summary:'Half'});assertEqual(r.data.progress,50,'50');});
  await test('Get history',async()=>{const r=await api('GET',`/api/v1/tasks/${ctx.taskIds[0]}/history`);assert(r.data.length>=1,'has history');});
  await test('Progress auto backlog→active',async()=>{const c=await api('POST','/api/v1/tasks',{title:rnd('AT-')});ctx.taskIds.push(c.data.taskId);const r=await api('POST',`/api/v1/tasks/${c.data.taskId}/progress`,{progress:10});assertEqual(r.data.status,'active','auto active');});
  await test('Progress 100 auto done',async()=>{const c=await api('POST','/api/v1/tasks',{title:rnd('AD-'),status:'active'});ctx.taskIds.push(c.data.taskId);const r=await api('POST',`/api/v1/tasks/${c.data.taskId}/progress`,{progress:100});assertEqual(r.data.status,'done','auto done');});
  await test('Report blocker',async()=>{assertEqual((await api('POST',`/api/v1/tasks/${ctx.taskIds[0]}/blocker`,{blocker:'Waiting'})).data.blocker,'Waiting','blocker');});
  await test('Complete task',async()=>{const r=await api('POST',`/api/v1/tasks/${ctx.taskIds[4]}/complete`,{summary:'Done'});assertEqual(r.data.status,'done','done');assertEqual(r.data.progress,100,'100');});
  await test('Progress 404',async()=>{assertEqual((await api('POST','/api/v1/tasks/ZZZZZ-999/progress',{progress:50})).status,404,'404');});
}

// ═══ 10. NOTES ═══
async function testNotes(){
  console.log('\n📝 [10/25] Notes');
  await test('Add note',async()=>{const r=await api('POST',`/api/v1/tasks/${ctx.taskIds[0]}/notes`,{content:rnd('Note-'),author:'test-user'});assertEqual(r.status,201,'create');ctx.noteId=r.data.id;});
  await test('Add note 2',async()=>{assertEqual((await api('POST',`/api/v1/tasks/${ctx.taskIds[0]}/notes`,{content:'## MD Note\n- item',author:ctx.memberIdentifier})).status,201,'create');});
  await test('List notes',async()=>{const r=await api('GET',`/api/v1/tasks/${ctx.taskIds[0]}/notes`);assert(r.data.length>=2,'>=2 notes');});
  await test('Note on 404 task',async()=>{assertEqual((await api('POST','/api/v1/tasks/ZZZZZ-999/notes',{content:'x'})).status,404,'404');});
}

// ═══ 11. BATCH ═══
async function testBatch(){
  console.log('\n🔄 [11/25] Batch Operations');
  await test('Batch update status',async()=>{const r=await api('PATCH','/api/v1/tasks/batch',{task_ids:ctx.taskIds.slice(0,3),updates:{status:'planned'}});assertEqual(r.status,200,'ok');for(const t of r.data)assertEqual(t.status,'planned','planned');});
  await test('Batch update priority',async()=>{const r=await api('PATCH','/api/v1/tasks/batch',{task_ids:ctx.taskIds.slice(0,2),updates:{priority:'P1'}});for(const t of r.data)assertEqual(t.priority,'P1','P1');});
  await test('Batch update owner',async()=>{assertEqual((await api('PATCH','/api/v1/tasks/batch',{task_ids:ctx.taskIds.slice(0,2),updates:{owner:ctx.memberIdentifier}})).status,200,'ok');});
  await test('Batch empty ids → 400',async()=>{assertEqual((await api('PATCH','/api/v1/tasks/batch',{task_ids:[],updates:{status:'active'}})).status,400,'400');});
  await test('Batch no updates → 400',async()=>{assertEqual((await api('PATCH','/api/v1/tasks/batch',{task_ids:[ctx.taskIds[0]]})).status,400,'400');});
}

// ═══ 12. ARCHIVE ═══
async function testArchive(){
  console.log('\n📦 [12/25] Archive');
  let atid;
  await test('Create archive task',async()=>{atid=(await api('POST','/api/v1/tasks',{title:rnd('Arch-')})).data.taskId;});
  await test('Archive task',async()=>{const r=await api('POST',`/api/v1/tasks/${atid}/archive`);assertEqual(r.status,200,'ok');assert(r.data.archivedAt,'has archivedAt');});
  await test('In archived list',async()=>{assert((await api('GET','/api/v1/tasks/archived')).data.some(t=>t.taskId===atid),'in list');});
  await test('Not in tree',async()=>{function find(ns,id){for(const n of ns){if(n.taskId===id)return true;if(n.children&&find(n.children,id))return true;}return false;}assert(!find((await api('GET','/api/v1/tasks/tree')).data,atid),'not in tree');});
  await test('Unarchive',async()=>{const r=await api('POST',`/api/v1/tasks/${atid}/unarchive`);assert(!r.data.archivedAt,'no archivedAt');});
  await api('DELETE',`/api/v1/tasks/${atid}`);
  await test('Archive 404',async()=>{assertEqual((await api('POST','/api/v1/tasks/ZZZZZ-999/archive')).status,404,'404');});
}

// ═══ 13. BACKLOG ═══
async function testBacklog(){
  console.log('\n📦 [13/25] Backlog');
  let bid1,bid2;
  await test('Create backlog item',async()=>{const r=await api('POST','/api/v1/backlog',{title:rnd('BL-'),description:'Backlog desc',priority:'P1',source:'agent',tags:['idea']});assertEqual(r.status,201,'create');bid1=r.data.backlogId;ctx.backlogIds.push(bid1);});
  await test('Create child backlog',async()=>{const r=await api('POST','/api/v1/backlog',{title:rnd('BLC-'),parent_backlog_id:bid1,priority:'P2'});assertEqual(r.status,201,'create');bid2=r.data.backlogId;ctx.backlogIds.push(bid2);});
  await test('Create backlog with domain',async()=>{const r=await api('POST','/api/v1/backlog',{title:rnd('BLD-'),domain:ctx.domainName,priority:'P0'});assertEqual(r.status,201,'create');ctx.backlogIds.push(r.data.backlogId);});
  await test('List backlog',async()=>{const r=await api('GET','/api/v1/backlog');assertEqual(r.status,200,'list');assert(r.data.length>=3,'>=3');});
  await test('List backlog tree',async()=>{const r=await api('GET','/api/v1/backlog/tree');assertEqual(r.status,200,'tree');for(const n of r.data)assert('children' in n,'has children');});
  await test('Filter backlog by priority',async()=>{const r=await api('GET','/api/v1/backlog?priority=P1');for(const b of r.data)assertEqual(b.priority,'P1','prio');});
  await test('Update backlog',async()=>{const t=rnd('UBL-');const r=await api('PATCH',`/api/v1/backlog/${bid1}`,{title:t,tags:['updated']});assertEqual(r.status,200,'patch');assertEqual(r.data.title,t,'title');assert(r.data.tags.includes('updated'),'tag');});
  await test('Update backlog 404',async()=>{assertEqual((await api('PATCH','/api/v1/backlog/BL-999999',{title:'x'})).status,404,'404');});
  await test('Schedule backlog→task',async()=>{const r=await api('POST',`/api/v1/backlog/${bid1}/schedule`,{owner:'test-user',milestone:ctx.milestoneName});assertEqual(r.status,200,'schedule');assert(r.data.taskId,'has taskId');ctx.taskIds.push(r.data.taskId);});
  await test('Schedule 404',async()=>{assertEqual((await api('POST','/api/v1/backlog/BL-999999/schedule',{})).status,404,'404');});
}

// ═══ 14. ITERATIONS ═══
async function testIterations(){
  console.log('\n🔁 [14/25] Iterations');
  await test('Create iteration',async()=>{const r=await api('POST','/api/v1/iterations',{name:rnd('Sprint-'),start_date:'2026-04-01',end_date:'2026-04-14',description:'Test sprint'});assertEqual(r.status,201,'create');ctx.iterationId=r.data.id;});
  await test('List iterations',async()=>{const r=await api('GET','/api/v1/iterations');assertEqual(r.status,200,'list');assert(r.data.some(i=>i.id===ctx.iterationId),'include');});
  await test('Get iteration by id',async()=>{const r=await api('GET',`/api/v1/iterations/${ctx.iterationId}`);assertEqual(r.status,200,'get');assert('stats' in r.data,'has stats');assert(Array.isArray(r.data.tasks),'has tasks');});
  await test('Update iteration',async()=>{const r=await api('PATCH',`/api/v1/iterations/${ctx.iterationId}`,{status:'active',description:rnd('upd-')});assertEqual(r.status,200,'patch');assertEqual(r.data.status,'active','status');});
  await test('Update iteration 404',async()=>{assertEqual((await api('PATCH','/api/v1/iterations/99999',{name:'x'})).status,404,'404');});
  await test('Add task to iteration',async()=>{const r=await api('POST',`/api/v1/iterations/${ctx.iterationId}/tasks`,{task_id:ctx.taskIds[0]});assertEqual(r.status,200,'add');});
  await test('Add task to iteration (idempotent)',async()=>{assertEqual((await api('POST',`/api/v1/iterations/${ctx.iterationId}/tasks`,{task_id:ctx.taskIds[0]})).status,200,'ok');});
  await test('Add second task',async()=>{assertEqual((await api('POST',`/api/v1/iterations/${ctx.iterationId}/tasks`,{task_id:ctx.taskIds[1]})).status,200,'ok');});
  await test('Iteration now has tasks',async()=>{const r=await api('GET',`/api/v1/iterations/${ctx.iterationId}`);assert(r.data.stats.totalTasks>=2,'>=2');});
  await test('Remove task from iteration',async()=>{assertEqual((await api('DELETE',`/api/v1/iterations/${ctx.iterationId}/tasks/${ctx.taskIds[1]}`)).status,200,'rm');});
  await test('Add task no body → 400',async()=>{assertEqual((await api('POST',`/api/v1/iterations/${ctx.iterationId}/tasks`,{})).status,400,'400');});
  await test('Create iteration no name → 400',async()=>{assertEqual((await api('POST','/api/v1/iterations',{start_date:'2026-05-01'})).status,400,'400');});
  await test('List iterations by status',async()=>{const r=await api('GET','/api/v1/iterations?status=active');for(const i of r.data)assertEqual(i.status,'active','status');});
}

// ═══ 15. NOTIFICATIONS ═══
async function testNotifications(){
  console.log('\n🔔 [15/25] Notifications');
  await test('Get notifications',async()=>{const r=await api('GET','/api/v1/notifications');assertEqual(r.status,200,'list');assert(Array.isArray(r.data),'array');});
  await test('Get unread count',async()=>{const r=await api('GET','/api/v1/notifications/unread-count');assertEqual(r.status,200,'ok');assertType(r.data.count,'number','count');});
  await test('Mark all read',async()=>{assertEqual((await api('POST','/api/v1/notifications/read-all')).status,200,'ok');});
  await test('Mark one read (may be 200)',async()=>{const r=await api('PATCH','/api/v1/notifications/1/read');assertEqual(r.status,200,'ok');});
  await test('Unread only filter',async()=>{const r=await api('GET','/api/v1/notifications?unread_only=true');assertEqual(r.status,200,'ok');});
}

// ═══ 16. CUSTOM FIELDS ═══
async function testCustomFields(){
  console.log('\n🏷️ [16/25] Custom Fields');
  await test('Create text field',async()=>{const r=await api('POST','/api/v1/custom-fields',{name:rnd('CF-'),field_type:'text'});assertEqual(r.status,201,'create');ctx.customFieldId=r.data.id;});
  await test('Create select field',async()=>{const r=await api('POST','/api/v1/custom-fields',{name:rnd('SEL-'),field_type:'select',options:['A','B','C'],color:'#ff0000'});assertEqual(r.status,201,'create');ctx.customFieldId2=r.data.id;});
  await test('List fields',async()=>{const r=await api('GET','/api/v1/custom-fields');assertEqual(r.status,200,'list');assert(r.data.length>=2,'>=2');});
  await test('Update field',async()=>{const r=await api('PATCH',`/api/v1/custom-fields/${ctx.customFieldId}`,{name:rnd('UCF-'),sort_order:5});assertEqual(r.status,200,'patch');assertEqual(r.data.sortOrder,5,'sortOrder');});
  await test('Update field 404',async()=>{assertEqual((await api('PATCH','/api/v1/custom-fields/99999',{name:'x'})).status,404,'404');});
  await test('Set task field values',async()=>{const body={};body[ctx.customFieldId]=rnd('val-');body[ctx.customFieldId2]='A';const r=await api('PUT',`/api/v1/tasks/${ctx.taskIds[0]}/fields`,body);assertEqual(r.status,200,'put');assert(r.data.length>=2,'>=2 vals');});
  await test('Get task fields',async()=>{const r=await api('GET',`/api/v1/tasks/${ctx.taskIds[0]}/fields`);assertEqual(r.status,200,'get');assert(r.data.length>=2,'>=2');assert(r.data.some(v=>v.fieldName),'has fieldName');});
  await test('Clear field value',async()=>{const body={};body[ctx.customFieldId]='';const r=await api('PUT',`/api/v1/tasks/${ctx.taskIds[0]}/fields`,body);assertEqual(r.status,200,'clear');});
  await test('Get fields 404 task',async()=>{assertEqual((await api('GET','/api/v1/tasks/ZZZZZ-999/fields')).status,404,'404');});
  await test('Delete field (cascades values)',async()=>{assertEqual((await api('DELETE',`/api/v1/custom-fields/${ctx.customFieldId}`)).status,200,'delete');});
  await test('Delete field 404',async()=>{assertEqual((await api('DELETE','/api/v1/custom-fields/99999')).status,404,'404');});
}

// ═══ 17. ATTACHMENTS ═══
async function testAttachments(){
  console.log('\n📎 [17/25] Attachments');
  await test('Add doc attachment',async()=>{const r=await api('POST',`/api/v1/tasks/${ctx.taskIds[0]}/attachments`,{type:'doc',title:rnd('Doc-'),content:'# Hello\nWorld',created_by:'test-user'});assertEqual(r.status,201,'create');ctx.attachmentId=r.data.id;});
  await test('Add link attachment',async()=>{const r=await api('POST',`/api/v1/tasks/${ctx.taskIds[0]}/attachments`,{type:'link',title:rnd('Link-'),content:'https://example.com',metadata:{url:'https://example.com'}});assertEqual(r.status,201,'create');ctx.attachmentId2=r.data.id;});
  await test('List attachments',async()=>{const r=await api('GET',`/api/v1/tasks/${ctx.taskIds[0]}/attachments`);assertEqual(r.status,200,'list');assert(r.data.length>=2,'>=2');});
  await test('Filter attachments by type',async()=>{const r=await api('GET',`/api/v1/tasks/${ctx.taskIds[0]}/attachments?type=doc`);for(const a of r.data)assertEqual(a.type,'doc','type');});
  await test('Get attachment by id',async()=>{const r=await api('GET',`/api/v1/attachments/${ctx.attachmentId}`);assertEqual(r.status,200,'get');assertType(r.data.metadata,'object','metadata');});
  await test('Update attachment',async()=>{const r=await api('PATCH',`/api/v1/attachments/${ctx.attachmentId}`,{title:rnd('UDoc-'),content:'Updated!'});assertEqual(r.status,200,'patch');assertEqual(r.data.content,'Updated!','content');});
  await test('Update attachment 404',async()=>{assertEqual((await api('PATCH','/api/v1/attachments/99999',{title:'x'})).status,404,'404');});
  await test('Reorder attachments',async()=>{const r=await api('PATCH',`/api/v1/tasks/${ctx.taskIds[0]}/attachments/reorder`,{ordered_ids:[ctx.attachmentId2,ctx.attachmentId]});assertEqual(r.status,200,'reorder');});
  await test('Add attachment to 404 task',async()=>{assertEqual((await api('POST','/api/v1/tasks/ZZZZZ-999/attachments',{type:'doc',title:'x',content:'x'})).status,404,'404');});
  await test('Delete attachment',async()=>{assertEqual((await api('DELETE',`/api/v1/attachments/${ctx.attachmentId2}`)).status,200,'delete');});
  await test('Delete attachment 404',async()=>{assertEqual((await api('DELETE','/api/v1/attachments/99999')).status,404,'404');});
}

// ═══ 18. GOALS & OKR ═══
async function testGoals(){
  console.log('\n🎯 [18/25] Goals & OKR');
  await test('Create goal with objectives',async()=>{const r=await api('POST','/api/v1/goals',{title:rnd('Goal-'),description:'OKR test',target_date:'2026-Q2',set_by:'test-user',objectives:[{title:rnd('KR1-'),weight:0.6},{title:rnd('KR2-'),weight:0.4}]});assertEqual(r.status,201,'create');ctx.goalId=r.data.id;});
  await test('List goals (enriched)',async()=>{const r=await api('GET','/api/v1/goals');assertEqual(r.status,200,'list');const g=r.data.find(x=>x.id===ctx.goalId);assert(g,'goal found');assert(g.objectives.length>=2,'>=2 KRs');ctx.objectiveId=g.objectives[0].id;});
  await test('Link task to objective',async()=>{const r=await api('POST',`/api/v1/goals/${ctx.goalId}/link-task`,{objective_id:ctx.objectiveId,task_id:ctx.taskIds[0]});assertEqual(r.status,200,'link');});
  await test('Link 404 task to objective',async()=>{assertEqual((await api('POST',`/api/v1/goals/${ctx.goalId}/link-task`,{objective_id:ctx.objectiveId,task_id:'ZZZZZ-999'})).status,404,'404');});
}

// ═══ 19. REQ LINKS ═══
async function testReqLinks(){
  console.log('\n🔗 [19/25] Req Links');
  await test('Create relates link',async()=>{const r=await api('POST','/api/v1/req-links',{source_task_id:ctx.taskIds[0],target_task_id:ctx.taskIds[1],link_type:'relates'});assertEqual(r.status,201,'create');assert(r.data.sourceTaskStrId,'sourceStr');ctx.reqLinkId=r.data.id;});
  await test('Create blocks link',async()=>{const r=await api('POST','/api/v1/req-links',{source_task_id:ctx.taskIds[0],target_task_id:ctx.taskIds[3],link_type:'blocks'});assertEqual(r.status,201,'create');});
  await test('Duplicate link (idempotent)',async()=>{const r=await api('POST','/api/v1/req-links',{source_task_id:ctx.taskIds[0],target_task_id:ctx.taskIds[1],link_type:'relates'});assertEqual(r.status,201,'idempotent');});
  await test('Self-link → 400',async()=>{assertEqual((await api('POST','/api/v1/req-links',{source_task_id:ctx.taskIds[0],target_task_id:ctx.taskIds[0]})).status,400,'self');});
  await test('List all links',async()=>{const r=await api('GET','/api/v1/req-links');assertEqual(r.status,200,'list');assert(r.data.length>=2,'>=2');});
  await test('Delete link',async()=>{assertEqual((await api('DELETE',`/api/v1/req-links/${ctx.reqLinkId}`)).status,200,'del');});
}

// ═══ 20. INTAKE ═══
async function testIntake(){
  console.log('\n📥 [20/25] Intake');
  await test('Submit intake (public)',async()=>{const r=await api('POST','/api/v1/intake',{title:rnd('Bug-'),description:'Something broken',category:'bug',submitter:'external-user',priority:'P1'});assertEqual(r.status,201,'create');ctx.intakeId=r.data.intakeId;});
  await test('Submit intake 2',async()=>{const r=await api('POST','/api/v1/intake',{title:rnd('Feat-'),category:'feature',submitter:'user2'});assertEqual(r.status,201,'create');ctx.intakeId2=r.data.intakeId;});
  await test('Submit no title → 400',async()=>{assertEqual((await api('POST','/api/v1/intake',{submitter:'x'})).status,400,'400');});
  await test('Submit no submitter → 400',async()=>{assertEqual((await api('POST','/api/v1/intake',{title:'x'})).status,400,'400');});
  await test('List intake',async()=>{const r=await api('GET','/api/v1/intake');assertEqual(r.status,200,'list');assert(r.data.length>=2,'>=2');});
  await test('Get intake by id',async()=>{const r=await api('GET',`/api/v1/intake/${ctx.intakeId}`);assertEqual(r.status,200,'get');assertEqual(r.data.intakeId,ctx.intakeId,'id');});
  await test('Get intake 404',async()=>{assertEqual((await api('GET','/api/v1/intake/IN-999')).status,404,'404');});
  await test('Intake stats',async()=>{const r=await api('GET','/api/v1/intake/stats');assertEqual(r.status,200,'stats');assertType(r.data.pending,'number','pending');assertType(r.data.total,'number','total');});
  await test('Review accept → creates task',async()=>{const r=await api('POST',`/api/v1/intake/${ctx.intakeId}/review`,{action:'accept',reviewed_by:'test-user',review_note:'LGTM',owner:'test-user'});assertEqual(r.status,200,'accept');assert(r.data.task,'has task');assert(r.data.task.taskId,'taskId');ctx.taskIds.push(r.data.task.taskId);});
  await test('Review already reviewed → 400',async()=>{assertEqual((await api('POST',`/api/v1/intake/${ctx.intakeId}/review`,{action:'reject',reviewed_by:'test-user'})).status,400,'already');});
  await test('Review defer',async()=>{const r3=await api('POST','/api/v1/intake',{title:rnd('D-'),submitter:'u3'});const id3=r3.data.intakeId;const r=await api('POST',`/api/v1/intake/${id3}/review`,{action:'defer',reviewed_by:'test-user',review_note:'Later'});assertEqual(r.data.status,'deferred','deferred');
    // Reopen
    const ro=await api('POST',`/api/v1/intake/${id3}/reopen`);assertEqual(ro.data.status,'pending','reopened');});
  await test('Review reject',async()=>{const r=await api('POST',`/api/v1/intake/${ctx.intakeId2}/review`,{action:'reject',reviewed_by:'test-user',review_note:'No'});assertEqual(r.data.status,'rejected','rejected');});
  await test('Review no action → 400',async()=>{const r4=await api('POST','/api/v1/intake',{title:rnd('NA-'),submitter:'u4'});assertEqual((await api('POST',`/api/v1/intake/${r4.data.intakeId}/review`,{reviewed_by:'test-user'})).status,400,'400');});
  await test('Reopen non-deferred → 400',async()=>{assertEqual((await api('POST',`/api/v1/intake/${ctx.intakeId2}/reopen`)).status,400,'not deferred');});
  await test('Filter intake by status',async()=>{const r=await api('GET','/api/v1/intake?status=accepted');for(const i of r.data)assertEqual(i.status,'accepted','status');});
  await test('Filter intake by category',async()=>{const r=await api('GET','/api/v1/intake?category=bug');for(const i of r.data)assertEqual(i.category,'bug','cat');});
}

// ═══ 21. PERMISSIONS ═══
async function testPermissions(){
  console.log('\n🔐 [21/25] Permissions');
  const tid=ctx.taskIds[0];
  // First ensure the task owner is test-user
  await api('PATCH',`/api/v1/tasks/${tid}`,{owner:'test-user'});
  await test('Grant view perm',async()=>{const r=await api('POST',`/api/v1/tasks/${tid}/permissions`,{grantee:ctx.memberIdentifier,level:'view'});assertEqual(r.status,200,'grant');assertEqual(r.data.level,'view','view');});
  await test('Upgrade to edit perm (idempotent)',async()=>{const r=await api('POST',`/api/v1/tasks/${tid}/permissions`,{grantee:ctx.memberIdentifier,level:'edit'});assertEqual(r.data.level,'edit','edit');});
  await test('List task permissions',async()=>{const r=await api('GET',`/api/v1/tasks/${tid}/permissions`);assertEqual(r.status,200,'list');assert(r.data.permissions.length>=1,'>=1');assertEqual(r.data.myPermission,'owner','owner');});
  await test('Revoke permission',async()=>{const r=await api('DELETE',`/api/v1/tasks/${tid}/permissions/${ctx.memberIdentifier}`);assertEqual(r.status,204,'revoke');});
  await test('Revoke 404',async()=>{assertEqual((await api('DELETE',`/api/v1/tasks/${tid}/permissions/nobody-xxx`)).status,404,'404');});
  await test('Grant no grantee → 400',async()=>{assertEqual((await api('POST',`/api/v1/tasks/${tid}/permissions`,{level:'edit'})).status,400,'400');});
  await test('Grant invalid level → 400',async()=>{assertEqual((await api('POST',`/api/v1/tasks/${tid}/permissions`,{grantee:ctx.memberIdentifier,level:'admin'})).status,400,'400');});
  await test('Grant self → 400',async()=>{assertEqual((await api('POST',`/api/v1/tasks/${tid}/permissions`,{grantee:'test-user',level:'edit'})).status,400,'self');});
  await test('Perm on 404 task',async()=>{assertEqual((await api('GET','/api/v1/tasks/ZZZZZ-999/permissions')).status,404,'404');});
}

// ═══ 22. AUTH ═══
async function testAuth(){
  console.log('\n🔑 [22/25] Auth (Registration & Login)');
  const uname=rnd('user-').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,20);
  const pwd=rnd('Pwd!1-');
  let token;
  await test('Register new account',async()=>{const r=await api('POST','/api/v1/auth/register',{username:uname,password:pwd,display_name:rnd('DN-')});assertEqual(r.status,201,'register');assert(r.data.token,'has token');assert(r.data.token.startsWith('clawpm_sess_'),'sess prefix');token=r.data.token;ctx.accountToken=token;ctx.accountUsername=uname;assert(r.data.account.username===uname,'username');});
  await test('Duplicate register → 400',async()=>{assertEqual((await api('POST','/api/v1/auth/register',{username:uname,password:pwd,display_name:'dup'})).status,400,'dup');});
  await test('Register short password → 400',async()=>{assertEqual((await api('POST','/api/v1/auth/register',{username:rnd('u2-').slice(0,10),password:'12',display_name:'x'})).status,400,'short');});
  await test('Register bad username → 400',async()=>{assertEqual((await api('POST','/api/v1/auth/register',{username:'ab',password:'123456',display_name:'x'})).status,400,'bad');});
  await test('Register no displayName → 400',async()=>{assertEqual((await api('POST','/api/v1/auth/register',{username:rnd('u3-').slice(0,10),password:'123456',display_name:'  '})).status,400,'empty');});
  await test('Login',async()=>{const r=await api('POST','/api/v1/auth/login',{username:uname,password:pwd});assertEqual(r.status,200,'login');assert(r.data.token,'has token');});
  await test('Login wrong password → 401',async()=>{assertEqual((await api('POST','/api/v1/auth/login',{username:uname,password:'wrong!!'})).status,401,'wrong');});
  await test('Login wrong username → 401',async()=>{assertEqual((await api('POST','/api/v1/auth/login',{username:'nonexist_zzz',password:pwd})).status,401,'wrong');});
  await test('Get /auth/me with session',async()=>{const r=await api('GET','/api/v1/auth/me',null,{'Authorization':`Bearer ${token}`});assertEqual(r.status,200,'me');assertEqual(r.data.account.username,uname,'username');});
  await test('Get /auth/me with legacy token → 401',async()=>{const r=await api('GET','/api/v1/auth/me',null,{'Authorization':'Bearer dev-token'});assertEqual(r.status,401,'401');});
  await test('Select member',async()=>{const r=await api('POST','/api/v1/auth/select-member',{member_identifier:uname},{Authorization:`Bearer ${token}`});assertEqual(r.status,200,'select');assert(r.data.currentMember,'has member');});
  await test('Select member - create new',async()=>{const newId=rnd('nm-').slice(0,20);const r=await api('POST','/api/v1/auth/select-member',{create_member:{name:rnd('N-'),identifier:newId}},{Authorization:`Bearer ${token}`});assertEqual(r.status,200,'create');assertEqual(r.data.currentMember.identifier,newId,'id');});
  await test('Logout',async()=>{const r=await api('POST','/api/v1/auth/logout',null,{'Authorization':`Bearer ${token}`});assertEqual(r.status,200,'logout');});
  await test('After logout, /me fails',async()=>{const r=await api('GET','/api/v1/auth/me',null,{'Authorization':`Bearer ${token}`});assertEqual(r.status,401,'expired');});
}

// ═══ 23. AGENT TOKENS ═══
async function testAgentTokens(){
  console.log('\n🤖 [23/25] Agent Tokens');
  const agentId=ctx.agentIdentifier;
  let tokenId,fullToken;
  await test('Create agent token',async()=>{const r=await api('POST',`/api/v1/agents/${agentId}/tokens`,{client_type:'cline',name:rnd('tok-')});assertEqual(r.status,201,'create');assert(r.data.token.startsWith('clawpm_agent_'),'prefix');tokenId=r.data.id;fullToken=r.data.token;});
  await test('List agent tokens',async()=>{const r=await api('GET',`/api/v1/agents/${agentId}/tokens`);assertEqual(r.status,200,'list');assert(r.data.length>=1,'>=1');assert(!r.data[0].token,'no full token exposed');assert(r.data[0].tokenPrefix,'has prefix');});
  await test('Rotate agent token',async()=>{const r=await api('POST',`/api/v1/agents/${agentId}/tokens/${tokenId}/rotate`,{client_type:'cursor',name:rnd('rot-')});assertEqual(r.status,200,'rotate');assert(r.data.token!==fullToken,'new token');assert(r.data.token.startsWith('clawpm_agent_'),'prefix');});
  await test('Revoke agent token',async()=>{const r2=await api('POST',`/api/v1/agents/${agentId}/tokens`,{name:rnd('rev-')});assertEqual(r2.status,201,'create2');const r=await api('POST',`/api/v1/agents/${agentId}/tokens/${r2.data.id}/revoke`);assertEqual(r.status,200,'revoke');});
  await test('Get openclaw config',async()=>{const r=await api('GET',`/api/v1/agents/${agentId}/openclaw-config`);assertEqual(r.status,200,'config');assert(r.data.token,'has token');assert(r.data.sseUrl,'has sseUrl');assert(r.data.configJson,'has configJson');assert(r.data.configJson.mcpServers.clawpm,'has clawpm server');});
  await test('Agent token auth works',async()=>{const newTok=await api('POST',`/api/v1/agents/${agentId}/tokens`,{name:rnd('auth-')});const r=await api('GET','/api/v1/tasks',null,{'Authorization':`Bearer ${newTok.data.token}`,'X-ClawPM-User':agentId});assertEqual(r.status,200,'auth ok');});
}

// ═══ 24. DASHBOARD / RISK / GANTT / OVERVIEW ═══
async function testDashboard(){
  console.log('\n📊 [24/25] Dashboard, Risk, Gantt, Overview');
  await test('Dashboard overview',async()=>{const r=await api('GET','/api/v1/dashboard/overview');assertEqual(r.status,200,'overview');assertType(r.data.total,'number','total');assertType(r.data.done,'number','done');assertType(r.data.completionRate,'number','rate');});
  await test('Dashboard risks',async()=>{const r=await api('GET','/api/v1/dashboard/risks');assertEqual(r.status,200,'risks');assert('summary' in r.data,'summary');assert(Array.isArray(r.data.overdue),'overdue arr');assert(Array.isArray(r.data.atRisk),'atRisk arr');assert(Array.isArray(r.data.blocked),'blocked arr');assert(Array.isArray(r.data.stalled),'stalled arr');assert(Array.isArray(r.data.byDomain),'byDomain arr');});
  await test('Dashboard resources',async()=>{const r=await api('GET','/api/v1/dashboard/resources');assertEqual(r.status,200,'resources');assert('byOwner' in r.data,'byOwner');});
  await test('Gantt data',async()=>{const r=await api('GET','/api/v1/gantt');assertEqual(r.status,200,'gantt');assert(Array.isArray(r.data.tasks),'tasks arr');assert(Array.isArray(r.data.milestones),'milestones arr');});
  await test('Gantt filter by owner',async()=>{const r=await api('GET',`/api/v1/gantt?owner=${ctx.memberIdentifier}`);assertEqual(r.status,200,'ok');});
  await test('My overview',async()=>{const r=await api('GET','/api/v1/my/overview');assertEqual(r.status,200,'overview');assertType(r.data.total,'number','total');assertType(r.data.active,'number','active');assertType(r.data.overdue,'number','overdue');});
  await test('Delete task',async()=>{
    // delete one of the created tasks to test cascade
    const dtid=ctx.taskIds.pop();
    if(dtid){const r=await api('DELETE',`/api/v1/tasks/${dtid}`);assert(r.status===200||r.status===404,`delete got ${r.status}`);}
  });
}

// ═══ 25. CLEANUP ═══
async function testCleanup(){
  console.log('\n🧹 [25/25] Cleanup');
  let cleaned=0;
  // Delete iterations
  if(ctx.iterationId){await api('DELETE',`/api/v1/iterations/${ctx.iterationId}`);cleaned++;}
  // Delete custom fields
  if(ctx.customFieldId2){await api('DELETE',`/api/v1/custom-fields/${ctx.customFieldId2}`);cleaned++;}
  // Delete remaining attachments
  if(ctx.attachmentId){await api('DELETE',`/api/v1/attachments/${ctx.attachmentId}`);cleaned++;}
  // Delete remaining tasks (reverse to handle children first)
  for(const tid of [...ctx.taskIds].reverse()){await api('DELETE',`/api/v1/tasks/${tid}`);cleaned++;}
  // Delete backlog items (cannot delete via API, but that's ok)
  // Delete members
  if(ctx.memberIdentifier){await api('DELETE',`/api/v1/members/${ctx.memberIdentifier}`);cleaned++;}
  if(ctx.memberIdentifier2){await api('DELETE',`/api/v1/members/${ctx.memberIdentifier2}`);cleaned++;}
  if(ctx.agentIdentifier){await api('DELETE',`/api/v1/members/${ctx.agentIdentifier}`);cleaned++;}
  // Delete domain
  if(ctx.domainId){await api('DELETE',`/api/v1/domains/${ctx.domainId}`);cleaned++;}
  // Delete milestone
  if(ctx.milestoneId){await api('DELETE',`/api/v1/milestones/${ctx.milestoneId}`);cleaned++;}
  // Delete project
  if(ctx.projectSlug&&ctx.projectSlug!=='default'){await api('DELETE',`/api/v1/projects/${ctx.projectSlug}`);cleaned++;}
  await test('Cleanup complete',async()=>{assert(cleaned>0,`Cleaned ${cleaned} resources`);});
}

// ═══ MAIN RUNNER ═══
async function runAllSuites(){
  totalTests=0;passedTests=0;failedTests=0;failures.length=0;testTimings.length=0;
  resetCtx();
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀 ROUND ${ROUND} — UID: ${UID}`);
  console.log(`${'═'.repeat(60)}`);
  const start=Date.now();
  try{
    await testServerHealth();
    await testProjects();
    await testDomains();
    await testMilestones();
    await testMembers();
    await testTasksCRUD();
    await testTasksTree();
    await testStatusFlow();
    await testProgress();
    await testNotes();
    await testBatch();
    await testArchive();
    await testBacklog();
    await testIterations();
    await testNotifications();
    await testCustomFields();
    await testAttachments();
    await testGoals();
    await testReqLinks();
    await testIntake();
    await testPermissions();
    await testAuth();
    await testAgentTokens();
    await testDashboard();
    await testCleanup();
  }catch(e){console.error('\n💥 FATAL:',e.message);}
  const elapsed=((Date.now()-start)/1000).toFixed(1);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊 Round ${ROUND} Results: ${passedTests}/${totalTests} passed, ${failedTests} failed (${elapsed}s)`);
  if(failures.length){console.log('\n❌ Failures:');for(const f of failures)console.log(`  • ${f.name}: ${f.error}`);}
  // Slowest tests
  const slow=testTimings.filter(t=>t.ms>200).sort((a,b)=>b.ms-a.ms).slice(0,5);
  if(slow.length){console.log('\n🐌 Slowest:');for(const t of slow)console.log(`  • ${t.name}: ${t.ms}ms`);}
  console.log(`${'═'.repeat(60)}\n`);
  return{total:totalTests,passed:passedTests,failed:failedTests,failures:[...failures],elapsed:parseFloat(elapsed)};
}

// ═══ ENTRY POINT ═══
const args=process.argv.slice(2);
const doLoop=args.includes('--loop');
const roundsArg=args.find(a=>a.startsWith('--rounds='));
const maxRounds=roundsArg?parseInt(roundsArg.split('=')[1]):100;
const delayArg=args.find(a=>a.startsWith('--delay='));
const delaySec=delayArg?parseInt(delayArg.split('=')[1]):3;

(async()=>{
  const allResults=[];
  const maxRoundsToRun=doLoop?maxRounds:1;
  for(ROUND=1;ROUND<=maxRoundsToRun;ROUND++){
    const result=await runAllSuites();
    allResults.push(result);
    if(result.failed>0&&!doLoop){
      console.log('⚠️  有失败测试，使用 --loop 参数可以持续循环测试');
    }
    if(ROUND<maxRoundsToRun){
      console.log(`⏳ 下一轮在 ${delaySec} 秒后开始...`);
      await new Promise(r=>setTimeout(r,delaySec*1000));
    }
  }
  // Final summary
  if(allResults.length>1){
    console.log(`\n${'═'.repeat(60)}`);
    console.log('📋 TOTAL SUMMARY');
    console.log(`${'═'.repeat(60)}`);
    const totalR=allResults.length;
    const perfectR=allResults.filter(r=>r.failed===0).length;
    const totalT=allResults.reduce((a,r)=>a+r.total,0);
    const totalP=allResults.reduce((a,r)=>a+r.passed,0);
    const totalF=allResults.reduce((a,r)=>a+r.failed,0);
    const totalE=allResults.reduce((a,r)=>a+r.elapsed,0).toFixed(1);
    console.log(`  Rounds: ${totalR}, Perfect: ${perfectR}/${totalR}`);
    console.log(`  Tests:  ${totalP}/${totalT} passed, ${totalF} failed`);
    console.log(`  Time:   ${totalE}s total`);
    // All unique failures
    const uniqF=new Map();
    for(const r of allResults)for(const f of r.failures)if(!uniqF.has(f.name))uniqF.set(f.name,f.error);
    if(uniqF.size){console.log(`\n  ❌ Unique failures (${uniqF.size}):`);for(const[n,e]of uniqF)console.log(`    • ${n}: ${e}`);}
    else console.log('\n  ✅ ALL ROUNDS PERFECT!');
    console.log(`${'═'.repeat(60)}\n`);
  }
  process.exit(allResults.some(r=>r.failed>0)?1:0);
})()
