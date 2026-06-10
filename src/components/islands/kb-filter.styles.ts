import { css } from 'lit';

export const kbFilterStyles = css`
  :host {
    display: block;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }
  input {
    flex: 1;
    min-width: 0;
    font: inherit;
    color: var(--text);
    background: var(--bg-raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-3) var(--space-4);
  }
  input:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .count {
    margin: 0;
    font-variant-numeric: tabular-nums;
    color: var(--text-faint);
    font-size: var(--step--1);
    white-space: nowrap;
  }
  .empty {
    color: var(--text-muted);
    padding: var(--space-6) 0;
  }
`;
