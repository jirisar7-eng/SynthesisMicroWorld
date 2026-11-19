/** MW-GOD-001: low-poly world indicators, all tied to actual simulation state.
 * The simulator stays authoritative. These meshes never change world state.
 */
export class GodVisuals {
  constructor(THREE,scene,height,world){
    this.THREE=THREE;this.height=height;this.scene=scene;
    this.group=new THREE.Group();scene.add(this.group);this.objects=new Map();
    this.baseline={
      trees:new Set(world.trees.map(v=>v.id)),
      stones:new Set(world.stones.map(v=>v.id)),
      springs:new Set(world.springs.map(v=>v.id))
    };
  }
  make(type,v){
    const T=this.THREE,group=new T.Group();
    if(type==='tree'){
      const bark=new T.Mesh(new T.CylinderGeometry(.18,.27,2.3,6),
        new T.MeshStandardMaterial({color:0x665042}));
      bark.position.y=1.15;group.add(bark);
      const leaves=new T.Mesh(new T.ConeGeometry(1.05,3.4,7),
        new T.MeshStandardMaterial({color:0x285b39}));
      leaves.position.y=3.2;group.add(leaves);
    }else if(type==='stone'){
      const rock=new T.Mesh(new T.DodecahedronGeometry(.85),
        new T.MeshStandardMaterial({color:0x929a90,roughness:.9}));
      rock.position.y=.7;group.add(rock);
    }else if(type==='spring'){
      const disc=new T.Mesh(new T.CylinderGeometry(1.5,1.5,.08,20),
        new T.MeshStandardMaterial({color:0x5cc7d5,emissive:0x123e4a,transparent:true,opacity:.82}));
      disc.position.y=.11;group.add(disc);
      const well=new T.Mesh(new T.TorusGeometry(1.2,.12,6,20),
        new T.MeshStandardMaterial({color:0x568c99}));
      well.rotation.x=-Math.PI/2;well.position.y=.2;group.add(well);
    }else if(type==='crater'){
      const disc=new T.Mesh(new T.CylinderGeometry(Math.min(9,v.radius*.6),Math.min(9,v.radius*.6),.06,32),
        new T.MeshStandardMaterial({color:0x312f32,roughness:1,transparent:true,opacity:.82}));
      disc.position.y=.08;group.add(disc);
      const rim=new T.Mesh(new T.TorusGeometry(Math.min(9,v.radius*.6),.36,6,32),
        new T.MeshStandardMaterial({color:0x645851,roughness:1}));
      rim.rotation.x=-Math.PI/2;rim.position.y=.16;group.add(rim);
    }else{
      const size=Math.min(14,v.radius*.75);
      const water=type==='flood';
      const disc=new T.Mesh(new T.CylinderGeometry(size,size,.05,28),
        new T.MeshStandardMaterial({color:water?0x4098b3:0xed753f,
          transparent:true,opacity:water?.43:.50,depthWrite:false}));
      disc.position.y=.13;group.add(disc);
      if(!water){
        const light=new T.Mesh(new T.ConeGeometry(1.25,4.0,7),
          new T.MeshBasicMaterial({color:0xffa132,transparent:true,opacity:.55}));
        light.position.y=2;group.add(light);
      }
    }
    group.position.set(v.x,this.height(v.x,v.z),v.z);
    group.userData.type=type;
    return group;
  }
  sync(world){
    const entries=[];
    for(const [field,type] of [['trees','tree'],['stones','stone'],['springs','spring']]){
      for(const v of world[field])if(!this.baseline[field].has(v.id))
        entries.push({key:type+':'+v.id,type,v});
    }
    for(const h of world.godHazards||[])entries.push({key:'hazard:'+h.id,type:h.kind,v:h});
    for(const l of world.godLandmarks||[])entries.push({key:'landmark:'+l.id,type:l.kind,v:l});
    const keys=new Set(entries.map(x=>x.key));
    for(const [key,obj] of this.objects)if(!keys.has(key)){
      this.group.remove(obj);
      obj.traverse(mesh=>{
        mesh.geometry?.dispose();
        if(Array.isArray(mesh.material))mesh.material.forEach(m=>m.dispose());
        else mesh.material?.dispose();
      });
      this.objects.delete(key);
    }
    for(const {key,type,v} of entries)if(!this.objects.has(key)){
      const obj=this.make(type,v);this.group.add(obj);this.objects.set(key,obj);
    }
  }
}
