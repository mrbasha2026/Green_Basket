import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_* vars to import.meta.env and does NOT populate
  // process.env. The API module (api/sync-sheets.ts) reads server-side secrets
  // from process.env, so load the full env here and inject it.
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value
  }

  return {
    plugins: [
      react(),
      {
        name: 'api-dev-server',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0]
            if (url === '/api/create-user') {
              if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
              const token = (req.headers['authorization'] as string | undefined)?.replace('Bearer ', '')
              if (!token) { res.statusCode = 401; res.end('Unauthorized'); return }
              let rawBody = ''
              await new Promise<void>(resolve => { req.on('data', (c: Buffer) => { rawBody += c.toString() }); req.on('end', resolve) })
              let body: Record<string, string> = {}
              try { body = rawBody ? JSON.parse(rawBody) : {} } catch { res.statusCode = 400; res.end('Invalid JSON'); return }
              try {
                const { createUser } = await server.ssrLoadModule('/api/create-user.ts')
                const result = await createUser({ callerToken: token, ...body })
                res.setHeader('Content-Type', 'application/json')
                if ('error' in result) { res.statusCode = result.status ?? 400; res.end(JSON.stringify({ error: result.error })) }
                else { res.end(JSON.stringify(result)) }
              } catch (err) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: (err as Error).message }))
              }
              return
            }

            if (url !== '/api/sync-sheets') return next()

            if (req.method !== 'POST') {
              res.statusCode = 405
              res.end('Method Not Allowed')
              return
            }

            const token = (req.headers['authorization'] as string | undefined)?.replace('Bearer ', '')
            if (!token) {
              res.statusCode = 401
              res.end('Unauthorized')
              return
            }

            try {
              // Read request body to get spreadsheetId
              let rawBody = ''
              await new Promise<void>(resolve => {
                req.on('data', (chunk: Buffer) => { rawBody += chunk.toString() })
                req.on('end', resolve)
              })
              let reqSpreadsheetId: string | undefined
              try { reqSpreadsheetId = rawBody ? JSON.parse(rawBody)?.spreadsheetId : undefined } catch {}

              const { syncSheets } = await server.ssrLoadModule('/api/sync-sheets.ts')
              const spreadsheetId = reqSpreadsheetId || process.env.GOOGLE_SPREADSHEET_ID
              if (!spreadsheetId) throw new Error('spreadsheetId غير محدد')

              const result = await syncSheets(spreadsheetId)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, ...result }))
            } catch (err) {
              console.error('[api/sync-sheets] error:', err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, message: (err as Error).message }))
            }
          })
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
