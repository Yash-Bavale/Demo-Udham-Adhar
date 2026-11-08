import React from "react";
import { CheckCircle2, Circle, AlertCircle, Info, Copy, Check } from "lucide-react";
import { useState } from "react";

interface TrainingMarkdownViewerProps {
  content: string;
  className?: string;
}

export function TrainingMarkdownViewer({ content, className = "" }: TrainingMarkdownViewerProps) {
  if (!content) return null;

  // Split into lines for structured block parsing
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];

  let i = 0;
  let keyIndex = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      elements.push(
        <hr key={`hr-${keyIndex++}`} className="my-5 border-t border-slate-200" />
      );
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("#### ")) {
      elements.push(
        <h4
          key={`h4-${keyIndex++}`}
          className="text-sm font-bold text-slate-900 mt-4 mb-1.5 flex items-center gap-1.5"
        >
          {renderInline(line.replace(/^####\s+/, ""))}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3
          key={`h3-${keyIndex++}`}
          className="text-base font-bold text-slate-900 mt-5 mb-2 pb-1 border-b border-slate-100 flex items-center gap-2"
        >
          {renderInline(line.replace(/^###\s+/, ""))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={`h2-${keyIndex++}`}
          className="text-lg sm:text-xl font-extrabold text-slate-900 mt-6 mb-2.5 pb-1.5 border-b border-indigo-100/80 flex items-center gap-2 text-indigo-950"
        >
          {renderInline(line.replace(/^##\s+/, ""))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h1
          key={`h1-${keyIndex++}`}
          className="text-xl sm:text-2xl font-black text-slate-900 mt-6 mb-3 text-indigo-950"
        >
          {renderInline(line.replace(/^#\s+/, ""))}
        </h1>
      );
      i++;
      continue;
    }

    // Code Block ```
    if (line.trim().startsWith("```")) {
      const lang = line.trim().replace(/^```/, "");
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      const codeText = codeLines.join("\n");
      elements.push(
        <CodeBlock key={`code-${keyIndex++}`} code={codeText} language={lang} />
      );
      continue;
    }

    // Blockquote / Alert
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      elements.push(
        <div
          key={`quote-${keyIndex++}`}
          className="my-3 p-3.5 rounded-xl bg-indigo-50/70 border-l-4 border-indigo-500 text-xs text-indigo-950 leading-relaxed shadow-2xs space-y-1"
        >
          {quoteLines.map((ql, qIdx) => (
            <p key={qIdx}>{renderInline(ql)}</p>
          ))}
        </div>
      );
      continue;
    }

    // Checkbox items: - [ ] or - [x]
    if (/^-\s*\[([ xX])\]\s+(.*)/.test(line)) {
      const checkItems: { checked: boolean; text: string }[] = [];
      while (i < lines.length && /^-\s*\[([ xX])\]\s+(.*)/.test(lines[i])) {
        const match = lines[i].match(/^-\s*\[([ xX])\]\s+(.*)/);
        if (match) {
          checkItems.push({
            checked: match[1].toLowerCase() === "x",
            text: match[2],
          });
        }
        i++;
      }
      elements.push(
        <div
          key={`checklist-${keyIndex++}`}
          className="my-3 space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80"
        >
          {checkItems.map((ci, cIdx) => (
            <div key={cIdx} className="flex items-start gap-2.5 text-xs text-slate-800">
              {ci.checked ? (
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Circle className="size-4 text-slate-400 shrink-0 mt-0.5" />
              )}
              <span className={ci.checked ? "line-through text-slate-400" : ""}>
                {renderInline(ci.text)}
              </span>
            </div>
          ))}
        </div>
      );
      continue;
    }

    // Bullet List (- or *)
    if (/^[-*]\s+(.*)/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s+(.*)/.test(lines[i])) {
        const match = lines[i].match(/^[-*]\s+(.*)/);
        if (match) listItems.push(match[1]);
        i++;
      }
      elements.push(
        <ul key={`ul-${keyIndex++}`} className="my-2.5 space-y-1.5 pl-4 text-xs text-slate-800 list-disc">
          {listItems.map((item, lIdx) => (
            <li key={lIdx} className="leading-relaxed pl-1">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered List (1. 2. etc.)
    if (/^\d+\.\s+(.*)/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s+(.*)/.test(lines[i])) {
        const match = lines[i].match(/^\d+\.\s+(.*)/);
        if (match) listItems.push(match[1]);
        i++;
      }
      elements.push(
        <ol key={`ol-${keyIndex++}`} className="my-2.5 space-y-1.5 pl-5 text-xs text-slate-800 list-decimal font-medium">
          {listItems.map((item, lIdx) => (
            <li key={lIdx} className="leading-relaxed pl-1 text-slate-700">
              <span className="font-normal text-slate-800">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Standard Paragraph
    elements.push(
      <p key={`p-${keyIndex++}`} className="text-xs sm:text-sm text-slate-700 leading-relaxed my-2">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className={`space-y-1 text-slate-800 ${className}`}>{elements}</div>;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 text-slate-100 text-xs shadow-md">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
        <span className="font-mono uppercase">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto font-mono text-[11px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Inline Markdown Parser: **bold**, *italic*, `code`, [link](url)
function renderInline(text: string): React.ReactNode {
  if (!text) return null;

  // Split by markdown inline tokens
  // Matching: **bold**, *italic*, `code`, [link](url)
  const tokens: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // 1. Bold: **text**
    const boldMatch = remaining.match(/^(\*\*|__)(.*?)\1/);
    if (boldMatch) {
      tokens.push(
        <strong key={`b-${key++}`} className="font-bold text-slate-900">
          {renderInline(boldMatch[2])}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 2. Inline Code: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      tokens.push(
        <code
          key={`c-${key++}`}
          className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-indigo-700 font-mono text-[11px] font-semibold"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 3. Link: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      tokens.push(
        <a
          key={`a-${key++}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-800 underline font-medium"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // 4. Italic: *text* or _text_
    const italicMatch = remaining.match(/^(\*|_)(.*?)\1/);
    if (italicMatch && !italicMatch[2].startsWith(" ") && !italicMatch[2].endsWith(" ")) {
      tokens.push(
        <em key={`i-${key++}`} className="italic text-slate-800">
          {renderInline(italicMatch[2])}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Plain text until next token
    const nextSpecial = remaining.search(/(\*\*|__|`|\[|\*|_)/);
    if (nextSpecial === -1) {
      tokens.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      tokens.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      tokens.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return <>{tokens}</>;
}
