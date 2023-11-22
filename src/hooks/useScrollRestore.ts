import { useEffect, useState } from 'react';

import { createKeyDebouncer } from '~/utils/debouncer';
import { EventEmitter } from '~/utils/eventEmitter';

type ScrollPosition = { scrollTop: number; scrollLeft: number };
const scrollMap = new Map<string, ScrollPosition>();

const debounce = createKeyDebouncer(300);

export type UseScrollRestoreProps = {
  key?: string;
  defaultPosition?: 'top' | 'bottom';
  enabled?: boolean;
};

export const useScrollRestore = <T extends Element = Element>(args?: UseScrollRestoreProps) => {
  const { key, defaultPosition = 'top', enabled = true } = args ?? {};
  const [node, setRef] = useState<T | null>(null);
  const [emitter] = useState(new EventEmitter<{ scroll: ScrollPosition & { key: string } }>());

  useEffect(() => {
    if (!enabled) return;
    const cb = emitter.on('scroll', ({ key, ...scrollPosition }) =>
      debounce(key, () => scrollMap.set(key, scrollPosition))
    );
    return () => emitter.off('scroll', cb);
  }, [enabled, emitter]);

  useEffect(() => {
    if (!node || !enabled) return;
    const _key = `${key ?? history.state.key}_${location.pathname.substring(1)}`;
    const record = scrollMap.get(_key);
    if (!record) {
      switch (defaultPosition) {
        case 'top': {
          if (node.scrollTop !== 0) node.scrollTop = 0;
          break;
        }
        case 'bottom': {
          const scrollBottom = node.scrollHeight - node.clientHeight;
          if (node.scrollTop < scrollBottom) node.scrollTop = scrollBottom;
          break;
        }
      }
    } else {
      node.scrollTop = record.scrollTop;
      node.scrollLeft = record.scrollLeft;
    }

    const handleScroll = () => {
      emitter.emit('scroll', {
        key: _key,
        scrollTop: node.scrollTop,
        scrollLeft: node.scrollLeft,
      });
    };

    node.addEventListener('scroll', handleScroll);
    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, [key, node, defaultPosition, enabled]); //eslint-disable-line

  return { setRef, node: node };
};