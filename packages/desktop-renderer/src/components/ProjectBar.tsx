import React, { useEffect, useRef } from 'react';
import './ProjectBar.css';

interface ProjectBarProps {
  projects: string[];
  activePath: string | null;
  theme: 'light' | 'dark';
  onSwitch: (filePath: string) => void;
  onRemove: (filePath: string) => void;
  onAdd: () => void;
}

const MOD_KEY = navigator.platform.toUpperCase().includes('MAC') ? 'Cmd' : 'Ctrl';

export const getProjectName = (filePath: string) =>
  (filePath.split(/[\\/]/).pop() || filePath).replace(/\.excalidraw$/i, '');

const ProjectBar: React.FC<ProjectBarProps> = ({
  projects,
  activePath,
  theme,
  onSwitch,
  onRemove,
  onAdd,
}) => {
  const tabsRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible when switching via keyboard
  useEffect(() => {
    tabsRef.current
      ?.querySelector('.project-tab.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activePath, projects]);

  return (
    <div className={`project-bar project-bar--${theme}`}>
      <div
        className="project-tabs"
        ref={tabsRef}
        role="tablist"
        onWheel={(e) => {
          if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
        }}
      >
        {projects.map((filePath, index) => (
          <div
            key={filePath}
            role="tab"
            aria-selected={filePath === activePath}
            className={`project-tab${filePath === activePath ? ' active' : ''}`}
            title={index < 9 ? `${filePath}\n${MOD_KEY}+${index + 1}` : filePath}
            onClick={() => onSwitch(filePath)}
            onAuxClick={(e) => {
              if (e.button === 1) onRemove(filePath);
            }}
          >
            <span className="project-tab-name">{getProjectName(filePath)}</span>
            <button
              className="project-tab-close"
              title="Remove from projects (file is not deleted)"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(filePath);
              }}
            >
              ×
            </button>
          </div>
        ))}
        {activePath === null && (
          <div role="tab" aria-selected className="project-tab active untitled">
            <span className="project-tab-name">Untitled</span>
          </div>
        )}
      </div>
      <button
        className="project-add"
        title="Add .excalidraw files as projects"
        onClick={onAdd}
      >
        {projects.length === 0 ? '+ Add projects' : '+'}
      </button>
    </div>
  );
};

export { ProjectBar };
