import { toJsxRuntime, type Jsx } from 'hast-util-to-jsx-runtime';
import { common, createLowlight } from 'lowlight';
import type { ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

// Bu modül yalnızca kod görüntülenirken dinamik olarak yüklenir.
const lowlight = createLowlight(common);

export interface Highlighted {
  nodes: ReactNode;
  language: string | null;
}

/**
 * Dili otomatik algılar ve vurgulanmış React öğeleri üretir. HTML dizesi üretmediği
 * (innerHTML kullanılmadığı) için şifresi çözülen içerik sayfaya betik enjekte edemez.
 */
export function highlight(text: string): Highlighted {
  const tree = lowlight.highlightAuto(text);
  return {
    nodes: toJsxRuntime(tree, { Fragment, jsx: jsx as Jsx, jsxs: jsxs as Jsx }),
    language: typeof tree.data?.language === 'string' ? tree.data.language : null,
  };
}
