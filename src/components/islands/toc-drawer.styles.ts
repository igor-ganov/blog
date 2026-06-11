import { css } from 'lit';

// Base styles are the desktop presentation: an inline, sticky-friendly TOC block.
// The mobile drawer (off-canvas panel + floating button + backdrop) is layered on
// under the same 60rem breakpoint the article layout uses.
export const tocDrawerStyles = css`
  :host {
    display: block;
  }
  .toggle,
  .backdrop,
  .panel-head {
    display: none;
  }
  .label-desktop {
    font-family: var(--font-sans);
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin: 0 0 var(--space-3);
  }
  .toc-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--step--1);
  }
  .toc-list a {
    display: block;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.15em 0;
  }
  .toc-list a:hover {
    color: var(--link);
  }
  .toc-list a:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  @media (max-width: 60rem) {
    .label-desktop {
      display: none;
    }
    .toggle {
      position: fixed;
      inset: auto var(--space-5) var(--space-5) auto;
      z-index: 45;
      display: inline-flex;
      align-items: center;
      gap: 0.5em;
      font: inherit;
      font-size: var(--step--1);
      font-weight: 600;
      color: var(--accent-contrast);
      background: var(--accent);
      border: none;
      border-radius: 999px;
      padding: 0.6em 1em;
      box-shadow: var(--shadow);
      cursor: pointer;
    }
    .toggle:focus-visible {
      outline: 3px solid var(--text);
      outline-offset: 2px;
    }
    .toggle-icon {
      display: inline-flex;
    }
    .backdrop {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 46;
      background: rgb(0 0 0 / 0.5);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease;
    }
    .backdrop[data-open] {
      opacity: 1;
      visibility: visible;
    }
    .panel {
      position: fixed;
      inset: 0 0 0 auto;
      z-index: 47;
      width: min(82vw, 20rem);
      height: 100dvh;
      overflow-y: auto;
      background: var(--bg-raised);
      border-inline-start: 1px solid var(--border);
      box-shadow: var(--shadow);
      padding: var(--space-5);
      transform: translateX(100%);
      visibility: hidden;
      /* Hide only after the slide-out finishes; show instantly on open so the
         drawer is focusable in the same task. */
      transition: transform 0.24s ease, visibility 0s linear 0.24s;
    }
    .panel[data-open] {
      transform: translateX(0);
      visibility: visible;
      transition: transform 0.24s ease, visibility 0s linear 0s;
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .panel-head .label {
      font-family: var(--font-sans);
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-faint);
    }
    .close {
      font: inherit;
      font-size: var(--step-1);
      line-height: 1;
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.1em 0.3em;
      border-radius: var(--radius-sm);
    }
    .close:hover {
      color: var(--text);
    }
    .close:focus-visible {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }
  }

  @media (max-width: 60rem) and (prefers-reduced-motion: reduce) {
    .backdrop,
    .panel {
      transition: none;
    }
  }
`;
