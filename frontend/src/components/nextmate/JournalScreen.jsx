import { useEffect, useMemo, useState } from 'react';
import { Icon, TopBar } from './Shell';
import {
  createJournalBook,
  createJournalEntry,
  deleteJournalBook,
  deleteJournalEntry,
  getJournalStreak,
  listJournalBooks,
  listJournalEntries,
} from '../../lib/api';

const MOODS = [
  { emoji: '😄', label: 'great' },
  { emoji: '🙂', label: 'good' },
  { emoji: '😌', label: 'calm' },
  { emoji: '😐', label: 'neutral' },
  { emoji: '😕', label: 'mixed' },
  { emoji: '😟', label: 'anxious' },
  { emoji: '😢', label: 'sad' },
  { emoji: '😣', label: 'overwhelmed' },
  { emoji: '😡', label: 'angry' },
  { emoji: '😴', label: 'tired' },
];

const BOOK_COLORS = [
  'var(--accent)', 'var(--clay)', 'var(--gold)', 'var(--teal)', 'var(--plum)', 'var(--ink-3)',
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const moodFor = (label) => MOODS.find((m) => m.label === label);

const Entry = ({ entry, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const time = entry.created_at
    ? new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <div className="nm-entry">
      <div className="nm-entry-mark">
        <span className="nm-entry-emoji">{entry.mood_emoji || '·'}</span>
        {entry.mood_label && <span className="nm-entry-mood">{entry.mood_label}</span>}
      </div>
      <div>
        <div className="nm-entry-time">
          <span>{time}</span>
          <span className="nm-entry-del">
            {confirming ? (
              <>
                <button className="nm-btn ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setConfirming(false)}>Cancel</button>
                <button className="nm-btn accent" style={{ fontSize: 10, padding: '2px 8px', marginLeft: 4 }} onClick={() => onDelete(entry.id)}>Delete</button>
              </>
            ) : (
              <button className="nm-btn ghost" title="Delete entry" style={{ padding: 4 }} onClick={() => setConfirming(true)}>
                <Icon name="trash" size={11} />
              </button>
            )}
          </span>
        </div>
        <div className="nm-entry-body">{entry.body}</div>
      </div>
    </div>
  );
};

const BookRow = ({ book, active, onClick, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  return (
    <div
      className={'nm-book-row' + (active ? ' active' : '') + (confirming ? ' confirming' : '')}
      onClick={onClick}
    >
      <div className="nm-book-spine" style={{ background: book.color || 'var(--accent)' }} />
      <div className="nm-book-meta">
        <div className="nm-book-title">{book.name}</div>
        <div className="nm-book-count">
          {book.entry_count || 0} {book.entry_count === 1 ? 'entry' : 'entries'}
        </div>
      </div>
      <div className="nm-book-actions" onClick={(e) => e.stopPropagation()}>
        {confirming ? (
          <span style={{ display: 'flex', gap: 4 }}>
            <button className="nm-btn ghost" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => setConfirming(false)}>×</button>
            <button className="nm-btn accent" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => onDelete(book.id)}>del</button>
          </span>
        ) : (
          <button className="nm-btn ghost" title="Delete book" style={{ padding: 4 }} onClick={() => setConfirming(true)}>
            <Icon name="trash" size={11} />
          </button>
        )}
      </div>
    </div>
  );
};

const dayKindLabel = (iso) => {
  if (!iso) return { day: '—', label: 'Undated', sub: '' };
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const dayNum = String(d.getDate()).padStart(2, '0');
  const monthShort = d.toLocaleDateString(undefined, { month: 'short' }).toLowerCase();
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const year = d.getFullYear();
  const thisYear = today.getFullYear();
  let label;
  if (sameDay(d, today)) label = 'Today';
  else if (sameDay(d, yest)) label = 'Yesterday';
  else label = weekday;
  const sub = year === thisYear ? `${monthShort} · ${weekday}` : `${monthShort} ${year} · ${weekday}`;
  return { day: dayNum, label, sub };
};

const StreakBlock = ({ streak }) => {
  if (!streak) return null;
  const lit = streak.current > 0;
  let sub;
  if (streak.current === 0) sub = 'A clean start. Write today to begin.';
  else if (streak.wrote_today) sub = `${streak.current === 1 ? 'One day' : `${streak.current} days`} kept. Best: ${streak.longest}.`;
  else sub = `${streak.current} day${streak.current === 1 ? '' : 's'} so far — write today to keep it.`;

  return (
    <div className={'nm-streak' + (lit ? ' lit' : '')}>
      <div className="nm-streak-row">
        <span className="nm-streak-flame">{lit ? '🔥' : '·'}</span>
        <span className="nm-streak-num">{streak.current}</span>
        <span className="nm-streak-unit">day{streak.current === 1 ? '' : 's'}<br/>streak</span>
      </div>
      <div className="nm-streak-sub">{sub}</div>
      {streak.last_7 && (
        <div className="nm-streak-pips" title="last 7 days">
          {streak.last_7.map((d) => (
            <div
              key={d.date}
              className={'nm-streak-pip' + (d.has_entry ? ' on' : '') + (d.is_today ? ' today' : '')}
              title={d.date + (d.has_entry ? ' · kept' : '')}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const JournalScreen = () => {
  const [books, setBooks] = useState([]);
  const [activeBookId, setActiveBookId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [streak, setStreak] = useState(null);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [error, setError] = useState(null);

  const [body, setBody] = useState('');
  const [moodLabel, setMoodLabel] = useState('');
  const [entryDate, setEntryDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const [showNewBook, setShowNewBook] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [newBookColor, setNewBookColor] = useState(BOOK_COLORS[0]);

  const selectedMood = useMemo(() => moodFor(moodLabel), [moodLabel]);
  const activeBook = useMemo(() => books.find((b) => b.id === activeBookId), [books, activeBookId]);

  const entriesByDate = useMemo(() => {
    const groups = new Map();
    for (const e of entries) {
      const key = e.entry_date || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [entries]);

  const fetchBooks = async (preserveId = null) => {
    setLoadingBooks(true);
    try {
      const data = await listJournalBooks();
      const list = data.books || [];
      setBooks(list);
      const next = preserveId && list.find((b) => b.id === preserveId)
        ? preserveId
        : (activeBookId && list.find((b) => b.id === activeBookId) ? activeBookId : list[0]?.id || null);
      setActiveBookId(next);
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load books');
    } finally {
      setLoadingBooks(false);
    }
  };

  const fetchEntries = async (bookId) => {
    if (!bookId) { setEntries([]); return; }
    setLoadingEntries(true);
    try {
      const data = await listJournalEntries(bookId);
      setEntries(data.entries || []);
    } catch (e) {
      setError(e.message || 'Failed to load entries');
    } finally {
      setLoadingEntries(false);
    }
  };

  const fetchStreak = async () => {
    try {
      const data = await getJournalStreak();
      setStreak(data.streak);
    } catch {
      /* non-blocking */
    }
  };

  useEffect(() => { fetchBooks(); fetchStreak(); }, []);
  useEffect(() => { if (activeBookId) fetchEntries(activeBookId); }, [activeBookId]);

  const handleSave = async () => {
    if (!body.trim() || !activeBookId) return;
    setSaving(true);
    try {
      await createJournalEntry({
        body,
        mood_emoji: selectedMood?.emoji || '',
        mood_label: selectedMood?.label || '',
        entry_date: entryDate || todayISO(),
        auto_translate: false,
        book_id: activeBookId,
      });
      setBody('');
      setMoodLabel('');
      setEntryDate(todayISO());
      await Promise.all([fetchEntries(activeBookId), fetchBooks(activeBookId), fetchStreak()]);
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id) => {
    try {
      await deleteJournalEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      fetchBooks(activeBookId);
      fetchStreak();
    } catch (e) {
      setError(e.message || 'Failed to delete');
    }
  };

  const handleCreateBook = async () => {
    const name = newBookName.trim();
    if (!name) return;
    try {
      const data = await createJournalBook({ name, color: newBookColor });
      setNewBookName('');
      setShowNewBook(false);
      setNewBookColor(BOOK_COLORS[0]);
      await fetchBooks(data.book.id);
    } catch (e) {
      setError(e.message || 'Failed to create book');
    }
  };

  const handleDeleteBook = async (id) => {
    try {
      await deleteJournalBook(id);
      const next = books.find((b) => b.id !== id)?.id || null;
      setActiveBookId(next);
      await fetchBooks(next);
    } catch (e) {
      setError(e.message || 'Failed to delete book');
    }
  };

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="nm-main">
      <TopBar crumb={
        <>
          <b>Journal</b>
          {activeBook && <><span className="sep">/</span> {activeBook.name}</>}
          <span className="sep">/</span> {dateLabel}
        </>
      } />

      <div className="nm-journal">
        {/* Bookshelf */}
        <aside className="nm-journal-shelf">
          <div className="nm-journal-shelf-head">
            <div className="nm-eyebrow">A library of</div>
            <h2>your <em>thoughts</em>.</h2>
          </div>

          <StreakBlock streak={streak} />

          <div className="nm-journal-shelf-list" style={{ marginTop: 8 }}>
            {loadingBooks && <div className="nm-meta" style={{ padding: 14 }}>Loading…</div>}
            {!loadingBooks && books.map((b) => (
              <BookRow
                key={b.id}
                book={b}
                active={b.id === activeBookId}
                onClick={() => setActiveBookId(b.id)}
                onDelete={handleDeleteBook}
              />
            ))}
          </div>

          <div className="nm-journal-shelf-add">
            {showNewBook ? (
              <div className="nm-book-new">
                <input
                  autoFocus
                  type="text"
                  value={newBookName}
                  onChange={(e) => setNewBookName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateBook();
                    if (e.key === 'Escape') { setShowNewBook(false); setNewBookName(''); }
                  }}
                  placeholder="travel · anxious · gratitude"
                />
                <div className="nm-book-swatches">
                  {BOOK_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewBookColor(c)}
                      className={'nm-book-swatch' + (newBookColor === c ? ' selected' : '')}
                      style={{ background: c }}
                      aria-label="Pick color"
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="nm-btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleCreateBook} disabled={!newBookName.trim()}>
                    Begin book
                  </button>
                  <button className="nm-btn ghost" onClick={() => { setShowNewBook(false); setNewBookName(''); }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="nm-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowNewBook(true)}>
                <Icon name="plus" size={12} /> New book
              </button>
            )}
          </div>
        </aside>

        {/* Main pane */}
        <main className="nm-journal-main">
          <div className="nm-journal-inner">
            {!activeBook && !loadingBooks && (
              <div className="nm-empty-poem">
                <div className="nm-eyebrow" style={{ marginBottom: 14 }}>An empty shelf</div>
                <h1>Begin with a <em>book</em>.</h1>
                <p>Travel. Anxious. Gratitude. The shape doesn't matter — only the keeping does.</p>
              </div>
            )}

            {activeBook && (
              <>
                <header className="nm-journal-bookhead">
                  <div className="nm-journal-numeral">
                    {String(activeBook.entry_count || 0).padStart(2, '0')}
                  </div>
                  <div>
                    <div className="nm-eyebrow" style={{ marginBottom: 8 }}>
                      {activeBook.entry_count === 1 ? 'one entry' : `${activeBook.entry_count || 0} entries`} · kept
                    </div>
                    <h1 className="nm-journal-bookname">{activeBook.name}</h1>
                  </div>
                </header>

                {/* Compose */}
                <div className="nm-compose">
                  <div className="nm-compose-step">01 · Date</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 22 }}>
                    <input
                      type="date"
                      value={entryDate}
                      max={todayISO()}
                      onChange={(e) => setEntryDate(e.target.value)}
                      className="nm-date-input"
                    />
                    {entryDate !== todayISO() && (
                      <button
                        type="button"
                        className="nm-btn ghost"
                        style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}
                        onClick={() => setEntryDate(todayISO())}
                      >
                        ← today
                      </button>
                    )}
                  </div>

                  <div className="nm-compose-step">02 · Mood</div>
                  <div className="nm-mood-strip" style={{ marginBottom: 22 }}>
                    {MOODS.map((m) => (
                      <button
                        key={m.label}
                        type="button"
                        onClick={() => setMoodLabel(m.label === moodLabel ? '' : m.label)}
                        className={'nm-mood' + (m.label === moodLabel ? ' active' : '')}
                      >
                        <span className="nm-mood-emoji">{m.emoji}</span>
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="nm-compose-step">03 · The page</div>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={`Today, in your ${activeBook.name.toLowerCase()} book…`}
                    rows={6}
                    className="nm-paper"
                  />

                  <div className="nm-compose-foot">
                    <button
                      type="button"
                      className="nm-btn primary"
                      onClick={handleSave}
                      disabled={!body.trim() || saving}
                    >
                      {saving ? 'Keeping…' : `Keep in ${activeBook.name}`}
                    </button>
                    <span className="nm-meta">
                      {body.length > 0 ? `${body.length} chars` : 'one sentence is enough'}
                    </span>
                  </div>

                  {error && (
                    <div className="nm-meta" style={{ color: 'var(--accent)', marginTop: 14 }}>{error}</div>
                  )}
                </div>

                {/* Past entries */}
                {entries.length === 0 ? (
                  <div className="nm-empty-poem" style={{ padding: '40px 20px' }}>
                    <p style={{ fontSize: 16 }}>
                      {loadingEntries ? 'Turning the pages…' : 'A blank book, waiting.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
                      <div className="nm-eyebrow">Past pages</div>
                      <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                      <div className="nm-meta">{entries.length} kept</div>
                    </div>

                    {entriesByDate.map(([date, items]) => {
                      const k = dayKindLabel(date);
                      return (
                        <div key={date} className="nm-day-block">
                          <div className="nm-day-head">
                            <div className="nm-day-num">{k.day}</div>
                            <div className="nm-day-text">
                              <span className="nm-day-label">{k.label}</span>
                              <span className="nm-day-sub">{k.sub}</span>
                            </div>
                          </div>
                          {items.map((e) => (
                            <Entry key={e.id} entry={e} onDelete={handleDeleteEntry} />
                          ))}
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};