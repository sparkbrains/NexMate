import { useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { TemplateModal } from './TemplateModal';
import { PAPER_STYLES } from '../../lib/templates';
import { AppContext } from '../../context';



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

// A4 page size in px at 96dpi — the journal page renders at this fixed size always;
// on-screen zoom is a pure CSS transform on top of it, so saved sticker/text-block
// coordinates stay valid across window sizes and zoom levels, and print/export can
// render it at true A4 size regardless of what zoom the user was looking at.

const THEME_TO_COVER_MAP = {
  'Background 1.jpg': 'Cover 1.png',
  'Background 10.jpg': 'Cover 10.png',
  'Background 11.jpg': 'Cover 11.png',
  'Background 12.jpg': 'Cover 12.png',
  'Background 13.jpg': 'Cover 13.png',
  'Background 14.jpg': 'Cover 14.png',
  'Background 15.png': 'Cover 15.jpg',
  'Background 16.png': 'Cover 16.png',
  'Background 17.png': 'Cover 17.jpg',
  'Background 18.png': 'Cover 18.jpg',
  'Background 19.png': 'Cover 20.jpg',
  'Background 2.jpg': 'Cover 2.png',
  'Background 20.png': 'Cover 20.jpg',
  'Background 21.jpg': 'Cover 21.png',
  'Background 3.jpg': 'Cover 3.jpg',
  'Background 4.jpg': 'Cover 4.png',
  'Background 5.jpg': 'Cover 5.png',
  'Background 6.jpg': 'Cover 6.jpg',
  'Background 7.jpg': 'cover 7.jpg',
  'Background 8.jpg': 'Cover 8.jpg',
  'Background 9.jpg': 'Cover 9.png',
};

const COVERS = [
  'Cover1.jpg', 'Cover2.jpg', 'Cover3.png', 'Cover4.png', 'Cover5.png',
  'Cover6.png', 'Cover7.png', 'Cover8.png', 'Cover9.png', 'Cover11.png',
  'Cover12.png', 'Cover13.png'
];

const BACKGROUNDS = [
  'Background1.png', 'Background2.png', 'Background3.png', 'Background4.png',
  'Background5.png', 'Background6.png', 'Background7.png', 'Background8.png',
  'Background9.png', 'Background10.png', 'Background11.png', 'Background12.png',
  'Background13.png', 'Background14.png'
];

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5];

// Curated font stack for the journal editor — mirrors the variety of a Canva-style font picker.
const FONT_OPTIONS = [
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: "'Times New Roman', serif" },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Playfair Display', value: "'Playfair Display', serif" },
  { label: 'Merriweather', value: "'Merriweather', serif" },
  { label: 'Lora', value: "'Lora', serif" },
  { label: 'Poppins', value: "'Poppins', sans-serif" },
  { label: 'Montserrat', value: "'Montserrat', sans-serif" },
  { label: 'Raleway', value: "'Raleway', sans-serif" },
  { label: 'Oswald', value: "'Oswald', sans-serif" },
  { label: 'Quicksand', value: "'Quicksand', sans-serif" },
  { label: 'Comfortaa', value: "'Comfortaa', sans-serif" },
  { label: 'Caveat', value: "'Caveat', cursive" },
  { label: 'Dancing Script', value: "'Dancing Script', cursive" },
  { label: 'Pacifico', value: "'Pacifico', cursive" },
  { label: 'Amatic SC', value: "'Amatic SC', cursive" },
  { label: 'Shadows Into Light', value: "'Shadows Into Light', cursive" },
  { label: 'Indie Flower', value: "'Indie Flower', cursive" },
  { label: 'Bebas Neue', value: "'Bebas Neue', sans-serif" },
  { label: 'Space Mono', value: "'Space Mono', monospace" },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const moodFor = (label) => MOODS.find((m) => m.label === label);

const Entry = ({ entry, onDelete, onEditInMain }) => {
  const [confirming, setConfirming] = useState(false);
  const time = new Date(entry.entry_date || entry.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="nm-entry">
      <div className="nm-entry-mark">
        <span className="nm-entry-emoji">{entry.mood_emoji || '✨'}</span>
        {entry.mood_label && <span className="nm-entry-mood">{entry.mood_label}</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div className="nm-entry-time">
          <span>{time}</span>
          <span className="nm-entry-del">
            <button className="nm-btn ghost" title="Edit entry" style={{ padding: 4, marginRight: 2 }} onClick={() => onEditInMain(entry)}>
              <Icon name="edit" size={11} />
            </button>
            <button className="nm-btn ghost" title="Delete entry" style={{ padding: 4 }} onClick={() => setConfirming(true)}>
              <Icon name="trash" size={11} />
            </button>
          </span>
        </div>
        <div className="nm-entry-body" dangerouslySetInnerHTML={{ __html: entry.body }} />
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

const BookRow = ({ book, active, cover, onClick, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        height: 48,
        marginBottom: 10,
        borderRadius: '2px 6px 6px 2px',
        boxShadow: active ? '0 8px 16px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.1)',
        transform: 'none',
        transition: 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.3s, border-left 0.3s',
        cursor: 'pointer',
        background: cover ? `url('/covers/${encodeURIComponent(cover)}') center/cover` : book.color || 'var(--accent)',
        borderLeft: active ? '5px solid var(--accent)' : '5px solid rgba(0,0,0,0.35)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px'
      }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.2) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)'
      }} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ 
          flex: 1,
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.85)', 
          backdropFilter: 'blur(4px)',
          color: '#111', 
          padding: '2px 10px', 
          borderRadius: '12px', 
          fontFamily: 'var(--font-serif)', 
          fontWeight: 600, 
          fontSize: 14, 
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          border: '1px solid rgba(255,255,255,0.4)'
        }}>
          {book.name}
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center' }}>
        <button className="nm-btn ghost" title="Delete book" style={{ padding: 4, color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }} onClick={(e) => { e.stopPropagation(); setConfirming(true); }}>
          <Icon name="trash" size={12} />
        </button>
      </div>

      <div style={{
        position: 'absolute', right: 0, top: 2, bottom: 2, width: 5,
        background: '#f0ebd8', borderRadius: '0 3px 3px 0',
        borderLeft: '1px solid rgba(0,0,0,0.2)'
      }} />

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
    <div className="nm-streak-duo" style={{ position: 'relative', background: 'var(--accent)', color: 'white', padding: '14px 16px', borderRadius: 16, marginBottom: 20, textAlign: 'left', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }}>
      <div style={{ textTransform: 'uppercase', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.1em', opacity: 0.9, marginBottom: 6 }}>
        Streak Society
      </div>
      <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, marginBottom: 2, letterSpacing: '-0.02em', textShadow: '1px 1px 0 rgba(0,0,0,0.1)' }}>
        {streak.current}
      </div>
      <div style={{ fontSize: 15, fontWeight: 'bold', opacity: 0.9, marginBottom: 16 }}>
        day streak!
      </div>
      
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 10px', color: 'var(--ink)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          {streak.last_7.map((d) => {
            const dateObj = new Date(d.date);
            const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
            return (
              <div key={`head-${d.date}`} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 12, fontWeight: 'bold', color: 'var(--ink-3)' }}>
                {dayName}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', position: 'relative', height: 36, alignItems: 'center' }}>
          {/* Background bar for streak */}
          <div style={{ position: 'absolute', left: 0, right: 0, height: 36, background: 'var(--surface-2)', borderRadius: 18, zIndex: 0 }} />

          {streak.last_7.map((d) => {
            const isLit = d.has_entry;
            const isToday = d.is_today;

            return (
              <div key={`pip-${d.date}`} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', zIndex: 1 }}>
                <div style={{
                  width: '78%',
                  maxWidth: 32,
                  aspectRatio: '1',
                  borderRadius: '50%',
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

const DayAccordion = ({ k, items, handleDeleteEntry, handleEditInMain }) => {
  const [open, setOpen] = useState(false);
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
            <Entry key={e.id} entry={e} onDelete={handleDeleteEntry} onEditInMain={handleEditInMain} />
          ))}
        </div>
      )}
    </div>
  );
};

export const JournalScreen = ({ user }) => {
  const { checkRewards } = useContext(AppContext);
  const [books, setBooks] = useState([]);
  const [activeBookId, setActiveBookId] = useState(null);
  const [editingEntryId, setEditingEntryId] = useState(null);
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
  const [bookSettings, setBookSettings] = useState({});
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [coverText, setCoverText] = useState('');
  const editorRef = useRef(null);
  
  // Toolbar dropdown state
  const [activeMenu, setActiveMenu] = useState(null);
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.nm-dropdown-group')) {
        setActiveMenu(null);
      }
    };
    if (activeMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeMenu]);

  const [showNewBook, setShowNewBook] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [newBookColor, setNewBookColor] = useState(BOOK_COLORS[0]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [bgImage, setBgImage] = useState('');
  const [coverStyle, setCoverStyle] = useState('');
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [stickers, setStickers] = useState([]); // { id, src, x, y, w, rotate }
  const [selectedSticker, setSelectedSticker] = useState(null);
  const [textBlocks, setTextBlocks] = useState([]); // { id, text, x, y, rotate, fontFamily, fontSize, color, bold, italic, underline, align }
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [textColor, setTextColor] = useState('#000000');
  const [hlColor, setHlColor] = useState('#fff176');
  const [activeFont, setActiveFont] = useState('');
  const [customThemeUrl, setCustomThemeUrl] = useState('');
  const customThemeInputRef = useRef(null);
  const editorWrapRef = useRef(null);
  const printContainerRef = useRef(null);
  const pageViewportRef = useRef(null);

  // zoomMode is either 'fit-width' / 'fit-page', or a fixed numeric zoom (1 = 100%).
  const [zoomMode, setZoomMode] = useState('fit-width');
  const [zoom, setZoom] = useState(1);

  const STICKERS = [
    '/stickers/sticker-1.png', '/stickers/sticker-2.png', '/stickers/sticker-3.png',
    '/stickers/sticker-4.png', '/stickers/sticker-5.png', '/stickers/sticker-6.png',
    '/stickers/sticker-7.png', '/stickers/sticker-8.png', '/stickers/sticker-9.png',
    '/stickers/sticker-10.png', '/stickers/sticker-11.png',
  ];

  const addSticker = (src) => {
    const id = Date.now();
    setStickers(prev => [...prev, { id, src, x: 20, y: 20, w: 90, rotate: 0, page: isBookOpen ? 'journal' : 'cover' }]);
    setSelectedSticker(id);
    setShowStickerPanel(false);
  };

  const resizeSticker = (id, delta) => {
    setStickers(prev => prev.map(s => s.id === id ? { ...s, w: Math.max(40, Math.min(300, s.w + delta)) } : s));
  };

  const rotateSticker = (id, delta) => {
    setStickers(prev => prev.map(s => s.id === id ? { ...s, rotate: (s.rotate || 0) + delta } : s));
  };

  const removeSticker = (id) => {
    setStickers(prev => prev.filter(s => s.id !== id));
    setSelectedSticker(null);
  };

  const addTextBlock = () => {
    const id = Date.now();
    setTextBlocks(prev => [...prev, {
      id, text: 'Your text here', x: 40, y: 40, rotate: 0,
      fontFamily: FONT_OPTIONS[0].value, fontSize: 18, color: '#000000',
      bold: false, italic: false, underline: false, align: 'left',
      page: isBookOpen ? 'journal' : 'cover'
    }]);
    setSelectedBlock(id);
  };

  const updateTextBlock = (id, fields) => setTextBlocks(prev => prev.map(b => b.id === id ? { ...b, ...fields } : b));

  const removeTextBlock = (id) => { setTextBlocks(prev => prev.filter(b => b.id !== id)); setSelectedBlock(null); };

  const duplicateTextBlock = (id) => {
    const src = textBlocks.find(b => b.id === id);
    if (!src) return;
    const copy = { ...src, id: Date.now(), x: src.x + 16, y: src.y + 16 };
    setTextBlocks(prev => [...prev, copy]);
    setSelectedBlock(copy.id);
  };

  const blockDragState = useRef(null);

  const onBlockMouseDown = (e, id) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    blockDragState.current = { id, startX: e.clientX, startY: e.clientY };
    const onMove = (me) => {
      if (!blockDragState.current) return;
      const dx = (me.clientX - blockDragState.current.startX) / zoom;
      const dy = (me.clientY - blockDragState.current.startY) / zoom;
      setTextBlocks(prev => prev.map(b => b.id === id ? { ...b, x: b.x + dx, y: b.y + dy } : b));
      blockDragState.current.startX = me.clientX;
      blockDragState.current.startY = me.clientY;
    };
    const onUp = () => { blockDragState.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Recompute zoom whenever in a "fit" mode, and whenever the viewport resizes.
  useEffect(() => {
    if (zoomMode !== 'fit-width' && zoomMode !== 'fit-page') {
      setZoom(zoomMode);
      return;
    }
    const el = pageViewportRef.current;
    if (!el) return;
    const compute = () => {
      const pad = 48;
      const availW = Math.max(1, el.clientWidth - pad);
      const availH = Math.max(1, el.clientHeight - pad);
      let z = availW / A4_WIDTH;
      if (zoomMode === 'fit-page') z = Math.min(z, availH / A4_HEIGHT);
      setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoomMode]);

  const nudgeZoom = (delta) => {
    setZoomMode((prev) => {
      const base = typeof prev === 'number' ? prev : zoom;
      return Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, base + delta)) * 100) / 100;
    });
  };

  const handleCustomThemeUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCustomThemeUrl(url);
    setBgImage('__custom__');
  };

  const dragState = useRef(null);
  const stickerNodeRefs = useRef({});
  const savedRangeRef = useRef(null);

  const saveSelection = () => {
    const sel = window.getSelection();
    return sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  };

  const restoreSelection = (range) => {
    if (!range) return;
    editorRef.current?.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const trackSelection = () => {
    const range = saveSelection();
    if (range && editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range;
    }
    if (typeof window !== 'undefined' && window.getSelection) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      
      const node = sel.anchorNode?.parentNode;
      if (node && node.nodeType === 1) {
        const comp = window.getComputedStyle(node);
        if (node.hasAttribute('color') || node.style.color) {
          setTextColor(comp.color);
        } else {
          setTextColor('#000000');
        }
        
        if (node.style.backgroundColor && node.style.backgroundColor !== 'rgba(0, 0, 0, 0)' && node.style.backgroundColor !== 'transparent') {
          setHlColor(comp.backgroundColor);
        } else {
          setHlColor('#fff176');
        }
        
        const rawFont = node.style.fontFamily || node.getAttribute('face') || comp.fontFamily;
        if (rawFont) {
          const cleanFont = rawFont.replace(/['"]/g, '').split(',')[0].trim().toLowerCase();
          const match = FONT_OPTIONS.find(f => f.value.toLowerCase().replace(/['"]/g, '').includes(cleanFont));
          setActiveFont(match ? match.value : '');
        } else {
          setActiveFont('');
        }
      }
    }
  };

  const applyCommand = (cmd, value) => {
    editorRef.current?.focus();
    if (savedRangeRef.current) restoreSelection(savedRangeRef.current);
    document.execCommand(cmd, false, value);
    if (cmd === 'fontName') setActiveFont(value);
    trackSelection();
  };

  const handleDownloadPdf = () => {
    setSelectedSticker(null);
    setSelectedBlock(null);
    requestAnimationFrame(() => {
      const el = printContainerRef.current;
      if (!el) return;
      
      // Clone to break out of React's DOM hierarchy for perfect printing
      const clone = el.cloneNode(true);
      clone.classList.add('print-target-clone');
      
      // Foolproof fix: Strip inline visibility/opacity from the cover clone so it ALWAYS prints
      const coverClone = clone.querySelector('.nm-cover-page');
      if (coverClone) {
        coverClone.style.opacity = '1';
        coverClone.style.visibility = 'visible';
        coverClone.style.transform = 'none';
        coverClone.style.pointerEvents = 'auto';
        
        // PDF engines ignore backface-visibility: hidden, causing the beige inner cover to render on top of the image!
        // We completely remove it from the print clone.
        const backfaceDiv = coverClone.querySelector('.nm-backface');
        if (backfaceDiv) backfaceDiv.remove();
      }
      
      const printWrapper = document.createElement('div');
      printWrapper.id = 'nm-print-wrapper';
      printWrapper.appendChild(clone);
      document.body.appendChild(printWrapper);
      
      window.print();
      
      document.body.removeChild(printWrapper);
    });
  };

  const onStickerMouseDown = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSticker(id);
    const sticker = stickers.find(s => s.id === id);
    if (!sticker) return;
    let curX = sticker.x, curY = sticker.y;
    dragState.current = { id, startX: e.clientX, startY: e.clientY };
    const node = stickerNodeRefs.current[id];
    const onMove = (me) => {
      if (!dragState.current) return;
      const dx = (me.clientX - dragState.current.startX) / zoom;
      const dy = (me.clientY - dragState.current.startY) / zoom;
      curX += dx; curY += dy;
      dragState.current.startX = me.clientX;
      dragState.current.startY = me.clientY;
      if (node) { node.style.left = curX + 'px'; node.style.top = curY + 'px'; }
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setStickers(prev => prev.map(s => s.id === id ? { ...s, x: curX, y: curY } : s));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };


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
  
  // Load settings from local storage
  useEffect(() => {
    const settings = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('book_')) {
        settings[key] = localStorage.getItem(key);
      }
    }
    setBookSettings(settings);
  }, []);

  useEffect(() => { 
    if (activeBookId) {
      fetchEntries(activeBookId); 
      setCoverStyle(localStorage.getItem(`book_${activeBookId}_cover`) || '');
      setBgImage(localStorage.getItem(`book_${activeBookId}_bg`) || '');
      setCoverText(localStorage.getItem(`book_${activeBookId}_coverText`) || '');
      setIsBookOpen(false); // Close book when switching
    }
  }, [activeBookId]);

  const handleSetCoverText = (val) => {
    setCoverText(val);
    if (activeBookId) {
      localStorage.setItem(`book_${activeBookId}_coverText`, val);
    }
  };

  const handleSetCover = (val) => {
    setCoverStyle(val);
    setIsBookOpen(false); // Close book to show the new cover
    if (activeBookId) {
      localStorage.setItem(`book_${activeBookId}_cover`, val);
      setBookSettings(prev => ({ ...prev, [`book_${activeBookId}_cover`]: val }));
    }
  };

  const handleSetBg = (val) => {
    setBgImage(val);
    setIsBookOpen(true); // Open book to show the new background
    if (activeBookId) {
      localStorage.setItem(`book_${activeBookId}_bg`, val);
      setBookSettings(prev => ({ ...prev, [`book_${activeBookId}_bg`]: val }));

      if (val && THEME_TO_COVER_MAP[val]) {
        const suggestedCover = THEME_TO_COVER_MAP[val];
        setCoverStyle(suggestedCover);
        localStorage.setItem(`book_${activeBookId}_cover`, suggestedCover);
        setBookSettings(prev => ({ ...prev, [`book_${activeBookId}_cover`]: suggestedCover }));
      }
    }
  };

  const handleSave = async () => {
    if (!body.trim() || !activeBookId) return;
    setSaving(true);
    try {
      const plainBody = editorRef.current?.innerHTML || body;
      const finalBody = bgImage === '__custom__'
        ? `<div style="background-image:url(${customThemeUrl});background-size:cover;background-position:center;padding:20px;border-radius:8px;">${plainBody}</div>`
        : bgImage && BACKGROUNDS.includes(bgImage)
        ? `<div style="background-image:url('/backgrounds/${encodeURIComponent(bgImage)}');background-size:cover;background-position:center;padding:20px;border-radius:8px;">${plainBody}</div>`
        : bgImage && PAPER_STYLES[bgImage]
        ? `<div style="${Object.entries(PAPER_STYLES[bgImage]).map(([k,v])=>`${k.replace(/([A-Z])/g,'-$1').toLowerCase()}:${v}`).join(';')}; padding: 20px; border-radius: 8px;">${plainBody}</div>`
        : plainBody;

      if (editingEntryId) {
        await updateJournalEntry(editingEntryId, {
          body: finalBody,
          mood_emoji: selectedMood?.emoji || '',
          mood_label: selectedMood?.label || '',
          entry_date: entryDate || todayISO(),
          auto_translate: false,
          book_id: activeBookId,
          allow_loop_detection: allowLoopDetection,
        });
        setEditingEntryId(null);
      } else {
        await createJournalEntry({
          body: finalBody,
          mood_emoji: selectedMood?.emoji || '',
          mood_label: selectedMood?.label || '',
          entry_date: entryDate || todayISO(),
          auto_translate: false,
          book_id: activeBookId,
          allow_loop_detection: allowLoopDetection,
        });
      }
      setBody('');
      if (editorRef.current) editorRef.current.innerHTML = '';
      setMoodLabel('');
      setEntryDate(todayISO());
      await Promise.all([fetchEntries(activeBookId), fetchBooks(activeBookId), fetchStreak()]);
      checkRewards();
    } catch (e) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEditInMain = (entry) => {
    setEditingEntryId(entry.id);
    setBody(entry.body);
    if (editorRef.current) {
      editorRef.current.innerHTML = entry.body;
    }
    setMoodLabel(entry.mood_label || '');
    setEntryDate(entry.entry_date || todayISO());
    editorWrapRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const handleUseTemplate = (html, theme) => {
    setBody(html);
    if (theme) {
      setBgImage(theme);
    }
    if (editorRef.current) {
      editorRef.current.innerHTML = html;
    }
  };

  const renderStickers = (targetPage) => (
    stickers.filter(s => (s.page || 'journal') === targetPage).map(s => {
      const isSelected = selectedSticker === s.id;
      return (
        <div key={s.id} ref={el => stickerNodeRefs.current[s.id] = el} className="sticker-wrap"
          style={{ position: 'absolute', left: s.x, top: s.y, zIndex: isSelected ? 15 : 10, userSelect: 'none', transform: `rotate(${s.rotate || 0}deg)` }}
          onClick={(e) => e.stopPropagation()}
        >
          {isSelected && (
            <div className="sticker-toolbar" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <button onClick={(e) => { e.stopPropagation(); resizeSticker(s.id, -15); }}>−</button>
              <button onClick={(e) => { e.stopPropagation(); resizeSticker(s.id, 15); }}>+</button>
              <span>|</span>
              <button onClick={(e) => { e.stopPropagation(); rotateSticker(s.id, -15); }}>↺</button>
              <button onClick={(e) => { e.stopPropagation(); rotateSticker(s.id, 15); }}>↻</button>
              <span>|</span>
              <button className="remove" onClick={(e) => { e.stopPropagation(); removeSticker(s.id); }}>✕</button>
            </div>
          )}
          <img src={s.src} alt="sticker"
            onMouseDown={(e) => onStickerMouseDown(e, s.id)}
            style={{ width: s.w, height: 'auto', objectFit: 'contain', cursor: 'grab', display: 'block',
              filter: isSelected ? 'drop-shadow(0 0 0 3px var(--accent))' : 'drop-shadow(0 2px 5px rgba(0,0,0,0.15))' }}
          />
        </div>
      );
    })
  );

  const renderTextBlocks = (targetPage) => (
    textBlocks.filter(b => (b.page || 'journal') === targetPage).map(b => {
      const isSel = selectedBlock === b.id;
      return (
        <div key={b.id}
          style={{ position: 'absolute', left: b.x, top: b.y, zIndex: isSel ? 21 : 11, userSelect: 'none', transform: `rotate(${b.rotate || 0}deg)`, cursor: 'move' }}
          onMouseDown={(e) => { setSelectedBlock(b.id); setSelectedSticker(null); onBlockMouseDown(e, b.id); }}
        >
          {isSel && (
            <div onMouseDown={(e) => e.stopPropagation()}
              style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(20,20,24,0.92)', borderRadius: 8, padding: '4px 6px', whiteSpace: 'nowrap', zIndex: 22, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
              <select value={b.fontFamily} onChange={(e) => updateTextBlock(b.id, { fontFamily: e.target.value })}
                style={{ fontSize: 11, fontFamily: b.fontFamily, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4, padding: '3px 4px', maxWidth: 100, cursor: 'pointer' }}>
                {FONT_OPTIONS.map(f => <option key={f.value} value={f.value} style={{ color: '#111' }}>{f.label}</option>)}
              </select>
              <button onMouseDown={(e) => { e.stopPropagation(); updateTextBlock(b.id, { fontSize: Math.max(8, (b.fontSize || 18) - 2) }); }}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, padding: '0 3px' }}>A−</button>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, minWidth: 16, textAlign: 'center' }}>{b.fontSize || 18}</span>
              <button onMouseDown={(e) => { e.stopPropagation(); updateTextBlock(b.id, { fontSize: Math.min(96, (b.fontSize || 18) + 2) }); }}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 15, padding: '0 3px' }}>A+</button>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, padding: '0 2px' }}>|</span>
              <button onMouseDown={(e) => { e.stopPropagation(); updateTextBlock(b.id, { bold: !b.bold }); }}
                style={{ background: b.bold ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 'bold', padding: '2px 6px' }}>B</button>
              <button onMouseDown={(e) => { e.stopPropagation(); updateTextBlock(b.id, { italic: !b.italic }); }}
                style={{ background: b.italic ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 13, fontStyle: 'italic', padding: '2px 6px' }}>I</button>
              <button onMouseDown={(e) => { e.stopPropagation(); updateTextBlock(b.id, { underline: !b.underline }); }}
                style={{ background: b.underline ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 13, textDecoration: 'underline', padding: '2px 6px' }}>U</button>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0 2px' }}>
                <input type="color" value={b.color || '#000000'} onChange={(e) => updateTextBlock(b.id, { color: e.target.value })}
                  style={{ width: 18, height: 18, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }} />
              </label>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, padding: '0 2px' }}>|</span>
              {['left', 'center', 'right'].map(a => (
                <button key={a} onMouseDown={(e) => { e.stopPropagation(); updateTextBlock(b.id, { align: a }); }}
                  style={{ background: b.align === a ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 10, padding: '2px 5px' }}>
                  {a === 'left' ? '⬛▭▭' : a === 'center' ? '▭⬛▭' : '▭▭⬛'}
                </button>
              ))}
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, padding: '0 2px' }}>|</span>
              <button onMouseDown={(e) => { e.stopPropagation(); updateTextBlock(b.id, { rotate: (b.rotate || 0) - 15 }); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>↺</button>
              <button onMouseDown={(e) => { e.stopPropagation(); updateTextBlock(b.id, { rotate: (b.rotate || 0) + 15 }); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>↻</button>
              <button onMouseDown={(e) => { e.stopPropagation(); duplicateTextBlock(b.id); }} title="Duplicate" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, padding: '0 4px' }}>⧉</button>
              <button onMouseDown={(e) => { e.stopPropagation(); removeTextBlock(b.id); }} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
            </div>
          )}
          <textarea
            defaultValue={b.text}
            onBlur={(e) => updateTextBlock(b.id, { text: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(255,255,255,0.85)',
              border: isSel ? '1.5px dashed var(--accent)' : '1.5px dashed rgba(0,0,0,0.2)',
              borderRadius: 6, padding: '6px 10px',
              fontSize: b.fontSize || 18,
              fontFamily: b.fontFamily || FONT_OPTIONS[0].value,
              fontWeight: b.bold ? 'bold' : 'normal',
              fontStyle: b.italic ? 'italic' : 'normal',
              textDecoration: b.underline ? 'underline' : 'none',
              textAlign: b.align || 'left',
              color: b.color || '#000000',
              resize: 'both', minWidth: 100, minHeight: 36, outline: 'none', cursor: 'text',
              boxShadow: isSel ? '0 2px 10px rgba(0,0,0,0.15)' : 'none',
            }}
          />
        </div>
      );
    })
  );

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
        <div className="nm-journal">
          {/* Bookshelf */}
          <aside className="nm-journal-shelf" data-tour="journal-shelf">

          <div data-tour="journal-streak">
          <StreakBlock streak={streak} />
          </div>

          <div className="nm-card">
            <div className="nm-journal-shelf-list" style={{ marginTop: 8 }}>
              {loadingBooks && <div className="nm-meta" style={{ padding: 14 }}>Loading…</div>}
              {!loadingBooks && books.map((b) => (
                <BookRow
                  key={b.id}
                  book={b}
                  active={b.id === activeBookId}
                  cover={bookSettings[`book_${b.id}_cover`]}
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

                </>
              )}
            </div>
          </div>
        </aside>

        {/* Main pane */}
        <main className="nm-journal-main">
          <div className="nm-journal-inner">
            <div className="nm-journal-welcome">
              <div className="nm-journal-welcome-text">
                <h3>Welcome back, {displayName}!</h3>
                <p>Your daily journal is a space for clarity,<br></br> growth and self reflection.</p>
              </div>

            </div>

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
                <div className="nm-compose" data-tour="journal-compose">
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
                    <div style={{ borderBottom: '1px solid var(--rule)' }}>
                      <div className="nm-toolbar-row">
                        {/* Font group (Always visible) */}
                        <div className="nm-toolbar-group">
                          <span className="nm-toolbar-label">Font</span>
                          <select onMouseDown={(e) => e.stopPropagation()}
                            onChange={(e) => applyCommand('fontName', e.target.value)}
                            value={activeFont}
                            style={{ fontSize: 11, fontFamily: activeFont || 'var(--font-mono)', border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 4, padding: '3px 4px', cursor: 'pointer', maxWidth: 130 }}>
                            <option value="" disabled>Typeface</option>
                            {FONT_OPTIONS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value, fontSize: 14 }}>{f.label}</option>)}
                          </select>
                          <select onMouseDown={(e) => e.stopPropagation()}
                            onChange={(e) => { applyCommand('fontSize', e.target.value); e.target.value = ''; }}
                            defaultValue=""
                            style={{ fontSize: 11, fontFamily: 'var(--font-mono)', border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)', borderRadius: 4, padding: '3px 4px', cursor: 'pointer' }}>
                            <option value="" disabled>Size</option>
                            <option value="1">Small</option>
                            <option value="3">Normal</option>
                            <option value="5">Large</option>
                            <option value="7">Huge</option>
                          </select>
                        </div>

                        {/* Style group (Always visible) */}
                        <div className="nm-toolbar-group">
                          <span className="nm-toolbar-label">Style</span>
                          {[
                            { cmd: 'bold', label: <b>B</b> },
                            { cmd: 'italic', label: <i>I</i> },
                            { cmd: 'underline', label: <u>U</u> },
                            { cmd: 'strikeThrough', label: <s>S</s> },
                          ].map(({ cmd, label }) => (
                            <button key={cmd} type="button" onMouseDown={(e) => { e.preventDefault(); applyCommand(cmd); }}
                              className="nm-btn ghost"
                              style={{ padding: '2px 7px', fontSize: 13, minWidth: 28 }}>
                              {label}
                            </button>
                          ))}
                          <label title="Text color" style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '2px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-mono)', border: '1px solid var(--rule)', background: 'var(--surface)' }}>
                            <span style={{ borderBottom: `3px solid ${textColor}`, lineHeight: 1.1 }}>A</span>
                            <input type="color" value={textColor} style={{ width: 16, height: 16, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                              onMouseDown={() => { trackSelection(); }}
                              onChange={(e) => { setTextColor(e.target.value); applyCommand('foreColor', e.target.value); }} />
                          </label>
                          <label title="Highlight" style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '2px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-mono)', border: '1px solid var(--rule)', background: hlColor }}>
                            <span style={{ color: '#333', mixBlendMode: 'multiply' }}>H</span>
                            <input type="color" value={hlColor} style={{ width: 16, height: 16, border: 'none', padding: 0, cursor: 'pointer', background: 'none' }}
                              onMouseDown={() => { trackSelection(); }}
                              onChange={(e) => { setHlColor(e.target.value); applyCommand('backColor', e.target.value); }} />
                          </label>
                        </div>

                        {/* Layout Dropdown */}
                        <div className="nm-toolbar-group nm-dropdown-group" style={{ position: 'relative' }}>
                          <button type="button" className="nm-btn ghost" onClick={() => setActiveMenu(activeMenu === 'layout' ? null : 'layout')} style={{ padding: '2px 7px', fontSize: 13 }}>
                            Layout ▼
                          </button>
                          {activeMenu === 'layout' && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 6, padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '4px' }}>
                              {[
                                { cmd: 'justifyLeft', label: '⬛▭▭ Align Left' },
                                { cmd: 'justifyCenter', label: '▭⬛▭ Align Center' },
                                { cmd: 'justifyRight', label: '▭▭⬛ Align Right' },
                              ].map(({ cmd, label }) => (
                                <button key={cmd} type="button" onMouseDown={(e) => { e.preventDefault(); applyCommand(cmd); setActiveMenu(null); }}
                                  className="nm-btn ghost" style={{ padding: '6px', fontSize: 12, textAlign: 'left', width: '100%' }}>
                                  {label}
                                </button>
                              ))}
                              <div style={{ height: '1px', background: 'var(--rule)', margin: '2px 0' }} />
                              <button type="button" onMouseDown={(e) => { e.preventDefault(); applyCommand('insertUnorderedList'); setActiveMenu(null); }}
                                className="nm-btn ghost" style={{ padding: '6px', fontSize: 12, textAlign: 'left', width: '100%' }}>≡ Bullets</button>
                              <button type="button" onMouseDown={(e) => { e.preventDefault(); applyCommand('insertOrderedList'); setActiveMenu(null); }}
                                className="nm-btn ghost" style={{ padding: '6px', fontSize: 12, textAlign: 'left', width: '100%' }}># Numbers</button>
                            </div>
                          )}
                        </div>

                        {/* Insert Dropdown */}
                        <div className="nm-toolbar-group nm-dropdown-group" style={{ position: 'relative' }}>
                          <button type="button" className="nm-btn ghost" onClick={() => setActiveMenu(activeMenu === 'insert' ? null : 'insert')} style={{ padding: '2px 7px', fontSize: 13 }}>
                            Insert ▼
                          </button>
                          {activeMenu === 'insert' && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 6, padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '4px' }}>
                              <button type="button" className="nm-btn ghost" style={{ padding: '6px', fontSize: 12, textAlign: 'left', width: '100%' }} onClick={() => { setShowTemplateModal(true); setActiveMenu(null); }}>
                                📄 Templates
                              </button>
                              <button type="button" className="nm-btn ghost" style={{ padding: '6px', fontSize: 12, textAlign: 'left', width: '100%' }} onClick={() => { addTextBlock(); setActiveMenu(null); }}>
                                ✚ Text box
                              </button>
                              <button type="button" className="nm-btn ghost" style={{ padding: '6px', fontSize: 12, textAlign: 'left', width: '100%' }} onClick={() => { setShowStickerPanel(p => !p); setActiveMenu(null); }}>
                                🎀 Stickers
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Page Setup Dropdown */}
                        <div className="nm-toolbar-group nm-dropdown-group" style={{ position: 'relative' }}>
                          <button type="button" className="nm-btn ghost" onClick={() => setActiveMenu(activeMenu === 'page' ? null : 'page')} style={{ padding: '2px 7px', fontSize: 13 }}>
                            Page Setup ▼
                          </button>
                          {activeMenu === 'page' && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px', display: 'flex', gap: '20px', minWidth: '450px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: '4px' }}>
                              
                              <div style={{ flex: 1 }}>
                                <div className="nm-meta" style={{ marginBottom: 12, fontWeight: 'bold' }}>📔 Notebook Cover</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                                  <button onClick={() => { handleSetCover(''); setActiveMenu(null); }} style={{ height: 60, border: coverStyle === '' ? '2px solid var(--accent)' : '1px solid var(--rule)', borderRadius: 4, background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, cursor: 'pointer' }}>None</button>
                                  {COVERS.map(c => (
                                    <img key={c} src={`/covers/${encodeURIComponent(c)}`} alt={c} onClick={() => { handleSetCover(c); setActiveMenu(null); }}
                                      style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: coverStyle === c ? '2px solid var(--accent)' : '1px solid var(--rule)' }} />
                                  ))}
                                </div>
                              </div>

                              <div style={{ flex: 1 }}>
                                <div className="nm-meta" style={{ marginBottom: 12, fontWeight: 'bold' }}>🎨 Page Background</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                                  <button onClick={() => { handleSetBg(''); setActiveMenu(null); }} style={{ height: 60, border: bgImage === '' ? '2px solid var(--accent)' : '1px solid var(--rule)', borderRadius: 4, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, cursor: 'pointer' }}>None</button>
                                  {BACKGROUNDS.map(b => (
                                    <img key={b} src={`/backgrounds/${encodeURIComponent(b)}`} alt={b} onClick={() => { handleSetBg(b); setActiveMenu(null); }}
                                      style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: bgImage === b ? '2px solid var(--accent)' : '1px solid var(--rule)' }} />
                                  ))}
                                </div>
                              </div>

                            </div>
                          )}
                        </div>

                        {/* Zoom Dropdown */}
                        <div className="nm-toolbar-group nm-dropdown-group" style={{ position: 'relative', marginLeft: 'auto' }}>
                          <button type="button" className="nm-btn ghost" onClick={() => setActiveMenu(activeMenu === 'zoom' ? null : 'zoom')} style={{ padding: '2px 7px', fontSize: 13 }}>
                            🔍 {Math.round(zoom * 100)}% ▼
                          </button>
                          {activeMenu === 'zoom' && (
                            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 6, padding: '6px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '150px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '4px' }}>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button type="button" title="Zoom out" onClick={() => nudgeZoom(-0.1)}
                                  className="nm-btn ghost" style={{ padding: '4px 10px', fontSize: 14, flex: 1 }}>−</button>
                                <button type="button" title="Zoom in" onClick={() => nudgeZoom(0.1)}
                                  className="nm-btn ghost" style={{ padding: '4px 10px', fontSize: 14, flex: 1 }}>+</button>
                              </div>
                              <select
                                onMouseDown={(e) => e.stopPropagation()}
                                value={typeof zoomMode === 'number' ? String(zoomMode) : zoomMode}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setZoomMode(v === 'fit-width' || v === 'fit-page' ? v : Number(v));
                                  setActiveMenu(null);
                                }}
                                style={{ fontSize: 12, fontFamily: 'var(--font-mono)', border: '1px solid var(--rule)', background: 'var(--surface-2)', color: 'var(--ink)', borderRadius: 4, padding: '4px 6px', cursor: 'pointer', width: '100%' }}>
                                {!ZOOM_PRESETS.includes(Math.round(zoom * 100) / 100) && typeof zoomMode === 'number' && (
                                  <option value={String(zoomMode)}>{Math.round(zoom * 100)}%</option>
                                )}
                                {ZOOM_PRESETS.map((p) => (
                                  <option key={p} value={String(p)}>{Math.round(p * 100)}%</option>
                                ))}
                                <option value="fit-width">Fit width</option>
                                <option value="fit-page">Fit page</option>
                              </select>
                            </div>
                          )}
                        </div>

                        <button type="button" title="Download this entry as a PDF" onClick={handleDownloadPdf}
                          className="nm-btn primary" style={{ padding: '5px 12px', fontSize: 13, borderRadius: '16px', marginLeft: 8 }}>
                          <Icon name="download" size={13} style={{ marginRight: 6 }} /> Download PDF
                        </button>
                      </div>
                    </div>
                    {/* Sticker picker panel */}
                    {showStickerPanel && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--rule)', background: 'var(--surface-2)' }}>
                        {STICKERS.map((src, i) => (
                          <img key={i} src={src} alt="sticker" onClick={() => addSticker(src)}
                            style={{ width: 60, height: 60, objectFit: 'contain', cursor: 'pointer', outline: '2px solid transparent', outlineOffset: 2, borderRadius: 6, transition: 'outline-color 0.15s' }}
                            onMouseEnter={e => e.target.style.outlineColor = 'var(--accent)'}
                            onMouseLeave={e => e.target.style.outlineColor = 'transparent'}
                          />
                        ))}
                      </div>
                    )}
                    {/* A4 page viewport — scrolls both axes so the fixed-size page stays
                        at true proportions no matter the zoom level, like Google Docs. */}
                    <div ref={pageViewportRef} className="nm-page-viewport" style={{
                      overflow: 'auto',
                      maxHeight: '75vh',
                      background: 'var(--surface-2)',
                      padding: '24px 0',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'flex-start' // Changed from center to prevent top truncation when container is taller than screen
                    }}>
                      {/* Sizing slot reserves the zoomed footprint so scrollbars/centering are correct */}
                      <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}>
                        <div ref={printContainerRef} className="nm-perspective-container" style={{ perspective: '2500px', position: 'relative', width: A4_WIDTH, height: A4_HEIGHT }}>
                          
                          {/* Cover Page (Front/Hinged) - Placed first in DOM for PDF stacking */}
                          {coverStyle && (
                            <div 
                              className="nm-cover-page" 
                              onClick={() => { setSelectedSticker(null); setSelectedBlock(null); }}
                              style={{ 
                                position: 'absolute', inset: 0,
                                backgroundImage: `url('/covers/${encodeURIComponent(coverStyle)}')`, 
                                backgroundSize: 'cover', backgroundPosition: 'center', 
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                                color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                                transformOrigin: 'left center',
                                transform: isBookOpen ? 'rotateY(-90deg)' : 'rotateY(0deg)',
                                opacity: isBookOpen ? 0 : 1,
                                visibility: isBookOpen ? 'hidden' : 'visible',
                                transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                                zIndex: 2,
                                transformStyle: 'preserve-3d',
                                cursor: isBookOpen ? 'default' : 'pointer',
                                borderRadius: 4,
                                boxShadow: isBookOpen ? '-10px 0px 30px rgba(0,0,0,0.2)' : '5px 0px 15px rgba(0,0,0,0.3)',
                                pointerEvents: isBookOpen ? 'none' : 'auto'
                              }}
                            >
                              <div className="nm-backface" style={{
                                position: 'absolute', inset: 0, background: '#f5ebd9', 
                                transform: 'rotateY(180deg)', backfaceVisibility: 'hidden',
                                boxShadow: 'inset 20px 0 30px rgba(0,0,0,0.1)',
                                borderRadius: 4
                              }} />
                              
                              <div style={{ 
                                backfaceVisibility: 'hidden', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255, 255, 255, 0.85)',
                                backdropFilter: 'blur(8px)',
                                padding: '30px 40px',
                                borderRadius: '12px',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(255,255,255,0.5)',
                                maxWidth: '75%',
                                textAlign: 'center',
                                border: '2px solid rgba(0,0,0,0.1)'
                              }}>
                                <textarea
                                  value={coverText || activeBook?.name || ''}
                                  onChange={(e) => handleSetCoverText(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Journal Title"
                                  rows={2}
                                  style={{ 
                                    fontFamily: 'var(--font-serif)', 
                                    fontSize: 42, 
                                    marginBottom: 16,
                                    color: '#222',
                                    textShadow: 'none',
                                    background: 'transparent',
                                    border: '1px dashed transparent',
                                    outline: 'none',
                                    textAlign: 'center',
                                    resize: 'none',
                                    width: '100%',
                                    minWidth: '300px',
                                    fontWeight: 'bold'
                                  }}
                                  onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.2)'}
                                  onBlur={(e) => e.currentTarget.style.borderColor = 'transparent'}
                                />
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#666', textShadow: 'none' }}>
                                  kept since {new Date(activeBook?.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              {renderStickers('cover')}
                              {renderTextBlocks('cover')}
                            </div>
                          )}

                          {/* Journal Page */}
                          <div ref={editorWrapRef} className="nm-journal-page" style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            borderRadius: 4,
                            boxShadow: '0 10px 30px rgba(0,0,0,0.15), 0 1px 0 rgba(0,0,0,0.04)',
                            transform: isBookOpen ? 'rotateY(0deg)' : 'rotateY(0deg)',
                            zIndex: 1
                          }} onClick={(e) => { if (e.target === editorWrapRef.current) setSelectedSticker(null); }}>
                            
                            <div className="nm-page-content"
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              overflow: 'hidden',
                              backgroundColor: bgImage ? undefined : '#e5d7fd80',
                              ...(bgImage === '__custom__'
                                ? { backgroundImage: `url(${customThemeUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
                                : bgImage ? (BACKGROUNDS.includes(bgImage) ? { backgroundImage: `url('/backgrounds/${encodeURIComponent(bgImage)}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : (PAPER_STYLES[bgImage] || {})) : {})
                            }}>

                            {/* NexMate Watermark */}
                            <div style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%) rotate(-45deg)',
                              fontSize: '140px',
                              fontFamily: 'var(--font-serif)',
                              color: 'rgba(128,128,128,0.15)', /* More visible on varying themes */
                              mixBlendMode: 'multiply',
                              pointerEvents: 'none',
                              userSelect: 'none',
                              zIndex: 0,
                              whiteSpace: 'nowrap',
                              fontWeight: 'bold'
                            }}>
                              NexMate
                            </div>

                            {/* Date Header (in document flow) */}
                            <div style={{
                              padding: '24px 36px 0',
                              textAlign: 'right',
                              fontFamily: 'var(--font-serif)',
                              fontSize: 13,
                              pointerEvents: 'none',
                              userSelect: 'none',
                              fontStyle: 'italic',
                              zIndex: 1,
                              position: 'relative'
                            }}>
                              <span style={{
                                background: 'rgba(255, 255, 255, 0.7)',
                                backdropFilter: 'blur(4px)',
                                padding: '4px 10px',
                                borderRadius: '12px',
                                color: '#333',
                                display: 'inline-block',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                              }}>
                                {new Date(entryDate).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            {renderStickers('journal')}
                            {/* The actual journal editor area */}
                            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }} onClick={() => { setSelectedSticker(null); setSelectedBlock(null); }}>
                              <div
                              ref={editorRef}
                              contentEditable
                              suppressContentEditableWarning
                              onInput={(e) => setBody(e.currentTarget.innerHTML)}
                              onPaste={(e) => {
                                e.preventDefault();
                                const text = e.clipboardData.getData('text/plain');
                                document.execCommand('insertText', false, text);
                              }}
                              onMouseUp={trackSelection}
                              onKeyUp={trackSelection}
                              data-placeholder={`Today, in your ${activeBook.name.toLowerCase()} book…`}
                              style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '36px 36px 28px', // Increased top padding so cursor is clearly visible
                                fontFamily: 'var(--font-serif)',
                                fontSize: 16,
                                lineHeight: '28px',
                                color: 'var(--ink)',
                                outline: 'none',
                                background: 'transparent',
                                borderRadius: 0,
                                position: 'relative',
                                zIndex: 1
                              }}
                            ></div>
                            {renderTextBlocks('journal')}
                          </div>
                      {/* Custom background image URL input */}
                      {bgImage === '__custom__' && (
                        <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 10 }}>
                          <input ref={customThemeInputRef} type="text" placeholder="Paste image URL here…" value={customThemeUrl} onChange={(e) => setCustomThemeUrl(e.target.value)}
                            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 20, border: '1px solid var(--rule-soft)', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)', width: 220, outline: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        </div>
                      )}
                      </div>
                      </div>
                      </div>

                      </div>

                      {/* Page Navigation Arrows */}
                      {isBookOpen ? (
                        <button onClick={(e) => { e.stopPropagation(); setIsBookOpen(false); }} title="Close to Cover" style={{ position: 'absolute', left: -60, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.8)', border: 'none', borderRadius: '50%', width: 48, height: 48, fontSize: 20, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
                          ◀
                        </button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setIsBookOpen(true); }} title="Open Journal" style={{ position: 'absolute', right: -60, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.8)', border: 'none', borderRadius: '50%', width: 48, height: 48, fontSize: 20, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
                          ▶
                        </button>
                      )}

                    </div>
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
                      {saving ? 'Keeping…' : editingEntryId ? 'Update Entry' : `Keep in ${activeBook.name}`}
                    </button>
                    {editingEntryId && (
                      <button
                        type="button"
                        className="nm-btn ghost"
                        onClick={() => {
                          setEditingEntryId(null);
                          setBody('');
                          if (editorRef.current) editorRef.current.innerHTML = '';
                        }}
                      >
                        Cancel Edit
                      </button>
                    )}
                    <span className="nm-meta">
                      {body.length > 0 ? `${body.length} chars` : ''}
                    </span>
                  </div>

                  {error && (
                    <div className="nm-meta" style={{ color: 'var(--accent)', marginTop: 14 }}>{error}</div>
                  )}
                </div>

                {/* Past entries */}
                <div data-tour="journal-entries">
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

                    <div style={{ maxHeight: 340, overflowY: 'auto', paddingRight: 4, border: '1px solid var(--rule-soft)', borderRadius: 8 }}>
                      {entriesByDate.map(([date, items], i) => {
                        const k = dayKindLabel(date);
                        return (
                          <DayAccordion
                            key={date}
                            k={k}
                            items={items}
                            handleDeleteEntry={handleDeleteEntry}
                            handleEditInMain={handleEditInMain}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
                </div>
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