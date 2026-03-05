import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export default function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  if (!content) return <p className="text-gray-500 italic">无内容</p>;

  return (
    <div className={`prose prose-invert prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children, ...props }) => (
            <table className="border-collapse border border-gray-600 w-full" {...props}>{children}</table>
          ),
          th: ({ children, ...props }) => (
            <th className="border border-gray-600 px-3 py-1 bg-gray-700 text-left" {...props}>{children}</th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-gray-600 px-3 py-1" {...props}>{children}</td>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = codeClassName?.startsWith('language-');
            if (isBlock) {
              return (
                <pre className="bg-gray-900 rounded p-3 overflow-x-auto">
                  <code className={codeClassName} {...props}>{children}</code>
                </pre>
              );
            }
            return <code className="bg-gray-700 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>;
          },
          a: ({ children, ...props }) => (
            <a className="text-indigo-400 hover:text-indigo-300 underline" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
          ),
          input: ({ ...props }) => (
            <input {...props} disabled className="mr-1" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
