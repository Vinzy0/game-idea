/**
 * Phase 5 AI DM narrative UI: player setup → DM chat transcript with
 * loading/error/retry, proposal approval, story summary, and reset.
 * Phase 6A: lives in the Story tab of the always-on board shell and reports a
 * story digest for the World tab.
 */
import { useEffect, useState, type FormEvent } from 'react';
import type { AIProvider, NarrativeAuthority, NarrativeMessageRole } from '../ai/provider';
import { useNarrativeDm, type NarrativeDmApi } from './useNarrativeDm';
import type { StoryDigest } from './WorldPanel';

/** Play-this-scene offer wired by the app shell (Phase 6). */
export interface EncounterOffer {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
}

const panel: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  background: '#0d1117',
  color: '#e6edf3',
  maxWidth: 860,
  width: '100%',
  boxSizing: 'border-box',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  background: '#161b22',
  color: '#e6edf3',
  border: '1px solid #30363d',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#8b949e',
  marginBottom: 2,
};

const roleLabel: Record<NarrativeMessageRole, string> = {
  player: 'You',
  dm: 'DM',
  system: 'System',
};

export default function NarrativeDm({
  provider,
  dm: dmProp,
  onStoryDigestChange,
  encounterOffer,
}: {
  provider: AIProvider;
  /** Shared lifecycle from the app shell; a local one is created when absent. */
  dm?: NarrativeDmApi;
  onStoryDigestChange?: (digest: StoryDigest | null) => void;
  encounterOffer?: EncounterOffer;
}) {
  const dm = useNarrativeDm(provider);
  const dmApi = dmProp ?? dm;
  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState('');
  const [notes, setNotes] = useState('');
  const [setting, setSetting] = useState('Northbridge High, a school where students develop powers');
  const [tone, setTone] = useState('moody, witty, second person');
  const [authority, setAuthority] = useState<NarrativeAuthority>('DEFAULT');
  const [draft, setDraft] = useState('');

  // Report the story digest to the shell (World tab + board dimming).
  useEffect(() => {
    onStoryDigestChange?.(
      dmApi.story === null
        ? null
        : {
            situation: dmApi.story.situation,
            unresolvedThreads: dmApi.story.unresolvedThreads,
          },
    );
    // Digest only: not every transient phase.
  }, [dmApi.story, onStoryDigestChange]);

  const canStart = name.trim() !== '' && archetype.trim() !== '' && !dmApi.starting;

  const handleStart = (event: FormEvent) => {
    event.preventDefault();
    if (!canStart) return;
    void dmApi.startStory(
      { name: name.trim(), archetype: archetype.trim(), notes: notes.trim() },
      { setting: setting.trim() || 'the school', tone: tone.trim() || 'neutral', authority },
    );
  };

  const handleSend = (event: FormEvent) => {
    event.preventDefault();
    const input = draft;
    if (input.trim() === '') return;
    dmApi.send(input);
    setDraft('');
  };

  const handleNewStory = () => {
    if (window.confirm('Delete the current local story and start over?')) {
      dmApi.resetStory();
    }
  };

  const story = dmApi.story;
  const inputDisabled = story === null || story.phase !== 'IDLE';

  return (
    <div style={panel}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <p style={{ fontSize: 13, color: '#8b949e', margin: 0 }}>
          Phase 5 — AI DM Prototype. Chat with the DM; major irreversible changes require your
          approval.
        </p>
        <span
          style={{
            fontSize: 12,
            color: '#e6edf3',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 999,
            padding: '2px 10px',
            maxWidth: '100%',
            overflowWrap: 'anywhere',
          }}
          title="Active narrative provider"
        >
          Provider: {dmApi.providerLabel}
        </span>
      </div>

      {story === null ? (
        <form
          onSubmit={handleStart}
          aria-label="Story setup"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 460 }}
        >
          <h2 style={{ fontSize: 16, margin: 0 }}>Start your story</h2>
          <div>
            <label htmlFor="player-name" style={labelStyle}>
              Character name
            </label>
            <input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="player-archetype" style={labelStyle}>
              Archetype
            </label>
            <input
              id="player-archetype"
              value={archetype}
              onChange={(e) => setArchetype(e.target.value)}
              placeholder="e.g. student with telekinesis"
              style={inputStyle}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="player-notes" style={labelStyle}>
              Backstory notes (optional)
            </label>
            <textarea
              id="player-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="dm-setting" style={labelStyle}>
              Setting
            </label>
            <input
              id="dm-setting"
              value={setting}
              onChange={(e) => setSetting(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="dm-tone" style={labelStyle}>
              Tone
            </label>
            <input
              id="dm-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="dm-authority" style={labelStyle}>
              DM authority
            </label>
            <select
              id="dm-authority"
              value={authority}
              onChange={(e) => setAuthority(e.target.value as NarrativeAuthority)}
              style={inputStyle}
            >
              <option value="PROTECTED">Protected — major changes always need approval</option>
              <option value="DEFAULT">Default — major changes need approval</option>
              <option value="UNRESTRICTED">Unrestricted — the DM may apply major changes</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={!canStart}
            style={{ padding: '8px 14px', alignSelf: 'flex-start', cursor: canStart ? 'pointer' : 'not-allowed' }}
          >
            {dmApi.starting ? 'Starting…' : 'Start Story'}
          </button>
        </form>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              width: '100%',
              minWidth: 0,
            }}
          >
            <section
              aria-label="Story transcript"
              aria-live="polite"
              aria-busy={story.phase === 'LOADING'}
              style={{
                flex: '1 1 420px',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 460,
                overflowY: 'auto',
              }}
            >
              {story.messages.length === 0 && story.phase === 'LOADING' && (
                <p role="status" style={{ color: '#8b949e', fontSize: 13 }}>
                  The DM is opening the scene…
                </p>
              )}
              {story.messages.map((message, index) => (
                <div
                  key={index}
                  style={{
                    alignSelf: message.role === 'player' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background:
                      message.role === 'player'
                        ? '#1f3a5f'
                        : message.role === 'system'
                          ? '#161b22'
                          : '#1c2128',
                    border: '1px solid #30363d',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 2 }}>
                    {roleLabel[message.role]}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                </div>
              ))}
              {story.phase === 'LOADING' && story.messages.length > 0 && (
                <p role="status" style={{ color: '#8b949e', fontSize: 13, margin: 0 }}>
                  The DM is thinking…
                </p>
              )}
              {story.phase === 'ERROR' && (
                <div
                  role="alert"
                  style={{
                    background: '#2d1b1b',
                    border: '1px solid #ff7b72',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                  }}
                >
                  <strong>The DM failed to respond.</strong> {story.lastError}
                  <button
                    type="button"
                    onClick={dmApi.retry}
                    style={{ marginLeft: 10, padding: '3px 10px', cursor: 'pointer' }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {story.phase === 'PENDING_APPROVAL' && story.pendingProposal !== null && (
                <section
                  aria-label="Proposed major change"
                  style={{
                    alignSelf: 'center',
                    width: '100%',
                    background: '#2b2417',
                    border: '1px solid #d29922',
                    borderRadius: 8,
                    padding: '10px 12px',
                  }}
                >
                  <strong style={{ fontSize: 13 }}>
                    The DM proposes a major, irreversible change:
                  </strong>
                  <p style={{ margin: '6px 0 2px', fontSize: 14 }}>{story.pendingProposal.summary}</p>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#c9d1d9' }}>
                    {story.pendingProposal.details}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={dmApi.approveProposal}
                      style={{ padding: '4px 12px', cursor: 'pointer' }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={dmApi.declineProposal}
                      style={{ padding: '4px 12px', cursor: 'pointer' }}
                    >
                      Decline
                    </button>
                  </div>
                </section>
              )}
            </section>

            <aside
              aria-label="Story summary"
              style={{
                flex: '0 1 300px',
                minWidth: 0,
                boxSizing: 'border-box',
                overflowWrap: 'anywhere',
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <h2 style={{ fontSize: 14, margin: 0 }}>Story</h2>
              <p style={{ margin: 0 }}>
                <strong>{story.player.name}</strong> — {story.player.archetype}
                {story.player.notes !== '' && <span style={{ color: '#8b949e' }}> · {story.player.notes}</span>}
              </p>
              <p style={{ margin: 0, color: '#8b949e' }}>
                Turn {story.turnCount} · {story.dm.setting} · {story.dm.tone} ·{' '}
                {story.dm.authority.toLowerCase()}
              </p>
              <div>
                <strong style={{ fontSize: 12 }}>Situation</strong>
                <p style={{ margin: '2px 0 0', color: '#c9d1d9' }}>
                  {story.situation === '' ? '—' : story.situation}
                </p>
              </div>
              <div>
                <strong style={{ fontSize: 12 }}>Unresolved threads</strong>
                {story.unresolvedThreads.length === 0 ? (
                  <p style={{ margin: '2px 0 0', color: '#c9d1d9' }}>—</p>
                ) : (
                  <ul style={{ margin: '2px 0 0', paddingLeft: 18, color: '#c9d1d9' }}>
                    {story.unresolvedThreads.map((thread) => (
                      <li key={thread}>{thread}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={handleNewStory}
                style={{ padding: '5px 12px', alignSelf: 'flex-start', cursor: 'pointer' }}
              >
                New Story
              </button>
            </aside>
          </div>

          {encounterOffer?.visible === true && (
            <div
              aria-label="Encounter offer"
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
                background: '#2b2417',
                border: '1px solid #d29922',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
              }}
            >
              <span>The DM senses this moment could turn physical.</span>
              <button
                type="button"
                onClick={encounterOffer.onAccept}
                disabled={encounterOffer.busy}
                style={{ padding: '5px 14px', cursor: encounterOffer.busy ? 'wait' : 'pointer', border: '1px solid #d29922' }}
              >
                {encounterOffer.busy ? 'Generating encounter…' : '⚔ Play Tactical Encounter'}
              </button>
              {encounterOffer.error !== null && (
                <span role="alert" style={{ color: '#ff7b72', fontSize: 12 }}>
                  {encounterOffer.error}
                </span>
              )}
            </div>
          )}

          <form
            onSubmit={handleSend}
            style={{ display: 'flex', gap: 8, alignItems: 'flex-end', width: '100%', minWidth: 0 }}
            aria-label="DM input"
          >
            <div style={{ flex: 1 }}>
              <label htmlFor="dm-input" style={labelStyle}>
                Your action or words
              </label>
              <textarea
                id="dm-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                disabled={inputDisabled}
                placeholder={
                  story.phase === 'PENDING_APPROVAL'
                    ? 'Approve or decline the proposal above first.'
                    : story.phase === 'ERROR'
                      ? 'Retry the failed request above.'
                      : 'What do you do?'
                }
                style={inputStyle}
              />
            </div>
            <button type="submit" disabled={inputDisabled} style={{ padding: '8px 16px' }}>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
