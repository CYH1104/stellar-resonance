import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeEditor} from '../native/academy-frontend/editor.mjs';
const response=()=>({headers:{},setHeader(key,value){this.headers[key]=value;},writeHead(status,headers){this.status=status;Object.assign(this.headers,headers);},end(body){this.body=body;}});
test('new editor preserves native admin authentication, CSRF, original UI assets and a separate data route',async()=>{
 let principal,posts=0;const forwarded=[];
 const editor=createNativeEditor({root:process.cwd(),session:()=>({call:async(path,options)=>{if(path==='/api/users/me')return new Response(JSON.stringify(principal||{}),{status:principal?200:403});if(path==='/csrf-token')return new Response(JSON.stringify({token:'synthetic-csrf'}));assert.equal(path,'/api/plugins/academy-compat/author/read');assert.equal(options.csrf,'synthetic-csrf');posts++;return new Response(JSON.stringify({data:{private:'ADMIN_ONLY'},revision:'rev'}));}}),forward:(_request,_response,path)=>forwarded.push(path)});
 const guest=response();await editor({method:'GET'},guest,'/editor/');assert.equal(guest.status,302);assert.equal(posts,0);
 principal={handle:'ordinary',admin:false};const blocked=response();await editor({method:'GET'},blocked,'/editor/api/editor');assert.equal(blocked.status,403);assert.equal(posts,0);
 principal={handle:'owner',name:'</script><script>bad()</script>',admin:true};const page=response();await editor({method:'GET'},page,'/editor/');assert.equal(page.status,200);assert.ok(page.body.includes('学院档案编辑 · 新版'));assert.ok(page.body.includes('native-account.css'));assert.ok(!page.body.includes('<script>bad()'));assert.ok(page.headers['Content-Security-Policy'].includes("script-src 'self'"));
 const read=response();await editor({method:'GET'},read,'/editor/api/editor');assert.equal(JSON.parse(read.body).token,'synthetic-csrf');assert.equal(posts,1);
 await editor({method:'POST'},response(),'/editor/api/editor');assert.deepEqual(forwarded,['/api/plugins/academy-compat/author/save']);
 const unexpected=response();await editor({method:'GET'},unexpected,'/editor/../../author-assets/editor-data.json');assert.equal(unexpected.status,404);
});
