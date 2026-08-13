import React, { useState, useEffect, useRef } from 'react';
import { TEMPLATE_CATEGORIES } from '../../lib/templates';
import { Icon } from './Shell';

const BACKGROUNDS = [
  'Background1.png', 'Background2.png', 'Background3.png', 'Background4.png',
  'Background5.png', 'Background6.png', 'Background7.png', 'Background8.png',
  'Background9.png', 'Background10.png', 'Background11.png', 'Background12.png',
  'Background13.png', 'Background14.png'
];

const getBgStyle = (theme) => {
  if (!theme) return {};
  if (BACKGROUNDS.includes(theme)) {
    return { backgroundImage: `url('/backgrounds/${encodeURIComponent(theme)}')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
  }
  return PAPER_STYLES[theme] || {};
};

export const TemplateModal = ({ isOpen, onClose, onUseTemplate }) => {
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [myTemplates, setMyTemplates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const editorRef = useRef(null);

  useEffect(() => {
    // Select first template by default if none selected
    if (isOpen && !selectedTemplate && TEMPLATE_CATEGORIES[0]?.templates[0]) {
      setSelectedTemplate(TEMPLATE_CATEGORIES[0].templates[0]);
    }
    
    // Load my templates from local storage
    if (isOpen) {
      try {
        const saved = localStorage.getItem('nm_my_templates');
        if (saved) {
          setMyTemplates(JSON.parse(saved));
        }
      } catch (e) { /* ignore */ }
    }
  }, [isOpen]);

  const updateSelectedField = (field, value) => {
    const updated = { ...selectedTemplate, [field]: value };
    setSelectedTemplate(updated);
    if (updated.id.startsWith('custom-')) {
      const idx = myTemplates.findIndex(t => t.id === updated.id);
      if (idx >= 0) {
        const newMyTemplates = [...myTemplates];
        newMyTemplates[idx] = updated;
        setMyTemplates(newMyTemplates);
        localStorage.setItem('nm_my_templates', JSON.stringify(newMyTemplates));
      }
    }
  };

  const handleSaveToMyTemplates = (template) => {
    try {
      let tempToSave = template;
      if (!template.id.startsWith('custom-')) {
        tempToSave = { ...template, id: `custom-${template.id}-${Date.now()}` };
      }
      const existingIndex = myTemplates.findIndex(t => t.id === tempToSave.id);
      let updated;
      if (existingIndex >= 0) {
        updated = [...myTemplates];
        updated[existingIndex] = tempToSave;
      } else {
        updated = [tempToSave, ...myTemplates];
      }
      setMyTemplates(updated);
      localStorage.setItem('nm_my_templates', JSON.stringify(updated));
      setSelectedTemplate(tempToSave);
    } catch (e) { /* ignore */ }
  };

  const handleCreateNewTemplate = () => {
    const newTemp = {
      id: `custom-${Date.now()}`,
      title: 'New Template',
      icon: '📝',
      html: '<div style="font-family: var(--font-serif); color: var(--ink);"><p><br></p></div>'
    };
    const updated = [newTemp, ...myTemplates];
    setMyTemplates(updated);
    localStorage.setItem('nm_my_templates', JSON.stringify(updated));
    setSelectedTemplate(newTemp);
  };

  if (!isOpen) return null;
  
  const isCustom = selectedTemplate?.id.startsWith('custom-');

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--surface)', width: '90%', maxWidth: 840, height: '80vh', maxHeight: 600,
        borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', height: 50 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
            <div style={{ fontWeight: 'bold', fontSize: 14 }}>
              {selectedTemplate ? selectedTemplate.title : 'Template Gallery'}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left Sidebar (List) */}
          <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--rule)', overflowY: 'auto', background: 'var(--surface-0)' }}>
            <div style={{ padding: '16px 0' }}>
              <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
                <input 
                  type="text" 
                  placeholder="Search Templates" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--rule)', fontSize: 12, background: 'var(--surface)' }} 
                />
                <button onClick={handleCreateNewTemplate} className="nm-btn ghost" style={{ flexShrink: 0, padding: '6px 10px', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 12 }}>
                  + New Template
                </button>
              </div>
              
              {TEMPLATE_CATEGORIES.map(cat => {
                const filtered = cat.templates.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
                if (filtered.length === 0) return null;
                return (
                <div key={cat.id} style={{ marginBottom: 20 }}>
                  <div style={{ padding: '0 16px', marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.05em', color: 'var(--accent)' }}>{cat.title}</div>
                    {cat.description && <div style={{ fontSize: 10, color: 'var(--accent)', opacity: 0.6, marginTop: 4, lineHeight: 1.3 }}>{cat.description}</div>}
                  </div>
                  <div style={{ padding: '0 8px' }}>
                    {filtered.map(temp => (
                      <button
                        key={temp.id}
                        className={"nm-nav-item" + (selectedTemplate?.id === temp.id ? " active" : "")}
                        onClick={() => setSelectedTemplate(temp)}
                        style={{ marginBottom: 2 }}
                      >
                        <span className="nm-nav-ic" style={{ fontSize: 16 }}>{temp.icon}</span>
                        <span>{temp.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )})}

              <div style={{ marginBottom: 20 }}>
                <div style={{ padding: '0 16px', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.05em', color: 'var(--accent)' }}>CUSTOMIZED TEMPLATE</div>
                </div>
                <div style={{ padding: '0 8px' }}>
                  {myTemplates.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())).map(temp => (
                    <button
                      key={temp.id}
                      className={"nm-nav-item" + (selectedTemplate?.id === temp.id ? " active" : "")}
                      onClick={() => setSelectedTemplate(temp)}
                      style={{ marginBottom: 2, display: 'flex', alignItems: 'center' }}
                    >
                      <span className="nm-nav-ic" style={{ fontSize: 16, flexShrink: 0 }}>{temp.icon}</span>
                      <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{temp.title}</span>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = myTemplates.filter(t => t.id !== temp.id);
                          setMyTemplates(updated);
                          localStorage.setItem('nm_my_templates', JSON.stringify(updated));
                          if (selectedTemplate?.id === temp.id) setSelectedTemplate(null);
                        }}
                        style={{ padding: '4px', cursor: 'pointer', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Delete template"
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                      >
                        <Icon name="trash" size={12} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Content (Preview) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
            {selectedTemplate ? (
              <>
                <div style={{ flex: 1, padding: 40, overflowY: 'auto' }}>
                  <h2 style={{ textAlign: 'center', marginBottom: 24, fontSize: 20 }}>
                    {isCustom ? (
                      <input 
                        type="text" 
                        value={selectedTemplate.title}
                        onChange={(e) => updateSelectedField('title', e.target.value)}
                        style={{ textAlign: 'center', fontSize: 20, fontWeight: 'bold', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--rule)', outline: 'none', color: 'var(--ink)' }}
                      />
                    ) : selectedTemplate.title}
                  </h2>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <select
                      value={selectedTemplate.theme || ''}
                      onChange={(e) => updateSelectedField('theme', e.target.value)}
                      style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' }}
                    >
                      <option value="">Default Theme</option>
                      {BACKGROUNDS.map(b => (
                        <option key={b} value={b}>{b.replace('.png', '').replace('.jpg', '')}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{
                    border: isCustom ? '1px solid var(--rule)' : 'none',
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}>
                    {isCustom && (
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
                        <button type="button" onMouseDown={(e) => {
                          e.preventDefault();
                          const ed = editorRef.current;
                          if (!ed) return;
                          ed.focus();
                          document.execCommand('insertUnorderedList');
                        }} className="nm-btn ghost" style={{ padding: '2px 7px', fontSize: 13 }}>• List</button>
                        <button type="button" onMouseDown={(e) => {
                          e.preventDefault();
                          const ed = editorRef.current;
                          if (!ed) return;
                          ed.focus();
                          document.execCommand('insertOrderedList');
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
                      </div>
                    )}
                    <div 
                      key={selectedTemplate.id} // forces recreation of the DOM node so innerHTML resets properly when switching templates
                      ref={editorRef}
                      contentEditable={isCustom}
                      suppressContentEditableWarning={true}
                      dangerouslySetInnerHTML={{ __html: selectedTemplate.html }} 
                      style={{ 
                        background: selectedTemplate.theme ? undefined : 'var(--surface-0)', 
                        padding: 30, 
                        minHeight: isCustom ? 200 : 'auto', 
                        outline: 'none',
                        boxShadow: !isCustom ? '0 2px 10px rgba(0,0,0,0.02)' : 'none',
                        borderRadius: 8,
                        ...getBgStyle(selectedTemplate.theme)
                      }}
                    />
                  </div>
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--surface-0)' }}>
                  <button
                    onClick={onClose}
                    className="nm-btn ghost"
                  >
                    Cancel
                  </button>
                  {!isCustom ? (
                    <button
                      onClick={() => handleSaveToMyTemplates(selectedTemplate)}
                      className="nm-btn ghost"
                      style={{ border: '1px solid var(--rule)' }}
                    >
                      Save to My Templates
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (editorRef.current) {
                          const updated = { ...selectedTemplate, html: editorRef.current.innerHTML };
                          setSelectedTemplate(updated);
                          handleSaveToMyTemplates(updated);
                        }
                      }}
                      className="nm-btn ghost"
                      style={{ border: '1px solid var(--rule)' }}
                    >
                      Save Template
                    </button>
                  )}
                  <button
                    onClick={() => {
                      // Ensure latest changes are grabbed if custom
                      let finalHtml = selectedTemplate.html;
                      if (isCustom && editorRef.current) {
                        finalHtml = editorRef.current.innerHTML;
                      }
                      onUseTemplate(finalHtml, selectedTemplate.theme);
                      onClose();
                    }}
                    className="nm-btn primary"
                  >
                    Use Now
                  </button>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
                Select a template to preview
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
