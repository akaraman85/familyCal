import { renderRobots } from './_lib/crawler-files.js'
import { publicAppUrl } from './_lib/env.js'
import { requireMethod, sendText, type ApiRequest, type ApiResponse } from './_lib/http.js'

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET', 'HEAD'])) return

  sendText(
    response,
    200,
    'text/plain; charset=utf-8',
    renderRobots(publicAppUrl()),
    { includeBody: request.method !== 'HEAD' },
  )
}
