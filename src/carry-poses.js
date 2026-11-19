/**
 * A physically attached 3D load is local to the citizen's hands/shoulder.
 * No terrain, world coordinates or camera direction enters these transforms.
 * Every item remains a distinct mesh with its existing item ID.
 */
export function handPose(item, index = 0) {
  const slot = Math.max(0, index | 0);
  switch (item.type) {
    case 'wood':
      // One full-length log across the shoulder, aligned sideways across the torso.
      return {x: 0.12, y: 0.33 + Math.floor(slot / 2) * .22, z: -.14 + slot % 2 * .17,
        yaw: .07, pitch: 0, roll: 0, size: 1.12};
    case 'stone':
      // A heavy stone is held close to the chest instead of floating beside the head.
      return {x: .02 + (slot % 2) * .22, y: -.12 + Math.floor(slot / 2) * .2,
        z: .12, yaw: slot * 1.17, pitch: .11, roll: .1, size: 1.18};
    case 'twig':
      return {x: -.28, y: .1 + slot * .085, z: .03,
        yaw: .45, pitch: 0, roll: 0, size: .85};
    case 'apple':
      return {x: -.20 + (slot % 3) * .19, y: -.10 + Math.floor(slot / 3) * .16,
        z: .10 + (slot % 2) * .13, yaw: slot * .7, pitch: 0, roll: 0, size: .85};
    case 'berry':
    case 'seed':
    case 'grain':
      return {x: -.22 + (slot % 4) * .14, y: -.20 + Math.floor(slot / 4) * .13,
        z: .12 + (slot % 2) * .13, yaw: slot * .8, pitch: 0, roll: 0, size: .98};
    default:
      return {x: 0, y: 0, z: .1, yaw: 0, pitch: 0, roll: 0, size: 1};
  }
}

export function cargoClass(items) {
  if(!items.length)return 'empty';
  if(items.some(i => i.type === 'wood'))return 'shoulder';
  if(items.some(i => i.type === 'stone'))return 'heavy';
  return 'hands';
}

/** A growing carried load slows walking, without changing the animation clock. */
export function loadSpeed(items) {
  if (!items.length) return 1;
  if (items.some(i => i.type === 'wood' || i.type === 'stone'))return .78;
  return Math.max(.73, 1 - items.length * .045);
}
