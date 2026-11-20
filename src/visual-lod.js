/**
 * Visual-only sampling: exact authoritative item IDs/counts are untouched.
 * MW-019A2: the old "first 520 items in container insertion order" starved
 * occupied nearby baskets. Prefer a few real items in nearby real storage,
 * then distribute the remaining budget across distinct inventory locations.
 * Carried, dropped and construction cargo remain individually visible.
 */
const priorityKind=new Set(['carry','site','drop']);
const idSort=(a,b)=>String(a.id).localeCompare(String(b.id),'en',{numeric:true});

export function chooseVisualItems(items,containers,
  {maxPerGroup=38,maxTotal=680,focus=null}={}){
  if(!Number.isInteger(maxPerGroup)||maxPerGroup<1||
     !Number.isInteger(maxTotal)||maxTotal<1)
    throw new Error('Invalid visual LOD budget');
  const important=[],groups=new Map();
  for(const item of items){
    const kind=containers.get(item.container)?.kind;
    if(priorityKind.has(kind)){important.push(item);continue;}
    const key=item.container+':'+item.type;
    if(!groups.has(key))groups.set(key,{
      key,container:containers.get(item.container),items:[],index:0
    });
    const g=groups.get(key);
    if(g.items.length<maxPerGroup)g.items.push(item);
  }
  const capacity=Math.max(0,maxTotal-important.length),stock=[];
  const hasFocus=Number.isFinite(focus?.x)&&Number.isFinite(focus?.z);
  const records=[...groups.values()];
  const distance=g=>hasFocus&&Number.isFinite(g.container?.x)&&
    Number.isFinite(g.container?.z)?
    Math.hypot(g.container.x-focus.x,g.container.z-focus.z):Infinity;
  // With a focus, every pass prefers actual nearby storage. No synthetic
  // fruit is drawn in an empty container. Sorting is deterministic between
  // 5-second server snapshots; it never depends on camera rotation.
  if(hasFocus)records.sort((a,b)=>distance(a)-distance(b)||
    a.key.localeCompare(b.key,'en',{numeric:true}));
  const pick=g=>{
    if(stock.length>=capacity||g.index>=g.items.length)return false;
    stock.push(g.items[g.index++]);return true;
  };
  if(hasFocus){
    // Fill nearby existing baskets and yard pads enough to be recognizable,
    // instead of rendering one item in each of hundreds of remote stockyards.
    const nearby=records.filter(g=>distance(g)<=14);
    for(let round=0;round<5&&stock.length<capacity;round++){
      for(const g of nearby){
        if(stock.length>=capacity)break;
        pick(g);
      }
    }
  }
  // Then maximize distinct storage coverage and finish with fair rounds.
  while(stock.length<capacity){
    let progress=false;
    for(const g of records){
      if(stock.length>=capacity)break;
      progress=pick(g)||progress;
    }
    if(!progress)break;
  }
  // Same stable order as planStockVisuals() to avoid mixed fruit indices
  // differing between the planner and actual MaterialRenderer.
  return [...important,...stock].sort(idSort);
}
