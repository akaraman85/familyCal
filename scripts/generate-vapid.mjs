import { createRequire } from 'node:module'

const webpush = createRequire(import.meta.url)('web-push')
const keys = webpush.generateVAPIDKeys()
process.stdout.write(
  `# Add these server-only variables to .env.local and the Vercel project.\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`,
)
