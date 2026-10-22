// One frame of an animation as a still: every animated property takes its value at `frame`
// (silhouette.mjs `at`: eased and spatial keys), written the way Telegram accepts a static value —
// a number, not [number] (six-seven's «wrong file type»), and a path as the shape itself.
import {at} from './silhouette.mjs'
export function freeze(node,frame){
  if(Array.isArray(node)){node.forEach(n=>freeze(n,frame));return node}
  if(!node||typeof node!=='object')return node
  if(node.a===1&&Array.isArray(node.k)){
    let v=at(node,frame)
    if(Array.isArray(v)&&v.length===1&&(typeof v[0]==='number'||v[0]?.v))v=v[0]
    for(const key of Object.keys(node))delete node[key]
    node.a=0;node.k=structuredClone(v)
    return node
  }
  for(const value of Object.values(node))freeze(value,frame)
  return node
}
