import { renderSitemap } from './_lib/crawler-files.js'
import { publicAppUrl } from './_lib/env.js'
import { requireMethod, sendText, type ApiRequest, type ApiResponse } from './_lib/http.js'

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET', 'HEAD'])) return

  sendText(
    response,
    200,
    'application/xml; charset=utf-8',
    renderSitemap(publicAppUrl()),
    { includeBody: request.method !== 'HEAD' },
  )
}
