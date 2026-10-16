import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createEditorStore} from './editor-store.mjs';
export function createEditorServer({projectRoot,card,port=8808}){
  const store=createEditorStore(projectRoot,card),token=randomBytes(32).toString('hex');
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const server=createServer(async(req,res)=>{const actual=server.address()?.port||port,hosts=[`127.0.0.1:${actual}`,`localhost:${actual}`];
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    if(!hosts.includes(req.headers.host)||req.headers.origin&&!hosts.some(h=>req.headers.origin===`http://${h}`)||req.headers['sec-fetch-site']==='cross-site'){json(res,403,{code:'LOCAL_EDITOR_ONLY'});return;}
    try{const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&path==='/api/editor'){json(res,200,{...await store.read(),token});return;}
      if(req.method==='POST'&&path==='/api/editor'){
        if(req.headers['x-editor-token']!==token||!req.headers['content-type']?.startsWith('application/json')){json(res,403,{code:'EDITOR_TOKEN_REQUIRED'});return;}
        let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>8*1024*1024)throw Object.assign(Error(),{status:413,code:'EDITOR_DATA_TOO_LARGE'});chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error(),{status:400,code:'INVALID_JSON'});}
        json(res,200,await store.save(body.data,body.revision));return;
      }
      const files={'/':['editor.html','text/html'],'/editor.js':['editor.js','text/javascript'],'/worldbook.js':['worldbook.js','text/javascript'],'/editor.css':['editor.css','text/css']};
      if(req.method!=='GET'||!files[path]){json(res,404,{code:'NOT_FOUND'});return;}const [file,type]=files[path];res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(resolve(projectRoot,'server/editor-ui',file)));
    }catch(e){json(res,e.status||500,{code:e.status?e.code:'EDITOR_UNAVAILABLE'});}
  });
  return {server,start:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server.address().port));})};
}
