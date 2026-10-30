import {terminalPlans} from './terminal.mjs';
export const info={id:'academy-compat',name:'Academy feature compatibility',description:'Academy feature contracts on original native requests and storage'};
export async function init(router){
  const plans=terminalPlans();
  const route=action=>(request,response)=>{
    const owner=request.user?.profile?.handle;
    if(!owner)return response.status(401).send({error:'NATIVE_LOGIN_REQUIRED'});
    try{return response.send(action(owner,request.body));}
    catch(error){return response.status([400,404,409,429].includes(error?.status)?error.status:500).send({error:/^[A-Z_]{1,100}$/.test(error?.code||'')?error.code:'NATIVE_TASK_FAILED'});}
  };
  router.post('/terminal/plan',route((owner,body)=>plans.plan(owner,body?.input)));
  router.post('/terminal/finish',route((owner,body)=>plans.finish(owner,body?.token,body?.text)));
  router.post('/terminal/cancel',route((owner,body)=>{plans.cancel(owner,body?.token);return {ok:true};}));
}
