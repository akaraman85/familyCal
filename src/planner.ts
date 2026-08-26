export type PlannerModelProfile = 'fast' | 'balanced' | 'quality'

export type PlannerSettings = {
  enabled: boolean
  modelProfile: PlannerModelProfile
  timezone: string
  defaultCalendar: string
}

export type PlannedEvent = {
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  allDayDate: string | null
  allDayEndDate: string | null
  calendar: string
  location: string | null
}

export type PlannerProposal = {
  result: 'proposal' | 'needs_clarification' | 'calendar_info'
  message: string
  events: PlannedEvent[]
  warnings: string[]
}

export type PlannerImageAttachment = {
  data: string
  mediaType: 'image/jpeg'
  name: string
  previewUrl: string
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Unable to process screenshot')),
      'image/jpeg',
      quality,
    )
  })
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function jpegDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ])
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (startOfFrame.has(marker)) {
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      }
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    const segmentLength = view.getUint16(offset + 2)
    if (segmentLength < 2) break
    offset += segmentLength + 2
  }
  return null
}

async function imageDimensions(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 1_000_000).arrayBuffer())
  if (file.type === 'image/png') {
    if (bytes.length < 24) return null
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  return jpegDimensions(bytes)
}

export async function preparePlannerScreenshot(file: File): Promise<PlannerImageAttachment> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('Choose a JPEG or PNG screenshot')
  }
  if (file.size > 15_000_000) throw new Error('Screenshot must be smaller than 15 MB')

  const dimensions = await imageDimensions(file)
  if (
    !dimensions
    || !dimensions.width
    || !dimensions.height
    || dimensions.width * dimensions.height > 12_000_000
  ) {
    throw new Error('Screenshot dimensions are invalid or too large')
  }
  const maxDimension = 2200
  const scale = Math.min(
    1,
    maxDimension / Math.max(dimensions.width, dimensions.height),
  )
  const width = Math.max(1, Math.round(dimensions.width * scale))
  const height = Math.max(1, Math.round(dimensions.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Screenshot processing is unavailable')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    })
    context.drawImage(bitmap, 0, 0, width, height)
  } catch {
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        element.onload = () => resolve(element)
        element.onerror = () => reject(new Error('Unable to read screenshot'))
        element.src = objectUrl
      })
      context.drawImage(image, 0, 0, width, height)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } finally {
    bitmap?.close()
  }

  try {
    let blob = await canvasBlob(canvas, 0.9)
    if (blob.size > 2_500_000) blob = await canvasBlob(canvas, 0.72)
    if (blob.size > 2_500_000) {
      throw new Error('Screenshot is still too large. Crop it and try again.')
    }
    const data = base64FromBytes(new Uint8Array(await blob.arrayBuffer()))
    return {
      data,
      mediaType: 'image/jpeg',
      name: file.name || 'screenshot.jpg',
      previewUrl: `data:image/jpeg;base64,${data}`,
    }
  } finally {
    canvas.width = 1
    canvas.height = 1
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({ error: 'Request failed' })) as T & {
    error?: string
  }
  if (!response.ok) throw new Error(body.error || 'Request failed')
  return body
}

export async function loadPlannerSettings() {
  const response = await fetch('/api/settings/planner', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
  return responseJson<{ settings: PlannerSettings }>(response)
}

export async function updatePlannerSettings(settings: PlannerSettings) {
  const response = await fetch('/api/settings/planner', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(settings),
  })
  return responseJson<{ settings: PlannerSettings }>(response)
}

export async function proposeEvents(
  message: string,
  image?: PlannerImageAttachment,
  contextToken?: string,
  sessionId?: string,
  turnId?: string,
) {
  const response = await fetch('/api/planner/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      message,
      image: image ? { data: image.data, mediaType: image.mediaType } : undefined,
      contextToken,
      sessionId,
      turnId,
    }),
  })
  return responseJson<{
    proposal: PlannerProposal
    proposalId: string
    proposalToken: string
    contextToken: string
    sessionId: string
    revision: number
    turnsRemaining: number
    model: string
    timezone: string
  }>(response)
}

export async function resetPlannerSession(sessionId: string) {
  const response = await fetch('/api/planner/session', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ sessionId }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' })) as {
      error?: string
    }
    throw new Error(body.error || 'Unable to reset planner session')
  }
}
