import {describe,it,expect} from 'vitest'
import {ballotMesh} from './ballot-mesh.mjs'
const path={v:[[100,100],[100,0],[0,0],[0,100]],i:[[0,0],[0,0],[0,0],[0,0]],o:[[0,0],[0,0],[0,0],[0,0]]}
const prop=p=>({a:1,k:[{t:0,s:[p],i:{x:.667,y:.667},o:{x:.333,y:.333}},{t:10,s:[p]}]})
describe('ballot texture follows curved paper',()=>{
 it('keeps all four material corners attached to the paper',()=>{
  const grid=ballotMesh(prop(path),0,u=>u)
  expect(grid[0][0]).toEqual([256,256]);expect(grid[0][16]).toEqual([356,256])
  expect(grid[12][0]).toEqual([256,356]);expect(grid[12][16]).toEqual([356,356])
 })
 it('bends interior texture when Bezier handles change without moving any corner',()=>{
  const curved=structuredClone(path);curved.i[2]=[30,-30];curved.o[1]=[-30,-30]
  const flat=ballotMesh(prop(path),0,u=>u),bent=ballotMesh(prop(curved),0,u=>u)
  expect(bent[0][8][1]).toBeLessThan(flat[0][8][1]-20)
  expect(bent[6][8][1]).toBeLessThan(flat[6][8][1]-10)
  expect(bent[12][8]).toEqual(flat[12][8])
 })
})
