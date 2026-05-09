'use client'

import type { ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  source: string
}

/**
 * Renders the wiki page body.  react-markdown is safe-by-default — no raw
 * HTML rendering — so user-authored markdown can't inject <script>.  We
 * override per-element rendering with explicit Tailwind classes (no prose
 * plugin needed) and gate anchor URLs to http/https/mailto only.
 */
export function MarkdownView({ source }: Props) {
  return (
    <div className="text-[15px] leading-relaxed text-foreground space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mt-6 mb-2 text-2xl font-semibold tracking-tight first:mt-0" {...p} />,
          h2: (p) => <h2 className="mt-5 mb-2 text-xl font-semibold tracking-tight first:mt-0" {...p} />,
          h3: (p) => <h3 className="mt-4 mb-1.5 text-lg font-semibold first:mt-0" {...p} />,
          h4: (p) => <h4 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...p} />,
          p:  (p) => <p className="leading-relaxed" {...p} />,
          strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
          em:     (p) => <em className="italic" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 space-y-1" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 space-y-1" {...p} />,
          li: (p) => <li className="leading-relaxed" {...p} />,
          blockquote: (p) => <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground" {...p} />,
          hr: () => <hr className="my-4 border-border" />,
          code: ({ children, className, ...rest }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) => {
            // Inline vs fenced — react-markdown 10 doesn't pass `inline`,
            // so detect via the className (fenced gets `language-…`).
            const isBlock = typeof className === 'string' && className.startsWith('language-')
            if (isBlock) {
              return <code className={`${className ?? ''} text-[13px]`} {...rest}>{children}</code>
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 text-[13px] font-mono" {...rest}>
                {children}
              </code>
            )
          },
          pre: (p) => <pre className="rounded-lg bg-muted p-3 text-[13px] overflow-x-auto" {...p} />,
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" {...p} />
            </div>
          ),
          th: (p) => <th className="border-b border-border px-2 py-1 text-left font-semibold" {...p} />,
          td: (p) => <td className="border-b border-border/60 px-2 py-1 align-top" {...p} />,
          a: ({ href, children, ...rest }) => {
            const safe = isSafeUrl(href ?? '')
            if (!safe) return <span className="text-muted-foreground">{children}</span>
            return (
              <a
                {...rest}
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-primary hover:underline"
              >
                {children}
              </a>
            )
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

function isSafeUrl(url: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url, 'http://placeholder.invalid')
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:'
  } catch {
    return false
  }
}
