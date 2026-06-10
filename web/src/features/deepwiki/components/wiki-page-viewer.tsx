'use client';

import { GitBranch, Link2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { DeepWikiPageDTO, DeepWikiSourceRefDTO } from '@/features/deepwiki/types';
import { useT } from '@/i18n';

export interface WikiPageViewerProps {
  page?: DeepWikiPageDTO;
  isLoading?: boolean;
  onSelectRef: (ref: DeepWikiSourceRefDTO) => void;
}

/**
 * @component WikiPageViewer
 * @category Feature
 * @status Beta
 * @description Renders a generated DeepWiki Markdown page, Mermaid graph, and source refs.
 * @usage Use as the center reader inside WikiLayout.
 * @example
 * <WikiPageViewer page={page} onSelectRef={setRef} />
 */
export function WikiPageViewer({ page, isLoading = false, onSelectRef }: WikiPageViewerProps) {
  const t = useT('dashboard.deepwiki.reader');

  if (isLoading) {
    return <div className="p-6 text-sm text-text-muted">{t('loading')}</div>;
  }
  if (!page) {
    return <div className="p-6 text-sm text-text-muted">{t('empty')}</div>;
  }

  return (
    <article className="mx-auto max-w-4xl px-5 py-6">
      {page.mermaid ? <MermaidGraph mermaid={page.mermaid} /> : null}
      <MarkdownView markdown={page.markdown} />
      <div className="mt-8 border-t border-border-subtle pt-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Link2 className="size-4 text-primary" />
          {t('sourceRefs')}
        </div>
        <div className="flex flex-wrap gap-2">
          {page.source_refs.map(ref => (
            <Button
              key={`${ref.path}-${ref.start_line}-${ref.end_line}`}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSelectRef(ref)}
            >
              {ref.path}:{ref.start_line}-{ref.end_line}
            </Button>
          ))}
        </div>
      </div>
    </article>
  );
}

function MarkdownView({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;

  function flushList(key: string) {
    if (listItems.length === 0) {
      return;
    }
    nodes.push(
      <ul key={key} className="my-3 list-disc space-y-1 pl-5 text-sm leading-6 text-text-subtle">
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  function flushCode(key: string) {
    if (codeLines.length === 0) {
      return;
    }
    nodes.push(
      <pre key={key} className="my-4 overflow-auto rounded-md border border-border-subtle bg-bg-canvas p-3 text-xs leading-5">
        {codeLines.join('\n')}
      </pre>
    );
    codeLines = [];
  }

  lines.forEach((line, index) => {
    if (line.startsWith('```')) {
      if (inCode) {
        flushCode(`code-${index}`);
      }
      inCode = !inCode;
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }
    if (line.startsWith('- ')) {
      listItems.push(line.slice(2));
      return;
    }
    flushList(`list-${index}`);
    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={index} className="mb-4 text-3xl font-semibold tracking-normal text-text-main">
          {line.slice(2)}
        </h1>
      );
      return;
    }
    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={index} className="mb-2 mt-6 text-lg font-semibold tracking-normal text-text-main">
          {line.slice(3)}
        </h2>
      );
      return;
    }
    if (line.trim() === '') {
      return;
    }
    nodes.push(
      <p key={index} className="my-3 text-sm leading-7 text-text-subtle">
        {line}
      </p>
    );
  });
  flushList('list-end');
  flushCode('code-end');

  return <div className="text-text-main">{nodes}</div>;
}

function MermaidGraph({ mermaid }: { mermaid: string }) {
  const t = useT('dashboard.deepwiki.reader');
  const nodeLabels = new Map<string, string>();
  const edges: Array<[string, string]> = [];

  for (const line of mermaid.split(/\r?\n/)) {
    const nodeMatch = line.trim().match(/^([A-Za-z0-9_]+)\["(.+)"\]$/);
    if (nodeMatch) {
      nodeLabels.set(nodeMatch[1], nodeMatch[2]);
      continue;
    }
    const edgeMatch = line.trim().match(/^([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)$/);
    if (edgeMatch) {
      edges.push([edgeMatch[1], edgeMatch[2]]);
    }
  }

  return (
    <div className="mb-6 rounded-md border border-border-subtle bg-bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <GitBranch className="size-4 text-primary" />
        {t('diagram')}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {edges.map(([from, to], index) => (
          <div key={`${from}-${to}-${index}`} className="flex items-center gap-2 text-xs">
            <span className="rounded-md border border-border-subtle bg-bg-subtle px-2 py-1">
              {nodeLabels.get(from) ?? from}
            </span>
            <span className="text-text-muted">→</span>
            <span className="rounded-md border border-border-subtle bg-bg-subtle px-2 py-1">
              {nodeLabels.get(to) ?? to}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
