import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, TopBar, ConfirmDialog } from './Shell';
import {
  createJournalBook,
  createJournalEntry,
  deleteJournalBook,
  deleteJournalEntry,
  getJournalStreak,
  listJournalBooks,
  listJournalEntries,
  updateJournalEntry,
} from '../../lib/api';
import WelcomeBookImg from '../../assets/ic_welcome_book.png';
import { TemplateModal } from './TemplateModal';

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

const Entry = ({ entry, onDelete, onUpdate }) => {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(entry.body);
  const editRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const time = entry.created_at
    ? new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleSaveEdit = async () => {
    const content = editRef.current?.innerHTML || editBody;
    if (!content.trim()) return;
    setSaving(true);
    try {
      await onUpdate(entry.id, { body: content });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="nm-entry">
      <div className="nm-entry-mark">
        <span className="nm-entry-emoji">{entry.mood_emoji || '·'}</span>
        {entry.mood_label && <span className="nm-entry-mood">{entry.mood_label}</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div className="nm-entry-time">
          <span>{time}</span>
          <span className="nm-entry-del">
            <button className="nm-btn ghost" title="Download PDF" style={{ padding: 4, marginRight: 2 }} onClick={(e) => {
              const el = e.currentTarget.closest('.nm-entry');
              if (el) el.classList.add('print-target');
              window.print();
              if (el) el.classList.remove('print-target');
            }}>
              <Icon name="download" size={11} />
            </button>
            <button className="nm-btn ghost" title="Edit entry" style={{ padding: 4, marginRight: 2 }} onClick={() => { setEditing(!editing); setEditBody(entry.body); }}>
              <Icon name="edit" size={11} />
            </button>
            <button className="nm-btn ghost" title="Delete entry" style={{ padding: 4 }} onClick={() => setConfirming(true)}>
              <Icon name="trash" size={11} />
            </button>
          </span>
        </div>
        {editing ? (
          <div style={{ marginTop: 6 }}>
            <div
              ref={editRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setEditBody(e.currentTarget.innerHTML)}
              dangerouslySetInnerHTML={{ __html: entry.body }}
              style={{ fontSize: 13, marginBottom: 8, border: '1px solid var(--rule)', borderRadius: 4, padding: '8px 10px', minHeight: 80, outline: 'none', fontFamily: 'var(--font-serif)', background: 'var(--surface-2)' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="nm-btn primary" style={{ fontSize: 11 }} onClick={handleSaveEdit} disabled={saving || !editBody.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="nm-btn ghost" style={{ fontSize: 11 }} onClick={() => { setEditing(false); setEditBody(entry.body); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="nm-entry-body" dangerouslySetInnerHTML={{ __html: entry.body }} />
        )}
        {entry.translated && (
          <div className="nm-meta" style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--ink-3)' }}>{entry.translated}</div>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete this entry?"
        body="This removes the entry for good and can't be undone."
        confirmLabel="Delete entry"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onDelete(entry.id);
        }}
      />
    </div>
  );
};

const BookRow = ({ book, active, onClick, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  return (
    <div
      className={'nm-book-row' + (active ? ' active' : '')}
      onClick={onClick}
    >
      <div style={{ width: 14, height: 14, borderRadius: '50%', background: book.color || 'var(--accent)', marginLeft: 16, flexShrink: 0 }} />
      <div className="nm-book-meta" style={{ paddingLeft: 12 }}>
        <div className="nm-book-title">{book.name}</div>
        <div className="nm-book-count">
          {book.entry_count || 0} {book.entry_count === 1 ? 'entry' : 'entries'}
        </div>
      </div>
      <div className="nm-book-actions" onClick={(e) => e.stopPropagation()}>
        <button className="nm-btn ghost" title="Delete book" style={{ padding: 4 }} onClick={() => setConfirming(true)}>
          <Icon name="trash" size={11} />
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete this book?"
        body={<>This deletes "{book.name}" and every entry inside it. This can't be undone.</>}
        confirmLabel="Delete book"
        onCancel={(e) => { e?.stopPropagation?.(); setConfirming(false); }}
        onConfirm={() => {
          setConfirming(false);
          onDelete(book.id);
        }}
      />
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

  return (
    <div className="nm-streak-duo" style={{ background: '#6C5CE7', color: 'white', padding: '14px 16px', borderRadius: 16, marginBottom: 20, textAlign: 'center', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }}>
      <div style={{ textTransform: 'uppercase', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', opacity: 0.9, marginBottom: 6 }}>
        Streak Society
      </div>
      <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, marginBottom: 2, letterSpacing: '-0.02em', textShadow: '1px 1px 0 rgba(0,0,0,0.1)' }}>
        {streak.current}
      </div>
      <div style={{ fontSize: 15, fontWeight: 'bold', opacity: 0.9, marginBottom: 16 }}>
        day streak!
      </div>
      
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 10px', color: 'var(--ink)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          {streak.last_7.map((d) => {
            const dateObj = new Date(d.date);
            const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
            return (
              <div key={`head-${d.date}`} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 'bold', color: 'var(--ink-3)' }}>
                {dayName}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', position: 'relative', height: 36, alignItems: 'center' }}>
          {/* Background bar for streak */}
          <div style={{ position: 'absolute', left: '6%', right: '6%', height: 36, background: 'var(--surface-2)', borderRadius: 18, zIndex: 0 }} />
          
          {streak.last_7.map((d) => {
            const isLit = d.has_entry;
            const isToday = d.is_today;
            
            return (
              <div key={`pip-${d.date}`} style={{ flex: 1, display: 'flex', justifyContent: 'center', zIndex: 1 }}>
                <div style={{ 
                  width: 32, 
                  height: 32, 
                  borderRadius: 16, 
                  background: isLit ? 'var(--gold)' : 'transparent',
                  color: isLit ? 'white' : 'var(--ink-2)',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  boxShadow: isLit ? '0 2px 6px rgba(242,196,110,0.5)' : 'none',
                  fontSize: isToday && isLit ? 16 : 14
                }}>
                  {isToday && isLit ? '🔥' : (isLit ? '✓' : '')}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const DayAccordion = ({ k, items, isFirst, handleDeleteEntry, handleUpdateEntry }) => {
  const [open, setOpen] = useState(isFirst);
  return (
    <div className="nm-day-block" style={{ border: '1px solid var(--rule-soft)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, background: 'var(--surface)' }}>
      <div 
        className="nm-day-head" 
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }} 
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="nm-day-num">{k.day}</div>
          <div className="nm-day-text">
            <span className="nm-day-label">{k.label}</span>
            <span className="nm-day-sub">{k.sub}</span>
          </div>
        </div>
        <div style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.05em' }}>
          {open ? '▼ HIDE' : '▶ VIEW'}
        </div>
      </div>
      {open && (
        <div style={{ paddingTop: 16, borderTop: '1px solid var(--rule-soft)', marginTop: 16 }}>
          {items.map((e) => (
            <Entry key={e.id} entry={e} onDelete={handleDeleteEntry} onUpdate={handleUpdateEntry} />
          ))}
        </div>
      )}
    </div>
  );
};

export const JournalScreen = ({ user }) => {
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
  const [allowLoopDetection, setAllowLoopDetection] = useState(true);
  const editorRef = useRef(null);

  const [showNewBook, setShowNewBook] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [newBookColor, setNewBookColor] = useState(BOOK_COLORS[0]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [bgImage, setBgImage] = useState('');

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
      const plainBody = editorRef.current?.innerHTML || body;
      const finalBody = bgImage 
        ? `<div style="background-image: url('${bgImage}'); background-size: cover; background-position: center; padding: 20px; border-radius: 8px;">${plainBody}</div>`
        : plainBody;

      await createJournalEntry({
        body: finalBody,
        mood_emoji: selectedMood?.emoji || '',
        mood_label: selectedMood?.label || '',
        entry_date: entryDate || todayISO(),
        auto_translate: false,
        book_id: activeBookId,
        allow_loop_detection: allowLoopDetection,
      });
      setBody('');
      if (editorRef.current) editorRef.current.innerHTML = '';
      setMoodLabel('');
      setEntryDate(todayISO());
      setBgImage('');
      await Promise.all([fetchEntries(activeBookId), fetchBooks(activeBookId), fetchStreak()]);
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEditEntry = async (id, fields) => {
    try {
      await updateJournalEntry(id, fields);
      await fetchEntries(activeBookId);
    } catch (e) {
      setError(e.message || 'Failed to update');
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

  const handleUpdateEntry = async (id, payload) => {
    try {
      const data = await updateJournalEntry(id, payload);
      const updated = data.entry;
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (e) {
      setError(e.message || 'Failed to update entry');
      throw e; // let Entry's saveEdit know it failed, so it doesn't exit edit mode
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

  const displayName = user?.email ? user.email.split('@')[0].replace(/^\w/, (c) => c.toUpperCase()) : 'Girish';
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const handleUseTemplate = (html) => {
    setBody(html);
    if (editorRef.current) {
      editorRef.current.innerHTML = html;
    }
  };

  return (
    <div className="nm-main">
      <TopBar crumb={
        <>
          <b>Journal</b>
          {activeBook && <><span className="sep">/</span> {activeBook.name}</>}
          <span className="sep">/</span> {dateLabel}
        </>
      } />
      <div className="nm-journal-container">
        <div className="nm-journal-welcome">
          <div className="nm-journal-welcome-text">
            <h3>Welcome back, {displayName}!</h3>
            <p>Your daily journal is a space for clarity,<br></br> growth and self reflection.</p>
          </div>
          <img src={WelcomeBookImg} alt='welcome'/>
        </div>

        <div className="nm-journal">
          {/* Bookshelf */}
          <aside className="nm-journal-shelf">

          <StreakBlock streak={streak} />

          <div className="nm-card">
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
                <>
                  <button className="nm-btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => setShowNewBook(true)}>
                    <Icon name="plus" size={12} /> New book
                  </button>
                  <button className="nm-btn ghost" style={{ width: '100%', justifyContent: 'center', border: '1px solid var(--rule)' }} onClick={() => setShowTemplateModal(true)}>
                    <Icon name="plus" size={12} /> Template Gallery
                  </button>
                </>
              )}
            </div>
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
                  {/* Date */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 22 }}>
                    <input
                      type="date"
                      value={entryDate}
                      max={todayISO()}
                      onChange={(e) => setEntryDate(e.target.value)}
                      className="nm-date-input"
                    />
                    {entryDate !== todayISO() && (
                      <button type="button" className="nm-btn ghost"
                        style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}
                        onClick={() => setEntryDate(todayISO())}>
                        ← today
                      </button>
                    )}
                  </div>

                  {/* Mood */}
                  <div className="nm-compose-step">Mood</div>
                  <div className="nm-mood-strip" style={{ marginBottom: 22 }}>
                    {MOODS.map((m) => (
                      <button key={m.label} type="button"
                        onClick={() => setMoodLabel(m.label === moodLabel ? '' : m.label)}
                        className={'nm-mood' + (m.label === moodLabel ? ' active' : '')}>
                        <span className="nm-mood-emoji">{m.emoji}</span>
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Rich text editor */}
                  <div style={{
                    border: '1px solid var(--rule)',
                    borderRadius: 6,
                    overflow: 'hidden',
                    marginBottom: 4,
                  }}>
                    {/* Toolbar */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: 2, padding: '6px 8px',
                      borderBottom: '1px solid var(--rule)', background: 'var(--surface)',
                    }}>
                      {[
                        { cmd: 'bold', label: <b>B</b> },
                        { cmd: 'italic', label: <i>I</i> },
                        { cmd: 'underline', label: <u>U</u> },
                        { cmd: 'strikeThrough', label: <s>S</s> },
                      ].map(({ cmd, label }) => (
                        <button key={cmd} type="button" onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd); }}
                          className="nm-btn ghost"
                          style={{ padding: '2px 7px', fontSize: 13, minWidth: 28 }}>
                          {label}
                        </button>
                      ))}
                      <div style={{ width: 1, background: 'var(--rule)', margin: '0 4px' }} />
                      {[
                        { cmd: 'justifyLeft', label: '⬛▭▭' },
                        { cmd: 'justifyCenter', label: '▭⬛▭' },
                        { cmd: 'justifyRight', label: '▭▭⬛' },
                      ].map(({ cmd, label }) => (
                        <button key={cmd} type="button" onMouseDown={(e) => { e.preventDefault(); document.execCommand(cmd); }}
                          className="nm-btn ghost"
                          style={{ padding: '2px 7px', fontSize: 10 }}>
                          {label}
                        </button>
                      ))}
                      <div style={{ width: 1, background: 'var(--rule)', margin: '0 4px' }} />
                      <select onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => { setBgImage(e.target.value); e.target.value = ''; }}
                        defaultValue=""
                        style={{ fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 4, padding: '1px 4px', cursor: 'pointer', maxWidth: 110 }}>
                        <option value="" disabled>Background</option>
                        <option value="https://images.unsplash.com/photo-1508614999368-9260051292e5?w=1200&q=80">Clock (Priority)</option>
                        <option value="https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1200&q=80">Nature</option>
                        <option value="https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=1200&q=80">Rain</option>
                        <option value="">None</option>
                      </select>
                      <button type="button" title="Download PDF" onClick={(e) => {
                        const wrapper = e.currentTarget.closest('.nm-compose');
                        if (wrapper) wrapper.classList.add('print-target');
                        window.print();
                        if (wrapper) wrapper.classList.remove('print-target');
                      }} className="nm-btn ghost" style={{ padding: '2px 7px', fontSize: 13, color: 'var(--ink-3)', marginLeft: 'auto' }}>
                        <Icon name="download" size={13} /> PDF
                      </button>
                      <div style={{ width: 1, background: 'var(--rule)', margin: '0 4px' }} />
                      <button type="button" onMouseDown={(e) => {
                        e.preventDefault();
                        const ed = editorRef.current;
                        if (!ed) return;
                        ed.focus();
                        const sel = window.getSelection();
                        const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
                        const li = document.createElement('li');
                        li.innerHTML = '\u200b';
                        const ul = document.createElement('ul');
                        ul.appendChild(li);
                        if (range) { range.deleteContents(); range.insertNode(ul); range.setStart(li, 1); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
                        else ed.appendChild(ul);
                        setBody(ed.innerText);
                      }} className="nm-btn ghost" style={{ padding: '2px 7px', fontSize: 13 }}>• List</button>
                      <button type="button" onMouseDown={(e) => {
                        e.preventDefault();
                        const ed = editorRef.current;
                        if (!ed) return;
                        ed.focus();
                        const sel = window.getSelection();
                        const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
                        const li = document.createElement('li');
                        li.innerHTML = '\u200b';
                        const ol = document.createElement('ol');
                        ol.appendChild(li);
                        if (range) { range.deleteContents(); range.insertNode(ol); range.setStart(li, 1); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
                        else ed.appendChild(ol);
                        setBody(ed.innerText);
                      }} className="nm-btn ghost" style={{ padding: '2px 7px', fontSize: 13 }}>1. List</button>
                      <div style={{ width: 1, background: 'var(--rule)', margin: '0 4px' }} />
                      <select onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => { document.execCommand('fontSize', false, e.target.value); e.target.value = ''; }}
                        defaultValue=""
                        style={{ fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 4, padding: '1px 4px', cursor: 'pointer' }}>
                        <option value="" disabled>Size</option>
                        <option value="1">Small</option>
                        <option value="3">Normal</option>
                        <option value="5">Large</option>
                        <option value="7">Huge</option>
                      </select>
                      <select onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => { document.execCommand('fontName', false, e.target.value); e.target.value = ''; }}
                        defaultValue=""
                        style={{ fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 4, padding: '1px 4px', cursor: 'pointer', maxWidth: 110 }}>
                        <option value="" disabled>Font</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Arial">Arial</option>
                        <option value="'Courier New'">Courier</option>
                        <option value="'Times New Roman'">Times</option>
                        <option value="Verdana">Verdana</option>
                      </select>
                    </div>
                    {/* Editable area */}
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => setBody(e.currentTarget.innerText)}
                      data-placeholder={`Today, in your ${activeBook.name.toLowerCase()} book…`}
                      style={{
                        minHeight: 160,
                        padding: bgImage ? '24px 28px' : '14px 18px',
                        fontFamily: 'var(--font-serif)',
                        fontSize: 16,
                        lineHeight: '28px',
                        color: 'var(--ink)',
                        outline: 'none',
                        background: bgImage ? `url('${bgImage}') center/cover` : '#e5d7fd80',
                        borderRadius: bgImage ? 8 : 0,
                      }}
                    />
                  </div>

                  {/* Options */}
                  <div style={{ marginBottom: 22, marginTop: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
                      <span className="nm-switch">
                        <input type="checkbox" checked={allowLoopDetection} onChange={(e) => setAllowLoopDetection(e.target.checked)} />
                        <span className="nm-switch-slider"></span>
                      </span>
                      Allow NexMate to analyze this entry for behavioral loops
                    </label>
                  </div>

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
                      {body.length > 0 ? `${body.length} chars` : ''}
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

                    {entriesByDate.map(([date, items], i) => {
                      const k = dayKindLabel(date);
                      return (
                        <DayAccordion 
                          key={date}
                          k={k}
                          items={items}
                          isFirst={i === 0}
                          handleDeleteEntry={handleDeleteEntry}
                          handleUpdateEntry={handleUpdateEntry}
                        />
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
      <TemplateModal 
        isOpen={showTemplateModal} 
        onClose={() => setShowTemplateModal(false)} 
        onUseTemplate={handleUseTemplate} 
      />
    </div>
  );
};