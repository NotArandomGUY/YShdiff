import { exec } from 'child_process'
import { dirname, join } from 'path'
import { cwd } from 'process'
import { Readable } from 'stream'
import yauzl, { Entry, ZipFile } from 'yauzl'
import { deleteFile, dirExists, fileExists, fileSize, mkdir, readFile, rm, writeFile } from './utils/fileSystem'

function execCommand(cmd: string): Promise<string> {
  return new Promise((res, rej) => {
    const cp = exec(cmd)
    let buffer = ''
    cp.stdout?.setEncoding('utf8')
    cp.stdout?.on('data', data => buffer += data)
    cp.stderr?.setEncoding('utf8')
    cp.stderr?.on('data', data => buffer += data)
    cp.on('exit', () => res(buffer))
    cp.on('error', (err) => rej(err))
  })
}

export default class Hdiff {
  skipDelete: string[]

  constructor() {
    this.skipDelete = []
  }

  private async isSameFile(src: Buffer, dst: string) {
    if (!await fileExists(dst)) return false
    if (src.length !== await fileSize(dst)) return false
    return Buffer.compare(src, await readFile(dst)) === 0
  }

  private async readStream(stream: Readable): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const bufs: Buffer[] = []
      stream.on('data', chunk => bufs.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(bufs)))
      stream.on('error', err => reject(err))
    })
  }

  private async writeStream(path: string, stream: Readable): Promise<void> {
    const buf = await this.readStream(stream)
    if (await this.isSameFile(buf, path)) return console.log('Identical file, skipping.')

    const dirPath = dirname(path)
    if (!await dirExists(dirPath)) await mkdir(dirPath)
    await writeFile(path, buf)
  }

  private async unzipEntry(zipfile: ZipFile, entry: Entry, dst: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const { skipDelete } = this
      const { fileName } = entry

      if (/\/$/.test(fileName)) return zipfile.readEntry()

      console.log('Unzipping:', fileName)
      zipfile.openReadStream(entry, async (err, stream) => {
        if (err) return reject(err)

        try {
          if (!skipDelete.includes(fileName)) skipDelete.push(fileName)
          await this.writeStream(join(dst, fileName), stream)
          resolve()
        } catch (e) {
          reject(e)
        } finally {
          zipfile.readEntry()
        }
      })
    })
  }

  private async patchFile(dir: string, file: string): Promise<void> {
    const { skipDelete } = this

    console.log('Patching:', file)

    const filePath = join(dir, file)
    const hdiffPath = `${filePath}.hdiff`
    const tmpPath = join(cwd(), 'tmp', file)
    const tmpDir = dirname(tmpPath)

    if (!await fileExists(filePath)) return console.error('File not found:', filePath)
    if (!await fileExists(hdiffPath)) return console.error('File not found:', hdiffPath)
    if (!await dirExists(tmpDir)) await mkdir(tmpDir, { recursive: true })

    try {
      const out = await execCommand(`"${join(cwd(), 'hdiff/hpatchz.exe')}" "${filePath}" "${hdiffPath}" "${tmpPath}"`)
      if (!await fileExists(tmpPath)) return console.log('Patch failed:', file)

      console.log(out)

      if (!skipDelete.includes(file)) skipDelete.push(file)

      await writeFile(filePath, await readFile(tmpPath))
      if (await fileExists(hdiffPath)) await deleteFile(hdiffPath)
    } catch (err) {
      console.error(err)
    }
  }

  async unzip(src: string, dst: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      console.log('Opening zip:', src)
      yauzl.open(src, { lazyEntries: true }, async (err, zipfile) => {
        if (err) return reject(err)

        zipfile.on('entry', async (entry: Entry) => {
          try {
            await this.unzipEntry(zipfile, entry, dst)
          } catch (e) {
            console.error(e)
          }
        })
        zipfile.on('end', () => resolve())

        zipfile.readEntry()
      })
    })
  }

  async patch(dir: string): Promise<void> {
    const hdiffFilesPath = join(dir, 'hdifffiles.txt')
    const hdiffFiles = (await readFile(hdiffFilesPath))
      ?.toString()
      ?.split('\n')
      ?.map(p => p?.trim())
      ?.filter(p => p != null && p.length > 0)

    if (hdiffFiles == null || hdiffFiles.length === 0) return

    const remoteNames = hdiffFiles
      .map(file => JSON.parse(file)?.remoteName)
      .filter(remoteName => remoteName != null)

    while (remoteNames.length > 0) {
      await Promise.all(
        remoteNames
          .splice(0, Math.min(remoteNames.length, 5))
          .map(remoteName => this.patchFile(dir, remoteName))
      )
    }

    const tmpDir = join(cwd(), 'tmp')

    if (await dirExists(tmpDir)) await rm(tmpDir, { recursive: true, force: true })
    if (await fileExists(hdiffFilesPath)) await deleteFile(hdiffFilesPath)
  }

  async delete(dir: string): Promise<void> {
    const { skipDelete } = this
    const deleteFilesPath = join(dir, 'deletefiles.txt')
    const deleteFiles = (await readFile(deleteFilesPath))
      ?.toString()
      ?.split('\n')
      ?.map(p => p?.trim())
      ?.filter(p => p != null && p.length > 0)

    if (deleteFiles == null || deleteFiles.length === 0) return

    for (const file of deleteFiles) {
      if (skipDelete.includes(file)) continue

      console.log('Deleting file:', file)

      const filePath = join(dir, file)
      if (!await fileExists(filePath)) {
        console.error('File not found:', filePath)
        continue
      }

      await deleteFile(filePath)
    }

    if (await fileExists(deleteFilesPath)) await deleteFile(deleteFilesPath)
  }
}