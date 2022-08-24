import { argv } from 'process'
import Hdiff from './hdiff'
import { dirExists, fileExists } from './utils/fileSystem'

(async () => {
  const [src, dst] = argv.slice(2)
  if (!await fileExists(src)) return console.log('File not found:', src)
  if (!await dirExists(dst)) return console.log('Directory not found:', dst)

  const hdiff = new Hdiff()

  await hdiff.unzip(src, dst)
  await hdiff.patch(dst)
  await hdiff.delete(dst)
})()