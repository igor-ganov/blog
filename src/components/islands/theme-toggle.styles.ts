import { css } from 'lit';

export const themeToggleStyles = css`
  :host {
    display: inline-flex;
  }
  button {
    width: 2.4rem;
    height: 2.4rem;
    display: inline-grid;
    place-items: center;
    font-size: 1.1rem;
    cursor: pointer;
    color: var(--text);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  button:hover {
    border-color: var(--border-strong);
    background: var(--bg-sunken);
  }
  button:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
`;
