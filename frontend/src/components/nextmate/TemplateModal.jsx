import React, { useState, useEffect } from 'react';
import { TEMPLATE_CATEGORIES } from '../../lib/templates';
import { Icon } from './Shell';

export const TemplateModal = ({ isOpen, onClose, onUseTemplate }) => {
  const [tab, setTab] = useState('gallery'); // 'gallery' | 'my-templates'
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [myTemplates, setMyTemplates] = useState([]);

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

  const handleSaveToMyTemplates = (template) => {
    try {
      const existing = myTemplates.find(t => t.id === template.id);
      if (existing) {
        setTab('my-templates');
        return;
      }
      
      const updated = [...myTemplates, template];
      setMyTemplates(updated);
      localStorage.setItem('nm_my_templates', JSON.stringify(updated));
      setTab('my-templates');
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

  const currentList = tab === 'gallery' ? null : myTemplates; // If gallery, we use categories

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
          <div style={{ width: 240, borderRight: '1px solid var(--rule)', display: 'flex' }}>
            <button
              onClick={() => setTab('gallery')}
              style={{ flex: 1, border: 'none', background: tab === 'gallery' ? 'var(--surface)' : 'var(--surface-0)', color: tab === 'gallery' ? 'var(--ink)' : 'var(--ink-3)', fontWeight: tab === 'gallery' ? 'bold' : 'normal', fontSize: 12, cursor: 'pointer' }}
            >
              Gallery
            </button>
            <button
              onClick={() => setTab('my-templates')}
              style={{ flex: 1, border: 'none', background: tab === 'my-templates' ? 'var(--surface)' : 'var(--surface-0)', color: tab === 'my-templates' ? 'var(--ink)' : 'var(--ink-3)', fontWeight: tab === 'my-templates' ? 'bold' : 'normal', fontSize: 12, cursor: 'pointer' }}
            >
              My templates
            </button>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
            <div style={{ fontWeight: 'bold', fontSize: 14 }}>
              {selectedTemplate ? selectedTemplate.title : (tab === 'gallery' ? 'Template Gallery' : 'My Templates')}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left Sidebar (List) */}
          <div style={{ width: 240, borderRight: '1px solid var(--rule)', overflowY: 'auto', background: 'var(--surface-0)' }}>
            
            {tab === 'gallery' ? (
              <div style={{ padding: '16px 0' }}>
                <div style={{ padding: '0 16px 12px' }}>
                  <input type="text" placeholder="Search Templates" style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--rule)', fontSize: 12, background: 'var(--surface)' }} />
                </div>
                
                {TEMPLATE_CATEGORIES.map(cat => (
                  <div key={cat.id} style={{ marginBottom: 20 }}>
                    <div style={{ padding: '0 16px', marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.05em', color: 'var(--ink-2)' }}>{cat.title}</div>
                      {cat.description && <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.3 }}>{cat.description}</div>}
                    </div>
                    <div>
                      {cat.templates.map(temp => (
                        <div
                          key={temp.id}
                          onClick={() => setSelectedTemplate(temp)}
                          style={{
                            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                            background: selectedTemplate?.id === temp.id ? 'var(--surface-2)' : 'transparent',
                            borderLeft: selectedTemplate?.id === temp.id ? '3px solid var(--accent)' : '3px solid transparent',
                            color: selectedTemplate?.id === temp.id ? 'var(--accent)' : 'var(--ink)'
                          }}
                        >
                          <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{temp.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: selectedTemplate?.id === temp.id ? '500' : 'normal' }}>{temp.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px 0' }}>
                <div style={{ padding: '0 16px 16px' }}>
                  <button onClick={handleCreateNewTemplate} className="nm-btn ghost" style={{ width: '100%', justifyContent: 'center', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                    + New Template
                  </button>
                </div>
                {myTemplates.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>No saved templates.</div>
                ) : (
                  myTemplates.map(temp => (
                    <div
                      key={temp.id}
                      onClick={() => setSelectedTemplate(temp)}
                      style={{
                        padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                        background: selectedTemplate?.id === temp.id ? 'var(--surface-2)' : 'transparent',
                        borderLeft: selectedTemplate?.id === temp.id ? '3px solid var(--accent)' : '3px solid transparent',
                        color: selectedTemplate?.id === temp.id ? 'var(--accent)' : 'var(--ink)'
                      }}
                    >
                      <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{temp.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: selectedTemplate?.id === temp.id ? '500' : 'normal' }}>{temp.title}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Right Content (Preview) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
            {selectedTemplate ? (
              <>
                <div style={{ flex: 1, padding: 40, overflowY: 'auto' }}>
                  <h2 style={{ textAlign: 'center', marginBottom: 24, fontSize: 20 }}>{selectedTemplate.title}</h2>
                  <div 
                    dangerouslySetInnerHTML={{ __html: selectedTemplate.html }} 
                    style={{ background: 'var(--surface-0)', padding: 30, borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}
                  />
                </div>
                <div style={{ padding: '16px 24px', borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--surface-0)' }}>
                  <button
                    onClick={onClose}
                    className="nm-btn ghost"
                  >
                    Cancel
                  </button>
                  {tab === 'gallery' && (
                    <button
                      onClick={() => handleSaveToMyTemplates(selectedTemplate)}
                      className="nm-btn ghost"
                      style={{ border: '1px solid var(--rule)' }}
                    >
                      Save to My Templates
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onUseTemplate(selectedTemplate.html);
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
