import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export default function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  if (!content) return <p className="text-gray-400 italic text-sm">无内容</p>;

  return (
    <div className={`prose prose-sm max-w-none text-gray-700 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-3">
              <table className="border-collapse border border-gray-200 w-full text-sm" {...props}>{children}</table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-gray-50" {...props}>{children}</thead>
          ),
          th: ({ children, ...props }) => (
            <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" {...props}>{children}</th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700" {...props}>{children}</td>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = codeClassName?.startsWith('language-');
            if (isBlock) {
              return (
                <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-[13px] leading-relaxed my-3">
                  <code className={codeClassName} {...props}>{children}</code>
                </pre>
              );
            }
            return (
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>
                {children}
              </code>
            );
          },
          a: ({ children, ...props }) => (
            <a className="text-indigo-600 hover:text-indigo-700 underline decoration-indigo-300 underline-offset-2" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
          ),
          input: ({ ...props }) => (
            <input {...props} disabled className="mr-1.5 accent-indigo-600" />
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote className="border-l-4 border-indigo-200 pl-4 my-3 text-gray-600 italic" {...props}>{children}</blockquote>
          ),
          h1: ({ children, ...props }) => (
            <h1 className="text-xl font-bold text-gray-900 mt-6 mb-3 pb-2 border-b border-gray-200" {...props}>{children}</h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-lg font-semibold text-gray-800 mt-5 mb-2 pb-1.5 border-b border-gray-100" {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2" {...props}>{children}</h3>
          ),
          hr: ({ ...props }) => (
            <hr className="my-4 border-gray-200" {...props} />
          ),
          ul: ({ children, ...props }) => (
            <ul className="list-disc list-inside space-y-1 my-2 text-gray-700" {...props}>{children}</ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal list-inside space-y-1 my-2 text-gray-700" {...props}>{children}</ol>
          ),
          img: ({ ...props }) => (
            <img className="rounded-lg max-w-full my-3 border border-gray-200" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
