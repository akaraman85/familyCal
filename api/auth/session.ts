import { publicSessionUser, requireAuthentication } from '../_lib/auth.js'
import {
  requireMethod,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET'])) return
  const user = await requireAuthentication(request, response)
  if (!user) return
  sendJson(response, 200, { user: publicSessionUser(user) })
}
