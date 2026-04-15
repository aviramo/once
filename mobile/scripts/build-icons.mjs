import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const assets = path.join(root, 'assets')

const logo = fs.readFileSync(path.join(assets, 'syncwish-logo.svg'))
const adaptive = fs.readFileSync(path.join(assets, 'syncwish-adaptive.svg'))

await sharp(logo, { density: 512 }).resize(1024, 1024).png().toFile(path.join(assets, 'icon.png'))
await sharp(logo, { density: 512 }).resize(1024, 1024).png().toFile(path.join(assets, 'splash-icon.png'))
await sharp(adaptive, { density: 512 }).resize(1024, 1024).png().toFile(path.join(assets, 'adaptive-icon.png'))
await sharp(logo, { density: 256 }).resize(96, 96).png().toFile(path.join(assets, 'favicon.png'))

console.log('icons built')
