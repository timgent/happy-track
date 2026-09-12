import { getContainedResourceUrlAll, getSolidDataset, solidDatasetAsTurtle } from '@inrupt/solid-client'
import { happyMonthToDataset } from '../../src/services/rdfSerialization'
import type { HappyMonth } from '../../src/happies/types'

/**
 * Log in to an existing CSS account and return the CSS-Account-Token.
 */
export async function loginToExistingCssAccount(
  port: number,
  email: string,
  password: string,
): Promise<string> {
  const base = `http://localhost:${port}`
  const res = await fetch(`${base}/.account/login/password/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(`CSS login failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json() as Record<string, unknown>
  return data.authorization as string
}

/**
 * Create OAuth client credentials for a CSS account.
 * Returns { id, secret } suitable for the client_credentials grant.
 *
 * CSS v7 controls structure: controls.account.clientCredentials is the POST URL.
 */
export async function createCssClientCredentials(
  port: number,
  accountToken: string,
  webId: string,
): Promise<{ id: string; secret: string }> {
  const base = `http://localhost:${port}`

  const controlsRes = await fetch(`${base}/.account/`, {
    headers: { Authorization: `CSS-Account-Token ${accountToken}` },
  })
  if (!controlsRes.ok) {
    throw new Error(`CSS controls fetch failed: ${controlsRes.status} ${await controlsRes.text()}`)
  }
  const controlsData = await controlsRes.json() as { controls: { account: { clientCredentials: string } } }
  const credentialsUrl = controlsData.controls?.account?.clientCredentials
  if (!credentialsUrl) {
    throw new Error('Could not find controls.account.clientCredentials URL in CSS controls response')
  }

  const credRes = await fetch(credentialsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `CSS-Account-Token ${accountToken}`,
    },
    body: JSON.stringify({ name: 'pod-seed-client', webId }),
  })
  if (!credRes.ok) {
    throw new Error(`CSS client credentials creation failed: ${credRes.status} ${await credRes.text()}`)
  }
  const credData = await credRes.json() as Record<string, unknown>
  return { id: credData.id as string, secret: credData.secret as string }
}

/**
 * Exchange CSS client credentials for a Bearer access token via the
 * OAuth client_credentials grant.
 */
export async function getCssBearerToken(
  port: number,
  clientId: string,
  clientSecret: string,
  webId: string,
): Promise<string> {
  const base = `http://localhost:${port}`

  const oidcRes = await fetch(`${base}/.well-known/openid-configuration`)
  if (!oidcRes.ok) {
    throw new Error(`OIDC config fetch failed: ${oidcRes.status}`)
  }
  const oidcData = await oidcRes.json() as Record<string, unknown>
  const tokenEndpoint = oidcData.token_endpoint as string

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenRes = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      webid: webId,
      scope: 'webid',
    }).toString(),
  })
  if (!tokenRes.ok) {
    throw new Error(`CSS token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`)
  }
  const tokenData = await tokenRes.json() as Record<string, unknown>
  return tokenData.access_token as string
}

/**
 * Writes a month of happies straight into a pod as Turtle, over authenticated
 * HTTP PUT — the same bytes the app itself writes.
 *
 * Server-side rather than through the UI, so a test that needs a pod with
 * history in it does not have to spend a minute typing it in. CSS creates the
 * intermediate LDP containers automatically on PUT.
 *
 * It goes through the app's own serializer on purpose: a hand-written fixture
 * would drift from the real format, and then the test that reads it back would
 * be checking the fixture rather than the app.
 */
export async function seedPodWithMonth(
  podUrl: string,
  bearerToken: string,
  month: HappyMonth,
): Promise<void> {
  const fileUrl = `${podUrl}happy-track/months/${month.month}.ttl`
  const turtle = await solidDatasetAsTurtle(happyMonthToDataset(month, fileUrl))

  const res = await fetch(fileUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/turtle',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: turtle,
  })
  if (!res.ok) {
    throw new Error(`Failed to seed ${month.month}: ${res.status} ${await res.text()}`)
  }
}

/** Reads one month back out of a pod, so a test can assert what the app wrote. */
export async function readPodMonthTurtle(
  podUrl: string,
  bearerToken: string,
  monthKey: string,
): Promise<string | null> {
  const res = await fetch(`${podUrl}happy-track/months/${monthKey}.ttl`, {
    headers: {
      Accept: 'text/turtle',
      Authorization: `Bearer ${bearerToken}`,
    },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`Failed to read ${monthKey}: ${res.status} ${await res.text()}`)
  }
  return res.text()
}

/**
 * Every `.ttl` in the pod's months container, by month key.
 *
 * Parsed with the same RDF library the app uses rather than with a regex over
 * the Turtle: a container listing is a real graph, and how a server chooses to
 * lay it out — prefixes, relative IRIs, `ldp:contains` on one line or many — is
 * its business, not this helper's.
 */
export async function listPodMonths(podUrl: string, bearerToken: string): Promise<string[]> {
  const authFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${bearerToken}`)
    return fetch(input, { ...init, headers })
  }

  try {
    const dataset = await getSolidDataset(`${podUrl}happy-track/months/`, { fetch: authFetch })
    return getContainedResourceUrlAll(dataset)
      .filter(url => url.endsWith('.ttl'))
      .map(url => url.split('/').pop()!.replace(/\.ttl$/, ''))
      .sort()
  } catch (err) {
    // The container has not been created yet.
    if ((err as { statusCode?: number }).statusCode === 404) return []
    throw err
  }
}
