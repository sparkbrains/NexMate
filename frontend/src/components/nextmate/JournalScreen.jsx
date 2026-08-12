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
  updateJournalBook,
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
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

function parseAsDate(dateInput) {
  if (!dateInput) return new Date();
  if (typeof dateInput === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateInput) && !dateInput.endsWith('Z') && !dateInput.includes('+')) {
      const d = new Date(dateInput + 'Z');
      if (!isNaN(d.getTime())) return d;
    }
  }
  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? new Date() : d;
}

function formatIndiaTime(dateInput) {
  const d = parseAsDate(dateInput);
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatIndiaDate(dateInput) {
  const d = parseAsDate(dateInput);
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

const moodFor = (label) => MOODS.find((m) => m.label === label);

function cleanEntryBodyHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let cleaned = html.replace(/<div style="[^"]*(?:background|border-radius|padding:\s*20px)[^"]*">([\s\S]*)<\/div>/gi, '$1');
  cleaned = cleaned.replace(/background(?:-image)?:\s*url\([^)]+\);?/gi, '');
  cleaned = cleaned.replace(/background(?:-color)?:\s*(?!rgba\(0,\s*0,\s*0,\s*0\))[^;"]+;?/gi, '');
  return cleaned.trim() || html;
}

function getSafeEntryBgCss(bgStr, fallbackBgStr, customUrlStr) {
  const bg = bgStr || fallbackBgStr || '';
  try {
    if (bg === '__custom__' && customUrlStr) {
      return `background-image: url('${customUrlStr}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
    }
    if (bg && BACKGROUNDS.includes(bg)) {
      return `background-image: url('/backgrounds/${encodeURIComponent(bg)}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
    }
    if (bg && PAPER_STYLES[bg]) {
      return Object.entries(PAPER_STYLES[bg])
        .filter(([k]) => !k.toLowerCase().includes('backgroundimage') && !k.toLowerCase().includes('background-image'))
        .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
        .join('; ');
    }
    if (bg && (bg.startsWith('http://') || bg.startsWith('https://') || bg.startsWith('data:') || bg.startsWith('blob:'))) {
      return `background-image: url('${bg}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
    }
  } catch {
    /* non-blocking fallback */
  }
  return 'background-color: #ffffff;';
}

function getEntryBgStyle(bgStr, fallbackBgStr, customUrlStr) {
  const css = getSafeEntryBgCss(bgStr, fallbackBgStr, customUrlStr);
  const styleObj = {};
  css.split(';').forEach(rule => {
    const [k, v] = rule.split(':').map(s => s?.trim());
    if (k && v) {
      const camelK = k.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      styleObj[camelK] = v;
    }
  });
  return styleObj;
}

const Entry = ({ entry, onDelete, onEditInMain, activeBg, customUrl }) => {
  const [confirming, setConfirming] = useState(false);
  const time = formatIndiaTime(entry.created_at || entry.entry_date);
  const bgStyle = getEntryBgStyle(entry.bg_image, activeBg, customUrl);
  const emoji = entry.mood_emoji || '✨';
  const moodText = entry.mood_label || '';

  return (
    <div className="nm-entry" style={{
      display: 'grid',
      gridTemplateColumns: '75px 1fr',
      gap: 0,
      borderRadius: 8,
      overflow: 'hidden',
      margin: '12px 0',
      border: '1px solid var(--rule-soft)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      background: 'var(--surface)'
    }}>
      {/* 1. Left Emoji / Mood Column — Clean surface background, NO background image */}
      <div className="nm-entry-mark" style={{
        background: 'var(--surface)',
        textAlign: 'center',
        padding: '14px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        borderRight: '1px solid var(--rule-soft)',
        zIndex: 2
      }}>
        <div className="nm-entry-emoji" style={{ fontSize: 26, lineHeight: 1 }}>{emoji}</div>
        {moodText && (
          <div className="nm-entry-mood" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: 6 }}>
            {moodText}
          </div>
        )}
      </div>

      {/* 2. Right Written Area Column — HAS the journal background image! */}
      <div style={{
        ...bgStyle,
        padding: '14px 16px',
        minWidth: 0
      }}>
        <div className="nm-entry-time" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)', fontWeight: '600', whiteSpace: 'nowrap' }}>{time}</span>
          <span className="nm-entry-del" style={{ display: 'inline-flex', gap: 4, whiteSpace: 'nowrap' }}>
            <button className="nm-btn ghost" title="Edit entry" style={{ padding: '2px 6px' }} onClick={() => onEditInMain(entry)}>
              <Icon name="edit" size={11} />
            </button>
            <button className="nm-btn ghost" title="Delete entry" style={{ padding: '2px 6px' }} onClick={() => setConfirming(true)}>
              <Icon name="trash" size={11} />
            </button>
          </span>
        </div>
        <div className="nm-entry-body" dangerouslySetInnerHTML={{ __html: cleanEntryBodyHtml(entry.body) }} />
        {entry.translated && (
          <div className="nm-meta" style={{ marginTop: 8, fontStyle: 'italic', color: 'var(--ink-3)' }}>{entry.translated}</div>
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

const DayAccordion = ({ k, items, handleDeleteEntry, handleEditInMain, activeBg, customUrl }) => {
  const [open, setOpen] = useState(true);
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
            <Entry key={e.id} entry={e} onDelete={handleDeleteEntry} onEditInMain={handleEditInMain} activeBg={activeBg} customUrl={customUrl} />
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
  const [coverSubtitle, setCoverSubtitle] = useState('');
  const [coverBoxWidth, setCoverBoxWidth] = useState(75);
  const coverBoxSize = coverBoxWidth;
  const [coverBoxX, setCoverBoxX] = useState(null); // null = use flex alignment
  const [coverBoxY, setCoverBoxY] = useState(null);
  const coverBoxDragRef = useRef(null);
  const [coverBoxSelected, setCoverBoxSelected] = useState(false);
  const [coverBoxAlignH, setCoverBoxAlignH] = useState('center'); // 'flex-start' | 'center' | 'flex-end'
  const [coverBoxAlignV, setCoverBoxAlignV] = useState('center'); // 'flex-start' | 'center' | 'flex-end'
  const [coverBoxOpacity, setCoverBoxOpacity] = useState(85); // 0..100
  const [showPdfMenu, setShowPdfMenu] = useState(false);
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

  const getPageBgCss = () => {
    if (bgImage === '__custom__' && customThemeUrl) {
      return `background-image: url('${customThemeUrl}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
    }
    if (bgImage && BACKGROUNDS.includes(bgImage)) {
      return `background-image: url('/backgrounds/${encodeURIComponent(bgImage)}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
    }
    if (bgImage && PAPER_STYLES[bgImage]) {
      return Object.entries(PAPER_STYLES[bgImage])
        .filter(([k]) => !k.toLowerCase().includes('backgroundimage') && !k.toLowerCase().includes('background-image'))
        .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
        .join('; ');
    }
    return 'background-color: #ffffff;';
  };

  const handleDownloadPdf = (fullBook = false) => {
    setSelectedSticker(null);
    setSelectedBlock(null);
    setShowPdfMenu(false);
    requestAnimationFrame(() => {
      const el = printContainerRef.current;
      if (!el) return;

      const printWrapper = document.createElement('div');
      printWrapper.id = 'nm-print-wrapper';
      const bgCss = getPageBgCss();

      if (!fullBook) {
        // Single Entry & Cover Print
        const clone = el.cloneNode(true);
        clone.classList.add('print-target-clone');

        const coverClone = clone.querySelector('.nm-cover-page');
        if (coverClone) {
          coverClone.style.opacity = '1';
          coverClone.style.visibility = 'visible';
          coverClone.style.transform = 'none';
          coverClone.style.pointerEvents = 'auto';
          const backfaceDiv = coverClone.querySelector('.nm-backface');
          if (backfaceDiv) backfaceDiv.remove();
          coverClone.querySelectorAll('textarea, input').forEach(input => {
            input.style.border = 'none';
            input.style.outline = 'none';
            input.style.boxShadow = 'none';
          });
        }

        const journalPageClone = clone.querySelector('.nm-journal-page');
        if (journalPageClone) {
          journalPageClone.style.opacity = '1';
          journalPageClone.style.visibility = 'visible';
          journalPageClone.style.transform = 'none';
        }

        printWrapper.appendChild(clone);
      } else {
        // Complete Book (All Entries) Multi-Page Print
        const bookContainer = document.createElement('div');
        bookContainer.classList.add('print-target-clone');

        // 1. Cover Page
        const coverClone = el.querySelector('.nm-cover-page')?.cloneNode(true);
        if (coverClone) {
          coverClone.style.opacity = '1';
          coverClone.style.visibility = 'visible';
          coverClone.style.transform = 'none';
          coverClone.style.pointerEvents = 'auto';
          const backfaceDiv = coverClone.querySelector('.nm-backface');
          if (backfaceDiv) backfaceDiv.remove();
          coverClone.querySelectorAll('textarea, input').forEach(input => {
            input.style.border = 'none';
            input.style.outline = 'none';
            input.style.boxShadow = 'none';
          });
          bookContainer.appendChild(coverClone);
        }

        // 2. All Book Entries in Chronological Order
        const sortedEntries = [...entries].sort((a, b) => 
          new Date(a.entry_date || a.created_at) - new Date(b.entry_date || b.created_at)
        );

        if (sortedEntries.length === 0) {
          const emptyPage = document.createElement('div');
          emptyPage.className = 'nm-journal-page-print';
          emptyPage.style.cssText = `
            position: relative; width: 210mm; height: 296mm; padding: 24mm 20mm;
            box-sizing: border-box; display: flex; flex-direction: column;
            justify-content: space-between; font-family: var(--font-sans, system-ui, sans-serif);
            color: #111111; page-break-after: always; break-after: page; overflow: hidden;
            ${bgCss}
          `;
          emptyPage.innerHTML = `
            <div>
              <div style="border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 24px; font-family: var(--font-serif); font-size: 16pt; font-weight: bold; text-align: center;">
                ${activeBook?.name || coverText || 'Journal'}
              </div>
              <p style="color: #666; font-style: italic; font-size: 12pt; text-align: center;">No saved journal entries in this book yet.</p>
            </div>
            <div style="text-align: center; border-top: 1px solid #eee; padding-top: 8px; font-size: 9pt; color: #888; font-family: var(--font-mono);">
              NexMate Personal Journal
            </div>
          `;
          bookContainer.appendChild(emptyPage);
        } else {
          sortedEntries.forEach((entry, idx) => {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'nm-journal-page-print';
            const entryBgCss = getSafeEntryBgCss(entry.bg_image, bgImage, customThemeUrl);
            pageDiv.style.cssText = `
              position: relative; width: 210mm; height: 296mm; padding: 24mm 20mm;
              box-sizing: border-box; display: flex; flex-direction: column;
              justify-content: space-between; font-family: var(--font-sans, system-ui, sans-serif);
              color: #111111; page-break-after: always; break-after: page; overflow: hidden;
              ${entryBgCss}
            `;

            const dateStr = formatIndiaDate(entry.created_at || entry.entry_date);
            const timeStr = formatIndiaTime(entry.created_at || entry.entry_date);

            pageDiv.innerHTML = `
              <div>
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; background: rgba(255, 255, 255, 0.94); backdrop-filter: blur(6px); border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 12px; padding: 10px 18px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center;">
                  <div style="font-family: var(--font-serif); font-size: 15pt; font-weight: bold; color: #111;">
                    ${activeBook?.name || coverText || 'Journal'}
                  </div>
                  <div style="display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px; font-size: 10pt; color: #333; font-family: var(--font-sans, system-ui, sans-serif); font-weight: 500;">
                    <span>Entry #${idx + 1} — ${dateStr} at ${timeStr}</span>
                    ${entry.mood_label ? `
                      <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(0, 0, 0, 0.06); padding: 2px 10px; border-radius: 12px; font-weight: 600; color: #222;">
                        <span style="color: #666; font-size: 9pt;">mood:</span>
                        <span>${entry.mood_emoji || '✨'}</span>
                        <span style="text-transform: lowercase;">${entry.mood_label}</span>
                      </span>
                    ` : ''}
                  </div>
                </div>
                <div style="font-size: 12pt; line-height: 1.6; color: #222; margin-top: 12px; word-break: break-word;">
                  ${cleanEntryBodyHtml(entry.body) || '<p style="color:#888; font-style:italic;">Empty entry.</p>'}
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(0,0,0,0.12); padding-top: 8px; font-size: 9pt; color: #555; font-family: var(--font-mono);">
                <span>NexMate Personal Journal</span>
                <span>Page ${idx + 1} of ${sortedEntries.length}</span>
              </div>
            `;
            bookContainer.appendChild(pageDiv);
          });
        }
        printWrapper.appendChild(bookContainer);
      }

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
      const savedCoverText = localStorage.getItem(`book_${activeBookId}_coverText`);
      setCoverText(savedCoverText !== null && savedCoverText !== undefined ? savedCoverText : (activeBook?.name || ''));
      const savedBoxX = localStorage.getItem(`book_${activeBookId}_boxX`);
      const savedBoxY = localStorage.getItem(`book_${activeBookId}_boxY`);
      setCoverBoxX(savedBoxX !== null ? Number(savedBoxX) : null);
      setCoverBoxY(savedBoxY !== null ? Number(savedBoxY) : null);

      const savedSub = localStorage.getItem(`book_${activeBookId}_coverSubtitle`);
      const defaultSub = activeBook?.created_at
        ? `kept since ${new Date(activeBook.created_at).toLocaleDateString()}`
        : 'kept since...';
      setCoverSubtitle(savedSub !== null && savedSub !== undefined ? savedSub : defaultSub);

      const savedWidth = Number(localStorage.getItem(`book_${activeBookId}_boxSize`)) || 75;
      setCoverBoxWidth(savedWidth);

      setCoverBoxAlignH(localStorage.getItem(`book_${activeBookId}_boxAlignH`) || 'center');
      setCoverBoxAlignV(localStorage.getItem(`book_${activeBookId}_boxAlignV`) || 'center');
      const savedOpacity = localStorage.getItem(`book_${activeBookId}_boxOpacity`);
      setCoverBoxOpacity(savedOpacity !== null ? Number(savedOpacity) : 85);

      setIsBookOpen(false); // Close book when switching
    }
  }, [activeBookId, activeBook]);

  const handleSetCoverText = (val) => {
    setCoverText(val);
    if (activeBookId) {
      localStorage.setItem(`book_${activeBookId}_coverText`, val);
    }
  };

  const handleRenameCoverText = (val) => {
    if (activeBookId && val.trim()) {
      updateJournalBook(activeBookId, { name: val.trim() }).then((res) => {
        if (res && res.book) {
          setBooks((prev) => prev.map((b) => (b.id === activeBookId ? { ...b, name: val.trim() } : b)));
        }
      }).catch(() => {});
    }
  };

  const handleSetCoverSubtitle = (val) => {
    setCoverSubtitle(val);
    if (activeBookId) {
      localStorage.setItem(`book_${activeBookId}_coverSubtitle`, val);
    }
  };

  const handleSetCoverBoxSize = (val) => {
    const num = Math.min(95, Math.max(40, Number(val) || 75));
    setCoverBoxWidth(num);
    if (activeBookId) {
      localStorage.setItem(`book_${activeBookId}_boxSize`, String(num));
    }
  };

  const handleSetCoverBoxAlignH = (val) => {
    setCoverBoxAlignH(val);
    if (activeBookId) {
      localStorage.setItem(`book_${activeBookId}_boxAlignH`, val);
    }
  };

  const handleSetCoverBoxAlignV = (val) => {
    setCoverBoxAlignV(val);
    if (activeBookId) {
      localStorage.setItem(`book_${activeBookId}_boxAlignV`, val);
    }
  };

  const handleSetCoverBoxOpacity = (val) => {
    const num = Number(val);
    setCoverBoxOpacity(num);
    if (activeBookId) {
      localStorage.setItem(`book_${activeBookId}_boxOpacity`, String(num));
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
      const finalBody = plainBody;

      if (editingEntryId) {
        await updateJournalEntry(editingEntryId, {
          body: finalBody,
          mood_emoji: selectedMood?.emoji || '',
          mood_label: selectedMood?.label || '',
          entry_date: entryDate || todayISO(),
          auto_translate: false,
          book_id: activeBookId,
          allow_loop_detection: allowLoopDetection,
          bg_image: bgImage || '',
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
          bg_image: bgImage || '',
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
    const cleanBody = cleanEntryBodyHtml(entry.body);
    setBody(cleanBody);
    if (editorRef.current) {
      editorRef.current.innerHTML = cleanBody;
    }
    setMoodLabel(entry.mood_label || '');
    setEntryDate(entry.entry_date || todayISO());
    if (entry.bg_image) setBgImage(entry.bg_image);
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

  const handleUseTemplate = (html) => {
    setBody(html);
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

                        {/* Cover Flip Toggle Button */}
                        <button
                          type="button"
                          title={isBookOpen ? "Flip to Cover" : "Flip to Journal Page"}
                          onClick={() => setIsBookOpen(!isBookOpen)}
                          className="nm-btn ghost"
                          style={{ padding: '5px 12px', fontSize: 13, borderRadius: '16px', marginLeft: 8 }}
                        >
                          {isBookOpen ? '📖 View Cover' : '📄 Open Page'}
                        </button>



                        {/* PDF Download Options Menu */}
                        <div className="nm-dropdown-group" style={{ position: 'relative', display: 'inline-block', marginLeft: 8 }}>
                          <button
                            type="button"
                            title="Download PDF"
                            onClick={() => setActiveMenu(activeMenu === 'pdf' ? null : 'pdf')}
                            className="nm-btn primary"
                            style={{ padding: '5px 12px', fontSize: 13, borderRadius: '16px' }}
                          >
                            <Icon name="download" size={13} style={{ marginRight: 6 }} /> Download PDF ▾
                          </button>
                          {activeMenu === 'pdf' && (
                            <div style={{
                              position: 'absolute', left: 0, top: '100%', marginTop: 6,
                              background: 'var(--surface)', border: '1px solid var(--rule)',
                              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                              zIndex: 1000, minWidth: 230, whiteSpace: 'nowrap', overflow: 'hidden'
                            }}>
                              <button
                                type="button"
                                onClick={() => handleDownloadPdf(false)}
                                style={{
                                  display: 'block', width: '100%', padding: '10px 14px',
                                  textAlign: 'left', background: 'none', border: 'none',
                                  fontSize: 13, color: 'var(--ink)', cursor: 'pointer'
                                }}
                                onMouseEnter={e => e.target.style.background = 'var(--surface-2)'}
                                onMouseLeave={e => e.target.style.background = 'none'}
                              >
                                📄 Current Entry
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadPdf(true)}
                                style={{
                                  display: 'block', width: '100%', padding: '10px 14px',
                                  textAlign: 'left', background: 'none', border: 'none',
                                  fontSize: 13, color: 'var(--ink)', cursor: 'pointer',
                                  borderTop: '1px solid var(--rule-soft)'
                                }}
                                onMouseEnter={e => e.target.style.background = 'var(--surface-2)'}
                                onMouseLeave={e => e.target.style.background = 'none'}
                              >
                                📚 Complete Book
                              </button>
                            </div>
                          )}
                        </div>
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
                              onClick={(e) => { if (e.target === e.currentTarget) { setSelectedSticker(null); setSelectedBlock(null); setCoverBoxSelected(false); } }}
                              style={{ 
                                position: 'absolute', inset: 0,
                                backgroundImage: `url('/covers/${encodeURIComponent(coverStyle)}')`, 
                                backgroundSize: 'cover', backgroundPosition: 'center', 
                                display: 'flex', flexDirection: 'column',
                                alignItems: coverBoxAlignH,
                                justifyContent: coverBoxAlignV,
                                padding: '40px',
                                color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                                transformOrigin: 'left center',
                                transform: isBookOpen ? 'rotateY(-90deg)' : 'rotateY(0deg)',
                                opacity: isBookOpen ? 0 : 1,
                                visibility: isBookOpen ? 'hidden' : 'visible',
                                transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                                zIndex: 2,
                                transformStyle: 'preserve-3d',
                                cursor: 'default',
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
                              
                              {/* Draggable title box */}
                              <div
                                onClick={(e) => { e.stopPropagation(); setCoverBoxSelected(true); setSelectedSticker(null); setSelectedBlock(null); }}
                                style={{ 
                                  position: coverBoxX !== null ? 'absolute' : 'relative',
                                  left: coverBoxX !== null ? coverBoxX : undefined,
                                  top: coverBoxY !== null ? coverBoxY : undefined,
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  alignItems: coverBoxAlignH === 'flex-start' ? 'flex-start' : coverBoxAlignH === 'flex-end' ? 'flex-end' : 'center',
                                  justifyContent: 'center',
                                  background: coverBoxOpacity === 0 ? 'transparent' : `rgba(255, 255, 255, ${coverBoxOpacity / 100})`,
                                  backdropFilter: coverBoxOpacity > 0 && coverBoxOpacity < 100 ? 'blur(8px)' : 'none',
                                  padding: '28px 36px',
                                  borderRadius: '12px',
                                  boxShadow: coverBoxSelected
                                    ? '0 0 0 2px var(--accent), 0 8px 32px rgba(0,0,0,0.2)'
                                    : coverBoxOpacity > 0 ? '0 8px 32px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(255,255,255,0.5)' : 'none',
                                  maxWidth: `${coverBoxWidth}%`,
                                  width: `${coverBoxWidth}%`,
                                  textAlign: coverBoxAlignH === 'flex-start' ? 'left' : coverBoxAlignH === 'flex-end' ? 'right' : 'center',
                                  border: coverBoxSelected ? '1.5px dashed var(--accent)' : coverBoxOpacity > 0 ? '2px solid rgba(0,0,0,0.1)' : 'none',
                                  transition: 'background 0.2s ease, box-shadow 0.2s ease',
                                  zIndex: 3,
                                  cursor: 'move',
                                  userSelect: 'none'
                                }}
                                onMouseDown={(e) => {
                                  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setCoverBoxSelected(true);
                                  const parent = e.currentTarget.closest('.nm-cover-page');
                                  const rect = parent.getBoundingClientRect();
                                  const box = e.currentTarget;
                                  const boxRect = box.getBoundingClientRect();
                                  let curX = coverBoxX !== null ? coverBoxX : (boxRect.left - rect.left) / zoom;
                                  let curY = coverBoxY !== null ? coverBoxY : (boxRect.top - rect.top) / zoom;
                                  coverBoxDragRef.current = { startX: e.clientX, startY: e.clientY };
                                  const onMove = (me) => {
                                    const dx = (me.clientX - coverBoxDragRef.current.startX) / zoom;
                                    const dy = (me.clientY - coverBoxDragRef.current.startY) / zoom;
                                    curX += dx; curY += dy;
                                    coverBoxDragRef.current.startX = me.clientX;
                                    coverBoxDragRef.current.startY = me.clientY;
                                    box.style.left = curX + 'px';
                                    box.style.top = curY + 'px';
                                    box.style.position = 'absolute';
                                  };
                                  const onUp = () => {
                                    coverBoxDragRef.current = null;
                                    window.removeEventListener('mousemove', onMove);
                                    window.removeEventListener('mouseup', onUp);
                                    setCoverBoxX(curX);
                                    setCoverBoxY(curY);
                                    if (activeBookId) {
                                      localStorage.setItem(`book_${activeBookId}_boxX`, String(curX));
                                      localStorage.setItem(`book_${activeBookId}_boxY`, String(curY));
                                    }
                                  };
                                  window.addEventListener('mousemove', onMove);
                                  window.addEventListener('mouseup', onUp);
                                }}
                              >
                                {/* Floating toolbar — shown when box is selected */}
                                {coverBoxSelected && (
                                  <div
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(20,20,24,0.92)', borderRadius: 8, padding: '4px 8px', whiteSpace: 'nowrap', zIndex: 22, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}
                                  >
                                    <button onMouseDown={(e) => { e.stopPropagation(); handleSetCoverBoxSize(Math.max(30, coverBoxWidth - 10)); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, padding: '0 4px' }} title="Shrink">◀</button>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, minWidth: 32, textAlign: 'center' }}>{coverBoxWidth}%</span>
                                    <button onMouseDown={(e) => { e.stopPropagation(); handleSetCoverBoxSize(Math.min(95, coverBoxWidth + 10)); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, padding: '0 4px' }} title="Grow">▶</button>
                                    <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, padding: '0 2px' }}>|</span>
                                    {[{ v: 100, l: '■' }, { v: 85, l: '▨' }, { v: 50, l: '▒' }, { v: 0, l: '□' }].map(({ v, l }) => (
                                      <button key={v} onMouseDown={(e) => { e.stopPropagation(); handleSetCoverBoxOpacity(v); }} title={v === 100 ? 'Solid' : v === 85 ? 'Frosted' : v === 50 ? 'Faded' : 'Hidden'}
                                        style={{ background: coverBoxOpacity === v ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', fontSize: 13, padding: '2px 5px' }}>{l}</button>
                                    ))}
                                    <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, padding: '0 2px' }}>|</span>
                                    <button onMouseDown={(e) => { e.stopPropagation(); setCoverBoxSelected(false); }} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 14, padding: '0 4px' }} title="Deselect">✕</button>
                                  </div>
                                )}
                                <textarea
                                  value={coverText}
                                  onChange={(e) => handleSetCoverText(e.target.value)}
                                  onBlur={(e) => { handleRenameCoverText(e.target.value); e.currentTarget.style.borderColor = 'transparent'; }}
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  placeholder="Journal Title"
                                  rows={2}
                                  style={{ 
                                    fontFamily: 'var(--font-serif)', 
                                    fontSize: 42, 
                                    marginBottom: 12,
                                    color: coverBoxOpacity === 0 ? '#ffffff' : '#222',
                                    textShadow: coverBoxOpacity === 0 ? '0 2px 8px rgba(0,0,0,0.8)' : 'none',
                                    background: 'transparent',
                                    border: '1px dashed rgba(0,0,0,0.2)',
                                    outline: 'none',
                                    textAlign: coverBoxAlignH === 'flex-start' ? 'left' : coverBoxAlignH === 'flex-end' ? 'right' : 'center',
                                    resize: 'none',
                                    width: '100%',
                                    minWidth: '240px',
                                    fontWeight: 'bold',
                                    cursor: 'text',
                                    pointerEvents: 'auto'
                                  }}
                                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                                />
                                <input
                                  type="text"
                                  value={coverSubtitle}
                                  onChange={(e) => handleSetCoverSubtitle(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  placeholder="kept since..."
                                  style={{ 
                                    fontFamily: 'var(--font-mono)', 
                                    fontSize: 14, 
                                    color: coverBoxOpacity === 0 ? '#ffffff' : '#555', 
                                    textShadow: coverBoxOpacity === 0 ? '0 2px 8px rgba(0,0,0,0.8)' : 'none',
                                    background: 'transparent',
                                    border: '1px dashed rgba(0,0,0,0.15)',
                                    outline: 'none',
                                    textAlign: coverBoxAlignH === 'flex-start' ? 'left' : coverBoxAlignH === 'flex-end' ? 'right' : 'center',
                                    width: '100%',
                                    cursor: 'text',
                                    pointerEvents: 'auto'
                                  }}
                                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                                  onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)'}
                                />
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
                                : bgImage ? (BACKGROUNDS.includes(bgImage) ? { backgroundImage: `url('/backgrounds/${encodeURIComponent(bgImage)}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : (PAPER_STYLES[bgImage] ? { ...PAPER_STYLES[bgImage], backgroundImage: undefined } : {})) : {})
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
                                {formatIndiaDate(entryDate)}
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
                        <button onClick={(e) => { e.stopPropagation(); setIsBookOpen(false); }} title="Flip to Cover" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.9)', border: '1px solid var(--rule-soft)', borderRadius: '50%', width: 42, height: 42, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#222' }}>
                          ◀
                        </button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setIsBookOpen(true); }} title="Flip to Journal Page" style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.9)', border: '1px solid var(--rule-soft)', borderRadius: '50%', width: 42, height: 42, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#222' }}>
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
                            activeBg={bgImage}
                            customUrl={customThemeUrl}
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