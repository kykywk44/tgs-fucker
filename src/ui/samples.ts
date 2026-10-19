// Stickers from the repo's `samples/` folder (untracked, the user's own files),
// offered in the toolbar so a sample opens in one click. Vite lists them at
// build time; with an empty folder the list is empty and the menu is hidden.

export interface Sample {
  file: string // "CoolSticker.tgs"
  name: string // "CoolSticker"
  url: string
}

const urls = import.meta.glob<string>('/samples/*.tgs', { query: '?url', import: 'default', eager: true })

export const SAMPLES: readonly Sample[] = Object.entries(urls)
  .map(([path, url]) => {
    const file = path.slice(path.lastIndexOf('/') + 1)
    return { file, name: file.replace(/\.tgs$/i, ''), url }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

// The sample as a File, for the same path a dropped or chosen file takes.
export async function fetchSample(sample: Sample): Promise<File> {
  const response = await fetch(sample.url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return new File([await response.blob()], sample.file)
}
