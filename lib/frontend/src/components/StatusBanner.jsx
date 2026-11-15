/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logoUrl from '../assets/logo.png'
import { FileTile } from './ResultItem.jsx'
import { SparkIcon } from './Icons.jsx'

/** File families the indexer reads, with the type tile each one shows in results. */
const FORMATS = [
  { type: 'pdf', label: 'PDF' },
  { type: 'docx', label: 'Word' },
  { type: 'md', label: 'Markdown and text' },
  { type: 'html', label: 'HTML' },
  { type: 'rtf', label: 'Rich text' },
  { type: 'image', label: 'Scanned images (OCR)' },
]

/**
 * First-run screen shown while no index exists: explains what indexing does
 * and offers the button that starts it.
 * @param {{ onCreate?: () => void }} props
 */
export function StatusBanner({ onCreate }) {
  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <img className="onboarding-logo" src={logoUrl} alt="" width="132" height="132" />
      <span className="eyebrow onboarding-eyebrow">No index yet</span>
      <h2 id="onboarding-title" className="onboarding-title">
        Build your search index
      </h2>
      <p className="onboarding-text">
        nanosearch reads every folder listed in <code>SEARCH_DIRS</code>, pulls the text out of each file and keeps it
        in a local SQLite index. The first run takes a while. Later updates only touch files that changed.
      </p>
      {onCreate && (
        <button type="button" className="btn btn--primary btn--lg onboarding-cta" onClick={onCreate}>
          <SparkIcon size={18} strokeWidth={2.4} />
          Create index
        </button>
      )}
      <p className="onboarding-note">Progress shows up right here. Closing the tab does not stop it.</p>
      <div className="formats">
        <h3 className="eyebrow">What gets searched</h3>
        <ul className="formats-list" role="list">
          {FORMATS.map((f) => (
            <li key={f.type}>
              <FileTile type={f.type} />
              {f.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
