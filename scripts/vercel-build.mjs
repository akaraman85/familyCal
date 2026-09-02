import { spawn } from 'node:child_process'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(
        signal
          ? `${command} exited after signal ${signal}`
          : `${command} exited with code ${code}`,
      ))
    })
  })
}

// Build first so compilation failures cannot mutate the production database.
await run('npm', ['run', 'build'])
await run('npx', ['tsx', 'scripts/write-privacy-html.ts'])

if (process.env.VERCEL_ENV === 'production') {
  await run('npm', ['run', 'db:migrate'])
} else {
  console.log(`Skipping database migrations for ${process.env.VERCEL_ENV ?? 'local'} build`)
}
