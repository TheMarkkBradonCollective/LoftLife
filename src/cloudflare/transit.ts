const lines = [
 {id:'loftline-15',label:'15th Street LoftLine',kind:'bus',stops:[
  {id:'15-l',name:'15th & L St',x:-36,z:5.85},{id:'15-m',name:'15th & M St',x:0,z:5.85},
  {id:'15-n',name:'15th & N St',x:36,z:5.85},{id:'15-o',name:'15th & O St',x:72.98,z:5.85},
  {id:'15-p',name:'15th & P St',x:108.98,z:5.85}]},
 {id:'loftline-m',label:'M Street LoftLine',kind:'bus',stops:[
  {id:'m-12',name:'M St & 12th St',x:-39.23,z:-93.4},{id:'m-14',name:'M St & 14th St',x:-19.14,z:-34},
  {id:'m-15',name:'M St & 15th St',x:-4.86,z:0},{id:'m-16',name:'M St & 16th St',x:9.42,z:34},
  {id:'m-18',name:'M St & 18th St',x:33.15,z:90.49}]},
];
export function handleTransitRoute(request:Request):Response|null {
 if(new URL(request.url).pathname!=='/api/transit'||request.method!=='GET')return null;
 return new Response(JSON.stringify({lines}),{headers:{'content-type':'application/json','cache-control':'public,max-age=300'}});
}
