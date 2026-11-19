import {RECIPES} from './material-world.js';
import {footprintOverlaps} from './spatial-world.js';

export const CONSTRUCTION_PHASES=Object.freeze([
  'survey','clear','grading','hauling','foundation','frame','finish','complete'
]);
export const CONSTRUCTION_LABELS=Object.freeze({
  survey:'Zaměření pozemku',clear:'Odstraňování kamenů a keřů',
  grading:'Vyrovnávání stavební plochy',hauling:'Doprava materiálu',
  foundation:'Základy',frame:'Hrubá stavba a lešení',
  finish:'Dokončovací práce',complete:'Hotová stavba'
});
const GROUPS=Object.freeze([
  ['boulders','boulder','stone',2],
  ['berries','bush','twig',1],
  ['saplings','sapling','twig',2],
  ['fallenLogs','fallenlog','wood',1]
]);
const sizeFor=project=>RECIPES[project.type]?.size||[4,4];

/** Terrain obstacles that are genuinely removable by NPC labor.
 * Living trees, apple trees and resource quarries remain protected.
 */
export function removableOnPlot(world,project){
  const [w,d]=sizeFor(project),removed=[];
  for(const [group,type,resource,quantity] of GROUPS){
    for(const p of world[group]||[]){
      const r=type==='boulder'?p.r||.72:type==='bush'?.52:type==='fallenlog'?.78:.24;
      if(footprintOverlaps(project.x,project.z,w/2,d/2,
        {shape:'circle',x:p.x,z:p.z,r},.12)){
        removed.push({key:type+':'+p.id,type,group,id:p.id,resource,quantity,x:p.x,z:p.z});
      }
    }
  }
  return removed;
}

/** Phase and obstacle list belong to one construction, no invisible clearing. */
export function initializeBuildSite(world,project){
  const clearables=removableOnPlot(world,project);
  return {...project,phase:'survey',progress:0,clearables,cleared:0,
    surveyed:false,graded:false,foundationComplete:false,
    frameComplete:false,scaffoldInstalled:false,
    stageHistory:[{phase:'survey',at:world.seconds,by:project.agentId}]};
}

export function beginPhase(project,phase,time,actorId){
  if(!CONSTRUCTION_PHASES.includes(phase))throw new Error('Unknown phase '+phase);
  project.phase=phase;
  project.stageHistory.push({phase,at:time,by:actorId});
  const ranges={
    survey:0,clear:.08,grading:.15,hauling:.24,foundation:.52,frame:.70,finish:.89,complete:1
  };
  project.progress=Math.max(project.progress||0,ranges[phase]);
  if(phase==='frame')project.scaffoldInstalled=true;
  if(phase==='complete')project.scaffoldInstalled=false;
}

/** Real obstacle removal and material conservation: pieces appear next to the plot. */
export function clearNextObject(world,project){
  if(!project.clearables.length)return null;
  const piece=project.clearables[0];
  const collection=world[piece.group];
  const idx=collection?.findIndex(x=>x.id===piece.id)??-1;
  if(idx<0){
    project.clearables.shift();
    return {type:piece.type,missing:true};
  }
  collection.splice(idx,1);
  const [w,d]=sizeFor(project);
  const dumpId='cleared-'+project.id;
  if(!world.material.containers.has(dumpId)){
    world.material.containers.set(dumpId,{
      id:dumpId,kind:'drop',name:'Odklizený materiál ze staveniště',
      x:project.x+w/2+1.7,z:project.z+d/2+1.7,roof:false
    });
  }
  world.material.add(piece.resource,piece.quantity,dumpId);
  project.clearables.shift();
  project.cleared++;
  return {...piece,missing:false};
}

export function phaseProgress(project){
  const p=project.phase;
  if(p==='clear')return .08+Math.min(.07,(project.cleared||0)*.015);
  if(p==='hauling')return .24+.28*(project.total?project.delivered/project.total:0);
  return {
    survey:0,grading:.16,foundation:.52,frame:.70,finish:.89,complete:1
  }[p]??0;
}

/** No foundation or framing may exist until all site work and goods are complete. */
export function validStage(project,ready){
  if(['foundation','frame','finish','complete'].includes(project.phase))
    return Boolean(project.surveyed&&project.graded&&!project.clearables.length&&ready);
  return true;
}
