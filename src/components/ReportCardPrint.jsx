'use client';

import { Printer, X } from 'lucide-react';

export default function ReportCardPrint({ student, assessment, groupName, onClose }) {
  const handlePrint = () => window.print();

  const getGrade = (note) => {
    if (note === null || note === undefined) return '—';
    if (note >= 16) return 'Très Bien';
    if (note >= 14) return 'Bien';
    if (note >= 12) return 'Assez Bien';
    if (note >= 10) return 'Passable';
    return 'Insuffisant';
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } .print-page { box-shadow: none !important; margin: 0 !important; } }`}</style>
      <div className="w-full max-w-2xl">
        <div className="no-print flex justify-between items-center mb-3">
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md" style={{ backgroundColor: '#1E4D8B' }}>
            <Printer size={14} /> Imprimer
          </button>
          <button onClick={onClose} className="p-2 rounded-md bg-white text-gray-500 hover:text-gray-800"><X size={16} /></button>
        </div>

        <div className="print-page bg-white rounded-xl shadow-2xl p-10">
          <div className="flex items-center justify-between border-b-2 pb-5 mb-6" style={{ borderColor: '#1E4D8B' }}>
            <img src="/eh-logo.png" alt="English Hills" className="h-12" />
            <div className="text-right">
              <p className="font-bold text-sm" style={{ color: '#1E4D8B' }}>English Hills Language Center</p>
              <p className="text-xs text-gray-500">Bouskoura / Sidi Maarouf, Casablanca</p>
              <p className="text-xs text-gray-500">contact@english-hills.com</p>
            </div>
          </div>

          <h1 className="text-center text-xl font-bold mb-1" style={{ color: '#1E4D8B' }}>BULLETIN DE NOTES</h1>
          <p className="text-center text-xs text-gray-400 mb-8 uppercase tracking-widest">Terme {assessment.terme} · Année {assessment.annee || new Date().getFullYear()}</p>

          <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4 mb-6 text-sm">
            <div><span className="text-gray-500 text-xs font-semibold uppercase">Apprenant</span><p className="font-bold mt-0.5">{student?.full_name || assessment.student_name || '—'}</p></div>
            <div><span className="text-gray-500 text-xs font-semibold uppercase">Groupe</span><p className="font-bold mt-0.5">{groupName || '—'}</p></div>
            <div><span className="text-gray-500 text-xs font-semibold uppercase">Niveau actuel</span><p className="font-bold mt-0.5">{assessment.niveau_actuel || '—'}</p></div>
            <div><span className="text-gray-500 text-xs font-semibold uppercase">Niveau cible</span><p className="font-bold mt-0.5">{assessment.niveau_cible || '—'}</p></div>
          </div>

          <table className="w-full text-sm mb-6">
            <thead>
              <tr style={{ backgroundColor: '#1E4D8B' }}>
                <th className="text-left px-4 py-2 text-white font-semibold rounded-tl-md">Compétence</th>
                <th className="text-center px-4 py-2 text-white font-semibold">Coefficient</th>
                <th className="text-center px-4 py-2 text-white font-semibold">Note /20</th>
                <th className="text-center px-4 py-2 text-white font-semibold rounded-tr-md">Mention</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Expression orale', poids: assessment.poids_oral || 40, note: assessment.note_oral },
                { label: 'Expression écrite', poids: assessment.poids_ecrit || 30, note: assessment.note_ecrit },
                { label: 'Devoirs / participation', poids: assessment.poids_devoirs || 30, note: assessment.note_devoirs },
              ].map((row, i) => (
                <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 border-b border-gray-100">{row.label}</td>
                  <td className="px-4 py-3 border-b border-gray-100 text-center text-gray-500">{row.poids}%</td>
                  <td className="px-4 py-3 border-b border-gray-100 text-center font-bold">{row.note ?? '—'}</td>
                  <td className="px-4 py-3 border-b border-gray-100 text-center text-xs text-gray-600">{getGrade(row.note)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#1E4D8B10' }}>
                <td className="px-4 py-3 font-bold" style={{ color: '#1E4D8B' }}>NOTE FINALE</td>
                <td className="px-4 py-3 text-center text-gray-500">100%</td>
                <td className="px-4 py-3 text-center font-bold text-xl" style={{ color: '#1E4D8B' }}>{assessment.note_finale ?? '—'}/20</td>
                <td className="px-4 py-3 text-center font-semibold text-sm" style={{ color: '#1E4D8B' }}>{getGrade(assessment.note_finale)}</td>
              </tr>
            </tbody>
          </table>

          {assessment.commentaire && (
            <div className="border border-gray-200 rounded-lg p-4 mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Commentaire de l&apos;enseignant</p>
              <p className="text-sm text-gray-700 italic">&quot;{assessment.commentaire}&quot;</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-8 mt-8 pt-6 border-t border-gray-200">
            <div className="text-center">
              <div className="h-12 border-b border-gray-300 mb-2" />
              <p className="text-xs text-gray-500">Signature de l&apos;enseignant</p>
            </div>
            <div className="text-center">
              <div className="h-12 border-b border-gray-300 mb-2" />
              <p className="text-xs text-gray-500">Direction English Hills</p>
            </div>
          </div>

          <p className="text-center text-xs text-gray-300 mt-6">Document généré le {new Date().toLocaleDateString('fr-FR')} · English Hills Language Center</p>
        </div>
      </div>
    </div>
  );
}
