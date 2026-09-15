import React from 'react';

const settings = {primaryColor:'#a855f7',systemName:'BORDA-AI · Teste local',machineSpeedSpm:800,colorChangeTimeSec:30};
const rules: never[] = [];
export const useCompanySettings = () => ({settings});
export const usePricing = () => ({rules,openPricingModal:()=>{}});
export const useProfile = () => ({permissions:{canSeeFinancials:true},isUnlocked:true});
export const useAuth = () => ({profile:{can_view_prices:true},user:{id:'test-user'}});
export function ClientSelect({value,onChange}: {value:string;onChange:(v:string)=>void}) {
  return <select aria-label="Cliente de teste" value={value} onChange={e=>onChange(e.target.value)}><option value="">Selecione um cliente</option><option value="test-client">Cliente de teste</option></select>;
}
export const MatrixDetailsModal = () => null;
const tasks = {addTask:()=> 'test-task',updateTask:()=>{},updateStep:()=>{}};
export const useBackgroundTasks = (selector: (t:typeof tasks)=>unknown) => selector(tasks);
export const sendEvolutionText = async () => {throw new Error('Envio externo desativado no teste');};
export const getWhatsAppWebLink = () => '#';
export const formatWhatsAppNumber = (v:string) => v;
export const handleWhatsAppDispatchError = () => {};
export const printOrderReceipt = () => {};
export const printThermalReceipt = () => {};

declare global {interface Window {__writes: {table:string;operation:string;payload:unknown}[]}}
window.__writes = [];
let counter=0;
function query(table:string) {
  let operation='select', payload:unknown;
  const response = () => {
    if(operation==='select') return {data:table==='clients'?[{id:'test-client',name:'Cliente de teste',phone:''}]:[],error:null};
    window.__writes.push({table,operation,payload});
    return {data:{id:`test-${table}-${++counter}`,...(payload as object)},error:null};
  };
  const chain = {
    select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,in:()=>chain,not:()=>chain,
    insert:(value:unknown)=>{operation='insert';payload=value;return chain;},
    update:(value:unknown)=>{operation='update';payload=value;return chain;},
    delete:()=>{operation='delete';return chain;},
    single:async()=>response(),maybeSingle:async()=>response(),
    then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(response()).then(resolve),
  };
  return chain;
}
export const supabase = {
  from:query,auth:{getUser:async()=>({data:{user:{id:'test-user'}},error:null})},
  storage:{from:()=>({
    upload:async(path:string,file:File)=>{window.__writes.push({table:'storage',operation:'upload',payload:{path,name:file.name,size:file.size}});return {data:{path},error:null};},
    getPublicUrl:(path:string)=>({data:{publicUrl:'http://localhost:5181/mock-file/'+path}}),
  })},
};
