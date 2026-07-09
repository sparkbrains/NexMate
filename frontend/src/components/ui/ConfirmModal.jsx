import { useEffect } from 'react';

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="nm-confirm-backdrop" onClick={onCancel}>
      <div className="nm-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="nm-confirm-title" aria-describedby="nm-confirm-description" onClick={(event) => event.stopPropagation()}>
        <div className="nm-confirm-eyebrow">Confirm action</div>
        <h3 id="nm-confirm-title" className="nm-confirm-title">{title}</h3>
        <p id="nm-confirm-description" className="nm-confirm-description">{description}</p>
        <div className="nm-confirm-actions">
          <button type="button" className="nm-btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="nm-btn accent" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
