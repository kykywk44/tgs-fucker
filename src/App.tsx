import { Preview } from './preview/Preview.tsx'
import type { Lottie } from './core/tgs.ts'
import minimalJson from './core/__fixtures__/minimal.json?raw'

// Temporary: previews the Task 2 fixture until the editor shell exists.
const anim: Lottie = JSON.parse(minimalJson)

function App() {
  return (
    <>
      <h1>TGS Editor</h1>
      <Preview json={minimalJson} totalFrames={anim.op - anim.ip} />
    </>
  )
}

export default App
