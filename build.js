/* eslint @typescript-eslint/no-var-requires: 0 */

const { exec } = require('child_process')
const { cpSync } = require('fs')
const { join } = require('path')
const { cwd } = require('process')

process.env['PKG_CACHE_PATH'] = join(cwd(), 'cache')
process.env['MAKE_JOB_COUNT'] = 8

/**
 * Execute command
 * @param {string} cmd 
 * @param {boolean} slient 
 * @returns {Promise<string>}
 */
function execCommand(cmd, slient = false) {
  return new Promise((res, rej) => {
    const cp = exec(cmd, { env: process.env, cwd: cwd() })

    if (!slient) {
      cp.stdout.pipe(process.stdout)
      cp.stderr.pipe(process.stderr)
    }

    cp.on('exit', () => res())
    cp.on('error', (err) => rej(err))
  })
}

(async () => {
  console.log('Building project...')
  await execCommand('tsc --incremental')

  console.log('Preparing node binary...')
  await require('./prepNodeBin')()

  console.log('Packing executable...')
  await execCommand('pkg . --compress Brotli -o "dist/yshdiff" --build', true)

  console.log('Copying files...')
  cpSync(join(cwd(), 'hdiff'), join(cwd(), 'dist/hdiff'), { recursive: true })

  console.log('Build complete.')
})()