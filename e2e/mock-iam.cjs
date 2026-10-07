/**
 * Minimal mock of the nsc-teamusers IAM endpoints used by the smartclass-web E2E run.
 * Scenario is chosen via SCENARIO=NONE|FAIL|OK (default NONE):
 *   NONE - permissions load fine but hold no dispatch:* keys
 *   FAIL - /me/permissions answers 500 (IAM outage)
 *   OK   - permissions hold dispatch:read
 */
const http = require('node:http')

const scenario = process.env.SCENARIO || 'NONE'
const port = Number(process.env.PORT || 18080)

const PROFILE = {
  id: 'u-e2e',
  username: 'e2e-operator',
  display_name: 'E2E 操作员',
  email: 'e2e@example.com',
  email_verified_at: new Date().toISOString(),
  status: 'active',
}

const PERMISSIONS = {
  NONE: ['iam:users', 'iam:roles'],
  OK: ['iam:users', 'iam:roles', 'dispatch:read'],
}

const server = http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    res.end(JSON.stringify(body))
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE',
    })
    return res.end()
  }
  const url = req.url.split('?')[0]
  if (url === '/me') {
    return send(200, PROFILE)
  }
  if (url === '/me/permissions') {
    if (scenario === 'FAIL') {
      return send(500, { title: 'IAM is down', status: 500 })
    }
    return send(200, { permissions: PERMISSIONS[scenario] ?? PERMISSIONS.NONE })
  }
  if (url === '/auth/login') {
    return send(200, { access_token: 'mock-access', refresh_token: 'mock-refresh', token_type: 'bearer' })
  }
  if (url === '/auth/refresh') {
    return send(200, { access_token: 'mock-access', refresh_token: 'mock-refresh', token_type: 'bearer' })
  }
  // Simulate dispatchub/filehouse being down: every service path answers 502 so the
  // pages render their in-place upstream errors instead of fake empty lists.
  if (url.startsWith('/api/')) {
    return send(502, { title: 'upstream unavailable', status: 502 })
  }
  return send(404, { title: 'not found', status: 404 })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`mock iam (${scenario}) on http://127.0.0.1:${port}`)
})
