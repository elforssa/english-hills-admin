'use client';

import { useEffect, useRef, useState } from 'react';

// Entries mirror the section ids in GuideContent.jsx; scripts/test-helpdesk-content.mjs keeps them in sync.
export const TOC = [
  { group: 'Pour démarrer' },
  { id: 'prise-en-main', label: 'Prise en main' },
  { id: 'journee', label: 'Une journée type' },
  { group: 'Les scénarios' },
  { id: 's1', label: '1 · Un nouveau prospect', sub: true },
  { id: 's2', label: '2 · J’appelle un prospect', sub: true },
  { id: 's3', label: '3 · Le parent a répondu', sub: true },
  { id: 's4', label: '4 · Test de niveau', sub: true },
  { id: 's5', label: '5 · Visite au centre', sub: true },
  { id: 's6', label: '6 · Inscrire un prospect', sub: true },
  { id: 's7', label: '7 · Un visiteur au guichet', sub: true },
  { id: 's8', label: '8 · Acompte ou solde', sub: true },
  { id: 's9', label: '9 · Affecter un groupe', sub: true },
  { id: 's10', label: '10 · Prendre les présences', sub: true },
  { id: 's11', label: '11 · Clôturer ou rouvrir', sub: true },
  { id: 's12', label: '12 · J’ai fait une erreur', sub: true },
  { group: 'Référence' },
  { id: 'ecrans', label: 'Écran par écran' },
  { id: 'comprendre', label: 'Comprendre les statuts' },
  { id: 'coince', label: 'Quand ça coince' },
  { id: 'direction', label: 'Réservé à la direction' },
  { id: 'memo', label: 'Aide-mémoire' },
];

function List({ items, active, onPick }) {
  return (
    <ol>
      {items.map((item, i) => item.group
        ? <li key={`g${i}`} className="grp">{item.group}</li>
        : (
          <li key={item.id} className={item.sub ? 'sub' : undefined}>
            <a href={`#${item.id}`} className={active === item.id ? 'on' : undefined}
              aria-current={active === item.id ? 'location' : undefined} onClick={onPick}>{item.label}</a>
          </li>
        ))}
    </ol>
  );
}

export default function HelpdeskNav() {
  const [active, setActive] = useState(null);
  const mobile = useRef(null);

  useEffect(() => {
    const root = document.querySelector('.hd-scroll');
    const targets = TOC.filter(t => t.id).map(t => document.getElementById(t.id)).filter(Boolean);
    if (!root || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((entries) => {
      const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (hit) setActive(hit.target.id);
    }, { root, rootMargin: '-10% 0px -75% 0px', threshold: 0 });
    targets.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const closeMobile = () => { if (mobile.current) mobile.current.open = false; };

  return (
    <nav className="toc" aria-label="Sommaire du guide">
      <details className="toc-m" ref={mobile}>
        <summary>Sommaire</summary>
        <List items={TOC} active={active} onPick={closeMobile} />
      </details>
      <div className="toc-d">
        <div className="toc-title">Guide Accueil</div>
        <List items={TOC} active={active} />
      </div>
    </nav>
  );
}
