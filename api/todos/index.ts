import { requireAdmin } from '../_lib/auth.js'
import { getFamilyMember } from '../_lib/db.js'
import { integrationEnv } from '../_lib/env.js'
import {
  readJsonBody,
  requireMethod,
  requireSameOrigin,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/http.js'
import {
  createTodo,
  deleteTodo,
  listTodos,
  parseTodoPatch,
  parseTodoWrite,
  TodoValidationError,
  updateTodo,
} from '../_lib/todos.js'

async function assertAssignee(
  databaseUrl: string,
  ownerId: string,
  assigneeId: string | null | undefined,
) {
  if (!assigneeId) return
  const member = await getFamilyMember(databaseUrl, ownerId, assigneeId)
  if (!member) throw new TodoValidationError('Assignee is not a family member')
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (!requireMethod(request, response, ['GET', 'POST', 'PATCH', 'DELETE'])) return
  if (!await requireAdmin(request, response)) return

  try {
    const env = integrationEnv()
    if (request.method === 'GET') {
      const todos = await listTodos(env.databaseUrl, env.ownerId)
      sendJson(response, 200, { todos })
      return
    }

    if (!requireSameOrigin(request, response, env.appUrl)) return
    const rawBody = await readJsonBody(request)
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      throw new TodoValidationError('To-do details are invalid')
    }
    const body = rawBody as Record<string, unknown>

    if (request.method === 'POST') {
      const input = parseTodoWrite(body)
      await assertAssignee(env.databaseUrl, env.ownerId, input.assigneeId)
      const todo = await createTodo(env.databaseUrl, env.ownerId, input)
      sendJson(response, 201, { todo })
      return
    }

    const todoId = typeof body.todoId === 'string' ? body.todoId.trim() : ''
    if (!todoId) throw new TodoValidationError('To-do is required')

    if (request.method === 'PATCH') {
      const patch = parseTodoPatch(body)
      if ('assigneeId' in patch) {
        await assertAssignee(env.databaseUrl, env.ownerId, patch.assigneeId)
      }
      const todo = await updateTodo(env.databaseUrl, env.ownerId, todoId, patch)
      if (!todo) {
        sendJson(response, 404, { error: 'To-do not found' })
        return
      }
      sendJson(response, 200, { todo })
      return
    }

    if (!await deleteTodo(env.databaseUrl, env.ownerId, todoId)) {
      sendJson(response, 404, { error: 'To-do not found' })
      return
    }
    response.statusCode = 204
    response.setHeader('Cache-Control', 'no-store')
    response.end()
  } catch (error) {
    console.error('Unable to handle to-do request', error)
    sendJson(response, error instanceof TodoValidationError ? 400 : 500, {
      error: error instanceof TodoValidationError ? error.message : 'To-dos are unavailable',
    })
  }
}
