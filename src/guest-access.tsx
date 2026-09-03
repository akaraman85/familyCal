import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { addDays, format } from 'date-fns'
import { Check, Copy, Link2, LoaderCircle, Plus, X } from 'lucide-react'
import type { FamilyMember } from './family'
import {
  createGuestAccess,
  loadGuests,
  revokeGuestAccess,
  rotateGuestLink,
  updateGuestAccess,
  type GuestAccess,
  type GuestAccessInput,
} from './guests'

const PRESETS = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
] as const

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function defaultExpiry() {
  return addDays(new Date(), 7)
}

function calendarsLabel(guest: GuestAccess) {
  const names = [
    ...guest.calendars.map((calendar) => calendar.name),
    ...(guest.includeHousehold ? ['Household'] : []),
  ]
  return names.length ? names.join(', ') : 'No calendars'
}

function statusLabel(guest: GuestAccess) {
  if (guest.status === 'revoked') return 'Revoked'
  if (new Date(guest.expiresAt).getTime() <= Date.now()) return 'Expired'
  return `Until ${format(new Date(guest.expiresAt), 'MMM d, yyyy')}`
}

export function GuestAccessSection({ members }: { members: FamilyMember[] }) {
  const [guests, setGuests] = useState<GuestAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<GuestAccess | null | undefined>(undefined)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = async () => {
    const data = await loadGuests()
    setGuests(data.guests)
  }

  useEffect(() => {
    refresh()
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load guest access')
      })
      .finally(() => setLoading(false))
  }, [])

  const revoke = async (guest: GuestAccess) => {
    if (!window.confirm(`Revoke ${guest.name}'s calendar link? They will lose access immediately.`)) {
      return
    }
    setError(null)
    try {
      await revokeGuestAccess(guest.id)
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to revoke guest access')
    }
  }

  const rotate = async (guest: GuestAccess) => {
    if (!window.confirm(`Create a new link for ${guest.name}? The previous link will stop working.`)) {
      return
    }
    setError(null)
    try {
      const result = await rotateGuestLink(guest.id)
      setInviteUrl(result.guest.inviteUrl ?? null)
      setCopied(false)
      await refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create a new link')
    }
  }

  const copyLink = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
  }

  return (
    <section className="guest-access">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Friends</p>
          <h2>Guest access</h2>
          <p>Share a revocable link. Friends only see busy times — never event names, people, or places.</p>
        </div>
        <button className="add-btn" type="button" onClick={() => setEditing(null)}>
          <Plus size={18} />Invite friend
        </button>
      </div>
      {error && <div className="integration-error" role="alert">{error}</div>}
      {inviteUrl && (
        <div className="guest-link-banner">
          <div>
            <b>Copy this link and send it yourself</b>
            <span>{inviteUrl}</span>
          </div>
          <button type="button" onClick={() => void copyLink()}>
            {copied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy link</>}
          </button>
        </div>
      )}
      {loading
        ? <div className="integration-loading"><LoaderCircle size={16} />Loading guest access</div>
        : <div className="guest-list">
          {!guests.length && (
            <div className="family-empty">
              <Link2 size={25} />
              <b>No guest links yet</b>
              <span>Invite a friend, choose which family calendars they can see, and set an end date.</span>
            </div>
          )}
          {guests.map((guest) => (
            <article className={`guest-card ${guest.status}`} key={guest.id}>
              <div>
                <h3>{guest.name}</h3>
                <p>{guest.email || 'No email saved'}</p>
                <span>{statusLabel(guest)}</span>
                <small>{calendarsLabel(guest)}</small>
              </div>
              <div className="guest-card-actions">
                {guest.status === 'active' && (
                  <>
                    <button type="button" onClick={() => setEditing(guest)}>Edit</button>
                    <button type="button" onClick={() => void rotate(guest)}>New link</button>
                    <button type="button" onClick={() => void revoke(guest)}>Revoke</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>}
      {editing !== undefined && (
        <GuestAccessModal
          guest={editing}
          members={members}
          close={() => setEditing(undefined)}
          save={async (input) => {
            const result = editing
              ? await updateGuestAccess(editing.id, input)
              : await createGuestAccess(input)
            if (result.guest.inviteUrl) {
              setInviteUrl(result.guest.inviteUrl)
              setCopied(false)
            }
            await refresh()
            setEditing(undefined)
          }}
        />
      )}
    </section>
  )
}

function GuestAccessModal({ guest, members, close, save }: {
  guest: GuestAccess | null
  members: FamilyMember[]
  close: () => void
  save: (input: GuestAccessInput) => Promise<void>
}) {
  const [name, setName] = useState(guest?.name ?? '')
  const [email, setEmail] = useState(guest?.email ?? '')
  const [includeHousehold, setIncludeHousehold] = useState(guest?.includeHousehold ?? true)
  const [memberIds, setMemberIds] = useState<string[]>(guest?.memberIds ?? members.map((member) => member.id))
  const [expiresAt, setExpiresAt] = useState(toLocalInput(guest ? new Date(guest.expiresAt) : defaultExpiry()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedPreset = useMemo(() => {
    const expires = new Date(expiresAt).getTime()
    return PRESETS.find((preset) => {
      const target = addDays(new Date(), preset.days).getTime()
      return Math.abs(target - expires) < 30 * 60 * 1000
    })?.days
  }, [expiresAt])

  const toggleMember = (memberId: string) => {
    setMemberIds((current) => (
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    ))
  }

  return (
    <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <form className="family-member-modal guest-modal" onSubmit={async (event: FormEvent) => {
        event.preventDefault()
        setSaving(true)
        setError(null)
        try {
          await save({
            name: name.trim(),
            email: email.trim(),
            includeHousehold,
            expiresAt: new Date(expiresAt).toISOString(),
            memberIds,
          })
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : 'Unable to save guest access')
          setSaving(false)
        }
      }}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{guest ? 'Update access' : 'New guest link'}</p>
            <h2>{guest ? `Update ${guest.name}` : 'Invite a friend'}</h2>
          </div>
          <button type="button" onClick={close}><X size={20} /></button>
        </div>
        <label className="field">
          <span>Name</span>
          <input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Friend’s name" />
        </label>
        <label className="field">
          <span>Email <small>optional, for your records</small></span>
          <input type="email" maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
        </label>
        <fieldset className="guest-calendars">
          <legend>Calendars they can see as busy time</legend>
          <label>
            <input
              type="checkbox"
              checked={includeHousehold}
              onChange={(event) => setIncludeHousehold(event.target.checked)}
            />
            <span>Household calendar</span>
          </label>
          {members.map((member) => (
            <label key={member.id}>
              <input
                type="checkbox"
                checked={memberIds.includes(member.id)}
                onChange={() => toggleMember(member.id)}
              />
              <span>{member.name}</span>
            </label>
          ))}
          {!members.length && <p>Add family members first if you want to share a person’s calendar.</p>}
        </fieldset>
        <div className="guest-expiry">
          <span>Access ends</span>
          <div className="guest-presets">
            {PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.days}
                className={selectedPreset === preset.days ? 'active' : ''}
                onClick={() => setExpiresAt(toLocalInput(addDays(new Date(), preset.days)))}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            required
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>
        {error && <div className="modal-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={close} disabled={saving}>Cancel</button>
          <button className="save-event" type="submit" disabled={saving}>
            {saving ? 'Saving…' : guest ? 'Save changes' : 'Create link'}
          </button>
        </div>
      </form>
    </div>
  )
}
