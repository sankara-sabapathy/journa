import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Loaded lazily so the editor's first paint doesn't pay for the Markdown parser. */
export default function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {source}
      </ReactMarkdown>
    </div>
  )
}
