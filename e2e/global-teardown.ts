import { existsSync, readFileSync, unlinkSync } from 'fs'
import { CSS_PID_FILE } from '../playwright.config'

export default async function globalTeardown() {
  if (!existsSync(CSS_PID_FILE)) return
  const pid = parseInt(readFileSync(CSS_PID_FILE, 'utf8'), 10)
  try {
    process.kill(pid)
    console.log(`[teardown] Killed CSS process ${pid}`)
  } catch {
    // Process may have already exited
  }
  unlinkSync(CSS_PID_FILE)
}
