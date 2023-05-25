import { argv } from 'process'
import Hdiff from './hdiff'
import { dirExists, fileExists } from './utils/fileSystem'

function usage(err?: string): void {
  if (err != null) console.log(`Error: ${err}`)

  console.log('Usage: yshdiff <in-zip> <out-dir>')
}

(async (): Promise<void> => {
  const [src, dst] = argv.slice(2)

  if (!await fileExists(src)) return usage(`File not found "${src}"`)
  if (!await dirExists(dst)) return usage(`Directory not found "${dst}"`)

  const hdiff = new Hdiff()

  await hdiff.unzip(src, dst)
  await hdiff.patch(dst)
  await hdiff.delete(dst)

  console.log('Update complete!')
})()