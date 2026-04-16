/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentViewer } from '../components/DocumentViewer.jsx'
import { StatusBanner } from '../components/StatusBanner.jsx'
import { ProgressOverlay } from '../components/ProgressOverlay.jsx'
import { ResultItem } from '../components/ResultItem.jsx'
import { ResultList } from '../components/ResultList.jsx'
import { SearchBox } from '../components/SearchBox.jsx'

describe('StatusBanner', () => {
  it('renders no-index message', () => {
    render(<StatusBanner />)
    expect(screen.getByText(/no index yet/i)).toBeInTheDocument()
  })
})

describe('SearchBox', () => {
  it('renders with given value', () => {
    render(<SearchBox value="hello" onChange={() => {}} disabled={false} placeholder="Search..." />)
    expect(screen.getByRole('searchbox')).toHaveValue('hello')
  })

  it('calls onChange on input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchBox value="" onChange={onChange} disabled={false} placeholder="Search..." />)
    await user.type(screen.getByRole('searchbox'), 'x')
    expect(onChange).toHaveBeenCalled()
  })

  it('is disabled when disabled prop is true', () => {
    render(<SearchBox value="" onChange={() => {}} disabled={true} placeholder="No index" />)
    expect(screen.getByRole('searchbox')).toBeDisabled()
  })
})

describe('ProgressOverlay', () => {
  it('shows "Preparing…" when rendered with no progress data', () => {
    render(<ProgressOverlay />)
    expect(screen.getByText('Preparing…')).toBeInTheDocument()
  })

  it('shows "Calculating..." when eta is -1', () => {
    render(<ProgressOverlay file="doc.pdf" processed={1} total={10} percent={10} eta={-1} />)
    expect(screen.getByText(/calculating/i)).toBeInTheDocument()
  })

  it('shows "less than a minute" for eta under 60s', () => {
    render(<ProgressOverlay file="doc.pdf" processed={9} total={10} percent={90} eta={30} />)
    expect(screen.getByText(/less than a minute/i)).toBeInTheDocument()
  })

  it('shows approximate minutes for eta >= 120', () => {
    render(<ProgressOverlay file="doc.pdf" processed={5} total={10} percent={50} eta={240} />)
    expect(screen.getByText(/4 minutes/i)).toBeInTheDocument()
  })

  it('shows file count label', () => {
    render(<ProgressOverlay file="report.pdf" processed={42} total={318} percent={13} eta={-1} />)
    expect(screen.getByText(/42 of 318 files/i)).toBeInTheDocument()
  })

  it('shows the current filename', () => {
    render(<ProgressOverlay file="report.pdf" processed={1} total={10} percent={10} eta={-1} />)
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
  })
})

describe('ResultItem', () => {
  const result = {
    path: '/Volumes/Docs/report.pdf',
    filename: 'report.pdf',
    type: 'pdf',
    snippet: 'this is a <mark>match</mark> here',
  }

  it('renders filename, path, type and snippet', () => {
    render(<ResultItem result={result} focused={false} onClick={() => {}} />)
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
    expect(screen.getByText('/Volumes/Docs/report.pdf')).toBeInTheDocument()
    expect(screen.getByText('pdf')).toBeInTheDocument()
  })

  it('renders the mark tag in snippet HTML', () => {
    const { container } = render(<ResultItem result={result} focused={false} onClick={() => {}} />)
    expect(container.querySelector('mark')).toBeInTheDocument()
  })

  it('applies focused class when focused=true', () => {
    const { container } = render(<ResultItem result={result} focused={true} onClick={() => {}} />)
    expect(container.firstChild).toHaveClass('focused')
  })
})

describe('ResultList', () => {
  const results = [
    { path: '/a.pdf', filename: 'a.pdf', type: 'pdf', snippet: 'alpha' },
    { path: '/b.txt', filename: 'b.txt', type: 'txt', snippet: 'beta' },
    { path: '/c.md', filename: 'c.md', type: 'md', snippet: 'gamma' },
  ]
  const mockOpen = vi.fn().mockResolvedValue(undefined)

  it('renders all result items', () => {
    render(<ResultList results={results} onOpen={mockOpen} />)
    expect(screen.getByText('a.pdf')).toBeInTheDocument()
    expect(screen.getByText('b.txt')).toBeInTheDocument()
  })

  it('shows "No results found." for empty list', () => {
    render(<ResultList results={[]} onOpen={mockOpen} />)
    expect(screen.getByText(/no results found/i)).toBeInTheDocument()
  })

  it('navigates with arrow keys and opens with Enter', async () => {
    const user = userEvent.setup()
    render(<ResultList results={results} onOpen={mockOpen} />)
    const list = screen.getByRole('list')
    act(() => list.focus()) // focus auto-highlights index 0
    await user.keyboard('{ArrowDown}') // moves to index 1
    await user.keyboard('{Enter}')
    expect(mockOpen).toHaveBeenCalledWith(results[1])
  })
})

describe('DocumentViewer', () => {
  const pdfResult = { path: '/docs/report.pdf', filename: 'report.pdf', type: 'pdf', snippet: '...' }
  const imageResult = { path: '/docs/photo.jpg', filename: 'photo.jpg', type: 'image', snippet: '...' }
  const docxResult = { path: '/docs/contract.docx', filename: 'contract.docx', type: 'docx', snippet: '...' }
  const mdResult = { path: '/docs/README.md', filename: 'README.md', type: 'md', snippet: '...' }

  it('renders back button, filename, and type badge', () => {
    render(<DocumentViewer result={pdfResult} onBack={() => {}} />)
    expect(screen.getByText('← Results')).toBeInTheDocument()
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
    expect(screen.getByText('pdf')).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<DocumentViewer result={pdfResult} onBack={onBack} />)
    await user.click(screen.getByText('← Results'))
    expect(onBack).toHaveBeenCalled()
  })

  it('renders embed tag for pdf type', () => {
    const { container } = render(<DocumentViewer result={pdfResult} onBack={() => {}} />)
    const embed = container.querySelector('embed')
    expect(embed).toBeInTheDocument()
    expect(embed.getAttribute('type')).toBe('application/pdf')
    expect(embed.getAttribute('src')).toContain(encodeURIComponent('/docs/report.pdf'))
  })

  it('renders img tag for image type', () => {
    const { container } = render(<DocumentViewer result={imageResult} onBack={() => {}} />)
    const img = container.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src')).toContain(encodeURIComponent('/docs/photo.jpg'))
  })

  it('renders "Cannot be rendered" notice and Copy button for unrenderable types', () => {
    render(<DocumentViewer result={docxResult} onBack={() => {}} />)
    expect(screen.getByText('Cannot be rendered')).toBeInTheDocument()
    expect(screen.getByText('Copy')).toBeInTheDocument()
    expect(screen.getByText('/docs/contract.docx')).toBeInTheDocument()
  })

  it('renders a Download link in the header for every file type', () => {
    render(<DocumentViewer result={pdfResult} onBack={() => {}} />)
    const link = screen.getByRole('link', { name: /download/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('download')).toBe('report.pdf')
    expect(link.getAttribute('href')).toContain(encodeURIComponent('/docs/report.pdf'))
  })

  const htmlResult = { path: '/docs/page.html', filename: 'page.html', type: 'html', snippet: '...' }

  it('renders sandboxed iframe for html type', () => {
    const { container } = render(<DocumentViewer result={htmlResult} onBack={() => {}} />)
    const iframe = container.querySelector('iframe')
    expect(iframe).toBeInTheDocument()
    expect(iframe.getAttribute('src')).toContain(encodeURIComponent('/docs/page.html'))
    expect(iframe.getAttribute('sandbox')).toBe('')
  })

  it('shows Loading… then renders markdown heading after fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve('# Hello World'),
    })
    render(<DocumentViewer result={mdResult} onBack={() => {}} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    const heading = await screen.findByRole('heading', { name: 'Hello World' })
    expect(heading).toBeInTheDocument()
  })

  const csvResult = { path: '/docs/data.csv', filename: 'data.csv', type: 'txt', snippet: '...' }

  it('fetches and renders plain text in a pre element for text types (e.g. csv)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve('a,b\n1,2'),
    })
    const { container } = render(<DocumentViewer result={csvResult} onBack={() => {}} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('pre')).toBeInTheDocument())
    expect(container.querySelector('pre').textContent).toBe('a,b\n1,2')
  })
})
