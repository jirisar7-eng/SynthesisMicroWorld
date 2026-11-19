/**
 * A visual representation budget, never a gameplay inventory cap.
 * The authoritative world still owns every item and unchanged item ID.
 * Carried / construction / dropped goods are always rendered individually.
 */
export function chooseVisualItems(items,containers,{maxPerGroup=38,maxTotal=680}={}){
  if(!Number.isInteger(maxPerGroup)||maxPerGroup<1||!Number.isInteger(maxTotal)||maxTotal<1)
    throw new Error('Invalid visual LOD budget');
  const important=[],stock=[],usage=new Map();
  for(const item of items){
    const kind=containers.get(item.container)?.kind;
    if(kind==='carry'||kind==='site'||kind==='drop'){
      important.push(item);continue;
    }
    const key=item.container+':'+item.type;
    const used=usage.get(key)||0;
    if(used<maxPerGroup){
      usage.set(key,used+1);
      stock.push(item);
    }
  }
  return [...important,...stock.slice(0,Math.max(0,maxTotal-important.length))];
}
