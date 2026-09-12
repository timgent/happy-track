/**
 * CSS (Community Solid Server) v7 REST API helpers.
 *
 * Account creation flow:
 *  1. POST /.account/account/  → { authorization: TOKEN, controls: {...} }
 *  2. GET  /.account/          with CSS-Account-Token header → { controls: {...} }
 *  3. POST controls.password.create URL  → register email+password login
 *  4. POST controls.account.pod URL      → create pod
 */
export async function createCssAccount(
  port: number,
  email: string,
  password: string,
  podName: string,
): Promise<void> {
  const base = `http://localhost:${port}`

  // Step 1: Create blank account
  const accountRes = await fetch(`${base}/.account/account/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!accountRes.ok) {
    throw new Error(`CSS account creation failed: ${accountRes.status} ${await accountRes.text()}`)
  }
  const accountData = await accountRes.json() as Record<string, unknown>
  const token = accountData.authorization as string

  // Step 2: Get controls for this account
  const controlsRes = await fetch(`${base}/.account/`, {
    headers: { Authorization: `CSS-Account-Token ${token}` },
  })
  const controlsData = await controlsRes.json() as Record<string, unknown>

  // Extract URLs by searching the serialised JSON (matches shell script approach)
  const controlsStr = JSON.stringify(controlsData)
  const passwordUrl = extractUrl(controlsStr, /"create":"(http:\/\/[^"]*password[^"]*)"/)?.[1]
  const podUrl = extractUrl(controlsStr, /"pod":"(http:\/\/[^"]*)"/)?.[1]

  if (!passwordUrl) throw new Error('Could not find password create URL in CSS controls')
  if (!podUrl) throw new Error('Could not find pod create URL in CSS controls')

  // Step 3: Register email+password login
  const pwRes = await fetch(passwordUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `CSS-Account-Token ${token}`,
    },
    body: JSON.stringify({ email, password }),
  })
  if (!pwRes.ok) {
    throw new Error(`CSS password registration failed: ${pwRes.status} ${await pwRes.text()}`)
  }

  // Step 4: Create pod
  const podRes = await fetch(podUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `CSS-Account-Token ${token}`,
    },
    body: JSON.stringify({ name: podName }),
  })
  if (!podRes.ok) {
    throw new Error(`CSS pod creation failed: ${podRes.status} ${await podRes.text()}`)
  }
}

function extractUrl(json: string, pattern: RegExp): RegExpMatchArray | null {
  return json.match(pattern)
}
