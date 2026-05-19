with open('src/styles.css', 'a', encoding='utf-8') as f:
    f.write('''

/* Switch Toggle */
.nm-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}
.nm-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.nm-switch-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--rule);
  transition: .2s;
  border-radius: 20px;
}
.nm-switch-slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: .2s;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
.nm-switch input:checked + .nm-switch-slider {
  background-color: var(--accent);
}
.nm-switch input:checked + .nm-switch-slider:before {
  transform: translateX(16px);
}
''')
