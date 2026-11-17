import { useState } from 'react';
import readmeDoc from '../README.md?raw';
import architectureDoc from '../ARCHITECTURE.md?raw';
import gameDesignDoc from '../GAME_DESIGN.md?raw';
import artDirectionDoc from '../ART_DIRECTION.md?raw';
import designDecisionsDoc from '../DESIGN_DECISIONS?raw';
import referenceProjectDoc from '../REFERENCE_PROJECT.md?raw';
import changelogDoc from '../CHANGELOG.md?raw';

interface DocEntry {
  id: string;
  label: string;
  filename: string;
  content: string;
}

const DOCUMENTS: DocEntry[] = [
  { id: 'readme', label: 'Overview', filename: 'README.md', content: readmeDoc },
  { id: 'game-design', label: 'Game Design', filename: 'GAME_DESIGN.md', content: gameDesignDoc },
  { id: 'architecture', label: 'Architecture', filename: 'ARCHITECTURE.md', content: architectureDoc },
  { id: 'art-direction', label: 'Art Direction', filename: 'ART_DIRECTION.md', content: artDirectionDoc },
  { id: 'design-decisions', label: 'Design Decisions', filename: 'DESIGN_DECISIONS', content: designDecisionsDoc },
  { id: 'reference-project', label: 'Reference Project', filename: 'REFERENCE_PROJECT.md', content: referenceProjectDoc },
  { id: 'changelog', label: 'Changelog', filename: 'CHANGELOG.md', content: changelogDoc },
];

export default function App() {
  const [selectedId, setSelectedId] = useState<string>(DOCUMENTS[0].id);
  const currentDoc = DOCUMENTS.find((doc) => doc.id === selectedId) ?? DOCUMENTS[0];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <h1>Beyond: Overworld</h1>
          <p>One universe. Two experiences. One character.</p>
        </div>

        <div className="status-note">
          <strong>Status:</strong> Architecture and foundation planning. The imported repository contains project specifications without implemented game client/server source files yet.
        </div>

        <nav className="nav-list" aria-label="Project specifications">
          {DOCUMENTS.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={`nav-button${doc.id === currentDoc.id ? ' active' : ''}`}
              onClick={() => setSelectedId(doc.id)}
            >
              {doc.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="doc-header">
          <h2>{currentDoc.label}</h2>
          <span>{currentDoc.filename}</span>
        </header>
        <pre className="doc-body">{currentDoc.content}</pre>
      </main>
    </div>
  );
}
