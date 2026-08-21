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
  result: 'proposal' | 'needs_clarification'
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

export async function preparePlannerScreenshot(file: File): Promise<PlannerImageAttachment> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP screenshot')
  }
  if (file.size > 15_000_000) throw new Error('Screenshot must be smaller than 15 MB')

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Unable to read screenshot'))
      element.src = objectUrl
    })
    if (!image.width || !image.height || image.width * image.height > 40_000_000) {
      throw new Error('Screenshot dimensions are too large')
    }
    const maxDimension = 2200
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Screenshot processing is unavailable')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

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
    URL.revokeObjectURL(objectUrl)
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
) {
  const response = await fetch('/api/planner/propose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      message,
      image: image ? { data: image.data, mediaType: image.mediaType } : undefined,
    }),
  })
  return responseJson<{
    proposal: PlannerProposal
    proposalId: string
    model: string
    timezone: string
  }>(response)
}
