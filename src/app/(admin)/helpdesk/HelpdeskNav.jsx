'use client';

import { useEffect, useRef, useState } from 'react';

// Entries mirror the section ids in GuideContent.jsx; scripts/test-helpdesk-content.mjs keeps them in sync.
export const TOC = [
  { group: 'Pour démarrer' },
  { id: 'prise-en-main', label: 'Prise en main' },
  { id: 'journee', label: 'Une journée type' },
  { group: 'Partie 1 · Prospects (CRM)' },
  { id: 'c1', label: 'C1 · Un nouveau prospect', sub: true },
  { id: 'c2', label: 'C2 · J’appelle un prospect', sub: true },
  { id: 'c3', label: 'C3 · Le parent a répondu', sub: true },
  { id: 'c4', label: 'C4 · Test de niveau', sub: true },
  { id: 'c5', label: 'C5 · Visite au centre', sub: true },
  { id: 'c6', label: 'C6 · Inscrire un prospect', sub: true },
  { id: 'c7', label: 'C7 · Clôturer ou rouvrir', sub: true },
  { group: 'Partie 2 · Au quotidien' },
  { id: 'q1', label: 'Q1 · Retrouver un apprenant', sub: true },
  { id: 'q2', label: 'Q2 · Créer ou compléter un dossier', sub: true },
  { id: 'q3', label: 'Q3 · Un visiteur au guichet', sub: true },
  { id: 'q4', label: 'Q4 · Acompte ou solde', sub: true },
  { id: 'q5', label: 'Q5 · Suivre les impayés', sub: true },
  { id: 'q6', label: 'Q6 · Reçus : retrouver, imprimer', sub: true },
  { id: 'q7', label: 'Q7 · Pré-inscriptions', sub: true },
  { id: 'q8', label: 'Q8 · Créer ou modifier un groupe', sub: true },
  { id: 'q9', label: 'Q9 · Affecter un groupe', sub: true },
  { id: 'q10', label: 'Q10 · Changer de groupe, retirer', sub: true },
  { id: 'q11', label: 'Q11 · Prendre les présences', sub: true },
  { id: 'q12', label: 'Q12 · Enseignants', sub: true },
  { id: 'q13', label: 'Q13 · Emploi du temps et notes', sub: true },
  { id: 'q14', label: 'Q14 · Rentrée et fin de mois', sub: true },
  { group: 'Dans les deux parties' },
  { id: 'err', label: 'J’ai fait une erreur', sub: true },
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
