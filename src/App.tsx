import { Preview } from './preview/Preview.tsx'
import type { Lottie } from './core/tgs.ts'
import minimalJson from './core/__fixtures__/minimal.json?raw'

// Temporary: previews the Task 2 fixture until the editor shell exists (Task 6e replaces this).
const anim: Lottie = JSON.parse(minimalJson)

function App() {
  return (
    <main className="flex min-h-svh flex-col items-center gap-6 bg-background px-6 py-10 text-foreground">
      <h1 className="text-title font-semibold">TGS Editor</h1>
      <Preview json={minimalJson} totalFrames={anim.op - anim.ip} />
    </main>
  )
}

export default App
